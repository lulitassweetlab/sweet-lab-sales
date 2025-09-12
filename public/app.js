const API = {
	Sellers: '/api/sellers',
	Sales: '/api/sales'
};

const PRICES = {
	arco: 8500,
	melo: 9500,
	mara: 10500,
	oreo: 10500,
};

const fmtNo = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

const state = {
	currentSeller: null,
	sellers: [],
	sales: [],
	currentUser: null,
};

// Toasts and Notifications
const notify = (() => {
	const container = () => document.getElementById('toast-container');
	const STORAGE_KEY = 'notify_log_v1';
	let notifIcon = '/logo.png';
	function buildPinkIcon() {
		try {
			const size = 128;
			const c = document.createElement('canvas'); c.width = size; c.height = size;
			const ctx = c.getContext('2d');
			// background
			ctx.fillStyle = '#ffffff';
			ctx.fillRect(0, 0, size, size);
			// pink rounded border
			const r = 18; const pad = 6;
			ctx.strokeStyle = '#d4567a';
			ctx.lineWidth = 12;
			ctx.beginPath();
			const x=pad, y=pad, w=size-pad*2, h=size-pad*2;
			ctx.moveTo(x+r, y);
			ctx.arcTo(x+w, y, x+w, y+h, r);
			ctx.arcTo(x+w, y+h, x, y+h, r);
			ctx.arcTo(x, y+h, x, y, r);
			ctx.arcTo(x, y, x+w, y, r);
			ctx.closePath();
			ctx.stroke();
			notifIcon = c.toDataURL('image/png');
		} catch {}
	}
	function readLog() {
		try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
	}
	function writeLog(items) {
		try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(-200))); } catch {}
		refreshUnreadDot();
	}
	function pushLog(entry) {
		const list = readLog();
		list.push({
			id: Date.now() + '-' + Math.random().toString(36).slice(2),
			when: new Date().toISOString(),
			type: entry?.type || 'info',
			text: String(entry?.text || ''),
			read: false
		});
		writeLog(list);
	}
	function refreshUnreadDot() {
		try {
			const btn = document.getElementById('notif-toggle');
			if (!btn) return;
			const anyUnread = readLog().some(it => it && it.read === false);
			btn.classList.toggle('has-unread', !!anyUnread);
		} catch {}
	}
	function render(type, message, timeoutMs = 3000) {
		const c = container();
		if (!c) return;
		const n = document.createElement('div');
		n.className = 'toast toast-' + (type || 'info');
		const actorName = String((state?.currentSeller?.name || state?.currentUser?.name || '') || '');
		const msg = document.createElement('div');
		msg.className = 'toast-msg';
		msg.textContent = String(message || '');
		const close = document.createElement('button'); close.className = 'toast-close'; close.type = 'button'; close.textContent = '×';
		close.addEventListener('click', () => dismiss(n));
		n.append(msg, close);
		c.appendChild(n);
		if (timeoutMs > 0) setTimeout(() => dismiss(n), timeoutMs);
		pushLog({ type, text: String(message || ''), actor: actorName });
	}
	function dismiss(node) {
		if (!node || !node.parentNode) return;
		node.style.animation = 'toast-out 140ms ease-in forwards';
		setTimeout(() => { if (node.parentNode) node.parentNode.removeChild(node); }, 140);
	}
	async function ensurePermission() {
		if (!('Notification' in window)) return 'unsupported';
		if (Notification.permission === 'granted') return 'granted';
		if (Notification.permission === 'denied') return 'denied';
		try { return await Notification.requestPermission(); } catch { return 'denied'; }
	}
	function showBrowser(title, body) {
		if (!('Notification' in window) || Notification.permission !== 'granted') return;
		try {
			const finalBody = String(body || '');
			new Notification(String(title || 'Sweet Lab'), { body: finalBody, icon: notifIcon });
		} catch {}
	}
	function initToggle() {
		document.addEventListener('DOMContentLoaded', async () => {
			buildPinkIcon();
			const btn = document.getElementById('notif-toggle');
			if (!btn) return;
			const refresh = () => {
				const ok = ('Notification' in window) && Notification.permission === 'granted';
				btn.classList.toggle('enabled', !!ok);
				btn.title = ok ? 'Notificaciones activas' : 'Activar notificaciones';
			};
			refresh();
			btn.addEventListener('click', async (ev) => {
				openDialog(ev?.clientX, ev?.clientY);
			});
			refreshUnreadDot();
		});
	}
	function openDialog(anchorX, anchorY) {
		const backdrop = document.createElement('div');
		backdrop.className = 'notif-dialog-backdrop';
		const dlg = document.createElement('div');
		dlg.className = 'notif-dialog';
		const header = document.createElement('div'); header.className = 'notif-header';
		const title = document.createElement('div'); title.className = 'notif-title'; title.textContent = 'Notificaciones';
		const actions = document.createElement('div'); actions.className = 'notif-actions';
		const permBtn = document.createElement('button'); permBtn.className = 'notif-btn'; permBtn.textContent = 'Pedir permiso';
		const clearBtn = document.createElement('button'); clearBtn.className = 'notif-btn'; clearBtn.textContent = 'Limpiar';
		const closeBtn = document.createElement('button'); closeBtn.className = 'notif-close'; closeBtn.textContent = '✕';
		actions.append(permBtn, clearBtn, closeBtn);
		header.append(title, actions);
		const body = document.createElement('div'); body.className = 'notif-body';
		const toolbar = document.createElement('div'); toolbar.className = 'notif-toolbar';
		const info = document.createElement('div'); info.style.fontSize = '12px'; info.style.opacity = '0.8'; info.textContent = 'Últimas 200 notificaciones';
		toolbar.append(info);
		const list = document.createElement('div'); list.className = 'notif-list';
		async function renderList() {
			list.innerHTML = '';
			let data = [];
			try {
				const res = await fetch('/api/notifications');
				if (res.ok) data = await res.json();
			} catch {}
			if (!Array.isArray(data) || data.length === 0) {
				const empty = document.createElement('div'); empty.className = 'notif-empty'; empty.textContent = 'Sin notificaciones'; list.appendChild(empty); return;
			}
			// Mostrar más recientes primero, confiando en orden del backend (id DESC)
			for (const it of data) {
				const item = document.createElement('div'); item.className = 'notif-item';
				const when = document.createElement('div'); when.className = 'when';
				const d = new Date(it.created_at || it.when); when.textContent = isNaN(d.getTime()) ? String(it.created_at || it.when) : d.toLocaleString();
				const text = document.createElement('div'); text.className = 'text'; text.textContent = String(it.message || it.text || '');
				item.append(when, text);
				list.appendChild(item);
			}
		}
		body.append(toolbar, list);
		dlg.append(header, body);
		backdrop.appendChild(dlg);
		document.body.appendChild(backdrop);
		renderList();
		// mark all as read
		try {
			const data = readLog();
			let changed = false;
			for (const it of data) { if (it && it.read === false) { it.read = true; changed = true; } }
			if (changed) writeLog(data);
		} catch {}
		function cleanup(){ if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop); }
		backdrop.addEventListener('click', (e) => { if (e.target === backdrop) cleanup(); });
		closeBtn.addEventListener('click', cleanup);
		clearBtn.addEventListener('click', () => { writeLog([]); renderList(); });
		permBtn.addEventListener('click', async () => {
			const res = await ensurePermission();
			if (res === 'granted') { render('success', 'Notificaciones activadas'); showBrowser('Sweet Lab', 'Notificaciones activadas'); }
			else if (res === 'denied') { render('error', 'Permiso de notificaciones denegado'); }
			else { render('info', 'Notificaciones no disponibles'); }
			const btn = document.getElementById('notif-toggle'); if (btn) { const ok = ('Notification' in window) && Notification.permission === 'granted'; btn.classList.toggle('enabled', !!ok); }
		});
	}
	return { info: (m,t)=>render('info',m,t), success: (m,t)=>render('success',m,t), error: (m,t)=>render('error',m,t), showBrowser, ensurePermission, initToggle, openDialog };
})();

// Theme management
(function initTheme(){
	try {
		const saved = localStorage.getItem('theme');
		if (saved === 'light') {
			document.documentElement.removeAttribute('data-theme');
		} else {
			document.documentElement.setAttribute('data-theme', 'dark');
		}
	} catch {}
	document.addEventListener('DOMContentLoaded', () => {
		const btn = document.getElementById('theme-toggle');
		if (!btn) return;
		updateThemeButton(btn);
		btn.addEventListener('click', () => {
			const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
			if (isDark) {
				document.documentElement.removeAttribute('data-theme');
				try { localStorage.setItem('theme', 'light'); } catch {}
			} else {
				document.documentElement.setAttribute('data-theme', 'dark');
				try { localStorage.setItem('theme', 'dark'); } catch {}
			}
			updateThemeButton(btn);
		});
	});
})();

function updateThemeButton(btn){
	const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
	btn.title = isDark ? 'Modo claro' : 'Modo oscuro';
}

// New: place a light-grey asterisk trigger at the end of the client input
function wireCommentTriggerForRow(tr, currentValueOptional) {
	// Removed: comment asterisk trigger UI per user request
	return;
}

// Auth
function computePasswordFor(user) {
	return (String(user || '') + 'sweet').toLowerCase();
}

function isAdmin(user) {
	const u = String(user || '').toLowerCase();
	return u === 'jorge' || u === 'marcela';
}

function bindLogin() {
	const btn = document.getElementById('login-btn');
	btn?.addEventListener('click', () => {
		const user = document.getElementById('login-user')?.value?.trim();
		const pass = document.getElementById('login-pass')?.value ?? '';
		const err = document.getElementById('login-error');
		if (!user) { if (err) { err.textContent = 'Ingresa el usuario'; err.classList.remove('hidden'); } return; }
		if (pass !== computePasswordFor(user)) { if (err) { err.textContent = 'Usuario o contraseña inválidos'; err.classList.remove('hidden'); } return; }
		if (err) err.classList.add('hidden');
		state.currentUser = { name: user, isAdmin: isAdmin(user) };
		try { localStorage.setItem('authUser', JSON.stringify(state.currentUser)); } catch {}
		applyAuthVisibility();
		renderSellerButtons();
		notify.success('Bienvenido ' + user);
		// If not admin, auto-enter seller if exists
		if (!state.currentUser.isAdmin) {
			const seller = (state.sellers || []).find(s => String(s.name).toLowerCase() === String(user).toLowerCase());
			if (seller) enterSeller(seller.id);
		} else {
			switchView('#view-select-seller');
		}
	});
	const logoutBtn = document.getElementById('logout-btn');
	logoutBtn?.addEventListener('click', () => {
		state.currentUser = null;
		try { localStorage.removeItem('authUser'); } catch {}
		applyAuthVisibility();
		renderSellerButtons();
		switchView('#view-login');
	});
}

