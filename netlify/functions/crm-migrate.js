import { ensureSchema, sql } from './_db.js';

function json(body, status = 200) {
    return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event) {
    // Simple auth check: require ?key=migrate2026
    const params = new URLSearchParams(event.rawQuery || '');
    if (params.get('key') !== 'migrate2026') {
        return json({ error: 'Acceso denegado' }, 401);
    }

    try {
        await ensureSchema();

        const report = {
            step1_duplicates_cleaned: 0,
            step2_backfill_inserted: 0,
            step3_orphans_removed: 0,
            errors: []
        };

        // ── STEP 1: Remove duplicate rows in crm_client_sales ─────────────────
        // The table has UNIQUE(sale_id) so normally only one client per sale.
        // But if the same sale_id was inserted twice via race conditions, clean it up.
        // Keep the row with the lowest id.
        try {
            await sql`
                DELETE FROM crm_client_sales
                WHERE id NOT IN (
                    SELECT MIN(id)
                    FROM crm_client_sales
                    GROUP BY sale_id
                )
            `;
            report.step1_duplicates_cleaned = 'done';
        } catch (e) {
            report.errors.push('Step 1 (dedup): ' + String(e));
        }

        // ── STEP 2: Backfill historical sales → crm_client_sales ─────────────
        // For every sale that has a client_name matching a client (by seller + name),
        // insert a link row if one doesn't exist yet.
        // Uses ON CONFLICT to skip if UNIQUE(sale_id) constraint would fire.
        try {
            // Get all sales that have a client_name but no crm_client_sales row
            const unlinkedSales = await sql`
                SELECT DISTINCT s.id AS sale_id, s.seller_id, s.client_name
                FROM sales s
                WHERE s.client_name IS NOT NULL
                  AND TRIM(s.client_name) != ''
                  AND NOT EXISTS (
                      SELECT 1 FROM crm_client_sales cs WHERE cs.sale_id = s.id
                  )
            `;

            let inserted = 0;
            for (const sale of unlinkedSales) {
                try {
                    // Find the CRM client record matching this sale's seller + client name
                    const [crmClient] = await sql`
                        SELECT id FROM clients
                        WHERE seller_id = ${sale.seller_id}
                          AND lower(name) = lower(${sale.client_name})
                        LIMIT 1
                    `;

                    if (crmClient && crmClient.id) {
                        // Insert the link — the UNIQUE(sale_id) constraint will prevent duplicates
                        await sql`
                            INSERT INTO crm_client_sales (client_id, sale_id, seller_id)
                            VALUES (${crmClient.id}, ${sale.sale_id}, ${sale.seller_id})
                            ON CONFLICT DO NOTHING
                        `;
                        inserted++;
                    }
                } catch (innerErr) {
                    // Skip individual failures silently (constraint violations, etc.)
                    report.errors.push(`sale_id ${sale.sale_id}: ${String(innerErr).slice(0, 80)}`);
                }
            }
            report.step2_backfill_inserted = inserted;
        } catch (e) {
            report.errors.push('Step 2 (backfill): ' + String(e));
        }

        // ── STEP 3: Remove orphan crm_client_sales rows ───────────────────────
        // Links that point to deleted sales or deleted clients
        try {
            await sql`
                DELETE FROM crm_client_sales
                WHERE sale_id NOT IN (SELECT id FROM sales)
                   OR client_id NOT IN (SELECT id FROM clients)
            `;
            report.step3_orphans_removed = 'done';
        } catch (e) {
            report.errors.push('Step 3 (orphans): ' + String(e));
        }

        return json({ ok: true, report });

    } catch (err) {
        return json({ error: String(err) }, 500);
    }
}
