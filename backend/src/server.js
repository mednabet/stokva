'use strict';

const http = require('http');
const app = require('./app');
const config = require('./config');
const wsHub = require('./websocket/hub');
const weighbridge = require('./modules/weighbridge/weighbridge.service');
const db = require('./db/pool');

const server = http.createServer(app);

// WebSocket
wsHub.init(server);

// Weighbridge live readings -> broadcast to WS
weighbridge.start();
weighbridge.on('weight', (data) => {
    wsHub.broadcast('weighbridge.live', data);
});

server.listen(config.port, config.host, () => {
    console.log(`
  ███████╗████████╗ ██████╗ ██╗  ██╗██╗   ██╗ █████╗
  ██╔════╝╚══██╔══╝██╔═══██╗██║ ██╔╝██║   ██║██╔══██╗
  ███████╗   ██║   ██║   ██║█████╔╝ ██║   ██║███████║
  ╚════██║   ██║   ██║   ██║██╔═██╗ ╚██╗ ██╔╝██╔══██║
  ███████║   ██║   ╚██████╔╝██║  ██╗ ╚████╔╝ ██║  ██║
  ╚══════╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝  ╚═══╝  ╚═╝  ╚═╝
  Backend by NETPROCESS — © 2026
`);
    console.log(`[HTTP] Listening on http://${config.host}:${config.port}  (${config.env})`);
    console.log(`[Docs] Swagger UI : http://${config.host}:${config.port}/api/docs`);
    console.log(`[WS]   ws://${config.host}:${config.port}${config.ws.path}?token=...`);
});

// Graceful shutdown
async function shutdown(signal) {
    console.log(`[Server] ${signal} received, shutting down...`);
    weighbridge.stop();
    server.close(async () => {
        await db.close();
        process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (err) => {
    console.error('[unhandledRejection]', err);
});
