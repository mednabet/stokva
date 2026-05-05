-- ============================================
-- STOKVA — Schéma PostgreSQL initial
-- by NETPROCESS — © 2026
-- ============================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- --------------------------------------------
-- 1. Société (mono-tenant pour l'instant, multi-tenant ready)
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS company (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(200) NOT NULL,
    address         TEXT,
    city            VARCHAR(100),
    country         VARCHAR(100) DEFAULT 'Maroc',
    phone           VARCHAR(50),
    email           VARCHAR(150),
    ice             VARCHAR(50),
    rc              VARCHAR(50),
    if_number       VARCHAR(50),
    cnss            VARCHAR(50),
    patente         VARCHAR(50),
    logo_url        TEXT,
    currency        VARCHAR(10) DEFAULT 'MAD',
    prefix_br       VARCHAR(20) DEFAULT 'BR',
    prefix_bl       VARCHAR(20) DEFAULT 'BL',
    prefix_pb       VARCHAR(20) DEFAULT 'PB',
    prefix_tr       VARCHAR(20) DEFAULT 'TR',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- --------------------------------------------
-- 2. Utilisateurs & rôles
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    username        VARCHAR(80) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(200),
    email           VARCHAR(150),
    role            VARCHAR(30) NOT NULL CHECK (role IN ('admin','responsable','operateur','consultation')),
    active          BOOLEAN DEFAULT TRUE,
    last_login      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(active);

-- Sessions / refresh tokens
CREATE TABLE IF NOT EXISTS user_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token   VARCHAR(500) NOT NULL,
    user_agent      TEXT,
    ip              VARCHAR(45),
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(refresh_token);

-- --------------------------------------------
-- 3. Dépôts
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS depots (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(20) UNIQUE NOT NULL,
    name            VARCHAR(150) NOT NULL,
    address         TEXT,
    capacity        NUMERIC(14,2),
    capacity_unit   VARCHAR(20) DEFAULT 'T',
    manager_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    active          BOOLEAN DEFAULT TRUE,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- --------------------------------------------
-- 4. Articles (catalogue)
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS articles (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(50) UNIQUE NOT NULL,
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    unit            VARCHAR(20) DEFAULT 'T',
    stock_min       NUMERIC(14,3) DEFAULT 0,
    unit_price      NUMERIC(14,2) DEFAULT 0,
    category        VARCHAR(80),
    active          BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_articles_code ON articles(code);
CREATE INDEX IF NOT EXISTS idx_articles_active ON articles(active);

-- Stock par dépôt (vue matérialisée logique : table dédiée pour perfs)
CREATE TABLE IF NOT EXISTS stock_levels (
    id              SERIAL PRIMARY KEY,
    depot_id        INTEGER NOT NULL REFERENCES depots(id) ON DELETE CASCADE,
    article_id      INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    quantity        NUMERIC(14,3) NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (depot_id, article_id)
);
CREATE INDEX IF NOT EXISTS idx_stock_depot ON stock_levels(depot_id);
CREATE INDEX IF NOT EXISTS idx_stock_article ON stock_levels(article_id);

-- --------------------------------------------
-- 5. Partenaires (fournisseurs / clients / mixtes)
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS partners (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(30) UNIQUE,
    name            VARCHAR(200) NOT NULL,
    type            VARCHAR(20) NOT NULL CHECK (type IN ('fournisseur','client','mixte')),
    address         TEXT,
    city            VARCHAR(100),
    phone           VARCHAR(50),
    email           VARCHAR(150),
    ice             VARCHAR(50),
    rc              VARCHAR(50),
    if_number       VARCHAR(50),
    contact_person  VARCHAR(150),
    notes           TEXT,
    active          BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_partners_type ON partners(type);
CREATE INDEX IF NOT EXISTS idx_partners_name ON partners(name);

-- --------------------------------------------
-- 6. Véhicules + chauffeurs
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS drivers (
    id              SERIAL PRIMARY KEY,
    full_name       VARCHAR(200) NOT NULL,
    cin             VARCHAR(50),
    license_number  VARCHAR(50),
    phone           VARCHAR(50),
    active          BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vehicles (
    id              SERIAL PRIMARY KEY,
    plate           VARCHAR(30) UNIQUE NOT NULL,
    brand           VARCHAR(80),
    model           VARCHAR(80),
    tare            NUMERIC(14,3) DEFAULT 0,
    max_load        NUMERIC(14,3),
    default_driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
    partner_id      INTEGER REFERENCES partners(id) ON DELETE SET NULL,
    active          BOOLEAN DEFAULT TRUE,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vehicles_plate ON vehicles(plate);

-- --------------------------------------------
-- 7. Pesées (pont-bascule)
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS weighings (
    id              SERIAL PRIMARY KEY,
    number          VARCHAR(30) UNIQUE NOT NULL,
    weighing_date   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    vehicle_id      INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
    plate           VARCHAR(30),
    driver_id       INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
    driver_name     VARCHAR(200),
    partner_id      INTEGER REFERENCES partners(id) ON DELETE SET NULL,
    article_id      INTEGER REFERENCES articles(id) ON DELETE SET NULL,
    gross_weight    NUMERIC(14,3),
    tare_weight     NUMERIC(14,3),
    net_weight      NUMERIC(14,3) GENERATED ALWAYS AS (gross_weight - tare_weight) STORED,
    mode            VARCHAR(20) CHECK (mode IN ('simulation','manuel','serial')),
    state           VARCHAR(20) DEFAULT 'draft' CHECK (state IN ('draft','first_pass','done','cancelled')),
    operation_type  VARCHAR(20) CHECK (operation_type IN ('reception','expedition','transfer')),
    user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_weighings_date ON weighings(weighing_date);
CREATE INDEX IF NOT EXISTS idx_weighings_state ON weighings(state);
CREATE INDEX IF NOT EXISTS idx_weighings_vehicle ON weighings(vehicle_id);

-- --------------------------------------------
-- 8. Réceptions (BR)
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS receptions (
    id              SERIAL PRIMARY KEY,
    number          VARCHAR(30) UNIQUE NOT NULL,
    reception_date  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    depot_id        INTEGER NOT NULL REFERENCES depots(id) ON DELETE RESTRICT,
    partner_id      INTEGER NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,
    vehicle_id      INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
    plate           VARCHAR(30),
    driver_id       INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
    driver_name     VARCHAR(200),
    weighing_id     INTEGER REFERENCES weighings(id) ON DELETE SET NULL,
    state           VARCHAR(20) DEFAULT 'draft' CHECK (state IN ('draft','confirmed','cancelled')),
    total_quantity  NUMERIC(14,3) DEFAULT 0,
    total_amount    NUMERIC(16,2) DEFAULT 0,
    user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_receptions_date ON receptions(reception_date);
CREATE INDEX IF NOT EXISTS idx_receptions_partner ON receptions(partner_id);
CREATE INDEX IF NOT EXISTS idx_receptions_state ON receptions(state);

CREATE TABLE IF NOT EXISTS reception_lines (
    id              SERIAL PRIMARY KEY,
    reception_id    INTEGER NOT NULL REFERENCES receptions(id) ON DELETE CASCADE,
    article_id      INTEGER NOT NULL REFERENCES articles(id) ON DELETE RESTRICT,
    quantity        NUMERIC(14,3) NOT NULL,
    unit_price      NUMERIC(14,2) DEFAULT 0,
    subtotal        NUMERIC(16,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    notes           TEXT
);
CREATE INDEX IF NOT EXISTS idx_reception_lines_reception ON reception_lines(reception_id);

-- --------------------------------------------
-- 9. Expéditions (BL)
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS expeditions (
    id              SERIAL PRIMARY KEY,
    number          VARCHAR(30) UNIQUE NOT NULL,
    expedition_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    depot_id        INTEGER NOT NULL REFERENCES depots(id) ON DELETE RESTRICT,
    partner_id      INTEGER NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,
    destination     VARCHAR(200),
    vehicle_id      INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
    plate           VARCHAR(30),
    driver_id       INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
    driver_name     VARCHAR(200),
    weighing_id     INTEGER REFERENCES weighings(id) ON DELETE SET NULL,
    state           VARCHAR(20) DEFAULT 'draft' CHECK (state IN ('draft','confirmed','cancelled')),
    total_quantity  NUMERIC(14,3) DEFAULT 0,
    total_amount    NUMERIC(16,2) DEFAULT 0,
    user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_expeditions_date ON expeditions(expedition_date);
CREATE INDEX IF NOT EXISTS idx_expeditions_partner ON expeditions(partner_id);
CREATE INDEX IF NOT EXISTS idx_expeditions_state ON expeditions(state);

CREATE TABLE IF NOT EXISTS expedition_lines (
    id              SERIAL PRIMARY KEY,
    expedition_id   INTEGER NOT NULL REFERENCES expeditions(id) ON DELETE CASCADE,
    article_id      INTEGER NOT NULL REFERENCES articles(id) ON DELETE RESTRICT,
    quantity        NUMERIC(14,3) NOT NULL,
    unit_price      NUMERIC(14,2) DEFAULT 0,
    subtotal        NUMERIC(16,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    notes           TEXT
);
CREATE INDEX IF NOT EXISTS idx_expedition_lines_expedition ON expedition_lines(expedition_id);

-- --------------------------------------------
-- 10. Transferts inter-dépôts
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS transfers (
    id              SERIAL PRIMARY KEY,
    number          VARCHAR(30) UNIQUE NOT NULL,
    transfer_date   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    depot_from_id   INTEGER NOT NULL REFERENCES depots(id) ON DELETE RESTRICT,
    depot_to_id     INTEGER NOT NULL REFERENCES depots(id) ON DELETE RESTRICT,
    vehicle_id      INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
    plate           VARCHAR(30),
    driver_id       INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
    driver_name     VARCHAR(200),
    weighing_id     INTEGER REFERENCES weighings(id) ON DELETE SET NULL,
    state           VARCHAR(20) DEFAULT 'draft' CHECK (state IN ('draft','in_transit','received','cancelled')),
    received_at     TIMESTAMPTZ,
    received_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    CHECK (depot_from_id <> depot_to_id)
);
CREATE INDEX IF NOT EXISTS idx_transfers_date ON transfers(transfer_date);
CREATE INDEX IF NOT EXISTS idx_transfers_state ON transfers(state);

CREATE TABLE IF NOT EXISTS transfer_lines (
    id              SERIAL PRIMARY KEY,
    transfer_id     INTEGER NOT NULL REFERENCES transfers(id) ON DELETE CASCADE,
    article_id      INTEGER NOT NULL REFERENCES articles(id) ON DELETE RESTRICT,
    quantity_sent   NUMERIC(14,3) NOT NULL,
    quantity_received NUMERIC(14,3),
    notes           TEXT
);
CREATE INDEX IF NOT EXISTS idx_transfer_lines_transfer ON transfer_lines(transfer_id);

-- --------------------------------------------
-- 11. Mouvements de stock (audit complet)
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS stock_moves (
    id              SERIAL PRIMARY KEY,
    move_date       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    depot_id        INTEGER NOT NULL REFERENCES depots(id) ON DELETE RESTRICT,
    article_id      INTEGER NOT NULL REFERENCES articles(id) ON DELETE RESTRICT,
    move_type       VARCHAR(20) NOT NULL CHECK (move_type IN ('in','out','adjust','transfer_out','transfer_in')),
    quantity        NUMERIC(14,3) NOT NULL,
    source_model    VARCHAR(50),
    source_id       INTEGER,
    user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stock_moves_date ON stock_moves(move_date);
CREATE INDEX IF NOT EXISTS idx_stock_moves_depot_article ON stock_moves(depot_id, article_id);
CREATE INDEX IF NOT EXISTS idx_stock_moves_source ON stock_moves(source_model, source_id);

-- --------------------------------------------
-- 12. Audit log (sécurité)
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
    id              BIGSERIAL PRIMARY KEY,
    user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action          VARCHAR(50) NOT NULL,
    entity          VARCHAR(50),
    entity_id       INTEGER,
    payload         JSONB,
    ip              VARCHAR(45),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_date ON audit_log(created_at);

-- --------------------------------------------
-- 13. Triggers : updated_at automatique
-- --------------------------------------------
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN
        SELECT table_name
        FROM information_schema.columns
        WHERE column_name = 'updated_at'
          AND table_schema = 'public'
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS set_updated_at ON %I;
            CREATE TRIGGER set_updated_at
            BEFORE UPDATE ON %I
            FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
        ', t, t);
    END LOOP;
END$$;

-- --------------------------------------------
-- 14. Vue : registre G0 (réceptions + expéditions)
-- --------------------------------------------
CREATE OR REPLACE VIEW v_register_g0 AS
SELECT
    r.id            AS doc_id,
    'reception'     AS doc_type,
    r.number        AS doc_number,
    r.reception_date AS doc_date,
    d.name          AS depot_name,
    p.name          AS partner_name,
    p.ice           AS partner_ice,
    r.plate         AS plate,
    r.driver_name   AS driver_name,
    r.total_quantity AS quantity,
    a.name          AS article_name
FROM receptions r
JOIN depots d ON d.id = r.depot_id
JOIN partners p ON p.id = r.partner_id
LEFT JOIN reception_lines rl ON rl.reception_id = r.id
LEFT JOIN articles a ON a.id = rl.article_id
WHERE r.state = 'confirmed'
UNION ALL
SELECT
    e.id,
    'expedition',
    e.number,
    e.expedition_date,
    d.name,
    p.name,
    p.ice,
    e.plate,
    e.driver_name,
    e.total_quantity,
    a.name
FROM expeditions e
JOIN depots d ON d.id = e.depot_id
JOIN partners p ON p.id = e.partner_id
LEFT JOIN expedition_lines el ON el.expedition_id = e.id
LEFT JOIN articles a ON a.id = el.article_id
WHERE e.state = 'confirmed';
