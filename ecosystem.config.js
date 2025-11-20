module.exports = {
  apps: [{
    name: 'altu-health-api',
    script: './src/server.js',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development',
      PORT: 3006
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3006
    }
  }]
};
