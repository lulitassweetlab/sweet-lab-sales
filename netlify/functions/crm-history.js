import { ensureSchema, sql } from './_db.js';

function json(body, status = 200) {
    return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event) {
    try {
        await ensureSchema();
        if (event.httpMethod === 'OPTIONS') return json({ ok: true });

        const params = new URLSearchParams(event.rawQuery || event.queryStringParameters || '');
        const sellerId = Number(params.get('seller_id'));
        if (!sellerId) return json({ error: 'Falta seller_id' }, 400);

        // GET History (Last 7 days)
        if (event.httpMethod === 'GET') {
            const activities = await sql`
                SELECT a.*, c.name as client_name
                FROM crm_activities a
                JOIN clients c ON a.client_id = c.id
                WHERE a.seller_id = ${sellerId}
                AND a.created_at >= now() - interval '7 days'
                ORDER BY a.created_at DESC
                LIMIT 100
            `;
            return json(activities);
        }

        // DELETE Activity (Undo check)
        if (event.httpMethod === 'DELETE') {
            const id = Number(params.get('id'));
            if (!id) return json({ error: 'Falta ID' }, 400);

            // Fetch activity to see what it was
            const [activity] = await sql`SELECT * FROM crm_activities WHERE id = ${id} AND seller_id = ${sellerId}`;
            if (!activity) return json({ error: 'Actividad no encontrada' }, 404);

            // If it was a dashboard check, we might want to "uncheck" it?
            // Actually, for now, just deleting the activity note is the "undo" in terms of history.
            // If the user wants to truly uncheck (make it reappear in dashboard), they'd need to clear last_dashboard_check.
            
            await sql`DELETE FROM crm_activities WHERE id = ${id}`;
            return json({ ok: true });
        }

        // PUT Edit Activity
        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body || '{}');
            const id = Number(data.id);
            const description = data.description;
            if (!id || !description) return json({ error: 'Faltan campos' }, 400);

            await sql`
                UPDATE crm_activities 
                SET description = ${description} 
                WHERE id = ${id} AND seller_id = ${sellerId}
            `;
            return json({ ok: true });
        }

        return json({ error: 'Método no permitido' }, 405);
    } catch (err) {
        console.error('Error in crm-history:', err);
        return json({ error: String(err) }, 500);
    }
}
