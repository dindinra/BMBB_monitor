from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date, datetime, timedelta
from io import BytesIO
import pandas as pd

from .. import models, schemas
from ..database import get_db

def excel_serial_to_date(serial):
    """Convert Excel serial date (float) or datetime/date to date object."""
    if pd.isna(serial):
        return None
    if isinstance(serial, pd.Timestamp):
        serial = serial.to_pydatetime()
    if isinstance(serial, datetime):
        return serial.date()
    if isinstance(serial, date):
        return serial
    try:
        return (datetime(1899, 12, 30) + pd.Timedelta(days=float(serial))).date()
    except:
        return None

router = APIRouter(prefix="/sales", tags=["sales"])

# Required columns for deduplication (for import)
REQUIRED_COLUMNS = [
    'kode_item', 'item', 'kategori', 'tanggal', 'qty',
    'unit', 'harga', 'total', 'tipe_item', 'outlet'
]

@router.get("/")
def list_sales(
    outlet: Optional[str] = Query(None, description="Filter by outlet"),
    start_date: Optional[date] = Query(None, description="Start date (inclusive)"),
    end_date: Optional[date] = Query(None, description="End date (inclusive)"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100000),
    db: Session = Depends(get_db)
):
    query = db.query(models.Sales)

    if outlet:
        query = query.filter(models.Sales.outlet == outlet)
    if start_date:
        query = query.filter(models.Sales.tanggal >= start_date)
    if end_date:
        query = query.filter(models.Sales.tanggal <= end_date)

    total = query.count()
    sales = query.offset(skip).limit(limit).all()

    return {
        "items": sales,
        "total": total,
        "skip": skip,
        "limit": limit
    }

@router.get("/aggregate/summary")
def aggregate_summary(
    outlet: Optional[str] = Query(None, description="Filter by outlet"),
    tipe_item: Optional[str] = Query(None, description="Filter by tipe_item"),
    year: Optional[int] = Query(None, description="Filter by year"),
    start_date: Optional[date] = Query(None, description="Start date (inclusive)"),
    end_date: Optional[date] = Query(None, description="End date (inclusive)"),
    db: Session = Depends(get_db)
):
    """Return summary totals (total_amount, total_qty, count) for the filtered dataset."""
    from sqlalchemy import func

    query = db.query(
        func.sum(models.Sales.total).label('total_amount'),
        func.sum(models.Sales.qty).label('total_qty'),
        func.count().label('count')
    )

    if outlet:
        query = query.filter(models.Sales.outlet == outlet)
    if tipe_item:
        query = query.filter(models.Sales.tipe_item == tipe_item)
    if year:
        query = query.filter(models.Sales.tahun == year)
    if start_date:
        query = query.filter(models.Sales.tanggal >= start_date)
    if end_date:
        query = query.filter(models.Sales.tanggal <= end_date)

    result = query.first()
    return {
        "total_amount": result.total_amount or 0,
        "total_qty": result.total_qty or 0,
        "count": result.count or 0
    }

@router.get("/aggregate/top_items_by_qty")
def aggregate_top_items_by_qty(
    outlet: Optional[str] = Query(None, description="Filter by outlet"),
    tipe_item: Optional[str] = Query(None, description="Filter by tipe_item"),
    year: Optional[int] = Query(None, description="Filter by year"),
    start_date: Optional[date] = Query(None, description="Start date (inclusive)"),
    end_date: Optional[date] = Query(None, description="End date (inclusive)"),
    limit: int = Query(5, ge=1, le=50),
    db: Session = Depends(get_db)
):
    """Return top N items by total amount (like purchase)."""
    from sqlalchemy import func

    query = db.query(
        models.Sales.item,
        models.Sales.unit,
        func.sum(models.Sales.qty).label('total_qty'),
        func.sum(models.Sales.total).label('total_amount')
    )

    if outlet:
        query = query.filter(models.Sales.outlet == outlet)
    if tipe_item:
        query = query.filter(models.Sales.tipe_item == tipe_item)
    if year:
        query = query.filter(models.Sales.tahun == year)
    if start_date:
        query = query.filter(models.Sales.tanggal >= start_date)
    if end_date:
        query = query.filter(models.Sales.tanggal <= end_date)

    query = query.group_by(models.Sales.item, models.Sales.unit) \
                 .order_by(func.sum(models.Sales.total).desc()) \
                 .limit(limit)

    results = query.all()
    return [
        {
            "item": r.item,
            "unit": r.unit,
            "total_qty": r.total_qty,
            "total_amount": r.total_amount
        }
        for r in results
    ]

