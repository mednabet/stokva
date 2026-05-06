// Users management page (admin only)
const UsersPage = {
  render() {
    if (!Auth.isAdmin()) {
      return `<div class="empty-state"><i class="fa-solid fa-lock"></i><p>Accès refusé. Cette page est réservée aux administrateurs.</p></div>`;
    }
    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Utilisateurs</h1>
          <p class="page-subtitle">Gestion des comptes et permissions</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" onclick="UsersPage.openForm()">
            <i class="fa-solid fa-plus"></i> Nouvel utilisateur
          </button>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3>Rôles et permissions</h3>
        </div>
        <div class="card-body">
          <div class="role-grid">
            <div class="role-card">
              <div class="role-icon role-admin"><i class="fa-solid fa-crown"></i></div>
              <h4>Administrateur</h4>
              <p>Accès complet : tous les modules + gestion utilisateurs et paramètres système.</p>
            </div>
            <div class="role-card">
              <div class="role-icon role-manager"><i class="fa-solid fa-user-tie"></i></div>
              <h4>Responsable</h4>
              <p>Accès aux opérations + rapports + gestion catalogue (articles, dépôts, partenaires).</p>
            </div>
            <div class="role-card">
              <div class="role-icon role-operator"><i class="fa-solid fa-user-gear"></i></div>
              <h4>Opérateur</h4>
              <p>Saisie des réceptions, expéditions et pesées. Pas d'accès au catalogue ni aux paramètres.</p>
            </div>
            <div class="role-card">
              <div class="role-icon role-viewer"><i class="fa-solid fa-eye"></i></div>
              <h4>Consultation</h4>
              <p>Lecture seule sur l'ensemble des données. Aucune modification possible.</p>
            </div>
          </div>
        </div>
      </div>

      <div id="usersTableContainer"></div>
    `;
  },

  init() {
    if (Auth.isAdmin()) this.refresh();
  },

  refresh() {
    const users = Storage.list('users');
    const html = Components.renderTable({
      columns: [
        { key: 'username', label: 'Identifiant' },
        { key: 'fullName', label: 'Nom complet' },
        { key: 'email', label: 'Email' },
        { key: 'role', label: 'Rôle', render: r => {
          const labels = { admin: 'Administrateur', manager: 'Responsable', operator: 'Opérateur', viewer: 'Consultation' };
          const colors = { admin: 'danger', manager: 'primary', operator: 'info', viewer: 'secondary' };
          return `<span class="badge badge-${colors[r.role] || 'secondary'}">${labels[r.role] || r.role}</span>`;
        }},
        { key: 'lastLogin', label: 'Dernière connexion', render: r => r.lastLogin ? Utils.formatDateTime(r.lastLogin) : '—' },
        { key: 'active', label: 'Actif', render: r => r.active ? '<span class="badge badge-success">Oui</span>' : '<span class="badge badge-secondary">Non</span>' },
      ],
      data: users,
      actions: [
        { icon: 'fa-pen', title: 'Modifier', onClick: id => UsersPage.openForm(id) },
        { icon: 'fa-key', title: 'Changer mot de passe', onClick: id => UsersPage.changePassword(id) },
        { icon: 'fa-trash', title: 'Supprimer', onClick: id => UsersPage.delete(id), danger: true },
      ],
      empty: 'Aucun utilisateur',
    });
    document.getElementById('usersTableContainer').innerHTML = html;
  },

  openForm(id = null) {
    const u = id ? Storage.get('users', id) : { active: true, role: 'operator' };
    Components.openModal({
      title: id ? 'Modifier utilisateur' : 'Nouvel utilisateur',
      body: `
        <form id="userForm">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Identifiant *</label>
              <input type="text" class="form-control" name="username" value="${u.username || ''}" ${id ? 'readonly' : 'required'}>
            </div>
            <div class="form-group">
              <label class="form-label">Rôle *</label>
              <select class="form-control" name="role" required>
                <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrateur</option>
                <option value="manager" ${u.role === 'manager' ? 'selected' : ''}>Responsable</option>
                <option value="operator" ${u.role === 'operator' ? 'selected' : ''}>Opérateur</option>
                <option value="viewer" ${u.role === 'viewer' ? 'selected' : ''}>Consultation</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Nom complet *</label>
            <input type="text" class="form-control" name="fullName" value="${u.fullName || ''}" required>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Email</label>
              <input type="email" class="form-control" name="email" value="${u.email || ''}">
            </div>
            <div class="form-group">
              <label class="form-label">Téléphone</label>
              <input type="text" class="form-control" name="phone" value="${u.phone || ''}">
            </div>
          </div>
          ${!id ? `
            <div class="form-group">
              <label class="form-label">Mot de passe *</label>
              <input type="password" class="form-control" name="password" required minlength="4">
            </div>` : ''}
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" name="active" ${u.active ? 'checked' : ''}> Compte actif
            </label>
          </div>
        </form>
      `,
      onSave: () => {
        const data = Utils.formData('userForm');
        data.active = !!data.active;
        if (id) {
          delete data.password;
          delete data.username;
          Storage.update('users', id, data);
        } else {
          const existing = Storage.list('users').find(x => x.username === data.username);
          if (existing) {
            Utils.toast('Cet identifiant existe déjà', 'error');
            return false;
          }
          Storage.create('users', data);
        }
        Utils.toast(id ? 'Utilisateur modifié' : 'Utilisateur créé', 'success');
        this.refresh();
      },
    });
  },

  changePassword(id) {
    const u = Storage.get('users', id);
    if (!u) return;
    Components.openModal({
      title: `Changer le mot de passe — ${u.username}`,
      body: `
        <form id="pwdForm">
          <div class="form-group">
            <label class="form-label">Nouveau mot de passe *</label>
            <input type="password" class="form-control" name="password" required minlength="4" autofocus>
          </div>
          <div class="form-group">
            <label class="form-label">Confirmation *</label>
            <input type="password" class="form-control" name="confirm" required minlength="4">
          </div>
        </form>
      `,
      onSave: () => {
        const d = Utils.formData('pwdForm');
        if (d.password !== d.confirm) {
          Utils.toast('Les mots de passe ne correspondent pas', 'error');
          return false;
        }
        Storage.update('users', id, { password: d.password });
        Utils.toast('Mot de passe modifié', 'success');
      },
    });
  },

  delete(id) {
    const u = Storage.get('users', id);
    if (!u) return;
    if (u.username === 'admin') {
      Utils.toast('Impossible de supprimer le compte admin principal', 'error');
      return;
    }
    if (Auth.currentUser && Auth.currentUser.id === id) {
      Utils.toast('Impossible de supprimer votre propre compte', 'error');
      return;
    }
    Components.confirm(`Supprimer l'utilisateur ${u.username} ?`, () => {
      Storage.delete('users', id);
      Utils.toast('Utilisateur supprimé', 'success');
      this.refresh();
    });
  },
};

// Export global pour app.js (les const top-level ne sont pas auto-attachees a window)
window.UsersPage = UsersPage;
