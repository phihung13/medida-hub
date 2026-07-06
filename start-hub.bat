@echo off
cd /d C:\Media_Hub_VietAnh
title Social Hub - Watchdog (dong cua so nay de TAT he thong)
echo ================================================
echo   SOCIAL HUB dang khoi dong + tu giam sat...
echo   Dong cua so nay = tat toan bo he thong.
echo ================================================
"C:\Program Files\nodejs\node.exe" supervise.mjs
pause
