const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const {
  joinVoiceChannel,
  getVoiceConnection,
  entersState,
  createAudioPlayer,
  createAudioResource,
  StreamType,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  NoSubscriberBehavior,
} = require('@discordjs/voice');

/**
 * Readable stream yang mengirimkan Opus silence frame secara berkala.
 * Mengirim 1 frame (3 byte) setiap 20ms (~1.2 kbps).
 * Mencegah timeout port UDP pada NAT router / firewall tanpa menggunakan CPU tinggi.
 */
class SilenceStream extends Readable {
  constructor(options = {}) {
    super(options);
    this.interval = null;
    this.silenceFrame = Buffer.from([0xf8, 0xff, 0xfe]);
  }

  _read() {
    if (!this.interval) {
      this.interval = setInterval(() => {
        if (!this.push(this.silenceFrame)) {
          clearInterval(this.interval);
          this.interval = null;
        }
      }, 20);
    }
  }

  _destroy(err, cb) {
    clearInterval(this.interval);
    this.interval = null;
    if (typeof cb === 'function') cb(err);
  }
}

class VoiceManager {
  constructor(client) {
    this.client = client;
    this.connection = null;
    this.player = null;
    this.silenceStream = null;
    this.watchdogTimer = null;
    this.reconnectTimer = null;
    this.isReconnecting = false;
    this.connectedAt = null;
    this.settingsPath = path.join(__dirname, '..', '..', 'data', 'settings.json');
    this.settings = this.loadSettings();

    // Mulai watchdog monitoring setiap 30 detik
    this.startWatchdog();
  }

