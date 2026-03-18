/**
 * Lulitas Sweet Lab - Store Transactions & Auth
 * Handles checkout, authentication, seller tools, and client autocomplete.
 */

let pendingSales = [];
try {
    const savedPending = window.safeLS ? safeLS.getItem('pending_sales') : localStorage.getItem('pending_sales');
    pendingSales = JSON.parse(savedPending || '[]');
} catch (e) { console.error('Error initializing pending sales', e); }
let isSyncing = false;

function updateCartUI() {
    const cartItemsCount = document.getElementById('cart-items-count');
    const cartTotalPrice = document.getElementById('cart-total-price');
    const floatingCart = document.getElementById('floating-cart');
    const cartCheckoutBtn = document.getElementById('cart-checkout-btn');
    const internalCheckoutContainer = document.getElementById('internal-checkout-container');

    let totalQty = 0;
    let grandTotal = 0;
    let hasItems = false;

    for (const id in cart) {
        totalQty += cart[id].qty;
        grandTotal += cart[id].total;
        if (cart[id].qty > 0) hasItems = true;
    }

    if (hasItems) {
        cartItemsCount.textContent = totalQty === 1 ? '1 artículo' : `${totalQty} artículos`;
        cartTotalPrice.textContent = fmtMoney.format(grandTotal);
        floatingCart.classList.add('visible');

        if (storeAuthUser && storeActiveSeller) {
            cartCheckoutBtn.style.display = 'none';
            internalCheckoutContainer.style.display = 'flex';
            document.getElementById('internal-checkout-btn').style.display = 'block';
            loadSellerClients();
        } else {
            cartCheckoutBtn.style.display = 'block';
            internalCheckoutContainer.style.display = 'none';
            document.getElementById('internal-checkout-btn').style.display = 'none';
        }
    } else {
        floatingCart.classList.remove('visible');
    }
}

function updateAuthUI() {
    const storeAuthBtn = document.getElementById('store-auth-btn');
    const storeClientsBtn = document.getElementById('store-clients-btn');
    const storeCrmBtn = document.getElementById('store-crm-btn');

    if (storeAuthUser && storeAuthUser.username && storeActiveSeller) {
        storeAuthBtn.textContent = storeActiveSeller.name;
        storeAuthBtn.style.color = 'var(--text)';
        storeAuthBtn.style.borderColor = 'transparent';
        storeAuthBtn.style.background = 'transparent';
        storeAuthBtn.style.boxShadow = 'none';
        storeClientsBtn.style.display = 'block';
        storeCrmBtn.style.display = 'block';
        document.body.classList.add('is-seller-active');

        document.querySelectorAll('.buy-btn').forEach(b => b.style.display = 'none');
        document.querySelectorAll('.qty-container').forEach(q => q.style.display = 'flex');
        document.querySelectorAll('.product-desc').forEach(d => d.style.display = 'none');

        const embedContainer = document.getElementById('seller-embedded-sales-container');
        if (embedContainer && !embedContainer.querySelector('iframe')) {
            embedContainer.style.display = 'block';
            const iframe = document.createElement('iframe');
            iframe.src = '/index.html?embed=true';
            iframe.className = 'embedded-sales-iframe';
            iframe.title = 'Registro de Ventas';
            embedContainer.appendChild(iframe);
        }
    } else {
        storeAuthBtn.textContent = 'Ingresar';
        storeAuthBtn.style.color = 'var(--primary)';
        storeAuthBtn.style.borderColor = 'var(--primary)';
        storeAuthBtn.style.background = 'transparent';
        storeAuthBtn.style.boxShadow = 'none';
        storeClientsBtn.style.display = 'none';
        storeCrmBtn.style.display = 'none';
        document.body.classList.remove('is-seller-active');

        document.querySelectorAll('.buy-btn').forEach(b => b.style.display = 'block');
        document.querySelectorAll('.product-desc').forEach(d => d.style.display = '-webkit-box');
        document.querySelectorAll('.qty-container').forEach(q => { q.style.display = 'none'; });

        const embedContainer = document.getElementById('seller-embedded-sales-container');
        if (embedContainer) {
            embedContainer.innerHTML = '';
            embedContainer.style.display = 'none';
        }
    }
}

async function loadSellerClients() {
    if (!storeAuthUser || !storeActiveSeller) return;
    try {
        const headers = { 'Content-Type': 'application/json' };
        if (storeAuthUser.token) headers['Authorization'] = 'Bearer ' + storeAuthUser.token;
        if (storeAuthUser.username) headers['x-actor-name'] = storeAuthUser.username;

        const clientsRes = await fetch(`/api/clients?seller_id=${storeActiveSeller.id}`, { headers });
        if (!clientsRes.ok) return;

        const clientNames = await clientsRes.json();
        if (Array.isArray(clientNames)) {
            storeClientList = clientNames.map(c => c.name).filter(n => typeof n === 'string' && n.trim() !== '');
        }
    } catch (err) {
        console.error('Error fetching clients for autocomplete:', err);
    }
}

