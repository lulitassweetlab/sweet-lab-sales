async function openClientDetailView(clientName) {
	if (!state.currentSeller) return;
	const name = String(clientName || '').trim();
	state._clientDetailName = name;
	state._clientDetailFrom = document.querySelector('#view-sales')?.classList.contains('hidden') ? 'clients' : 'sales';
	await loadClientDetailRows(name);
	switchView('#view-client-detail');
}

// Global client detail view - works without needing a current seller selected
async function openGlobalClientDetailView(clientName) {
	const name = String(clientName || '').trim();
	if (!name) return;
	
	state._clientDetailName = name;
	state._clientDetailFrom = 'global-search';
	
	await loadGlobalClientDetailRows(name);
	switchView('#view-client-detail');
}

// Load client detail rows from all sellers the user has access to
async function loadGlobalClientDetailRows(clientName) {
	const isSuper = state.currentUser?.role === 'superadmin' || !!state.currentUser?.isSuperAdmin;
	const isAdmin = !!state.currentUser?.isAdmin;
	
	const allRows = [];
	let sellersToSearch = [];
	
	if (isSuper || isAdmin) {
		// Admin/SuperAdmin: search in all sellers
		sellersToSearch = state.sellers || [];
	} else {
		// Regular user: search only in their own seller
		sellersToSearch = (state.sellers || []).filter(s => 
			String(s.name).toLowerCase() === String(state.currentUser.name || '').toLowerCase()
		);
	}
	
	// Use optimized endpoint to get all sales for this client across all sellers
	for (const seller of sellersToSearch) {
		try {
			const params = new URLSearchParams({ 
				client_name: clientName,
				client_seller_id: String(seller.id)
			});
			const sales = await api('GET', `${API.Sales}?${params.toString()}`);
			
			for (const s of (sales || [])) {
				allRows.push({
					id: s.id,
					dayIso: String(s.day).slice(0,10),
					sellerName: seller.name || '',
					sellerId: seller.id,
					qty_arco: Number(s.qty_arco||0),
					qty_melo: Number(s.qty_melo||0),
					qty_mara: Number(s.qty_mara||0),
					qty_oreo: Number(s.qty_oreo||0),
					qty_nute: Number(s.qty_nute||0),
					pay_method: s.pay_method || '',
					is_paid: !!s.is_paid,
					items: s.items || []
				});
			}
		} catch (e) {
			console.error('Error loading client details for seller:', seller.name, e);
		}
	}
	
	// Sort by date descending
	allRows.sort((a,b) => (a.dayIso < b.dayIso ? 1 : a.dayIso > b.dayIso ? -1 : 0));
	
	// Save the primary seller for this client (from the most recent order)
	if (allRows.length > 0) {
		state._clientDetailSellerId = allRows[0].sellerId;
	}
	
	renderClientDetailTable(allRows);
}

async function loadClientDetailRows(clientName) {
	const sellerId = state.currentSeller.id;
	const sellerName = state.currentSeller.name || '';
	
	// Use optimized endpoint to get all sales for this client (including archived) in one query
	const params = new URLSearchParams({ 
		client_name: clientName,
		client_seller_id: String(sellerId)
	});
	const sales = await api('GET', `${API.Sales}?${params.toString()}`);
	
	const allRows = [];
	for (const s of (sales || [])) {
		allRows.push({
			id: s.id,
			dayIso: String(s.day).slice(0,10),
			sellerName: sellerName,
			sellerId: sellerId,
			qty_arco: Number(s.qty_arco||0),
			qty_melo: Number(s.qty_melo||0),
			qty_mara: Number(s.qty_mara||0),
			qty_oreo: Number(s.qty_oreo||0),
			qty_nute: Number(s.qty_nute||0),
			pay_method: s.pay_method || '',
			is_paid: !!s.is_paid,
			items: s.items || []
		});
	}
	
	// Data already sorted by backend (day DESC)
	
	// Save the seller ID for this client
	state._clientDetailSellerId = sellerId;
	
	renderClientDetailTable(allRows);
}

// Attempt to restore sales that were overwritten to zeros by re-applying last non-zero values from change logs
async function restoreBuggedSalesForSeller() {
	const sellerId = state.currentSeller?.id;
	if (!sellerId) return 0;
	let restored = 0;
	// Load all days for seller
	const days = await api('GET', `/api/days?seller_id=${encodeURIComponent(sellerId)}`);
	for (const d of (days || [])) {
		const params = new URLSearchParams({ seller_id: String(sellerId), sale_day_id: String(d.id) });
		let sales = [];
		try { sales = await api('GET', `${API.Sales}?${params.toString()}`); } catch { sales = []; }
		for (const s of (sales || [])) {
			const isAllZero = !Number(s.qty_arco||0) && !Number(s.qty_melo||0) && !Number(s.qty_mara||0) && !Number(s.qty_oreo||0) && !Number(s.qty_nute||0);
			if (!isAllZero) continue;
			// Fetch history for this sale id to find last non-zero per qty field
			let logs = [];
			try { logs = await api('GET', `${API.Sales}?history_for=${encodeURIComponent(s.id)}`); } catch { logs = []; }
			const byField = { qty_arco: 0, qty_melo: 0, qty_mara: 0, qty_oreo: 0, qty_nute: 0 };
			for (const f of Object.keys(byField)) {
				const history = logs.filter(l => l.field === f);
				for (const h of history) {
					const prev = Number(h.new_value ?? h.newValue ?? 0) || 0;
					if (prev > 0) { byField[f] = prev; }
				}
			}
			const any = Object.values(byField).some(v => Number(v||0) > 0);
			if (!any) continue;
			await api('PUT', API.Sales, {
				id: s.id,
				client_name: s.client_name || '',
				qty_arco: byField.qty_arco || 0,
				qty_melo: byField.qty_melo || 0,
				qty_mara: byField.qty_mara || 0,
				qty_oreo: byField.qty_oreo || 0,
				qty_nute: byField.qty_nute || 0,
				pay_method: s.pay_method || null,
				_actor_name: state.currentUser?.name || ''
			});
			restored++;
		}
	}
	return restored;
}

function renderClientDetailTable(rows) {
	const tbody = document.getElementById('client-detail-tbody');
	if (!tbody) return;
	tbody.innerHTML = '';
	
	// Helper function to get quantity for a dessert from a sale row (supports both items array and legacy qty_* columns)
	const getQtyForDessert = (row, shortCode) => {
		// Try items array first (new format)
		if (Array.isArray(row.items) && row.items.length > 0) {
			const item = row.items.find(i => i.short_code === shortCode);
			return item ? Number(item.quantity || 0) : 0;
		}
		// Fallback to legacy qty_* columns
		return Number(row[`qty_${shortCode}`] || 0);
	};
	
	// Update title with client name and seller name
	const title = document.getElementById('client-detail-title');
	if (title) {
		// Clear existing content and create editable structure
		title.innerHTML = '';
		title.style.position = 'absolute';
		title.style.left = '50%';
		title.style.transform = 'translateX(-50%)';
		title.style.margin = '0';
		const clientNameSpan = document.createElement('span');
		clientNameSpan.textContent = state._clientDetailName || 'Cliente';
		clientNameSpan.style.cursor = 'pointer';
		clientNameSpan.title = 'Haz clic para editar';
		clientNameSpan.addEventListener('click', () => {
			openEditClientNameDialog(state._clientDetailName);
		});
		
		const sellerNameSpan = document.createElement('span');
		if (rows && rows.length > 0 && rows[0].sellerName) {
			sellerNameSpan.textContent = '  -  ' + rows[0].sellerName;
			sellerNameSpan.style.opacity = '0.7';
			sellerNameSpan.style.marginRight = '5px';
		}
		
		title.appendChild(clientNameSpan);
		title.appendChild(sellerNameSpan);
	}
	
	if (!rows || rows.length === 0) {
		const tr = document.createElement('tr');
		const td = document.createElement('td'); td.colSpan = 9; td.textContent = 'Sin compras'; td.style.opacity = '0.8';
		tr.appendChild(td); tbody.appendChild(tr);
		// Clear totals
		document.getElementById('client-detail-total-arco').textContent = '';
		document.getElementById('client-detail-total-melo').textContent = '';
		document.getElementById('client-detail-total-mara').textContent = '';
		document.getElementById('client-detail-total-oreo').textContent = '';
		document.getElementById('client-detail-total-nute').textContent = '';
		document.getElementById('client-detail-total-grand').textContent = '';
		return;
	}
	for (const r of rows) {
		const tr = document.createElement('tr');
		tr.dataset.id = String(r.id);
		const tdPay = document.createElement('td'); tdPay.className = 'col-paid';
		const wrap = document.createElement('span'); wrap.className = 'pay-wrap';
		const sel = document.createElement('select'); sel.className = 'input-cell pay-select';
		const current = (r.pay_method || '').replace(/\.$/, '');
		const opts = [
			{ v: '', label: '-' },
			{ v: 'efectivo', label: '' },
			{ v: 'entregado', label: '' }
		];
		const isMarcela = String(state.currentUser?.name || '').toLowerCase() === 'marcela';
		if (isMarcela) opts.push({ v: 'marce', label: '' });
		// If current value is 'marce' but user is not Marcela, include it disabled so it displays
		if (!isMarcela && current === 'marce') opts.push({ v: 'marce', label: '' });
		const isJorge = String(state.currentUser?.name || '').toLowerCase() === 'jorge';
		if (isJorge) opts.push({ v: 'jorge', label: '' });
		// If current value is 'jorge' but user is not Jorge, include it disabled so it displays
		if (!isJorge && current === 'jorge') opts.push({ v: 'jorge', label: '' });
		opts.push({ v: 'transf', label: '' });
		// If current value is 'jorgebank', include it (read-only display)
		if (current === 'jorgebank') opts.push({ v: 'jorgebank', label: '' });
		for (const o of opts) { const opt = document.createElement('option'); opt.value = o.v; opt.textContent = o.label; if (!isMarcela && o.v === 'marce') opt.disabled = true; if (!isJorge && o.v === 'jorge') opt.disabled = true; if (current === o.v) opt.selected = true; sel.appendChild(opt); }
		function applyPayClass() {
			wrap.classList.remove('placeholder','method-efectivo','method-transf','method-marce','method-jorge','method-jorgebank','method-entregado');
			const val = sel.value;
			if (!val) wrap.classList.add('placeholder');
			else if (val === 'efectivo') wrap.classList.add('method-efectivo');
			else if (val === 'entregado') wrap.classList.add('method-entregado');
			else if (val === 'transf') wrap.classList.add('method-transf');
			else if (val === 'marce') wrap.classList.add('method-marce');
			else if (val === 'jorge') wrap.classList.add('method-jorge');
			else if (val === 'jorgebank') wrap.classList.add('method-jorgebank');
		}
		applyPayClass();
		// Click: first-time behaviors and shortcuts
        wrap.addEventListener('click', async (e) => {
			e.stopPropagation();
			const isAdminUser = !!state.currentUser?.isAdmin || state.currentUser?.role === 'superadmin';
            const pm = String(r.pay_method || '').trim().replace(/\.$/, '').toLowerCase();
            const locked = pm !== '' && pm !== 'entregado';
            if (!isAdminUser && locked) return; // block for non-admins, allow when 'entregado'
			const curr = String(sel.value || '');
			const saleId = Number(r.id);
			const rect = wrap.getBoundingClientRect();
			function hasSeen(method){ try { return localStorage.getItem('seenPaymentDate_' + method + '_' + saleId) === '1'; } catch { return false; } }
			function markSeen(method){ try { localStorage.setItem('seenPaymentDate_' + method + '_' + saleId, '1'); } catch {} }
			// If current is 'jorge' and first time -> open payment date dialog centered
			if (curr === 'jorge' && !hasSeen('jorge')) { markSeen('jorge'); openPaymentDateDialog(saleId); return; }
			// If current is 'jorgebank' and already seen -> open receipt gallery
			if (curr === 'jorgebank' && hasSeen('jorgebank')) {
				openReceiptsGalleryPopover(saleId, rect.left + rect.width / 2, rect.bottom);
				return;
			}
				// If current is 'jorgebank' and NOT seen -> show payment date popover first time
				if (curr === 'jorgebank' && !hasSeen('jorgebank')) { markSeen('jorgebank'); openPaymentDateDialog(saleId); return; }
				// If current is 'jorgebank' and NOT seen -> show payment date popover first time
				if (curr === 'jorgebank' && !hasSeen('jorgebank')) { markSeen('jorgebank'); openPaymentDateDialog(saleId); return; }
			// Otherwise open the selector menu
			openPayMenu(wrap, sel, rect.left + rect.width / 2, rect.bottom);
		});
		wrap.tabIndex = 0;
        wrap.addEventListener('keydown', async (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				const isAdminUser = !!state.currentUser?.isAdmin || state.currentUser?.role === 'superadmin';
                const pm = String(r.pay_method || '').trim().replace(/\.$/, '').toLowerCase();
                const locked = pm !== '' && pm !== 'entregado';
                if (!isAdminUser && locked) return;
				const curr = String(sel.value || '');
				const saleId = Number(r.id);
				const rect = wrap.getBoundingClientRect();
				function hasSeen(method){ try { return localStorage.getItem('seenPaymentDate_' + method + '_' + saleId) === '1'; } catch { return false; } }
				function markSeen(method){ try { localStorage.setItem('seenPaymentDate_' + method + '_' + saleId, '1'); } catch {} }
				if (curr === 'jorge' && !hasSeen('jorge')) { markSeen('jorge'); openPaymentDateDialog(saleId); return; }
				if (curr === 'jorgebank' && hasSeen('jorgebank')) {
					openReceiptsGalleryPopover(saleId, rect.left + rect.width / 2, rect.bottom);
					return;
				}
				openPayMenu(wrap, sel, rect.left + rect.width / 2, rect.bottom);
			}
		});
		sel.addEventListener('change', async () => {
			await api('PUT', API.Sales, {
				id: r.id,
				client_name: (state._clientDetailName || '').toString(),
				qty_arco: getQtyForDessert(r, 'arco'),
				qty_melo: getQtyForDessert(r, 'melo'),
				qty_mara: getQtyForDessert(r, 'mara'),
				qty_oreo: getQtyForDessert(r, 'oreo'),
				qty_nute: getQtyForDessert(r, 'nute'),
				pay_method: sel.value || null,
				_actor_name: state.currentUser?.name || ''
			});
			try {
				const val = (sel.value || '').toString();
				const fmt = (v) => v === 'efectivo' ? 'Efectivo' : v === 'entregado' ? 'Entregado' : (v === 'transf' || v === 'jorgebank') ? 'Transferencia' : v === 'marce' ? 'Marce' : v === 'jorge' ? 'Jorge' : '-';
				const client = (state._clientDetailName || '').toString().trim() || 'Cliente';
				const seller = String((state?.currentSeller?.name || state?.currentUser?.name || '') || '');
				const msg = `${client} pago: ${fmt(val)}` + (seller ? ` - ${seller}` : '');
				notify.info(msg);
			} catch {}
			applyPayClass();
		});
		wrap.appendChild(sel); tdPay.appendChild(wrap);
		// Add a visible dash '-' like the main table when no method, using CSS class 'placeholder'
		if (!sel.value) { /* wrap already has placeholder class to show '-' via styles */ }
		const tdDate = document.createElement('td'); tdDate.textContent = formatDayLabel(r.dayIso);
		const tdAr = document.createElement('td'); tdAr.textContent = getQtyForDessert(r, 'arco') ? String(getQtyForDessert(r, 'arco')) : '';
		const tdMe = document.createElement('td'); tdMe.textContent = getQtyForDessert(r, 'melo') ? String(getQtyForDessert(r, 'melo')) : '';
		const tdMa = document.createElement('td'); tdMa.textContent = getQtyForDessert(r, 'mara') ? String(getQtyForDessert(r, 'mara')) : '';
		const tdOr = document.createElement('td'); tdOr.textContent = getQtyForDessert(r, 'oreo') ? String(getQtyForDessert(r, 'oreo')) : '';
		const tdNu = document.createElement('td'); tdNu.textContent = getQtyForDessert(r, 'nute') ? String(getQtyForDessert(r, 'nute')) : '';
		const total = calcRowTotal(r);
		const tdTot = document.createElement('td'); tdTot.className = 'col-total'; tdTot.textContent = fmtNo.format(total);
		// Delete button
		const tdDel = document.createElement('td'); tdDel.style.textAlign = 'center';
		const delBtn = document.createElement('button');
		delBtn.className = 'row-delete';
		delBtn.title = 'Eliminar';
		delBtn.setAttribute('aria-label', 'Eliminar');
		delBtn.addEventListener('click', async (e) => {
			e.stopPropagation();
			if (!confirm(`¿Estás seguro de eliminar esta compra de "${state._clientDetailName || 'este cliente'}"?`)) return;
			try {
				await api('DELETE', `${API.Sales}?id=${encodeURIComponent(r.id)}`);
				notify.info(`Compra eliminada`);
				// Reload the client detail view
				if (state._clientDetailFrom === 'global-search') {
					await loadGlobalClientDetailRows(state._clientDetailName);
				} else {
					await loadClientDetailRows(state._clientDetailName);
				}
			} catch (err) {
				notify.error('Error al eliminar: ' + String(err));
			}
		});
		tdDel.appendChild(delBtn);
		tr.append(tdPay, tdDate, tdAr, tdMe, tdMa, tdOr, tdNu, tdTot, tdDel);
		tr.addEventListener('mousedown', () => { tr.classList.add('row-highlight'); setTimeout(() => tr.classList.remove('row-highlight'), 3200); });
		tbody.appendChild(tr);
	}
	
	// Add a separator row at the end of tbody
	const separatorRow = document.createElement('tr');
	separatorRow.className = 'separator-row';
	const separatorCell = document.createElement('td');
	separatorCell.colSpan = 9;
	separatorCell.style.height = '12px';
	separatorCell.style.borderBottom = '2px solid var(--border)';
	separatorCell.style.background = 'transparent';
	separatorRow.appendChild(separatorCell);
	tbody.appendChild(separatorRow);
	
	// Calculate and display totals
	let totalArco = 0, totalMelo = 0, totalMara = 0, totalOreo = 0, totalNute = 0, totalGrand = 0;
	for (const r of rows) {
		totalArco += getQtyForDessert(r, 'arco');
		totalMelo += getQtyForDessert(r, 'melo');
		totalMara += getQtyForDessert(r, 'mara');
		totalOreo += getQtyForDessert(r, 'oreo');
		totalNute += getQtyForDessert(r, 'nute');
		const rowTotal = calcRowTotal(r);
		totalGrand += rowTotal;
	}
	
	document.getElementById('client-detail-total-arco').textContent = totalArco || '';
	document.getElementById('client-detail-total-melo').textContent = totalMelo || '';
	document.getElementById('client-detail-total-mara').textContent = totalMara || '';
	document.getElementById('client-detail-total-oreo').textContent = totalOreo || '';
	document.getElementById('client-detail-total-nute').textContent = totalNute || '';
	document.getElementById('client-detail-total-grand').textContent = fmtNo.format(totalGrand);
}

// Function to edit client name
async function openEditClientNameDialog(currentName) {
	const newName = prompt('Editar nombre del cliente:', currentName);
	if (!newName || newName.trim() === '') {
		return; // User cancelled or entered empty name
	}
	
	const trimmedName = newName.trim();
	if (trimmedName === currentName) {
		return; // No change
	}
	
	// Confirm the change
	if (!confirm(`¿Cambiar el nombre del cliente de "${currentName}" a "${trimmedName}"?\n\nEsto actualizará todas las compras de este cliente.`)) {
		return;
	}
	
	try {
		let updatedCount = 0;
		
		// Determine which sellers to update
		const isGlobalView = state._clientDetailFrom === 'global-search';
		const isSuper = state.currentUser?.role === 'superadmin' || !!state.currentUser?.isSuperAdmin;
		const isAdmin = !!state.currentUser?.isAdmin;
		
		let sellersToUpdate = [];
		
		if (isGlobalView && (isSuper || isAdmin)) {
			// Update across all sellers
			sellersToUpdate = state.sellers || [];
		} else if (state._clientDetailSellerId) {
			// Update only for specific seller
			const seller = (state.sellers || []).find(s => s.id === state._clientDetailSellerId);
			if (seller) sellersToUpdate = [seller];
		} else if (state.currentSeller) {
			// Fallback to current seller
			sellersToUpdate = [state.currentSeller];
		}
		
		if (sellersToUpdate.length === 0) {
			notify.error('No se pudo determinar el vendedor');
			return;
		}
		
		// Update sales for all relevant sellers
		for (const seller of sellersToUpdate) {
			const days = await api('GET', `/api/days?seller_id=${encodeURIComponent(seller.id)}`);
			
			for (const d of (days || [])) {
				const params = new URLSearchParams({ seller_id: String(seller.id), sale_day_id: String(d.id) });
				let sales = [];
				try { 
					sales = await api('GET', `${API.Sales}?${params.toString()}`); 
				} catch { 
					sales = []; 
				}
				
				for (const s of (sales || [])) {
					const n = (s?.client_name || '').trim();
					if (!n) continue;
					if (normalizeClientName(n) !== normalizeClientName(currentName)) continue;
					
					// Update this sale with the new name
					await api('PUT', API.Sales, {
						id: s.id,
						client_name: trimmedName,
						qty_arco: Number(s.qty_arco||0),
						qty_melo: Number(s.qty_melo||0),
						qty_mara: Number(s.qty_mara||0),
						qty_oreo: Number(s.qty_oreo||0),
						qty_nute: Number(s.qty_nute||0),
						pay_method: s.pay_method || null,
						_actor_name: state.currentUser?.name || ''
					});
					updatedCount++;
				}
			}
		}
		
		// Update state and reload
		state._clientDetailName = trimmedName;
		notify.success(`Nombre actualizado: ${updatedCount} compra(s) modificadas`);
		
		// Reload the client detail view with new name
		if (state._clientDetailFrom === 'global-search') {
			await loadGlobalClientDetailRows(trimmedName);
		} else {
			await loadClientDetailRows(trimmedName);
		}
		
		// Update client counts if necessary
		if (typeof loadGlobalClientSuggestions === 'function') {
			await loadGlobalClientSuggestions();
		}
	} catch (err) {
		notify.error('Error al actualizar el nombre: ' + String(err));
	}
}

const API = {
	Sellers: '/api/sellers',
	Sales: '/api/sales',
	Users: '/api/users',
	Materials: '/api/materials',
	Recipes: '/api/recipes',
	Inventory: '/api/inventory',
	Desserts: '/api/desserts'
};

const PRICES = {
	arco: 8500,
	melo: 9500,
	mara: 10500,
	oreo: 10500,
	nute: 13000,
};

const fmtNo = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

const state = {
	currentSeller: null,
	sellers: [],
	sales: [],
	currentUser: null,
	clientCounts: new Map(),
	deleteSellerMode: false,
	desserts: [], // Dynamic desserts loaded from API
	dessertsLoaded: false,
	globalClientSuggestions: [], // Global client suggestions for header search
};

// Toasts and Notifications
const notify = (() => {
	const container = () => document.getElementById('toast-container');
	const STORAGE_KEY = 'notify_log_v1';
	const STORAGE_HIDE_KEY = 'notify_hide_ids_v1';
		const STORAGE_FILTER_KEY = 'notify_seller_filter_id_v1';
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
	function readHideSet() {
		try {
			const raw = JSON.parse(localStorage.getItem(STORAGE_HIDE_KEY) || '[]');
			return new Set(Array.isArray(raw) ? raw : []);
		} catch { return new Set(); }
	}
	function writeHideSet(set) {
		try { localStorage.setItem(STORAGE_HIDE_KEY, JSON.stringify(Array.from(set))); } catch {}
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
	function render(type, message, optsOrTimeout) {
		const c = container();
		if (!c) return;
		let timeoutMs = 3000;
		let iconUrl = null;
		let payMethod = null;
		if (typeof optsOrTimeout === 'number') {
			timeoutMs = optsOrTimeout;
		} else if (optsOrTimeout && typeof optsOrTimeout === 'object') {
			if (typeof optsOrTimeout.timeoutMs === 'number') timeoutMs = optsOrTimeout.timeoutMs;
			iconUrl = optsOrTimeout.iconUrl || null;
			payMethod = optsOrTimeout.payMethod || null;
		}
		const n = document.createElement('div');
		n.className = 'toast toast-' + (type || 'info');
		const actorName = String((state?.currentSeller?.name || state?.currentUser?.name || '') || '');
		const msg = document.createElement('div');
		msg.className = 'toast-msg';
		msg.textContent = String(message || '');
		const close = document.createElement('button'); close.className = 'toast-close'; close.type = 'button'; close.textContent = '×';
		close.addEventListener('click', () => dismiss(n));
		n.append(msg, close);
		// Optional icon support (e.g., payment method)
		try {
			let url = iconUrl;
			if (!url && payMethod) {
				url = payMethod === 'efectivo' ? '/icons/bill.svg' : payMethod === 'transf' ? '/icons/bank.svg' : payMethod === 'marce' ? '/icons/marce7.svg?v=1' : null;
			}
			if (url) {
				const icon = document.createElement('span');
				icon.className = 'toast-icon';
				icon.style.backgroundImage = `url('${url}')`;
				n.insertBefore(icon, msg);
			}
		} catch {}
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
	async function openDialog(anchorX, anchorY) {
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
		const info = document.createElement('div'); info.style.fontSize = '12px'; info.style.opacity = '0.8'; info.textContent = 'Historial del servidor (más recientes primero)';
		const loadMoreBtn = document.createElement('button'); loadMoreBtn.className = 'notif-btn'; loadMoreBtn.textContent = 'Cargar más';
		// Superadmin-only seller/day filter
		const isSuperAdmin = state.currentUser?.role === 'superadmin' || !!state.currentUser?.isSuperAdmin;
		let sellerSelect = null;
		let daySelect = null;
		if (isSuperAdmin) {
			sellerSelect = document.createElement('select');
			sellerSelect.className = 'notif-seller-select';
			sellerSelect.title = 'Filtrar por vendedor';
			const optAll = document.createElement('option'); optAll.value = ''; optAll.textContent = 'Todos los vendedores';
			sellerSelect.appendChild(optAll);
			try {
				const sellers = Array.isArray(state.sellers) && state.sellers.length ? state.sellers : await api('GET', API.Sellers);
				for (const s of sellers) {
					const opt = document.createElement('option');
					opt.value = String(s.id);
					opt.textContent = s.name;
					sellerSelect.appendChild(opt);
				}
				// Restore saved selection
				try {
					const saved = localStorage.getItem(STORAGE_FILTER_KEY) || '';
					if (saved) sellerSelect.value = saved;
				} catch {}
			} catch {}
			// Day select depends on seller
			daySelect = document.createElement('select');
			daySelect.className = 'notif-day-select';
			daySelect.title = 'Filtrar por fecha (tabla)';
			const optAllDays = document.createElement('option'); optAllDays.value = ''; optAllDays.textContent = 'Todas las fechas';
			daySelect.appendChild(optAllDays);
			async function loadDaysForSelectedSeller() {
				// Reset options
				while (daySelect.options.length > 1) daySelect.remove(1);
				const sid = sellerSelect.value;
				if (!sid) { try { localStorage.removeItem('notify_day_filter_id_v1'); } catch {}; return; }
				try {
					const days = await api('GET', `/api/days?seller_id=${encodeURIComponent(sid)}`);
					for (const d of (days || [])) {
						const opt = document.createElement('option');
						opt.value = String(d.id);
						opt.textContent = String(d.day).slice(0,10);
						daySelect.appendChild(opt);
					}

					// Restore saved day for this seller
					try {
						const savedDay = localStorage.getItem('notify_day_filter_id_v1') || '';
						if (savedDay) daySelect.value = savedDay;
					} catch {}
				} catch {}
			}
			sellerSelect.addEventListener('change', () => {
				try { localStorage.setItem(STORAGE_FILTER_KEY, sellerSelect.value || ''); } catch {}
				// Reset day filter on seller change
				try { localStorage.removeItem('notify_day_filter_id_v1'); } catch {}
				loadDaysForSelectedSeller();
				fetchInitial();
			});
			daySelect.addEventListener('change', () => {
				try { localStorage.setItem('notify_day_filter_id_v1', daySelect.value || ''); } catch {}
				fetchInitial();
			});
			toolbar.append(sellerSelect);
			toolbar.append(daySelect);
			await loadDaysForSelectedSeller();
		}
		toolbar.append(info, loadMoreBtn);
		const list = document.createElement('div'); list.className = 'notif-list';
		let seenIds = new Set();
		let minLoadedId = null; // track smallest id loaded (for before_id)
		let serverMode = true;
		function renderLocalList() {
			list.innerHTML = '';
			let data = [];
			try { data = readLog(); } catch { data = []; }
			if (!Array.isArray(data) || data.length === 0) {
				const empty = document.createElement('div'); empty.className = 'notif-empty'; empty.textContent = 'Sin notificaciones'; list.appendChild(empty); return;
			}
			for (const it of data.slice(-200).reverse()) {
				appendItem({
					id: it.id,
					when: it.when,
					text: it.text,
					isServer: false,
					original: it
				});
			}
		}
		function appendItem(opts) {
			const { id, when, text, isServer, original } = opts;
			if (isServer) {
				if (seenIds.has(id)) return; // de-dup
				const hidden = readHideSet();
				if (hidden.has(String(id))) return; // locally hidden
				seenIds.add(id);
				minLoadedId = (minLoadedId == null) ? id : Math.min(minLoadedId, id);
			}
			const item = document.createElement('div'); item.className = 'notif-item';
			const isRead = isServer && original.read_at !== null && original.read_at !== undefined;
			if (isRead) item.classList.add('notif-read');
			
			// Check if user is superadmin
			const isSuperAdmin = state.currentUser?.role === 'superadmin' || !!state.currentUser?.isSuperAdmin;
			
			// Add checkbox for superadmin to mark as read (server-backed only)
			let checkboxEl = null;
			if (isServer && isSuperAdmin) {
				checkboxEl = document.createElement('input');
				checkboxEl.type = 'checkbox';
				checkboxEl.className = 'notif-checkbox';
				checkboxEl.checked = isRead;
				checkboxEl.title = isRead ? 'Marcar como no leída' : 'Marcar como leída';
				checkboxEl.addEventListener('click', async (e) => {
					e.stopPropagation();
					const newReadState = e.target.checked;
					try {
						const res = await fetch('/api/notifications', {
							method: 'PATCH',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ id: id, is_read: newReadState })
						});
						if (res.ok) {
							// Update the visual state
							if (newReadState) {
								item.classList.add('notif-read');
							} else {
								item.classList.remove('notif-read');
							}
							checkboxEl.title = newReadState ? 'Marcar como no leída' : 'Marcar como leída';
						} else {
							// Revert checkbox on error
							checkboxEl.checked = !newReadState;
							notify.error('Error al actualizar notificación');
						}
					} catch (err) {
						// Revert checkbox on error
						checkboxEl.checked = !newReadState;
						notify.error('Error al actualizar notificación');
					}
				});
				item.style.gridTemplateColumns = 'auto 1fr auto';
			} else {
				item.style.gridTemplateColumns = '1fr auto';
			}
			
			const whenEl = document.createElement('div'); whenEl.className = 'when';
			const d = new Date(when); whenEl.textContent = isNaN(d.getTime()) ? String(when || '') : d.toLocaleString();
			const textEl = document.createElement('div'); textEl.className = 'text';
			// Optional icon if server provided icon_url or pay_method
			if (isServer) {
				try {
					let url = original.icon_url || null;
					const pm = (original.pay_method || '').toString();
					if (!url && pm) {
						url = pm === 'efectivo' ? '/icons/bill.svg' : pm === 'transf' ? '/icons/bank.svg' : pm === 'jorgebank' ? '/icons/bank-yellow.svg' : pm === 'marce' ? '/icons/marce7.svg?v=1' : pm === 'jorge' ? '/icons/jorge7.svg?v=1' : null;
					}
					if (url) {
						const icon = document.createElement('span'); icon.className = 'notif-icon'; icon.style.backgroundImage = `url('${url}')`;
						textEl.appendChild(icon);
					}
				} catch {}
			}
			const txt = document.createElement('span'); txt.textContent = String(text || '');
			textEl.appendChild(txt);
			
			// Create delete button only for superadmin
			let delBtn = null;
			if (isSuperAdmin) {
				delBtn = document.createElement('button');
				delBtn.type = 'button';
				delBtn.className = 'notif-del';
				delBtn.title = 'Eliminar';
				delBtn.setAttribute('aria-label', 'Eliminar');
				delBtn.addEventListener('click', (e) => {
					e.stopPropagation();
					try {
						if (isServer) {
							const hidden = readHideSet(); hidden.add(String(id)); writeHideSet(hidden);
							item.remove();
						} else {
							const all = (readLog() || []).filter(x => x && x.id !== id);
							writeLog(all);
							item.remove();
						}
					} catch {}
				});
			}
			
			if (checkboxEl && delBtn) {
				item.append(checkboxEl, whenEl, delBtn, textEl);
			} else if (checkboxEl) {
				item.append(checkboxEl, whenEl, textEl);
			} else if (delBtn) {
				item.append(whenEl, delBtn, textEl);
			} else {
				item.append(whenEl, textEl);
			}
			textEl.style.gridColumn = checkboxEl ? '2 / -1' : '1 / -1';
			if (isServer) {
				item.style.cursor = 'pointer';
				item.addEventListener('click', (e) => {
					// Don't navigate if clicking on checkbox
					if (e.target === checkboxEl) return;
					// Deep link in a new tab so the dialog stays open
					try {
						const payload = {
							sellerId: original.seller_id ?? original.sellerId ?? null,
							saleDayId: original.sale_day_id ?? original.saleDay_id ?? original.sale_dayId ?? original.saleDayId ?? null,
							saleId: original.sale_id ?? original.saleId ?? null
						};
						localStorage.setItem('pendingFocus', JSON.stringify(payload));
					} catch {}
					try { window.open('/', '_blank', 'noopener'); } catch {}
				});
			}
			list.appendChild(item);
		}
		async function fetchInitial() {
			serverMode = true;
			list.innerHTML = '';
			seenIds = new Set();
			minLoadedId = null;
			try {
				let url = '/api/notifications?limit=50';
				if (sellerSelect && sellerSelect.value) url += `&seller_id=${encodeURIComponent(sellerSelect.value)}`;
				if (daySelect && daySelect.value) url += `&sale_day_id=${encodeURIComponent(daySelect.value)}`;
				const res = await fetch(url);
				if (!res.ok) throw new Error('bad');
				const data = await res.json();
				if (!Array.isArray(data) || data.length === 0) throw new Error('empty');
				for (const it of data) {
					appendItem({ id: Number(it.id), when: it.created_at || it.when, text: it.message || it.text, isServer: true, original: it });
				}
			} catch {
				serverMode = false;
				renderLocalList();
			}
		}
		async function loadMore() {
			if (!serverMode || !minLoadedId) { renderLocalList(); return; }
			try {
				let url = `/api/notifications?before_id=${encodeURIComponent(minLoadedId)}&limit=100`;
				if (sellerSelect && sellerSelect.value) url += `&seller_id=${encodeURIComponent(sellerSelect.value)}`;
				if (daySelect && daySelect.value) url += `&sale_day_id=${encodeURIComponent(daySelect.value)}`;
				const res = await fetch(url);
				if (!res.ok) return;
				const data = await res.json();
				if (!Array.isArray(data) || data.length === 0) return;
				for (const it of data) {
					appendItem({ id: Number(it.id), when: it.created_at || it.when, text: it.message || it.text, isServer: true, original: it });
				}
			} catch {}
		}
		body.append(toolbar, list);
		dlg.append(header, body);
		backdrop.appendChild(dlg);
		document.body.appendChild(backdrop);
		loadMoreBtn.addEventListener('click', () => { loadMore(); });
		fetchInitial();
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
		clearBtn.addEventListener('click', () => { writeLog([]); if (!serverMode) { renderLocalList(); } });
		permBtn.addEventListener('click', async () => {
			const res = await ensurePermission();
			if (res === 'granted') { render('success', 'Notificaciones activadas'); showBrowser('Sweet Lab', 'Notificaciones activadas'); }
			else if (res === 'denied') { render('error', 'Permiso de notificaciones denegado'); }
			else { render('info', 'Notificaciones no disponibles'); }
			const btn = document.getElementById('notif-toggle'); if (btn) { const ok = ('Notification' in window) && Notification.permission === 'granted'; btn.classList.toggle('enabled', !!ok); }
		});
	}
	function loading(message) {
		const c = container();
		if (!c) return { close: () => {} };
		const n = document.createElement('div');
		n.className = 'toast toast-loading';
		const spinner = document.createElement('span');
		spinner.className = 'toast-spinner';
		const msg = document.createElement('div');
		msg.className = 'toast-msg';
		msg.textContent = String(message || 'Cargando...');
		n.append(spinner, msg);
		c.appendChild(n);
		return {
			close: () => dismiss(n),
			update: (newMessage) => { msg.textContent = String(newMessage || 'Cargando...'); }
		};
	}
	return { info: (m,t)=>render('info',m,t), success: (m,t)=>render('success',m,t), error: (m,t)=>render('error',m,t), loading, showBrowser, ensurePermission, initToggle, openDialog };
})();

// Theme management
(function initTheme(){
	try {
		const saved = localStorage.getItem('theme');
		if (saved === 'dark') {
			document.documentElement.setAttribute('data-theme', 'dark');
		} else {
			document.documentElement.removeAttribute('data-theme');
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
	const u = String(user || '');
	if (u.toLowerCase() === 'jorge') return 'Jorge123';
	return (u + 'sweet').toLowerCase();
}

function isAdmin(user) {
	const u = String(user || '').toLowerCase();
	return u === 'jorge' || u === 'marcela' || u === 'aleja';
}

function getRole(user) {
	const u = String(user || '').toLowerCase();
	if (u === 'jorge') return 'superadmin';
	if (u === 'marcela' || u === 'aleja') return 'admin';
	return 'user';
}

function isSuperAdmin(user) {
	return getRole(user) === 'superadmin';
}

function bindLogin() {
	const btn = document.getElementById('login-btn');
	// Allow pressing Enter in user or password inputs to trigger login
	const userInput = document.getElementById('login-user');
	const passInput = document.getElementById('login-pass');
	function triggerLoginOnEnter(e) { if (e.key === 'Enter') { e.preventDefault(); btn?.click(); } }
	userInput?.addEventListener('keydown', triggerLoginOnEnter);
	passInput?.addEventListener('keydown', triggerLoginOnEnter);
	btn?.addEventListener('click', () => {
		const user = document.getElementById('login-user')?.value?.trim();
		const pass = document.getElementById('login-pass')?.value ?? '';
		const err = document.getElementById('login-error');
		if (!user) { if (err) { err.textContent = 'Ingresa el usuario'; err.classList.remove('hidden'); } return; }
		(async () => {
			try {
				const res = await api('POST', API.Users, { username: user, password: pass });
				if (err) err.classList.add('hidden');
				state.currentUser = { name: res.username, isAdmin: res.role === 'admin' || res.role === 'superadmin', role: res.role, isSuperAdmin: res.role === 'superadmin', features: Array.isArray(res.features) ? res.features : [] };
				try { localStorage.setItem('authUser', JSON.stringify(state.currentUser)); } catch {}
				applyAuthVisibility();
				await loadSellers();
				renderSellerButtons();
				const usernameLower = String(res.username || '').toLowerCase();
				const feminineUsers = new Set(['marcela', 'aleja', 'kate', 'stefa', 'mariana', 'janeth']);
				const welcome = feminineUsers.has(usernameLower) ? 'Bienvenida ' : 'Bienvenido ';
				notify.success(welcome + res.username);
				if (!state.currentUser.isAdmin) {
					const seller = (state.sellers || []).find(s => String(s.name).toLowerCase() === String(res.username).toLowerCase());
					if (seller) enterSeller(seller.id);
				} else {
					switchView('#view-select-seller');
				}
			} catch (e) {
				if (err) { err.textContent = 'Usuario o contraseña inválidos'; err.classList.remove('hidden'); }
			}
		})();
	});
	// Change password from login screen
	const changeBtn = document.getElementById('login-change-pass');
	changeBtn?.addEventListener('click', async () => {
		const user = (document.getElementById('login-user')?.value || '').toString().trim();
		if (!user) { const err = document.getElementById('login-error'); if (err) { err.textContent = 'Ingresa el usuario para cambiar la contraseña'; err.classList.remove('hidden'); } return; }
		const current = prompt('Contraseña actual:') ?? '';
		if (!current) return;
		const next = prompt('Nueva contraseña (mín 6 caracteres):') ?? '';
		if (!next) return;
		try {
			await api('PUT', API.Users, { username: user, currentPassword: current, newPassword: next });
			notify.success('Contraseña actualizada');
		} catch (e) {
			notify.error('No se pudo actualizar la contraseña');
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
    const actor = (state?.currentUser?.name || state?.currentUser?.username || '').toString();
    const res = await fetch(url, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(actor ? { 'X-Actor-Name': actor } : {})
        },
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
	// Update dynamic seller icon for current seller if available
	if (state.currentSeller) {
		const fresh = (state.sellers || []).find(s => s.id === state.currentSeller.id);
		if (fresh) {
			state.currentSeller = fresh;
			const letter = (fresh.name || '').trim().charAt(0).toUpperCase();
			// seller-specific icon removed
		}
	}
	renderSellerButtons();
	// Removed syncColumnsBarWidths();
	applyAuthVisibility();
	// Load global client suggestions for search bar in background (non-blocking)
	loadGlobalClientSuggestions().catch(e => console.error('Error loading global suggestions:', e));
}

// Load all clients the current user has permission to see (optimized)
async function loadGlobalClientSuggestions() {
	try {
		if (!state.currentUser) {
			state.globalClientSuggestions = [];
			return;
		}
		
		// Check if already loaded and still fresh (cache for 5 minutes)
		if (state._globalSuggestionsLoadedAt && (Date.now() - state._globalSuggestionsLoadedAt) < 300000) {
			return; // Use cached data
		}

		const isSuper = state.currentUser?.role === 'superadmin' || !!state.currentUser?.isSuperAdmin;
		const isAdmin = !!state.currentUser?.isAdmin;
		
		const counts = new Map();
		const namesByKey = new Map();
		
		// Determine which sellers to load clients from
		let sellersToLoad = [];
		
		if (isSuper || isAdmin) {
			// Admin/SuperAdmin: load from all sellers
			sellersToLoad = state.sellers || [];
		} else {
			// Regular user: load only their own clients
			sellersToLoad = (state.sellers || []).filter(s => 
				String(s.name).toLowerCase() === String(state.currentUser.name || '').toLowerCase()
			);
		}
		
		// Load clients from all authorized sellers IN PARALLEL
		const sellerPromises = sellersToLoad.map(async (seller) => {
			try {
				const days = await api('GET', `/api/days?seller_id=${encodeURIComponent(seller.id)}`);
				
				// Limit to last 180 days for faster loading (about 6 months)
				const recentDays = (days || []).slice(0, 180);
				
				// Load all sales for this seller in parallel
				const salesPromises = recentDays.map(async (d) => {
					const p = new URLSearchParams({ seller_id: String(seller.id), sale_day_id: String(d.id) });
					try { 
						return await api('GET', `${API.Sales}?${p.toString()}`); 
					} catch { 
						return []; 
					}
				});
				
				const salesArrays = await Promise.all(salesPromises);
				
				// Process all sales
				const sellerClients = new Map();
				const sellerNames = new Map();
				
				for (const sales of salesArrays) {
					for (const s of (sales || [])) {
						const raw = (s?.client_name || '').trim();
						if (!raw) continue;
						const key = normalizeClientName(raw);
						sellerClients.set(key, (sellerClients.get(key) || 0) + 1);
						if (!sellerNames.has(key)) sellerNames.set(key, raw);
					}
				}
				
				return { clients: sellerClients, names: sellerNames };
			} catch (e) {
				console.error('Error loading clients for seller:', seller.name, e);
				return { clients: new Map(), names: new Map() };
			}
		});
		
		// Wait for all sellers to complete
		const sellerResults = await Promise.all(sellerPromises);
		
		// Merge all results
		for (const result of sellerResults) {
			for (const [key, count] of result.clients) {
				counts.set(key, (counts.get(key) || 0) + count);
				if (!namesByKey.has(key)) namesByKey.set(key, result.names.get(key) || '');
			}
		}
		
		// Prepare suggestion list (all clients, including those with count = 1)
		const arr = Array.from(counts.entries())
			.map(([key, count]) => ({ key, name: namesByKey.get(key) || '', count: Number(count) || 0 }))
			.filter(it => it.name && it.name.trim() !== '');
		arr.sort((a, b) => {
			if (b.count !== a.count) return b.count - a.count;
			return (a.name || '').localeCompare(b.name || '', 'es');
		});
		
		state.globalClientSuggestions = arr;
		state._globalSuggestionsLoadedAt = Date.now(); // Cache timestamp
	} catch (e) {
		console.error('Error loading global client suggestions:', e);
		state.globalClientSuggestions = [];
	}
}

function renderSellerButtons() {
	const list = $('#seller-list');
	list.innerHTML = '';
    // Server already filters sellers by permissions. Render all returned.
    const isSuper = state.currentUser?.role === 'superadmin' || !!state.currentUser?.isSuperAdmin;
    for (const s of state.sellers) {
        const btn = el('button', { class: 'seller-button', onclick: async (ev) => {
            if (isSuper && state.deleteSellerMode) {
                ev.preventDefault();
                const ok = await openConfirmPopover(`¿Eliminar al vendedor "${s.name}"?`, ev.clientX, ev.clientY);
                if (!ok) return;
                try {
                    await api('DELETE', `${API.Sellers}?id=${encodeURIComponent(s.id)}`);
                    // Remove locally and re-render
                    state.sellers = state.sellers.filter(x => x.id !== s.id);
                    // Exit delete mode after successful deletion
                    state.deleteSellerMode = false;
                    notify.success('Vendedor eliminado');
                    renderSellerButtons();
                } catch (e) {
                    try { notify.error('No se pudo eliminar el vendedor'); } catch {}
                }
                return;
            }
            await enterSeller(s.id);
        } }, s.name);
        if (isSuper && state.deleteSellerMode) btn.classList.add('delete-mode');
        list.appendChild(btn);
    }
}

function exitDeleteSellerModeIfActive() {
    if (state.deleteSellerMode) {
        state.deleteSellerMode = false;
        renderSellerButtons();
    }
}

async function addSeller(name) {
	try {
		const seller = await api('POST', API.Sellers, { name, _actor_name: state.currentUser?.name || '' });
		state.sellers.push(seller);
		renderSellerButtons();
		notify.success('Vendedor agregado');
	} catch (err) {
		try {
			const msg = (err && err.message || '').includes('403') ? 'No autorizado para agregar vendedores' : 'No se pudo agregar el vendedor';
			notify.error(msg);
		} catch {}
	}
}

async function enterSeller(id) {
	const seller = state.sellers.find(s => s.id === id);
	if (!seller) return;
	state.currentSeller = seller;
	// Apply seller bill icon CSS var
	try {
		const letter = (seller.name || '').trim().charAt(0).toUpperCase();
		// seller-specific icon removed
	} catch {}
	state.saleDays = [];
	state.selectedDayId = null;
	state.clientCounts = new Map();
	$('#current-seller').textContent = seller.name;
	switchView('#view-sales');
	
	// Load desserts and render columns
	await loadDesserts();
	renderDessertColumns();
	
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
	// Close client action bar when switching views
	if (typeof closeClientActionBar === 'function') {
		closeClientActionBar();
	}
}

function applyAuthVisibility() {
	const isAdminUser = !!state.currentUser?.isAdmin;
	const isSuper = state.currentUser?.role === 'superadmin' || !!state.currentUser?.isSuperAdmin;
	const logoutBtn = document.getElementById('logout-btn');
	if (logoutBtn) logoutBtn.style.display = state.currentUser ? 'inline-flex' : 'none';
	const addSellerWrap = document.querySelector('.seller-add');
	if (addSellerWrap) addSellerWrap.style.display = isSuper ? 'grid' : 'none';
	const usersBtn = document.getElementById('users-button');
	const feats = new Set((state.currentUser?.features || []));
	const reportBtn = document.getElementById('report-button');
	const carteraBtn = document.getElementById('cartera-button');
	const projectionsBtn = document.getElementById('projections-button');
	const transfersBtn = document.getElementById('transfers-button');
	const materialsBtn = document.getElementById('materials-button');
	const inventoryBtn = document.getElementById('inventory-button');
	const accountingBtn = document.getElementById('accounting-button');
	const dessertsBtn = document.getElementById('desserts-button');
	const deliveriesBtn = document.getElementById('deliveries-button');
	const canSales = isSuper || feats.has('reports.sales');
	const canCartera = isSuper || feats.has('reports.cartera');
	const canProjections = isSuper || feats.has('reports.projections');
	const canTransfers = isSuper || feats.has('reports.transfers');
	const canMaterials = isSuper || feats.has('nav.materials');
	const canInventory = isSuper || feats.has('nav.inventory');
	const canUsers = isSuper || feats.has('nav.users');
	const canAccounting = isSuper || feats.has('nav.accounting');
	const canDesserts = isSuper || feats.has('nav.desserts');
	if (usersBtn) usersBtn.style.display = canUsers ? 'inline-block' : 'none';
	if (reportBtn) reportBtn.style.display = canSales ? 'inline-block' : 'none';
	if (carteraBtn) carteraBtn.style.display = canCartera ? 'inline-block' : 'none';
	if (projectionsBtn) projectionsBtn.style.display = canProjections ? 'inline-block' : 'none';
	if (transfersBtn) transfersBtn.style.display = canTransfers ? 'inline-block' : 'none';
	if (materialsBtn) materialsBtn.style.display = canMaterials ? 'inline-block' : 'none';
	if (inventoryBtn) inventoryBtn.style.display = canInventory ? 'inline-block' : 'none';
	if (accountingBtn) accountingBtn.style.display = canAccounting ? 'inline-block' : 'none';
	const canDeliveries = isSuper || isAdminUser;
	if (dessertsBtn) dessertsBtn.style.display = canDesserts ? 'inline-block' : 'none';
	if (deliveriesBtn) deliveriesBtn.style.display = canDeliveries ? 'inline-block' : 'none';
}

// Load desserts from API (runs once per session)
async function loadDesserts() {
	if (state.dessertsLoaded && state.desserts.length > 0) return state.desserts;
	try {
		state.desserts = await api('GET', API.Desserts);
		state.dessertsLoaded = true;
		// Update PRICES map
		for (const d of state.desserts) {
			PRICES[d.short_code] = d.sale_price;
		}
		return state.desserts;
	} catch (err) {
		console.error('Error loading desserts:', err);
		// Fallback to defaults
		state.desserts = [
			{ id: 1, name: 'Arco', short_code: 'arco', sale_price: 8500, position: 1 },
			{ id: 2, name: 'Melo', short_code: 'melo', sale_price: 9500, position: 2 },
			{ id: 3, name: 'Mara', short_code: 'mara', sale_price: 10500, position: 3 },
			{ id: 4, name: 'Oreo', short_code: 'oreo', sale_price: 10500, position: 4 },
			{ id: 5, name: 'Nute', short_code: 'nute', sale_price: 13000, position: 5 }
		];
		state.dessertsLoaded = true;
		return state.desserts;
	}
}

// Render dynamic dessert columns in table header
function renderDessertColumns() {
	const headerRow = document.getElementById('sales-table-header');
	const colgroup = document.getElementById('sales-table-colgroup');
	if (!headerRow || !colgroup) return;
	
	// Remove existing dessert columns from header
	const existingDesserts = headerRow.querySelectorAll('th.col-dessert');
	existingDesserts.forEach(th => th.remove());
	
	// Remove existing dessert cols from colgroup
	const existingCols = colgroup.querySelectorAll('col.w-qty');
	existingCols.forEach(col => col.remove());
	
	// Insert new cols in colgroup before w-total
	const totalCol = colgroup.querySelector('col.w-total');
	if (totalCol) {
		for (const d of state.desserts) {
			const col = document.createElement('col');
			col.className = 'w-qty';
			colgroup.insertBefore(col, totalCol);
		}
	}
	
	// Insert new th columns before col-total
	const totalTh = headerRow.querySelector('th.col-total');
	if (totalTh) {
		for (const d of state.desserts) {
			const th = document.createElement('th');
			th.className = `col-dessert col-${d.short_code}`;
			th.dataset.label = d.name;
			th.dataset.shortCode = d.short_code;
			const span = document.createElement('span');
			span.className = 'v-label';
			span.textContent = d.name;
			th.appendChild(span);
			headerRow.insertBefore(th, totalTh);
		}
	}
	
	// Also update footer rows
	renderFooterDessertColumns();
}

function renderFooterDessertColumns() {
	const qtyRow = document.getElementById('footer-qty-row');
	const amtRow = document.getElementById('footer-amt-row');
	const delivRow = document.getElementById('footer-delivered-row');
	const commRow = document.getElementById('footer-comm-row');
	
	if (!qtyRow || !amtRow) return;
	
	// Remove existing dessert columns from footer
	[qtyRow, amtRow, delivRow, commRow].forEach(row => {
		if (!row) return;
		const existing = row.querySelectorAll('td.col-dessert');
		existing.forEach(td => td.remove());
	});
	
	// Insert new columns before col-total
	for (const d of state.desserts) {
		// Qty row
		if (qtyRow) {
			const totalTd = qtyRow.querySelector('td.col-total');
			const td = document.createElement('td');
			td.className = `col-dessert col-${d.short_code}`;
			const span = document.createElement('span');
			span.id = `sum-${d.short_code}-qty`;
			span.textContent = '0';
			td.appendChild(span);
			if (totalTd) qtyRow.insertBefore(td, totalTd);
		}
		
		// Amt row
		if (amtRow) {
			const totalTd = amtRow.querySelector('td.col-total');
			const td = document.createElement('td');
			td.className = `col-dessert col-${d.short_code}`;
			const span = document.createElement('span');
			span.id = `sum-${d.short_code}-amt`;
			span.textContent = '0';
			td.appendChild(span);
			if (totalTd) amtRow.insertBefore(td, totalTd);
		}
		
		// Delivered row
		if (delivRow) {
			const totalTd = delivRow.querySelector('td.col-total');
			const td = document.createElement('td');
			td.className = `col-dessert col-${d.short_code}`;
			const span = document.createElement('span');
			span.id = `deliv-${d.short_code}`;
			span.style.outline = 'none';
			span.textContent = '0';
			td.appendChild(span);
			if (totalTd) delivRow.insertBefore(td, totalTd);
		}
		
		// Comm row (empty cells)
		if (commRow) {
			const totalTd = commRow.querySelector('td.col-total');
			const td = document.createElement('td');
			td.className = `col-dessert col-${d.short_code}`;
			if (totalTd) commRow.insertBefore(td, totalTd);
		}
	}
	
	// Add stacked summary rows
	const footer = document.getElementById('sales-table-footer');
	if (footer) {
		// Remove existing stacked rows
		const existing = footer.querySelectorAll('tr.tfoot-amt-stack:not(.t-am-grand)');
		existing.forEach(tr => tr.remove());
		
		// Add stacked row for each dessert
		for (const d of state.desserts) {
			const tr = document.createElement('tr');
			tr.className = `tfoot-amt-stack t-am-${d.short_code}`;
			const td1 = document.createElement('td');
			td1.className = 'col-paid';
			const td2 = document.createElement('td');
			td2.className = 'col-client';
			td2.colSpan = 8;
			td2.innerHTML = `<span class="st-name">${d.name}</span> <span class="st-qty" id="sum-${d.short_code}-qty-2"></span> <span class="st-amt" id="sum-${d.short_code}-amt-2"></span>`;
			const td3 = document.createElement('td');
			td3.className = 'col-actions';
			tr.append(td1, td2, td3);
			footer.appendChild(tr);
		}
	}
}

function calcRowTotal(q) {
	// Support both old format and new dynamic format
	let total = 0;
	
	// If using items array (new format) - only if array has elements
	if (Array.isArray(q.items) && q.items.length > 0) {
		// Use only the first occurrence per dessert (to match visible per-flavor qty)
		const seen = new Set();
		for (const item of q.items) {
			const code = (item.short_code || '').toString() || (state.desserts.find(d => d.id === item.dessert_id)?.short_code || '');
			const key = code || `id:${item.dessert_id}`;
			if (seen.has(key)) continue;
			seen.add(key);
			const qty = Number(item.quantity || 0) || 0;
			let price = Number(item.unit_price || 0) || 0;
			if (!price && code && PRICES[code] != null) price = Number(PRICES[code] || 0) || 0;
			total += qty * price;
		}
		return total;
	}
	
	// Fallback to old format with dynamic desserts (check qty_* properties)
	for (const d of state.desserts) {
		const qty = Number(q[`qty_${d.short_code}`] || 0);
		const price = Number(PRICES[d.short_code] || 0);
		total += qty * price;
	}
	
	return total;
}

// Build compact sale summary: "Cliente + 2 arco + 1 melo"
function formatSaleSummary(sale) {
	if (!sale) return '';
	const name = (sale.client_name || '').trim() || 'Cliente';
	const parts = [];
	
	// Support new items format (only if array has elements)
	if (Array.isArray(sale.items) && sale.items.length > 0) {
		for (const item of sale.items) {
			const qty = Number(item.quantity || 0);
			if (qty > 0) {
				parts.push(`${qty} ${item.short_code || item.name}`);
			}
		}
	} else {
		// Fallback to old format - check all desserts dynamically
		for (const d of state.desserts) {
			const qty = Number(sale[`qty_${d.short_code}`] || 0);
			if (qty > 0) {
				parts.push(`${qty} ${d.short_code}`);
			}
		}
	}
	
	const suffix = parts.length ? (' + ' + parts.join(' + ')) : '';
	return name + suffix;
}

// Helper to create dessert qty cell for a sale row
function createDessertQtyCell(sale, dessert, tr) {
	const td = document.createElement('td');
	td.className = `col-dessert col-${dessert.short_code}`;
	const input = document.createElement('input');
	input.className = 'input-cell input-qty';
	input.type = 'number';
	input.min = '0';
	input.step = '1';
	input.inputMode = 'numeric';
	input.dataset.dessertId = dessert.id;
	input.dataset.shortCode = dessert.short_code;
	
	// Get quantity from sale - support both formats
	let qty = 0;
	if (Array.isArray(sale.items) && sale.items.length > 0) {
		const item = sale.items.find(i => i.dessert_id === dessert.id || i.short_code === dessert.short_code);
		qty = item ? Number(item.quantity || 0) : 0;
	} else {
		qty = Number(sale[`qty_${dessert.short_code}`] || 0);
	}
	
	input.value = qty > 0 ? String(qty) : '';
	input.placeholder = '';
	input.readOnly = true; // Make readonly - only editable via edit button
	input.style.cursor = 'pointer';
	// Show action bar on click
	input.addEventListener('click', (e) => {
		e.stopPropagation();
		const clientTd = tr.querySelector('.col-client');
		const clientInput = tr.querySelector('.col-client .client-input');
		const clientName = clientInput?.value || '';
		if (clientTd) {
			openClientActionBar(clientTd, sale.id, clientName, e.clientX, e.clientY);
		}
	});
	
	td.appendChild(input);
	return td;
}

function renderTable() {
	// Close any open client action bar before re-rendering (skip fade since we'll handle it after re-render if needed)
	if (typeof closeClientActionBar === 'function') {
		closeClientActionBar(true); // Skip fade on re-render
	}
	const tbody = $('#sales-tbody');
	// Update caption with selected date label
	try {
		const cap = document.getElementById('sales-caption');
		if (cap) {
			const strong = cap.querySelector('strong') || document.createElement('strong');
			let label = '';
			if (state && Array.isArray(state.saleDays) && state.selectedDayId) {
				const day = (state.saleDays || []).find(d => d && d.id === state.selectedDayId);
				if (day && day.day) label = formatDayLabel(String(day.day).slice(0,10));
			}
			strong.textContent = label || '';
			if (!cap.contains(strong)) cap.appendChild(strong);
		}
	} catch {}
	tbody.innerHTML = '';
	for (const sale of state.sales) {
		const total = calcRowTotal(sale);
		const isPaid = !!sale.is_paid;
		const tr = el('tr', { 'data-sale-id': sale.id },
			el('td', { class: 'col-paid' }, (function(){
				const wrap = document.createElement('span');
				wrap.className = 'pay-wrap';
				const sel = document.createElement('select');
				sel.className = 'input-cell pay-select';
				const current = (sale.pay_method || '').replace(/\.$/, '');
				const options = [
					{ v: '', label: '-' },
					{ v: 'efectivo', label: '' },
					{ v: 'entregado', label: '' }
				];
				const isMarcela = String(state.currentUser?.name || '').toLowerCase() === 'marcela';
				if (isMarcela) options.push({ v: 'marce', label: '' });
				// If current value is 'marce' but user is not Marcela, include it disabled so it displays
				if (!isMarcela && current === 'marce') options.push({ v: 'marce', label: '' });
				const isJorge = String(state.currentUser?.name || '').toLowerCase() === 'jorge';
				if (isJorge) options.push({ v: 'jorge', label: '' });
				// If current value is 'jorge' but user is not Jorge, include it disabled so it displays
				if (!isJorge && current === 'jorge') options.push({ v: 'jorge', label: '' });
				options.push({ v: 'transf', label: '' });
				// jorgebank only shown when ALL receipts are verified (set by enrichSalesWithReceiptStatus)
				if (current === 'jorgebank') options.push({ v: 'jorgebank', label: '' });
				for (const o of options) {
					const opt = document.createElement('option');
					opt.value = o.v;
					opt.textContent = o.label;
					if (!isMarcela && o.v === 'marce') opt.disabled = true;
					if (!isJorge && o.v === 'jorge') opt.disabled = true;
					// jorgebank is disabled - read-only indicator
					if (o.v === 'jorgebank') opt.disabled = true;
					if (current === o.v) opt.selected = true;
					sel.appendChild(opt);
				}
                // Lock editing for non-admins once a method is chosen, except when it's 'entregado'
                const isAdminUser = !!state.currentUser?.isAdmin || state.currentUser?.role === 'superadmin';
                const pmNormalized = String(current || '').trim().toLowerCase();
                const shouldLock = pmNormalized !== '' && pmNormalized !== 'entregado';
                if (!isAdminUser && shouldLock) {
                    sel.disabled = true;
                    wrap.classList.add('locked');
                }
				function applyPayClass() {
					wrap.classList.remove('placeholder','method-efectivo','method-transf','method-marce','method-jorge','method-jorgebank','method-entregado');
					const val = sel.value;
					if (!val) wrap.classList.add('placeholder');
					else if (val === 'efectivo') wrap.classList.add('method-efectivo');
					else if (val === 'entregado') wrap.classList.add('method-entregado');
					else if (val === 'transf') wrap.classList.add('method-transf');
					else if (val === 'marce') wrap.classList.add('method-marce');
					else if (val === 'jorge') wrap.classList.add('method-jorge');
					else if (val === 'jorgebank') wrap.classList.add('method-jorgebank');
				}
				applyPayClass();
				sel.addEventListener('change', async () => {
					await savePayMethod(tr, sale.id, sel.value);
					try {
						const val = (sel.value || '').toString();
						const fmt = (v) => v === 'efectivo' ? 'Efectivo' : v === 'entregado' ? 'Entregado' : (v === 'transf' || v === 'jorgebank') ? 'Transferencia' : v === 'marce' ? 'Marce' : v === 'jorge' ? 'Jorge' : '-';
						const client = (tr.querySelector('td.col-client input')?.value || '').trim() || 'Cliente';
						const seller = String((state?.currentSeller?.name || state?.currentUser?.name || '') || '');
						const msg = `${client} pago: ${fmt(val)}` + (seller ? ` - ${seller}` : '');
						notify.info(msg);
					} catch {}
					applyPayClass();
				});
            wrap.addEventListener('click', async (e) => { 
                e.stopPropagation(); 
                const isAdminUser = !!state.currentUser?.isAdmin || state.currentUser?.role === 'superadmin';
                const pm = String(sale.pay_method || '').trim().replace(/\.$/, '').toLowerCase();
                const locked = pm !== '' && pm !== 'entregado';
                
                // If jorgebank (all receipts verified), open gallery for everyone
                if (pm === 'jorgebank') {
                    const rect = wrap.getBoundingClientRect();
                    openReceiptsGalleryPopover(sale.id, rect.left + rect.width / 2, rect.bottom);
                    return;
                }
                
                // If locked and current is transf, open receipt gallery for non-admins
                if (!isAdminUser && locked && pm === 'transf') {
                    const rect = wrap.getBoundingClientRect();
                    openReceiptsGalleryPopover(sale.id, rect.left + rect.width / 2, rect.bottom);
                    return;
                }
                if (!isAdminUser && locked) return; // block opening menu for non-admins, allow when 'entregado'
                openPayMenu(wrap, sel, e.clientX, e.clientY); 
            });
				wrap.tabIndex = 0;
            wrap.addEventListener('keydown', async (e) => { 
                if (e.key === 'Enter' || e.key === ' ') { 
                    e.preventDefault(); 
                    const isAdminUser = !!state.currentUser?.isAdmin || state.currentUser?.role === 'superadmin';
                    const pm = String(sale.pay_method || '').trim().replace(/\.$/, '').toLowerCase();
                    const locked = pm !== '' && pm !== 'entregado';
                    
                    // If jorgebank (all receipts verified), open gallery
                    if (pm === 'jorgebank') {
                        try {
                            const rect = wrap.getBoundingClientRect();
                            openReceiptsGalleryPopover(sale.id, rect.left + rect.width / 2, rect.bottom);
                        } catch { openReceiptUploadPage(sale.id); }
                        return;
                    }
                    
                    if (!isAdminUser && locked && pm === 'transf') {
                        try {
                            const rect = wrap.getBoundingClientRect();
                            openReceiptsGalleryPopover(sale.id, rect.left + rect.width / 2, rect.bottom);
                        } catch { openReceiptUploadPage(sale.id); }
                        return;
                    }
                    if (!isAdminUser && locked) return; 
                    openPayMenu(wrap, sel); 
                } 
            });
				wrap.appendChild(sel);
				return wrap;
			})()),
			(function(){
				const td = document.createElement('td');
				td.className = 'col-client';
				const input = document.createElement('input');
				input.className = 'input-cell client-input';
				input.value = sale.client_name || '';
				input.placeholder = '';
				input.readOnly = true; // Make readonly - only editable via edit button
				// Lock edit action for non-admins if pay_method chosen
				const isAdminUser = !!state.currentUser?.isAdmin || state.currentUser?.role === 'superadmin';
				const saleLocked = String(sale.pay_method || '').trim() !== '';
				if (!isAdminUser && saleLocked) {
					input.style.cursor = 'default';
					input.title = 'Pedido bloqueado';
				} else {
					input.style.cursor = 'pointer';
				}
				// Add click listener to show action bar
				input.addEventListener('click', (e) => {
					e.stopPropagation();
					const currentName = input.value || '';
					openClientActionBar(td, sale.id, currentName, e.clientX, e.clientY);
				});
				td.appendChild(input);
				const name = (sale.client_name || '').trim();
				if (name) {
					const key = normalizeClientName(name);
					const count = (state.clientCounts && typeof state.clientCounts.get === 'function') ? (state.clientCounts.get(key) || 0) : 0;
					if (count > 1) {
						td.classList.add('has-reg');
						const reg = document.createElement('span');
						reg.className = 'client-reg-large';
						reg.textContent = '®';
						reg.title = 'Cliente recurrente';
						reg.addEventListener('click', async (ev) => { ev.stopPropagation(); await openClientDetailView(name); });
						td.appendChild(reg);
					}
				}
				// Add comment marker if comment exists
				if (sale.comment_text && sale.comment_text.trim()) {
					td.classList.add('has-comment');
					const commentMarker = document.createElement('span');
					commentMarker.className = 'comment-marker';
					commentMarker.textContent = '💬';
					commentMarker.title = 'Ver/editar comentario';
					commentMarker.addEventListener('click', async (ev) => {
						ev.stopPropagation();
						await openCommentDialog(input, sale.comment_text, ev.clientX, ev.clientY, sale.id);
						// After closing (click outside), check if we need to update marker
						const updatedSale = state.sales.find(s => s.id === sale.id);
						if (updatedSale && !updatedSale.comment_text?.trim()) {
							// Remove marker if comment was deleted
							commentMarker.remove();
							td.classList.remove('has-comment');
						}
					});
					td.appendChild(commentMarker);
					// Position comment marker dynamically based on text width
					updateCommentMarkerPosition(input, commentMarker);
					// Update position on input changes
					input.addEventListener('input', () => updateCommentMarkerPosition(input, commentMarker));
					input.addEventListener('blur', () => updateCommentMarkerPosition(input, commentMarker));
				}
				return td;
			})()
		);
		
		// Add dynamic dessert columns
		for (const dessert of state.desserts) {
			const dessertCell = createDessertQtyCell(sale, dessert, tr);
			tr.appendChild(dessertCell);
		}
		
		// Continue with total and actions columns
		tr.appendChild(el('td', { class: 'total col-total' }, fmtNo.format(total)));
		tr.appendChild(el('td', { class: 'col-actions' }, (function(){
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
		})()));
		
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
	btn.textContent = 'Nuevo pedido';
    btn.addEventListener('click', (ev) => {
        const rect = ev.currentTarget.getBoundingClientRect();
        openNewSalePopover(rect.left + rect.width / 2, rect.top - 8);
    });
	td.appendChild(btn);
	addTr.appendChild(td);
	tbody.appendChild(addTr);

	updateSummary();
    // Keep bottom add button present so both triggers work
	preloadChangeLogsForCurrentTable();
}

// Update main selector to jorgebank in real-time if all receipts are verified
async function checkAndUpdateMainSelectorToJorgebank(saleId) {
	try {
		// Fetch all receipts for this sale
		const receipts = await api('GET', `${API.Sales}?receipt_for=${encodeURIComponent(saleId)}`);
		
		if (!Array.isArray(receipts) || receipts.length === 0) return;
		
		// Check if ALL receipts have jorgebank
		const allJorgebank = receipts.every(r => (r.pay_method || '').trim().toLowerCase() === 'jorgebank');
		
		if (allJorgebank) {
			// Find the sale in state.sales
			const sale = state.sales?.find(s => Number(s.id) === Number(saleId));
			if (sale) {
				// Update local state
				sale.pay_method = 'jorgebank';
				console.log(`🔄 Real-time update: Sale ${saleId} -> jorgebank (all ${receipts.length} receipts verified)`);
				
				// Update the selector in the DOM
				const row = document.querySelector(`tr[data-sale-id="${saleId}"]`);
				if (row) {
					const selector = row.querySelector('.col-paid select');
					if (selector) {
						// Add jorgebank option if not present
						if (!selector.querySelector('option[value="jorgebank"]')) {
							const opt = document.createElement('option');
							opt.value = 'jorgebank';
							opt.textContent = '';
							opt.disabled = true; // Read-only indicator
							selector.appendChild(opt);
						}
						selector.value = 'jorgebank';
						
						// Update visual class
						const wrap = selector.closest('.pay-wrap');
						if (wrap) {
							wrap.classList.remove('placeholder', 'method-efectivo', 'method-transf', 'method-marce', 'method-jorge', 'method-entregado');
							wrap.classList.add('method-jorgebank');
						}
					}
				}
			}
		}
	} catch (err) {
		console.error('Error checking receipts for real-time update:', err);
	}
}

// Check receipts for each sale and update main selector to jorgebank if all receipts are verified
async function enrichSalesWithReceiptStatus() {
	if (!Array.isArray(state.sales) || state.sales.length === 0) return;
	
	console.log('📸 Checking receipt status for all sales...');
	
	// Check each sale
	for (const sale of state.sales) {
		if (!sale || !sale.id) continue;
		
		try {
			// Fetch all receipts for this sale
			const receipts = await api('GET', `${API.Sales}?receipt_for=${encodeURIComponent(sale.id)}`);
			
			if (!Array.isArray(receipts) || receipts.length === 0) continue;
			
			// Check if ALL receipts have jorgebank
			const allJorgebank = receipts.every(r => (r.pay_method || '').trim().toLowerCase() === 'jorgebank');
			
			if (allJorgebank) {
				// Update local state
				sale.pay_method = 'jorgebank';
				console.log(`✅ Sale ${sale.id} -> jorgebank (all ${receipts.length} receipts verified)`);
			}
		} catch (err) {
			console.error(`Error checking receipts for sale ${sale.id}:`, err);
		}
	}
	
	console.log('📸 Receipt status enrichment complete');
}

async function loadSales() {
	// Show loading indicator with dynamic messages
	const loadingEl = document.getElementById('sales-loading');
	const loadingTextEl = document.getElementById('sales-loading-text');
	
	// Messages that will rotate
	const messages = [
		'Cargando ventas...',
		'Buscando pedidos...',
		'Preparando la tabla...',
		'Ya casi está...'
	];
	let messageIndex = 0;
	let messageInterval = null;
	
	if (loadingEl) {
		loadingEl.classList.remove('hidden');
		
		// Change message every 1.5 seconds
		messageInterval = setInterval(() => {
			messageIndex = (messageIndex + 1) % messages.length;
			if (loadingTextEl) loadingTextEl.textContent = messages[messageIndex];
		}, 1500);
	}
	
	try {
		const sellerId = state.currentSeller.id;
		const params = new URLSearchParams({ seller_id: String(sellerId) });
		if (state.selectedDayId) params.set('sale_day_id', String(state.selectedDayId));
		
		if (loadingTextEl) loadingTextEl.textContent = messages[0];
		state.sales = await api('GET', `${API.Sales}?${params.toString()}`);
		
		// Initialize _paymentInfo from database fields (payment_date and payment_source)
		if (Array.isArray(state.sales)) {
			for (const sale of state.sales) {
				if (sale && sale.payment_date && sale.payment_source) {
					sale._paymentInfo = {
						date: sale.payment_date,
						source: sale.payment_source,
						sourceValue: (sale.payment_source || '').toLowerCase()
					};
				}
			}
		}
		
		// Check if all receipts for each sale have jorgebank - if so, update sale.pay_method
		if (loadingTextEl) loadingTextEl.textContent = 'Verificando pagos...';
		await enrichSalesWithReceiptStatus();
		
		// Build recurrence counts across all dates for this seller
		if (loadingTextEl) loadingTextEl.textContent = 'Procesando clientes...';
		try {
			const days = await api('GET', `/api/days?seller_id=${encodeURIComponent(sellerId)}`);
			const counts = new Map();
			const namesByKey = new Map();
			for (const d of (days || [])) {
				const p = new URLSearchParams({ seller_id: String(sellerId), sale_day_id: String(d.id) });
				let sales = [];
				try { sales = await api('GET', `${API.Sales}?${p.toString()}`); } catch { sales = []; }
				for (const s of (sales || [])) {
					const raw = (s?.client_name || '').trim();
					if (!raw) continue;
					const key = normalizeClientName(raw);
					counts.set(key, (counts.get(key) || 0) + 1);
					if (!namesByKey.has(key)) namesByKey.set(key, raw);
				}
			}
			state.clientCounts = counts;
			// Prepare suggestion list of regular clients (count > 1)
			try {
				const arr = Array.from(counts.entries())
					.filter(([, count]) => Number(count) > 1)
					.map(([key, count]) => ({ key, name: namesByKey.get(key) || '', count: Number(count) || 0 }))
					.filter(it => it.name && it.name.trim() !== '');
				arr.sort((a, b) => {
					if (b.count !== a.count) return b.count - a.count;
					return (a.name || '').localeCompare(b.name || '', 'es');
				});
				state.clientSuggestions = arr;
			} catch { state.clientSuggestions = []; }
		} catch { state.clientCounts = new Map(); }
		
		// Ensure desserts are loaded before rendering table
		if (loadingTextEl) loadingTextEl.textContent = 'Preparando la tabla...';
		await loadDesserts();
		renderDessertColumns();
		
		renderTable();
		preloadChangeLogsForCurrentTable();
	} catch (error) {
		console.error('Error loading sales:', error);
		if (loadingTextEl) loadingTextEl.textContent = 'Error al cargar';
		throw error; // Re-throw to maintain error handling
	} finally {
		// Clear interval and hide loading indicator immediately
		if (messageInterval) clearInterval(messageInterval);
		if (loadingEl) loadingEl.classList.add('hidden');
	}
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

// Superadmin-only editors for delivered counts per day (inline editable)
function wireDeliveredRowEditors() {
    const isSuper = state?.currentUser?.role === 'superadmin' || !!state?.currentUser?.isSuperAdmin;
    const cells = [
        { key: 'arco', el: document.getElementById('deliv-arco') },
        { key: 'melo', el: document.getElementById('deliv-melo') },
        { key: 'mara', el: document.getElementById('deliv-mara') },
        { key: 'oreo', el: document.getElementById('deliv-oreo') },
        { key: 'nute', el: document.getElementById('deliv-nute') },
    ];
	function selectAllContent(el) {
		try {
			const range = document.createRange();
			range.selectNodeContents(el);
			const sel = window.getSelection();
			sel.removeAllRanges();
			sel.addRange(range);
		} catch {}
	}
    for (const item of cells) {
        const el = item.el;
        if (!el) continue;
        // Toggle contenteditable based on role
        if (isSuper) {
            if (!el.isContentEditable) el.setAttribute('contenteditable', 'true');
            el.style.cursor = 'text';
            el.title = 'Editar cantidad entregada';
        } else {
            if (el.isContentEditable) el.removeAttribute('contenteditable');
            el.style.cursor = 'default';
            el.title = '';
        }
        if (el.dataset.bound === '1') continue;
        el.dataset.bound = '1';
		// Al enfocar/clic, seleccionar todo para reemplazar con la nueva cifra
		el.addEventListener('focus', () => { selectAllContent(el); });
		el.addEventListener('mouseup', (ev) => { ev.preventDefault(); selectAllContent(el); });
		el.addEventListener('click', () => { selectAllContent(el); });
        // Sanitize input to numbers only while typing
        el.addEventListener('input', () => {
            if (!el.isContentEditable) return;
            let raw = (el.textContent || '').replace(/[^0-9]/g, '');
            // Remove leading zeros
            raw = raw.replace(/^0+(\d)/, '$1');
            el.textContent = raw;
        });
        // Save on Enter or blur
        el.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') { ev.preventDefault(); el.blur(); }
        });
        el.addEventListener('blur', async () => {
            if (!isSuper) return;
            const dayId = state?.selectedDayId || null;
            if (!dayId) { try { notify.error('Selecciona una fecha'); } catch {} return; }
            const flavor = item.key;
            const value = Math.max(0, parseInt((el.textContent || '0').trim(), 10) || 0);
            const payload = { id: dayId, actor_name: state.currentUser?.name || '' };
            payload[`delivered_${flavor}`] = value;
            try {
                const updated = await api('PUT', '/api/days', payload);
                const idx = (state.saleDays || []).findIndex(d => d && d.id === dayId);
                if (idx !== -1) state.saleDays[idx] = updated;
                updateSummary();
            } catch (e) {
                try { notify.error('No se pudo guardar'); } catch {}
            }
        });
    }
}

// New order popover: allow entering client and quantities before creating the row
function attachClientSuggestionsPopover(inputEl) {
    try {
        let pop = null;
        let visible = false;
        function buildList(queryRaw) {
            const list = Array.isArray(state.clientSuggestions) ? state.clientSuggestions : [];
            const q = normalizeClientName(queryRaw || '');
            if (!q) return [];
            const out = [];
            for (const it of list) {
                const key = String(it.key || '');
                if (key.startsWith(q)) out.push(it);
                if (out.length >= 10) break;
            }
            return out;
        }
        function ensurePop() {
            if (pop) return pop;
            pop = document.createElement('div');
            pop.className = 'client-suggest-popover';
            pop.style.position = 'fixed';
            pop.style.zIndex = '1001';
            document.body.appendChild(pop);
            return pop;
        }
    function positionPop() {
            if (!pop) return;
            const rect = inputEl.getBoundingClientRect();
        const cs = getComputedStyle(inputEl);
        const padL = parseFloat(cs.paddingLeft) || 0;
        const padR = parseFloat(cs.paddingRight) || 0;
        pop.style.left = (rect.left + padL) + 'px';
        pop.style.top = (rect.bottom + 2) + 'px';
        const w = Math.max(120, rect.width - padL - padR);
        pop.style.width = w + 'px';
        }
        function closePop() {
            visible = false;
            if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
            pop = null;
            document.removeEventListener('mousedown', handleOutside, true);
            window.removeEventListener('resize', positionPop);
            window.removeEventListener('scroll', positionPop, true);
        }
        function handleOutside(ev) { if (pop && !pop.contains(ev.target) && ev.target !== inputEl) closePop(); }
        function render(query) {
            const data = buildList(query);
            if (!data || data.length === 0) { closePop(); return; }
            ensurePop();
            pop.innerHTML = '';
            for (const it of data) {
                const row = document.createElement('div');
                row.className = 'client-suggest-item';
                row.textContent = String(it.name || '');
                row.addEventListener('mousedown', (ev) => { ev.preventDefault(); ev.stopPropagation(); });
                row.addEventListener('click', (ev) => {
                    ev.preventDefault(); ev.stopPropagation();
                    inputEl.value = String(it.name || '');
                    inputEl.dispatchEvent(new Event('input'));
                    inputEl.focus();
                    // Close suggestions after selecting
                    closePop();
                });
                pop.appendChild(row);
            }
            positionPop();
            if (!visible) {
                visible = true;
                setTimeout(() => { document.addEventListener('mousedown', handleOutside, true); }, 0);
                window.addEventListener('resize', positionPop);
                window.addEventListener('scroll', positionPop, true);
            }
        }
        inputEl.addEventListener('focus', () => { /* do not open on focus alone */ });
        inputEl.addEventListener('input', () => { render(inputEl.value || ''); });
        inputEl.addEventListener('blur', () => { setTimeout(closePop, 120); });
    } catch {}
}

function openNewSalePopover(anchorX, anchorY) {
    try {
        const pop = document.createElement('div');
        pop.className = 'new-sale-popover';
        pop.style.position = 'fixed';
        const isSmall = window.matchMedia('(max-width: 640px)').matches;
        if (typeof anchorX === 'number' && typeof anchorY === 'number' && !isSmall) {
            pop.style.left = anchorX + 'px';
            pop.style.top = anchorY + 'px';
            pop.style.transform = 'translate(-50%, 0)';
        } else {
            pop.style.left = '50%';
            pop.style.top = '20%';
            pop.style.transform = 'translate(-50%, 0)';
        }

        const title = document.createElement('h4');
        title.textContent = 'Nuevo pedido';
        title.style.margin = '0 0 8px 0';

        const grid = document.createElement('div');
        grid.className = 'new-sale-grid';

        function appendRow(labelText, inputEl) {
            const left = document.createElement('div'); left.className = 'new-sale-cell new-sale-left';
            const right = document.createElement('div'); right.className = 'new-sale-cell new-sale-right';
            const lbl = document.createElement('div'); lbl.className = 'new-sale-label-text'; lbl.textContent = labelText;
            left.appendChild(lbl);
            right.appendChild(inputEl);
            // Make whole right cell focus the input when clicked
            right.addEventListener('mousedown', (ev) => {
                if (ev.target !== inputEl) { ev.preventDefault(); try { inputEl.focus(); inputEl.select(); } catch {} }
            });
            right.addEventListener('click', (ev) => {
                if (ev.target !== inputEl) { ev.preventDefault(); try { inputEl.focus(); inputEl.select(); } catch {} }
            });
            grid.appendChild(left);
            grid.appendChild(right);
        }

        // Client row
        const clientInput = document.createElement('input');
        clientInput.type = 'text';
        clientInput.placeholder = 'Nombre del cliente';
        clientInput.className = 'input-cell client-input';
        clientInput.autocomplete = 'off';
        // Custom inline suggestions below the first character (left-aligned)
        attachClientSuggestionsPopover(clientInput);
        appendRow('Cliente', clientInput);

        // Dessert rows (dynamic from state.desserts)
        const qtyInputs = {};
        for (const d of state.desserts) {
            const input = document.createElement('input');
            input.type = 'number';
            input.min = '0';
            input.step = '1';
            input.inputMode = 'numeric';
            input.placeholder = '0';
            input.className = 'input-cell input-qty';
            input.dataset.dessertId = d.id;
            qtyInputs[d.short_code] = input;
            appendRow(d.name, input);
        }

        const actions = document.createElement('div');
        actions.className = 'confirm-actions';
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'press-btn';
        cancelBtn.textContent = 'Cancelar';
        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'press-btn btn-primary';
        saveBtn.textContent = 'Guardar';
        actions.append(cancelBtn, saveBtn);

        pop.append(title, grid, actions);
        // Prepare hidden mount to avoid visible jump before clamping
        pop.style.visibility = 'hidden';
        pop.style.opacity = '0';
        pop.style.transition = 'opacity 160ms ease-out';
        document.body.appendChild(pop);

        // Clamp within viewport so the popover is fully visible
        function clampWithinViewport() {
            try {
                const margin = 8;
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const r = pop.getBoundingClientRect();
                const baseX = (typeof anchorX === 'number') ? anchorX : (vw / 2);
                const baseY = (typeof anchorY === 'number') ? anchorY : (vh / 2);
                let left = Math.round(baseX - r.width / 2);
                let topBelow = Math.round(baseY + 8);
                let topAbove = Math.round(baseY - 8 - r.height);
                let top = topBelow;
                if (top + r.height > vh - margin) {
                    // Prefer above if below overflows
                    top = topAbove;
                }
                // If still overflows, clamp to margins
                if (top < margin) top = margin;
                if (top + r.height > vh - margin) top = Math.max(margin, vh - margin - r.height);
                if (left < margin) left = margin;
                if (left + r.width > vw - margin) left = Math.max(margin, vw - margin - r.width);
                pop.style.left = left + 'px';
                pop.style.top = top + 'px';
                pop.style.transform = 'none';
            } catch {}
        }
        // Clamp immediately before showing to prevent jump
        clampWithinViewport();
        // Reveal with a light fade-in
        pop.style.visibility = 'visible';
        requestAnimationFrame(() => { pop.style.opacity = '1'; });

        function cleanup() {
            document.removeEventListener('mousedown', outside, true);
            document.removeEventListener('touchstart', outside, true);
            if (pop.parentNode) pop.parentNode.removeChild(pop);
        }
        function outside(ev) {
            const t = ev.target;
            if (!pop.contains(t) && !t.closest?.('.client-suggest-popover')) cleanup();
        }
        setTimeout(() => { document.addEventListener('mousedown', outside, true); document.addEventListener('touchstart', outside, true); }, 0);
        cancelBtn.addEventListener('click', cleanup);

        // Focus client by default
        setTimeout(() => { try { clientInput.focus(); clientInput.select(); } catch {} }, 0);

        async function doSave() {
            try {
                saveBtn.disabled = true; cancelBtn.disabled = true;
                const sellerId = state?.currentSeller?.id;
                if (!sellerId) { try { notify.error('Selecciona un vendedor'); } catch {} return; }
                const payload = { seller_id: sellerId };
                if (state?.selectedDayId) payload.sale_day_id = state.selectedDayId;
                const created = await api('POST', API.Sales, payload);
                
                // Build items array and legacy qty_* properties dynamically
                const items = [];
                const body = {
                    id: created.id,
                    client_name: (clientInput.value || '').trim(),
                    is_paid: false,
                    pay_method: null,
                    _actor_name: state.currentUser?.name || ''
                };
                
                for (const d of state.desserts) {
                    const input = qtyInputs[d.short_code];
                    const qty = Math.max(0, parseInt(input?.value || '0', 10) || 0);
                    
                    // Legacy format for backward compatibility
                    body[`qty_${d.short_code}`] = qty;
                    
                    // New format - items array
                    if (qty > 0) {
                        items.push({
                            dessert_id: d.id,
                            quantity: qty,
                            unit_price: d.sale_price
                        });
                    }
                }
                
                body.items = items;
                const updated = await api('PUT', API.Sales, body);
                // Prepend and render
                state.sales.unshift(updated);
                renderTable();
                try { notify.success('Guardado exitosamente'); } catch {}
                cleanup();
            } catch (e) {
                try { notify.error('No se pudo guardar'); } catch {}
                saveBtn.disabled = false; cancelBtn.disabled = false;
            }
        }

        saveBtn.addEventListener('click', doSave);
        // Submit on Enter in any input
        const allInputs = [clientInput, ...Object.values(qtyInputs)];
        allInputs.forEach((el) => {
            el.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') { ev.preventDefault(); doSave(); }
            });
        });
    } catch (e) {
        // Fallback to old inline add if popover fails
        try { addRow(); } catch {}
    }
}

// Open edit sale popover with existing sale data
function openEditSalePopover(saleId, anchorX, anchorY, onCloseCallback) {
    try {
        const sale = state.sales.find(s => s.id === saleId);
        if (!sale) {
            try { notify.error('No se encontró el pedido'); } catch {}
            return;
        }
        
        const pop = document.createElement('div');
        pop.className = 'new-sale-popover';
        pop.style.position = 'fixed';
        const isSmall = window.matchMedia('(max-width: 640px)').matches;
        if (typeof anchorX === 'number' && typeof anchorY === 'number' && !isSmall) {
            pop.style.left = anchorX + 'px';
            pop.style.top = anchorY + 'px';
            pop.style.transform = 'translate(-50%, 0)';
        } else {
            pop.style.left = '50%';
            pop.style.top = '20%';
            pop.style.transform = 'translate(-50%, 0)';
        }

        const title = document.createElement('h4');
        title.textContent = 'Editar pedido';
        title.style.margin = '0 0 8px 0';

        const grid = document.createElement('div');
        grid.className = 'new-sale-grid';

        function appendRow(labelText, inputEl) {
            const left = document.createElement('div'); left.className = 'new-sale-cell new-sale-left';
            const right = document.createElement('div'); right.className = 'new-sale-cell new-sale-right';
            const lbl = document.createElement('div'); lbl.className = 'new-sale-label-text'; lbl.textContent = labelText;
            left.appendChild(lbl);
            right.appendChild(inputEl);
            right.addEventListener('mousedown', (ev) => {
                if (ev.target !== inputEl) { ev.preventDefault(); try { inputEl.focus(); inputEl.select(); } catch {} }
            });
            right.addEventListener('click', (ev) => {
                if (ev.target !== inputEl) { ev.preventDefault(); try { inputEl.focus(); inputEl.select(); } catch {} }
            });
            grid.appendChild(left);
            grid.appendChild(right);
        }

        // Client row - prefilled
        const clientInput = document.createElement('input');
        clientInput.type = 'text';
        clientInput.placeholder = 'Nombre del cliente';
        clientInput.className = 'input-cell client-input';
        clientInput.autocomplete = 'off';
        clientInput.value = sale.client_name || '';
        attachClientSuggestionsPopover(clientInput);
        appendRow('Cliente', clientInput);

        // Dessert rows (dynamic from state.desserts) - prefilled
        const qtyInputs = {};
        for (const d of state.desserts) {
            const input = document.createElement('input');
            input.type = 'number';
            input.min = '0';
            input.step = '1';
            input.inputMode = 'numeric';
            input.placeholder = '0';
            input.className = 'input-cell input-qty';
            input.dataset.dessertId = d.id;
            
            // Get current quantity from sale
            let qty = 0;
            if (Array.isArray(sale.items) && sale.items.length > 0) {
                const item = sale.items.find(i => i.dessert_id === d.id || i.short_code === d.short_code);
                qty = item ? Number(item.quantity || 0) : 0;
            } else {
                qty = Number(sale[`qty_${d.short_code}`] || 0);
            }
            
            input.value = qty > 0 ? String(qty) : '';
            qtyInputs[d.short_code] = input;
            appendRow(d.name, input);
        }

        const actions = document.createElement('div');
        actions.className = 'confirm-actions';
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'press-btn';
        cancelBtn.textContent = 'Cancelar';
        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'press-btn btn-primary';
        saveBtn.textContent = 'Guardar';
        actions.append(cancelBtn, saveBtn);

        pop.append(title, grid, actions);
        pop.style.visibility = 'hidden';
        pop.style.opacity = '0';
        pop.style.transition = 'opacity 160ms ease-out';
        document.body.appendChild(pop);

        // Clamp within viewport
        function clampWithinViewport() {
            try {
                const margin = 8;
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const r = pop.getBoundingClientRect();
                const baseX = (typeof anchorX === 'number') ? anchorX : (vw / 2);
                const baseY = (typeof anchorY === 'number') ? anchorY : (vh / 2);
                let left = Math.round(baseX - r.width / 2);
                let topBelow = Math.round(baseY + 8);
                let topAbove = Math.round(baseY - 8 - r.height);
                let top = topBelow;
                if (top + r.height > vh - margin) top = topAbove;
                if (top < margin) top = margin;
                if (top + r.height > vh - margin) top = Math.max(margin, vh - margin - r.height);
                if (left < margin) left = margin;
                if (left + r.width > vw - margin) left = Math.max(margin, vw - margin - r.width);
                pop.style.left = left + 'px';
                pop.style.top = top + 'px';
                pop.style.transform = 'none';
            } catch {}
        }
        clampWithinViewport();
        pop.style.visibility = 'visible';
        requestAnimationFrame(() => { pop.style.opacity = '1'; });

        function cleanup() {
            document.removeEventListener('mousedown', outside, true);
            document.removeEventListener('touchstart', outside, true);
            if (pop.parentNode) pop.parentNode.removeChild(pop);
            // Call the callback to close action bar with fade animation
            if (typeof onCloseCallback === 'function') {
                onCloseCallback();
            }
        }
        function outside(ev) {
            const t = ev.target;
            if (!pop.contains(t) && !t.closest?.('.client-suggest-popover')) cleanup();
        }
        setTimeout(() => { document.addEventListener('mousedown', outside, true); document.addEventListener('touchstart', outside, true); }, 0);
        cancelBtn.addEventListener('click', cleanup);

        // Focus client by default
        setTimeout(() => { try { clientInput.focus(); clientInput.select(); } catch {} }, 0);

        async function doSave() {
            try {
                saveBtn.disabled = true; cancelBtn.disabled = true;
                
                // Build items array and legacy qty_* properties
                const items = [];
                const body = {
                    id: saleId,
                    client_name: (clientInput.value || '').trim(),
                    is_paid: sale.is_paid || false,
                    pay_method: sale.pay_method || null,
                    comment_text: sale.comment_text || '',
                    _actor_name: state.currentUser?.name || ''
                };
                
                for (const d of state.desserts) {
                    const input = qtyInputs[d.short_code];
                    const qty = Math.max(0, parseInt(input?.value || '0', 10) || 0);
                    
                    // Legacy format
                    body[`qty_${d.short_code}`] = qty;
                    
                    // New format
                    if (qty > 0) {
                        items.push({
                            dessert_id: d.id,
                            quantity: qty,
                            unit_price: d.sale_price
                        });
                    }
                }
                
                body.items = items;
                const updated = await api('PUT', API.Sales, body);
                
                // Update state and re-render
                const idx = state.sales.findIndex(s => s.id === saleId);
                if (idx !== -1) state.sales[idx] = updated;
                renderTable();
                try { notify.success('Guardado exitosamente'); } catch {}
                cleanup();
            } catch (e) {
                try { notify.error('No se pudo guardar'); } catch {}
                saveBtn.disabled = false; cancelBtn.disabled = false;
            }
        }

        saveBtn.addEventListener('click', doSave);
        const allInputs = [clientInput, ...Object.values(qtyInputs)];
        allInputs.forEach((el) => {
            el.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') { ev.preventDefault(); doSave(); }
            });
        });
    } catch (e) {
        console.error('Error opening edit popover:', e);
        try { notify.error('Error al abrir el editor'); } catch {}
    }
}

// Open "Nuevo pedido" popover with date selection for client detail view
async function openNewSalePopoverWithDate(anchorX, anchorY, prefilledClientName) {
    try {
        // Ensure desserts and days are loaded before building the popover
        if (state.currentSeller) {
            try {
                await loadDesserts();
                await loadDaysForSeller();
            } catch (e) {
                console.error('Error loading data in popover:', e);
            }
        }
        
        const pop = document.createElement('div');
        pop.className = 'new-sale-popover';
        pop.style.position = 'fixed';
        const isSmall = window.matchMedia('(max-width: 640px)').matches;
        if (typeof anchorX === 'number' && typeof anchorY === 'number' && !isSmall) {
            pop.style.left = anchorX + 'px';
            pop.style.top = anchorY + 'px';
            pop.style.transform = 'translate(-50%, 0)';
        } else {
            pop.style.left = '50%';
            pop.style.top = '20%';
            pop.style.transform = 'translate(-50%, 0)';
        }

        const title = document.createElement('h4');
        title.textContent = 'Nuevo pedido';
        title.style.margin = '0 0 8px 0';

        const grid = document.createElement('div');
        grid.className = 'new-sale-grid';

        function appendRow(labelText, inputEl) {
            const left = document.createElement('div'); left.className = 'new-sale-cell new-sale-left';
            const right = document.createElement('div'); right.className = 'new-sale-cell new-sale-right';
            const lbl = document.createElement('div'); lbl.className = 'new-sale-label-text'; lbl.textContent = labelText;
            left.appendChild(lbl);
            right.appendChild(inputEl);
            // Make whole right cell focus the input when clicked
            right.addEventListener('mousedown', (ev) => {
                if (ev.target !== inputEl) { ev.preventDefault(); try { inputEl.focus(); inputEl.select(); } catch {} }
            });
            right.addEventListener('click', (ev) => {
                if (ev.target !== inputEl) { ev.preventDefault(); try { inputEl.focus(); inputEl.select(); } catch {} }
            });
            grid.appendChild(left);
            grid.appendChild(right);
        }

        // Date selection row
        const dateSelect = document.createElement('select');
        dateSelect.className = 'input-cell';
        const placeholderOpt = document.createElement('option');
        placeholderOpt.value = '';
        placeholderOpt.textContent = 'Seleccionar fecha...';
        placeholderOpt.disabled = true;
        placeholderOpt.selected = true;
        dateSelect.appendChild(placeholderOpt);
        
        // Add existing dates
        if (state.currentSeller && Array.isArray(state.saleDays)) {
            const sorted = [...state.saleDays].sort((a, b) => {
                const dateA = new Date(a.day);
                const dateB = new Date(b.day);
                return dateB - dateA; // Most recent first
            });
            for (const d of sorted) {
                const opt = document.createElement('option');
                opt.value = d.id;
                opt.textContent = formatDayLabel(d.day);
                dateSelect.appendChild(opt);
            }
        }
        
        // Add "Nueva fecha..." option
        const newDateOpt = document.createElement('option');
        newDateOpt.value = 'NEW_DATE';
        newDateOpt.textContent = '+ Nueva fecha...';
        dateSelect.appendChild(newDateOpt);
        
        appendRow('Fecha', dateSelect);

        // Integrated calendar (hidden by default) - appears between date select and client input
        const calendarContainer = document.createElement('div');
        calendarContainer.className = 'integrated-calendar';
        calendarContainer.style.cssText = `
            display: none;
            grid-column: 2 / 3;
            margin-top: 0;
            margin-bottom: 8px;
            padding: 10px;
            background: #f9f9f9;
            border-radius: 6px;
            border: 1px solid #e0e0e0;
            overflow: hidden;
            max-height: 0;
            opacity: 0;
            transform: scaleY(0);
            transform-origin: top;
            transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), 
                        opacity 0.3s ease, 
                        transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        `.replace(/\s+/g, ' ').trim();
        
        const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        let calView = new Date();
        calView.setDate(1);
        
        const calHeader = document.createElement('div');
        calHeader.className = 'date-popover-header';
        calHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;';
        const calPrev = document.createElement('button'); 
        calPrev.className = 'date-nav'; 
        calPrev.textContent = '‹';
        calPrev.type = 'button';
        calPrev.style.cssText = 'padding:2px 6px;background:white;border:1px solid #ccc;border-radius:3px;cursor:pointer;font-size:14px;min-width:24px;';
        const calLabel = document.createElement('div'); 
        calLabel.className = 'date-label';
        calLabel.style.cssText = 'font-weight:500;font-size:12px;';
        const calNext = document.createElement('button'); 
        calNext.className = 'date-nav'; 
        calNext.textContent = '›';
        calNext.type = 'button';
        calNext.style.cssText = 'padding:2px 6px;background:white;border:1px solid #ccc;border-radius:3px;cursor:pointer;font-size:14px;min-width:24px;';
        calHeader.append(calPrev, calLabel, calNext);
        
        const calGrid = document.createElement('div');
        calGrid.className = 'date-grid';
        calGrid.style.cssText = 'display:grid;grid-template-columns:repeat(7,1fr);gap:2px;';
        
        const weekdays = ['L','M','X','J','V','S','D'];
        const calWeekdays = document.createElement('div'); 
        calWeekdays.className = 'date-weekdays';
        calWeekdays.style.cssText = 'display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:2px;';
        for (const w of weekdays) { 
            const c = document.createElement('div'); 
            c.textContent = w; 
            c.style.cssText = 'text-align:center;font-size:10px;font-weight:600;color:#666;padding:2px 0;';
            calWeekdays.appendChild(c); 
        }
        
        function isoUTC(y, m, d) { 
            return new Date(Date.UTC(y, m, d)).toISOString().slice(0,10); 
        }
        
        function renderCalendar() {
            calLabel.textContent = months[calView.getMonth()] + ' ' + calView.getFullYear();
            calGrid.innerHTML = '';
            const year = calView.getFullYear();
            const month = calView.getMonth();
            const firstDay = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
            const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
            for (let i = 0; i < firstDay; i++) {
                const cell = document.createElement('button');
                cell.className = 'date-cell disabled';
                cell.disabled = true;
                cell.type = 'button';
                cell.style.cssText = 'padding:6px;background:#f5f5f5;border:1px solid #e0e0e0;border-radius:4px;cursor:not-allowed;font-size:12px;';
                calGrid.appendChild(cell);
            }
            for (let d = 1; d <= daysInMonth; d++) {
                const cell = document.createElement('button');
                cell.className = 'date-cell';
                cell.textContent = String(d);
                cell.type = 'button';
                cell.style.cssText = 'padding:6px;background:white;border:1px solid #ddd;border-radius:4px;cursor:pointer;font-size:12px;transition:all 0.15s;';
                cell.addEventListener('mouseenter', () => {
                    cell.style.background = '#f0f0f0';
                });
                cell.addEventListener('mouseleave', () => {
                    cell.style.background = 'white';
                });
                const dayIso = isoUTC(year, month, d);
                cell.addEventListener('click', async () => {
                    try {
                        // Disable calendar while processing
                        cell.disabled = true;
                        cell.style.opacity = '0.5';
                        
                        // Create the new date
                        const sellerId = state.currentSeller.id;
                        await api('POST', '/api/days', { seller_id: sellerId, day: dayIso });
                        
                        // Reload days from server
                        await loadDaysForSeller();
                        
                        // Find the newly created date (comparing ISO date part only)
                        const added = (state.saleDays || []).find(d => {
                            const dayPart = String(d.day).slice(0, 10);
                            return dayPart === dayIso;
                        });
                        
                        // Update the select with the new date
                        if (added) {
                            // Clear all options
                            dateSelect.innerHTML = '';
                            
                            // Re-add placeholder
                            const placeholderOpt = document.createElement('option');
                            placeholderOpt.value = '';
                            placeholderOpt.textContent = 'Seleccionar fecha...';
                            placeholderOpt.disabled = true;
                            dateSelect.appendChild(placeholderOpt);
                            
                            // Rebuild sorted dates
                            const sorted = [...state.saleDays].sort((a, b) => {
                                const dateA = new Date(a.day);
                                const dateB = new Date(b.day);
                                return dateB - dateA; // Most recent first
                            });
                            
                            for (const d of sorted) {
                                const opt = document.createElement('option');
                                opt.value = d.id;
                                opt.textContent = formatDayLabel(d.day);
                                // Mark as selected if this is the newly created date
                                if (d.id === added.id) {
                                    opt.selected = true;
                                }
                                dateSelect.appendChild(opt);
                            }
                            
                            // Re-add NEW_DATE option at the end
                            const newDateOpt2 = document.createElement('option');
                            newDateOpt2.value = 'NEW_DATE';
                            newDateOpt2.textContent = '+ Nueva fecha...';
                            dateSelect.appendChild(newDateOpt2);
                            
                            // Set the value and state
                            isUpdatingProgrammatically = true;
                            dateSelect.value = String(added.id);
                            state.selectedDayId = added.id;
                            
                            // Force browser to update the display
                            dateSelect.dispatchEvent(new Event('input', { bubbles: true }));
                            
                            // Show success notification
                            const selectedText = dateSelect.options[dateSelect.selectedIndex]?.text;
                            if (selectedText && selectedText !== 'Seleccionar fecha...') {
                                try { notify.success('Fecha seleccionada: ' + selectedText); } catch {}
                            }
                        }
                        
                        // Hide calendar with animation
                        calendarContainer.style.maxHeight = '0';
                        calendarContainer.style.opacity = '0';
                        calendarContainer.style.transform = 'scaleY(0)';
                        
                        // Actually hide after animation
                        setTimeout(() => {
                            calendarContainer.style.display = 'none';
                            clampWithinViewport();
                        }, 300);
                    } catch (e) {
                        console.error('Error creating date:', e);
                        try { notify.error('Error al crear la fecha'); } catch {}
                        // Re-enable calendar on error
                        cell.disabled = false;
                        cell.style.opacity = '1';
                    }
                });
                calGrid.appendChild(cell);
            }
        }
        
        calPrev.addEventListener('click', (e) => { 
            e.preventDefault();
            calView.setMonth(calView.getMonth() - 1); 
            renderCalendar(); 
        });
        calNext.addEventListener('click', (e) => { 
            e.preventDefault();
            calView.setMonth(calView.getMonth() + 1); 
            renderCalendar(); 
        });
        
        calendarContainer.append(calHeader, calWeekdays, calGrid);
        
        // Insert calendar right after the date row, before client input
        grid.appendChild(calendarContainer);

        // Client row (prefilled if provided)
        const clientInput = document.createElement('input');
        clientInput.type = 'text';
        clientInput.placeholder = 'Nombre del cliente';
        clientInput.className = 'input-cell client-input';
        clientInput.autocomplete = 'off';
        if (prefilledClientName) clientInput.value = prefilledClientName;
        // Custom inline suggestions below the first character (left-aligned)
        attachClientSuggestionsPopover(clientInput);
        appendRow('Cliente', clientInput);

        // Dessert rows (dynamic from state.desserts)
        const qtyInputs = {};
        for (const d of state.desserts) {
            const input = document.createElement('input');
            input.type = 'number';
            input.min = '0';
            input.step = '1';
            input.inputMode = 'numeric';
            input.placeholder = '0';
            input.className = 'input-cell input-qty';
            input.dataset.dessertId = d.id;
            qtyInputs[d.short_code] = input;
            appendRow(d.name, input);
        }

        const actions = document.createElement('div');
        actions.className = 'confirm-actions';
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'press-btn';
        cancelBtn.textContent = 'Cancelar';
        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'press-btn btn-primary';
        saveBtn.textContent = 'Guardar';
        actions.append(cancelBtn, saveBtn);

        pop.append(title, grid, actions);
        // Prepare hidden mount to avoid visible jump before clamping
        pop.style.visibility = 'hidden';
        pop.style.opacity = '0';
        pop.style.transition = 'opacity 160ms ease-out';
        document.body.appendChild(pop);

        // Clamp within viewport so the popover is fully visible
        function clampWithinViewport() {
            try {
                const margin = 8;
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const r = pop.getBoundingClientRect();
                const baseX = (typeof anchorX === 'number') ? anchorX : (vw / 2);
                const baseY = (typeof anchorY === 'number') ? anchorY : (vh / 2);
                let left = Math.round(baseX - r.width / 2);
                let topBelow = Math.round(baseY + 8);
                let topAbove = Math.round(baseY - 8 - r.height);
                let top = topBelow;
                if (top + r.height > vh - margin) {
                    // Prefer above if below overflows
                    top = topAbove;
                }
                // If still overflows, clamp to margins
                if (top < margin) top = margin;
                if (top + r.height > vh - margin) top = Math.max(margin, vh - margin - r.height);
                if (left < margin) left = margin;
                if (left + r.width > vw - margin) left = Math.max(margin, vw - margin - r.width);
                pop.style.left = left + 'px';
                pop.style.top = top + 'px';
                pop.style.transform = 'none';
            } catch {}
        }
        // Clamp immediately before showing to prevent jump
        clampWithinViewport();
        // Reveal with a light fade-in
        pop.style.visibility = 'visible';
        requestAnimationFrame(() => { pop.style.opacity = '1'; });

        function cleanup() {
            document.removeEventListener('mousedown', outside, true);
            document.removeEventListener('touchstart', outside, true);
            if (pop.parentNode) pop.parentNode.removeChild(pop);
        }
        function outside(ev) {
            const t = ev.target;
            if (!pop.contains(t) && !t.closest?.('.client-suggest-popover')) cleanup();
        }
        setTimeout(() => { document.addEventListener('mousedown', outside, true); document.addEventListener('touchstart', outside, true); }, 0);
        cancelBtn.addEventListener('click', cleanup);

        // Handle date selection change
        let isUpdatingProgrammatically = false;
        dateSelect.addEventListener('change', async (e) => {
            // Skip if this is a programmatic update from calendar
            if (isUpdatingProgrammatically) {
                isUpdatingProgrammatically = false;
                return;
            }
            
            if (dateSelect.value === 'NEW_DATE') {
                // Show integrated calendar with animation
                calendarContainer.style.display = 'block';
                renderCalendar();
                // Reset select to placeholder
                dateSelect.value = '';
                e.preventDefault();
                
                // Trigger animation
                requestAnimationFrame(() => {
                    calendarContainer.style.maxHeight = '400px';
                    calendarContainer.style.opacity = '1';
                    calendarContainer.style.transform = 'scaleY(1)';
                });
                
                // Re-clamp popover to ensure it's visible after animation
                setTimeout(() => clampWithinViewport(), 320);
            } else if (dateSelect.value) {
                // Hide calendar with animation
                calendarContainer.style.maxHeight = '0';
                calendarContainer.style.opacity = '0';
                calendarContainer.style.transform = 'scaleY(0)';
                
                // Actually hide after animation
                setTimeout(() => {
                    calendarContainer.style.display = 'none';
                    clampWithinViewport();
                }, 300);
            }
        });

        // Focus date select by default
        setTimeout(() => { try { dateSelect.focus(); } catch {} }, 0);

        let isSaving = false;
        async function doSave() {
            if (isSaving) return;
            isSaving = true;
            
            try {
                const selectedDayId = dateSelect.value;
                
                if (!selectedDayId || selectedDayId === 'NEW_DATE') {
                    try { notify.error('Por favor selecciona una fecha'); } catch {}
                    isSaving = false;
                    return;
                }
                
                saveBtn.disabled = true; 
                cancelBtn.disabled = true;
                
                const sellerId = state?.currentSeller?.id;
                if (!sellerId) { 
                    try { notify.error('Selecciona un vendedor'); } catch {}
                    isSaving = false;
                    return; 
                }
                
                const payload = { seller_id: sellerId, sale_day_id: selectedDayId };
                const created = await api('POST', API.Sales, payload);
                
                // Build items array and legacy qty_* properties dynamically
                const items = [];
                const body = {
                    id: created.id,
                    client_name: (clientInput.value || '').trim(),
                    is_paid: false,
                    pay_method: null,
                    _actor_name: state.currentUser?.name || ''
                };
                
                for (const d of state.desserts) {
                    const val = parseInt(qtyInputs[d.short_code]?.value, 10) || 0;
                    // Legacy: set qty_<short_code>
                    body[`qty_${d.short_code}`] = val;
                    // New: build items
                    if (val > 0) {
                        items.push({
                            dessert_id: d.id,
                            qty: val,
                            amount: val * d.price
                        });
                    }
                }
                body.items = items;
                
                await api('PUT', API.Sales, body);
                
                // Close the popover IMMEDIATELY
                cleanup();
                
                // Show success notification
                try { notify.success('Pedido guardado exitosamente'); } catch {}
                
                // Reload client detail in background to show the new order
                if (state._clientDetailName) {
                    if (state._clientDetailFrom === 'global-search') {
                        loadGlobalClientDetailRows(state._clientDetailName).catch(e => console.error('Error reloading:', e));
                    } else {
                        loadClientDetailRows(state._clientDetailName).catch(e => console.error('Error reloading:', e));
                    }
                }
            } catch (e) {
                console.error('❌ Error completo:', e);
                console.error('Error message:', e.message);
                console.error('Error stack:', e.stack);
                try { notify.error('Error: ' + (e.message || 'No se pudo guardar')); } catch {}
                saveBtn.disabled = false; cancelBtn.disabled = false;
                isSaving = false;
            } finally {
                isSaving = false;
            }
        }

        // Ensure only one click handler
        saveBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            doSave();
        });
        
        // Submit on Enter in any input
        const allInputs = [clientInput, ...Object.values(qtyInputs)];
        allInputs.forEach((el) => {
            el.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') { ev.preventDefault(); doSave(); }
            });
        });
    } catch (e) {
        console.error('Error opening new sale popover with date:', e);
    }
}

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
	body.seller_id = state.currentSeller?.id || null;
	if (state.selectedDayId) body.sale_day_id = state.selectedDayId;
	body._actor_name = state.currentUser?.name || '';
	const updated = await api('PUT', API.Sales, body);
	const idx = state.sales.findIndex(s => s.id === id);
	if (idx !== -1) state.sales[idx] = updated;
	const totalCell = tr.querySelector('.total');
	const total = calcRowTotal(updated);
	totalCell.textContent = fmtNo.format(total);
	updateSummary();
	// Notify only when quantities change; one notification per dessert type (dynamic)
	try {
		if (prev) {
			const client = (updated.client_name || '').trim() || 'Cliente';
			const seller = String((state?.currentSeller?.name || state?.currentUser?.name || '') || '');
			
			for (const d of state.desserts) {
				const prevQty = Number(prev[`qty_${d.short_code}`] || 0);
				const newQty = Number(updated[`qty_${d.short_code}`] || 0);
				
				if (newQty !== prevQty) {
					const prevNote = prevQty > 0 ? ` (antes ${prevQty})` : '';
					const msg = `${client} + ${newQty} ${d.short_code}${prevNote}` + (seller ? ` - ${seller}` : '');
					notify.success(msg);
				}
			}
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
	const sale = state.sales.find(s => s.id === id);
	const currentComment = sale?.comment_text || '';
	const pos = getInputEndCoords(input, input.value);
	await openCommentDialog(input, currentComment, pos.x, pos.y, id);
	// Re-render table to show/update comment marker
	renderTable();
}

async function saveComment(id, text) {
	const sale = state.sales.find(s => s.id === id);
	if (!sale) return;
	
	// Support for new items format
	let payload;
	if (sale.items && Array.isArray(sale.items)) {
		payload = { 
			id, 
			client_name: sale.client_name || '', 
			items: sale.items,
			is_paid: !!sale.is_paid, 
			pay_method: sale.pay_method ?? null, 
			comment_text: text, 
			_actor_name: state.currentUser?.name || '' 
		};
	} else {
		// Legacy format with qty columns
		payload = { 
			id, 
			client_name: sale.client_name || '', 
			qty_arco: sale.qty_arco||0, 
			qty_melo: sale.qty_melo||0, 
			qty_mara: sale.qty_mara||0, 
			qty_oreo: sale.qty_oreo||0, 
			qty_nute: sale.qty_nute||0, 
			is_paid: !!sale.is_paid, 
			pay_method: sale.pay_method ?? null, 
			comment_text: text, 
			_actor_name: state.currentUser?.name || '' 
		};
	}
	
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

function openCommentDialog(anchorEl, initial = '', anchorX, anchorY, saleId = null, onCloseCallback) {
	return new Promise((resolve) => {
		const pop = document.createElement('div');
		pop.className = 'comment-popover';
		pop.style.position = 'fixed';
		pop.style.visibility = 'hidden'; // Hide initially to measure size
		const rect = anchorEl.getBoundingClientRect();
		
		// Append to body first to measure
		pop.style.zIndex = '1000';
		// Size: medium compact size
		const isSmallScreen = window.matchMedia('(max-width: 600px)').matches;
		pop.style.minWidth = isSmallScreen ? 'min(85vw, 300px)' : '360px';
		pop.style.maxWidth = isSmallScreen ? '90vw' : '480px';
		
		// Textarea
		const ta = document.createElement('textarea'); 
		ta.className = 'comment-input'; 
		ta.placeholder = 'Escribe un comentario...'; 
		ta.value = initial || ''; 
		ta.style.minHeight = isSmallScreen ? '120px' : '160px';
		ta.style.marginBottom = '0'; // No margin since no buttons below
		
		// Auto-save with debounce (saves without closing)
		let saveTimeout;
		ta.addEventListener('input', () => {
			clearTimeout(saveTimeout);
			saveTimeout = setTimeout(async () => {
				if (saleId) {
					const v = ta.value.trim();
					await saveComment(saleId, v);
					// Update marker visibility without re-rendering entire table
					const sale = state.sales.find(s => s.id === saleId);
					if (sale) sale.comment_text = v;
				}
			}, 800); // Save after 800ms of no typing
		});
		
		pop.append(ta);
		document.body.appendChild(pop);
		
		// Position after appending to get accurate dimensions
		if (typeof anchorX === 'number' && typeof anchorY === 'number') {
			const popRect = pop.getBoundingClientRect();
			// Position centered horizontally, just above the click with small gap
			const left = anchorX - (popRect.width / 2);
			const top = anchorY - popRect.height - 8; // 8px gap above click
			pop.style.left = Math.max(8, left) + 'px';
			pop.style.top = Math.max(8, top) + 'px';
			pop.style.transform = 'none';
		} else {
			// Fallback: open to the right of the input at same row height
			pop.style.left = (rect.right + 8) + 'px';
			pop.style.top = (rect.top) + 'px';
			pop.style.transform = 'none';
		}
		
		// Make visible
		pop.style.visibility = 'visible';
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
			const ta = pop.querySelector('textarea.comment-input');
			if (ta) {
				const extra = 40; // padding inside popover (20px * 2)
				const maxTa = Math.max(80, viewH - 2 * margin - extra);
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
			// Call the callback to close action bar with fade animation
			if (typeof onCloseCallback === 'function') {
				onCloseCallback();
			}
		}
		function outside(ev) { 
			if (!pop.contains(ev.target)) { 
				const v = ta.value.trim();
				cleanup(); 
				resolve(v);
			} 
		}
		setTimeout(() => {
			document.addEventListener('mousedown', outside, true);
			document.addEventListener('touchstart', outside, true);
		}, 0);
		ta.focus();
	});
}

async function deleteRow(id) {
	const prev = state.sales.find(s => s.id === id);
	const actor = encodeURIComponent(state.currentUser?.name || '');
    // Block delete in UI for non-admins if sale is locked
    const isAdminUser = !!state.currentUser?.isAdmin || state.currentUser?.role === 'superadmin';
    const locked = String(prev?.pay_method || '').trim() !== '';
    if (!isAdminUser && locked) {
        try { notify.error('Pedido bloqueado: solo admin/superadmin puede eliminar'); } catch {}
        return;
    }
    await api('DELETE', `${API.Sales}?id=${encodeURIComponent(id)}&actor=${actor}`);
	state.sales = state.sales.filter(s => s.id !== id);
	// Show immediate local toast for feedback; global notification will also arrive via polling
	if (prev) {
		try {
			let sellerName = '';
			try {
				const match = (state.sellers || []).find(s => s && s.id === prev.seller_id);
				sellerName = match && match.name ? String(match.name) : '';
			} catch {}
			const tail = sellerName ? (' - ' + sellerName) : '';
			const msg = 'Eliminado: ' + formatSaleSummary(prev) + tail;
			const pay = (prev?.pay_method || '').toString();
			notify.info(msg, pay ? { payMethod: pay } : undefined);
		} catch {}
	}
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
	body.seller_id = state.currentSeller?.id || null;
	if (state.selectedDayId) body.sale_day_id = state.selectedDayId;
	body._actor_name = state.currentUser?.name || '';
	const updated = await api('PUT', API.Sales, body);
	const idx = state.sales.findIndex(s => s.id === id);
	if (idx !== -1) state.sales[idx] = updated;
}

async function savePayMethod(tr, id, method) {
	const body = readRow(tr);
	body.id = id;
	body.pay_method = method || null;
	body.seller_id = state.currentSeller?.id || null;
	if (state.selectedDayId) body.sale_day_id = state.selectedDayId;
	body._actor_name = state.currentUser?.name || '';
	await api('PUT', API.Sales, body);
	// Update local state
	const idx = state.sales.findIndex(s => s.id === id);
	if (idx !== -1) state.sales[idx].pay_method = method || null;
}

function updateSummary() {
	// Initialize counts dynamically for all desserts
	const qtys = {};
	const paidQtys = {};
	for (const d of state.desserts) {
		qtys[d.short_code] = 0;
		paidQtys[d.short_code] = 0;
	}
	
	let grand = 0;
	
	for (const s of state.sales) {
		// Support both formats; align with visible per-flavor qty (first occurrence per dessert)
		const pm = (s.pay_method || '').toString();
		if (Array.isArray(s.items) && s.items.length > 0) {
			for (const d of state.desserts) {
				let qty = 0;
				const item = s.items.find(i => i.short_code === d.short_code || i.dessert_id === d.id);
				qty = item ? Number(item.quantity || 0) : 0;
				qtys[d.short_code] += qty;
				if (pm === 'transf' || pm === 'jorgebank' || pm === 'marce' || pm === 'jorge') {
					paidQtys[d.short_code] += qty;
				}
			}
		} else {
			// Old format: use qty_* columns
			for (const d of state.desserts) {
				const qty = Number(s[`qty_${d.short_code}`] || 0);
				qtys[d.short_code] += qty;
				if (pm === 'transf' || pm === 'jorgebank' || pm === 'marce' || pm === 'jorge') {
					paidQtys[d.short_code] += qty;
				}
			}
		}
		
		grand += calcRowTotal(s);
	}
	
	// Update UI dynamically for all desserts
	let totalQty = 0;
	for (const d of state.desserts) {
		const qty = qtys[d.short_code] || 0;
		const amt = qty * (PRICES[d.short_code] || 0);
		totalQty += qty;
		
		// Update qty cell
		const qtyEl = document.getElementById(`sum-${d.short_code}-qty`);
		if (qtyEl) qtyEl.textContent = String(qty);
		
		// Update amt cell
		const amtEl = document.getElementById(`sum-${d.short_code}-amt`);
		if (amtEl) amtEl.textContent = fmtNo.format(amt);
		
		// Update stacked rows (mobile)
		const qty2El = document.getElementById(`sum-${d.short_code}-qty-2`);
		if (qty2El) qty2El.textContent = String(qty);
		
		const amt2El = document.getElementById(`sum-${d.short_code}-amt-2`);
		if (amt2El) amt2El.textContent = fmtNo.format(amt);
	}
	
	$('#sum-total-qty').textContent = String(totalQty);
	const grandStr = fmtNo.format(grand);
	$('#sum-grand').textContent = grandStr;
	
	// Commissions: only paid desserts * 1000
	let paidTotalQty = 0;
	for (const d of state.desserts) {
		paidTotalQty += paidQtys[d.short_code] || 0;
	}
	const commStr = fmtNo.format(paidTotalQty * 1000);
	const commEl = document.getElementById('sum-comm');
	if (commEl) commEl.textContent = commStr;
	// Postres entregados (per day, editable solo por superadmin)
	try {
		const day = (state && Array.isArray(state.saleDays) && state.selectedDayId)
			? (state.saleDays || []).find(d => d && d.id === state.selectedDayId)
			: null;
		
		let totalDelivered = 0;
		for (const d of state.desserts) {
			const delivered = Number(day?.[`delivered_${d.short_code}`] || 0) || 0;
			totalDelivered += delivered;
			const elD = document.getElementById(`deliv-${d.short_code}`);
			if (elD) elD.textContent = String(delivered);
		}
		
		const elDt = document.getElementById('deliv-total');
		if (elDt) elDt.textContent = String(totalDelivered);
		wireDeliveredRowEditors();
	} catch {}
	// Decide whether to stack totals to avoid overlap on small screens
	requestAnimationFrame(() => {
		const table = document.getElementById('sales-table');
		if (!table) return;
		const isSmall = window.matchMedia('(max-width: 600px)').matches;
		let overlap = false;
		if (isSmall) {
			// Check all dessert amt cells dynamically
			for (const d of state.desserts) {
				const el = document.getElementById(`sum-${d.short_code}-amt`);
				if (!el) continue;
				if (el.scrollWidth > el.clientWidth) { overlap = true; break; }
			}
		}
		if (isSmall && overlap) table.classList.add('totals-stacked'); else table.classList.remove('totals-stacked');
		const grandLine = document.getElementById('sum-grand-2');
		if (grandLine) grandLine.textContent = grandStr;
		const commLine = document.getElementById('sum-comm-2');
		if (commLine) commLine.textContent = commStr;
	});
}

function readRow(tr) {
	const clientEl = tr.querySelector('td.col-client .client-input');
	const result = {
		client_name: clientEl ? clientEl.value.trim() : '',
	};
	
	// Read quantities dynamically for all desserts
	const items = [];
	for (const d of state.desserts) {
		const input = tr.querySelector(`td.col-dessert[class*="col-${d.short_code}"] input`);
		const qty = input && input.value !== '' ? Number(input.value) : 0;
		
		// Store in both formats for backward compatibility
		result[`qty_${d.short_code}`] = qty;
		
		// Build items array (new format)
		if (qty > 0) {
			items.push({
				dessert_id: d.id,
				quantity: qty,
				unit_price: d.sale_price
			});
		}
	}
	
	// Include items array for new format
	result.items = items;
	
	return result;
}

function debounce(fn, ms) {
	let t;
	return (...args) => {
		clearTimeout(t);
		t = setTimeout(() => fn(...args), ms);
	};
}

function exportTableToExcel() {
	try {
		// Check if XLSX library is loaded (use window.XLSX for module compatibility)
		if (typeof window.XLSX === 'undefined') {
			notify.error('Error: Librería Excel no cargada');
			console.error('XLSX library is not loaded');
			return;
		}
		const XLSX = window.XLSX;

		// Build SheetJS worksheet from rows
		const header = ['$', 'Pago', 'Cliente', 'Arco', 'Melo', 'Mara', 'Oreo', 'Nute', 'Total'];
		const data = [header];
		const tbody = document.getElementById('sales-tbody');
		if (tbody) {
			for (const tr of Array.from(tbody.rows)) {
				const paidCheckbox = tr.querySelector('td.col-paid input[type="checkbox"]');
				const paid = paidCheckbox?.checked ? '✓' : '';
				const paySel = tr.querySelector('td.col-paid select.pay-select');
				const payRaw = paySel ? paySel.value : '';
				const pay = payRaw === 'efectivo' ? 'Efectivo' : (payRaw === 'transf' || payRaw === 'jorgebank') ? 'Transf' : payRaw === 'marce' ? 'Marce' : payRaw === 'jorge' ? 'Jorge' : '-';
				const client = tr.querySelector('td.col-client input')?.value ?? '';
				let arco = tr.querySelector('td.col-arco input')?.value ?? '';
				let melo = tr.querySelector('td.col-melo input')?.value ?? '';
				let mara = tr.querySelector('td.col-mara input')?.value ?? '';
				let oreo = tr.querySelector('td.col-oreo input')?.value ?? '';
				let nute = tr.querySelector('td.col-nute input')?.value ?? '';
				if (arco === '0') arco = '';
				if (melo === '0') melo = '';
				if (mara === '0') mara = '';
				if (oreo === '0') oreo = '';
				if (nute === '0') nute = '';
				let total = tr.querySelector('td.col-total')?.textContent?.trim() ?? '';
				if (total === '0') total = '';
				data.push([paid, pay, client, arco, melo, mara, oreo, nute, total]);
			}
		}
		const tAr = (document.getElementById('sum-arco-qty')?.textContent ?? '').trim();
		const tMe = (document.getElementById('sum-melo-qty')?.textContent ?? '').trim();
		const tMa = (document.getElementById('sum-mara-qty')?.textContent ?? '').trim();
		const tOr = (document.getElementById('sum-oreo-qty')?.textContent ?? '').trim();
		const tNu = (document.getElementById('sum-nute-qty')?.textContent ?? '').trim();
		const tSum = [tAr, tMe, tMa, tOr, tNu].map(v => parseInt(v || '0', 10) || 0).reduce((a, b) => a + b, 0);
		data.push(['', '', 'Totales (cant.)',
			tAr === '0' ? '' : tAr,
			tMe === '0' ? '' : tMe,
			tMa === '0' ? '' : tMa,
			tOr === '0' ? '' : tOr,
			tNu === '0' ? '' : tNu,
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
			(document.getElementById('sum-nute-amt')?.textContent ?? '').trim() || '',
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
	} catch (error) {
		console.error('Error al exportar Excel:', error);
		const errorMsg = error.message ? `Error al exportar Excel: ${error.message}` : 'Error al exportar Excel';
		try { notify.error(errorMsg); } catch {}
	}
}

async function exportConsolidatedForDate(dayIso) {
	const sellers = await api('GET', API.Sellers);
	const rows = [['Vendedor', '$', 'Pago', 'Cliente', 'Arco', 'Melo', 'Mara', 'Oreo', 'Nute', 'Total']];
	let tQa = 0, tQm = 0, tQma = 0, tQo = 0, tQn = 0, tGrand = 0;
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
			const qn = r.qty_nute || 0;
			const tot = r.total_cents || 0;
			const pm = (r.pay_method || '').toString();
			const pay = pm === 'efectivo' ? 'Efectivo' : (pm === 'transf' || pm === 'jorgebank') ? 'Transf' : pm === 'marce' ? 'Marce' : pm === 'jorge' ? 'Jorge' : '-';
			tQa += qa; tQm += qm; tQma += qma; tQo += qo; tQn += qn; tGrand += (tot || 0);
			rows.push([
				s.name || '',
				r.is_paid ? '✓' : '',
				pay,
				r.client_name || '',
				qa === 0 ? '' : qa,
				qm === 0 ? '' : qm,
				qma === 0 ? '' : qma,
				qo === 0 ? '' : qo,
				qn === 0 ? '' : qn,
				tot === 0 ? '' : tot,
			]);
		}
	}
	// Append totals row (cantidades por sabor) y monto total
	rows.push(['', '', '', 'Totales', tQa || '', tQm || '', tQma || '', tQo || '', tQn || '', tGrand || '']);
	// Add total count of all desserts
	const tSumAll = (tQa || 0) + (tQm || 0) + (tQma || 0) + (tQo || 0) + (tQn || 0);
	rows.push(['', '', '', 'Total postres', '', '', '', '', '', tSumAll || '']);
	const XLSX = window.XLSX;
	const ws = XLSX.utils.aoa_to_sheet(rows);
	ws['!cols'] = [ {wch:18},{wch:3},{wch:10},{wch:24},{wch:6},{wch:6},{wch:6},{wch:6},{wch:6},{wch:10} ];
	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, ws, 'Consolidado');
	const dateLabel = formatDayLabel(String(dayIso).slice(0,10)).replace(/\s+/g, '_');
	XLSX.writeFile(wb, `Consolidado_${dateLabel}.xlsx`);
}

async function exportConsolidatedForDates(isoList) {
	const unique = Array.from(new Set((isoList || []).map(iso => String(iso).slice(0,10))));
	const sellers = await api('GET', API.Sellers);
	const rows = [['Fecha','Vendedor', '$', 'Pago', 'Cliente', 'Arco', 'Melo', 'Mara', 'Oreo', 'Nute', 'Total']];
	let tQa = 0, tQm = 0, tQma = 0, tQo = 0, tQn = 0, tGrand = 0;
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
				const qn = r.qty_nute || 0;
				const tot = r.total_cents || 0;
				const pm = (r.pay_method || '').toString();
				const pay = pm === 'efectivo' ? 'Efectivo' : (pm === 'transf' || pm === 'jorgebank') ? 'Transf' : pm === 'marce' ? 'Marce' : pm === 'jorge' ? 'Jorge' : '-';
				tQa += qa; tQm += qm; tQma += qma; tQo += qo; tQn += qn; tGrand += (tot || 0);
				rows.push([iso, s.name || '', r.is_paid ? '✓' : '', pay,
					r.client_name || '', qa === 0 ? '' : qa, qm === 0 ? '' : qm,
					qma === 0 ? '' : qma, qo === 0 ? '' : qo, qn === 0 ? '' : qn, tot === 0 ? '' : tot]);
			}
		}
	}
	rows.push(['', '', '', '', 'Totales', tQa || '', tQm || '', tQma || '', tQo || '', tQn || '', tGrand || '']);
	// Add total count of all desserts across selected dates
	const tSumAll = (tQa || 0) + (tQm || 0) + (tQma || 0) + (tQo || 0) + (tQn || 0);
	rows.push(['', '', '', '', 'Total postres', '', '', '', '', '', tSumAll || '']);
	const XLSX = window.XLSX;
	const ws = XLSX.utils.aoa_to_sheet(rows);
	ws['!cols'] = [ {wch:10},{wch:18},{wch:3},{wch:10},{wch:24},{wch:6},{wch:6},{wch:6},{wch:6},{wch:6},{wch:10} ];
	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, ws, 'Consolidado');
	XLSX.writeFile(wb, `Consolidado_varios_${new Date().toISOString().slice(0,10)}.xlsx`);
}

(async function exportHelpers(){})();

async function exportCarteraExcel(startIso, endIso) {
	// Normalize
	const start = String(startIso).slice(0,10);
	const end = String(endIso).slice(0,10);
	const sellers = await api('GET', API.Sellers);
	const rows = [['Fecha','Vendedor','Cliente','Pago','$','Arco','Melo','Mara','Oreo','Nute','Total']];
	let totalGrand = 0;
	for (const s of sellers) {
		const days = await api('GET', `/api/days?seller_id=${encodeURIComponent(s.id)}`);
		const within = (days || []).filter(d => {
			const iso = String(d.day).slice(0,10);
			return iso >= start && iso <= end;
		});
		for (const d of within) {
			const params = new URLSearchParams({ seller_id: String(s.id), sale_day_id: String(d.id) });
			const sales = await api('GET', `${API.Sales}?${params.toString()}`);
			for (const r of (sales || [])) {
				const pm = (r.pay_method || '').toString();
				const unpaid = r.is_paid !== true;
				// Keep only unpaid and payment method in: '-', efectivo (billete verde), or banco gris (transf)
				const allowed = (pm === '' || pm === 'efectivo' || pm === 'transf');
				if (!(unpaid && allowed)) continue;
				const qa = r.qty_arco || 0;
				const qm = r.qty_melo || 0;
				const qma = r.qty_mara || 0;
				const qo = r.qty_oreo || 0;
				const qn = r.qty_nute || 0;
				const tot = r.total_cents || 0;
				totalGrand += (tot || 0);
				const payLabel = pm === '' ? '-' : (pm === 'efectivo' ? 'Efectivo' : pm === 'transf' ? 'Transf' : pm);
				rows.push([
					String(d.day).slice(0,10), s.name || '', r.client_name || '', payLabel,
					r.is_paid ? '✓' : '',
					qa || '', qm || '', qma || '', qo || '', qn || '', tot || ''
				]);
			}
		}
	}
	rows.push(['','','','','Totales','','','','','', totalGrand || '']);
	const XLSX = window.XLSX;
	const ws = XLSX.utils.aoa_to_sheet(rows);
	ws['!cols'] = [ {wch:10},{wch:18},{wch:24},{wch:10},{wch:3},{wch:6},{wch:6},{wch:6},{wch:6},{wch:6},{wch:10} ];
	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, ws, 'Cartera');
	XLSX.writeFile(wb, `Cartera_${start}_a_${end}.xlsx`);
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
	const transfersBtn = document.getElementById('transfers-button');
	const projectionsBtn = document.getElementById('projections-button');
	const usersBtn = document.getElementById('users-button');
	const materialsBtn = document.getElementById('materials-button');
	const inventoryBtn = document.getElementById('inventory-button');
	const carteraBtn = document.getElementById('cartera-button');
	const accountingBtn = document.getElementById('accounting-button');
	const dessertsBtn = document.getElementById('desserts-button');
	const deliveriesBtn = document.getElementById('deliveries-button');
	const input = document.getElementById('report-date');
	if (!reportBtn || !input) return;
	reportBtn.addEventListener('click', (ev) => {
		exitDeleteSellerModeIfActive();
		const feats = new Set((state.currentUser?.features || []));
		const isSuper = state.currentUser?.role === 'superadmin' || !!state.currentUser?.isSuperAdmin;
		if (!isSuper && !feats.has('reports.sales')) { notify.error('Sin permiso de reporte de ventas'); return; }
		openRangeCalendarPopover((range) => {
			if (!range || !range.start || !range.end) return;
			const actor = state.currentUser?.name || state.currentUser?.username || '';
			const url = `/sales-report.html?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}${actor ? `&actor=${encodeURIComponent(actor)}` : ''}`;
			window.location.href = url;
		}, ev.clientX, ev.clientY, { preferUp: true });
	});
	projectionsBtn?.addEventListener('click', (ev) => {
		exitDeleteSellerModeIfActive();
		const feats = new Set((state.currentUser?.features || []));
		const isSuper = state.currentUser?.role === 'superadmin' || !!state.currentUser?.isSuperAdmin;
		if (!isSuper && !feats.has('reports.projections')) { notify.error('Sin permiso de proyecciones'); return; }
		openRangeCalendarPopover((range) => {
			if (!range || !range.start || !range.end) return;
			const url = `/projections.html?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`;
			window.location.href = url;
		}, ev.clientX, ev.clientY, { preferUp: true });
	});
    carteraBtn?.addEventListener('click', (ev) => {
        exitDeleteSellerModeIfActive();
        const feats = new Set((state.currentUser?.features || []));
        const isSuper = state.currentUser?.role === 'superadmin' || !!state.currentUser?.isSuperAdmin;
        if (!isSuper && !feats.has('reports.cartera')) { notify.error('Sin permiso de cartera'); return; }
        openRangeCalendarPopover((range) => {
            if (!range || !range.start || !range.end) return;
            const url = `/cartera.html?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`;
            window.location.href = url;
        }, ev.clientX, ev.clientY, { preferUp: true });
    });

	transfersBtn?.addEventListener('click', (ev) => {
		exitDeleteSellerModeIfActive();
	const feats = new Set((state.currentUser?.features || []));
	const isSuper = state.currentUser?.role === 'superadmin' || !!state.currentUser?.isSuperAdmin;
		if (!isSuper && !feats.has('reports.transfers')) { notify.error('Sin permiso de transferencias'); return; }
		openRangeCalendarPopover((range) => {
			if (!range || !range.start || !range.end) return;
			const url = `/transfers.html?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`;
			window.location.href = url;
		}, ev.clientX, ev.clientY, { preferUp: true });
	});
	usersBtn?.addEventListener('click', async (ev) => {
		exitDeleteSellerModeIfActive();
		const feats = new Set((state.currentUser?.features || []));
		const isSuper = state.currentUser?.role === 'superadmin' || !!state.currentUser?.isSuperAdmin;
		if (!isSuper && !feats.has('nav.users')) { notify.error('Sin permiso de usuarios'); return; }
		openUsersMenu(ev.clientX, ev.clientY);
	});
    materialsBtn?.addEventListener('click', async (ev) => {
        exitDeleteSellerModeIfActive();
		const feats = new Set((state.currentUser?.features || []));
		const isSuper = state.currentUser?.role === 'superadmin' || !!state.currentUser?.isSuperAdmin;
		if (!isSuper && !feats.has('nav.materials')) { notify.error('Sin permiso de materiales'); return; }
		openMaterialsMenu(ev.clientX, ev.clientY);
	});
    inventoryBtn?.addEventListener('click', async (ev) => {
        exitDeleteSellerModeIfActive();
		const feats = new Set((state.currentUser?.features || []));
		const isSuper = state.currentUser?.role === 'superadmin' || !!state.currentUser?.isSuperAdmin;
		if (!isSuper && !feats.has('nav.inventory')) { notify.error('Sin permiso de inventario'); return; }
		openInventoryView();
	});
    accountingBtn?.addEventListener('click', (ev) => {
        exitDeleteSellerModeIfActive();
		const feats = new Set((state.currentUser?.features || []));
		const isSuper = state.currentUser?.role === 'superadmin' || !!state.currentUser?.isSuperAdmin;
		if (!isSuper && !feats.has('nav.accounting')) { notify.error('Sin permiso de contabilidad'); return; }
		window.location.href = '/accounting.html';
	});
	dessertsBtn?.addEventListener('click', (ev) => {
		exitDeleteSellerModeIfActive();
		const feats = new Set((state.currentUser?.features || []));
		const isSuper = state.currentUser?.role === 'superadmin' || !!state.currentUser?.isSuperAdmin;
		if (!isSuper && !feats.has('nav.desserts')) { notify.error('Sin permiso para administrar postres'); return; }
		window.location.href = '/manage-desserts.html';
	});
	deliveriesBtn?.addEventListener('click', (ev) => {
		exitDeleteSellerModeIfActive();
		const isAdminUser = !!(state?.currentUser?.isAdmin);
		const isSuper = state.currentUser?.role === 'superadmin' || !!state.currentUser?.isSuperAdmin;
		if (!isAdminUser && !isSuper) { notify.error('Solo para admin/superadmin'); return; }
		window.location.href = '/deliveries.html';
	});
})();

// Build list of ISO dates (YYYY-MM-DD) from inclusive range using UTC arithmetic
function buildIsoListFromRange(startIso, endIso) {
    if (!startIso || !endIso) return [];
    const parseIso = (iso) => {
        const parts = String(iso).split('-').map(v => parseInt(v, 10));
        if (parts.length !== 3 || parts.some(n => Number.isNaN(n))) return null;
        return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    };
    let start = parseIso(startIso);
    let end = parseIso(endIso);
    if (!start || !end) return [];
    if (start > end) { const tmp = start; start = end; end = tmp; }
    const out = [];
    const cur = new Date(start.getTime());
    while (cur <= end) {
        out.push(cur.toISOString().slice(0, 10));
        cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return out;
}

function openUsersMenu(anchorX, anchorY) {
	const pop = document.createElement('div');
	pop.className = 'confirm-popover users-menu';
	pop.style.position = 'fixed';
	const baseX = (typeof anchorX === 'number') ? anchorX : (window.innerWidth / 2);
	const baseY = (typeof anchorY === 'number') ? anchorY : (window.innerHeight / 2);
	// Temporarily position offscreen to measure height, then bottom-align to click (Aladdin up)
	pop.style.left = baseX + 'px';
	pop.style.top = '-9999px';
	pop.style.transform = 'translate(-50%, 0)';
	pop.style.zIndex = '1000';
	const list = document.createElement('div'); list.className = 'history-list';
    const b1 = document.createElement('button'); b1.className = 'press-btn'; b1.textContent = 'Reporte';
    const b2 = document.createElement('button'); b2.className = 'press-btn'; b2.textContent = 'Cambiar contraseñas';
    const b3 = document.createElement('button'); b3.className = 'press-btn'; b3.textContent = 'Asignar roles';
    const b4 = document.createElement('button'); b4.className = 'press-btn'; b4.textContent = 'Otorgar ver vendedor';
    const b5 = document.createElement('button'); b5.className = 'press-btn'; b5.textContent = 'Revocar ver vendedor';
    const b6 = document.createElement('button'); b6.className = 'press-btn'; b6.textContent = 'Gestionar permisos (UI)';
    list.appendChild(b1); list.appendChild(b2); list.appendChild(b3); list.appendChild(b4); list.appendChild(b5); list.appendChild(b6);
	pop.append(list);
	document.body.appendChild(pop);

	// Measure and position so bottom edge sits exactly at click Y, animate upward
	const rect = pop.getBoundingClientRect();
	const popHeight = rect.height;
	const desiredBottomY = baseY; // bottom aligned with click
	let topY = desiredBottomY - popHeight; // place upward
	// Keep within viewport (min 8px from top)
	const minTop = 8;
	if (topY < minTop) topY = minTop;
	// If clamped, bottom will be below click; attempt to shift left/right if needed remains centered
	pop.style.top = topY + 'px';
	// Trigger animation class
	pop.classList.add('aladdin-pop');
	function cleanup(){ document.removeEventListener('mousedown', outside, true); document.removeEventListener('touchstart', outside, true); if (pop.parentNode) pop.parentNode.removeChild(pop); }
	function outside(ev){ if (!pop.contains(ev.target)) cleanup(); }
	setTimeout(() => { document.addEventListener('mousedown', outside, true); document.addEventListener('touchstart', outside, true); }, 0);
	b1.addEventListener('click', async () => { await exportUsersExcel(); cleanup(); });
	b2.addEventListener('click', async () => {
		const username = prompt('Usuario a modificar:'); if (!username) return;
		const newPass = prompt('Nueva contraseña (mín 6 caracteres):'); if (!newPass) return;
		try { await api('PATCH', API.Users, { action: 'setPassword', username, newPassword: newPass }); notify.success('Contraseña actualizada'); cleanup(); }
		catch { notify.error('No se pudo actualizar'); }
	});
	b3.addEventListener('click', async () => {
		const username = prompt('Usuario a modificar rol:'); if (!username) return;
		const role = prompt('Nuevo rol (user, admin, superadmin):'); if (!role) return;
		try { await api('PATCH', API.Users, { action: 'setRole', username, role }); notify.success('Rol actualizado'); cleanup(); }
		catch { notify.error('No se pudo actualizar'); }
	});
    b4.addEventListener('click', async () => {
        const viewer = prompt('Usuario que podrá ver:'); if (!viewer) return;
        const seller = prompt('Vendedor a autorizar (nombre exacto):'); if (!seller) return;
        try {
            await api('PATCH', API.Users, { action: 'grantView', username: viewer, sellerName: seller });
            notify.success('Permiso otorgado'); cleanup();
        } catch { notify.error('No se pudo otorgar'); }
    });
    b5.addEventListener('click', async () => {
        const viewer = prompt('Usuario a revocar:'); if (!viewer) return;
        const seller = prompt('Vendedor a revocar (nombre exacto):'); if (!seller) return;
        try {
            await api('PATCH', API.Users, { action: 'revokeView', username: viewer, sellerName: seller });
            notify.success('Permiso revocado'); cleanup();
        } catch { notify.error('No se pudo revocar'); }
    });
    b6.addEventListener('click', async () => { cleanup(); openPermissionsManager(); });
    // Removed Assign Icons
}

function openPermissionsManager() {
    const overlay = document.createElement('div'); overlay.className = 'confirm-popover permissions-overlay'; overlay.style.position = 'fixed'; overlay.style.left = '0'; overlay.style.top = '0'; overlay.style.right = '0'; overlay.style.bottom = '0'; overlay.style.background = 'rgba(0,0,0,0.35)'; overlay.style.zIndex = '1000';
    const modal = document.createElement('div'); modal.className = 'confirm-popover permissions-modal'; modal.style.position = 'fixed'; modal.style.left = '50%'; modal.style.top = '50%'; modal.style.transform = 'translate(-50%, -50%)'; modal.style.maxWidth = '680px'; modal.style.width = '90%'; modal.style.maxHeight = '80vh'; modal.style.overflow = 'auto'; modal.style.background = 'var(--panel-bg, #fff)'; modal.style.padding = '16px'; modal.style.borderRadius = '12px';
    const title = document.createElement('h3'); title.textContent = 'Gestión de permisos de visualización'; modal.appendChild(title);
    const row = document.createElement('div'); row.style.display = 'flex'; row.style.gap = '12px'; row.style.alignItems = 'flex-start';
    const left = document.createElement('div'); left.style.flex = '1'; const right = document.createElement('div'); right.style.flex = '1';
    const userLabel = document.createElement('label'); userLabel.textContent = 'Usuario (viewer)'; userLabel.style.display = 'block';
    const userSelect = document.createElement('select'); userSelect.style.width = '100%'; userSelect.className = 'input-cell';
    left.appendChild(userLabel); left.appendChild(userSelect);
    const sellersLabel = document.createElement('label'); sellersLabel.textContent = 'Vendedores permitidos'; sellersLabel.style.display = 'block';
    const sellersBox = document.createElement('div'); sellersBox.style.display = 'grid'; sellersBox.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))'; sellersBox.style.gap = '8px'; sellersBox.style.marginTop = '6px';
    right.appendChild(sellersLabel); right.appendChild(sellersBox);
    const featureLabel = document.createElement('label'); featureLabel.textContent = 'Permisos de funcionalidades'; featureLabel.style.display = 'block'; featureLabel.style.marginTop = '12px';
    function makeFeat(labelText, featureKey) {
        const wrap = document.createElement('label'); wrap.style.display = 'flex'; wrap.style.alignItems = 'center'; wrap.style.gap = '8px'; wrap.style.marginTop = '6px';
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = featureKey; cb.dataset.feature = featureKey;
        const span = document.createElement('span'); span.textContent = labelText;
        wrap.appendChild(cb); wrap.appendChild(span);
        return { wrap, cb };
    }
    // Reports
    const featSales = makeFeat('Ver botón Ventas', 'reports.sales');
    const featTransfers = makeFeat('Ver botón Transferencias', 'reports.transfers');
    const featCartera = makeFeat('Ver botón Cartera', 'reports.cartera');
    const featProjections = makeFeat('Ver botón Proyecciones', 'reports.projections');
    // Nav
    const featMaterials = makeFeat('Ver botón Materiales', 'nav.materials');
    const featInventory = makeFeat('Ver botón Inventario', 'nav.inventory');
    const featUsers = makeFeat('Ver botón Usuarios', 'nav.users');
    const featAccounting = makeFeat('Ver botón Contabilidad', 'nav.accounting');
    right.appendChild(featureLabel);
    [featSales, featTransfers, featCartera, featProjections, featMaterials, featInventory, featUsers, featAccounting]
        .forEach(x => right.appendChild(x.wrap));
    row.appendChild(left); row.appendChild(right);
    const actions = document.createElement('div'); actions.style.display = 'flex'; actions.style.justifyContent = 'flex-end'; actions.style.gap = '8px'; actions.style.marginTop = '14px';
    const closeBtn = document.createElement('button'); closeBtn.className = 'press-btn'; closeBtn.textContent = 'Cerrar';
    const saveBtn = document.createElement('button'); saveBtn.className = 'press-btn btn-primary'; saveBtn.textContent = 'Guardar';
    actions.appendChild(closeBtn); actions.appendChild(saveBtn);
    modal.appendChild(row); modal.appendChild(actions);
    overlay.appendChild(modal); document.body.appendChild(overlay);
    function cleanup(){ if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
    closeBtn.addEventListener('click', cleanup);

    (async () => {
        const users = await api('GET', API.Users);
        const sellers = await api('GET', API.Sellers + '?include_archived=1');
        const sortedUsers = [...users].sort((a,b) => String(a.username||'').localeCompare(String(b.username||'')));
        sortedUsers.forEach(u => {
            const opt = document.createElement('option'); opt.value = String(u.username||''); opt.textContent = String(u.username||''); userSelect.appendChild(opt);
        });
        sellersBox.innerHTML = '';
        sellers.forEach(s => {
            const wrap = document.createElement('label'); wrap.style.display = 'flex'; wrap.style.alignItems = 'center'; wrap.style.gap = '8px';
            const cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = String(s.id);
            const span = document.createElement('span'); span.textContent = String(s.name||'');
            wrap.appendChild(cb); wrap.appendChild(span); sellersBox.appendChild(wrap);
        });
        async function loadViewerGrants(viewerName) {
            const grants = await api('GET', API.Users + '?view_permissions=1&viewer=' + encodeURIComponent(viewerName));
            const grantedIds = new Set(grants.map(g => Number(g.seller_id)));
            Array.from(sellersBox.querySelectorAll('input[type="checkbox"]')).forEach((el) => {
                el.checked = grantedIds.has(Number(el.value));
            });
            const feats = await api('GET', API.Users + '?feature_permissions=1&username=' + encodeURIComponent(viewerName));
            const featuresSet = new Set((feats || []).map(f => String(f.feature)));
            [featSales.cb, featTransfers.cb, featCartera.cb, featProjections.cb, featMaterials.cb, featInventory.cb, featUsers.cb, featAccounting.cb]
                .forEach(cb => { cb.checked = featuresSet.has(cb.dataset.feature); });
        }
        userSelect.addEventListener('change', async () => {
            await loadViewerGrants(userSelect.value);
        });
        if (sortedUsers.length) {
            userSelect.value = String(sortedUsers[0].username||'');
            await loadViewerGrants(userSelect.value);
        }
        saveBtn.addEventListener('click', async () => {
            const viewer = String(userSelect.value||''); if (!viewer) return;
            const cbs = Array.from(sellersBox.querySelectorAll('input[type="checkbox"]'));
            const selectedIds = new Set(cbs.filter(el => el.checked).map(el => Number(el.value)));
            const current = await api('GET', API.Users + '?view_permissions=1&viewer=' + encodeURIComponent(viewer));
            const currentIds = new Set(current.map(g => Number(g.seller_id)));
            const toGrant = [...selectedIds].filter(id => !currentIds.has(id));
            const toRevoke = [...currentIds].filter(id => !selectedIds.has(id));
            for (const id of toGrant) { await api('PATCH', API.Users, { action: 'grantView', username: viewer, sellerId: id }); }
            for (const id of toRevoke) { await api('PATCH', API.Users, { action: 'revokeView', username: viewer, sellerId: id }); }
            const feats = await api('GET', API.Users + '?feature_permissions=1&username=' + encodeURIComponent(viewer));
            const currentFeat = new Set((feats || []).map(f => String(f.feature)));
            const desiredFeat = new Set([featSales.cb, featTransfers.cb, featCartera.cb, featProjections.cb, featMaterials.cb, featInventory.cb, featUsers.cb, featAccounting.cb]
                .filter(cb => cb.checked).map(cb => cb.dataset.feature));
            const toGrantF = [...desiredFeat].filter(f => !currentFeat.has(f));
            const toRevokeF = [...currentFeat].filter(f => !desiredFeat.has(f));
            for (const f of toGrantF) await api('PATCH', API.Users, { action: 'grantFeature', username: viewer, feature: f });
            for (const f of toRevokeF) await api('PATCH', API.Users, { action: 'revokeFeature', username: viewer, feature: f });
            notify.success('Permisos actualizados');
            cleanup();
        });
    })();
}

function openMaterialsMenu(anchorX, anchorY) {
	const pop = document.createElement('div');
	pop.className = 'confirm-popover materials-menu';
	pop.style.position = 'fixed';
	const baseX = (typeof anchorX === 'number') ? anchorX : (window.innerWidth / 2);
	const baseY = (typeof anchorY === 'number') ? anchorY : (window.innerHeight / 2);
	pop.style.left = baseX + 'px';
	pop.style.top = '-9999px';
	pop.style.transform = 'translate(-50%, 0)';
	pop.style.zIndex = '1000';
	const list = document.createElement('div'); list.className = 'history-list';
	const b1 = document.createElement('button'); b1.className = 'press-btn'; b1.textContent = 'Ingredientes';
	const b2 = document.createElement('button'); b2.className = 'press-btn'; b2.textContent = 'Necesarios';
	const b3 = document.createElement('button'); b3.className = 'press-btn'; b3.textContent = 'Producción';
	const b4 = document.createElement('button'); b4.className = 'press-btn'; b4.textContent = 'Inventario';
	const b5 = document.createElement('button'); b5.className = 'press-btn'; b5.textContent = 'Tiempos';
	list.appendChild(b1); list.appendChild(b2); list.appendChild(b3); list.appendChild(b4); list.appendChild(b5);
	pop.append(list);
	document.body.appendChild(pop);

	const rect = pop.getBoundingClientRect();
	const popHeight = rect.height;
	const desiredBottomY = baseY;
	let topY = desiredBottomY - popHeight;
	const minTop = 8;
	if (topY < minTop) topY = minTop;
	pop.style.top = topY + 'px';
	pop.classList.add('aladdin-pop');
	function cleanup(){ document.removeEventListener('mousedown', outside, true); document.removeEventListener('touchstart', outside, true); if (pop.parentNode) pop.parentNode.removeChild(pop); }
	function outside(ev){ if (!pop.contains(ev.target)) cleanup(); }
	setTimeout(() => { document.addEventListener('mousedown', outside, true); document.addEventListener('touchstart', outside, true); }, 0);

	b1.addEventListener('click', async () => { cleanup(); openIngredientsView(); });
	b2.addEventListener('click', async () => { cleanup(); openMaterialsNeededFlow(baseX, desiredBottomY); });
	b3.addEventListener('click', async () => { cleanup(); openMeasuresView(); });
	b4.addEventListener('click', async () => { cleanup(); openInventoryView(); });
	b5.addEventListener('click', async () => { cleanup(); openTimesView(); });
}

// Removed openAssignIconsDialog

async function exportUsersExcel() {
	try {
		const XLSX = window.XLSX;
		const users = await api('GET', API.Users);
		const rows = (users || []).map(u => ({ Usuario: u.username, Contraseña: u.password_hash }));
		const ws = XLSX.utils.json_to_sheet(rows);
		const wb = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(wb, ws, 'Usuarios');
		// Add Permissions sheet
		try {
			const perms = await api('GET', API.Users + '?view_permissions=1');
			const permRows = (perms || []).map(p => ({ Usuario: p.viewer_username, Vendedor: p.seller_name, Otorgado: (p.created_at || '').toString().slice(0,19).replace('T',' ') }));
			const ws2 = XLSX.utils.json_to_sheet(permRows);
			XLSX.utils.book_append_sheet(wb, ws2, 'Permisos');
		} catch {}
		XLSX.writeFile(wb, `Usuarios_${new Date().toISOString().slice(0,10)}.xlsx`);
		notify.success('Excel de usuarios generado');
	} catch (e) {
		notify.error('No se pudo generar el reporte de usuarios');
	}
}

function bindEvents() {
	// No header password button; handled in login view
    $('#add-seller').addEventListener('click', async () => {
		const isSuper = state.currentUser?.role === 'superadmin' || !!state.currentUser?.isSuperAdmin;
		if (!isSuper) { notify.error('Solo Jorge puede agregar vendedores'); return; }
        // Leaving delete mode if active
        if (state.deleteSellerMode) { state.deleteSellerMode = false; renderSellerButtons(); }
		const name = (prompt('Nombre del nuevo vendedor:') || '').trim();
		if (!name) return;
		await addSeller(name);
	});

    const delBtn = document.getElementById('delete-seller');
    delBtn?.addEventListener('click', () => {
        const isSuper = state.currentUser?.role === 'superadmin' || !!state.currentUser?.isSuperAdmin;
        if (!isSuper) { notify.error('Solo el superadministrador'); return; }
        state.deleteSellerMode = !state.deleteSellerMode;
        renderSellerButtons();
        try {
            if (state.deleteSellerMode) notify.info('Modo eliminar vendedor activo');
            else notify.info('Modo eliminar vendedor desactivado');
        } catch {}
    });

    $('#add-row').addEventListener('click', (ev) => {
        const rect = ev.currentTarget.getBoundingClientRect();
        openNewSalePopover(rect.left + rect.width / 2, rect.bottom + 8);
    });
	$('#go-home').addEventListener('click', () => {
		state.currentSeller = null;
		state.sales = [];
		switchView('#view-select-seller');
	});

	// Back from Clients view
	const backBtn = document.getElementById('clients-back');
	backBtn?.addEventListener('click', () => {
		if (state.currentSeller) switchView('#view-sales'); else switchView('#view-select-seller');
	});

	// Back from Client Detail view
	const detailBackBtn = document.getElementById('client-detail-back');
	detailBackBtn?.addEventListener('click', () => {
		if (state._clientDetailFrom === 'global-search') {
			// Return to appropriate view based on current context
			if (state.currentSeller) switchView('#view-sales');
			else switchView('#view-select-seller');
		} else if (state._clientDetailFrom === 'sales') {
			switchView('#view-sales');
		} else {
			switchView('#view-clients');
		}
	});

	// Nuevo pedido button from Client Detail view
	const clientDetailAddOrderBtn = document.getElementById('client-detail-add-order');
	clientDetailAddOrderBtn?.addEventListener('click', async (ev) => {
		try {
			// Determine which seller to use
			let sellerToUse = state.currentSeller;
			
			// If no seller is currently selected, use the client's primary seller
			if (!sellerToUse && state._clientDetailSellerId) {
				const seller = (state.sellers || []).find(s => s.id === state._clientDetailSellerId);
				if (seller) {
					// Set this seller as current
					state.currentSeller = seller;
					sellerToUse = seller;
				}
			}
			
			if (!sellerToUse) {
				try { notify.error('No se pudo determinar el vendedor'); } catch {}
				return;
			}
			
			// Open the popover (it will load days internally)
			const rect = ev.currentTarget.getBoundingClientRect();
			const clientName = state._clientDetailName || '';
			await openNewSalePopoverWithDate(rect.left + rect.width / 2, rect.bottom + 8, clientName);
		} catch (e) {
			console.error('Error opening new order popover:', e);
		}
	});

	// Admin-only: Restore bugged sales
	// (botón de reporte eliminado)

	// Export Excel button - ensure event is attached
	const exportExcelBtn = document.getElementById('export-excel');
	if (exportExcelBtn) {
		exportExcelBtn.addEventListener('click', () => {
			exportTableToExcel();
		});
	}

	const backIngredients = document.getElementById('ingredients-back');
	backIngredients?.addEventListener('click', () => {
		switchView('#view-select-seller');
	});

	const backMeasures = document.getElementById('measures-back');
	backMeasures?.addEventListener('click', () => {
		switchView('#view-select-seller');
	});

	const backInventory = document.getElementById('inventory-back');
	backInventory?.addEventListener('click', () => {
		switchView('#view-select-seller');
	});

	const backTimes = document.getElementById('times-back');
	backTimes?.addEventListener('click', () => {
		switchView('#view-select-seller');
	});

	const backInvHist = document.getElementById('inventory-history-back');
	backInvHist?.addEventListener('click', () => {
		switchView('#view-inventory');
	});

	const backInvAdjust = document.getElementById('inventory-adjust-back');
	backInvAdjust?.addEventListener('click', () => {
		switchView('#view-inventory');
	});

	// Client search functionality
	const searchToggle = document.getElementById('client-search-toggle');
	const searchInput = document.getElementById('client-search-input');
	
	if (searchToggle && searchInput) {
		// Toggle search bar expansion
		searchToggle.addEventListener('click', () => {
			const isExpanded = searchInput.classList.contains('expanded');
			if (isExpanded) {
				searchInput.classList.remove('expanded');
				searchInput.style.display = 'none';
				searchInput.value = '';
				// Hide dropdown
				const dropdown = searchInput.parentElement?.querySelector('.client-search-dropdown');
				if (dropdown) dropdown.style.display = 'none';
			} else {
				searchInput.style.display = 'block';
				searchInput.classList.add('expanded');
				setTimeout(() => searchInput.focus(), 100);
			}
		});

		// Wire GLOBAL autocomplete to search input (uses globalClientSuggestions)
		try {
			wireGlobalClientAutocompleteForInput(searchInput);
		} catch (e) {
			console.error('Error wiring global autocomplete:', e);
		}

		// Handle client selection and navigation
		const navigateToClient = async () => {
			const clientName = searchInput.value.trim();
			if (clientName) {
				// Close search bar and dropdown
				searchInput.classList.remove('expanded');
				searchInput.style.display = 'none';
				const dropdown = searchInput.parentElement?.querySelector('.client-search-dropdown');
				if (dropdown) dropdown.style.display = 'none';
				
				// Show loading notification with spinner
				let loadingToast = null;
				try {
					loadingToast = notify.loading(`Buscando cliente: ${clientName}...`);
				} catch {}
				
				// Navigate to client detail page using global search
				try {
					await openGlobalClientDetailView(clientName);
					searchInput.value = '';
					// Close loading notification
					if (loadingToast) loadingToast.close();
				} catch (e) {
					console.error('Error opening client detail:', e);
					// Close loading notification and show error
					if (loadingToast) loadingToast.close();
					try {
						notify.error('Error al buscar el cliente');
					} catch {}
				}
			}
		};

		// Handle Enter key
		searchInput.addEventListener('keydown', async (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				await navigateToClient();
			} else if (e.key === 'Escape') {
				searchInput.classList.remove('expanded');
				searchInput.style.display = 'none';
				searchInput.value = '';
				// Hide dropdown
				const dropdown = searchInput.parentElement?.querySelector('.client-search-dropdown');
				if (dropdown) dropdown.style.display = 'none';
			}
		});

		// Handle custom dropdown selection
		searchInput.addEventListener('client-selected', navigateToClient);

		// Close search bar when clicking outside
		document.addEventListener('click', (e) => {
			const container = document.getElementById('client-search-container');
			if (container && !container.contains(e.target)) {
				if (searchInput.classList.contains('expanded')) {
					searchInput.classList.remove('expanded');
					searchInput.style.display = 'none';
					searchInput.value = '';
					// Hide dropdown
					const dropdown = container.querySelector('.client-search-dropdown');
					if (dropdown) dropdown.style.display = 'none';
				}
			}
		});
	}
}

function openIngredientsManager(anchorX, anchorY) {
	const pop = document.createElement('div');
	pop.className = 'ingredients-popover';
	pop.style.position = 'fixed';
	pop.style.left = (typeof anchorX === 'number' ? anchorX : window.innerWidth / 2) + 'px';
	pop.style.top = (typeof anchorY === 'number' ? anchorY : window.innerHeight / 2) + 'px';
	pop.style.transform = 'translate(-50%, 0)';
	const title = document.createElement('h4'); title.textContent = 'Ingredientes por sabor (por 1 unidad)';
	const header = document.createElement('div'); header.className = 'ingredients-row ingredients-header';
	['Ingrediente','Unidad','Arco','Melo','Mara','Oreo','Nute',''].forEach(t => { const d = document.createElement('div'); d.textContent = t; header.appendChild(d); });
	const list = document.createElement('div'); list.className = 'ingredients-list';
	list.appendChild(header);
	const actions = document.createElement('div'); actions.className = 'ingredients-actions';
	const addBtn = document.createElement('button'); addBtn.className = 'press-btn'; addBtn.textContent = '+ Agregar';
	const closeBtn = document.createElement('button'); closeBtn.className = 'press-btn'; closeBtn.textContent = 'Cerrar';
	actions.append(addBtn, closeBtn);
	pop.append(title, list, actions);
	document.body.appendChild(pop);
	pop.classList.add('aladdin-pop');
	function cleanup(){ document.removeEventListener('mousedown', outside, true); document.removeEventListener('touchstart', outside, true); if (pop.parentNode) pop.parentNode.removeChild(pop); }
	function outside(ev){ if (!pop.contains(ev.target)) cleanup(); }
	setTimeout(() => { document.addEventListener('mousedown', outside, true); document.addEventListener('touchstart', outside, true); }, 0);
	closeBtn.addEventListener('click', cleanup);

	async function loadRows() {
		list.querySelectorAll('.ingredients-row.item')?.forEach(n => n.remove());
		let rows = [];
		try { rows = await api('GET', API.Materials); } catch { rows = []; }
		for (const r of (rows || [])) {
			appendRow(r);
		}
	}

	function appendRow(r) {
		const row = document.createElement('div'); row.className = 'ingredients-row item';
		const inName = document.createElement('input'); inName.type = 'text'; inName.value = r?.ingredient || '';
		const inUnit = document.createElement('input'); inUnit.type = 'text'; inUnit.value = r?.unit || 'g'; inUnit.style.width = '64px';
		const inArco = document.createElement('input'); inArco.type = 'number'; inArco.step = '0.01'; inArco.value = String(r?.per_arco ?? 0);
		const inMelo = document.createElement('input'); inMelo.type = 'number'; inMelo.step = '0.01'; inMelo.value = String(r?.per_melo ?? 0);
		const inMara = document.createElement('input'); inMara.type = 'number'; inMara.step = '0.01'; inMara.value = String(r?.per_mara ?? 0);
		const inOreo = document.createElement('input'); inOreo.type = 'number'; inOreo.step = '0.01'; inOreo.value = String(r?.per_oreo ?? 0);
		const inNute = document.createElement('input'); inNute.type = 'number'; inNute.step = '0.01'; inNute.value = String(r?.per_nute ?? 0);
		const del = document.createElement('button'); del.className = 'press-btn'; del.textContent = '×';
		row.append(inName, inUnit, inArco, inMelo, inMara, inOreo, inNute, del);
		list.appendChild(row);
		del.addEventListener('click', async () => {
			const name = (inName.value || '').trim();
			if (!name) { row.remove(); return; }
			try { await api('DELETE', `${API.Materials}?ingredient=${encodeURIComponent(name)}`); row.remove(); }
			catch { notify.error('No se pudo eliminar'); }
		});
		async function save() {
			const payload = {
				ingredient: (inName.value || '').trim(),
				unit: (inUnit.value || 'g').trim() || 'g',
				per_arco: Number(inArco.value || 0) || 0,
				per_melo: Number(inMelo.value || 0) || 0,
				per_mara: Number(inMara.value || 0) || 0,
				per_oreo: Number(inOreo.value || 0) || 0,
				per_nute: Number(inNute.value || 0) || 0,
			};
			if (!payload.ingredient) { notify.error('Nombre requerido'); return; }
			try { await api('POST', API.Materials, payload); }
			catch { notify.error('No se pudo guardar'); }
		}
		[inName, inUnit, inArco, inMelo, inMara, inOreo, inNute].forEach(el => {
			el.addEventListener('change', save);
			el.addEventListener('blur', save);
		});
	}

	addBtn.addEventListener('click', () => appendRow({ ingredient: '', unit: 'g', per_arco: 0, per_melo: 0, per_mara: 0, per_oreo: 0, per_nute: 0 }));
	loadRows();
}

function openMaterialsNeededFlow(anchorX, anchorY) {
	openRangeCalendarPopover(async (range) => {
		if (!range || !range.start || !range.end) return;
		try {
			const res = await api('GET', `${API.Materials}?compute_start=${encodeURIComponent(range.start)}&compute_end=${encodeURIComponent(range.end)}`);
			// Exportar Excel directamente, sin mostrar popover
			const rows = (res?.materials || []).map(m => ({ Ingrediente: m.ingredient, Unidad: m.unit || 'g', Cantidad: Number(m.total_needed || 0) }));
			const ws = XLSX.utils.json_to_sheet(rows);
			const wb = XLSX.utils.book_new();
			XLSX.utils.book_append_sheet(wb, ws, 'Materiales');
			const label = `${(res?.range?.start||'').replaceAll('-','')}_${(res?.range?.end||'').replaceAll('-','')}`;
			XLSX.writeFile(wb, `Materiales_${label}.xlsx`);
		} catch {
			notify.error('No se pudo calcular materiales');
		}
	}, anchorX, anchorY, { preferUp: true });
}

function openMaterialsReport(data, anchorX, anchorY) {
	const pop = document.createElement('div');
	pop.className = 'confirm-popover materials-report';
	pop.style.position = 'fixed';
	const baseX = (typeof anchorX === 'number') ? anchorX : (window.innerWidth / 2);
	const baseY = (typeof anchorY === 'number') ? anchorY : (window.innerHeight / 2);
	pop.style.left = baseX + 'px';
	pop.style.top = '-9999px';
	pop.style.transform = 'translate(-50%, 0)';
	const h = document.createElement('h4'); h.textContent = 'Materiales necesarios'; h.style.margin = '0 0 8px 0';
	const small = document.createElement('div'); small.style.opacity = '0.7'; small.style.marginBottom = '8px';
	small.textContent = `Rango: ${data?.range?.start || ''} a ${data?.range?.end || ''}`;
	const table = document.createElement('table');
	const thead = document.createElement('thead');
	const trh = document.createElement('tr');
	['Ingrediente','Unidad','Cantidad total'].forEach(t => { const th = document.createElement('th'); th.textContent = t; trh.appendChild(th); });
	thead.appendChild(trh);
	const tbody = document.createElement('tbody');
	for (const m of (data?.materials || [])) {
		const tr = document.createElement('tr');
		const tdN = document.createElement('td'); tdN.textContent = m.ingredient;
		const tdU = document.createElement('td'); tdU.textContent = m.unit || 'g';
		const tdT = document.createElement('td'); tdT.textContent = String(Number(m.total_needed || 0));
		tr.append(tdN, tdU, tdT);
		tbody.appendChild(tr);
	}
	const tfoot = document.createElement('tfoot');
	const trf = document.createElement('tr');
	const tdL = document.createElement('td'); tdL.colSpan = 3; tdL.textContent = 'Fin del reporte';
	trf.appendChild(tdL); tfoot.appendChild(trf);
	table.append(thead, tbody, tfoot);
	const actions = document.createElement('div'); actions.className = 'confirm-actions';
	const exportBtn = document.createElement('button'); exportBtn.className = 'press-btn btn-gold'; exportBtn.textContent = 'Exportar Excel';
	const close = document.createElement('button'); close.className = 'press-btn'; close.textContent = 'Cerrar';
	actions.append(exportBtn, close);
	pop.append(h, small, table, actions);
	document.body.appendChild(pop);
	const rect = pop.getBoundingClientRect();
	const popHeight = rect.height; let topY = baseY - popHeight; const minTop = 8; if (topY < minTop) topY = minTop; pop.style.top = topY + 'px';
	pop.classList.add('aladdin-pop');
	function cleanup(){ document.removeEventListener('mousedown', outside, true); document.removeEventListener('touchstart', outside, true); if (pop.parentNode) pop.parentNode.removeChild(pop); }
	function outside(ev){ if (!pop.contains(ev.target)) cleanup(); }
	setTimeout(() => { document.addEventListener('mousedown', outside, true); document.addEventListener('touchstart', outside, true); }, 0);
	close.addEventListener('click', cleanup);
	exportBtn.addEventListener('click', () => {
		try {
			const rows = (data?.materials || []).map(m => ({ Ingrediente: m.ingredient, Unidad: m.unit || 'g', Cantidad: Number(m.total_needed || 0) }));
			const ws = XLSX.utils.json_to_sheet(rows);
			const wb = XLSX.utils.book_new();
			XLSX.utils.book_append_sheet(wb, ws, 'Materiales');
			const label = `${(data?.range?.start||'').replaceAll('-','')}_${(data?.range?.end||'').replaceAll('-','')}`;
			XLSX.writeFile(wb, `Materiales_${label}.xlsx`);
		} catch { notify.error('No se pudo exportar'); }
	});
}

async function openIngredientsView() {
	switchView('#view-ingredients');
	await renderIngredientsView();
}

async function openTimesView() {
    switchView('#view-times');
    await renderTimesView();
}

async function openInventoryView() {
	switchView('#view-inventory');
	try { await api('POST', API.Inventory, { action: 'sync' }); } catch {}
	await renderInventoryView();
}

async function renderInventoryView() {
	const root = document.getElementById('inventory-content');
	if (!root) return;
	root.innerHTML = '';
	const fmt1 = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
	const fmtMoney = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
	let items = [];
	try { items = await api('GET', API.Inventory); } catch { items = []; }
	// Header actions: ingreso and ajuste buttons
	const actions = document.createElement('div'); actions.className = 'confirm-actions'; actions.style.marginBottom = '8px';
	const ingresoBtn = document.createElement('button'); ingresoBtn.className = 'press-btn btn-primary'; ingresoBtn.textContent = 'Ingreso';
	const ajusteBtn = document.createElement('button'); ajusteBtn.className = 'press-btn'; ajusteBtn.textContent = 'Ajustes';
	const histAllBtn = document.createElement('button'); histAllBtn.className = 'press-btn'; histAllBtn.textContent = 'Historial general';
	const resetBtn = document.createElement('button'); resetBtn.className = 'press-btn'; resetBtn.textContent = 'Resetear';
	actions.append(ingresoBtn, ajusteBtn, histAllBtn, resetBtn);
	root.appendChild(actions);
	// Table
	const table = document.createElement('table'); table.className = 'clients-table';
	const thead = document.createElement('thead'); const hr = document.createElement('tr');
	['Ingrediente','Saldo','Valor','Ingresar',''].forEach(t => { const th = document.createElement('th'); th.textContent = t; hr.appendChild(th); });
	thead.appendChild(hr); const tbody = document.createElement('tbody');
	const rowInputs = [];
	let totalValor = 0;
	for (const it of (items || [])) {
		const tr = document.createElement('tr');
		const tdN = document.createElement('td'); tdN.textContent = it.ingredient;
		const tdS = document.createElement('td');
		const inSaldo = document.createElement('input'); inSaldo.type = 'number'; inSaldo.step = '0.1'; inSaldo.className = 'input-cell'; inSaldo.style.width = '100%'; inSaldo.style.maxWidth = '120px'; inSaldo.style.textAlign = 'right'; inSaldo.value = (Number(it.saldo || 0) || 0).toFixed(1);
		tdS.append(inSaldo);
		const tdV = document.createElement('td'); const valor = (Number(it.saldo||0)||0) * (Number(it.price||0)||0); tdV.textContent = fmtMoney.format(valor); tdV.style.textAlign = 'right';
		const tdI = document.createElement('td'); const inQty = document.createElement('input'); inQty.type = 'number'; inQty.step = '0.1'; inQty.min = '0'; inQty.placeholder = '0.0'; inQty.className = 'input-cell'; inQty.style.width = '100%'; inQty.style.maxWidth = '120px'; inQty.style.textAlign = 'right'; tdI.appendChild(inQty);
		const tdA = document.createElement('td'); const saveBtn = document.createElement('button'); saveBtn.className = 'press-btn'; saveBtn.textContent = 'Guardar'; const histBtn = document.createElement('button'); histBtn.className = 'press-btn'; histBtn.textContent = 'Historial'; tdA.append(saveBtn, histBtn);
		tr.append(tdN, tdS, tdV, tdI, tdA); tbody.appendChild(tr);
		rowInputs.push({ ingredient: it.ingredient, unit: it.unit || 'g', input: inQty });
		totalValor += valor;
		histBtn.addEventListener('click', async () => { openInventoryHistoryDialog(it.ingredient); });
		async function saveSaldo(){
			try {
				const prev = Number(it.saldo || 0) || 0;
				const next = Number(inSaldo.value || 0) || 0;
				let delta = next - prev;
				delta = Math.round(delta * 10) / 10;
				if (!isFinite(delta) || Math.abs(delta) < 1e-9) { return; }
				await api('POST', API.Inventory, { action: 'ajuste', ingredient: it.ingredient, unit: it.unit || 'g', qty: delta, note: 'Ajuste de saldo', actor_name: state.currentUser?.username || state.currentUser?.name || null });
				notify.success('Saldo actualizado');
				await renderInventoryView();
			} catch { notify.error('No se pudo actualizar saldo'); }
		}
		saveBtn.addEventListener('click', saveSaldo);
		inSaldo.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') saveSaldo(); });
	}
	// Footer: total valor + Ingresar button row
	const tfoot = document.createElement('tfoot');
	const frTotal = document.createElement('tr');
	const ft1 = document.createElement('td'); ft1.className = 'label'; ft1.textContent = 'Total inventario';
	const ft2 = document.createElement('td');
	const ft3 = document.createElement('td'); ft3.className = 'col-total'; ft3.textContent = fmtMoney.format(totalValor); ft3.style.textAlign = 'right';
	const ft4 = document.createElement('td');
	const ft5 = document.createElement('td');
	frTotal.append(ft1, ft2, ft3, ft4, ft5); tfoot.appendChild(frTotal);
	const fr = document.createElement('tr');
	const fd1 = document.createElement('td'); const fd2 = document.createElement('td'); const fd3 = document.createElement('td');
	const fd4 = document.createElement('td'); const btnAll = document.createElement('button'); btnAll.className = 'press-btn btn-primary'; btnAll.textContent = 'Ingresar'; fd4.appendChild(btnAll);
	const fd5 = document.createElement('td');
	fr.append(fd1, fd2, fd3, fd4, fd5); tfoot.appendChild(fr);
	btnAll.addEventListener('click', async () => {
		try {
			for (const r of rowInputs) {
				const val = Number(r.input.value || 0) || 0;
				if (val > 0) {
					await api('POST', API.Inventory, { action: 'ingreso', ingredient: r.ingredient, unit: r.unit || 'g', qty: val, note: 'Ingreso', actor_name: state.currentUser?.username || state.currentUser?.name || null });
				}
			}
			notify.success('Ingresos registrados');
			await renderInventoryView();
		} catch { notify.error('No se pudo registrar ingresos'); }
	});

	table.append(thead, tbody, tfoot); root.appendChild(table);

	async function promptMovement(kind) {
		try {
			const ingredient = prompt('Ingrediente:'); if (!ingredient) return;
			const unit = prompt('Unidad (g, ml, unidad):', 'g') || 'g';
			const qtyStr = prompt(kind === 'ingreso' ? 'Cantidad a ingresar:' : 'Cantidad (use negativo para salida):', '0'); if (qtyStr == null) return;
			const qty = Number(qtyStr || '0') || 0;
			const note = prompt('Nota (opcional):', '') || '';
			await api('POST', API.Inventory, { action: kind, ingredient, unit, qty, note, actor_name: state.currentUser?.username || state.currentUser?.name || null });
			notify.success('Movimiento registrado');
			await renderInventoryView();
		} catch { notify.error('No se pudo registrar'); }
	}

	ingresoBtn.addEventListener('click', async () => { await promptMovement('ingreso'); });
	ajusteBtn.addEventListener('click', async () => { await openInventoryAdjustView(); });
	histAllBtn.addEventListener('click', async () => { openInventoryHistoryAllPage(); });
	resetBtn.addEventListener('click', async () => {
		const isSuper = state.currentUser?.role === 'superadmin' || !!state.currentUser?.isSuperAdmin;
		if (!isSuper) { notify.error('Solo el superadministrador'); return; }
		const ok = confirm('Esto borrará TODO el historial y pondrá todos los saldos en 0. ¿Continuar?');
		if (!ok) return;
		try { await api('POST', API.Inventory, { action: 'reset' }); notify.success('Inventario reseteado'); await renderInventoryView(); }
		catch { notify.error('No se pudo resetear'); }
	});
}

async function openInventoryAdjustView() {
	switchView('#view-inventory-adjust');
	await renderInventoryAdjustView();
}

async function renderInventoryAdjustView() {
	const root = document.getElementById('inventory-adjust-content');
	if (!root) return;
	root.innerHTML = '';
	const fmt1 = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
	let items = [];
	try { items = await api('GET', API.Inventory); } catch { items = []; }
	const table = document.createElement('table'); table.className = 'clients-table';
	const thead = document.createElement('thead'); const hr = document.createElement('tr');
	['Ingrediente','Saldo actual','Nueva cantidad','Δ',''].forEach(t => { const th = document.createElement('th'); th.textContent = t; hr.appendChild(th); });
	thead.appendChild(hr);
	const tbody = document.createElement('tbody');
	const rows = [];
	for (const it of (items || [])) {
		const tr = document.createElement('tr');
		const tdN = document.createElement('td'); tdN.textContent = it.ingredient;
		const tdC = document.createElement('td'); tdC.style.textAlign = 'right'; tdC.textContent = fmt1.format(Number(it.saldo || 0) || 0);
		const tdNew = document.createElement('td');
		const inNew = document.createElement('input'); inNew.type = 'number'; inNew.step = '0.1'; inNew.className = 'input-cell'; inNew.style.width = '100%'; inNew.style.maxWidth = '120px'; inNew.style.textAlign = 'right'; inNew.value = (Number(it.saldo || 0) || 0).toFixed(1);
		tdNew.appendChild(inNew);
		const tdD = document.createElement('td'); tdD.style.textAlign = 'right';
		const tdA = document.createElement('td'); const saveBtn = document.createElement('button'); saveBtn.className = 'press-btn'; saveBtn.textContent = 'Guardar'; tdA.appendChild(saveBtn);
		function computeDelta() {
			const prev = Number(it.saldo || 0) || 0;
			const next = Number(inNew.value || 0) || 0;
			let delta = next - prev;
			delta = Math.round(delta * 10) / 10;
			return delta;
		}
		function renderDelta() {
			const d = computeDelta();
			tdD.textContent = d === 0 ? '0.0' : fmt1.format(d);
			tdD.style.opacity = d === 0 ? '0.6' : '1';
		}
		inNew.addEventListener('input', renderDelta);
		renderDelta();
		async function saveRow(){
			try {
				const delta = computeDelta();
				if (!isFinite(delta) || Math.abs(delta) < 1e-9) { return; }
				await api('POST', API.Inventory, { action: 'ajuste', ingredient: it.ingredient, unit: it.unit || 'g', qty: delta, note: 'Ajuste de saldo', actor_name: state.currentUser?.username || state.currentUser?.name || null });
				notify.success('Saldo actualizado');
				await renderInventoryAdjustView();
			} catch { notify.error('No se pudo actualizar saldo'); }
		}
		saveBtn.addEventListener('click', saveRow);
		tr.append(tdN, tdC, tdNew, tdD, tdA); tbody.appendChild(tr);
		rows.push({ ingredient: it.ingredient, unit: it.unit || 'g', input: inNew, computeDelta });
	}
	const tfoot = document.createElement('tfoot');
	const fr = document.createElement('tr');
	const fd1 = document.createElement('td'); fd1.colSpan = 3; fd1.className = 'label'; fd1.textContent = '';
	const fd2 = document.createElement('td');
	const fd3 = document.createElement('td'); const btnAll = document.createElement('button'); btnAll.className = 'press-btn btn-primary'; btnAll.textContent = 'Guardar cambios'; fd3.appendChild(btnAll);
	fr.append(fd1, fd2, fd3); tfoot.appendChild(fr);
	btnAll.addEventListener('click', async () => {
		try {
			let count = 0;
			for (const r of rows) {
				const delta = r.computeDelta();
				if (isFinite(delta) && Math.abs(delta) >= 1e-9) {
					await api('POST', API.Inventory, { action: 'ajuste', ingredient: r.ingredient, unit: r.unit || 'g', qty: delta, note: 'Ajuste de saldo', actor_name: state.currentUser?.username || state.currentUser?.name || null });
					count++;
				}
			}
			notify.success(count > 0 ? 'Ajustes guardados' : 'No hay cambios');
			await renderInventoryAdjustView();
		} catch { notify.error('No se pudieron guardar ajustes'); }
	});
	table.append(thead, tbody, tfoot); root.appendChild(table);
}

async function openInventoryHistoryDialog(ingredient) {
	let rows = [];
	try { rows = await api('GET', `${API.Inventory}?history_for=${encodeURIComponent(ingredient)}`); } catch { rows = []; }
	const pop = document.createElement('div'); pop.className = 'confirm-popover'; pop.style.position = 'fixed';
	pop.style.left = (window.innerWidth/2) + 'px'; pop.style.top = '12%'; pop.style.transform = 'translate(-50%, 0)';
	const title = document.createElement('h4'); title.textContent = `Historial: ${ingredient}`; title.style.margin = '0 0 8px 0';
	const table = document.createElement('table'); table.className = 'items-table';
	const thead = document.createElement('thead'); const hr = document.createElement('tr');
	['Fecha','Tipo','Cantidad','Producción','Nota','Actor'].forEach(t => { const th = document.createElement('th'); th.textContent = t; hr.appendChild(th); }); thead.appendChild(hr);
	const tbody = document.createElement('tbody');
	for (const r of (rows || [])) {
		const tr = document.createElement('tr');
		const tdD = document.createElement('td'); tdD.textContent = String(r.created_at || '').slice(0,19).replace('T',' ');
		const tdK = document.createElement('td'); tdK.textContent = r.kind;
		const tdQ = document.createElement('td'); tdQ.textContent = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(r.qty||0)); tdQ.style.textAlign = 'right';
		const tdProd = document.createElement('td');
		if ((r.kind || '') === 'produccion') {
			let meta = r.metadata;
			try { if (typeof meta === 'string') meta = JSON.parse(meta); } catch {}
			const counts = (meta && meta.counts && typeof meta.counts === 'object') ? meta.counts : {};
			const labels = [ ['arco','Arco'], ['melo','Melo'], ['mara','Mara'], ['oreo','Oreo'], ['nute','Nute'] ];
			const parts = [];
			for (const [key, label] of labels) {
				const n = Number(counts[key] || 0) || 0;
				if (n > 0) parts.push(`${label} ${n}`);
			}
			tdProd.textContent = parts.join(', ');
		} else {
			tdProd.textContent = '';
		}
		const tdN = document.createElement('td'); tdN.textContent = r.note || '';
		const tdA = document.createElement('td'); tdA.textContent = r.actor_name || '';
		tr.append(tdD, tdK, tdQ, tdProd, tdN, tdA); tbody.appendChild(tr);
	}
	const actions = document.createElement('div'); actions.className = 'confirm-actions'; const close = document.createElement('button'); close.className = 'press-btn'; close.textContent = 'Cerrar'; actions.appendChild(close);
	close.addEventListener('click', () => { if (pop.parentNode) pop.parentNode.removeChild(pop); });
	table.append(thead, tbody); pop.append(title, table, actions); document.body.appendChild(pop); pop.classList.add('aladdin-pop');
}

async function openInventoryHistoryAllPage() {
	switchView('#view-inventory-history');
	await renderInventoryHistoryPage();
}

async function renderInventoryHistoryPage() {
	const root = document.getElementById('inventory-history-content');
	if (!root) return;
	root.innerHTML = '';
	let rows = [];
	try { rows = await api('GET', `${API.Inventory}?history_all=1`); } catch { rows = []; }
	const table = document.createElement('table'); table.className = 'clients-table';
	const thead = document.createElement('thead'); const hr = document.createElement('tr');
	['Fecha','Ingrediente','Tipo','Cantidad','Nota','Actor'].forEach(t => { const th = document.createElement('th'); th.textContent = t; hr.appendChild(th); }); thead.appendChild(hr);
	const tbody = document.createElement('tbody');
	for (const r of (rows || [])) {
		const tr = document.createElement('tr');
		const tdD = document.createElement('td'); tdD.textContent = String(r.created_at || '').slice(0,19).replace('T',' ');
		const tdN = document.createElement('td'); tdN.textContent = r.ingredient || '';
		const tdK = document.createElement('td'); tdK.textContent = r.kind;
		const tdQ = document.createElement('td'); tdQ.textContent = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(r.qty||0)); tdQ.style.textAlign = 'right';
		const tdNo = document.createElement('td');
		if ((r.kind || '') === 'produccion') {
			let meta = r.metadata;
			try { if (typeof meta === 'string') meta = JSON.parse(meta); } catch {}
			const counts = (meta && meta.counts && typeof meta.counts === 'object') ? meta.counts : {};
			const labels = [ ['arco','Arco'], ['melo','Melo'], ['mara','Mara'], ['oreo','Oreo'], ['nute','Nute'] ];
			const parts = [];
			for (const [key, label] of labels) {
				const n = Number(counts[key] || 0) || 0;
				if (n > 0) parts.push(`${label} ${n}`);
			}
			tdNo.textContent = parts.length ? parts.join(', ') : (r.note || '');
		} else {
			tdNo.textContent = r.note || '';
		}
		const tdA = document.createElement('td'); tdA.textContent = r.actor_name || '';
		tr.append(tdD, tdN, tdK, tdQ, tdNo, tdA); tbody.appendChild(tr);
	}
	table.append(thead, tbody); root.appendChild(table);
}

async function renderIngredientsView() {
	const root = document.getElementById('ingredients-content');
	if (!root) return;
	root.innerHTML = '';
	
	// Get desserts from both sources:
	// 1. Desserts with recipes (from dessert_recipes)
	let recipeDesserts = [];
	try { recipeDesserts = await api('GET', API.Recipes); } catch { recipeDesserts = []; }
	if (!recipeDesserts || recipeDesserts.length === 0) {
		try { await api('GET', `${API.Recipes}?seed=1`); recipeDesserts = await api('GET', API.Recipes); }
		catch {}
	}
	
	// 2. ALL active desserts (from desserts table)
	let allDesserts = [];
	try { allDesserts = await api('GET', API.Desserts); } catch { allDesserts = []; }
	
	// Merge: show all desserts from desserts table
	// If they have recipe, use recipe data; otherwise just show the name
	const dessertNames = new Set(recipeDesserts || []);
	for (const d of allDesserts) {
		dessertNames.add(d.name);
	}
	
	const grid = document.createElement('div'); grid.className = 'ingredients-grid';
	for (const name of Array.from(dessertNames).sort()) {
		const card = await buildDessertCard(name);
		grid.appendChild(card);
	}
	// Enable drag & drop reordering of dessert cards at grid level
	grid.addEventListener('dragover', (e) => {
		e.preventDefault();
		const dragging = grid.querySelector('.dessert-card.dragging');
		if (!dragging) return;
		const after = (() => {
			const els = [...grid.querySelectorAll('.dessert-card:not(.dragging)')];
			return els.reduce((closest, child) => {
				const rect = child.getBoundingClientRect();
				const offset = e.clientY - rect.top - rect.height / 2;
				if (offset < 0 && offset > closest.offset) return { offset, element: child };
				else return closest;
			}, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
		})();
		if (after == null) grid.appendChild(dragging); else grid.insertBefore(dragging, after);
	});
	root.appendChild(grid);
    // Top actions (use onclick to avoid duplicate listeners on re-render)
    const addDessertBtn = document.getElementById('ingredients-add-dessert');
    if (addDessertBtn) addDessertBtn.onclick = async () => {
        const name = (prompt('Nombre del postre:') || '').trim();
        if (!name) return;
        await api('POST', API.Recipes, { kind: 'step.upsert', dessert: name, step_name: null, position: 0 });
        await renderIngredientsView();
        try { document.dispatchEvent(new CustomEvent('recipes:changed', { detail: { action: 'addDessert', dessert: name } })); } catch {}
    };
    const extrasBtn = document.getElementById('ingredients-add-extras');
    if (extrasBtn) extrasBtn.onclick = () => { openExtrasEditor(); };
}

// ====== Local-only TIEMPOS ======
function readTimesState() {
    try { return JSON.parse(localStorage.getItem('timesState') || '[]') || []; } catch { return []; }
}
function writeTimesState(data) {
    try { localStorage.setItem('timesState', JSON.stringify(data)); } catch {}
}
function formatMs(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return (h > 0 ? `${h}:` : '') + `${pad(m)}:${pad(s)}`;
}

async function renderTimesView() {
    const root = document.getElementById('times-content');
    if (!root) return;
    root.innerHTML = '';
    let data = readTimesState();
    // Seed from Ingredientes on first use (local-only copy)
    if (!data || (Array.isArray(data) && data.length === 0)) {
        try {
            const desserts = await api('GET', API.Recipes);
            const imported = [];
            for (const name of (desserts || [])) {
                try {
                    const r = await api('GET', `${API.Recipes}?dessert=${encodeURIComponent(name)}&include_extras=1`);
                    const steps = (Array.isArray(r?.steps) ? r.steps : []).map(s => ({
                        name: s?.step_name || 'Sin nombre',
                        note: '',
                        elapsedMs: 0,
                        isRunning: false,
                        startedAt: null
                    }));
                    imported.push({ name, steps });
                } catch {}
            }
            if (imported.length) { data = imported; writeTimesState(data); }
        } catch {}
    }

	const grid = document.createElement('div');
	grid.className = 'ingredients-grid';

	function saveAndRerender() { writeTimesState(data); renderTimesView(); }

	// Cache de recetas por postre para mostrar ingredientes por paso
	const recipeCache = new Map();
	async function fetchRecipeForDessert(name) {
		try { return await api('GET', `${API.Recipes}?dessert=${encodeURIComponent(name)}&include_extras=1`); } catch { return null; }
	}
	async function getRecipeForDessert(name) {
		if (!recipeCache.has(name)) recipeCache.set(name, await fetchRecipeForDessert(name));
		return recipeCache.get(name);
	}

	// Historial local de tiempos guardados
	function readTimesHistory() { try { return JSON.parse(localStorage.getItem('timesHistory') || '[]') || []; } catch { return []; } }
	function writeTimesHistory(rows) { try { localStorage.setItem('timesHistory', JSON.stringify(rows)); } catch {} }
	function buildSnapshot() {
		const now = new Date();
		const snapshot = { id: now.toISOString(), date_iso: now.toISOString(), desserts: [] };
		for (const d of (data || [])) {
			const steps = [];
			let totalMs = 0;
			for (const s of (d.steps || [])) { const ms = Number(s.elapsedMs || 0) || 0; totalMs += ms; steps.push({ name: s.name || 'Paso', note: s.note || '', elapsed_ms: ms }); }
			snapshot.desserts.push({ name: d.name || 'Postre', total_ms: totalMs, steps });
		}
		return snapshot;
	}

    function buildTimerControls(step, onTick) {
        const wrap = document.createElement('div');
        wrap.style.display = 'flex';
        wrap.style.alignItems = 'center';
        wrap.style.gap = '8px';
        const display = document.createElement('div');
        display.style.minWidth = '84px';
        display.style.textAlign = 'center';
        display.style.fontVariantNumeric = 'tabular-nums';
        const startBtn = document.createElement('button'); startBtn.className = 'press-btn'; startBtn.textContent = '▶'; startBtn.title = 'Iniciar';
        const pauseBtn = document.createElement('button'); pauseBtn.className = 'press-btn'; pauseBtn.textContent = '⏸'; pauseBtn.title = 'Pausar';
        const resetBtn = document.createElement('button'); resetBtn.className = 'press-btn'; resetBtn.textContent = 'Reset';
        wrap.append(display, startBtn, pauseBtn, resetBtn);
        let intervalId = null;
        function computeElapsed() {
            const base = Number(step.elapsedMs || 0) || 0;
            if (step.isRunning && step.startedAt) return base + (Date.now() - step.startedAt);
            return base;
        }
        function renderTime(){ display.textContent = formatMs(computeElapsed()); if (typeof onTick === 'function') onTick(); }
        renderTime();
        function start(){ if (step.isRunning) return; step.isRunning = true; step.startedAt = Date.now(); writeTimesState(data); clearInterval(intervalId); intervalId = setInterval(renderTime, 250); }
        function pause(){ if (!step.isRunning) return; step.elapsedMs = computeElapsed(); step.isRunning = false; step.startedAt = null; writeTimesState(data); clearInterval(intervalId); intervalId = null; renderTime(); }
        function reset(){ step.elapsedMs = 0; step.isRunning = false; step.startedAt = null; writeTimesState(data); clearInterval(intervalId); intervalId = null; renderTime(); }
        startBtn.addEventListener('click', start);
        pauseBtn.addEventListener('click', pause);
        resetBtn.addEventListener('click', reset);
        // Ensure timer runs if already active
        if (step.isRunning) { clearInterval(intervalId); intervalId = setInterval(renderTime, 250); }
        return { element: wrap, stop: () => { if (intervalId) clearInterval(intervalId); } };
    }

	function buildStep(step, dessert, stepIndex){
        const box = document.createElement('div'); box.className = 'step-card';
        const head = document.createElement('div'); head.className = 'step-header';
        const name = document.createElement('input'); name.type = 'text'; name.value = step.name || 'Paso'; name.style.flex = '1'; name.style.fontWeight = '600'; name.style.border = '0'; name.style.background = 'transparent';
        const actions = document.createElement('div'); actions.className = 'items-actions';
        const del = document.createElement('button'); del.className = 'press-btn'; del.textContent = 'Eliminar paso';
        actions.append(del);
        head.append(name, actions);
		const body = document.createElement('div'); body.style.display = 'flex'; body.style.flexDirection = 'column'; body.style.gap = '8px'; body.style.padding = '8px 0';
        const note = document.createElement('input'); note.type = 'text'; note.placeholder = 'Nota (opcional)'; note.value = step.note || ''; note.className = 'input-cell'; note.style.flex = '1';
		const timer = buildTimerControls(step);
		const timerRow = document.createElement('div'); timerRow.style.display = 'flex'; timerRow.style.justifyContent = 'space-between'; timerRow.style.alignItems = 'center'; timerRow.style.gap = '8px';
		timerRow.append(note, timer.element);
		body.append(timerRow);
		// Contenedor de ingredientes por paso
		const ingWrap = document.createElement('div');
		ingWrap.style.margin = '4px 0 8px 0';
		function fmtQty(n) { try { return new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(n||0)); } catch { return String(Number(n||0).toFixed(1)); } }
		async function renderIngredients(){
			ingWrap.innerHTML = '';
			const recipe = await getRecipeForDessert(dessert.name || '');
			if (!recipe || !Array.isArray(recipe.steps)) return;
			let match = null;
			const si = Number(stepIndex || 0) || 0;
			if (recipe.steps[si]) match = recipe.steps[si];
			if (!match) {
				const stepNameKey = String(step.name || 'Paso').trim().toLowerCase();
				match = recipe.steps.find(s => String(s.step_name || 'Paso').trim().toLowerCase() === stepNameKey) || null;
			}
			if (!match || !Array.isArray(match.items) || match.items.length === 0) { const small = document.createElement('div'); small.style.opacity = '0.7'; small.textContent = 'Sin ingredientes definidos para este paso'; ingWrap.appendChild(small); return; }
            const table = document.createElement('table'); table.className = 'items-table';
            const thead = document.createElement('thead'); const trh = document.createElement('tr');
            ['Ingrediente','Cantidad'].forEach(t => { const th = document.createElement('th'); th.textContent = t; trh.appendChild(th); }); thead.appendChild(trh);
			const tbody = document.createElement('tbody');
			for (const it of match.items) {
				const tr = document.createElement('tr');
				const tdN = document.createElement('td'); tdN.textContent = it.ingredient;
				const tdQ = document.createElement('td');
                const qty = Number(it.qty_per_unit || 0) || 0;
                const adj = Number(it.adjustment || 0) || 0;
                const total = qty + adj;
                tdQ.textContent = fmtQty(total);
				tr.append(tdN, tdQ); tbody.appendChild(tr);
			}
			table.appendChild(tbody); ingWrap.appendChild(table);
		}
		renderIngredients();
        box.append(head, body);
        name.addEventListener('change', () => { step.name = (name.value || '').trim() || 'Paso'; writeTimesState(data); });
		name.addEventListener('change', () => { try { renderIngredients(); } catch {} });
        note.addEventListener('change', () => { step.note = note.value || ''; writeTimesState(data); });
        del.addEventListener('click', () => {
            const idx = (dessert.steps || []).indexOf(step);
            if (idx >= 0) dessert.steps.splice(idx, 1);
            saveAndRerender();
        });
		// Insertar ingredientes bajo el cuerpo
		box.appendChild(ingWrap);
		return box;
    }

    function buildDessertCardLocal(d){
        const card = document.createElement('div'); card.className = 'dessert-card';
        const head = document.createElement('div'); head.className = 'dessert-header';
        const title = document.createElement('h3'); title.textContent = d.name || 'Postre';
        const rename = document.createElement('button'); rename.className = 'press-btn'; rename.textContent = 'Renombrar';
        const addStep = document.createElement('button'); addStep.className = 'press-btn'; addStep.textContent = 'Agregar paso';
        const delDessert = document.createElement('button'); delDessert.className = 'press-btn'; delDessert.textContent = 'Eliminar postre';
        const actionsWrap = document.createElement('div'); actionsWrap.className = 'dessert-actions'; actionsWrap.append(rename, addStep, delDessert);
        head.append(title, actionsWrap);
        const stepsWrap = document.createElement('div'); stepsWrap.className = 'steps-list';
		(d.steps || []).forEach((s, i) => stepsWrap.appendChild(buildStep(s, d, i)));
        addStep.addEventListener('click', () => { d.steps = d.steps || []; d.steps.push({ name: 'Paso', note: '', elapsedMs: 0, isRunning: false, startedAt: null }); saveAndRerender(); });
        delDessert.addEventListener('click', () => { const idx = data.indexOf(d); if (idx >= 0) { data.splice(idx, 1); saveAndRerender(); } });
		rename.addEventListener('click', () => { const n = (prompt('Nuevo nombre:') || '').trim(); if (!n) return; d.name = n; title.textContent = n; saveAndRerender(); });
        card.append(head, stepsWrap);
        // Drag for dessert reordering
        card.draggable = true;
        card.addEventListener('dragstart', () => { card.classList.add('dragging'); });
        card.addEventListener('dragend', () => { card.classList.remove('dragging'); writeTimesState(data); });
        return card;
    }

    // Render grid
    grid.addEventListener('dragover', (e) => {
        e.preventDefault();
        const dragging = grid.querySelector('.dessert-card.dragging');
        if (!dragging) return;
        const after = (() => {
            const els = [...grid.querySelectorAll('.dessert-card:not(.dragging)')];
            return els.reduce((closest, child) => {
                const rect = child.getBoundingClientRect();
                const offset = e.clientY - rect.top - rect.height / 2;
                if (offset < 0 && offset > closest.offset) return { offset, element: child };
                else return closest;
            }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
        })();
        if (after == null) grid.appendChild(dragging); else grid.insertBefore(dragging, after);
        // Sync order in data
        const names = Array.from(grid.querySelectorAll('.dessert-card h3')).map(h => h.textContent || '');
        data.sort((a, b) => names.indexOf(a.name) - names.indexOf(b.name));
        writeTimesState(data);
    });

	for (const d of data) grid.appendChild(buildDessertCardLocal(d));
	root.appendChild(grid);

	// Botón para guardar snapshot de tiempos
	const actions = document.createElement('div'); actions.className = 'confirm-actions'; actions.style.marginTop = '12px'; actions.style.marginBottom = '16px';
	const saveBtn = document.createElement('button'); saveBtn.className = 'press-btn btn-primary'; saveBtn.textContent = 'Guardar tiempos';
	actions.appendChild(saveBtn); root.appendChild(actions);
	saveBtn.addEventListener('click', async () => {
		try {
			const snapshot = buildSnapshot();
			let saved = 0;
			for (const d of (snapshot.desserts || [])) {
				if (!Number(d.total_ms || 0)) continue;
				await fetch('/api/times', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dessert: d.name || 'Postre', steps: d.steps || [], total_elapsed_ms: Number(d.total_ms||0)||0, actor_name: state.currentUser?.username || state.currentUser?.name || null }) });
				saved++;
			}
			// keep local history too for quick reference
			const hist = readTimesHistory(); hist.push(snapshot); writeTimesHistory(hist);
			if (saved > 0) notify?.success ? notify.success(`Tiempos guardados (${saved})`) : alert(`Tiempos guardados (${saved})`);
			else notify?.error ? notify.error('No hay tiempos para guardar') : alert('No hay tiempos para guardar');
		} catch { try { alert('No se pudieron guardar los tiempos'); } catch {} }
	});

    const addDessertBtn = document.getElementById('times-add-dessert');
    addDessertBtn?.addEventListener('click', () => {
        const name = (prompt('Nombre del postre:') || '').trim(); if (!name) return;
        data.push({ name, steps: [] });
        saveAndRerender();
    });
}

async function openMeasuresView() {
	switchView('#view-measures');
	await renderMeasuresView();
}

async function renderMeasuresView() {
	const root = document.getElementById('measures-content');
	if (!root) return;
	root.innerHTML = '';
	// Fetch desserts and recipe aggregates
	let dessertNames = [];
	try { dessertNames = await api('GET', API.Recipes); } catch { dessertNames = []; }
	if (!dessertNames || dessertNames.length === 0) {
		try { await api('GET', `${API.Recipes}?seed=1`); dessertNames = await api('GET', API.Recipes); } catch {}
	}
	// Build input form for counts
	const form = document.createElement('div'); form.className = 'measures-form'; form.style.display = 'flex'; form.style.justifyContent = 'center'; form.style.margin = '0 0 12px 0';
	const grid = document.createElement('div'); grid.className = 'measures-grid'; grid.style.display = 'grid'; grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(180px, 1fr))'; grid.style.gap = '12px 16px'; grid.style.maxWidth = '880px'; grid.style.width = '100%';
	const counts = new Map();
	function normalizeKey(name){ const k = String(name||'').trim().toLowerCase(); if (k.startsWith('arco')) return 'arco'; if (k.startsWith('melo')) return 'melo'; if (k.startsWith('mara')) return 'mara'; if (k.startsWith('oreo')) return 'oreo'; if (k.startsWith('nute')) return 'nute'; return k; }
	const byKey = new Map();
	for (const name of (dessertNames||[])) { const key = normalizeKey(name); byKey.set(key, name); }
	for (const [k, name] of byKey.entries()) {
		const row = document.createElement('div'); row.className = 'measures-row'; row.style.display = 'flex'; row.style.alignItems = 'center'; row.style.justifyContent = 'center'; row.style.gap = '8px'; row.style.border = '1px solid rgba(0,0,0,0.12)'; row.style.borderRadius = '10px'; row.style.padding = '8px 10px'; row.style.cursor = 'pointer'; row.style.background = 'white';
		const label = document.createElement('div'); label.textContent = name; label.style.fontWeight = '600'; label.style.textAlign = 'center'; label.style.flex = '1';
		const input = document.createElement('input'); input.type = 'number'; input.min = '0'; input.step = '1'; input.value = '0'; input.className = 'input-cell'; input.style.width = '86px'; input.style.textAlign = 'center';
		counts.set(k, 0);
		input.addEventListener('focus', () => { try { input.select(); } catch {} });
		row.addEventListener('click', (ev) => { if (ev.target !== input) { input.focus(); input.select(); } });
		input.addEventListener('input', () => { counts.set(k, Math.max(0, Number(input.value||0) || 0)); renderResults(); });
		row.append(label, input); grid.appendChild(row);
	}
	form.appendChild(grid);

	// Results cards container
	const resultWrap = document.createElement('div');
	const cardsWrap = document.createElement('div');
	cardsWrap.style.display = 'flex'; cardsWrap.style.flexDirection = 'column'; cardsWrap.style.alignItems = 'center';
	resultWrap.appendChild(cardsWrap);

	// Export and Approve buttons
	const actions = document.createElement('div'); actions.className = 'confirm-actions';
	const exportBtn = document.createElement('button'); exportBtn.className = 'press-btn btn-gold'; exportBtn.textContent = 'Exportar Excel';
	const approveBtn = document.createElement('button'); approveBtn.className = 'press-btn btn-primary'; approveBtn.textContent = 'Aprobar';
	actions.append(exportBtn, approveBtn);

	root.append(form, resultWrap, actions);

	async function fetchRecipeMap() {
		// Keep step divisions and item order; include extras
		const names = dessertNames || [];
		const byDessert = new Map();
		for (const dessert of names) {
			const data = await api('GET', `${API.Recipes}?dessert=${encodeURIComponent(dessert)}&include_extras=1`);
			// Ensure steps are arrays with items in order
			const steps = Array.isArray(data?.steps) ? data.steps : [];
			byDessert.set(dessert, { steps, extras: Array.isArray(data?.extras) ? data.extras : [] });
		}
		// Extras also needed even if a dessert has none in its payload
		let globalExtras = [];
		try { const exData = await api('GET', `${API.Recipes}?dessert=${encodeURIComponent(names[0]||'dummy')}&include_extras=1`); globalExtras = exData.extras || []; } catch {}
		return { byDessert, extras: globalExtras };
	}

	let recipeCache = null;
	async function ensureRecipes(){ if (!recipeCache) recipeCache = await fetchRecipeMap(); return recipeCache; }

	// Refresh when recipes change (e.g., new dessert added)
	function onRecipesChanged(){ recipeCache = null; // clear cache
		// Rebuild inputs grid with any new dessert
		while (grid.firstChild) grid.removeChild(grid.firstChild);
		byKey.clear();
		for (const name of (dessertNames||[])) { const key = normalizeKey(name); byKey.set(key, name); }
		for (const [k, name] of byKey.entries()) {
			const row = document.createElement('div'); row.className = 'measures-row'; row.style.display = 'flex'; row.style.alignItems = 'center'; row.style.justifyContent = 'center'; row.style.gap = '8px'; row.style.border = '1px solid rgba(0,0,0,0.12)'; row.style.borderRadius = '10px'; row.style.padding = '8px 10px'; row.style.cursor = 'pointer'; row.style.background = 'white';
			const label = document.createElement('div'); label.textContent = name; label.style.fontWeight = '600'; label.style.textAlign = 'center'; label.style.flex = '1';
			const input = document.createElement('input'); input.type = 'number'; input.min = '0'; input.step = '1'; input.value = String(counts.get(k) || 0); input.className = 'input-cell'; input.style.width = '86px'; input.style.textAlign = 'center';
			input.addEventListener('focus', () => { try { input.select(); } catch {} });
			row.addEventListener('click', (ev) => { if (ev.target !== input) { input.focus(); input.select(); } });
			input.addEventListener('input', () => { counts.set(k, Math.max(0, Number(input.value||0) || 0)); renderResults(); });
			grid.appendChild(row); row.append(label, input);
		}
		renderResults();
	}
	const recipesChangedHandler = async (ev) => {
		try {
			// refetch dessert names to include new ones
			dessertNames = await api('GET', API.Recipes);
			onRecipesChanged();
		} catch {}
	};
	try { document.addEventListener('recipes:changed', recipesChangedHandler); } catch {}

	function clearCards(){ while (cardsWrap.firstChild) cardsWrap.removeChild(cardsWrap.firstChild); }

	async function renderResults() {
		await ensureRecipes();
		clearCards();
		const fmt1 = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
		const dataByDessert = recipeCache.byDessert;
		const extras = Array.isArray(recipeCache.extras) ? recipeCache.extras : [];
		for (const [key, qty] of counts.entries()) {
			const qtyNum = Number(qty || 0);
			if (!qtyNum) continue;
			const dessertName = byKey.get(key) || key;
			const d = dataByDessert.get(dessertName);
			if (!d) continue;
			// Card container
			const card = document.createElement('div'); card.className = 'measure-card';
			card.style.margin = '80px 0 96px 0';
			card.style.padding = '12px';
			card.style.border = '1px solid rgba(0,0,0,0.15)';
			card.style.borderRadius = '10px';
			card.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)';
	const title = document.createElement('h3'); title.textContent = dessertName; title.style.textAlign = 'center'; title.style.fontSize = '32px'; title.style.margin = '4px 0 12px 0'; title.style.background = 'rgba(255, 105, 180, 0.18)'; title.style.padding = '8px 6px'; title.style.borderRadius = '8px';
			card.appendChild(title);
			// Steps sections in order
			for (const step of (d.steps || [])) {
				const section = document.createElement('div'); section.className = 'measure-section'; section.style.margin = '12px 0';
				if (step.step_name) {
					const sh = document.createElement('div'); sh.textContent = step.step_name; sh.style.fontWeight = '600'; sh.style.margin = '0 0 6px 0';
					section.appendChild(sh);
				}
				const table = document.createElement('table'); table.style.width = '100%'; table.style.tableLayout = 'fixed';
				const colgroup = document.createElement('colgroup');
				const colL = document.createElement('col'); colL.style.width = '33%';
				const colM = document.createElement('col'); colM.style.width = '34%';
				const colR = document.createElement('col'); colR.style.width = '33%';
				colgroup.appendChild(colL); colgroup.appendChild(colM); colgroup.appendChild(colR); table.appendChild(colgroup);
				const tbody = document.createElement('tbody');
				for (const it of (step.items || [])) {
					const tr = document.createElement('tr');
					const tdL = document.createElement('td'); tdL.textContent = '';
					const tdN = document.createElement('td'); tdN.textContent = it.ingredient; tdN.style.padding = '8px 4px'; tdN.style.textAlign = 'center';
					const tdQ = document.createElement('td'); tdQ.textContent = fmt1.format(((Number(it.qty_per_unit || 0) || 0) * qtyNum) + (Number(it.adjustment || 0) || 0)); tdQ.style.textAlign = 'right'; tdQ.style.padding = '5px 4px';
					tr.append(tdL, tdN, tdQ); tbody.appendChild(tr);
				}
				table.appendChild(tbody); section.appendChild(table); card.appendChild(section);
			}
			// Extras at the end
			if (extras && extras.length) {
				const section = document.createElement('div'); section.className = 'measure-section'; section.style.margin = '12px 0';
				const sh = document.createElement('div'); sh.textContent = 'Extras'; sh.style.fontWeight = '600'; sh.style.margin = '0 0 6px 0'; section.appendChild(sh);
				const table = document.createElement('table'); table.style.width = '100%'; table.style.tableLayout = 'fixed';
				const colgroup = document.createElement('colgroup');
				const colL = document.createElement('col'); colL.style.width = '33%';
				const colM = document.createElement('col'); colM.style.width = '34%';
				const colR = document.createElement('col'); colR.style.width = '33%';
				colgroup.appendChild(colL); colgroup.appendChild(colM); colgroup.appendChild(colR); table.appendChild(colgroup);
				const tbody = document.createElement('tbody');
				for (const ex of extras) {
					const tr = document.createElement('tr');
					const tdL = document.createElement('td'); tdL.textContent = '';
					const tdN = document.createElement('td'); tdN.textContent = ex.ingredient; tdN.style.padding = '8px 4px'; tdN.style.textAlign = 'center';
					const tdQ = document.createElement('td'); tdQ.textContent = fmt1.format((Number(ex.qty_per_unit || 0) || 0) * qtyNum); tdQ.style.textAlign = 'right'; tdQ.style.padding = '5px 4px';
					tr.append(tdL, tdN, tdQ); tbody.appendChild(tr);
				}
				table.appendChild(tbody); section.appendChild(table); card.appendChild(section);
			}
			cardsWrap.appendChild(card);
		}
	}

	function exportRows() {
		const fmtNum = (n) => Number((Number(n||0)).toFixed(1));
		const rows = [];
		for (const [key, qty] of Object.entries(counts)) {
			const qtyNum = Number(qty || 0);
			if (!qtyNum) continue;
			const dessertName = byKey.get(key) || key;
			const d = recipeCache?.byDessert?.get(dessertName);
			if (!d) continue;
			for (const step of (d.steps || [])) {
				for (const it of (step.items || [])) {
					rows.push({ Postre: dessertName, Ingrediente: it.ingredient, Cantidad: fmtNum(((Number(it.qty_per_unit || 0) || 0) * qtyNum) + (Number(it.adjustment || 0) || 0)) });
				}
			}
			const extras = Array.isArray(recipeCache.extras) ? recipeCache.extras : [];
			for (const ex of extras) rows.push({ Postre: dessertName, Ingrediente: ex.ingredient, Cantidad: fmtNum((Number(ex.qty_per_unit || 0) || 0) * qtyNum) });
		}
		const ws = XLSX.utils.json_to_sheet(rows);
		const wb = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(wb, ws, 'Medidas');
		const label = new Date().toISOString().slice(0,10).replaceAll('-','');
		XLSX.writeFile(wb, `Medidas_${label}.xlsx`);
	}

	exportBtn.addEventListener('click', exportRows);

	approveBtn.addEventListener('click', async () => {
		try {
			// Build counts payload
			const payload = { action: 'produccion', counts: { arco: 0, melo: 0, mara: 0, oreo: 0, nute: 0 }, actor_name: state.currentUser?.username || state.currentUser?.name || null };
			for (const [k, v] of counts.entries()) {
				if (k === 'arco' || k === 'melo' || k === 'mara' || k === 'oreo' || k === 'nute') payload.counts[k] = Number(v || 0) || 0;
			}
			const any = Object.values(payload.counts).some(n => Number(n||0) > 0);
			if (!any) { notify.error('No hay cantidades para aprobar'); return; }
			await api('POST', API.Inventory, payload);
			notify.success('Producción aprobada y descontada del inventario');
		} catch (e) { notify.error('No se pudo aprobar producción'); }
	});
	// initial render
	renderResults();
}

async function buildDessertCard(dessertName) {
	const data = await api('GET', `${API.Recipes}?dessert=${encodeURIComponent(dessertName)}&include_extras=1`);
	const card = document.createElement('div'); card.className = 'dessert-card';
	const head = document.createElement('div'); head.className = 'dessert-header';
	const title = document.createElement('h3'); title.textContent = dessertName;
	const addStep = document.createElement('button'); addStep.className = 'press-btn'; addStep.textContent = 'Agregar paso';
	const delDessert = document.createElement('button'); delDessert.className = 'press-btn'; delDessert.textContent = 'Eliminar postre';
	const actionsWrap = document.createElement('div'); actionsWrap.className = 'dessert-actions'; actionsWrap.append(addStep, delDessert);
	head.append(title, actionsWrap);
	const steps = document.createElement('div'); steps.className = 'steps-list';
	for (const s of (data.steps || [])) steps.appendChild(buildStepCard(dessertName, s));
	addStep.addEventListener('click', async () => {
		const name = prompt('Nombre del paso (o vacío para sin paso):');
		await api('POST', API.Recipes, { kind: 'step.upsert', dessert: dessertName, step_name: name || null });
		const fresh = await buildDessertCard(dessertName); card.replaceWith(fresh);
	});
	// Enable drag & drop for dessert cards
	card.draggable = true;
	card.addEventListener('dragstart', () => { card.classList.add('dragging'); });
	card.addEventListener('dragend', async () => {
		card.classList.remove('dragging');
		const grid = card.parentElement;
		if (!grid) return;
		const names = Array.from(grid.querySelectorAll('.dessert-card h3')).map(h => (h.textContent || '').toString());
		try { await api('POST', API.Recipes, { kind: 'dessert.order', names }); } catch {}
	});
	// Step-level DnD container
	steps.addEventListener('dragover', (e) => {
		e.preventDefault();
		const dragging = document.querySelector('.step-card.dragging');
		if (!dragging) return;
		const after = (() => {
			const els = [...steps.querySelectorAll('.step-card:not(.dragging)')];
			return els.reduce((closest, child) => {
				const rect = child.getBoundingClientRect();
				const offset = e.clientY - rect.top - rect.height / 2;
				if (offset < 0 && offset > closest.offset) return { offset, element: child };
				else return closest;
			}, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
		})();
		if (after == null) steps.appendChild(dragging); else steps.insertBefore(dragging, after);
	});
	card.append(head, steps);
	delDessert.addEventListener('click', async () => {
		const ok = confirm(`¿Eliminar el postre "${dessertName}" y todas sus recetas?`); if (!ok) return;
		try { await api('DELETE', `${API.Recipes}?kind=dessert&dessert=${encodeURIComponent(dessertName)}`); } catch {}
		await renderIngredientsView();
	});
	return card;
}

function buildStepCard(dessertName, step) {
	const box = document.createElement('div'); box.className = 'step-card';
	const head = document.createElement('div'); head.className = 'step-header';
	const label = document.createElement('div'); label.textContent = step.step_name || 'Sin nombre';
	const actions = document.createElement('div'); actions.className = 'items-actions';
	const add = document.createElement('button'); add.className = 'press-btn'; add.textContent = '+ Ingrediente';
	const del = document.createElement('button'); del.className = 'press-btn'; del.textContent = 'Eliminar paso';
	actions.append(add, del);
	head.append(label, actions);
	const table = document.createElement('table'); table.className = 'items-table';
	const thead = document.createElement('thead'); const hr = document.createElement('tr');
	['Ingrediente','Cantidad por unidad','Ajuste','Precio','Por paquete',''].forEach(t => { const th = document.createElement('th'); th.textContent = t; hr.appendChild(th); });
	thead.appendChild(hr);
	const tbody = document.createElement('tbody');
	for (const it of (step.items || [])) tbody.appendChild(buildItemRow(step.id, it));
	// Ensure empty steps have a visible drop target
	function hasRealRows(){ return !!tbody.querySelector('tr:not(.empty-drop)'); }
	function ensurePlaceholder(){
		if (hasRealRows()) { removePlaceholder(); return; }
		if (tbody.querySelector('tr.empty-drop')) return;
		const tr = document.createElement('tr'); tr.className = 'empty-drop';
		const td = document.createElement('td'); td.colSpan = 5; td.textContent = 'Suelta ingredientes aquí';
		td.style.opacity = '0.7'; td.style.textAlign = 'center'; td.style.padding = '14px'; td.style.border = '1px dashed var(--border)';
		tr.appendChild(td); tbody.appendChild(tr);
	}
	function removePlaceholder(){ const ph = tbody.querySelector('tr.empty-drop'); if (ph) ph.remove(); }
	ensurePlaceholder();
	table.append(thead, tbody);
	box.append(head, table);
	// Enable drag & drop for steps using the header as a handle
	box.draggable = false;
	head.draggable = true;
	head.addEventListener('dragstart', (e) => {
		try { if (e && e.dataTransfer) e.dataTransfer.setData('text/plain', 'step'); } catch {}
		box.__isStepDrag = true;
		box.classList.add('dragging');
	});
	head.addEventListener('dragend', async () => {
		if (!box.__isStepDrag) { box.classList.remove('dragging'); return; }
		box.__isStepDrag = false;
		box.classList.remove('dragging');
		const list = box.parentElement;
		if (!list) return;
		// Build ids from DOM order
		const stepIds = Array.from(list.querySelectorAll('.step-card')).map(el => Number(el.getAttribute('data-step-id')||'0')||0).filter(Boolean);
		if (!stepIds.length) return;
		try { await api('POST', API.Recipes, { kind: 'step.reorder', ids: stepIds }); } catch {}
	});
	add.addEventListener('click', async () => {
		const ing = (prompt('Ingrediente:') || '').trim(); if (!ing) return;
		const qty = Number(prompt('Cantidad por unidad:') || '0') || 0;
		const row = await api('POST', API.Recipes, { kind: 'item.upsert', recipe_id: step.id, ingredient: ing, unit: 'g', qty_per_unit: qty, adjustment: 0, price: 0, position: (step.items?.length||0)+1 });
		removePlaceholder();
		tbody.appendChild(buildItemRow(step.id, row));
	});
	del.addEventListener('click', async () => {
		const ok = confirm('¿Eliminar este paso y sus ingredientes?'); if (!ok) return;
		await api('DELETE', `${API.Recipes}?kind=step&id=${encodeURIComponent(step.id)}`);
		box.remove();
	});
	// Mark data-step-id to persist ordering
	box.setAttribute('data-step-id', String(step.id));
	// Inline rename of step name on click
	label.style.cursor = 'text';
	label.title = 'Haz clic para renombrar el paso';
	label.addEventListener('click', () => {
		if (label.__editing) return;
		label.__editing = true;
		const current = (step.step_name || '').toString();
		const input = document.createElement('input'); input.type = 'text'; input.value = current; input.style.flex = '1'; input.className = 'input-cell';
		function cleanup() { if (input.parentNode) input.parentNode.replaceWith(label); label.__editing = false; }
		async function commit() {
			const raw = (input.value || '').trim();
			const name = raw === '' ? null : raw;
			try { await api('POST', API.Recipes, { kind: 'step.upsert', id: step.id, dessert: dessertName, step_name: name, position: step.position || 0 }); }
			catch { notify.error('No se pudo renombrar el paso'); cleanup(); return; }
			step.step_name = name;
			label.textContent = name || 'Sin nombre';
			cleanup();
		}
		label.replaceWith(input);
		input.focus();
		input.select();
		input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') commit(); if (ev.key === 'Escape') cleanup(); });
		input.addEventListener('blur', commit);
	});
	// Ingredients rows drag & drop (supports reordering and cross-step move)
	tbody.addEventListener('dragover', (e) => {
		e.preventDefault();
		const dragging = document.querySelector('tr.dragging');
		if (!dragging) return;
		// Only preview order if dragging within this tbody
		if (dragging.parentElement === tbody) {
			const after = (() => {
				const els = [...tbody.querySelectorAll('tr:not(.dragging):not(.empty-drop)')];
				return els.reduce((closest, child) => {
					const rect = child.getBoundingClientRect();
					const offset = e.clientY - rect.top - rect.height / 2;
					if (offset < 0 && offset > closest.offset) return { offset, element: child };
					else return closest;
				}, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
			})();
			if (after == null) tbody.appendChild(dragging); else tbody.insertBefore(dragging, after);
		}
	});
	tbody.addEventListener('drop', async (e) => {
		e.preventDefault();
		try {
			if (!window.__draggingItemInfo) return;
			const info = window.__draggingItemInfo;
			if (!info.tr || !info.itemId) return;
			if (info.tr.parentElement === tbody) return; // same-step handled by dragend reorder
			// Determine insertion point
			const after = (() => {
				const els = [...tbody.querySelectorAll('tr:not(.empty-drop)')];
				return els.reduce((closest, child) => {
					const rect = child.getBoundingClientRect();
					const offset = e.clientY - rect.top - rect.height / 2;
					if (offset < 0 && offset > closest.offset) return { offset, element: child };
					else return closest;
				}, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
			})();
			removePlaceholder();
			if (after == null) tbody.appendChild(info.tr); else tbody.insertBefore(info.tr, after);
			// Update stepId on row
			info.tr.setAttribute('data-step-id', String(step.id));
			// Persist: move item to new step with current field values and position
			const rows = Array.from(tbody.querySelectorAll('tr'));
			const newIndex = rows.indexOf(info.tr);
			await api('POST', API.Recipes, {
				kind: 'item.upsert',
				id: info.itemId,
				recipe_id: step.id,
				ingredient: info.inN?.value || '',
				unit: 'g',
				qty_per_unit: Number(info.inQ?.value || 0) || 0,
				adjustment: Number(info.inAdj?.value || 0) || 0,
				price: Number(info.inP?.value || 0) || 0,
				position: newIndex + 1
			});
			// Reorder positions in target and source tbodys
			const targetIds = Array.from(tbody.querySelectorAll('tr')).map(r => Number(r.getAttribute('data-item-id')||'0')||0).filter(Boolean);
			if (targetIds.length) { try { await api('POST', API.Recipes, { kind: 'item.reorder', ids: targetIds }); } catch {} }
			if (info.fromTbody && info.fromTbody.isConnected) {
				const srcIds = Array.from(info.fromTbody.querySelectorAll('tr')).map(r => Number(r.getAttribute('data-item-id')||'0')||0).filter(Boolean);
				if (srcIds.length) { try { await api('POST', API.Recipes, { kind: 'item.reorder', ids: srcIds }); } catch {} }
			}
			ensurePlaceholder();
		} catch { notify.error('No se pudo mover el ingrediente'); }
	});
	return box;
}

function buildItemRow(stepId, item) {
	const tr = document.createElement('tr');
	const tdN = document.createElement('td'); const inN = document.createElement('input'); inN.type = 'text'; inN.value = item.ingredient; tdN.appendChild(inN);
	const tdQ = document.createElement('td'); const inQ = document.createElement('input'); inQ.type = 'number'; inQ.step = '0.01'; inQ.value = String(item.qty_per_unit || 0); tdQ.appendChild(inQ);
	const tdAdj = document.createElement('td'); const inAdj = document.createElement('input'); inAdj.type = 'number'; inAdj.step = '0.01'; inAdj.value = String(item.adjustment || 0); tdAdj.appendChild(inAdj);
	const tdP = document.createElement('td'); const inP = document.createElement('input'); inP.type = 'number'; inP.step = '0.01'; inP.value = String(item.price || 0); tdP.appendChild(inP);
	const tdPack = document.createElement('td'); const inPack = document.createElement('input'); inPack.type = 'number'; inPack.step = '0.01'; inPack.value = String(item.pack_size || 0); tdPack.appendChild(inPack);
	const tdA = document.createElement('td'); const del = document.createElement('button'); del.className = 'press-btn'; del.textContent = '×'; tdA.appendChild(del);
	tr.append(tdN, tdQ, tdAdj, tdP, tdPack, tdA);
	// DnD for ingredient rows
	tr.draggable = true;
	tr.addEventListener('dragstart', () => {
		tr.classList.add('dragging');
		window.__draggingItemInfo = { tr, itemId: item.id, fromTbody: tr.parentElement, inN, inQ, inAdj, inP };
	});
	tr.addEventListener('dragend', async () => {
		tr.classList.remove('dragging');
		const tbody = tr.parentElement;
		if (!tbody) return;
		const ids = Array.from(tbody.querySelectorAll('tr')).map(r => Number(r.getAttribute('data-item-id')||'0')||0).filter(Boolean);
		if (!ids.length) return;
		try { await api('POST', API.Recipes, { kind: 'item.reorder', ids }); } catch {}
		try { delete window.__draggingItemInfo; } catch {}
	});
	async function save() {
		try {
			await api('POST', API.Recipes, { kind: 'item.upsert', id: item.id, recipe_id: stepId, ingredient: inN.value, unit: 'g', qty_per_unit: Number(inQ.value || 0) || 0, adjustment: Number(inAdj.value || 0) || 0, price: Number(inP.value || 0) || 0, pack_size: Number(inPack.value || 0) || 0, position: item.position || 0 });
		} catch { notify.error('No se pudo guardar'); }
	}
	[inN, inQ, inAdj, inP, inPack].forEach(el => { el.addEventListener('change', save); el.addEventListener('blur', save); });
	del.addEventListener('click', async () => { await api('DELETE', `${API.Recipes}?kind=item&id=${encodeURIComponent(item.id)}`); tr.remove(); });
	// persist id on row
	tr.setAttribute('data-item-id', String(item.id));
	return tr;
}

async function openExtrasEditor() {
	const data = await api('GET', `${API.Recipes}?dessert=${encodeURIComponent('dummy')}&include_extras=1`);
	const extras = Array.isArray(data?.extras) ? data.extras : [];
	const pop = document.createElement('div'); pop.className = 'confirm-popover'; pop.style.position = 'fixed';
	pop.style.left = (window.innerWidth/2) + 'px'; pop.style.top = '12%'; pop.style.transform = 'translate(-50%, 0)';
	const title = document.createElement('h4'); title.textContent = 'Extras por unidad'; title.style.margin = '0 0 8px 0';
	const table = document.createElement('table'); table.className = 'items-table';
	const thead = document.createElement('thead'); const hr = document.createElement('tr');
	['Ingrediente','Cantidad','Precio','Por paquete',''].forEach(t => { const th = document.createElement('th'); th.textContent = t; hr.appendChild(th); }); thead.appendChild(hr);
	const tbody = document.createElement('tbody');
	for (const it of extras) tbody.appendChild(buildExtrasRow(it, tbody));
	const tfoot = document.createElement('tfoot'); const fr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 4; const add = document.createElement('button'); add.className = 'press-btn'; add.textContent = '+ Extra'; td.appendChild(add); fr.appendChild(td); tfoot.appendChild(fr);
	const actions = document.createElement('div'); actions.className = 'confirm-actions'; const close = document.createElement('button'); close.className = 'press-btn'; close.textContent = 'Cerrar'; actions.appendChild(close);
	add.addEventListener('click', async () => {
		const ing = (prompt('Ingrediente:') || '').trim(); if (!ing) return;
		const unit = 'unidad';
		const qty = Number(prompt('Cantidad por unidad:') || '1') || 0;
		const price = Number(prompt('Precio unitario:') || '0') || 0;
		const pack = Number(prompt('Cantidad por paquete (0 si no aplica):') || '0') || 0;
		const row = await api('POST', API.Recipes, { kind: 'extras.upsert', ingredient: ing, unit, qty_per_unit: qty, price, pack_size: pack, position: (extras.length||0)+1 });
		tbody.appendChild(buildExtrasRow(row, tbody));
	});
	close.addEventListener('click', () => { if (pop.parentNode) pop.parentNode.removeChild(pop); });
	pop.append(title, table, actions); table.append(thead, tbody, tfoot); document.body.appendChild(pop); pop.classList.add('aladdin-pop');
}

function buildExtrasRow(item, tbody) {
	const tr = document.createElement('tr');
	const tdN = document.createElement('td'); const inN = document.createElement('input'); inN.type = 'text'; inN.value = item.ingredient; tdN.appendChild(inN);
	const tdQ = document.createElement('td'); const inQ = document.createElement('input'); inQ.type = 'number'; inQ.step = '0.01'; inQ.style.width = '76px'; inQ.value = String(item.qty_per_unit || 0); tdQ.appendChild(inQ);
	const tdP = document.createElement('td'); const inP = document.createElement('input'); inP.type = 'number'; inP.step = '0.01'; inP.style.width = '88px'; inP.value = String(item.price || 0); tdP.appendChild(inP);
	const tdPack = document.createElement('td'); const inPack = document.createElement('input'); inPack.type = 'number'; inPack.step = '0.01'; inPack.style.width = '88px'; inPack.value = String(item.pack_size || 0); tdPack.appendChild(inPack);
	const tdA = document.createElement('td'); const del = document.createElement('button'); del.className = 'press-btn'; del.textContent = '×'; tdA.appendChild(del);
	tr.append(tdN, tdQ, tdP, tdPack, tdA);
	async function save() { try { await api('POST', API.Recipes, { kind: 'extras.upsert', id: item.id, ingredient: inN.value, unit: 'unidad', qty_per_unit: Number(inQ.value || 0) || 0, price: Number(inP.value || 0) || 0, pack_size: Number(inPack.value || 0) || 0, position: item.position || 0 }); } catch { notify.error('No se pudo guardar'); } }
	[inN, inQ, inP, inPack].forEach(el => { el.addEventListener('change', save); el.addEventListener('blur', save); });
	del.addEventListener('click', async () => { await api('DELETE', `${API.Recipes}?kind=extras&id=${encodeURIComponent(item.id)}`); if (tr.parentNode === tbody) tbody.removeChild(tr); });
	return tr;
}

async function buildRestoreReport() {
	const sellers = await api('GET', API.Sellers);
	const report = [];
	for (const s of (sellers || [])) {
		const days = await api('GET', `/api/days?seller_id=${encodeURIComponent(s.id)}`);
		for (const d of (days || [])) {
			const params = new URLSearchParams({ seller_id: String(s.id), sale_day_id: String(d.id) });
			let sales = [];
			try { sales = await api('GET', `${API.Sales}?${params.toString()}`); } catch { sales = []; }
			for (const row of (sales || [])) {
				const isAllZero = !Number(row.qty_arco||0) && !Number(row.qty_melo||0) && !Number(row.qty_mara||0) && !Number(row.qty_oreo||0) && !Number(row.qty_nute||0);
				if (!isAllZero) continue;
				let logs = [];
				try { logs = await api('GET', `${API.Sales}?history_for=${encodeURIComponent(row.id)}`); } catch { logs = []; }
				const restored = { arco: 0, melo: 0, mara: 0, oreo: 0, nute: 0 };
				for (const key of Object.keys(restored)) {
					const field = 'qty_' + key;
					const history = logs.filter(l => l.field === field);
					for (const h of history) {
						const prev = Number(h.new_value ?? h.newValue ?? 0) || 0;
						if (prev > 0) { restored[key] = prev; }
					}
				}
				const any = Object.values(restored).some(v => Number(v||0) > 0);
				if (!any) continue;
				report.push({
					seller: s.name,
					date: String(d.day).slice(0,10),
					client: row.client_name || '',
					qtys: restored
				});
			}
		}
	}
	return report;
}

function openRestoreReportDialog(items, anchorX, anchorY) {
	const pop = document.createElement('div');
	pop.className = 'confirm-popover';
	pop.style.position = 'fixed';
	const baseX = (typeof anchorX === 'number') ? anchorX : (window.innerWidth / 2);
	const baseY = (typeof anchorY === 'number') ? anchorY : (window.innerHeight / 2);
	pop.style.left = baseX + 'px'; pop.style.top = (baseY + 6) + 'px'; pop.style.transform = 'translate(-50%, 0)'; pop.style.zIndex = '1000';
	pop.style.maxWidth = 'min(92vw, 520px)'; pop.style.wordBreak = 'break-word';
	const title = document.createElement('div'); title.className = 'history-title'; title.textContent = 'Ventas restaurables';
	const list = document.createElement('div'); list.className = 'history-list'; list.style.maxHeight = '60vh'; list.style.overflow = 'auto';
	if (!items || items.length === 0) {
		const empty = document.createElement('div'); empty.className = 'history-item'; empty.textContent = 'No hay ventas para restaurar'; list.appendChild(empty);
	} else {
		for (const it of items) {
			const row = document.createElement('div'); row.className = 'history-item';
			row.textContent = `${it.seller} | ${it.date} | ${it.client} → Ar:${it.qtys.arco} Me:${it.qtys.melo} Ma:${it.qtys.mara} Or:${it.qtys.oreo} Nu:${it.qtys.nute}`;
			list.appendChild(row);
		}
	}
	const actions = document.createElement('div'); actions.className = 'confirm-actions';
	const closeBtn = document.createElement('button'); closeBtn.className = 'press-btn'; closeBtn.textContent = 'Cerrar';
	actions.append(closeBtn);
	pop.append(title, list, actions);
	document.body.appendChild(pop);
	function cleanup(){ document.removeEventListener('mousedown', outside, true); document.removeEventListener('touchstart', outside, true); if (pop.parentNode) pop.parentNode.removeChild(pop); }
	function outside(ev){ if (!pop.contains(ev.target)) cleanup(); }
	setTimeout(() => { document.addEventListener('mousedown', outside, true); document.addEventListener('touchstart', outside, true); }, 0);
	closeBtn.addEventListener('click', cleanup);
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
	const days = await api('GET', `/api/days?seller_id=${encodeURIComponent(sellerId)}${state.showArchivedOnly ? '&archived=1' : ''}`);
	state.saleDays = days;
	renderDaysList();
	// Toggle '+ Nueva Fecha' visibility in archive mode
	const newBtn = document.getElementById('date-new');
	if (newBtn) newBtn.style.display = state.showArchivedOnly ? 'none' : '';
	// Update title and button label to match mode on load
	const archBtn = document.getElementById('archive-button');
	if (archBtn) {
		archBtn.classList.toggle('btn-gold', !!state.showArchivedOnly);
		archBtn.textContent = state.showArchivedOnly ? 'Activos' : 'Archivo';
	}
	const title = document.getElementById('sales-title');
	if (title) title.textContent = state.showArchivedOnly ? 'Registro de Ventas de Postres (Archivo)' : 'Registro de Ventas de Postres';
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
	const isSuper = state.currentUser?.role === 'superadmin' || !!state.currentUser?.isSuperAdmin;
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
		// Superadmin archive icon
		if (isSuper) {
			const arch = document.createElement('button');
			arch.className = 'date-archive';
			arch.title = d.is_archived ? 'Desarchivar fecha' : 'Archivar fecha';
			arch.addEventListener('click', async (e) => {
				e.stopPropagation();
				const makeArchived = !d.is_archived;
				await api('PATCH', '/api/days', { id: d.id, is_archived: makeArchived });
				await loadDaysForSeller();
				try { notify.success(makeArchived ? 'Fecha archivada' : 'Fecha desarchivada'); } catch {}
			});
			item.appendChild(arch);
		}
		item.appendChild(del);
		list.appendChild(item);
	}
	// Preview: auto-open the most recent date when entering seller view
	try {
		if (!state.selectedDayId && !state.showArchivedOnly) {
			const days = Array.isArray(state.saleDays) ? state.saleDays.slice() : [];
			if (days.length) {
				let latest = days[0];
				let latestTs = Date.parse(String(latest.day).slice(0,10));
				for (let i = 1; i < days.length; i++) {
					const ts = Date.parse(String(days[i].day).slice(0,10));
					if (!isNaN(ts) && (isNaN(latestTs) || ts > latestTs)) { latest = days[i]; latestTs = ts; }
				}
				if (latest && latest.id) {
					state.selectedDayId = latest.id;
					const wrap = document.getElementById('sales-wrapper');
					if (wrap) wrap.classList.remove('hidden');
					loadSales().catch(()=>{});
				}
			}
		}
	} catch {}
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
	pop.style.zIndex = '10000';
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
	
	// Hide initially to avoid flash
	pop.style.visibility = 'hidden';
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
		
		// Calculate position centered below anchor
		let left = baseX - r.width / 2;
		let top = baseY + 8;
		
		// Check if it fits below; if not, place above
		if (top + r.height > viewTop + viewH - margin) {
			top = baseY - 8 - r.height;
		}
		
		// Clamp horizontal position within viewport
		if (left < viewLeft + margin) left = viewLeft + margin;
		if (left + r.width > viewLeft + viewW - margin) left = viewLeft + viewW - margin - r.width;
		
		// Clamp vertical position within viewport
		if (top < viewTop + margin) top = viewTop + margin;
		if (top + r.height > viewTop + viewH - margin) top = viewTop + viewH - margin - r.height;
		
		// On very small screens, center it
		if (isSmall && (r.width > viewW * 0.9 || r.height > viewH * 0.9)) {
			left = viewLeft + (viewW - r.width) / 2;
			top = viewTop + (viewH - r.height) / 2;
		}
		
		pop.style.left = left + 'px';
		pop.style.top = top + 'px';
		pop.style.transform = 'none';
		pop.style.visibility = 'visible';
	});
	document.addEventListener('mousedown', outside, true);
	document.addEventListener('touchstart', outside, true);
	render();
}

function openMultiCalendarPopover(onPickedList, anchorX, anchorY, opts) {
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
	// Aladdin style animation
	pop.classList.add('aladdin-pop');
	
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
		if ((opts && opts.preferUp) || (isSmall && baseY > (viewTop + viewH * 0.6))) { top = baseY - 8 - r.height; }
		left = Math.min(Math.max(left, viewLeft + margin), viewLeft + viewW - margin);
		top = Math.min(Math.max(top, viewTop + margin), viewTop + viewH - margin);
		pop.style.left = left + 'px'; pop.style.top = top + 'px';
	});
	render();
}

function openRangeCalendarPopover(onPickedRange, anchorX, anchorY, opts) {
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
	let startIso = null; let endIso = null;

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
	function isBetween(x, a, b) { return x >= a && x <= b; }

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
			let cls = 'date-cell';
			if (startIso && !endIso && iso === startIso) cls += ' range-start selected';
			if (startIso && endIso) {
				if (iso === startIso) cls += ' range-start selected';
				else if (iso === endIso) cls += ' range-end selected';
				else if (isBetween(iso, startIso, endIso)) cls += ' in-range';
			}
			cell.className = cls;
			cell.textContent = String(d);
			cell.addEventListener('click', () => {
				if (!startIso) { startIso = iso; endIso = null; render(); return; }
				if (!endIso) {
					if (iso < startIso) { endIso = startIso; startIso = iso; } else { endIso = iso; }
					render();
					return;
				}
				// If both set, restart selection
				startIso = iso; endIso = null; render();
			});
			grid.appendChild(cell);
		}
	}

	function cleanup() { document.removeEventListener('mousedown', outside, true); document.removeEventListener('touchstart', outside, true); if (pop.parentNode) pop.parentNode.removeChild(pop); }
	function outside(ev) { if (!pop.contains(ev.target)) cleanup(); }

	prev.addEventListener('click', () => { view.setMonth(view.getMonth() - 1); render(); });
	next.addEventListener('click', () => { view.setMonth(view.getMonth() + 1); render(); });

	const actions = document.createElement('div'); actions.style.display = 'flex'; actions.style.justifyContent = 'space-between'; actions.style.marginTop = '8px';
	const clearBtn = document.createElement('button'); clearBtn.className = 'date-nav'; clearBtn.textContent = 'Limpiar';
	const genBtn = document.createElement('button'); genBtn.className = 'date-nav'; genBtn.textContent = 'Generar'; genBtn.disabled = true;
	clearBtn.addEventListener('click', () => { startIso = null; endIso = null; genBtn.disabled = true; render(); });
	genBtn.addEventListener('click', () => { if (startIso && endIso && typeof onPickedRange === 'function') { cleanup(); onPickedRange({ start: startIso, end: endIso }); } });
	actions.append(clearBtn, genBtn);

	function updateActions() { genBtn.disabled = !(startIso && endIso); }

	// wrap original render to update actions
	const origRender = render;
	render = function(){ origRender(); updateActions(); };

	pop.append(header, wk, grid, actions);
	document.body.appendChild(pop);
	// Aladdin style animation
	pop.classList.add('aladdin-pop');

	requestAnimationFrame(() => {
		const margin = 8;
		const vv = window.visualViewport;
		const viewW = (vv && typeof vv.width === 'number') ? vv.width : window.innerWidth;
		const viewH = (vv && typeof vv.height === 'number') ? vv.height : window.innerHeight;
		const viewLeft = (vv && typeof vv.offsetLeft === 'number') ? vv.offsetLeft : 0;
		const viewTop = (vv && typeof vv.offsetTop === 'number') ? vv.offsetTop : 0;
		const r = pop.getBoundingClientRect();
		let left = baseX;
		let top = baseY + 8;
		if (opts && opts.preferUp) top = baseY - 8 - r.height;
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
		function outside(ev) { if (!pop.contains(ev.target)) { cleanup(); resolve(false); } }
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
	// Helpers to track if payment-date popover was already shown for a sale+method
	function hasSeenPaymentDateDialogForSale(saleId, method) {
		try { return localStorage.getItem('seenPaymentDate_' + String(method || '') + '_' + String(saleId || '')) === '1'; } catch { return false; }
	}
	function markSeenPaymentDateDialogForSale(saleId, method) {
		try { localStorage.setItem('seenPaymentDate_' + String(method || '') + '_' + String(saleId || ''), '1'); } catch {}
	}
	const items = [
		{ v: 'efectivo', cls: 'menu-efectivo' },
		{ v: 'entregado', cls: 'menu-entregado' }
	];
	if (String(state.currentUser?.name || '').toLowerCase() === 'marcela') {
		items.push({ v: 'marce', cls: 'menu-marce' });
	}
	const isJorgeUser = String(state.currentUser?.name || '').toLowerCase() === 'jorge';
	if (isJorgeUser) {
		items.push({ v: 'jorge', cls: 'menu-jorge' });
		// jorgebank removed from menu - internal only
	}
	items.push({ v: '', cls: 'menu-clear' }, { v: 'transf', cls: 'menu-transf' });
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
		// Special behavior: first time selecting 'jorge' open payment-date popover centered
		if (currentSaleId && it.v === 'jorge') {
			const firstTime = !hasSeenPaymentDateDialogForSale(currentSaleId, it.v);
			if (firstTime) {
				markSeenPaymentDateDialogForSale(currentSaleId, it.v);
				// Open centered popover (it positions itself to center)
				setTimeout(() => openPaymentDateDialog(currentSaleId), 0);
				cleanup();
				return;
			}
		}
		// If selecting transf, show existing receipt if any; otherwise open upload
		if (it.v === 'transf' && currentSaleId) {
			cleanup();
			// Use setTimeout to avoid blocking and ensure proper async execution
			setTimeout(() => {
				openReceiptsGalleryPopover(currentSaleId, rect.left + rect.width / 2, rect.bottom).catch(err => {
					console.error('Error opening gallery from menu:', err);
					openReceiptUploadPage(currentSaleId);
				});
			}, 0);
			return;
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

// Function to position comment marker dynamically after client name text
function updateCommentMarkerPosition(inputElement, markerElement) {
	if (!inputElement || !markerElement) return;
	
	// Position at the end (right side) of the input
	markerElement.style.left = 'auto';
	markerElement.style.right = '8px';
}

// Payment date dialog with calendar and payment method options
function openPaymentDateDialog(saleId, anchorX, anchorY, onCloseCallback) {
	const sale = state.sales.find(s => s.id === saleId);
	if (!sale) return;
	
	const pop = document.createElement('div');
	pop.className = 'payment-date-popover';
	pop.style.position = 'fixed';
	pop.style.zIndex = '1000';
	// Position will be set after content is rendered
	
	// Title
	const title = document.createElement('div');
	title.className = 'payment-date-title';
	title.textContent = 'Fecha de pago';
	
	// Create inline calendar
	const calendarContainer = document.createElement('div');
	calendarContainer.className = 'inline-calendar';
	
	const today = new Date();
	
	// Use previously saved date if exists, otherwise use today
	let initialDate = new Date();
	
	// Try to get saved date from multiple sources
	const savedDate = sale.payment_date || (sale._paymentInfo && sale._paymentInfo.date);
	if (savedDate) {
		try {
			// Handle different date formats (ISO, date object, etc)
			let dateStr;
			if (typeof savedDate === 'string') {
				dateStr = savedDate.slice(0, 10); // Get YYYY-MM-DD
			} else if (savedDate instanceof Date) {
				dateStr = savedDate.toISOString().slice(0, 10);
			} else {
				dateStr = String(savedDate).slice(0, 10);
			}
			
			initialDate = new Date(dateStr + 'T00:00:00');
			
			// Validate the date is valid
			if (isNaN(initialDate.getTime())) {
				console.warn('Invalid date, using today. Original value:', savedDate);
				initialDate = new Date();
			}
		} catch (e) {
			console.error('Error parsing date:', e, 'Original value:', savedDate);
			initialDate = new Date();
		}
	}
	
	let currentMonth = initialDate.getMonth();
	let currentYear = initialDate.getFullYear();
	let selectedDate = new Date(initialDate);
	
	// Calendar header with navigation
	const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
	const calendarHeader = document.createElement('div');
	calendarHeader.className = 'calendar-header';
	
	const prevBtn = document.createElement('button');
	prevBtn.className = 'calendar-nav-btn';
	prevBtn.innerHTML = '◀';
	prevBtn.type = 'button';
	
	const monthLabel = document.createElement('span');
	monthLabel.className = 'calendar-month-label';
	monthLabel.textContent = `${monthNames[currentMonth]} ${currentYear}`;
	
	const nextBtn = document.createElement('button');
	nextBtn.className = 'calendar-nav-btn';
	nextBtn.innerHTML = '▶';
	nextBtn.type = 'button';
	
	calendarHeader.appendChild(prevBtn);
	calendarHeader.appendChild(monthLabel);
	calendarHeader.appendChild(nextBtn);
	
	// Calendar days grid
	const calendarGrid = document.createElement('div');
	calendarGrid.className = 'calendar-grid';
	
	// Function to render/re-render calendar
	function renderCalendar() {
		calendarGrid.innerHTML = '';
		monthLabel.textContent = `${monthNames[currentMonth]} ${currentYear}`;
		
		// Day headers
		const dayNames = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
		dayNames.forEach(day => {
			const dayHeader = document.createElement('div');
			dayHeader.className = 'calendar-day-header';
			dayHeader.textContent = day;
			calendarGrid.appendChild(dayHeader);
		});
		
		// Get first day of month and number of days
		const firstDay = new Date(currentYear, currentMonth, 1).getDay();
		const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
		
		// Empty cells for days before month starts
		for (let i = 0; i < firstDay; i++) {
			const emptyCell = document.createElement('div');
			emptyCell.className = 'calendar-day empty';
			calendarGrid.appendChild(emptyCell);
		}
		
		// Day cells
		for (let day = 1; day <= daysInMonth; day++) {
			const dayCell = document.createElement('div');
			dayCell.className = 'calendar-day';
			dayCell.textContent = day;
			
			const cellDate = new Date(currentYear, currentMonth, day);
			if (cellDate.toDateString() === today.toDateString()) {
				dayCell.classList.add('today');
			}
			
			// Check if this date is selected
			if (selectedDate && 
				selectedDate.getDate() === day && 
				selectedDate.getMonth() === currentMonth && 
				selectedDate.getFullYear() === currentYear) {
				dayCell.classList.add('selected');
			}
			
			dayCell.addEventListener('click', () => {
				document.querySelectorAll('.calendar-day').forEach(d => d.classList.remove('selected'));
				dayCell.classList.add('selected');
				selectedDate = new Date(currentYear, currentMonth, day);
			});
			
			calendarGrid.appendChild(dayCell);
		}
	}
	
	// Add event listeners for prev/next buttons
	prevBtn.addEventListener('click', (e) => {
		e.preventDefault();
		currentMonth--;
		if (currentMonth < 0) {
			currentMonth = 11;
			currentYear--;
		}
		renderCalendar();
	});
	
	nextBtn.addEventListener('click', (e) => {
		e.preventDefault();
		currentMonth++;
		if (currentMonth > 11) {
			currentMonth = 0;
			currentYear++;
		}
		renderCalendar();
	});
	
	calendarContainer.appendChild(calendarHeader);
	calendarContainer.appendChild(calendarGrid);
	
	// Initial render
	renderCalendar();
	
	// Payment method label
	const methodLabel = document.createElement('div');
	methodLabel.className = 'payment-date-label';
	methodLabel.textContent = 'Fuente de pago:';
	methodLabel.style.marginTop = '14px';
	
	// Payment method buttons - auto-save on click
	const methodsContainer = document.createElement('div');
	methodsContainer.className = 'payment-methods-container';
	
	const methods = [
		{ value: 'bancolombia', label: 'Bancolombia' },
		{ value: 'nequi', label: 'Nequi' },
		{ value: 'efectivo_marcela', label: 'Efectivo Marcela' },
		{ value: 'efectivo_aleja', label: 'Efectivo Aleja' },
		{ value: 'bancolombia_aleja', label: 'Bancolombia Aleja' },
		{ value: 'otro', label: 'Otro' }
	];
	
	// Get previously selected source if exists (try multiple sources)
	const previousSource = sale.payment_source || (sale._paymentInfo && sale._paymentInfo.source);
	
	methods.forEach(method => {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'payment-method-btn';
		btn.textContent = method.label;
		btn.dataset.value = method.value;
		
		// Pre-select if this was the previously chosen source
		// Check both label and value for matching
		const isSelected = previousSource && (
			method.label === previousSource || 
			method.label.toLowerCase() === previousSource.toLowerCase() ||
			method.value === previousSource.toLowerCase()
		);
		
		if (isSelected) {
			btn.classList.add('selected');
		}
		
	btn.addEventListener('click', async () => {
		// Disable all buttons while saving
		methodsContainer.querySelectorAll('button').forEach(b => b.disabled = true);
		
		try {
			const paymentDate = selectedDate.toISOString().split('T')[0];
			const paymentSource = method.label;
			
			// Get current sale data
			const idx = state.sales.findIndex(s => s.id === saleId);
			if (idx === -1) {
				throw new Error('Venta no encontrada');
			}
			
		const currentSale = state.sales[idx];
		
		// Update the database with payment date and source
		// IMPORTANT: Include all fields to prevent overwriting existing data
		// NOTE: payment_source is separate from pay_method to avoid overwriting old payment methods
		const body = {
			id: saleId,
			seller_id: currentSale.seller_id,
			sale_day_id: currentSale.sale_day_id,
			client_name: currentSale.client_name || '',
			payment_date: paymentDate,
			payment_source: paymentSource,
			comment_text: currentSale.comment_text || '',
			is_paid: currentSale.is_paid || false,
			_actor_name: state.actorName || ''
		};
		
		// Include quantities for all desserts (support both formats)
		if (Array.isArray(currentSale.items) && currentSale.items.length > 0) {
			body.items = currentSale.items;
		} else {
			// Legacy format: include qty_* fields for all desserts (dynamic)
			if (Array.isArray(state.desserts)) {
				for (const d of state.desserts) {
					const fieldName = `qty_${d.short_code}`;
					body[fieldName] = currentSale[fieldName] || 0;
				}
			} else {
				// Fallback to hardcoded original desserts
				body.qty_arco = currentSale.qty_arco || 0;
				body.qty_melo = currentSale.qty_melo || 0;
				body.qty_mara = currentSale.qty_mara || 0;
				body.qty_oreo = currentSale.qty_oreo || 0;
				body.qty_nute = currentSale.qty_nute || 0;
			}
		}
		
		const updated = await api('PUT', API.Sales, body);
			
			// Update in memory
			if (updated) {
				state.sales[idx].payment_date = paymentDate;
				state.sales[idx].payment_source = paymentSource;
				state.sales[idx]._paymentInfo = {
					date: paymentDate,
					source: paymentSource,
					sourceValue: method.value
				};
			}
			
			try { notify.success(`Fecha de pago guardada: ${paymentDate} - ${paymentSource}`); } catch {}
			
			// Save sale ID to preserve border after re-render
			const preserveBorderForSaleId = saleId;
			
			cleanup(false); // Close popup without triggering fade yet
			
			// Refresh the UI to show the updated payment info
			if (typeof renderSalesView === 'function') {
				renderSalesView();
			}
			
			// Re-apply border to the updated element and then fade it
			setTimeout(() => {
				// Find the new TD element for this sale after re-render
				const allClientInputs = document.querySelectorAll('.client-input');
				for (const input of allClientInputs) {
					const td = input.closest('td');
					const row = td?.closest('tr');
					if (row && row.dataset.saleId == preserveBorderForSaleId) {
						// Apply classes to show border
						td.classList.add('action-bar-active');
						// Then immediately start fade
						requestAnimationFrame(() => {
							td.classList.remove('action-bar-active');
							td.classList.add('action-bar-fading');
							setTimeout(() => {
								td.classList.remove('action-bar-fading');
							}, 2000);
						});
						break;
					}
				}
			}, 50); // Small delay to ensure re-render is complete
		} catch (e) {
			console.error('Error al guardar fecha de pago:', e);
			try { notify.error('Error al guardar: ' + (e.message || 'Error desconocido')); } catch {}
			methodsContainer.querySelectorAll('button').forEach(b => b.disabled = false);
		}
	});
		
		methodsContainer.appendChild(btn);
	});
	
	pop.append(title, calendarContainer, methodLabel, methodsContainer);
	document.body.appendChild(pop);
	
	// Position popover in center of viewport after appending to measure dimensions
	requestAnimationFrame(() => {
		const popRect = pop.getBoundingClientRect();
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		
		// Calculate center position
		let left = (viewportWidth - popRect.width) / 2;
		let top = (viewportHeight - popRect.height) / 2;
		
		// Ensure popover stays within viewport bounds with padding
		const padding = 16;
		if (left < padding) left = padding;
		if (top < padding) top = padding;
		if (left + popRect.width > viewportWidth - padding) {
			left = viewportWidth - popRect.width - padding;
		}
		if (top + popRect.height > viewportHeight - padding) {
			top = viewportHeight - popRect.height - padding;
		}
		
		pop.style.left = left + 'px';
		pop.style.top = top + 'px';
		pop.style.transform = 'none';
	});
	
	function cleanup(triggerFade = true) {
		document.removeEventListener('mousedown', outside, true);
		document.removeEventListener('touchstart', outside, true);
		if (pop.parentNode) pop.parentNode.removeChild(pop);
		// Call the callback to close action bar with fade animation only if triggerFade is true
		if (triggerFade && typeof onCloseCallback === 'function') {
			onCloseCallback();
		}
	}
	
	function outside(ev) {
		if (!pop.contains(ev.target)) cleanup(true); // Manual close, trigger fade
	}
	
	setTimeout(() => {
		document.addEventListener('mousedown', outside, true);
		document.addEventListener('touchstart', outside, true);
	}, 0);
}

// Client action bar for sales table
let activeClientActionBar = null;

function openClientActionBar(tdElement, saleId, clientName, clickX, clickY) {
	// Close any existing action bar
	closeClientActionBar();
	
	// Create action bar
	const actionBar = document.createElement('div');
	actionBar.className = 'client-action-bar';
	actionBar.style.position = 'fixed';
	
	// Position at click coordinates if provided
	if (typeof clickX === 'number' && typeof clickY === 'number') {
		actionBar.style.left = clickX + 'px';
		actionBar.style.top = (clickY - 10) + 'px'; // 10px above click
		actionBar.style.transform = 'translate(-50%, -100%)';
	}
	
	// Edit button (opens edit popover or shows lock message)
	const editBtn = document.createElement('button');
	editBtn.className = 'client-action-bar-btn';
	editBtn.innerHTML = '<span class="client-action-bar-btn-icon">✏️</span><span class="client-action-bar-btn-label">Editar</span>';
	editBtn.title = 'Editar pedido';
	editBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		const sale = state.sales.find(s => s.id === saleId);
		const isAdminUser = !!state.currentUser?.isAdmin || state.currentUser?.role === 'superadmin';
		const locked = String(sale?.pay_method || '').trim() !== '';
		if (!isAdminUser && locked) {
			try { notify.error('Ya no es posible editar este pedido ya que ha sido entregado al cliente. Para editarlo por favor pide soporte.'); } catch {}
			return;
		}
		// Hide the action bar but keep the outline active
		actionBar.classList.remove('active');
		// Get position for popover
		const rect = tdElement.getBoundingClientRect();
		openEditSalePopover(saleId, rect.left + rect.width / 2, rect.top, () => {
			closeClientActionBar();
		});
	});
	
	// Comment button (opens comment dialog directly)
	const commentBtn = document.createElement('button');
	commentBtn.className = 'client-action-bar-btn';
	commentBtn.innerHTML = '<span class="client-action-bar-btn-icon">💬</span><span class="client-action-bar-btn-label">Comentario</span>';
	commentBtn.title = 'Agregar/editar comentario';
	commentBtn.addEventListener('click', async (e) => {
		e.stopPropagation();
		const btnClickX = e.clientX;
		const btnClickY = e.clientY;
		// Hide the action bar but keep the outline active
		actionBar.classList.remove('active');
		const input = tdElement.querySelector('.client-input');
		if (input) {
			// Get current comment text
			const sale = state.sales.find(s => s.id === saleId);
			const currentComment = sale?.comment_text || '';
			// Open comment dialog above the click position
			await openCommentDialog(input, currentComment, btnClickX, btnClickY, saleId, () => {
				closeClientActionBar();
			});
			// Re-render table to show/update comment marker
			renderTable();
		}
	});
	
	// History button (opens client detail view)
	const historyBtn = document.createElement('button');
	historyBtn.className = 'client-action-bar-btn';
	historyBtn.innerHTML = '<span class="client-action-bar-btn-icon">📋</span><span class="client-action-bar-btn-label">Historial</span>';
	historyBtn.title = 'Historial del cliente';
	historyBtn.addEventListener('click', async (e) => {
		e.stopPropagation();
		// Close action bar with fade effect immediately since we're changing views
		closeClientActionBar();
		if (clientName && clientName.trim()) {
			await openClientDetailView(clientName.trim());
		}
	});
	
	actionBar.appendChild(editBtn);
	actionBar.appendChild(commentBtn);
	actionBar.appendChild(historyBtn);
	
	// Payment date button (only for superadmin)
	const isSuperAdmin = state.currentUser?.role === 'superadmin' || !!state.currentUser?.isSuperAdmin;
	if (isSuperAdmin) {
		const paymentBtn = document.createElement('button');
		paymentBtn.className = 'client-action-bar-btn';
		
		// Get sale data to check if payment date is set
		const sale = state.sales.find(s => s.id === saleId);
	// Check if sale has transfer/bank method to show receipts gallery instead
	const payMethod = (sale?.pay_method || '').toLowerCase();
	const isTransferMethod = payMethod === 'transf' || payMethod === 'jorgebank';
	
	const hasPaymentInfo = sale?.payment_date && (sale?.payment_source || sale?.pay_method);
	
	if (hasPaymentInfo) {
		// Format date for display (DD/MM)
		const dateStr = sale.payment_date;
		const dateParts = dateStr.split('-');
		const displayDate = dateParts.length >= 3 ? `${dateParts[2]}/${dateParts[1]}` : dateStr;
		const sourceOrMethod = sale.payment_source || sale.pay_method || '';
		paymentBtn.innerHTML = `<span class="client-action-bar-btn-icon">📅</span><span class="client-action-bar-btn-label">${displayDate}</span>`;
		paymentBtn.title = `Fecha de pago: ${displayDate}${sourceOrMethod ? ' - ' + sourceOrMethod : ''}`;
		paymentBtn.style.fontWeight = 'bold';
	} else if (isTransferMethod) {
		// For transfer methods, show "Ver comprobantes" instead
		paymentBtn.innerHTML = '<span class="client-action-bar-btn-icon">📷</span><span class="client-action-bar-btn-label">Comprobantes</span>';
		paymentBtn.title = 'Ver y gestionar comprobantes de pago';
	} else {
		paymentBtn.innerHTML = '<span class="client-action-bar-btn-icon">📅</span><span class="client-action-bar-btn-label">Fecha</span>';
		paymentBtn.title = 'Fecha y método de pago';
	}
	
	paymentBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		const btnClickX = e.clientX;
		const btnClickY = e.clientY;
		// Hide the action bar but keep the outline active
		actionBar.classList.remove('active');
		
		// If transfer/bank method, open receipts gallery instead of single date dialog
		if (isTransferMethod) {
			openReceiptsGalleryPopover(saleId, btnClickX, btnClickY);
			closeClientActionBar();
		} else {
			// For other methods, use the single date dialog
			openPaymentDateDialog(saleId, btnClickX, btnClickY, () => {
				closeClientActionBar();
			});
		}
	});
		actionBar.appendChild(paymentBtn);
	}
	
	tdElement.appendChild(actionBar);
	tdElement.classList.add('action-bar-active');
	
	// Show with animation
	setTimeout(() => actionBar.classList.add('active'), 10);
	
	activeClientActionBar = { bar: actionBar, td: tdElement };
	
	// Close on outside click
	const outsideClick = (e) => {
		if (!tdElement.contains(e.target)) {
			closeClientActionBar();
		}
	};
	
	setTimeout(() => {
		document.addEventListener('mousedown', outsideClick, true);
		document.addEventListener('touchstart', outsideClick, true);
	}, 0);
	
	// Store cleanup function
	activeClientActionBar.cleanup = () => {
		document.removeEventListener('mousedown', outsideClick, true);
		document.removeEventListener('touchstart', outsideClick, true);
	};
}

function closeClientActionBar(skipFade = false) {
	if (activeClientActionBar) {
		if (activeClientActionBar.cleanup) {
			activeClientActionBar.cleanup();
		}
		if (activeClientActionBar.bar && activeClientActionBar.bar.parentNode) {
			activeClientActionBar.bar.remove();
		}
		if (activeClientActionBar.td && !skipFade) {
			const td = activeClientActionBar.td;
			
			// Remove active class and add fading class to start fade animation
			td.classList.remove('action-bar-active');
			td.classList.add('action-bar-fading');
			
			// After 2 seconds, remove the fading class
			setTimeout(() => {
				td.classList.remove('action-bar-fading');
			}, 2000);
		} else if (activeClientActionBar.td && skipFade) {
			// Just remove classes without fade
			const td = activeClientActionBar.td;
			td.classList.remove('action-bar-active', 'action-bar-fading');
		}
		activeClientActionBar = null;
	}
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
	// Toggle archived-only view
	const archBtn = document.getElementById('archive-button');
	archBtn?.addEventListener('click', async () => {
		state.showArchivedOnly = !state.showArchivedOnly;
		archBtn.classList.toggle('btn-gold', !!state.showArchivedOnly);
		archBtn.textContent = state.showArchivedOnly ? 'Activos' : 'Archivo';
		const title = document.getElementById('sales-title');
		if (title) title.textContent = state.showArchivedOnly ? 'Registro de Ventas de Postres (Archivo)' : 'Registro de Ventas de Postres';
		await loadDaysForSeller();
		// In archive mode, hide the table until a date is picked
		if (state.showArchivedOnly) {
			const wrap = document.getElementById('sales-wrapper');
			if (wrap) wrap.classList.add('hidden');
			state.selectedDayId = null;
		}
	});
})();

async function openArchiveManager(anchorX, anchorY, sellerName) {
	// Fetch both active and archived
	const sellerId = state.currentSeller?.id;
	if (!sellerId) return;
	const [active, archived] = await Promise.all([
		api('GET', `/api/days?seller_id=${encodeURIComponent(sellerId)}&include_archived=1`),
		api('GET', `/api/days?seller_id=${encodeURIComponent(sellerId)}&archived=1`)
	]);
	const pop = document.createElement('div');
	pop.className = 'archive-popover';
	pop.style.position = 'fixed';
	pop.style.left = anchorX + 'px';
	pop.style.top = (anchorY + 8) + 'px';
	pop.style.transform = 'translate(-50%, 0)';
	pop.style.zIndex = '1000';
	const title = document.createElement('h4');
	title.textContent = `Archivo de ${sellerName}`.trim();
	const listWrap = document.createElement('div'); listWrap.className = 'archive-list';
	// Build checkboxes of active days
	const activeDays = Array.isArray(active) ? active.filter(d => d && d.id && !d.is_archived) : [];
	if (activeDays.length === 0) {
		const empty = document.createElement('div'); empty.textContent = 'Sin fechas activas'; empty.style.opacity = '0.8'; listWrap.appendChild(empty);
	} else {
		for (const d of activeDays) {
			const row = document.createElement('label'); row.style.display = 'flex'; row.style.alignItems = 'center'; row.style.gap = '8px';
			const cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = String(d.id);
			const span = document.createElement('span'); span.textContent = formatDayLabel(d.day);
			row.append(cb, span); listWrap.appendChild(row);
		}
	}
	// Section for archived days with quick restore
	const archTitle = document.createElement('div'); archTitle.textContent = 'Archivadas'; archTitle.style.marginTop = '8px'; archTitle.style.fontWeight = '600';
	const archList = document.createElement('div'); archList.style.display = 'grid'; archList.style.gap = '6px';
	const archivedDays = Array.isArray(archived) ? archived : [];
	if (archivedDays.length === 0) {
		const empty = document.createElement('div'); empty.textContent = 'Sin archivadas'; empty.style.opacity = '0.8'; archList.appendChild(empty);
	} else {
		for (const d of archivedDays) {
			const row = document.createElement('div'); row.style.display = 'flex'; row.style.justifyContent = 'space-between'; row.style.alignItems = 'center';
			const lbl = document.createElement('span'); lbl.textContent = formatDayLabel(d.day);
			const un = document.createElement('button'); un.className = 'press-btn'; un.textContent = 'Desarchivar';
			un.addEventListener('click', async () => {
				await api('PATCH', '/api/days', { id: d.id, is_archived: false });
				try { notify.success('Fecha desarchivada'); } catch {}
				if (pop.parentNode) pop.parentNode.removeChild(pop);
				await loadDaysForSeller();
			});
			row.append(lbl, un); archList.appendChild(row);
		}
	}
	const actions = document.createElement('div'); actions.className = 'archive-actions';
	const cancelBtn = document.createElement('button'); cancelBtn.className = 'press-btn'; cancelBtn.textContent = 'Cerrar';
	const applyBtn = document.createElement('button'); applyBtn.className = 'press-btn btn-primary'; applyBtn.textContent = 'Archivar seleccionadas';
	applyBtn.addEventListener('click', async () => {
		const ids = Array.from(listWrap.querySelectorAll('input[type="checkbox"]')).filter(i => i.checked).map(i => Number(i.value)).filter(Boolean);
		if (ids.length === 0) { try { notify.info('Selecciona al menos una fecha'); } catch {} return; }
		await api('PATCH', '/api/days', { ids, is_archived: true });
		try { notify.success('Fechas archivadas'); } catch {}
		if (pop.parentNode) pop.parentNode.removeChild(pop);
		await loadDaysForSeller();
	});
	cancelBtn.addEventListener('click', () => { if (pop.parentNode) pop.parentNode.removeChild(pop); });
	pop.append(title, listWrap, archTitle, archList, actions);
	actions.append(cancelBtn, applyBtn);
	document.body.appendChild(pop);
	// Clamp within viewport after mount
	requestAnimationFrame(() => {
		const margin = 8;
		const r = pop.getBoundingClientRect();
		let left = anchorX - r.width / 2;
		let top = anchorY + 8;
		if (left < margin) left = margin;
		if (left + r.width > window.innerWidth - margin) left = Math.max(margin, window.innerWidth - margin - r.width);
		if (top + r.height > window.innerHeight - margin) top = Math.max(margin, window.innerHeight - margin - r.height);
		pop.style.left = left + 'px';
		pop.style.top = top + 'px';
		pop.style.transform = 'none';
	});
	function outside(ev) { if (!pop.contains(ev.target)) cleanup(); }
	function cleanup() { document.removeEventListener('mousedown', outside, true); document.removeEventListener('touchstart', outside, true); if (pop.parentNode) pop.parentNode.removeChild(pop); }
	setTimeout(() => { document.addEventListener('mousedown', outside, true); document.addEventListener('touchstart', outside, true); }, 0);
}

// Load and render Clients view listing all unique client names across all dates for the current seller
function normalizeClientName(value) {
	try {
		return String(value || '')
			.trim()
			.normalize('NFD')
			// Remove accents (acute, diaeresis, grave, circumflex, macron) but keep tilde (ñ)
			.replace(/[\u0301\u0308\u0300\u0302\u0304]/g, '')
			.toLowerCase();
	} catch {
		return String(value || '').trim().toLowerCase();
	}
}

// Autocomplete: ensure global datalist element for client suggestions exists
function ensureClientDatalist() {
    let dl = document.getElementById('client-datalist');
    if (!dl) {
        dl = document.createElement('datalist');
        dl.id = 'client-datalist';
        document.body.appendChild(dl);
    }
    return dl;
}

// Autocomplete: update datalist options based on current query
function updateClientDatalistForQuery(queryRaw) {
    const dl = ensureClientDatalist();
    const list = Array.isArray(state.clientSuggestions) ? state.clientSuggestions : [];
    const q = normalizeClientName(queryRaw || '');
    // Rebuild <option> list and only show suggestions when user typed something
    dl.innerHTML = '';
    if (!q) return; // do not show any options until typing begins
    // Match typed sequence anywhere in the name
    const filtered = list.filter(it => (it.key || '').includes(q)).slice(0, 12);
    for (const it of filtered) {
        const opt = document.createElement('option');
        opt.value = it.name;
        dl.appendChild(opt);
    }
}

// Autocomplete: attach to a given client input element
function wireClientAutocompleteForInput(inputEl) {
    if (!(inputEl instanceof HTMLInputElement)) return;
    // Attach datalist and refresh on user input/focus
    inputEl.setAttribute('list', 'client-datalist');
    const refresh = () => updateClientDatalistForQuery(inputEl.value || '');
    // Avoid duplicate listeners
    if (inputEl.dataset.autoCompleteBound === '1') { refresh(); return; }
    inputEl.dataset.autoCompleteBound = '1';
    // Show suggestions only after typing begins
    inputEl.addEventListener('input', refresh);
}

// Global autocomplete: ensure global datalist element for global client suggestions exists
function ensureGlobalClientDatalist() {
    let dl = document.getElementById('global-client-datalist');
    if (!dl) {
        dl = document.createElement('datalist');
        dl.id = 'global-client-datalist';
        document.body.appendChild(dl);
    }
    return dl;
}

// Global autocomplete: update datalist options based on current query using global suggestions
function updateGlobalClientDatalistForQuery(queryRaw) {
    const dl = ensureGlobalClientDatalist();
    const list = Array.isArray(state.globalClientSuggestions) ? state.globalClientSuggestions : [];
    const q = normalizeClientName(queryRaw || '');
    // Rebuild <option> list and only show suggestions when user typed something
    dl.innerHTML = '';
    if (!q) return; // do not show any options until typing begins
    // Match typed sequence anywhere in the name
    const filtered = list.filter(it => (it.key || '').includes(q)).slice(0, 12);
    for (const it of filtered) {
        const opt = document.createElement('option');
        opt.value = it.name;
        dl.appendChild(opt);
    }
}

// Global autocomplete: attach custom dropdown to input element (for global search)
function wireGlobalClientAutocompleteForInput(inputEl) {
    if (!(inputEl instanceof HTMLInputElement)) return;
    if (inputEl.dataset.globalAutoCompleteBound === '1') return;
    inputEl.dataset.globalAutoCompleteBound = '1';
    
    // Remove datalist if it exists (we'll use custom dropdown)
    inputEl.removeAttribute('list');
    
    // Create custom dropdown
    let dropdown = document.createElement('div');
    dropdown.className = 'client-search-dropdown';
    dropdown.style.display = 'none';
    inputEl.parentElement?.appendChild(dropdown);
    
    function updateDropdown() {
        const query = inputEl.value.trim();
        const list = Array.isArray(state.globalClientSuggestions) ? state.globalClientSuggestions : [];
        const q = normalizeClientName(query || '');
        
        if (!q) {
            dropdown.style.display = 'none';
            dropdown.innerHTML = '';
            return;
        }
        
        // Filter suggestions - match typed sequence anywhere in the name
        const filtered = list.filter(it => (it.key || '').includes(q)).slice(0, 12);
        
        if (filtered.length === 0) {
            dropdown.style.display = 'none';
            dropdown.innerHTML = '';
            return;
        }
        
        // Render dropdown
        dropdown.innerHTML = '';
        filtered.forEach(item => {
            const option = document.createElement('div');
            option.className = 'client-search-option';
            option.textContent = item.name;
            option.addEventListener('mousedown', (e) => {
                e.preventDefault(); // Prevent blur
                inputEl.value = item.name;
                dropdown.style.display = 'none';
                // Trigger navigation
                inputEl.dispatchEvent(new Event('client-selected', { bubbles: true }));
            });
            dropdown.appendChild(option);
        });
        
        dropdown.style.display = 'block';
    }
    
    inputEl.addEventListener('input', updateDropdown);
    inputEl.addEventListener('focus', updateDropdown);
    inputEl.addEventListener('blur', () => {
        // Delay to allow click on option
        setTimeout(() => {
            dropdown.style.display = 'none';
        }, 200);
    });
}

async function openClientsView() {
	if (!state.currentSeller) return;
	await loadClientsForSeller();
	switchView('#view-clients');
}

async function loadClientsForSeller() {
	const sellerId = state.currentSeller.id;
	// Include archived days to count all client records
	const days = await api('GET', `/api/days?seller_id=${encodeURIComponent(sellerId)}&include_archived=1`);
	const nameToCount = new Map();
	for (const d of (days || [])) {
		const params = new URLSearchParams({ seller_id: String(sellerId), sale_day_id: String(d.id) });
		let sales = [];
		try { sales = await api('GET', `${API.Sales}?${params.toString()}`); } catch { sales = []; }
		for (const s of (sales || [])) {
			const raw = (s?.client_name || '').trim();
			if (!raw) continue;
			const key = normalizeClientName(raw);
			if (!nameToCount.has(key)) nameToCount.set(key, { name: raw, count: 0 });
			nameToCount.get(key).count++;
		}
	}
	const rows = Array.from(nameToCount.values()).sort((a,b) => a.name.localeCompare(b.name, 'es'));
	renderClientsTable(rows);
}

function renderClientsTable(rows) {
	const tbody = document.getElementById('clients-tbody');
	if (!tbody) return;
	tbody.innerHTML = '';
	if (!rows || rows.length === 0) {
		const tr = document.createElement('tr');
		const td = document.createElement('td'); td.colSpan = 2; td.textContent = 'Sin clientes'; td.style.opacity = '0.8';
		tr.appendChild(td); tbody.appendChild(tr); return;
	}
	for (const r of rows) {
		const tr = document.createElement('tr'); tr.className = 'clients-row';
		const tdN = document.createElement('td');
		tdN.textContent = r.name;
		// No marker in clients list per request
		const tdC = document.createElement('td'); tdC.textContent = String(r.count); tdC.style.textAlign = 'center';
		tr.append(tdN, tdC);
		tr.addEventListener('mousedown', () => { tr.classList.add('row-highlight'); setTimeout(() => tr.classList.remove('row-highlight'), 3200); });
		tr.addEventListener('click', async () => { await openClientDetailView(r.name); });
		tbody.appendChild(tr);
	}
}

function focusClientRow(name) {
	try {
		const wrap = document.getElementById('sales-wrapper');
		if (wrap && wrap.classList.contains('hidden')) wrap.classList.remove('hidden');
		const tbody = document.getElementById('sales-tbody');
		if (!tbody) return;
		const targetLower = String(name || '').trim().toLowerCase();
		let targetTr = null;
		for (const tr of Array.from(tbody.rows)) {
			const input = tr.querySelector('td.col-client .client-input');
			const v = (input?.value || '').trim().toLowerCase();
			if (!v) continue;
			if (v === targetLower) { targetTr = tr; break; }
			if (!targetTr && v.includes(targetLower)) { targetTr = tr; }
		}
		if (!targetTr) { try { notify.info('Cliente no encontrado en esta fecha'); } catch {} return; }
		targetTr.scrollIntoView({ behavior: 'smooth', block: 'center' });
		targetTr.classList.add('row-highlight');
		setTimeout(() => targetTr.classList.remove('row-highlight'), 3200);
	} catch {}
}

// Focus and highlight a sale row by its sale_id in the current table
function focusSaleRowById(saleId) {
	try {
		const id = Number(saleId);
		if (!id) return false;
		const tr = document.querySelector(`#sales-tbody tr[data-id="${id}"]`);
		if (!tr) return false;
		tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
		tr.classList.add('row-highlight');
		setTimeout(() => tr.classList.remove('row-highlight'), 3200);
		return true;
	} catch { return false; }
}

// Try to discover seller_id and sale_day_id by scanning if only sale_id is known
async function resolveSaleContextBySaleId(rowId) {
	try {
		const id = Number(rowId);
		if (!id) return null;
		// Fast path: ask backend for seller/day by id
		try {
			const fast = await api('GET', `${API.Sales}?find_by_id=${encodeURIComponent(id)}`);
			if (fast && Number(fast.seller_id) && Number(fast.sale_day_id)) {
				return { sellerId: Number(fast.seller_id), saleDayId: Number(fast.sale_day_id) };
			}
		} catch {}
		const sellers = await api('GET', API.Sellers);
		for (const s of (sellers || [])) {
			const days = await api('GET', `/api/days?seller_id=${encodeURIComponent(s.id)}`);
			for (const d of (days || [])) {
				const p = new URLSearchParams({ seller_id: String(s.id), sale_day_id: String(d.id) });
				let rows = [];
				try { rows = await api('GET', `${API.Sales}?${p.toString()}`); } catch { rows = []; }
				if (Array.isArray(rows) && rows.some(r => Number(r?.id) === id)) {
					return { sellerId: s.id, saleDayId: d.id };
				}
			}
		}
	} catch {}
	return null;
}

// Navigate from a notification to the exact sale row
async function goToSaleFromNotification(sellerId, saleDayId, saleId) {
	try {
		let sid = Number(sellerId || 0) || null;
		let dayId = Number(saleDayId || 0) || null;
		const rowId = Number(saleId || 0) || null;
		if (!sid && !dayId && !rowId) return;

		// Fallback: discover missing context by scanning
		if ((!sid || !dayId) && rowId) {
			const ctx = await resolveSaleContextBySaleId(rowId);
			if (ctx) { sid = ctx.sellerId; dayId = ctx.saleDayId; }
		}

		// Enforce basic role constraint: non-admins stay within their seller
		const isAdminUser = !!(state?.currentUser?.isAdmin);
		if (!isAdminUser) {
			// Non-admin: ignore sid if different; they only have one seller context
			sid = state?.currentSeller?.id || sid;
		}

		// Ensure we're in the sales view for the correct seller
		if (sid) {
			if (!state.currentSeller || state.currentSeller.id !== sid) {
				await enterSeller(sid);
			} else {
				switchView('#view-sales');
			}
		} else {
			// If we still don't know seller and there is no currentSeller, abort quietly
			if (!state.currentSeller) { try { notify.info('No se pudo ubicar el vendedor del movimiento'); } catch {} return; }
		}

		// Ensure days are loaded, select the target day, and load sales
		await loadDaysForSeller();
		if (dayId) {
			state.selectedDayId = dayId;
			const wrap = document.getElementById('sales-wrapper');
			if (wrap && wrap.classList.contains('hidden')) wrap.classList.remove('hidden');
			await loadSales();
		} else {
			const wrap = document.getElementById('sales-wrapper');
			if (wrap && wrap.classList.contains('hidden')) wrap.classList.remove('hidden');
			// If no specific day, keep current selection or latest (handled elsewhere)
			if (!state.selectedDayId && Array.isArray(state.saleDays) && state.saleDays.length) {
				state.selectedDayId = state.saleDays[0].id;
				await loadSales();
			}
		}

		// Focus the specific row if provided
		if (rowId) {
			const ok = focusSaleRowById(rowId);
			if (!ok) { try { notify.info('Registro no encontrado en esta fecha'); } catch {} }
		} else {
			// If only date was provided, bring table into view
			document.getElementById('sales-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	} catch {}
}

(function wireClientsButton(){
	const btn = document.getElementById('clients-button');
	if (!btn) return;
	btn.addEventListener('click', async () => {
		await openClientsView();
	});
})();

(function bindBottomAdd(){
    const btn = document.getElementById('add-row-bottom');
    btn?.addEventListener('click', (ev) => {
        const rect = ev.currentTarget.getBoundingClientRect();
        openNewSalePopover(rect.left + rect.width / 2, rect.bottom + 8);
    });
})();

// Open a dedicated page to upload a receipt image for the given sale id
function openReceiptUploadPage(saleId) {
	// Instead of redirecting, show inline file upload dialog
	openInlineFileUploadDialog(saleId);
}

// NEW: Inline file upload dialog that stays in the sales table
function openInlineFileUploadDialog(saleId) {
	try {
		const id = Number(saleId);
		if (!id) {
			console.error('❌ openInlineFileUploadDialog: Invalid saleId', saleId);
			return;
		}

		const overlay = document.createElement('div');
		overlay.className = 'file-upload-overlay';
		overlay.style.position = 'fixed';
		overlay.style.top = '0';
		overlay.style.left = '0';
		overlay.style.right = '0';
		overlay.style.bottom = '0';
		overlay.style.background = 'rgba(0, 0, 0, 0.4)';
		overlay.style.zIndex = '9999';
		overlay.style.display = 'flex';
		overlay.style.alignItems = 'center';
		overlay.style.justifyContent = 'center';
		overlay.style.backdropFilter = 'blur(4px)';
		overlay.style.animation = 'fadeIn 0.2s ease';
		
		// Add animation keyframes to document if not already present
		if (!document.getElementById('upload-dialog-animations')) {
			const style = document.createElement('style');
			style.id = 'upload-dialog-animations';
			style.textContent = `
				@keyframes fadeIn {
					from { opacity: 0; }
					to { opacity: 1; }
				}
				@keyframes dialogFadeIn {
					from { opacity: 0; transform: scale(0.95) translateY(10px); }
					to { opacity: 1; transform: scale(1) translateY(0); }
				}
			`;
			document.head.appendChild(style);
		}

		const dialog = document.createElement('div');
		dialog.className = 'file-upload-dialog';
		dialog.style.background = 'var(--card, #fff)';
		dialog.style.borderRadius = '16px';
		dialog.style.padding = '28px';
		dialog.style.maxWidth = '500px';
		dialog.style.width = '90%';
		dialog.style.boxShadow = '0 20px 60px rgba(0,0,0,0.15)';
		dialog.style.maxHeight = '90vh';
		dialog.style.overflowY = 'auto';
		dialog.style.animation = 'dialogFadeIn 0.2s ease';

		const title = document.createElement('h1');
		title.textContent = 'Subir comprobante';
		title.style.margin = '0 0 6px';
		title.style.fontSize = '20px';
		title.style.fontWeight = '600';
		title.style.color = 'var(--text, #111)';

		const saleInfo = document.createElement('div');
		saleInfo.className = 'note';
		saleInfo.textContent = `Venta #${id}`;
		saleInfo.style.fontSize = '13px';
		saleInfo.style.color = 'var(--muted, #6b7280)';
		saleInfo.style.marginBottom = '20px';
		saleInfo.style.opacity = '0.8';

		const fileLabel = document.createElement('label');
		fileLabel.textContent = '📷 Fotos del comprobante';
		fileLabel.style.display = 'block';
		fileLabel.style.marginBottom = '8px';
		fileLabel.style.fontSize = '14px';
		fileLabel.style.fontWeight = '500';
		fileLabel.style.color = 'var(--text, #111)';

		const fileInput = document.createElement('input');
		fileInput.type = 'file';
		fileInput.accept = 'image/*';
		fileInput.multiple = true;
		fileInput.style.display = 'block';
		fileInput.style.width = '100%';
		fileInput.style.marginBottom = '16px';
		fileInput.style.padding = '10px';
		fileInput.style.border = '2px dashed var(--border, #e5e7eb)';
		fileInput.style.borderRadius = '10px';
		fileInput.style.cursor = 'pointer';
		fileInput.style.transition = 'border-color 0.2s ease';

		const noteLabel = document.createElement('label');
		noteLabel.textContent = '💬 Nota (opcional)';
		noteLabel.style.display = 'block';
		noteLabel.style.marginBottom = '8px';
		noteLabel.style.fontSize = '14px';
		noteLabel.style.fontWeight = '500';
		noteLabel.style.color = 'var(--text, #111)';

		const noteInput = document.createElement('textarea');
		noteInput.rows = 3;
		noteInput.placeholder = 'Agrega una nota si lo deseas...';
		noteInput.style.width = '100%';
		noteInput.style.resize = 'vertical';
		noteInput.style.padding = '12px';
		noteInput.style.borderRadius = '10px';
		noteInput.style.border = '1px solid var(--border, #e5e7eb)';
		noteInput.style.marginBottom = '16px';
		noteInput.style.fontFamily = 'inherit';
		noteInput.style.fontSize = '14px';
		noteInput.style.transition = 'border-color 0.2s ease';
		noteInput.addEventListener('focus', () => {
			noteInput.style.borderColor = 'var(--primary, #f4a6b7)';
		});
		noteInput.addEventListener('blur', () => {
			noteInput.style.borderColor = 'var(--border, #e5e7eb)';
		});

		const previewContainer = document.createElement('div');
		previewContainer.className = 'preview';
		previewContainer.style.display = 'none';
		previewContainer.style.marginBottom = '12px';

		const actions = document.createElement('div');
		actions.className = 'actions';
		actions.style.display = 'flex';
		actions.style.gap = '8px';
		actions.style.justifyContent = 'flex-end';
		actions.style.marginBottom = '8px';

		const cancelBtn = document.createElement('button');
		cancelBtn.className = 'btn press-btn';
		cancelBtn.textContent = 'Cancelar';
		cancelBtn.style.padding = '8px 12px';

		const uploadBtn = document.createElement('button');
		uploadBtn.className = 'btn btn-primary press-btn btn-gold';
		uploadBtn.textContent = 'Subir';
		uploadBtn.style.padding = '8px 12px';
		uploadBtn.disabled = true;

		const helpText = document.createElement('div');
		helpText.className = 'note';
		helpText.textContent = 'Formatos comunes: JPG, PNG. Tamaño máximo recomendado 2MB.';
		helpText.style.fontSize = '12px';
		helpText.style.color = '#6b7280';

		let selectedFiles = [];

		fileInput.addEventListener('change', () => {
			const files = fileInput.files;
			if (!files || files.length === 0) {
				previewContainer.style.display = 'none';
				previewContainer.innerHTML = '';
				uploadBtn.disabled = true;
				selectedFiles = [];
				return;
			}

			selectedFiles = Array.from(files);
			previewContainer.innerHTML = '';
			previewContainer.style.display = 'block';

			selectedFiles.forEach((file, index) => {
				const reader = new FileReader();
				reader.onload = (e) => {
					const imgContainer = document.createElement('div');
					imgContainer.style.marginBottom = '16px';
					imgContainer.style.padding = '12px';
					imgContainer.style.background = 'var(--background, #f9fafb)';
					imgContainer.style.borderRadius = '12px';
					imgContainer.style.border = '1px solid var(--border, #e5e7eb)';

					const label = document.createElement('div');
					label.textContent = `📎 ${file.name}`;
					label.style.fontSize = '13px';
					label.style.marginBottom = '8px';
					label.style.fontWeight = '500';
					label.style.color = 'var(--text, #111)';

					const img = document.createElement('img');
					img.src = e.target.result;
					img.alt = `Vista previa ${index + 1}`;
					img.style.maxWidth = '100%';
					img.style.borderRadius = '8px';
					img.style.border = '1px solid var(--border, #e5e7eb)';
					img.style.display = 'block';

					imgContainer.appendChild(label);
					imgContainer.appendChild(img);
					previewContainer.appendChild(imgContainer);
				};
				reader.readAsDataURL(file);
			});

			uploadBtn.disabled = false;
			uploadBtn.textContent = `Subir ${selectedFiles.length} archivo${selectedFiles.length > 1 ? 's' : ''}`;
		});

		uploadBtn.addEventListener('click', async () => {
			if (selectedFiles.length === 0 || !id) return;
			uploadBtn.disabled = true;
			uploadBtn.textContent = 'Subiendo...';

			try {
				const note = noteInput.value.trim();
				let successCount = 0;

				for (const file of selectedFiles) {
					try {
						const reader = new FileReader();
						const dataUrl = await new Promise((resolve, reject) => {
							reader.onload = () => resolve(reader.result);
							reader.onerror = reject;
							reader.readAsDataURL(file);
						});

						const body = {
							_upload_receipt_for: id,
							image_base64: dataUrl,
							_actor_name: state.currentUser?.name || ''
						};

						// Add note only to the first file upload if provided
						if (note && successCount === 0) {
							body.note_text = note;
						}

						await api('POST', API.Sales, body);
						successCount++;
					} catch (err) {
						console.error('Error uploading file:', file.name, err);
					}
				}

				if (successCount > 0) {
					try {
						notify.success(`${successCount} archivo${successCount > 1 ? 's' : ''} subido${successCount > 1 ? 's' : ''} correctamente`);
					} catch {}

					cleanup();

					// Reload receipts gallery to show uploaded files
					setTimeout(() => {
						openReceiptsGalleryPopover(id, window.innerWidth / 2, window.innerHeight / 2).catch(err => {
							console.error('Error opening gallery after upload:', err);
						});
					}, 300);
				} else {
					throw new Error('No se pudo subir ningún archivo');
				}
			} catch (err) {
				console.error('Upload error:', err);
				try {
					notify.error('Error al subir archivos: ' + (err.message || 'Error desconocido'));
				} catch {}
				uploadBtn.disabled = false;
				uploadBtn.textContent = `Subir ${selectedFiles.length} archivo${selectedFiles.length > 1 ? 's' : ''}`;
			}
		});

		cancelBtn.addEventListener('click', cleanup);
		overlay.addEventListener('click', (e) => {
			if (e.target === overlay) cleanup();
		});

		function cleanup() {
			if (overlay.parentNode) {
				overlay.parentNode.removeChild(overlay);
			}
		}

		actions.appendChild(cancelBtn);
		actions.appendChild(uploadBtn);

		dialog.appendChild(title);
		dialog.appendChild(saleInfo);
		dialog.appendChild(fileLabel);
		dialog.appendChild(fileInput);
		dialog.appendChild(noteLabel);
		dialog.appendChild(noteInput);
		dialog.appendChild(previewContainer);
		dialog.appendChild(actions);
		dialog.appendChild(helpText);

		overlay.appendChild(dialog);
		document.body.appendChild(overlay);

	} catch (err) {
		console.error('❌ Error in openInlineFileUploadDialog:', err);
	}
}

// Gallery viewer for multiple receipts with independent payment selectors
async function openReceiptsGalleryPopover(saleId, anchorX, anchorY) {
	let receipts = [];
	try {
		receipts = await api('GET', `${API.Sales}?receipt_for=${encodeURIComponent(saleId)}`);
		console.log('📸 Receipts loaded from backend:', receipts.map(r => ({ id: r.id, pay_method: r.pay_method, payment_source: r.payment_source, payment_date: r.payment_date })));
	} catch (err) {
		console.error('Error loading receipts:', err);
		// If error loading, go to upload page
		openReceiptUploadPage(saleId);
		return;
	}
	
	if (!Array.isArray(receipts) || receipts.length === 0) {
		// No receipts yet, go to upload page
		openReceiptUploadPage(saleId);
		return;
	}
	
	try {

		const pop = document.createElement('div');
		pop.className = 'receipts-gallery-popover';
		pop.style.position = 'fixed';
		pop.style.left = '50%';
		pop.style.top = '50%';
		pop.style.transform = 'translate(-50%, -50%)';
		pop.style.width = 'auto';
		pop.style.maxWidth = '95vw';
		pop.style.maxHeight = '90vh';
		pop.style.zIndex = '1000';
		pop.style.overflow = 'auto';
		pop.style.display = 'flex';
		pop.style.flexDirection = 'column';
		pop.style.gap = '16px';
		pop.style.background = 'var(--card, #fff)';
		pop.style.padding = '20px';
		pop.style.borderRadius = '12px';
		pop.style.boxShadow = '0 8px 32px rgba(0,0,0,0.2)';

		// Title
		const title = document.createElement('h3');
		title.textContent = `Comprobantes de pago (${receipts.length})`;
		title.style.margin = '0 0 12px 0';
		title.style.textAlign = 'center';
		pop.appendChild(title);

		// Gallery container
		const gallery = document.createElement('div');
		gallery.style.display = 'grid';
		gallery.style.gridTemplateColumns = 'repeat(auto-fit, minmax(600px, 1fr))';
		gallery.style.gap = '16px';
		gallery.style.maxHeight = '80vh';
		gallery.style.overflowY = 'auto';

		// Check if user is superadmin
		const isSuperAdmin = state.currentUser?.role === 'superadmin' || !!state.currentUser?.isSuperAdmin;
		
		for (const receipt of receipts) {
			// Each receipt preserves its own pay_method from database
			// Don't force defaults - respect the saved value
			const card = document.createElement('div');
			card.style.border = '1px solid var(--border, #ddd)';
			card.style.borderRadius = '8px';
			card.style.padding = '12px';
			card.style.background = 'var(--background, #fff)';
			card.style.display = 'flex';
			card.style.flexDirection = 'column';
			card.style.gap = '12px';

			// Image container with payment selector overlay
			const imgContainer = document.createElement('div');
			imgContainer.style.position = 'relative';
			
			// Image
			const img = document.createElement('img');
			img.src = receipt.image_base64;
			img.alt = 'Comprobante';
			img.style.width = '100%';
			img.style.height = 'auto';
			img.style.maxHeight = '70vh';
			img.style.objectFit = 'contain';
			img.style.borderRadius = '6px';
			img.style.cursor = 'pointer';
		img.addEventListener('click', (e) => {
			e.stopPropagation(); // Prevent closing the gallery popover
			// Open full-size view
			const lightbox = document.createElement('div');
			lightbox.className = 'image-lightbox'; // Add class for identification
			lightbox.style.position = 'fixed';
			lightbox.style.top = '0';
			lightbox.style.left = '0';
			lightbox.style.width = '100%';
			lightbox.style.height = '100%';
			lightbox.style.background = 'rgba(0,0,0,0.9)';
			lightbox.style.zIndex = '2000';
			lightbox.style.display = 'flex';
			lightbox.style.alignItems = 'center';
			lightbox.style.justifyContent = 'center';
			lightbox.style.cursor = 'pointer';
			const fullImg = document.createElement('img');
			fullImg.src = receipt.image_base64;
			fullImg.style.maxWidth = '95%';
			fullImg.style.maxHeight = '95%';
			fullImg.style.objectFit = 'contain';
			lightbox.appendChild(fullImg);
			document.body.appendChild(lightbox);
			
			// Close lightbox on click (both mousedown and click for safety)
			const closeLightbox = (e) => {
				e.stopPropagation(); // Prevent event from reaching gallery popover
				if (lightbox.parentNode) {
					document.body.removeChild(lightbox);
				}
			};
			lightbox.addEventListener('click', closeLightbox);
			lightbox.addEventListener('mousedown', (e) => {
				e.stopPropagation(); // Prevent triggering gallery's outside listener
			});
		});
			imgContainer.appendChild(img);
			
			// Payment selector overlay (only for superadmin)
			if (isSuperAdmin) {
				const payOverlay = document.createElement('div');
				payOverlay.className = 'transfer-pay';
				
				const col = document.createElement('div');
				col.className = 'col-paid';
				
				const wrap = document.createElement('span');
				wrap.className = 'pay-wrap';
				
				const sel = document.createElement('select');
				sel.className = 'input-cell pay-select';
				sel.style.display = 'none';
				
				// Use saved pay_method or default to 'transf' for new receipts
				const current = (receipt.pay_method || 'transf').replace(/\.$/, '');
				console.log(`🎯 Receipt ${receipt.id} - pay_method from backend: "${receipt.pay_method}" -> current: "${current}"`);
				
				const isMarcela = String(state.currentUser?.name || '').toLowerCase() === 'marcela';
				const isJorge = String(state.currentUser?.name || '').toLowerCase() === 'jorge';
				
				const opts = [
					{ v: '', label: '-' },
					{ v: 'efectivo', label: '' },
					{ v: 'entregado', label: '' }
				];
				if (isMarcela) opts.push({ v: 'marce', label: '' });
				if (!isMarcela && current === 'marce') opts.push({ v: 'marce', label: '' });
				if (isJorge) opts.push({ v: 'jorge', label: '' });
				if (!isJorge && current === 'jorge') opts.push({ v: 'jorge', label: '' });
				opts.push({ v: 'transf', label: '' });
				if (isJorge) opts.push({ v: 'jorgebank', label: '' });
				if (!isJorge && current === 'jorgebank') opts.push({ v: 'jorgebank', label: '' });
				
				for (const o of opts) {
					const opt = document.createElement('option');
					opt.value = o.v;
					opt.textContent = o.label;
					if (!isMarcela && o.v === 'marce') opt.disabled = true;
					if (!isJorge && o.v === 'jorge') opt.disabled = true;
					if (current === o.v) opt.selected = true;
					sel.appendChild(opt);
				}
				
				// Explicitly set selector value to match backend data
				sel.value = current;
				console.log(`✅ Selector initialized with value: "${sel.value}"`);
				
				function applyPayClass() {
					wrap.classList.remove('placeholder', 'method-efectivo', 'method-transf', 'method-marce', 'method-jorge', 'method-jorgebank', 'method-entregado');
					const val = sel.value;
					if (!val) wrap.classList.add('placeholder');
					else if (val === 'efectivo') wrap.classList.add('method-efectivo');
					else if (val === 'entregado') wrap.classList.add('method-entregado');
					else if (val === 'transf') wrap.classList.add('method-transf');
					else if (val === 'marce') wrap.classList.add('method-marce');
					else if (val === 'jorge') wrap.classList.add('method-jorge');
					else if (val === 'jorgebank') wrap.classList.add('method-jorgebank');
				}
				applyPayClass();
				
				wrap.addEventListener('click', (e) => {
					e.stopPropagation();
					const rect = wrap.getBoundingClientRect();
					openPayMenuForReceipt(wrap, sel, receipt, rect.left + rect.width / 2, rect.bottom, applyPayClass);
				});
				
				wrap.tabIndex = 0;
				wrap.addEventListener('keydown', (e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						const rect = wrap.getBoundingClientRect();
						openPayMenuForReceipt(wrap, sel, receipt, rect.left + rect.width / 2, rect.bottom, applyPayClass);
					}
				});
				
			sel.addEventListener('change', async () => {
				const newValue = sel.value || null;
				
				// If selecting jorgebank, open payment date dialog
				if (newValue === 'jorgebank') {
					openPaymentDateDialogForReceipt(receipt, async () => {
						// Callback after saving date - update receipt locally and refresh selector
						receipt.pay_method = 'jorgebank';
						sel.value = 'jorgebank';
						applyPayClass();
						notify.info('✓ Comprobante verificado');
						
						// Check if we need to update the main selector to jorgebank
						await checkAndUpdateMainSelectorToJorgebank(receipt.sale_id);
					});
				} else {
					// For other methods, just update pay_method
					try {
						await api('PUT', API.Sales, {
							_update_receipt_payment: true,
							receipt_id: receipt.id,
							pay_method: newValue
						});
						receipt.pay_method = newValue;
						notify.info('✓ Método actualizado');
						
						// Also check if main selector needs update (in case changing FROM jorgebank)
						await checkAndUpdateMainSelectorToJorgebank(receipt.sale_id);
					} catch (err) {
						console.error('Error updating receipt payment:', err);
						notify.error('Error al actualizar');
					}
					applyPayClass();
				}
			});
				
				wrap.appendChild(sel);
				col.appendChild(wrap);
				payOverlay.appendChild(col);
				imgContainer.appendChild(payOverlay);
			}
			
			card.appendChild(imgContainer);

			// Metadata
			const meta = document.createElement('div');
			meta.style.fontSize = '12px';
			meta.style.opacity = '0.75';
			if (receipt.created_at) {
				const when = new Date(receipt.created_at);
				const whenStr = isNaN(when.getTime()) ? String(receipt.created_at) : when.toLocaleString();
				const timeDiv = document.createElement('div');
				timeDiv.textContent = 'Subido: ' + whenStr;
				meta.appendChild(timeDiv);
			}
			if (receipt.note_text) {
				const note = document.createElement('div');
				note.textContent = 'Nota: ' + String(receipt.note_text || '');
				note.style.fontSize = '12px';
				note.style.marginTop = '4px';
				note.style.whiteSpace = 'pre-wrap';
				meta.appendChild(note);
			}
			card.appendChild(meta);

			// Delete button
			const deleteBtn = document.createElement('button');
			deleteBtn.className = 'press-btn';
			deleteBtn.textContent = 'Eliminar este comprobante';
			deleteBtn.style.marginTop = '8px';
			deleteBtn.addEventListener('click', async () => {
				try {
					const ok = await openConfirmPopover('¿Eliminar este comprobante?', anchorX, anchorY);
					if (!ok) return;
					await fetch(`/api/sales?receipt_id=${encodeURIComponent(receipt.id)}`, { method: 'DELETE' });
					cleanup();
					// Re-open gallery to refresh
					openReceiptsGalleryPopover(saleId, anchorX, anchorY);
				} catch (err) {
					console.error('Error deleting receipt:', err);
					notify.error('Error al eliminar comprobante');
				}
			});
			card.appendChild(deleteBtn);

			gallery.appendChild(card);
		}

		pop.appendChild(gallery);

		// Actions at the bottom
		const actions = document.createElement('div');
		actions.style.display = 'flex';
		actions.style.gap = '8px';
		actions.style.justifyContent = 'center';
		actions.style.flexShrink = '0';
		actions.style.marginTop = '12px';

		const addBtn = document.createElement('button');
		addBtn.className = 'press-btn btn-primary';
		addBtn.textContent = '+ Subir otro comprobante';
		addBtn.addEventListener('click', () => {
			cleanup();
			openReceiptUploadPage(saleId);
		});

		const closeBtn = document.createElement('button');
		closeBtn.className = 'press-btn';
		closeBtn.textContent = 'Cerrar';
		closeBtn.addEventListener('click', cleanup);

		actions.append(addBtn, closeBtn);
		pop.appendChild(actions);

		document.body.appendChild(pop);

		function cleanup() {
			document.removeEventListener('mousedown', outside, true);
			document.removeEventListener('touchstart', outside, true);
			if (pop.parentNode) pop.parentNode.removeChild(pop);
		}

	function outside(ev) {
		// Don't close if clicking inside the payment date dialog or image lightbox
		const isInsidePaymentDialog = ev.target.closest('.payment-date-popover');
		const isInsideLightbox = ev.target.closest('.image-lightbox');
		if (!pop.contains(ev.target) && !isInsidePaymentDialog && !isInsideLightbox) {
			cleanup();
		}
	}

		setTimeout(() => {
			document.addEventListener('mousedown', outside, true);
			document.addEventListener('touchstart', outside, true);
		}, 0);
	} catch (err) {
		console.error('Error rendering receipts gallery:', err);
		notify.error('Error al mostrar galería');
		// Fallback to upload page
		openReceiptUploadPage(saleId);
	}
}

// Open payment date dialog for individual receipt
function openPaymentDateDialogForReceipt(receipt, onSaved) {
	const pop = document.createElement('div');
	pop.className = 'payment-date-popover';
	pop.style.position = 'fixed';
	pop.style.zIndex = '1002'; // Higher than gallery to appear on top
	pop.style.left = '50%';
	pop.style.top = '50%';
	pop.style.transform = 'translate(-50%, -50%)';

	// Title
	const title = document.createElement('div');
	title.className = 'payment-date-title';
	title.textContent = 'Fecha de pago';

	// Inline calendar
	const calendarContainer = document.createElement('div');
	calendarContainer.className = 'inline-calendar';

	const today = new Date();
	let initialDate = new Date();
	const savedDate = receipt.payment_date;
	if (savedDate) {
		try {
			const dateStr = typeof savedDate === 'string' ? savedDate.slice(0, 10) : String(savedDate).slice(0, 10);
			const parsed = new Date(dateStr + 'T00:00:00');
			if (!isNaN(parsed.getTime())) initialDate = parsed;
		} catch {}
	}
	let currentMonth = initialDate.getMonth();
	let currentYear = initialDate.getFullYear();
	let selectedDate = new Date(initialDate);

	const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
	const calendarHeader = document.createElement('div');
	calendarHeader.className = 'calendar-header';
	const prevBtn = document.createElement('button');
	prevBtn.className = 'calendar-nav-btn';
	prevBtn.type = 'button';
	prevBtn.innerHTML = '◀';
	const monthLabel = document.createElement('span');
	monthLabel.className = 'calendar-month-label';
	monthLabel.textContent = `${monthNames[currentMonth]} ${currentYear}`;
	const nextBtn = document.createElement('button');
	nextBtn.className = 'calendar-nav-btn';
	nextBtn.type = 'button';
	nextBtn.innerHTML = '▶';
	calendarHeader.append(prevBtn, monthLabel, nextBtn);

	const calendarGrid = document.createElement('div');
	calendarGrid.className = 'calendar-grid';

	function renderCalendar() {
		calendarGrid.innerHTML = '';
		monthLabel.textContent = `${monthNames[currentMonth]} ${currentYear}`;
		const dayNames = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
		for (const d of dayNames) {
			const h = document.createElement('div');
			h.className = 'calendar-day-header';
			h.textContent = d;
			calendarGrid.appendChild(h);
		}
		const firstDay = new Date(currentYear, currentMonth, 1).getDay();
		const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
		for (let i = 0; i < firstDay; i++) {
			const e = document.createElement('div');
			e.className = 'calendar-day empty';
			calendarGrid.appendChild(e);
		}
		for (let day = 1; day <= daysInMonth; day++) {
			const cell = document.createElement('div');
			cell.className = 'calendar-day';
			cell.textContent = day;
			const cellDate = new Date(currentYear, currentMonth, day);
			if (cellDate.toDateString() === today.toDateString()) cell.classList.add('today');
			if (selectedDate && selectedDate.getDate() === day && selectedDate.getMonth() === currentMonth && selectedDate.getFullYear() === currentYear) {
				cell.classList.add('selected');
			}
			cell.addEventListener('click', () => {
				calendarGrid.querySelectorAll('.calendar-day').forEach(d => d.classList.remove('selected'));
				cell.classList.add('selected');
				selectedDate = new Date(currentYear, currentMonth, day);
			});
			calendarGrid.appendChild(cell);
		}
	}

	prevBtn.addEventListener('click', (e) => {
		e.preventDefault();
		currentMonth--;
		if (currentMonth < 0) {
			currentMonth = 11;
			currentYear--;
		}
		renderCalendar();
	});
	nextBtn.addEventListener('click', (e) => {
		e.preventDefault();
		currentMonth++;
		if (currentMonth > 11) {
			currentMonth = 0;
			currentYear++;
		}
		renderCalendar();
	});
	renderCalendar();
	calendarContainer.append(calendarHeader, calendarGrid);

	const methodLabel = document.createElement('div');
	methodLabel.className = 'payment-date-label';
	methodLabel.textContent = 'Fuente de pago:';
	methodLabel.style.marginTop = '14px';
	const methodsContainer = document.createElement('div');
	methodsContainer.className = 'payment-methods-container';
	const methods = [
		{ value: 'bancolombia', label: 'Bancolombia' },
		{ value: 'nequi', label: 'Nequi' },
		{ value: 'efectivo_marcela', label: 'Efectivo Marcela' },
		{ value: 'efectivo_aleja', label: 'Efectivo Aleja' },
		{ value: 'bancolombia_aleja', label: 'Bancolombia Aleja' },
		{ value: 'otro', label: 'Otro' }
	];
	const previousSource = receipt.payment_source;
	for (const m of methods) {
		const b = document.createElement('button');
		b.type = 'button';
		b.className = 'payment-method-btn';
		b.textContent = m.label;
		b.dataset.value = m.value;
		if (previousSource && (
			m.label === previousSource ||
			m.label.toLowerCase() === String(previousSource).toLowerCase() ||
			m.value === String(previousSource).toLowerCase()
		)) {
			b.classList.add('selected');
		}
		b.addEventListener('click', async () => {
			// Disable while saving
			methodsContainer.querySelectorAll('button').forEach(x => x.disabled = true);
			try {
				const paymentDate = selectedDate.toISOString().split('T')[0];
				const paymentSource = m.label;
				
				console.log('Guardando recibo:', {
					receipt_id: receipt.id,
					pay_method: 'jorgebank',
					payment_date: paymentDate,
					payment_source: paymentSource
				});
				
				// Update receipt payment info
				const result = await api('PUT', API.Sales, {
					_update_receipt_payment: true,
					receipt_id: receipt.id,
					pay_method: 'jorgebank',
					payment_date: paymentDate,
					payment_source: paymentSource
				});
				
				console.log('Guardado exitoso:', result);
				
				// Update local receipt object with the response data
				if (result) {
					receipt.pay_method = result.pay_method || 'jorgebank';
					receipt.payment_date = result.payment_date || paymentDate;
					receipt.payment_source = result.payment_source || paymentSource;
				} else {
					receipt.pay_method = 'jorgebank';
					receipt.payment_date = paymentDate;
					receipt.payment_source = paymentSource;
				}
				
				// Call the callback to update the selector in the UI
				if (typeof onSaved === 'function') onSaved();
				
				// Show success message
				notify.info(`✓ Verificado: ${paymentSource} - ${paymentDate}`);
				
				// Close this dialog (but NOT the gallery)
				cleanup();
				
				// Check if we need to update the main selector to jorgebank
				await checkAndUpdateMainSelectorToJorgebank(receipt.sale_id);
				
				// Re-enable buttons
				methodsContainer.querySelectorAll('button').forEach(x => x.disabled = false);
			} catch (err) {
				console.error('Error guardando fecha de pago:', err);
				methodsContainer.querySelectorAll('button').forEach(x => x.disabled = false);
				alert('Error al guardar: ' + (err.message || 'Error desconocido'));
			}
		});
		methodsContainer.appendChild(b);
	}

	pop.append(title, calendarContainer, methodLabel, methodsContainer);
	document.body.appendChild(pop);

	function outside(ev) {
		// Don't close if clicking inside the payment date dialog (which has higher z-index)
		if (!pop.contains(ev.target)) cleanup();
	}

	function cleanup() {
		document.removeEventListener('mousedown', outside, true);
		document.removeEventListener('touchstart', outside, true);
		if (pop.parentNode) pop.parentNode.removeChild(pop);
	}

	setTimeout(() => {
		document.addEventListener('mousedown', outside, true);
		document.addEventListener('touchstart', outside, true);
	}, 0);
}

// Open payment menu for individual receipt in gallery
function openPayMenuForReceipt(anchorEl, selectEl, receipt, clickX, clickY, applyPayClass) {
	const rect = anchorEl.getBoundingClientRect();
	const menu = document.createElement('div');
	menu.className = 'pay-menu';
	menu.style.position = 'fixed';
	menu.style.transform = 'translateX(-50%)';
	menu.style.zIndex = '1001';
	
	const isMarcela = String(state.currentUser?.name || '').toLowerCase() === 'marcela';
	const isJorge = String(state.currentUser?.name || '').toLowerCase() === 'jorge';
	
	const items = [
		{ v: 'efectivo', cls: 'menu-efectivo' },
		{ v: 'entregado', cls: 'menu-entregado' }
	];
	if (isMarcela) items.push({ v: 'marce', cls: 'menu-marce' });
	if (isJorge) {
		items.push({ v: 'jorge', cls: 'menu-jorge' });
		items.push({ v: 'jorgebank', cls: 'menu-jorgebank' });
	} else if ((selectEl.value || '') === 'jorgebank') {
		items.push({ v: 'jorgebank', cls: 'menu-jorgebank' });
	}
	items.push({ v: '', cls: 'menu-clear' }, { v: 'transf', cls: 'menu-transf' });
	
	for (const it of items) {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'pay-menu-item ' + it.cls;
		if (it.v === '') btn.textContent = '-';
		btn.addEventListener('click', async (e) => {
			e.stopPropagation();
			selectEl.value = it.v;
			selectEl.dispatchEvent(new Event('change'));
			cleanup();
		});
		menu.appendChild(btn);
	}
	
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
	
	function outside(e) {
		if (!menu.contains(e.target)) cleanup();
	}
	
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

// Legacy function for backward compatibility
function openReceiptViewerPopover(imageBase64, saleId, createdAt, anchorX, anchorY, noteText, receiptId) {
	// Redirect to new gallery view
	openReceiptsGalleryPopover(saleId, anchorX, anchorY);
}


(async function init() {
	bindEvents();
	bindLogin();
	notify.initToggle();
	// Asegurar que el login siempre quede vinculado, incluso si las llamadas iniciales fallan
	// (la restauración automática fue removida; se mantiene reporte bajo demanda)
	// Realtime polling of backend notifications
	(function startRealtime(){
		let lastId = 0;
		let initialized = false;
		async function tick() {
			try {
				const url = lastId ? `/api/notifications?after_id=${encodeURIComponent(lastId)}` : '/api/notifications';
				const res = await fetch(url);
				if (res.ok) {
					const rows = await res.json();
					if (Array.isArray(rows) && rows.length) {
						for (const r of rows) {
							lastId = Math.max(lastId, Number(r.id||0));
							if (!initialized) continue; // skip showing notifications on first load
							const msg = String(r.message || '');
							const pm = (r.pay_method || '').toString();
							const iconUrl = r.icon_url || (pm === 'efectivo' ? '/icons/bill.svg' : pm === 'transf' ? '/icons/bank.svg' : pm === 'jorgebank' ? '/icons/bank-yellow.svg' : pm === 'marce' ? '/icons/marce7.svg?v=1' : pm === 'jorge' ? '/icons/jorge7.svg?v=1' : null);
							notify.info(msg, iconUrl || pm ? { iconUrl, payMethod: pm } : undefined);
							notify.showBrowser('Venta', msg);
						}
						initialized = true;
					} else if (!initialized) {
						// no rows on first load; mark as initialized to show future events
						initialized = true;
					}
				}
			} catch {}
			setTimeout(tick, 2500);
		}
		tick();
	})();
	updateToolbarOffset();
	try { const saved = localStorage.getItem('authUser'); if (saved) state.currentUser = JSON.parse(saved); } catch {}
	// Backfill role fields if missing from older sessions
	if (state.currentUser && !state.currentUser.role) {
		const name = state.currentUser.name;
		state.currentUser.role = getRole(name);
		state.currentUser.isSuperAdmin = isSuperAdmin(name);
		state.currentUser.isAdmin = isAdmin(name);
		state.currentUser.features = Array.isArray(state.currentUser.features) ? state.currentUser.features : [];
		try { localStorage.setItem('authUser', JSON.stringify(state.currentUser)); } catch {}
	}
	try { await loadSellers(); } catch { /* Ignorar error de red para no bloquear el login */ }
	let __handledPendingFocus = false;
	// Handle deep link focus coming from Transfers or Notifications (pendingFocus in localStorage)
	try {
		const saved = localStorage.getItem('pendingFocus');
		if (saved) {
			localStorage.removeItem('pendingFocus');
			const pf = JSON.parse(saved);
			const sellerId = pf?.sellerId || pf?.seller_id || null;
			const dayIso = pf?.dayIso || null;
			const clientName = pf?.clientName || null;
			const saleDayId = pf?.saleDayId || pf?.sale_day_id || null;
			const saleId = pf?.saleId || pf?.sale_id || null;
			const seller = (state.sellers || []).find(s => Number(s.id) === Number(sellerId));
			if (seller) {
				__handledPendingFocus = true;
				await enterSeller(seller.id);
				// Ensure days loaded
				await loadDaysForSeller();
				if (saleDayId) {
					state.selectedDayId = Number(saleDayId);
				} else if (dayIso) {
					try {
						const days = await api('GET', `/api/days?seller_id=${encodeURIComponent(seller.id)}`);
						const d = (days || []).find(x => String(x.day).slice(0,10) === String(dayIso).slice(0,10));
						if (d) state.selectedDayId = d.id;
					} catch {}
				}
				document.getElementById('sales-wrapper')?.classList.remove('hidden');
				await loadSales();
				if (saleId) {
					focusSaleRowById(Number(saleId));
				} else if (clientName) {
					focusClientRow(clientName || '');
				}
			}
		}
	} catch {}
	// Route initial view (skip if we just navigated from Transfers)
	if (!__handledPendingFocus) {
		if (!state.currentUser) {
			switchView('#view-login');
		} else if (state.currentUser.isAdmin) {
			switchView('#view-select-seller');
		} else {
			const me = (state.sellers || []).find(s => String(s.name).toLowerCase() === String(state.currentUser.name || '').toLowerCase());
			if (me) enterSeller(me.id); else switchView('#view-select-seller');
		}
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

// (mobile bounce limiter removed per user preference);

// (mobile bounce limiter removed per user preference)