from sqlalchemy import create_engine, func
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from pathlib import Path

# Get DATABASE_URL from environment variable, fallback to SQLite for local development
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    # Local development fallback to SQLite
    # database.py location: BMBB_monitor/backend/app/database.py
    # Purchase.db is located one level above the project root
    # Determine DB path relative to this file. In Docker, the project root is two levels up.
    DB_PATH = (
        Path(os.getenv("PURCHASE_DB_PATH", ""))
        if os.getenv("PURCHASE_DB_PATH")
        else Path(__file__).resolve().parents[2] / "purchase.db"
    )
    DATABASE_URL = f"sqlite:///{DB_PATH}"

# Handle Railway's PostgreSQL URL format (they sometimes use postgres:// instead of postgresql://)
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Create engine
if DATABASE_URL.startswith("sqlite"):
    # SQLite specific connect args
    engine = create_engine(
        DATABASE_URL, connect_args={"check_same_thread": False}
    )
else:
    # PostgreSQL and other databases
    engine = create_engine(DATABASE_URL)

# SessionLocal class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Helper: database-agnostic date formatting
def format_date_column(column, format_str):
    """
    Format a date column for both SQLite and PostgreSQL.
    
    Args:
        column: SQLAlchemy column to format
        format_str: SQLite strftime format string (e.g., '%Y', '%Y-%m')
    
    Returns:
        Formatted column expression compatible with both databases
    """
    # Check engine dialect
    if engine.dialect.name == 'sqlite':
        return func.strftime(format_str, column)
    elif engine.dialect.name == 'postgresql':
        # Map SQLite format to PostgreSQL format
        pg_format = format_str
        pg_format = pg_format.replace('%Y', 'YYYY')
        pg_format = pg_format.replace('%m', 'MM')
        pg_format = pg_format.replace('%d', 'DD')
        return func.to_char(column, pg_format)
    else:
        # Fallback to strftime for other databases
        return func.strftime(format_str, column)
