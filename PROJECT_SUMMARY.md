# BMBB Monitor – Project Summary

**Created:** 2026-03-27  
**Author:** Abdul AI Assistant (for dindin)  
**Tech Stack:** FastAPI (Python backend), React (frontend), SQLite (via SQLAlchemy)

---

## 📁 Project Structure

```
BMBB_monitor/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI app entry
│   │   ├── models.py         # SQLAlchemy models (Purchase)
│   │   ├── database.py       # DB connection (SQLite)
│   │   ├── schemas.py        # Pydantic schemas
│   │   └── routers/
│   │       └── purchases.py  # All API endpoints
│   └── ...
├── frontend/
│   ├── src/
│   │   ├── App.js            # Router + Sidebar layout
│   │   ├── components/
│   │   │   └── Sidebar.jsx   # Navigation sidebar
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx # Purchases Monitoring page
│   │   │   └── PriceComparison.jsx  # Item price comparison page
│   │   └── index.css
│   └── package.json
├── PROJECT_SUMMARY.md        # This file
└── ...
```

---

## 🔌 Backend API Endpoints

### Purchases Router (`/purchases`)

| Endpoint | Method | Description | Filters |
|----------|--------|-------------|---------|
| `/purchases/` | GET | List all purchases (paginated) | `outlet`, `start_date`, `end_date`, `skip`, `limit` |
| `/{id}` | GET | Get single purchase | path param |
| `/` | POST | Create purchase | body (PurchaseCreate) |
| `/{id}` | PUT | Update purchase | body (PurchaseUpdate) |
| `/{id}` | DELETE | Delete purchase | path param |

### Aggregate Endpoints

| Endpoint | Method | Description | Filters |
|----------|--------|-------------|---------|
| `/purchases/aggregate/monthly` | GET | Monthly totals by outlet (for line chart) | `outlet`, `tipe_item`, `year`, `start_date`, `end_date` |
| `/purchases/aggregate/price_by_item` | GET | Avg price per item, pivoted by outlet (paginated) | `item` (partial), `outlet`, `tipe_item`, `year`, `start_date`, `end_date`, `skip`, `limit` |
| `/purchases/aggregate/price_comparison` | GET | Avg price per outlet (overall) | same filters |
| `/purchases/aggregate/summary` | GET | Summary totals (amount, qty, count) | same filters |
| `/purchases/aggregate/top_items_by_qty` | GET | Top N items by quantity purchased | same filters + `limit` (default 5) |
| `/purchases/aggregate/top_vendors` | GET | Top N vendors by purchase amount | same filters + `limit` (default 5) |
| `/purchases/aggregate/last_cost` | GET | Latest purchase per item (with vendor, tanggal, unit, harga, outlet) | `outlet`, `tipe_item`, `year`, `start_date`, `end_date`, `skip`, `limit` |
| `/purchases/aggregate/price_history` | GET | Price history over time per item-outlet (time series) | `item` (partial), `outlet`, `tipe_item`, `start_date`, `end_date`, `group_by` (day|month|year), `skip`, `limit` |

### Metadata Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/purchases/distinct/tipe_items` | GET | List distinct `tipe_item` values |
| `/purchases/distinct/years` | GET | List distinct years from `tanggal` |

---

## 🖥 Frontend Pages

### 1. Purchases Monitoring (`/`)
- **Sidebar label:** "Purchases"
- **Features:**
  - Single stat card: **Total Amount** (sum of all purchases, respects filters)
  - Filters: Outlet, Tipe Item, Year (default latest), Start Date, End Date
  - **Line chart**: Monthly purchase amount by outlet (multi-line)
  - **Top 5 Items by Quantity** table (Item, Qty, Total Amount, Transactions)
  - **Top 5 Vendors by Purchase Amount** table (Vendor, Total Amount, Qty, Transactions)
- **No pagination** (aggregate only)
- All sections refresh together when filters applied.
- Year dropdown auto-selects the latest year from data on first load.

### 2. Price Comparison (`/price-comparison`)
- **Sidebar label:** "Price Comparison"
- **Features:**
  - Filters: **Item** (partial match), Outlet, Tipe Item, Year, Start Date, End Date
  - **No "Show" filter & no pagination** – always displays up to 1000 rows (all data)
  - Table showing average price per item by outlet (Bandung, Serpong, …)
  - **Only items that have purchases in BOTH outlets** are shown (filtered server-side)
  - **Selisih column** (Bandung – Serpong):
    - **Negatif (Bandung cheaper)**: green text, ↓ arrow
    - **Positif (Bandung more expensive)**: red text, ↑ arrow
  - **Persen (%) column**: percentage change relative to Serpong price: `(selisih / serpong) * 100`
    - Negative shown with green, positive with red
    - Format: `-22.05%` or `+15.23%`
  - **Sortable** by selisih (click header toggles asc/desc)
  - Prices formatted as Indonesian Rupiah
  - **Drill‑down:** Click an item name to open **Price Trends** page with that item pre‑selected (group by month).

### 3. Last Cost (`/last-cost`)
- **Sidebar label:** "Last Cost" (icon 🕒)
- **Features:**
  - Filters: Outlet, Tipe Item, Year (default latest), Start Date, End Date
  - **No "Show" filter** – always displays up to 1000 rows
  - Table showing **latest purchase per item** (by tanggal) with:
    - **Item** | **Vendor** | **Tanggal** | **Unit** | **Harga** | **Outlet**
  - Pagination (Previous/Next + page numbers) if total > 1000
  - Harga formatted as Indonesian Rupiah
  - Data sorted by tanggal (newest first) then item

