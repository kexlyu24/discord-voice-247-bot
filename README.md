# 🔊 Discord Voice 24/7 Nonstop Bot (Anti-Disconnect)

Bot Discord khusus untuk **standby di Voice Channel selama 24 jam nonstop** tanpa pernah disconnect, bahkan ketika voice channel dalam keadaan kosong atau tidak ada orang sama sekali.

Dibangun menggunakan **Node.js**, **Discord.js v14**, dan **@discordjs/voice** dengan dependensi pure WebAssembly/JavaScript (`libsodium-wrappers` & `opusscript`), sehingga **tidak memerlukan compiler C++ (Visual Studio / node-gyp) maupun instalasi FFmpeg**.

---

## ✨ Fitur Utama

- 🛡️ **24/7 Nonstop Anti-Disconnect**: Bot tetap berada di voice channel selamanya meskipun tidak ada orang yang berbicara atau channel kosong.
- 🔁 **Triple Layer Auto-Reconnect**:
  1. **Discord RTC Recovery**: Mendeteksi migrasi server Discord atau perpindahan rute RTC via WebSocket signalling.
  2. **Event Guard (`voiceStateUpdate`)**: Jika bot di-kick atau dipindahkan paksa ke AFK channel, bot otomatis menyambung kembali ke channel target dalam hitungan detik.
  3. **Watchdog Timer (30 Detik)**: Memeriksa integritas koneksi setiap 30 detik. Jika koneksi terputus secara diam-diam (silent drop), watchdog akan langsung memulihkannya.
- 📡 **NAT UDP Keepalive (Anti-Stall)**:
  - Mengirim stream Opus silence frame (`0xF8, 0xFF, 0xFE`) berkecepatan rendah (~1.2 kbps) secara konstan.
  - Menjaga state UDP pada router rumah, ISP, atau firewall agar port UDP tidak di-timeout / di-freeze, tanpa membebani CPU (penggunaan CPU < 0.1%).
- 💾 **State Persistence (`data/settings.json`)**:
  - Menyimpan ID channel dan status 24/7 secara otomatis.
  - Saat bot atau komputer/VPS direstart, bot akan **langsung join kembali** ke voice channel target tanpa perlu mengetik perintah ulang.
- ⚡ **Modern Slash Commands**:
  - `/join [channel]` — Menghubungkan bot ke voice channel dan mengaktifkan mode 24/7.
  - `/leave` — Memutuskan bot dari voice channel dan menonaktifkan mode 24/7.
  - `/stay <aktif: true|false>` — Mengaktifkan/menonaktifkan auto-reconnect 24/7.
  - `/status` — Melihat status real-time, ping, uptime, dan kondisi koneksi RTC.
- 🔄 **Windows Auto-Restart Script (`start.bat`)**: Loop otomatis yang merestart bot jika terjadi crash atau internet putus.

---

## 📋 Prasyarat

- **Node.js** versi 18 ke atas (Direkomendasikan Node.js v20 atau v24).
- Akun Discord dan Server Discord tempat Anda memiliki izin Administrator / Kelola Server.

---

## 🚀 Langkah Instalasi & Pengaturan

