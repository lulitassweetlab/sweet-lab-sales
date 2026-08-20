import { neon } from '@neondatabase/serverless';

const dbUrl = "postgresql://neondb_owner:npg_1bXpL9OavIfS@ep-restless-bird-a8f8tntw-pooler.eastus2.azure.neon.tech/neondb?sslmode=require";

async function check() {
    console.log("Checking DB connection speed...");
    const sql = neon(dbUrl);
    const start = Date.now();
    try {
        for (let i = 0; i < 15; i++) {
            await sql`SELECT 1`;
        }
        console.log(`15 queries took ${Date.now() - start}ms`);
    } catch(e) {
        console.error("ERROR:", e.message);
    }
}
check();
