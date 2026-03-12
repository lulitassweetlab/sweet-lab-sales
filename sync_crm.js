import { sql } from './netlify/functions/_db.js';

async function run() {
    try {
        console.log("Starting CRM backfill...");
        // Get all sales with a client name that are NOT linked in crm_client_sales
        const sales = await sql`
            SELECT s.id, s.seller_id, s.client_name 
            FROM sales s 
            LEFT JOIN crm_client_sales cs ON s.id = cs.sale_id
            WHERE cs.sale_id IS NULL 
              AND s.client_name IS NOT NULL 
              AND TRIM(s.client_name) != ''
        `;

        console.log(`Found ${sales.length} unlinked sales.`);
        let linked = 0;
        let createdClients = 0;

        for (const sale of sales) {
            const clientName = sale.client_name.trim();
            const sellerId = sale.seller_id;
            if (!sellerId) continue;
            
            // Find existing client for this seller
            let [client] = await sql`
                SELECT id FROM clients 
                WHERE seller_id = ${sellerId} AND lower(name) = lower(${clientName})
            `;
            
            if (!client) {
                const shortName = clientName.split(' ')[0] || clientName;
                [client] = await sql`
                    INSERT INTO clients (seller_id, name, short_name) 
                    VALUES (${sellerId}, ${clientName}, ${shortName}) 
                    RETURNING id
                `;
                createdClients++;
            }
            
            if (client && client.id) {
                await sql`
                    INSERT INTO crm_client_sales (client_id, sale_id, seller_id) 
                    VALUES (${client.id}, ${sale.id}, ${sellerId})
                `;
                linked++;
            }
        }
        
        console.log(`Backfill complete. Linked ${linked} sales. Created ${createdClients} new CRM profiles.`);
    } catch(err) {
        console.error("Error:", err);
    } finally {
        process.exit();
    }
}

run();
