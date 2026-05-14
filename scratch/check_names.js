
import { sql } from '../netlify/functions/_db.js';

async function check() {
    try {
        const desserts = await sql`SELECT name, short_code FROM desserts ORDER BY name`;
        console.log("--- DESSERTS TABLE ---");
        console.table(desserts);

        const recipes = await sql`SELECT DISTINCT dessert FROM dessert_recipes ORDER BY dessert`;
        console.log("\n--- RECIPES TABLE ---");
        console.table(recipes);
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
