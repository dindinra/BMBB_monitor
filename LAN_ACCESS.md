# LAN Access Guide ▫️

##目标
Membuka aplikasi BMBB Monitor dari komputer lain di jaringan yang sama.

## 1. Server-side Setup

### Backend (FastAPI)
- Sudah listen di `0.0.0.0:8000` (semua network interface).
- CORS: `allow_origins=["*"]` (permit semua origin).

Start:
```bash
cd ~/BMBB_monitor
source venv/bin/activate
uvicorn backend.main:app --host 0.0.0.0 --port 8000
# NOTE: API now serves both `/inventory` and `/inventory/` endpoints (no redirect needed).
```

### Frontend (React Dev Server)
- Harus di‑start dengan `HOST=0.0.0.0` agar tidak hanya localhost.

Start:
```bash
cd ~/BMBB_monitor/frontend
HOST=0.0.0.0 npm start
```

Bot easier: gunakan script start-lan.sh:
```bash
#!/bin/bash
cd ~/BMBB_monitor/frontend
HOST=0.0.0.0 npm start
```

### Firewall
Buka port 3000 (frontend) dan 8000 (backend):
```bash
sudo ufw allow 3000/tcp
sudo ufw allow 8000/tcp
```

## 2. Dapatkan IP Address Server

Di server, jalankan:
```bash
hostname -I
```
atau
```bash
ip -4 addr show | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | grep -v 127.0.0.1
```

Contoh output: `172.21.91.194`

Itulah IP yang akan digunakan client.

## 3. Client-side (Komputer Lain)

Buka browser ke:
```
http://<SERVER_IP>:3000
```
Contoh: `http://172.21.91.194:3000`

### Expected Behavior
- Frontend loads dari server.
- Semua API request otomatis menuju `http://<SERVER_IP>:8000` karena frontend menggunakan dynamic API_BASE berdasarkan `window.location.hostname`.
- Tidak ada CORS error (karena backend allow all origins).
- Tidak ada network error (karena backend reachable via LAN IP).

## 4. Verifikasi

### From server itself:
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000   # 200
curl -s -o /dev/null -w "%{http_code}" http://<SERVER_IP>:3000 # 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/inventory  # 200/307
curl -s -o /dev/null -w "%{http_code}" http://<SERVER_IP>:8000/inventory  # 200/307
```

### From client browser (F12 → Console):
- No CORS errors.
- Network tab: requests to `http://<SERVER_IP>:8000/*` return 200.

---

## ⚠️ Common Issues

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Frontend tidak terbuka (connection refused) | Frontend bind ke 127.0.0.1 | Start dengan `HOST=0.0.0.0` |
| API requests gagal (failed to fetch) | Backend tidak reachable | Start backend dengan `--host 0.0.0.0`; cek firewall |
| CORS error | Backend CORS ketat | Set `allow_origins=["*"]` di `backend/main.py` |
| IP server berubah tiap reboot | DHCP | Gunakan IP statis atau update dokumen setelah reboot |

---

## 🔐 Security Note
Untuk akses internet/public, jangan gunakan `allow_origins=["*"]`. Sebutkan origin yang spesifik dan gunakan HTTPS (reverse proxy Nginx). Juga pertimbangkan autentikasi.

---

Last updated: 2026‑04‑07
