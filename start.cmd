@echo off
REM Start the Attention Hub on Windows.
REM
REM   start.cmd          production (the default: fast and quiet, and it builds
REM                      itself once if it has never been built)
REM   start.cmd dev      development mode, for working on the hub itself
REM
REM Everything else, including which address and port it listens on, comes from
REM hub.config.json. Nothing is configured in here.
setlocal
cd /d "%~dp0"

if not exist "node_modules" (
  echo [hub] Installing dependencies (first run only)...
  call npm install
  if errorlevel 1 exit /b 1
)

REM Next.js collects anonymous usage telemetry unless this is set. This hub
REM sends nothing, so it is off here as well as in scripts\next-run.mjs.
set NEXT_TELEMETRY_DISABLED=1

set MODE=%1
if "%MODE%"=="" set MODE=start

node scripts\serve.mjs %MODE%
exit /b %errorlevel%
