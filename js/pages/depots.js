// Depots management page
const DepotsPage = {
  render() {
    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Dépôts</h1>
          <p class="page-subtitle">Gestion des dépôts de stockage</p>
        </div>
        <div class="page-actions">
          ${Auth.isAdmin() ? `
            <button class="btn btn-primary" onclick="DepotsPage.openForm()">
              <i class="fa-solid fa-plus"></i> Nouveau dépôt
            </button>` : ''}
        </div>
      </div>
      <div id="depotsTableContainer"></div>
    `;
  },

  init() {
    this.refresh();
  },

  refresh() {
    const depots = Storage.list('depots');
    const html = Components.renderTable({
      columns: [
        { key: 'code', label: 'Code' },
        { key: 'name', label: 'Nom' },
        { key: 'address', label: 'Adresse' },
        { key: 'manager', label: 'Responsable' },
        { key: 'capacity', label: 'Capacité', render: r => r.capacity ? Utils.formatNumber(r.capacity) + ' ' + (r.capacityUnit || 'T') : '—' },
        { key: 'active', label: 'Actif', render: r => r.active ? '<span class="badge badge-success">Oui</span>' : '<span class="badge badge-secondary">Non</span>' },
      ],
      data: depots,
      actions: Auth.isAdmin() ? [
        { icon: 'fa-pen', title: 'Modifier', onClick: id => DepotsPage.openForm(id) },
        { icon: 'fa-trash', title: 'Supprimer', onClick: id => DepotsPage.delete(id), danger: true },
      ] : [],
      empty: 'Aucun dépôt',
    });
    document.getElementById('depotsTableContainer').innerHTML = html;
  },

  openForm(id = null) {
    const d = id ? Storage.get('depots', id) : { active: true, capacityUnit: 'T' };
    Components.openModal({
      title: id ? 'Modifier dépôt' : 'Nouveau dépôt',
      body: `
        <form id="depotForm">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Code *</label>
              <input type="text" class="form-control" name="code" value="${d.code || ''}" required>
            </div>
            <div class="form-group">
              <label class="form-label">Nom *</label>
              <input type="text" class="form-control" name="name" value="${d.name || ''}" required>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Adresse</label>
            <input type="text" class="form-control" name="address" value="${d.address || ''}">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Responsable</label>
              <input type="text" class="form-control" name="manager" value="${d.manager || ''}">
            </div>
            <div class="form-group">
              <label class="form-label">Téléphone</label>
              <input type="text" class="form-control" name="phone" value="${d.phone || ''}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Capacité</label>
              <input type="number" step="0.01" class="form-control" name="capacity" value="${d.capacity || ''}">
            </div>
            <div class="form-group">
              <label class="form-label">Unité</label>
              <select class="form-control" name="capacityUnit">
                ${['T', 'KG', 'M3', 'L', 'U'].map(u => `<option value="${u}" ${d.capacityUnit === u ? 'selected' : ''}>${u}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Description</label>
            <textarea class="form-control" name="description" rows="2">${d.description || ''}</textarea>
          </div>
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" name="active" ${d.active ? 'checked' : ''}> Dépôt actif
            </label>
          </div>
        </form>
      `,
      onSave: () => {
        const data = Utils.formData('depotForm');
        data.active = !!data.active;
        data.capacity = parseFloat(data.capacity) || 0;
        if (id) Storage.update('depots', id, data);
        else Storage.create('depots', data);
        Utils.toast(id ? 'Dépôt modifié' : 'Dépôt créé', 'success');
        this.refresh();
      },
    });
  },

  delete(id) {
    Components.confirm('Supprimer ce dépôt ?', () => {
      Storage.delete('depots', id);
      Utils.toast('Dépôt supprimé', 'success');
      this.refresh();
    });
  },
};

// Export global pour app.js (les const top-level ne sont pas auto-attachees a window)
window.DepotsPage = DepotsPage;
