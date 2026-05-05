'use strict';

/**
 * WebSocket hub.
 *
 * Clients connect with: ws://host/ws?token=<JWT>
 * Server broadcasts events as JSON: { type, payload, at }
 *
 * Event types emitted by controllers (via broadcast()):
 *   - reception.created / reception.confirmed / reception.cancelled
 *   - expedition.created / expedition.confirmed / expedition.cancelled
 *   - transfer.created / transfer.in_transit / transfer.received / transfer.cancelled
 *   - weighing.first_pass / weighing.done
 *   - weighbridge.live (continuous live weight)
 */

const { WebSocketServer, WebSocket } = require('ws');
const url = require('url');
const config = require('../config');
const { verifyToken } = require('../middleware/auth');

let wss = null;
const clients = new Set(); // { ws, user }

function init(server) {
    wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (req, socket, head) => {
        if (!req.url.startsWith(config.ws.path)) {
            socket.destroy();
            return;
        }
        const { query } = url.parse(req.url, true);
        const token = query.token;
        if (!token) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }
        let user;
        try {
            const decoded = verifyToken(token);
            user = { id: decoded.sub, username: decoded.username, role: decoded.role };
        } catch {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }

        wss.handleUpgrade(req, socket, head, (ws) => {
            const entry = { ws, user };
            clients.add(entry);

            ws.send(JSON.stringify({
                type: 'connected',
                payload: { user: { username: user.username, role: user.role }, online: clients.size },
                at: new Date().toISOString(),
            }));

            // Broadcast presence
            broadcast('presence', { online: clients.size, joined: user.username }, ws);

            ws.on('close', () => {
                clients.delete(entry);
                broadcast('presence', { online: clients.size, left: user.username });
            });

            // Heartbeat
            ws.isAlive = true;
            ws.on('pong', () => { ws.isAlive = true; });

            ws.on('message', (raw) => {
                try {
                    const msg = JSON.parse(raw);
                    if (msg.type === 'ping') {
                        ws.send(JSON.stringify({ type: 'pong', at: new Date().toISOString() }));
                    }
                } catch {
                    // ignore malformed
                }
            });
        });
    });

    // Heartbeat sweeper
    setInterval(() => {
        for (const c of clients) {
            if (!c.ws.isAlive) {
                c.ws.terminate();
                clients.delete(c);
                continue;
            }
            c.ws.isAlive = false;
            try { c.ws.ping(); } catch { /* ignore */ }
        }
    }, 30000);

    console.log(`[WS] Hub initialized at ${config.ws.path}`);
    return wss;
}

/**
 * Broadcast an event to all connected clients (optionally excluding one).
 */
function broadcast(type, payload, excludeWs = null) {
    if (!wss) return;
    const msg = JSON.stringify({ type, payload, at: new Date().toISOString() });
    for (const c of clients) {
        if (c.ws === excludeWs) continue;
        if (c.ws.readyState === WebSocket.OPEN) {
            try { c.ws.send(msg); } catch { /* ignore */ }
        }
    }
}

function onlineCount() {
    return clients.size;
}

module.exports = { init, broadcast, onlineCount };
