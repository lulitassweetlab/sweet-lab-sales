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
};

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
}

function renderSellerButtons() {
	const list = $('#seller-list');
	list.innerHTML = '';
	for (const s of state.sellers) {
		const btn = el('button', { class: 'seller-button', onclick: async () => { await enterSeller(s.id); } }, s.name);
		list.appendChild(btn);
	}
}

async function addSeller(name) {
	const seller = await api('POST', API.Sellers, { name });
	state.sellers.push(seller);
	renderSellerButtons();
}

async function enterSeller(id) {
	const seller = state.sellers.find(s => s.id === id);
	if (!seller) return;
	state.currentSeller = seller;
	state.saleDays = [];
	state.selectedDayId = null;
	$('#current-seller').textContent = seller.name;
	switchView('#view-sales');
	// Show dates section, hide table until click
	const datesSection = document.getElementById('dates-section');
	const datesList = document.querySelector('#dates-section .dates-list');
	const salesWrapper = document.getElementById('sales-wrapper');
	if (datesSection) datesSection.classList.remove('hidden');
	if (salesWrapper) salesWrapper.classList.add('hidden');
	// Ensure the date button exists
	let dateBtn = document.getElementById('date-static');
	if (!dateBtn && datesList) {
		dateBtn = document.createElement('button');
		dateBtn.id = 'date-static';
		dateBtn.className = 'date-button';
		dateBtn.textContent = 'Viernes, Agosto 29';
		datesList.appendChild(dateBtn);
	}
	// Bind click to reveal table
	dateBtn?.addEventListener('click', () => {
		salesWrapper?.classList.remove('hidden');
	});
	await loadSales();
}

function switchView(id) {
	document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
	$(id).classList.remove('hidden');
}

function calcRowTotal(q) {
	const arco = Number(q.arco || 0);
	const melo = Number(q.melo || 0);
	const mara = Number(q.mara || 0);
	const oreo = Number(q.oreo || 0);
	return arco * PRICES.arco + melo * PRICES.melo + mara * PRICES.mara + oreo * PRICES.oreo;
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
					wrap.classList.remove('placeholder','method-efectivo','method-transf');
					if (!sel.value) wrap.classList.add('placeholder');
					else if (sel.value === 'efectivo') wrap.classList.add('method-efectivo');
					else if (sel.value === 'transf') wrap.classList.add('method-transf');
				}
				applyPayClass();
				sel.addEventListener('change', async () => {
					await savePayMethod(tr, sale.id, sel.value);
					applyPayClass();
				});
				wrap.addEventListener('click', (e) => { e.stopPropagation(); openPayMenu(wrap, sel); });
				wrap.tabIndex = 0;
				wrap.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPayMenu(wrap, sel); } });
				wrap.appendChild(sel);
				return wrap;
			})()),
			el('td', { class: 'col-client' }, el('input', {
				class: 'input-cell client-input',
				value: sale.client_name || '',
				placeholder: '',
				oninput: debounce(() => saveRow(tr, sale.id), 400),
			})),
			el('td', { class: 'col-arco' }, el('input', { class: 'input-cell input-qty', type: 'number', min: '0', step: '1', inputmode: 'numeric', value: sale.qty_arco ? String(sale.qty_arco) : '', placeholder: '', oninput: debounce(() => saveRow(tr, sale.id), 400) })),
			el('td', { class: 'col-melo' }, el('input', { class: 'input-cell input-qty', type: 'number', min: '0', step: '1', inputmode: 'numeric', value: sale.qty_melo ? String(sale.qty_melo) : '', placeholder: '', oninput: debounce(() => saveRow(tr, sale.id), 400) })),
			el('td', { class: 'col-mara' }, el('input', { class: 'input-cell input-qty', type: 'number', min: '0', step: '1', inputmode: 'numeric', value: sale.qty_mara ? String(sale.qty_mara) : '', placeholder: '', oninput: debounce(() => saveRow(tr, sale.id), 400) })),
			el('td', { class: 'col-oreo' }, el('input', { class: 'input-cell input-qty', type: 'number', min: '0', step: '1', inputmode: 'numeric', value: sale.qty_oreo ? String(sale.qty_oreo) : '', placeholder: '', oninput: debounce(() => saveRow(tr, sale.id), 400) })),
			el('td', { class: 'total col-total' }, fmtNo.format(total)),
			el('td', { class: 'col-actions' }, el('button', { class: 'row-delete', title: 'Eliminar', onclick: async () => { await deleteRow(sale.id); } }, '')),
		);
		tr.dataset.id = String(sale.id);
		tbody.appendChild(tr);
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
}

