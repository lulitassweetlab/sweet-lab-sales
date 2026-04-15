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

        // Handle POST Create Reminder
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body || '{}');
            const sellerId = Number(data.seller_id);
            const title = data.title;
            const dueDate = data.due_date || new Date().toISOString(); // Default to now if not provided

            if (!sellerId || !title) {
                return json({ error: 'Faltan campos obligatorios (seller_id, título)' }, 400);
            }

            const clientId = data.client_id ? Number(data.client_id) : null;
            const prospectId = data.prospect_id ? Number(data.prospect_id) : null;
            const reminderType = data.reminder_type || 'general';
            const description = data.description || '';
            const priority = Number(data.priority || 0);

            const [row] = await sql`
                INSERT INTO crm_reminders (seller_id, client_id, prospect_id, reminder_type, title, description, priority, due_date)
                VALUES (${sellerId}, ${clientId}, ${prospectId}, ${reminderType}, ${title}, ${description}, ${priority}, ${dueDate})
                RETURNING *
            `;
            return json(row, 201);
        }

        // Handle PUT Update Reminder (Mark complete)
        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body || '{}');
            const id = Number(data.id);
            if (!id) return json({ error: 'Falta ID' }, 400);

            const completed = data.completed !== undefined ? Boolean(data.completed) : false;
            
            let row;
            if (completed) {
                [row] = await sql`
                    UPDATE crm_reminders 
                    SET completed = true, completed_at = now()
                    WHERE id = ${id}
                    RETURNING *
                `;
            } else {
                [row] = await sql`
                    UPDATE crm_reminders 
                    SET completed = false, completed_at = null
                    WHERE id = ${id}
                    RETURNING *
                `;
            }
            return json(row);
        }

        // Handle GET Reminders
        if (event.httpMethod === 'GET') {
            const params = getQueryParams(event);
            const sellerId = Number(params.get('seller_id'));
            if (!sellerId) return json({ error: 'Falta seller_id' }, 400);

            const reminders = await sql`
                SELECT r.*, c.name as client_name, p.name as prospect_name
                FROM crm_reminders r
                LEFT JOIN clients c ON r.client_id = c.id
                LEFT JOIN crm_prospects p ON r.prospect_id = p.id
                WHERE r.seller_id = ${sellerId}
                ORDER BY r.completed ASC, r.due_date ASC
            `;
            return json(reminders || []);
        }

        // Handle DELETE Reminder
        if (event.httpMethod === 'DELETE') {
            const params = getQueryParams(event);
            const id = Number(params.get('id'));
            if (!id) return json({ error: 'Falta ID' }, 400);

            await sql`DELETE FROM crm_reminders WHERE id = ${id}`;
            return json({ ok: true });
        }

        return json({ error: 'Método no permitido' }, 405);
    } catch (err) {
        console.error('Error in crm-reminders:', err);
        return json({ error: String(err) }, 500);
    }
}
