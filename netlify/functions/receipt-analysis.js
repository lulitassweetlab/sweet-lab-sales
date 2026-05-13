import { sql, ensureSchema } from './_db.js';

function json(body, status = 200) {
	return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event) {
	if (event.httpMethod === 'OPTIONS') return json({ ok: true });
	if (event.httpMethod !== 'POST') return json({ error: 'Method not allowed' }, 405);

	try {
		await ensureSchema();
		const { file_base64 } = JSON.parse(event.body || '{}');
		if (!file_base64) return json({ error: 'Missing file_base64' }, 400);

		const apiKey = process.env.GEMINI_API_KEY;
		if (!apiKey) return json({ error: 'GEMINI_API_KEY not configured. Please add it to your environment variables.' }, 500);

		// Extract base64 content
		const base64Data = file_base64.split(',')[1] || file_base64;
		const mimeType = file_base64.split(';')[0].split(':')[1] || 'image/jpeg';

		const prompt = `Analiza este recibo de compra. Extrae una lista de productos en formato JSON. 
		Para cada producto incluye: "name" (nombre del producto como aparece en el recibo), "qty" (cantidad numérica), "total" (precio total de esa línea de productos).
		Si el recibo tiene muchos items, extráelos todos.
		Responde ÚNICAMENTE con el objeto JSON puro, sin bloques de código markdown, en este formato: {"items": [{"name": "...", "qty": 0, "total": 0}]}`;

		const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
		
		const response = await fetch(geminiUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				contents: [{
					parts: [
						{ text: prompt },
						{ inline_data: { mime_type: mimeType.includes('pdf') ? 'image/jpeg' : mimeType, data: base64Data } }
					]
				}]
			})
		});

		if (!response.ok) {
			const errText = await response.text();
			throw new Error(`Gemini API error: ${response.status} - ${errText}`);
		}

		const result = await response.json();
		const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
		
		// Clean any possible markdown wrappers
		const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
		let extracted = { items: [] };
		try {
			extracted = JSON.parse(jsonStr);
		} catch (parseErr) {
			console.error('Failed to parse AI response:', text);
			throw new Error('La IA devolvió un formato no válido. Intenta con una foto más clara.');
		}

		// Map names using inventory_alias
		const aliases = await sql`SELECT alias, ingredient_name FROM inventory_alias`;
		const aliasMap = new Map();
		aliases.forEach(a => aliasMap.set(a.alias.toLowerCase().trim(), a.ingredient_name));

		// Get all actual ingredients to check for direct matches
		const ingredients = await sql`SELECT ingredient FROM inventory_items`;
		const validIngredients = new Set(ingredients.map(i => i.ingredient.toLowerCase().trim()));

		const finalItems = (extracted.items || []).map(it => {
			const cleanName = (it.name || '').toLowerCase().trim();
			
			// Priority 1: Direct Match
			if (validIngredients.has(cleanName)) {
				// Find original casing
				const original = ingredients.find(i => i.ingredient.toLowerCase().trim() === cleanName);
				return { ...it, suggested_name: original.ingredient };
			}
			
			// Priority 2: Alias Match
			const mapped = aliasMap.get(cleanName);
			return { ...it, suggested_name: mapped || it.name };
		});

		return json({ items: finalItems });

	} catch (e) {
		console.error('Receipt analysis error:', e);
		return json({ error: e.message }, 500);
	}
}
