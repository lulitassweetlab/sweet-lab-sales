async function openClientDetailView(clientName) {
	if (!state.currentSeller) return;
	const name = String(clientName || '').trim();
	state._clientDetailName = name;
	state._clientDetailFrom = document.querySelector('#view-sales')?.classList.contains('hidden') ? 'clients' : 'sales';
	await loadClientDetailRows(name);
	switchView('#view-client-detail');
}

/**
 * Helper to detect 2-second long press on an element
 */
function attachLongPress(el, callback) {
	let timer;
	const delay = 1000; // 1 second

	const start = (e) => {
		// Only trigger on main click or touch
		if (e.type === 'mousedown' && e.button !== 0) return;
		
		timer = setTimeout(() => {
			timer = null;
			if (typeof callback === 'function') callback(e);
		}, delay);
	};

	const cancel = () => {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
	};

	el.addEventListener('mousedown', start);
	el.addEventListener('touchstart', start, { passive: true });

	el.addEventListener('mouseup', cancel);
	el.addEventListener('mouseleave', cancel);
	el.addEventListener('touchend', cancel);
	el.addEventListener('touchmove', cancel);
}

/**
 * Opens a full-screen (mobile) or centered (desktop) popover to edit client CRM description
 */
async function openClientDescriptionPopover(clientName, e) {
	if (!clientName) return;
	
	// Create Overlay
	const overlay = document.createElement('div');
	overlay.className = 'desc-popover-overlay';
	
	// Create Content
	const content = document.createElement('div');
	content.className = 'desc-popover-content';
	
	// Calculate Position (Contextual)
	let x = 20;
	let y = 100;
	if (e) {
		const touch = e.touches ? e.touches[0] : e;
		x = touch.clientX || 20;
		y = touch.clientY || 100;
	}
	
	// Adjust to be roughly centered around press bit shifted up to avoid finger cover
	const viewportW = window.innerWidth;
	const viewportH = window.innerHeight;
	
	if (viewportW > 600) {
		content.style.left = Math.min(viewportW - 480, Math.max(20, x - 230)) + 'px';
		content.style.top = Math.min(viewportH - 200, Math.max(20, y - 60)) + 'px';
	} else {
		// Mobile: roughly top region near press
		content.style.top = Math.min(viewportH - 300, Math.max(20, y - 100)) + 'px';
	}
	
	// Body only (no header/footer)
	const body = document.createElement('div');
	body.className = 'desc-popover-body';
	
	const textarea = document.createElement('textarea');
	textarea.className = 'desc-popover-textarea';
	textarea.placeholder = 'Descripción...';
	textarea.value = 'Cargando...';
	textarea.disabled = true;
	body.appendChild(textarea);
	
	content.appendChild(body);
	overlay.appendChild(content);
	document.body.appendChild(overlay);
	
	// Fetch Client Info
	let clientInfo = null;
	try {
		const sellerId = state.currentSeller?.id || state._clientDetailSellerId;
		if (!sellerId) throw new Error('No se pudo identificar al vendedor encargado');
		
		const clients = await api('GET', `${API.Clients}?seller_id=${sellerId}`);
		clientInfo = (clients || []).find(c => String(c.name).trim().toLowerCase() === String(clientName).trim().toLowerCase());
		textarea.value = clientInfo?.description || '';
		textarea.disabled = false;
		textarea.focus();
	} catch (e) {
		console.error('Error fetching client description:', e);
		textarea.value = '';
		textarea.placeholder = 'Error al cargar. Puedes escribir una nueva descripción.';
		textarea.disabled = false;
	}
	
	const closeAndSave = async () => {
		const newDesc = textarea.value.trim();
		const oldDesc = (clientInfo?.description || '').trim();
		
		// Remove from DOM immediately for snappy feel
		overlay.style.opacity = '0';
		overlay.style.transition = 'opacity 0.2s';
		setTimeout(() => overlay.remove(), 200);
		
		if (newDesc !== oldDesc) {
			try {
				const sellerId = state.currentSeller?.id || state._clientDetailSellerId;
				if (!sellerId) throw new Error('No se pudo identificar al vendedor encargado');
				
				await api('POST', API.Clients, {
					seller_id: sellerId,
					name: clientName,
					description: newDesc
				});
				showToast('Descripción guardada', 'success');
			} catch (e) {
				console.error('Error saving description:', e);
				showToast('Error al guardar descripción: ' + e.message, 'error');
			}
		}
	};
	
	overlay.addEventListener('click', (e) => {
		if (e.target === overlay) closeAndSave();
	});
	
	// Pre-emptively close on touchstart outside content for extreme snappiness on mobile
	overlay.addEventListener('touchstart', (e) => {
		if (e.target === overlay) closeAndSave();
	}, { passive: true });
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

	// Use optimized endpoint to get all sales for this client across all sellers in parallel
	await Promise.all(sellersToSearch.map(async (seller) => {
		try {
			const params = new URLSearchParams({
				client_name: clientName,
				client_seller_id: String(seller.id)
			});
			const sales = await api('GET', `${API.Sales}?${params.toString()}`);

			for (const s of (sales || [])) {
				allRows.push({
					id: s.id,
					dayIso: String(s.day).slice(0, 10),
					sellerName: seller.name || '',
					sellerId: seller.id,
					qty_arco: Number(s.qty_arco || 0),
					qty_melo: Number(s.qty_melo || 0),
					qty_mara: Number(s.qty_mara || 0),
					qty_oreo: Number(s.qty_oreo || 0),
					qty_nute: Number(s.qty_nute || 0),
					pay_method: s.pay_method || '',
					is_paid: !!s.is_paid,
					items: s.items || [],
					client_tags: s.client_tags || [],
					comment_text: s.comment_text || ''
				});
			}
		} catch (e) {
			console.error('Error loading client details for seller:', seller.name, e);
		}
	}));

	// Sort by date descending
	allRows.sort((a, b) => (a.dayIso < b.dayIso ? 1 : a.dayIso > b.dayIso ? -1 : 0));

	// Save the primary seller for this client (from the most recent order)
	if (allRows.length > 0) {
		state._clientDetailSellerId = allRows[0].sellerId;
	}

	state._clientDetailRows = allRows;
	renderClientDetailTable();
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
			dayIso: String(s.day).slice(0, 10),
			sellerName: sellerName,
			sellerId: sellerId,
			qty_arco: Number(s.qty_arco || 0),
			qty_melo: Number(s.qty_melo || 0),
			qty_mara: Number(s.qty_mara || 0),
			qty_oreo: Number(s.qty_oreo || 0),
			qty_nute: Number(s.qty_nute || 0),
			pay_method: s.pay_method || '',
			is_paid: !!s.is_paid,
			items: s.items || [],
			client_tags: s.client_tags || [],
			comment_text: s.comment_text || ''
		});
	}

	// Data already sorted by backend (day DESC)
	state._clientDetailRows = allRows;

	// Save the seller ID for this client
	state._clientDetailSellerId = sellerId;

	renderClientDetailTable();
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
			const isAllZero = !Number(s.qty_arco || 0) && !Number(s.qty_melo || 0) && !Number(s.qty_mara || 0) && !Number(s.qty_oreo || 0) && !Number(s.qty_nute || 0);
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
			const any = Object.values(byField).some(v => Number(v || 0) > 0);
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

function renderClientDetailTable() {
	const rows = state._clientDetailRows || [];
	const tbody = document.getElementById('client-detail-tbody');
	if (!tbody) return;

	// Update Tag Filters for History
	renderTagFilters(rows, 'client-detail-tags-filter', () => renderClientDetailTable());

	// Filter by search and tag
	const searchInput = document.getElementById('client-detail-search-input');
	if (searchInput && !searchInput.dataset.bound) {
		searchInput.dataset.bound = '1';
		searchInput.addEventListener('input', () => renderClientDetailTable());
	}
	const query = (searchInput?.value || '').toLowerCase().trim();

	let filteredRows = rows.filter(row => {
		// 1. Search query filter (search in date, products, comment)
		if (query) {
			const date = String(row.dayIso).toLowerCase();
			const products = (row.items || []).map(i => (i.name || '').toLowerCase()).join(' ');
			const comment = (row.comment_text || '').toLowerCase();
			if (!date.includes(query) && !products.includes(query) && !comment.includes(query)) return false;
		}
		return true;
	});

	// 2. Tag Sort ("Mostrar Primero")
	if (state.currentTagIdFilter) {
		const filterKey = state.currentTagIdFilter;
		filteredRows.sort((a, b) => {
			const hasA = (a.client_tags || []).some(t => (t.id || t.name) === filterKey);
			const hasB = (b.client_tags || []).some(t => (t.id || t.name) === filterKey);
			if (hasA && !hasB) return -1;
			if (!hasA && hasB) return 1;
			return 0;
		});
	}

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
		title.innerHTML = '';
		title.style.display = 'flex';
		title.style.flexDirection = 'column';
		title.style.alignItems = 'center';
		title.style.gap = '4px';

		// Line 1: Name and Seller
		const line1 = document.createElement('div');
		line1.style.display = 'flex';
		line1.style.alignItems = 'center';
		line1.style.gap = '8px';

		const clientNameSpan = document.createElement('span');
		clientNameSpan.textContent = state._clientDetailName || 'Cliente';
		clientNameSpan.style.cursor = 'pointer';
		clientNameSpan.addEventListener('click', () => {
			openEditClientNameDialog(state._clientDetailName);
		});
		line1.appendChild(clientNameSpan);

		if (rows && rows.length > 0 && rows[0].sellerName) {
			const s = document.createElement('span');
			s.textContent = '  -  ' + rows[0].sellerName;
			s.style.opacity = '0.7';
			line1.appendChild(s);
		}
		title.appendChild(line1);

		// Line 2: Tags and Note (from primary/latest sale)
		const line2 = document.createElement('div');
		line2.className = 'client-row-2';
		line2.style.justifyContent = 'center';
		
		const sampleSale = rows[0] || {};
		if (Array.isArray(sampleSale.client_tags) && sampleSale.client_tags.length > 0) {
			const tagsWrap = document.createElement('div');
			tagsWrap.className = 'tag-badges-container';
			sampleSale.client_tags.forEach(t => {
				const span = document.createElement('span');
				span.className = 'tag-badge-small';
				span.style.backgroundColor = t.color || '#818cf8';
				span.textContent = t.name;
				tagsWrap.appendChild(span);
			});
			line2.appendChild(tagsWrap);
		}

		const inlineComment = document.createElement('div');
		inlineComment.className = 'inline-comment-input';
		inlineComment.contentEditable = 'true';
		inlineComment.textContent = sampleSale.comment_text || '';
		if (!inlineComment.textContent) inlineComment.setAttribute('data-placeholder', 'Nota...');
		
		inlineComment.style.textAlign = 'center';
		inlineComment.style.width = '120px';
		inlineComment.style.display = 'block';
		inlineComment.style.margin = '0 auto';
		inlineComment.style.minHeight = '14px';

		inlineComment.addEventListener('input', () => {
			if (inlineComment.textContent) inlineComment.removeAttribute('data-placeholder');
			else inlineComment.setAttribute('data-placeholder', 'Nota...');
		});

		inlineComment.addEventListener('blur', async () => {
			const newText = inlineComment.textContent.trim();
			if (sampleSale.id) {
				await saveComment(sampleSale.id, newText);
				sampleSale.comment_text = newText;
			}
		});
		line2.appendChild(inlineComment);
		title.appendChild(line2);
	}

	if (!rows || rows.length === 0) {
		const tr = document.createElement('tr');
		const td = document.createElement('td'); td.colSpan = 9; td.textContent = 'Sin compras'; td.style.opacity = '0.8';
		tr.appendChild(td); tbody.appendChild(tr);
		// Clear totals
		document.getElementById('client-detail-total-items').textContent = '';
		document.getElementById('client-detail-total-grand').textContent = '';
		return;
	}
	for (const r of rows) {
		const tr = document.createElement('tr');
		tr.dataset.id = String(r.id);
		attachLongPress(tr, (ev) => openClientDescriptionPopover(state._clientDetailName, ev));
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
			function hasSeen(method) { try { return localStorage.getItem('seenPaymentDate_' + method + '_' + saleId) === '1'; } catch { return false; } }
			function markSeen(method) { try { localStorage.setItem('seenPaymentDate_' + method + '_' + saleId, '1'); } catch { } }
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
				// Don't intercept if focus is actually in an input/textarea
				if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
				
				e.preventDefault();
				const isAdminUser = !!state.currentUser?.isAdmin || state.currentUser?.role === 'superadmin';
				const pm = String(r.pay_method || '').trim().replace(/\.$/, '').toLowerCase();
				const locked = pm !== '' && pm !== 'entregado';
				if (!isAdminUser && locked) return;
				const curr = String(sel.value || '');
				const saleId = Number(r.id);
				const rect = wrap.getBoundingClientRect();
				function hasSeen(method) { try { return localStorage.getItem('seenPaymentDate_' + method + '_' + saleId) === '1'; } catch { return false; } }
				function markSeen(method) { try { localStorage.setItem('seenPaymentDate_' + method + '_' + saleId, '1'); } catch { } }
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
			applyPayClass();
		});
		wrap.appendChild(sel); tdPay.appendChild(wrap);
		// Add a visible dash '-' like the main table when no method, using CSS class 'placeholder'
		if (!sel.value) { /* wrap already has placeholder class to show '-' via styles */ }
		const tdDate = document.createElement('td'); tdDate.textContent = formatDayLabel(r.dayIso);
		
		const tdDetalle = document.createElement('td');
		tdDetalle.style.fontSize = '0.9em';
		tdDetalle.style.color = 'var(--text-muted)';
		let parts = [];
		const legacy = [
			{ q: getQtyForDessert(r, 'arco'), n: 'Arco' },
			{ q: getQtyForDessert(r, 'melo'), n: 'Melo' },
			{ q: getQtyForDessert(r, 'mara'), n: 'Mara' },
			{ q: getQtyForDessert(r, 'oreo'), n: 'Oreo' },
			{ q: getQtyForDessert(r, 'nute'), n: 'Nute' }
		];
		legacy.forEach(l => { if(l.q > 0) parts.push(`${l.q} ${l.n}`); });
		
		if(r.items && r.items.length > 0) {
			r.items.forEach(i => {
				const nom = i.name || i.short_code || 'Item';
				const capNom = nom.charAt(0).toUpperCase() + nom.slice(1).toLowerCase();
				parts.push(`${i.quantity} ${capNom}`);
			});
		}
		tdDetalle.textContent = parts.join(', ');

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
				// Reload the client detail view
				if (state._clientDetailFrom === 'global-search') {
					await loadGlobalClientDetailRows(state._clientDetailName);
				} else {
					await loadClientDetailRows(state._clientDetailName);
				}
			} catch (err) {
				// Error handled silently
			}
		});
		tdDel.appendChild(delBtn);
		tr.append(tdPay, tdDate, tdDetalle, tdTot, tdDel);
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
	const totalsMap = {};
	let totalGrand = 0;
	for (const r of rows) {
		const legacy = [
			{ q: getQtyForDessert(r, 'arco'), n: 'Arco' },
			{ q: getQtyForDessert(r, 'melo'), n: 'Melo' },
			{ q: getQtyForDessert(r, 'mara'), n: 'Mara' },
			{ q: getQtyForDessert(r, 'oreo'), n: 'Oreo' },
			{ q: getQtyForDessert(r, 'nute'), n: 'Nute' }
		];
		legacy.forEach(l => { if(l.q > 0) { totalsMap[l.n] = (totalsMap[l.n] || 0) + l.q; } });
		
		if(r.items && r.items.length > 0) {
			r.items.forEach(i => {
				const nom = i.name || i.short_code || 'Item';
				const capNom = nom.charAt(0).toUpperCase() + nom.slice(1).toLowerCase();
				totalsMap[capNom] = (totalsMap[capNom] || 0) + Number(i.quantity);
			});
		}
		totalGrand += calcRowTotal(r);
	}

	const totalsStr = Object.entries(totalsMap).map(([k,v]) => `${v} ${k}`).join(', ');
	const itemEl = document.getElementById('client-detail-total-items');
	itemEl.textContent = totalsStr;
	itemEl.title = totalsStr;
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
						qty_arco: Number(s.qty_arco || 0),
						qty_melo: Number(s.qty_melo || 0),
						qty_mara: Number(s.qty_mara || 0),
						qty_oreo: Number(s.qty_oreo || 0),
						qty_nute: Number(s.qty_nute || 0),
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

// ⚙️ APP VERSION: Must match backend version
const APP_VERSION = '2.3.0'; // Bumped to force logout of legacy sessions
const VERSION_HEADER = 'X-App-Version';

const API = {
	Sellers: '/api/sellers',
	Sales: '/api/sales',
	Users: '/api/users',
	Materials: '/api/materials',
	Recipes: '/api/recipes',
	Inventory: '/api/inventory',
	Desserts: '/api/desserts',
	Notifications: '/api/notifications',
	Clients: '/api/clients'
};

const DEFAULT_A_COSTO_MULTIPLIER = 0.55;

function getDefaultCostPriceFromSalePrice(salePrice) {
	return Math.round((Number(salePrice || 0) || 0) * DEFAULT_A_COSTO_MULTIPLIER);
}

function getCostPriceForDessert(dessert) {
	if (!dessert) return 0;
	// Use explicit cost_price from DB if available
	const directCost = Number(dessert.cost_price);
	if (Number.isFinite(directCost) && directCost >= 0) return Math.round(directCost);
	// Otherwise fallback to 55% of current sale price
	const salePrice = Number(dessert.sale_price ?? 0) || 0;
	return getDefaultCostPriceFromSalePrice(salePrice);
}

function getUnitPriceForDessertByPricingType(dessert, specialPricingType) {
	if (specialPricingType === 'muestra') return 0;
	if (specialPricingType === 'a_costo') return getCostPriceForDessert(dessert);
	return Number(dessert?.sale_price ?? 0) || 0;
}

function getPromotionForDessert(dessert) {
	if (!dessert) return null;
	const qty = Math.floor(Number(dessert.promo_qty || 0) || 0);
	const price = Math.round(Number(dessert.promo_price || 0) || 0);
	if (qty < 2 || price < 0) return null;
	return { qty, price };
}

function getSaleDessertQty(sale, dessert) {
	if (!sale || !dessert) return 0;
	if (Array.isArray(sale.items) && sale.items.length > 0) {
		let totalQty = 0;
		for (const item of sale.items) {
			const sameDessert = item?.dessert_id === dessert.id || item?.short_code === dessert.short_code;
			if (sameDessert) totalQty += Number(item?.quantity || 0) || 0;
		}
		return totalQty;
	}
	return Number(sale[`qty_${dessert.short_code}`] || 0) || 0;
}

function getDessertAmountForSale(dessert, qty, specialPricingType) {
	const quantity = Math.max(0, Math.floor(Number(qty || 0) || 0));
	if (!quantity) return 0;

	const unitPrice = getUnitPriceForDessertByPricingType(dessert, specialPricingType);
	if (specialPricingType === 'muestra' || specialPricingType === 'a_costo') {
		return quantity * unitPrice;
	}

	const promotion = getPromotionForDessert(dessert);
	if (!promotion) return quantity * unitPrice;

	const bundleCount = Math.floor(quantity / promotion.qty);
	const remainder = quantity % promotion.qty;
	return (bundleCount * promotion.price) + (remainder * unitPrice);
}

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
	visibleDesserts: [], // Desserts currently visible in sales table (sold in selected day)
	globalClientSuggestions: [], // Global client suggestions for header search
	currentTagIdFilter: null, // Active tag filter ID for sales tables
	_clientDetailRows: [],   // Raw rows for current client detail view
};

// Toasts (simple notifications)
const notify = (() => {
	const container = () => document.getElementById('toast-container');
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
		} catch { }
		c.appendChild(n);
		if (timeoutMs > 0) setTimeout(() => dismiss(n), timeoutMs);
	}
	function dismiss(node) {
		if (!node || !node.parentNode) return;
		node.style.animation = 'toast-out 140ms ease-in forwards';
		setTimeout(() => { if (node.parentNode) node.parentNode.removeChild(node); }, 140);
	}
	function loading(message) {
		const c = container();
		if (!c) return { close: () => { } };
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
	return { info: (m, t) => render('info', m, t), success: (m, t) => render('success', m, t), error: (m, t) => render('error', m, t), loading };
})();

// Theme management
(function initTheme() {
	try {
		const saved = localStorage.getItem('theme');
		if (saved === 'dark') {
			document.documentElement.setAttribute('data-theme', 'dark');
		} else {
			document.documentElement.removeAttribute('data-theme');
		}
	} catch { }
	document.addEventListener('DOMContentLoaded', () => {
		const btn = document.getElementById('theme-toggle');
		if (!btn) return;
		updateThemeButton(btn);
		btn.addEventListener('click', () => {
			const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
			if (isDark) {
				document.documentElement.removeAttribute('data-theme');
				try { localStorage.setItem('theme', 'light'); } catch { }
			} else {
				document.documentElement.setAttribute('data-theme', 'dark');
				try { localStorage.setItem('theme', 'dark'); } catch { }
			}
			updateThemeButton(btn);
		});
	});
})();

function updateThemeButton(btn) {
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
				try { localStorage.setItem('authUser', JSON.stringify(state.currentUser)); } catch { }
				applyAuthVisibility();
				await loadSellers();
				renderSellerButtons();
				const usernameLower = String(res.username || '').toLowerCase();
				const feminineUsers = new Set(['marcela', 'aleja', 'kate', 'stefa', 'mariana', 'janeth']);
				const welcome = feminineUsers.has(usernameLower) ? 'Bienvenida ' : 'Bienvenido ';
				// notify.success(welcome + res.username);
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
			// notify.success('Contraseña actualizada');
		} catch (e) {
			notify.error('No se pudo actualizar la contraseña');
		}
	});
	const logoutBtn = document.getElementById('logout-btn');
	logoutBtn?.addEventListener('click', () => {
		state.currentUser = null;
		try { localStorage.removeItem('authUser'); } catch { }
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

// Force logout and reload
function forceLogoutAndReload(reason = 'Sesión expirada') {
	console.warn('[AUTH] Forcing logout:', reason);
	try { localStorage.clear(); } catch { }
	state.currentUser = null;
	state.currentSeller = null;
	alert(reason + '\n\nLa página se recargará para actualizar la aplicación.');
	window.location.reload(true); // Force reload from server
}

// Helper function for fetch with version header and error handling
async function fetchWithVersion(url, options = {}) {
	const headers = {
		...options.headers,
		[VERSION_HEADER]: APP_VERSION
	};

	const res = await fetch(url, { ...options, headers });

	// Check for service unavailable
	if (res.status === 503) {
		console.error('[API] Server returned 503 - service temporarily unavailable');
		throw new Error('service_unavailable');
	}

	// Check for version mismatch or forced logout
	if (res.status === 426 || res.status === 403) {
		try {
			const data = await res.json();
			if (data.action === 'force_reload' || data.action === 'force_logout') {
				forceLogoutAndReload(data.message || 'Tu aplicación está desactualizada');
				throw new Error('force_reload'); // Prevent further execution
			}
		} catch (e) {
			if (e.message === 'force_reload') throw e;
		}
	}

	return res;
}

async function api(method, url, body) {
	const actor = (state?.currentUser?.name || state?.currentUser?.username || '').toString();
	const res = await fetch(url, {
		method,
		headers: {
			'Content-Type': 'application/json',
			[VERSION_HEADER]: APP_VERSION,
			...(actor ? { 'X-Actor-Name': actor } : {})
		},
		body: body ? JSON.stringify(body) : undefined,
	});

	// Check for version mismatch or forced logout
	if (res.status === 426 || res.status === 403) {
		try {
			const data = await res.json();
			if (data.action === 'force_reload' || data.action === 'force_logout') {
				forceLogoutAndReload(data.message || 'Tu aplicación está desactualizada');
				return; // Prevent further execution
			}
		} catch { }
	}

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`API ${method} ${url} failed: ${res.status} ${text}`);
	}
	return res.json();
}

async function loadSellers() {
	// Try loading from localStorage first for instant feel
	try {
		const cached = localStorage.getItem('sellers_cache');
		if (cached) {
			state.sellers = JSON.parse(cached);
			renderSellerButtons();
			applyAuthVisibility();
		}
	} catch (e) { }

	try {
		state.sellers = await api('GET', API.Sellers);
		try {
			localStorage.setItem('sellers_cache', JSON.stringify(state.sellers));
		} catch (e) { }
	} catch (err) {
		console.error('Error loading sellers:', err);
	}

	// Update dynamic seller icon for current seller if available
	if (state.currentSeller) {
		const fresh = (state.sellers || []).find(s => s.id === state.currentSeller.id);
		if (fresh) {
			state.currentSeller = fresh;
		}
	}
	renderSellerButtons();
	applyAuthVisibility();

	// Load global client suggestions in background (non-blocking)
	loadGlobalClientSuggestions().catch(e => console.error('Error loading global suggestions:', e));
}

// Load all clients the current user has permission to see (optimized)
async function loadGlobalClientSuggestions() {
	try {
		if (!state.currentUser) {
			state.globalClientSuggestions = [];
			return;
		}

		// Try loading from localStorage first for instant feel
		try {
			const cached = localStorage.getItem('global_clients_cache');
			if (cached) {
				const { data, timestamp } = JSON.parse(cached);
				// Use cache if it's less than 1 hour old
				if (data && Array.isArray(data)) {
					state.globalClientSuggestions = data;
					if (Date.now() - timestamp < 3600000) {
						state._globalSuggestionsLoadedAt = timestamp;
						return; // Data is fresh enough
					}
				}
			}
		} catch (e) { }

		const isSuper = state.currentUser?.role === 'superadmin' || !!state.currentUser?.isSuperAdmin;
		const isAdmin = !!state.currentUser?.isAdmin;

		let resultArr = [];

		if (isSuper || isAdmin) {
			// Optimized: One single call to get ALL global clients including historical ones from sales table
			const clients = await api('GET', '/api/clients?global=1');
			resultArr = (clients || []).map(c => ({
				key: normalizeClientName(c.name),
				name: c.name,
				count: Number(c.records_count || 1) // Using fallback as single global call might not have counts
			}));
		} else {
			// Regular user: load only their own clients
			const seller = (state.sellers || []).find(s =>
				String(s.name).toLowerCase() === String(state.currentUser.name || '').toLowerCase()
			);
			if (seller) {
				const clients = await api('GET', `/api/clients?seller_id=${encodeURIComponent(seller.id)}`);
				resultArr = (clients || []).map(c => ({
					key: normalizeClientName(c.name),
					name: c.name,
					count: 1
				}));
			}
		}

		// Sort by count (if available) and then name
		resultArr.sort((a, b) => {
			if (b.count !== a.count) return b.count - a.count;
			return (a.name || '').localeCompare(b.name || '', 'es');
		});

		state.globalClientSuggestions = resultArr;
		state._globalSuggestionsLoadedAt = Date.now();

		// Save to cache
		try {
			localStorage.setItem('global_clients_cache', JSON.stringify({
				data: resultArr,
				timestamp: state._globalSuggestionsLoadedAt
			}));
		} catch (e) { }

	} catch (e) {
		console.error('Error loading global client suggestions:', e);
		// Don't clear if we have cached data
		if (!state.globalClientSuggestions || state.globalClientSuggestions.length === 0) {
			state.globalClientSuggestions = [];
		}
	}
}

function renderSellerButtons() {
	const list = $('#seller-list');
	list.innerHTML = '';
	// Server already filters sellers by permissions. Render all returned.
	const isSuper = state.currentUser?.role === 'superadmin' || !!state.currentUser?.isSuperAdmin;
	for (const s of state.sellers) {
		const btn = el('button', {
			class: 'seller-button', onclick: async (ev) => {
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
						// notify.success('Vendedor eliminado');
						renderSellerButtons();
					} catch (e) {
						try { notify.error('No se pudo eliminar el vendedor'); } catch { }
					}
					return;
				}
				await enterSeller(s.id);
			}
		}, s.name);
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
		// notify.success('Vendedor agregado');
	} catch (err) {
		try {
			const msg = (err && err.message || '').includes('403') ? 'No autorizado para agregar vendedores' : 'No se pudo agregar el vendedor';
			notify.error(msg);
		} catch { }
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
	} catch { }
	state.saleDays = [];
	state.selectedDayId = null;
	state.clientCounts = new Map();
	// Show dates section, hide table until a date is selected
	document.getElementById('dates-section')?.classList.remove('hidden');
	document.getElementById('sales-wrapper')?.classList.add('hidden');

	// Load desserts and days in parallel
	await Promise.all([
		loadDesserts().then(() => renderDessertColumns()),
		loadDaysForSeller()
	]);

	// 🛠️ FIX: Ensure UI transitions to the sales view when a seller is selected
	switchView('#view-sales');
}

