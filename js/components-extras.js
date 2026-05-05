/* =========================================
   COMPONENTS EXTRAS - Wrappers de compatibilité
   Permet aux nouvelles pages d'utiliser une API
   plus simple : data/empty/key/onClick/onSave
   ========================================= */

(function() {
  if (typeof Components === 'undefined') return;

  // ----- renderTable wrapper -----
  const _origRender = Components.renderTable.bind(Components);
  // Map global handlers : containerId -> action callbacks
  if (!window.__tblHandlers) window.__tblHandlers = {};

  Components.renderTable = function(opts) {
    const norm = { ...opts };
    if (norm.data && !norm.rows) norm.rows = norm.data;
    if (norm.empty && !norm.emptyMessage) norm.emptyMessage = norm.empty;

    if (Array.isArray(norm.columns)) {
      norm.columns = norm.columns.map(c => {
        const out = { ...c };
        if (out.key && !out.field) out.field = out.key;
        return out;
      });
    }

    let containerId = null;
    if (Array.isArray(norm.actions) && norm.actions.length > 0 && norm.actions[0].onClick) {
      containerId = 'tbl_' + Math.random().toString(36).slice(2, 9);
      const handlers = {};
      norm.actions = norm.actions.map((a, i) => {
        const key = 'act' + i;
        handlers[key] = a.onClick;
        return {
          key,
          icon: (a.icon || '').replace(/^fa-/, ''),
          label: a.title || a.label || '',
          class: a.danger ? 'btn-ghost' : 'btn-ghost'
        };
      });
      window.__tblHandlers[containerId] = handlers;
    }

    let html = _origRender(norm);

    if (containerId) {
      html = `<div id="${containerId}" data-tbl-container="1">${html}</div>`;
      // attacher le listener une seule fois (delegation globale)
      if (!window.__tblHandlersBound) {
        window.__tblHandlersBound = true;
        document.addEventListener('click', e => {
          const btn = e.target.closest('button[data-action]');
          if (!btn) return;
          const wrap = btn.closest('[data-tbl-container]');
          if (!wrap) return;
          const handlers = window.__tblHandlers[wrap.id];
          if (!handlers) return;
          const action = btn.getAttribute('data-action');
          const idRaw = btn.getAttribute('data-id');
          const id = isNaN(parseInt(idRaw)) ? idRaw : parseInt(idRaw);
          if (handlers[action]) handlers[action](id);
        });
      }
    }

    return html;
  };

  // ----- confirm wrapper -----
  if (!Components.confirm) {
    Components.confirm = function(message, callback) {
      Utils.confirm(message).then(ok => { if (ok && callback) callback(); });
    };
  }

  // ----- openModal wrapper avec onSave -----
  const _origOpenModal = Components.openModal.bind(Components);
  Components.openModal = function(opts) {
    if (opts.onSave && !opts.footer) {
      const saveId = 'mSave_' + Math.random().toString(36).slice(2, 7);
      const cancelId = 'mCancel_' + Math.random().toString(36).slice(2, 7);
      const newOpts = {
        ...opts,
        footer: `
          <button class="btn btn-secondary" id="${cancelId}">Annuler</button>
          <button class="btn btn-primary" id="${saveId}"><i class="fas fa-save"></i> Enregistrer</button>
        `
      };
      const m = _origOpenModal(newOpts);
      const cancelBtn = document.getElementById(cancelId);
      const saveBtn = document.getElementById(saveId);
      if (cancelBtn) cancelBtn.onclick = () => m.close();
      if (saveBtn) saveBtn.onclick = () => {
        try {
          const result = opts.onSave();
          if (result !== false) m.close();
        } catch (err) {
          console.error('onSave error:', err);
          Utils.toast(err.message || 'Erreur lors de l\'enregistrement', 'error');
        }
      };
      return m;
    }
    return _origOpenModal(opts);
  };
})();
