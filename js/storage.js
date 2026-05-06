/* =========================================
   STORAGE - Gestion de la persistance
   ========================================= */

const DB_KEY = 'stokva_db_v1';

const DEFAULT_DB = {
  users: [
    {
      id: 1,
      username: 'admin',
      password: 'admin', // En production : hashé. Ici : démo locale.
      fullName: 'Administrateur',
      role: 'admin',
      email: '',
      phone: '',
      active: true,
      createdAt: new Date().toISOString()
    }
  ],
  depots: [
    { id: 1, code: 'DEP-001', name: 'Dépôt Principal', address: '', responsible: '', active: true }
  ],
  articles: [
    { id: 1, code: 'ART-001', name: 'Article exemple', unit: 'T', category: 'Matières premières', securityStock: 100, active: true, depotId: 1 }
  ],
  partners: [
    { id: 1, code: 'P-001', name: 'Fournisseur exemple', type: 'fournisseur', address: '', phone: '', email: '', ice: '', active: true }
  ],
  vehicles: [
    { id: 1, plate: 'XXXXXX', driver: 'Chauffeur exemple', phone: '', tareWeight: 0, active: true }
  ],
  receptions: [],
  expeditions: [],
  weighings: [],
  stockMovements: [],
  settings: {
    companyName: 'NETPROCESS',
    companyAddress: '',
    companyPhone: '',
    companyEmail: '',
    companyICE: '',
    companyLogo: '',
    currency: 'MAD',
    weighbridgeBrand: 'Manuel',
    weighbridgePort: '',
    weighbridgeAutomatic: false,
    receptionPrefix: 'BR',
    expeditionPrefix: 'BL',
    weighingPrefix: 'PB',
    documentVersion: '01',
    documentReference: 'EN 07-O04'
  },
  meta: {
    nextIds: {
      user: 2, depot: 2, article: 2, partner: 2, vehicle: 2,
      reception: 1, expedition: 1, weighing: 1, movement: 1
    },
    sequences: {
      reception: 1,
      expedition: 1,
      weighing: 1
    },
    version: 1
  }
};

const Storage = {
  db: null,

  init() {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      try {
        this.db = JSON.parse(raw);
        this._migrate();
      } catch (e) {
        console.error('DB corrupt, reinit:', e);
        this.db = JSON.parse(JSON.stringify(DEFAULT_DB));
        this.save();
      }
    } else {
      this.db = JSON.parse(JSON.stringify(DEFAULT_DB));
      this.save();
    }
    return this.db;
  },

  _migrate() {
    // Garantir que toutes les clés existent (pour upgrades)
    for (const key of Object.keys(DEFAULT_DB)) {
      if (this.db[key] === undefined) {
        this.db[key] = JSON.parse(JSON.stringify(DEFAULT_DB[key]));
      }
    }
    // S'assurer des sous-clés du meta
    if (!this.db.meta.nextIds) this.db.meta.nextIds = JSON.parse(JSON.stringify(DEFAULT_DB.meta.nextIds));
    if (!this.db.meta.sequences) this.db.meta.sequences = JSON.parse(JSON.stringify(DEFAULT_DB.meta.sequences));
    for (const k of Object.keys(DEFAULT_DB.meta.nextIds)) {
      if (this.db.meta.nextIds[k] === undefined) this.db.meta.nextIds[k] = DEFAULT_DB.meta.nextIds[k];
    }
    // settings : compléter clés manquantes
    for (const k of Object.keys(DEFAULT_DB.settings)) {
      if (this.db.settings[k] === undefined) this.db.settings[k] = DEFAULT_DB.settings[k];
    }
  },

  save() {
    localStorage.setItem(DB_KEY, JSON.stringify(this.db));
  },

  nextId(entity) {
    const id = this.db.meta.nextIds[entity];
    this.db.meta.nextIds[entity] = id + 1;
    return id;
  },

  nextSequence(entity) {
    const n = this.db.meta.sequences[entity] || 1;
    this.db.meta.sequences[entity] = n + 1;
    return n;
  },

  // CRUD générique
  list(entity) {
    return [...(this.db[entity] || [])];
  },

  get(entity, id) {
    return (this.db[entity] || []).find(x => x.id === id);
  },

  create(entity, data) {
    const item = { ...data, id: this.nextId(entity.replace(/s$/, '')), createdAt: new Date().toISOString() };
    this.db[entity].push(item);
    this.save();
    return item;
  },

  update(entity, id, data) {
    const idx = this.db[entity].findIndex(x => x.id === id);
    if (idx >= 0) {
      this.db[entity][idx] = { ...this.db[entity][idx], ...data, updatedAt: new Date().toISOString() };
      this.save();
      return this.db[entity][idx];
    }
    return null;
  },

  delete(entity, id) {
    this.db[entity] = this.db[entity].filter(x => x.id !== id);
    this.save();
  },

  // Settings helpers
  getSettings() {
    return { ...this.db.settings };
  },

  updateSettings(data) {
    this.db.settings = { ...this.db.settings, ...data };
    this.save();
    return this.db.settings;
  },

  // Export / Import complet (objet, pas string)
  exportAll() {
    return JSON.parse(JSON.stringify(this.db));
  },

  importAll(data) {
    try {
      // Accepter objet ou string JSON
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      this.db = parsed;
      this._migrate();
      this.save();
      return true;
    } catch (e) { return false; }
  },

  reset() {
    this.db = JSON.parse(JSON.stringify(DEFAULT_DB));
    this.save();
  },

  // Calcul stock par article et dépôt
  computeStock(articleId, depotId = null) {
    const movements = this.db.stockMovements.filter(m => 
      m.articleId === articleId && (depotId === null || depotId === '' || m.depotId === depotId)
    );
    let qty = 0;
    movements.forEach(m => {
      const q = parseFloat(m.quantity !== undefined ? m.quantity : m.qty) || 0;
      qty += (m.type === 'in' ? 1 : -1) * q;
    });
    return qty;
  },

  // Stock par dépôt pour tous les articles
  getStockSummary(depotId = null) {
    return this.db.articles.map(a => {
      const stock = this.computeStock(a.id, depotId);
      return {
        ...a,
        currentStock: stock,
        status: stock <= 0 ? 'rupture' : stock < a.securityStock ? 'alerte' : 'ok'
      };
    });
  }
};

// Export global
window.Storage = Storage;