function $(sel) { return document.querySelector(sel); }
function el(tag, attrs = {}, ...children) {
	const node = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) {
		if (k === 'class') {
			node.className = v;
		} else if (k === 'checked') {
			node.checked = !!v;
		} else if (k === 'value') {
			node.value = v;
		} else if (k.startsWith('on') && typeof v === 'function') {
			node.addEventListener(k.substring(2).toLowerCase(), v);
		} else if (v !== undefined && v !== null) {
			node.setAttribute(k, v);
		}
	}
	for (const c of children) {
		if (c == null) continue;
		node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
	}
	return node;
}

async function api(method, url, body) {
	const res = await fetch(url, {
		method,
		headers: { 'Content-Type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined,
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`API ${method} ${url} failed: ${res.status} ${text}`);
	}
	return res.json();
}

async function loadSellers() {
	state.sellers = await api('GET', API.Sellers);
	renderSellerButtons();
	// Removed syncColumnsBarWidths();
	applyAuthVisibility();
}

function renderSellerButtons() {
	const list = $('#seller-list');
	list.innerHTML = '';
	const currentUserName = (state.currentUser?.name || '').toLowerCase();
	const isAdminUser = !!state.currentUser?.isAdmin;
	for (const s of state.sellers) {
		const sellerName = String(s.name || '').toLowerCase();
		if (!isAdminUser && sellerName !== currentUserName) continue;
		const btn = el('button', { class: 'seller-button', onclick: async () => { await enterSeller(s.id); } }, s.name);
		list.appendChild(btn);
	}
}

async function addSeller(name) {
	const seller = await api('POST', API.Sellers, { name });
	state.sellers.push(seller);
	renderSellerButtons();
	notify.success('Vendedor agregado');
}

async function enterSeller(id) {
	const seller = state.sellers.find(s => s.id === id);
	if (!seller) return;
	state.currentSeller = seller;
	state.saleDays = [];
	state.selectedDayId = null;
	$('#current-seller').textContent = seller.name;
	switchView('#view-sales');
	// Show dates section, hide table until a date is selected, then load real dates
	const datesSection = document.getElementById('dates-section');
	const datesList = document.querySelector('#dates-section .dates-list');
	const salesWrapper = document.getElementById('sales-wrapper');
	if (datesSection) datesSection.classList.remove('hidden');
	if (salesWrapper) salesWrapper.classList.add('hidden');
	await loadDaysForSeller();
}

function switchView(id) {
	document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
	$(id).classList.remove('hidden');
}

function applyAuthVisibility() {
	const isAdminUser = !!state.currentUser?.isAdmin;
	const logoutBtn = document.getElementById('logout-btn');
	if (logoutBtn) logoutBtn.style.display = state.currentUser ? 'inline-flex' : 'none';
	const addSellerWrap = document.querySelector('.seller-add');
	if (addSellerWrap) addSellerWrap.style.display = isAdminUser ? 'block' : 'none';
}

function calcRowTotal(q) {
	const arco = Number(q.arco || 0);
	const melo = Number(q.melo || 0);
	const mara = Number(q.mara || 0);
	const oreo = Number(q.oreo || 0);
	return arco * PRICES.arco + melo * PRICES.melo + mara * PRICES.mara + oreo * PRICES.oreo;
}

// Build compact sale summary: "Cliente + 2 arco + 1 melo"
function formatSaleSummary(sale) {
	if (!sale) return '';
	const name = (sale.client_name || '').trim() || 'Cliente';
	const parts = [];
	const qAr = Number(sale.qty_arco || 0); if (qAr) parts.push(`${qAr} arco`);
	const qMe = Number(sale.qty_melo || 0); if (qMe) parts.push(`${qMe} melo`);
	const qMa = Number(sale.qty_mara || 0); if (qMa) parts.push(`${qMa} mara`);
	const qOr = Number(sale.qty_oreo || 0); if (qOr) parts.push(`${qOr} oreo`);
	const suffix = parts.length ? (' + ' + parts.join(' + ')) : '';
	return name + suffix;
}

function renderTable() {
	const tbody = $('#sales-tbody');
	tbody.innerHTML = '';
	for (const sale of state.sales) {
		const total = calcRowTotal({ arco: sale.qty_arco, melo: sale.qty_melo, mara: sale.qty_mara, oreo: sale.qty_oreo });
		const isPaid = !!sale.is_paid;
		const tr = el('tr', {},
			el('td', { class: 'col-paid' }, (function(){
				const wrap = document.createElement('span');
				wrap.className = 'pay-wrap';
				const sel = document.createElement('select');
				sel.className = 'input-cell pay-select';
				const current = (sale.pay_method || '').replace(/\.$/, '');
				const options = [
					{ v: '', label: '-' },
					{ v: 'efectivo', label: '' },
					{ v: 'marce', label: '' },
					{ v: 'transf', label: '' }
				];
				for (const o of options) {
					const opt = document.createElement('option');
					opt.value = o.v;
					opt.textContent = o.label;
					if (current === o.v) opt.selected = true;
					sel.appendChild(opt);
				}
				function applyPayClass() {
					wrap.classList.remove('placeholder','method-efectivo','method-transf','method-marce');
					if (!sel.value) wrap.classList.add('placeholder');
					else if (sel.value === 'efectivo') wrap.classList.add('method-efectivo');
					else if (sel.value === 'transf') wrap.classList.add('method-transf');
					else if (sel.value === 'marce') wrap.classList.add('method-marce');
				}
				applyPayClass();
				sel.addEventListener('change', async () => {
					await savePayMethod(tr, sale.id, sel.value);
					applyPayClass();
				});
				wrap.addEventListener('click', (e) => { e.stopPropagation(); openPayMenu(wrap, sel, e.clientX, e.clientY); });
				wrap.tabIndex = 0;
				wrap.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPayMenu(wrap, sel); } });
				wrap.appendChild(sel);
				return wrap;
			})()),
			el('td', { class: 'col-client' }, el('input', {
				class: 'input-cell client-input',
				value: sale.client_name || '',
				placeholder: '',
				oninput: (e) => { const v = (e.target.value || ''); if (/\*$/.test(v.trim())) { saveClientWithCommentFlow(tr, sale.id); } },
				onblur: () => saveClientWithCommentFlow(tr, sale.id),
				onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); saveClientWithCommentFlow(tr, sale.id); } },
			})),
			el('td', { class: 'col-arco' }, el('input', { class: 'input-cell input-qty', type: 'number', min: '0', step: '1', inputmode: 'numeric', value: sale.qty_arco ? String(sale.qty_arco) : '', placeholder: '', onblur: () => saveRow(tr, sale.id), onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); saveRow(tr, sale.id); } }, onfocus: (e) => e.target.select(), onmouseup: (e) => e.preventDefault() })),
			el('td', { class: 'col-melo' }, el('input', { class: 'input-cell input-qty', type: 'number', min: '0', step: '1', inputmode: 'numeric', value: sale.qty_melo ? String(sale.qty_melo) : '', placeholder: '', onblur: () => saveRow(tr, sale.id), onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); saveRow(tr, sale.id); } }, onfocus: (e) => e.target.select(), onmouseup: (e) => e.preventDefault() })),
			el('td', { class: 'col-mara' }, el('input', { class: 'input-cell input-qty', type: 'number', min: '0', step: '1', inputmode: 'numeric', value: sale.qty_mara ? String(sale.qty_mara) : '', placeholder: '', onblur: () => saveRow(tr, sale.id), onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); saveRow(tr, sale.id); } }, onfocus: (e) => e.target.select(), onmouseup: (e) => e.preventDefault() })),
			el('td', { class: 'col-oreo' }, el('input', { class: 'input-cell input-qty', type: 'number', min: '0', step: '1', inputmode: 'numeric', value: sale.qty_oreo ? String(sale.qty_oreo) : '', placeholder: '', onblur: () => saveRow(tr, sale.id), onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); saveRow(tr, sale.id); } }, onfocus: (e) => e.target.select(), onmouseup: (e) => e.preventDefault() })),
			el('td', { class: 'col-extra' }),
			el('td', { class: 'total col-total' }, fmtNo.format(total)),
			el('td', { class: 'col-actions' }, (function(){
				const b = document.createElement('button');
				b.className = 'row-delete';
				b.title = 'Eliminar';
				b.addEventListener('click', async (ev) => {
					ev.stopPropagation();
					const ok = await openConfirmPopover('¿Seguro que quieres eliminar este pedido?', ev.clientX, ev.clientY);
					if (!ok) return;
					await deleteRow(sale.id);
				});
				return b;
			})()),
		);
		tr.dataset.id = String(sale.id);
		tbody.appendChild(tr);
		// Comment trigger removed per request
	}
	// Inline add row line just below last sale
	const colCount = document.querySelectorAll('#sales-table thead th').length || 8;
	const addTr = document.createElement('tr');
	addTr.className = 'add-row-line';
	const td = document.createElement('td');
	td.colSpan = colCount;
	const btn = document.createElement('button');
	btn.className = 'inline-add-btn btn-primary';
	btn.textContent = '+ Nueva Venta';
	btn.addEventListener('click', addRow);
	td.appendChild(btn);
	addTr.appendChild(td);
	tbody.appendChild(addTr);

	updateSummary();
	// Remove old bottom add button if present
	document.getElementById('add-row-bottom')?.closest('.table-actions')?.remove();
	preloadChangeLogsForCurrentTable();
}

async function loadSales() {
	const sellerId = state.currentSeller.id;
	const params = new URLSearchParams({ seller_id: String(sellerId) });
	if (state.selectedDayId) params.set('sale_day_id', String(state.selectedDayId));
	state.sales = await api('GET', `${API.Sales}?${params.toString()}`);
	renderTable();
	preloadChangeLogsForCurrentTable();
}

const history = { undo: [], redo: [], limit: 10 };
function pushUndo(action) {
	// action: { do: async()=>{}, undo: async()=>{} }
	history.undo.push(action);
	if (history.undo.length > history.limit) history.undo.shift();
	history.redo = [];
}
async function performUndo() {
	const action = history.undo.pop();
	if (!action) return;
	await action.undo();
	history.redo.push(action);
}
async function performRedo() {
	const action = history.redo.pop();
	if (!action) return;
	await action.do();
	history.undo.push(action);
}

// Wire toolbar buttons
(function wireUndoRedo(){
	const undoBtn = document.getElementById('undo-btn');
	const redoBtn = document.getElementById('redo-btn');
	undoBtn?.addEventListener('click', () => { performUndo().catch(console.error); });
	redoBtn?.addEventListener('click', () => { performRedo().catch(console.error); });
})();

