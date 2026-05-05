/* =========================================
   PAGE DASHBOARD
   ========================================= */

const DashboardPage = {

  charts: {},

  render() {
    const stockSummary = Storage.getStockSummary();
    const totalArticles = stockSummary.length;
    const articlesAlerte = stockSummary.filter(s => s.status === 'alerte').length;
    const articlesRupture = stockSummary.filter(s => s.status === 'rupture').length;

    const today = new Date().toISOString().split('T')[0];
    const receptionsToday = Storage.list('receptions').filter(r => r.date && r.date.startsWith(today)).length;
    const expeditionsToday = Storage.list('expeditions').filter(e => e.date && e.date.startsWith(today)).length;
    const weighingsToday = Storage.list('weighings').filter(w => w.date && w.date.startsWith(today)).length;

    const totalReceptions = Storage.list('receptions').length;
    const totalExpeditions = Storage.list('expeditions').length;
    const totalDepots = Storage.list('depots').filter(d => d.active).length;
    const totalPartners = Storage.list('partners').filter(p => p.active).length;

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Tableau de bord</h1>
          <p class="page-subtitle">Vue d'ensemble de l'activité - ${Utils.formatDate(new Date())}</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary" onclick="App.refresh()"><i class="fas fa-rotate"></i> Actualiser</button>
        </div>
      </div>

      <div class="kpi-grid">
        ${Components.renderKPI({ label: 'Réceptions aujourd\'hui', value: receptionsToday, icon: 'truck-loading', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' })}
        ${Components.renderKPI({ label: 'Expéditions aujourd\'hui', value: expeditionsToday, icon: 'truck-fast', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' })}
        ${Components.renderKPI({ label: 'Pesées aujourd\'hui', value: weighingsToday, icon: 'weight-scale', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' })}
        ${Components.renderKPI({ label: 'Articles en alerte', value: articlesAlerte + articlesRupture, icon: 'triangle-exclamation', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' })}
      </div>

      <div class="kpi-grid">
        ${Components.renderKPI({ label: 'Total réceptions', value: totalReceptions, icon: 'arrow-down', color: '#0f4c81' })}
        ${Components.renderKPI({ label: 'Total expéditions', value: totalExpeditions, icon: 'arrow-up', color: '#0f4c81' })}
        ${Components.renderKPI({ label: 'Dépôts actifs', value: totalDepots, icon: 'warehouse', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)' })}
        ${Components.renderKPI({ label: 'Partenaires', value: totalPartners, icon: 'handshake', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.1)' })}
      </div>

      <div class="charts-grid">
        <div class="chart-card">
          <div class="card-header">
            <div class="card-title">📊 Mouvements - 30 derniers jours</div>
          </div>
          <div class="chart-container">
            <canvas id="chartMovements"></canvas>
          </div>
        </div>
        <div class="chart-card">
          <div class="card-header">
            <div class="card-title">📦 État du stock</div>
          </div>
          <div class="chart-container">
            <canvas id="chartStock"></canvas>
          </div>
        </div>
      </div>

      <div class="card mb-4">
        <div class="card-header">
          <div class="card-title">⚠️ Articles en alerte stock</div>
        </div>
        ${this._renderStockAlerts(stockSummary)}
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">🕒 Activité récente</div>
        </div>
        ${this._renderRecentActivity()}
      </div>
    `;
  },

  _renderStockAlerts(stockSummary) {
    const alerts = stockSummary.filter(s => s.status !== 'ok');
    if (alerts.length === 0) {
      return `<div class="text-center text-muted" style="padding:30px"><i class="fas fa-check-circle" style="font-size:32px;color:var(--success);margin-bottom:8px;display:block"></i>Tous les articles sont en niveau de stock acceptable</div>`;
    }
    return Components.renderTable({
      columns: [
        { label: 'Code', field: 'code' },
        { label: 'Article', field: 'name' },
        { label: 'Stock actuel', render: r => `<span class="${r.status==='rupture'?'stock-low':'stock-warning'}">${Utils.formatNumber(r.currentStock)} ${r.unit||''}</span>` },
        { label: 'Seuil sécurité', render: r => Utils.formatNumber(r.securityStock) + ' ' + (r.unit||'') },
        { label: 'Statut', render: r => {
            if (r.status === 'rupture') return '<span class="badge badge-danger">Rupture</span>';
            return '<span class="badge badge-warning">Alerte</span>';
          }
        }
      ],
      rows: alerts.slice(0, 10),
      emptyMessage: 'Aucune alerte'
    });
  },

  _renderRecentActivity() {
    const all = [
      ...Storage.list('receptions').map(r => ({ ...r, _type: 'reception', _label: 'Réception' })),
      ...Storage.list('expeditions').map(e => ({ ...e, _type: 'expedition', _label: 'Expédition' })),
      ...Storage.list('weighings').map(w => ({ ...w, _type: 'weighing', _label: 'Pesée' }))
    ].sort((a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime()).slice(0, 10);

    if (all.length === 0) {
      return `<div class="text-center text-muted" style="padding:30px"><i class="fas fa-clock" style="font-size:32px;opacity:0.4;margin-bottom:8px;display:block"></i>Aucune activité récente</div>`;
    }

    return Components.renderTable({
      columns: [
        { label: 'Type', render: r => {
          const colors = { reception: 'success', expedition: 'warning', weighing: 'info' };
          return `<span class="badge badge-${colors[r._type]}">${r._label}</span>`;
        }},
        { label: 'N° document', render: r => `<span class="text-mono text-bold">${Utils.escapeHtml(r.docNumber || '-')}</span>` },
        { label: 'Date', render: r => Utils.formatDateTime(r.date || r.createdAt) },
        { label: 'Détails', render: r => {
          if (r._type === 'weighing') return `Net: ${Utils.formatNumber(r.netWeight || 0)} kg`;
          const partner = Storage.get('partners', r.partnerId);
          return partner ? Utils.escapeHtml(partner.name) : '-';
        }}
      ],
      rows: all
    });
  },

  init() {
    setTimeout(() => {
      this._initChartMovements();
      this._initChartStock();
    }, 100);
  },

  _initChartMovements() {
    const ctx = document.getElementById('chartMovements');
    if (!ctx) return;

    // Données sur 30 jours
    const labels = [];
    const recData = [];
    const expData = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().split('T')[0];
      labels.push(d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }));
      const rec = Storage.list('receptions').filter(r => r.date && r.date.startsWith(iso)).length;
      const exp = Storage.list('expeditions').filter(e => e.date && e.date.startsWith(iso)).length;
      recData.push(rec);
      expData.push(exp);
    }

    if (this.charts.movements) this.charts.movements.destroy();
    this.charts.movements = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Réceptions', data: recData, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', tension: 0.3, fill: true },
          { label: 'Expéditions', data: expData, borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)', tension: 0.3, fill: true }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
  },

  _initChartStock() {
    const ctx = document.getElementById('chartStock');
    if (!ctx) return;

    const summary = Storage.getStockSummary();
    const ok = summary.filter(s => s.status === 'ok').length;
    const alerte = summary.filter(s => s.status === 'alerte').length;
    const rupture = summary.filter(s => s.status === 'rupture').length;

    if (this.charts.stock) this.charts.stock.destroy();
    this.charts.stock = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Stock OK', 'Alerte', 'Rupture'],
        datasets: [{
          data: [ok, alerte, rupture],
          backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        cutout: '65%'
      }
    });
  }
};
