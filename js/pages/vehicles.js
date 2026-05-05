// Vehicles management page
const VehiclesPage = {
  render() {
    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Véhicules & Chauffeurs</h1>
          <p class="page-subtitle">Parc de véhicules avec poids à vide</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary" onclick="VehiclesPage.exportExcel()">
            <i class="fa-solid fa-file-excel"></i> Excel
          </button>
          ${Auth.can('vehicles.create') || Auth.can('vehicles.edit') ? `
            <button class="btn btn-primary" onclick="VehiclesPage.openForm()">
              <i class="fa-solid fa-plus"></i> Nouveau véhicule
            </button>` : ''}
        </div>
      </div>
      <div class="card">
        <div class="card-body">
          <div class="form-group">
            <label class="form-label">Recherche</label>
            <input type="text" class="form-control" id="vehicleSearch" placeholder="Matricule, chauffeur, marque..." oninput="VehiclesPage.refresh()">
          </div>
        </div>
      </div>
      <div id="vehiclesTableContainer"></div>
    `;
  },

  init() {
    this.refresh();
  },

  refresh() {
    const search = (document.getElementById('vehicleSearch')?.value || '').toLowerCase();
    let vehicles = Storage.list('vehicles');
    if (search) vehicles = vehicles.filter(v =>
      (v.plate || '').toLowerCase().includes(search) ||
      (v.driver || '').toLowerCase().includes(search) ||
      (v.brand || '').toLowerCase().includes(search)
    );

    const html = Components.renderTable({
      columns: [
        { key: 'plate', label: 'Matricule' },
        { key: 'brand', label: 'Marque' },
        { key: 'model', label: 'Modèle' },
        { key: 'type', label: 'Type' },
        { key: 'tareWeight', label: 'Tare (kg)', render: r => Utils.formatNumber(r.tareWeight || 0) },
        { key: 'maxLoad', label: 'Charge max (kg)', render: r => Utils.formatNumber(r.maxLoad || 0) },
        { key: 'driver', label: 'Chauffeur' },
        { key: 'driverPhone', label: 'Téléphone' },
        { key: 'active', label: 'Actif', render: r => r.active ? '<span class="badge badge-success">Oui</span>' : '<span class="badge badge-secondary">Non</span>' },
      ],
      data: vehicles,
      actions: Auth.can('vehicles.create') || Auth.can('vehicles.edit') ? [
        { icon: 'fa-pen', title: 'Modifier', onClick: id => VehiclesPage.openForm(id) },
        { icon: 'fa-trash', title: 'Supprimer', onClick: id => VehiclesPage.delete(id), danger: true },
      ] : [],
      empty: 'Aucun véhicule',
    });
    document.getElementById('vehiclesTableContainer').innerHTML = html;
  },

  openForm(id = null) {
    const v = id ? Storage.get('vehicles', id) : { active: true, type: 'Camion' };
    Components.openModal({
      title: id ? 'Modifier véhicule' : 'Nouveau véhicule',
      body: `
        <form id="vehicleForm">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Matricule *</label>
              <input type="text" class="form-control" name="plate" value="${v.plate || ''}" required>
            </div>
            <div class="form-group">
              <label class="form-label">Type</label>
              <select class="form-control" name="type">
                ${['Camion', 'Semi-remorque', 'Benne', 'Citerne', 'Fourgon', 'Pick-up', 'Autre'].map(t =>
                  `<option value="${t}" ${v.type === t ? 'selected' : ''}>${t}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Marque</label>
              <input type="text" class="form-control" name="brand" value="${v.brand || ''}">
            </div>
            <div class="form-group">
              <label class="form-label">Modèle</label>
              <input type="text" class="form-control" name="model" value="${v.model || ''}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Poids à vide / Tare (kg)</label>
              <input type="number" step="1" class="form-control" name="tareWeight" value="${v.tareWeight || ''}">
            </div>
            <div class="form-group">
              <label class="form-label">Charge max (kg)</label>
              <input type="number" step="1" class="form-control" name="maxLoad" value="${v.maxLoad || ''}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Chauffeur</label>
              <input type="text" class="form-control" name="driver" value="${v.driver || ''}">
            </div>
            <div class="form-group">
              <label class="form-label">Téléphone chauffeur</label>
              <input type="text" class="form-control" name="driverPhone" value="${v.driverPhone || ''}">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Permis chauffeur</label>
            <input type="text" class="form-control" name="driverLicense" value="${v.driverLicense || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Notes</label>
            <textarea class="form-control" name="notes" rows="2">${v.notes || ''}</textarea>
          </div>
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" name="active" ${v.active ? 'checked' : ''}> Véhicule actif
            </label>
          </div>
        </form>
      `,
      onSave: () => {
        const data = Utils.formData('vehicleForm');
        data.active = !!data.active;
        data.tareWeight = parseFloat(data.tareWeight) || 0;
        data.maxLoad = parseFloat(data.maxLoad) || 0;
        if (id) Storage.update('vehicles', id, data);
        else Storage.create('vehicles', data);
        Utils.toast(id ? 'Véhicule modifié' : 'Véhicule créé', 'success');
        this.refresh();
      },
    });
  },

  delete(id) {
    Components.confirm('Supprimer ce véhicule ?', () => {
      Storage.delete('vehicles', id);
      Utils.toast('Véhicule supprimé', 'success');
      this.refresh();
    });
  },

  exportExcel() {
    const data = Storage.list('vehicles').map(v => ({
      'Matricule': v.plate,
      'Type': v.type || '',
      'Marque': v.brand || '',
      'Modèle': v.model || '',
      'Tare (kg)': v.tareWeight || 0,
      'Charge max (kg)': v.maxLoad || 0,
      'Chauffeur': v.driver || '',
      'Téléphone': v.driverPhone || '',
      'Actif': v.active ? 'Oui' : 'Non',
    }));
    Utils.exportExcel(data, `Vehicules_${Utils.today()}`, 'Véhicules');
  },
};
