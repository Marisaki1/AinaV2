@echo off
setlocal
cd /d "%~dp0"
".venv\Scripts\python.exe" scripts\restore.py transfer-backup.wbbackup.zip --destination data
pause
