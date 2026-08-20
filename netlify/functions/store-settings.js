import { ensureSchema, sql } from './_db.js';

function json(body, status = 200) {
    return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event) {
    try {
        await ensureSchema();
        if (event.httpMethod === 'OPTIONS') return json({ ok: true });

        switch (event.httpMethod) {
            case 'GET': {
                const rows = await sql`SELECT key, value FROM store_settings`;
                const settings = {};
                for (const r of rows) {
                    settings[r.key] = r.value;
                }
                return json(settings);
            }
            case 'POST': {
                // We expect an object with key-value pairs
                const data = JSON.parse(event.body || '{}');

                // We can update multiple settings at once
                const keys = Object.keys(data);

                // Authorize access control key changes (only superadmin)
                const hasAccessControlKeys = keys.includes('production_access_approved') || keys.includes('next_production_datetime');
                if (hasAccessControlKeys) {
                    const headers = (event.headers || {});
                    const hActor = (headers['x-actor-name'] || headers['X-Actor-Name'] || headers['x-actor'] || '').toString();
                    let bActor = '';
                    try { bActor = data.actor_name || data.username || ''; } catch {}
                    const actor = (hActor || bActor || '').trim();

                    let actorRole = 'user';
                    if (actor) {
                        const userRows = await sql`SELECT role FROM users WHERE lower(username)=lower(${actor}) LIMIT 1`;
                        if (userRows.length) actorRole = userRows[0].role;
                    }

                    if (actorRole !== 'superadmin') {
                        return json({ error: 'No autorizado: Solo el superadmin puede modificar los controles de acceso a producción.' }, 403);
                    }
                }
                for (const key of keys) {
                    const value = data[key];
                    if (value === null || value === undefined) {
                        await sql`DELETE FROM store_settings WHERE key = ${key}`;
                    } else {
                        // Upsert
                        await sql`
							INSERT INTO store_settings (key, value)
							VALUES (${key}, ${String(value)})
							ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
						`;
                    }
                }

                // Return updated settings
                const rows = await sql`SELECT key, value FROM store_settings`;
                const settings = {};
                for (const r of rows) {
                    settings[r.key] = r.value;
                }
                return json(settings);
            }
            default:
                return json({ error: 'Método no permitido' }, 405);
        }
    } catch (err) {
        console.error('Store Settings API error:', err);
        return json({ error: String(err?.message || err) }, 500);
    }
}
