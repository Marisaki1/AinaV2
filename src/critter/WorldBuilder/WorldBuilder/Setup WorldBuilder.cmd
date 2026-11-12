@echo off
setlocal
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo Install Python 3.12 or newer and add it to PATH, then run this again.
  pause
  exit /b 1
)
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22 LTS or newer, then run this again.
  pause
  exit /b 1
)
if not exist ".venv\Scripts\python.exe" python -m venv .venv
if errorlevel 1 goto failed
".venv\Scripts\python.exe" -m pip install -r requirements.lock
if errorlevel 1 goto failed
call npm.cmd ci --no-fund --no-audit --cache .npm-cache
if errorlevel 1 goto failed
call npm.cmd run build
if errorlevel 1 goto failed
echo Ready. Double-click Open WorldBuilder.cmd.
pause
exit /b 0
:failed
echo Setup stopped. Review the error above. Your saved data has not been removed.
pause
exit /b 1
