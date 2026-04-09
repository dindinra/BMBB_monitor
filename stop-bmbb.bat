@echo off
echo Stopping BMBB Monitor...
wsl bash -c "cd ~/BMBB_monitor && ./stop-all.sh"
echo.
echo Done.
pause >nul