  /**
   * Membaca pengaturan dari data/settings.json dengan fallback ke .env
   */
  loadSettings() {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const raw = fs.readFileSync(this.settingsPath, 'utf8');
        const data = JSON.parse(raw);
        return {
          guildId: data.guildId || process.env.GUILD_ID || null,
          channelId: data.channelId || process.env.TARGET_CHANNEL_ID || null,
          stay247: typeof data.stay247 === 'boolean' ? data.stay247 : true,
          presence: data.presence || { text: 'NOIRÉL', type: 'watching' },
        };
      }
    } catch (err) {
      console.error('[VoiceManager] Gagal membaca settings.json:', err.message);
    }

    return {
      guildId: process.env.GUILD_ID || null,
      channelId: process.env.TARGET_CHANNEL_ID || null,
      stay247: true,
      presence: { text: 'NOIRÉL', type: 'watching' },
    };
  }

  /**
   * Menyimpan pengaturan ke data/settings.json
   */
  saveSettings(newSettings) {
    try {
      this.settings = { ...this.settings, ...newSettings };
      const dir = path.dirname(this.settingsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf8');
    } catch (err) {
      console.error('[VoiceManager] Gagal menyimpan settings.json:', err.message);
    }
  }

  /**
   * Bergabung ke voice channel dan mengaktifkan proteksi 24/7
   */
  async joinChannel(guildId, channelId, force = false) {
    if (!guildId || !channelId) {
      throw new Error('Guild ID dan Channel ID wajib diisi.');
    }

    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) {
      throw new Error(`Guild dengan ID ${guildId} tidak ditemukan.`);
    }

    const channel = guild.channels.cache.get(channelId);
    if (!channel || !channel.isVoiceBased()) {
      throw new Error(`Channel dengan ID ${channelId} bukan voice channel valid.`);
    }

    // Jika sudah terhubung ke channel yang sama dan status Ready, tidak perlu reconnect kecuali force
    const existing = getVoiceConnection(guildId);
    if (existing && !force && existing.state.status === VoiceConnectionStatus.Ready) {
      const myChannel = guild.members.me?.voice?.channelId;
      if (myChannel === channelId) {
        this.connection = existing;
        return this.connection;
      }
    }

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;

    console.log(`[VoiceManager] Menghubungkan ke voice channel: #${channel.name} (${channel.id})...`);

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: process.env.SELF_DEAF !== 'false',
      selfMute: process.env.SELF_MUTE === 'true',
    });

    this.connection = connection;
    this.saveSettings({ guildId: guild.id, channelId: channel.id, stay247: true });
    this.setupConnectionListeners(connection, guild.id, channel.id);

    return connection;
  }

  /**
   * Memasang listener status koneksi RTC
   */
  setupConnectionListeners(connection, guildId, channelId) {
    connection.removeAllListeners();

    connection.on(VoiceConnectionStatus.Ready, () => {
      console.log(`[VoiceManager] Berhasil terhubung ke Voice Channel! (Status: Ready)`);
      if (!this.connectedAt) {
        this.connectedAt = Date.now();
      }
      this.startKeepAlive(connection);
    });

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      console.warn(`[VoiceManager] Status koneksi: Disconnected. Mengecek kemungkinan auto-recovery Discord...`);
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5000),
        ]);
        console.log(`[VoiceManager] Berhasil pulih secara internal via Discord signalling.`);
      } catch (e) {
        console.warn(`[VoiceManager] Gagal pulih otomatis, koneksi terputus total. Merestart koneksi...`);
        this.cleanupConnection();
        if (this.settings.stay247) {
          this.scheduleReconnect(2000);
        }
      }
    });

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      console.log(`[VoiceManager] Koneksi di-destroy.`);
      this.cleanupConnection();
      if (this.settings.stay247) {
        this.scheduleReconnect(3000);
      }
    });

    connection.on('error', (error) => {
      console.error(`[VoiceManager] Error pada koneksi voice:`, error.message);
    });
  }

  /**
   * Menjalankan AudioPlayer pengirim silence frame terus-menerus (Keepalive NAT UDP)
   */
  startKeepAlive(connection) {
    try {
      this.stopKeepAlive();

      this.player = createAudioPlayer({
        behaviors: {
          noSubscriber: NoSubscriberBehavior.Play,
        },
      });

      this.silenceStream = new SilenceStream();
      const resource = createAudioResource(this.silenceStream, {
        inputType: StreamType.Opus,
      });

      this.player.play(resource);
      connection.subscribe(this.player);

      this.player.on('error', (err) => {
        console.warn(`[VoiceManager] Warning audio player keepalive: ${err.message}`);
      });

      console.log(`[VoiceManager] Silent keepalive aktif (UDP port anti-timeout running).`);
    } catch (err) {
      console.error(`[VoiceManager] Gagal memulai silent keepalive:`, err.message);
    }
  }

  /**
   * Menghentikan keepalive audio player
   */
  stopKeepAlive() {
    if (this.silenceStream) {
      try {
        this.silenceStream.destroy();
      } catch (_) {}
      this.silenceStream = null;
    }
    if (this.player) {
      try {
        this.player.stop(true);
      } catch (_) {}
      this.player = null;
    }
  }

  /**
   * Membersihkan referensi koneksi aktif
   */
  cleanupConnection() {
    this.connectedAt = null;
    this.stopKeepAlive();
    if (this.connection) {
      try {
        this.connection.destroy();
      } catch (_) {}
      this.connection = null;
    }
  }

  /**
   * Meninggalkan voice channel dan mematikan mode 24/7
   */
  leaveChannel(guildId) {
    this.saveSettings({ stay247: false, channelId: null });
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.cleanupConnection();
    const existing = getVoiceConnection(guildId || this.settings.guildId);
    if (existing) {
      try {
        existing.destroy();
      } catch (_) {}
    }
    console.log(`[VoiceManager] Meninggalkan voice channel dan menonaktifkan mode 24/7.`);
  }

  /**
   * Menjadwalkan rekoneksi dengan delay tertentu (debounce)
   */
  scheduleReconnect(delayMs = 2000) {
    if (!this.settings.stay247 || !this.settings.guildId || !this.settings.channelId) {
      return;
    }

    if (this.isReconnecting) return;

    clearTimeout(this.reconnectTimer);

    this.reconnectTimer = setTimeout(async () => {
      this.isReconnecting = true;
      try {
        console.log(`[VoiceManager] Auto-reconnecting ke guild ${this.settings.guildId}, channel ${this.settings.channelId}...`);
        await this.joinChannel(this.settings.guildId, this.settings.channelId, true);
      } catch (err) {
        console.error(`[VoiceManager] Gagal auto-reconnect:`, err.message);
      } finally {
        this.isReconnecting = false;
        this.reconnectTimer = null;
      }
    }, delayMs);
  }

  /**
   * Handler saat event voiceStateUpdate terjadi di server
   */
  handleVoiceStateUpdate(oldState, newState) {
    if (newState.member?.id !== this.client.user.id) return;
    if (!this.settings.stay247 || !this.settings.channelId) return;

    // Kasus 1: Bot di-disconnect / di-kick dari voice
    if (!newState.channelId) {
      console.warn(`[VoiceManager] Bot terputus/di-kick dari voice channel! Segera menyambung kembali...`);
      this.scheduleReconnect(1500);
      return;
    }

    // Kasus 2: Bot dipindahkan ke channel lain (misal channel AFK atau dipindah admin)
    if (newState.channelId !== this.settings.channelId) {
      console.warn(`[VoiceManager] Bot dipindahkan ke channel lain (${newState.channelId}). Mengembalikan ke channel tujuan 24/7 (${this.settings.channelId})...`);
      this.scheduleReconnect(1000);
    }
  }

  /**
   * Watchdog timer berkala (setiap 30 detik) untuk memastikan bot selalu ada di voice
   */
  startWatchdog() {
    clearInterval(this.watchdogTimer);

    this.watchdogTimer = setInterval(async () => {
      if (!this.settings.stay247 || !this.settings.guildId || !this.settings.channelId) {
        return;
      }

      const guild = this.client.guilds.cache.get(this.settings.guildId);
      if (!guild) return;

      const myVoice = guild.members.me?.voice;
      const inCorrectChannel = myVoice && myVoice.channelId === this.settings.channelId;
      const isConnectionReady = this.connection && this.connection.state.status === VoiceConnectionStatus.Ready;

      if (!inCorrectChannel || !isConnectionReady) {
        console.warn(`[Watchdog] Status voice tidak sinkron (inCorrectChannel: ${inCorrectChannel}, isConnectionReady: ${isConnectionReady}). Memulihkan...`);
        this.scheduleReconnect(1000);
      }
    }, 30000);
  }

  /**
   * Mendapatkan status lengkap bot untuk command /status
   */
  getStatus() {
    const guild = this.settings.guildId ? this.client.guilds.cache.get(this.settings.guildId) : null;
    const channel = guild && this.settings.channelId ? guild.channels.cache.get(this.settings.channelId) : null;
    const connectionStatus = this.connection ? this.connection.state.status : 'Disconnected';

    const uptimeSeconds = Math.floor(process.uptime());
    const days = Math.floor(uptimeSeconds / (3600 * 24));
    const hours = Math.floor((uptimeSeconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;
    const uptimeStr = `${days}h ${hours}j ${minutes}m ${seconds}d`;
    if (!this.connectedAt && this.connection && this.connection.state.status === VoiceConnectionStatus.Ready) {
      this.connectedAt = Date.now();
    }

    let voiceDurationStr = 'Tidak terhubung';
    if (this.connectedAt && this.connection && this.connection.state.status === VoiceConnectionStatus.Ready) {
      const diffSec = Math.max(0, Math.floor((Date.now() - this.connectedAt) / 1000));
      const vDays = Math.floor(diffSec / (3600 * 24));
      const vHours = Math.floor((diffSec % (3600 * 24)) / 3600);
      const vMinutes = Math.floor((diffSec % 3600) / 60);
      const vSeconds = diffSec % 60;
      voiceDurationStr = `${vDays}h ${vHours}j ${vMinutes}m ${vSeconds}d`;
    }


    return {
      guildName: guild ? guild.name : 'Belum diatur',
      guildId: this.settings.guildId,
      channelName: channel ? channel.name : 'Belum diatur',
      channelId: this.settings.channelId,
      stay247: this.settings.stay247,
      connectionStatus,
      wsPing: this.client.ws.ping,
      uptime: uptimeStr,
      connectedAt: this.connectedAt,
      voiceDuration: voiceDurationStr,
    };
  }
}

module.exports = { VoiceManager, SilenceStream };
