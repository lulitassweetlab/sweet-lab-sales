import { sql } from '../netlify/functions/_db.js';

async function checkCommissions() {
    try {
        const rows = await sql`
            SELECT e.description, t.name as tag_name 
            FROM accounting_entries e 
            LEFT JOIN accounting_entry_tags et ON et.entry_id = e.id
            LEFT JOIN accounting_tags t ON t.id = et.tag_id
            WHERE e.description ILIKE '%comision%' OR t.name ILIKE '%comision%'
            LIMIT 10
        `;
        console.log(JSON.stringify(rows, null, 2));
    } catch (e) {
        console.error(e);
    }
}

checkCommissions();
