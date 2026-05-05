-- ============================================
-- STOKVA — Migration 005 : fix UNIQUE settings
-- by NETPROCESS
-- ============================================
-- PostgreSQL traite NULL <> NULL dans les contraintes UNIQUE par défaut.
-- Conséquence : INSERT...ON CONFLICT (scope, scope_id, key) ne matche pas
-- les lignes où scope_id IS NULL (cas scope='company').
-- Solution : remplacer la contrainte par un index unique partiel.
-- ============================================

-- Nettoyer les doublons éventuels en gardant la ligne la plus récente
DELETE FROM settings s1
USING settings s2
WHERE s1.id < s2.id
  AND s1.scope = s2.scope
  AND s1.scope_id IS NOT DISTINCT FROM s2.scope_id
  AND s1.key = s2.key;

-- Supprimer l'ancienne contrainte
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_scope_scope_id_key_key;

-- Indexes uniques séparés selon scope_id NULL ou non
CREATE UNIQUE INDEX IF NOT EXISTS uniq_settings_company
    ON settings(scope, key) WHERE scope_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_settings_scoped
    ON settings(scope, scope_id, key) WHERE scope_id IS NOT NULL;
