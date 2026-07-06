@echo off
REM ============================================================
REM  Viet Anh Media Hub - chay bang MOT lenh, MOT cua so.
REM  Tu bat Docker + tu build neu can + chay backend & frontend.
REM  Yeu cau: Docker Desktop dang chay.
REM  Doi code xong muon build lai: start-postiz.bat --rebuild
REM ============================================================
cd /d "%~dp0"
node run.mjs %*
pause
