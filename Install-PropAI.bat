@echo off
setlocal
cd /d "%~dp0"

echo ====================================
echo PropAI One-Click Installer
echo ====================================
echo install + update mode is enabled
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\install-propai.ps1" -FromSource
if errorlevel 1 (
  echo.
  echo [error] Install failed. Review the messages above.
  pause
  exit /b 1
)

echo.
echo [ok] Install/update completed.
echo Try this command in a new terminal:
echo   propai chat   ^(or propai classic if TUI deps are missing^)
pause
