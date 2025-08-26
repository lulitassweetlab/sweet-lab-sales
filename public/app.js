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

const fmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
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
	switchView('#view-sales');
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
			el('td', { class: 'total col-total' }, fmt.format(total)),
			el('td', { class: 'col-actions' }, el('button', { class: 'row-delete', title: 'Eliminar', onclick: async () => { await deleteRow(sale.id); } }, 'x')),
		);
		tr.dataset.id = String(sale.id);
		tbody.appendChild(tr);
	}
	updateSummary();
}

function readRow(tr) {
	const [clientEl, arcoEl, meloEl, maraEl, oreoEl] = tr.querySelectorAll('input');
	const data = {
		client_name: clientEl.value.trim(),
		qty_arco: arcoEl.value === '' ? 0 : Number(arcoEl.value),
		qty_melo: meloEl.value === '' ? 0 : Number(meloEl.value),
		qty_mara: maraEl.value === '' ? 0 : Number(maraEl.value),
		qty_oreo: oreoEl.value === '' ? 0 : Number(oreoEl.value),
	};
	return data;
}

async function loadSales() {
	const sellerId = state.currentSeller.id;
	state.sales = await api('GET', `${API.Sales}?seller_id=${encodeURIComponent(sellerId)}`);
	renderTable();
}

async function addRow() {
	const sellerId = state.currentSeller.id;
	const sale = await api('POST', API.Sales, { seller_id: sellerId });
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
	totalCell.textContent = fmt.format(total);
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
		switchView('#view-select-seller');
	});
}

(async function init() {
	bindEvents();
	await loadSellers();
})();