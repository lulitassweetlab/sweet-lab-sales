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
				// List users for reports, including sellers without an explicit user row
				const userRows = await sql`SELECT id, username, password_hash, role, created_at FROM users ORDER BY username ASC`;
				const sellerRows = await sql`SELECT name FROM sellers ORDER BY name ASC`;
				const seen = new Set(userRows.map(u => (u.username || '').toString().toLowerCase()));
				const extras = [];
				for (const s of (sellerRows || [])) {
					const name = (s.name || '').toString();
					if (!name) continue;
					const key = name.toLowerCase();
					if (seen.has(key)) continue;
					// Default password rule matches legacy: (username + 'sweet').toLowerCase()
					extras.push({ id: null, username: name, password_hash: (name + 'sweet').toLowerCase(), role: 'user', created_at: null });
				}
				return json([...userRows, ...extras]);
			}
			case 'POST': {
				// Login
				const data = JSON.parse(event.body || '{}');
				const rawUsername = (data.username || '').toString().trim();
				const username = rawUsername.toLowerCase();
				const password = (data.password || '').toString();
				if (!username || !password) return json({ error: 'Credenciales requeridas' }, 400);
				const rows = await sql`SELECT id, username, password_hash, role FROM users WHERE lower(username) = ${username} LIMIT 1`;
				if (rows.length) {
					const user = rows[0];
					if (user.password_hash !== password) return json({ error: 'Usuario o contraseña inválidos' }, 401);
					return json({ username: user.username, role: user.role });
				}
				// Fallback: allow default rule for any username (legacy behavior)
				const expected = username === 'jorge' ? 'Jorge123' : (username + 'sweet');
				if ((expected || '').toLowerCase() !== (password || '').toLowerCase()) return json({ error: 'Usuario o contraseña inválidos' }, 401);
				return json({ username: rawUsername, role: 'user' });
			}
			case 'PUT': {
				// Change password
				// Expect JSON: { username, currentPassword, newPassword }
				const data = JSON.parse(event.body || '{}');
				const rawUsername = (data.username || '').toString().trim();
				const username = rawUsername.toLowerCase();
				const currentPassword = (data.currentPassword || '').toString();
				const newPassword = (data.newPassword || '').toString();
				if (!username || !currentPassword || !newPassword) return json({ error: 'Datos incompletos' }, 400);
				if (newPassword.length < 6) return json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' }, 400);
				const rows = await sql`SELECT id, username, password_hash FROM users WHERE lower(username) = ${username} LIMIT 1`;
				if (rows.length) {
					const user = rows[0];
					if (user.password_hash !== currentPassword) return json({ error: 'Contraseña actual incorrecta' }, 401);
					await sql`UPDATE users SET password_hash=${newPassword} WHERE id=${user.id}`;
					return json({ ok: true });
				}
				// If not found, allow creating an account when current matches legacy default rule
				const expected = username === 'jorge' ? 'Jorge123' : (username + 'sweet');
				if ((expected || '').toLowerCase() !== (currentPassword || '').toLowerCase()) return json({ error: 'Contraseña actual incorrecta' }, 401);
				await sql`INSERT INTO users (username, password_hash, role) VALUES (${rawUsername}, ${newPassword}, 'user') ON CONFLICT (username) DO UPDATE SET password_hash=EXCLUDED.password_hash`;
				return json({ ok: true });
			}
			default:
				return json({ error: 'Método no permitido' }, 405);
		}
	} catch (err) {
		return json({ error: String(err) }, 500);
	}
}