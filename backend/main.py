from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.app.database import engine, Base
from backend.app.routers import purchases, import_export, sales, inventory, reports
from .app.models import Purchase, Sales, Item, Inventory  # Ensure all models are imported so tables are created

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="BMBB Monitoring API", version="1.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(purchases.router)
app.include_router(import_export.router)
app.include_router(sales.router)
app.include_router(inventory.router)
app.include_router(reports.router)


@app.get("/")
def read_root():
    return {"message": "BMBB Monitoring API", "status": "running"}