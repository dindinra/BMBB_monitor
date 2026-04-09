@echo off
echo Starting BMBB Monitor...
wsl bash -c "cd ~/BMBB_monitor && ./start-all.sh"
echo.
echo Services should be running in the background.
echo Press any key to close this window...
pause >nul
