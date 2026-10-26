@echo off
title Discord Voice 24/7 Bot
color 0b

echo ========================================================
echo         STARTING DISCORD VOICE 24/7 BOT
echo ========================================================
echo.

if not exist .env (
    echo [WARNING] The .env file was not found!
    echo Copy .env.example to .env, then set your DISCORD_TOKEN and CLIENT_ID.
    echo.
    pause
    exit /b
)

if not exist node_modules (
    echo [INFO] The node_modules folder is missing. Running npm install...
    call npm install
    echo.
)

:loop
echo [%date% %time%] Starting the bot process...
node src/index.js
echo.
echo [WARNING] The bot process stopped or crashed!
echo Restarting automatically in 5 seconds... (Press Ctrl+C to cancel)
timeout /t 5 /nobreak >nul
goto loop
