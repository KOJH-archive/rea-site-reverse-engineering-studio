@echo off
setlocal
cd /d "%~dp0"
if not exist node_modules (
  echo REA dependencies are missing. Installing them first...
  call npm ci
  if errorlevel 1 pause & exit /b 1
)
if not exist dist\cli-runtime\cli.js (
  echo Building REA...
  call npm run build:cached
  if errorlevel 1 pause & exit /b 1
)
node scripts\one-click-reverse-engineer-site.mjs %*
echo.
echo Finished. Press any key to close this window.
pause >nul
endlocal
