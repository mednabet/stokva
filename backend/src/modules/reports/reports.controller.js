'use strict';

const db = require('../../db/pool');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { ValidationError } = require('../../utils/errors');

/**
 * GET /api/reports/g0
 * Registre mensuel G0 (conforme EN 07-O04).
 * Returns JSON; supports ?format=xlsx|pdf for direct download.
 */
async function g0Register(req, res, next) {
    try {
        const month = req.query.month; // YYYY-MM
        const depotId = req.query.depot_id ? parseInt(req.query.depot_id, 10) : null;

        if (!month || !/^\d{4}-\d{2}$/.test(month)) {
            throw new ValidationError('month (YYYY-MM) requis');
        }
        const [y, m] = month.split('-').map(Number);
        const dateFrom = new Date(Date.UTC(y, m - 1, 1));
        const dateTo = new Date(Date.UTC(y, m, 1));

        const params = [dateFrom, dateTo];
        let depotFilter = '';
        if (depotId) {
            params.push(depotId);
            depotFilter = ` AND depot_name = (SELECT name FROM depots WHERE id = $${params.length})`;
        }

        const r = await db.query(`
            SELECT *
            FROM v_register_g0
            WHERE doc_date >= $1 AND doc_date < $2
            ${depotFilter}
            ORDER BY doc_date, doc_number
        `, params);

        const company = await db.query(`SELECT name, ice, rc, address FROM company LIMIT 1`);
        const fmt = req.query.format;

        if (fmt === 'xlsx') {
            return await exportG0Excel(res, r.rows, company.rows[0] || {}, month);
        }
        if (fmt === 'pdf') {
            return exportG0Pdf(res, r.rows, company.rows[0] || {}, month);
        }

        res.json({
            month,
            company: company.rows[0] || null,
            count: r.rowCount,
            items: r.rows,
        });
    } catch (err) {
        next(err);
    }
}

async function exportG0Excel(res, rows, company, month) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'STOKVA / NETPROCESS';
    const ws = wb.addWorksheet('Registre G0');

    ws.mergeCells('A1:H1');
    ws.getCell('A1').value = company.name || 'Société';
    ws.getCell('A1').font = { size: 14, bold: true };
    ws.getCell('A1').alignment = { horizontal: 'center' };

    ws.mergeCells('A2:H2');
    ws.getCell('A2').value = `Registre G0 — ${month}` + (company.ice ? ` — ICE ${company.ice}` : '');
    ws.getCell('A2').alignment = { horizontal: 'center' };

    ws.addRow([]);

    const header = ws.addRow([
        'Date', 'Type', 'Numéro', 'Dépôt', 'Partenaire', 'ICE', 'Article', 'Quantité',
    ]);
    header.font = { bold: true };
    header.eachCell((c) => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF312E81' } };
        c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        c.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    for (const row of rows) {
        ws.addRow([
            new Date(row.doc_date),
            row.doc_type === 'reception' ? 'Réception' : 'Expédition',
            row.doc_number,
            row.depot_name,
            row.partner_name,
            row.partner_ice || '',
            row.article_name || '',
            Number(row.quantity || 0),
        ]);
    }

    ws.columns = [
        { width: 18 }, { width: 12 }, { width: 18 }, { width: 22 },
        { width: 28 }, { width: 16 }, { width: 28 }, { width: 14 },
    ];
    ws.getColumn(1).numFmt = 'yyyy-mm-dd hh:mm';
    ws.getColumn(8).numFmt = '#,##0.000';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="registre-g0-${month}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
}

