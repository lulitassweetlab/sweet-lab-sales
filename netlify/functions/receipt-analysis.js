export async function handler(event) {
	if (event.httpMethod !== 'POST') {
		return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
	}

	try {
		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ 
				items: [{ name: "Producto de Prueba (Ultra Clean)", qty: 1, total: 100 }] 
			})
		};
	} catch (e) {
		return {
			statusCode: 500,
			body: JSON.stringify({ error: e.message })
		};
	}
}
