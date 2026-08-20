import { sql } from '../netlify/functions/_db.js';

async function merge() {
    try {
        console.log("--- STARTING MERGE ---");
        
        // 1. Move all movements from 'Bolsa para cuchara' to 'Bolsa cuchara'
        const moveRes = await sql`
            UPDATE inventory_movements 
            SET ingredient = 'Bolsa cuchara' 
            WHERE ingredient = 'Bolsa para cuchara'
            RETURNING id
        `;
        console.log(`Moved ${moveRes.length} movements.`);

        // 2. Delete the redundant 'Bolsa para cuchara' from inventory_items
        const delRes = await sql`
            DELETE FROM inventory_items 
            WHERE ingredient = 'Bolsa para cuchara'
            RETURNING id
        `;
        console.log(`Deleted ${delRes.length} redundant items.`);

        // 3. Ensure 'Bolsa cuchara' exists and has price 9
        const upRes = await sql`
            UPDATE inventory_items 
            SET price = 9 
            WHERE ingredient = 'Bolsa cuchara'
            RETURNING id
        `;
        
        if (upRes.length === 0) {
            console.log("Bolsa cuchara not found, creating it...");
            await sql`
                INSERT INTO inventory_items (ingredient, unit, category, price)
                VALUES ('Bolsa cuchara', 'unidad', 'empaque', 9)
            `;
        } else {
            console.log("Updated Bolsa cuchara price to 9.");
        }

        console.log("--- MERGE COMPLETE ---");

    } catch (err) {
        console.error("ERROR during merge:", err);
    }
}

merge();