function switchView(id) {
	document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
	$(id).classList.remove('hidden');
	// Close client action bar when switching views
	if (typeof closeClientActionBar === 'function') {
		closeClientActionBar();
	}
	// Recompute toolbar offset when sales view becomes visible (used by sticky table header).
	if (id === '#view-sales') {
		requestAnimationFrame(() => updateToolbarOffset());
	}
}

function applyAuthVisibility() {
	const isAdminUser = !!state.currentUser?.isAdmin;
	const isSuper = state.currentUser?.role === 'superadmin' || !!state.currentUser?.isSuperAdmin;
	const logoutBtn = document.getElementById('logout-btn');
	if (logoutBtn) logoutBtn.style.display = state.currentUser ? 'inline-flex' : 'none';
	// Update notification center button visibility
	const notifBtn = document.getElementById('notification-center-btn');
	if (notifBtn) notifBtn.style.display = isSuper ? 'inline-flex' : 'none';
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
	const gamesBtn = document.getElementById('games-button');
	const partnersBtn = document.getElementById('partners-button');
	const purchasesBtn = document.getElementById('purchases-button');
	const storeBtn = document.getElementById('store-button');
	const crmAdminBtn = document.getElementById('crm-admin-button');
	const canSales = isSuper || feats.has('reports.sales');
	const canCartera = isSuper || feats.has('reports.cartera');
	const canProjections = isSuper || feats.has('reports.projections');
	const canTransfers = isSuper || feats.has('reports.transfers');
	const canMaterials = isSuper || feats.has('nav.materials');
	const canInventory = isSuper || feats.has('nav.inventory');
	const canUsers = isSuper || feats.has('nav.users');
	const canAccounting = isSuper || feats.has('nav.accounting');
	const canDesserts = isSuper || feats.has('nav.desserts');
	const canGames = isSuper || feats.has('nav.games');
	const canPartners = isSuper || feats.has('nav.partners');
	const canPurchases = isSuper || feats.has('nav.purchases');
	const canStore = isSuper || feats.has('nav.store');
	const canCrm = isSuper || feats.has('nav.crm');
	if (usersBtn) usersBtn.style.display = canUsers ? 'inline-block' : 'none';
	if (reportBtn) reportBtn.style.display = canSales ? 'inline-block' : 'none';
	if (carteraBtn) carteraBtn.style.display = canCartera ? 'inline-block' : 'none';
	if (projectionsBtn) projectionsBtn.style.display = canProjections ? 'inline-block' : 'none';
	if (transfersBtn) transfersBtn.style.display = canTransfers ? 'inline-block' : 'none';
	if (materialsBtn) materialsBtn.style.display = canMaterials ? 'inline-block' : 'none';
	if (inventoryBtn) inventoryBtn.style.display = canInventory ? 'inline-block' : 'none';
	if (accountingBtn) accountingBtn.style.display = canAccounting ? 'inline-block' : 'none';
	const canDeliveries = isSuper || feats.has('nav.deliveries');
	if (dessertsBtn) dessertsBtn.style.display = canDesserts ? 'inline-block' : 'none';
	if (deliveriesBtn) deliveriesBtn.style.display = canDeliveries ? 'inline-block' : 'none';
	if (gamesBtn) gamesBtn.style.display = canGames ? 'inline-block' : 'none';
	if (partnersBtn) partnersBtn.style.display = canPartners ? 'inline-block' : 'none';
	if (purchasesBtn) purchasesBtn.style.display = canPurchases ? 'inline-block' : 'none';
	if (storeBtn) storeBtn.style.display = canStore ? 'inline-block' : 'none';
	if (crmAdminBtn) crmAdminBtn.style.display = canCrm ? 'inline-block' : 'none';

	const globalDbBtn = document.getElementById('global-clients-button');
	if (globalDbBtn) globalDbBtn.style.display = (isSuper || feats.has('nav.globaldb')) ? 'inline-block' : 'none';
}

// Load desserts from API (runs once per session)
async function loadDesserts() {
	if (state.dessertsLoaded && state.desserts.length > 0) return state.desserts;

	// Try loading from localStorage first
	try {
		const cached = localStorage.getItem('desserts_cache');
		if (cached) {
			state.desserts = JSON.parse(cached);
			updateDessertPriceMaps();
			state.dessertsLoaded = true;
			// Don't return yet, update from server in background
		}
	} catch (e) { }

	try {
		state.desserts = await api('GET', API.Desserts);
		try {
			localStorage.setItem('desserts_cache', JSON.stringify(state.desserts));
		} catch (e) { }
		state.dessertsLoaded = true;
		return state.desserts;
	} catch (err) {
		console.error('Error loading desserts from API:', err);
		if (state.desserts && state.desserts.length > 0) return state.desserts;
		state.desserts = [];
		state.dessertsLoaded = true;
		return [];
	}
}


// Render dynamic dessert columns in table header
function renderDessertColumns() {
	const visibleDesserts = getVisibleDessertsForSalesTable();
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
		for (const d of visibleDesserts) {
			const col = document.createElement('col');
			col.className = 'w-qty';
			colgroup.insertBefore(col, totalCol);
		}
	}

	// Insert new th columns before col-total
	const totalTh = headerRow.querySelector('th.col-total');
	if (totalTh) {
		visibleDesserts.forEach((d, i) => {
			const th = document.createElement('th');
			th.className = `col-dessert col-${d.short_code}${i % 2 === 1 ? ' col-alt' : ''}`;
			th.dataset.label = d.name;
			th.dataset.shortCode = d.short_code;
			const span = document.createElement('span');
			span.className = 'v-label';
			span.textContent = d.name;
			th.appendChild(span);
			headerRow.insertBefore(th, totalTh);
		});
	}

	// Also update footer rows
	renderFooterDessertColumns(visibleDesserts);
}

function getVisibleDessertsForSalesTable() {
	// Without selected day there is no "current table", so hide dessert columns.
	if (!state.selectedDayId || !Array.isArray(state.desserts) || state.desserts.length === 0) {
		state.visibleDesserts = [];
		return state.visibleDesserts;
	}

	const soldShortCodes = new Set();
	const shortCodeByDessertId = new Map();
	for (const d of state.desserts) {
		const shortCode = String(d?.short_code || '').trim().toLowerCase();
		if (!shortCode) continue;
		shortCodeByDessertId.set(Number(d.id), shortCode);
	}

	for (const sale of (state.sales || [])) {
		if (!sale) continue;

		if (Array.isArray(sale.items) && sale.items.length > 0) {
			for (const item of sale.items) {
				const qty = Number(item?.quantity || 0) || 0;
				if (qty <= 0) continue;

				const itemShortCode = String(item?.short_code || '').trim().toLowerCase();
				if (itemShortCode) {
					soldShortCodes.add(itemShortCode);
					continue;
				}

				const dessertId = Number(item?.dessert_id || 0) || 0;
				const mappedShortCode = shortCodeByDessertId.get(dessertId);
				if (mappedShortCode) soldShortCodes.add(mappedShortCode);
			}
			continue;
		}

		for (const d of state.desserts) {
			const shortCode = String(d?.short_code || '').trim().toLowerCase();
			if (!shortCode) continue;
			const qty = Number(sale[`qty_${shortCode}`] || 0) || 0;
			if (qty > 0) soldShortCodes.add(shortCode);
		}
	}

	// Only return desserts that have sold at least one or already have a delivered amount set
	state.visibleDesserts = state.desserts.filter(d => {
		const shortCode = String(d?.short_code || '').trim().toLowerCase();
		if (!shortCode) return false;
		
		// If it has sales
		if (soldShortCodes.has(shortCode)) return true;
		
		// If it has delivered units already set in the current day record
		const day = (state && Array.isArray(state.saleDays) && state.selectedDayId)
			? (state.saleDays || []).find(d => d && d.id === state.selectedDayId)
			: null;
		
		const delivered = Number(day?.[`delivered_${shortCode}`] || 0) || 0;
		return delivered > 0;
	});

	return state.visibleDesserts;
}

