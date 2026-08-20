import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
    const sql = neon(process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL);
    try {
        const rows = await sql`SELECT id, entry_id, file_name, length(file_base64) as len FROM accounting_attachments ORDER BY id DESC LIMIT 5`;
        console.log("ATTACHMENTS:", rows);
        const entries = await sql`SELECT id, description FROM accounting_entries ORDER BY id DESC LIMIT 5`;
        console.log("ENTRIES:", entries);
    } catch(e) {
        console.error("ERROR:", e.message);
    }
}
check();
