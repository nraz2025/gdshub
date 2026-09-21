@echo off
REM ============================================================
REM  Auto-start script for GDSHub (Next.js dev server)
REM  Save this file INSIDE your gdshub project folder, at the
REM  same level as package.json.
REM ============================================================

REM %~dp0 = the folder this .bat file is sitting in, so it works
REM no matter what your Windows username/folder path is.
cd /d "%~dp0"

echo Starting GDSHub...
echo Project folder: %cd%
echo.

npm run dev

REM Keep the window open if npm run dev exits/crashes, so you can see the error.
pause
