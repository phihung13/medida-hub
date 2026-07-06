@echo off
echo Dang tat Social Hub...
taskkill /f /im cloudflared.exe >/dev/null 2>&1
for %%p in (3000 3002 4200 8088) do (
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%%p ^| findstr LISTENING') do taskkill /f /pid %%a >/dev/null 2>&1
)
echo Da tat xong.
timeout /t 3 >nul
