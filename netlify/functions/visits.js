import { ensureSchema, sql } from './_db.js';
import crypto from 'crypto';

function json(body, status = 200) {
    return {
        statusCode: status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, X-Actor-Name, x-actor-name'
        },
        body: JSON.stringify(body)
    };
}

export async function handler(event) {
    try {
        await ensureSchema();
        if (event.httpMethod === 'OPTIONS') return json({ ok: true });

        // Helper to check if user has admin permissions
        async function isAdmin(evt) {
            const h = evt.headers || {};
            const actorHeader = h['X-Actor-Name'] || h['x-actor-name'] || '';
            const actor = actorHeader.toLowerCase();
            return ['jorge', 'jorgecordoba', 'admin', 'marcela', 'aleja', 'lulitas'].includes(actor);
        }

        switch (event.httpMethod) {
            case 'POST': {
                const data = JSON.parse(event.body || '{}');
                const sessionId = data.session_id || '';
                const isSeller = !!data.is_seller;
                const sellerId = data.seller_id ? Number(data.seller_id) : null;
                const userAgent = event.headers['user-agent'] || '';
                
                // Get client IP and hash it for privacy
                const ip = event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || '127.0.0.1';
                const ipHash = crypto.createHash('sha256').update(ip).digest('hex');

                if (!sessionId) {
                    return json({ error: 'session_id es requerido' }, 400);
                }

                // Register visit
                await sql`
                    INSERT INTO store_visits (session_id, ip_hash, user_agent, is_seller, seller_id)
                    VALUES (${sessionId}, ${ipHash}, ${userAgent}, ${isSeller}, ${sellerId})
                `;

                return json({ success: true });
            }

            case 'GET': {
                // Check authorization
                const auth = await isAdmin(event);
                if (!auth) {
                    return json({ error: 'No autorizado' }, 403);
                }

                const params = event.queryStringParameters || {};
                const start = params.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
                const end = params.end || new Date().toISOString().slice(0, 10);
                const audience = params.audience || 'all'; // 'all', 'clients', 'sellers'

                const startDate = `${start} 00:00:00-05`;
                const endDate = `${end} 23:59:59-05`;

                // Base filter for audience
                let audienceFilter = sql``;
                if (audience === 'clients') {
                    audienceFilter = sql`AND is_seller = false`;
                } else if (audience === 'sellers') {
                    audienceFilter = sql`AND is_seller = true`;
                }

                // Query totals
                const totalResult = await sql`
                    SELECT 
                        COUNT(*)::int AS total_visits,
                        COUNT(DISTINCT session_id)::int AS unique_visits
                    FROM store_visits
                    WHERE visited_at >= ${startDate} AND visited_at <= ${endDate}
                    ${audienceFilter}
                `;

                // Query daily breakdown (grouping in America/Bogota or UTC-5 timezone)
                const dailyResult = await sql`
                    SELECT 
                        TO_CHAR(visited_at AT TIME ZONE 'UTC-5', 'YYYY-MM-DD') AS day,
                        COUNT(*)::int AS total,
                        COUNT(DISTINCT session_id)::int AS unique
                    FROM store_visits
                    WHERE visited_at >= ${startDate} AND visited_at <= ${endDate}
                    ${audienceFilter}
                    GROUP BY day
                    ORDER BY day ASC
                `;

                // Query user agent/devices breakdown
                const agentResult = await sql`
                    SELECT 
                        user_agent,
                        COUNT(*)::int AS total
                    FROM store_visits
                    WHERE visited_at >= ${startDate} AND visited_at <= ${endDate}
                    ${audienceFilter}
                    GROUP BY user_agent
                `;

                // Query seller activity breakdown if any sellers visited
                const sellerResult = await sql`
                    SELECT 
                        s.name AS seller_name,
                        COUNT(*)::int AS total,
                        TO_CHAR(MAX(sv.visited_at) AT TIME ZONE 'UTC-5', 'YYYY-MM-DD HH24:MI:SS') AS last_visit
                    FROM store_visits sv
                    JOIN sellers s ON sv.seller_id = s.id
                    WHERE sv.visited_at >= ${startDate} AND sv.visited_at <= ${endDate}
                      AND sv.is_seller = true
                    GROUP BY s.name
                    ORDER BY total DESC
                `;

                return json({
                    totals: totalResult[0] || { total_visits: 0, unique_visits: 0 },
                    daily: dailyResult,
                    userAgentData: agentResult,
                    sellers: sellerResult
                });
            }

            default:
                return json({ error: 'Método no permitido' }, 405);
        }
    } catch (err) {
        console.error('Visits API error:', err);
        return json({ error: String(err?.message || err) }, 500);
    }
}
