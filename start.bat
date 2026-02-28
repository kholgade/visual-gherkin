@echo off
setlocal enabledelayedexpansion
:: Start Visual Gherkin (production mode)
:: Reads PORT from .env; default: server=17771
:: UI is served by the Express server on PORT.

cd /d "%~dp0"

:: Auto-create .env from .env.example if missing
if not exist .env (
  if exist .env.example (
    copy .env.example .env >nul
    echo Created .env from .env.example
  )
)

:: Default port
set SERVER_PORT=17771

:: Load .env
if exist .env (
  for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    set "key=%%A"
    set "val=%%B"
    if not "!key:~0,1!"=="#" if not "!key!"=="" (
      set "!key!=!val!"
    )
  )
)

if defined PORT set SERVER_PORT=%PORT%

echo.
echo Building Visual Gherkin...
call npm run build
if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)

echo.
echo Starting server on http://localhost:%SERVER_PORT%
set PORT=%SERVER_PORT%
node dist\server\index.js
