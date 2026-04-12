# --- Stage 1: Build Frontend ---
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend

# Copy package files dulu buat efisiensi cache
COPY frontend/package*.json ./
RUN npm install

# Copy semua file frontend
COPY frontend/ ./

# Jalankan build (Vite/React/Vue)
RUN npm run build

# --- Stage 2: Final Image ---
FROM python:3.10-slim
WORKDIR /app

# Install dependencies backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy semua file backend
COPY backend/ .

# LOGIC BARU: Cek folder 'dist' atau 'build' lalu copy ke 'static'
# Kita pakai trik shell agar tidak error kalau salah satu folder tidak ada
COPY --from=frontend-builder /app/frontend/dist* ./static/
COPY --from=frontend-builder /app/frontend/build* ./static/

# Command untuk menjalankan aplikasi
EXPOSE 8080
ENV PORT=${PORT:-8080}

# Hapus CMD yang lama, ganti jadi ini (TANPA kurung siku):
CMD uvicorn main:app --host 0.0.0.0 --port $PORT
