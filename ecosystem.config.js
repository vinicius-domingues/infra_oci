module.exports = {
  apps: [
    {
      name: "crud-latency-api",
      script: "./server.js",
      watch: true,
      ignore_watch: [
        "node_modules",
        "logs",
        "clients.db",
        "clients.db-journal",
        ".git"
      ],
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
