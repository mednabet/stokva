// Settings page
const SettingsPage = {
  render() {
    if (!Auth.isAdmin()) {
      return `<div class="empty-state"><i class="fa-solid fa-lock"></i><p>Accès refusé. Réservé aux administrateurs.</p></div>`;
    }
    const s = Storage.getSettings();
    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Paramètres</h1>
          <p class="page-subtitle">Configuration de l'application</p>
        </div>
      </div>

      <div class="tabs">
        <div class="tab active" data-tab="company" onclick="SettingsPage.switchTab('company')">
          <i class="fa-solid fa-building"></i> Société
        </div>
        <div class="tab" data-tab="documents" onclick="SettingsPage.switchTab('documents')">
          <i class="fa-solid fa-file-lines"></i> Documents
        </div>
        <div class="tab" data-tab="weighbridge" onclick="SettingsPage.switchTab('weighbridge')">
          <i class="fa-solid fa-weight-scale"></i> Pont-bascule
        </div>
        <div class="tab" data-tab="backup" onclick="SettingsPage.switchTab('backup')">
          <i class="fa-solid fa-database"></i> Sauvegarde
        </div>
      </div>

      <div id="tabCompany" class="tab-content active">
        <div class="card">
          <div class="card-header"><h3>Informations société</h3></div>
          <div class="card-body">
            <form id="companyForm">
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Nom de la société *</label>
                  <input type="text" class="form-control" name="companyName" value="${s.companyName || 'NETPROCESS'}" required>
                </div>
                <div class="form-group">
                  <label class="form-label">Devise</label>
                  <select class="form-control" name="currency">
                    ${['MAD', 'EUR', 'USD', 'GBP'].map(c => `<option value="${c}" ${s.currency === c ? 'selected' : ''}>${c}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Adresse</label>
                <textarea class="form-control" name="companyAddress" rows="2">${s.companyAddress || ''}</textarea>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Téléphone</label>
                  <input type="text" class="form-control" name="companyPhone" value="${s.companyPhone || ''}">
                </div>
                <div class="form-group">
                  <label class="form-label">Email</label>
                  <input type="email" class="form-control" name="companyEmail" value="${s.companyEmail || ''}">
                </div>
                <div class="form-group">
                  <label class="form-label">Site web</label>
                  <input type="text" class="form-control" name="companyWebsite" value="${s.companyWebsite || ''}">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">ICE</label>
                  <input type="text" class="form-control" name="companyICE" value="${s.companyICE || ''}">
                </div>
                <div class="form-group">
                  <label class="form-label">RC</label>
                  <input type="text" class="form-control" name="companyRC" value="${s.companyRC || ''}">
                </div>
                <div class="form-group">
                  <label class="form-label">IF</label>
                  <input type="text" class="form-control" name="companyTaxId" value="${s.companyTaxId || ''}">
                </div>
                <div class="form-group">
                  <label class="form-label">CNSS</label>
                  <input type="text" class="form-control" name="companyCNSS" value="${s.companyCNSS || ''}">
                </div>
              </div>
              <div class="form-actions">
                <button type="button" class="btn btn-primary" onclick="SettingsPage.saveCompany()">
                  <i class="fa-solid fa-save"></i> Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div id="tabDocuments" class="tab-content">
        <div class="card">
          <div class="card-header"><h3>Préfixes et numérotation</h3></div>
          <div class="card-body">
            <form id="docsForm">
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Référence document</label>
                  <input type="text" class="form-control" name="documentReference" value="${s.documentReference || 'EN 07-O04'}">
                </div>
                <div class="form-group">
                  <label class="form-label">Version</label>
                  <input type="text" class="form-control" name="documentVersion" value="${s.documentVersion || '01'}">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Préfixe Bon de Réception</label>
                  <input type="text" class="form-control" name="prefixReception" value="${s.prefixReception || 'BR'}">
                </div>
                <div class="form-group">
                  <label class="form-label">Préfixe Bon de Livraison</label>
                  <input type="text" class="form-control" name="prefixExpedition" value="${s.prefixExpedition || 'BL'}">
                </div>
                <div class="form-group">
                  <label class="form-label">Préfixe Pesée</label>
                  <input type="text" class="form-control" name="prefixWeighing" value="${s.prefixWeighing || 'PB'}">
                </div>
              </div>
              <div class="form-actions">
                <button type="button" class="btn btn-primary" onclick="SettingsPage.saveDocs()">
                  <i class="fa-solid fa-save"></i> Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div id="tabWeighbridge" class="tab-content">
        <div class="card">
          <div class="card-header"><h3>Configuration pont-bascule</h3></div>
          <div class="card-body">
            <form id="wbForm">
              <div class="alert alert-info">
                <i class="fa-solid fa-circle-info"></i>
                Mode simulation actif. Le poids affiché est généré aléatoirement pour la démonstration.
                Pour un pont-bascule réel, intégrez une passerelle série/réseau retournant le poids en kg.
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Mode</label>
                  <select class="form-control" name="weighbridgeMode">
                    <option value="simulation" ${s.weighbridgeMode === 'simulation' ? 'selected' : ''}>Simulation</option>
                    <option value="manual" ${s.weighbridgeMode === 'manual' ? 'selected' : ''}>Saisie manuelle</option>
                    <option value="serial" ${s.weighbridgeMode === 'serial' ? 'selected' : ''}>Liaison série (avancé)</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Unité</label>
                  <select class="form-control" name="weighbridgeUnit">
                    <option value="kg" ${(s.weighbridgeUnit || 'kg') === 'kg' ? 'selected' : ''}>kg</option>
                    <option value="t" ${s.weighbridgeUnit === 't' ? 'selected' : ''}>t</option>
                  </select>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Capacité max (kg)</label>
                  <input type="number" class="form-control" name="weighbridgeMaxCapacity" value="${s.weighbridgeMaxCapacity || 60000}">
                </div>
                <div class="form-group">
                  <label class="form-label">Précision (kg)</label>
                  <input type="number" class="form-control" name="weighbridgePrecision" value="${s.weighbridgePrecision || 10}">
                </div>
              </div>
              <div class="form-actions">
                <button type="button" class="btn btn-primary" onclick="SettingsPage.saveWeighbridge()">
                  <i class="fa-solid fa-save"></i> Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div id="tabBackup" class="tab-content">
        <div class="card">
          <div class="card-header"><h3>Sauvegarde et restauration</h3></div>
          <div class="card-body">
            <div class="alert alert-warning">
              <i class="fa-solid fa-triangle-exclamation"></i>
              <div>
                <strong>Important :</strong> Les données sont stockées localement dans votre navigateur.
                Pensez à effectuer des sauvegardes régulières et à les conserver dans un endroit sûr.
              </div>
            </div>
            <div class="settings-actions">
              <div class="settings-action">
                <div class="settings-action-icon icon-success">
                  <i class="fa-solid fa-download"></i>
                </div>
                <div class="settings-action-body">
                  <h4>Exporter les données</h4>
                  <p>Télécharge un fichier JSON contenant toutes les données de l'application.</p>
                </div>
                <button class="btn btn-success" onclick="SettingsPage.exportData()">
                  <i class="fa-solid fa-download"></i> Exporter
                </button>
              </div>
              <div class="settings-action">
                <div class="settings-action-icon icon-info">
                  <i class="fa-solid fa-upload"></i>
                </div>
                <div class="settings-action-body">
                  <h4>Importer des données</h4>
                  <p>Restaure une sauvegarde précédente. Les données actuelles seront remplacées.</p>
                </div>
                <input type="file" id="importFile" accept=".json" style="display:none" onchange="SettingsPage.importData(event)">
                <button class="btn btn-info" onclick="document.getElementById('importFile').click()">
                  <i class="fa-solid fa-upload"></i> Importer
                </button>
              </div>
              <div class="settings-action">
                <div class="settings-action-icon icon-danger">
                  <i class="fa-solid fa-trash-can"></i>
                </div>
                <div class="settings-action-body">
                  <h4>Réinitialiser l'application</h4>
                  <p>Supprime toutes les données et restaure la configuration initiale. Action irréversible.</p>
                </div>
                <button class="btn btn-danger" onclick="SettingsPage.resetApp()">
                  <i class="fa-solid fa-trash-can"></i> Réinitialiser
                </button>
              </div>
            </div>
            <div class="storage-info">
              <h4>Utilisation du stockage</h4>
              <div id="storageStats"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  init() {
    if (Auth.isAdmin()) this.refreshStats();
  },

  refreshStats() {
    const el = document.getElementById('storageStats');
    if (!el) return;
    const stats = [
      { label: 'Utilisateurs', count: Storage.list('users').length },
      { label: 'Dépôts', count: Storage.list('depots').length },
      { label: 'Articles', count: Storage.list('articles').length },
      { label: 'Partenaires', count: Storage.list('partners').length },
      { label: 'Véhicules', count: Storage.list('vehicles').length },
      { label: 'Réceptions', count: Storage.list('receptions').length },
      { label: 'Expéditions', count: Storage.list('expeditions').length },
      { label: 'Pesées', count: Storage.list('weighings').length },
      { label: 'Mouvements stock', count: Storage.list('stockMovements').length },
    ];
    const total = JSON.stringify(localStorage).length;
    el.innerHTML = `
      <div class="stats-grid">
        ${stats.map(s => `<div class="stat-item"><span class="stat-label">${s.label}</span><span class="stat-value">${s.count}</span></div>`).join('')}
        <div class="stat-item stat-total"><span class="stat-label">Taille totale</span><span class="stat-value">${(total / 1024).toFixed(1)} Ko</span></div>
      </div>
    `;
  },

  switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');
    if (tab === 'backup') this.refreshStats();
  },

  saveCompany() {
    const data = Utils.formData('companyForm');
    Storage.updateSettings(data);
    Utils.toast('Informations société enregistrées', 'success');
  },

  saveDocs() {
    const data = Utils.formData('docsForm');
    Storage.updateSettings(data);
    Utils.toast('Configuration documents enregistrée', 'success');
  },

  saveWeighbridge() {
    const data = Utils.formData('wbForm');
    data.weighbridgeMaxCapacity = parseFloat(data.weighbridgeMaxCapacity) || 60000;
    data.weighbridgePrecision = parseFloat(data.weighbridgePrecision) || 10;
    Storage.updateSettings(data);
    Utils.toast('Configuration pont-bascule enregistrée', 'success');
  },

  exportData() {
    const data = Storage.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stokva_backup_${Utils.today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    Utils.toast('Sauvegarde téléchargée', 'success');
  },

  importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    Components.confirm(
      'Cette opération va remplacer toutes les données actuelles. Continuer ?',
      () => {
        const reader = new FileReader();
        reader.onload = e => {
          try {
            const data = JSON.parse(e.target.result);
            Storage.importAll(data);
            Utils.toast('Données importées avec succès. Rechargement...', 'success');
            setTimeout(() => location.reload(), 1500);
          } catch (err) {
            Utils.toast('Fichier invalide : ' + err.message, 'error');
          }
        };
        reader.readAsText(file);
      }
    );
    event.target.value = '';
  },

  resetApp() {
    Components.confirm(
      'ATTENTION : Cette action supprimera DÉFINITIVEMENT toutes les données. Continuer ?',
      () => {
        Components.confirm(
          'Dernière confirmation. Êtes-vous absolument certain ?',
          () => {
            Storage.reset();
            Utils.toast('Application réinitialisée. Rechargement...', 'success');
            setTimeout(() => location.reload(), 1500);
          }
        );
      }
    );
  },
};

// Export global pour app.js (les const top-level ne sont pas auto-attachees a window)
window.SettingsPage = SettingsPage;
