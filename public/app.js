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
			el('td', { class: 'col-paid' }, el('input', { type: 'checkbox', checked: isPaid, onchange: async (e) => { await savePaid(tr, sale.id, e.target.checked); } })),
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
			el('td', { class: 'col-actions' }, el('button', { class: 'row-delete', title: 'Eliminar', onclick: async () => { await deleteRow(sale.id); } }, 'x')),
		);
		tr.dataset.id = String(sale.id);
		tbody.appendChild(tr);
	}
	updateSummary();
	requestAnimationFrame(() => { syncStickyHeadWidths(); updateStickyHeadOffset(); });
}

async function loadSales() {
	const sellerId = state.currentSeller.id;
	const params = new URLSearchParams({ seller_id: String(sellerId) });
	if (state.selectedDayId) params.set('sale_day_id', String(state.selectedDayId));
	state.sales = await api('GET', `${API.Sales}?${params.toString()}`);
	renderTable();
}

async function addRow() {
	const sellerId = state.currentSeller.id;
	const payload = { seller_id: sellerId };
	if (state.selectedDayId) payload.sale_day_id = state.selectedDayId;
	const sale = await api('POST', API.Sales, payload);
	sale.is_paid = false;
	state.sales.push(sale);
	renderTable();
}

async function saveRow(tr, id) {
	const body = readRow(tr);
	body.id = id;
	const updated = await api('PUT', API.Sales, body);
	const idx = state.sales.findIndex(s => s.id === id);
	if (idx !== -1) state.sales[idx] = updated;
	const totalCell = tr.querySelector('.total');
	const total = calcRowTotal({ arco: updated.qty_arco, melo: updated.qty_melo, mara: updated.qty_mara, oreo: updated.qty_oreo });
	totalCell.textContent = fmtNo.format(total);
	updateSummary();
}

async function deleteRow(id) {
	await api('DELETE', `${API.Sales}?id=${encodeURIComponent(id)}`);
	state.sales = state.sales.filter(s => s.id !== id);
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

function bindEvents() {
	$('#add-seller').addEventListener('click', async () => {
		const name = $('#new-seller-name').value.trim();
		if (!name) return;
		await addSeller(name);
		$('#new-seller-name').value = '';
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

function formatDayLabel(iso) {
	const d = new Date(iso + 'T00:00:00Z');
	const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
	const weekdays = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
	return `${weekdays[d.getUTCDay()]}, ${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function renderDaysList() {
	const list = document.getElementById('dates-list');
	if (!list) return;
	list.innerHTML = '';
	// Static default date button
	const defBtn = document.createElement('button');
	defBtn.id = 'date-default';
	defBtn.className = 'date-button';
	defBtn.textContent = 'Viernes, Agosto 29';
	defBtn.addEventListener('click', selectDefaultDate);
	list.appendChild(defBtn);
	// Static new date button
	const newBtn = document.createElement('button');
	newBtn.id = 'date-new';
	newBtn.className = 'date-button';
	newBtn.textContent = 'Nueva fecha';
	newBtn.addEventListener('click', openNewDatePicker);
	list.appendChild(newBtn);
	// Append API-provided days (skip invalid)
	for (const d of (state.saleDays || [])) {
		if (!d || !d.day) continue;
		const btn = document.createElement('button');
		btn.className = 'date-button';
		btn.textContent = formatDayLabel(d.day);
		btn.addEventListener('click', async () => {
			state.selectedDayId = d.id;
			document.getElementById('sales-wrapper').classList.remove('hidden');
			await loadSales();
		});
		list.appendChild(btn);
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

function openDatePickerAndGetISO(onPicked) {
	const input = document.getElementById('new-date');
	if (!input) return;
	input.classList.remove('hidden');
	input.value = '';
	input.focus();
	const handler = async () => {
		const day = input.value;
		input.classList.add('hidden');
		input.removeEventListener('change', handler);
		if (day && typeof onPicked === 'function') onPicked(day);
	};
	input.addEventListener('change', handler);
}

async function selectDefaultDate() {
	openDatePickerAndGetISO(async (iso) => {
		const sellerId = state.currentSeller.id;
		const created = await api('POST', '/api/days', { seller_id: sellerId, day: iso });
		state.selectedDayId = created.id;
		const btn = document.getElementById('date-default');
		if (btn) btn.textContent = formatDayLabel(iso);
		document.getElementById('sales-wrapper').classList.remove('hidden');
		await loadSales();
	});
}

function openNewDatePicker() {
	openDatePickerAndGetISO(async (iso) => {
		const sellerId = state.currentSeller.id;
		const created = await api('POST', '/api/days', { seller_id: sellerId, day: iso });
		// Create a new date button
		const list = document.getElementById('dates-list');
		if (list) {
			const btn = document.createElement('button');
			btn.className = 'date-button';
			btn.textContent = formatDayLabel(iso);
			btn.addEventListener('click', async () => {
				state.selectedDayId = created.id;
				document.getElementById('sales-wrapper').classList.remove('hidden');
				await loadSales();
			});
			list.appendChild(btn);
		}
		// Select it and show table
		state.selectedDayId = created.id;
		document.getElementById('sales-wrapper').classList.remove('hidden');
		await loadSales();
	});
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

(function enhanceStaticButtons(){
	document.getElementById('date-default')?.addEventListener('click', selectDefaultDate);
	document.getElementById('date-new')?.addEventListener('click', openNewDatePicker);
})();


(async function init() {
	bindEvents();
	updateToolbarOffset();
	await loadSellers();
})();