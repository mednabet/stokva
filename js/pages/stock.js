// Stock & Articles management page
const StockPage = {
  selectedDepot: null,

  render() {
    const depots = Storage.list('depots').filter(d => d.active);
    if (!this.selectedDepot && depots.length > 0) this.selectedDepot = depots[0].id;

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Stock & Articles</h1>
          <p class="page-subtitle">Gestion des articles et suivi du stock par dépôt</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary" onclick="StockPage.exportExcel()">
            <i class="fa-solid fa-file-excel"></i> Excel
          </button>
          <button class="btn btn-secondary" onclick="StockPage.exportPDF()">
            <i class="fa-solid fa-file-pdf"></i> PDF
          </button>
          ${Auth.can('stock.edit') || Auth.isAdmin() ? `
            <button class="btn btn-primary" onclick="StockPage.openArticleForm()">
              <i class="fa-solid fa-plus"></i> Nouvel article
            </button>` : ''}
        </div>
      </div>

      <div class="tabs">
        <div class="tab active" data-tab="stock" onclick="StockPage.switchTab('stock')">
          <i class="fa-solid fa-warehouse"></i> Stock par dépôt
        </div>
        <div class="tab" data-tab="articles" onclick="StockPage.switchTab('articles')">
          <i class="fa-solid fa-boxes-stacked"></i> Catalogue articles
        </div>
        <div class="tab" data-tab="movements" onclick="StockPage.switchTab('movements')">
          <i class="fa-solid fa-arrow-right-arrow-left"></i> Mouvements
        </div>
      </div>

      <div id="tabStock" class="tab-content active">
        <div class="card">
          <div class="card-body">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Dépôt</label>
                <select class="form-control" id="stockDepotSelect" onchange="StockPage.changeDepot(this.value)">
                  ${depots.map(d => `<option value="${d.id}" ${d.id === this.selectedDepot ? 'selected' : ''}>${d.code} - ${d.name}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Recherche</label>
                <input type="text" class="form-control" id="stockSearch" placeholder="Code ou désignation..." oninput="StockPage.refreshStock()">
              </div>
            </div>
          </div>
        </div>
        <div id="stockTableContainer"></div>
      </div>

      <div id="tabArticles" class="tab-content">
        <div id="articlesTableContainer"></div>
      </div>

      <div id="tabMovements" class="tab-content">
        <div class="card">
          <div class="card-body">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Article</label>
                <select class="form-control" id="movArticle" onchange="StockPage.refreshMovements()">
                  <option value="">— Tous les articles —</option>
                  ${Storage.list('articles').filter(a => a.active).map(a => `<option value="${a.id}">${a.code} - ${a.name}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Dépôt</label>
                <select class="form-control" id="movDepot" onchange="StockPage.refreshMovements()">
                  <option value="">— Tous —</option>
                  ${depots.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Du</label>
                <input type="date" class="form-control" id="movDateFrom" onchange="StockPage.refreshMovements()">
              </div>
              <div class="form-group">
                <label class="form-label">Au</label>
                <input type="date" class="form-control" id="movDateTo" onchange="StockPage.refreshMovements()">
              </div>
            </div>
          </div>
        </div>
        <div id="movementsTableContainer"></div>
      </div>
    `;
  },

  init() {
    this.refreshStock();
  },

  switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');
    if (tab === 'stock') this.refreshStock();
    if (tab === 'articles') this.refreshArticles();
    if (tab === 'movements') this.refreshMovements();
  },

  changeDepot(id) {
    this.selectedDepot = id;
    this.refreshStock();
  },

  refreshStock() {
    const search = (document.getElementById('stockSearch')?.value || '').toLowerCase();
    const articles = Storage.list('articles').filter(a => a.active);
    const rows = articles.map(art => {
      const stock = Storage.computeStock(art.id, this.selectedDepot);
      return { ...art, stock };
    }).filter(r => !search || r.code.toLowerCase().includes(search) || r.name.toLowerCase().includes(search));

    const html = Components.renderTable({
      columns: [
        { key: 'code', label: 'Code' },
        { key: 'name', label: 'Désignation' },
        { key: 'unit', label: 'Unité' },
        { key: 'stock', label: 'Stock réel', render: r => `<strong class="${r.stock <= (r.minStock || 0) ? 'text-danger' : ''}">${Utils.formatNumber(r.stock)}</strong>` },
        { key: 'minStock', label: 'Stock min', render: r => Utils.formatNumber(r.minStock || 0) },
        { key: 'status', label: 'État', render: r => {
          if (r.stock <= 0) return '<span class="badge badge-danger">Rupture</span>';
          if (r.stock <= (r.minStock || 0)) return '<span class="badge badge-warning">Critique</span>';
          return '<span class="badge badge-success">OK</span>';
        }},
      ],
      data: rows,
      empty: 'Aucun article',
    });
    document.getElementById('stockTableContainer').innerHTML = html;
  },

  refreshArticles() {
    const articles = Storage.list('articles');
    const html = Components.renderTable({
      columns: [
        { key: 'code', label: 'Code' },
        { key: 'name', label: 'Désignation' },
        { key: 'category', label: 'Catégorie' },
        { key: 'unit', label: 'Unité' },
        { key: 'minStock', label: 'Stock min', render: r => Utils.formatNumber(r.minStock || 0) },
        { key: 'active', label: 'Actif', render: r => r.active ? '<span class="badge badge-success">Oui</span>' : '<span class="badge badge-secondary">Non</span>' },
      ],
      data: articles,
      actions: Auth.can('stock.edit') || Auth.isAdmin() ? [
        { icon: 'fa-pen', title: 'Modifier', onClick: id => StockPage.openArticleForm(id) },
        { icon: 'fa-trash', title: 'Supprimer', onClick: id => StockPage.deleteArticle(id), danger: true },
      ] : [],
      empty: 'Aucun article',
    });
    document.getElementById('articlesTableContainer').innerHTML = html;
  },

  refreshMovements() {
    const articleId = document.getElementById('movArticle')?.value;
    const depotId = document.getElementById('movDepot')?.value;
    const dateFrom = document.getElementById('movDateFrom')?.value;
    const dateTo = document.getElementById('movDateTo')?.value;

    let movs = Storage.list('stockMovements');
    if (articleId) movs = movs.filter(m => m.articleId === articleId);
    if (depotId) movs = movs.filter(m => m.depotId === depotId);
    if (dateFrom) movs = movs.filter(m => m.date >= dateFrom);
    if (dateTo) movs = movs.filter(m => m.date <= dateTo);
    movs.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

    const html = Components.renderTable({
      columns: [
        { key: 'date', label: 'Date', render: r => Utils.formatDate(r.date) },
        { key: 'type', label: 'Type', render: r => r.type === 'in' ? '<span class="badge badge-success">Entrée</span>' : '<span class="badge badge-warning">Sortie</span>' },
        { key: 'docNumber', label: 'Document' },
        { key: 'articleId', label: 'Article', render: r => {
          const a = Storage.get('articles', r.articleId);
          return a ? `${a.code} - ${a.name}` : '—';
        }},
        { key: 'depotId', label: 'Dépôt', render: r => {
          const d = Storage.get('depots', r.depotId);
          return d ? d.name : '—';
        }},
        { key: 'qty', label: 'Quantité', render: r => `<strong>${r.type === 'in' ? '+' : '-'}${Utils.formatNumber(r.qty || r.quantity || 0)}</strong>` },
      ],
      data: movs,
      empty: 'Aucun mouvement',
    });
    document.getElementById('movementsTableContainer').innerHTML = html;
  },

  openArticleForm(id = null) {
    const article = id ? Storage.get('articles', id) : { active: true, unit: 'T', minStock: 0 };
    Components.openModal({
      title: id ? 'Modifier article' : 'Nouvel article',
      body: `
        <form id="articleForm">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Code *</label>
              <input type="text" class="form-control" name="code" value="${article.code || ''}" required>
            </div>
            <div class="form-group">
              <label class="form-label">Désignation *</label>
              <input type="text" class="form-control" name="name" value="${article.name || ''}" required>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Catégorie</label>
              <input type="text" class="form-control" name="category" value="${article.category || ''}">
            </div>
            <div class="form-group">
              <label class="form-label">Unité</label>
              <select class="form-control" name="unit">
                ${['T', 'KG', 'M3', 'L', 'U', 'CT'].map(u => `<option value="${u}" ${article.unit === u ? 'selected' : ''}>${u}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Stock minimum</label>
              <input type="number" step="0.001" class="form-control" name="minStock" value="${article.minStock || 0}">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Description</label>
            <textarea class="form-control" name="description" rows="2">${article.description || ''}</textarea>
          </div>
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" name="active" ${article.active ? 'checked' : ''}> Article actif
            </label>
          </div>
        </form>
      `,
      onSave: () => {
        const data = Utils.formData('articleForm');
        data.minStock = parseFloat(data.minStock) || 0;
        data.active = !!data.active;
        if (id) Storage.update('articles', id, data);
        else Storage.create('articles', data);
        Utils.toast(id ? 'Article modifié' : 'Article créé', 'success');
        this.refreshArticles();
        this.refreshStock();
      },
    });
  },

  deleteArticle(id) {
    Components.confirm('Supprimer cet article ?', () => {
      Storage.delete('articles', id);
      Utils.toast('Article supprimé', 'success');
      this.refreshArticles();
      this.refreshStock();
    });
  },

  exportExcel() {
    const depot = Storage.get('depots', this.selectedDepot);
    const articles = Storage.list('articles').filter(a => a.active);
    const data = articles.map(a => ({
      'Code': a.code,
      'Désignation': a.name,
      'Catégorie': a.category || '',
      'Unité': a.unit,
      'Stock réel': Storage.computeStock(a.id, this.selectedDepot),
      'Stock min': a.minStock || 0,
    }));
    Utils.exportExcel(data, `Stock_${depot ? depot.code : 'tous'}_${Utils.today()}`, 'Stock');
  },

  exportPDF() {
    const depot = Storage.get('depots', this.selectedDepot);
    const articles = Storage.list('articles').filter(a => a.active);
    const data = articles.map(a => [
      a.code,
      a.name,
      a.unit,
      Utils.formatNumber(Storage.computeStock(a.id, this.selectedDepot)),
      Utils.formatNumber(a.minStock || 0),
    ]);
    Utils.exportPDF({
      title: 'État du stock',
      subtitle: depot ? `Dépôt : ${depot.code} - ${depot.name}` : 'Tous dépôts',
      headers: ['Code', 'Désignation', 'Unité', 'Stock réel', 'Stock min'],
      data,
      filename: `Stock_${Utils.today()}`,
    });
  },
};