@router.get("/aggregate/monthly")
def aggregate_monthly(
    outlet: Optional[str] = Query(None, description="Filter by outlet"),
    tipe_item: Optional[str] = Query(None, description="Filter by tipe_item"),
    year: Optional[int] = Query(None, description="Filter by year"),
    start_date: Optional[date] = Query(None, description="Start date (inclusive)"),
    end_date: Optional[date] = Query(None, description="End date (inclusive)"),
    db: Session = Depends(get_db)
):
    """Return monthly sales totals grouped by outlet."""
    from sqlalchemy import func
    from app.database import format_date_column

    query = db.query(
        format_date_column(models.Sales.tanggal, '%Y').label('year'),
        format_date_column(models.Sales.tanggal, '%m').label('month_num'),
        format_date_column(models.Sales.tanggal, '%Y-%m').label('month'),
        models.Sales.outlet,
        func.sum(models.Sales.total).label('total_amount'),
        func.sum(models.Sales.qty).label('total_qty'),
        func.count().label('count')
    )

    if outlet:
        query = query.filter(models.Sales.outlet == outlet)
    if tipe_item:
        query = query.filter(models.Sales.tipe_item == tipe_item)
    if year:
        query = query.filter(models.Sales.tahun == year)
    if start_date:
        query = query.filter(models.Sales.tanggal >= start_date)
    if end_date:
        query = query.filter(models.Sales.tanggal <= end_date)

    query = query.group_by('year', 'month_num', 'month', models.Sales.outlet) \
                 .order_by('year', 'month_num', models.Sales.outlet)

    results = query.all()
    return [
        {
            "year": int(r.year) if r.year else None,
            "month": r.month,
            "outlet": r.outlet,
            "total_amount": r.total_amount,
            "total_qty": r.total_qty,
            "count": r.count
        }
        for r in results
    ]


@router.get("/aggregate/by_tipe_item")
def by_tipe_item(
    outlet: Optional[str] = Query(None, description="Filter by outlet"),
    year: Optional[int] = Query(None, description="Filter by year"),
    start_date: Optional[date] = Query(None, description="Start date (inclusive)"),
    end_date: Optional[date] = Query(None, description="End date (inclusive)"),
    db: Session = Depends(get_db)
):
    """Return sales summary grouped by tipe_item (total_amount, total_qty, count)."""
    from sqlalchemy import func
    query = db.query(
        models.Sales.tipe_item,
        func.sum(models.Sales.total).label('total_amount'),
        func.sum(models.Sales.qty).label('total_qty'),
        func.count().label('count')
    )
    if outlet:
        query = query.filter(models.Sales.outlet == outlet)
    if year:
        query = query.filter(models.Sales.tahun == year)
    if start_date:
        query = query.filter(models.Sales.tanggal >= start_date)
    if end_date:
        query = query.filter(models.Sales.tanggal <= end_date)
    query = query.group_by(models.Sales.tipe_item).order_by(models.Sales.tipe_item)
    results = query.all()
    return [
        {
            "tipe_item": r.tipe_item or '',
            "total_amount": float(r.total_amount or 0),
            "total_qty": float(r.total_qty or 0),
            "count": r.count or 0
        }
        for r in results
    ]


