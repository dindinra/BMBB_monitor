from pydantic import BaseModel, Field
from datetime import date
from typing import Optional


class PurchaseBase(BaseModel):
    source_name: str
    kode_item: str
    item: str
    kode_vendor: str
    vendor: str
    tanggal: date
    qty: int
    unit: str
    harga: int
    total: int
    kategori: str
    tipe_item: str
    outlet: str
    bulan: str
    hari: int
    minggu: str
    tahun: int


class PurchaseCreate(PurchaseBase):
    pass


class PurchaseUpdate(BaseModel):
    source_name: Optional[str] = None
    kode_item: Optional[str] = None
    item: Optional[str] = None
    kode_vendor: Optional[str] = None
    vendor: Optional[str] = None
    tanggal: Optional[date] = None
    qty: Optional[int] = None
    unit: Optional[str] = None
    harga: Optional[int] = None
    total: Optional[int] = None
    kategori: Optional[str] = None
    tipe_item: Optional[str] = None
    outlet: Optional[str] = None
    bulan: Optional[str] = None
    hari: Optional[int] = None
    minggu: Optional[str] = None
    tahun: Optional[int] = None


class PurchaseInDB(PurchaseBase):
    id: int

    class Config:
        from_attributes = True