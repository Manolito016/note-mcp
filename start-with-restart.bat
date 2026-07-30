@echo off
setlocal enabledelayedexpansion

:: Wrapper script for notes-mcp with auto-restart on crash
:: Features: exponential backoff, crash logging, max restart limit

set VAULT_PATH=%1
set MAX_RESTARTS=10
set INITIAL_DELAY=2
set MAX_DELAY=60
set RESTART_COUNT=0
set CURRENT_DELAY=%INITIAL_DELAY%
set LOGFILE=%~dp0crash.log

echo [%date% %time%] Wrapper started for vault: %VAULT_PATH% >> "%LOGFILE%"

:restart_loop
if %RESTART_COUNT% GEQ %MAX_RESTARTS% (
    echo [%date% %time%] Max restarts (%MAX_RESTARTS%) reached. Giving up. >> "%LOGFILE%"
    exit /b 1
)

echo [%date% %time%] Starting notes-mcp (attempt %RESTART_COUNT%/%MAX_RESTARTS%) >> "%LOGFILE%"
node "%~dp0dist\index.js" %VAULT_PATH% 2>> "%LOGFILE%"

set EXIT_CODE=%ERRORLEVEL%

if %EXIT_CODE% EQU 0 (
    echo [%date% %time%] Server exited normally. >> "%LOGFILE%"
    exit /b 0
)

echo [%date% %time%] Server crashed with exit code %EXIT_CODE% >> "%LOGFILE%"
set /a RESTART_COUNT+=1

echo [%date% %time%] Restarting in %CURRENT_DELAY%s... >> "%LOGFILE%"
timeout /t %CURRENT_DELAY% /nobreak >nul

:: Exponential backoff: double the delay, cap at MAX_DELAY
set /a CURRENT_DELAY=%CURRENT_DELAY%*2
if %CURRENT_DELAY% GTR %MAX_DELAY% set CURRENT_DELAY=%MAX_DELAY%

goto restart_loop
