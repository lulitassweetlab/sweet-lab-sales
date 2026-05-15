
import { sql } from '../netlify/functions/_db.js';
import fs from 'fs';
import path from 'path';

async function syncLogo() {
    try {
        console.log('Fetching logo from DB...');
        const rows = await sql`SELECT value FROM store_settings WHERE key = 'logo_base64'`;
        if (rows.length === 0) {
            console.log('No logo found in DB.');
            return;
        }

        const base64Data = rows[0].value;
        if (!base64Data || !base64Data.includes('base64,')) {
            console.log('Invalid logo data.');
            return;
        }

        const buffer = Buffer.from(base64Data.split('base64,')[1], 'base64');
        const logoPath = path.join(process.cwd(), 'public', 'logo.png');
        
        fs.writeFileSync(logoPath, buffer);
        console.log('Successfully updated public/logo.png from DB.');
    } catch (err) {
        console.error('Error syncing logo:', err);
    }
}

syncLogo();
