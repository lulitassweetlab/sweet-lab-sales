import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL);

async function run() {
    console.log("Iniciando simulación de visitas...");

    // 1. Obtener vendedores reales de la base de datos
    const sellers = await sql`SELECT id, name FROM sellers WHERE archived_at IS NULL LIMIT 5`;
    if (sellers.length === 0) {
        console.warn("No se encontraron vendedores. Las visitas de vendedores se insertarán de forma anónima.");
    }

    // 2. Definir fechas (Hoy, Ayer, Antier)
    const dates = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dates.push(d);
    }

    // 3. User agents simulados
    const userAgents = [
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1", // iOS Mobile
        "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36", // Android Mobile
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36", // Windows Desktop
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15", // macOS Desktop
        "Mozilla/5.0 (iPad; CPU OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1" // iPad Tablet
    ];

    const ipHashes = [
        "4f5ca68e0d9b4b9b9a6b1897e411b98fbcde48b1d609a5f45938d8216127b140",
        "fa9c18d6e3c09195914619d85b1e98bcda48c1e60aa8f45938b8216127a3399f",
        "c0a9e18d6e3c0b919514619d85b1e98bcda48c1e60aa8f45938b8216127a3311",
        "18cf9d1a6c09b919514e85b198126127b9cda48c1e60aa8f45938f82a3311bc4"
    ];

    // 4. Generar visitas
    let totalInserted = 0;

    for (const targetDate of dates) {
        const dateStr = targetDate.toISOString().slice(0, 10);
        console.log(`Generando visitas para el día: ${dateStr}...`);

        // Clientes (10-25 por día)
        const clientVisitsCount = Math.floor(Math.random() * 15) + 10;
        for (let j = 0; j < clientVisitsCount; j++) {
            const randomHour = Math.floor(Math.random() * 14) + 8; // 8 AM a 10 PM
            const randomMinute = Math.floor(Math.random() * 60);
            
            const visitTime = new Date(targetDate);
            visitTime.setHours(randomHour, randomMinute, 0);

            const sessionId = 'sess_' + Math.random().toString(36).substring(2, 12) + '_' + visitTime.getTime();
            const ipHash = ipHashes[Math.floor(Math.random() * ipHashes.length)];
            const ua = userAgents[Math.floor(Math.random() * userAgents.length)];

            await sql`
                INSERT INTO store_visits (visited_at, session_id, ip_hash, user_agent, is_seller, seller_id)
                VALUES (${visitTime}, ${sessionId}, ${ipHash}, ${ua}, false, null)
            `;
            totalInserted++;
        }

        // Vendedores (2-5 accesos por día)
        if (sellers.length > 0) {
            const sellerVisitsCount = Math.floor(Math.random() * 4) + 2;
            for (let k = 0; k < sellerVisitsCount; k++) {
                const seller = sellers[Math.floor(Math.random() * sellers.length)];
                
                const randomHour = Math.floor(Math.random() * 10) + 9; // 9 AM a 7 PM
                const randomMinute = Math.floor(Math.random() * 60);
                
                const visitTime = new Date(targetDate);
                visitTime.setHours(randomHour, randomMinute, 0);

                const sessionId = 'sess_seller_' + seller.name.toLowerCase() + '_' + visitTime.getTime();
                const ipHash = ipHashes[0]; // Same office IP usually
                const ua = userAgents[2]; // Usually desktop

                await sql`
                    INSERT INTO store_visits (visited_at, session_id, ip_hash, user_agent, is_seller, seller_id)
                    VALUES (${visitTime}, ${sessionId}, ${ipHash}, ${ua}, true, ${seller.id})
                `;
                totalInserted++;
            }
        }
    }

    console.log(`¡Simulación completada con éxito! Se insertaron ${totalInserted} registros de visitas.`);
}

run().catch(err => {
    console.error("Error al ejecutar la simulación:", err);
});
