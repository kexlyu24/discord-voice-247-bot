@echo off
title Discord Voice 24/7 Bot
color 0b

echo ========================================================
echo         MEMULAI DISCORD VOICE 24/7 NONSTOP BOT          
echo ========================================================
echo.

if not exist .env (
    echo [PERINGATAN] File .env tidak ditemukan!
    echo Silakan salin .env.example menjadi .env lalu isi DISCORD_TOKEN dan CLIENT_ID Anda.
    echo.
    pause
    exit /b
)

if not exist node_modules (
    echo [INFO] Folder node_modules belum ada. Menjalankan npm install...
    call npm install
    echo.
)

:loop
echo [%date% %time%] Memulai proses bot...
node src/index.js
echo.
echo [PERINGATAN] Proses bot terhenti atau crash!
echo Merestart otomatis dalam 5 detik... (Tekan Ctrl+C untuk membatalkan)
timeout /t 5 /nobreak >nul
goto loop
