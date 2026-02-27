import { sql } from './_db.js';

function json(body, status = 200) {
    return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event) {
    try {
        if (event.httpMethod === 'OPTIONS') return json({ ok: true });
        if (event.httpMethod !== 'GET') return json({ error: 'Método no permitido' }, 405);

        // Authenticate
        const headers = event.headers || {};
        const actorName = (headers['x-actor-name'] || headers['X-Actor-Name'] || '').toString();

        if (!actorName) {
            return json({ error: 'No autorizado' }, 403);
        }

        // Parse seller_id
        const raw = typeof event.rawQuery === 'string' ? event.rawQuery : (event.queryStringParameters ? new URLSearchParams(event.queryStringParameters).toString() : '');
        const params = new URLSearchParams(raw);
        const sellerId = Number(params.get('seller_id'));

        if (!sellerId) {
            return json({ error: 'Falta seller_id' }, 400);
        }

        // Security check: actor must be a seller matching this ID, or an admin
        const [user] = await sql`SELECT role FROM users WHERE lower(username) = lower(${actorName}) LIMIT 1`;
        if (!user) return json({ error: 'Usuario no encontrado' }, 403);

        const role = user.role;
        let hasPermission = false;

        if (role === 'admin' || role === 'superadmin') {
            hasPermission = true;
        } else {
            // Check if actor is the requested seller
            const [seller] = await sql`SELECT id FROM sellers WHERE lower(name) = lower(${actorName}) LIMIT 1`;
            if (seller && Number(seller.id) === sellerId) {
                hasPermission = true;
            }
        }

        if (!hasPermission) {
            return json({ error: 'No tienes permiso para ver los clientes de este vendedor' }, 403);
        }

        // Optimized query: get distinct non-empty client names for this seller, max 1000 to prevent payload bloat, ordered by recency optionally, or just distinct
        // A fast approach is group by to get unique names. We'll sort by how many times they bought to show best customers first.
        const rows = await sql`
			SELECT TRIM(client_name) as name, COUNT(*) as frequency
			FROM sales
			WHERE seller_id = ${sellerId}
			  AND client_name IS NOT NULL
			  AND TRIM(client_name) != ''
			GROUP BY TRIM(client_name)
			ORDER BY frequency DESC, name ASC
			LIMIT 500
		`;

        const clients = rows.map(r => r.name);
        return json(clients);
    } catch (err) {
        console.error('Error in clients API:', err);
        return json({ error: String(err) }, 500);
    }
}
