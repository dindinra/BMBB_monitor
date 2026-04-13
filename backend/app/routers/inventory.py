from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy import func, asc, desc
from typing import Optional, List
import pandas as pd
from io import BytesIO
from datetime import datetime
import re

from .. import models, schemas
from ..database import get_db
from ..models import Item, Inventory

router = APIRouter(prefix="/inventory", tags=["inventory"])

@router.get("/")
def get_inventory(
    outlet: Optional[str] = Query(None),
    gudang: Optional[str] = Query(None),
    kategori: Optional[str] = Query(None),
    low_stock_only: bool = Query(False),
    threshold: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db)
    ):
    # Base query: join Inventory with Item
    query = db.query(
        Inventory.id.label('inventory_id'),
        Inventory.outlet,
        Inventory.gudang,
        Inventory.ending_qty,
        Inventory.buffer,
        Item.id.label('item_id'),
        Item.code.label('item_code'),
        Item.name.label('item_name'),
        Item.unit,
        Item.kategori
    ).join(Item, Inventory.item_id == Item.id)

    # Apply filters
    if outlet:
        query = query.filter(Inventory.outlet == outlet)
    if gudang:
        query = query.filter(Inventory.gudang == gudang)
    if kategori:
        query = query.filter(Item.kategori == kategori)
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (Item.code.ilike(search_term)) | (Item.name.ilike(search_term))
        )

    rows = query.all()

    # Determine item_code-outlet pairs for last cost lookup
    pairs = [(row.item_code, row.outlet) for row in rows]
    last_cost_map = {}
    if pairs:
        codes = list(set([p[0] for p in pairs]))
        outlets_pair = list(set([p[1] for p in pairs]))
        # Get latest purchase price per (kode_item, outlet)
        # Subquery: latest purchase date per (kode_item, outlet)
        subq = db.query(
            models.Purchase.kode_item,
            models.Purchase.outlet,
            func.max(models.Purchase.tanggal).label('max_date')
        ).filter(
            models.Purchase.kode_item.in_(codes),
            models.Purchase.outlet.in_(outlets_pair)
        ).group_by(models.Purchase.kode_item, models.Purchase.outlet).subquery()

        latest_purchases = db.query(
            models.Purchase.kode_item,
            models.Purchase.outlet,
            models.Purchase.harga
        ).join(subq, (models.Purchase.kode_item == subq.c.kode_item) &
                     (models.Purchase.outlet == subq.c.outlet) &
                     (models.Purchase.tanggal == subq.c.max_date)
                ).all()

        for p in latest_purchases:
            last_cost_map[(p.kode_item, p.outlet)] = p.harga

    # Build response
    result = []
    for row in rows:
        last_cost = last_cost_map.get((row.item_code, row.outlet), 0)
        total = row.ending_qty * last_cost
        effective_threshold = threshold if threshold is not None else row.buffer
        status = 'low' if row.ending_qty < effective_threshold else 'ok'
        selisih = row.ending_qty - row.buffer
        result.append({
            'inventory_id': row.inventory_id,
            'item_id': row.item_id,
            'item_code': row.item_code,
            'item_name': row.item_name,
            'unit': row.unit,
            'kategori': row.kategori,
            'outlet': row.outlet,
            'gudang': row.gudang,
            'ending_qty': row.ending_qty,
            'buffer': row.buffer,
            'last_cost': last_cost,
            'total': total,
            'status': status,
            'selisih': selisih
        })

    # Filter low_stock if needed
    if low_stock_only:
        result = [r for r in result if r['ending_qty'] < (threshold if threshold is not None else r['buffer'])]

    # Sorting: low stock first, then by item_code
    result.sort(key=lambda x: (0 if x['status'] == 'low' else 1, x['item_code']))

    # Get distinct options from FILTERED results (not all database)
    filtered_outlets = sorted(set(item['outlet'] for item in result))
    filtered_gudangs = sorted(set(item['gudang'] for item in result))
    filtered_kategoris = sorted(set(item['kategori'] for item in result))

    return {
        'count': len(result),
        'items': result,
        'filters': {
            'outlets': filtered_outlets,
            'gudangs': filtered_gudangs,
            'kategoris': filtered_kategoris
        }
    }

