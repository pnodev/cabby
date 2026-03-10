const path = require('path')

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

module.exports = {
  apps: [
    {
      // Application name as it appears in pm2
      name: requireEnv('APP_NAME'),

      // Directory where Cabby is deployed on the server
      cwd: requireEnv('DEPLOY_PATH'),

      // Use npm so the start command can evolve without changing this file
      interpreter: 'node',
      script: 'npm',
      args: 'run start',

      // Scale instances via environment variable if desired
      instances: parseInt(process.env.PM2_INSTANCES || '1', 10),
      exec_mode:
        parseInt(process.env.PM2_INSTANCES || '1', 10) > 1
          ? 'cluster'
          : process.env.PM2_EXEC_MODE || 'fork',

      autorestart: true,
      watch: false,
      merge_logs: true,
      instance_var: 'INSTANCE_ID',

      // Restart safeguards and memory limits
      max_memory_restart: process.env.PM2_MAX_MEMORY_RESTART || '512M',
      min_uptime: process.env.PM2_MIN_UPTIME || '10s',
      max_restarts: parseInt(process.env.PM2_MAX_RESTARTS || '10', 10),
      restart_delay: parseInt(process.env.PM2_RESTART_DELAY || '4000', 10),
      kill_timeout: parseInt(process.env.PM2_KILL_TIMEOUT || '5000', 10),
      listen_timeout: parseInt(process.env.PM2_LISTEN_TIMEOUT || '10000', 10),
      shutdown_with_message: true,

      env: {
        NODE_ENV: requireEnv('NODE_ENV'),

        // Network configuration for Cabby / Nitro
        PORT: requireEnv('PORT'),
        HOST: process.env.HOST || '0.0.0.0',

        // Storage and cache paths for Cabby
        FILE_STORAGE_PATH: requireEnv('FILE_STORAGE_PATH'),
        FILE_CACHE_PATH: requireEnv('FILE_CACHE_PATH'),

        // Reserved for future features (uncomment when used in Cabby)
        // DB_URL: requireEnv('DB_URL'),
        // REDIS_URL: requireEnv('REDIS_URL'),
      },
    },
  ],
}