@router.get("/distinct")
def distinct_values(
    field: str = Query(..., description="Field name: outlet, tipe_item, tahun, kategori"),
    db: Session = Depends(get_db)
):
    if field == "outlet":
        column = models.Sales.outlet
    elif field == "tipe_item":
        column = models.Sales.tipe_item
    elif field == "tahun":
        column = models.Sales.tahun
    elif field == "kategori":
        column = models.Sales.kategori
    else:
        raise HTTPException(status_code=400, detail=f"Invalid field: {field}")

    results = db.query(column).distinct().order_by(column).all()
    return [r[0] for r in results]

@router.get("/distinct/tipe_items")
def distinct_tipe_items(db: Session = Depends(get_db)):
    results = db.query(models.Sales.tipe_item).distinct().order_by(models.Sales.tipe_item).all()
    return [r[0] for r in results if r[0] is not None]

@router.get("/distinct/years")
def distinct_years(db: Session = Depends(get_db)):
    results = db.query(models.Sales.tahun).distinct().order_by(models.Sales.tahun).all()
    return [r[0] for r in results if r[0] is not None]

@router.post("/clear")
def clear_sales(db: Session = Depends(get_db)):
    """Delete ALL sales data."""
    count_before = db.query(models.Sales).count()
    db.query(models.Sales).delete()
    db.commit()
    return {
        "message": "All sales data has been deleted",
        "records_deleted": count_before
    }

