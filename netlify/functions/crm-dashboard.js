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

        if (event.httpMethod !== 'GET') {
            return json({ error: 'Método no permitido' }, 405);
        }

        const params = getQueryParams(event);
        const sellerId = Number(params.get('seller_id'));

        if (!sellerId) {
            return json({ error: 'Falta seller_id' }, 400);
        }

        // 1. Informes/KPIs generales
        // Total de clientes, Deuda total (dinero en la calle)
        const statsQuery = await sql`
            SELECT 
                COUNT(DISTINCT c.id) as total_clients,
                COALESCE(SUM(CASE WHEN s.is_paid = false THEN s.total_cents ELSE 0 END), 0) as total_debt_cents
            FROM clients c
            LEFT JOIN crm_client_sales cs ON c.id = cs.client_id
            LEFT JOIN sales s ON cs.sale_id = s.id
            WHERE c.seller_id = ${sellerId}
        `;
        const stats = {
            total_clients: Number(statsQuery[0]?.total_clients || 0),
            total_debt_cents: Number(statsQuery[0]?.total_debt_cents || 0)
        };

        // 2. Recordatorios para hoy o vencidos
        const remindersToday = await sql`
            SELECT id, title, description, due_date, reminder_type, priority, completed, client_id, prospect_id 
            FROM crm_reminders 
            WHERE seller_id = ${sellerId} 
            AND completed = false 
            AND due_date <= (CURRENT_DATE + INTERVAL '1 day')
            ORDER BY priority DESC, due_date ASC
        `;

        // 3. Cumpleañeros (Próximos 7 días)
        const upcomingBirthdays = await sql`
            SELECT id, name, whatsapp, birth_date
            FROM clients
            WHERE seller_id = ${sellerId}
            AND birth_date IS NOT NULL
            AND (
                (EXTRACT(MONTH FROM birth_date) = EXTRACT(MONTH FROM CURRENT_DATE) AND EXTRACT(DAY FROM birth_date) >= EXTRACT(DAY FROM CURRENT_DATE))
                OR
                (EXTRACT(MONTH FROM birth_date) = EXTRACT(MONTH FROM CURRENT_DATE + INTERVAL '7 days') AND EXTRACT(DAY FROM birth_date) <= EXTRACT(DAY FROM CURRENT_DATE + INTERVAL '7 days'))
            )
            ORDER BY EXTRACT(MONTH FROM birth_date), EXTRACT(DAY FROM birth_date)
            LIMIT 15
        `;

        // 4. Clientes para Reactivar (Inactivos > 30 días, ordenados de más inactivo a menos inactivo)
        const inactiveClientsRaw = await sql`
            WITH ClientSales AS (
                SELECT c.id, c.name, c.whatsapp, MAX(s.created_at) as last_date
                FROM clients c
                JOIN crm_client_sales cs ON c.id = cs.client_id
                JOIN sales s ON cs.sale_id = s.id
                WHERE c.seller_id = ${sellerId}
                GROUP BY c.id, c.name, c.whatsapp
            )
            SELECT id, name, whatsapp, last_date as last_purchase_date
            FROM ClientSales
            WHERE last_date < NOW() - INTERVAL '30 days'
            ORDER BY last_date ASC
            LIMIT 20
        `;

        return json({
            stats,
            remindersToday: remindersToday || [],
            upcomingBirthdays: upcomingBirthdays || [],
            inactiveClients: inactiveClientsRaw || []
        });

    } catch (err) {
        console.error('Error in crm-dashboard:', err);
        return json({ error: String(err) }, 500);
    }
}
