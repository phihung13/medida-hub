@echo off
REM ============================================================
REM  Dung toan bo Viet Anh Media Hub: tunnel + 4 cong dich vu.
REM  (Docker Postgres/Redis/Temporal van chay - go bang Docker Desktop
REM   neu muon tat han ha tang.)
REM ============================================================
echo Dang tat Viet Anh Media Hub...
taskkill /f /im cloudflared.exe >nul 2>&1
for %%p in (3000 3002 4200 8088) do (
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%%p ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1
)
echo Da tat xong.
timeout /t 3 >nul
