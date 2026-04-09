from sqlalchemy import Column, Integer, String, Date, ForeignKey
from sqlalchemy.orm import relationship
from .database import Base


class Purchase(Base):
    __tablename__ = "purchase_tbl"

    id = Column(Integer, primary_key=True, index=True)
    source_name = Column(String, nullable=False)
    kode_item = Column(String, nullable=False)
    item = Column(String, nullable=False)
    kode_vendor = Column(String, nullable=False)
    vendor = Column(String, nullable=False)
    tanggal = Column(Date, nullable=False)  # ISO format date
    qty = Column(Integer, nullable=False)
    unit = Column(String, nullable=False)
    harga = Column(Integer, nullable=False)  # in Rupiah
    total = Column(Integer, nullable=False)  # qty * harga
    kategori = Column(String, nullable=False)
    tipe_item = Column(String, nullable=False)
    outlet = Column(String, nullable=False)
    bulan = Column(String, nullable=False)  # e.g., "March"
    hari = Column(Integer, nullable=False)
    minggu = Column(String, nullable=False)  # e.g., "Minggu ke-4"
    tahun = Column(Integer, nullable=False)


class Sales(Base):
    __tablename__ = "sales_tbl"

    id = Column(Integer, primary_key=True, index=True)
    source_name = Column(String, nullable=False)
    kode_item = Column(String, nullable=False)
    item = Column(String, nullable=False)
    kategori = Column(String, nullable=False)
    tanggal = Column(Date, nullable=False)  # ISO format date
    qty = Column(Integer, nullable=False)
    unit = Column(String, nullable=False)
    harga = Column(Integer, nullable=False)  # in Rupiah
    total = Column(Integer, nullable=False)  # qty * harga
    tipe_item = Column(String, nullable=False)
    outlet = Column(String, nullable=False)
    bulan = Column(String, nullable=False)  # e.g., "March"
    hari = Column(Integer, nullable=False)
    minggu = Column(String, nullable=False)  # e.g., "Minggu ke-4"
    tahun = Column(Integer, nullable=False)


class Item(Base):
    __tablename__ = "items"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    unit = Column(String, nullable=False)
    kategori = Column(String, nullable=False)
    buffer = Column(Integer, default=0, nullable=False)


class Inventory(Base):
    __tablename__ = "inventory"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    outlet = Column(String, nullable=False)
    gudang = Column(String, nullable=False)
    ending_qty = Column(Integer, nullable=False, default=0)
    buffer = Column(Integer, default=0, nullable=False)

    # Relationship
    item = relationship("Item", backref="inventory")