#!/usr/bin/env python3
"""
Initialize SQLite database and import initial Excel data.
Run from project root: python scripts/init_db.py
"""

import sys
from pathlib import Path
import pandas as pd
from datetime import datetime

# Add backend to path
backend_path = Path(__file__).parent.parent / "backend"
sys.path.append(str(backend_path))

from app.database import engine, Base, SessionLocal
from app.models import Purchase

def excel_serial_to_date(serial):
    """Convert Excel date to Python date.
    Handles both Excel serial numbers (numeric) and datetime objects."""
    if pd.isna(serial):
        return None
    # If already datetime/Timestamp, extract date
    if isinstance(serial, (pd.Timestamp, datetime)):
        return serial.date()
    # Try to convert numeric Excel serial
    try:
        return (datetime(1899, 12, 30) + pd.Timedelta(days=float(serial))).date()
    except:
        return None

def init_database():
    print("🗄️  Creating database tables...")
    Base.metadata.create_all(bind=engine)
    print("✅ Tables created!")

def import_excel(file_path: Path, db: SessionLocal):
    print(f"📥 Importing Excel: {file_path}")
    try:
        df = pd.read_excel(file_path, engine='openpyxl')
    except Exception as e:
        print(f"❌ Failed to read Excel: {e}")
        return False

    print(f"   Columns: {list(df.columns)}")
    print(f"   Rows: {len(df)}")

    # Normalize column names (lowercase, strip, replace spaces/dots)
    df.columns = [col.strip().lower().replace(' ', '_').replace('.', '_') for col in df.columns]

    # Column mapping (same as router)
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

    # Find actual columns
    actual_cols = {}
    for expected, alternatives in column_mapping.items():
        for alt in alternatives:
            if alt in df.columns:
                actual_cols[expected] = alt
                break
        else:
            print(f"❌ Missing column: {expected}")
            return False

    # Process rows
    records = []
    skipped = 0
    for idx, row in df.iterrows():
        tanggal_serial = row[actual_cols['tanggal']]
        tanggal_date = excel_serial_to_date(tanggal_serial)
        if tanggal_date is None:
            skipped += 1
            continue

        record = Purchase(
            source_name=str(row[actual_cols['source_name']]),
            kode_item=str(row[actual_cols['kode_item']]),
            item=str(row[actual_cols['item']]),
            kode_vendor=str(row[actual_cols['kode_vendor']]),
            vendor=str(row[actual_cols['vendor']]),
            tanggal=tanggal_date,
            qty=int(row[actual_cols['qty']]) if pd.notnull(row[actual_cols['qty']]) else 0,
            unit=str(row[actual_cols['unit']]),
            harga=int(row[actual_cols['harga']]) if pd.notnull(row[actual_cols['harga']]) else 0,
            total=int(row[actual_cols['total']]) if pd.notnull(row[actual_cols['total']]) else 0,
            kategori=str(row[actual_cols['kategori']]),
            tipe_item=str(row[actual_cols['tipe_item']]),
            outlet=str(row[actual_cols['outlet']]),
            bulan=str(row[actual_cols['bulan']]),
            hari=int(row[actual_cols['hari']]) if pd.notnull(row[actual_cols['hari']]) else 0,
            minggu=str(row[actual_cols['minggu']]),
            tahun=int(row[actual_cols['tahun']]) if pd.notnull(row[actual_cols['tahun']]) else 0
        )
        records.append(record)

    # Bulk insert in chunks
    chunk_size = 1000
    total_inserted = 0
    for i in range(0, len(records), chunk_size):
        chunk = records[i:i+chunk_size]
        db.add_all(chunk)
        db.commit()
        total_inserted += len(chunk)
        print(f"  progress: {total_inserted}/{len(records)}")

    print(f"✅ Imported {total_inserted} records (skipped {skipped})")
    return total_inserted

def main():
    # Paths
    project_root = Path(__file__).parent.parent
    data_dir = project_root / "data"
    excel_file = data_dir / "purchase_data.xlsx"

    if not excel_file.exists():
        print(f"❌ Excel file not found: {excel_file}")
        print("   Please place your purchase_data.xlsx in the data/ folder")
        sys.exit(1)

    # Initialize DB
    db = SessionLocal()
    try:
        init_database()
        import_excel(excel_file, db)
        print("✅ Database initialization complete!")
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    main()
