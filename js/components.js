/* =========================================
   COMPONENTS - composants UI réutilisables
   ========================================= */

const Components = {

  // ============ MODAL ============
  
  openModal({ title, icon = 'edit', body, footer, size = '', onClose }) {
    const html = `
      <div class="modal-overlay" id="appModal">
        <div class="modal ${size}">
          <div class="modal-header">
            <div class="modal-title"><i class="fas fa-${icon}"></i>${Utils.escapeHtml(title)}</div>
            <button class="modal-close" id="modalCloseBtn"><i class="fas fa-times"></i></button>
          </div>
          <div class="modal-body">${body}</div>
          ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
        </div>
      </div>
    `;
    const cont = document.getElementById('modalContainer');
    cont.innerHTML = html;
    const modal = document.getElementById('appModal');
    const close = () => { modal.remove(); if (onClose) onClose(); };
    document.getElementById('modalCloseBtn').onclick = close;
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    return { close };
  },

  closeModal() {
    const m = document.getElementById('appModal');
    if (m) m.remove();
  },

  // ============ TABLE GENERIQUE ============

  renderTable({ columns, rows, actions = [], emptyMessage = 'Aucune donnée', rowKey = 'id' }) {
    if (!rows || rows.length === 0) {
      return `<div class="table-empty"><i class="fas fa-inbox"></i><p>${Utils.escapeHtml(emptyMessage)}</p></div>`;
    }

    const head = columns.map(c => `<th>${Utils.escapeHtml(c.label)}</th>`).join('');
    const actionsHead = actions.length > 0 ? '<th style="width:1%;text-align:right">Actions</th>' : '';

    const body = rows.map(row => {
      const cells = columns.map(c => {
        let val = c.render ? c.render(row) : (row[c.field] ?? '');
        return `<td${c.style ? ` style="${c.style}"` : ''}>${val}</td>`;
      }).join('');

      const actCells = actions.length > 0 ? 
        `<td class="text-right"><div class="action-cell" style="justify-content:flex-end">${
          actions.map(a => 
            `<button class="${a.class || 'btn-ghost'}" data-action="${a.key}" data-id="${row[rowKey]}" title="${Utils.escapeHtml(a.label || '')}">
              <i class="fas fa-${a.icon}"></i>
            </button>`
          ).join('')
        }</div></td>` : '';

      return `<tr data-id="${row[rowKey]}">${cells}${actCells}</tr>`;
    }).join('');

    return `
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr>${head}${actionsHead}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `;
  },

  // ============ TOOLBAR DE TABLEAU ============

  renderToolbar({ searchPlaceholder = 'Rechercher...', filters = [], actions = [] }) {
    const filtersHtml = filters.map(f => {
      if (f.type === 'select') {
        const opts = f.options.map(o => `<option value="${Utils.escapeHtml(o.value)}">${Utils.escapeHtml(o.label)}</option>`).join('');
        return `<select id="${f.id}" class="filter-select" style="padding:9px 12px;border:1px solid var(--border-strong);border-radius:var(--radius);font-size:13px;background:var(--bg);color:var(--text)">${opts}</select>`;
      }
      if (f.type === 'date') {
        return `<input type="date" id="${f.id}" placeholder="${f.placeholder||''}" style="padding:9px 12px;border:1px solid var(--border-strong);border-radius:var(--radius);font-size:13px;background:var(--bg);color:var(--text)">`;
      }
      return '';
    }).join('');

    const actionsHtml = actions.map(a => 
      `<button class="btn ${a.class || 'btn-secondary'}" id="${a.id}"><i class="fas fa-${a.icon}"></i>${Utils.escapeHtml(a.label)}</button>`
    ).join('');

    return `
      <div class="table-toolbar">
        <div class="toolbar-filters">
          <div class="search-input">
            <i class="fas fa-search"></i>
            <input type="text" id="searchInput" placeholder="${Utils.escapeHtml(searchPlaceholder)}">
          </div>
          ${filtersHtml}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${actionsHtml}</div>
      </div>
    `;
  },

  // ============ SELECT D'ENTITES ============

  selectOptions(items, valueField, labelField, selectedId = null, includeEmpty = true) {
    let html = includeEmpty ? '<option value="">-- Sélectionner --</option>' : '';
    items.forEach(item => {
      const sel = item[valueField] == selectedId ? ' selected' : '';
      html += `<option value="${Utils.escapeHtml(item[valueField])}"${sel}>${Utils.escapeHtml(item[labelField])}</option>`;
    });
    return html;
  },

  // ============ STAT CARDS ============

  renderKPI({ label, value, icon, color = '#0f4c81', bg = 'rgba(15, 76, 129, 0.1)', trend = null }) {
    return `
      <div class="kpi-card" style="--accent-color:${color};--accent-bg:${bg}">
        <div class="kpi-icon"><i class="fas fa-${icon}"></i></div>
        <div class="kpi-label">${Utils.escapeHtml(label)}</div>
        <div class="kpi-value">${value}</div>
        ${trend ? `<div class="kpi-trend ${trend.dir}"><i class="fas fa-arrow-${trend.dir==='up'?'up':'down'}"></i> ${trend.text}</div>` : ''}
      </div>
    `;
  },

  // ============ DEPOT SELECTOR ============

  renderDepotSelector(currentDepotId, includeAll = true) {
    const depots = Storage.list('depots').filter(d => d.active);
    let opts = includeAll ? '<option value="all">Tous les dépôts</option>' : '';
    depots.forEach(d => {
      const sel = d.id == currentDepotId ? ' selected' : '';
      opts += `<option value="${d.id}"${sel}>${Utils.escapeHtml(d.name)}</option>`;
    });
    return `
      <div class="depot-selector">
        <div>
          <i class="fas fa-warehouse"></i>
          <span style="margin-left:8px;font-weight:600">Dépôt:</span>
        </div>
        <select id="depotSelector">${opts}</select>
      </div>
    `;
  }
};
