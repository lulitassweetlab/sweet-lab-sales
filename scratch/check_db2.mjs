import { neon } from '@neondatabase/serverless';

// The project uses netlify, so the variable is usually NETLIFY_DATABASE_URL
const dbUrl = "postgresql://neondb_owner:npg_1bXpL9OavIfS@ep-restless-bird-a8f8tntw-pooler.eastus2.azure.neon.tech/neondb?sslmode=require";

async function check() {
    const sql = neon(dbUrl);
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
