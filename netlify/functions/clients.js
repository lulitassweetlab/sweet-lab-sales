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
            const description = body.description === undefined ? null : body.description;
            const address = body.address || null;
            const latitude = body.latitude || null;
            const longitude = body.longitude || null;

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
                    INSERT INTO clients (seller_id, name, short_name, whatsapp, birth_date, description, address, latitude, longitude)
                    VALUES (${sellerId}, ${name}, ${shortName}, ${whatsapp}, ${birthDate}, ${description}, ${address}, ${latitude}, ${longitude})
                    ON CONFLICT (name, seller_id) DO UPDATE SET
                        short_name = COALESCE(EXCLUDED.short_name, clients.short_name),
                        whatsapp = COALESCE(EXCLUDED.whatsapp, clients.whatsapp),
                        birth_date = COALESCE(EXCLUDED.birth_date, clients.birth_date),
                        description = COALESCE(EXCLUDED.description, clients.description),
                        address = EXCLUDED.address,
                        latitude = EXCLUDED.latitude,
                        longitude = EXCLUDED.longitude
                    RETURNING *
                `;

                // Update all sales history for this seller that match the source names
                // Using `= ANY(...)` to match the array of old names
                await sql`
                    UPDATE sales 
                    SET client_name = ${name}
                    WHERE seller_id = ${sellerId} AND LOWER(client_name) = ANY(${sourceNames.map(n => n.toLowerCase())})
                `;

                // Delete the old clients from the clients table, but first transfer CRM data to the combined profile
                const lowerNamesToDelete = sourceNames.map(n => n.toLowerCase()).filter(n => n !== name.toLowerCase());
                if (lowerNamesToDelete.length > 0) {
                    
                    // 1. Rebind CRM bridge so we don't lose links when we delete clients matching sourceNames
                    await sql`
                        UPDATE crm_client_sales cs
                        SET client_id = ${targetClient.id}
                        FROM clients c
                        WHERE cs.client_id = c.id
                          AND c.seller_id = ${sellerId}
                          AND LOWER(c.name) = ANY(${lowerNamesToDelete})
                    `;
                    
                    // 2. Rebind Activities & Reminders
                    await sql`
                        UPDATE crm_activities ca
                        SET client_id = ${targetClient.id}
                        FROM clients c
                        WHERE ca.client_id = c.id
                          AND c.seller_id = ${sellerId}
                          AND LOWER(c.name) = ANY(${lowerNamesToDelete})
                    `;
                    
                    await sql`
                        UPDATE crm_reminders cr
                        SET client_id = ${targetClient.id}
                        FROM clients c
                        WHERE cr.client_id = c.id
                          AND c.seller_id = ${sellerId}
                          AND LOWER(c.name) = ANY(${lowerNamesToDelete})
                    `;

                    // 3. Delete old implicit profiles safely
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
            // Handle Rename Action
            // ========================
            if (url.searchParams.get('action') === 'rename') {
                const oldName = (body.old_name || '').trim();
                if (!oldName) return new Response(JSON.stringify({ error: 'Falta old_name' }), { status: 400 });

                // Find old client profile (if it exists)
                const [oldClient] = await sql`
                    SELECT * FROM clients WHERE seller_id = ${sellerId} AND LOWER(name) = LOWER(${oldName})
                `;

                // Check if the NEW name already exists as a client profile
                let [targetClient] = await sql`
                    SELECT * FROM clients WHERE seller_id = ${sellerId} AND LOWER(name) = LOWER(${name})
                `;

                if (targetClient && oldClient && targetClient.id !== oldClient.id) {
                    // MERGE SCENARIO
                    // Target already exists. We update its details picking the best available from both and the request body.
                        [targetClient] = await sql`
                        UPDATE clients SET 
                            short_name = COALESCE(clients.short_name, ${oldClient.short_name}, ${shortName}),
                            whatsapp = COALESCE(clients.whatsapp, ${oldClient.whatsapp}, ${whatsapp}),
                            birth_date = COALESCE(clients.birth_date, ${oldClient.birth_date}, ${birthDate}),
                            description = COALESCE(clients.description, ${oldClient.description}, ${description}),
                            address = COALESCE(clients.address, ${oldClient.address}, ${address}),
                            latitude = COALESCE(clients.latitude, ${oldClient.latitude}, ${latitude}),
                            longitude = COALESCE(clients.longitude, ${oldClient.longitude}, ${longitude})
                        WHERE id = ${targetClient.id}
                        RETURNING *
                    `;

                    // Relink all referencing tables
                    await sql`UPDATE crm_client_sales SET client_id = ${targetClient.id} WHERE client_id = ${oldClient.id}`;
                    await sql`UPDATE crm_activities SET client_id = ${targetClient.id} WHERE client_id = ${oldClient.id}`;
                    await sql`UPDATE crm_whatsapp_logs SET client_id = ${targetClient.id} WHERE client_id = ${oldClient.id}`;
                    await sql`UPDATE crm_stage_history SET client_id = ${targetClient.id} WHERE client_id = ${oldClient.id}`;
                    await sql`UPDATE crm_stage_actions SET client_id = ${targetClient.id} WHERE client_id = ${oldClient.id}`;
                    
                    // CRM Reminders and other optional tables
                    try { await sql`UPDATE crm_reminders SET client_id = ${targetClient.id} WHERE client_id = ${oldClient.id}`; } catch(e){}
                    
                    // Handle current stage: If target has no stage but old one does, move it
                    try {
                        const [targetStage] = await sql`SELECT 1 FROM crm_client_stage WHERE client_id = ${targetClient.id}`;
                        if (!targetStage) {
                            await sql`UPDATE crm_client_stage SET client_id = ${targetClient.id} WHERE client_id = ${oldClient.id}`;
                        } else {
                            // If both have stages, we keep target's stage and just delete the old record to avoid unique constraint error
                            await sql`DELETE FROM crm_client_stage WHERE client_id = ${oldClient.id}`;
                        }
                    } catch(e){}

                    // Delete old client profile
                    await sql`DELETE FROM clients WHERE id = ${oldClient.id}`;
                } else if (!targetClient && oldClient) {
                    // RENAME SCENARIO (Target doesn't exist)
                    [targetClient] = await sql`
                        UPDATE clients SET 
                            name = ${name},
                            short_name = COALESCE(${shortName}, short_name),
                            whatsapp = COALESCE(${whatsapp}, whatsapp),
                            birth_date = COALESCE(${birthDate}, birth_date),
                            description = COALESCE(${description}, description),
                            address = COALESCE(${address}, address),
                            latitude = COALESCE(${latitude}, latitude),
                            longitude = COALESCE(${longitude}, longitude)
                        WHERE id = ${oldClient.id}
                        RETURNING *
                    `;
                } else if (!targetClient && !oldClient) {
                    // NEITHER EXIST (just creating new)
                    [targetClient] = await sql`
                        INSERT INTO clients (seller_id, name, short_name, whatsapp, birth_date, description, address, latitude, longitude)
                        VALUES (${sellerId}, ${name}, ${shortName}, ${whatsapp}, ${birthDate}, ${description}, ${address}, ${latitude}, ${longitude})
                        RETURNING *
                    `;
                } else if (targetClient && !oldClient) {
                    // Target exists, old doesn't. Just update target.
                    [targetClient] = await sql`
                        UPDATE clients SET 
                            short_name = COALESCE(${shortName}, short_name),
                            whatsapp = COALESCE(${whatsapp}, whatsapp),
                            birth_date = COALESCE(${birthDate}, birth_date),
                            description = COALESCE(${description}, description),
                            address = COALESCE(${address}, address),
                            latitude = COALESCE(${latitude}, latitude),
                            longitude = COALESCE(${longitude}, longitude)
                        WHERE id = ${targetClient.id}
                        RETURNING *
                    `;
                }

                // Update sales string so history reflects the new name regardless of whether oldClient existed as a formal profile
                await sql`UPDATE sales SET client_name = ${name} WHERE seller_id = ${sellerId} AND LOWER(client_name) = LOWER(${oldName})`;

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
						birth_date = COALESCE(${birthDate}, birth_date),
                        description = COALESCE(${description}, description),
                        address = ${address},
                        latitude = ${latitude},
                        longitude = ${longitude}
					WHERE id = ${existing.id}
					RETURNING *
				`;
                result = updated;
            } else {
                // Insert new
                const [inserted] = await sql`
					INSERT INTO clients (seller_id, name, short_name, whatsapp, birth_date, description, address, latitude, longitude)
					VALUES (${sellerId}, ${name}, ${shortName}, ${whatsapp}, ${birthDate}, ${description}, ${address}, ${latitude}, ${longitude})
					RETURNING *
				`;
                result = inserted;
            }

            // ASSIGN TAGS (CRM Tags)
            const tagIds = body.tag_ids;
            if (result && result.id && Array.isArray(tagIds) && tagIds.length > 0) {
                for (const tagId of tagIds) {
                    await sql`
                        INSERT INTO crm_client_tags (client_id, tag_id)
                        VALUES (${result.id}, ${tagId})
                        ON CONFLICT DO NOTHING
                    `;
                }
            }

            return new Response(JSON.stringify(result), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }


        // ========================
        // DELETE: Remove a client profile
        // ========================
        if (method === 'DELETE') {
            const clientId = parseInt(url.searchParams.get('id'), 10);
            const sellerId = parseInt(url.searchParams.get('seller_id'), 10);

            if (!clientId || isNaN(clientId)) {
                return new Response(JSON.stringify({ error: 'Falta id de cliente' }), { status: 400 });
            }
            if (!sellerId || isNaN(sellerId)) {
                return new Response(JSON.stringify({ error: 'Falta seller_id' }), { status: 400 });
            }

            // Ensure the client belongs to this seller before deleting
            const [client] = await sql`
                SELECT id FROM clients WHERE id = ${clientId} AND seller_id = ${sellerId}
            `;
            if (!client) {
                return new Response(JSON.stringify({ error: 'Cliente no encontrado o sin permiso' }), { status: 404 });
            }

            await sql`DELETE FROM clients WHERE id = ${clientId}`;
            return new Response(JSON.stringify({ success: true }), {
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
