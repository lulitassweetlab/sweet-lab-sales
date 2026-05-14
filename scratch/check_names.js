
import { sql } from '../netlify/functions/_db.js';

async function check() {
    try {
        const desserts = await sql`SELECT name, short_code FROM desserts ORDER BY name`;
        console.log("--- DESSERTS TABLE ---");
        console.table(desserts);

        const recipes = await sql`SELECT DISTINCT dessert FROM dessert_recipes WHERE lower(dessert) LIKE '%bx5%' OR lower(dessert) LIKE '%brim%' OR lower(dessert) LIKE '%brownie%' ORDER BY dessert`;
        console.log("\n--- SEARCH RESULTS ---");
        console.table(recipes);
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
