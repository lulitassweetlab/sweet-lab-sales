import { ensureSchema, sql } from './_db.js';

function json(body, status = 200) {
    return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function getQueryParams(event) {
    const params = new URLSearchParams(event.rawQuery || '');
    const fallback = event.queryStringParameters || {};
    for (const [key, value] of Object.entries(fallback)) {
        if (value === undefined || value === null) continue;
        if (!params.has(key)) params.set(key, String(value));
    }
    return params;
}

export async function handler(event) {
    try {
        await ensureSchema();
        if (event.httpMethod === 'OPTIONS') return json({ ok: true });

        // Handle Log Creation
        if (event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const { client_id, phone, message, segment, sent_by } = body;

            if (!phone || !message || !segment) {
                return json({ error: 'Faltan datos obligatorios para el registro' }, 400);
            }

            const clientVal = client_id ? Number(client_id) : null;
            const sellerVal = sent_by ? Number(sent_by) : null;
            
            const insert = await sql`
                INSERT INTO crm_whatsapp_logs (client_id, phone, message, segment, sent_by)
                VALUES (${clientVal}, ${phone}, ${message}, ${segment}, ${sellerVal})
                RETURNING id, sent_at
            `;
            
            return json({ success: true, inserted: insert[0] });
        }

        // Handle Fetching Logs for a specific client
        if (event.httpMethod === 'GET') {
            const params = getQueryParams(event);
            const clientId = Number(params.get('client_id'));
            const sellerId = Number(params.get('seller_id'));

            if (clientId) {
                // Fetch specific client history
                const logs = await sql`
                    SELECT wl.*, s.name as seller_name 
                    FROM crm_whatsapp_logs wl
                    LEFT JOIN sellers s ON wl.sent_by = s.id
                    WHERE wl.client_id = ${clientId}
                    ORDER BY wl.sent_at DESC
                `;
                return json(logs);
            }
            
            if (sellerId) {
                // Fetch recent broadcast history by seller
                const logs = await sql`
                    SELECT wl.*, c.name as client_name
                    FROM crm_whatsapp_logs wl
                    LEFT JOIN clients c ON wl.client_id = c.id
                    WHERE wl.sent_by = ${sellerId}
                    ORDER BY wl.sent_at DESC
                    LIMIT 200
                `;
                return json(logs);
            }
            
            return json({ error: 'Falta client_id o seller_id' }, 400);
        }

        if (event.httpMethod === 'DELETE') {
            const params = getQueryParams(event);
            const id = Number(params.get('id'));
            if (!id) return json({ error: 'Falta id' }, 400);
            await sql`DELETE FROM crm_whatsapp_logs WHERE id = ${id}`;
            return json({ success: true });
        }

        return json({ error: 'Método no soportado' }, 405);
    } catch (err) {
        console.error('Error in crm-whatsapp-logs API:', err);
        return json({ error: String(err) }, 500);
    }
}