// Wrap API operations to record undo/redo
async function addRow() {
	const sellerId = state.currentSeller.id;
	const payload = { seller_id: sellerId };
	if (state.selectedDayId) payload.sale_day_id = state.selectedDayId;
	const sale = await api('POST', API.Sales, payload);
	sale.is_paid = false;
	state.sales.unshift(sale);
	// Push undo: delete that sale
	pushUndo({
		do: async () => {
			// redo create
			const again = await api('POST', API.Sales, payload);
			again.is_paid = false;
			state.sales.unshift(again);
			renderTable();
		},
		undo: async () => {
			await api('DELETE', `${API.Sales}?id=${encodeURIComponent(sale.id)}`);
			state.sales = state.sales.filter(s => s.id !== sale.id);
			renderTable();
		}
	});
	renderTable();
}

async function saveRow(tr, id) {
	const before = state.sales.find(s => s.id === id);
	const prev = before ? { ...before } : null;
	const body = readRow(tr);
	body.id = id;
	body._actor_name = state.currentUser?.name || '';
	const updated = await api('PUT', API.Sales, body);
	const idx = state.sales.findIndex(s => s.id === id);
	if (idx !== -1) state.sales[idx] = updated;
	const totalCell = tr.querySelector('.total');
	const total = calcRowTotal({ arco: updated.qty_arco, melo: updated.qty_melo, mara: updated.qty_mara, oreo: updated.qty_oreo });
	totalCell.textContent = fmtNo.format(total);
	updateSummary();
	// Notify only when quantities change; one notification per dessert type
	try {
		if (prev) {
			const client = (updated.client_name || '').trim() || 'Cliente';
			const prevAr = Number(prev.qty_arco||0), newAr = Number(updated.qty_arco||0);
			const prevMe = Number(prev.qty_melo||0), newMe = Number(updated.qty_melo||0);
			const prevMa = Number(prev.qty_mara||0), newMa = Number(updated.qty_mara||0);
			const prevOr = Number(prev.qty_oreo||0), newOr = Number(updated.qty_oreo||0);
			const seller = String((state?.currentSeller?.name || state?.currentUser?.name || '') || '');
			if (newAr !== prevAr) { /* handled by backend feed */ }
			if (newMe !== prevMe) { /* handled by backend feed */ }
			if (newMa !== prevMa) { /* handled by backend feed */ }
			if (newOr !== prevOr) { /* handled by backend feed */ }
		}
	} catch {}
	// Refresh markers from backend logs only
	preloadChangeLogsForCurrentTable();
	// Push undo: restore prev snapshot
	if (prev) {
		pushUndo({
			do: async () => {
				await api('PUT', API.Sales, updated);
				const j = state.sales.findIndex(s => s.id === id);
				if (j !== -1) state.sales[j] = updated;
				renderTable();
			},
			undo: async () => {
				await api('PUT', API.Sales, prev);
				const j = state.sales.findIndex(s => s.id === id);
				if (j !== -1) state.sales[j] = prev;
				renderTable();
			}
		});
	}
}

// Comment flow: detect trailing * on client name to open comment dialog
async function saveClientWithCommentFlow(tr, id) {
	const input = tr.querySelector('td.col-client .client-input');
	if (!input) { await saveRow(tr, id); return; }
	const raw = input.value || '';
	const hadEndingStar = /\*$/.test(raw.trim());
	if (hadEndingStar) {
		// Remove trailing * then save; dialog will be opened via trigger
		input.value = raw.replace(/\*+\s*$/, '').trim();
	}
	await saveRow(tr, id);
	// Trigger removed per request
	// If the user purposely typed *, open dialog immediately after save
	if (!hadEndingStar) return;
	const pos = getInputEndCoords(input, input.value);
	const comment = await openCommentDialog(input, '', pos.x, pos.y);
	if (comment == null) { return; }
	// Persist comment
	await saveComment(id, comment);
	// Update local state and UI
	const idx = state.sales.findIndex(s => s.id === id);
	if (idx !== -1) state.sales[idx].comment_text = comment;
	// trigger removed
}

async function saveComment(id, text) {
	const sale = state.sales.find(s => s.id === id);
	if (!sale) return;
	const payload = { id, client_name: sale.client_name || '', qty_arco: sale.qty_arco||0, qty_melo: sale.qty_melo||0, qty_mara: sale.qty_mara||0, qty_oreo: sale.qty_oreo||0, is_paid: !!sale.is_paid, pay_method: sale.pay_method ?? null, comment_text: text, _actor_name: state.currentUser?.name || '' };
	const updated = await api('PUT', API.Sales, payload);
	const idx = state.sales.findIndex(s => s.id === id);
	if (idx !== -1) state.sales[idx] = updated;
}

function renderCommentMarkerForRow(tr) {
	// Deprecated in favor of wireCommentTriggerForRow
	return;
}

function getInputEndCoords(inputEl, currentRawValue) {
	const rect = inputEl.getBoundingClientRect();
	const cs = getComputedStyle(inputEl);
	const canvas = getInputEndCoords._canvas || (getInputEndCoords._canvas = document.createElement('canvas'));
	const ctx = canvas.getContext('2d');
	const font = `${cs.fontStyle} ${cs.fontVariant} ${cs.fontWeight} ${cs.fontSize} / ${cs.lineHeight} ${cs.fontFamily}`;
	ctx.font = font;
	// Do not trim spaces; only strip trailing asterisks used as trigger
	const text = (currentRawValue || inputEl.value || '').replace(/\*+$/, '');
	const width = ctx.measureText(text).width;
	const padL = parseFloat(cs.paddingLeft) || 0;
	const bordL = parseFloat(cs.borderLeftWidth) || 0;
	// account for horizontal scroll within input
	const scrollX = inputEl.scrollLeft || 0;
	const x = Math.round(rect.left + padL + bordL + width - scrollX + 2);
	const y = Math.round(rect.top + (rect.height / 2));
	return { x, y };
}

function getSpaceWidthForInput(inputEl) {
	const cs = getComputedStyle(inputEl);
	const canvas = getSpaceWidthForInput._canvas || (getSpaceWidthForInput._canvas = document.createElement('canvas'));
	const ctx = canvas.getContext('2d');
	const font = `${cs.fontStyle} ${cs.fontVariant} ${cs.fontWeight} ${cs.fontSize} / ${cs.lineHeight} ${cs.fontFamily}`;
	ctx.font = font;
	return ctx.measureText(' ').width || 4;
}

function openCommentDialog(anchorEl, initial = '', anchorX, anchorY) {
	return new Promise((resolve) => {
		const pop = document.createElement('div');
		pop.className = 'comment-popover';
		pop.style.position = 'fixed';
		const rect = anchorEl.getBoundingClientRect();
		if (typeof anchorX === 'number' && typeof anchorY === 'number') {
			// Place the popover so its left edge starts exactly where the * was typed
			// and align vertically at the caret Y position
			pop.style.left = anchorX + 'px';
			pop.style.top = anchorY + 'px';
			pop.style.transform = 'none';
		} else {
			// Fallback: open to the right of the input at same row height
			pop.style.left = (rect.right + 8) + 'px';
			pop.style.top = (rect.top) + 'px';
			pop.style.transform = 'none';
		}
		pop.style.zIndex = '1000';
		// Size: generous on desktop, fluid on small screens
		const isSmallScreen = window.matchMedia('(max-width: 600px)').matches;
		pop.style.minWidth = isSmallScreen ? 'min(90vw, 320px)' : '520px';
		pop.style.maxWidth = isSmallScreen ? '94vw' : '640px';
		const ta = document.createElement('textarea'); ta.className = 'comment-input'; ta.placeholder = 'comentario'; ta.value = initial || ''; ta.style.minHeight = isSmallScreen ? '120px' : '160px';
		ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save.click(); } });
		const actions = document.createElement('div'); actions.className = 'confirm-actions';
		const cancel = document.createElement('button'); cancel.className = 'press-btn'; cancel.textContent = 'Cancelar';
		const save = document.createElement('button'); save.className = 'press-btn btn-primary'; save.textContent = 'Guardar';
		actions.append(cancel, save);
		pop.append(ta, actions);
		document.body.appendChild(pop);
		// Clamp within the visible viewport (accounts for on-screen keyboard via visualViewport)
		const reclamp = () => {
			const margin = 8;
			const vv = window.visualViewport;
			const viewW = (vv && typeof vv.width === 'number') ? vv.width : window.innerWidth;
			const viewH = (vv && typeof vv.height === 'number') ? vv.height : window.innerHeight;
			const viewLeft = (vv && typeof vv.offsetLeft === 'number') ? vv.offsetLeft : 0;
			const viewTop = (vv && typeof vv.offsetTop === 'number') ? vv.offsetTop : 0;
			// Make popover height fit within the visible viewport
			pop.style.maxHeight = Math.max(140, viewH - 2 * margin) + 'px';
			pop.style.overflow = 'auto';
			const actionsH = (pop.querySelector('.confirm-actions')?.getBoundingClientRect().height) || 44;
			const ta = pop.querySelector('textarea.comment-input');
			if (ta) {
				const extra = 24; // padding/margins inside pop
				const maxTa = Math.max(64, viewH - 2 * margin - actionsH - extra);
				ta.style.maxHeight = maxTa + 'px';
			}
			let r = pop.getBoundingClientRect();
			let left = parseFloat(pop.style.left || String(r.left));
			let top = parseFloat(pop.style.top || String(r.top));
			const maxLeft = viewLeft + viewW - margin - r.width;
			const minLeft = viewLeft + margin;
			// Horizontal clamping relative to viewport
			if (left > maxLeft) left = Math.max(minLeft, maxLeft);
			if (left < minLeft) left = minLeft;
			// Vertical positioning: prefer below caret; flip above if not enough space
			let maxTop = viewTop + viewH - margin - r.height;
			const minTop = viewTop + margin;
			if (typeof anchorY === 'number') {
				const spaceBelow = (viewTop + viewH) - anchorY - margin;
				if (spaceBelow < r.height && (anchorY - r.height - 8) >= minTop) {
					// Flip above the caret, keeping it near where the * was typed
					top = Math.max(minTop, anchorY - r.height - 8);
				} else {
					// Keep below but clamp if needed
					top = Math.min(maxTop, Math.max(minTop, top));
				}
			} else {
				// No caret Y available; simple clamp
				top = Math.min(maxTop, Math.max(minTop, top));
			}
			// If popover still taller than viewport (maxTop < minTop), stick it to bottom of visible area
			if (maxTop < minTop) {
				// Recompute after forced maxHeight, then place at bottom
				r = pop.getBoundingClientRect();
				maxTop = viewTop + viewH - margin - r.height;
				top = Math.max(minTop, maxTop);
			}
			pop.style.left = left + 'px';
			pop.style.top = top + 'px';
		};
		requestAnimationFrame(reclamp);
		// Re-clamp on viewport changes caused by keyboard or zoom/pan
		let detachViewport;
		if (window.visualViewport) {
			const vv = window.visualViewport;
			const onVV = () => reclamp();
			vv.addEventListener('resize', onVV);
			vv.addEventListener('scroll', onVV);
			detachViewport = () => { vv.removeEventListener('resize', onVV); vv.removeEventListener('scroll', onVV); };
		}
		const onWinScroll = () => reclamp();
		window.addEventListener('scroll', onWinScroll, { passive: true });
		function cleanup() {
			document.removeEventListener('mousedown', outside, true);
			document.removeEventListener('touchstart', outside, true);
			if (typeof detachViewport === 'function') detachViewport();
			window.removeEventListener('scroll', onWinScroll, { passive: true });
			if (pop.parentNode) pop.parentNode.removeChild(pop);
		}
		function outside(ev) { if (!pop.contains(ev.target)) { cleanup(); resolve(null); } }
		setTimeout(() => {
			document.addEventListener('mousedown', outside, true);
			document.addEventListener('touchstart', outside, true);
		}, 0);
		cancel.addEventListener('click', () => { cleanup(); resolve(null); });
		save.addEventListener('click', () => { const v = ta.value.trim(); cleanup(); resolve(v); });
		ta.focus();
	});
}

