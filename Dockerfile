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
COPY backend/ ./backend

# Copy the built frontend assets preserving the expected directory structure
# This places the build output in ./frontend/build so backend can locate index.html and static assets.
COPY --from=frontend-builder /app/frontend/build ./frontend/build
# In case the build uses a 'dist' folder, also copy it to the same location.
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Command untuk menjalankan aplikasi
EXPOSE 8080
ENV PORT=8080

# Copy scripts for migration
COPY scripts/ ./scripts

# Run migration before starting the app (ignore failures)
RUN python scripts/migrate_sqlite_to_pg.py || echo "Migration skipped or failed"

CMD uvicorn backend.main:app --host 0.0.0.0 --port $PORT
