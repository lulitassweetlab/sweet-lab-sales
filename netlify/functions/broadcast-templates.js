import { neon } from '@netlify/neon';
import { ensureSchema } from './_db.js';

const sql = neon();

export default async (req) => {
    try {
        await ensureSchema();

        const url = new URL(req.url);
        const method = req.method;

        // GET: Fetch all templates for a seller
        if (method === 'GET') {
            const sellerId = parseInt(url.searchParams.get('seller_id'), 10);
            if (!sellerId || isNaN(sellerId)) {
                return new Response(JSON.stringify({ error: 'seller_id inválido o faltante' }), { status: 400 });
            }

            const templates = await sql`
                SELECT id, title, message_text
                FROM broadcast_templates
                WHERE seller_id = ${sellerId}
                ORDER BY created_at DESC
            `;

            return new Response(JSON.stringify(templates), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // POST: Create or Update a template
        if (method === 'POST') {
            const body = await req.json();
            const sellerId = parseInt(body.seller_id, 10);
            const title = (body.title || '').trim();
            const messageText = (body.message_text || '').trim();
            const id = body.id ? parseInt(body.id, 10) : null;

            if (!sellerId || isNaN(sellerId) || !title || !messageText) {
                return new Response(JSON.stringify({ error: 'Datos incompletos.' }), { status: 400 });
            }

            let result;
            if (id) {
                // Update
                const [updated] = await sql`
                    UPDATE broadcast_templates
                    SET title = ${title}, message_text = ${messageText}
                    WHERE id = ${id} AND seller_id = ${sellerId}
                    RETURNING *
                `;
                if (!updated) {
                    return new Response(JSON.stringify({ error: 'Plantilla no encontrada o sin permisos.' }), { status: 404 });
                }
                result = updated;
            } else {
                // Insert
                const [inserted] = await sql`
                    INSERT INTO broadcast_templates (seller_id, title, message_text)
                    VALUES (${sellerId}, ${title}, ${messageText})
                    RETURNING *
                `;
                result = inserted;
            }

            return new Response(JSON.stringify(result), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // DELETE: Remove a template
        if (method === 'DELETE') {
            const id = parseInt(url.searchParams.get('id'), 10);
            const sellerId = parseInt(url.searchParams.get('seller_id'), 10);

            if (!id || isNaN(id) || !sellerId || isNaN(sellerId)) {
                return new Response(JSON.stringify({ error: 'ID o seller_id inválido' }), { status: 400 });
            }

            const [deleted] = await sql`
                DELETE FROM broadcast_templates
                WHERE id = ${id} AND seller_id = ${sellerId}
                RETURNING id
            `;

            if (!deleted) {
                return new Response(JSON.stringify({ error: 'Plantilla no encontrada o sin permisos.' }), { status: 404 });
            }

            return new Response(JSON.stringify({ success: true, id: deleted.id }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });

    } catch (err) {
        console.error('Broadcast Templates API Error:', err);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
    }
};
