from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text, or_, func
import pandas as pd
from io import BytesIO
from datetime import datetime, date
from typing import Optional

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/import_export", tags=["import_export"])

# Required columns for deduplication
REQUIRED_COLUMNS = [
    'kode_item', 'item', 'kode_vendor', 'vendor', 'tanggal',
    'qty', 'unit', 'harga', 'total', 'kategori', 'tipe_item', 'outlet'
]

# Excel serial date conversion (always returns date object for consistent deduplication)
def excel_serial_to_date(serial):
    """Convert Excel date to Python date object.
    Handles numeric Excel serials, pandas Timestamp, datetime, and date objects.
    Returns a datetime.date (without time)."""
    if pd.isna(serial):
        return None
    # pandas Timestamp -> convert to python datetime then to date
    if isinstance(serial, pd.Timestamp):
        serial = serial.to_pydatetime()
    # datetime -> extract date
    if isinstance(serial, datetime):
        return serial.date()
    # If already date, return as is
    if isinstance(serial, date):
        return serial
    # Numeric Excel serial
    try:
        return (datetime(1899, 12, 30) + pd.Timedelta(days=float(serial))).date()
    except:
        return None

@router.post("/import")
async def import_excel(
    file: UploadFile = File(..., description="Excel file (.xlsx) containing purchase data"),
    db: Session = Depends(get_db)
):
    """
    Import purchase data from Excel file.
    Expected columns: source_name, kode_item, item, kode_vendor, vendor,
    tanggal (Excel serial), qty, unit, harga, total, kategori, tipe_item,
    outlet, bulan, hari, minggu, tahun
    """
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Only Excel files (.xlsx, .xls) are supported")

    try:
        # Read Excel into DataFrame
        contents = await file.read()
        df = pd.read_excel(BytesIO(contents), engine='openpyxl')
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read Excel file: {str(e)}")

    # Normalize column names (lowercase, strip spaces, replace dots)
    df.columns = [col.strip().lower().replace(' ', '_').replace('.', '_') for col in df.columns]

    # Map expected column names
    column_mapping = {
        'source_name': ['source_name', 'source_name'],
        'kode_item': ['kode_item', 'kodeitem', 'item_code'],
        'item': ['item', 'description'],
        'kode_vendor': ['kode_vendor', 'kod_vendor', 'vendor_code'],
        'vendor': ['vendor', 'supplier'],
        'tanggal': ['tanggal', 'date', 'tgl'],
        'qty': ['qty', 'quantity', 'jumlah'],
        'unit': ['unit', 'satuan'],
        'harga': ['harga', 'price'],
        'total': ['total', 'amount'],
        'kategori': ['kategori', 'category'],
        'tipe_item': ['tipe_item', 'tipe', 'item_type'],
        'outlet': ['outlet', 'store', 'cabang'],
        'bulan': ['bulan', 'month'],
        'hari': ['hari', 'day'],
        'minggu': ['minggu', 'week'],
        'tahun': ['tahun', 'year']
    }

    # Find actual column names
    actual_cols = {}
    for expected, alternatives in column_mapping.items():
        for alt in alternatives:
            if alt in df.columns:
                actual_cols[expected] = alt
                break
        else:
            raise HTTPException(status_code=400, detail=f"Missing required column: {expected}")

    # Prepare data for insertion
    records = []
    for _, row in df.iterrows():
        # Convert tanggal from Excel serial to date
        tanggal_serial = row[actual_cols['tanggal']]
        tanggal_date = excel_serial_to_date(tanggal_serial)
        if tanggal_date is None:
            # Skip or set to None? We'll skip
            continue

        record = {
            'source_name': str(row[actual_cols['source_name']]),
            'kode_item': str(row[actual_cols['kode_item']]),
            'item': str(row[actual_cols['item']]),
            'kode_vendor': str(row[actual_cols['kode_vendor']]),
            'vendor': str(row[actual_cols['vendor']]),
            'tanggal': tanggal_date,
            'qty': int(row[actual_cols['qty']]) if pd.notnull(row[actual_cols['qty']]) else 0,
            'unit': str(row[actual_cols['unit']]),
            'harga': int(row[actual_cols['harga']]) if pd.notnull(row[actual_cols['harga']]) else 0,
            'total': int(row[actual_cols['total']]) if pd.notnull(row[actual_cols['total']]) else 0,
            'kategori': str(row[actual_cols['kategori']]),
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

    # Insert into DB in chunks to avoid memory issues
    chunk_size = 1000
    total_inserted = 0
    for i in range(0, len(records), chunk_size):
        chunk = records[i:i+chunk_size]
        db.bulk_insert_mappings(models.Purchase, chunk)
        db.commit()
        total_inserted += len(chunk)

    return {
        "message": "Import successful",
        "total_rows": len(df),
        "inserted": total_inserted,
        "skipped": len(df) - total_inserted
    }

@router.get("/export/csv")
def export_csv(
    outlet: Optional[str] = Query(None, description="Filter by outlet"),
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    db: Session = Depends(get_db)
):
    """Export purchase data to CSV."""
    query = db.query(models.Purchase)

    if outlet:
        query = query.filter(models.Purchase.outlet == outlet)
    if start_date:
        try:
            start_dt = datetime.strptime(start_date, '%Y-%m-%d').date()
            query = query.filter(models.Purchase.tanggal >= start_dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid start_date format. Use YYYY-MM-DD")
    if end_date:
        try:
            end_dt = datetime.strptime(end_date, '%Y-%m-%d').date()
            query = query.filter(models.Purchase.tanggal <= end_dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid end_date format. Use YYYY-MM-DD")

    purchases = query.all()

    # Convert to DataFrame
    data = []
    for p in purchases:
        data.append({
            'id': p.id,
            'source_name': p.source_name,
            'kode_item': p.kode_item,
            'item': p.item,
            'kode_vendor': p.kode_vendor,
            'vendor': p.vendor,
            'tanggal': p.tanggal,
            'qty': p.qty,
            'unit': p.unit,
            'harga': p.harga,
            'total': p.total,
            'kategori': p.kategori,
            'tipe_item': p.tipe_item,
            'outlet': p.outlet,
            'bulan': p.bulan,
            'hari': p.hari,
            'minggu': p.minggu,
            'tahun': p.tahun
        })

    df = pd.DataFrame(data)
    output = BytesIO()
    df.to_csv(output, index=False, encoding='utf-8')
    output.seek(0)

    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=purchases_export.csv"}
    )

@router.get("/export/excel")
def export_excel(
    outlet: Optional[str] = Query(None, description="Filter by outlet"),
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    tipe_item: Optional[str] = Query(None, description="Filter by tipe_item"),
    year: Optional[int] = Query(None, description="Filter by year"),
    search: Optional[str] = Query(None, description="Search by item name or code (partial)"),
    db: Session = Depends(get_db)
):
    """Export purchase data to Excel (.xlsx)."""
    query = db.query(models.Purchase)

    if outlet:
        query = query.filter(models.Purchase.outlet == outlet)
    if start_date:
        try:
            start_dt = datetime.strptime(start_date, '%Y-%m-%d').date()
            query = query.filter(models.Purchase.tanggal >= start_dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid start_date format. Use YYYY-MM-DD")
    if end_date:
        try:
            end_dt = datetime.strptime(end_date, '%Y-%m-%d').date()
            query = query.filter(models.Purchase.tanggal <= end_dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid end_date format. Use YYYY-MM-DD")
    if tipe_item:
        query = query.filter(models.Purchase.tipe_item == tipe_item)
    if year:
        query = query.filter(func.strftime('%Y', models.Purchase.tanggal) == str(year))
    if search:
        query = query.filter(
            or_(
                models.Purchase.kode_item.ilike(f"%{search}%"),
                models.Purchase.item.ilike(f"%{search}%")
            )
        )

    purchases = query.all()

    # Convert to DataFrame
    data = []
    for p in purchases:
        data.append({
            'id': p.id,
            'source_name': p.source_name,
            'kode_item': p.kode_item,
            'item': p.item,
            'kode_vendor': p.kode_vendor,
            'vendor': p.vendor,
            'tanggal': p.tanggal,
            'qty': p.qty,
            'unit': p.unit,
            'harga': p.harga,
            'total': p.total,
            'kategori': p.kategori,
            'tipe_item': p.tipe_item,
            'outlet': p.outlet,
            'bulan': p.bulan,
            'hari': p.hari,
            'minggu': p.minggu,
            'tahun': p.tahun
        })

    df = pd.DataFrame(data)
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Purchases')
    output.seek(0)

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=purchases_export.xlsx"}
    )

@router.post("/import_clean")
async def import_excel_clean(
    file: UploadFile = File(..., description="Excel file (.xlsx) containing purchase data."),
    remove_duplicates: bool = Query(True, description="Remove duplicate rows from the uploaded file based on required fields"),
    db: Session = Depends(get_db)
):
    """
    Import Excel with automatic deduplication.
    - Removes duplicate rows within the file (based on all required columns)
    - Deletes existing records that match any of the incoming rows (same values for all required columns)
    - Then inserts all cleaned records.
    Required columns: kode_item, item, kode_vendor, vendor, tanggal, qty, unit, harga, total, kategori, tipe_item, outlet
    """
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Only Excel files (.xlsx, .xls) are supported")

    try:
        contents = await file.read()
        df = pd.read_excel(BytesIO(contents), engine='openpyxl')
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read Excel file: {str(e)}")

    # Normalize column names
    df.columns = [col.strip().lower().replace(' ', '_').replace('.', '_') for col in df.columns]

    # Map expected column names
    column_mapping = {
        'source_name': ['source_name', 'source_name'],
        'kode_item': ['kode_item', 'kodeitem', 'item_code'],
        'item': ['item', 'description'],
        'kode_vendor': ['kode_vendor', 'kod_vendor', 'vendor_code'],
        'vendor': ['vendor', 'supplier'],
        'tanggal': ['tanggal', 'date', 'tgl'],
        'qty': ['qty', 'quantity', 'jumlah'],
        'unit': ['unit', 'satuan'],
        'harga': ['harga', 'price'],
        'total': ['total', 'amount'],
        'kategori': ['kategori', 'category'],
        'tipe_item': ['tipe_item', 'tipe', 'item_type'],
        'outlet': ['outlet', 'store', 'cabang'],
        'bulan': ['bulan', 'month'],
        'hari': ['hari', 'day'],
        'minggu': ['minggu', 'week'],
        'tahun': ['tahun', 'year']
    }

    # Find actual column names
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
            'kode_vendor': str(row[actual_cols['kode_vendor']]),
            'vendor': str(row[actual_cols['vendor']]),
            'tanggal': tanggal_date,
            'qty': int(row[actual_cols['qty']]) if pd.notnull(row[actual_cols['qty']]) else 0,
            'unit': str(row[actual_cols['unit']]),
            'harga': int(row[actual_cols['harga']]) if pd.notnull(row[actual_cols['harga']]) else 0,
            'total': int(row[actual_cols['total']]) if pd.notnull(row[actual_cols['total']]) else 0,
            'kategori': str(row[actual_cols['kategori']]),
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
        # Deduplicate: remove rows that have identical values for all required columns
        df_all = pd.DataFrame(records)
        df_clean = df_all.drop_duplicates(subset=REQUIRED_COLUMNS, keep='first')
        cleaned_records = df_clean.to_dict('records')
        duplicates_removed_in_file = len(records) - len(cleaned_records)
    else:
        # Keep all rows as-is (no deduplication)
        cleaned_records = records
        duplicates_removed_in_file = 0

    # Delete existing records that match any of the cleaned records' required columns combination
    # Build a set of key tuples from cleaned_records for fast lookup
    cleaned_keys_set = set()
    for r in cleaned_records:
        key_tuple = tuple(r[col] for col in REQUIRED_COLUMNS)
        cleaned_keys_set.add(key_tuple)

    duplicates_removed_in_db = 0
    if cleaned_keys_set:
        # Fetch existing records that could match (by outlet to limit query)
        outlets = list(set(r['outlet'] for r in cleaned_records))
        existing = db.query(models.Purchase).filter(models.Purchase.outlet.in_(outlets)).all()
        to_delete_ids = []
        for existing_rec in existing:
            existing_key = tuple(getattr(existing_rec, col) for col in REQUIRED_COLUMNS)
            if existing_key in cleaned_keys_set:
                to_delete_ids.append(existing_rec.id)
        if to_delete_ids:
            db.query(models.Purchase).filter(models.Purchase.id.in_(to_delete_ids)).delete(synchronize_session=False)
        duplicates_removed_in_db = len(to_delete_ids)

    # Insert cleaned records
    chunk_size = 1000
    total_inserted = 0
    for i in range(0, len(cleaned_records), chunk_size):
        chunk = cleaned_records[i:i+chunk_size]
        db.bulk_insert_mappings(models.Purchase, chunk)
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
        "total_rows_after_import": db.query(models.Purchase).count()
    }

@router.post("/clear")
def clear_database(db: Session = Depends(get_db)):
    """
    Delete ALL purchase data from the database.
    WARNING: This action cannot be undone.
    """
    # Get count before deletion for reporting
    count_before = db.query(models.Purchase).count()
    db.query(models.Purchase).delete()
    db.commit()
    return {
        "message": "All purchase data has been deleted",
        "records_deleted": count_before
    }

