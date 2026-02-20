@echo off
setlocal
cd /d "%~dp0"

set MODE=%1
if "%MODE%"=="" set MODE=api
set APP_PORT=%2
if "%APP_PORT%"=="" set APP_PORT=1310

if not exist "node_modules" (
  echo [setup] Installing dependencies...
  call npm.cmd install --ignore-scripts
  if errorlevel 1 (
    echo [error] npm install failed
    exit /b 1
  )
)

if /i "%MODE%"=="api" (
  echo [run] Starting API on http://localhost:%APP_PORT%/app ...
  set PORT=%APP_PORT%
  call npm.cmd run build
  if errorlevel 1 (
    echo [error] build failed
    pause
    exit /b 1
  )
  call npm.cmd run start
  exit /b %errorlevel%
)

if /i "%MODE%"=="api-bg" (
  echo [run] Launching API in new window on http://localhost:%APP_PORT%/app ...
  start "PropAI API %APP_PORT%" cmd /k "cd /d \"%~dp0\" && set PORT=%APP_PORT% && npm.cmd run build && npm.cmd run start"
  exit /b 0
)

if /i "%MODE%"=="legacy" (
  echo [run] Starting legacy WhatsApp helper...
  call npm.cmd run build
  if errorlevel 1 (
    echo [error] build failed
    pause
    exit /b 1
  )
  call npm.cmd run start:legacy
  exit /b %errorlevel%
)

if /i "%MODE%"=="legacy-bg" (
  echo [run] Launching legacy WhatsApp helper in new window...
  start "PropAI Legacy" cmd /k "cd /d \"%~dp0\" && npm.cmd run build && npm.cmd run start:legacy"
  exit /b 0
)

if /i "%MODE%"=="openrouter" (
  shift
  if "%~1"=="" (
    echo Usage: quick-launch.bat openrouter "your prompt"
    exit /b 1
  )
  call npm.cmd run openrouter:chat -- %*
  exit /b %errorlevel%
)

echo Usage:
echo   quick-launch.bat api [port]
echo   quick-launch.bat api-bg [port]
echo   quick-launch.bat legacy
echo   quick-launch.bat legacy-bg
echo   quick-launch.bat openrouter "your prompt"
exit /b 1
