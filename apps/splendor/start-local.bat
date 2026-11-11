@echo off
chcp 65001 >nul
title Splendor 本地版
cd /d %~dp0
echo.
echo   ============================================
echo    Splendor 本地版（本地对战 / 人机 / 训练）
echo   ============================================
echo.
echo   正在构建并启动，请稍候（首次运行约需 10 秒）...
echo.
call npm run build
start "" http://localhost:4173
call npx vite preview --port 4173 --strictPort
pause
