const API = {
	Sellers: '/api/sellers',
	Sales: '/api/sales',
	Days: '/api/days'
};

const PRICES = {
	arco: 8500,
	melo: 9500,
	mara: 10500,
	oreo: 10500,
};

const fmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const fmtNo = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

const state = {
	currentSeller: null,
	sellers: [],
	saleDays: [],
	selectedDayId: null,
	sales: [],
};

function $(sel) { return document.querySelector(sel); }
function el(tag, attrs = {}, ...children) {
	const node = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) {
		if (k === 'class') node.className = v;
		else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.substring(2).toLowerCase(), v);
		else if (v !== undefined && v !== null) node.setAttribute(k, v);
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
	$('#current-seller').textContent = seller.name;
	state.saleDays = [];
	state.selectedDayId = null;
	state.sales = [];
	switchView('#view-sales');
	await loadDays();
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

async function loadDays() {
	const sellerId = state.currentSeller.id;
	state.saleDays = await api('GET', `${API.Days}?seller_id=${encodeURIComponent(sellerId)}`);
	renderDays();
	// Auto-select most recent day if exists
	if (state.saleDays.length > 0) {
		selectDay(state.saleDays[0].id);
	}
}

function formatDateButton(isoDate) {
	const d = new Date(isoDate + 'T00:00:00Z');
	const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
	const weekdays = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
	return `${months[d.getUTCMonth()]}- ${weekdays[d.getUTCDay()]} ${d.getUTCDate()}`;
}

function renderDays() {
	const list = $('#dates-list');
	list.innerHTML = '';
	for (const d of state.saleDays) {
		const label = formatDateButton(d.day);
		const btn = el('button', { class: `date-button${state.selectedDayId === d.id ? ' active' : ''}`, onclick: () => selectDay(d.id) }, label);
		list.appendChild(btn);
	}
}

function openDateModal() {
	// Populate month/day wheels
	const monthSel = $('#month-select');
	const daySel = $('#day-select');
	monthSel.innerHTML = '';
	daySel.innerHTML = '';
	const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
	months.forEach((m, i) => monthSel.appendChild(el('option', { value: String(i) }, m)));
	// Default to today
	const now = new Date();
	monthSel.value = String(now.getMonth());
	rebuildDaysWheel();
	daySel.value = String(now.getDate());
	$('#date-modal').classList.remove('hidden');
}

function closeDateModal() {
	$('#date-modal').classList.add('hidden');
}

function rebuildDaysWheel() {
	const monthSel = $('#month-select');
	const daySel = $('#day-select');
	daySel.innerHTML = '';
	const year = new Date().getFullYear();
	const month = Number(monthSel.value);
	const last = new Date(year, month + 1, 0).getDate();
	for (let d = 1; d <= last; d++) daySel.appendChild(el('option', { value: String(d) }, String(d)));
}

async function continueDateModal() {
	const monthSel = $('#month-select');
	const daySel = $('#day-select');
	const year = new Date().getFullYear();
	const month = Number(monthSel.value);
	const day = Number(daySel.value);
	const iso = new Date(Date.UTC(year, month, day)).toISOString().slice(0,10);
	closeDateModal();
	const created = await api('POST', API.Days, { seller_id: state.currentSeller.id, day: iso });
	await loadDays();
	selectDay(created.id);
}

async function addDate() {
	const sellerId = state.currentSeller.id;
	let day = $('#new-date').value;
	if (!day) {
		const now = new Date();
		day = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0,10);
	}
	const created = await api('POST', API.Days, { seller_id: sellerId, day });
	// Re-load days and select the new one
	await loadDays();
	selectDay(created.id);
}

async function selectDay(dayId) {
	state.selectedDayId = dayId;
	document.querySelectorAll('.date-button').forEach(btn => btn.classList.remove('active'));
	// Re-render to set active
	renderDays();
	$('#sales-wrapper').classList.remove('hidden');
	$('#add-row').classList.remove('hidden');
	await loadSales();
}

function renderTable() {
	const tbody = $('#sales-tbody');
	tbody.innerHTML = '';
	for (const sale of state.sales) {
		const total = calcRowTotal({ arco: sale.qty_arco, melo: sale.qty_melo, mara: sale.qty_mara, oreo: sale.qty_oreo });
		const tr = el('tr', {},
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
	const sale = await api('POST', API.Sales, { seller_id: sellerId, sale_day_id: state.selectedDayId });
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
	const [clientEl, arcoEl, meloEl, maraEl, oreoEl] = tr.querySelectorAll('input');
	return {
		client_name: clientEl.value.trim(),
		qty_arco: arcoEl.value === '' ? 0 : Number(arcoEl.value),
		qty_melo: meloEl.value === '' ? 0 : Number(meloEl.value),
		qty_mara: maraEl.value === '' ? 0 : Number(maraEl.value),
		qty_oreo: oreoEl.value === '' ? 0 : Number(oreoEl.value),
	};
}

function debounce(fn, ms) {
	let t;
	return (...args) => {
		clearTimeout(t);
		t = setTimeout(() => fn(...args), ms);
	};
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
		state.saleDays = [];
		state.selectedDayId = null;
		switchView('#view-select-seller');
	});

	$('#add-date').addEventListener('click', addDate);
	$('#open-date-modal').addEventListener('click', openDateModal);
	$('#date-cancel').addEventListener('click', closeDateModal);
	$('#date-continue').addEventListener('click', continueDateModal);
	$('#month-select').addEventListener('change', rebuildDaysWheel);
}

(async function init() {
	bindEvents();
	await loadSellers();
})();