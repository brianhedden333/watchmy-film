// PM2 process for the watchmyfilm.online API on the droplet. Settings come from server/.env.
module.exports = {
  apps: [
    {
      name: "watchmyfilm",
      script: "src/index.js",
      cwd: "/var/www/watchmyfilm/server",
      max_memory_restart: "150M",
      env: { NODE_ENV: "production" },
    },
  ],
};