### 4. Price Trends (drill‑down from Price Comparison)
- **Not in sidebar** – accessed by clicking an item name in **Price Comparison** table.
- **Filters:** Outlet, Group By (Day/Month/Year), Start Date, End Date
- **Line chart:** Shows average price over time for the pre‑selected item (multi‑outlet)
- **Table:** Displays price history (Item, Outlet, Period, Unit, Avg Price, Transactions)
- **URL params:** Accepts `item` (required), `group_by`, `outlet`, `start_date`, `end_date`
- **Default group by:** Year when accessed directly; Month when from Price Comparison link.

---

## 🎨 UI/UX Notes

- Styling: Plain Tailwind-like classes (assumes Tailwind CSS is available via `index.css` or CDN)
- Responsive grid layouts (md: breakpoints)
- Colors:
  - Primary blue: `#3b82f6`
  - Success green: `#10b981` (outlet color), also for cheaper items
  - Danger red: for expensive diff
  - Neutral grays for text/backgrounds
- Icons: Emoji (📊, 💰, ↻, ↑, ↓)

---

## ⚙️ Configuration

### Backend (`backend/main.py`)
- Database: SQLite (path configured in `database.py`)
- CORS enabled for `http://localhost:3000`
- Server: Uvicorn on `0.0.0.0:8000`

### Frontend (`frontend/.env` or `package.json`)
- `REACT_APP_API_URL` optional, default `http://localhost:8000`
- `proxy` field **removed** from `package.json` to enable client-side routing.

---

## 🚀 Running the App

```bash
# Backend
cd backend
source ../venv/bin/activate  # or your venv
uvicorn app.main:app --host 0.0.0.0 --port 8000

# Frontend (dev)
cd frontend
npm install
npm start
# → http://localhost:3000
```

---

## 📊 Database Model (Purchase)

```python
class Purchase(Base):
    __tablename__ = "purchase_tbl"
    id = Column(Integer, primary_key=True)
    source_name = Column(String, nullable=False)
    kode_item = Column(String, nullable=False)
    item = Column(String, nullable=False)
    kode_vendor = Column(String, nullable=False)
    vendor = Column(String, nullable=False)  # used for top_vendors
    tanggal = Column(Date, nullable=False)
    qty = Column(Integer, nullable=False)
    unit = Column(String, nullable=False)
    harga = Column(Integer, nullable=False)  # per-unit price in IDR
    total = Column(Integer, nullable=False)  # qty * harga
    kategori = Column(String, nullable=False)
    tipe_item = Column(String, nullable=False)  # e.g., inventory, non-inventory
    outlet = Column(String, nullable=False)    # e.g., bandung, serpong
    bulan = Column(String, nullable=False)     # e.g., "March"
    hari = Column(Integer, nullable=False)
    minggu = Column(String, nullable=False)   # e.g., "Minggu ke-4"
    tahun = Column(Integer, nullable=False)
```

---

## 📈 Feature Checklist

- [x] Sidebar with three tabs (Purchases, Price Comparison, Last Cost)
- [x] Purchases page:
  - [x] Total Amount stat card
  - [x] Filters (outlet, tipe_item, year, date range)
  - [x] Line chart (monthly, multi-outlet)
  - [x] Top 5 Items by Quantity table
  - [x] Top 5 Vendors by Total Amount table
- [x] Price Comparison page:
  - [x] Average price table per item per outlet
  - [x] Selisih (diff) column with color + arrow indicators
  - [x] Sortable by selisih (click header)
  - [x] Pagination
  - [x] Drill‑down to Price Trends (click item)
- [x] Price Trends (drill‑down):
  - [x] Filters: Outlet, Group By, Start/End Date
  - [x] Line chart for selected item
  - [x] Price history table with pagination (limit 10000)
- [x] Backend endpoints: summary, top_items_by_qty, top_vendors, price_by_item, price_history (with pagination & sanitization)
- [x] Responsive design
- [x] Build passes (no errors)

---

## 🔍 Known Limitations & Future Improvements

1. **Hard-coded outlets** in chart colors (`bandung`, `serpong`). To support dynamic outlets, compute color scale programmatically.
2. **Price comparison** assumes exactly two outlets; selisih calculation currently hard-coded Bandung - Serpong. Should generalize to arbitrary outlets (e.g., show difference between first two outlets in sorted order).
3. **Top Vendors** uses `vendor` field from Purchase; ensure vendor names are consistent (typos can split counts).
4. **Pagination** on Price Comparison uses a max limit of 1000 per page; "All" translates to 1000, not truly all. Consider server-side full export if needed.
5. **Data sanitization** in `price_by_item` strips control characters; might hide data issues. Better to clean at ingestion.
6. **Error handling** in frontend is basic; could add retry logic and better user feedback.
7. **Tests**: None yet. Add unit/integration tests for backend queries and frontend components.
8. **Authentication/Authorization**: None. App is open on localhost.

---

## 🧠 Memory Notes

- Project active as of 2026-03-30.
- New feature: Price Trends Monitoring (price_history endpoint + React page) implemented on 2026-03-30.
- Price Comparison now supports **Item (partial match) filter** – added to `price_by_item` endpoint (backend) and UI (frontend) on 2026-03-30.
- All new code is in the listed files; avoid rewriting from scratch.
- Preferred language: Indonesian (santuy).
- User likes concise, functional, slightly humorous AI responses.

---

Last updated: 2026-03-30 (estimated)