@router.post("/import_clean")
async def import_sales_clean(
    file: UploadFile = File(..., description="Excel file (.xlsx) containing sales data."),
    remove_duplicates: bool = Query(True, description="Remove duplicate rows from the uploaded file based on required fields"),
    db: Session = Depends(get_db)
):
    """Import Excel with automatic deduplication."""
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Only Excel files (.xlsx, .xls) are supported")

    try:
        contents = await file.read()
        df = pd.read_excel(BytesIO(contents), engine='openpyxl')
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read Excel file: {str(e)}")

    # Normalize column names
    df.columns = [col.strip().lower().replace(' ', '_').replace('.', '_') for col in df.columns]

    # Map expected column names for Sales
    column_mapping = {
        'source_name': ['source_name', 'source', 'file'],
        'kode_item': ['kode_item', 'kodeitem', 'item_code'],
        'item': ['item', 'description'],
        'kategori': ['kategori', 'category'],
        'tanggal': ['tanggal', 'date', 'tgl'],
        'qty': ['qty', 'quantity', 'jumlah'],
        'unit': ['unit', 'satuan'],
        'harga': ['harga', 'price'],
        'total': ['total', 'amount'],
        'tipe_item': ['tipe_item', 'tipe', 'item_type'],
        'outlet': ['outlet', 'store', 'cabang'],
        'bulan': ['bulan', 'month'],
        'hari': ['hari', 'day'],
        'minggu': ['minggu', 'week'],
        'tahun': ['tahun', 'year'],
    }

    # Find actual columns
    actual_cols = {}
    for expected, alternatives in column_mapping.items():
        for alt in alternatives:
            if alt in df.columns:
                actual_cols[expected] = alt
                break
        else:
            raise HTTPException(status_code=400, detail=f"Missing required column: {expected}")

    # Prepare records
    records = []
    for _, row in df.iterrows():
        tanggal_serial = row[actual_cols['tanggal']]
        tanggal_date = excel_serial_to_date(tanggal_serial)
        if tanggal_date is None:
            continue

        record = {
            'source_name': str(row[actual_cols['source_name']]),
            'kode_item': str(row[actual_cols['kode_item']]),
            'item': str(row[actual_cols['item']]),
            'kategori': str(row[actual_cols['kategori']]),
            'tanggal': tanggal_date,
            'qty': int(row[actual_cols['qty']]) if pd.notnull(row[actual_cols['qty']]) else 0,
            'unit': str(row[actual_cols['unit']]),
            'harga': int(row[actual_cols['harga']]) if pd.notnull(row[actual_cols['harga']]) else 0,
            'total': int(row[actual_cols['total']]) if pd.notnull(row[actual_cols['total']]) else 0,
            'tipe_item': str(row[actual_cols['tipe_item']]),
            'outlet': str(row[actual_cols['outlet']]),
            'bulan': str(row[actual_cols['bulan']]),
            'hari': int(row[actual_cols['hari']]) if pd.notnull(row[actual_cols['hari']]) else 0,
            'minggu': str(row[actual_cols['minggu']]),
            'tahun': int(row[actual_cols['tahun']]) if pd.notnull(row[actual_cols['tahun']]) else 0
        }
        records.append(record)

    if not records:
        raise HTTPException(status_code=400, detail="No valid records found in file")

    # Determine whether to remove duplicates from the uploaded file
    if remove_duplicates:
        df_all = pd.DataFrame(records)
        df_clean = df_all.drop_duplicates(subset=REQUIRED_COLUMNS, keep='first')
        cleaned_records = df_clean.to_dict('records')
        duplicates_removed_in_file = len(records) - len(cleaned_records)
    else:
        cleaned_records = records
        duplicates_removed_in_file = 0

    # Delete existing records that match any of the cleaned records' required columns combination
    cleaned_keys_set = set()
    for r in cleaned_records:
        key_tuple = tuple(r[col] for col in REQUIRED_COLUMNS)
        cleaned_keys_set.add(key_tuple)

    duplicates_removed_in_db = 0
    if cleaned_keys_set:
        outlets = list(set(r['outlet'] for r in cleaned_records))
        existing = db.query(models.Sales).filter(models.Sales.outlet.in_(outlets)).all()
        to_delete_ids = []
        for existing_rec in existing:
            existing_key = tuple(getattr(existing_rec, col) for col in REQUIRED_COLUMNS)
            if existing_key in cleaned_keys_set:
                to_delete_ids.append(existing_rec.id)
        if to_delete_ids:
            db.query(models.Sales).filter(models.Sales.id.in_(to_delete_ids)).delete(synchronize_session=False)
        duplicates_removed_in_db = len(to_delete_ids)

    # Insert cleaned records
    chunk_size = 1000
    total_inserted = 0
    for i in range(0, len(cleaned_records), chunk_size):
        chunk = cleaned_records[i:i+chunk_size]
        db.bulk_insert_mappings(models.Sales, chunk)
        db.commit()
        total_inserted += len(chunk)

    # Calculate summary
    total_file_rows = len(df)
    existing_matches_deleted = duplicates_removed_in_db
    final_inserted = total_inserted

    return {
        "message": "Import completed with deduplication",
        "summary": {
            "total_rows_in_file": total_file_rows,
            "duplicate_rows_removed_from_file": duplicates_removed_in_file,
            "existing_records_replaced": existing_matches_deleted,
            "new_records_inserted": final_inserted
        },
         "total_rows_after_import": db.query(models.Sales).count()
     }


@router.post("/clear_by_month")
def clear_sales_by_month(
    year: int = Query(..., ge=2000, le=2100, description="Year (e.g., 2025)"),
    month: int = Query(..., ge=1, le=12, description="Month (1-12)"),
    db: Session = Depends(get_db)
):
    """Delete all sales for a specific year-month."""
    try:
        start_date = date(year, month, 1)
        if month == 12:
            end_date = date(year + 1, 1, 1) - timedelta(days=1)
        else:
            end_date = date(year, month + 1, 1) - timedelta(days=1)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid date: {e}")

    count = db.query(models.Sales).filter(
        models.Sales.tanggal >= start_date,
        models.Sales.tanggal <= end_date
    ).delete(synchronize_session=False)
    db.commit()
    return {
        "message": f"Deleted {count} sales for {year}-{month:02d}",
        "year": year,
        "month": month,
        "deleted_count": count
    }