async function deleteRow(id) {
	const prev = state.sales.find(s => s.id === id);
	// Optimistic: remove the row element immediately to avoid lingering UI
	try {
		const trEl = document.querySelector(`#sales-tbody tr[data-id="${id}"]`);
		if (trEl && trEl.parentNode) trEl.parentNode.removeChild(trEl);
	} catch {}
	const actor = encodeURIComponent(state.currentUser?.name || '');
	await api('DELETE', `${API.Sales}?id=${encodeURIComponent(id)}&actor=${actor}`);
	// Robust local removal and refresh from server to avoid stale UI
	state.sales = state.sales.filter(s => Number(s.id) !== Number(id));
	await loadSales();
	// Push undo: re-create previous row
	if (prev) {
		pushUndo({
			do: async () => {
				const again = await api('POST', API.Sales, { seller_id: prev.seller_id, sale_day_id: prev.sale_day_id });
				again.client_name = prev.client_name;
				again.qty_arco = prev.qty_arco; again.qty_melo = prev.qty_melo; again.qty_mara = prev.qty_mara; again.qty_oreo = prev.qty_oreo;
				again.is_paid = prev.is_paid;
				await api('PUT', API.Sales, { id: again.id, ...again });
				state.sales.push(again);
				renderTable();
			},
			undo: async () => {
				await api('DELETE', `${API.Sales}?id=${encodeURIComponent(prev.id)}`);
				state.sales = state.sales.filter(s => s.id !== prev.id);
				renderTable();
			}
		});
	}
	renderTable();
}

async function savePaid(tr, id, isPaid) {
	const body = readRow(tr);
	body.id = id;
	body.is_paid = !!isPaid;
	const updated = await api('PUT', API.Sales, body);
	const idx = state.sales.findIndex(s => s.id === id);
	if (idx !== -1) state.sales[idx] = updated;
}

async function savePayMethod(tr, id, method) {
	const body = readRow(tr);
	body.id = id;
	body.pay_method = method || null;
	await api('PUT', API.Sales, body);
	// Update local state
	const idx = state.sales.findIndex(s => s.id === id);
	if (idx !== -1) state.sales[idx].pay_method = method || null;
}

function updateSummary() {
	let qa = 0, qm = 0, qma = 0, qo = 0, grand = 0;
	for (const s of state.sales) {
		qa += Number(s.qty_arco || 0);
		qm += Number(s.qty_melo || 0);
		qma += Number(s.qty_mara || 0);
		qo += Number(s.qty_oreo || 0);
		grand += calcRowTotal({ arco: s.qty_arco, melo: s.qty_melo, mara: s.qty_mara, oreo: s.qty_oreo });
	}
	$('#sum-arco-qty').textContent = String(qa);
	$('#sum-melo-qty').textContent = String(qm);
	$('#sum-mara-qty').textContent = String(qma);
	$('#sum-oreo-qty').textContent = String(qo);
	const totalQty = qa + qm + qma + qo;
	$('#sum-total-qty').textContent = String(totalQty);
	const va = fmtNo.format(qa * PRICES.arco);
	const vm = fmtNo.format(qm * PRICES.melo);
	const vma = fmtNo.format(qma * PRICES.mara);
	const vo = fmtNo.format(qo * PRICES.oreo);
	$('#sum-arco-amt').textContent = va;
	$('#sum-melo-amt').textContent = vm;
	$('#sum-mara-amt').textContent = vma;
	$('#sum-oreo-amt').textContent = vo;
	// stacked rows on small screens
	const qva = String(qa);
	const qvm = String(qm);
	const qvma = String(qma);
	const qvo = String(qo);
	const elAr = document.getElementById('sum-arco-qty-2'); if (elAr) elAr.textContent = qva; const elArAmt = document.getElementById('sum-arco-amt-2'); if (elArAmt) elArAmt.textContent = va;
	const elMe = document.getElementById('sum-melo-qty-2'); if (elMe) elMe.textContent = qvm; const elMeAmt = document.getElementById('sum-melo-amt-2'); if (elMeAmt) elMeAmt.textContent = vm;
	const elMa = document.getElementById('sum-mara-qty-2'); if (elMa) elMa.textContent = qvma; const elMaAmt = document.getElementById('sum-mara-amt-2'); if (elMaAmt) elMaAmt.textContent = vma;
	const elOr = document.getElementById('sum-oreo-qty-2'); if (elOr) elOr.textContent = qvo; const elOrAmt = document.getElementById('sum-oreo-amt-2'); if (elOrAmt) elOrAmt.textContent = vo;
	const grandStr = fmtNo.format(grand);
	$('#sum-grand').textContent = grandStr;
	// Decide whether to stack totals to avoid overlap on small screens
	requestAnimationFrame(() => {
		const table = document.getElementById('sales-table');
		if (!table) return;
		const isSmall = window.matchMedia('(max-width: 600px)').matches;
		let overlap = false;
		if (isSmall) {
			const ids = ['sum-arco-amt', 'sum-melo-amt', 'sum-mara-amt', 'sum-oreo-amt'];
			for (const id of ids) {
				const el = document.getElementById(id);
				if (!el) continue;
				if (el.scrollWidth > el.clientWidth) { overlap = true; break; }
			}
		}
		if (isSmall && overlap) table.classList.add('totals-stacked'); else table.classList.remove('totals-stacked');
		const grandLine = document.getElementById('sum-grand-2');
		if (grandLine) grandLine.textContent = grandStr;
		const commLine = document.getElementById('sum-comm-2');
		if (commLine) commLine.textContent = fmtNo.format(totalQty * 1000);
	});
}

function readRow(tr) {
	const clientEl = tr.querySelector('td.col-client .client-input');
	const arcoEl = tr.querySelector('td.col-arco input');
	const meloEl = tr.querySelector('td.col-melo input');
	const maraEl = tr.querySelector('td.col-mara input');
	const oreoEl = tr.querySelector('td.col-oreo input');
	return {
		client_name: clientEl ? clientEl.value.trim() : '',
		qty_arco: arcoEl && arcoEl.value !== '' ? Number(arcoEl.value) : 0,
		qty_melo: meloEl && meloEl.value !== '' ? Number(meloEl.value) : 0,
		qty_mara: maraEl && maraEl.value !== '' ? Number(maraEl.value) : 0,
		qty_oreo: oreoEl && oreoEl.value !== '' ? Number(oreoEl.value) : 0,
	};
}

function debounce(fn, ms) {
	let t;
	return (...args) => {
		clearTimeout(t);
		t = setTimeout(() => fn(...args), ms);
	};
}

function exportTableToExcel() {
	// Build SheetJS worksheet from rows
	const header = ['$', 'Pago', 'Cliente', 'Arco', 'Melo', 'Mara', 'Oreo', 'Total'];
	const data = [header];
	const tbody = document.getElementById('sales-tbody');
	if (tbody) {
		for (const tr of Array.from(tbody.rows)) {
			const paid = tr.querySelector('td.col-paid input[type="checkbox"]').checked ? '✓' : '';
			const paySel = tr.querySelector('td.col-paid select.pay-select');
			const payRaw = paySel ? paySel.value : '';
			const pay = payRaw === 'efectivo' ? 'Efectivo' : payRaw === 'transf' ? 'Transf' : '-';
			const client = tr.querySelector('td.col-client input')?.value ?? '';
			let arco = tr.querySelector('td.col-arco input')?.value ?? '';
			let melo = tr.querySelector('td.col-melo input')?.value ?? '';
			let mara = tr.querySelector('td.col-mara input')?.value ?? '';
			let oreo = tr.querySelector('td.col-oreo input')?.value ?? '';
			if (arco === '0') arco = '';
			if (melo === '0') melo = '';
			if (mara === '0') mara = '';
			if (oreo === '0') oreo = '';
			let total = tr.querySelector('td.col-total')?.textContent?.trim() ?? '';
			if (total === '0') total = '';
			data.push([paid, pay, client, arco, melo, mara, oreo, total]);
		}
	}
	const tAr = (document.getElementById('sum-arco-qty')?.textContent ?? '').trim();
	const tMe = (document.getElementById('sum-melo-qty')?.textContent ?? '').trim();
	const tMa = (document.getElementById('sum-mara-qty')?.textContent ?? '').trim();
	const tOr = (document.getElementById('sum-oreo-qty')?.textContent ?? '').trim();
	const tSum = [tAr, tMe, tMa, tOr].map(v => parseInt(v || '0', 10) || 0).reduce((a, b) => a + b, 0);
	data.push(['', '', 'Totales (cant.)',
		tAr === '0' ? '' : tAr,
		tMe === '0' ? '' : tMe,
		tMa === '0' ? '' : tMa,
		tOr === '0' ? '' : tOr,
		tSum === 0 ? '' : String(tSum)
	]);
	const vAr = (document.getElementById('sum-arco-amt')?.textContent ?? '').trim();
	const vMe = (document.getElementById('sum-melo-amt')?.textContent ?? '').trim();
	const vMa = (document.getElementById('sum-mara-amt')?.textContent ?? '').trim();
	const vOr = (document.getElementById('sum-oreo-amt')?.textContent ?? '').trim();
	const vGr = (document.getElementById('sum-grand')?.textContent ?? '').trim();
	data.push(['', '', 'Totales (valor)',
		vAr === '0' ? '' : vAr,
		vMe === '0' ? '' : vMe,
		vMa === '0' ? '' : vMa,
		vOr === '0' ? '' : vOr,
		vGr === '0' ? '' : vGr
	]);

	const ws = XLSX.utils.aoa_to_sheet(data);
	// Autofit: set column widths roughly based on header text length
	ws['!cols'] = header.map(h => ({ wch: Math.max(8, h.length + 2) }));
	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, ws, 'Ventas');
	const sellerName = state.currentSeller?.name?.replace(/[^\w\-]+/g, '_') || 'ventas';
	const dateStr = new Date().toISOString().slice(0,10);
	XLSX.writeFile(wb, `${sellerName}_${dateStr}.xlsx`);
	try { notify.success('Excel exportado'); } catch {}
}

