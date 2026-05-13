// import { sql, ensureSchema } from './_db.js'; // DESACTIVADO PARA PRUEBA
import https from 'https';

function json(body, status = 200) {
	return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function postRequest(url, data) {
	return new Promise((resolve, reject) => {
		const req = https.request(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' }
		}, (res) => {
			let body = '';
			res.on('data', chunk => body += chunk);
			res.on('end', () => resolve({ ok: res.statusCode < 300, status: res.statusCode, text: body }));
		});
		req.on('error', reject);
		req.write(JSON.stringify(data));
		req.end();
	});
}

export async function handler(event) {
	if (event.httpMethod === 'OPTIONS') return json({ ok: true });
	if (event.httpMethod !== 'POST') return json({ error: 'Method not allowed' }, 405);

	try {
		const { file_base64 } = JSON.parse(event.body || '{}');
		if (!file_base64) return json({ error: 'Missing file_base64' }, 400);

		const apiKey = process.env.GEMINI_API_KEY;
		if (!apiKey) return json({ error: 'GEMINI_API_KEY no configurada.' }, 500);

		const base64Data = file_base64.split(',')[1] || file_base64;
		const prompt = `Analiza este recibo de compra. Extrae una lista de productos en formato JSON. 
		Para cada producto incluye: "name" (nombre del producto), "qty" (cantidad), "total" (precio total).
		Responde ÚNICAMENTE con el objeto JSON puro: {"items": [{"name": "...", "qty": 0, "total": 0}]}`;

		const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
		
		const response = await postRequest(geminiUrl, {
			contents: [{
				parts: [
					{ text: prompt },
					{ inline_data: { mime_type: 'image/jpeg', data: base64Data } }
				]
			}]
		});

		if (!response.ok) throw new Error(`Google API Error: ${response.status}`);

		const result = JSON.parse(response.text);
		const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
		const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
		const extracted = JSON.parse(jsonStr);

		const finalItems = (extracted.items || []).map(it => ({
			...it, suggested_name: it.name
		}));

		return json({ items: finalItems });

	} catch (e) {
		return json({ error: e.message }, 500);
	}
}
