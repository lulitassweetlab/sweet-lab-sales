import { ensureSchema, sql } from './_db.js';

function json(body, status = 200) {
	return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event) {
	try {
		await ensureSchema();
		if (event.httpMethod === 'OPTIONS') return json({ ok: true });
		switch (event.httpMethod) {
			case 'GET': {
				// List users for reports
				const rows = await sql`SELECT id, username, password_hash, role, created_at FROM users ORDER BY username ASC`;
				return json(rows);
			}
			case 'POST': {
				// Login
				const data = JSON.parse(event.body || '{}');
				const username = (data.username || '').toString().trim().toLowerCase();
				const password = (data.password || '').toString();
				if (!username || !password) return json({ error: 'Credenciales requeridas' }, 400);
				const rows = await sql`SELECT id, username, password_hash, role FROM users WHERE lower(username) = ${username} LIMIT 1`;
				if (!rows.length) return json({ error: 'Usuario o contraseña inválidos' }, 401);
				const user = rows[0];
				if (user.password_hash !== password) return json({ error: 'Usuario o contraseña inválidos' }, 401);
				return json({ username: user.username, role: user.role });
			}
			case 'PUT': {
				// Change password
				// Expect JSON: { username, currentPassword, newPassword }
				const data = JSON.parse(event.body || '{}');
				const username = (data.username || '').toString().trim().toLowerCase();
				const currentPassword = (data.currentPassword || '').toString();
				const newPassword = (data.newPassword || '').toString();
				if (!username || !currentPassword || !newPassword) return json({ error: 'Datos incompletos' }, 400);
				if (newPassword.length < 6) return json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' }, 400);
				const rows = await sql`SELECT id, username, password_hash FROM users WHERE lower(username) = ${username} LIMIT 1`;
				if (!rows.length) return json({ error: 'Usuario no encontrado' }, 404);
				const user = rows[0];
				if (user.password_hash !== currentPassword) return json({ error: 'Contraseña actual incorrecta' }, 401);
				await sql`UPDATE users SET password_hash=${newPassword} WHERE id=${user.id}`;
				return json({ ok: true });
			}
			default:
				return json({ error: 'Método no permitido' }, 405);
		}
	} catch (err) {
		return json({ error: String(err) }, 500);
	}
}