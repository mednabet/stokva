/* =========================================
   PAGE RÉCEPTIONS
   ========================================= */

const ReceptionPage = {

  state: {
    search: '',
    depotFilter: 'all',
    dateFrom: '',
    dateTo: ''
  },

  render() {
    const canCreate = Auth.can('reception.create');
    const depots = Storage.list('depots').filter(d => d.active);

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Réceptions</h1>
          <p class="page-subtitle">Gestion des bons de réception (entrées de stock)</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary" id="btnExportRecExcel"><i class="fas fa-file-excel"></i> Excel</button>
          <button class="btn btn-secondary" id="btnExportRecPdf"><i class="fas fa-file-pdf"></i> PDF</button>
          ${canCreate ? '<button class="btn btn-primary" id="btnNewReception"><i class="fas fa-plus"></i> Nouvelle réception</button>' : ''}
        </div>
      </div>

      <div class="table-wrapper">
        ${Components.renderToolbar({
          searchPlaceholder: 'Rechercher (n°, fournisseur, chauffeur...)',
          filters: [
            { id: 'depotFilter', type: 'select', options: [{ value: 'all', label: 'Tous les dépôts' }, ...depots.map(d => ({ value: d.id, label: d.name }))] },
            { id: 'dateFrom', type: 'date' },
            { id: 'dateTo', type: 'date' }
          ]
        })}
        <div id="receptionTableBody"></div>
      </div>
    `;
  },

  init() {
    this._renderTable();
    document.getElementById('searchInput')?.addEventListener('input', Utils.debounce((e) => {
      this.state.search = e.target.value;
      this._renderTable();
    }));
    document.getElementById('depotFilter')?.addEventListener('change', (e) => {
      this.state.depotFilter = e.target.value;
      this._renderTable();
    });
    document.getElementById('dateFrom')?.addEventListener('change', (e) => {
      this.state.dateFrom = e.target.value;
      this._renderTable();
    });
    document.getElementById('dateTo')?.addEventListener('change', (e) => {
      this.state.dateTo = e.target.value;
      this._renderTable();
    });
    document.getElementById('btnNewReception')?.addEventListener('click', () => this.openForm());
    document.getElementById('btnExportRecExcel')?.addEventListener('click', () => this.exportExcel());
    document.getElementById('btnExportRecPdf')?.addEventListener('click', () => this.exportPdf());
  },

  _filteredList() {
    let list = Storage.list('receptions').sort((a, b) => 
      new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime()
    );
    if (this.state.depotFilter !== 'all') {
      list = list.filter(r => r.depotId == this.state.depotFilter);
    }
    list = Utils.filterByDateRange(list, 'date', this.state.dateFrom, this.state.dateTo);
    if (this.state.search) {
      const q = this.state.search.toLowerCase();
      list = list.filter(r => {
        const partner = Storage.get('partners', r.partnerId);
        return (r.docNumber || '').toLowerCase().includes(q) ||
          (r.driver || '').toLowerCase().includes(q) ||
          (r.plate || '').toLowerCase().includes(q) ||
          (r.refDoc || '').toLowerCase().includes(q) ||
          (r.chefChantier || '').toLowerCase().includes(q) ||
          (partner && partner.name.toLowerCase().includes(q));
      });
    }
    return list;
  },

  _renderTable() {
    const rows = this._filteredList();
    const canEdit = Auth.can('reception.edit');
    const canDelete = Auth.can('reception.delete');

    const html = Components.renderTable({
      columns: [
        { label: 'N° Bon', render: r => `<span class="text-mono text-bold">${Utils.escapeHtml(r.docNumber || '-')}</span>` },
        { label: 'Date', render: r => Utils.formatDateTime(r.date) },
        { label: 'Dépôt', render: r => {
          const d = Storage.get('depots', r.depotId);
          return d ? Utils.escapeHtml(d.name) : '-';
        }},
        { label: 'Article', render: r => {
          const a = Storage.get('articles', r.articleId);
          return a ? Utils.escapeHtml(a.code + ' - ' + a.name) : '-';
        }},
        { label: 'Quantité', render: r => {
          const a = Storage.get('articles', r.articleId);
          return `<strong>${Utils.formatNumber(r.qty)}</strong> ${a ? a.unit : ''}`;
        }, style: 'text-align:right' },
        { label: 'Fournisseur', render: r => {
          const p = Storage.get('partners', r.partnerId);
          return p ? Utils.escapeHtml(p.name) : '-';
        }},
        { label: 'Chauffeur', render: r => Utils.escapeHtml(r.driver || '-') },
        { label: 'Matricule', render: r => `<span class="text-mono">${Utils.escapeHtml(r.plate || '-')}</span>` },
        { label: 'Vérif.', render: r => r.verified ? '<span class="badge badge-success"><i class="fas fa-check"></i> OK</span>' : '<span class="badge badge-neutral">En attente</span>' }
      ],
      rows,
      actions: [
        { key: 'view', icon: 'eye', class: 'btn-view', label: 'Voir' },
        { key: 'print', icon: 'print', class: 'btn-print', label: 'Imprimer' },
        ...(canEdit ? [{ key: 'edit', icon: 'pen', class: 'btn-edit', label: 'Modifier' }] : []),
        ...(canDelete ? [{ key: 'delete', icon: 'trash', class: 'btn-del', label: 'Supprimer' }] : [])
      ],
      emptyMessage: 'Aucune réception enregistrée'
    });
    document.getElementById('receptionTableBody').innerHTML = html;

    // Bind actions
    document.querySelectorAll('#receptionTableBody [data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.currentTarget.dataset.id);
        const action = e.currentTarget.dataset.action;
        this._handleAction(action, id);
      });
    });
  },

  _handleAction(action, id) {
    if (action === 'view') this.viewDoc(id);
    else if (action === 'print') this.printDoc(id);
    else if (action === 'edit') this.openForm(id);
    else if (action === 'delete') this.delete(id);
  },

  openForm(id = null) {
    const reception = id ? Storage.get('receptions', id) : null;
    const isEdit = !!reception;
    const depots = Storage.list('depots').filter(d => d.active);
    const articles = Storage.list('articles').filter(a => a.active);
    const partners = Storage.list('partners').filter(p => p.active && (p.type === 'fournisseur' || p.type === 'mixte'));
    const vehicles = Storage.list('vehicles').filter(v => v.active);

    const today = reception ? reception.date.split('T')[0] : Utils.todayISO();
    const time = reception ? new Date(reception.date).toTimeString().substring(0, 5) : new Date().toTimeString().substring(0, 5);

    const body = `
      <form id="receptionForm">
        <div class="form-grid">
          <div class="form-group">
            <label>N° Bon ${isEdit ? '' : '<span class="text-muted">(auto-généré)</span>'}</label>
            <input type="text" name="docNumber" value="${Utils.escapeHtml(reception?.docNumber || '')}" ${isEdit ? '' : 'readonly placeholder="Sera généré à la création"'}>
          </div>
          <div class="form-group">
            <label>Document lié <span class="text-muted">(BL fournisseur, BC...)</span></label>
            <input type="text" name="refDoc" value="${Utils.escapeHtml(reception?.refDoc || '')}">
          </div>
          <div class="form-group">
            <label>Date <span class="required">*</span></label>
            <input type="date" name="dateD" value="${today}" required>
          </div>
          <div class="form-group">
            <label>Heure</label>
            <input type="time" name="dateT" value="${time}">
          </div>
          <div class="form-group">
            <label>Dépôt <span class="required">*</span></label>
            <select name="depotId" required>${Components.selectOptions(depots, 'id', 'name', reception?.depotId)}</select>
          </div>
          <div class="form-group">
            <label>Type d'opération</label>
            <select name="operationType">
              <option value="reception" ${(reception?.operationType||'reception')==='reception'?'selected':''}>Réception standard</option>
              <option value="retour" ${reception?.operationType==='retour'?'selected':''}>Retour client</option>
              <option value="ajustement" ${reception?.operationType==='ajustement'?'selected':''}>Ajustement positif</option>
              <option value="transfert" ${reception?.operationType==='transfert'?'selected':''}>Transfert entrant</option>
            </select>
          </div>
          <div class="form-group">
            <label>Article <span class="required">*</span></label>
            <select name="articleId" required id="recArticleId">${Components.selectOptions(articles, 'id', 'name', reception?.articleId)}</select>
          </div>
          <div class="form-group">
            <label>Quantité <span class="required">*</span></label>
            <input type="number" name="qty" step="0.001" min="0.001" value="${reception?.qty || ''}" required>
          </div>
          <div class="form-group">
            <label>Fournisseur</label>
            <select name="partnerId">${Components.selectOptions(partners, 'id', 'name', reception?.partnerId)}</select>
          </div>
          <div class="form-group">
            <label>Chef de chantier / Réceptionnaire</label>
            <input type="text" name="chefChantier" value="${Utils.escapeHtml(reception?.chefChantier || '')}">
          </div>
          <div class="form-group">
            <label>Chauffeur</label>
            <input type="text" name="driver" value="${Utils.escapeHtml(reception?.driver || '')}" list="driversList">
            <datalist id="driversList">
              ${vehicles.map(v => `<option value="${Utils.escapeHtml(v.driver)}">`).join('')}
            </datalist>
          </div>
          <div class="form-group">
            <label>Matricule véhicule</label>
            <input type="text" name="plate" value="${Utils.escapeHtml(reception?.plate || '')}" list="platesList">
            <datalist id="platesList">
              ${vehicles.map(v => `<option value="${Utils.escapeHtml(v.plate)}">`).join('')}
            </datalist>
          </div>
          <div class="form-group">
            <label>Lien pesée (optionnel)</label>
            <select name="weighingId">${this._weighingOptions(reception?.weighingId)}</select>
          </div>
          <div class="form-group">
            <label>Pesée enregistrée</label>
            <div class="checkbox-group">
              <input type="checkbox" name="verified" id="recVerified" ${reception?.verified ? 'checked' : ''}>
              <label for="recVerified">Réception vérifiée et validée</label>
            </div>
          </div>
          <div class="form-group full">
            <label>Observations</label>
            <textarea name="notes" rows="2">${Utils.escapeHtml(reception?.notes || '')}</textarea>
          </div>
        </div>
      </form>
    `;

    Components.openModal({
      title: isEdit ? 'Modifier la réception' : 'Nouvelle réception',
      icon: 'truck-loading',
      size: 'large',
      body,
      footer: `
        <button class="btn btn-secondary" onclick="Components.closeModal()">Annuler</button>
        <button class="btn btn-primary" id="recSaveBtn"><i class="fas fa-save"></i> Enregistrer</button>
      `
    });

    document.getElementById('recSaveBtn').addEventListener('click', () => this._save(id));
  },

  _weighingOptions(selectedId) {
    const weighings = Storage.list('weighings').slice(-50).reverse();
    let html = '<option value="">Aucune</option>';
    weighings.forEach(w => {
      const sel = w.id == selectedId ? ' selected' : '';
      html += `<option value="${w.id}"${sel}>${w.docNumber} - Net: ${Utils.formatNumber(w.netWeight)} kg</option>`;
    });
    return html;
  },

  _save(id) {
    const form = document.getElementById('receptionForm');
    const fd = new FormData(form);
    const dateD = fd.get('dateD');
    const dateT = fd.get('dateT') || '00:00';
    if (!dateD) {
      Utils.toast('La date est obligatoire', 'error');
      return;
    }
    const articleId = parseInt(fd.get('articleId'));
    const depotId = parseInt(fd.get('depotId'));
    const qty = parseFloat(fd.get('qty'));
    if (!articleId || !depotId || isNaN(qty) || qty <= 0) {
      Utils.toast('Article, dépôt et quantité valide sont obligatoires', 'error');
      return;
    }

    const data = {
      docNumber: id ? fd.get('docNumber') : Utils.generateDocNumber('reception'),
      refDoc: fd.get('refDoc') || '',
      date: dateD + 'T' + dateT + ':00',
      depotId,
      operationType: fd.get('operationType'),
      articleId,
      qty,
      partnerId: fd.get('partnerId') ? parseInt(fd.get('partnerId')) : null,
      chefChantier: fd.get('chefChantier') || '',
      driver: fd.get('driver') || '',
      plate: fd.get('plate') || '',
      weighingId: fd.get('weighingId') ? parseInt(fd.get('weighingId')) : null,
      verified: !!fd.get('verified'),
      notes: fd.get('notes') || '',
      userId: Auth.currentUser.id
    };

    if (id) {
      // Annuler ancien mouvement et créer nouveau
      const old = Storage.get('receptions', id);
      Storage.db.stockMovements = Storage.db.stockMovements.filter(m => 
        !(m.refType === 'reception' && m.refId === id)
      );
      Storage.update('receptions', id, data);
      this._addStockMovement(id, data, 'in');
      Utils.toast('Réception modifiée', 'success');
    } else {
      const created = Storage.create('receptions', data);
      this._addStockMovement(created.id, data, 'in');
      Utils.toast('Réception enregistrée', 'success');
    }

    Components.closeModal();
    this._renderTable();
  },

  _addStockMovement(refId, data, type) {
    Storage.create('stockMovements', {
      refType: 'reception',
      refId,
      type,
      articleId: data.articleId,
      depotId: data.depotId,
      qty: data.qty,
      date: data.date,
      docNumber: data.docNumber
    });
  },

  async delete(id) {
    if (!await Utils.confirm('Supprimer cette réception ? Le mouvement de stock sera également annulé.', 'Supprimer la réception')) return;
    Storage.db.stockMovements = Storage.db.stockMovements.filter(m => 
      !(m.refType === 'reception' && m.refId === id)
    );
    Storage.delete('receptions', id);
    Storage.save();
    Utils.toast('Réception supprimée', 'success');
    this._renderTable();
  },

  viewDoc(id) {
    const r = Storage.get('receptions', id);
    if (!r) return;
    const article = Storage.get('articles', r.articleId);
    const depot = Storage.get('depots', r.depotId);
    const partner = Storage.get('partners', r.partnerId);

    const body = `
      <div class="stats-row">
        <div class="stat-mini"><div class="stat-mini-label">N° Bon</div><div class="stat-mini-value">${Utils.escapeHtml(r.docNumber)}</div></div>
        <div class="stat-mini"><div class="stat-mini-label">Date</div><div class="stat-mini-value">${Utils.formatDateTime(r.date)}</div></div>
        <div class="stat-mini"><div class="stat-mini-label">Quantité</div><div class="stat-mini-value">${Utils.formatNumber(r.qty)} ${article?.unit||''}</div></div>
      </div>
      <table class="data-table">
        <tr><th>Document lié</th><td>${Utils.escapeHtml(r.refDoc || '-')}</td></tr>
        <tr><th>Type opération</th><td>${Utils.escapeHtml(r.operationType||'reception')}</td></tr>
        <tr><th>Dépôt</th><td>${depot ? Utils.escapeHtml(depot.name) : '-'}</td></tr>
        <tr><th>Article</th><td>${article ? Utils.escapeHtml(article.code+' - '+article.name) : '-'}</td></tr>
        <tr><th>Fournisseur</th><td>${partner ? Utils.escapeHtml(partner.name) : '-'}</td></tr>
        <tr><th>Chef chantier</th><td>${Utils.escapeHtml(r.chefChantier || '-')}</td></tr>
        <tr><th>Chauffeur</th><td>${Utils.escapeHtml(r.driver || '-')}</td></tr>
        <tr><th>Matricule</th><td>${Utils.escapeHtml(r.plate || '-')}</td></tr>
        <tr><th>Vérification</th><td>${r.verified ? '<span class="badge badge-success">Validée</span>' : '<span class="badge badge-neutral">En attente</span>'}</td></tr>
        <tr><th>Observations</th><td>${Utils.escapeHtml(r.notes || '-')}</td></tr>
      </table>
    `;
    Components.openModal({
      title: 'Détails réception ' + r.docNumber,
      icon: 'eye',
      body,
      footer: `<button class="btn btn-secondary" onclick="Components.closeModal()">Fermer</button>
               <button class="btn btn-primary" onclick="ReceptionPage.printDoc(${id})"><i class="fas fa-print"></i> Imprimer</button>`
    });
  },

  printDoc(id) {
    const r = Storage.get('receptions', id);
    if (!r) return;
    const article = Storage.get('articles', r.articleId);
    const depot = Storage.get('depots', r.depotId);
    const partner = Storage.get('partners', r.partnerId);

    const html = `
      <div class="doc-title">BON DE RÉCEPTION N° ${Utils.escapeHtml(r.docNumber)}</div>
      <div class="doc-meta">
        <div class="meta-block">
          <h4>Informations Réception</h4>
          <p><strong>N° Bon:</strong> ${Utils.escapeHtml(r.docNumber)}</p>
          <p><strong>Document lié:</strong> ${Utils.escapeHtml(r.refDoc || '-')}</p>
          <p><strong>Date / Heure:</strong> ${Utils.formatDateTime(r.date)}</p>
          <p><strong>Type opération:</strong> ${Utils.escapeHtml(r.operationType || 'reception')}</p>
          <p><strong>Dépôt:</strong> ${depot ? Utils.escapeHtml(depot.name) : '-'}</p>
        </div>
        <div class="meta-block">
          <h4>Fournisseur / Origine</h4>
          <p><strong>Fournisseur:</strong> ${partner ? Utils.escapeHtml(partner.name) : '-'}</p>
          <p><strong>Adresse:</strong> ${partner ? Utils.escapeHtml(partner.address || '-') : '-'}</p>
          <p><strong>ICE:</strong> ${partner ? Utils.escapeHtml(partner.ice || '-') : '-'}</p>
          <p><strong>Chef chantier:</strong> ${Utils.escapeHtml(r.chefChantier || '-')}</p>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Code Article</th><th>Désignation</th><th>Quantité</th><th>Unité</th><th>Catégorie</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${article ? Utils.escapeHtml(article.code) : '-'}</td>
            <td>${article ? Utils.escapeHtml(article.name) : '-'}</td>
            <td style="text-align:right;font-weight:bold">${Utils.formatNumber(r.qty)}</td>
            <td>${article ? Utils.escapeHtml(article.unit) : '-'}</td>
            <td>${article ? Utils.escapeHtml(article.category || '-') : '-'}</td>
          </tr>
        </tbody>
      </table>
      <div style="margin-top:16px"><strong>Transport:</strong> Chauffeur: ${Utils.escapeHtml(r.driver || '-')}, Matricule: ${Utils.escapeHtml(r.plate || '-')}</div>
      ${r.notes ? `<div style="margin-top:12px;padding:10px;background:#f9f9f9;border-left:3px solid #0f4c81"><strong>Observations:</strong> ${Utils.escapeHtml(r.notes)}</div>` : ''}
      <div class="signatures">
        <div class="signature"><div style="height:50px"></div><div class="line">Réceptionnaire</div></div>
        <div class="signature"><div style="height:50px"></div><div class="line">Chauffeur</div></div>
        <div class="signature"><div style="height:50px"></div><div class="line">Responsable Dépôt</div></div>
      </div>
    `;
    Utils.printDocument('Bon de Réception ' + r.docNumber, html);
  },

  exportExcel() {
    const rows = this._filteredList();
    const data = [
      ['N° Bon', 'Document lié', 'Date', 'Dépôt', 'Article', 'Code Article', 'Quantité', 'Unité', 'Fournisseur', 'Chef chantier', 'Chauffeur', 'Matricule', 'Vérifié', 'Observations'],
      ...rows.map(r => {
        const a = Storage.get('articles', r.articleId);
        const d = Storage.get('depots', r.depotId);
        const p = Storage.get('partners', r.partnerId);
        return [
          r.docNumber || '', r.refDoc || '', Utils.formatDateTime(r.date),
          d?.name || '', a?.name || '', a?.code || '',
          parseFloat(r.qty) || 0, a?.unit || '',
          p?.name || '', r.chefChantier || '', r.driver || '', r.plate || '',
          r.verified ? 'Oui' : 'Non', r.notes || ''
        ];
      })
    ];
    Utils.exportExcel(`Receptions_${Utils.todayISO()}.xlsx`, [{ name: 'Réceptions', data }]);
    Utils.toast('Export Excel téléchargé', 'success');
  },

  exportPdf() {
    const rows = this._filteredList();
    const cols = ['N° Bon', 'Date', 'Dépôt', 'Article', 'Qté', 'Fournisseur', 'Chauffeur', 'Matricule'];
    const body = rows.map(r => {
      const a = Storage.get('articles', r.articleId);
      const d = Storage.get('depots', r.depotId);
      const p = Storage.get('partners', r.partnerId);
      return [
        r.docNumber || '', Utils.formatDate(r.date),
        d?.name || '', a?.name || '',
        Utils.formatNumber(r.qty) + ' ' + (a?.unit || ''),
        p?.name || '', r.driver || '', r.plate || ''
      ];
    });
    const totalQty = rows.reduce((s, r) => s + (parseFloat(r.qty) || 0), 0);
    Utils.exportPDF('Liste des Réceptions', cols, body, {
      orientation: 'landscape',
      subtitle: `Du ${Utils.formatDate(this.state.dateFrom || rows.length ? rows[rows.length-1]?.date : new Date())} au ${Utils.formatDate(this.state.dateTo || new Date())} - ${rows.length} réception(s)`,
      totals: [{ label: 'Total quantité', value: Utils.formatNumber(totalQty) }, { label: 'Total documents', value: rows.length }]
    });
    Utils.toast('Export PDF téléchargé', 'success');
  }
};