@router.patch("/{inventory_id}/buffer")
def update_inventory_buffer(inventory_id: int, payload: dict, db: Session = Depends(get_db)):
    # Expect payload: {"buffer": 150}
    new_buffer = payload.get('buffer')
    if new_buffer is None or not isinstance(new_buffer, int) or new_buffer < 0:
        raise HTTPException(status_code=400, detail="Invalid buffer value")
    inv = db.query(Inventory).filter(Inventory.id == inventory_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Inventory not found")
    inv.buffer = new_buffer
    db.commit()
    return {'message': 'Buffer updated', 'inventory_id': inventory_id, 'buffer': new_buffer}

@router.get("/generate_po")
def generate_po(
    outlet: Optional[str] = Query(None),
    gudang: Optional[str] = Query(None),
    kategori: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    # Get low stock items: ending_qty < buffer
    # Reuse get_inventory logic but filter low_stock with actual buffer (no override)
    data = get_inventory(
        outlet=outlet,
        gudang=gudang,
        kategori=kategori,
        low_stock_only=True,
        threshold=None,
        search=None,
        db=db
    )
    # For each low stock item, recommended order qty = buffer - ending_qty
    items = []
    for inv in data['items']:
        recommended_qty = max(0, inv['buffer'] - inv['ending_qty'])
        if recommended_qty > 0:
            items.append({
                'item_id': inv['item_id'],
                'item_code': inv['item_code'],
                'item_name': inv['item_name'],
                'unit': inv['unit'],
                'outlet': inv['outlet'],
                'gudang': inv['gudang'],
                'ending_qty': inv['ending_qty'],
                'buffer': inv['buffer'],
                'last_cost': inv['last_cost'],
                'recommended_qty': recommended_qty,
                'total_cost': recommended_qty * inv['last_cost']
            })
    return {
        'count': len(items),
        'items': items
    }

@router.get("/generate_po/export")
def export_generate_po(
    outlet: Optional[str] = Query(None),
    gudang: Optional[str] = Query(None),
    kategori: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    # Reuse get_inventory logic with low_stock only
    data_resp = get_inventory(
        outlet=outlet,
        gudang=gudang,
        kategori=kategori,
        low_stock_only=True,
        threshold=None,
        search=None,
        db=db
    )
    items = []
    for inv in data_resp['items']:
        rec_qty = max(0, inv['buffer'] - inv['ending_qty'])
        if rec_qty > 0:
            items.append({
                'item_code': inv['item_code'],
                'item_name': inv['item_name'],
                'unit': inv['unit'],
                'outlet': inv['outlet'],
                'gudang': inv['gudang'],
                'ending_qty': inv['ending_qty'],
                'buffer': inv['buffer'],
                'last_cost': inv['last_cost'],
                'recommended_qty': rec_qty,
                'total_cost': rec_qty * inv['last_cost']
            })
    df = pd.DataFrame(items)
    cols = ['item_code', 'item_name', 'unit', 'outlet', 'gudang', 'ending_qty', 'buffer', 'last_cost', 'recommended_qty', 'total_cost']
    for col in cols:
        if col not in df.columns:
            df[col] = None
    df = df[cols]
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Purchase Recommendation')
    output.seek(0)
    headers = {
        'Content-Disposition': 'attachment; filename="purchase_recommendation.xlsx"',
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }
    return Response(content=output.read(), headers=headers)

# Inventory Import (like purchase import)
REQUIRED_INV_COLUMNS = ['kode_item', 'item', 'unit', 'kategori', 'outlet', 'gudang', 'ending_qty']

@router.post("/import")
async def import_inventory(
    file: UploadFile = File(..., description="Excel file with inventory data"),
    remove_duplicates: bool = Query(True, description="Remove duplicates from file and replace existing inventory records matching the keys"),
    db: Session = Depends(get_db)
):
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Only Excel files (.xlsx, .xls) are supported")

    try:
        contents = await file.read()
        df = pd.read_excel(BytesIO(contents), engine='openpyxl')
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read Excel file: {str(e)}")

    # Normalize column names: collapse any whitespace to single underscore, lowercase
    df.columns = [re.sub(r'\s+', '_', col.strip().lower()).replace('.', '_') for col in df.columns]

    # Column mapping
    column_mapping = {
        'kode_item': ['kode_item', 'item_code', 'kodeitem', 'code'],
        'item': ['item', 'item_name', 'itemname', 'name', 'description', 'product', 'product_name'],
        'unit': ['unit', 'satuan'],
        'kategori': ['kategori', 'category', 'kategory'],
        'outlet': ['outlet', 'store', 'cabang'],
        'gudang': ['gudang', 'warehouse', 'lokasi'],
        'ending_qty': ['ending_qty', 'qty', 'quantity', 'jumlah'],
        'buffer': ['buffer', 'buffer_stock', 'min_stock']  # optional
    }

    actual_cols = {}
    for expected, alternatives in column_mapping.items():
        found = False
        for alt in alternatives:
            if alt in df.columns:
                actual_cols[expected] = alt
                found = True
                break
        if expected in REQUIRED_INV_COLUMNS and not found:
            raise HTTPException(status_code=400, detail=f"Missing required column: {expected}")

    records = []
    for _, row in df.iterrows():
        rec = {
            'kode_item': str(row[actual_cols['kode_item']]),
            'item': str(row[actual_cols['item']]),
            'unit': str(row[actual_cols['unit']]),
            'kategori': str(row[actual_cols['kategori']]),
            'outlet': str(row[actual_cols['outlet']]),
            'gudang': str(row[actual_cols['gudang']]),
            'ending_qty': int(row[actual_cols['ending_qty']]) if pd.notnull(row[actual_cols['ending_qty']]) else 0,
            'buffer': int(row[actual_cols['buffer']]) if 'buffer' in actual_cols and pd.notnull(row[actual_cols['buffer']]) else None
        }
        records.append(rec)

    if not records:
        raise HTTPException(status_code=400, detail="No valid records found in file")

    # Deduplication within file: keep last row per (kode_item, outlet, gudang)
    if remove_duplicates:
        df_clean = pd.DataFrame(records).drop_duplicates(subset=['kode_item', 'outlet', 'gudang'], keep='last')
        cleaned_records = df_clean.to_dict('records')
        duplicates_removed_in_file = len(records) - len(cleaned_records)
    else:
        cleaned_records = records
        duplicates_removed_in_file = 0

    # Process each record: upsert item and inventory
    inserted_inventory = 0
    updated_inventory = 0
    inserted_items = 0
    updated_items = 0

    for rec in cleaned_records:
        # Find or create Item
        item = db.query(models.Item).filter(models.Item.code == rec['kode_item']).first()
        if item:
            # Update item details if changed
            updated = False
            if item.name != rec['item']:
                item.name = rec['item']
                updated = True
            if item.unit != rec['unit']:
                item.unit = rec['unit']
                updated = True
            if item.kategori != rec['kategori']:
                item.kategori = rec['kategori']
                updated = True
            if rec['buffer'] is not None and item.buffer != rec['buffer']:
                item.buffer = rec['buffer']
                updated = True
            if updated:
                updated_items += 1
        else:
            item = models.Item(
                code=rec['kode_item'],
                name=rec['item'],
                unit=rec['unit'],
                kategori=rec['kategori'],
                buffer=rec['buffer'] if rec['buffer'] is not None else 0
            )
            db.add(item)
            db.flush()  # get id
            inserted_items += 1

        # Upsert Inventory: unique on (item_id, outlet, gudang)
        inv = db.query(models.Inventory).filter(
            models.Inventory.item_id == item.id,
            models.Inventory.outlet == rec['outlet'],
            models.Inventory.gudang == rec['gudang']
        ).first()
        if inv:
            inv.ending_qty = rec['ending_qty']
            if rec['buffer'] is not None:
                inv.buffer = rec['buffer']
            updated_inventory += 1
        else:
            inv = models.Inventory(
                item_id=item.id,
                outlet=rec['outlet'],
                gudang=rec['gudang'],
                ending_qty=rec['ending_qty'],
                buffer=rec['buffer'] if rec['buffer'] is not None else 0
            )
            db.add(inv)
            inserted_inventory += 1

    db.commit()

    # Optionally, delete existing inventory records that were not in the file? Not needed; we are upserting.

    return {
        "message": "Inventory import completed",
        "summary": {
            "total_rows_in_file": len(df),
            "duplicates_removed_from_file": duplicates_removed_in_file,
            "items_inserted": inserted_items,
            "items_updated": updated_items,
            "inventory_inserted": inserted_inventory,
            "inventory_updated": updated_inventory
        }
    }

@router.get("/export")
def export_inventory(
    outlet: Optional[str] = Query(None),
    gudang: Optional[str] = Query(None),
    kategori: Optional[str] = Query(None),
    low_stock_only: bool = Query(False),
    threshold: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    # Reuse get_inventory logic
    data_resp = get_inventory(
        outlet=outlet,
        gudang=gudang,
        kategori=kategori,
        low_stock_only=low_stock_only,
        threshold=threshold,
        search=None,
        db=db
    )
    items = data_resp['items']
    df = pd.DataFrame(items)
    cols = ['item_name', 'unit', 'gudang', 'ending_qty', 'buffer', 'total', 'status', 'selisih']
    for col in cols:
        if col not in df.columns:
            df[col] = None
    df = df[cols]
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Inventory')
    output.seek(0)
    headers = {
        'Content-Disposition': 'attachment; filename="inventory.xlsx"',
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }
    return Response(content=output.read(), headers=headers)


@router.post("/clear")
def clear_inventory(db: Session = Depends(get_db)):
    """Delete ALL inventory records."""
    count_before = db.query(Inventory).count()
    db.query(Inventory).delete()
    db.commit()
    return {"message": "All inventory records deleted", "records_deleted": count_before}
