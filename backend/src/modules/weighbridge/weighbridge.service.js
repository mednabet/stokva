'use strict';

/**
 * Weighbridge serial reader.
 *
 * Reads weight frames from a scale via RS232 / USB serial.
 *
 * Most industrial scales send ASCII frames at regular intervals. Common protocols:
 *   - Toledo continuous: STX <weight> <unit> <status> CR LF
 *   - Mettler MT-SICS: weight\r\n
 *   - Generic: just digits + decimal + "kg" / "T" + CR/LF
 *
 * This module exposes:
 *   - getCurrentWeight() : last read weight (number or null if stale)
 *   - on('weight', cb)   : subscribe to live updates
 *   - getStatus()        : { connected, port, lastReadAt }
 *
 * If WEIGHBRIDGE_ENABLED=false, runs a SIMULATOR producing random weights
 * so the front-end can be tested without hardware.
 */

const EventEmitter = require('events');
const config = require('../../config');

let SerialPort, ReadlineParser;
try {
    ({ SerialPort } = require('serialport'));
    ({ ReadlineParser } = require('@serialport/parser-readline'));
} catch (e) {
    // serialport not installed yet (dev environment) - simulator only.
}

const STALE_MS = 5000;

class Weighbridge extends EventEmitter {
    constructor() {
        super();
        this.port = null;
        this.parser = null;
        this.connected = false;
        this.lastWeight = null;
        this.lastReadAt = null;
        this.lastError = null;
    }

    /**
     * Parse one line from the scale.
     * Returns weight in kg (number) or null if not parseable.
     */
    static parseFrame(line) {
        if (!line) return null;
        // Strip non-printable, keep digits/sign/dot
        const cleaned = String(line).replace(/[^\d\-.+ a-zA-Z]/g, '').trim();
        const m = cleaned.match(/(-?\d+(?:\.\d+)?)/);
        if (!m) return null;
        let value = parseFloat(m[1]);
        if (Number.isNaN(value)) return null;
        // Detect unit and normalize to kg
        if (/T\b/i.test(cleaned) || /tonne/i.test(cleaned)) value *= 1000;
        else if (/g\b/i.test(cleaned) && !/kg/i.test(cleaned)) value /= 1000;
        return value;
    }

    start() {
        if (!config.weighbridge.enabled) {
            this._startSimulator();
            return;
        }
        if (!SerialPort) {
            console.warn('[Weighbridge] serialport package not available, falling back to simulator');
            this._startSimulator();
            return;
        }

        try {
            this.port = new SerialPort({
                path: config.weighbridge.port,
                baudRate: config.weighbridge.baudRate,
                parity: config.weighbridge.parity,
                dataBits: config.weighbridge.dataBits,
                stopBits: config.weighbridge.stopBits,
                autoOpen: false,
            });

            this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

            this.port.open((err) => {
                if (err) {
                    console.error('[Weighbridge] Open failed:', err.message);
                    this.lastError = err.message;
                    setTimeout(() => this.start(), 5000); // retry
                    return;
                }
                this.connected = true;
                console.log(`[Weighbridge] Connected on ${config.weighbridge.port}`);
            });

            this.port.on('error', (err) => {
                console.error('[Weighbridge] Port error:', err.message);
                this.lastError = err.message;
                this.connected = false;
            });

            this.port.on('close', () => {
                console.warn('[Weighbridge] Port closed, reconnecting in 5s');
                this.connected = false;
                setTimeout(() => this.start(), 5000);
            });

            this.parser.on('data', (line) => {
                const w = Weighbridge.parseFrame(line);
                if (w !== null) {
                    this.lastWeight = w;
                    this.lastReadAt = new Date();
                    this.emit('weight', { weight: w, at: this.lastReadAt, source: 'serial' });
                }
            });
        } catch (err) {
            console.error('[Weighbridge] Init error:', err.message);
            this.lastError = err.message;
            this._startSimulator();
        }
    }

    _startSimulator() {
        console.log('[Weighbridge] SIMULATOR mode');
        this.connected = true;
        let base = 5000;
        setInterval(() => {
            base += (Math.random() - 0.5) * 50;
            const w = Math.max(0, Math.round(base));
            this.lastWeight = w;
            this.lastReadAt = new Date();
            this.emit('weight', { weight: w, at: this.lastReadAt, source: 'simulator' });
        }, 500);
    }

    getCurrentWeight() {
        if (!this.lastReadAt) return null;
        if (Date.now() - this.lastReadAt.getTime() > STALE_MS) return null;
        return this.lastWeight;
    }

    getStatus() {
        return {
            enabled: config.weighbridge.enabled,
            connected: this.connected,
            port: config.weighbridge.port,
            baudRate: config.weighbridge.baudRate,
            lastWeight: this.lastWeight,
            lastReadAt: this.lastReadAt,
            stale: this.getCurrentWeight() === null,
            lastError: this.lastError,
        };
    }

    stop() {
        if (this.port && this.port.isOpen) this.port.close();
    }
}

const instance = new Weighbridge();
module.exports = instance;
module.exports.Weighbridge = Weighbridge;
