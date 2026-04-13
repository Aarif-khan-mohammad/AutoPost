@echo off
:loop
timeout /t 10 /nobreak >nul
git -C "%~dp0" diff --quiet
if errorlevel 1 (
    git -C "%~dp0" add -A
    git -C "%~dp0" commit -m "auto: sync changes"
    git -C "%~dp0" push
    echo [%time%] Pushed changes
)
goto loop