function renderFooterDessertColumns(visibleDesserts = state.visibleDesserts || []) {
	const qtyRow = document.getElementById('footer-qty-row');
	const amtRow = document.getElementById('footer-amt-row');
	const delivRow = document.getElementById('footer-delivered-row');
	const commRow = document.getElementById('footer-comm-row');
	const commPaidRow = document.getElementById('footer-comm-paid-row');

	if (!qtyRow || !amtRow) return;

	// Remove existing dessert columns from footer
	[qtyRow, amtRow, delivRow, commRow, commPaidRow].forEach(row => {
		if (!row) return;
		const existing = row.querySelectorAll('td.col-dessert');
		existing.forEach(td => td.remove());
	});

	// Mobile structural adjustment for commission rows
	const isMobile = (window.innerWidth <= 600);
	[commRow, commPaidRow].forEach(row => {
		if (row) {
			const labelTd = row.querySelector('td.col-client');
			if (labelTd) labelTd.colSpan = isMobile ? (visibleDesserts.length + 1) : 1;
		}
	});

	// Insert new columns before col-total
	visibleDesserts.forEach((d, i) => {
		const isAlt = (i % 2 === 1);
		const altClass = isAlt ? ' col-alt' : '';

		// Qty row
		if (qtyRow) {
			const totalTd = qtyRow.querySelector('td.col-total');
			const td = document.createElement('td');
			td.className = `col-dessert col-${d.short_code}${altClass}`;
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
			td.className = `col-dessert col-${d.short_code}${altClass}`;
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
			td.className = `col-dessert col-${d.short_code}${altClass}`;
			const span = document.createElement('span');
			span.id = `deliv-${d.short_code}`;
			span.style.outline = 'none';
			span.textContent = '0';
			td.appendChild(span);
			if (totalTd) delivRow.insertBefore(td, totalTd);
		}

		// Comm row (empty cells) - only on desktop
		if (commRow && !isMobile) {
			const totalTd = commRow.querySelector('td.col-total');
			const td = document.createElement('td');
			td.className = `col-dessert col-${d.short_code}${altClass}`;
			if (totalTd) commRow.insertBefore(td, totalTd);
		}
		
		// Comm Paid row (empty cells) - only on desktop
		if (commPaidRow && !isMobile) {
			const totalTd = commPaidRow.querySelector('td.col-total');
			const td = document.createElement('td');
			td.className = `col-dessert col-${d.short_code}${altClass}`;
			if (totalTd) commPaidRow.insertBefore(td, totalTd);
		}
	});

	// Add stacked summary rows
	const footer = document.getElementById('sales-table-footer');
	if (footer) {
		// Remove existing stacked rows
		const existing = footer.querySelectorAll('tr.tfoot-amt-stack:not(.t-am-grand)');
		existing.forEach(tr => tr.remove());

		// Add stacked row for each dessert
		for (const d of visibleDesserts) {
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
	// If total_cents exists from database, use it directly (already accounts for special pricing)
	if (q.hasOwnProperty('total_cents') && q.total_cents !== null && q.total_cents !== undefined) {
		const total = Number(q.total_cents) || 0;
		return total;
	}

	let total = 0;
	if (Array.isArray(q.items) && q.items.length > 0) {
		// Calculate from items (historical prices)
		for (const item of q.items) {
			total += Number(item.quantity || 0) * Number(item.unit_price || 0);
		}
	} else {
		// Legacy fallback
		for (const d of state.desserts) {
			const qty = Number(q[`qty_${d.short_code}`] || 0);
			total += getDessertAmountForSale(d, qty, q.special_pricing_type);
		}
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
	const visibleDesserts = state.visibleDesserts || [];
	const vIdx = visibleDesserts.findIndex(d => d.id === dessert.id);
	const isAlt = (vIdx !== -1 && vIdx % 2 === 1);

	const td = document.createElement('td');
	td.className = `col-dessert col-${dessert.short_code}${isAlt ? ' col-alt' : ''}`;
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
	renderDessertColumns();
	const visibleDesserts = state.visibleDesserts || [];
	const tbody = $('#sales-tbody');
	
	// Update Tag Filters
	renderTagFilters(state.sales, 'active-table-tags-filter', () => renderTable());

	// Filter sales by search and tag
	const searchInput = document.getElementById('active-table-client-search');
	const query = (searchInput?.value || '').toLowerCase().trim();
	
	let filteredSales = (state.sales || []).filter(sale => {
		// 1. Search query filter (Always filter/hide non-matches)
		if (query) {
			const name = (sale.client_name || '').toLowerCase();
			if (!name.includes(query)) return false;
		}
		return true;
	});

	// 2. Tag Sort ("Mostrar Primero")
	if (state.currentTagIdFilter) {
		const filterKey = state.currentTagIdFilter;
		filteredSales.sort((a, b) => {
			const hasA = (a.client_tags || []).some(t => (t.id || t.name) === filterKey);
			const hasB = (b.client_tags || []).some(t => (t.id || t.name) === filterKey);
			if (hasA && !hasB) return -1;
			if (!hasA && hasB) return 1;
			return 0;
		});
	}

	// Update caption with selected date label
	try {
		const cap = document.getElementById('sales-caption');
		if (cap) {
			const strong = cap.querySelector('strong') || document.createElement('strong');
			let label = '';
			if (state && Array.isArray(state.saleDays) && state.selectedDayId) {
				const day = (state.saleDays || []).find(d => d && d.id === state.selectedDayId);
				if (day && day.day) label = formatDayLabel(String(day.day).slice(0, 10));
			}
			strong.textContent = label || '';
			if (!cap.contains(strong)) cap.appendChild(strong);
		}
	} catch { }
	tbody.innerHTML = '';
	for (const sale of filteredSales) {
		const total = calcRowTotal(sale);
		const isPaid = !!sale.is_paid;
		const tr = el('tr', { 'data-sale-id': sale.id },
			el('td', { class: 'col-paid' }, (function () {
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
				sel.addEventListener('change', async () => {
					await savePayMethod(tr, sale.id, sel.value);
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
						// Don't intercept if focus is actually in an input/textarea
						if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
						
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
			(function () {
				const td = document.createElement('td');
				td.className = 'col-client';
				
				const container = document.createElement('div');
				container.className = 'col-client-container';

				const row1 = document.createElement('div');
				row1.className = 'client-row-1';

				const input = document.createElement('input');
				input.className = 'input-cell client-input';
				input.value = sale.client_name || '';
				input.placeholder = '';
				input.readOnly = true;
				
				const isAdminUser = !!state.currentUser?.isAdmin || state.currentUser?.role === 'superadmin';
				const saleLocked = String(sale.pay_method || '').trim() !== '';
				if (!isAdminUser && saleLocked) {
					input.style.cursor = 'default';
					input.title = 'Pedido bloqueado';
				} else {
					input.style.cursor = 'pointer';
				}

				if (sale.special_pricing_type === 'muestra') {
					input.style.background = 'rgba(255, 165, 0, 0.5)';
					input.style.color = 'white';
				} else if (sale.special_pricing_type === 'a_costo') {
					input.style.background = 'rgba(240, 98, 146, 0.5)';
					input.style.color = 'white';
				}

				input.addEventListener('click', (e) => {
					e.stopPropagation();
					const currentName = input.value || '';
					openClientActionBar(td, sale.id, currentName, e.clientX, e.clientY);
				});
				
				row1.appendChild(input);
				
				// Recurrence and Comment Indicators
				const indicators = document.createElement('div');
				indicators.style.display = 'flex';
				indicators.style.alignItems = 'center';
				indicators.style.position = 'absolute';
				indicators.style.right = '4px';
				indicators.style.top = '50%';
				indicators.style.transform = 'translateY(-50%)';
				indicators.style.gap = '2px';
				indicators.style.pointerEvents = 'none';

				const name = (sale.client_name || '').trim();
				if (name) {
					const key = normalizeClientName(name);
					const count = (state.clientCounts && typeof state.clientCounts.get === 'function') ? (state.clientCounts.get(key) || 0) : 0;
					if (count > 1) {
						const reg = document.createElement('span');
						reg.className = 'client-reg-large';
						reg.textContent = '®';
						reg.style.fontSize = '10px';
						reg.style.opacity = '0.6';
						indicators.appendChild(reg);
					}
				}
				
				row1.appendChild(indicators);
				container.appendChild(row1);

				// Row 2: Tags and Inline Note
				const row2 = document.createElement('div');
				row2.className = 'client-row-2';

				if (Array.isArray(sale.client_tags) && sale.client_tags.length > 0) {
					const tagsWrap = document.createElement('div');
					tagsWrap.className = 'tag-badges-container';
					sale.client_tags.forEach(t => {
						const span = document.createElement('span');
						span.className = 'tag-badge-small';
						span.style.backgroundColor = t.color || '#818cf8';
						span.textContent = t.name;
						tagsWrap.appendChild(span);
					});
					row2.appendChild(tagsWrap);
				}

				const inlineComment = document.createElement('div');
				inlineComment.className = 'inline-comment-input';
				inlineComment.contentEditable = 'true';
				inlineComment.textContent = sale.comment_text || '';
				if (!inlineComment.textContent) inlineComment.setAttribute('data-placeholder', 'Escribir nota...');
				
				inlineComment.addEventListener('input', () => {
					if (inlineComment.textContent) inlineComment.removeAttribute('data-placeholder');
					else inlineComment.setAttribute('data-placeholder', 'Escribir nota...');
				});

				inlineComment.addEventListener('blur', async () => {
					const newText = inlineComment.textContent.trim();
					if (newText !== (sale.comment_text || '').trim()) {
						await saveComment(sale.id, newText);
						sale.comment_text = newText;
					}
				});
				inlineComment.addEventListener('click', (e) => e.stopPropagation());
				
				row2.appendChild(inlineComment);
				container.appendChild(row2);

				td.appendChild(container);
				return td;
			})()
		);

		// Add dynamic dessert columns
		for (const dessert of visibleDesserts) {
			const dessertCell = createDessertQtyCell(sale, dessert, tr);
			tr.appendChild(dessertCell);
		}

		// Continue with total and actions columns
		tr.appendChild(el('td', { class: 'total col-total' }, fmtNo.format(total)));
		tr.appendChild(el('td', { class: 'col-actions' }, (function () {
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
		attachLongPress(tr, (ev) => openClientDescriptionPopover(sale.client_name, ev));
		tbody.appendChild(tr);
		// Comment trigger removed per request
	}
	// Inline add row line just below last sale
	const colCount = document.querySelectorAll('#sales-table thead th').length || 8;
	const addTr = document.createElement('tr');
	addTr.className = 'add-row-line';
	
	// Split into two cells to align correctly on mobile: 
	// 1st cell covers all but actions, 2nd cell is empty for actions column.
	const td = document.createElement('td');
	td.colSpan = colCount - 1;
	
	const container = document.createElement('div');
	container.className = 'add-row-inline-container';
	
	const btn = document.createElement('button');
	btn.className = 'inline-add-btn btn-primary';
	btn.textContent = 'Nuevo pedido';
	btn.addEventListener('click', (ev) => {
		const rect = ev.currentTarget.getBoundingClientRect();
		openNewSalePopover(rect.left + rect.width / 2, rect.top - 8);
	});
	
	const inlineTotal = document.createElement('span');
	inlineTotal.id = 'inline-grand-total';
	inlineTotal.className = 'inline-total-mobile';
	
	container.appendChild(btn);
	container.appendChild(inlineTotal);
	td.appendChild(container);
	addTr.appendChild(td);
	
	// Add the actions column cell (empty) to push the content to the left of it
	const tdActions = document.createElement('td');
	tdActions.className = 'col-actions';
	addTr.appendChild(tdActions);
	
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
	// Obsolete: server syncs pay_method automatically
	return;
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

		const cacheKey = `sales_cache_${sellerId}_${state.selectedDayId || 'all'}`;
		
		try {
			const cached = localStorage.getItem(cacheKey);
			if (cached) {
				const parsed = JSON.parse(cached);
				if (Array.isArray(parsed)) {
					state.sales = parsed;
					// Re-hydrate quick props
					for (const sale of state.sales) {
						if (sale && sale.payment_date && sale.payment_source) {
							sale._paymentInfo = { date: sale.payment_date, source: sale.payment_source, sourceValue: (sale.payment_source || '').toLowerCase() };
						}
					}
					// Load cached counts
					const ccCached = localStorage.getItem(`counts_cache_${sellerId}`);
					if (ccCached) {
						try { state.clientCounts = new Map(JSON.parse(ccCached)); } catch(e){}
					}
					
					// Pre-render optimistic table, hide loader
					await loadDesserts();
					renderDessertColumns();
					renderTable();
					if (loadingEl) loadingEl.classList.add('hidden');
				}
			}
		} catch(e) { console.warn('Cache read error', e); }

		if (loadingTextEl) loadingTextEl.textContent = 'Cargando datos...';
		const [sales, countsData] = await Promise.all([
			api('GET', `${API.Sales}?${params.toString()}`),
			api('GET', `${API.Sales}?action=client_counts&seller_id=${encodeURIComponent(sellerId)}`)
		]);
		state.sales = sales;
		
		try {
			localStorage.setItem(cacheKey, JSON.stringify(state.sales));
		} catch(e) {}


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

		// (Obsolete network loop for receipts removed)

		// Build recurrence counts efficiently using the new optimized endpoint
		const counts = new Map();
		const namesByKey = new Map();
		
		for (const item of (countsData || [])) {
			const raw = (item.client_name || '').trim();
			if (!raw) continue;
			const key = normalizeClientName(raw);
			const currentCount = counts.get(key) || 0;
			counts.set(key, currentCount + Number(item.count || 0));
			if (!namesByKey.has(key)) namesByKey.set(key, raw);
		}
		
		state.clientCounts = counts;
		try {
			localStorage.setItem(`counts_cache_${sellerId}`, JSON.stringify(Array.from(counts.entries())));
		} catch(e) {}

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
(function wireUndoRedo() {
	const undoBtn = document.getElementById('undo-btn');
	const redoBtn = document.getElementById('redo-btn');
	undoBtn?.addEventListener('click', () => { performUndo().catch(console.error); });
	redoBtn?.addEventListener('click', () => { performRedo().catch(console.error); });
})();

// Superadmin-only editors for delivered counts per day (inline editable)
function wireDeliveredRowEditors() {
	const user = state?.currentUser;
	const isSuper = user?.role === 'superadmin' || !!user?.isSuperAdmin || String(user?.name).toLowerCase() === 'jorge';
	const cells = [];
	// Look only for spans belonging to flavor columns (exclude "total" span)
	const spans = document.querySelectorAll('#footer-delivered-row td.col-dessert span[id^="deliv-"]:not(#deliv-total)');
	for (const el of spans) {
		const key = el.id.replace('deliv-', '');
		if (key && key !== 'total') cells.push({ key, el });
	}
	function selectAllContent(el) {
		try {
			if (!el || !el.isContentEditable) return;
			const range = document.createRange();
			range.selectNodeContents(el);
			const sel = window.getSelection();
			sel.removeAllRanges();
			sel.addRange(range);
			
			// Fallback: if selection appears empty, force it
			if (!sel.toString().trim()) {
				document.execCommand('selectAll', false, null);
			}
		} catch { }
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
		// Al enfocarse, seleccionar todo para reemplazar con la nueva cifra. 
		// Usamos un delay un poco mayor para asegurar que el teclado y foco móvil terminen.
		el.addEventListener('focus', () => { 
			setTimeout(() => selectAllContent(el), 150); 
		});
		// Sanitize input to numbers only while typing
		el.addEventListener('input', () => {
			if (!el.isContentEditable) return;
			const selection = window.getSelection();
			const cursorPos = selection.anchorOffset;
			const current = el.textContent || '';
			let sanitized = current.replace(/[^0-9]/g, '');
			
			// Remove leading zeros only if there are other digits
			if (sanitized.length > 1) {
				sanitized = sanitized.replace(/^0+/, '');
			}
			
			if (current !== sanitized) {
				el.textContent = sanitized;
				// Restore cursor position
				try {
					const range = document.createRange();
					const newPos = Math.min(cursorPos, el.textContent.length);
					range.setStart(el.firstChild || el, newPos);
					range.collapse(true);
					selection.removeAllRanges();
					selection.addRange(range);
				} catch { }
			}
		});
		// Save on Enter or blur
		el.addEventListener('keydown', (ev) => {
			if (ev.key === 'Enter') { ev.preventDefault(); el.blur(); }
		});
		el.addEventListener('blur', async () => {
			if (!isSuper) return;
			const dayId = state?.selectedDayId || null;
			if (!dayId) { try { notify.error('Selecciona una fecha'); } catch { } return; }
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
				try { notify.error('No se pudo guardar'); } catch { }
			}
		});
	}
}

function wireCommissionsPaidEditor() {
	const isSuper = state?.currentUser?.role === 'superadmin' || !!state?.currentUser?.isSuperAdmin;
	const el = document.getElementById('comm-paid-total');
	if (!el) return;

	function selectAllContent(el) {
		try {
			if (!el || !el.isContentEditable) return;
			const range = document.createRange();
			range.selectNodeContents(el);
			const sel = window.getSelection();
			sel.removeAllRanges();
			sel.addRange(range);
		} catch { }
	}

	// Toggle contenteditable based on role
	if (isSuper) {
		if (!el.isContentEditable) el.setAttribute('contenteditable', 'true');
		el.style.cursor = 'text';
		el.title = 'Editar comisiones pagadas (click para editar)';
	} else {
		if (el.isContentEditable) el.removeAttribute('contenteditable');
		el.style.cursor = 'default';
		el.title = '';
	}

	if (el.dataset.boundCommPaid === '1') return;
	el.dataset.boundCommPaid = '1';

	// Store original formatted value and editing state
	let originalValue = '';
	let isEditing = false;

	// On focus, convert formatted value to raw number for easier editing
	el.addEventListener('focus', () => {
		if (!isSuper) return;
		isEditing = true;
		el.dataset.isEditing = '1';
		originalValue = el.textContent;
		// Remove formatting (remove commas, spaces, etc.) to show raw number
		const raw = (el.textContent || '').replace(/[^0-9]/g, '');
		el.textContent = raw || '0';
		// Use setTimeout to ensure selection happens after textContent update
		setTimeout(() => selectAllContent(el), 0);
	});

	el.addEventListener('mouseup', (ev) => {
		if (isEditing) {
			selectAllContent(el);
		}
	});

	// Sanitize input to numbers only while typing - allow any number of digits
	el.addEventListener('input', () => {
		if (!el.isContentEditable || !isSuper) return;
		// Get cursor position before modification
		const selection = window.getSelection();
		const cursorPos = selection.anchorOffset;

		let raw = (el.textContent || '').replace(/[^0-9]/g, '');
		// Remove leading zeros only if there are other digits
		if (raw.length > 1) {
			raw = raw.replace(/^0+/, '');
		}
		// If empty, default to 0
		if (!raw) raw = '0';

		el.textContent = raw;

		// Restore cursor position
		try {
			const range = document.createRange();
			const newPos = Math.min(cursorPos, el.textContent.length);
			range.setStart(el.firstChild || el, newPos);
			range.collapse(true);
			selection.removeAllRanges();
			selection.addRange(range);
		} catch { }
	});

	// Save on Enter or blur
	el.addEventListener('keydown', (ev) => {
		if (!isSuper) return;
		if (ev.key === 'Enter') {
			ev.preventDefault();
			el.blur();
		}
		if (ev.key === 'Escape') {
			ev.preventDefault();
			isEditing = false;
			el.textContent = originalValue;
			el.blur();
		}
	});

	el.addEventListener('blur', async () => {
		if (!isSuper || !isEditing) {
			delete el.dataset.isEditing;
			return;
		}
		isEditing = false;

		const dayId = state?.selectedDayId || null;
		console.log('Blur event - dayId:', dayId, 'isEditing:', isEditing, 'isSuper:', isSuper);

		if (!dayId) {
			el.textContent = originalValue;
			delete el.dataset.isEditing;
			try { notify.error('Selecciona una fecha'); } catch { }
			return;
		}

		const rawValue = (el.textContent || '').replace(/[^0-9]/g, '');
		const value = Math.max(0, parseInt(rawValue, 10) || 0);
		console.log('Saving commissions_paid:', value, 'dayId:', dayId);
		console.log('state.currentUser:', state.currentUser);
		console.log('actor_name:', state.currentUser?.name);
		const payload = { id: dayId, actor_name: state.currentUser?.name || '', commissions_paid: value };
		console.log('Full payload:', JSON.stringify(payload, null, 2));

		try {
			const updated = await api('PUT', '/api/days', payload);
			console.log('API response:', updated);
			console.log('API response commissions_paid:', updated?.commissions_paid);
			console.log('Full API response object:', JSON.stringify(updated, null, 2));
			const idx = (state.saleDays || []).findIndex(d => d && d.id === dayId);
			if (idx !== -1) {
				state.saleDays[idx] = updated;
				console.log('Updated state.saleDays[' + idx + ']:', state.saleDays[idx]);
				console.log('commissions_paid in state:', state.saleDays[idx].commissions_paid);
			}
			delete el.dataset.isEditing;
			// Format and display the saved value immediately
			const formatted = fmtNo.format(value);
			el.textContent = formatted;



			console.log('Formatted value displayed:', formatted);

			// Don't call updateSummary immediately to avoid overwriting
			setTimeout(() => {
				if (!el.dataset.isEditing) {
					updateSummary();
				}
			}, 100);
		} catch (e) {
			console.error('Error saving commissions paid:', e);
			try { notify.error('No se pudo guardar las comisiones pagadas'); } catch { }
			// Restore original value on error
			el.textContent = originalValue;
			delete el.dataset.isEditing;
		}
	});
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
	} catch { }
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
				if (ev.target !== inputEl) { ev.preventDefault(); try { inputEl.focus(); inputEl.select(); } catch { } }
			});
			right.addEventListener('click', (ev) => {
				if (ev.target !== inputEl) { ev.preventDefault(); try { inputEl.focus(); inputEl.select(); } catch { } }
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

		// EXTRA CLIENT INFO (Short Name, WhatsApp)
		const extraRow = document.createElement('div');
		extraRow.className = 'client-info-extra';
		
		const snWrap = document.createElement('div'); snWrap.className = 'client-info-row';
		const snLbl = document.createElement('div'); snLbl.className = 'client-info-label'; snLbl.textContent = 'Apodo / Corto';
		const snInput = document.createElement('input');
		snInput.type = 'text'; snInput.placeholder = 'Ej: Marce'; snInput.className = 'input-cell';
		snWrap.append(snLbl, snInput);
		
		const waWrap = document.createElement('div'); waWrap.className = 'client-info-row';
		const waLbl = document.createElement('div'); waLbl.className = 'client-info-label'; waLbl.textContent = 'WhatsApp';
		const waInput = document.createElement('input');
		waInput.type = 'tel'; waInput.placeholder = '300...'; waInput.className = 'input-cell';
		waWrap.append(waLbl, waInput);
		
		extraRow.append(snWrap, waWrap);

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

		// Special pricing checkboxes
		const specialPricingContainer = document.createElement('div');
		specialPricingContainer.style.display = 'flex';
		specialPricingContainer.style.gap = '16px';
		specialPricingContainer.style.padding = '12px 0';
		specialPricingContainer.style.borderTop = '1px solid rgba(0,0,0,0.1)';
		specialPricingContainer.style.marginTop = '8px';

		const muestraCheckbox = document.createElement('label');
		muestraCheckbox.style.display = 'flex';
		muestraCheckbox.style.alignItems = 'center';
		muestraCheckbox.style.gap = '6px';
		muestraCheckbox.style.cursor = 'pointer';
		muestraCheckbox.style.fontSize = '14px';
		const muestraInput = document.createElement('input');
		muestraInput.type = 'checkbox';
		muestraInput.style.cursor = 'pointer';
		const muestraLabel = document.createElement('span');
		muestraLabel.textContent = 'Muestra';
		muestraCheckbox.append(muestraInput, muestraLabel);

		const costoCheckbox = document.createElement('label');
		costoCheckbox.style.display = 'flex';
		costoCheckbox.style.alignItems = 'center';
		costoCheckbox.style.gap = '6px';
		costoCheckbox.style.cursor = 'pointer';
		costoCheckbox.style.fontSize = '14px';
		const costoInput = document.createElement('input');
		costoInput.type = 'checkbox';
		costoInput.style.cursor = 'pointer';
		const costoLabel = document.createElement('span');
		costoLabel.textContent = 'A costo';
		costoCheckbox.append(costoInput, costoLabel);

		specialPricingContainer.append(muestraCheckbox, costoCheckbox);

		// Make checkboxes mutually exclusive
		muestraInput.addEventListener('change', () => {
			if (muestraInput.checked) costoInput.checked = false;
		});
		costoInput.addEventListener('change', () => {
			if (costoInput.checked) muestraInput.checked = false;
		});

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

		pop.append(title, extraRow, grid, specialPricingContainer, actions);
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
			} catch { }
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
		setTimeout(() => { try { clientInput.focus(); clientInput.select(); } catch { } }, 0);

		async function doSave() {
			try {
				saveBtn.disabled = true; cancelBtn.disabled = true;
				const sellerId = state?.currentSeller?.id;
				if (!sellerId) { try { notify.error('Selecciona un vendedor'); } catch { } return; }
				
				// Prepare payload with CRM fields
				const payload = { 
					seller_id: sellerId,
					client_name: clientInput.value.trim(),
					short_name: snInput.value.trim(),
					whatsapp: waInput.value.trim()
				};
				if (state?.selectedDayId) payload.sale_day_id = state.selectedDayId;
				const created = await api('POST', API.Sales, payload);

				// Determine special pricing type
				let specialPricingType = null;
				if (muestraInput.checked) {
					specialPricingType = 'muestra';
				} else if (costoInput.checked) {
					specialPricingType = 'a_costo';
				}

				// Build items array and legacy qty_* properties dynamically
				const items = [];
				const body = {
					id: created.id,
					client_name: (clientInput.value || '').trim(),
					is_paid: false,
					pay_method: null,
					special_pricing_type: specialPricingType,
					_actor_name: state.currentUser?.name || ''
				};

				for (const d of state.desserts) {
					const input = qtyInputs[d.short_code];
					const qty = Math.max(0, parseInt(input?.value || '0', 10) || 0);

					// Legacy format for backward compatibility
					body[`qty_${d.short_code}`] = qty;

					// New format - items array with adjusted price
					if (qty > 0) {
						items.push({
							dessert_id: d.id,
							quantity: qty,
							unit_price: getUnitPriceForDessertByPricingType(d, specialPricingType)
						});
					}
				}

				body.items = items;
				const updated = await api('PUT', API.Sales, body);
				// Prepend and render
				state.sales.unshift(updated);
				renderTable();
				try { notify.success('Guardado exitosamente'); } catch { }
				cleanup();
			} catch (e) {
				try { notify.error('No se pudo guardar'); } catch { }
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
		try { addRow(); } catch { }
	}
}

// Open edit sale popover with existing sale data
function openEditSalePopover(saleId, anchorX, anchorY, onCloseCallback) {
	try {
		const sale = state.sales.find(s => s.id === saleId);
		if (!sale) {
			try { notify.error('No se encontró el pedido'); } catch { }
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
				if (ev.target !== inputEl) { ev.preventDefault(); try { inputEl.focus(); inputEl.select(); } catch { } }
			});
			right.addEventListener('click', (ev) => {
				if (ev.target !== inputEl) { ev.preventDefault(); try { inputEl.focus(); inputEl.select(); } catch { } }
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

		// Special pricing checkboxes
		const specialPricingContainer = document.createElement('div');
		specialPricingContainer.style.display = 'flex';
		specialPricingContainer.style.gap = '16px';
		specialPricingContainer.style.padding = '12px 0';
		specialPricingContainer.style.borderTop = '1px solid rgba(0,0,0,0.1)';
		specialPricingContainer.style.marginTop = '8px';

		const muestraCheckbox = document.createElement('label');
		muestraCheckbox.style.display = 'flex';
		muestraCheckbox.style.alignItems = 'center';
		muestraCheckbox.style.gap = '6px';
		muestraCheckbox.style.cursor = 'pointer';
		muestraCheckbox.style.fontSize = '14px';
		const muestraInput = document.createElement('input');
		muestraInput.type = 'checkbox';
		muestraInput.style.cursor = 'pointer';
		muestraInput.checked = (sale.special_pricing_type === 'muestra');
		const muestraLabel = document.createElement('span');
		muestraLabel.textContent = 'Muestra (precio 0)';
		muestraCheckbox.append(muestraInput, muestraLabel);

		const costoCheckbox = document.createElement('label');
		costoCheckbox.style.display = 'flex';
		costoCheckbox.style.alignItems = 'center';
		costoCheckbox.style.gap = '6px';
		costoCheckbox.style.cursor = 'pointer';
		costoCheckbox.style.fontSize = '14px';
		const costoInput = document.createElement('input');
		costoInput.type = 'checkbox';
		costoInput.style.cursor = 'pointer';
		costoInput.checked = (sale.special_pricing_type === 'a_costo');
		const costoLabel = document.createElement('span');
		costoLabel.textContent = 'A costo';
		costoCheckbox.append(costoInput, costoLabel);

		specialPricingContainer.append(muestraCheckbox, costoCheckbox);

		// Make checkboxes mutually exclusive
		muestraInput.addEventListener('change', () => {
			if (muestraInput.checked) costoInput.checked = false;
		});
		costoInput.addEventListener('change', () => {
			if (costoInput.checked) muestraInput.checked = false;
		});

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

		pop.append(title, grid, specialPricingContainer, actions);
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
			} catch { }
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
		setTimeout(() => { try { clientInput.focus(); clientInput.select(); } catch { } }, 0);

		async function doSave() {
			try {
				saveBtn.disabled = true; cancelBtn.disabled = true;

				// Determine special pricing type
				let specialPricingType = null;
				if (muestraInput.checked) {
					specialPricingType = 'muestra';
				} else if (costoInput.checked) {
					specialPricingType = 'a_costo';
				}

				// Build items array and legacy qty_* properties
				const items = [];
				const body = {
					id: saleId,
					client_name: (clientInput.value || '').trim(),
					is_paid: sale.is_paid || false,
					pay_method: sale.pay_method || null,
					comment_text: sale.comment_text || '',
					special_pricing_type: specialPricingType,
					_actor_name: state.currentUser?.name || ''
				};

				for (const d of state.desserts) {
					const input = qtyInputs[d.short_code];
					const qty = Math.max(0, parseInt(input?.value || '0', 10) || 0);

					// Legacy format
					body[`qty_${d.short_code}`] = qty;

					// New format with adjusted price
					if (qty > 0) {
						items.push({
							dessert_id: d.id,
							quantity: qty,
							unit_price: getUnitPriceForDessertByPricingType(d, specialPricingType)
						});
					}
				}

				body.items = items;
				const updated = await api('PUT', API.Sales, body);

				// Update state and re-render
				const idx = state.sales.findIndex(s => s.id === saleId);
				if (idx !== -1) state.sales[idx] = updated;
				renderTable();
				try { notify.success('Guardado exitosamente'); } catch { }
				cleanup();
			} catch (e) {
				try { notify.error('No se pudo guardar'); } catch { }
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
		try { notify.error('Error al abrir el editor'); } catch { }
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
				if (ev.target !== inputEl) { ev.preventDefault(); try { inputEl.focus(); inputEl.select(); } catch { } }
			});
			right.addEventListener('click', (ev) => {
				if (ev.target !== inputEl) { ev.preventDefault(); try { inputEl.focus(); inputEl.select(); } catch { } }
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

		const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
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

		const weekdays = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
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
			return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
		}

		function renderCalendar() {
			calLabel.textContent = months[calView.getMonth()] + ' ' + calView.getFullYear();
			calGrid.innerHTML = '';
			const year = calView.getFullYear();
			const month = calView.getMonth();
			const firstDay = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
			const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

			// Días del mes anterior
			const prevMonthDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
			const prevMonth = month === 0 ? 11 : month - 1;
			const prevYear = month === 0 ? year - 1 : year;

			for (let i = firstDay - 1; i >= 0; i--) {
				const day = prevMonthDays - i;
				const cell = document.createElement('button');
				cell.className = 'date-cell other-month';
				cell.textContent = String(day);
				cell.type = 'button';
				cell.style.cssText = 'padding:6px;background:white;border:1px solid #e0e0e0;border-radius:4px;cursor:pointer;font-size:12px;opacity:0.4;transition:all 0.15s;';
				cell.addEventListener('mouseenter', () => {
					cell.style.background = '#f0f0f0';
					cell.style.opacity = '0.6';
				});
				cell.addEventListener('mouseleave', () => {
					cell.style.background = 'white';
					cell.style.opacity = '0.4';
				});
				const dayIso = isoUTC(prevYear, prevMonth, day);
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
								try { notify.success('Fecha seleccionada: ' + selectedText); } catch { }
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
						try { notify.error('Error al crear la fecha'); } catch { }
						// Re-enable calendar on error
						cell.disabled = false;
						cell.style.opacity = '1';
					}
				});
				calGrid.appendChild(cell);
			}

			// Días del mes actual
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
								try { notify.success('Fecha seleccionada: ' + selectedText); } catch { }
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
						try { notify.error('Error al crear la fecha'); } catch { }
						// Re-enable calendar on error
						cell.disabled = false;
						cell.style.opacity = '1';
					}
				});
				calGrid.appendChild(cell);
			}

			// Días del mes siguiente
			const totalCells = firstDay + daysInMonth;
			const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
			const nextMonth = month === 11 ? 0 : month + 1;
			const nextYear = month === 11 ? year + 1 : year;

			for (let d = 1; d <= remainingCells; d++) {
				const cell = document.createElement('button');
				cell.className = 'date-cell other-month';
				cell.textContent = String(d);
				cell.type = 'button';
				cell.style.cssText = 'padding:6px;background:white;border:1px solid #e0e0e0;border-radius:4px;cursor:pointer;font-size:12px;opacity:0.4;transition:all 0.15s;';
				cell.addEventListener('mouseenter', () => {
					cell.style.background = '#f0f0f0';
					cell.style.opacity = '0.6';
				});
				cell.addEventListener('mouseleave', () => {
					cell.style.background = 'white';
					cell.style.opacity = '0.4';
				});
				const dayIso = isoUTC(nextYear, nextMonth, d);
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
								try { notify.success('Fecha seleccionada: ' + selectedText); } catch { }
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
						try { notify.error('Error al crear la fecha'); } catch { }
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
			} catch { }
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
		setTimeout(() => { try { dateSelect.focus(); } catch { } }, 0);

		let isSaving = false;
		async function doSave() {
			if (isSaving) return;
			isSaving = true;

			try {
				const selectedDayId = dateSelect.value;

				if (!selectedDayId || selectedDayId === 'NEW_DATE') {
					try { notify.error('Por favor selecciona una fecha'); } catch { }
					isSaving = false;
					return;
				}

				saveBtn.disabled = true;
				cancelBtn.disabled = true;

				const sellerId = state?.currentSeller?.id;
				if (!sellerId) {
					try { notify.error('Selecciona un vendedor'); } catch { }
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
				try { notify.success('Pedido guardado exitosamente'); } catch { }

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
				try { notify.error('Error: ' + (e.message || 'No se pudo guardar')); } catch { }
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
	} catch { }
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
			qty_arco: sale.qty_arco || 0,
			qty_melo: sale.qty_melo || 0,
			qty_mara: sale.qty_mara || 0,
			qty_oreo: sale.qty_oreo || 0,
			qty_nute: sale.qty_nute || 0,
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
		try { notify.error('Pedido bloqueado: solo admin/superadmin puede eliminar'); } catch { }
		return;
	}
	await api('DELETE', `${API.Sales}?id=${encodeURIComponent(id)}&actor=${actor}`);
	state.sales = state.sales.filter(s => s.id !== id);
	// Show immediate local toast for feedback
	if (prev) {
		try {
			let sellerName = '';
			try {
				const match = (state.sellers || []).find(s => s && s.id === prev.seller_id);
				sellerName = match && match.name ? String(match.name) : '';
			} catch { }
			const tail = sellerName ? (' - ' + sellerName) : '';
			const msg = 'Eliminado: ' + formatSaleSummary(prev) + tail;
			const pay = (prev?.pay_method || '').toString();
			notify.info(msg, pay ? { payMethod: pay } : undefined);
		} catch { }
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
	const visibleDesserts = getVisibleDessertsForSalesTable();

	// Initialize counts and amounts dynamically for all desserts
	const qtys = {};
	const amts = {};
	const paidQtys = {};
	for (const d of visibleDesserts) {
		qtys[d.short_code] = 0;
		amts[d.short_code] = 0;
		paidQtys[d.short_code] = 0;
	}

	let grand = 0;

	for (const s of state.sales) {
		const pm = (s.pay_method || '').toString();
		const hasSpecialPricing = (s.special_pricing_type === 'muestra' || s.special_pricing_type === 'a_costo');
		
		for (const d of visibleDesserts) {
			let qty = 0;
			let amount = 0;

			// Check for historical item first to get correct price
			const item = (s.items || []).find(it => Number(it.dessert_id) === Number(d.id));
			if (item) {
				qty = Number(item.quantity || 0);
				amount = qty * Number(item.unit_price || 0);
			} else {
				// Legacy fallback (should be rare)
				qty = Number(s[`qty_${d.short_code}`] || 0);
				amount = getDessertAmountForSale(d, qty, s.special_pricing_type);
			}

			qtys[d.short_code] += qty;
			amts[d.short_code] += amount;
			
			// Exclude special pricing from commission calculations
			if ((pm === 'transf' || pm === 'jorgebank' || pm === 'marce' || pm === 'jorge') && !hasSpecialPricing) {
				paidQtys[d.short_code] += qty;
			}
		}

		grand += calcRowTotal(s);
	}

	// Update UI dynamically for all desserts
	let totalQty = 0;
	for (const d of visibleDesserts) {
		const qty = qtys[d.short_code] || 0;
		const amt = amts[d.short_code] || 0;
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

	const elTotalQty = document.getElementById('sum-total-qty');
	if (elTotalQty) elTotalQty.textContent = String(totalQty);
	const grandStr = fmtNo.format(grand);
	const elGrand = document.getElementById('sum-grand');
	if (elGrand) elGrand.textContent = grandStr;
	
	const elInlineGrand = document.getElementById('inline-grand-total');
	if (elInlineGrand) elInlineGrand.textContent = grandStr;

	// Commissions: tiered rates based on paid desserts quantity
	let paidTotalQty = 0;
	for (const d of visibleDesserts) {
		paidTotalQty += paidQtys[d.short_code] || 0;
	}

	// Determine commission rate based on quantity using seller's custom rates
	const seller = state.currentSeller || {};
	const rateLow = Number(seller.commission_rate_low) || 1000;
	const rateMid = Number(seller.commission_rate_mid) || 1300;
	const rateHigh = Number(seller.commission_rate_high) || 1500;

	let commRate = rateLow;
	let commRateLabel = `x ${rateLow}`;
	if (paidTotalQty >= 60) {
		commRate = rateHigh;
		commRateLabel = `x ${rateHigh}`;
	} else if (paidTotalQty >= 30) {
		commRate = rateMid;
		commRateLabel = `x ${rateMid}`;
	}

	const commGenerated = paidTotalQty * commRate;
	const commStr = fmtNo.format(commGenerated);
	const commEl = document.getElementById('sum-comm');
	if (commEl) commEl.textContent = commStr;

	// Update commission label to show rate
	const commLabelEl = document.querySelector('#footer-comm-row td.label');
	if (commLabelEl) commLabelEl.textContent = `Comisión ${commRateLabel}`;

	// Comisiones pagadas (per day, editable solo por superadmin)
	try {
		const day = (state && Array.isArray(state.saleDays) && state.selectedDayId)
			? (state.saleDays || []).find(d => d && d.id === state.selectedDayId)
			: null;

		const commPaid = Number(day?.commissions_paid || 0) || 0;
		const commPaidStr = fmtNo.format(commPaid);
		console.log('updateSummary - commissions_paid from day:', commPaid, 'formatted:', commPaidStr, 'day:', day);
		const elCP = document.getElementById('comm-paid-total');
		// Only update if not currently being edited
		if (elCP && !elCP.dataset.isEditing) {
			elCP.textContent = commPaidStr;
			console.log('Updated comm-paid-total element to:', commPaidStr);
		} else if (elCP) {
			console.log('Skipped updating comm-paid-total (currently editing)');
		}
		wireCommissionsPaidEditor();
	} catch (e) {
		console.error('Error updating commissions paid:', e);
	}

	// Postres entregados (per day, editable solo por superadmin)
	try {
		const day = (state && Array.isArray(state.saleDays) && state.selectedDayId)
			? (state.saleDays || []).find(d => d && d.id === state.selectedDayId)
			: null;

		let totalDelivered = 0;
		for (const d of visibleDesserts) {
			const delivered = Number(day?.[`delivered_${d.short_code}`] || 0) || 0;
			totalDelivered += delivered;
			const elD = document.getElementById(`deliv-${d.short_code}`);
			if (elD) elD.textContent = String(delivered);
		}

		const elDt = document.getElementById('deliv-total');
		if (elDt) elDt.textContent = String(totalDelivered);
		wireDeliveredRowEditors();
	} catch (e) {
		console.error('Error updating delivered:', e);
	}
	// Decide whether to stack totals to avoid overlap on small screens
	requestAnimationFrame(() => {
		const table = document.getElementById('sales-table');
		if (!table) return;
		const isSmall = window.matchMedia('(max-width: 600px)').matches;
		let overlap = false;
		if (isSmall) {
			// Check all dessert amt cells dynamically
			for (const d of visibleDesserts) {
				const el = document.getElementById(`sum-${d.short_code}-amt`);
				if (!el) continue;
				if (el.scrollWidth > el.clientWidth) { overlap = true; break; }
			}
		}
		if (isSmall && overlap) table.classList.add('totals-stacked'); else table.classList.remove('totals-stacked');

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
		const dateStr = new Date().toISOString().slice(0, 10);
		XLSX.writeFile(wb, `${sellerName}_${dateStr}.xlsx`);
		try { notify.success('Excel exportado'); } catch { }
	} catch (error) {
		console.error('Error al exportar Excel:', error);
		const errorMsg = error.message ? `Error al exportar Excel: ${error.message}` : 'Error al exportar Excel';
		try { notify.error(errorMsg); } catch { }
	}
}

async function exportConsolidatedForDate(dayIso) {
	const sellers = await api('GET', API.Sellers);
	const rows = [['Vendedor', '$', 'Pago', 'Cliente', 'Arco', 'Melo', 'Mara', 'Oreo', 'Nute', 'Total']];
	let tQa = 0, tQm = 0, tQma = 0, tQo = 0, tQn = 0, tGrand = 0;
	for (const s of sellers) {
		const days = await api('GET', `/api/days?seller_id=${encodeURIComponent(s.id)}`);
		const day = (days || []).find(d => (String(d.day).slice(0, 10) === String(dayIso).slice(0, 10)));
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
	ws['!cols'] = [{ wch: 18 }, { wch: 3 }, { wch: 10 }, { wch: 24 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 10 }];
	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, ws, 'Consolidado');
	const dateLabel = formatDayLabel(String(dayIso).slice(0, 10)).replace(/\s+/g, '_');
	XLSX.writeFile(wb, `Consolidado_${dateLabel}.xlsx`);
}

async function exportConsolidatedForDates(isoList) {
	const unique = Array.from(new Set((isoList || []).map(iso => String(iso).slice(0, 10))));
	const sellers = await api('GET', API.Sellers);
	const rows = [['Fecha', 'Vendedor', '$', 'Pago', 'Cliente', 'Arco', 'Melo', 'Mara', 'Oreo', 'Nute', 'Total']];
	let tQa = 0, tQm = 0, tQma = 0, tQo = 0, tQn = 0, tGrand = 0;
	for (const iso of unique) {
		for (const s of sellers) {
			const days = await api('GET', `/api/days?seller_id=${encodeURIComponent(s.id)}`);
			const day = (days || []).find(d => (String(d.day).slice(0, 10) === iso));
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
	ws['!cols'] = [{ wch: 10 }, { wch: 18 }, { wch: 3 }, { wch: 10 }, { wch: 24 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 10 }];
	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, ws, 'Consolidado');
	XLSX.writeFile(wb, `Consolidado_varios_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

(async function exportHelpers() { })();

async function exportCarteraExcel(startIso, endIso) {
	// Normalize
	const start = String(startIso).slice(0, 10);
	const end = String(endIso).slice(0, 10);
	const sellers = await api('GET', API.Sellers);
	const rows = [['Fecha', 'Vendedor', 'Cliente', 'Pago', '$', 'Arco', 'Melo', 'Mara', 'Oreo', 'Nute', 'Total']];
	let totalGrand = 0;
	for (const s of sellers) {
		const days = await api('GET', `/api/days?seller_id=${encodeURIComponent(s.id)}`);
		const within = (days || []).filter(d => {
			const iso = String(d.day).slice(0, 10);
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
					String(d.day).slice(0, 10), s.name || '', r.client_name || '', payLabel,
					r.is_paid ? '✓' : '',
					qa || '', qm || '', qma || '', qo || '', qn || '', tot || ''
				]);
			}
		}
	}
	rows.push(['', '', '', '', 'Totales', '', '', '', '', '', totalGrand || '']);
	const XLSX = window.XLSX;
	const ws = XLSX.utils.aoa_to_sheet(rows);
	ws['!cols'] = [{ wch: 10 }, { wch: 18 }, { wch: 24 }, { wch: 10 }, { wch: 3 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 10 }];
	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, ws, 'Cartera');
	XLSX.writeFile(wb, `Cartera_${start}_a_${end}.xlsx`);
}

(function wireGlobalDates() {
	const globalList = document.getElementById('global-dates-list');
	if (!globalList) return;
	// Load unique dates across sellers by querying one seller (or better: consolidate server-side). Here, we'll show last 7 days from today.
	const today = new Date();
	const days = [];
	for (let i = 0; i < 7; i++) {
		const d = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() - i));
		days.push(d.toISOString().slice(0, 10));
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


(function wireReportButton() {
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
	const gamesBtn = document.getElementById('games-button');
	gamesBtn?.addEventListener('click', (ev) => {
		exitDeleteSellerModeIfActive();
		const isAdminUser = !!(state?.currentUser?.isAdmin);
		const isSuper = state.currentUser?.role === 'superadmin' || !!state.currentUser?.isSuperAdmin;
		if (!isAdminUser && !isSuper) { notify.error('Solo para admin/superadmin'); return; }
		window.location.href = '/games-report.html';
	});

	const storeBtn = document.getElementById('store-button');
	storeBtn?.addEventListener('click', (ev) => {
		exitDeleteSellerModeIfActive();
		const isAdminUser = !!(state?.currentUser?.isAdmin);
		const isSuper = state.currentUser?.role === 'superadmin' || !!state.currentUser?.isSuperAdmin;
		if (!isAdminUser && !isSuper) { notify.error('Solo para admin/superadmin'); return; }
		window.location.href = '/store-manager.html';
	});

	const globalDbBtn = document.getElementById('global-clients-button');
	globalDbBtn?.addEventListener('click', () => {
		exitDeleteSellerModeIfActive();
		const isSuper = state.currentUser?.role === 'superadmin' || !!state.currentUser?.isSuperAdmin;
		if (!isSuper) { notify.error('Solo para superadmin'); return; }
		openGlobalClientsView();
	});

	const globalDbBackBtn = document.getElementById('global-clients-back');
	globalDbBackBtn?.addEventListener('click', () => {
		switchView('#view-select-seller');
	});

	// Messages Feature
	const manageMsgsBtn = document.getElementById('manage-messages-btn');
	manageMsgsBtn?.addEventListener('click', () => {
		openSellerMessagesView();
	});

	const messagesBackBtn = document.getElementById('messages-back');
	messagesBackBtn?.addEventListener('click', () => {
		switchView('#view-clients');
	});

	const saveMessagesBtn = document.getElementById('save-messages-btn');
	saveMessagesBtn?.addEventListener('click', async () => {
		const btn = saveMessagesBtn;
		const origText = btn.textContent;
		btn.textContent = 'Guardando...';
		btn.disabled = true;

		try {
			const txt = document.getElementById('msg-new-order-text').value;
			const isActive = document.getElementById('msg-new-order-active').checked;
			const targetSellerId = state.currentSeller ? state.currentSeller.id : state.currentUser?.id;

			const res = await api('POST', '/api/seller-messages', {
				seller_id: targetSellerId,
				event_type: 'new_order',
				message_text: txt,
				is_active: isActive
			});

			notify.success('Configuración de mensajes guardada');
		} catch (err) {
			notify.error('Error al guardar configuración');
			console.error(err);
		} finally {
			btn.textContent = origText;
			btn.disabled = false;
		}
	});

})();

async function openSellerMessagesView() {
	switchView('#view-seller-messages');

	// Reset UI while loading
	document.getElementById('msg-new-order-active').checked = false;
	document.getElementById('msg-new-order-text').value = '';

	const targetSellerId = state.currentSeller ? state.currentSeller.id : state.currentUser?.id;
	if (!targetSellerId) {
		notify.error('No se pudo determinar el vendedor');
		return;
	}

	try {
		const msgs = await api('GET', `/api/seller-messages?seller_id=${targetSellerId}`);
		const newOrderMsg = (msgs || []).find(m => m.event_type === 'new_order');

		if (newOrderMsg) {
			document.getElementById('msg-new-order-active').checked = !!newOrderMsg.is_active;
			document.getElementById('msg-new-order-text').value = newOrderMsg.message_text;
		} else {
			// Leave defaults/empty
		}
	} catch (err) {
		console.error('Error loading seller messages', err);
		notify.error('No se pudieron cargar los mensajes automáticos');
	}

	await loadBroadcastTemplates(targetSellerId);
}

// ------ BROADCAST TEMPLATES LOGIC ------
async function loadBroadcastTemplates(sellerId) {
	const container = document.getElementById('broadcast-templates-container');
	if (!container) return;

	container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">Cargando plantillas...</div>';

	try {
		const templates = await api('GET', `/api/broadcast-templates?seller_id=${sellerId}`);
		container.innerHTML = '';

		if (!templates || templates.length === 0) {
			container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">No tienes plantillas creadas. ¡Crea una para enviar masivamente!</div>';
			return;
		}

		templates.forEach(t => {
			const card = document.createElement('div');
			card.style.border = '1px solid var(--border)';
			card.style.borderRadius = '8px';
			card.style.padding = '16px';
			card.style.background = 'var(--background)';

			const headerRow = document.createElement('div');
			headerRow.style.display = 'flex';
			headerRow.style.justifyContent = 'space-between';
			headerRow.style.alignItems = 'center';
			headerRow.style.marginBottom = '8px';

			const titleEl = document.createElement('h4');
			titleEl.textContent = t.title;
			titleEl.style.margin = '0';
			titleEl.style.color = 'var(--text)';

			const actionsDiv = document.createElement('div');
			actionsDiv.style.display = 'flex';
			actionsDiv.style.gap = '8px';

			const editBtn = document.createElement('button');
			editBtn.className = 'icon-btn';
			editBtn.textContent = '✏️';
			editBtn.title = 'Editar plantilla';
			editBtn.style.background = 'transparent';
			editBtn.style.border = 'none';
			editBtn.addEventListener('click', () => editBroadcastTemplate(t));

			const delBtn = document.createElement('button');
			delBtn.className = 'icon-btn';
			delBtn.textContent = '🗑️';
			delBtn.title = 'Eliminar plantilla';
			delBtn.style.background = 'transparent';
			delBtn.style.border = 'none';
			delBtn.addEventListener('click', async () => {
				if (confirm(`¿Seguro que deseas eliminar la plantilla "${t.title}"?`)) {
					try {
						await api('DELETE', `/api/broadcast-templates?id=${t.id}&seller_id=${sellerId}`);
						notify.success('Plantilla eliminada');
						loadBroadcastTemplates(sellerId);
					} catch (e) {
						notify.error('Error al eliminar');
					}
				}
			});

			actionsDiv.append(editBtn, delBtn);
			headerRow.append(titleEl, actionsDiv);

			const textEl = document.createElement('p');
			textEl.textContent = t.message_text;
			textEl.style.fontSize = '0.9rem';
			textEl.style.color = 'var(--text-muted)';
			textEl.style.margin = '0 0 16px 0';
			textEl.style.whiteSpace = 'pre-wrap';
			textEl.style.display = '-webkit-box';
			textEl.style.webkitLineClamp = '2';
			textEl.style.webkitBoxOrient = 'vertical';
			textEl.style.overflow = 'hidden';

			const sendBtn = document.createElement('button');
			sendBtn.className = 'press-btn';
			sendBtn.textContent = '🛒 Enviar a Clientes';
			sendBtn.style.width = '100%';
			sendBtn.style.background = 'var(--surface)';
			sendBtn.style.color = 'var(--primary)';
			sendBtn.style.border = '1px solid var(--primary)';
			sendBtn.addEventListener('click', () => openBroadcastSelectionModal(t));

			card.append(headerRow, textEl, sendBtn);
			container.appendChild(card);
		});

	} catch (err) {
		console.error('Error loading broadcast templates', err);
		container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--danger);">Error al cargar plantillas.</div>';
	}
}

function editBroadcastTemplate(template = null) {
	// Re-using popover logic to create/edit prompt
	document.querySelectorAll('.broadcast-popover').forEach(p => p.remove());

	const pop = document.createElement('div');
	pop.className = 'popover active broadcast-popover';
	pop.style.padding = '20px';
	pop.style.minWidth = '300px';
	pop.style.maxWidth = '90vw';
	pop.style.position = 'fixed';
	pop.style.zIndex = '9999';
	pop.style.background = 'var(--surface, #fff)';
	pop.style.boxShadow = '0 8px 32px rgba(0,0,0,0.3)';
	pop.style.borderRadius = '12px';
	pop.style.border = '1px solid var(--border, #ddd)';
	pop.style.top = '50%';
	pop.style.left = '50%';
	pop.style.transform = 'translate(-50%, -50%)';

	const title = document.createElement('h3');
	title.textContent = template ? 'Editar Plantilla' : 'Nueva Plantilla';
	title.style.margin = '0 0 16px 0';

	const nameLabel = document.createElement('label');
	nameLabel.textContent = 'Nombre / Propósito:';
	nameLabel.style.display = 'block';
	nameLabel.style.fontSize = '0.9rem';
	nameLabel.style.marginBottom = '4px';

	const nameInput = document.createElement('input');
	nameInput.type = 'text';
	nameInput.className = 'client-input';
	nameInput.style.width = '100%';
	nameInput.style.marginBottom = '12px';
	nameInput.placeholder = 'Ej: Promoción Día de la Madre';
	if (template) nameInput.value = template.title;

	const msgLabel = document.createElement('label');
	msgLabel.textContent = 'Mensaje de WhatsApp:';
	msgLabel.style.display = 'block';
	msgLabel.style.fontSize = '0.9rem';
	msgLabel.style.marginBottom = '4px';

	const helpTxt = document.createElement('p');
	helpTxt.innerHTML = 'Usa <b>{cliente}</b> para insertar su nombre.';
	helpTxt.style.fontSize = '0.8rem';
	helpTxt.style.color = 'var(--text-muted)';
	helpTxt.style.margin = '0 0 8px 0';

	const msgInput = document.createElement('textarea');
	msgInput.className = 'client-input';
	msgInput.rows = 6;
	msgInput.style.width = '100%';
	msgInput.style.resize = 'vertical';
	msgInput.style.marginBottom = '16px';
	msgInput.placeholder = '¡Hola {cliente}! Te extrañamos mucho...';
	if (template) msgInput.value = template.message_text;

	const btnRow = document.createElement('div');
	btnRow.style.display = 'flex';
	btnRow.style.gap = '8px';

	const cancelBtn = document.createElement('button');
	cancelBtn.className = 'press-btn';
	cancelBtn.textContent = 'Cancelar';
	cancelBtn.style.flex = 1;
	cancelBtn.addEventListener('click', () => pop.remove());

	const saveBtn = document.createElement('button');
	saveBtn.className = 'press-btn btn-primary';
	saveBtn.textContent = 'Guardar';
	saveBtn.style.flex = 1;

	btnRow.append(cancelBtn, saveBtn);
	pop.append(title, nameLabel, nameInput, msgLabel, helpTxt, msgInput, btnRow);

	document.body.appendChild(pop);

	saveBtn.addEventListener('click', async () => {
		const tTitle = nameInput.value.trim();
		const tMsg = msgInput.value.trim();

		if (!tTitle || !tMsg) {
			notify.error('Completa los campos');
			return;
		}

		saveBtn.disabled = true;
		saveBtn.textContent = '...';
		const sellerId = state.currentSeller ? state.currentSeller.id : state.currentUser?.id;

		try {
			await api('POST', '/api/broadcast-templates', {
				id: template ? template.id : null,
				seller_id: sellerId,
				title: tTitle,
				message_text: tMsg
			});
			notify.success('Plantilla guardada');
			pop.remove();
			loadBroadcastTemplates(sellerId);
		} catch (e) {
			notify.error('Error al guardar');
			saveBtn.disabled = false;
			saveBtn.textContent = 'Guardar';
		}
	});
}

(function () {
	// Hook the Add button
	document.getElementById('add-broadcast-btn')?.addEventListener('click', () => editBroadcastTemplate(null));
})();

// ------ BROADCAST DISPATCH & QUEUE ------
let broadcastState = {
	template: null,
	clients: [],
	selectedIds: new Set(),
	queue: [],
	currentIndex: 0
};

async function openBroadcastSelectionModal(template) {
	broadcastState.template = template;
	broadcastState.selectedIds.clear();

	const modal = document.getElementById('broadcast-dispatch-modal');
	const stepSelection = document.getElementById('broadcast-step-selection');
	const stepQueue = document.getElementById('broadcast-step-queue');
	const tbody = document.getElementById('broadcast-clients-tbody');

	modal.style.display = 'flex';
	stepSelection.style.display = 'flex';
	stepQueue.style.display = 'none';
	tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px;">Cargando clientes...</td></tr>';

	// Load all clients for this seller
	const sellerId = state.currentSeller ? state.currentSeller.id : state.currentUser?.id;
	try {
		const clients = await api('GET', `/api/clients?seller_id=${sellerId}`);
		const validClients = (clients || []).filter(c => c.whatsapp && c.whatsapp.trim() !== '');
		validClients.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

		broadcastState.clients = validClients;

		// By default select all
		validClients.forEach(c => broadcastState.selectedIds.add(c.id));
		updateBroadcastSelectionUI();

	} catch (e) {
		console.error(e);
		tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--danger);">Error cargando clientes.</td></tr>';
	}
}

function updateBroadcastSelectionUI() {
	const tbody = document.getElementById('broadcast-clients-tbody');
	tbody.innerHTML = '';

	broadcastState.clients.forEach(c => {
		const tr = document.createElement('tr');
		tr.style.borderBottom = '1px solid var(--border)';

		const tdCheck = document.createElement('td');
		tdCheck.style.padding = '10px';
		tdCheck.style.textAlign = 'center';

		const chk = document.createElement('input');
		chk.type = 'checkbox';
		chk.style.width = '16px';
		chk.style.height = '16px';
		chk.checked = broadcastState.selectedIds.has(c.id);
		chk.addEventListener('change', (e) => {
			if (e.target.checked) broadcastState.selectedIds.add(c.id);
			else broadcastState.selectedIds.delete(c.id);

			document.getElementById('broadcast-selected-count').textContent = `${broadcastState.selectedIds.size} seleccionados`;
			document.getElementById('broadcast-select-all').checked = broadcastState.selectedIds.size === broadcastState.clients.length;
		});

		tdCheck.appendChild(chk);

		const tdName = document.createElement('td');
		tdName.style.padding = '10px';
		tdName.innerHTML = `<div style="font-weight: 500;">${c.name}</div><div style="font-size: 0.8rem; color: var(--text-muted);">${c.short_name ? `(${c.short_name})` : ''}</div>`;

		const tdWa = document.createElement('td');
		tdWa.style.padding = '10px';
		tdWa.style.color = 'var(--text-muted)';
		tdWa.textContent = c.whatsapp;

		tr.append(tdCheck, tdName, tdWa);
		tbody.appendChild(tr);
	});

	document.getElementById('broadcast-selected-count').textContent = `${broadcastState.selectedIds.size} seleccionados`;
	document.getElementById('broadcast-select-all').checked = broadcastState.selectedIds.size === broadcastState.clients.length;
}

(function initBroadcastEvents() {
	document.getElementById('close-broadcast-modal')?.addEventListener('click', () => {
		document.getElementById('broadcast-dispatch-modal').style.display = 'none';
	});

	document.getElementById('broadcast-select-all')?.addEventListener('change', (e) => {
		const checked = e.target.checked;
		if (checked) {
			broadcastState.clients.forEach(c => broadcastState.selectedIds.add(c.id));
		} else {
			broadcastState.selectedIds.clear();
		}
		updateBroadcastSelectionUI();
	});

	document.getElementById('broadcast-start-queue-btn')?.addEventListener('click', () => {
		if (broadcastState.selectedIds.size === 0) {
			notify.error('Selecciona al menos un cliente');
			return;
		}

		// Prepare Queue
		broadcastState.queue = broadcastState.clients.filter(c => broadcastState.selectedIds.has(c.id));
		broadcastState.currentIndex = 0;
		renderBroadcastQueue();

		document.getElementById('broadcast-step-selection').style.display = 'none';
		document.getElementById('broadcast-step-queue').style.display = 'flex';
	});

	document.getElementById('broadcast-finish-btn')?.addEventListener('click', () => {
		document.getElementById('broadcast-dispatch-modal').style.display = 'none';
	});
})();

function renderBroadcastQueue() {
	const list = document.getElementById('broadcast-queue-list');
	list.innerHTML = '';

	const total = broadcastState.queue.length;
	let sentCount = 0;

	broadcastState.queue.forEach((client, index) => {
		if (client._sent) sentCount++;

		const row = document.createElement('div');
		row.style.display = 'flex';
		row.style.alignItems = 'center';
		row.style.justifyContent = 'space-between';
		row.style.padding = '12px';
		row.style.border = '1px solid var(--border)';
		row.style.borderRadius = '8px';
		row.style.background = client._sent ? 'var(--surface)' : 'var(--background)';

		const info = document.createElement('div');

		const nameSpan = document.createElement('div');
		nameSpan.style.fontWeight = '500';
		nameSpan.textContent = client.name;
		if (client._sent) {
			nameSpan.style.textDecoration = 'line-through';
			nameSpan.style.color = 'var(--text-muted)';
		}

		info.appendChild(nameSpan);

		const sendBtn = document.createElement('button');
		sendBtn.className = 'press-btn btn-primary';
		sendBtn.style.padding = '8px 16px';

		if (client._sent) {
			sendBtn.textContent = 'Reenviar';
			sendBtn.className = 'press-btn secondary';
		} else {
			sendBtn.textContent = 'Enviar WhatsApp';
		}

		sendBtn.addEventListener('click', () => {
			sendBroadcastToClient(client, index);
		});

		row.append(info, sendBtn);
		list.appendChild(row);
	});

	// Progress Update
	document.getElementById('broadcast-progress-text').textContent = `${sentCount} / ${total}`;
	const pct = total === 0 ? 0 : Math.round((sentCount / total) * 100);
	document.getElementById('broadcast-progress-bar').style.width = pct + '%';

	if (sentCount === total && total > 0) {
		document.getElementById('broadcast-finish-btn').style.display = 'block';
	} else {
		document.getElementById('broadcast-finish-btn').style.display = 'none';
	}
}

function sendBroadcastToClient(client, activeIndex) {
	// Format text
	let text = broadcastState.template.message_text || '';
	const displayName = client.short_name || client.name;
	text = text.replace(/{cliente}/g, displayName);

	// Log it quietly
	try {
		fetch('/api/crm-whatsapp-logs', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				client_id: client.id,
				phone: client.whatsapp,
				message: text,
				segment: 'plantilla_' + (broadcastState.template.title || 'store'),
				sent_by: state.currentSeller ? state.currentSeller.id : (state.sellers ? state.sellers[0]?.id : null)
			})
		}).catch(e => console.error(e));
	} catch(e) {}

	// Open WA
	let cleanNum = (client.whatsapp || '').replace(/\D/g, '');
	if (cleanNum.length === 10) cleanNum = '57' + cleanNum;

	const encodedMsg = encodeURIComponent(text);
	const isAndroid = /Android/i.test(navigator.userAgent);
	
	let waUrl = `whatsapp://send?phone=${cleanNum}&text=${encodedMsg}`;
	if (isAndroid) {
		waUrl = `intent://send?phone=${cleanNum}&text=${encodedMsg}#Intent;package=com.whatsapp.w4b;scheme=whatsapp;end`;
	}
	window.open(waUrl, '_blank');

	// Mark as sent
	broadcastState.queue[activeIndex]._sent = true;
	renderBroadcastQueue();
}

async function openGlobalClientsView() {
	if (!state.currentUser?.isSuperAdmin && state.currentUser?.role !== 'superadmin') return;
	await loadGlobalClients();
	switchView('#view-global-clients');
}

let globalClientsState = { rows: [], sortCol: 'name', sortAsc: true };

async function loadGlobalClients() {
	const nameToData = new Map();

	// Fetch explicit global client records from DB
	try {
		const clientsDB = await api('GET', `/api/clients?global=1`);
		for (const c of (clientsDB || [])) {
			const raw = (c?.name || '').trim();
			if (!raw) continue;
			const key = normalizeClientName(raw);

			if (nameToData.has(key)) {
				const existing = nameToData.get(key);
				existing.whatsapp = c.whatsapp || existing.whatsapp;
				existing.birth_date = c.birth_date || existing.birth_date;
				existing.seller_name = c.seller_name || existing.seller_name;
			} else {
				nameToData.set(key, {
					name: raw,
					whatsapp: c.whatsapp || '',
					birth_date: c.birth_date || '',
					seller_name: c.seller_name || 'Desconocido'
				});
			}
		}
	} catch (err) {
		console.error('Error fetching global clients database:', err);
	}

	globalClientsState.rows = Array.from(nameToData.values());
	sortGlobalClients('name', true);
}

function sortGlobalClients(col, asc) {
	globalClientsState.sortCol = col;
	globalClientsState.sortAsc = asc;
	globalClientsState.rows.sort((a, b) => {
		let valA = a[col] || '';
		let valB = b[col] || '';
		if (typeof valA === 'string') valA = valA.toLowerCase();
		if (typeof valB === 'string') valB = valB.toLowerCase();

		if (valA < valB) return asc ? -1 : 1;
		if (valA > valB) return asc ? 1 : -1;
		return 0;
	});
	renderGlobalClientsTable(globalClientsState.rows);
}

function renderGlobalClientsTable(rows) {
	const thead = document.querySelector('#global-clients-table thead tr');
	if (thead) {
		thead.innerHTML = '';
		const cols = [
			{ key: 'name', label: 'Cliente' },
			{ key: 'short_name', label: 'Nombre Corto' },
			{ key: 'whatsapp', label: 'WhatsApp' },
			{ key: 'birth_date', label: 'Cumpleaños' },
			{ key: 'seller_name', label: 'Vendedor' }
		];

		cols.forEach(col => {
			const th = document.createElement('th');
			th.style.cursor = 'pointer';
			th.style.userSelect = 'none';

			// Show sorting arrow if this is the active column
			let arrow = '';
			if (globalClientsState.sortCol === col.key) {
				arrow = globalClientsState.sortAsc ? ' 🔼' : ' 🔽';
			}

			th.textContent = col.label + arrow;
			th.addEventListener('click', () => {
				const isAsc = globalClientsState.sortCol === col.key ? !globalClientsState.sortAsc : true;
				sortGlobalClients(col.key, isAsc);
			});
			thead.appendChild(th);
		});

		// Empty header for padding
		const padTh = document.createElement('th');
		padTh.style.width = '40px';
		thead.appendChild(padTh);
	}

	const tbody = document.getElementById('global-clients-tbody');
	if (!tbody) return;
	tbody.innerHTML = '';
	if (!rows || rows.length === 0) {
		const tr = document.createElement('tr');
		const td = document.createElement('td'); td.colSpan = 5; td.textContent = 'Sin clientes en toda la base de datos'; td.style.opacity = '0.8'; td.style.textAlign = 'center';
		tr.appendChild(td); tbody.appendChild(tr); return;
	}

	for (const r of rows) {
		const tr = document.createElement('tr'); tr.className = 'clients-row';

		const tdN = document.createElement('td');
		tdN.textContent = r.name;
		tdN.className = 'clickable-name';
		tdN.title = 'Ver historial detallado';
		tdN.addEventListener('click', async () => {
			await openGlobalClientDetailView(r.name);
		});

		const tdS = document.createElement('td');
		tdS.textContent = r.short_name || '-';
		tdS.style.color = 'var(--text-muted)';
		tdS.style.fontSize = '0.9em';

		const tdW = document.createElement('td');
		tdW.textContent = r.whatsapp || '-';

		const tdB = document.createElement('td');
		tdB.textContent = r.birth_date ? new Date(r.birth_date).toLocaleDateString() : '-';

		const tdVendedor = document.createElement('td');
		tdVendedor.textContent = r.seller_name || '-';
		tdVendedor.style.color = 'var(--text-muted)';
		tdVendedor.style.fontSize = '0.9em';

		const tdA = document.createElement('td');
		tdA.style.textAlign = 'center';

		// Reused edit button logic but omitted for global db (could be added with seller_id mapped later)

		tr.append(tdN, tdS, tdW, tdB, tdVendedor, tdA); // Updated append to include tdS
		tr.addEventListener('mousedown', () => { tr.classList.add('row-highlight'); setTimeout(() => tr.classList.remove('row-highlight'), 3200); });
		tbody.appendChild(tr);
	}
}

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
	function cleanup() { document.removeEventListener('mousedown', outside, true); document.removeEventListener('touchstart', outside, true); if (pop.parentNode) pop.parentNode.removeChild(pop); }
	function outside(ev) { if (!pop.contains(ev.target)) cleanup(); }
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
	const featGames = makeFeat('Ver botón Juegos', 'nav.games');
	const featCrm = makeFeat('Ver botón CRM', 'nav.crm');
	const featPartners = makeFeat('Ver botón Socios', 'nav.partners');
	const featPurchases = makeFeat('Ver botón Compras', 'nav.purchases');
	const featStore = makeFeat('Ver botón Tienda', 'nav.store');
	const featDesserts = makeFeat('Ver botón Postres', 'nav.desserts');
	const featDeliveries = makeFeat('Ver botón Entregas', 'nav.deliveries');
	const featGlobalDb = makeFeat('Ver Base de Datos', 'nav.globaldb');
	right.appendChild(featureLabel);
	[featSales, featTransfers, featCartera, featProjections, featMaterials, featInventory, featUsers, featAccounting, featGames, featCrm, featPartners, featPurchases, featStore, featDesserts, featDeliveries, featGlobalDb]
		.forEach(x => right.appendChild(x.wrap));
	row.appendChild(left); row.appendChild(right);

	// Commissions section (separate, below the main row)
	const commissionsSection = document.createElement('div');
	commissionsSection.style.marginTop = '24px';
	commissionsSection.style.paddingTop = '20px';
	commissionsSection.style.borderTop = '2px solid var(--border-color, #e0e0e0)';
	commissionsSection.style.display = 'none'; // Hidden by default

	const commissionsHeader = document.createElement('div');
	commissionsHeader.style.display = 'flex';
	commissionsHeader.style.alignItems = 'center';
	commissionsHeader.style.gap = '8px';
	commissionsHeader.style.marginBottom = '16px';

	const commissionsTitle = document.createElement('h4');
	commissionsTitle.textContent = 'Comisiones';
	commissionsTitle.style.margin = '0';
	commissionsTitle.style.fontSize = '16px';
	commissionsTitle.style.fontWeight = '600';

	const commissionsBadge = document.createElement('span');
	commissionsBadge.textContent = 'Por rango de pedidos';
	commissionsBadge.style.fontSize = '11px';
	commissionsBadge.style.padding = '3px 8px';
	commissionsBadge.style.borderRadius = '10px';
	commissionsBadge.style.background = 'var(--primary-color, #4CAF50)';
	commissionsBadge.style.color = 'white';
	commissionsBadge.style.fontWeight = '500';

	commissionsHeader.appendChild(commissionsTitle);
	commissionsHeader.appendChild(commissionsBadge);

	const commissionInputsContainer = document.createElement('div');
	commissionInputsContainer.style.display = 'grid';
	commissionInputsContainer.style.gridTemplateColumns = 'repeat(auto-fit, minmax(200px, 1fr))';
	commissionInputsContainer.style.gap = '16px';
	commissionInputsContainer.style.marginTop = '12px';

	function makeCommField(labelText, rangeText, placeholder, accentColor) {
		const wrap = document.createElement('div');
		wrap.style.background = 'var(--panel-bg, #fafafa)';
		wrap.style.padding = '16px';
		wrap.style.borderRadius = '8px';
		wrap.style.border = `2px solid ${accentColor}`;
		wrap.style.transition = 'transform 0.2s, box-shadow 0.2s';

		const header = document.createElement('div');
		header.style.display = 'flex';
		header.style.justifyContent = 'space-between';
		header.style.alignItems = 'center';
		header.style.marginBottom = '8px';

		const label = document.createElement('label');
		label.textContent = labelText;
		label.style.display = 'block';
		label.style.fontSize = '13px';
		label.style.fontWeight = '600';
		label.style.color = 'var(--text-primary, #333)';

		const range = document.createElement('span');
		range.textContent = rangeText;
		range.style.fontSize = '11px';
		range.style.padding = '2px 6px';
		range.style.borderRadius = '4px';
		range.style.background = accentColor;
		range.style.color = 'white';
		range.style.fontWeight = '500';

		header.appendChild(label);
		header.appendChild(range);

		const inputWrapper = document.createElement('div');
		inputWrapper.style.position = 'relative';

		const currency = document.createElement('span');
		currency.textContent = '$';
		currency.style.position = 'absolute';
		currency.style.left = '10px';
		currency.style.top = '50%';
		currency.style.transform = 'translateY(-50%)';
		currency.style.color = 'var(--text-secondary, #666)';
		currency.style.fontWeight = '600';

		const input = document.createElement('input');
		input.type = 'number';
		input.className = 'input-cell';
		input.placeholder = placeholder;
		input.style.width = '100%';
		input.style.paddingLeft = '28px';
		input.style.fontSize = '16px';
		input.style.fontWeight = '500';
		input.style.border = '1px solid var(--border-color, #ddd)';
		input.style.borderRadius = '6px';

		inputWrapper.appendChild(currency);
		inputWrapper.appendChild(input);

		wrap.appendChild(header);
		wrap.appendChild(inputWrapper);

		// Hover effect
		wrap.addEventListener('mouseenter', () => {
			wrap.style.transform = 'translateY(-2px)';
			wrap.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
		});
		wrap.addEventListener('mouseleave', () => {
			wrap.style.transform = 'translateY(0)';
			wrap.style.boxShadow = 'none';
		});

		return { wrap, input };
	}

	const commLow = makeCommField('Nivel Básico', '1-29', '1000', '#C2185B');
	const commMid = makeCommField('Nivel Intermedio', '30-59', '1300', '#C2185B');
	const commHigh = makeCommField('Nivel Avanzado', '60+', '1500', '#C2185B');

	commissionInputsContainer.appendChild(commLow.wrap);
	commissionInputsContainer.appendChild(commMid.wrap);
	commissionInputsContainer.appendChild(commHigh.wrap);

	commissionsSection.appendChild(commissionsHeader);
	commissionsSection.appendChild(commissionInputsContainer);

	const actions = document.createElement('div'); actions.style.display = 'flex'; actions.style.justifyContent = 'flex-end'; actions.style.gap = '8px'; actions.style.marginTop = '14px';
	const closeBtn = document.createElement('button'); closeBtn.className = 'press-btn'; closeBtn.textContent = 'Cerrar';
	const saveBtn = document.createElement('button'); saveBtn.className = 'press-btn btn-primary'; saveBtn.textContent = 'Guardar';
	actions.appendChild(closeBtn); actions.appendChild(saveBtn);
	modal.appendChild(row); modal.appendChild(commissionsSection); modal.appendChild(actions);
	overlay.appendChild(modal); document.body.appendChild(overlay);
	function cleanup() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
	closeBtn.addEventListener('click', cleanup);

	(async () => {
		const users = await api('GET', API.Users);
		const sellers = await api('GET', API.Sellers + '?include_archived=1');
		const sortedUsers = [...users].sort((a, b) => String(a.username || '').localeCompare(String(b.username || '')));
		sortedUsers.forEach(u => {
			const opt = document.createElement('option'); opt.value = String(u.username || ''); opt.textContent = String(u.username || ''); userSelect.appendChild(opt);
		});
		sellersBox.innerHTML = '';
		sellers.forEach(s => {
			const wrap = document.createElement('label'); wrap.style.display = 'flex'; wrap.style.alignItems = 'center'; wrap.style.gap = '8px';
			const cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = String(s.id);
			const span = document.createElement('span'); span.textContent = String(s.name || '');
			wrap.appendChild(cb); wrap.appendChild(span); sellersBox.appendChild(wrap);
		});

		// Create a map of sellers by name for easy lookup
		const sellersByName = new Map();
		sellers.forEach(s => {
			if (!s.archived_at) {
				sellersByName.set(String(s.name || '').toLowerCase(), s);
			}
		});
		async function loadViewerGrants(viewerName) {
			const grants = await api('GET', API.Users + '?view_permissions=1&viewer=' + encodeURIComponent(viewerName));
			const grantedIds = new Set(grants.map(g => Number(g.seller_id)));
			Array.from(sellersBox.querySelectorAll('input[type="checkbox"]')).forEach((el) => {
				el.checked = grantedIds.has(Number(el.value));
			});
			const feats = await api('GET', API.Users + '?feature_permissions=1&username=' + encodeURIComponent(viewerName));
			const featuresSet = new Set((feats || []).map(f => String(f.feature)));
			[featSales.cb, featTransfers.cb, featCartera.cb, featProjections.cb, featMaterials.cb, featInventory.cb, featUsers.cb, featAccounting.cb, featGames.cb, featCrm.cb, featPartners.cb, featPurchases.cb, featStore.cb, featDesserts.cb, featDeliveries.cb, featGlobalDb.cb]
				.forEach(cb => { cb.checked = featuresSet.has(cb.dataset.feature); });

			// All users are sellers, so always show commission section
			commissionsSection.style.display = 'block';
			const seller = sellersByName.get(viewerName.toLowerCase());
			if (seller) {
				commissionsSection.dataset.sellerId = String(seller.id);
				commLow.input.value = String(seller.commission_rate_low || 1000);
				commMid.input.value = String(seller.commission_rate_mid || 1300);
				commHigh.input.value = String(seller.commission_rate_high || 1500);
			} else {
				// If no matching seller found, clear the fields and ID
				commissionsSection.dataset.sellerId = '';
				commLow.input.value = '1000';
				commMid.input.value = '1300';
				commHigh.input.value = '1500';
			}
		}
		userSelect.addEventListener('change', async () => {
			await loadViewerGrants(userSelect.value);
		});
		if (sortedUsers.length) {
			userSelect.value = String(sortedUsers[0].username || '');
			await loadViewerGrants(userSelect.value);
		}
		saveBtn.addEventListener('click', async () => {
			const viewer = String(userSelect.value || ''); if (!viewer) return;

			// Save view permissions
			const cbs = Array.from(sellersBox.querySelectorAll('input[type="checkbox"]'));
			const selectedIds = new Set(cbs.filter(el => el.checked).map(el => Number(el.value)));
			const current = await api('GET', API.Users + '?view_permissions=1&viewer=' + encodeURIComponent(viewer));
			const currentIds = new Set(current.map(g => Number(g.seller_id)));
			const toGrant = [...selectedIds].filter(id => !currentIds.has(id));
			const toRevoke = [...currentIds].filter(id => !selectedIds.has(id));
			for (const id of toGrant) { await api('PATCH', API.Users, { action: 'grantView', username: viewer, sellerId: id }); }
			for (const id of toRevoke) { await api('PATCH', API.Users, { action: 'revokeView', username: viewer, sellerId: id }); }

			// Save feature permissions
			const feats = await api('GET', API.Users + '?feature_permissions=1&username=' + encodeURIComponent(viewer));
			const currentFeat = new Set((feats || []).map(f => String(f.feature)));
			const desiredFeat = new Set([featSales.cb, featTransfers.cb, featCartera.cb, featProjections.cb, featMaterials.cb, featInventory.cb, featUsers.cb, featAccounting.cb, featGames.cb, featCrm.cb, featPartners.cb, featPurchases.cb, featStore.cb, featDesserts.cb, featDeliveries.cb, featGlobalDb.cb]
				.filter(cb => cb.checked).map(cb => cb.dataset.feature));
			const toGrantF = [...desiredFeat].filter(f => !currentFeat.has(f));
			const toRevokeF = [...currentFeat].filter(f => !desiredFeat.has(f));
			for (const f of toGrantF) await api('PATCH', API.Users, { action: 'grantFeature', username: viewer, feature: f });
			for (const f of toRevokeF) await api('PATCH', API.Users, { action: 'revokeFeature', username: viewer, feature: f });

			// Save commission rates if a seller is being edited
			const selectedSellerId = Number(commissionsSection.dataset.sellerId || 0);
			if (selectedSellerId) {
				const payload = {
					id: selectedSellerId,
					commission_rate_low: Number(commLow.input.value) || 1000,
					commission_rate_mid: Number(commMid.input.value) || 1300,
					commission_rate_high: Number(commHigh.input.value) || 1500
				};
				await api('PATCH', API.Sellers, payload);
			}

			notify.success('Permisos y comisiones actualizados');
			cleanup();
			// Refresh sellers data in state
			state.sellers = await api('GET', API.Sellers);
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
	function cleanup() { document.removeEventListener('mousedown', outside, true); document.removeEventListener('touchstart', outside, true); if (pop.parentNode) pop.parentNode.removeChild(pop); }
	function outside(ev) { if (!pop.contains(ev.target)) cleanup(); }
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
			const permRows = (perms || []).map(p => ({ Usuario: p.viewer_username, Vendedor: p.seller_name, Otorgado: (p.created_at || '').toString().slice(0, 19).replace('T', ' ') }));
			const ws2 = XLSX.utils.json_to_sheet(permRows);
			XLSX.utils.book_append_sheet(wb, ws2, 'Permisos');
		} catch { }
		XLSX.writeFile(wb, `Usuarios_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
		} catch { }
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
		if (window.location.search.includes('embed=true')) {
			window.location.href = '/store.html';
		} else if (state.currentSeller) {
			switchView('#view-sales');
		} else {
			switchView('#view-select-seller');
		}
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

	// New Client button
	const newClientBtn = document.getElementById('new-client-btn');
	newClientBtn?.addEventListener('click', (ev) => {
		const rect = ev.currentTarget.getBoundingClientRect();
		openNewClientPopover(rect.left + rect.width / 2, rect.bottom + 8);
	});

	// Merge Suggestions button
	const mergeSuggestionsBtn = document.getElementById('merge-suggestions-btn');
	mergeSuggestionsBtn?.addEventListener('click', () => {
		openMergeSuggestionsModal();
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
				try { notify.error('No se pudo determinar el vendedor'); } catch { }
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
				} catch { }

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
					} catch { }
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
	['Ingrediente', 'Unidad', 'Arco', 'Melo', 'Mara', 'Oreo', 'Nute', ''].forEach(t => { const d = document.createElement('div'); d.textContent = t; header.appendChild(d); });
	const list = document.createElement('div'); list.className = 'ingredients-list';
	list.appendChild(header);
	const actions = document.createElement('div'); actions.className = 'ingredients-actions';
	const addBtn = document.createElement('button'); addBtn.className = 'press-btn'; addBtn.textContent = '+ Agregar';
	const closeBtn = document.createElement('button'); closeBtn.className = 'press-btn'; closeBtn.textContent = 'Cerrar';
	actions.append(addBtn, closeBtn);
	pop.append(title, list, actions);
	document.body.appendChild(pop);
	pop.classList.add('aladdin-pop');
	function cleanup() { document.removeEventListener('mousedown', outside, true); document.removeEventListener('touchstart', outside, true); if (pop.parentNode) pop.parentNode.removeChild(pop); }
	function outside(ev) { if (!pop.contains(ev.target)) cleanup(); }
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
			const label = `${(res?.range?.start || '').replaceAll('-', '')}_${(res?.range?.end || '').replaceAll('-', '')}`;
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
	['Ingrediente', 'Unidad', 'Cantidad total'].forEach(t => { const th = document.createElement('th'); th.textContent = t; trh.appendChild(th); });
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
	function cleanup() { document.removeEventListener('mousedown', outside, true); document.removeEventListener('touchstart', outside, true); if (pop.parentNode) pop.parentNode.removeChild(pop); }
	function outside(ev) { if (!pop.contains(ev.target)) cleanup(); }
	setTimeout(() => { document.addEventListener('mousedown', outside, true); document.addEventListener('touchstart', outside, true); }, 0);
	close.addEventListener('click', cleanup);
	exportBtn.addEventListener('click', () => {
		try {
			const rows = (data?.materials || []).map(m => ({ Ingrediente: m.ingredient, Unidad: m.unit || 'g', Cantidad: Number(m.total_needed || 0) }));
			const ws = XLSX.utils.json_to_sheet(rows);
			const wb = XLSX.utils.book_new();
			XLSX.utils.book_append_sheet(wb, ws, 'Materiales');
			const label = `${(data?.range?.start || '').replaceAll('-', '')}_${(data?.range?.end || '').replaceAll('-', '')}`;
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
	await renderInventoryView();
}

async function renderInventoryView() {
	const scrollPos = window.scrollY;
	const ingredsRoot = document.getElementById('inventory-ingredients-content');
	const packsRoot = document.getElementById('inventory-packaging-content');
	const othersRoot = document.getElementById('inventory-others-content');
	if (!ingredsRoot || !packsRoot || !othersRoot) return;
	
	const fmtMoney = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
	const fmtUnit = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2, minimumFractionDigits: 0 });
	let items = [];
	try { items = await api('GET', API.Inventory); } catch { items = []; }

	// Don't clear immediately to reduce flicker
	const tempIngreds = document.createElement('div');
	const tempPacks = document.createElement('div');
	const tempOthers = document.createElement('div');

	const ingreds = items.filter(it => (it.category || 'ingrediente') === 'ingrediente');
	const packs = items.filter(it => it.category === 'empaque');
	const others = items.filter(it => it.category === 'otros');

	function buildTable(list, root) {
		if (list.length === 0) { root.innerHTML = '<p style="opacity:0.6; padding:10px;">No hay ítems en esta categoría.</p>'; return; }
		const table = document.createElement('table'); table.className = 'clients-table';
		const thead = document.createElement('thead'); const hr = document.createElement('tr');
		['Material', 'Saldo', 'Cos. Unit.', 'V. Total', 'Acc.'].forEach(t => { const th = document.createElement('th'); th.textContent = t; hr.appendChild(th); });
		thead.appendChild(hr); const tbody = document.createElement('tbody');
		for (const it of list) {
			const tr = document.createElement('tr');
			tr.draggable = true;
			tr.dataset.id = it.id;
			tr.dataset.ingredient = it.ingredient;
			tr.addEventListener('dragstart', (ev) => {
				ev.dataTransfer.setData('text/plain', it.id);
				ev.target.style.opacity = '0.5';
			});
			tr.addEventListener('dragend', (ev) => { ev.target.style.opacity = '1'; });

			const tdName = document.createElement('td');
			const inName = document.createElement('input'); inName.type = 'text'; inName.className = 'input-cell'; inName.style.width = '140px'; inName.value = it.ingredient;
			tdName.appendChild(inName);

			
			const tdSaldo = document.createElement('td');
			const inSaldo = document.createElement('input'); inSaldo.type = 'number'; inSaldo.step = '0.1'; inSaldo.className = 'input-cell'; inSaldo.style.width = '80px'; inSaldo.style.textAlign = 'right'; inSaldo.value = (Number(it.saldo || 0) || 0).toFixed(1);
			tdSaldo.appendChild(inSaldo);


			const tdPrice = document.createElement('td');
			const inPrice = document.createElement('input'); inPrice.type = 'number'; inPrice.step = 'any'; inPrice.className = 'input-cell'; inPrice.style.width = '100px'; inPrice.style.textAlign = 'right'; inPrice.value = it.price || 0;
			tdPrice.appendChild(inPrice);

			const tdTotal = document.createElement('td'); tdTotal.textContent = fmtUnit.format((it.saldo || 0) * (it.price || 0)); tdTotal.style.textAlign = 'right';
			
			const tdActions = document.createElement('td');
			const histBtn = document.createElement('button'); histBtn.className = 'press-btn'; histBtn.textContent = '📜'; histBtn.title = 'Ver Historial';
			const delBtn = document.createElement('button'); delBtn.className = 'press-btn'; delBtn.textContent = '🗑️'; delBtn.title = 'Eliminar'; delBtn.style.color = 'var(--danger)';
			tdActions.append(histBtn, delBtn);

			tr.append(tdName, tdSaldo, tdPrice, tdTotal, tdActions);
			tbody.appendChild(tr);

			histBtn.onclick = () => openInventoryHistoryDialog(it.ingredient);
			delBtn.onclick = async () => {
				if (!confirm(`¿Estás seguro de eliminar "${it.ingredient}"? Se borrará del maestro de inventario.`)) return;
				try {
					await api('POST', API.Inventory, { action: 'delete_item', id: it.id });
					notify.success('Eliminado');
					renderInventoryView();
				} catch { notify.error('Error al eliminar'); }
			};

			// Autosave logic
			const save = async () => {
				const n = inName.value.trim();
				const p = Number(inPrice.value || 0);
				const u = it.unit || 'g';
				const nextSaldo = Number(inSaldo.value || 0);

				if (n !== it.ingredient || p !== it.price || u !== it.unit) {
					try {
						const res = await api('POST', API.Inventory, { action: 'update_item', id: it.id, ingredient: n, price: p, unit: u, category: it.category, pack_size: it.pack_size });
						notify.success(res.status === 'merged' ? 'Fusionado' : 'Cambiado');
						if (res.status === 'merged') {
							renderInventoryView();
						} else {
							it.ingredient = n; it.price = p; it.unit = u;
							tdTotal.textContent = fmtUnit.format((it.saldo || 0) * (it.price || 0));
						}
					} catch { notify.error('Error al guardar'); }
				}
				
				const delta = Math.round((nextSaldo - it.saldo) * 10) / 10;
				if (Math.abs(delta) > 0.01) {
					try {
						await api('POST', API.Inventory, { action: 'ajuste', ingredient: it.ingredient, unit: u, qty: delta, note: 'Ajuste auto', actor_name: state.currentUser?.username || null });
						notify.success('Saldo ajustado');
						it.saldo = nextSaldo;
						tdTotal.textContent = fmtUnit.format((it.saldo || 0) * (it.price || 0));
					} catch { notify.error('Error al ajustar saldo'); }
				}
			};

			const handleEnter = (ev) => { if (ev.key === 'Enter') ev.target.blur(); };
			inName.onkeydown = handleEnter;
			inPrice.onkeydown = handleEnter;
			inName.onblur = save;
			inPrice.onblur = save;
			inSaldo.onblur = save;
		}
		table.append(thead, tbody);
		root.appendChild(table);
	}

	buildTable(ingreds, tempIngreds);
	buildTable(packs, tempPacks);
	buildTable(others, tempOthers);
	
	ingredsRoot.innerHTML = ''; ingredsRoot.appendChild(tempIngreds);
	packsRoot.innerHTML = ''; packsRoot.appendChild(tempPacks);
	othersRoot.innerHTML = ''; othersRoot.appendChild(tempOthers);

	function setupDrop(root, cat) {
		root.ondragover = (ev) => { ev.preventDefault(); root.style.outline = '2px dashed var(--primary)'; root.style.borderRadius = '8px'; };
		root.ondragleave = () => { root.style.outline = 'none'; };
		root.ondrop = async (ev) => {
			ev.preventDefault();
			root.style.outline = 'none';
			const id = ev.dataTransfer.getData('text/plain');
			if (!id) return;
			try {
				await api('POST', API.Inventory, { action: 'update_item', id, category: cat });
				notify.success('Movido');
				renderInventoryView();
			} catch { notify.error('Error al mover'); }
		};
	}
	setupDrop(ingredsRoot.parentElement, 'ingrediente');
	setupDrop(packsRoot.parentElement, 'empaque');
	setupDrop(othersRoot.parentElement, 'otros');

	// Setup toolbar listeners (need to re-bind since they might have been lost if we replaced toolbar? No, toolbar is separate)
	document.getElementById('inventory-new-material').onclick = openNewMaterialDialog;
	document.getElementById('inventory-confirm-prod').onclick = openConfirmProductionDialog;

	if (scrollPos > 0) window.scrollTo(0, scrollPos);
}

async function openNewMaterialDialog() {
	const name = (prompt('Nombre del material:') || '').trim(); if (!name) return;
	const cat = confirm(`¿Es un ingrediente? (Aceptar para Ingrediente, Cancelar para Empaque/Otro)`) ? 'ingrediente' : 'empaque';
	const unit = 'g';
	const price = Number(prompt('Costo unitario actual:', '0') || '0') || 0;
	try {
		await api('POST', API.Inventory, { action: 'add_item', ingredient: name, unit, category: cat, price });
		notify.success('Cargado al maestro');
		renderInventoryView();
	} catch { notify.error('Error al guardar'); }
}

async function openConfirmProductionDialog() {
	// 1. Fetch pending orders (sales for today not archived)
	const today = new Date().toISOString().slice(0, 10);
	let sales = [];
	try { 
		const query = `?start=${today}&end=${today}`;
		const report = await api('GET', `/api/sales-report${query}`);
		sales = report.sales || [];
	} catch { notify.error('No se pudieron obtener ventas pendientes'); return; }

	// 2. Aggregate counts
	const counts = { arco: 0, melo: 0, mara: 0, oreo: 0, nute: 0 };
	for (const s of sales) {
		counts.arco += (Number(s.qty_arco || 0));
		counts.melo += (Number(s.qty_melo || 0));
		counts.mara += (Number(s.qty_mara || 0));
		counts.oreo += (Number(s.qty_oreo || 0));
		counts.nute += (Number(s.qty_nute || 0));
	}

	// 3. Show dialog
	const msg = `Confirmar producción sugerida basada en pedidos de hoy:\n\nArco: ${counts.arco}\nMelo: ${counts.melo}\nMara: ${counts.mara}\nOreo: ${counts.oreo}\nNute: ${counts.nute}\n\n¿Deseas descontar estos ingredientes del inventario?`;
	if (!confirm(msg)) return;

	try {
		await api('POST', API.Inventory, { action: 'produccion', counts, actor_name: state.currentUser?.username || state.currentUser?.name || null });
		notify.success('Producción confirmada y descontada');
		renderInventoryView();
	} catch { notify.error('Error en el proceso de producción'); }
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
	['Ingrediente', 'Saldo actual', 'Nueva cantidad', 'Δ', ''].forEach(t => { const th = document.createElement('th'); th.textContent = t; hr.appendChild(th); });
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
		async function saveRow() {
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
	pop.style.left = (window.innerWidth / 2) + 'px'; pop.style.top = '12%'; pop.style.transform = 'translate(-50%, 0)';
	pop.style.maxHeight = '80vh'; pop.style.overflowY = 'auto';
	const title = document.createElement('h4'); title.textContent = `Historial: ${ingredient}`; title.style.margin = '0 0 8px 0';
	const table = document.createElement('table'); table.className = 'items-table';
	const thead = document.createElement('thead'); const hr = document.createElement('tr');
	['Fecha', 'Tipo', 'Cantidad', 'Producción', 'Nota', 'Actor'].forEach(t => { const th = document.createElement('th'); th.textContent = t; hr.appendChild(th); }); thead.appendChild(hr);
	const tbody = document.createElement('tbody');
	for (const r of (rows || [])) {
		const tr = document.createElement('tr');
		const tdD = document.createElement('td'); tdD.textContent = String(r.created_at || '').slice(0, 19).replace('T', ' ');
		const tdK = document.createElement('td'); tdK.textContent = r.kind;
		const tdQ = document.createElement('td'); tdQ.textContent = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(r.qty || 0)); tdQ.style.textAlign = 'right';
		const tdProd = document.createElement('td');
		if ((r.kind || '') === 'produccion') {
			let meta = r.metadata;
			try { if (typeof meta === 'string') meta = JSON.parse(meta); } catch { }
			const counts = (meta && meta.counts && typeof meta.counts === 'object') ? meta.counts : {};
			const labels = [['arco', 'Arco'], ['melo', 'Melo'], ['mara', 'Mara'], ['oreo', 'Oreo'], ['nute', 'Nute']];
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
	
	const cleanup = () => {
		document.removeEventListener('mousedown', outside);
		if (pop.parentNode) pop.parentNode.removeChild(pop);
	};
	const outside = (ev) => { if (!pop.contains(ev.target)) cleanup(); };
	
	close.addEventListener('click', cleanup);
	document.addEventListener('mousedown', outside);
	
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
	['Fecha', 'Ingrediente', 'Tipo', 'Cantidad', 'Nota', 'Actor'].forEach(t => { const th = document.createElement('th'); th.textContent = t; hr.appendChild(th); }); thead.appendChild(hr);
	const tbody = document.createElement('tbody');
	for (const r of (rows || [])) {
		const tr = document.createElement('tr');
		const tdD = document.createElement('td'); tdD.textContent = String(r.created_at || '').slice(0, 19).replace('T', ' ');
		const tdN = document.createElement('td'); tdN.textContent = r.ingredient || '';
		const tdK = document.createElement('td'); tdK.textContent = r.kind;
		const tdQ = document.createElement('td'); tdQ.textContent = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(r.qty || 0)); tdQ.style.textAlign = 'right';
		const tdNo = document.createElement('td');
		if ((r.kind || '') === 'produccion') {
			let meta = r.metadata;
			try { if (typeof meta === 'string') meta = JSON.parse(meta); } catch { }
			const counts = (meta && meta.counts && typeof meta.counts === 'object') ? meta.counts : {};
			const labels = [['arco', 'Arco'], ['melo', 'Melo'], ['mara', 'Mara'], ['oreo', 'Oreo'], ['nute', 'Nute']];
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
	// Create or update global ingredients datalist
	let inv = []; try { inv = await api('GET', API.Inventory); } catch {}
	if (!Array.isArray(inv)) inv = [];
	let dl = document.getElementById('dl-inventory-items');
	if (!dl) { dl = document.createElement('datalist'); dl.id = 'dl-inventory-items'; document.body.appendChild(dl); }
	dl.innerHTML = inv.map(it => `<option value="${it.ingredient}">`).join('');

	// Get desserts from both sources:
	// 1. Desserts with recipes (from dessert_recipes)
	let recipeDesserts = [];
	try { recipeDesserts = await api('GET', API.Recipes); } catch { recipeDesserts = []; }
	if (!recipeDesserts || recipeDesserts.length === 0) {
		try { await api('GET', `${API.Recipes}?seed=1`); recipeDesserts = await api('GET', API.Recipes); }
		catch { }
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
		try { document.dispatchEvent(new CustomEvent('recipes:changed', { detail: { action: 'addDessert', dessert: name } })); } catch { }
	};
}

// ====== Local-only TIEMPOS ======
function readTimesState() {
	try { return JSON.parse(localStorage.getItem('timesState') || '[]') || []; } catch { return []; }
}
function writeTimesState(data) {
	try { localStorage.setItem('timesState', JSON.stringify(data)); } catch { }
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
				} catch { }
			}
			if (imported.length) { data = imported; writeTimesState(data); }
		} catch { }
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
	function writeTimesHistory(rows) { try { localStorage.setItem('timesHistory', JSON.stringify(rows)); } catch { } }
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
		function renderTime() { display.textContent = formatMs(computeElapsed()); if (typeof onTick === 'function') onTick(); }
		renderTime();
		function start() { if (step.isRunning) return; step.isRunning = true; step.startedAt = Date.now(); writeTimesState(data); clearInterval(intervalId); intervalId = setInterval(renderTime, 250); }
		function pause() { if (!step.isRunning) return; step.elapsedMs = computeElapsed(); step.isRunning = false; step.startedAt = null; writeTimesState(data); clearInterval(intervalId); intervalId = null; renderTime(); }
		function reset() { step.elapsedMs = 0; step.isRunning = false; step.startedAt = null; writeTimesState(data); clearInterval(intervalId); intervalId = null; renderTime(); }
		startBtn.addEventListener('click', start);
		pauseBtn.addEventListener('click', pause);
		resetBtn.addEventListener('click', reset);
		// Ensure timer runs if already active
		if (step.isRunning) { clearInterval(intervalId); intervalId = setInterval(renderTime, 250); }
		return { element: wrap, stop: () => { if (intervalId) clearInterval(intervalId); } };
	}

	function buildStep(step, dessert, stepIndex) {
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
		function fmtQty(n) { try { return new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(n || 0)); } catch { return String(Number(n || 0).toFixed(1)); } }
		async function renderIngredients() {
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
			['Ingrediente', 'Cantidad'].forEach(t => { const th = document.createElement('th'); th.textContent = t; trh.appendChild(th); }); thead.appendChild(trh);
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
		name.addEventListener('change', () => { try { renderIngredients(); } catch { } });
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

	function buildDessertCardLocal(d) {
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
				await fetch('/api/times', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dessert: d.name || 'Postre', steps: d.steps || [], total_elapsed_ms: Number(d.total_ms || 0) || 0, actor_name: state.currentUser?.username || state.currentUser?.name || null }) });
				saved++;
			}
			// keep local history too for quick reference
			const hist = readTimesHistory(); hist.push(snapshot); writeTimesHistory(hist);
			if (saved > 0) notify?.success ? notify.success(`Tiempos guardados (${saved})`) : alert(`Tiempos guardados (${saved})`);
			else notify?.error ? notify.error('No hay tiempos para guardar') : alert('No hay tiempos para guardar');
		} catch { try { alert('No se pudieron guardar los tiempos'); } catch { } }
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
		try { await api('GET', `${API.Recipes}?seed=1`); dessertNames = await api('GET', API.Recipes); } catch { }
	}
	// Build input form for counts
	const form = document.createElement('div'); form.className = 'measures-form'; form.style.display = 'flex'; form.style.justifyContent = 'center'; form.style.margin = '0 0 12px 0';
	const grid = document.createElement('div'); grid.className = 'measures-grid'; grid.style.display = 'grid'; grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(180px, 1fr))'; grid.style.gap = '12px 16px'; grid.style.maxWidth = '880px'; grid.style.width = '100%';
	const counts = new Map();
	function normalizeKey(name) { const k = String(name || '').trim().toLowerCase(); if (k.startsWith('arco')) return 'arco'; if (k.startsWith('melo')) return 'melo'; if (k.startsWith('mara')) return 'mara'; if (k.startsWith('oreo')) return 'oreo'; if (k.startsWith('nute')) return 'nute'; return k; }
	const byKey = new Map();
	for (const name of (dessertNames || [])) { const key = normalizeKey(name); byKey.set(key, name); }
	for (const [k, name] of byKey.entries()) {
		const row = document.createElement('div'); row.className = 'measures-row'; row.style.display = 'flex'; row.style.alignItems = 'center'; row.style.justifyContent = 'center'; row.style.gap = '8px'; row.style.border = '1px solid rgba(0,0,0,0.12)'; row.style.borderRadius = '10px'; row.style.padding = '8px 10px'; row.style.cursor = 'pointer'; row.style.background = 'white';
		const label = document.createElement('div'); label.textContent = name; label.style.fontWeight = '600'; label.style.textAlign = 'center'; label.style.flex = '1';
		const input = document.createElement('input'); input.type = 'number'; input.min = '0'; input.step = '1'; input.value = '0'; input.className = 'input-cell'; input.style.width = '86px'; input.style.textAlign = 'center';
		counts.set(k, 0);
		input.addEventListener('focus', () => { try { input.select(); } catch { } });
		row.addEventListener('click', (ev) => { if (ev.target !== input) { input.focus(); input.select(); } });
		input.addEventListener('input', () => { counts.set(k, Math.max(0, Number(input.value || 0) || 0)); renderResults(); });
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
		try { const exData = await api('GET', `${API.Recipes}?dessert=${encodeURIComponent(names[0] || 'dummy')}&include_extras=1`); globalExtras = exData.extras || []; } catch { }
		return { byDessert, extras: globalExtras };
	}

	let recipeCache = null;
	async function ensureRecipes() { if (!recipeCache) recipeCache = await fetchRecipeMap(); return recipeCache; }

	// Refresh when recipes change (e.g., new dessert added)
	function onRecipesChanged() {
		recipeCache = null; // clear cache
		// Rebuild inputs grid with any new dessert
		while (grid.firstChild) grid.removeChild(grid.firstChild);
		byKey.clear();
		for (const name of (dessertNames || [])) { const key = normalizeKey(name); byKey.set(key, name); }
		for (const [k, name] of byKey.entries()) {
			const row = document.createElement('div'); row.className = 'measures-row'; row.style.display = 'flex'; row.style.alignItems = 'center'; row.style.justifyContent = 'center'; row.style.gap = '8px'; row.style.border = '1px solid rgba(0,0,0,0.12)'; row.style.borderRadius = '10px'; row.style.padding = '8px 10px'; row.style.cursor = 'pointer'; row.style.background = 'white';
			const label = document.createElement('div'); label.textContent = name; label.style.fontWeight = '600'; label.style.textAlign = 'center'; label.style.flex = '1';
			const input = document.createElement('input'); input.type = 'number'; input.min = '0'; input.step = '1'; input.value = String(counts.get(k) || 0); input.className = 'input-cell'; input.style.width = '86px'; input.style.textAlign = 'center';
			input.addEventListener('focus', () => { try { input.select(); } catch { } });
			row.addEventListener('click', (ev) => { if (ev.target !== input) { input.focus(); input.select(); } });
			input.addEventListener('input', () => { counts.set(k, Math.max(0, Number(input.value || 0) || 0)); renderResults(); });
			grid.appendChild(row); row.append(label, input);
		}
		renderResults();
	}
	const recipesChangedHandler = async (ev) => {
		try {
			// refetch dessert names to include new ones
			dessertNames = await api('GET', API.Recipes);
			onRecipesChanged();
		} catch { }
	};
	try { document.addEventListener('recipes:changed', recipesChangedHandler); } catch { }

	function clearCards() { while (cardsWrap.firstChild) cardsWrap.removeChild(cardsWrap.firstChild); }

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
		const fmtNum = (n) => Number((Number(n || 0)).toFixed(1));
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
		const label = new Date().toISOString().slice(0, 10).replaceAll('-', '');
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
			const any = Object.values(payload.counts).some(n => Number(n || 0) > 0);
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
		try { await api('POST', API.Recipes, { kind: 'dessert.order', names }); } catch { }
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
		try { await api('DELETE', `${API.Recipes}?kind=dessert&dessert=${encodeURIComponent(dessertName)}`); } catch { }
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
	['Ingrediente', 'Cantidad/Unidad', 'Ajuste', ''].forEach(t => { const th = document.createElement('th'); th.textContent = t; hr.appendChild(th); });
	thead.appendChild(hr);
	const tbody = document.createElement('tbody');
	for (const it of (step.items || [])) tbody.appendChild(buildItemRow(step.id, it));
	// Ensure empty steps have a visible drop target
	function hasRealRows() { return !!tbody.querySelector('tr:not(.empty-drop)'); }
	function ensurePlaceholder() {
		if (hasRealRows()) { removePlaceholder(); return; }
		if (tbody.querySelector('tr.empty-drop')) return;
		const tr = document.createElement('tr'); tr.className = 'empty-drop';
		const td = document.createElement('td'); td.colSpan = 5; td.textContent = 'Suelta ingredientes aquí';
		td.style.opacity = '0.7'; td.style.textAlign = 'center'; td.style.padding = '14px'; td.style.border = '1px dashed var(--border)';
		tr.appendChild(td); tbody.appendChild(tr);
	}
	function removePlaceholder() { const ph = tbody.querySelector('tr.empty-drop'); if (ph) ph.remove(); }
	ensurePlaceholder();
	table.append(thead, tbody);
	box.append(head, table);
	// Enable drag & drop for steps using the header as a handle
	box.draggable = false;
	head.draggable = true;
	head.addEventListener('dragstart', (e) => {
		try { if (e && e.dataTransfer) e.dataTransfer.setData('text/plain', 'step'); } catch { }
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
		const stepIds = Array.from(list.querySelectorAll('.step-card')).map(el => Number(el.getAttribute('data-step-id') || '0') || 0).filter(Boolean);
		if (!stepIds.length) return;
		try { await api('POST', API.Recipes, { kind: 'step.reorder', ids: stepIds }); } catch { }
	});
	add.addEventListener('click', () => {
		openAddIngredientModal(step.id, (step.items?.length || 0), (row) => {
			removePlaceholder();
			tbody.appendChild(buildItemRow(step.id, row));
			if (!step.items) step.items = [];
			step.items.push(row);
		});
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
			const targetIds = Array.from(tbody.querySelectorAll('tr')).map(r => Number(r.getAttribute('data-item-id') || '0') || 0).filter(Boolean);
			if (targetIds.length) { try { await api('POST', API.Recipes, { kind: 'item.reorder', ids: targetIds }); } catch { } }
			if (info.fromTbody && info.fromTbody.isConnected) {
				const srcIds = Array.from(info.fromTbody.querySelectorAll('tr')).map(r => Number(r.getAttribute('data-item-id') || '0') || 0).filter(Boolean);
				if (srcIds.length) { try { await api('POST', API.Recipes, { kind: 'item.reorder', ids: srcIds }); } catch { } }
			}
			ensurePlaceholder();
		} catch { notify.error('No se pudo mover el ingrediente'); }
	});
	return box;
}

async function openAddIngredientModal(recipeId, currentItemsCount, onAdded) {
	// Fetch ingredients from inventory for suggestions
	const inventory = await api('GET', '/api/inventory');
	const existingIngredients = (inventory || []).map(it => it.ingredient);

	const overlay = document.createElement('div');
	overlay.style.position = 'fixed';
	overlay.style.top = '0'; overlay.style.left = '0';
	overlay.style.width = '100%'; overlay.style.height = '100%';
	overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
	overlay.style.display = 'flex';
	overlay.style.alignItems = 'center'; overlay.style.justifyContent = 'center';
	overlay.style.zIndex = '10000';
	overlay.style.backdropFilter = 'blur(4px)';

	const modal = document.createElement('div');
	modal.className = 'confirm-popover';
	modal.style.position = 'relative';
	modal.style.width = '90%';
	modal.style.maxWidth = '400px';
	modal.style.padding = '24px';
	modal.style.borderRadius = '20px';
	modal.style.background = 'white';
	modal.style.boxShadow = '0 20px 50px rgba(0,0,0,0.15)';

	modal.innerHTML = `
		<h3 style="margin:0 0 8px 0; color:var(--primary); font-size:1.4rem">Añadir Ingrediente</h3>
		<p style="margin:0 0 20px 0; color:var(--muted); font-size:0.9rem">Busca un material existente o escribe uno nuevo.</p>
		
		<div style="margin-bottom:16px">
			<label style="display:block; margin-bottom:6px; font-weight:600; font-size:0.9rem">Nombre del Material</label>
			<input type="text" id="modal-ing-name" list="modal-ing-list" class="input-cell" style="width:100%; border:1px solid var(--border); padding:10px" placeholder="Ej: Crema de leche...">
			<datalist id="modal-ing-list">
				${existingIngredients.map(name => `<option value="${name}">`).join('')}
			</datalist>
		</div>

		<div style="margin-bottom:24px">
			<label style="display:block; margin-bottom:6px; font-weight:600; font-size:0.9rem">Cantidad por Unidad</label>
			<input type="number" id="modal-ing-qty" step="any" class="input-cell" style="width:100%; border:1px solid var(--border); padding:10px" value="0">
			<small style="color:var(--muted); display:block; margin-top:4px">Gramos, mililitros o unidades.</small>
		</div>

		<div style="display:flex; gap:12px">
			<button id="modal-cancel" class="press-btn" style="flex:1; background:#f3f4f6; color:#4b5563">Cancelar</button>
			<button id="modal-submit" class="press-btn btn-primary" style="flex:2">Agregar a Receta</button>
		</div>
	`;

	overlay.appendChild(modal);
	document.body.appendChild(overlay);
	modal.classList.add('aladdin-pop');

	const nameIn = modal.querySelector('#modal-ing-name');
	const qtyIn = modal.querySelector('#modal-ing-qty');
	const submitBtn = modal.querySelector('#modal-submit');
	const cancelBtn = modal.querySelector('#modal-cancel');

	nameIn.focus();

	const close = () => { document.body.removeChild(overlay); };
	
	cancelBtn.onclick = close;
	overlay.onclick = (e) => { if (e.target === overlay) close(); };

	submitBtn.onclick = async () => {
		const name = nameIn.value.trim();
		const qty = Number(qtyIn.value || 0) || 0;
		if (!name) { notify.error('Nombre requerido'); return; }
		
		submitBtn.disabled = true;
		submitBtn.textContent = 'Agregando...';
		
		try {
			const row = await api('POST', API.Recipes, { 
				kind: 'item.upsert', 
				recipe_id: recipeId, 
				ingredient: name, 
				unit: 'g', 
				qty_per_unit: qty, 
				adjustment: 0, 
				price: 0, 
				position: currentItemsCount + 1 
			});
			onAdded(row);
			close();
		} catch (err) {
			notify.error('Error al guardar ingrediente');
			submitBtn.disabled = false;
			submitBtn.textContent = 'Agregar a Receta';
		}
	};

	nameIn.onkeydown = (e) => { if (e.key === 'Enter') qtyIn.focus(); };
	qtyIn.onkeydown = (e) => { if (e.key === 'Enter') submitBtn.click(); };
}

function buildItemRow(stepId, item) {
	const tr = document.createElement('tr');
	const tdN = document.createElement('td'); const inN = document.createElement('input'); inN.type = 'text'; inN.value = item.ingredient; inN.setAttribute('list', 'dl-inventory-items'); tdN.appendChild(inN);
	const tdQ = document.createElement('td'); const inQ = document.createElement('input'); inQ.type = 'number'; inQ.step = '0.01'; inQ.value = String(item.qty_per_unit || 0); tdQ.appendChild(inQ);
	const tdAdj = document.createElement('td'); const inAdj = document.createElement('input'); inAdj.type = 'number'; inAdj.step = '0.01'; inAdj.value = String(item.adjustment || 0); tdAdj.appendChild(inAdj);
	const tdA = document.createElement('td'); const del = document.createElement('button'); del.className = 'press-btn'; del.textContent = '×'; tdA.appendChild(del);
	tr.append(tdN, tdQ, tdAdj, tdA);
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
		const ids = Array.from(tbody.querySelectorAll('tr')).map(r => Number(r.getAttribute('data-item-id') || '0') || 0).filter(Boolean);
		if (!ids.length) return;
		try { await api('POST', API.Recipes, { kind: 'item.reorder', ids }); } catch { }
		try { delete window.__draggingItemInfo; } catch { }
	});
	async function save() {
		try {
			await api('POST', API.Recipes, { kind: 'item.upsert', id: item.id, recipe_id: stepId, ingredient: inN.value, unit: 'g', qty_per_unit: Number(inQ.value || 0) || 0, adjustment: Number(inAdj.value || 0) || 0, position: item.position || 0 });
		} catch { notify.error('No se pudo guardar'); }
	}
	[inN, inQ, inAdj].forEach(el => { el.addEventListener('change', save); el.addEventListener('blur', save); });
	del.addEventListener('click', async () => { await api('DELETE', `${API.Recipes}?kind=item&id=${encodeURIComponent(item.id)}`); tr.remove(); });
	// persist id on row
	tr.setAttribute('data-item-id', String(item.id));
	return tr;
}

async function openExtrasEditor() {
	const data = await api('GET', `${API.Recipes}?dessert=${encodeURIComponent('dummy')}&include_extras=1`);
	const extras = Array.isArray(data?.extras) ? data.extras : [];
	const pop = document.createElement('div'); pop.className = 'confirm-popover'; pop.style.position = 'fixed';
	pop.style.left = (window.innerWidth / 2) + 'px'; pop.style.top = '12%'; pop.style.transform = 'translate(-50%, 0)';
	const title = document.createElement('h4'); title.textContent = 'Extras por unidad'; title.style.margin = '0 0 8px 0';
	const table = document.createElement('table'); table.className = 'items-table';
	const thead = document.createElement('thead'); const hr = document.createElement('tr');
	['Ingrediente', 'Cantidad', ''].forEach(t => { const th = document.createElement('th'); th.textContent = t; hr.appendChild(th); }); thead.appendChild(hr);
	const tbody = document.createElement('tbody');
	for (const it of extras) tbody.appendChild(buildExtrasRow(it, tbody));
	const tfoot = document.createElement('tfoot'); const fr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 4; const add = document.createElement('button'); add.className = 'press-btn'; add.textContent = '+ Extra'; td.appendChild(add); fr.appendChild(td); tfoot.appendChild(fr);
	const actions = document.createElement('div'); actions.className = 'confirm-actions'; const close = document.createElement('button'); close.className = 'press-btn'; close.textContent = 'Cerrar'; actions.appendChild(close);
	add.addEventListener('click', async () => {
		const ing = (prompt('Ingrediente:') || '').trim(); if (!ing) return;
		const unit = 'unidad';
		const qty = Number(prompt('Cantidad por unidad:') || '1') || 0;
		const row = await api('POST', API.Recipes, { kind: 'extras.upsert', ingredient: ing, unit, qty_per_unit: qty, position: (extras.length || 0) + 1 });
		tbody.appendChild(buildExtrasRow(row, tbody));
	});
	close.addEventListener('click', () => { if (pop.parentNode) pop.parentNode.removeChild(pop); });
	pop.append(title, table, actions); table.append(thead, tbody, tfoot); document.body.appendChild(pop); pop.classList.add('aladdin-pop');
}

function buildExtrasRow(item, tbody) {
	const tr = document.createElement('tr');
	const tdN = document.createElement('td'); const inN = document.createElement('input'); inN.type = 'text'; inN.value = item.ingredient; inN.setAttribute('list', 'dl-inventory-items'); tdN.appendChild(inN);
	const tdQ = document.createElement('td'); const inQ = document.createElement('input'); inQ.type = 'number'; inQ.step = '0.01'; inQ.style.width = '76px'; inQ.value = String(item.qty_per_unit || 0); tdQ.appendChild(inQ);
	const tdA = document.createElement('td'); const del = document.createElement('button'); del.className = 'press-btn'; del.textContent = '×'; tdA.appendChild(del);
	tr.append(tdN, tdQ, tdA);
	async function save() { try { await api('POST', API.Recipes, { kind: 'extras.upsert', id: item.id, ingredient: inN.value, unit: 'unidad', qty_per_unit: Number(inQ.value || 0) || 0, position: item.position || 0 }); } catch { notify.error('No se pudo guardar'); } }
	[inN, inQ].forEach(el => { el.addEventListener('change', save); el.addEventListener('blur', save); });
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
				const isAllZero = !Number(row.qty_arco || 0) && !Number(row.qty_melo || 0) && !Number(row.qty_mara || 0) && !Number(row.qty_oreo || 0) && !Number(row.qty_nute || 0);
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
				const any = Object.values(restored).some(v => Number(v || 0) > 0);
				if (!any) continue;
				report.push({
					seller: s.name,
					date: String(d.day).slice(0, 10),
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
	function cleanup() { document.removeEventListener('mousedown', outside, true); document.removeEventListener('touchstart', outside, true); if (pop.parentNode) pop.parentNode.removeChild(pop); }
	function outside(ev) { if (!pop.contains(ev.target)) cleanup(); }
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
	const weekdays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
	const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
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
				try { notify.success(makeArchived ? 'Fecha archivada' : 'Fecha desarchivada'); } catch { }
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
				let latestTs = Date.parse(String(latest.day).slice(0, 10));
				for (let i = 1; i < days.length; i++) {
					const ts = Date.parse(String(days[i].day).slice(0, 10));
					if (!isNaN(ts) && (isNaN(latestTs) || ts > latestTs)) { latest = days[i]; latestTs = ts; }
				}
				if (latest && latest.id) {
					state.selectedDayId = latest.id;
					const wrap = document.getElementById('sales-wrapper');
					if (wrap) wrap.classList.remove('hidden');
					loadSales().catch(() => { });
				}
			}
		}
	} catch { }
}

async function addNewDate() {
	const sellerId = state.currentSeller.id;
	let day = document.getElementById('new-date')?.value;
	if (!day) {
		const now = new Date();
		day = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0, 10);
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
		try { input.showPicker(); return; } catch { }
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
		const added = (state.saleDays || []).Ễfind(d => d.day === iso);
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

	const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
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

	const weekdays = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
	const wk = document.createElement('div'); wk.className = 'date-weekdays';
	for (const w of weekdays) { const c = document.createElement('div'); c.textContent = w; wk.appendChild(c); }

	function isoUTC(y, m, d) { return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10); }
	function render() {
		label.textContent = months[view.getMonth()] + ' ' + view.getFullYear();
		grid.innerHTML = '';
		const year = view.getFullYear();
		const month = view.getMonth();
		const firstDay = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7; // Monday=0
		const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

		// Días del mes anterior
		const prevMonthDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
		const prevMonth = month === 0 ? 11 : month - 1;
		const prevYear = month === 0 ? year - 1 : year;

		for (let i = firstDay - 1; i >= 0; i--) {
			const day = prevMonthDays - i;
			const cell = document.createElement('button');
			cell.className = 'date-cell other-month';
			cell.textContent = String(day);
			cell.style.opacity = '0.4';
			cell.addEventListener('click', () => {
				cleanup();
				if (typeof onPicked === 'function') onPicked(isoUTC(prevYear, prevMonth, day));
			});
			grid.appendChild(cell);
		}

		// Días del mes actual
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

		// Días del mes siguiente
		const totalCells = firstDay + daysInMonth;
		const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
		const nextMonth = month === 11 ? 0 : month + 1;
		const nextYear = month === 11 ? year + 1 : year;

		for (let d = 1; d <= remainingCells; d++) {
			const cell = document.createElement('button');
			cell.className = 'date-cell other-month';
			cell.textContent = String(d);
			cell.style.opacity = '0.4';
			cell.addEventListener('click', () => {
				cleanup();
				if (typeof onPicked === 'function') onPicked(isoUTC(nextYear, nextMonth, d));
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

	const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
	let view = new Date(); view.setDate(1);
	const selected = new Set();

	const header = document.createElement('div'); header.className = 'date-popover-header';
	const prev = document.createElement('button'); prev.className = 'date-nav'; prev.textContent = '‹';
	const label = document.createElement('div'); label.className = 'date-label';
	const next = document.createElement('button'); next.className = 'date-nav'; next.textContent = '›';
	header.append(prev, label, next);

	const grid = document.createElement('div'); grid.className = 'date-grid';
	const weekdays = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
	const wk = document.createElement('div'); wk.className = 'date-weekdays';
	for (const w of weekdays) { const c = document.createElement('div'); c.textContent = w; wk.appendChild(c); }

	function isoUTC(y, m, d) { return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10); }

	function render() {
		label.textContent = months[view.getMonth()] + ' ' + view.getFullYear();
		grid.innerHTML = '';
		const year = view.getFullYear();
		const month = view.getMonth();
		const firstDay = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
		const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

		// Días del mes anterior
		const prevMonthDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
		const prevMonth = month === 0 ? 11 : month - 1;
		const prevYear = month === 0 ? year - 1 : year;

		for (let i = firstDay - 1; i >= 0; i--) {
			const day = prevMonthDays - i;
			const iso = isoUTC(prevYear, prevMonth, day);
			const cell = document.createElement('button');
			cell.className = 'date-cell other-month' + (selected.has(iso) ? ' selected' : '');
			cell.textContent = String(day);
			cell.style.opacity = selected.has(iso) ? '1' : '0.4';
			cell.addEventListener('click', () => { if (selected.has(iso)) selected.delete(iso); else selected.add(iso); render(); });
			grid.appendChild(cell);
		}

		// Días del mes actual
		for (let d = 1; d <= daysInMonth; d++) {
			const iso = isoUTC(year, month, d);
			const cell = document.createElement('button');
			cell.className = 'date-cell' + (selected.has(iso) ? ' selected' : '');
			cell.textContent = String(d);
			cell.addEventListener('click', () => { if (selected.has(iso)) selected.delete(iso); else selected.add(iso); render(); });
			grid.appendChild(cell);
		}

		// Días del mes siguiente
		const totalCells = firstDay + daysInMonth;
		const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
		const nextMonth = month === 11 ? 0 : month + 1;
		const nextYear = month === 11 ? year + 1 : year;

		for (let d = 1; d <= remainingCells; d++) {
			const iso = isoUTC(nextYear, nextMonth, d);
			const cell = document.createElement('button');
			cell.className = 'date-cell other-month' + (selected.has(iso) ? ' selected' : '');
			cell.textContent = String(d);
			cell.style.opacity = selected.has(iso) ? '1' : '0.4';
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

	const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
	let view = new Date(); view.setDate(1);
	let startIso = null; let endIso = null;

	const header = document.createElement('div'); header.className = 'date-popover-header';
	const prev = document.createElement('button'); prev.className = 'date-nav'; prev.textContent = '‹';
	const label = document.createElement('div'); label.className = 'date-label';
	const next = document.createElement('button'); next.className = 'date-nav'; next.textContent = '›';
	header.append(prev, label, next);

	const grid = document.createElement('div'); grid.className = 'date-grid';
	const weekdays = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
	const wk = document.createElement('div'); wk.className = 'date-weekdays';
	for (const w of weekdays) { const c = document.createElement('div'); c.textContent = w; wk.appendChild(c); }

	function isoUTC(y, m, d) { return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10); }
	function isBetween(x, a, b) { return x >= a && x <= b; }

	function render() {
		label.textContent = months[view.getMonth()] + ' ' + view.getFullYear();
		grid.innerHTML = '';
		const year = view.getFullYear();
		const month = view.getMonth();
		const firstDay = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
		const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

		// Días del mes anterior
		const prevMonthDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
		const prevMonth = month === 0 ? 11 : month - 1;
		const prevYear = month === 0 ? year - 1 : year;

		for (let i = firstDay - 1; i >= 0; i--) {
			const day = prevMonthDays - i;
			const iso = isoUTC(prevYear, prevMonth, day);
			const cell = document.createElement('button');
			let cls = 'date-cell other-month';
			if (startIso && !endIso && iso === startIso) cls += ' range-start selected';
			if (startIso && endIso) {
				if (iso === startIso) cls += ' range-start selected';
				else if (iso === endIso) cls += ' range-end selected';
				else if (isBetween(iso, startIso, endIso)) cls += ' in-range';
			}
			cell.className = cls;
			cell.textContent = String(day);
			const hasClass = cls.includes('selected') || cls.includes('in-range');
			cell.style.opacity = hasClass ? '1' : '0.4';
			cell.addEventListener('click', () => {
				if (!startIso) { startIso = iso; endIso = null; render(); return; }
				if (!endIso) {
					if (iso < startIso) { endIso = startIso; startIso = iso; } else { endIso = iso; }
					render();
					return;
				}
				startIso = iso; endIso = null; render();
			});
			grid.appendChild(cell);
		}

		// Días del mes actual
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

		// Días del mes siguiente
		const totalCells = firstDay + daysInMonth;
		const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
		const nextMonth = month === 11 ? 0 : month + 1;
		const nextYear = month === 11 ? year + 1 : year;

		for (let d = 1; d <= remainingCells; d++) {
			const iso = isoUTC(nextYear, nextMonth, d);
			const cell = document.createElement('button');
			let cls = 'date-cell other-month';
			if (startIso && !endIso && iso === startIso) cls += ' range-start selected';
			if (startIso && endIso) {
				if (iso === startIso) cls += ' range-start selected';
				else if (iso === endIso) cls += ' range-end selected';
				else if (isBetween(iso, startIso, endIso)) cls += ' in-range';
			}
			cell.className = cls;
			cell.textContent = String(d);
			const hasClass = cls.includes('selected') || cls.includes('in-range');
			cell.style.opacity = hasClass ? '1' : '0.4';
			cell.addEventListener('click', () => {
				if (!startIso) { startIso = iso; endIso = null; render(); return; }
				if (!endIso) {
					if (iso < startIso) { endIso = startIso; startIso = iso; } else { endIso = iso; }
					render();
					return;
				}
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
	render = function () { origRender(); updateActions(); };

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
		try { localStorage.setItem('seenPaymentDate_' + String(method || '') + '_' + String(saleId || ''), '1'); } catch { }
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

	// Check if this cell also has a recurring client marker
	const td = inputElement.closest('td.col-client');
	const hasRecurring = td && td.classList.contains('has-reg');

	// Position at the end (right side) of the input
	// If there's a recurring marker, position further left to avoid overlap
	markerElement.style.left = 'auto';
	markerElement.style.right = hasRecurring ? '36px' : '8px';
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

		// Días del mes anterior
		const prevMonthDays = new Date(currentYear, currentMonth, 0).getDate();
		const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
		const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;

		for (let i = firstDay - 1; i >= 0; i--) {
			const day = prevMonthDays - i;
			const dayCell = document.createElement('div');
			dayCell.className = 'calendar-day other-month';
			dayCell.textContent = day;
			dayCell.style.opacity = '0.4';

			const cellDate = new Date(prevYear, prevMonth, day);

			// Check if this date is selected
			if (selectedDate &&
				selectedDate.getDate() === day &&
				selectedDate.getMonth() === prevMonth &&
				selectedDate.getFullYear() === prevYear) {
				dayCell.classList.add('selected');
				dayCell.style.opacity = '1';
			}

			dayCell.addEventListener('click', () => {
				document.querySelectorAll('.calendar-day').forEach(d => d.classList.remove('selected'));
				dayCell.classList.add('selected');
				selectedDate = new Date(prevYear, prevMonth, day);
			});

			calendarGrid.appendChild(dayCell);
		}

		// Días del mes actual
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

		// Días del mes siguiente
		const totalCells = firstDay + daysInMonth;
		const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
		const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
		const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;

		for (let d = 1; d <= remainingCells; d++) {
			const dayCell = document.createElement('div');
			dayCell.className = 'calendar-day other-month';
			dayCell.textContent = d;
			dayCell.style.opacity = '0.4';

			const cellDate = new Date(nextYear, nextMonth, d);

			// Check if this date is selected
			if (selectedDate &&
				selectedDate.getDate() === d &&
				selectedDate.getMonth() === nextMonth &&
				selectedDate.getFullYear() === nextYear) {
				dayCell.classList.add('selected');
				dayCell.style.opacity = '1';
			}

			dayCell.addEventListener('click', () => {
				document.querySelectorAll('.calendar-day').forEach(d => d.classList.remove('selected'));
				dayCell.classList.add('selected');
				selectedDate = new Date(nextYear, nextMonth, d);
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

				try { notify.success(`Fecha de pago guardada: ${paymentDate} - ${paymentSource}`); } catch { }

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
				try { notify.error('Error al guardar: ' + (e.message || 'Error desconocido')); } catch { }
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
			try { notify.error('Ya no es posible editar este pedido ya que ha sido entregado al cliente. Para editarlo por favor pide soporte.'); } catch { }
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
(function enhanceDateEvents() {
	const addBtn = document.getElementById('add-date');
	addBtn?.addEventListener('click', addNewDate);
})();

// Update enterSeller to load dates
(async function patchEnterSeller() {
	const origEnter = enterSeller;
	enterSeller = async function (id) {
		await origEnter(id);
		await loadDaysForSeller();
	};
})();

// Update '+ Nueva Fecha' to use the custom calendar
(function enhanceStaticButtons() {
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
				try { notify.success('Fecha desarchivada'); } catch { }
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
		if (ids.length === 0) { try { notify.info('Selecciona al menos una fecha'); } catch { } return; }
		await api('PATCH', '/api/days', { ids, is_archived: true });
		try { notify.success('Fechas archivadas'); } catch { }
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

// Global state to hold fetched clients for local search filtering in the Store view
let clientsState = { rows: [] };

async function openClientsView() {
	if (!state.currentSeller) return;
	await loadClientsForSeller();
	switchView('#view-clients');
}

async function loadClientsForSeller() {
	const sellerId = state.currentSeller.id;

	// 1. Fetch sales history to count records
	const days = await api('GET', `/api/days?seller_id=${encodeURIComponent(sellerId)}&include_archived=1`);
	const nameToData = new Map();

	for (const d of (days || [])) {
		const params = new URLSearchParams({ seller_id: String(sellerId), sale_day_id: String(d.id) });
		let sales = [];
		try { sales = await api('GET', `${API.Sales}?${params.toString()}`); } catch { sales = []; }
		for (const s of (sales || [])) {
			const raw = (s?.client_name || '').trim();
			if (!raw) continue;
			const key = normalizeClientName(raw);
			if (!nameToData.has(key)) nameToData.set(key, { name: raw, count: 0, short_name: '', whatsapp: '', birth_date: '' }); // Added short_name
			nameToData.get(key).count++;
		}
	}

	// 2. Fetch explicit client records from DB
	try {
		const dbClients = await api('GET', `/api/clients?seller_id=${sellerId}`);
		for (const c of (dbClients || [])) {
			const raw = (c.name || '').trim();
			if (!raw) continue;
			const key = normalizeClientName(raw);
			if (nameToData.has(key)) {
				const existing = nameToData.get(key);
				existing.short_name = c.short_name || ''; // Added short_name
				existing.whatsapp = c.whatsapp || '';
				existing.birth_date = c.birth_date || '';
			} else {
				// Add explicit database client even if they have 0 sales currently
				nameToData.set(key, { name: raw, count: 0, short_name: c.short_name || '', whatsapp: c.whatsapp || '', birth_date: c.birth_date || '' }); // Added short_name
			}
		}
	} catch (err) {
		console.error('Error fetching clients database:', err);
	}

	clientsState.rows = Array.from(nameToData.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
	
	const searchInput = document.getElementById('clients-list-search-input');
	const countLabel = document.getElementById('clients-search-count');
	const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
	
	let displayed;
	if (query) {
		displayed = clientsState.rows.filter(r => 
			r.name.toLowerCase().includes(query) || 
			(r.whatsapp && r.whatsapp.includes(query)) ||
			(r.short_name && r.short_name.toLowerCase().includes(query))
		);
	} else {
		displayed = clientsState.rows;
	}
	renderClientsTable(displayed);
	if (countLabel) {
		countLabel.textContent = `${displayed.length} cliente${displayed.length !== 1 ? 's' : ''} en total`;
	}
}

// Add event listener for the client search input
document.addEventListener('DOMContentLoaded', () => {
	const searchInput = document.getElementById('clients-list-search-input');
	if (searchInput) {
		searchInput.addEventListener('input', (e) => {
			const query = e.target.value.trim().toLowerCase();
			const countLabel = document.getElementById('clients-search-count');
			if (!clientsState.rows) return;
			
			let displayed;
			if (!query) {
				displayed = clientsState.rows;
			} else {
				displayed = clientsState.rows.filter(r => 
					r.name.toLowerCase().includes(query) || 
					(r.whatsapp && r.whatsapp.includes(query)) ||
					(r.short_name && r.short_name.toLowerCase().includes(query))
				);
			}
			renderClientsTable(displayed);
			if (countLabel) {
				countLabel.textContent = query
					? `${displayed.length} resultado${displayed.length !== 1 ? 's' : ''} encontrado${displayed.length !== 1 ? 's' : ''}`
					: `${displayed.length} cliente${displayed.length !== 1 ? 's' : ''} en total`;
			}
		});
	}
});

function renderClientsTable(rows) {
	const tbody = document.getElementById('clients-tbody');
	if (!tbody) return;
	tbody.innerHTML = '';
	if (!rows || rows.length === 0) {
		const tr = document.createElement('tr');
		const td = document.createElement('td'); td.colSpan = 6; td.textContent = 'Sin clientes'; td.style.opacity = '0.8'; td.style.textAlign = 'center';
		tr.appendChild(td); tbody.appendChild(tr); return;
	}

	for (const r of rows) {
		const tr = document.createElement('tr'); tr.className = 'clients-row';

		const tdN = document.createElement('td');
		tdN.textContent = r.name;
		tdN.className = 'clickable-name';
		tdN.title = 'Clic para ver historial';
		tdN.addEventListener('click', async () => { await openClientDetailView(r.name); });

		const tdS = document.createElement('td'); // Added short_name cell
		tdS.textContent = r.short_name || '-';
		tdS.style.color = 'var(--text-muted)';
		tdS.style.fontSize = '0.9em';

		const tdW = document.createElement('td');
		tdW.textContent = r.whatsapp || '-';

		const tdB = document.createElement('td');
		tdB.textContent = r.birth_date ? new Date(r.birth_date).toLocaleDateString() : '-';

		const tdC = document.createElement('td');
		tdC.textContent = String(r.count);
		tdC.style.textAlign = 'center';

		const tdVendedor = document.createElement('td');
		tdVendedor.textContent = state.currentSeller ? state.currentSeller.name : '-';
		tdVendedor.style.color = 'var(--muted)';
		tdVendedor.style.fontSize = '0.9em';

		const tdA = document.createElement('td');
		tdA.style.textAlign = 'center';

		const editBtn = document.createElement('button');
		editBtn.className = 'icon-btn';
		editBtn.textContent = '✏️';
		editBtn.title = 'Editar datos';
		editBtn.style.background = 'transparent';
		editBtn.style.border = 'none';
		editBtn.style.fontSize = '1.2rem';
		editBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			openClientEditPopover(r, e.clientX, e.clientY);
		});
		tdA.appendChild(editBtn);

		tr.append(tdN, tdS, tdW, tdB, tdC, tdVendedor, tdA); // Updated append to include tdS
		tr.addEventListener('mousedown', () => { tr.classList.add('row-highlight'); setTimeout(() => tr.classList.remove('row-highlight'), 3200); });
		tbody.appendChild(tr);
	}
}

// Simple Levenshtein distance function for string similarity
function levDistance(a, b) {
	const matrix = [];
	for (let i = 0; i <= b.length; i++) {
		matrix[i] = [i];
	}
	for (let j = 0; j <= a.length; j++) {
		matrix[0][j] = j;
	}
	for (let i = 1; i <= b.length; i++) {
		for (let j = 1; j <= a.length; j++) {
			if (b.charAt(i - 1) === a.charAt(j - 1)) {
				matrix[i][j] = matrix[i - 1][j - 1];
			} else {
				matrix[i][j] = Math.min(
					matrix[i - 1][j - 1] + 1, // substitution
					Math.min(matrix[i][j - 1] + 1, // insertion
						matrix[i - 1][j] + 1) // deletion
				);
			}
		}
	}
	return matrix[b.length][a.length];
}

async function openMergeSuggestionsModal() {
	const modal = document.getElementById('merge-suggestions-modal');
	const container = document.getElementById('merge-groups-container');
	const emptyMsg = document.getElementById('merge-groups-empty');
	const closeBtn = document.getElementById('close-merge-modal');

	if (!modal || !container || !emptyMsg) return;

	modal.style.display = 'flex';
	container.innerHTML = '';
	emptyMsg.style.display = 'none';

	// Grab all current clients on the table (since loadClientsForSeller populated nameToData theoretically, but we can reconstruct from the rows)
	const tbody = document.getElementById('clients-tbody');
	if (!tbody) return;

	const allNames = Array.from(tbody.querySelectorAll('.clients-row td:first-child'))
		.map(td => td.textContent.trim())
		.filter(Boolean);

	// Group similar names
	const groups = [];
	const visitedNames = new Set();
	const THRESHOLD = 3; // Max 3 edits to be considered similar (e.g., "Andres" vs "andras")

	for (let i = 0; i < allNames.length; i++) {
		const nameA = allNames[i];
		if (visitedNames.has(nameA)) continue;

		const currentGroup = [nameA];
		visitedNames.add(nameA);

		const normalizedA = nameA.toLowerCase().replace(/[^a-z0-9]/g, '');

		for (let j = i + 1; j < allNames.length; j++) {
			const nameB = allNames[j];
			if (visitedNames.has(nameB)) continue;

			const normalizedB = nameB.toLowerCase().replace(/[^a-z0-9]/g, '');

			// Detect pure substrings or short lev distances
			if (normalizedB.includes(normalizedA) || normalizedA.includes(normalizedB) || levDistance(normalizedA, normalizedB) <= THRESHOLD) {
				currentGroup.push(nameB);
				visitedNames.add(nameB);
			}
		}

		if (currentGroup.length > 1) {
			groups.push(currentGroup);
		}
	}

	if (groups.length === 0) {
		emptyMsg.style.display = 'block';
	} else {
		// Render groups
		groups.forEach((group, index) => {
			const groupCard = document.createElement('div');
			groupCard.style.border = '1px solid var(--border)';
			groupCard.style.borderRadius = '8px';
			groupCard.style.padding = '16px';
			groupCard.style.background = 'var(--background)';

			const groupTitle = document.createElement('h4');
			groupTitle.textContent = `Grupo ${index + 1} (${group.length} coincidencias)`;
			groupTitle.style.margin = '0 0 12px 0';
			groupTitle.style.color = 'var(--primary)';
			groupCard.appendChild(groupTitle);

			const radioGroupName = `merge_group_${index}`;

			group.forEach((name, i) => {
				const row = document.createElement('div');
				row.style.display = 'flex';
				row.style.alignItems = 'center';
				row.style.gap = '8px';
				row.style.marginBottom = '8px';

				const radio = document.createElement('input');
				radio.type = 'radio';
				radio.name = radioGroupName;
				radio.value = name;
				radio.id = `${radioGroupName}_${i}`;
				if (i === 0) radio.checked = true; // Default first option

				const label = document.createElement('label');
				label.setAttribute('for', radio.id);
				label.textContent = name;
				label.style.cursor = 'pointer';
				label.style.flex = '1';

				row.appendChild(radio);
				row.appendChild(label);
				groupCard.appendChild(row);
			});

			const mergeBtn = document.createElement('button');
			mergeBtn.className = 'press-btn btn-primary';
			mergeBtn.textContent = 'Fusionar bajo el nombre seleccionado';
			mergeBtn.style.marginTop = '12px';
			mergeBtn.style.width = '100%';

			mergeBtn.addEventListener('click', async () => {
				mergeBtn.disabled = true;
				mergeBtn.textContent = 'Fusionando...';

				const selectedRadio = groupCard.querySelector(`input[name="${radioGroupName}"]:checked`);
				const targetName = selectedRadio.value;
				const sourceNames = group.filter(n => n !== targetName);

				try {
					const sellerId = state.currentSeller.id;
					const payload = {
						seller_id: sellerId,
						name: targetName,
						source_names: group // We send all, backend ignores target if inside source
					};

					await api('POST', `/api/clients?action=merge`, payload);

					groupCard.innerHTML = '<div style="color: var(--success); text-align: center; padding: 10px;">¡Fusión exitosa! ✓</div>';
					setTimeout(() => { groupCard.style.display = 'none'; }, 2000);

					// Pre-emptively reload the table behind the scenes
					await loadClientsForSeller();

				} catch (err) {
					alert('Error al fusionar: ' + err.message);
					mergeBtn.disabled = false;
					mergeBtn.textContent = 'Fusionar bajo el nombre seleccionado';
				}
			});

			groupCard.appendChild(mergeBtn);
			container.appendChild(groupCard);
		});
	}

	const handleClose = () => {
		modal.style.display = 'none';
		closeBtn?.removeEventListener('click', handleClose);
	};
	closeBtn?.addEventListener('click', handleClose);
}

function openClientEditPopover(clientData, clientX, clientY) {
	// Native cleanup to fix undefined array errors
	document.querySelectorAll('.edit-client-popover').forEach(p => p.remove());

	const pop = document.createElement('div');
	pop.className = 'popover active edit-client-popover';
	pop.style.padding = '20px';
	pop.style.minWidth = '260px';
	pop.style.position = 'fixed';
	pop.style.zIndex = '9999';
	pop.style.background = 'var(--surface, #fff)';
	pop.style.boxShadow = '0 8px 32px rgba(0,0,0,0.2)';
	pop.style.borderRadius = '12px';
	pop.style.border = '1px solid var(--border, #ddd)';

	const title = document.createElement('h3');
	title.textContent = 'Editar Cliente';
	title.style.margin = '0 0 16px 0';
	title.style.fontSize = '1.1rem';
	title.style.color = 'var(--primary)';

	const nameLabel = document.createElement('label');
	nameLabel.textContent = 'Nombre:';
	nameLabel.style.display = 'block';
	nameLabel.style.fontSize = '0.9rem';
	nameLabel.style.marginBottom = '4px';

	const nameInput = document.createElement('input');
	nameInput.type = 'text';
	nameInput.value = clientData.name;
	// nameInput.readOnly = true; // REMOVED so users can rename
	nameInput.className = 'client-input';
	nameInput.style.width = '100%';
	nameInput.style.marginBottom = '12px';
	nameInput.style.background = 'var(--muted-bg)';

	const shortNameLabel = document.createElement('label');
	shortNameLabel.textContent = 'Nombre Corto (WhatsApp):';
	shortNameLabel.style.display = 'block';
	shortNameLabel.style.fontSize = '0.9rem';
	shortNameLabel.style.marginBottom = '4px';

	const shortNameInput = document.createElement('input');
	shortNameInput.type = 'text';
	shortNameInput.value = clientData.short_name || '';
	shortNameInput.className = 'client-input';
	shortNameInput.style.width = '100%';
	shortNameInput.style.marginBottom = '12px';
	shortNameInput.placeholder = 'Ej: Maria';

	const waLabel = document.createElement('label');
	waLabel.textContent = 'WhatsApp:';
	waLabel.style.display = 'block';
	waLabel.style.fontSize = '0.9rem';
	waLabel.style.marginBottom = '4px';

	const waInput = document.createElement('input');
	waInput.type = 'tel';
	waInput.value = clientData.whatsapp;
	waInput.className = 'client-input';
	waInput.style.width = '100%';
	waInput.style.marginBottom = '12px';
	waInput.placeholder = 'Ej: 3001234567';

	const birthLabel = document.createElement('label');
	birthLabel.textContent = 'Fecha de Nacimiento:';
	birthLabel.style.display = 'block';
	birthLabel.style.fontSize = '0.9rem';
	birthLabel.style.marginBottom = '4px';

	const birthInput = document.createElement('input');
	birthInput.type = 'date';
	birthInput.value = clientData.birth_date ? new Date(clientData.birth_date).toISOString().split('T')[0] : '';
	birthInput.className = 'client-input';
	birthInput.style.width = '100%';
	birthInput.style.marginBottom = '20px';

	const saveBtn = document.createElement('button');
	saveBtn.className = 'press-btn btn-primary';
	saveBtn.textContent = 'Guardar';
	saveBtn.style.width = '100%';

	pop.append(title, nameLabel, nameInput, shortNameLabel, shortNameInput, waLabel, waInput, birthLabel, birthInput, saveBtn);

	let left = clientX;
	let top = clientY;
	pop.style.left = left + 'px';
	pop.style.top = top + 'px';
	pop.style.opacity = '0';
	document.body.appendChild(pop);

	// Adjust bounds
	const rect = pop.getBoundingClientRect();
	if (rect.right > window.innerWidth) left -= (rect.right - window.innerWidth + 10);
	if (rect.bottom > window.innerHeight) top -= (rect.bottom - window.innerHeight + 10);
	pop.style.left = Math.max(10, left) + 'px';
	pop.style.top = Math.max(10, top) + 'px';

	requestAnimationFrame(() => pop.style.opacity = '1');

	saveBtn.addEventListener('click', async () => {
		try {
			const newName = nameInput.value.trim();
			if (!newName) {
				alert('El nombre es obligatorio.');
				return;
			}

			saveBtn.disabled = true;
			saveBtn.textContent = 'Guardando...';

			const payload = {
				seller_id: state.currentSeller.id,
				name: newName,
				short_name: shortNameInput.value.trim(),
				whatsapp: waInput.value.trim(),
				birth_date: birthInput.value || null
			};

			// If the user modified the name, trigger a rename action which merges if the new name exists
			let url = '/api/clients';
			if (newName.toLowerCase() !== (clientData.name || '').trim().toLowerCase()) {
				url = '/api/clients?action=rename';
				payload.old_name = clientData.name;
			}

			await api('POST', url, payload);
			cleanup();
			await loadClientsForSeller(); // Refresh table
		} catch (err) {
			alert('Error al guardar: ' + err.message);
			saveBtn.disabled = false;
			saveBtn.textContent = 'Guardar';
		}
	});

	function cleanup() {
		if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
		document.removeEventListener('mousedown', outside, true);
		document.removeEventListener('touchstart', outside, true);
	}

	function outside(ev) { if (!pop.contains(ev.target)) cleanup(); }
	setTimeout(() => {
		document.addEventListener('mousedown', outside, true);
		document.addEventListener('touchstart', outside, true);
	}, 0);
}

function openNewClientPopover(clientX, clientY) {
	document.querySelectorAll('.edit-client-popover').forEach(p => p.remove());

	const pop = document.createElement('div');
	pop.className = 'popover active edit-client-popover';
	pop.style.padding = '20px';
	pop.style.minWidth = '260px';
	pop.style.position = 'fixed';
	pop.style.zIndex = '9999';
	pop.style.background = 'var(--surface, #fff)';
	pop.style.boxShadow = '0 8px 32px rgba(0,0,0,0.2)';
	pop.style.borderRadius = '12px';
	pop.style.border = '1px solid var(--border, #ddd)';

	const title = document.createElement('h3');
	title.textContent = 'Nuevo Cliente';
	title.style.margin = '0 0 16px 0';
	title.style.fontSize = '1.1rem';
	title.style.color = 'var(--primary)';

	const nameLabel = document.createElement('label');
	nameLabel.textContent = 'Nombre del Cliente:';
	nameLabel.style.display = 'block';
	nameLabel.style.fontSize = '0.9rem';
	nameLabel.style.marginBottom = '4px';

	const nameInput = document.createElement('input');
	nameInput.type = 'text';
	nameInput.className = 'client-input';
	nameInput.style.width = '100%';
	nameInput.style.marginBottom = '12px';
	nameInput.placeholder = 'Ej: Maria Perez';

	const shortNameLabel = document.createElement('label');
	shortNameLabel.textContent = 'Nombre Corto (WhatsApp):';
	shortNameLabel.style.display = 'block';
	shortNameLabel.style.fontSize = '0.9rem';
	shortNameLabel.style.marginBottom = '4px';

	const shortNameInput = document.createElement('input');
	shortNameInput.type = 'text';
	shortNameInput.className = 'client-input';
	shortNameInput.style.width = '100%';
	shortNameInput.style.marginBottom = '12px';
	shortNameInput.placeholder = 'Ej: Maria';

	const waLabel = document.createElement('label');
	waLabel.textContent = 'WhatsApp:';
	waLabel.style.display = 'block';
	waLabel.style.fontSize = '0.9rem';
	waLabel.style.marginBottom = '4px';

	const waInput = document.createElement('input');
	waInput.type = 'tel';
	waInput.className = 'client-input';
	waInput.style.width = '100%';
	waInput.style.marginBottom = '12px';
	waInput.placeholder = 'Ej: 3001234567';

	const birthLabel = document.createElement('label');
	birthLabel.textContent = 'Fecha de Nacimiento:';
	birthLabel.style.display = 'block';
	birthLabel.style.fontSize = '0.9rem';
	birthLabel.style.marginBottom = '4px';

	const birthInput = document.createElement('input');
	birthInput.type = 'date';
	birthInput.className = 'client-input';
	birthInput.style.width = '100%';
	birthInput.style.marginBottom = '20px';

	const saveBtn = document.createElement('button');
	saveBtn.className = 'press-btn btn-primary';
	saveBtn.textContent = 'Guardar';
	saveBtn.style.width = '100%';

	pop.append(title, nameLabel, nameInput, shortNameLabel, shortNameInput, waLabel, waInput, birthLabel, birthInput, saveBtn);

	let left = clientX;
	let top = clientY;
	pop.style.left = left + 'px';
	pop.style.top = top + 'px';
	pop.style.opacity = '0';
	document.body.appendChild(pop);

	// Adjust bounds
	const rect = pop.getBoundingClientRect();
	if (rect.right > window.innerWidth) left -= (rect.right - window.innerWidth + 10);
	if (rect.bottom > window.innerHeight) top -= (rect.bottom - window.innerHeight + 10);
	pop.style.left = Math.max(10, left) + 'px';
	pop.style.top = Math.max(10, top) + 'px';

	requestAnimationFrame(() => pop.style.opacity = '1');

	saveBtn.addEventListener('click', async () => {
		const customerName = nameInput.value.trim();
		if (!customerName) {
			alert('El nombre es obligatorio.');
			return;
		}

		try {
			saveBtn.disabled = true;
			saveBtn.textContent = 'Guardando...';

			const payload = {
				seller_id: state.currentSeller.id,
				name: customerName,
				short_name: shortNameInput.value.trim(),
				whatsapp: waInput.value.trim(),
				birth_date: birthInput.value || null
			};

			await api('POST', '/api/clients', payload);
			cleanup();
			await loadClientsForSeller(); // Refresh table
		} catch (err) {
			alert('Error al guardar: ' + err.message);
			saveBtn.disabled = false;
			saveBtn.textContent = 'Guardar';
		}
	});

	function cleanup() {
		if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
		document.removeEventListener('mousedown', outside, true);
		document.removeEventListener('touchstart', outside, true);
	}

	function outside(ev) { if (!pop.contains(ev.target)) cleanup(); }
	setTimeout(() => {
		document.addEventListener('mousedown', outside, true);
		document.addEventListener('touchstart', outside, true);
	}, 0);
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
		if (!targetTr) { try { notify.info('Cliente no encontrado en esta fecha'); } catch { } return; }
		targetTr.scrollIntoView({ behavior: 'smooth', block: 'center' });
		targetTr.classList.add('row-highlight');
		setTimeout(() => targetTr.classList.remove('row-highlight'), 3200);
	} catch { }
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
		} catch { }
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
	} catch { }
	return null;
}

// Navigate to exact sale row (used for deep linking)
async function goToSaleFromDeepLink(sellerId, saleDayId, saleId) {
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
			if (!state.currentSeller) { try { notify.info('No se pudo ubicar el vendedor del movimiento'); } catch { } return; }
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
			if (!ok) { try { notify.info('Registro no encontrado en esta fecha'); } catch { } }
		} else {
			// If only date was provided, bring table into view
			document.getElementById('sales-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	} catch { }
}

(function wireClientsButton() {
	const btn = document.getElementById('clients-button');
	if (!btn) return;
	btn.addEventListener('click', async () => {
		await openClientsView();
	});
})();

(function bindBottomAdd() {
	const btn = document.getElementById('add-row-bottom');
	btn?.addEventListener('click', (ev) => {
		const rect = ev.currentTarget.getBoundingClientRect();
		openNewSalePopover(rect.left + rect.width / 2, rect.bottom + 8);
	});
})();

// Open inline upload dialog (keeps user on the sales table)
function openReceiptUploadPage(saleId) {
	try { openInlineFileUploadDialog(Number(saleId)); } catch (err) { console.error('❌ Error opening inline upload:', err); }
}

// Inline popover to upload one or more receipt images for a sale
function openInlineFileUploadDialog(saleId) {
	const id = Number(saleId);
	if (!id) { console.error('❌ openInlineFileUploadDialog: invalid saleId', saleId); return; }

	// If there are existing receipts, prefer opening gallery instead
	(async () => {
		try {
			const existing = await api('GET', `${API.Sales}?receipt_for=${encodeURIComponent(id)}`);
			if (Array.isArray(existing) && existing.length > 0) {
				openReceiptsGalleryPopover(id, window.innerWidth / 2, window.innerHeight / 2);
				return;
			}
		} catch { }

		// Ensure animations are present once
		try {
			if (!document.getElementById('upload-popover-animations')) {
				const style = document.createElement('style');
				style.id = 'upload-popover-animations';
				style.textContent = `
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
@keyframes dialogFadeIn { from { opacity: 0; transform: translateY(-16px); } to { opacity: 1; transform: translateY(0); } }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes successPop { 0% { transform: scale(0); } 60% { transform: scale(1.12); } 100% { transform: scale(1); } }
`;
				document.head.appendChild(style);
			}
		} catch { }

		const overlay = document.createElement('div');
		overlay.style.position = 'fixed';
		overlay.style.inset = '0';
		overlay.style.background = 'rgba(17, 24, 39, 0.55)';
		overlay.style.backdropFilter = 'blur(6px)';
		overlay.style.display = 'flex';
		overlay.style.alignItems = 'center';
		overlay.style.justifyContent = 'center';
		overlay.style.zIndex = '9999';
		overlay.style.animation = 'fadeIn 180ms ease-out';

		const dialog = document.createElement('div');
		dialog.style.width = 'min(92vw, 560px)';
		dialog.style.maxHeight = '86vh';
		dialog.style.overflow = 'auto';
		dialog.style.background = '#fff';
		dialog.style.borderRadius = '14px';
		dialog.style.boxShadow = '0 12px 40px rgba(0,0,0,0.25)';
		dialog.style.padding = '18px 16px 14px';
		dialog.style.animation = 'dialogFadeIn 160ms ease-out';

		const title = document.createElement('div');
		title.textContent = 'Subir comprobante';
		title.style.fontSize = '20px';
		title.style.fontWeight = '700';
		title.style.letterSpacing = '0.2px';
		title.style.textAlign = 'center';
		title.style.marginBottom = '10px';
		title.style.color = '#d66686';

		const fileInputWrapper = document.createElement('div');
		fileInputWrapper.style.border = 'none'; // remove dashed border
		fileInputWrapper.style.borderRadius = '12px';
		fileInputWrapper.style.padding = '8px 0 0';
		fileInputWrapper.style.textAlign = 'center';
		fileInputWrapper.style.background = '#fff';
		fileInputWrapper.style.cursor = 'pointer';

		const fileInput = document.createElement('input');
		fileInput.type = 'file';
		fileInput.accept = 'image/*';
		fileInput.multiple = true;
		fileInput.style.display = 'none';
		const fileLabel = document.createElement('button');
		fileLabel.type = 'button';
		fileLabel.textContent = '📷 Escoger archivos';
		fileLabel.className = 'press-btn btn-primary';
		fileLabel.style.minWidth = '260px';
		fileLabel.style.padding = '14px 22px';
		fileLabel.style.fontSize = '16px';
		fileLabel.style.borderRadius = '12px';
		fileLabel.addEventListener('click', () => fileInput.click());
		fileInputWrapper.addEventListener('click', (e) => { if (e.target === fileInputWrapper) fileInput.click(); });

		fileInputWrapper.appendChild(fileLabel);

		const helpText = document.createElement('div');
		helpText.textContent = 'JPG, PNG o HEIC. Puedes seleccionar varios.';
		helpText.style.fontSize = '12px';
		helpText.style.opacity = '0.7';
		helpText.style.marginTop = '8px';
		helpText.style.textAlign = 'center';

		const previewContainer = document.createElement('div');
		previewContainer.style.marginTop = '12px';
		const previewTitle = document.createElement('div');
		previewTitle.textContent = 'Vista previa';
		previewTitle.style.fontWeight = '600';
		previewTitle.style.fontSize = '12px';
		previewTitle.style.opacity = '0.8';
		previewTitle.style.margin = '4px 0 6px';
		const previewGrid = document.createElement('div');
		previewGrid.style.display = 'grid';
		previewGrid.style.gridTemplateColumns = 'repeat(3, 1fr)';
		previewGrid.style.gap = '8px';

		const noteInputWrapper = document.createElement('div');
		noteInputWrapper.style.position = 'relative';
		noteInputWrapper.style.marginTop = '10px';
		const noteInput = document.createElement('textarea');
		noteInput.rows = 3;
		noteInput.style.width = '100%';
		noteInput.style.border = '2px solid #f4a6b7';
		noteInput.style.borderRadius = '12px';
		noteInput.style.padding = '14px 12px';
		noteInput.style.fontSize = '14px';
		noteInput.style.resize = 'vertical';
		noteInput.style.textAlign = 'center';
		noteInput.style.background = '#fff7fa';
		const notePlaceholder = document.createElement('div');
		notePlaceholder.textContent = 'Notas';
		notePlaceholder.style.position = 'absolute';
		notePlaceholder.style.left = '0';
		notePlaceholder.style.right = '0';
		notePlaceholder.style.top = '10px';
		notePlaceholder.style.textAlign = 'center';
		notePlaceholder.style.color = '#6b7280'; // darker for readability
		notePlaceholder.style.fontWeight = '600';
		notePlaceholder.style.background = 'transparent';
		notePlaceholder.style.pointerEvents = 'none';
		notePlaceholder.style.transition = 'opacity 140ms ease';
		noteInput.addEventListener('focus', () => { notePlaceholder.style.opacity = '0'; });
		noteInput.addEventListener('blur', () => { if (!noteInput.value.trim()) notePlaceholder.style.opacity = '1'; });
		noteInputWrapper.appendChild(noteInput);
		noteInputWrapper.appendChild(notePlaceholder);

		const actions = document.createElement('div');
		actions.style.display = 'flex';
		actions.style.gap = '8px';
		actions.style.justifyContent = 'center';
		actions.style.marginTop = '12px';
		const cancelBtn = document.createElement('button');
		cancelBtn.type = 'button';
		cancelBtn.textContent = 'Cancelar';
		cancelBtn.className = 'press-btn';
		const uploadMoreBtn = document.createElement('button');
		uploadMoreBtn.type = 'button';
		uploadMoreBtn.textContent = '➕ Subir más';
		uploadMoreBtn.className = 'press-btn';
		const uploadBtn = document.createElement('button');
		uploadBtn.type = 'button';
		uploadBtn.textContent = '✓ Subir 0 archivos';
		uploadBtn.className = 'press-btn btn-primary';

		actions.append(cancelBtn, uploadMoreBtn, uploadBtn);

		// extra spacing around notes
		dialog.append(title, fileInputWrapper, helpText, previewContainer);
		const spacer = document.createElement('div');
		spacer.style.height = '10px';
		dialog.append(spacer, noteInputWrapper, actions);
		previewContainer.append(previewTitle, previewGrid);
		overlay.appendChild(dialog);
		// Hidden input lives on overlay to keep outside layout clean
		overlay.appendChild(fileInput);
		document.body.appendChild(overlay);

		let selectedFiles = [];
		let isAddingMore = false;

		function updateUploadButton() {
			const n = selectedFiles.length;
			uploadBtn.textContent = `✓ Subir ${n} archivo${n === 1 ? '' : 's'}`;
			uploadBtn.disabled = n === 0;
		}

		function renderPreviews() {
			previewGrid.innerHTML = '';
			if (!selectedFiles.length) return;
			selectedFiles.forEach((file, index) => {
				const cont = document.createElement('div');
				cont.style.position = 'relative';
				cont.style.border = '1px solid #e5e7eb';
				cont.style.borderRadius = '8px';
				cont.style.overflow = 'hidden';
				cont.style.aspectRatio = '1';
				const img = document.createElement('img');
				img.style.width = '100%';
				img.style.height = '100%';
				img.style.objectFit = 'cover';
				const reader = new FileReader();
				reader.onload = (e) => { img.src = e.target.result; };
				reader.readAsDataURL(file);
				// Toggle fullscreen preview on click
				img.style.cursor = 'zoom-in';
				img.addEventListener('click', (e) => {
					e.stopPropagation();
					const lightbox = document.createElement('div');
					lightbox.className = 'image-lightbox';
					lightbox.style.position = 'fixed';
					lightbox.style.inset = '0';
					lightbox.style.background = 'rgba(0,0,0,0.9)';
					lightbox.style.zIndex = '10000';
					lightbox.style.display = 'flex';
					lightbox.style.alignItems = 'center';
					lightbox.style.justifyContent = 'center';
					lightbox.style.cursor = 'zoom-out';
					const full = document.createElement('img');
					full.src = img.src;
					full.style.maxWidth = '95%';
					full.style.maxHeight = '95%';
					full.style.objectFit = 'contain';
					lightbox.appendChild(full);
					const close = () => { if (lightbox.parentNode) lightbox.parentNode.removeChild(lightbox); };
					lightbox.addEventListener('click', (ev) => { ev.stopPropagation(); close(); });
					lightbox.addEventListener('mousedown', (ev) => ev.stopPropagation());
					document.body.appendChild(lightbox);
				});
				const x = document.createElement('button');
				x.type = 'button';
				x.textContent = '✕';
				x.className = 'press-btn';
				x.style.position = 'absolute';
				x.style.top = '6px';
				x.style.right = '6px';
				x.style.padding = '2px 6px';
				x.style.fontSize = '12px';
				x.addEventListener('click', (ev) => {
					ev.stopPropagation();
					cont.style.transition = 'all 180ms ease';
					cont.style.opacity = '0';
					cont.style.transform = 'scale(0.9)';
					setTimeout(() => {
						selectedFiles.splice(index, 1);
						renderPreviews();
						updateUploadButton();
					}, 190);
				});
				cont.append(img, x);
				previewGrid.appendChild(cont);
			});
		}

		fileInput.addEventListener('change', () => {
			const files = Array.from(fileInput.files || []);
			if (isAddingMore) {
				selectedFiles = selectedFiles.concat(files);
				isAddingMore = false;
			} else {
				selectedFiles = files;
			}
			renderPreviews();
			updateUploadButton();
		});

		uploadMoreBtn.addEventListener('click', () => { isAddingMore = true; fileInput.click(); });
		cancelBtn.addEventListener('click', () => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); });

		function buildFullLoadingOverlay() {
			const full = document.createElement('div');
			full.style.position = 'fixed';
			full.style.inset = '0';
			full.style.background = 'rgba(17,24,39,0.45)';
			full.style.backdropFilter = 'blur(4px)';
			full.style.display = 'flex';
			full.style.alignItems = 'center';
			full.style.justifyContent = 'center';
			full.style.zIndex = '10000';
			full.style.animation = 'fadeIn 180ms ease-out';
			const card = document.createElement('div');
			card.style.background = '#fff';
			card.style.borderRadius = '14px';
			card.style.padding = '20px 18px';
			card.style.minWidth = '260px';
			card.style.textAlign = 'center';
			const spinner = document.createElement('div');
			spinner.style.width = '28px';
			spinner.style.height = '28px';
			spinner.style.border = '3px solid #f4a6b7';
			spinner.style.borderTopColor = '#fff';
			spinner.style.borderRadius = '50%';
			spinner.style.margin = '0 auto 10px';
			spinner.style.animation = 'spin 900ms linear infinite';
			const ok = document.createElement('div');
			ok.textContent = '✓';
			ok.style.display = 'none';
			ok.style.fontSize = '20px';
			ok.style.color = '#16a34a';
			const t = document.createElement('div');
			t.textContent = 'Subiendo archivos...';
			t.style.marginTop = '4px';
			const sub = document.createElement('div');
			sub.style.fontSize = '12px';
			sub.style.opacity = '0.7';
			sub.style.marginTop = '2px';
			sub.textContent = '0 de 0';
			card.append(spinner, ok, t, sub);
			full.appendChild(card);
			return { full, spinner, ok, t, sub };
		}

		async function readAsDataUrl(file) {
			return new Promise((resolve, reject) => {
				const fr = new FileReader();
				fr.onload = () => resolve(fr.result);
				fr.onerror = (e) => reject(e);
				fr.readAsDataURL(file);
			});
		}

		uploadBtn.addEventListener('click', async () => {
			if (!selectedFiles.length) return;
			const note = (noteInput.value || '').trim();
			// Close dialog
			if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
			const { full, spinner, ok, sub } = buildFullLoadingOverlay();
			document.body.appendChild(full);
			let success = 0;
			for (let i = 0; i < selectedFiles.length; i++) {
				const f = selectedFiles[i];
				sub.textContent = `${i + 1} de ${selectedFiles.length}`;
				try {
					const dataUrl = await readAsDataUrl(f);
					const body = {
						_upload_receipt_for: id,
						image_base64: dataUrl,
						_actor_name: state.currentUser?.name || ''
					};
					if (note && i === 0) body.note_text = note;
					await api('POST', API.Sales, body);
					success++;
				} catch (err) {
					console.error('Error uploading file', f?.name, err);
				}
			}
			// Show success
			spinner.style.display = 'none';
			ok.style.display = '';
			ok.style.animation = 'successPop 220ms ease-out';
			try { notify.success(`Comprobante${success === 1 ? '' : 's'} subido${success === 1 ? '' : 's'}: ${success}`); } catch { }
			try { await loadSales(); } catch { }
			setTimeout(() => {
				full.style.animation = 'fadeOut 220ms ease-in forwards';
				setTimeout(() => { if (full.parentNode) full.parentNode.removeChild(full); }, 230);
			}, 900);
		});

		updateUploadButton();
	})();
}

// Gallery viewer for multiple receipts with independent payment selectors
async function openReceiptsGalleryPopover(saleId, anchorX, anchorY) {
	let receipts = [];
	try {
		receipts = await api('GET', `${API.Sales}?receipt_for=${encodeURIComponent(saleId)}`);
		console.log('📸 Receipts loaded from backend:', receipts.map(r => ({ id: r.id, pay_method: r.pay_method, payment_source: r.payment_source, payment_date: r.payment_date })));
	} catch (err) {
		console.error('Error loading receipts:', err);
		// If error loading, open inline upload
		openInlineFileUploadDialog(saleId);
		return;
	}

	if (!Array.isArray(receipts) || receipts.length === 0) {
		// No receipts yet, open inline upload
		openInlineFileUploadDialog(saleId);
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

		// Permissions: admin or superadmin can edit receipts (methods/date/source/delete)
		const canEditReceipts = !!state.currentUser?.isAdmin || state.currentUser?.role === 'superadmin' || !!state.currentUser?.isSuperAdmin;

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

			// Payment selector overlay (only for admin/superadmin)
			if (canEditReceipts) {
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
						// Don't intercept if focus is actually in an input/textarea
						if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
						
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

			// Delete button (only for admin/superadmin)
			if (canEditReceipts) {
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
			}

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
			setTimeout(() => openInlineFileUploadDialog(saleId), 0);
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
		// Fallback to inline upload
		openInlineFileUploadDialog(saleId);
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
		} catch { }
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
	bindActiveTableSearch();
	updateToolbarOffset();
	try { const saved = localStorage.getItem('authUser'); if (saved) state.currentUser = JSON.parse(saved); } catch { }
	// Backfill role fields if missing from older sessions
	if (state.currentUser && !state.currentUser.role) {
		const name = state.currentUser.name;
		state.currentUser.role = getRole(name);
		state.currentUser.isSuperAdmin = isSuperAdmin(name);
		state.currentUser.isAdmin = isAdmin(name);
		state.currentUser.features = Array.isArray(state.currentUser.features) ? state.currentUser.features : [];
		try { localStorage.setItem('authUser', JSON.stringify(state.currentUser)); } catch { }
	}
	try { await loadSellers(); } catch { /* Ignorar error de red para no bloquear el login */ }
	let __handledPendingFocus = false;
	// Handle deep link focus coming from Transfers (pendingFocus in localStorage)
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
						const d = (days || []).find(x => String(x.day).slice(0, 10) === String(dayIso).slice(0, 10));
						if (d) state.selectedDayId = d.id;
					} catch { }
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
	} catch { }

	// Handle Embedded Store Auth Bypass
	let __handledEmbedded = false;
	if (window.location.search.includes('embed=true')) {
		try {
			const storeUserStr = localStorage.getItem('storeAuthUser');
			const storeSellerStr = localStorage.getItem('storeActiveSeller');
			if (storeUserStr && storeSellerStr) {
				state.currentUser = JSON.parse(storeUserStr);
				const activeSeller = JSON.parse(storeSellerStr);

				await loadSellers(); // Ensure sellers are fully loaded before entering

				__handledEmbedded = true;
				await enterSeller(activeSeller.id);

				// Auto-select the latest day and show sales table immediately
				const urlParams = new URLSearchParams(window.location.search);
				if (urlParams.get('view') === 'clients') {
					await openClientsView();
				} else if (state.saleDays && state.saleDays.length > 0) {
					const latest = [...state.saleDays].sort((a, b) => new Date(b.day) - new Date(a.day))[0];
					if (latest) {
						state.selectedDayId = latest.id;
						document.getElementById('sales-wrapper')?.classList.remove('hidden');
						switchView('#view-sales');
						await loadSales();
					}
				}
			}
		} catch (err) {
			console.error('Embedded auth bypass failed', err);
		}
	}

	// Route initial view (skip if we just navigated from Transfers or Embedded)
	if (!__handledPendingFocus && !__handledEmbedded) {
		if (!state.currentUser) {
			switchView('#view-login');
		} else if (state.currentUser.isAdmin) {
			const urlParams = new URLSearchParams(window.location.search);
			const linkSeller = urlParams.get('seller');
			const linkDate = urlParams.get('date');
			if (linkSeller && linkDate) {
				const targetSeller = (state.sellers || []).find(s => s.name.toLowerCase() === linkSeller.toLowerCase());
				if (targetSeller) {
					enterSeller(targetSeller.id).then(async () => {
						let matchingDay = (state.saleDays || []).find(d => String(d.day).startsWith(linkDate));
						
						if (!matchingDay) {
							// Check if it's an archived day
							try {
								const archivedDays = await api('GET', `/api/days?seller_id=${targetSeller.id}&archived=1`);
								matchingDay = archivedDays.find(d => String(d.day).startsWith(linkDate));
								if (matchingDay) {
									state.showArchivedOnly = true;
									await loadDaysForSeller(); // refresh the sidebar UI to show archived queue
									matchingDay = (state.saleDays || []).find(d => String(d.day).startsWith(linkDate)) || matchingDay;
								}
							} catch (e) { console.error('Fallback archive error:', e); }
                        }

						if (matchingDay) {
							state.selectedDayId = matchingDay.id;
							switchView('#view-sales');
							document.getElementById('sales-wrapper')?.classList.remove('hidden');
							loadSales();
						}
					});
				} else {
					switchView('#view-select-seller');
				}
			} else {
				switchView('#view-select-seller');
			}
		} else {
			const me = (state.sellers || []).find(s => String(s.name).toLowerCase() === String(state.currentUser.name || '').toLowerCase());
			if (me) enterSeller(me.id); else switchView('#view-select-seller');
		}
	}
	window.addEventListener('resize', debounce(updateSummary, 150));

	// 🔄 Message listener for parent-to-iframe communication (e.g. from store.html)
	window.addEventListener('message', async (event) => {
		if (event.data === 'refreshSales' && typeof loadSales === 'function') {
			console.log('[Iframe] Refresh request received from parent.');
			await loadSales();
		}
	});
})();

(function enforceDesktopHeaderHorizontal() {
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
	const isAdminUser = !!state.currentUser?.isAdmin || state.currentUser?.role === 'superadmin';
	if (!isAdminUser) return;
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
			const sorted = arr.sort((a, b) => new Date(a.created_at || a.time) - new Date(b.created_at || b.time));
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
	const isAdminUser = !!state.currentUser?.isAdmin || state.currentUser?.role === 'superadmin';
	if (!isAdminUser) return;
	const ids = (state.sales || []).map(s => s.id);
	Promise.all(ids.map(id => fetchLogsForSale(id).then(rows => [id, rows])))
		.then(pairs => {
			const map = {};
			for (const [id, rows] of pairs) map[id] = rows;
			state.changeLogsBySale = map;
			clearAllMarkers();
			addMarkersFromLogs();
		}).catch(() => { });
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
				item.textContent = `[${when.toLocaleDateString()}] Pago: ${fmt(oldV)} → ${fmt(newV)}`;
			} else if (label) {
				item.textContent = `[${when.toLocaleDateString()}] ${label}: ${oldV} → ${newV}`;
			} else {
				item.textContent = `[${when.toLocaleDateString()}] ${oldV} → ${newV}`;
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
	const isAdminUser = !!state.currentUser?.isAdmin || state.currentUser?.role === 'superadmin';
	if (!isAdminUser) return;
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
// ==================== NOTIFICATION CENTER ====================
const NotificationCenter = {
	modal: null,
	body: null,
	btn: null,

	init() {
		this.modal = document.getElementById('notification-center-modal');
		this.body = document.getElementById('notif-center-body');
		this.btn = document.getElementById('notification-center-btn');
		const closeBtn = document.getElementById('notif-center-close');

		if (!this.modal || !this.body || !this.btn || !closeBtn) return;

		// Show button only for superadmin
		this.updateButtonVisibility();

		// Event listeners
		this.btn.addEventListener('click', () => this.open());
		closeBtn.addEventListener('click', () => this.close());

		// Click backdrop to close
		const backdrop = this.modal.querySelector('.notif-center-backdrop');
		if (backdrop) {
			backdrop.addEventListener('click', () => this.close());
		}

		// Prevent closing when clicking inside panel
		const panel = this.modal.querySelector('.notif-center-panel');
		if (panel) {
			panel.addEventListener('click', (e) => e.stopPropagation());
		}
	},

	updateButtonVisibility() {
		if (!this.btn) return;
		const isSuper = state.currentUser?.role === 'superadmin' || !!state.currentUser?.isSuperAdmin;
		this.btn.style.display = isSuper ? 'inline-flex' : 'none';
	},

	async open() {
		if (!this.modal) return;
		this.modal.classList.remove('hidden');

		// Show loading state
		this.body.innerHTML = '<div class="notif-center-loading">Cargando notificaciones...</div>';

		try {
			// Fetch notifications FIRST (before updating last visit timestamp)
			const notifications = await this.fetchNotifications();

			// Render notifications
			this.render(notifications);

			// Update last visit timestamp AFTER showing notifications
			// This ensures we don't miss any notifications
			await this.updateLastVisit();
		} catch (err) {
			console.error('Error loading notifications:', err);
			const errorMsg = err.message || 'Error desconocido';
			this.body.innerHTML = `
				<div class="notif-center-loading">
					<div>Error al cargar notificaciones</div>
					<div style="font-size: 11px; color: var(--muted); margin-top: 8px;">${errorMsg}</div>
					<div style="font-size: 11px; color: var(--muted); margin-top: 4px;">Revisa la consola para más detalles</div>
				</div>
			`;
		}
	},

	close() {
		if (!this.modal) return;
		this.modal.classList.add('hidden');
	},

	async updateLastVisit() {
		const actor = encodeURIComponent(state.currentUser?.name || '');
		if (!actor) return;

		try {
			await fetch(`/api/notifications?actor=${actor}`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Actor-Name': state.currentUser?.name || ''
				},
				body: JSON.stringify({ action: 'visit' })
			});
		} catch (err) {
			console.error('Error updating last visit:', err);
		}
	},

	async fetchNotifications() {
		const actor = encodeURIComponent(state.currentUser?.name || '');
		if (!actor) return [];

		try {
			const response = await fetch(`/api/notifications?actor=${actor}`, {
				headers: { 'X-Actor-Name': state.currentUser?.name || '' }
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error('Error response:', response.status, errorText);
				throw new Error(`Failed to fetch notifications: ${response.status}`);
			}

			const data = await response.json();
			console.log('📬 Notificaciones recibidas:', data.length, data);
			return data;
		} catch (error) {
			console.error('Error in fetchNotifications:', error);
			throw error;
		}
	},

	render(notifications) {
		if (!this.body) return;

		if (!notifications || notifications.length === 0) {
			this.body.innerHTML = `
				<div class="notif-empty">
					<div class="notif-empty-icon">🔔</div>
					<div>No hay notificaciones nuevas</div>
				</div>
			`;
			return;
		}

		this.body.innerHTML = '';

		for (const notif of notifications) {
			const item = this.createNotificationItem(notif);
			this.body.appendChild(item);
		}
	},

	createNotificationItem(notif) {
		const item = document.createElement('div');
		item.className = 'notif-item';
		item.dataset.id = notif.id;

		// Checkbox
		const checkbox = document.createElement('input');
		checkbox.type = 'checkbox';
		checkbox.className = 'notif-checkbox';
		checkbox.checked = notif.is_checked || false;
		checkbox.addEventListener('change', () => this.toggleCheck(notif.id, checkbox.checked));

		// Content
		const content = document.createElement('div');
		content.className = 'notif-content';

		// Línea 1: Cliente y pedido
		const message = document.createElement('div');
		message.className = 'notif-message';
		message.textContent = notif.message || 'Sin mensaje';

		// Línea 2: Tipo de notificación
		const typeLabel = document.createElement('div');
		typeLabel.className = 'notif-type';
		const typeText = this.getNotificationType(notif.type);
		typeLabel.innerHTML = typeText; // Usar innerHTML para permitir el span con color

		// Línea 3: Meta info (date, seller, icon)
		const meta = document.createElement('div');
		meta.className = 'notif-meta';

		const date = new Date(notif.created_at);
		const dateStr = date.toLocaleString('es-CO', {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		});

		meta.textContent = dateStr;

		if (notif.seller_name) {
			meta.textContent += ` • ${notif.seller_name}`;
		}

		// Icon if available
		if (notif.icon_url) {
			const icon = document.createElement('img');
			icon.className = 'notif-icon';
			icon.src = notif.icon_url;
			icon.alt = 'Icon';
			meta.appendChild(icon);
		}

		content.appendChild(message);
		content.appendChild(typeLabel);
		content.appendChild(meta);

		// Delete button
		const deleteBtn = document.createElement('button');
		deleteBtn.className = 'notif-delete-btn';
		deleteBtn.title = 'Eliminar notificación';
		deleteBtn.addEventListener('click', () => this.deleteNotification(notif.id));

		item.appendChild(checkbox);
		item.appendChild(content);
		item.appendChild(deleteBtn);

		return item;
	},

	getNotificationType(type) {
		const types = {
			'create': '✨ Nuevo pedido',
			'qty': '📝 Modificación',
			'delete': '<span style="color: #ef4444; font-weight: 700;">🗑 Pedido eliminado</span>',
			'pay': '💳 Cambio de estatus',
			'comment': '💬 Comentario'
		};
		return types[type] || 'Notificación';
	},

	formatSaleDetails(notif) {
		const details = notif.sale_details;
		if (!details) return '';

		const parts = [];
		if (details.client_name) parts.push(`Cliente: ${details.client_name}`);

		const desserts = [];
		if (details.qty_arco > 0) desserts.push(`Arco: ${details.qty_arco}`);
		if (details.qty_melo > 0) desserts.push(`Melo: ${details.qty_melo}`);
		if (details.qty_mara > 0) desserts.push(`Mara: ${details.qty_mara}`);
		if (details.qty_oreo > 0) desserts.push(`Oreo: ${details.qty_oreo}`);
		if (details.qty_nute > 0) desserts.push(`Nute: ${details.qty_nute}`);

		if (desserts.length > 0) {
			parts.push(desserts.join(', '));
		}

		return parts.join(' • ');
	},

	async toggleCheck(notificationId, checked) {
		const actor = encodeURIComponent(state.currentUser?.name || '');
		if (!actor) return;

		try {
			await fetch(`/api/notifications?actor=${actor}`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Actor-Name': state.currentUser?.name || ''
				},
				body: JSON.stringify({
					action: 'toggle_check',
					notification_id: notificationId
				})
			});
		} catch (err) {
			console.error('Error toggling check:', err);
			// Revert checkbox state on error
			const checkbox = this.body.querySelector(`[data-id="${notificationId}"] .notif-checkbox`);
			if (checkbox) checkbox.checked = !checked;
		}
	},

	async deleteNotification(notificationId) {
		const actor = encodeURIComponent(state.currentUser?.name || '');
		if (!actor) return;

		try {
			await fetch(`/api/notifications?id=${notificationId}&actor=${actor}`, {
				method: 'DELETE',
				headers: { 'X-Actor-Name': state.currentUser?.name || '' }
			});

			// Remove from UI
			const item = this.body.querySelector(`[data-id="${notificationId}"]`);
			if (item) {
				item.style.opacity = '0';
				item.style.transform = 'translateX(-20px)';
				item.style.transition = 'all 0.3s ease';
				setTimeout(() => item.remove(), 300);
			}

			// Check if empty
			setTimeout(() => {
				const remaining = this.body.querySelectorAll('.notif-item');
				if (remaining.length === 0) {
					this.body.innerHTML = `
						<div class="notif-empty">
							<div class="notif-empty-icon">🔔</div>
							<div>No hay notificaciones nuevas</div>
						</div>
					`;
				}
			}, 350);
		} catch (err) {
			console.error('Error deleting notification:', err);
		}
	}
};

// ==========================================
// Active Day Table Client Search
// ==========================================
function bindActiveTableSearch() {
	const searchInput = document.getElementById('active-table-client-search');
	const pop = document.getElementById('active-table-client-suggestions');
	if (!searchInput || !pop) return;

	let blurTimeout;

	function renderSuggestions(query) {
		pop.innerHTML = '';
		if (!query) {
			pop.style.display = 'none';
			return;
		}

		const lowerQ = query.toLowerCase();

		// Get unique clients from CURRENT table sales only
		const uniqueClients = [...new Set((state.sales || []).map(s => (s.client_name || '').trim()).filter(Boolean))];

		// Filter by query
		const matches = uniqueClients.filter(c => c.toLowerCase().includes(lowerQ));

		if (matches.length === 0) {
			pop.style.display = 'none';
			return;
		}

		for (const m of matches) {
			const li = document.createElement('li');
			li.style.padding = '10px 16px';
			li.style.cursor = 'pointer';
			li.style.borderBottom = '1px solid var(--border)';
			li.style.background = 'var(--surface)';
			li.style.color = 'var(--text)';
			li.textContent = m;

			li.addEventListener('mouseenter', () => li.style.background = 'rgba(0,0,0,0.05)');
			li.addEventListener('mouseleave', () => li.style.background = 'var(--surface)');

			li.addEventListener('mousedown', (e) => {
				e.preventDefault(); // Prevent input blur
				searchInput.value = '';
				pop.style.display = 'none';

				// Find first matching sale in the table
				const sale = state.sales.find(s => (s.client_name || '').trim().toLowerCase() === m.toLowerCase());
				if (sale) {
					const tr = document.querySelector(`#sales-tbody tr[data-id="${sale.id}"]`);
					if (tr) {
						tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
						// Remove any existing highlight first
						tr.classList.remove('row-highlight');
						// Force reflow
						void tr.offsetWidth;
						// Add animation class
						tr.classList.add('row-highlight');

						// Clean up animation class after it finishes (2.5s defined in css)
						setTimeout(() => tr.classList.remove('row-highlight'), 3000);
					}
				}
			});
			pop.appendChild(li);
		}
		pop.style.display = 'block';
	}

	searchInput.addEventListener('input', () => {
		renderSuggestions(searchInput.value);
		// Also filter the table in real-time
		renderTable();
	});

	searchInput.addEventListener('focus', () => {
		clearTimeout(blurTimeout);
		if (searchInput.value.trim()) renderSuggestions(searchInput.value.trim());
	});

	searchInput.addEventListener('blur', () => {
		blurTimeout = setTimeout(() => {
			pop.style.display = 'none';
		}, 150);
	});
}

// Initialize notification center when DOM is ready
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', () => {
		if (typeof NotificationCenter !== 'undefined') {
			NotificationCenter.init();
		}
	});
} else {
	if (typeof NotificationCenter !== 'undefined') {
		NotificationCenter.init();
	}
}

/**
 * Renders tag filter chips based on available tags in the provided sales data
 */
function renderTagFilters(sales, containerId, onFilterChange) {
	const container = document.getElementById(containerId);
	if (!container) return;

	// Extract unique tags from the provided sales data
	const allTags = [];
	const seenKeys = new Set();
	
	(sales || []).forEach(s => {
		(s.client_tags || []).forEach(t => {
			const key = t.id || t.name; // Use ID or name as key
			if (!seenKeys.has(key)) {
				seenKeys.add(key);
				allTags.push(t);
			}
		});
	});

	// If no tags, clear and hide
	if (allTags.length === 0) {
		container.innerHTML = '';
		return;
	}

	// Sort tags alphabetically
	allTags.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'));

	// Render
	container.innerHTML = '';
	allTags.forEach(tag => {
		const tagKey = tag.id || tag.name; // Use ID or name as key consistently
		const chip = document.createElement('div');
		chip.className = 'tag-filter-chip';
		const isActive = state.currentTagIdFilter === tagKey;
		if (isActive) chip.classList.add('active');
		
		const tagColor = tag.color || '#818cf8';
		chip.style.borderColor = tagColor;
		
		if (isActive) {
			chip.style.backgroundColor = tagColor;
			chip.style.color = '#fff';
		} else {
			chip.style.color = tagColor;
			chip.style.backgroundColor = 'transparent';
		}

		chip.textContent = tag.name;
		chip.addEventListener('click', () => {
			if (state.currentTagIdFilter === tagKey) {
				state.currentTagIdFilter = null;
			} else {
				state.currentTagIdFilter = tagKey;
			}
			onFilterChange();
		});
		container.appendChild(chip);
	});
}

