@echo off
REM Mở truy cập TỪ XA (URL public HTTPS) cho Việt Anh Media Hub.
REM Yêu cầu: start-postiz.bat đang chạy. Đóng cửa sổ này = tắt truy cập từ xa.
cd /d "%~dp0"
node tunnel.mjs %*
pause
