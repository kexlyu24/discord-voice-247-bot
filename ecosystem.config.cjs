module.exports = {
  apps: [
    {
      name: 'discord-voice-247',
      script: 'src/index.js',
      watch: false,
      max_memory_restart: '300M',
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
