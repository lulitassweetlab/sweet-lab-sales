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

        // Handle POST Create Activity
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body || '{}');
            const sellerId = Number(data.seller_id);
            const clientId = Number(data.client_id);
            const activityType = data.activity_type;

            if (!sellerId || !clientId || !activityType) {
                return json({ error: 'Faltan campos obligatorios para la actividad' }, 400);
            }

            const description = data.description || '';
            const relatedSaleId = data.related_sale_id ? Number(data.related_sale_id) : null;
            const createdBy = data.created_by || '';
            const metadataJson = data.metadata ? JSON.stringify(data.metadata) : '{}';

            const [row] = await sql`
                INSERT INTO crm_activities (seller_id, client_id, related_sale_id, activity_type, description, metadata, created_by)
                VALUES (${sellerId}, ${clientId}, ${relatedSaleId}, ${activityType}, ${description}, ${metadataJson}::jsonb, ${createdBy})
                RETURNING *
            `;
            return json(row, 201);
        }

        // Handle GET Activities Filtered (usually loaded through client profile, but can be standalone)
        if (event.httpMethod === 'GET') {
            const params = getQueryParams(event);
            const sellerId = Number(params.get('seller_id'));
            const clientId = Number(params.get('client_id'));

            if (!sellerId) return json({ error: 'Falta seller_id' }, 400);

            let activities;
            if (clientId) {
                activities = await sql`
                    SELECT * FROM crm_activities 
                    WHERE seller_id = ${sellerId} AND client_id = ${clientId}
                    ORDER BY created_at DESC
                `;
            } else {
                activities = await sql`
                    SELECT a.*, c.name as client_name
                    FROM crm_activities a
                    JOIN clients c ON a.client_id = c.id
                    WHERE a.seller_id = ${sellerId}
                    ORDER BY a.created_at DESC
                    LIMIT 50
                `;
            }
            return json(activities || []);
        }

        return json({ error: 'Método no permitido' }, 405);
    } catch (err) {
        console.error('Error in crm-activities:', err);
        return json({ error: String(err) }, 500);
    }
}
