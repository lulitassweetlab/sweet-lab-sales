import https from 'https';

function json(body, status = 200) {
	return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event) {
	const apiKey = process.env.GEMINI_API_KEY;
	if (!apiKey) return json({ error: 'Falta GEMINI_API_KEY' }, 500);

	const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
	
	return new Promise((resolve) => {
		https.get(url, (res) => {
			let body = '';
			res.on('data', chunk => body += chunk);
			res.on('end', () => resolve(json(JSON.parse(body), res.statusCode)));
		}).on('error', (e) => resolve(json({ error: e.message }, 500)));
	});
}
