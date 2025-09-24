import { ensureSchema, sql } from './_db.js';

function json(body, status = 200) {
    return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

async function getActorRole(evt, body = null) {
    try {
        const headers = (evt.headers || {});
        const hActor = (headers['x-actor-name'] || headers['X-Actor-Name'] || headers['x-actor'] || '').toString();
        let bActor = '';
        try { bActor = (body && (body.actor_name || body._actor_name || body.username)) ? String(body.actor_name || body._actor_name || body.username) : ''; } catch {}
        let qActor = '';
        try { const qs = new URLSearchParams(evt.rawQuery || (evt.queryStringParameters ? new URLSearchParams(evt.queryStringParameters).toString() : '')); qActor = (qs.get('actor') || '').toString(); } catch {}
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
                const params = new URLSearchParams(event.rawQuery || event.queryStringParameters ? event.rawQuery || '' : '');
                const month = (params.get('month') || '').toString().slice(0,7);
                const role = await getActorRole(event, null);
                if (role !== 'superadmin') return json({ error: 'No autorizado' }, 403);
                if (!month || !/^\d{4}-\d{2}$/.test(month)) return json({ error: 'Mes inválido' }, 400);
                const start = month + '-01';
                const [endRow] = await sql`SELECT (date_trunc('month', ${start}::date) + interval '1 month - 1 day')::date AS end_date`;
                const end = endRow.end_date;
                const rows = await sql`
                    SELECT id, entry_date, description, kind, amount
                    FROM accounting_entries
                    WHERE entry_date BETWEEN ${start} AND ${end}
                    ORDER BY entry_date ASC, id ASC
                `;
                return json({ month, entries: rows });
            }
            case 'POST': {
                const data = JSON.parse(event.body || '{}');
                const role = await getActorRole(event, data);
                if (role !== 'superadmin') return json({ error: 'No autorizado' }, 403);
                const entryDate = (data.date || '').toString().slice(0,10);
                const description = (data.desc || data.description || '').toString().trim();
                const kind = (data.type || data.kind || '').toString();
                const amount = Number(data.value || data.amount || 0) | 0;
                if (!entryDate || !/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) return json({ error: 'Fecha inválida' }, 400);
                if (!description) return json({ error: 'Descripción requerida' }, 400);
                if (!(kind === 'ingreso' || kind === 'gasto')) return json({ error: 'Tipo inválido' }, 400);
                if (!Number.isFinite(amount) || amount <= 0) return json({ error: 'Valor inválido' }, 400);
                const [row] = await sql`
                    INSERT INTO accounting_entries (entry_date, description, kind, amount)
                    VALUES (${entryDate}, ${description}, ${kind}, ${amount})
                    RETURNING id, entry_date, description, kind, amount
                `;
                return json(row, 201);
            }
            default:
                return json({ error: 'Método no permitido' }, 405);
        }
    } catch (err) {
        return json({ error: String(err) }, 500);
    }
}

