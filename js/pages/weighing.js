/* =========================================
   PAGE PONT-BASCULE
   ========================================= */

const WeighingPage = {

  state: { search: '', dateFrom: '', dateTo: '', typeFilter: 'all' },
  liveWeight: 0, // valeur poussée par bascule (simulation/manuel)

  render() {
    const canCreate = Auth.can('weighing.create');
    const settings = Storage.db.settings;
    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Pont-bascule</h1>
          <p class="page-subtitle">Pesées des véhicules - Bascule: <strong>${Utils.escapeHtml(settings.weighbridgeBrand || 'Manuel')}</strong></p>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary" id="btnExportPesExcel"><i class="fas fa-file-excel"></i> Excel</button>
          <button class="btn btn-secondary" id="btnExportPesPdf"><i class="fas fa-file-pdf"></i> PDF</button>
          ${canCreate ? '<button class="btn btn-primary" id="btnNewWeighing"><i class="fas fa-weight-scale"></i> Nouvelle pesée</button>' : ''}
        </div>
      </div>

      ${canCreate ? this._renderQuickWeighing() : ''}

      <div class="table-wrapper mt-4">
        ${Components.renderToolbar({
          searchPlaceholder: 'Rechercher (n° pesée, matricule, chauffeur...)',
          filters: [
            { id: 'typeFilter', type: 'select', options: [
              { value: 'all', label: 'Tous les types' },
              { value: 'reception', label: 'Réception' },
              { value: 'expedition', label: 'Expédition' },
              { value: 'pesage_simple', label: 'Pesage simple' }
            ] },
            { id: 'dateFrom', type: 'date' },
            { id: 'dateTo', type: 'date' }
          ]
        })}
        <div id="weighingTableBody"></div>
      </div>
    `;
  },

  _renderQuickWeighing() {
    return `
      <div class="card mb-4" style="background:linear-gradient(135deg, #0f4c81 0%, #1e6fb8 100%);color:white;border:0">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:20px;align-items:center">
          <div>
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;opacity:0.8">État bascule</div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
              <div style="width:10px;height:10px;background:#10b981;border-radius:50%;animation:pulse 2s infinite"></div>
              <strong>Connectée</strong>
            </div>
          </div>
          <div>
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;opacity:0.8">Poids en direct</div>
            <div id="liveWeightDisplay" style="font-family:'JetBrains Mono',monospace;font-size:32px;font-weight:800;letter-spacing:1px">0,000 kg</div>
          </div>
          <div>
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;opacity:0.8">Saisie manuelle</div>
            <input type="number" id="manualWeightInput" step="1" placeholder="Saisir poids (kg)" 
              style="margin-top:4px;width:100%;padding:8px;border:1px solid rgba(255,255,255,0.3);background:rgba(255,255,255,0.1);color:white;border-radius:8px;font-size:18px;font-weight:600">
          </div>
          <button class="btn btn-warning" id="btnCaptureWeight" style="white-space:nowrap;padding:14px 18px">
            <i class="fas fa-bolt"></i> Capturer & Démarrer pesée
          </button>
        </div>
      </div>
      <style>@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}</style>
    `;
  },

  init() {
    this._renderTable();
    this._startSimulation();

    document.getElementById('searchInput')?.addEventListener('input', Utils.debounce(e => { this.state.search = e.target.value; this._renderTable(); }));
    document.getElementById('typeFilter')?.addEventListener('change', e => { this.state.typeFilter = e.target.value; this._renderTable(); });
    document.getElementById('dateFrom')?.addEventListener('change', e => { this.state.dateFrom = e.target.value; this._renderTable(); });
    document.getElementById('dateTo')?.addEventListener('change', e => { this.state.dateTo = e.target.value; this._renderTable(); });
    document.getElementById('btnNewWeighing')?.addEventListener('click', () => this.openForm());
    document.getElementById('btnExportPesExcel')?.addEventListener('click', () => this.exportExcel());
    document.getElementById('btnExportPesPdf')?.addEventListener('click', () => this.exportPdf());

    document.getElementById('manualWeightInput')?.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      if (!isNaN(v)) {
        this.liveWeight = v;
        document.getElementById('liveWeightDisplay').textContent = Utils.formatNumber(v) + ' kg';
      }
    });
    document.getElementById('btnCaptureWeight')?.addEventListener('click', () => {
      this.openForm(null, this.liveWeight);
    });
  },

  _startSimulation() {
    // Simulation : ondulation légère du poids "live"
    if (this._simInterval) clearInterval(this._simInterval);
    this._simInterval = setInterval(() => {
      const display = document.getElementById('liveWeightDisplay');
      const input = document.getElementById('manualWeightInput');
      if (!display) { clearInterval(this._simInterval); return; }
      // Si saisie manuelle non vide, ne pas écraser
      if (input && input.value) return;
      // sinon léger bruit autour de la valeur
      const base = this.liveWeight || 0;
      if (base > 0) {
        const drift = (Math.random() - 0.5) * 2;
        display.textContent = Utils.formatNumber(base + drift) + ' kg';
      }
    }, 1500);
  },

  _filteredList() {
    let list = Storage.list('weighings').sort((a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime());
    if (this.state.typeFilter !== 'all') list = list.filter(r => r.weighingType === this.state.typeFilter);
    list = Utils.filterByDateRange(list, 'date', this.state.dateFrom, this.state.dateTo);
    if (this.state.search) {
      const q = this.state.search.toLowerCase();
      list = list.filter(r => 
        (r.docNumber || '').toLowerCase().includes(q) ||
        (r.driver || '').toLowerCase().includes(q) ||
        (r.plate || '').toLowerCase().includes(q)
      );
    }
    return list;
  },

  _renderTable() {
    const rows = this._filteredList();
    const canEdit = Auth.can('weighing.edit');
    const html = Components.renderTable({
      columns: [
        { label: 'N° Pesée', render: r => `<span class="text-mono text-bold">${Utils.escapeHtml(r.docNumber || '-')}</span>` },
        { label: 'Date', render: r => Utils.formatDateTime(r.date) },
        { label: 'Type', render: r => {
          const labels = { reception: 'Réception', expedition: 'Expédition', pesage_simple: 'Simple' };
          const colors = { reception: 'success', expedition: 'warning', pesage_simple: 'info' };
          return `<span class="badge badge-${colors[r.weighingType]||'neutral'}">${labels[r.weighingType]||'-'}</span>`;
        }},
        { label: 'Matricule', render: r => `<span class="text-mono">${Utils.escapeHtml(r.plate || '-')}</span>` },
        { label: 'Chauffeur', render: r => Utils.escapeHtml(r.driver || '-') },
        { label: 'Brut (kg)', render: r => `<span class="text-mono">${Utils.formatNumber(r.grossWeight)}</span>`, style: 'text-align:right' },
        { label: 'Tare (kg)', render: r => `<span class="text-mono">${Utils.formatNumber(r.tareWeight)}</span>`, style: 'text-align:right' },
        { label: 'Net (kg)', render: r => `<span class="text-mono text-bold" style="color:var(--primary)">${Utils.formatNumber(r.netWeight)}</span>`, style: 'text-align:right' },
        { label: 'Statut', render: r => r.completed ? '<span class="badge badge-success">Complète</span>' : '<span class="badge badge-warning">En cours</span>' }
      ],
      rows,
      actions: [
        { key: 'view', icon: 'eye', class: 'btn-view', label: 'Voir' },
        { key: 'print', icon: 'print', class: 'btn-print', label: 'Imprimer ticket' },
        ...(canEdit ? [{ key: 'edit', icon: 'pen', class: 'btn-edit', label: 'Modifier' }] : []),
        ...(Auth.can('weighing.edit') ? [{ key: 'delete', icon: 'trash', class: 'btn-del', label: 'Supprimer' }] : [])
      ],
      emptyMessage: 'Aucune pesée enregistrée'
    });
    document.getElementById('weighingTableBody').innerHTML = html;
    document.querySelectorAll('#weighingTableBody [data-action]').forEach(btn => {
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

  openForm(id = null, capturedWeight = 0) {
    const w = id ? Storage.get('weighings', id) : null;
    const isEdit = !!w;
    const vehicles = Storage.list('vehicles').filter(v => v.active);
    const today = w ? w.date.split('T')[0] : Utils.todayISO();
    const time = w ? new Date(w.date).toTimeString().substring(0, 5) : new Date().toTimeString().substring(0, 5);
    const grossInit = w ? w.grossWeight : capturedWeight || '';

    const body = `
      <form id="weighingForm">
        <div class="form-grid">
          <div class="form-group">
            <label>N° Pesée ${isEdit ? '' : '<span class="text-muted">(auto)</span>'}</label>
            <input type="text" name="docNumber" value="${Utils.escapeHtml(w?.docNumber || '')}" ${isEdit ? '' : 'readonly placeholder="Auto-généré"'}>
          </div>
          <div class="form-group">
            <label>Type de pesée <span class="required">*</span></label>
            <select name="weighingType" required>
              <option value="pesage_simple" ${(w?.weighingType||'pesage_simple')==='pesage_simple'?'selected':''}>Pesage simple</option>
              <option value="reception" ${w?.weighingType==='reception'?'selected':''}>Pesée réception</option>
              <option value="expedition" ${w?.weighingType==='expedition'?'selected':''}>Pesée expédition</option>
            </select>
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
            <label>Matricule véhicule <span class="required">*</span></label>
            <input type="text" name="plate" value="${Utils.escapeHtml(w?.plate || '')}" required list="weighPlatesList" id="weighPlate">
            <datalist id="weighPlatesList">
              ${vehicles.map(v => `<option value="${Utils.escapeHtml(v.plate)}">${Utils.escapeHtml(v.driver)} (Tare: ${v.tareWeight}kg)</option>`).join('')}
            </datalist>
          </div>
          <div class="form-group">
            <label>Chauffeur</label>
            <input type="text" name="driver" value="${Utils.escapeHtml(w?.driver || '')}" list="weighDriversList">
            <datalist id="weighDriversList">
              ${vehicles.map(v => `<option value="${Utils.escapeHtml(v.driver)}">`).join('')}
            </datalist>
          </div>
          <div class="form-group">
            <label>Poids brut (kg) <span class="required">*</span></label>
            <input type="number" name="grossWeight" step="0.001" min="0" value="${grossInit}" required id="grossWeight">
          </div>
          <div class="form-group">
            <label>Poids tare (kg) <span class="required">*</span></label>
            <input type="number" name="tareWeight" step="0.001" min="0" value="${w?.tareWeight || ''}" required id="tareWeight">
          </div>
          <div class="form-group">
            <label>Poids net (kg) <span class="text-muted">(calculé auto)</span></label>
            <input type="number" name="netWeight" step="0.001" id="netWeight" readonly value="${w?.netWeight || ''}" style="background:#f0f7fc;font-weight:700;color:var(--primary);font-size:16px">
          </div>
          <div class="form-group">
            <label>Statut</label>
            <div class="checkbox-group">
              <input type="checkbox" name="completed" id="weighCompleted" ${w?.completed ? 'checked' : ''}>
              <label for="weighCompleted">Pesée complète et validée</label>
            </div>
          </div>
          <div class="form-group full">
            <label>Observations</label>
            <textarea name="notes" rows="2">${Utils.escapeHtml(w?.notes || '')}</textarea>
          </div>
        </div>
      </form>
    `;

    Components.openModal({
      title: isEdit ? 'Modifier la pesée' : 'Nouvelle pesée',
      icon: 'weight-scale', size: 'large', body,
      footer: `<button class="btn btn-secondary" onclick="Components.closeModal()">Annuler</button>
               <button class="btn btn-primary" id="weighSaveBtn"><i class="fas fa-save"></i> Enregistrer</button>`
    });

    const calcNet = () => {
      const g = parseFloat(document.getElementById('grossWeight').value) || 0;
      const t = parseFloat(document.getElementById('tareWeight').value) || 0;
      const net = Math.max(0, g - t);
      document.getElementById('netWeight').value = net.toFixed(3);
    };
    document.getElementById('grossWeight').addEventListener('input', calcNet);
    document.getElementById('tareWeight').addEventListener('input', calcNet);

    // Auto-remplir tare quand on choisit un matricule connu
    document.getElementById('weighPlate').addEventListener('change', (e) => {
      const veh = vehicles.find(v => v.plate === e.target.value);
      if (veh) {
        if (!document.getElementById('tareWeight').value && veh.tareWeight) {
          document.getElementById('tareWeight').value = veh.tareWeight;
        }
        if (!document.querySelector('[name=driver]').value && veh.driver) {
          document.querySelector('[name=driver]').value = veh.driver;
        }
        calcNet();
      }
    });

    if (grossInit && document.getElementById('tareWeight').value) calcNet();

    document.getElementById('weighSaveBtn').addEventListener('click', () => this._save(id));
  },

  _save(id) {
    const form = document.getElementById('weighingForm');
    const fd = new FormData(form);
    const dateD = fd.get('dateD'); const dateT = fd.get('dateT') || '00:00';
    const gross = parseFloat(fd.get('grossWeight'));
    const tare = parseFloat(fd.get('tareWeight'));
    if (!dateD || isNaN(gross) || isNaN(tare)) {
      Utils.toast('Date, poids brut et tare obligatoires', 'error');
      return;
    }
    const net = Math.max(0, gross - tare);
    const data = {
      docNumber: id ? fd.get('docNumber') : Utils.generateDocNumber('weighing'),
      weighingType: fd.get('weighingType'),
      date: dateD + 'T' + dateT + ':00',
      plate: fd.get('plate') || '',
      driver: fd.get('driver') || '',
      grossWeight: gross,
      tareWeight: tare,
      netWeight: net,
      completed: !!fd.get('completed'),
      notes: fd.get('notes') || '',
      userId: Auth.currentUser.id
    };
    if (id) {
      Storage.update('weighings', id, data);
      Utils.toast('Pesée modifiée', 'success');
    } else {
      Storage.create('weighings', data);
      Utils.toast('Pesée enregistrée', 'success');
    }
    Components.closeModal();
    this._renderTable();
    // reset live
    this.liveWeight = 0;
    const liveDisplay = document.getElementById('liveWeightDisplay');
    if (liveDisplay) liveDisplay.textContent = '0,000 kg';
    const manualInput = document.getElementById('manualWeightInput');
    if (manualInput) manualInput.value = '';
  },

  async delete(id) {
    if (!await Utils.confirm('Supprimer cette pesée ?', 'Supprimer la pesée')) return;
    Storage.delete('weighings', id);
    Utils.toast('Pesée supprimée', 'success');
    this._renderTable();
  },

  viewDoc(id) {
    const w = Storage.get('weighings', id);
    if (!w) return;
    const body = `
      <div class="stats-row">
        <div class="stat-mini"><div class="stat-mini-label">N° Pesée</div><div class="stat-mini-value">${Utils.escapeHtml(w.docNumber)}</div></div>
        <div class="stat-mini"><div class="stat-mini-label">Brut</div><div class="stat-mini-value">${Utils.formatNumber(w.grossWeight)} kg</div></div>
        <div class="stat-mini"><div class="stat-mini-label">Tare</div><div class="stat-mini-value">${Utils.formatNumber(w.tareWeight)} kg</div></div>
        <div class="stat-mini" style="background:linear-gradient(135deg,var(--primary),var(--primary-light));color:white;border-color:transparent">
          <div class="stat-mini-label" style="color:rgba(255,255,255,0.85)">NET</div>
          <div class="stat-mini-value" style="color:white;font-size:22px">${Utils.formatNumber(w.netWeight)} kg</div>
        </div>
      </div>
      <table class="data-table">
        <tr><th>Type</th><td>${Utils.escapeHtml(w.weighingType||'-')}</td></tr>
        <tr><th>Date / heure</th><td>${Utils.formatDateTime(w.date)}</td></tr>
        <tr><th>Matricule</th><td><span class="text-mono">${Utils.escapeHtml(w.plate||'-')}</span></td></tr>
        <tr><th>Chauffeur</th><td>${Utils.escapeHtml(w.driver||'-')}</td></tr>
        <tr><th>Statut</th><td>${w.completed ? '<span class="badge badge-success">Complète</span>' : '<span class="badge badge-warning">En cours</span>'}</td></tr>
        <tr><th>Observations</th><td>${Utils.escapeHtml(w.notes||'-')}</td></tr>
      </table>
    `;
    Components.openModal({
      title: 'Détails pesée ' + w.docNumber,
      icon: 'weight-scale', body,
      footer: `<button class="btn btn-secondary" onclick="Components.closeModal()">Fermer</button>
               <button class="btn btn-primary" onclick="WeighingPage.printDoc(${id})"><i class="fas fa-print"></i> Imprimer ticket</button>`
    });
  },

  printDoc(id) {
    const w = Storage.get('weighings', id);
    if (!w) return;
    const html = `
      <div class="doc-title">TICKET DE PESÉE N° ${Utils.escapeHtml(w.docNumber)}</div>
      <div class="doc-meta">
        <div class="meta-block">
          <h4>Informations Pesée</h4>
          <p><strong>N° Ticket:</strong> ${Utils.escapeHtml(w.docNumber)}</p>
          <p><strong>Type:</strong> ${Utils.escapeHtml(w.weighingType || '-')}</p>
          <p><strong>Date / Heure:</strong> ${Utils.formatDateTime(w.date)}</p>
        </div>
        <div class="meta-block">
          <h4>Véhicule</h4>
          <p><strong>Matricule:</strong> ${Utils.escapeHtml(w.plate || '-')}</p>
          <p><strong>Chauffeur:</strong> ${Utils.escapeHtml(w.driver || '-')}</p>
        </div>
      </div>
      <table>
        <thead><tr><th>Mesure</th><th>Valeur</th></tr></thead>
        <tbody>
          <tr><td><strong>Poids Brut</strong></td><td style="text-align:right;font-family:'Courier New',monospace;font-size:14px">${Utils.formatNumber(w.grossWeight)} kg</td></tr>
          <tr><td><strong>Poids Tare</strong></td><td style="text-align:right;font-family:'Courier New',monospace;font-size:14px">${Utils.formatNumber(w.tareWeight)} kg</td></tr>
          <tr style="background:#0f4c81;color:white">
            <td><strong style="color:white">POIDS NET</strong></td>
            <td style="text-align:right;font-family:'Courier New',monospace;font-size:18px;font-weight:bold">${Utils.formatNumber(w.netWeight)} kg</td>
          </tr>
        </tbody>
      </table>
      ${w.notes ? `<div style="margin-top:12px;padding:10px;background:#f9f9f9;border-left:3px solid #0f4c81"><strong>Observations:</strong> ${Utils.escapeHtml(w.notes)}</div>` : ''}
      <div class="signatures">
        <div class="signature"><div style="height:50px"></div><div class="line">Opérateur Bascule</div></div>
        <div class="signature"><div style="height:50px"></div><div class="line">Chauffeur</div></div>
      </div>
    `;
    Utils.printDocument('Ticket Pesée ' + w.docNumber, html);
  },

  exportExcel() {
    const rows = this._filteredList();
    const data = [
      ['N° Pesée', 'Type', 'Date', 'Matricule', 'Chauffeur', 'Brut (kg)', 'Tare (kg)', 'Net (kg)', 'Complète', 'Observations'],
      ...rows.map(w => [
        w.docNumber || '', w.weighingType || '', Utils.formatDateTime(w.date),
        w.plate || '', w.driver || '',
        parseFloat(w.grossWeight)||0, parseFloat(w.tareWeight)||0, parseFloat(w.netWeight)||0,
        w.completed ? 'Oui' : 'Non', w.notes || ''
      ])
    ];
    Utils.exportExcel(`Pesees_${Utils.todayISO()}.xlsx`, [{ name: 'Pesées', data }]);
    Utils.toast('Export Excel téléchargé', 'success');
  },

  exportPdf() {
    const rows = this._filteredList();
    const cols = ['N° Pesée', 'Type', 'Date', 'Matricule', 'Chauffeur', 'Brut (kg)', 'Tare (kg)', 'Net (kg)'];
    const body = rows.map(w => [
      w.docNumber || '', w.weighingType || '', Utils.formatDate(w.date),
      w.plate || '', w.driver || '',
      Utils.formatNumber(w.grossWeight), Utils.formatNumber(w.tareWeight), Utils.formatNumber(w.netWeight)
    ]);
    const totalNet = rows.reduce((s, w) => s + (parseFloat(w.netWeight)||0), 0);
    Utils.exportPDF('Liste des Pesées', cols, body, {
      orientation: 'landscape',
      subtitle: `${rows.length} pesée(s)`,
      totals: [{ label: 'Total net', value: Utils.formatNumber(totalNet) + ' kg' }, { label: 'Total tickets', value: rows.length }]
    });
    Utils.toast('Export PDF téléchargé', 'success');
  }
};

// Export global pour app.js (les const top-level ne sont pas auto-attachees a window)
window.WeighingPage = WeighingPage;
