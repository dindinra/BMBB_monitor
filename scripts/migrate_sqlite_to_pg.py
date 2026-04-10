import os
from pathlib import Path
from sqlalchemy import create_engine, text

# SQLite source (fallback) and PostgreSQL target from DATABASE_URL env
sqlite_path = Path(__file__).resolve().parents[2] / "purchase.db"
sqlite_url = f"sqlite:///{sqlite_path}"
pg_url = os.getenv("DATABASE_URL")

if not pg_url:
    raise RuntimeError("DATABASE_URL not set for PostgreSQL migration")

# Ensure pg_url uses postgresql://
if pg_url.startswith("postgres://"):
    pg_url = pg_url.replace("postgres://", "postgresql://", 1)

src_engine = create_engine(sqlite_url)
 tgt_engine = create_engine(pg_url)

print(f"Migrating data from {sqlite_path} to PostgreSQL...")

# List tables to migrate (exclude sqlite_sequence)
with src_engine.connect() as src_conn:
    tables = src_conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name!='sqlite_sequence'"))
    table_names = [row[0] for row in tables]

for tbl in table_names:
    print(f"Migrating table {tbl}...")
    # Fetch all rows
    src_rows = src_engine.execute(text(f"SELECT * FROM {tbl}")).fetchall()
    if not src_rows:
        continue
    # Get column names
    col_names = src_rows[0].keys()
    cols_str = ", ".join(col_names)
    placeholders = ", ".join(["?" for _ in col_names]) if sqlite_url.startswith("sqlite") else ", ".join(["%s" for _ in col_names])
    # Insert into Postgres
    with tgt_engine.begin() as tgt_conn:
        insert_stmt = f"INSERT INTO {tbl} ({cols_str}) VALUES ({placeholders})"
        # Convert rows to list of tuples
        data = [tuple(row) for row in src_rows]
        tgt_conn.execute(text(insert_stmt), data)

print("Migration completed.")
