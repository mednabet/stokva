/* =========================================
   AUTH - Authentification & Permissions
   ========================================= */

const SESSION_KEY = 'stokva_session';

const ROLES = {
  admin: {
    label: 'Administrateur',
    permissions: ['*']  // tout autorisé
  },
  manager: {
    label: 'Responsable Dépôt',
    permissions: [
      'reception.view', 'reception.create', 'reception.edit', 'reception.delete',
      'expedition.view', 'expedition.create', 'expedition.edit', 'expedition.delete',
      'weighing.view', 'weighing.create', 'weighing.edit',
      'stock.view', 'stock.edit',
      'depots.view',
      'partners.view', 'partners.create', 'partners.edit',
      'vehicles.view', 'vehicles.create', 'vehicles.edit',
      'reports.view', 'reports.export',
      'dashboard.view'
    ]
  },
  operator: {
    label: 'Opérateur',
    permissions: [
      'reception.view', 'reception.create',
      'expedition.view', 'expedition.create',
      'weighing.view', 'weighing.create',
      'stock.view',
      'partners.view',
      'vehicles.view',
      'dashboard.view'
    ]
  },
  viewer: {
    label: 'Consultation',
    permissions: [
      'reception.view', 'expedition.view', 'weighing.view',
      'stock.view', 'partners.view', 'vehicles.view',
      'reports.view', 'dashboard.view'
    ]
  }
};

const Auth = {
  currentUser: null,

  init() {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      try {
        this.currentUser = JSON.parse(raw);
        // Vérifier que l'utilisateur existe encore et est actif
        const user = Storage.db.users.find(u => u.id === this.currentUser.id && u.active);
        if (!user) {
          this.logout();
        }
      } catch (e) { this.logout(); }
    }
    return this.currentUser;
  },

  login(username, password) {
    const user = Storage.db.users.find(u =>
      u.username.toLowerCase() === username.toLowerCase() &&
      u.password === password &&
      u.active
    );
    if (!user) return null;
    this.currentUser = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      email: user.email
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(this.currentUser));
    return this.currentUser;
  },

  logout() {
    this.currentUser = null;
    sessionStorage.removeItem(SESSION_KEY);
  },

  can(permission) {
    if (!this.currentUser) return false;
    const role = ROLES[this.currentUser.role];
    if (!role) return false;
    if (role.permissions.includes('*')) return true;
    return role.permissions.includes(permission);
  },

  isAdmin() {
    return this.currentUser && this.currentUser.role === 'admin';
  },

  getRoleLabel(role) {
    return (ROLES[role] || { label: role }).label;
  }
};
