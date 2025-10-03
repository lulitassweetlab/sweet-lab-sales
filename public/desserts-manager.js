// Dynamic Desserts Manager
// This module handles the new dynamic desserts system while maintaining backward compatibility

let dessertsCache = null;
let dessertsPrices = {};

export async function loadDesserts() {
	try {
		const response = await fetch('/api/desserts');
		if (!response.ok) {
			console.error('Failed to load desserts, using defaults');
			return getDefaultDesserts();
		}
		const desserts = await response.json();
		dessertsCache = desserts;
		
		// Build prices map
		dessertsPrices = {};
		for (const d of desserts) {
			dessertsPrices[d.short_code] = d.sale_price;
		}
		
		return desserts;
	} catch (err) {
		console.error('Error loading desserts:', err);
		return getDefaultDesserts();
	}
}

export function getDefaultDesserts() {
	return [
		{ id: 1, name: 'Arco', short_code: 'arco', sale_price: 8500, position: 1 },
		{ id: 2, name: 'Melo', short_code: 'melo', sale_price: 9500, position: 2 },
		{ id: 3, name: 'Mara', short_code: 'mara', sale_price: 10500, position: 3 },
		{ id: 4, name: 'Oreo', short_code: 'oreo', sale_price: 10500, position: 4 },
		{ id: 5, name: 'Nute', short_code: 'nute', sale_price: 13000, position: 5 },
	];
}

export function getDesserts() {
	return dessertsCache || getDefaultDesserts();
}

export function getDessertPrice(shortCode) {
	return dessertsPrices[shortCode] || 0;
}

export function getPricesMap() {
	return { ...dessertsPrices };
}

// Convert sale items to legacy format for backward compatibility
export function saleItemsToLegacy(items) {
	const legacy = {
		qty_arco: 0,
		qty_melo: 0,
		qty_mara: 0,
		qty_oreo: 0,
		qty_nute: 0,
	};
	
	if (!Array.isArray(items)) return legacy;
	
	for (const item of items) {
		const code = (item.short_code || '').toLowerCase();
		const qty = Number(item.quantity || 0) || 0;
		
		if (code === 'arco') legacy.qty_arco = qty;
		else if (code === 'melo') legacy.qty_melo = qty;
		else if (code === 'mara') legacy.qty_mara = qty;
		else if (code === 'oreo') legacy.qty_oreo = qty;
		else if (code === 'nute') legacy.qty_nute = qty;
	}
	
	return legacy;
}

// Convert legacy format to sale items
export function legacyToSaleItems(sale, desserts) {
	const items = [];
	const dessertsMap = {};
	
	for (const d of desserts) {
		dessertsMap[d.short_code] = d;
	}
	
	const legacyMap = {
		arco: sale.qty_arco || 0,
		melo: sale.qty_melo || 0,
		mara: sale.qty_mara || 0,
		oreo: sale.qty_oreo || 0,
		nute: sale.qty_nute || 0,
	};
	
	for (const [code, qty] of Object.entries(legacyMap)) {
		if (qty > 0 && dessertsMap[code]) {
			items.push({
				dessert_id: dessertsMap[code].id,
				quantity: qty,
				unit_price: dessertsMap[code].sale_price,
				name: dessertsMap[code].name,
				short_code: code,
			});
		}
	}
	
	return items;
}

// Calculate total from items
export function calculateTotal(items) {
	if (!Array.isArray(items)) return 0;
	return items.reduce((sum, item) => {
		return sum + (Number(item.quantity || 0) * Number(item.unit_price || 0));
	}, 0);
}
