
import { sql } from './netlify/functions/_db.js';

async function check() {
    try {
        const results = await sql`
            SELECT id, name, latitude, longitude 
            FROM clients 
            WHERE latitude IS NOT NULL AND latitude != 0 
            LIMIT 5
        `;
        console.log('Clients with valid locations in DB:');
        console.log(JSON.stringify(results, null, 2));
        
        const total = await sql`SELECT COUNT(*) as cnt FROM clients`;
        const withLoc = await sql`SELECT COUNT(*) as cnt FROM clients WHERE latitude IS NOT NULL AND latitude != 0`;
        console.log(`Total clients: ${total[0].cnt}, With location: ${withLoc[0].cnt}`);
    } catch (e) {
        console.error('Error querying DB:', e);
    }
}

check();
