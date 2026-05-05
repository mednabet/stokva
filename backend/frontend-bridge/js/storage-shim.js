/* ============================================================
 * STOKVA — Shim de compatibilité localStorage → API
 * by NETPROCESS
 * ============================================================
 * L'ancienne app utilisait `stokva_db_v1` dans localStorage avec
 * une structure { partners: [...], articles: [...], ... }.
 * Ce shim expose un objet `DB` compatible qui charge / persiste
 * via l'API REST au lieu de localStorage.
 *
 * Usage : remplacez l'inclusion de l'ancien js/storage.js par
 *   <script src="js/api-client.js"></script>
 *   <script src="js/storage-shim.js"></script>
 *
 * Limitation : ce shim opère en mode "lazy load + cache mémoire".
 * Il convient pour migration progressive ; l'idéal reste de
 * réécrire les pages pour utiliser STOKVA.* directement.
 * ============================================================ */

(function (global) {
    'use strict';

    if (!global.STOKVA) {
        console.error('[Shim] api-client.js doit être chargé avant storage-shim.js');
        return;
    }

    const cache = {
        partners: null,
        articles: null,
        depots: null,
        vehicles: null,
        drivers: null,
        receptions: null,
        expeditions: null,
        transfers: null,
        weighings: null,
    };

    async function ensure(key, loader) {
        if (cache[key] === null) {
            const r = await loader();
            cache[key] = r.items || r;
        }
        return cache[key];
    }

    function invalidate(key) {
        cache[key] = null;
    }

    // Auto-invalidation via WS
    STOKVA.on('reception.created', () => invalidate('receptions'));
    STOKVA.on('reception.confirmed', () => { invalidate('receptions'); invalidate('articles'); invalidate('depots'); });
    STOKVA.on('reception.cancelled', () => { invalidate('receptions'); invalidate('articles'); });
    STOKVA.on('expedition.created', () => invalidate('expeditions'));
    STOKVA.on('expedition.confirmed', () => { invalidate('expeditions'); invalidate('articles'); });
    STOKVA.on('expedition.cancelled', () => { invalidate('expeditions'); invalidate('articles'); });
    STOKVA.on('transfer.created', () => invalidate('transfers'));
    STOKVA.on('transfer.in_transit', () => { invalidate('transfers'); invalidate('articles'); });
    STOKVA.on('transfer.received', () => { invalidate('transfers'); invalidate('articles'); });
    STOKVA.on('weighing.done', () => invalidate('weighings'));
    STOKVA.on('weighing.first_pass', () => invalidate('weighings'));

    const DB = {
        // ----- Lecture (async dans cette version) -----
        async getPartners() { return ensure('partners', () => STOKVA.partners.list({ limit: 500 })); },
        async getArticles() { return ensure('articles', () => STOKVA.articles.list({ limit: 500 })); },
        async getDepots() { return ensure('depots', () => STOKVA.depots.list({ limit: 100 })); },
        async getVehicles() { return ensure('vehicles', () => STOKVA.vehicles.list({ limit: 200 })); },
        async getDrivers() { return ensure('drivers', () => STOKVA.vehicles.drivers.list({ limit: 200 })); },
        async getReceptions(filters) {
            invalidate('receptions');
            return ensure('receptions', () => STOKVA.receptions.list(filters || { limit: 200 }));
        },
        async getExpeditions(filters) {
            invalidate('expeditions');
            return ensure('expeditions', () => STOKVA.expeditions.list(filters || { limit: 200 }));
        },
        async getTransfers(filters) {
            invalidate('transfers');
            return ensure('transfers', () => STOKVA.transfers.list(filters || { limit: 200 }));
        },
        async getWeighings(filters) {
            invalidate('weighings');
            return ensure('weighings', () => STOKVA.weighbridge.list(filters || { limit: 200 }));
        },

        // ----- Écriture -----
        async addPartner(data)    { invalidate('partners');    return STOKVA.partners.create(data); },
        async updatePartner(id, d){ invalidate('partners');    return STOKVA.partners.update(id, d); },
        async deletePartner(id)   { invalidate('partners');    return STOKVA.partners.remove(id); },

        async addArticle(data)    { invalidate('articles');    return STOKVA.articles.create(data); },
        async updateArticle(id,d) { invalidate('articles');    return STOKVA.articles.update(id, d); },
        async deleteArticle(id)   { invalidate('articles');    return STOKVA.articles.remove(id); },

        async addDepot(data)      { invalidate('depots');      return STOKVA.depots.create(data); },
        async updateDepot(id, d)  { invalidate('depots');      return STOKVA.depots.update(id, d); },
        async deleteDepot(id)     { invalidate('depots');      return STOKVA.depots.remove(id); },

        async addVehicle(data)    { invalidate('vehicles');    return STOKVA.vehicles.create(data); },
        async updateVehicle(id,d) { invalidate('vehicles');    return STOKVA.vehicles.update(id, d); },
        async deleteVehicle(id)   { invalidate('vehicles');    return STOKVA.vehicles.remove(id); },

        async addDriver(data)     { invalidate('drivers');     return STOKVA.vehicles.drivers.create(data); },
        async updateDriver(id, d) { invalidate('drivers');     return STOKVA.vehicles.drivers.update(id, d); },
        async deleteDriver(id)    { invalidate('drivers');     return STOKVA.vehicles.drivers.remove(id); },

        // Documents avec workflow état
        async addReception(data)         { invalidate('receptions'); return STOKVA.receptions.create(data); },
        async confirmReception(id)       { invalidate('receptions'); return STOKVA.receptions.confirm(id); },
        async cancelReception(id)        { invalidate('receptions'); return STOKVA.receptions.cancel(id); },

        async addExpedition(data)        { invalidate('expeditions'); return STOKVA.expeditions.create(data); },
        async confirmExpedition(id)      { invalidate('expeditions'); return STOKVA.expeditions.confirm(id); },
        async cancelExpedition(id)       { invalidate('expeditions'); return STOKVA.expeditions.cancel(id); },

        async addTransfer(data)          { invalidate('transfers'); return STOKVA.transfers.create(data); },
        async sendTransfer(id)           { invalidate('transfers'); return STOKVA.transfers.send(id); },
        async receiveTransfer(id, lines) { invalidate('transfers'); return STOKVA.transfers.receive(id, lines); },
        async cancelTransfer(id)         { invalidate('transfers'); return STOKVA.transfers.cancel(id); },

        // Pesées
        async addWeighing(data)          { invalidate('weighings'); return STOKVA.weighbridge.single(data); },
        async firstPassWeighing(data)    { invalidate('weighings'); return STOKVA.weighbridge.firstPass(data); },
        async secondPassWeighing(id, t)  { invalidate('weighings'); return STOKVA.weighbridge.secondPass(id, t); },
        async getLiveWeight()            { return STOKVA.weighbridge.live(); },

        // Stocks
        async getDepotStock(id)          { return STOKVA.depots.stock(id); },
        async getArticleStock(id)        { return STOKVA.articles.stock(id); },
        async getLowStockAlerts()        { return STOKVA.articles.lowStock(); },

        // Rapports
        async getDashboard()             { return STOKVA.reports.dashboard(); },
        async getG0(month, depotId)      {
            return STOKVA.reports.g0({ month, depot_id: depotId || '' });
        },

        // Utils
        invalidateAll() {
            for (const k of Object.keys(cache)) cache[k] = null;
        },
    };

    global.DB = DB;
})(window);
