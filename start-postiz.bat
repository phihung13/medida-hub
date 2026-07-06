@echo off
REM ============================================================
REM  Viet Anh Media Hub - chay TAT CA bang MOT lenh (kem tunnel public).
REM  Tu bat Docker + tu build neu can, roi chay:
REM    backend(3000) + orchestrator(3002) + frontend(4200) + bot Zalo(8088)
REM    + tunnel Cloudflare (in ra URL truy cap tu xa - doi moi lan chay).
REM  Yeu cau: Docker Desktop dang chay.
REM  Doi code xong muon build lai:  start-postiz.bat --rebuild
REM  Dong cua so nay = tat he thong.
REM ============================================================
cd /d "%~dp0"
node scripts\run.mjs --tunnel %*
pause
