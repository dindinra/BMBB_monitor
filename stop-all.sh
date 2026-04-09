#!/bin/bash
# BMBB Monitor – Stop all services

echo "🛑 Stopping BMBB Monitor services..."

pkill -f "uvicorn backend.main:app" 2>/dev/null
pkill -f "react-scripts" 2>/dev/null

echo "✅ Services stopped (if they were running)"