function setupClientAutocomplete() {
    const input = document.getElementById('store-customer-name');
    const dropdown = document.getElementById('store-client-dropdown');
    if (!input || !dropdown) return;

    function renderDropdown(filterValue = '') {
        const lowerVal = filterValue.toLowerCase();
        const matches = storeClientList.filter(name => name.toLowerCase().includes(lowerVal));
        dropdown.innerHTML = '';
        if (matches.length === 0 || !storeAuthUser || !storeActiveSeller) {
            dropdown.classList.remove('show');
            return;
        }
        matches.slice(0, 30).forEach(name => {
            const li = document.createElement('li');
            li.textContent = name;
            li.addEventListener('mousedown', (e) => {
                e.preventDefault();
                input.value = name;
                dropdown.classList.remove('show');
            });
            dropdown.appendChild(li);
        });
        dropdown.classList.add('show');
    }

    input.addEventListener('focus', () => renderDropdown(input.value));
    input.addEventListener('input', () => renderDropdown(input.value));
    input.addEventListener('blur', () => dropdown.classList.remove('show'));
}

async function showSellerSelection() {
    try {
        const res = await fetch('/api/get-sellers');
        if (!res.ok) throw new Error('Error al cargar vendedores');
        const allSellers = await res.json();

        const matchedSeller = allSellers.find(s =>
            s.name.toLowerCase() === (storeAuthUser.username || '').toLowerCase() ||
            s.name.toLowerCase() === (storeAuthUser.name || '').toLowerCase()
        );

        if (matchedSeller) {
            setSeller(matchedSeller);
            return;
        }

        if (allSellers.length === 1) {
            setSeller(allSellers[0]);
        } else {
            const container = document.getElementById('seller-buttons-container');
            container.innerHTML = '';
            allSellers.forEach(s => {
                const btn = document.createElement('button');
                btn.className = 'internal-checkout-btn';
                btn.style.background = 'var(--surface)';
                btn.style.color = 'var(--text)';
                btn.style.border = '1px solid var(--border)';
                btn.textContent = s.name;
                btn.addEventListener('click', () => setSeller(s));
                container.appendChild(btn);
            });
            document.getElementById('store-seller-modal').style.display = 'flex';
        }
    } catch (err) {
        alert('No se pudieron cargar los vendedores: ' + err.message);
    }
}

function setSeller(seller) {
    storeActiveSeller = seller;
    safeLS.setItem('storeActiveSeller', JSON.stringify(seller));
    document.getElementById('store-seller-modal').style.display = 'none';
    updateAuthUI();
    updateCartUI();
}

function levenshteinDistance(s, t) {
    if (!s.length) return t.length;
    if (!t.length) return s.length;
    const arr = [];
    for (let i = 0; i <= t.length; i++) {
        arr[i] = [i];
        for (let j = 1; j <= s.length; j++) {
            arr[i][j] = i === 0 ? j : Math.min(
                arr[i - 1][j] + 1,
                arr[i][j - 1] + 1,
                arr[i - 1][j - 1] + (s[j - 1] === t[i - 1] ? 0 : 1)
            );
        }
    }
    return arr[t.length][s.length];
}

function findSimilarClients(name) {
    const lowerName = name.toLowerCase().trim();
    const threshold = 3;
    const matches = storeClientList.map(c => {
        const lowerC = c.toLowerCase();
        const dist = levenshteinDistance(lowerName, lowerC);
        return { name: c, dist, includes: lowerC.includes(lowerName) || lowerName.includes(lowerC) };
    }).filter(c => c.dist <= threshold || c.includes)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 3);
    return matches.map(m => m.name);
}

function openNewClientModal(name) {
    document.getElementById('new-client-name-display').textContent = name;
    
    // Extract first name for short name suggestion
    const firstName = (name || '').trim().split(' ')[0];
    document.getElementById('new-client-shortname').value = firstName;
    
    document.getElementById('new-client-whatsapp').value = '';
    document.getElementById('new-client-error').style.display = 'none';
    document.getElementById('store-new-client-modal').style.display = 'flex';
}

async function executeCheckout(customerName) {
    // Collect all data BEFORE clearing the UI
    const customerNameInput = document.getElementById('store-customer-name');
    const newClientWhatsApp = document.getElementById('new-client-whatsapp');
    const whatsappValue = (newClientWhatsApp ? newClientWhatsApp.value : '') || customerNameInput.dataset.whatsapp || '';
    
    const saleItems = [];
    for (const productId in cart) {
        saleItems.push({ 
            id: productId, 
            qty: cart[productId].qty, 
            price: cart[productId].product.price,
            name: cart[productId].product.name
        });
    }

    const saleData = {
        id: 'local_' + Date.now(),
        customerName: customerName,
        whatsapp: whatsappValue,
        items: saleItems,
        seller: storeActiveSeller,
        user: storeAuthUser,
        timestamp: new Date().toISOString()
    };

    // 1. Queue immediately
    pendingSales.push(saleData);
    safeLS.setItem('pending_sales', JSON.stringify(pendingSales));

    // 2. Clear UI instantly for "Fast" experience
    for (const id in cart) delete cart[id];
    customerNameInput.value = '';
    updateCartUI();
    loadStore();

    const toast = document.getElementById('store-toast');
    toast.textContent = 'Pedido guardado (sincronizando...)';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);

    // 3. Trigger sync in background
    syncPendingSales();
}

