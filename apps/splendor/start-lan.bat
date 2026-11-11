@echo off
chcp 65001 >nul
title Splendor 局域网服务器
cd /d %~dp0
echo.
echo   ============================================
echo    Splendor 局域网对战服务器
echo   ============================================
echo.
echo   正在构建并启动，请稍候（首次启动约需 10 秒）...
echo   启动完成后，本机浏览器会自动打开游戏页面。
echo   其他电脑/平板请用浏览器访问窗口中列出的「局域网访问」地址。
echo.
echo   关闭本窗口即可停止服务器（对局存档会自动保存）。
echo.
call npm run lan
start "" http://localhost:8080
pause
