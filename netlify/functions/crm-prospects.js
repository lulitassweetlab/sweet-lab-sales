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

        // Handle POST Create Prospect
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body || '{}');
            const sellerId = Number(data.seller_id);
            const name = data.name;

            if (!sellerId || !name) {
                return json({ error: 'Faltan campos obligatorios' }, 400);
            }

            const whatsapp = data.whatsapp || null;
            const status = data.status || 'new';
            const source = data.source || null;
            const priority = Number(data.priority || 0);
            const notes = data.notes || '';

            const [row] = await sql`
                INSERT INTO crm_prospects (seller_id, name, whatsapp, status, source, priority, notes)
                VALUES (${sellerId}, ${name}, ${whatsapp}, ${status}, ${source}, ${priority}, ${notes})
                RETURNING *
            `;
            return json(row, 201);
        }

        // Handle PUT Update Prospect (change status, priority, etc)
        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body || '{}');
            const id = Number(data.id);
            if (!id) return json({ error: 'Falta ID' }, 400);

            // Fetch existing to handle partial updates
            const [existing] = await sql`SELECT * FROM crm_prospects WHERE id = ${id}`;
            if (!existing) return json({ error: 'Prospecto no encontrado' }, 404);

            const name = data.name !== undefined ? data.name : existing.name;
            const whatsapp = data.whatsapp !== undefined ? data.whatsapp : existing.whatsapp;
            const status = data.status !== undefined ? data.status : existing.status;
            const source = data.source !== undefined ? data.source : existing.source;
            const priority = data.priority !== undefined ? Number(data.priority) : existing.priority;
            const notes = data.notes !== undefined ? data.notes : existing.notes;
            const lastContactAt = data.last_contact_at ? data.last_contact_at : existing.last_contact_at;

            const [row] = await sql`
                UPDATE crm_prospects 
                SET name = ${name}, whatsapp = ${whatsapp}, status = ${status}, source = ${source}, 
                    priority = ${priority}, notes = ${notes}, last_contact_at = ${lastContactAt}, updated_at = now()
                WHERE id = ${id}
                RETURNING *
            `;
            
            return json(row);
        }

        // Handle GET Prospects
        if (event.httpMethod === 'GET') {
            const params = getQueryParams(event);
            const sellerId = Number(params.get('seller_id'));
            if (!sellerId) return json({ error: 'Falta seller_id' }, 400);

            const prospects = await sql`
                SELECT *
                FROM crm_prospects
                WHERE seller_id = ${sellerId}
                ORDER BY priority DESC, created_at DESC
            `;
            return json(prospects || []);
        }

        return json({ error: 'Método no permitido' }, 405);
    } catch (err) {
        console.error('Error in crm-prospects:', err);
        return json({ error: String(err) }, 500);
    }
}
