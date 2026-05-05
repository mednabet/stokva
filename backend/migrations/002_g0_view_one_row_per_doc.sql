-- ============================================
-- STOKVA — Migration 002 : amélioration vue G0
-- by NETPROCESS
-- ============================================
-- Avant : la vue produisait N lignes par document (autant que de
-- lignes d'articles), ce qui surévaluait le total quand la même
-- réception était additionnée plusieurs fois.
-- Après : 1 ligne par document avec articles agrégés en CSV.
-- ============================================

DROP VIEW IF EXISTS v_register_g0;

CREATE VIEW v_register_g0 AS
SELECT
    r.id              AS doc_id,
    'reception'::text AS doc_type,
    r.number          AS doc_number,
    r.reception_date  AS doc_date,
    d.name            AS depot_name,
    p.name            AS partner_name,
    p.ice             AS partner_ice,
    r.plate           AS plate,
    r.driver_name     AS driver_name,
    r.total_quantity  AS quantity,
    r.total_amount    AS amount,
    (
        SELECT string_agg(a.name, ', ' ORDER BY a.name)
        FROM reception_lines rl
        JOIN articles a ON a.id = rl.article_id
        WHERE rl.reception_id = r.id
    ) AS article_name
FROM receptions r
JOIN depots d ON d.id = r.depot_id
JOIN partners p ON p.id = r.partner_id
WHERE r.state = 'confirmed'

UNION ALL

SELECT
    e.id,
    'expedition'::text,
    e.number,
    e.expedition_date,
    d.name,
    p.name,
    p.ice,
    e.plate,
    e.driver_name,
    e.total_quantity,
    e.total_amount,
    (
        SELECT string_agg(a.name, ', ' ORDER BY a.name)
        FROM expedition_lines el
        JOIN articles a ON a.id = el.article_id
        WHERE el.expedition_id = e.id
    )
FROM expeditions e
JOIN depots d ON d.id = e.depot_id
JOIN partners p ON p.id = e.partner_id
WHERE e.state = 'confirmed';
