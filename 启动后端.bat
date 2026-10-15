@echo off
chcp 65001 >nul
title mini-suite 后端服务
cd /d %~dp0server

echo ============================================
echo   mini-suite 后端启动
echo   API:    http://localhost:8790/docs
echo   后台:   http://localhost:8790/admin
echo ============================================
echo.

where anaconda-py >nul 2>nul

"D:\AppCode\Anaconda\anaconda\python.exe" -m uvicorn main:app --host 0.0.0.0 --port 8790

pause
