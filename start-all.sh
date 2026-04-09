#!/bin/bash

# BMBB Monitor – Start all services (backend + frontend)
# Usage: ./start-all.sh

set -e

PROJECT_ROOT="$HOME/BMBB_monitor"
VENV_PYTHON="$PROJECT_ROOT/venv/bin/python"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
BACKEND_PORT=8000
FRONTEND_PORT=3000

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🚀 BMBB Monitor – Starting all services${NC}"

# 1. Stop existing processes (if any)
echo -e "${YELLOW}🔧 Stopping any existing backend/frontend...${NC}"
pkill -f "uvicorn backend.main:app" 2>/dev/null || true
pkill -f "react-scripts" 2>/dev/null || true
sleep 1

# 2. Start Backend
echo -e "${YELLOW}▶️  Starting backend (FastAPI) on port $BACKEND_PORT...${NC}"
cd "$PROJECT_ROOT"
source venv/bin/activate 2>/dev/null || echo "⚠️  venv not activated (maybe not needed?)"
uvicorn backend.main:app --host 0.0.0.0 --port $BACKEND_PORT > /tmp/backend.log 2>&1 &
BACKEND_PID=$!
echo "   PID: $BACKEND_PID"
sleep 3

# Check backend health
if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$BACKEND_PORT" | grep -q 200; then
    echo -e "   ${GREEN}✅ Backend is healthy${NC}"
else
    echo -e "   ${RED}❌ Backend not responding – check /tmp/backend.log${NC}"
    tail -n 20 /tmp/backend.log
fi

# 3. Start Frontend
echo -e "${YELLOW}▶️  Starting frontend (React) on port $FRONTEND_PORT...${NC}"
cd "$FRONTEND_DIR"
HOST=0.0.0.0 npm start > /tmp/frontend.log 2>&1 &
FRONTEND_PID=$!
echo "   PID: $FRONTEND_PID"
sleep 30  # wait for React compilation

# Check frontend
if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$FRONTEND_PORT" | grep -q 200; then
    echo -e "   ${GREEN}✅ Frontend is up${NC}"
    # Open browser automatically
    echo -e "${YELLOW}🌐 Opening browser...${NC}"
    xdg-open "http://localhost:$FRONTEND_PORT" 2>/dev/null || echo "   (Could not open browser automatically—please open manually)"
else
    echo -e "   ${RED}❌ Frontend not responding – check /tmp/frontend.log${NC}"
    tail -n 20 /tmp/frontend.log
fi

# 4. Determine Windows host IP (for LAN access from other computers)
WINDOWS_HOST_IP=""
WSL_IP=""
# Try via resolv.conf (WSL2: nameserver is usually Windows host)
if [[ -f /etc/resolv.conf ]]; then
    WINDOWS_HOST_IP=$(grep -m1 'nameserver' /etc/resolv.conf | awk '{print $2}')
fi
# Validate: must not be 127.0.0.1 or 172.17.0.1 etc; typically 172.x or 192.168.x for WSL2 NAT
if [[ -z "$WINDOWS_HOST_IP" || "$WINDOWS_HOST_IP" == "127."* || "$WINDOWS_HOST_IP" == "172.17."* ]]; then
    # Fallback: try to get Windows host IP using PowerShell (works in WSL1/2)
    if command -v powershell.exe &>/dev/null; then
        WINDOWS_HOST_IP=$(powershell.exe -Command "(Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'Ethernet*' | Where {$_.IPAddress -notlike '169.*' -and $_.IPAddress -notlike '127.*'} | Select-Object -First 1 -ExpandProperty IPAddress)" 2>/dev/null)
    fi
fi
# Also detect WSL IP (needed for portproxy)
WSL_IP=$(hostname -I | awk '{print $1}')
# If still no Windows host IP, fallback to WSL IP with note
if [[ -z "$WINDOWS_HOST_IP" ]]; then
    if [[ -n "$WSL_IP" ]]; then
        WINDOWS_HOST_IP="$WSL_IP (WSL internal – you must configure Windows port forwarding)"
    else
        WINDOWS_HOST_IP="unknown"
    fi
fi

echo
echo -e "${GREEN}🌐 Access URLs:${NC}"
echo "   Localhost: http://127.0.0.1:$FRONTEND_PORT"
if [[ -n "$WINDOWS_HOST_IP" ]]; then
    echo -e "   ${YELLOW}From other computers on LAN:${NC}"
    echo "     http://$WINDOWS_HOST_IP:$FRONTEND_PORT"
    echo
    echo -e "   ${YELLOW}⚙️  If using WSL2 and external access fails:${NC}"
    echo "   • Ensure ports are forwarded from Windows to WSL2:"
    echo "      1) Note your WSL IP: $WSL_IP"
    echo "      2) In Windows PowerShell (Run as Administrator), run:"
    echo "         netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=3000 connectaddress=$WSL_IP connectport=3000"
    echo "         netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=8000 connectaddress=$WSL_IP connectport=8000"
    echo "      3) Also open Windows Firewall for ports 3000 & 8000."
    echo "   • Alternatively, run the provided script from Windows Admin PowerShell:"
    echo "       $(pwd)/setup-wsl-portproxy.ps1 -WslIp $WSL_IP"
    echo "   • Then access using the Windows host IP shown above."
else
    echo "   Could not determine Windows host IP automatically."
    echo "   Run in Windows PowerShell:"
    echo "     (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'Ethernet*' | Where {\$_.IPAddress -notlike '169.*' -and \$_.IPAddress -notlike '127.*'} | Select-Object -First 1).IPAddress"
    echo ""
    echo "   ⚙️  For WSL2, also configure port forwarding:"
    echo "      netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=3000 connectaddress=$WSL_IP connectport=3000"
    echo "      netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=8000 connectaddress=$WSL_IP connectport=8000"
fi
echo
echo -e "${YELLOW}📋 Service PIDs:${NC}"
echo "   Backend  (uvicorn) : $BACKEND_PID"
echo "   Frontend (react)   : $FRONTEND_PID"
echo
echo -e "${YELLOW}🛑 To stop both services:${NC}"
echo "   pkill -f 'uvicorn backend.main:app'"
echo "   pkill -f 'react-scripts'"
echo
echo -e "${YELLOW}📝 Logs:${NC}"
echo "   Backend:  tail -f /tmp/backend.log"
echo "   Frontend: tail -f /tmp/frontend.log"
echo
