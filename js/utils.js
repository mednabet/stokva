/* =========================================
   UTILS - Utilitaires partagés
   ========================================= */

const Utils = {

  // ============ FORMATAGE ============

  formatDate(d) {
    if (!d) return '';
    const date = new Date(d);
    if (isNaN(date)) return '';
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  },

  formatDateTime(d) {
    if (!d) return '';
    const date = new Date(d);
    if (isNaN(date)) return '';
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  },

  formatNumber(n, decimals = 2) {
    if (n === null || n === undefined || n === '') return '0';
    const num = parseFloat(n);
    if (isNaN(num)) return '0';
    return num.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  },

  formatCurrency(n) {
    const cur = Storage.db.settings.currency || 'MAD';
    return this.formatNumber(n, 2) + ' ' + cur;
  },

  todayISO() {
    return new Date().toISOString().split('T')[0];
  },

  nowISO() {
    return new Date().toISOString();
  },

  // ============ NUMÉROTATION DOCS ============

  generateDocNumber(entity) {
    const prefixMap = {
      reception: Storage.db.settings.receptionPrefix || 'BR',
      expedition: Storage.db.settings.expeditionPrefix || 'BL',
      weighing: Storage.db.settings.weighingPrefix || 'PB'
    };
    const prefix = prefixMap[entity] || entity.toUpperCase().substring(0, 2);
    const year = new Date().getFullYear();
    const seq = Storage.nextSequence(entity);
    return `${prefix}-${year}-${String(seq).padStart(5, '0')}`;
  },

  // ============ TOAST ============

  toast(msg, type = 'info', title = '') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = { success: 'check-circle', error: 'circle-exclamation', warning: 'triangle-exclamation', info: 'circle-info' };
    const titles = { success: 'Succès', error: 'Erreur', warning: 'Attention', info: 'Information' };

    toast.innerHTML = `
      <div class="toast-icon"><i class="fas fa-${icons[type] || icons.info}"></i></div>
      <div class="toast-content">
        <div class="toast-title">${title || titles[type] || ''}</div>
        <div class="toast-msg">${this.escapeHtml(msg)}</div>
      </div>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  },

  // ============ CONFIRMATION ============

  async confirm(message, title = 'Confirmation') {
    return new Promise(resolve => {
      const html = `
        <div class="modal-overlay" id="confirmModal">
          <div class="modal small">
            <div class="modal-header">
              <div class="modal-title"><i class="fas fa-circle-question"></i>${this.escapeHtml(title)}</div>
            </div>
            <div class="modal-body">${this.escapeHtml(message)}</div>
            <div class="modal-footer">
              <button class="btn btn-secondary" id="confirmCancel">Annuler</button>
              <button class="btn btn-danger" id="confirmOk">Confirmer</button>
            </div>
          </div>
        </div>
      `;
      const cont = document.getElementById('modalContainer');
      cont.innerHTML = html;
      const modal = document.getElementById('confirmModal');
      const close = (val) => { modal.remove(); resolve(val); };
      document.getElementById('confirmOk').onclick = () => close(true);
      document.getElementById('confirmCancel').onclick = () => close(false);
      modal.addEventListener('click', (e) => { if (e.target === modal) close(false); });
    });
  },

  // ============ HTML ESCAPE ============

  escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  // ============ EXPORT EXCEL ============

  exportExcel(filename, sheets) {
    // sheets: [{ name, data: [[row1], [row2]] }]
    const wb = XLSX.utils.book_new();
    sheets.forEach(s => {
      const ws = XLSX.utils.aoa_to_sheet(s.data);
      // Largeurs de colonnes auto
      if (s.data.length > 0) {
        const widths = s.data[0].map((_, i) => {
          const maxLen = Math.max(...s.data.map(row => String(row[i] || '').length));
          return { wch: Math.min(Math.max(maxLen + 2, 10), 40) };
        });
        ws['!cols'] = widths;
      }
      XLSX.utils.book_append_sheet(wb, ws, s.name.substring(0, 31));
    });
    XLSX.writeFile(wb, filename);
  },

  // ============ EXPORT PDF ============

  exportPDF(title, columns, rows, options = {}) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF(options.orientation || 'portrait', 'mm', 'a4');
    const settings = Storage.db.settings;

    // Header
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(settings.companyName || 'NETPROCESS', 14, 18);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    if (settings.companyAddress) doc.text(settings.companyAddress, 14, 24);
    if (settings.companyPhone) doc.text('Tél: ' + settings.companyPhone, 14, 29);

    // Référence/version (coin droit)
    doc.setFontSize(8);
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.text(`Réf: ${settings.documentReference || 'EN 07-O04'}`, pageWidth - 14, 18, { align: 'right' });
    doc.text(`Version: ${settings.documentVersion || '01'}`, pageWidth - 14, 22, { align: 'right' });
    doc.text(`Date: ${Utils.formatDate(new Date())}`, pageWidth - 14, 26, { align: 'right' });

    // Titre
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(title, pageWidth / 2, 40, { align: 'center' });

    // Sous-titre
    if (options.subtitle) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(options.subtitle, pageWidth / 2, 46, { align: 'center' });
    }

    // Table
    doc.autoTable({
      head: [columns],
      body: rows,
      startY: options.subtitle ? 52 : 46,
      theme: 'grid',
      headStyles: { fillColor: [15, 76, 129], textColor: 255, fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      margin: { left: 10, right: 10 },
      didDrawPage: (data) => {
        // Footer
        const pageCount = doc.internal.getNumberOfPages();
        doc.setFontSize(7);
        doc.setTextColor(120);
        doc.text(
          `Page ${data.pageNumber} / ${pageCount}  -  Généré le ${Utils.formatDateTime(new Date())} par STOKVA`,
          pageWidth / 2,
          doc.internal.pageSize.getHeight() - 8,
          { align: 'center' }
        );
      }
    });

    // Totaux
    if (options.totals) {
      const finalY = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      let y = finalY;
      options.totals.forEach(t => {
        doc.text(`${t.label}: ${t.value}`, pageWidth - 14, y, { align: 'right' });
        y += 5;
      });
    }

    doc.save(`${title.replace(/\s+/g, '_')}_${Utils.todayISO()}.pdf`);
  },

  // ============ IMPRESSION BON ============

  printDocument(title, htmlContent) {
    const settings = Storage.db.settings;
    const win = window.open('', '_blank', 'width=800,height=900');
    win.document.write(`
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <title>${this.escapeHtml(title)}</title>
        <style>
          @page { margin: 15mm; }
          body { font-family: 'Helvetica', Arial, sans-serif; color: #000; font-size: 12px; padding: 0; }
          .doc-header { display: flex; justify-content: space-between; border-bottom: 2px solid #0f4c81; padding-bottom: 10px; margin-bottom: 16px; }
          .company-info h1 { font-size: 18px; color: #0f4c81; margin-bottom: 4px; }
          .company-info p { font-size: 10px; color: #555; }
          .doc-ref { text-align: right; font-size: 9px; color: #666; }
          .doc-ref strong { color: #000; }
          .doc-title { text-align: center; font-size: 18px; font-weight: bold; margin: 16px 0; padding: 8px; border: 2px solid #0f4c81; background: #f0f7fc; }
          .doc-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
          .meta-block { border: 1px solid #ddd; padding: 8px; }
          .meta-block h4 { font-size: 10px; text-transform: uppercase; color: #0f4c81; margin-bottom: 4px; }
          .meta-block p { margin: 2px 0; font-size: 11px; }
          table { width: 100%; border-collapse: collapse; margin: 12px 0; }
          th, td { padding: 8px; border: 1px solid #ccc; text-align: left; font-size: 11px; }
          th { background: #0f4c81; color: white; font-size: 10px; text-transform: uppercase; }
          tfoot td { background: #f0f7fc; font-weight: bold; }
          .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 30px; margin-top: 50px; }
          .signature { text-align: center; }
          .signature .line { border-top: 1px solid #000; padding-top: 4px; font-size: 11px; font-weight: bold; }
          .footer { margin-top: 30px; padding-top: 8px; border-top: 1px solid #ccc; font-size: 9px; color: #666; text-align: center; }
          @media print { body { padding: 0; } .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="doc-header">
          <div class="company-info">
            <h1>${this.escapeHtml(settings.companyName || 'NETPROCESS')}</h1>
            ${settings.companyAddress ? `<p>${this.escapeHtml(settings.companyAddress)}</p>` : ''}
            ${settings.companyPhone ? `<p>Tél: ${this.escapeHtml(settings.companyPhone)}</p>` : ''}
            ${settings.companyEmail ? `<p>Email: ${this.escapeHtml(settings.companyEmail)}</p>` : ''}
            ${settings.companyICE ? `<p>ICE: ${this.escapeHtml(settings.companyICE)}</p>` : ''}
          </div>
          <div class="doc-ref">
            <p><strong>Référence:</strong> ${this.escapeHtml(settings.documentReference || 'EN 07-O04')}</p>
            <p><strong>Version:</strong> ${this.escapeHtml(settings.documentVersion || '01')}</p>
            <p><strong>Date édition:</strong> ${this.formatDateTime(new Date())}</p>
          </div>
        </div>
        ${htmlContent}
        <div class="footer">
          Document généré par STOKVA · by NETPROCESS
        </div>
        <script>
          window.onload = () => { window.print(); };
        </script>
      </body>
      </html>
    `);
    win.document.close();
  },

  // ============ DEBOUNCE ============

  debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  },

  // ============ FILTRES DATE ============

  filterByDateRange(items, dateField, from, to) {
    return items.filter(item => {
      const d = item[dateField];
      if (!d) return false;
      const dt = new Date(d).getTime();
      const fromOk = !from || dt >= new Date(from).getTime();
      const toOk = !to || dt <= new Date(to + 'T23:59:59').getTime();
      return fromOk && toOk;
    });
  },

  // ============ FILTRE TEXTE GENERIQUE ============

  filterByText(items, searchText, fields) {
    if (!searchText) return items;
    const q = searchText.toLowerCase();
    return items.filter(item =>
      fields.some(f => {
        const v = item[f];
        return v && String(v).toLowerCase().includes(q);
      })
    );
  },

  // ============ HELPERS FORMULAIRES ============

  formData(formId) {
    const form = document.getElementById(formId);
    if (!form) return {};
    const result = {};
    Array.from(form.elements).forEach(el => {
      if (!el.name) return;
      if (el.type === 'checkbox') {
        result[el.name] = el.checked;
      } else if (el.type === 'radio') {
        if (el.checked) result[el.name] = el.value;
      } else if (el.tagName === 'SELECT' && el.multiple) {
        result[el.name] = Array.from(el.selectedOptions).map(o => o.value);
      } else {
        result[el.name] = el.value;
      }
    });
    return result;
  },

  today() {
    return this.todayISO();
  }
};

// ============ WRAPPERS POUR API SIMPLE ============
// Permet aux pages d'appeler exportExcel(data, filename, sheet)
// avec data = [{col1:val, col2:val}, ...] (objets)
// au lieu de la signature originelle exportExcel(filename, sheets)
(function() {
  const _origExportExcel = Utils.exportExcel.bind(Utils);
  Utils.exportExcel = function(arg1, arg2, arg3) {
    // Détection : si arg1 est un tableau d'objets, c'est la nouvelle API
    if (Array.isArray(arg1)) {
      const data = arg1;
      const filename = (arg2 || 'export') + '.xlsx';
      const sheetName = arg3 || 'Feuille1';
      if (data.length === 0) {
        return _origExportExcel(filename, [{ name: sheetName, data: [['(vide)']] }]);
      }
      const headers = Object.keys(data[0]);
      const aoa = [headers].concat(data.map(row => headers.map(h => row[h] !== undefined ? row[h] : '')));
      return _origExportExcel(filename, [{ name: sheetName, data: aoa }]);
    }
    // Sinon ancienne signature (filename, sheets)
    return _origExportExcel(arg1, arg2);
  };

  // Wrapper exportPDF : nouvelle API objet { title, subtitle, headers, data, filename, orientation }
  const _origExportPDF = Utils.exportPDF.bind(Utils);
  Utils.exportPDF = function(arg1, arg2, arg3, arg4) {
    if (typeof arg1 === 'object' && arg1 !== null && !Array.isArray(arg1)) {
      const o = arg1;
      const opts = { subtitle: o.subtitle, orientation: o.orientation || 'landscape' };
      if (o.totals) opts.totals = o.totals;
      // Les filename sont gérés dans _origExportPDF (suffixe .pdf + date)
      return _origExportPDF(o.title || 'Rapport', o.headers || [], o.data || [], opts);
    }
    return _origExportPDF(arg1, arg2, arg3, arg4);
  };
})();
