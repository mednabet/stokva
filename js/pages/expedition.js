/* =========================================
   PAGE EXPÉDITIONS
   ========================================= */

const ExpeditionPage = {

  state: { search: '', depotFilter: 'all', dateFrom: '', dateTo: '' },

  render() {
    const canCreate = Auth.can('expedition.create');
    const depots = Storage.list('depots').filter(d => d.active);
    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Expéditions</h1>
          <p class="page-subtitle">Gestion des bons de livraison (sorties de stock)</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary" id="btnExportExpExcel"><i class="fas fa-file-excel"></i> Excel</button>
          <button class="btn btn-secondary" id="btnExportExpPdf"><i class="fas fa-file-pdf"></i> PDF</button>
          ${canCreate ? '<button class="btn btn-primary" id="btnNewExpedition"><i class="fas fa-plus"></i> Nouvelle expédition</button>' : ''}
        </div>
      </div>

      <div class="table-wrapper">
        ${Components.renderToolbar({
          searchPlaceholder: 'Rechercher (n°, client, chauffeur, matricule...)',
          filters: [
            { id: 'depotFilter', type: 'select', options: [{ value: 'all', label: 'Tous les dépôts' }, ...depots.map(d => ({ value: d.id, label: d.name }))] },
            { id: 'dateFrom', type: 'date' },
            { id: 'dateTo', type: 'date' }
          ]
        })}
        <div id="expeditionTableBody"></div>
      </div>
    `;
  },

  init() {
    this._renderTable();
    document.getElementById('searchInput')?.addEventListener('input', Utils.debounce(e => { this.state.search = e.target.value; this._renderTable(); }));
    document.getElementById('depotFilter')?.addEventListener('change', e => { this.state.depotFilter = e.target.value; this._renderTable(); });
    document.getElementById('dateFrom')?.addEventListener('change', e => { this.state.dateFrom = e.target.value; this._renderTable(); });
    document.getElementById('dateTo')?.addEventListener('change', e => { this.state.dateTo = e.target.value; this._renderTable(); });
    document.getElementById('btnNewExpedition')?.addEventListener('click', () => this.openForm());
    document.getElementById('btnExportExpExcel')?.addEventListener('click', () => this.exportExcel());
    document.getElementById('btnExportExpPdf')?.addEventListener('click', () => this.exportPdf());
  },

  _filteredList() {
    let list = Storage.list('expeditions').sort((a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime());
    if (this.state.depotFilter !== 'all') list = list.filter(r => r.depotId == this.state.depotFilter);
    list = Utils.filterByDateRange(list, 'date', this.state.dateFrom, this.state.dateTo);
    if (this.state.search) {
      const q = this.state.search.toLowerCase();
      list = list.filter(r => {
        const partner = Storage.get('partners', r.partnerId);
        return (r.docNumber || '').toLowerCase().includes(q) ||
          (r.driver || '').toLowerCase().includes(q) ||
          (r.plate || '').toLowerCase().includes(q) ||
          (r.refDoc || '').toLowerCase().includes(q) ||
          (r.destination || '').toLowerCase().includes(q) ||
          (partner && partner.name.toLowerCase().includes(q));
      });
    }
    return list;
  },

  _renderTable() {
    const rows = this._filteredList();
    const canEdit = Auth.can('expedition.edit');
    const canDelete = Auth.can('expedition.delete');
    const html = Components.renderTable({
      columns: [
        { label: 'N° Bon', render: r => `<span class="text-mono text-bold">${Utils.escapeHtml(r.docNumber || '-')}</span>` },
        { label: 'Date', render: r => Utils.formatDateTime(r.date) },
        { label: 'Dépôt', render: r => { const d = Storage.get('depots', r.depotId); return d ? Utils.escapeHtml(d.name) : '-'; }},
        { label: 'Article', render: r => { const a = Storage.get('articles', r.articleId); return a ? Utils.escapeHtml(a.code+' - '+a.name) : '-'; }},
        { label: 'Quantité', render: r => { const a = Storage.get('articles', r.articleId); return `<strong>${Utils.formatNumber(r.qty)}</strong> ${a?.unit||''}`; }, style: 'text-align:right' },
        { label: 'Destination/Client', render: r => { const p = Storage.get('partners', r.partnerId); return p ? Utils.escapeHtml(p.name) : Utils.escapeHtml(r.destination || '-'); }},
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
      emptyMessage: 'Aucune expédition enregistrée'
    });
    document.getElementById('expeditionTableBody').innerHTML = html;
    document.querySelectorAll('#expeditionTableBody [data-action]').forEach(btn => {
      btn.addEventListener('click', e => {
        const id = parseInt(e.currentTarget.dataset.id);
        const action = e.currentTarget.dataset.action;
        if (action === 'view') this.viewDoc(id);
        else if (action === 'print') this.printDoc(id);
        else if (action === 'edit') this.openForm(id);
        else if (action === 'delete') this.delete(id);
      });
    });
  },

  openForm(id = null) {
    const exp = id ? Storage.get('expeditions', id) : null;
    const isEdit = !!exp;
    const depots = Storage.list('depots').filter(d => d.active);
    const articles = Storage.list('articles').filter(a => a.active);
    const partners = Storage.list('partners').filter(p => p.active && (p.type === 'client' || p.type === 'mixte'));
    const vehicles = Storage.list('vehicles').filter(v => v.active);
    const today = exp ? exp.date.split('T')[0] : Utils.todayISO();
    const time = exp ? new Date(exp.date).toTimeString().substring(0, 5) : new Date().toTimeString().substring(0, 5);

    const body = `
      <form id="expeditionForm">
        <div class="form-grid">
          <div class="form-group">
            <label>N° Bon ${isEdit ? '' : '<span class="text-muted">(auto)</span>'}</label>
            <input type="text" name="docNumber" value="${Utils.escapeHtml(exp?.docNumber || '')}" ${isEdit ? '' : 'readonly placeholder="Auto-généré"'}>
          </div>
          <div class="form-group">
            <label>Document lié <span class="text-muted">(BC, commande...)</span></label>
            <input type="text" name="refDoc" value="${Utils.escapeHtml(exp?.refDoc || '')}">
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
            <label>Dépôt source <span class="required">*</span></label>
            <select name="depotId" required>${Components.selectOptions(depots, 'id', 'name', exp?.depotId)}</select>
          </div>
          <div class="form-group">
            <label>Type d'opération</label>
            <select name="operationType">
              <option value="expedition" ${(exp?.operationType||'expedition')==='expedition'?'selected':''}>Expédition standard</option>
              <option value="retour" ${exp?.operationType==='retour'?'selected':''}>Retour fournisseur</option>
              <option value="ajustement" ${exp?.operationType==='ajustement'?'selected':''}>Ajustement négatif</option>
              <option value="transfert" ${exp?.operationType==='transfert'?'selected':''}>Transfert sortant</option>
              <option value="consommation" ${exp?.operationType==='consommation'?'selected':''}>Consommation interne</option>
            </select>
          </div>
          <div class="form-group">
            <label>Article <span class="required">*</span></label>
            <select name="articleId" required id="expArticleId">${Components.selectOptions(articles, 'id', 'name', exp?.articleId)}</select>
          </div>
          <div class="form-group">
            <label>Quantité <span class="required">*</span></label>
            <input type="number" name="qty" step="0.001" min="0.001" value="${exp?.qty || ''}" required>
            <div class="form-help" id="expStockHelp"></div>
          </div>
          <div class="form-group">
            <label>Client</label>
            <select name="partnerId">${Components.selectOptions(partners, 'id', 'name', exp?.partnerId)}</select>
          </div>
          <div class="form-group">
            <label>Destination (libre)</label>
            <input type="text" name="destination" value="${Utils.escapeHtml(exp?.destination || '')}" placeholder="Chantier, lieu...">
          </div>
          <div class="form-group">
            <label>Chef de chantier</label>
            <input type="text" name="chefChantier" value="${Utils.escapeHtml(exp?.chefChantier || '')}">
          </div>
          <div class="form-group">
            <label>Chauffeur</label>
            <input type="text" name="driver" value="${Utils.escapeHtml(exp?.driver || '')}" list="expDriversList">
            <datalist id="expDriversList">
              ${vehicles.map(v => `<option value="${Utils.escapeHtml(v.driver)}">`).join('')}
            </datalist>
          </div>
          <div class="form-group">
            <label>Matricule véhicule</label>
            <input type="text" name="plate" value="${Utils.escapeHtml(exp?.plate || '')}" list="expPlatesList">
            <datalist id="expPlatesList">
              ${vehicles.map(v => `<option value="${Utils.escapeHtml(v.plate)}">`).join('')}
            </datalist>
          </div>
          <div class="form-group">
            <label>Lien pesée (optionnel)</label>
            <select name="weighingId">${this._weighingOptions(exp?.weighingId)}</select>
          </div>
          <div class="form-group">
            <label>Validation</label>
            <div class="checkbox-group">
              <input type="checkbox" name="verified" id="expVerified" ${exp?.verified ? 'checked' : ''}>
              <label for="expVerified">Expédition vérifiée et validée</label>
            </div>
          </div>
          <div class="form-group full">
            <label>Observations</label>
            <textarea name="notes" rows="2">${Utils.escapeHtml(exp?.notes || '')}</textarea>
          </div>
        </div>
      </form>
    `;

    Components.openModal({
      title: isEdit ? 'Modifier l\'expédition' : 'Nouvelle expédition',
      icon: 'truck-fast', size: 'large', body,
      footer: `<button class="btn btn-secondary" onclick="Components.closeModal()">Annuler</button>
               <button class="btn btn-primary" id="expSaveBtn"><i class="fas fa-save"></i> Enregistrer</button>`
    });
    
    // Affichage stock disponible en temps réel
    const updateStockHelp = () => {
      const aid = parseInt(document.querySelector('#expArticleId').value);
      const did = parseInt(document.querySelector('[name=depotId]').value);
      const helpEl = document.getElementById('expStockHelp');
      if (aid && did) {
        const stock = Storage.computeStock(aid, did);
        helpEl.innerHTML = `Stock disponible : <strong class="${stock<=0?'stock-low':'stock-ok'}">${Utils.formatNumber(stock)}</strong>`;
      } else {
        helpEl.innerHTML = '';
      }
    };
    document.querySelector('#expArticleId').addEventListener('change', updateStockHelp);
    document.querySelector('[name=depotId]').addEventListener('change', updateStockHelp);
    updateStockHelp();

    document.getElementById('expSaveBtn').addEventListener('click', () => this._save(id));
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
    const form = document.getElementById('expeditionForm');
    const fd = new FormData(form);
    const dateD = fd.get('dateD');
    const dateT = fd.get('dateT') || '00:00';
    if (!dateD) { Utils.toast('La date est obligatoire', 'error'); return; }
    const articleId = parseInt(fd.get('articleId'));
    const depotId = parseInt(fd.get('depotId'));
    const qty = parseFloat(fd.get('qty'));
    if (!articleId || !depotId || isNaN(qty) || qty <= 0) {
      Utils.toast('Article, dépôt et quantité valide sont obligatoires', 'error');
      return;
    }

    const data = {
      docNumber: id ? fd.get('docNumber') : Utils.generateDocNumber('expedition'),
      refDoc: fd.get('refDoc') || '',
      date: dateD + 'T' + dateT + ':00',
      depotId,
      operationType: fd.get('operationType'),
      articleId,
      qty,
      partnerId: fd.get('partnerId') ? parseInt(fd.get('partnerId')) : null,
      destination: fd.get('destination') || '',
      chefChantier: fd.get('chefChantier') || '',
      driver: fd.get('driver') || '',
      plate: fd.get('plate') || '',
      weighingId: fd.get('weighingId') ? parseInt(fd.get('weighingId')) : null,
      verified: !!fd.get('verified'),
      notes: fd.get('notes') || '',
      userId: Auth.currentUser.id
    };

    if (id) {
      Storage.db.stockMovements = Storage.db.stockMovements.filter(m => !(m.refType === 'expedition' && m.refId === id));
      Storage.update('expeditions', id, data);
      this._addStockMovement(id, data);
      Utils.toast('Expédition modifiée', 'success');
    } else {
      const created = Storage.create('expeditions', data);
      this._addStockMovement(created.id, data);
      Utils.toast('Expédition enregistrée', 'success');
    }

    Components.closeModal();
    this._renderTable();
  },

  _addStockMovement(refId, data) {
    Storage.create('stockMovements', {
      refType: 'expedition',
      refId,
      type: 'out',
      articleId: data.articleId,
      depotId: data.depotId,
      qty: data.qty,
      date: data.date,
      docNumber: data.docNumber
    });
  },

  async delete(id) {
    if (!await Utils.confirm('Supprimer cette expédition ?', 'Supprimer l\'expédition')) return;
    Storage.db.stockMovements = Storage.db.stockMovements.filter(m => !(m.refType === 'expedition' && m.refId === id));
    Storage.delete('expeditions', id);
    Storage.save();
    Utils.toast('Expédition supprimée', 'success');
    this._renderTable();
  },

  viewDoc(id) {
    const r = Storage.get('expeditions', id);
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
        <tr><th>Type opération</th><td>${Utils.escapeHtml(r.operationType||'expedition')}</td></tr>
        <tr><th>Dépôt</th><td>${depot ? Utils.escapeHtml(depot.name) : '-'}</td></tr>
        <tr><th>Article</th><td>${article ? Utils.escapeHtml(article.code+' - '+article.name) : '-'}</td></tr>
        <tr><th>Client</th><td>${partner ? Utils.escapeHtml(partner.name) : '-'}</td></tr>
        <tr><th>Destination</th><td>${Utils.escapeHtml(r.destination || '-')}</td></tr>
        <tr><th>Chef chantier</th><td>${Utils.escapeHtml(r.chefChantier || '-')}</td></tr>
        <tr><th>Chauffeur</th><td>${Utils.escapeHtml(r.driver || '-')}</td></tr>
        <tr><th>Matricule</th><td>${Utils.escapeHtml(r.plate || '-')}</td></tr>
        <tr><th>Vérification</th><td>${r.verified ? '<span class="badge badge-success">Validée</span>' : '<span class="badge badge-neutral">En attente</span>'}</td></tr>
        <tr><th>Observations</th><td>${Utils.escapeHtml(r.notes || '-')}</td></tr>
      </table>
    `;
    Components.openModal({
      title: 'Détails expédition ' + r.docNumber,
      icon: 'eye', body,
      footer: `<button class="btn btn-secondary" onclick="Components.closeModal()">Fermer</button>
               <button class="btn btn-primary" onclick="ExpeditionPage.printDoc(${id})"><i class="fas fa-print"></i> Imprimer</button>`
    });
  },

  printDoc(id) {
    const r = Storage.get('expeditions', id);
    if (!r) return;
    const article = Storage.get('articles', r.articleId);
    const depot = Storage.get('depots', r.depotId);
    const partner = Storage.get('partners', r.partnerId);
    const html = `
      <div class="doc-title">BON DE LIVRAISON N° ${Utils.escapeHtml(r.docNumber)}</div>
      <div class="doc-meta">
        <div class="meta-block">
          <h4>Informations Expédition</h4>
          <p><strong>N° Bon:</strong> ${Utils.escapeHtml(r.docNumber)}</p>
          <p><strong>Document lié:</strong> ${Utils.escapeHtml(r.refDoc || '-')}</p>
          <p><strong>Date / Heure:</strong> ${Utils.formatDateTime(r.date)}</p>
          <p><strong>Type opération:</strong> ${Utils.escapeHtml(r.operationType || 'expedition')}</p>
          <p><strong>Dépôt source:</strong> ${depot ? Utils.escapeHtml(depot.name) : '-'}</p>
        </div>
        <div class="meta-block">
          <h4>Destinataire</h4>
          <p><strong>Client:</strong> ${partner ? Utils.escapeHtml(partner.name) : '-'}</p>
          <p><strong>Destination:</strong> ${Utils.escapeHtml(r.destination || '-')}</p>
          <p><strong>Adresse:</strong> ${partner ? Utils.escapeHtml(partner.address || '-') : '-'}</p>
          <p><strong>ICE:</strong> ${partner ? Utils.escapeHtml(partner.ice || '-') : '-'}</p>
          <p><strong>Chef chantier:</strong> ${Utils.escapeHtml(r.chefChantier || '-')}</p>
        </div>
      </div>
      <table>
        <thead><tr><th>Code Article</th><th>Désignation</th><th>Quantité</th><th>Unité</th></tr></thead>
        <tbody>
          <tr>
            <td>${article ? Utils.escapeHtml(article.code) : '-'}</td>
            <td>${article ? Utils.escapeHtml(article.name) : '-'}</td>
            <td style="text-align:right;font-weight:bold">${Utils.formatNumber(r.qty)}</td>
            <td>${article ? Utils.escapeHtml(article.unit) : '-'}</td>
          </tr>
        </tbody>
      </table>
      <div style="margin-top:16px"><strong>Transport:</strong> Chauffeur: ${Utils.escapeHtml(r.driver || '-')}, Matricule: ${Utils.escapeHtml(r.plate || '-')}</div>
      ${r.notes ? `<div style="margin-top:12px;padding:10px;background:#f9f9f9;border-left:3px solid #0f4c81"><strong>Observations:</strong> ${Utils.escapeHtml(r.notes)}</div>` : ''}
      <div class="signatures">
        <div class="signature"><div style="height:50px"></div><div class="line">Expéditeur</div></div>
        <div class="signature"><div style="height:50px"></div><div class="line">Chauffeur</div></div>
        <div class="signature"><div style="height:50px"></div><div class="line">Destinataire</div></div>
      </div>
    `;
    Utils.printDocument('Bon de Livraison ' + r.docNumber, html);
  },

  exportExcel() {
    const rows = this._filteredList();
    const data = [
      ['N° Bon', 'Document lié', 'Date', 'Dépôt', 'Article', 'Code Article', 'Quantité', 'Unité', 'Client', 'Destination', 'Chef chantier', 'Chauffeur', 'Matricule', 'Vérifié', 'Observations'],
      ...rows.map(r => {
        const a = Storage.get('articles', r.articleId);
        const d = Storage.get('depots', r.depotId);
        const p = Storage.get('partners', r.partnerId);
        return [
          r.docNumber || '', r.refDoc || '', Utils.formatDateTime(r.date),
          d?.name || '', a?.name || '', a?.code || '',
          parseFloat(r.qty) || 0, a?.unit || '',
          p?.name || '', r.destination || '', r.chefChantier || '', r.driver || '', r.plate || '',
          r.verified ? 'Oui' : 'Non', r.notes || ''
        ];
      })
    ];
    Utils.exportExcel(`Expeditions_${Utils.todayISO()}.xlsx`, [{ name: 'Expéditions', data }]);
    Utils.toast('Export Excel téléchargé', 'success');
  },

  exportPdf() {
    const rows = this._filteredList();
    const cols = ['N° Bon', 'Date', 'Dépôt', 'Article', 'Qté', 'Client/Dest.', 'Chauffeur', 'Matricule'];
    const body = rows.map(r => {
      const a = Storage.get('articles', r.articleId);
      const d = Storage.get('depots', r.depotId);
      const p = Storage.get('partners', r.partnerId);
      return [
        r.docNumber || '', Utils.formatDate(r.date),
        d?.name || '', a?.name || '',
        Utils.formatNumber(r.qty) + ' ' + (a?.unit || ''),
        p?.name || r.destination || '-', r.driver || '', r.plate || ''
      ];
    });
    const totalQty = rows.reduce((s, r) => s + (parseFloat(r.qty) || 0), 0);
    Utils.exportPDF('Liste des Expéditions', cols, body, {
      orientation: 'landscape',
      subtitle: `${rows.length} expédition(s)`,
      totals: [{ label: 'Total quantité', value: Utils.formatNumber(totalQty) }, { label: 'Total documents', value: rows.length }]
    });
    Utils.toast('Export PDF téléchargé', 'success');
  }
};

// Export global pour app.js (les const top-level ne sont pas auto-attachees a window)
window.ExpeditionPage = ExpeditionPage;
