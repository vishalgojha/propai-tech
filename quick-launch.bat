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

if /i "%MODE%"=="web" (
  call :ensure_port_available %APP_PORT%
  echo [run] Launching API in new window on http://localhost:%APP_PORT%/app ...
  start "PropAI Web %APP_PORT%" cmd /k "cd /d \"%~dp0\" && set PORT=%APP_PORT% && npm.cmd run build && npm.cmd run start"
  echo [run] Opening browser at http://127.0.0.1:%APP_PORT%/app ...
  start "" cmd /c "timeout /t 2 >nul && start http://127.0.0.1:%APP_PORT%/app"
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
echo   quick-launch.bat web [port]
echo   quick-launch.bat legacy
echo   quick-launch.bat legacy-bg
echo   quick-launch.bat openrouter "your prompt"
exit /b 1

:ensure_port_available
set PORT_TO_CHECK=%1
if "%PORT_TO_CHECK%"=="" exit /b 0

set PORT_PID=
for /f "tokens=5" %%a in ('netstat -aon ^| findstr /R /C:":%PORT_TO_CHECK% .*LISTENING"') do (
  set PORT_PID=%%a
  goto :port_scan_done
)

:port_scan_done
if defined PORT_PID (
  echo [run] Port %PORT_TO_CHECK% is in use by PID %PORT_PID%. Stopping it...
  taskkill /PID %PORT_PID% /F >nul 2>nul
)
exit /b 0
