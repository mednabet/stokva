'use strict';

/**
 * Stock service.
 *
 * Applique les mouvements de stock + log dans `stock_moves`.
 * Respecte le paramètre `stock.allow_negative` avec cascade :
 * Article > Dépôt > Société. La colonne `articles.allow_negative_stock`
 * et `depots.allow_negative_stock` (si non NULL) priment sur les settings.
 */

function getExec(client) {
    return client ? client.query.bind(client) : require('../db/pool').query;
}

/**
 * Résout l'autorisation stock négatif avec cascade complète.
 * Priorité : article column > article setting > depot column > depot setting > company setting > false
 */
async function _allowNegative(depotId, articleId, client) {
    const exec = getExec(client);

    // 1) Colonne article (priorité absolue si non NULL)
    const a = await exec(
        `SELECT allow_negative_stock FROM articles WHERE id = $1`,
        [articleId]
    );
    if (a.rowCount && a.rows[0].allow_negative_stock !== null) {
        return a.rows[0].allow_negative_stock;
    }

    // 2) Colonne dépôt
    const d = await exec(
        `SELECT allow_negative_stock FROM depots WHERE id = $1`,
        [depotId]
    );
    if (d.rowCount && d.rows[0].allow_negative_stock !== null) {
        return d.rows[0].allow_negative_stock;
    }

    // 3) Cascade settings (article > depot > company), default false
    const r = await exec(
        `SELECT get_setting('stock.allow_negative', $1, $2, 'false'::jsonb) AS v`,
        [depotId, articleId]
    );
    return r.rows[0].v === true;
}

/**
 * Apply a stock movement.
 *
 * Pour les sorties (out / transfer_out), vérifie le paramètre
 * `stock.allow_negative`. Si false et que le mouvement créerait un
 * stock négatif, lance ConflictError INSUFFICIENT_STOCK.
 */
async function applyMove(m, client) {
    const exec = getExec(client);

    const isOut = m.moveType === 'out' || m.moveType === 'transfer_out';
    const sign = m.moveType === 'in' || m.moveType === 'transfer_in' ? 1
              : isOut ? -1
              : 0; // adjust: quantity already signed
    const delta = sign === 0 ? Number(m.quantity) : sign * Number(m.quantity);

    // Garde anti-stock-négatif pour les sorties
    if (isOut) {
        const allowNeg = await _allowNegative(m.depotId, m.articleId, client);
        if (!allowNeg) {
            const cur = await exec(
                `SELECT COALESCE(quantity, 0) AS qty FROM stock_levels
                 WHERE depot_id = $1 AND article_id = $2`,
                [m.depotId, m.articleId]
            );
            const available = cur.rowCount ? Number(cur.rows[0].qty) : 0;
            if (available + delta < 0) {
                const { ConflictError } = require('./errors');
                const err = new ConflictError(
                    `Stock insuffisant : disponible ${available}, demandé ${m.quantity} ` +
                    `(le stock négatif n'est pas autorisé pour cette combinaison)`
                );
                err.code = 'INSUFFICIENT_STOCK';
                err.details = {
                    depotId: m.depotId, articleId: m.articleId,
                    available, requested: Number(m.quantity),
                };
                throw err;
            }
        }
    }

    // Upsert stock_levels
    await exec(`
        INSERT INTO stock_levels (depot_id, article_id, quantity, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (depot_id, article_id)
        DO UPDATE SET quantity = stock_levels.quantity + $3, updated_at = NOW()
    `, [m.depotId, m.articleId, delta]);

    // Audit move
    await exec(`
        INSERT INTO stock_moves (depot_id, article_id, move_type, quantity,
                                 source_model, source_id, user_id, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [m.depotId, m.articleId, m.moveType, Math.abs(Number(m.quantity)),
        m.sourceModel || null, m.sourceId || null, m.userId || null, m.notes || null]);
}

/**
 * Reverse all stock impact of a source document.
 */
async function reverseDocument({ sourceModel, sourceId }, client) {
    const exec = getExec(client);
    const r = await exec(`
        SELECT depot_id, article_id, move_type, quantity
        FROM stock_moves
        WHERE source_model = $1 AND source_id = $2
    `, [sourceModel, sourceId]);

    for (const row of r.rows) {
        let reverseType;
        if (row.move_type === 'in') reverseType = 'out';
        else if (row.move_type === 'out') reverseType = 'in';
        else if (row.move_type === 'transfer_in') reverseType = 'transfer_out';
        else if (row.move_type === 'transfer_out') reverseType = 'transfer_in';
        else continue;

        await applyMove({
            depotId: row.depot_id,
            articleId: row.article_id,
            quantity: row.quantity,
            moveType: reverseType,
            sourceModel: sourceModel + '_reversal',
            sourceId,
            notes: 'Annulation document',
        }, client);
    }
}

/**
 * Check stock availability before an out movement.
 * Si stock.allow_negative est true au niveau effectif, ne lance jamais.
 */
async function checkAvailable({ depotId, articleId, quantity }, client) {
    const allowNeg = await _allowNegative(depotId, articleId, client);
    if (allowNeg) return Infinity;

    const exec = getExec(client);
    const r = await exec(
        `SELECT COALESCE(quantity, 0) AS qty FROM stock_levels WHERE depot_id = $1 AND article_id = $2`,
        [depotId, articleId]
    );
    const available = r.rowCount ? Number(r.rows[0].qty) : 0;
    if (available < Number(quantity)) {
        const { ConflictError } = require('./errors');
        const err = new ConflictError(
            `Stock insuffisant : disponible ${available}, demandé ${quantity}`
        );
        err.code = 'INSUFFICIENT_STOCK';
        err.details = { depotId, articleId, available, requested: Number(quantity) };
        throw err;
    }
    return available;
}

module.exports = { applyMove, reverseDocument, checkAvailable, _allowNegative };
