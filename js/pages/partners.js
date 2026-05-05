// Partners management page (fournisseurs/clients)
const PartnersPage = {
  render() {
    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Partenaires</h1>
          <p class="page-subtitle">Fournisseurs, clients et destinations</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary" onclick="PartnersPage.exportExcel()">
            <i class="fa-solid fa-file-excel"></i> Excel
          </button>
          ${Auth.can('partners.create') || Auth.can('partners.edit') ? `
            <button class="btn btn-primary" onclick="PartnersPage.openForm()">
              <i class="fa-solid fa-plus"></i> Nouveau partenaire
            </button>` : ''}
        </div>
      </div>
      <div class="card">
        <div class="card-body">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Type</label>
              <select class="form-control" id="partnerFilterType" onchange="PartnersPage.refresh()">
                <option value="">— Tous —</option>
                <option value="fournisseur">Fournisseur</option>
                <option value="client">Client</option>
                <option value="mixte">Mixte</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Recherche</label>
              <input type="text" class="form-control" id="partnerSearch" placeholder="Nom, code, ville..." oninput="PartnersPage.refresh()">
            </div>
          </div>
        </div>
      </div>
      <div id="partnersTableContainer"></div>
    `;
  },

  init() {
    this.refresh();
  },

  refresh() {
    const filterType = document.getElementById('partnerFilterType')?.value;
    const search = (document.getElementById('partnerSearch')?.value || '').toLowerCase();
    let partners = Storage.list('partners');
    if (filterType) partners = partners.filter(p => p.type === filterType || p.type === 'mixte');
    if (search) partners = partners.filter(p =>
      (p.name || '').toLowerCase().includes(search) ||
      (p.code || '').toLowerCase().includes(search) ||
      (p.city || '').toLowerCase().includes(search)
    );

    const html = Components.renderTable({
      columns: [
        { key: 'code', label: 'Code' },
        { key: 'name', label: 'Nom' },
        { key: 'type', label: 'Type', render: r => {
          const labels = { fournisseur: 'Fournisseur', client: 'Client', mixte: 'Mixte' };
          const colors = { fournisseur: 'info', client: 'primary', mixte: 'success' };
          return `<span class="badge badge-${colors[r.type] || 'secondary'}">${labels[r.type] || r.type}</span>`;
        }},
        { key: 'phone', label: 'Téléphone' },
        { key: 'city', label: 'Ville' },
        { key: 'ice', label: 'ICE' },
        { key: 'active', label: 'Actif', render: r => r.active ? '<span class="badge badge-success">Oui</span>' : '<span class="badge badge-secondary">Non</span>' },
      ],
      data: partners,
      actions: Auth.can('partners.create') || Auth.can('partners.edit') ? [
        { icon: 'fa-pen', title: 'Modifier', onClick: id => PartnersPage.openForm(id) },
        { icon: 'fa-trash', title: 'Supprimer', onClick: id => PartnersPage.delete(id), danger: true },
      ] : [],
      empty: 'Aucun partenaire',
    });
    document.getElementById('partnersTableContainer').innerHTML = html;
  },

  openForm(id = null) {
    const p = id ? Storage.get('partners', id) : { active: true, type: 'fournisseur' };
    Components.openModal({
      title: id ? 'Modifier partenaire' : 'Nouveau partenaire',
      body: `
        <form id="partnerForm">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Code *</label>
              <input type="text" class="form-control" name="code" value="${p.code || ''}" required>
            </div>
            <div class="form-group">
              <label class="form-label">Type *</label>
              <select class="form-control" name="type" required>
                <option value="fournisseur" ${p.type === 'fournisseur' ? 'selected' : ''}>Fournisseur</option>
                <option value="client" ${p.type === 'client' ? 'selected' : ''}>Client</option>
                <option value="mixte" ${p.type === 'mixte' ? 'selected' : ''}>Mixte</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Nom / Raison sociale *</label>
            <input type="text" class="form-control" name="name" value="${p.name || ''}" required>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Téléphone</label>
              <input type="text" class="form-control" name="phone" value="${p.phone || ''}">
            </div>
            <div class="form-group">
              <label class="form-label">Email</label>
              <input type="email" class="form-control" name="email" value="${p.email || ''}">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Adresse</label>
            <input type="text" class="form-control" name="address" value="${p.address || ''}">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Ville</label>
              <input type="text" class="form-control" name="city" value="${p.city || ''}">
            </div>
            <div class="form-group">
              <label class="form-label">Pays</label>
              <input type="text" class="form-control" name="country" value="${p.country || 'Maroc'}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">ICE</label>
              <input type="text" class="form-control" name="ice" value="${p.ice || ''}">
            </div>
            <div class="form-group">
              <label class="form-label">RC</label>
              <input type="text" class="form-control" name="rc" value="${p.rc || ''}">
            </div>
            <div class="form-group">
              <label class="form-label">IF</label>
              <input type="text" class="form-control" name="taxId" value="${p.taxId || ''}">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Notes</label>
            <textarea class="form-control" name="notes" rows="2">${p.notes || ''}</textarea>
          </div>
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" name="active" ${p.active ? 'checked' : ''}> Partenaire actif
            </label>
          </div>
        </form>
      `,
      onSave: () => {
        const data = Utils.formData('partnerForm');
        data.active = !!data.active;
        if (id) Storage.update('partners', id, data);
        else Storage.create('partners', data);
        Utils.toast(id ? 'Partenaire modifié' : 'Partenaire créé', 'success');
        this.refresh();
      },
    });
  },

  delete(id) {
    Components.confirm('Supprimer ce partenaire ?', () => {
      Storage.delete('partners', id);
      Utils.toast('Partenaire supprimé', 'success');
      this.refresh();
    });
  },

  exportExcel() {
    const data = Storage.list('partners').map(p => ({
      'Code': p.code,
      'Nom': p.name,
      'Type': p.type,
      'Téléphone': p.phone || '',
      'Email': p.email || '',
      'Ville': p.city || '',
      'ICE': p.ice || '',
      'Actif': p.active ? 'Oui' : 'Non',
    }));
    Utils.exportExcel(data, `Partenaires_${Utils.today()}`, 'Partenaires');
  },
};
