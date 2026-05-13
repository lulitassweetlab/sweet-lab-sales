import { sql, ensureSchema } from './_db.js';
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
		await ensureSchema();
		const { file_base64 } = JSON.parse(event.body || '{}');
		if (!file_base64) return json({ error: 'Missing file_base64' }, 400);

		const apiKey = process.env.GEMINI_API_KEY;
		if (!apiKey) return json({ error: 'GEMINI_API_KEY no configurada en Netlify.' }, 500);

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

		if (!response.ok) {
			throw new Error(`Google API Error (${response.status}): ${response.text}`);
		}

		const result = JSON.parse(response.text);
		const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
		const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
		
		let extracted = { items: [] };
		try {
			extracted = JSON.parse(jsonStr);
		} catch (e) {
			throw new Error('La IA devolvió un formato no válido.');
		}

		const aliases = await sql`SELECT alias, ingredient_name FROM inventory_alias`;
		const aliasMap = new Map(aliases.map(a => [a.alias.toLowerCase().trim(), a.ingredient_name]));

		const ingredients = await sql`SELECT ingredient FROM inventory_items`;
		const validIngredients = new Set(ingredients.map(i => i.ingredient.toLowerCase().trim()));

		const finalItems = (extracted.items || []).map(it => {
			const cleanName = (it.name || '').toLowerCase().trim();
			if (validIngredients.has(cleanName)) {
				const original = ingredients.find(i => i.ingredient.toLowerCase().trim() === cleanName);
				return { ...it, suggested_name: original.ingredient };
			}
			const mapped = aliasMap.get(cleanName);
			return { ...it, suggested_name: mapped || it.name };
		});

		return json({ items: finalItems });

	} catch (e) {
		console.error('Receipt analysis error:', e);
		return json({ error: e.message }, 500);
	}
}
