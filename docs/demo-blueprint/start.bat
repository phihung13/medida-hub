@echo off
REM Chay demo Viet Anh Media Hub (2 backend + 1 UI)
REM Neu co Claude API key, dat truoc khi chay:  set ANTHROPIC_API_KEY=sk-ant-...
cd /d "%~dp0"
node dev.js
pause
