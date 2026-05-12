import { handler } from '../netlify/functions/partners-report.js';

async function run() {
    process.env.NETLIFY_DATABASE_URL = 'postgresql://neondb_owner:npg_ho6GYnZIxR4t@ep-round-mountain-aesbm539-pooler.c-2.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require';
    
    const ev = {
        httpMethod: 'POST',
        headers: { authorization: 'Bearer admin' },
        body: JSON.stringify({ forceSync: true })
    };
    
    try {
        const res = await handler(ev, {});
        console.log("Status:", res.statusCode);
        if (res.statusCode !== 200) {
            console.error("BODY:", res.body);
        } else {
            const body = JSON.parse(res.body);
            const data = body.history;
            const targetData = data.find(m => m.month === '2026-04');
            console.log("LAST MONTH:", targetData.month);
            console.log("PARTNERS[0]:", JSON.stringify(targetData.partners[0]));
        }
    } catch(e) {
        console.error("ERR", e);
    }
}

run();