### 1. Buat Bot di Discord Developer Portal
1. Buka [Discord Developer Portal](https://discord.com/developers/applications).
2. Klik tombol **New Application**, beri nama (misalnya: `Voice 24/7 Bot`), lalu klik **Create**.
3. Masuk ke menu **Bot** di bilah sisi kiri:
   - Klik **Reset Token** untuk mendapatkan token bot. Simpan token ini (jangan bagikan kepada siapa pun).
   - Scroll ke bawah ke bagian **Privileged Gateway Intents**. *(Catatan: Bot ini **TIDAK** memerlukan privileged intents karena hanya memakai slash command dan voice state, jadi Anda bisa membiarkannya default).*
4. Masuk ke menu **OAuth2** -> **General**:
   - Salin **Application ID** / **Client ID**.

### 2. Undang Bot ke Server Discord Anda
1. Masuk ke menu **OAuth2** -> **URL Generator** di Developer Portal.
2. Pada bagian **Scopes**, centang:
   - `bot`
   - `applications.commands`
3. Pada bagian **Bot Permissions**, centang:
   - `View Channels`
   - `Connect`
   - `Speak`
   - `Send Messages`
   - `Embed Links`
4. Salin URL yang dihasilkan di bagian bawah, buka di browser Anda, lalu pilih server Discord Anda untuk mengundang bot.

---

### 3. Konfigurasi Environment (`.env`)
1. Di folder proyek ini, buat salinan dari file `.env.example` dan ubah namanya menjadi `.env`:
   - Di Windows PowerShell / CMD:
     ```bash
     copy .env.example .env
     ```
2. Buka file `.env` dengan text editor (Notepad, VS Code, dll), lalu isi data bot Anda:
   ```env
   # Token Bot Discord dari Developer Portal
   DISCORD_TOKEN=MASUKKAN_TOKEN_BOT_ANDA_DISINI

   # Client ID / Application ID Bot
   CLIENT_ID=MASUKKAN_CLIENT_ID_ANDA_DISINI

   # Opsional: Masukkan Server ID (Guild ID) jika ingin slash command langsung muncul tanpa delay
   GUILD_ID=

   # Opsional: Masukkan Voice Channel ID jika ingin bot otomatis join saat pertama kali dinyalakan
   TARGET_CHANNEL_ID=

   # Opsi Tambahan (Default sudah optimal)
   SELF_DEAF=true
   SELF_MUTE=true
   ```

> **Tips Mendapatkan ID di Discord**: Aktifkan **Developer Mode** di Discord (*Settings -> Advanced -> Developer Mode*). Klik kanan pada Server untuk salin Guild ID, atau klik kanan pada Voice Channel untuk salin Channel ID.

---

### 4. Instalasi Dependensi
Jalankan perintah berikut di terminal / Command Prompt pada folder ini:
```bash
npm install
```

---

### 5. Daftarkan Slash Commands ke Discord
Jalankan perintah ini satu kali untuk mendaftarkan perintah `/join`, `/leave`, `/stay`, dan `/status`:
```bash
npm run deploy
```
*(Jika `GUILD_ID` di file `.env` diisi, perintah akan muncul secara instan di server tersebut. Jika dikosongkan, perintah didaftarkan secara Global dan memerlukan waktu 1-5 menit untuk terpropagasi).*

---

### 6. Menjalankan Bot

#### Opsi A: Menggunakan `start.bat` (Sangat Direkomendasikan untuk Windows)
Cukup klik ganda file **`start.bat`**. 
Script ini memiliki fitur **auto-restart loop**: jika koneksi internet terputus atau bot terhenti, script akan otomatis merestart bot dalam 5 detik.

#### Opsi B: Menggunakan Terminal Biasa
```bash
npm start
```

#### Opsi C: Menggunakan PM2 (Untuk VPS / Background Service)
```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

---

## 🎮 Penggunaan Slash Commands

| Perintah | Deskripsi |
|---|---|
| `/join [channel]` | Memerintahkan bot untuk masuk ke voice channel yang dipilih (atau channel Anda saat ini) dan mengunci channel tersebut sebagai target 24/7. |
| `/leave` | Mengeluarkan bot dari voice channel dan menonaktifkan mode auto-reconnect 24/7. |
| `/stay <aktif>` | Mengaktifkan (`True`) atau menonaktifkan (`False`) fitur 24/7 tanpa keluar channel. |
| `/status` | Menampilkan dashboard status bot (Channel target, Uptime, Ping, Status RTC, dan status proteksi). |

---

## ❓ FAQ & Troubleshooting

1. **Apakah bot akan terputus jika tidak ada orang di voice channel?**
   - **TIDAK.** Bot ini memiliki sistem *Silent Keepalive* yang mengirim Opus silence packet secara kontinu, sehingga Discord Voice Server menganggap bot tetap aktif melakukan transmisi dan tidak akan pernah memutuskan koneksi.
2. **Apa yang terjadi jika bot di-kick oleh admin atau koneksi internet mati sebentar?**
   - Bot memiliki pendeteksi event `voiceStateUpdate` dan watchdog 30 detik. Segera setelah internet kembali atau setelah bot terputus, bot akan secara otomatis masuk kembali ke voice channel yang tersimpan di `data/settings.json`.
3. **Apakah bot memakan banyak bandwidth atau kuota?**
   - Sangat hemat! Bot disetel `selfDeaf: true` (sehingga Discord tidak mengirim data audio pengguna lain ke bot) dan keepalive hanya memakai ~1.2 kbps bandwidth Opus silence.
4. **Apakah memerlukan FFmpeg?**
   - **Tidak.** Bot ini murni untuk standby 24/7 dan menggunakan codec Opus internal pure JavaScript/Wasm (`opusscript`), sehingga tidak memerlukan file binary FFmpeg tambahan.
