/* =========================================
   APP - Contrôleur principal
   Aligné avec le HTML existant : login (loginUser/loginPass),
   sidebar statique avec data-page, fonctions globales toggleSidebar/logout/toggleTheme
   ========================================= */

const App = {
  currentPage: 'dashboard',

  pages: {
    dashboard:  { label: 'Tableau de bord', perm: 'dashboard.view' },
    reception:  { label: 'Réceptions',      perm: 'reception.view' },
    expedition: { label: 'Expéditions',     perm: 'expedition.view' },
    weighing:   { label: 'Pont-bascule',    perm: 'weighing.view' },
    stock:      { label: 'Stock & Articles',perm: 'stock.view' },
    depots:     { label: 'Dépôts',          adminOnly: true },
    partners:   { label: 'Partenaires',     perm: 'partners.view' },
    vehicles:   { label: 'Véhicules',       perm: 'vehicles.view' },
    reports:    { label: 'Rapports',        perm: 'reports.view' },
    users:      { label: 'Utilisateurs',    adminOnly: true },
    settings:   { label: 'Paramètres',      adminOnly: true },
  },

  pageInstance(key) {
    const map = {
      dashboard: 'DashboardPage',
      reception: 'ReceptionPage',
      expedition: 'ExpeditionPage',
      weighing: 'WeighingPage',
      stock: 'StockPage',
      depots: 'DepotsPage',
      partners: 'PartnersPage',
      vehicles: 'VehiclesPage',
      reports: 'ReportsPage',
      users: 'UsersPage',
      settings: 'SettingsPage',
    };
    return window[map[key]];
  },

  init() {
    Storage.init();
    Auth.init();
    this.applyTheme();
    this.bindLoginForm();
    this.bindNavigation();

    if (Auth.currentUser) {
      this.showApp();
    } else {
      this.showLogin();
    }
  },

  // ========== AUTH ==========

  bindLoginForm() {
    const form = document.getElementById('loginForm');
    if (!form) return;
    form.addEventListener('submit', e => {
      e.preventDefault();
      const u = document.getElementById('loginUser').value.trim();
      const p = document.getElementById('loginPass').value;
      const errEl = document.getElementById('loginError');
      const user = Auth.login(u, p);
      if (user) {
        Storage.update('users', user.id, { lastLogin: new Date().toISOString() });
        if (errEl) errEl.textContent = '';
        Utils.toast(`Bienvenue ${user.fullName}`, 'success');
        this.showApp();
      } else {
        if (errEl) errEl.textContent = 'Identifiants incorrects';
        document.getElementById('loginPass').value = '';
      }
    });
  },

  showLogin() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('app').classList.add('hidden');
  },

  showApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('app').classList.remove('hidden');
    this.applyPermissions();
    this.renderUserInfo();
    this.navigateTo(this.currentPage || 'dashboard');
  },

  // ========== PERMISSIONS UI ==========

  applyPermissions() {
    const isAdmin = Auth.isAdmin();
    // Cacher les éléments admin pour les non-admins
    document.querySelectorAll('[data-admin]').forEach(el => {
      el.style.display = isAdmin ? '' : 'none';
    });
    // Cacher les éléments dont la permission n'est pas accordée
    document.querySelectorAll('.nav-item[data-page]').forEach(el => {
      const key = el.dataset.page;
      const page = this.pages[key];
      if (!page) return;
      let visible = true;
      if (page.adminOnly) visible = isAdmin;
      else if (page.perm) visible = isAdmin || Auth.can(page.perm);
      if (!visible) el.style.display = 'none';
    });
  },

  renderUserInfo() {
    if (!Auth.currentUser) return;
    const u = Auth.currentUser;
    const initials = (u.fullName || u.username || '?')
      .split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase();
    const av = document.getElementById('userAvatar');
    const nm = document.getElementById('userName');
    const rl = document.getElementById('userRole');
    if (av) av.textContent = initials;
    if (nm) nm.textContent = u.fullName || u.username;
    if (rl) rl.textContent = Auth.getRoleLabel(u.role);
  },

  // ========== NAVIGATION ==========

  bindNavigation() {
    document.querySelectorAll('.nav-item[data-page]').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault();
        this.navigateTo(el.dataset.page);
      });
    });
  },

  navigateTo(pageKey) {
    const page = this.pages[pageKey];
    if (!page) return;

    // Vérification permission
    const isAdmin = Auth.isAdmin();
    let allowed = true;
    if (page.adminOnly) allowed = isAdmin;
    else if (page.perm) allowed = isAdmin || Auth.can(page.perm);
    if (!allowed) {
      Utils.toast('Accès refusé pour cette section', 'error');
      return;
    }

    this.currentPage = pageKey;

    // Active state
    document.querySelectorAll('.nav-item[data-page]').forEach(el => {
      el.classList.toggle('active', el.dataset.page === pageKey);
    });

    // Title
    const titleEl = document.getElementById('topbarTitle');
    if (titleEl) titleEl.textContent = page.label;

    // Render
    const main = document.getElementById('mainContent');
    if (!main) return;
    try {
      const inst = this.pageInstance(pageKey);
      if (!inst) throw new Error(`Module ${pageKey} non chargé`);
      main.innerHTML = inst.render();
      if (typeof inst.init === 'function') inst.init();
    } catch (err) {
      console.error('Erreur navigation:', err);
      main.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-triangle-exclamation" style="font-size:48px;color:var(--danger,#dc2626)"></i>
          <p>Erreur lors du chargement de la page</p>
          <p style="font-size:13px;color:var(--text-muted,#666);margin-top:8px">${Utils.escapeHtml(err.message)}</p>
        </div>`;
    }

    // Fermer sidebar mobile
    const sb = document.getElementById('sidebar');
    if (sb) sb.classList.remove('open');
  },

  // ========== THEME ==========

  applyTheme() {
    const theme = localStorage.getItem('stokva_theme') || 'light';
    document.documentElement.setAttribute('data-theme', theme);
    this.updateThemeIcon(theme);
  },

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('stokva_theme', next);
    this.updateThemeIcon(next);
  },

  updateThemeIcon(theme) {
    document.querySelectorAll('.topbar-actions .btn-icon i, .btn-icon i.fa-moon, .btn-icon i.fa-sun').forEach(icon => {
      if (icon.classList.contains('fa-moon') || icon.classList.contains('fa-sun')) {
        icon.classList.remove('fa-moon', 'fa-sun');
        icon.classList.add(theme === 'dark' ? 'fa-sun' : 'fa-moon');
      }
    });
  },

  // ========== SIDEBAR MOBILE ==========

  toggleSidebar() {
    const sb = document.getElementById('sidebar');
    if (sb) sb.classList.toggle('open');
  },

  // ========== LOGOUT ==========

  logout() {
    Utils.confirm('Vous déconnecter ?').then(ok => {
      if (ok) {
        Auth.logout();
        location.reload();
      }
    });
  },

  // Rafraîchir la page courante (utilisé par le bouton Actualiser du dashboard)
  refresh() {
    if (this.currentPage) this.navigateTo(this.currentPage);
  }
};

// Fonctions globales attendues par le HTML
window.toggleSidebar = () => App.toggleSidebar();
window.toggleTheme = () => App.toggleTheme();
window.logout = () => App.logout();

// Démarrage
document.addEventListener('DOMContentLoaded', () => App.init());
