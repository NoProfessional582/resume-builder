@echo off
rem Double-click to start Resume Builder and open it in your browser.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1" %*
if errorlevel 1 pause
