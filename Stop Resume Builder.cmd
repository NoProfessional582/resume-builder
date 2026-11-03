@echo off
rem Double-click to stop Resume Builder.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop.ps1" %*
pause