async function syncPendingSales() {
    if (isSyncing || pendingSales.length === 0) return;
    
    isSyncing = true;
    document.getElementById('sync-indicator').style.display = 'flex';

    try {
        while (pendingSales.length > 0) {
            if (!navigator.onLine) break;

            const sale = pendingSales[0];
            const success = await processSingleSale(sale);
            
            if (success) {
                pendingSales.shift();
                safeLS.setItem('pending_sales', JSON.stringify(pendingSales));
            } else {
                // If it failed due to network, stop and retry later
                break;
            }
        }
    } catch (err) {
        console.error('CRITICAL: Sync loop failed', err);
    } finally {
        isSyncing = false;
        document.getElementById('sync-indicator').style.display = 'none';
    }
}

async function processSingleSale(sale) {
    try {
        const authHeaders = { 
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + (sale.user && sale.user.token ? sale.user.token : ''),
            'x-actor-name': (sale.user && sale.user.username ? sale.user.username : '')
        };

        // 1. Get Day
        const daysRes = await fetch(`/api/days?seller_id=${sale.seller.id}`, { headers: authHeaders });
        if (!daysRes.ok) return false;
        const days = await daysRes.json();

        let targetDay = days.find(d => !d.is_archived);
        if (!targetDay) {
            const isoDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Bogota' }).format(new Date(sale.timestamp));
            const createRes = await fetch('/api/days', {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({ seller_id: sale.seller.id, day: isoDate, _actor_name: sale.user.name })
            });
            if (!createRes.ok) return false;
            targetDay = await createRes.json();
        }

        // 2. Get Desserts to map
        const dessertsRes = await fetch('/api/desserts', { headers: authHeaders });
        if (!dessertsRes.ok) return false;
        const adminDesserts = await dessertsRes.json();

        let qty_arco = 0, qty_melo = 0, qty_mara = 0, qty_oreo = 0, qty_nute = 0;
        const dynamicItems = [];

        for (const item of sale.items) {
            const name = (item.name || '').toLowerCase();
            let matchedDessert = adminDesserts.find(d => d.store_product_id === item.id);
            if (!matchedDessert) {
                let sc = '';
                if (name.includes('arcoiris') || name.includes('arco')) sc = 'arco';
                else if (name.includes('melocoton') || name.includes('melo')) sc = 'melo';
                else if (name.includes('maracumango') || name.includes('mara')) sc = 'mara';
                else if (name.includes('oreo')) sc = 'oreo';
                else if (name.includes('nutella') || name.includes('nute')) sc = 'nute';
                else if (name.includes('leches') || name.includes('3lec')) { sc = '3lec'; }
                else if (name.includes('brigadeiro') || name.includes('brig')) { sc = 'brig'; }
                if (sc) matchedDessert = adminDesserts.find(d => (d.short_code || '').toLowerCase() === sc);
            }
            if (matchedDessert) {
                dynamicItems.push({ dessert_id: matchedDessert.id, quantity: item.qty, unit_price: item.price });
                const sc = (matchedDessert.short_code || '').toLowerCase();
                if (sc === 'arco') qty_arco += item.qty;
                if (sc === 'melo') qty_melo += item.qty;
                if (sc === 'mara') qty_mara += item.qty;
                if (sc === 'oreo') qty_oreo += item.qty;
                if (sc === 'nute') qty_nute += item.qty;
            }
        }

        // 3. Post Sale
        const payload = { seller_id: sale.seller.id, sale_day_id: targetDay.id, client_name: sale.customerName, _actor_name: sale.user.name, qty_arco, qty_melo, qty_mara, qty_oreo, qty_nute };
        const saleRes = await fetch('/api/sales', { method: 'POST', headers: authHeaders, body: JSON.stringify(payload) });
        if (!saleRes.ok) return false;
        const createdSale = await saleRes.json();

        // 4. Put Items
        if (dynamicItems.length > 0) {
            const updateRes = await fetch('/api/sales', {
                method: 'PUT',
                headers: authHeaders,
                body: JSON.stringify({ id: createdSale.id, seller_id: sale.seller.id, sale_day_id: targetDay.id, client_name: sale.customerName, items: dynamicItems, _actor_name: sale.user.name })
            });
            if (!updateRes.ok) return false;
        }

        // 5. WhatsApp (Trigger only if manually called via browser, this will open a tab)
        // Note: For background sync, we might want to skip automatic WhatsApp popups 
        // OR trigger them via a notification. For now, let's skip for simplicity in bg sync.

        return true;
    } catch (err) {
        console.error('Error processing single sale:', err);
        return false;
    }
}

// Start background sync service
window.addEventListener('online', syncPendingSales);
setInterval(syncPendingSales, 60000);
document.addEventListener('DOMContentLoaded', syncPendingSales);
