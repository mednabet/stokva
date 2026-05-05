-- ============================================
-- STOKVA — Migration 004 : moteur de paramétrage
-- by NETPROCESS
-- ============================================
-- Ajoute :
-- 1) Table `settings` à 3 niveaux (société / dépôt / article)
--    avec fallback automatique Article > Dépôt > Société
-- 2) Table `custom_fields` pour définir des champs personnalisés
--    sur réceptions / expéditions / transferts / pesées
-- 3) Colonne `custom_data` JSONB sur les documents
-- 4) Fonction `get_setting()` qui résout la cascade
-- ============================================

-- --------------------------------------------
-- 1. Table settings
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
    id          SERIAL PRIMARY KEY,
    scope       VARCHAR(20) NOT NULL CHECK (scope IN ('company', 'depot', 'article')),
    scope_id    INTEGER,                       -- NULL si scope=company
    key         VARCHAR(100) NOT NULL,
    value       JSONB NOT NULL,
    description TEXT,
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE (scope, scope_id, key)
);
CREATE INDEX IF NOT EXISTS idx_settings_lookup ON settings(scope, scope_id, key);
CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);

-- Cohérence : scope_id obligatoire sauf pour scope=company
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_scope_id_check;
ALTER TABLE settings ADD CONSTRAINT settings_scope_id_check CHECK (
    (scope = 'company' AND scope_id IS NULL) OR
    (scope <> 'company' AND scope_id IS NOT NULL)
);

