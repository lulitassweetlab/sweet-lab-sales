import { sql, ensureSchema } from '../netlify/functions/_db.js';

async function updateMessages() {
    try {
        await ensureSchema();
        console.log('Updating game messages in DB...');
        
        await sql`
            INSERT INTO store_settings (key, value)
            VALUES ('game_msg_free', 'Has ganado un POSTRE GRATIS en tu próximo pedido.\n\nEnvíalo a tu asesor y activa tu descuento ✨')
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
        `;
        
        await sql`
            INSERT INTO store_settings (key, value)
            VALUES ('game_msg_discount', 'Has ganado un {premio} de descuento en tu próximo pedido.\n\nEnvíalo a tu asesor y activa tu descuento ✨')
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
        `;
        
        console.log('Update successful!');
        process.exit(0);
    } catch (err) {
        console.error('Error updating DB:', err);
        process.exit(1);
    }
}

updateMessages();