async function exportConsolidatedForDate(dayIso) {
	const sellers = await api('GET', API.Sellers);
	const rows = [['Vendedor', '$', 'Pago', 'Cliente', 'Arco', 'Melo', 'Mara', 'Oreo', 'Total']];
	let tQa = 0, tQm = 0, tQma = 0, tQo = 0, tGrand = 0;
	for (const s of sellers) {
		const days = await api('GET', `/api/days?seller_id=${encodeURIComponent(s.id)}`);
		const day = (days || []).find(d => (String(d.day).slice(0,10) === String(dayIso).slice(0,10)));
		if (!day) continue;
		const params = new URLSearchParams({ seller_id: String(s.id), sale_day_id: String(day.id) });
		const sales = await api('GET', `${API.Sales}?${params.toString()}`);
		for (const r of (sales || [])) {
			const qa = r.qty_arco || 0;
			const qm = r.qty_melo || 0;
			const qma = r.qty_mara || 0;
			const qo = r.qty_oreo || 0;
			const tot = r.total_cents || 0;
			const pm = (r.pay_method || '').toString();
			const pay = pm === 'efectivo' ? 'Efectivo' : pm === 'transf' ? 'Transf' : '-';
			tQa += qa; tQm += qm; tQma += qma; tQo += qo; tGrand += (tot || 0);
			rows.push([
				s.name || '',
				r.is_paid ? '✓' : '',
				pay,
				r.client_name || '',
				qa === 0 ? '' : qa,
				qm === 0 ? '' : qm,
				qma === 0 ? '' : qma,
				qo === 0 ? '' : qo,
				tot === 0 ? '' : tot,
			]);
		}
	}
	// Append totals row (cantidades por sabor) y monto total
	rows.push(['', '', '', 'Totales', tQa || '', tQm || '', tQma || '', tQo || '', tGrand || '']);
	// Add total count of all desserts
	const tSumAll = (tQa || 0) + (tQm || 0) + (tQma || 0) + (tQo || 0);
	rows.push(['', '', '', 'Total postres', '', '', '', '', tSumAll || '']);
	const ws = XLSX.utils.aoa_to_sheet(rows);
	ws['!cols'] = [ {wch:18},{wch:3},{wch:10},{wch:24},{wch:6},{wch:6},{wch:6},{wch:6},{wch:10} ];
	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, ws, 'Consolidado');
	const dateLabel = formatDayLabel(String(dayIso).slice(0,10)).replace(/\s+/g, '_');
	XLSX.writeFile(wb, `Consolidado_${dateLabel}.xlsx`);
}

async function exportConsolidatedForDates(isoList) {
	const unique = Array.from(new Set((isoList || []).map(iso => String(iso).slice(0,10))));
	const sellers = await api('GET', API.Sellers);
	const rows = [['Fecha','Vendedor', '$', 'Pago', 'Cliente', 'Arco', 'Melo', 'Mara', 'Oreo', 'Total']];
	let tQa = 0, tQm = 0, tQma = 0, tQo = 0, tGrand = 0;
	for (const iso of unique) {
		for (const s of sellers) {
			const days = await api('GET', `/api/days?seller_id=${encodeURIComponent(s.id)}`);
			const day = (days || []).find(d => (String(d.day).slice(0,10) === iso));
			if (!day) continue;
			const params = new URLSearchParams({ seller_id: String(s.id), sale_day_id: String(day.id) });
			const sales = await api('GET', `${API.Sales}?${params.toString()}`);
			for (const r of (sales || [])) {
				const qa = r.qty_arco || 0;
				const qm = r.qty_melo || 0;
				const qma = r.qty_mara || 0;
				const qo = r.qty_oreo || 0;
				const tot = r.total_cents || 0;
				const pm = (r.pay_method || '').toString();
				const pay = pm === 'efectivo' ? 'Efectivo' : pm === 'transf' ? 'Transf' : '-';
				tQa += qa; tQm += qm; tQma += qma; tQo += qo; tGrand += (tot || 0);
				rows.push([iso, s.name || '', r.is_paid ? '✓' : '', pay,
					r.client_name || '', qa === 0 ? '' : qa, qm === 0 ? '' : qm,
					qma === 0 ? '' : qma, qo === 0 ? '' : qo, tot === 0 ? '' : tot]);
			}
		}
	}
	rows.push(['', '', '', '', 'Totales', tQa || '', tQm || '', tQma || '', tQo || '', tGrand || '']);
	// Add total count of all desserts across selected dates
	const tSumAll = (tQa || 0) + (tQm || 0) + (tQma || 0) + (tQo || 0);
	rows.push(['', '', '', '', 'Total postres', '', '', '', '', tSumAll || '']);
	const ws = XLSX.utils.aoa_to_sheet(rows);
	ws['!cols'] = [ {wch:10},{wch:18},{wch:3},{wch:10},{wch:24},{wch:6},{wch:6},{wch:6},{wch:6},{wch:10} ];
	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, ws, 'Consolidado');
	XLSX.writeFile(wb, `Consolidado_varios_${new Date().toISOString().slice(0,10)}.xlsx`);
}

(function wireGlobalDates(){
	const globalList = document.getElementById('global-dates-list');
	if (!globalList) return;
	// Load unique dates across sellers by querying one seller (or better: consolidate server-side). Here, we'll show last 7 days from today.
	const today = new Date();
	const days = [];
	for (let i=0;i<7;i++) {
		const d = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()-i));
		days.push(d.toISOString().slice(0,10));
	}
	for (const iso of days) {
		const item = document.createElement('div');
		item.className = 'date-item';
		const btn = document.createElement('button');
		btn.className = 'date-button';
		btn.textContent = formatDayLabel(iso);
		btn.addEventListener('click', async () => { await exportConsolidatedForDate(iso); });
		item.appendChild(btn);
		globalList.appendChild(item);
	}
})();

(function wireReportButton(){
	const reportBtn = document.getElementById('report-button');
	const input = document.getElementById('report-date');
	if (!reportBtn || !input) return;
	reportBtn.addEventListener('click', (ev) => {
		openMultiCalendarPopover(async (isoList) => {
			if (!isoList || !isoList.length) return;
			await exportConsolidatedForDates(isoList);
		}, ev.clientX, ev.clientY);
	});
})();

function bindEvents() {
	$('#add-seller').addEventListener('click', async () => {
		const name = (prompt('Nombre del nuevo vendedor:') || '').trim();
		if (!name) return;
		await addSeller(name);
	});

	$('#add-row').addEventListener('click', addRow);
	$('#go-home').addEventListener('click', () => {
		state.currentSeller = null;
		state.sales = [];
		switchView('#view-select-seller');
	});

	document.getElementById('export-excel')?.addEventListener('click', exportTableToExcel);
}

// Reverted: removed sticky header clone logic to return to visible non-sticky thead state.

function updateToolbarOffset() {
	const toolbar = document.querySelector('.toolbar');
	if (!toolbar) return;
	const h = Math.ceil(toolbar.getBoundingClientRect().height);
	document.documentElement.style.setProperty('--toolbarH', h + 'px');
}

window.addEventListener('resize', updateToolbarOffset);

function buildStickyHead() {
	const table = document.getElementById('sales-table');
	const sticky = document.getElementById('sticky-head');
	if (!table || !sticky) return;
	const theadRow = table.tHead && table.tHead.rows[0];
	if (!theadRow) return;
	sticky.innerHTML = '';
	const cells = Array.from(theadRow.cells);
	for (const th of cells) {
		const div = document.createElement('div');
		div.className = `hcell ${th.className || ''}`;
		div.textContent = th.textContent;
		sticky.appendChild(div);
	}
	sticky.classList.remove('hidden');
	syncStickyHeadWidths();
	updateStickyHeadOffset();
}

function syncStickyHeadWidths() {
	const table = document.getElementById('sales-table');
	const sticky = document.getElementById('sticky-head');
	if (!table || !sticky) return;
	let refRow = table.tBodies[0] && table.tBodies[0].rows[0];
	if (!refRow) refRow = table.tHead && table.tHead.rows[0];
	if (!refRow) return;
	const bodyCells = Array.from(refRow.cells);
	const headCells = Array.from(sticky.children);
	if (bodyCells.length !== headCells.length) return;
	for (let i = 0; i < bodyCells.length; i++) {
		const w = Math.round(bodyCells[i].getBoundingClientRect().width);
		headCells[i].style.width = w + 'px';
	}
}

window.addEventListener('resize', () => requestAnimationFrame(syncStickyHeadWidths));

function updateStickyHeadOffset() {
	const sticky = document.getElementById('sticky-head');
	if (!sticky) return;
	const h = Math.ceil(sticky.getBoundingClientRect().height);
	document.documentElement.style.setProperty('--stickyHeadH', h + 'px');
}

window.addEventListener('resize', updateStickyHeadOffset);

async function loadDaysForSeller() {
	const sellerId = state.currentSeller.id;
	const days = await api('GET', `/api/days?seller_id=${encodeURIComponent(sellerId)}`);
	state.saleDays = days;
	renderDaysList();
}