function exportG0Pdf(res, rows, company, month) {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="registre-g0-${month}.pdf"`);
    doc.pipe(res);

    doc.fontSize(14).fillColor('#312E81').text(company.name || 'Société', { align: 'center' });
    doc.fontSize(10).fillColor('black').text(`Registre G0 — ${month}` + (company.ice ? `  •  ICE ${company.ice}` : ''), { align: 'center' });
    doc.moveDown();

    const cols = [
        { key: 'doc_date',    label: 'Date',       width: 90,  fmt: (v) => new Date(v).toLocaleString('fr-FR') },
        { key: 'doc_type',    label: 'Type',       width: 60,  fmt: (v) => v === 'reception' ? 'Récep.' : 'Expéd.' },
        { key: 'doc_number',  label: 'Numéro',     width: 90 },
        { key: 'depot_name',  label: 'Dépôt',      width: 90 },
        { key: 'partner_name',label: 'Partenaire', width: 130 },
        { key: 'partner_ice', label: 'ICE',        width: 70 },
        { key: 'article_name',label: 'Article',    width: 130 },
        { key: 'quantity',    label: 'Qté',        width: 60, fmt: (v) => Number(v || 0).toFixed(3), align: 'right' },
    ];

    const startX = doc.x;
    let y = doc.y;
    doc.fontSize(8).fillColor('white');
    doc.rect(startX, y, cols.reduce((s, c) => s + c.width, 0), 16).fill('#312E81');
    let x = startX;
    for (const c of cols) {
        doc.fillColor('white').text(c.label, x + 3, y + 4, { width: c.width - 6, align: 'left' });
        x += c.width;
    }
    y += 16;
    doc.fillColor('black');

    for (const row of rows) {
        if (y > doc.page.height - 40) {
            doc.addPage();
            y = doc.y;
        }
        x = startX;
        const rowH = 14;
        doc.rect(startX, y, cols.reduce((s, c) => s + c.width, 0), rowH).strokeColor('#e5e7eb').stroke();
        for (const c of cols) {
            const raw = row[c.key];
            const val = c.fmt ? c.fmt(raw) : (raw == null ? '' : String(raw));
            doc.fontSize(8).fillColor('black').text(val, x + 3, y + 3, {
                width: c.width - 6,
                align: c.align || 'left',
                ellipsis: true,
            });
            x += c.width;
        }
        y += rowH;
    }

    doc.end();
}

/**
 * GET /api/reports/stats
 * Aggregated statistics: by partner / article / vehicle / depot.
 *
 * The CTE `movements` unions confirmed receptions + expeditions over the period.
 * Then we join the dimension table and group by it.
 */
async function stats(req, res, next) {
    try {
        const groupBy = req.query.group_by || 'partner';
        const dateFrom = req.query.date_from || '1970-01-01';
        const dateTo = req.query.date_to || '2999-12-31';

        // Each option maps to: { key, idCol, joinSql, labelExpr }
        const dims = {
            partner: {
                key: 'partner_id',
                joinSql: 'JOIN partners dim ON dim.id = m.partner_id',
                labelExpr: 'dim.name',
            },
            article: {
                key: 'article_id',
                joinSql: 'JOIN articles dim ON dim.id = m.article_id',
                labelExpr: 'dim.name',
            },
            vehicle: {
                key: 'vehicle_id',
                joinSql: 'LEFT JOIN vehicles dim ON dim.id = m.vehicle_id',
                labelExpr: 'dim.plate',
            },
            depot: {
                key: 'depot_id',
                joinSql: 'JOIN depots dim ON dim.id = m.depot_id',
                labelExpr: 'dim.name',
            },
        };

        const dim = dims[groupBy];
        if (!dim) throw new ValidationError('group_by invalide (partner|article|vehicle|depot)');

        const sql = `
            WITH movements AS (
                SELECT 'reception' AS doc_type, r.id AS doc_id,
                       r.partner_id, r.depot_id, r.vehicle_id,
                       rl.article_id, rl.quantity, rl.subtotal
                FROM receptions r
                JOIN reception_lines rl ON rl.reception_id = r.id
                WHERE r.state = 'confirmed' AND r.reception_date BETWEEN $1 AND $2
                UNION ALL
                SELECT 'expedition', e.id,
                       e.partner_id, e.depot_id, e.vehicle_id,
                       el.article_id, el.quantity, el.subtotal
                FROM expeditions e
                JOIN expedition_lines el ON el.expedition_id = e.id
                WHERE e.state = 'confirmed' AND e.expedition_date BETWEEN $1 AND $2
            ),
            grouped AS (
                SELECT m.${dim.key} AS group_id,
                       ${dim.labelExpr} AS group_label,
                       COUNT(DISTINCT m.doc_id) AS doc_count,
                       COALESCE(SUM(CASE WHEN m.doc_type='reception'  THEN m.quantity END), 0) AS qty_in,
                       COALESCE(SUM(CASE WHEN m.doc_type='expedition' THEN m.quantity END), 0) AS qty_out,
                       COALESCE(SUM(m.subtotal), 0) AS amount
                FROM movements m
                ${dim.joinSql}
                GROUP BY m.${dim.key}, ${dim.labelExpr}
            )
            SELECT * FROM grouped
            ORDER BY (qty_in + qty_out) DESC
            LIMIT 200
        `;

        const r = await db.query(sql, [dateFrom, dateTo]);
        res.json({ items: r.rows, groupBy, dateFrom, dateTo });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/reports/dashboard
 * KPIs for dashboard.
 */
async function dashboard(req, res, next) {
    try {
        const today = new Date();
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const params = [monthStart];

        const [recCount, expCount, trCount, lowStock, totalStock] = await Promise.all([
            db.query(`SELECT COUNT(*)::int AS n FROM receptions WHERE state='confirmed' AND reception_date >= $1`, params),
            db.query(`SELECT COUNT(*)::int AS n FROM expeditions WHERE state='confirmed' AND expedition_date >= $1`, params),
            db.query(`SELECT COUNT(*)::int AS n FROM transfers WHERE state IN ('in_transit','received') AND transfer_date >= $1`, params),
            db.query(`
                SELECT COUNT(*)::int AS n FROM (
                    SELECT a.id FROM articles a
                    LEFT JOIN stock_levels sl ON sl.article_id = a.id
                    WHERE a.active = TRUE
                    GROUP BY a.id, a.stock_min
                    HAVING COALESCE(SUM(sl.quantity), 0) < a.stock_min
                ) sub
            `),
            db.query(`SELECT COALESCE(SUM(quantity), 0) AS total FROM stock_levels`),
        ]);

        res.json({
            month: monthStart.toISOString().slice(0, 7),
            receptions: recCount.rows[0].n,
            expeditions: expCount.rows[0].n,
            transfers: trCount.rows[0].n,
            lowStockAlerts: lowStock.rows[0].n,
            totalStock: Number(totalStock.rows[0].total),
        });
    } catch (err) {
        next(err);
    }
}

module.exports = { g0Register, stats, dashboard };
