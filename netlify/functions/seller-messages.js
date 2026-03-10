import { neon } from '@netlify/neon';
import { ensureSchema } from './_db.js';

const sql = neon();

export default async (req) => {
    try {
        await ensureSchema();
        const url = new URL(req.url);
        const method = req.method;

        // GET: Fetch seller messages
        if (method === 'GET') {
            const sellerIdStr = url.searchParams.get('seller_id');
            if (!sellerIdStr) return new Response(JSON.stringify({ error: 'Falta seller_id' }), { status: 400 });

            const sellerId = parseInt(sellerIdStr, 10);
            if (isNaN(sellerId)) return new Response(JSON.stringify({ error: 'seller_id inválido' }), { status: 400 });

            const messages = await sql`
                SELECT id, event_type, message_text, is_active 
                FROM seller_messages 
                WHERE seller_id = ${sellerId}
            `;

            return new Response(JSON.stringify(messages), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // POST: Upsert a seller message
        if (method === 'POST') {
            const body = await req.json();
            const { seller_id, event_type, message_text, is_active } = body;

            if (!seller_id || !event_type || typeof message_text !== 'string') {
                return new Response(JSON.stringify({ error: 'Datos incompletos.' }), { status: 400 });
            }

            const active = !!is_active;

            const updated = await sql`
                INSERT INTO seller_messages (seller_id, event_type, message_text, is_active)
                VALUES (${seller_id}, ${event_type}, ${message_text}, ${active})
                ON CONFLICT (seller_id, event_type) DO UPDATE SET 
                    message_text = EXCLUDED.message_text,
                    is_active = EXCLUDED.is_active
                RETURNING id, event_type, message_text, is_active
            `;

            return new Response(JSON.stringify(updated[0]), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
    } catch (err) {
        console.error('Error in seller-messages endpoint:', err);
        return new Response(JSON.stringify({ error: 'Error del lado del servidor', det: err.message }), { status: 500 });
    }
};