function formatDayLabel(input) {
	if (!input) return 'Fecha';
	// Accept YYYY-MM-DD or ISO datetime; normalize to YYYY-MM-DD
	let iso = String(input);
	if (/^\d{4}-\d{2}-\d{2}T/.test(iso)) iso = iso.slice(0, 10);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return String(input);
	const d = new Date(iso + 'T00:00:00Z');
	if (isNaN(d.getTime())) return iso;
	const weekdays = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
	const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
	return `${weekdays[d.getUTCDay()]} ${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function renderDaysList() {
	const list = document.getElementById('dates-list');
	if (!list) return;
	list.innerHTML = '';
	// Render API-provided days only (Nueva fecha button is next to Excel)
	for (const d of (state.saleDays || [])) {
		if (!d || !d.day) continue;
		const item = document.createElement('div');
		item.className = 'date-item';
		const btn = document.createElement('button');
		btn.className = 'date-button';
		btn.textContent = formatDayLabel(d.day);
		btn.addEventListener('click', async () => {
			state.selectedDayId = d.id;
			document.getElementById('sales-wrapper').classList.remove('hidden');
			await loadSales();
		});
		const del = document.createElement('button');
		del.className = 'date-delete';
		del.title = 'Eliminar fecha';
		del.textContent = '';
		del.addEventListener('click', async (e) => {
			e.stopPropagation();
			const ok = await openConfirmPopover('¿Seguro que quieres eliminar esta fecha?', e.clientX, e.clientY);
			if (!ok) return;
			await api('DELETE', `/api/days?id=${encodeURIComponent(d.id)}`);
			if (state.selectedDayId === d.id) {
				state.selectedDayId = null;
				state.sales = [];
				document.getElementById('sales-wrapper').classList.add('hidden');
			}
			await loadDaysForSeller();
			notify.info('Fecha eliminada');
		});
		item.appendChild(btn);
		item.appendChild(del);
		list.appendChild(item);
	}
}

async function addNewDate() {
	const sellerId = state.currentSeller.id;
	let day = document.getElementById('new-date')?.value;
	if (!day) {
		const now = new Date();
		day = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0,10);
	}
	await api('POST', '/api/days', { seller_id: sellerId, day });
	await loadDaysForSeller();
	notify.success('Fecha agregada');
}

function openDatePickerAndGetISO(onPicked, anchorX, anchorY) {
	// Create a temporary date input positioned at the desired coordinates
	const input = document.createElement('input');
	input.type = 'date';
	input.autocomplete = 'off';
	input.setAttribute('aria-hidden', 'true');
	input.style.position = 'fixed';
	const x = (typeof anchorX === 'number') ? anchorX : (window.innerWidth / 2);
	const y = (typeof anchorY === 'number') ? anchorY : (window.innerHeight / 2);
	input.style.left = x + 'px';
	input.style.top = y + 'px';
	input.style.transform = 'translate(-50%, -50%)';
	input.style.zIndex = '1000';
	input.style.width = '1px';
	input.style.height = '1px';
	input.style.opacity = '0';
	input.style.background = 'transparent';
	input.style.border = '0';
	document.body.appendChild(input);
	let outsideHandler;
	const cleanup = () => {
		input.removeEventListener('change', handleChange);
		if (outsideHandler) {
			document.removeEventListener('mousedown', outsideHandler, true);
			document.removeEventListener('touchstart', outsideHandler, true);
		}
		if (input.parentNode) input.parentNode.removeChild(input);
	};
	const handleChange = () => {
		const day = input.value;
		cleanup();
		if (day && typeof onPicked === 'function') onPicked(day);
	};
	input.addEventListener('change', handleChange);
	// Dismiss if clicking elsewhere without choosing
	setTimeout(() => {
		outsideHandler = (ev) => { if (ev.target !== input) cleanup(); };
		document.addEventListener('mousedown', outsideHandler, true);
		document.addEventListener('touchstart', outsideHandler, true);
	}, 0);
	// Open native picker
	if (typeof input.showPicker === 'function') {
		try { input.showPicker(); return; } catch {}
	}
	input.focus();
	input.click();
}

function openNewDatePicker(ev) {
	openDatePickerAndGetISO(async (iso) => {
		const sellerId = state.currentSeller.id;
		await api('POST', '/api/days', { seller_id: sellerId, day: iso });
		await loadDaysForSeller();
		// Auto-select newly added date
		const added = (state.saleDays || []).find(d => d.day === iso);
		if (added) {
			state.selectedDayId = added.id;
			document.getElementById('sales-wrapper').classList.remove('hidden');
			await loadSales();
		}
	}, ev?.clientX, ev?.clientY);
}

function openCalendarPopover(onPicked, anchorX, anchorY) {
	// Build popover
	const pop = document.createElement('div');
	pop.className = 'date-popover';
	pop.style.position = 'fixed';
	const baseX = (typeof anchorX === 'number') ? anchorX : (window.innerWidth / 2);
	const baseY = (typeof anchorY === 'number') ? anchorY : (window.innerHeight / 2);
	pop.style.left = baseX + 'px';
	pop.style.top = (baseY + 8) + 'px';
	pop.style.transform = 'translate(-50%, 0)';
	pop.style.zIndex = '1000';
	pop.setAttribute('role', 'dialog');
	
	const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
	let view = new Date();
	view.setDate(1);
	
	const header = document.createElement('div');
	header.className = 'date-popover-header';
	const prev = document.createElement('button'); prev.className = 'date-nav'; prev.textContent = '‹';
	const label = document.createElement('div'); label.className = 'date-label';
	const next = document.createElement('button'); next.className = 'date-nav'; next.textContent = '›';
	header.append(prev, label, next);
	
	const grid = document.createElement('div');
	grid.className = 'date-grid';
	
	const weekdays = ['L','M','X','J','V','S','D'];
	const wk = document.createElement('div'); wk.className = 'date-weekdays';
	for (const w of weekdays) { const c = document.createElement('div'); c.textContent = w; wk.appendChild(c); }
	
	function isoUTC(y, m, d) { return new Date(Date.UTC(y, m, d)).toISOString().slice(0,10); }
	function render() {
		label.textContent = months[view.getMonth()] + ' ' + view.getFullYear();
		grid.innerHTML = '';
		const year = view.getFullYear();
		const month = view.getMonth();
		const firstDay = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7; // Monday=0
		const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
		for (let i = 0; i < firstDay; i++) {
			const cell = document.createElement('button');
			cell.className = 'date-cell disabled';
			cell.disabled = true;
			grid.appendChild(cell);
		}
		for (let d = 1; d <= daysInMonth; d++) {
			const cell = document.createElement('button');
			cell.className = 'date-cell';
			cell.textContent = String(d);
			cell.addEventListener('click', () => {
				cleanup();
				if (typeof onPicked === 'function') onPicked(isoUTC(year, month, d));
			});
			grid.appendChild(cell);
		}
	}
	
	function cleanup() {
		document.removeEventListener('mousedown', outside, true);
		document.removeEventListener('touchstart', outside, true);
		if (pop.parentNode) pop.parentNode.removeChild(pop);
	}
	function outside(ev) { if (!pop.contains(ev.target)) cleanup(); }
	
	prev.addEventListener('click', () => { view.setMonth(view.getMonth() - 1); render(); });
	next.addEventListener('click', () => { view.setMonth(view.getMonth() + 1); render(); });
	
	pop.append(header, wk, grid);
	document.body.appendChild(pop);
	// Positioning/clamping: ensure visible; on mobile, prefer above if near bottom
	requestAnimationFrame(() => {
		const margin = 8;
		const vv = window.visualViewport;
		const viewW = (vv && typeof vv.width === 'number') ? vv.width : window.innerWidth;
		const viewH = (vv && typeof vv.height === 'number') ? vv.height : window.innerHeight;
		const viewLeft = (vv && typeof vv.offsetLeft === 'number') ? vv.offsetLeft : 0;
		const viewTop = (vv && typeof vv.offsetTop === 'number') ? vv.offsetTop : 0;
		const isSmall = window.matchMedia('(max-width: 600px)').matches;
		const r = pop.getBoundingClientRect();
		let left = baseX;
		let top = baseY + 8;
		// Prefer placing above if near bottom on small screens
		if (isSmall && baseY > (viewTop + viewH * 0.6)) {
			top = baseY - 8 - r.height;
		}
		// Clamp within viewport
		left = Math.min(Math.max(left, viewLeft + margin), viewLeft + viewW - margin);
		if (top + r.height > viewTop + viewH - margin) top = Math.max(viewTop + margin, viewTop + viewH - margin - r.height);
		if (top < viewTop + margin) top = viewTop + margin;
		pop.style.left = left + 'px';
		pop.style.top = top + 'px';
	});
	document.addEventListener('mousedown', outside, true);
	document.addEventListener('touchstart', outside, true);
	render();
}

function openMultiCalendarPopover(onPickedList, anchorX, anchorY) {
	const pop = document.createElement('div');
	pop.className = 'date-popover';
	pop.style.position = 'fixed';
	const baseX = (typeof anchorX === 'number') ? anchorX : (window.innerWidth / 2);
	const baseY = (typeof anchorY === 'number') ? anchorY : (window.innerHeight / 2);
	pop.style.left = baseX + 'px';
	pop.style.top = (baseY + 8) + 'px';
	pop.style.transform = 'translate(-50%, 0)';
	pop.style.zIndex = '1000';
	pop.setAttribute('role', 'dialog');
	
	const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
	let view = new Date(); view.setDate(1);
	const selected = new Set();
	
	const header = document.createElement('div'); header.className = 'date-popover-header';
	const prev = document.createElement('button'); prev.className = 'date-nav'; prev.textContent = '‹';
	const label = document.createElement('div'); label.className = 'date-label';
	const next = document.createElement('button'); next.className = 'date-nav'; next.textContent = '›';
	header.append(prev, label, next);
	
	const grid = document.createElement('div'); grid.className = 'date-grid';
	const weekdays = ['L','M','X','J','V','S','D'];
	const wk = document.createElement('div'); wk.className = 'date-weekdays';
	for (const w of weekdays) { const c = document.createElement('div'); c.textContent = w; wk.appendChild(c); }
	
	function isoUTC(y, m, d) { return new Date(Date.UTC(y, m, d)).toISOString().slice(0,10); }
	
	function render() {
		label.textContent = months[view.getMonth()] + ' ' + view.getFullYear();
		grid.innerHTML = '';
		const year = view.getFullYear();
		const month = view.getMonth();
		const firstDay = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
		const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
		for (let i = 0; i < firstDay; i++) { const cell = document.createElement('button'); cell.className = 'date-cell disabled'; cell.disabled = true; grid.appendChild(cell); }
		for (let d = 1; d <= daysInMonth; d++) {
			const iso = isoUTC(year, month, d);
			const cell = document.createElement('button');
			cell.className = 'date-cell' + (selected.has(iso) ? ' selected' : '');
			cell.textContent = String(d);
			cell.addEventListener('click', () => { if (selected.has(iso)) selected.delete(iso); else selected.add(iso); render(); });
			grid.appendChild(cell);
		}
	}
	
	function cleanup() { document.removeEventListener('mousedown', outside, true); document.removeEventListener('touchstart', outside, true); if (pop.parentNode) pop.parentNode.removeChild(pop); }
	function outside(ev) { if (!pop.contains(ev.target)) cleanup(); }
	
	const actions = document.createElement('div'); actions.style.display = 'flex'; actions.style.justifyContent = 'space-between'; actions.style.marginTop = '8px';
	const clearBtn = document.createElement('button'); clearBtn.className = 'date-nav'; clearBtn.textContent = 'Limpiar';
	const applyBtn = document.createElement('button'); applyBtn.className = 'date-nav'; applyBtn.textContent = 'Aplicar';
	clearBtn.addEventListener('click', () => { selected.clear(); render(); });
	applyBtn.addEventListener('click', () => { const list = Array.from(selected); cleanup(); if (typeof onPickedList === 'function') onPickedList(list); });
	actions.append(clearBtn, applyBtn);
	
	prev.addEventListener('click', () => { view.setMonth(view.getMonth() - 1); render(); });
	next.addEventListener('click', () => { view.setMonth(view.getMonth() + 1); render(); });
	
	pop.append(header, wk, grid, actions);
	document.body.appendChild(pop);
	
	requestAnimationFrame(() => {
		const margin = 8;
		const vv = window.visualViewport;
		const viewW = (vv && typeof vv.width === 'number') ? vv.width : window.innerWidth;
		const viewH = (vv && typeof vv.height === 'number') ? vv.height : window.innerHeight;
		const viewLeft = (vv && typeof vv.offsetLeft === 'number') ? vv.offsetLeft : 0;
		const viewTop = (vv && typeof vv.offsetTop === 'number') ? vv.offsetTop : 0;
		const isSmall = window.matchMedia('(max-width: 600px)').matches;
		const r = pop.getBoundingClientRect();
		let left = baseX; let top = baseY + 8;
		if (isSmall && baseY > (viewTop + viewH * 0.6)) { top = baseY - 8 - r.height; }
		left = Math.min(Math.max(left, viewLeft + margin), viewLeft + viewW - margin);
		top = Math.min(Math.max(top, viewTop + margin), viewTop + viewH - margin);
		pop.style.left = left + 'px'; pop.style.top = top + 'px';
	});
	render();
}

async function openConfirmPopover(message, anchorX, anchorY) {
	return new Promise((resolve) => {
		const pop = document.createElement('div');
		pop.className = 'confirm-popover';
		pop.style.position = 'fixed';
		// Initial position near the click
		const baseX = (typeof anchorX === 'number') ? anchorX : (window.innerWidth / 2);
		const baseY = (typeof anchorY === 'number') ? anchorY : (window.innerHeight / 2);
		pop.style.left = baseX + 'px';
		pop.style.top = (baseY + 6) + 'px';
		pop.style.transform = 'translate(-50%, 0)';
		pop.style.zIndex = '1000';
		// Constrain width to viewport with padding
		pop.style.maxWidth = 'min(92vw, 320px)';
		pop.style.wordBreak = 'break-word';
		const text = document.createElement('div');
		text.className = 'confirm-text';
		text.textContent = message || '¿Confirmar?';
		const actions = document.createElement('div');
		actions.className = 'confirm-actions';
		const noBtn = document.createElement('button'); noBtn.className = 'press-btn'; noBtn.textContent = 'Cancelar';
		const yesBtn = document.createElement('button'); yesBtn.className = 'press-btn btn-primary'; yesBtn.textContent = 'Eliminar';
		// Prevent outside-capture handlers from firing when tapping buttons (mobile)
		noBtn.addEventListener('mousedown', (e) => e.stopPropagation(), true);
		yesBtn.addEventListener('mousedown', (e) => e.stopPropagation(), true);
		noBtn.addEventListener('touchstart', (e) => e.stopPropagation(), true);
		yesBtn.addEventListener('touchstart', (e) => e.stopPropagation(), true);
		actions.append(noBtn, yesBtn);
		pop.append(text, actions);
		document.body.appendChild(pop);
		// After mount, clamp within viewport so it never gets cut off (esp. on mobile)
		requestAnimationFrame(() => {
			const margin = 8; // small padding from edges
			const rect = pop.getBoundingClientRect();
			let leftPx = baseX - rect.width / 2;
			// Extra left shift on very small screens for right-edge clicks
			if (window.innerWidth <= 600 && baseX > window.innerWidth * 0.6) {
				leftPx -= 12;
			}
			if (leftPx < margin) leftPx = margin;
			const maxLeft = window.innerWidth - rect.width - margin;
			if (leftPx > maxLeft) leftPx = Math.max(margin, maxLeft);
			let topPx = baseY + 6;
			const maxTop = window.innerHeight - rect.height - margin;
			if (topPx > maxTop) topPx = Math.max(margin, maxTop);
			pop.style.left = leftPx + 'px';
			pop.style.top = topPx + 'px';
			pop.style.transform = 'none';
		});
		function cleanup() {
			document.removeEventListener('mousedown', outside, true);
			document.removeEventListener('touchstart', outside, true);
			if (pop.parentNode) pop.parentNode.removeChild(pop);
		}
		function outside(ev) {
			// Ignore if click/tap happens inside popover actions (buttons), to avoid immediate cancel
			const t = ev.target;
			if (pop.contains(t)) return;
			cleanup(); resolve(false);
		}
		setTimeout(() => {
			document.addEventListener('mousedown', outside, true);
			document.addEventListener('touchstart', outside, true);
		}, 0);
		noBtn.addEventListener('click', () => { cleanup(); resolve(false); });
		yesBtn.addEventListener('click', () => { cleanup(); resolve(true); });
	});
}

function openPayMenu(anchorEl, selectEl, clickX, clickY) {
	const rect = anchorEl.getBoundingClientRect();
	const menu = document.createElement('div');
	menu.className = 'pay-menu';
	menu.style.position = 'fixed';
	menu.style.transform = 'translateX(-50%)';
	menu.style.zIndex = '1000';
	const items = [
		{ v: 'efectivo', cls: 'menu-efectivo' },
		{ v: 'marce', cls: 'menu-marce' },
		{ v: '', cls: 'menu-clear' },
		{ v: 'transf', cls: 'menu-transf' }
	];
	// Find current sale id for upload flow when choosing 'transf'
	const trEl = anchorEl.closest('tr');
	const currentSaleId = Number(trEl?.dataset?.id);
	for (const it of items) {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'pay-menu-item ' + it.cls;
		if (it.v === '') btn.textContent = '-';
		btn.addEventListener('click', async (e) => {
			e.stopPropagation();
			selectEl.value = it.v;
			selectEl.dispatchEvent(new Event('change'));
			// If selecting 'transf' from the menu, show existing receipt if any; otherwise open upload
			if (it.v === 'transf' && currentSaleId) {
				try {
					const recs = await api('GET', `${API.Sales}?receipt_for=${encodeURIComponent(currentSaleId)}`);
					if (Array.isArray(recs) && recs.length) {
						openReceiptViewerPopover(recs[0].image_base64, currentSaleId, recs[0].created_at, rect.left + rect.width / 2, rect.bottom);
					} else {
						openReceiptUploadPage(currentSaleId);
					}
				} catch { openReceiptUploadPage(currentSaleId); }
			}
			cleanup();
		});
		menu.appendChild(btn);
	}
	// Position so the '-' option aligns exactly where the user clicked (anchor center)
	menu.style.left = '0px';
	menu.style.top = '0px';
	menu.style.visibility = 'hidden';
	menu.style.pointerEvents = 'none';
	document.body.appendChild(menu);
	const dashBtn = menu.querySelector('.menu-clear');
	const menuRect = menu.getBoundingClientRect();
	const dashRect = dashBtn ? dashBtn.getBoundingClientRect() : menuRect;
	const anchorCx = (typeof clickX === 'number') ? clickX : (rect.left + rect.width / 2);
	const anchorCy = (typeof clickY === 'number') ? clickY : (rect.top + rect.height / 2);
	const offsetYWithinMenu = (dashRect.top - menuRect.top) + (dashRect.height / 2);
	let left = anchorCx;
	let top = anchorCy - offsetYWithinMenu;
	const half = menu.offsetWidth / 2;
	left = Math.min(Math.max(left, half + 6), window.innerWidth - half - 6);
	top = Math.max(6, Math.min(top, window.innerHeight - menu.offsetHeight - 6));
	menu.style.left = left + 'px';
	menu.style.top = top + 'px';
	menu.style.visibility = '';
	menu.style.pointerEvents = '';
	function outside(e) { if (!menu.contains(e.target)) cleanup(); }
	function cleanup() {
		document.removeEventListener('mousedown', outside, true);
		document.removeEventListener('touchstart', outside, true);
		if (menu.parentNode) menu.parentNode.removeChild(menu);
	}
	setTimeout(() => {
		document.addEventListener('mousedown', outside, true);
		document.addEventListener('touchstart', outside, true);
	}, 0);
}

// Extend state to include saleDays and selectedDayId if not present
if (!('saleDays' in state)) state.saleDays = [];
if (!('selectedDayId' in state)) state.selectedDayId = null;

// Enhance events
(function enhanceDateEvents(){
	const addBtn = document.getElementById('add-date');
	addBtn?.addEventListener('click', addNewDate);
})();

// Update enterSeller to load dates
(async function patchEnterSeller(){
	const origEnter = enterSeller;
	enterSeller = async function(id) {
		await origEnter(id);
		await loadDaysForSeller();
	};
})();

// Update '+ Nueva Fecha' to use the custom calendar
(function enhanceStaticButtons(){
	const newBtn = document.getElementById('date-new');
	newBtn?.addEventListener('click', (ev) => {
		const rect = ev.currentTarget.getBoundingClientRect();
		const cx = rect.left + rect.width / 2;
		const cy = rect.bottom;
		openCalendarPopover(async (iso) => {
			const sellerId = state.currentSeller.id;
			await api('POST', '/api/days', { seller_id: sellerId, day: iso });
			await loadDaysForSeller();
			const added = (state.saleDays || []).find(d => d.day === iso);
			if (added) {
				state.selectedDayId = added.id;
				document.getElementById('sales-wrapper').classList.remove('hidden');
				await loadSales();
			}
		}, cx, cy);
	});
})();

(function bindBottomAdd(){
	document.getElementById('add-row-bottom')?.addEventListener('click', addRow);
})();

// Open a dedicated page to upload a receipt image for the given sale id
function openReceiptUploadPage(saleId) {
	try {
		const id = Number(saleId);
		if (!id) return;
		window.location.href = `/receipt.html?sale_id=${encodeURIComponent(id)}`;
	} catch {}
}

function openReceiptViewerPopover(imageBase64, saleId, createdAt, anchorX, anchorY) {
	const pop = document.createElement('div');
	pop.className = 'receipt-popover';
	pop.style.position = 'fixed';
	const isSmall = window.matchMedia('(max-width: 600px)').matches;
	if (isSmall) {
		pop.style.left = '50%';
		pop.style.top = '50%';
		pop.style.transform = 'translate(-50%, -50%)';
		pop.style.width = 'auto';
		pop.style.maxWidth = '90vw';
		pop.style.maxHeight = '82vh';
	} else {
		const x = typeof anchorX === 'number' ? anchorX : (window.innerWidth / 2);
		const y = typeof anchorY === 'number' ? anchorY : (window.innerHeight / 2);
		pop.style.left = x + 'px';
		pop.style.top = (y + 8) + 'px';
		pop.style.transform = 'translate(-50%, 0)';
		pop.style.maxWidth = '90vw';
		pop.style.maxHeight = '80vh';
	}
	pop.style.zIndex = '1000';
	pop.style.overflow = 'auto';
	const img = document.createElement('img');
	img.src = imageBase64;
	img.alt = 'Comprobante';
	img.style.display = 'block';
	img.style.width = isSmall ? 'auto' : 'auto';
	img.style.maxWidth = isSmall ? '88vw' : '80vw';
	img.style.height = 'auto';
	img.style.maxHeight = isSmall ? '72vh' : '60vh';
	img.style.margin = '0 auto';
	img.style.borderRadius = '8px';
	const meta = document.createElement('div');
	meta.className = 'receipt-meta';
	if (createdAt) {
		const when = new Date(createdAt);
		meta.textContent = 'Subido: ' + (isNaN(when.getTime()) ? String(createdAt) : when.toLocaleString());
		meta.style.fontSize = '12px';
		meta.style.opacity = '0.75';
		meta.style.marginTop = '6px';
	}
	const actions = document.createElement('div');
	actions.className = 'confirm-actions';
	const replaceBtn = document.createElement('button'); replaceBtn.className = 'press-btn btn-primary'; replaceBtn.textContent = 'Reemplazar foto';
	const closeBtn = document.createElement('button'); closeBtn.className = 'press-btn'; closeBtn.textContent = 'Cerrar';
	actions.append(replaceBtn, closeBtn);
	pop.append(img, meta, actions);
	document.body.appendChild(pop);
	function cleanup() {
		document.removeEventListener('mousedown', outside, true);
		document.removeEventListener('touchstart', outside, true);
		if (pop.parentNode) pop.parentNode.removeChild(pop);
	}
	function outside(ev) { if (!pop.contains(ev.target)) cleanup(); }
	setTimeout(() => {
		document.addEventListener('mousedown', outside, true);
		document.addEventListener('touchstart', outside, true);
	}, 0);
	replaceBtn.addEventListener('click', () => { cleanup(); openReceiptUploadPage(saleId); });
	closeBtn.addEventListener('click', cleanup);
}


(async function init() {
	bindEvents();
	notify.initToggle();
	// Realtime polling of backend notifications
	(function startRealtime(){
		let lastId = 0;
		async function tick() {
			try {
				const nocache = `t=${Date.now()}`;
				const url = lastId ? `/api/notifications?after_id=${encodeURIComponent(lastId)}&${nocache}` : `/api/notifications?${nocache}`;
				const res = await fetch(url);
				if (res.ok) {
					const rows = await res.json();
					if (Array.isArray(rows) && rows.length) {
						for (const r of rows) {
							lastId = Math.max(lastId, Number(r.id||0));
							const msg = String(r.message || '');
							notify.info(msg);
							notify.showBrowser('Venta', msg);
						}
					}
				}
			} catch {}
			setTimeout(tick, 2500);
		}
		tick();
	})();
	updateToolbarOffset();
	try { const saved = localStorage.getItem('authUser'); if (saved) state.currentUser = JSON.parse(saved); } catch {}
	await loadSellers();
	bindLogin();
	// Route initial view
	if (!state.currentUser) {
		switchView('#view-login');
	} else if (state.currentUser.isAdmin) {
		switchView('#view-select-seller');
	} else {
		const me = (state.sellers || []).find(s => String(s.name).toLowerCase() === String(state.currentUser.name || '').toLowerCase());
		if (me) enterSeller(me.id); else switchView('#view-select-seller');
	}
	window.addEventListener('resize', debounce(updateSummary, 150));
})();

(function enforceDesktopHeaderHorizontal(){
	function apply() {
		const isDesktop = window.matchMedia('(min-width: 601px)').matches;
		const labels = document.querySelectorAll('#sales-table thead th.col-arco .v-label, #sales-table thead th.col-melo .v-label, #sales-table thead th.col-mara .v-label, #sales-table thead th.col-oreo .v-label');
		labels.forEach((el) => {
			if (!(el instanceof HTMLElement)) return;
			if (isDesktop) {
				el.style.writingMode = 'initial';
				el.style.textOrientation = 'initial';
				el.style.transform = 'none';
				el.style.position = 'static';
				el.style.top = 'auto';
			} else {
				el.style.writingMode = '';
				el.style.textOrientation = '';
				el.style.transform = '';
				el.style.position = '';
				el.style.top = '';
			}
		});
	}
	window.addEventListener('resize', apply);
	document.addEventListener('DOMContentLoaded', apply);
	apply();
})();

// Change log state and helpers
state.changeLogsBySale = {};

async function fetchLogsForSale(saleId) {
	try { return await api('GET', `${API.Sales}?history_for=${encodeURIComponent(saleId)}`); } catch { return []; }
}

function clearAllMarkers() {
	const marks = document.querySelectorAll('#sales-tbody .change-marker');
	marks.forEach(m => m.remove());
}

function addMarkersFromLogs() {
	if (!state.currentUser?.isAdmin) return;
	for (const [idStr, logs] of Object.entries(state.changeLogsBySale || {})) {
		const id = Number(idStr);
		const tr = document.querySelector(`#sales-tbody tr[data-id="${id}"]`);
		if (!tr) continue;
		// Determine if there is a net change in any field
		const byField = {};
		for (const l of (logs || [])) {
			const f = (l.field || '').toString();
			if (!byField[f]) byField[f] = [];
			byField[f].push(l);
		}
		let hasNet = false;
		for (const arr of Object.values(byField)) {
			const sorted = arr.sort((a,b) => new Date(a.created_at || a.time) - new Date(b.created_at || b.time));
			const firstOld = String(sorted[0].old_value ?? sorted[0].oldValue ?? '');
			const lastNew = String(sorted[sorted.length - 1].new_value ?? sorted[sorted.length - 1].newValue ?? '');
			if (lastNew !== firstOld) { hasNet = true; break; }
		}
		// Render asterisk only in client name cell if any net change exists
		const tdClient = tr.querySelector('.col-client');
		tr.querySelectorAll('.change-marker').forEach(n => n.remove());
		if (hasNet && tdClient) renderChangeMarkerIfNeeded(tdClient, id, null);
	}
}

