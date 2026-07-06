@echo off
REM ============================================================
REM  Viet Anh Media Hub - CHAY TAT CA bang MOT cu nhap:
REM    Docker + backend + orchestrator + frontend + bot Zalo + tunnel public.
REM  (= start-postiz.bat + start-tunnel.bat gop mot cua so)
REM  URL public in ra man hinh va luu vao tunnel-url.txt.
REM  Doi code xong muon build lai: start-all.bat --rebuild
REM  Dong cua so nay = tat het.
REM ============================================================
cd /d "%~dp0"
node run.mjs --tunnel %*
pause
