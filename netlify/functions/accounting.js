import { ensureSchema, sql } from './_db.js';

function json(body, status = 200) {
    return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function getRawQuery(evt){
    try {
        if (typeof evt.rawQuery === 'string') return evt.rawQuery;
        const qsp = evt.queryStringParameters || null;
        if (qsp && typeof qsp === 'object') return new URLSearchParams(qsp).toString();
    } catch {}
    return '';
}

async function getActorRole(evt, body = null) {
    try {
        const headers = (evt.headers || {});
        const hActor = (headers['x-actor-name'] || headers['X-Actor-Name'] || headers['x-actor'] || '').toString();
        let bActor = '';
        try { bActor = (body && (body.actor_name || body._actor_name || body.username)) ? String(body.actor_name || body._actor_name || body.username) : ''; } catch {}
        let qActor = '';
        try { const qs = new URLSearchParams(getRawQuery(evt)); qActor = (qs.get('actor') || '').toString(); } catch {}
        const actor = (hActor || bActor || qActor || '').trim();
        if (!actor) return 'user';
        const rows = await sql`SELECT role FROM users WHERE lower(username)=lower(${actor}) LIMIT 1`;
        return (rows && rows[0] && rows[0].role) ? String(rows[0].role) : 'user';
    } catch { return 'user'; }
}

export async function handler(event) {
    try {
        await ensureSchema();
        if (event.httpMethod === 'OPTIONS') return json({ ok: true });

        switch (event.httpMethod) {
            case 'GET': {
                const params = new URLSearchParams(getRawQuery(event));
                const month = (params.get('month') || '').toString().slice(0,7);
                const start = (params.get('start') || '').toString().slice(0,10);
                const end = (params.get('end') || '').toString().slice(0,10);
                const q = (params.get('q') || '').toString().trim();
                const category = (params.get('category') || '').toString().trim();
                const summary = (params.get('summary') || '').toString().trim();
                const role = await getActorRole(event, null);
                if (role !== 'superadmin') return json({ error: 'No autorizado' }, 403);
                let rangeStart = start, rangeEnd = end;
                if (!rangeStart || !rangeEnd) {
                    if (!month || !/^\d{4}-\d{2}$/.test(month)) return json({ error: 'Mes inválido' }, 400);
                    const ms = month + '-01';
                    const [endRow] = await sql`SELECT (date_trunc('month', ${ms}::date) + interval '1 month - 1 day')::date AS end_date`;
                    rangeStart = ms; rangeEnd = endRow.end_date;
                }
                const clauses = [sql`entry_date BETWEEN ${rangeStart} AND ${rangeEnd}`];
                if (q) clauses.push(sql`description ILIKE ${'%' + q + '%'}`);
                if (category) clauses.push(sql`category = ${category}`);
                if (summary === 'category') {
                    const rows = await sql`
                        SELECT coalesce(category,'') AS category,
                               SUM(CASE WHEN kind='ingreso' THEN amount ELSE 0 END)::int AS sum_in,
                               SUM(CASE WHEN kind='gasto' THEN amount ELSE 0 END)::int AS sum_out
                        FROM accounting_entries
                        WHERE ${sql.join(clauses, sql` AND `)}
                        GROUP BY coalesce(category,'')
                        ORDER BY coalesce(category,'') ASC
                    `;
                    return json({ start: rangeStart, end: rangeEnd, q, category, summary: 'category', rows });
                }
                if (summary === 'category_monthly') {
                    const rows = await sql`
                        SELECT to_char(date_trunc('month', entry_date), 'YYYY-MM') AS month,
                               coalesce(category,'') AS category,
                               SUM(CASE WHEN kind='ingreso' THEN amount ELSE 0 END)::int AS sum_in,
                               SUM(CASE WHEN kind='gasto' THEN amount ELSE 0 END)::int AS sum_out
                        FROM accounting_entries
                        WHERE ${sql.join(clauses, sql` AND `)}
                        GROUP BY month, coalesce(category,'')
                        ORDER BY month ASC, category ASC
                    `;
                    return json({ start: rangeStart, end: rangeEnd, q, category, summary: 'category_monthly', rows });
                }
                const rows = await sql`
                    SELECT id, entry_date, description, kind, amount, category
                    FROM accounting_entries
                    WHERE ${sql.join(clauses, sql` AND `)}
                    ORDER BY entry_date ASC, id ASC
                `;
                return json({ month, start: rangeStart, end: rangeEnd, q, category, entries: rows });
            }
            case 'POST': {
                const data = JSON.parse(event.body || '{}');
                const role = await getActorRole(event, data);
                if (role !== 'superadmin') return json({ error: 'No autorizado' }, 403);
                if (Array.isArray(data.entries)) {
                    const entries = data.entries
                        .map(e => ({
                            entry_date: String((e.date||e.entry_date||'')).slice(0,10),
                            description: String(e.desc||e.description||'').trim(),
                            kind: String(e.type||e.kind||'').trim(),
                            amount: Number(e.value||e.amount||0)|0,
                            category: (e.category ? String(e.category).trim() : null)
                        }))
                        .filter(e => e.entry_date && /^\d{4}-\d{2}-\d{2}$/.test(e.entry_date) && e.description && (e.kind==='ingreso'||e.kind==='gasto') && e.amount>0);
                    if (!entries.length) return json({ error: 'Sin entradas válidas' }, 400);
                    const values = entries.map(e => sql`(${e.entry_date}, ${e.description}, ${e.kind}, ${e.amount}, ${e.category})`);
                    await sql`
                        INSERT INTO accounting_entries (entry_date, description, kind, amount, category)
                        VALUES ${sql.join(values, sql`, `)}
                    `;
                    return json({ ok: true, inserted: entries.length }, 201);
                }
                const entryDate = (data.date || '').toString().slice(0,10);
                const description = (data.desc || data.description || '').toString().trim();
                const kind = (data.type || data.kind || '').toString();
                const amount = Number(data.value || data.amount || 0) | 0;
                const category = (data.category || '').toString().trim() || null;
                if (!entryDate || !/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) return json({ error: 'Fecha inválida' }, 400);
                if (!description) return json({ error: 'Descripción requerida' }, 400);
                if (!(kind === 'ingreso' || kind === 'gasto')) return json({ error: 'Tipo inválido' }, 400);
                if (!Number.isFinite(amount) || amount <= 0) return json({ error: 'Valor inválido' }, 400);
                const [row] = await sql`
                    INSERT INTO accounting_entries (entry_date, description, kind, amount, category)
                    VALUES (${entryDate}, ${description}, ${kind}, ${amount}, ${category})
                    RETURNING id, entry_date, description, kind, amount, category
                `;
                return json(row, 201);
            }
            case 'PATCH': {
                const data = JSON.parse(event.body || '{}');
                const role = await getActorRole(event, data);
                if (role !== 'superadmin') return json({ error: 'No autorizado' }, 403);
                // Bulk support: ids array or single id
                const singleId = Number(data.id || 0) | 0;
                const ids = Array.isArray(data.ids) ? data.ids.map(v => Number(v)||0).filter(v => v>0) : (singleId ? [singleId] : []);
                if (!ids.length) return json({ error: 'id(s) requeridos' }, 400);
                const entryDate = (data.date || data.entry_date || '').toString().slice(0,10) || null;
                const description = (data.desc || data.description || '').toString();
                const kind = (data.type || data.kind || '').toString();
                const amount = (data.value ?? data.amount);
                const category = (data.category ?? null);
                if (kind && !(kind === 'ingreso' || kind === 'gasto')) return json({ error: 'Tipo inválido' }, 400);
                const updates = [];
                if (entryDate && /^\d{4}-\d{2}-\d{2}$/.test(entryDate)) updates.push(sql`entry_date = ${entryDate}`);
                if (description) updates.push(sql`description = ${description}`);
                if (kind) updates.push(sql`kind = ${kind}`);
                if (amount !== undefined && amount !== null) updates.push(sql`amount = ${Number(amount)|0}`);
                if (category !== undefined) updates.push(sql`category = ${category ? String(category) : null}`);
                if (!updates.length) return json({ error: 'Sin cambios' }, 400);
                const rows = await sql`
                    UPDATE accounting_entries SET ${sql.join(updates, sql`, `)}, updated_at = now()
                    WHERE id = ANY(${ids})
                    RETURNING id, entry_date, description, kind, amount, category
                `;
                if (!rows.length) return json({ error: 'No encontrado' }, 404);
                return json({ updated: rows.length, entries: rows });
            }
            case 'DELETE': {
                const params = new URLSearchParams(getRawQuery(event));
                const role = await getActorRole(event, null);
                if (role !== 'superadmin') return json({ error: 'No autorizado' }, 403);
                const idsParam = (params.get('ids') || '').toString();
                const idParam = Number(params.get('id') || 0) | 0;
                let ids = [];
                if (idsParam) { ids = idsParam.split(',').map(v => Number(v)||0).filter(v => v>0); }
                else if (idParam) { ids = [idParam]; }
                if (!ids.length) return json({ error: 'id(s) requeridos' }, 400);
                await sql`DELETE FROM accounting_entries WHERE id = ANY(${ids})`;
                return json({ ok: true, deleted: ids.length });
            }
            default:
                return json({ error: 'Método no permitido' }, 405);
        }
    } catch (err) {
        return json({ error: String(err) }, 500);
    }
}