function preloadChangeLogsForCurrentTable() {
	if (!state.currentUser?.isAdmin) return;
	const ids = (state.sales || []).map(s => s.id);
	Promise.all(ids.map(id => fetchLogsForSale(id).then(rows => [id, rows])))
		.then(pairs => {
			const map = {};
			for (const [id, rows] of pairs) map[id] = rows;
			state.changeLogsBySale = map;
			clearAllMarkers();
			addMarkersFromLogs();
		}).catch(() => {});
}

async function openHistoryPopover(saleId, field, anchorX, anchorY) {
	const all = await fetchLogsForSale(saleId);
	const entries = field ? all.filter(l => l.field === field).slice().reverse() : all.slice().reverse();
	const pop = document.createElement('div');
	pop.className = 'history-popover';
	pop.style.position = 'fixed';
	pop.style.left = (anchorX || (window.innerWidth / 2)) + 'px';
	pop.style.top = ((anchorY || (window.innerHeight / 2)) + 6) + 'px';
	pop.style.transform = 'translate(-50%, 0)';
	pop.style.zIndex = '1000';
	const title = document.createElement('div');
	title.className = 'history-title';
	title.textContent = 'Historial';
	const list = document.createElement('div');
	list.className = 'history-list';
	if (entries.length === 0) {
		const empty = document.createElement('div');
		empty.className = 'history-item';
		empty.textContent = 'Sin cambios';
		list.appendChild(empty);
	} else {
		for (const e of entries) {
			const item = document.createElement('div');
			item.className = 'history-item';
			const when = new Date(e.created_at || e.time);
			const oldV = String(e.old_value ?? e.oldValue ?? '');
			const newV = String(e.new_value ?? e.newValue ?? '');
			const f = (e.field || '').toString();
			const lower = f.toLowerCase();
			// Map labels explicitly
			let label = '';
			if (lower.startsWith('qty_')) {
				const suffix = lower.slice(4);
				if (suffix === 'arco') label = 'Arco';
				else if (suffix === 'melo') label = 'Melo';
				else if (suffix === 'mara') label = 'Mara';
				else if (suffix === 'oreo') label = 'Oreo';
			}
			if (lower === 'client_name') label = 'Cliente';
			if (lower === 'pay_method') {
				const fmt = (v) => v === 'efectivo' ? 'Efectivo' : v === 'transf' ? 'Transferencia' : '-';
				item.textContent = `[${when.toLocaleString()}] Pago: ${fmt(oldV)} → ${fmt(newV)}`;
			} else if (label) {
				item.textContent = `[${when.toLocaleString()}] ${label}: ${oldV} → ${newV}`;
			} else {
				item.textContent = `[${when.toLocaleString()}] ${oldV} → ${newV}`;
			}
			list.appendChild(item);
		}
	}
	const actions = document.createElement('div');
	actions.className = 'confirm-actions';
	const closeBtn = document.createElement('button'); closeBtn.className = 'press-btn'; closeBtn.textContent = 'Cerrar';
	actions.append(closeBtn);
	pop.append(title, list, actions);
	document.body.appendChild(pop);
	function cleanup() {
		document.removeEventListener('mousedown', outside, true);
		document.removeEventListener('touchstart', outside, true);
		if (pop.parentNode) pop.parentNode.removeChild(pop);
	}
	function outside(ev) { if (!pop.contains(ev.target)) cleanup(); }
	setTimeout(() => {
		document.addEventListener('mousedown', outside, true);
		document.addEventListener('touchstart', outside, true);
	}, 0);
	closeBtn.addEventListener('click', cleanup);
}

function renderChangeMarkerIfNeeded(tdEl, saleId, field) {
	if (!state.currentUser?.isAdmin) return;
	const mark = document.createElement('span');
	mark.className = 'change-marker';
	mark.textContent = '*';
	mark.title = 'Ver historial';
	mark.addEventListener('click', (ev) => {
		ev.stopPropagation();
		openHistoryPopover(saleId, field, ev.clientX, ev.clientY);
	});
	tdEl.appendChild(mark);
}

// (mobile bounce limiter removed per user preference)