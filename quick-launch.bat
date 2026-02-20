@echo off
setlocal
cd /d "%~dp0"

set MODE=%1
if "%MODE%"=="" set MODE=api

if not exist "node_modules" (
  echo [setup] Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [error] npm install failed
    exit /b 1
  )
)

if /i "%MODE%"=="api" (
  echo [run] Starting agentic HTTP backend on port 8080...
  call npm run dev
  exit /b %errorlevel%
)

if /i "%MODE%"=="whatsapp" (
  echo [run] Starting single-agent WhatsApp helper...
  call npm run dev:legacy
  exit /b %errorlevel%
)

echo Usage:
echo   quick-launch.bat api
echo   quick-launch.bat whatsapp
exit /b 1
