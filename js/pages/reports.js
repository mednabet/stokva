// Reports page
const ReportsPage = {
  currentReport: 'monthly',

  render() {
    const today = Utils.todayISO ? Utils.todayISO() : new Date().toISOString().slice(0, 10);
    const firstDay = today.substring(0, 8) + '01';
    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Rapports</h1>
          <p class="page-subtitle">Analyses, statistiques et exports</p>
        </div>
      </div>

      <div class="report-grid">
        ${this._cards().map(c => `
          <div class="report-card ${this.currentReport === c.id ? 'active' : ''}" onclick="ReportsPage.selectReport('${c.id}')">
            <i class="fa-solid ${c.icon}"></i>
            <h3>${c.title}</h3>
            <p>${c.desc}</p>
          </div>
        `).join('')}
      </div>

      <div class="card">
        <div class="card-header">
          <h3 id="reportTitle">Paramètres du rapport</h3>
          <div class="card-actions">
            <button class="btn btn-secondary" onclick="ReportsPage.exportExcel()">
              <i class="fa-solid fa-file-excel"></i> Excel
            </button>
            <button class="btn btn-secondary" onclick="ReportsPage.exportPDF()">
              <i class="fa-solid fa-file-pdf"></i> PDF
            </button>
            <button class="btn btn-secondary" onclick="ReportsPage.print()">
              <i class="fa-solid fa-print"></i> Imprimer
            </button>
          </div>
        </div>
        <div class="card-body">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Du</label>
              <input type="date" class="form-control" id="reportDateFrom" value="${firstDay}" onchange="ReportsPage.refresh()">
            </div>
            <div class="form-group">
              <label class="form-label">Au</label>
              <input type="date" class="form-control" id="reportDateTo" value="${today}" onchange="ReportsPage.refresh()">
            </div>
            <div class="form-group">
              <label class="form-label">Dépôt</label>
              <select class="form-control" id="reportDepot" onchange="ReportsPage.refresh()">
                <option value="">— Tous —</option>
                ${Storage.list('depots').filter(d => d.active).map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div id="reportContent"></div>
    `;
  },

  _cards() {
    return [
      { id: 'monthly', icon: 'fa-calendar-days', title: 'Registre mensuel', desc: 'État détaillé style G0 (entrées/sorties + stock cumulé)' },
      { id: 'period', icon: 'fa-chart-line', title: 'Mouvements par période', desc: 'Synthèse entrées/sorties avec totaux' },
      { id: 'partner', icon: 'fa-handshake', title: 'Stats partenaires', desc: 'Volume par fournisseur / client' },
      { id: 'article', icon: 'fa-boxes-stacked', title: 'Stats articles', desc: 'Quantités entrées/sorties par article' },
      { id: 'vehicle', icon: 'fa-truck', title: 'Activité véhicules', desc: 'Rotations et tonnages par matricule' },
      { id: 'weighing', icon: 'fa-weight-scale', title: 'Journal pesées', desc: 'Toutes les pesées du pont-bascule' },
    ];
  },

  init() { this.refresh(); },

  selectReport(type) {
    this.currentReport = type;
    document.querySelectorAll('.report-card').forEach(c => c.classList.remove('active'));
    document.querySelector(`.report-card[onclick*="'${type}'"]`)?.classList.add('active');
    this.refresh();
  },

  getFilters() {
    return {
      dateFrom: document.getElementById('reportDateFrom')?.value,
      dateTo: document.getElementById('reportDateTo')?.value,
      depotId: document.getElementById('reportDepot')?.value,
    };
  },

  _datePart(d) { return d ? String(d).substring(0, 10) : ''; },
  _qty(m) { return parseFloat(m.qty !== undefined ? m.qty : m.quantity) || 0; },

  refresh() {
    const card = this._cards().find(c => c.id === this.currentReport);
    if (card) document.getElementById('reportTitle').textContent = card.title;
    const f = this.getFilters();
    let html = '';
    switch (this.currentReport) {
      case 'monthly': html = this.renderMonthly(f); break;
      case 'period': html = this.renderPeriod(f); break;
      case 'partner': html = this.renderPartner(f); break;
      case 'article': html = this.renderArticle(f); break;
      case 'vehicle': html = this.renderVehicle(f); break;
      case 'weighing': html = this.renderWeighing(f); break;
    }
    document.getElementById('reportContent').innerHTML = html;
  },

  filterMovements(f) {
    let movs = Storage.list('stockMovements');
    if (f.dateFrom) movs = movs.filter(m => this._datePart(m.date) >= f.dateFrom);
    if (f.dateTo) movs = movs.filter(m => this._datePart(m.date) <= f.dateTo);
    if (f.depotId) movs = movs.filter(m => String(m.depotId) === String(f.depotId));
    return movs.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.id - b.id);
  },

  _enrichMovement(m) {
    const out = { docNum: m.docNumber || '', linkedDoc: '', destination: '', supervisor: '', driver: '', plate: '' };
    if (m.sourceType === 'reception') {
      const r = Storage.get('receptions', m.sourceId);
      if (r) {
        out.docNum = r.docNumber || out.docNum;
        out.linkedDoc = r.refDoc || '';
        const p = Storage.get('partners', r.partnerId);
        out.destination = p ? p.name : '';
        out.supervisor = r.chefChantier || '';
        out.driver = r.driver || '';
        out.plate = r.plate || '';
      }
    } else if (m.sourceType === 'expedition') {
      const e = Storage.get('expeditions', m.sourceId);
      if (e) {
        out.docNum = e.docNumber || out.docNum;
        out.linkedDoc = e.refDoc || '';
        const p = Storage.get('partners', e.partnerId);
        out.destination = p ? p.name : (e.destination || '');
        out.supervisor = e.chefChantier || '';
        out.driver = e.driver || '';
        out.plate = e.plate || '';
      }
    }
    return out;
  },

  renderMonthly(f) {
    const movs = this.filterMovements(f);
    const runningStock = {};
    const rows = movs.map(m => {
      const art = Storage.get('articles', m.articleId);
      const key = `${m.articleId}_${m.depotId}`;
      const q = this._qty(m);
      runningStock[key] = (runningStock[key] || 0) + (m.type === 'in' ? q : -q);
      const en = this._enrichMovement(m);
      return {
        date: this._datePart(m.date),
        type: m.type === 'in' ? 'ENTRÉE' : 'SORTIE',
        ...en,
        article: art ? art.name : '—',
        qty: q,
        stock: runningStock[key],
      };
    });

    return Components.renderTable({
      columns: [
        { label: 'DATE', render: r => Utils.formatDate ? Utils.formatDate(r.date) : r.date },
        { label: "TYPE D'OPÉRATION", render: r => `<span class="badge badge-${r.type === 'ENTRÉE' ? 'success' : 'warning'}">${r.type}</span>` },
        { label: 'N° BON', render: r => r.docNum || '—' },
        { label: 'N° DOC LIÉ', render: r => r.linkedDoc || '—' },
        { label: 'ARTICLE', render: r => r.article },
        { label: 'QTÉ', render: r => Utils.formatNumber(r.qty), style: 'text-align:right' },
        { label: 'STOCK RÉEL', render: r => `<strong>${Utils.formatNumber(r.stock)}</strong>`, style: 'text-align:right' },
        { label: 'DEST./FOURN.', render: r => r.destination || '—' },
        { label: 'CHEF CHANTIER', render: r => r.supervisor || '—' },
        { label: 'CHAUFFEUR', render: r => r.driver || '—' },
        { label: 'MATRICULE', render: r => r.plate || '—' },
      ],
      data: rows,
    });
  },

  renderPeriod(f) {
    const movs = this.filterMovements(f);
    const totalIn = movs.filter(m => m.type === 'in').reduce((s, m) => s + this._qty(m), 0);
    const totalOut = movs.filter(m => m.type === 'out').reduce((s, m) => s + this._qty(m), 0);

    const tableHtml = Components.renderTable({
      columns: [
        { label: 'Date', render: r => Utils.formatDate ? Utils.formatDate(this._datePart(r.date)) : this._datePart(r.date) },
        { label: 'Type', render: r => r.type === 'in' ? '<span class="badge badge-success">Entrée</span>' : '<span class="badge badge-warning">Sortie</span>' },
        { label: 'N° Bon', render: r => r.docNumber || '—' },
        { label: 'Article', render: r => { const a = Storage.get('articles', r.articleId); return a ? `${a.code} − ${a.name}` : '—'; } },
        { label: 'Dépôt', render: r => { const d = Storage.get('depots', r.depotId); return d ? d.name : '—'; } },
        { label: 'Quantité', render: r => Utils.formatNumber(this._qty(r)), style: 'text-align:right' },
      ],
      data: movs,
    });

    return `
      <div class="kpi-row">
        <div class="kpi-card kpi-success">
          <div class="kpi-label">Total entrées</div>
          <div class="kpi-value">${Utils.formatNumber(totalIn)}</div>
          <div class="kpi-meta">${movs.filter(m => m.type === 'in').length} mouvements</div>
        </div>
        <div class="kpi-card kpi-warning">
          <div class="kpi-label">Total sorties</div>
          <div class="kpi-value">${Utils.formatNumber(totalOut)}</div>
          <div class="kpi-meta">${movs.filter(m => m.type === 'out').length} mouvements</div>
        </div>
        <div class="kpi-card kpi-primary">
          <div class="kpi-label">Solde net</div>
          <div class="kpi-value">${Utils.formatNumber(totalIn - totalOut)}</div>
          <div class="kpi-meta">Entrées − Sorties</div>
        </div>
      </div>
      ${tableHtml}
    `;
  },

  renderPartner(f) {
    const movs = this.filterMovements(f);
    const stats = {};
    movs.forEach(m => {
      let pid = null;
      if (m.sourceType === 'reception') { const r = Storage.get('receptions', m.sourceId); if (r) pid = r.partnerId; }
      if (m.sourceType === 'expedition') { const e = Storage.get('expeditions', m.sourceId); if (e) pid = e.partnerId; }
      if (!pid) return;
      if (!stats[pid]) stats[pid] = { in: 0, out: 0, count: 0 };
      stats[pid][m.type === 'in' ? 'in' : 'out'] += this._qty(m);
      stats[pid].count++;
    });
    const data = Object.entries(stats).map(([pid, s]) => {
      const p = Storage.get('partners', parseInt(pid));
      return p ? { partner: p, ...s } : null;
    }).filter(Boolean).sort((a, b) => (b.in + b.out) - (a.in + a.out));

    return Components.renderTable({
      columns: [
        { label: 'Code', render: r => r.partner.code },
        { label: 'Nom', render: r => r.partner.name },
        { label: 'Type', render: r => `<span class="badge badge-info">${r.partner.type}</span>` },
        { label: 'Opérations', render: r => r.count, style: 'text-align:right' },
        { label: 'Entrées', render: r => Utils.formatNumber(r.in), style: 'text-align:right' },
        { label: 'Sorties', render: r => Utils.formatNumber(r.out), style: 'text-align:right' },
        { label: 'Total', render: r => `<strong>${Utils.formatNumber(r.in + r.out)}</strong>`, style: 'text-align:right' },
      ],
      data,
    });
  },

  renderArticle(f) {
    const movs = this.filterMovements(f);
    const stats = {};
    movs.forEach(m => {
      if (!stats[m.articleId]) stats[m.articleId] = { in: 0, out: 0, count: 0 };
      stats[m.articleId][m.type === 'in' ? 'in' : 'out'] += this._qty(m);
      stats[m.articleId].count++;
    });
    const data = Object.entries(stats).map(([aid, s]) => {
      const a = Storage.get('articles', parseInt(aid));
      return a ? { article: a, ...s } : null;
    }).filter(Boolean).sort((a, b) => (b.in + b.out) - (a.in + a.out));

    return Components.renderTable({
      columns: [
        { label: 'Code', render: r => r.article.code },
        { label: 'Désignation', render: r => r.article.name },
        { label: 'Unité', render: r => r.article.unit },
        { label: 'Mouvements', render: r => r.count, style: 'text-align:right' },
        { label: 'Entrées', render: r => Utils.formatNumber(r.in), style: 'text-align:right' },
        { label: 'Sorties', render: r => Utils.formatNumber(r.out), style: 'text-align:right' },
        { label: 'Solde', render: r => `<strong>${Utils.formatNumber(r.in - r.out)}</strong>`, style: 'text-align:right' },
      ],
      data,
    });
  },

  renderVehicle(f) {
    let receptions = Storage.list('receptions');
    let expeditions = Storage.list('expeditions');
    if (f.dateFrom) {
      receptions = receptions.filter(r => this._datePart(r.date) >= f.dateFrom);
      expeditions = expeditions.filter(e => this._datePart(e.date) >= f.dateFrom);
    }
    if (f.dateTo) {
      receptions = receptions.filter(r => this._datePart(r.date) <= f.dateTo);
      expeditions = expeditions.filter(e => this._datePart(e.date) <= f.dateTo);
    }
    const stats = {};
    const acc = (k, plate, driver) => { if (!stats[k]) stats[k] = { plate: plate || '—', driver: driver || '—', rec: 0, exp: 0, qIn: 0, qOut: 0 }; };
    receptions.forEach(r => { const k = r.plate || 'sans-plaque'; acc(k, r.plate, r.driver); stats[k].rec++; stats[k].qIn += parseFloat(r.qty) || 0; });
    expeditions.forEach(e => { const k = e.plate || 'sans-plaque'; acc(k, e.plate, e.driver); stats[k].exp++; stats[k].qOut += parseFloat(e.qty) || 0; });
    const data = Object.values(stats).sort((a, b) => (b.rec + b.exp) - (a.rec + a.exp));

    return Components.renderTable({
      columns: [
        { label: 'Matricule', render: r => `<span class="text-mono">${r.plate}</span>` },
        { label: 'Chauffeur', render: r => r.driver },
        { label: 'Réceptions', render: r => r.rec, style: 'text-align:right' },
        { label: 'Expéditions', render: r => r.exp, style: 'text-align:right' },
        { label: 'Total rotations', render: r => `<strong>${r.rec + r.exp}</strong>`, style: 'text-align:right' },
        { label: 'Qté entrée', render: r => Utils.formatNumber(r.qIn), style: 'text-align:right' },
        { label: 'Qté sortie', render: r => Utils.formatNumber(r.qOut), style: 'text-align:right' },
      ],
      data,
    });
  },

  renderWeighing(f) {
    let weighings = Storage.list('weighings');
    if (f.dateFrom) weighings = weighings.filter(w => this._datePart(w.date) >= f.dateFrom);
    if (f.dateTo) weighings = weighings.filter(w => this._datePart(w.date) <= f.dateTo);
    weighings.sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.id - a.id);

    return Components.renderTable({
      columns: [
        { label: 'N° Pesée', render: r => `<span class="text-mono text-bold">${r.docNumber || '—'}</span>` },
        { label: 'Date/Heure', render: r => Utils.formatDateTime ? Utils.formatDateTime(r.date) : r.date },
        { label: 'Matricule', render: r => `<span class="text-mono">${r.plate || '—'}</span>` },
        { label: 'Chauffeur', render: r => r.driver || '—' },
        { label: 'Brut (kg)', render: r => Utils.formatNumber(r.grossWeight), style: 'text-align:right' },
        { label: 'Tare (kg)', render: r => Utils.formatNumber(r.tareWeight), style: 'text-align:right' },
        { label: 'Net (kg)', render: r => `<strong style="color:var(--primary)">${Utils.formatNumber(r.netWeight)}</strong>`, style: 'text-align:right' },
      ],
      data: weighings,
    });
  },

  _filename() {
    const d = (Utils.todayISO ? Utils.todayISO() : new Date().toISOString().slice(0, 10));
    return `Rapport_${this.currentReport}_${d}`;
  },

  exportExcel() {
    const f = this.getFilters();
    let data = [], sheet = 'Rapport';
    switch (this.currentReport) {
      case 'monthly':
      case 'period': {
        const movs = this.filterMovements(f);
        const stock = {};
        data = movs.map(m => {
          const art = Storage.get('articles', m.articleId);
          const dep = Storage.get('depots', m.depotId);
          const k = `${m.articleId}_${m.depotId}`;
          const q = this._qty(m);
          stock[k] = (stock[k] || 0) + (m.type === 'in' ? q : -q);
          const en = this._enrichMovement(m);
          return {
            'Date': this._datePart(m.date),
            "Type d'opération": m.type === 'in' ? 'ENTRÉE' : 'SORTIE',
            'N° Bon': en.docNum,
            'N° Doc lié': en.linkedDoc,
            'Article': art ? `${art.code} - ${art.name}` : '',
            'Dépôt': dep ? dep.name : '',
            'Quantité': q,
            'Stock réel': stock[k],
            'Destination/Fournisseur': en.destination,
            'Chef chantier': en.supervisor,
            'Chauffeur': en.driver,
            'Matricule': en.plate,
          };
        });
        sheet = 'Mouvements';
        break;
      }
      case 'partner': {
        const movs = this.filterMovements(f);
        const stats = {};
        movs.forEach(m => {
          let pid = null;
          if (m.sourceType === 'reception') { const r = Storage.get('receptions', m.sourceId); if (r) pid = r.partnerId; }
          if (m.sourceType === 'expedition') { const e = Storage.get('expeditions', m.sourceId); if (e) pid = e.partnerId; }
          if (!pid) return;
          if (!stats[pid]) stats[pid] = { in: 0, out: 0, count: 0 };
          stats[pid][m.type === 'in' ? 'in' : 'out'] += this._qty(m);
          stats[pid].count++;
        });
        data = Object.entries(stats).map(([pid, s]) => {
          const p = Storage.get('partners', parseInt(pid));
          return p ? { 'Code': p.code, 'Nom': p.name, 'Type': p.type, 'Opérations': s.count, 'Entrées': s.in, 'Sorties': s.out, 'Total': s.in + s.out } : null;
        }).filter(Boolean);
        sheet = 'Partenaires';
        break;
      }
      case 'article': {
        const movs = this.filterMovements(f);
        const stats = {};
        movs.forEach(m => {
          if (!stats[m.articleId]) stats[m.articleId] = { in: 0, out: 0, count: 0 };
          stats[m.articleId][m.type === 'in' ? 'in' : 'out'] += this._qty(m);
          stats[m.articleId].count++;
        });
        data = Object.entries(stats).map(([aid, s]) => {
          const a = Storage.get('articles', parseInt(aid));
          return a ? { 'Code': a.code, 'Désignation': a.name, 'Unité': a.unit, 'Mouvements': s.count, 'Entrées': s.in, 'Sorties': s.out, 'Solde': s.in - s.out } : null;
        }).filter(Boolean);
        sheet = 'Articles';
        break;
      }
      case 'vehicle': {
        let recs = Storage.list('receptions'), exps = Storage.list('expeditions');
        if (f.dateFrom) { recs = recs.filter(r => this._datePart(r.date) >= f.dateFrom); exps = exps.filter(e => this._datePart(e.date) >= f.dateFrom); }
        if (f.dateTo) { recs = recs.filter(r => this._datePart(r.date) <= f.dateTo); exps = exps.filter(e => this._datePart(e.date) <= f.dateTo); }
        const stats = {};
        const acc = (k, plate, driver) => { if (!stats[k]) stats[k] = { plate, driver, rec: 0, exp: 0, qIn: 0, qOut: 0 }; };
        recs.forEach(r => { const k = r.plate || '—'; acc(k, r.plate || '—', r.driver || '—'); stats[k].rec++; stats[k].qIn += parseFloat(r.qty) || 0; });
        exps.forEach(e => { const k = e.plate || '—'; acc(k, e.plate || '—', e.driver || '—'); stats[k].exp++; stats[k].qOut += parseFloat(e.qty) || 0; });
        data = Object.values(stats).map(s => ({ 'Matricule': s.plate, 'Chauffeur': s.driver, 'Réceptions': s.rec, 'Expéditions': s.exp, 'Total': s.rec + s.exp, 'Qté entrée': s.qIn, 'Qté sortie': s.qOut }));
        sheet = 'Véhicules';
        break;
      }
      case 'weighing': {
        let weighings = Storage.list('weighings');
        if (f.dateFrom) weighings = weighings.filter(w => this._datePart(w.date) >= f.dateFrom);
        if (f.dateTo) weighings = weighings.filter(w => this._datePart(w.date) <= f.dateTo);
        data = weighings.map(w => ({
          'N° Pesée': w.docNumber || '',
          'Date': w.date,
          'Matricule': w.plate || '',
          'Chauffeur': w.driver || '',
          'Brut (kg)': w.grossWeight,
          'Tare (kg)': w.tareWeight,
          'Net (kg)': w.netWeight,
        }));
        sheet = 'Pesées';
        break;
      }
    }
    Utils.exportExcel(data, this._filename(), sheet);
  },

  exportPDF() {
    const f = this.getFilters();
    const card = this._cards().find(c => c.id === this.currentReport);
    const subtitle = `Période : ${f.dateFrom || '—'} au ${f.dateTo || '—'}`;
    let headers = [], rows = [];
    switch (this.currentReport) {
      case 'monthly':
      case 'period': {
        headers = ['Date', 'Type', 'N° Bon', 'Article', 'Qté', 'Stock'];
        const movs = this.filterMovements(f);
        const stock = {};
        rows = movs.map(m => {
          const art = Storage.get('articles', m.articleId);
          const k = `${m.articleId}_${m.depotId}`;
          const q = this._qty(m);
          stock[k] = (stock[k] || 0) + (m.type === 'in' ? q : -q);
          return [this._datePart(m.date), m.type === 'in' ? 'ENTRÉE' : 'SORTIE', m.docNumber || '', art ? art.name : '', Utils.formatNumber(q), Utils.formatNumber(stock[k])];
        });
        break;
      }
      case 'partner': {
        headers = ['Code', 'Nom', 'Type', 'Opér.', 'Entrées', 'Sorties', 'Total'];
        const movs = this.filterMovements(f);
        const stats = {};
        movs.forEach(m => {
          let pid = null;
          if (m.sourceType === 'reception') { const r = Storage.get('receptions', m.sourceId); if (r) pid = r.partnerId; }
          if (m.sourceType === 'expedition') { const e = Storage.get('expeditions', m.sourceId); if (e) pid = e.partnerId; }
          if (!pid) return;
          if (!stats[pid]) stats[pid] = { in: 0, out: 0, count: 0 };
          stats[pid][m.type === 'in' ? 'in' : 'out'] += this._qty(m);
          stats[pid].count++;
        });
        rows = Object.entries(stats).map(([pid, s]) => {
          const p = Storage.get('partners', parseInt(pid));
          return p ? [p.code, p.name, p.type, s.count, Utils.formatNumber(s.in), Utils.formatNumber(s.out), Utils.formatNumber(s.in + s.out)] : null;
        }).filter(Boolean);
        break;
      }
      case 'article': {
        headers = ['Code', 'Désignation', 'Unité', 'Entrées', 'Sorties', 'Solde'];
        const movs = this.filterMovements(f);
        const stats = {};
        movs.forEach(m => {
          if (!stats[m.articleId]) stats[m.articleId] = { in: 0, out: 0 };
          stats[m.articleId][m.type === 'in' ? 'in' : 'out'] += this._qty(m);
        });
        rows = Object.entries(stats).map(([aid, s]) => {
          const a = Storage.get('articles', parseInt(aid));
          return a ? [a.code, a.name, a.unit, Utils.formatNumber(s.in), Utils.formatNumber(s.out), Utils.formatNumber(s.in - s.out)] : null;
        }).filter(Boolean);
        break;
      }
      case 'weighing': {
        headers = ['N° Pesée', 'Date', 'Matricule', 'Brut', 'Tare', 'Net'];
        let weighings = Storage.list('weighings');
        if (f.dateFrom) weighings = weighings.filter(w => this._datePart(w.date) >= f.dateFrom);
        if (f.dateTo) weighings = weighings.filter(w => this._datePart(w.date) <= f.dateTo);
        rows = weighings.map(w => [w.docNumber || '', this._datePart(w.date), w.plate || '', Utils.formatNumber(w.grossWeight), Utils.formatNumber(w.tareWeight), Utils.formatNumber(w.netWeight)]);
        break;
      }
      case 'vehicle': {
        headers = ['Matricule', 'Chauffeur', 'Réceptions', 'Expéditions', 'Qté entrée', 'Qté sortie'];
        let recs = Storage.list('receptions'), exps = Storage.list('expeditions');
        if (f.dateFrom) { recs = recs.filter(r => this._datePart(r.date) >= f.dateFrom); exps = exps.filter(e => this._datePart(e.date) >= f.dateFrom); }
        if (f.dateTo) { recs = recs.filter(r => this._datePart(r.date) <= f.dateTo); exps = exps.filter(e => this._datePart(e.date) <= f.dateTo); }
        const stats = {};
        const acc = (k, plate, driver) => { if (!stats[k]) stats[k] = { plate, driver, rec: 0, exp: 0, qIn: 0, qOut: 0 }; };
        recs.forEach(r => { const k = r.plate || '—'; acc(k, r.plate || '—', r.driver || '—'); stats[k].rec++; stats[k].qIn += parseFloat(r.qty) || 0; });
        exps.forEach(e => { const k = e.plate || '—'; acc(k, e.plate || '—', e.driver || '—'); stats[k].exp++; stats[k].qOut += parseFloat(e.qty) || 0; });
        rows = Object.values(stats).map(s => [s.plate, s.driver, s.rec, s.exp, Utils.formatNumber(s.qIn), Utils.formatNumber(s.qOut)]);
        break;
      }
    }
    Utils.exportPDF({ title: card ? card.title : 'Rapport', subtitle, headers, data: rows, filename: this._filename() });
  },

  print() { window.print(); },
};
