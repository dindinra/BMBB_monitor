from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.app.database import engine, Base
from backend.app.routers import purchases, import_export, sales, inventory, reports
from .app.models import Purchase, Sales, Item, Inventory  # Ensure all models are imported so tables are created

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="BMBB Monitoring API", version="1.0.0")

# Serve React frontend static files (built assets)
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

# Serve the built React assets. In development we use the local build folder; in Docker the same path is copied to /app/static.
static_dir = os.path.join(os.path.dirname(__file__), "..", "frontend", "build")
if not os.path.isdir(static_dir):
    # Fallback to a 'static' folder if build missing (prevents crash)
    static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
    os.makedirs(static_dir, exist_ok=True)

app.mount("/static", StaticFiles(directory=static_dir), name="static")



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

# Debug endpoint to show static_dir path
@app.get("/debug/static-dir")
def debug_static_dir():
    return {"static_dir": static_dir}

# Catch‑all route for SPA – serve index.html for any non‑API path
@app.get("/{full_path:path}", include_in_schema=False)
async def spa_catch_all(full_path: str):
    index_path = os.path.join(static_dir, "index.html")
    return FileResponse(index_path)


@app.get("/")
def read_root():
    return {"message": "BMBB Monitoring API", "status": "running"}