async function loadSales() {
	const sellerId = state.currentSeller.id;
	const params = new URLSearchParams({ seller_id: String(sellerId) });
	if (state.selectedDayId) params.set('sale_day_id', String(state.selectedDayId));
	state.sales = await api('GET', `${API.Sales}?${params.toString()}`);
	renderTable();
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
	state.sales.push(sale);
	// Push undo: delete that sale
	pushUndo({
		do: async () => {
			// redo create
			const again = await api('POST', API.Sales, payload);
			again.is_paid = false;
			state.sales.push(again);
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
	const updated = await api('PUT', API.Sales, body);
	const idx = state.sales.findIndex(s => s.id === id);
	if (idx !== -1) state.sales[idx] = updated;
	const totalCell = tr.querySelector('.total');
	const total = calcRowTotal({ arco: updated.qty_arco, melo: updated.qty_melo, mara: updated.qty_mara, oreo: updated.qty_oreo });
	totalCell.textContent = fmtNo.format(total);
	updateSummary();
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

async function deleteRow(id) {
	const prev = state.sales.find(s => s.id === id);
	await api('DELETE', `${API.Sales}?id=${encodeURIComponent(id)}`);
	state.sales = state.sales.filter(s => s.id !== id);
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
				await api('POST', API.Sales, prev); // fallback not ideal if API expects insert-only; we already removed, so better to reinsert via create+update
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
	$('#sum-total-qty').textContent = '';
	$('#sum-arco-amt').textContent = fmtNo.format(qa * PRICES.arco);
	$('#sum-melo-amt').textContent = fmtNo.format(qm * PRICES.melo);
	$('#sum-mara-amt').textContent = fmtNo.format(qma * PRICES.mara);
	$('#sum-oreo-amt').textContent = fmtNo.format(qo * PRICES.oreo);
	$('#sum-grand').textContent = fmtNo.format(grand);
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
	const header = ['$', 'Cliente', 'Arco', 'Melo', 'Mara', 'Oreo', 'Total'];
	const data = [header];
	const tbody = document.getElementById('sales-tbody');
	if (tbody) {
		for (const tr of Array.from(tbody.rows)) {
			const paid = tr.querySelector('td.col-paid input[type="checkbox"]').checked ? '✓' : '';
			const client = tr.querySelector('td.col-client input')?.value ?? '';
			const arco = tr.querySelector('td.col-arco input')?.value ?? '';
			const melo = tr.querySelector('td.col-melo input')?.value ?? '';
			const mara = tr.querySelector('td.col-mara input')?.value ?? '';
			const oreo = tr.querySelector('td.col-oreo input')?.value ?? '';
			const total = tr.querySelector('td.col-total')?.textContent?.trim() ?? '';
			data.push([paid, client, arco, melo, mara, oreo, total]);
		}
	}
	data.push(['', 'Totales (cant.)',
		document.getElementById('sum-arco-qty')?.textContent ?? '',
		document.getElementById('sum-melo-qty')?.textContent ?? '',
		document.getElementById('sum-mara-qty')?.textContent ?? '',
		document.getElementById('sum-oreo-qty')?.textContent ?? '',
		document.getElementById('sum-total-qty')?.textContent ?? ''
	]);
	data.push(['', 'Totales (valor)',
		document.getElementById('sum-arco-amt')?.textContent ?? '',
		document.getElementById('sum-melo-amt')?.textContent ?? '',
		document.getElementById('sum-mara-amt')?.textContent ?? '',
		document.getElementById('sum-oreo-amt')?.textContent ?? '',
		document.getElementById('sum-grand')?.textContent ?? ''
	]);

	const ws = XLSX.utils.aoa_to_sheet(data);
	// Autofit: set column widths roughly based on header text length
	ws['!cols'] = header.map(h => ({ wch: Math.max(8, h.length + 2) }));
	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, ws, 'Ventas');
	const sellerName = state.currentSeller?.name?.replace(/[^\w\-]+/g, '_') || 'ventas';
	const dateStr = new Date().toISOString().slice(0,10);
	XLSX.writeFile(wb, `${sellerName}_${dateStr}.xlsx`);
}

async function exportConsolidatedForDate(dayIso) {
	const sellers = await api('GET', API.Sellers);
	const rows = [['Vendedor', '$', 'Cliente', 'Arco', 'Melo', 'Mara', 'Oreo', 'Total']];
	for (const s of sellers) {
		const days = await api('GET', `/api/days?seller_id=${encodeURIComponent(s.id)}`);
		const day = (days || []).find(d => (String(d.day).slice(0,10) === String(dayIso).slice(0,10)));
		if (!day) continue;
		const params = new URLSearchParams({ seller_id: String(s.id), sale_day_id: String(day.id) });
		const sales = await api('GET', `${API.Sales}?${params.toString()}`);
		for (const r of (sales || [])) {
			rows.push([
				s.name || '',
				r.is_paid ? '✓' : '',
				r.client_name || '',
				r.qty_arco || 0,
				r.qty_melo || 0,
				r.qty_mara || 0,
				r.qty_oreo || 0,
				r.total_cents || 0,
			]);
		}
	}
	const ws = XLSX.utils.aoa_to_sheet(rows);
	ws['!cols'] = [ {wch:18},{wch:3},{wch:24},{wch:6},{wch:6},{wch:6},{wch:6},{wch:10} ];
	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, ws, 'Consolidado');
	const dateLabel = formatDayLabel(String(dayIso).slice(0,10)).replace(/\s+/g, '_');
	XLSX.writeFile(wb, `Consolidado_${dateLabel}.xlsx`);
}

(function wireGlobalDates(){
	const globalList = document.getElementById('global-dates-list');
	if (!globalList) return;
	// Load unique dates across sellers by querying one seller (or better: consolidate server-side). Here, we’ll show last 7 days from today.
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
	reportBtn.addEventListener('click', () => {
		// Open date picker
		input.classList.remove('hidden');
		const cleanup = () => { input.classList.add('hidden'); input.removeEventListener('change', handler); };
		const handler = async () => { const iso = input.value; cleanup(); if (iso) await exportConsolidatedForDate(iso); };
		input.addEventListener('change', handler);
		if (typeof input.showPicker === 'function') { try { input.showPicker(); return; } catch {} }
		input.focus(); input.click();
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
	// Static date button toggles table visibility
	document.getElementById('date-static')?.addEventListener('click', () => {
		document.getElementById('sales-wrapper').classList.remove('hidden');
	});
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
		del.textContent = '🗑️';
		del.addEventListener('click', async (e) => {
			e.stopPropagation();
			await api('DELETE', `/api/days?id=${encodeURIComponent(d.id)}`);
			if (state.selectedDayId === d.id) {
				state.selectedDayId = null;
				state.sales = [];
				document.getElementById('sales-wrapper').classList.add('hidden');
			}
			await loadDaysForSeller();
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
	input.style.transform = 'translate(-50%, 0)';
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
	pop.style.left = (anchorX || (window.innerWidth / 2)) + 'px';
	pop.style.top = ((anchorY || (window.innerHeight / 2)) + 8) + 'px';
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
	document.addEventListener('mousedown', outside, true);
	document.addEventListener('touchstart', outside, true);
	render();
}

function openPayMenu(anchorEl, selectEl) {
	const rect = anchorEl.getBoundingClientRect();
	const menu = document.createElement('div');
	menu.className = 'pay-menu';
	menu.style.position = 'fixed';
	menu.style.left = (rect.left + rect.width / 2) + 'px';
	menu.style.top = (rect.bottom + 6) + 'px';
	menu.style.transform = 'translateX(-50%)';
	menu.style.zIndex = '1000';
	const items = [
		{ v: 'efectivo', cls: 'menu-efectivo' },
		{ v: 'transf', cls: 'menu-transf' },
		{ v: '', cls: 'menu-clear' }
	];
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
	document.body.appendChild(menu);
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


(async function init() {
	bindEvents();
	updateToolbarOffset();
	await loadSellers();
})();