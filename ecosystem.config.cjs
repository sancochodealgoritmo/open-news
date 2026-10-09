// PM2 · open-news (servidor web) + open-news-ciclo (ciclo diario de datos).
// Despliegue declarativo. El ciclo NO se ejecuta al desplegar: PM2 lo dispara
// con cron_restart una vez al día (03:00 UTC-4) y el script termina al acabar.
module.exports = {
  apps: [
    {
      name: "open-news",
      script: "src/index.js",
      cwd: "/home/admin/open-news",
      instances: 1,
      autorestart: true,
      max_memory_restart: "300M",
      env: { NODE_ENV: "production" },
    },
    {
      name: "open-news-ciclo",
      script: "scripts/ciclo.js",
      cwd: "/home/admin/open-news",
      instances: 1,
      autorestart: false,
      cron_restart: "0 3 * * *",
      env: { NODE_ENV: "production" },
    },
  ],
};
