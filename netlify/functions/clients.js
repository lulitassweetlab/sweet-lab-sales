import { neon } from '@netlify/neon';
import { ensureSchema } from './_db.js';

const sql = neon();

export default async (req) => {
    try {
        await ensureSchema();

        const url = new URL(req.url);
        const method = req.method;

        // ========================
        // GET: Fetch all clients for a seller
        // ========================
        if (method === 'GET') {
            const sellerIdStr = url.searchParams.get('seller_id');

            // Global fetch for superadmins
            const isGlobal = url.searchParams.get('global') === '1';

            if (!isGlobal && !sellerIdStr) {
                return new Response(JSON.stringify({ error: 'Falta seller_id' }), { status: 400 });
            }

            let clients = [];

            if (isGlobal) {
                // Combine explicit clients with implicit historical clients from the sales table
                clients = await sql`
                    SELECT 
                        name, 
                        MAX(short_name) AS short_name,
                        MAX(whatsapp) AS whatsapp,
                        MAX(birth_date) AS birth_date,
                        MAX(seller_name) AS seller_name
                    FROM (
                        SELECT 
                            c.name, 
                            c.short_name,
                            c.whatsapp, 
                            CAST(c.birth_date AS VARCHAR) AS birth_date,
                            s.name as seller_name
                        FROM clients c
                        LEFT JOIN sellers s ON c.seller_id = s.id
                        
                        UNION ALL
                        
                        SELECT
                            sa.client_name as name,
                            NULL::VARCHAR as short_name,
                            NULL::VARCHAR as whatsapp,
                            NULL::VARCHAR as birth_date,
                            s.name as seller_name
                        FROM sales sa
                        LEFT JOIN sellers s ON sa.seller_id = s.id
                        WHERE sa.client_name IS NOT NULL AND TRIM(sa.client_name) != ''
                    ) subq
                    GROUP BY name
                    ORDER BY name ASC
                `;
            } else {
                const sellerId = parseInt(sellerIdStr, 10);
                if (isNaN(sellerId)) {
                    return new Response(JSON.stringify({ error: 'seller_id inválido' }), { status: 400 });
                }

                // Return all clients, ordered by name alphabetically
                clients = await sql`
                    SELECT * 
                    FROM clients 
                    WHERE seller_id = ${sellerId}
                    ORDER BY name ASC
                `;
            }

            return new Response(JSON.stringify(clients), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // ========================
        // POST/PUT: Upsert a client
        // ========================
        if (method === 'POST' || method === 'PUT') {
            const body = await req.json();
            const sellerId = parseInt(body.seller_id, 10);
            const name = (body.name || '').trim();
            const shortName = (body.short_name || '').trim() || null;
            const whatsapp = (body.whatsapp || '').trim() || null;
            const birthDate = body.birth_date || null;

            if (!sellerId || isNaN(sellerId)) {
                return new Response(JSON.stringify({ error: 'seller_id inválido o faltante' }), { status: 400 });
            }

            if (!name) {
                return new Response(JSON.stringify({ error: 'El nombre del cliente es obligatorio' }), { status: 400 });
            }

            // ========================
            // Handle Merge Action
            // ========================
            if (url.searchParams.get('action') === 'merge') {
                const sourceNames = body.source_names || [];
                if (!Array.isArray(sourceNames) || sourceNames.length === 0) {
                    return new Response(JSON.stringify({ error: 'Se requiere una lista de nombres para fusionar' }), { status: 400 });
                }

                // Ensure the target name exists in the database
                const [targetClient] = await sql`
                    INSERT INTO clients (seller_id, name, short_name, whatsapp, birth_date)
                    VALUES (${sellerId}, ${name}, ${shortName}, ${whatsapp}, ${birthDate})
                    ON CONFLICT (name, seller_id) DO UPDATE SET
                        short_name = COALESCE(EXCLUDED.short_name, clients.short_name),
                        whatsapp = COALESCE(clients.whatsapp, EXCLUDED.whatsapp),
                        birth_date = COALESCE(clients.birth_date, EXCLUDED.birth_date)
                    RETURNING *
                `;

                // Update all sales history for this seller that match the source names
                // Using `= ANY(...)` to match the array of old names
                await sql`
                    UPDATE sales 
                    SET client_name = ${name}
                    WHERE seller_id = ${sellerId} AND LOWER(client_name) = ANY(${sourceNames.map(n => n.toLowerCase())})
                `;

                // Delete the old clients from the clients table 
                // We do not delete the target name even if it was in the sourceNames list just in case
                const lowerNamesToDelete = sourceNames.map(n => n.toLowerCase()).filter(n => n !== name.toLowerCase());
                if (lowerNamesToDelete.length > 0) {
                    await sql`
                        DELETE FROM clients
                        WHERE seller_id = ${sellerId} AND LOWER(name) = ANY(${lowerNamesToDelete})
                    `;
                }

                return new Response(JSON.stringify({ success: true, target_client: targetClient }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            // ========================
            // Standard Create / Update
            // ========================
            // Check if client exists to either insert or update
            const [existing] = await sql`
				SELECT id FROM clients 
				WHERE seller_id = ${sellerId} AND LOWER(name) = LOWER(${name})
			`;

            let result;

            if (existing) {
                // Update existing
                const [updated] = await sql`
					UPDATE clients 
					SET 
                        short_name = COALESCE(${shortName}, short_name),
						whatsapp = COALESCE(${whatsapp}, whatsapp),
						birth_date = COALESCE(${birthDate}, birth_date)
					WHERE id = ${existing.id}
					RETURNING *
				`;
                result = updated;
            } else {
                // Insert new
                const [inserted] = await sql`
					INSERT INTO clients (seller_id, name, short_name, whatsapp, birth_date)
					VALUES (${sellerId}, ${name}, ${shortName}, ${whatsapp}, ${birthDate})
					RETURNING *
				`;
                result = inserted;
            }

            return new Response(JSON.stringify(result), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });

    } catch (err) {
        console.error('Clients API Error:', err);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
    }
};