-- Trigger updated_at
DROP TRIGGER IF EXISTS set_updated_at ON settings;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON settings
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- --------------------------------------------
-- 2. Fonction de résolution avec fallback
-- --------------------------------------------
-- Cascade : article (si fourni) → dépôt (si fourni) → société → defaut
CREATE OR REPLACE FUNCTION get_setting(
    p_key        VARCHAR,
    p_depot_id   INTEGER DEFAULT NULL,
    p_article_id INTEGER DEFAULT NULL,
    p_default    JSONB   DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v JSONB;
BEGIN
    -- Niveau 1 : article
    IF p_article_id IS NOT NULL THEN
        SELECT value INTO v FROM settings
        WHERE scope = 'article' AND scope_id = p_article_id AND key = p_key;
        IF v IS NOT NULL THEN RETURN v; END IF;
    END IF;
    -- Niveau 2 : dépôt
    IF p_depot_id IS NOT NULL THEN
        SELECT value INTO v FROM settings
        WHERE scope = 'depot' AND scope_id = p_depot_id AND key = p_key;
        IF v IS NOT NULL THEN RETURN v; END IF;
    END IF;
    -- Niveau 3 : société
    SELECT value INTO v FROM settings
    WHERE scope = 'company' AND scope_id IS NULL AND key = p_key;
    IF v IS NOT NULL THEN RETURN v; END IF;

    RETURN p_default;
END;
$$ LANGUAGE plpgsql STABLE;

-- --------------------------------------------
-- 3. Champs personnalisés
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS custom_fields (
    id            SERIAL PRIMARY KEY,
    entity        VARCHAR(30) NOT NULL CHECK (entity IN ('reception','expedition','transfer','weighing','partner','article','vehicle')),
    code          VARCHAR(50) NOT NULL,           -- clé technique (ex: 'numero_lot')
    label         VARCHAR(150) NOT NULL,          -- libellé UI (ex: 'Numéro de lot')
    field_type    VARCHAR(20) NOT NULL CHECK (field_type IN ('text','number','date','datetime','boolean','select','multiselect')),
    required      BOOLEAN DEFAULT FALSE,
    -- Validation
    min_value     NUMERIC,
    max_value     NUMERIC,
    min_length    INTEGER,
    max_length    INTEGER,
    pattern       TEXT,                            -- regex pour text
    options       JSONB,                           -- pour select/multiselect : ["a","b","c"]
    -- Conditionnel : si requis selon une condition (ex: depot_id=1)
    required_when JSONB,                           -- {"depot_id": 1} → required si depot_id=1
    default_value JSONB,
    help_text     TEXT,
    display_order INTEGER DEFAULT 100,
    active        BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (entity, code)
);
CREATE INDEX IF NOT EXISTS idx_custom_fields_entity ON custom_fields(entity, active);

DROP TRIGGER IF EXISTS set_updated_at ON custom_fields;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON custom_fields
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- --------------------------------------------
-- 4. Colonnes custom_data sur les documents
-- --------------------------------------------
ALTER TABLE receptions  ADD COLUMN IF NOT EXISTS custom_data JSONB DEFAULT '{}'::jsonb;
ALTER TABLE expeditions ADD COLUMN IF NOT EXISTS custom_data JSONB DEFAULT '{}'::jsonb;
ALTER TABLE transfers   ADD COLUMN IF NOT EXISTS custom_data JSONB DEFAULT '{}'::jsonb;
ALTER TABLE weighings   ADD COLUMN IF NOT EXISTS custom_data JSONB DEFAULT '{}'::jsonb;

-- Champs sur articles : type de pesage par défaut, contrôles physiques, etc.
ALTER TABLE articles ADD COLUMN IF NOT EXISTS allow_negative_stock BOOLEAN;
-- NULL = utilise le paramètre dépôt/société

-- Champs sur dépôts : autorisation stock négatif
ALTER TABLE depots ADD COLUMN IF NOT EXISTS allow_negative_stock BOOLEAN;
-- NULL = utilise le paramètre société

-- --------------------------------------------
-- 5. Paramètres par défaut société (seed initial)
-- --------------------------------------------
INSERT INTO settings (scope, scope_id, key, value, description) VALUES
-- ----- Stock -----
('company', NULL, 'stock.allow_negative',         'false'::jsonb,
 'Autoriser le stock négatif (peut être surchargé par dépôt et par article)'),
('company', NULL, 'stock.warn_below_min',         'true'::jsonb,
 'Émettre une alerte WS quand un article descend sous son stock minimum'),
('company', NULL, 'stock.block_on_low',           'false'::jsonb,
 'Bloquer les expéditions si le stock résultant descendrait sous le minimum'),

-- ----- Pesées (pont-bascule) -----
('company', NULL, 'weighing.modes_enabled',       '["simple","manuel","tare_enregistree","2_passes"]'::jsonb,
 'Modes de pesage autorisés. simple=libre, manuel=saisie, tare_enregistree=tare véhicule, 2_passes=brut puis tare'),
('company', NULL, 'weighing.default_mode',        '"2_passes"'::jsonb,
 'Mode par défaut proposé à l''opérateur'),
('company', NULL, 'weighing.min_weight',          '0'::jsonb,
 'Poids minimum accepté (kg). 0 = pas de limite'),
('company', NULL, 'weighing.max_weight',          '60000'::jsonb,
 'Poids maximum accepté (kg)'),
('company', NULL, 'weighing.tare_tolerance_pct',  '5'::jsonb,
 'Tolérance entre tare mesurée et tare véhicule enregistrée (%). Au-delà = avertissement'),
('company', NULL, 'weighing.require_vehicle',     'true'::jsonb,
 'Le véhicule est obligatoire sur une pesée'),
('company', NULL, 'weighing.require_driver',      'false'::jsonb,
 'Le chauffeur est obligatoire sur une pesée'),
('company', NULL, 'weighing.require_partner',     'false'::jsonb,
 'Le partenaire est obligatoire sur une pesée'),
('company', NULL, 'weighing.stable_seconds',      '3'::jsonb,
 'Durée de stabilité requise avant validation auto (secondes)'),

-- ----- Réceptions -----
('company', NULL, 'reception.require_weighing',   'false'::jsonb,
 'Une pesée pont-bascule est obligatoire pour confirmer une réception'),
('company', NULL, 'reception.auto_confirm',       'false'::jsonb,
 'Confirmer automatiquement les réceptions à la création'),
('company', NULL, 'reception.require_unit_price', 'false'::jsonb,
 'Le prix unitaire est obligatoire sur les lignes de réception'),
('company', NULL, 'reception.allow_overweight',   'true'::jsonb,
 'Accepter une quantité supérieure à celle annoncée par le bon fournisseur'),

-- ----- Expéditions -----
('company', NULL, 'expedition.require_weighing',  'false'::jsonb,
 'Une pesée pont-bascule est obligatoire pour confirmer une expédition'),
('company', NULL, 'expedition.require_destination','true'::jsonb,
 'La destination est obligatoire'),
('company', NULL, 'expedition.require_unit_price','true'::jsonb,
 'Le prix unitaire est obligatoire sur les lignes d''expédition'),
('company', NULL, 'expedition.partial_allowed',   'true'::jsonb,
 'Autoriser des expéditions partielles (livrer moins que demandé)'),

-- ----- Transferts -----
('company', NULL, 'transfer.require_weighing',    'false'::jsonb,
 'Pesée obligatoire pour les transferts inter-dépôts'),
('company', NULL, 'transfer.partial_receive_allowed', 'true'::jsonb,
 'Autoriser réception partielle d''un transfert (différence sortie/réception)'),
('company', NULL, 'transfer.tolerate_loss_pct',   '2'::jsonb,
 'Différence acceptable entre quantité envoyée et reçue (%). Au-delà = avertissement'),

-- ----- Numérotation -----
('company', NULL, 'numbering.reset_yearly',       'true'::jsonb,
 'Réinitialiser les compteurs au 1er janvier'),
('company', NULL, 'numbering.padding',            '5'::jsonb,
 'Nombre de chiffres dans la séquence (PB/2026/00001 = 5)')

ON CONFLICT (scope, scope_id, key) DO NOTHING;

-- --------------------------------------------
-- 6. Champs personnalisés d'exemple
-- --------------------------------------------
INSERT INTO custom_fields (entity, code, label, field_type, required, min_length, max_length, help_text, display_order) VALUES
('reception', 'numero_lot',     'Numéro de lot fournisseur', 'text',   FALSE, 1, 50,  'Référence du lot indiquée sur le bon fournisseur', 10),
('reception', 'temperature',    'Température produit (°C)',  'number', FALSE, NULL, NULL, 'Mesurée à réception pour produits sensibles', 20),
('reception', 'controle_qualite','Contrôle qualité OK',       'boolean',FALSE, NULL, NULL, 'Cochez si le contrôle qualité a été validé', 30),
('expedition','reference_client','Référence client',          'text',   FALSE, 1, 60,  'BC client ou commande SAP', 10),
('expedition','urgence',        'Niveau d''urgence',          'select', FALSE, NULL, NULL, NULL, 20)
ON CONFLICT (entity, code) DO NOTHING;

-- Options pour le champ urgence
UPDATE custom_fields
SET options = '["normale","urgent","critique"]'::jsonb,
    default_value = '"normale"'::jsonb
WHERE entity='expedition' AND code='urgence';

-- --------------------------------------------
-- 7. Mode 'libre' à ajouter au CHECK existant sur weighings.mode
-- --------------------------------------------
-- L'ancien CHECK n'autorisait que simulation/manuel/serial.
-- On élargit pour les nouveaux modes.
ALTER TABLE weighings DROP CONSTRAINT IF EXISTS weighings_mode_check;
ALTER TABLE weighings ADD CONSTRAINT weighings_mode_check
    CHECK (mode IN ('simulation','manuel','serial','simple','tare_enregistree','2_passes'));
