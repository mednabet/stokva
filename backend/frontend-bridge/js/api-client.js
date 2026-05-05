/* ============================================================
 * STOKVA — Client API
 * by NETPROCESS
 * ============================================================
 * Wrapper fetch + JWT + refresh automatique + WebSocket.
 * Remplace le mécanisme localStorage de l'app v1.
 * ============================================================ */

(function (global) {
    'use strict';

    const STOKVA_API = {
        baseUrl: '',          // mis à jour par init()
        wsUrl: '',
        accessToken: null,
        refreshToken: null,
        user: null,
        ws: null,
        wsListeners: new Map(), // type -> Set<callback>
        wsReconnectTimer: null,
        _refreshPromise: null,
    };

    // ---------- Persistence (sessionStorage) ----------
    function saveSession() {
        try {
            sessionStorage.setItem('stokva_auth', JSON.stringify({
                accessToken: STOKVA_API.accessToken,
                refreshToken: STOKVA_API.refreshToken,
                user: STOKVA_API.user,
            }));
        } catch (e) { /* ignore */ }
    }

    function loadSession() {
        try {
            const raw = sessionStorage.getItem('stokva_auth');
            if (!raw) return;
            const data = JSON.parse(raw);
            STOKVA_API.accessToken = data.accessToken;
            STOKVA_API.refreshToken = data.refreshToken;
            STOKVA_API.user = data.user;
        } catch (e) { /* ignore */ }
    }

    function clearSession() {
        STOKVA_API.accessToken = null;
        STOKVA_API.refreshToken = null;
        STOKVA_API.user = null;
        try { sessionStorage.removeItem('stokva_auth'); } catch (e) {}
    }

    // ---------- Init ----------
    function init(baseUrl) {
        const url = baseUrl || (window.location.origin);
        STOKVA_API.baseUrl = url.replace(/\/+$/, '');
        STOKVA_API.wsUrl = STOKVA_API.baseUrl
            .replace(/^http:/, 'ws:')
            .replace(/^https:/, 'wss:') + '/ws';
        loadSession();
    }

    // ---------- Fetch wrapper ----------
    async function request(method, path, body) {
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json' },
        };
        if (STOKVA_API.accessToken) {
            opts.headers['Authorization'] = 'Bearer ' + STOKVA_API.accessToken;
        }
        if (body !== undefined) {
            opts.body = JSON.stringify(body);
        }

        let res = await fetch(STOKVA_API.baseUrl + path, opts);

        // Auto-refresh on 401
        if (res.status === 401 && STOKVA_API.refreshToken && path !== '/api/auth/refresh' && path !== '/api/auth/login') {
            const ok = await tryRefresh();
            if (ok) {
                opts.headers['Authorization'] = 'Bearer ' + STOKVA_API.accessToken;
                res = await fetch(STOKVA_API.baseUrl + path, opts);
            }
        }

        const ct = res.headers.get('content-type') || '';
        const isJson = ct.includes('application/json');
        const data = isJson ? await res.json() : await res.text();

        if (!res.ok) {
            const err = new Error((data && data.message) || ('HTTP ' + res.status));
            err.status = res.status;
            err.code = data && data.error;
            err.details = data && data.details;
            throw err;
        }
        return data;
    }

    async function tryRefresh() {
        if (STOKVA_API._refreshPromise) return STOKVA_API._refreshPromise;
        STOKVA_API._refreshPromise = (async () => {
            try {
                const res = await fetch(STOKVA_API.baseUrl + '/api/auth/refresh', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refreshToken: STOKVA_API.refreshToken }),
                });
                if (!res.ok) {
                    clearSession();
                    return false;
                }
                const data = await res.json();
                STOKVA_API.accessToken = data.accessToken;
                saveSession();
                return true;
            } catch (e) {
                clearSession();
                return false;
            } finally {
                STOKVA_API._refreshPromise = null;
            }
        })();
        return STOKVA_API._refreshPromise;
    }

    // ---------- Auth ----------
    async function login(username, password) {
        const data = await request('POST', '/api/auth/login', { username, password });
        STOKVA_API.accessToken = data.accessToken;
        STOKVA_API.refreshToken = data.refreshToken;
        STOKVA_API.user = data.user;
        saveSession();
        connectWS();
        return data.user;
    }

    async function logout() {
        try {
            await request('POST', '/api/auth/logout', { refreshToken: STOKVA_API.refreshToken });
        } catch (e) { /* ignore */ }
        disconnectWS();
        clearSession();
    }

    async function me() {
        return request('GET', '/api/auth/me');
    }

    async function changePassword(oldPassword, newPassword) {
        return request('POST', '/api/auth/change-password', { oldPassword, newPassword });
    }

    function isAuthenticated() {
        return !!STOKVA_API.accessToken;
    }

    function currentUser() {
        return STOKVA_API.user;
    }

    // ---------- WebSocket ----------
    function connectWS() {
        if (!STOKVA_API.accessToken) return;
        if (STOKVA_API.ws && STOKVA_API.ws.readyState === WebSocket.OPEN) return;

        const url = STOKVA_API.wsUrl + '?token=' + encodeURIComponent(STOKVA_API.accessToken);
        try {
            STOKVA_API.ws = new WebSocket(url);
        } catch (e) {
            console.warn('[WS] init failed', e);
            return;
        }

        STOKVA_API.ws.onopen = () => {
            console.log('[WS] connecté');
            emit('ws.connected', {});
        };
        STOKVA_API.ws.onmessage = (ev) => {
            try {
                const msg = JSON.parse(ev.data);
                emit(msg.type, msg.payload);
                emit('*', msg);
            } catch (e) { /* ignore */ }
        };
        STOKVA_API.ws.onclose = () => {
            console.log('[WS] déconnecté, reconnexion dans 3s');
            emit('ws.disconnected', {});
            if (STOKVA_API.wsReconnectTimer) clearTimeout(STOKVA_API.wsReconnectTimer);
            STOKVA_API.wsReconnectTimer = setTimeout(connectWS, 3000);
        };
        STOKVA_API.ws.onerror = (err) => {
            console.warn('[WS] error', err);
        };
    }

    function disconnectWS() {
        if (STOKVA_API.wsReconnectTimer) {
            clearTimeout(STOKVA_API.wsReconnectTimer);
            STOKVA_API.wsReconnectTimer = null;
        }
        if (STOKVA_API.ws) {
            try { STOKVA_API.ws.close(); } catch (e) {}
            STOKVA_API.ws = null;
        }
    }

    function on(eventType, callback) {
        if (!STOKVA_API.wsListeners.has(eventType)) {
            STOKVA_API.wsListeners.set(eventType, new Set());
        }
        STOKVA_API.wsListeners.get(eventType).add(callback);
        return () => off(eventType, callback);
    }

    function off(eventType, callback) {
        const set = STOKVA_API.wsListeners.get(eventType);
        if (set) set.delete(callback);
    }

    function emit(eventType, payload) {
        const set = STOKVA_API.wsListeners.get(eventType);
        if (set) {
            for (const cb of set) {
                try { cb(payload); } catch (e) { console.error(e); }
            }
        }
    }

    // ---------- Resource helpers ----------
    function makeResource(prefix) {
        return {
            list: (params) => {
                const qs = params ? '?' + new URLSearchParams(params).toString() : '';
                return request('GET', prefix + qs);
            },
            get: (id) => request('GET', prefix + '/' + id),
            create: (data) => request('POST', prefix, data),
            update: (id, data) => request('PUT', prefix + '/' + id, data),
            remove: (id) => request('DELETE', prefix + '/' + id),
        };
    }

    // ---------- Modules ----------
    const partners = makeResource('/api/partners');
    const articles = Object.assign(makeResource('/api/articles'), {
        stock: (id) => request('GET', `/api/articles/${id}/stock`),
        lowStock: () => request('GET', '/api/articles/alerts/low-stock'),
    });
    const depots = Object.assign(makeResource('/api/depots'), {
        stock: (id) => request('GET', `/api/depots/${id}/stock`),
    });
    const vehicles = Object.assign(makeResource('/api/vehicles'), {
        drivers: {
            list: (params) => {
                const qs = params ? '?' + new URLSearchParams(params).toString() : '';
                return request('GET', '/api/vehicles/drivers/list' + qs);
            },
            get: (id) => request('GET', '/api/vehicles/drivers/' + id),
            create: (data) => request('POST', '/api/vehicles/drivers', data),
            update: (id, data) => request('PUT', '/api/vehicles/drivers/' + id, data),
            remove: (id) => request('DELETE', '/api/vehicles/drivers/' + id),
        },
    });

    const receptions = Object.assign(makeResource('/api/receptions'), {
        confirm: (id) => request('POST', `/api/receptions/${id}/confirm`),
        cancel: (id) => request('POST', `/api/receptions/${id}/cancel`),
    });
    const expeditions = Object.assign(makeResource('/api/expeditions'), {
        confirm: (id) => request('POST', `/api/expeditions/${id}/confirm`),
        cancel: (id) => request('POST', `/api/expeditions/${id}/cancel`),
    });
    const transfers = Object.assign(makeResource('/api/transfers'), {
        send: (id) => request('POST', `/api/transfers/${id}/send`),
        receive: (id, lines) => request('POST', `/api/transfers/${id}/receive`, { lines }),
        cancel: (id) => request('POST', `/api/transfers/${id}/cancel`),
    });

    const weighbridge = {
        live: () => request('GET', '/api/weighbridge/live'),
        list: (params) => {
            const qs = params ? '?' + new URLSearchParams(params).toString() : '';
            return request('GET', '/api/weighbridge/weighings' + qs);
        },
        get: (id) => request('GET', '/api/weighbridge/weighings/' + id),
        firstPass: (data) => request('POST', '/api/weighbridge/weighings', data),
        secondPass: (id, tare_weight) => request('POST', `/api/weighbridge/weighings/${id}/second-pass`, { tare_weight }),
        single: (data) => request('POST', '/api/weighbridge/weighings/single', data),
        cancel: (id) => request('POST', `/api/weighbridge/weighings/${id}/cancel`),
    };

    const reports = {
        g0: (params) => {
            const qs = '?' + new URLSearchParams(params).toString();
            return request('GET', '/api/reports/g0' + qs);
        },
        g0DownloadUrl: (params) => {
            const qs = new URLSearchParams(params).toString();
            return STOKVA_API.baseUrl + '/api/reports/g0?' + qs +
                '&_token=' + encodeURIComponent(STOKVA_API.accessToken);
        },
        stats: (params) => {
            const qs = params ? '?' + new URLSearchParams(params).toString() : '';
            return request('GET', '/api/reports/stats' + qs);
        },
        dashboard: () => request('GET', '/api/reports/dashboard'),
    };

    const settings = {
        getCompany: () => request('GET', '/api/settings/company'),
        updateCompany: (data) => request('PUT', '/api/settings/company', data),
        listUsers: () => request('GET', '/api/settings/users'),
        createUser: (data) => request('POST', '/api/settings/users', data),
        updateUser: (id, data) => request('PUT', '/api/settings/users/' + id, data),
        deleteUser: (id) => request('DELETE', '/api/settings/users/' + id),
        audit: (limit) => request('GET', '/api/settings/audit?limit=' + (limit || 100)),
    };

    // Moteur de paramétrage à 3 niveaux + champs personnalisés
    const config = {
        // Settings
        listAll: () => request('GET', '/api/config/settings'),
        listForScope: (scope, scopeId) => request('GET',
            scope === 'company' ? '/api/config/settings/company'
                                : `/api/config/settings/${scope}/${scopeId}`),
        getEffective: (key, depotId, articleId) => {
            const qs = new URLSearchParams({ key });
            if (depotId) qs.set('depot_id', depotId);
            if (articleId) qs.set('article_id', articleId);
            return request('GET', '/api/config/settings/effective?' + qs.toString());
        },
        getEffectiveAll: (depotId, articleId) => {
            const qs = new URLSearchParams();
            if (depotId) qs.set('depot_id', depotId);
            if (articleId) qs.set('article_id', articleId);
            const q = qs.toString();
            return request('GET', '/api/config/settings/effective-all' + (q ? '?' + q : ''));
        },
        setSetting: (scope, scopeId, key, value, description) => {
            const path = scope === 'company' ? '/api/config/settings/company'
                                              : `/api/config/settings/${scope}/${scopeId}`;
            return request('PUT', path, { key, value, description });
        },
        unsetSetting: (scope, scopeId, key) => {
            const path = scope === 'company'
                ? `/api/config/settings/company/${key}`
                : `/api/config/settings/${scope}/${scopeId}/${key}`;
            return request('DELETE', path);
        },
        clearCache: () => request('POST', '/api/config/cache/clear'),

        // Custom fields
        listCustomFields: (entity) => {
            const qs = entity ? '?entity=' + entity : '';
            return request('GET', '/api/config/custom-fields' + qs);
        },
        getCustomFieldsByEntity: (entity) =>
            request('GET', '/api/config/custom-fields/by-entity/' + entity),
        createCustomField: (data) => request('POST', '/api/config/custom-fields', data),
        updateCustomField: (id, data) => request('PUT', '/api/config/custom-fields/' + id, data),
        deleteCustomField: (id) => request('DELETE', '/api/config/custom-fields/' + id),
    };

    // ---------- Public API ----------
    global.STOKVA = {
        init,
        request,
        // auth
        login,
        logout,
        me,
        changePassword,
        isAuthenticated,
        currentUser,
        // ws
        connectWS,
        disconnectWS,
        on,
        off,
        // modules
        partners,
        articles,
        depots,
        vehicles,
        receptions,
        expeditions,
        transfers,
        weighbridge,
        reports,
        settings,
        config,
    };

})(window);
