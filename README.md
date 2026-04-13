# BMBB Monitor 🍖📊

Aplikasi monitoring inventory, purchases, dan sales untuk BBQ Mountain Boys.

## 🚀 Quick Start (Development)

### Prerequisites
- Python 3.12+ dengan virtualenv
- Node.js 18+ & npm
- SQLite database (`purchase.db`) di `~/purchase.db`

### Backend (FastAPI)
```bash
cd ~/BMBB_monitor
source venv/bin/activate
uvicorn backend.main:app --host 0.0.0.0 --port 8000
# NOTE: API now serves both `/inventory` and `/inventory/` endpoints (no redirect needed).
```
API docs: http://localhost:8000/docs

### Frontend (React)
```bash
cd ~/BMBB_monitor/frontend
npm start
```
Aplikasi web: http://localhost:3000

---

## 📦 Features

- **Inventory**: Monitor stok, low stock alerts, purchase recommendations
- **Generate PO**: Rekomendasi pesanan barang dengan export Excel
- **Purchases & Sales**: Import Excel, history, aggregates by tipe_item
- **Dashboard**: Perbandingan harga Bandung vs Serpong, top items/vendors
- **Export**: Inventory & Purchase recommendation Excel

---

## 🔧 Configuration

### Database
Backend expects SQLite file di:
```
sqlite:///../purchase.db
```
(Buat di `~/purchase.db` atau ubah di `backend/app/database.py`)

### CORS
Backend sudah dikonfigurasi `allow_origins=["*"]` untuk development (LAN access). Untuk produksi, batasi origins.

### API Base (Frontend)
Frontend otomatis menyesuaikan API base berdasarkan hostname browser:
```javascript
const API_BASE = `http://${window.location.hostname}:8000`;
```
Jadi jika akses via `http://192.168.1.10:3000` maka API ke `http://192.168.1.10:8000`.

---

## 🌐 Access from Another Computer (Same Network)

1. **Cek IP server**:
   ```bash
   hostname -I
   ```
   Contoh: `192.168.1.10`

2. **Start aplikasi** dengan binding ke `0.0.0.0`:
   - Backend: sudah `--host 0.0.0.0`
   - Frontend:
     ```bash
     cd frontend
     HOST=0.0.0.0 npm start
     ```

3. **Buka firewall** (jika ada):
   ```bash
   sudo ufw allow 3000/tcp
   sudo ufw allow 8000/tcp
   ```

4. **Dari komputer lain**, buka:
   ```
   http://<SERVER_IP>:3000
   ```

---

## 🛠️ Troubleshooting

### Network error di browser
- Pastikan backend & frontend running.
- CORS error? Check backend `main.py` CORS config (`allow_origins=["*"]`).
- Port blocked? Buka firewall.

### Generate PO returns empty
- Pastikan ada data inventory & last_cost.
- Cek endpoint `/inventory/generate_po` langsung (curl).

- Export Excel blank
- Fixed missing trailing slash for `/inventory` endpoint by adding a redirect in `backend/main.py`.
- Bug sudah difix: panggil `get_inventory` dengan `search=None`.
- Cek `/inventory/export` dan `/inventory/generate_po/export`.

---

## 📁 Project Structure

### 🚢 Deployment (Railway)
- The `railway-deploy` branch contains the latest fixes, including the `/inventory` trailing‑slash redirect.
- Railway builds the Docker image using `Dockerfile` at the repository root.
- Ensure the `railway.json` file is present (defines build & restart policy).
- After pushing to `railway-deploy`, Railway will automatically redeploy.

## 📁 Project Structure

```
BMBB_monitor/
├── backend/
│   ├── app/
│   │   ├── database.py
│   │   ├── models.py
│   │   ├── routers/
│   │   │   ├── inventory.py
│   │   │   ├── purchases.py
│   │   │   ├── sales.py
│   │   │   └── import_export.py
│   │   └── schemas.py
│   ├── main.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   ├── services/
│   │   └── utils/
│   └── package.json
└── purchase.db (di home user)
```

---

## 📄 License
Internal use – BBQ Mountain Boys
Deploy trigger: Sun Apr 12 18:59:34 WIB 2026
Deploy trigger: Sun Apr 12 18:59:43 WIB 2026
