# --- Stage 1: Build Frontend ---
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# --- Stage 2: Build Backend & Final Image ---
FROM python:3.10-slim
WORKDIR /app

# Install dependencies backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy semua file backend
COPY backend/ .

# Ambil hasil build frontend dan taruh di tempat yang bisa dibaca backend
COPY --from=frontend-builder /app/frontend/dist ./static

# Command untuk menjalankan aplikasi
EXPOSE 8080
CMD ["gunicorn", "main:app", "--bind", "0.0.0.0:8080"]
