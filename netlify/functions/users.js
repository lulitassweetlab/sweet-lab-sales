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
				// Support listing users or view permissions
				let raw = '';
				if (event.rawQuery && typeof event.rawQuery === 'string') raw = event.rawQuery;
				else if (event.queryStringParameters && typeof event.queryStringParameters === 'object') {
					raw = Object.entries(event.queryStringParameters).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v ?? '')}`).join('&');
				}
				const params = new URLSearchParams(raw);
				if ((params.get('view_permissions') || '') === '1') {
					// Only superadmin can list permissions
					let actorRole = 'user';
					try {
						const headers = (event.headers || {});
						const actorName = (headers['x-actor-name'] || headers['X-Actor-Name'] || headers['x-actor'] || '').toString();
						if (actorName) {
							const r = await sql`SELECT role FROM users WHERE lower(username)=lower(${actorName}) LIMIT 1`;
							actorRole = (r && r[0] && r[0].role) ? String(r[0].role) : 'user';
						}
					} catch {}
					if (actorRole !== 'superadmin') return json({ error: 'No autorizado' }, 403);
					const viewer = (params.get('viewer') || '').toString();
					if (viewer) {
						const rows = await sql`SELECT uvp.viewer_username, uvp.seller_id, s.name AS seller_name, uvp.created_at FROM user_view_permissions uvp JOIN sellers s ON s.id = uvp.seller_id WHERE lower(uvp.viewer_username)=lower(${viewer}) ORDER BY s.name ASC`;
						return json(rows);
					}
					const rows = await sql`SELECT uvp.viewer_username, uvp.seller_id, s.name AS seller_name, uvp.created_at FROM user_view_permissions uvp JOIN sellers s ON s.id = uvp.seller_id ORDER BY lower(uvp.viewer_username) ASC, s.name ASC`;
					return json(rows);
				}
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
			case 'PATCH': {
				// Admin actions: set password or set role
				// Body: { action: 'setPassword'|'setRole'|'grantView'|'revokeView', username, newPassword?, role?, sellerId? or sellerName? }
				const data = JSON.parse(event.body || '{}');
				const action = (data.action || '').toString();
				const rawUsername = (data.username || '').toString().trim();
				const username = rawUsername.toLowerCase();
				if (!action || !username) return json({ error: 'Datos incompletos' }, 400);
				// Determine actor role for authorization
				let actorRole = 'user';
				try {
					const headers = (event.headers || {});
					const actorName = (headers['x-actor-name'] || headers['X-Actor-Name'] || headers['x-actor'] || '').toString();
					if (actorName) {
						const r = await sql`SELECT role FROM users WHERE lower(username)=lower(${actorName}) LIMIT 1`;
						actorRole = (r && r[0] && r[0].role) ? String(r[0].role) : 'user';
					}
				} catch {}
				if (action === 'setPassword') {
					const newPassword = (data.newPassword || '').toString();
					if (!newPassword || newPassword.length < 6) return json({ error: 'Nueva contraseña inválida' }, 400);
					const rows = await sql`SELECT id FROM users WHERE lower(username) = ${username} LIMIT 1`;
					if (rows.length) {
						await sql`UPDATE users SET password_hash=${newPassword} WHERE id=${rows[0].id}`;
						return json({ ok: true, updated: true });
					}
					await sql`INSERT INTO users (username, password_hash, role) VALUES (${rawUsername}, ${newPassword}, 'user')`;
					return json({ ok: true, created: true });
				} else if (action === 'setRole') {
					const role = (data.role || '').toString();
					if (!role || !['user','admin','superadmin'].includes(role)) return json({ error: 'Rol inválido' }, 400);
					const rows = await sql`SELECT id FROM users WHERE lower(username) = ${username} LIMIT 1`;
					if (!rows.length) {
						// Create user with default password and set role
						const defaultPass = username === 'jorge' ? 'Jorge123' : (username + 'sweet');
						await sql`INSERT INTO users (username, password_hash, role) VALUES (${data.username}, ${defaultPass}, ${role})`;
						return json({ ok: true, created: true });
					}
					await sql`UPDATE users SET role=${role} WHERE id=${rows[0].id}`;
					return json({ ok: true });
				} else if (action === 'grantView' || action === 'revokeView') {
					if (actorRole !== 'superadmin') return json({ error: 'No autorizado' }, 403);
					// Determine target seller id
					let sellerId = Number(data.sellerId || 0) || null;
					const sellerName = (data.sellerName || data.seller || '').toString();
					if (!sellerId) {
						if (!sellerName) return json({ error: 'sellerId o sellerName requerido' }, 400);
						const s = await sql`SELECT id FROM sellers WHERE lower(name)=lower(${sellerName}) LIMIT 1`;
						if (!s.length) return json({ error: 'Vendedor no encontrado' }, 404);
						sellerId = s[0].id;
					}
					if (action === 'grantView') {
						await sql`INSERT INTO user_view_permissions (viewer_username, seller_id) VALUES (${rawUsername}, ${sellerId}) ON CONFLICT (viewer_username, seller_id) DO NOTHING`;
						return json({ ok: true, granted: true });
					} else {
						await sql`DELETE FROM user_view_permissions WHERE lower(viewer_username)=lower(${rawUsername}) AND seller_id=${sellerId}`;
						return json({ ok: true, revoked: true });
					}
				}
				return json({ error: 'Acción inválida' }, 400);
			}
			default:
				return json({ error: 'Método no permitido' }, 405);
		}
	} catch (err) {
		return json({ error: String(err) }, 500);
	}
}