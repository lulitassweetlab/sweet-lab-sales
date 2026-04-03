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

        const uploadBtn = document.getElementById('store-upload-order-btn');
        const waBtn = document.getElementById('cart-checkout-btn');
        const separator = document.getElementById('cart-separator');

        if (storeAuthUser && storeActiveSeller) {
            if (waBtn) waBtn.style.display = 'none';
            if (uploadBtn) uploadBtn.style.display = 'none';
            if (separator) separator.style.display = 'none';
            internalCheckoutContainer.style.display = 'flex';
            document.getElementById('internal-checkout-btn').style.display = 'block';
            loadSellerClients();
        } else {
            if (waBtn) waBtn.style.display = 'block';
            if (uploadBtn) uploadBtn.style.display = 'block';
            if (separator) separator.style.display = 'inline';
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
    } else if (storeAuthUser && storeAuthUser.username) {
        // Logged in but no seller selected yet
        storeAuthBtn.textContent = 'Seleccionar Vendedor';
        storeAuthBtn.style.color = 'var(--primary)';
        storeAuthBtn.style.borderColor = 'var(--primary)';
        storeAuthBtn.style.background = 'transparent';
        storeAuthBtn.style.boxShadow = 'none';
        storeClientsBtn.style.display = 'none';
        storeCrmBtn.style.display = 'none';
        document.body.classList.remove('is-seller-active');

        const embedContainer = document.getElementById('seller-embedded-sales-container');
        if (embedContainer) { embedContainer.innerHTML = ''; embedContainer.style.display = 'none'; }
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

        const clientsRes = await fetch(`/api/clients?seller_id=${storeActiveSeller.id}`, { 
            headers,
            cache: 'no-store' // Critical: ensure we always get fresh CRM tags
        });
        if (!clientsRes.ok) return;

        const clientData = await clientsRes.json();
        if (Array.isArray(clientData)) {
            storeClientList = clientData
                .filter(c => c && (c.name || c.NAME))
                .map(c => {
                    const name = c.name || c.NAME || '';
                    const stage_name = c.stage_name || c.STAGE_NAME || c.stage || '';
                    const stage_color = c.stage_color || c.STAGE_COLOR || c.color || '#94a3b8';
                    let custom_tags = c.custom_tags || c.CUSTOM_TAGS || [];
                    // Defensive: If it's a string (common with some SQL drivers), parse it
                    if (typeof custom_tags === 'string' && custom_tags.startsWith('[')) {
                        try { custom_tags = JSON.parse(custom_tags); } catch (e) { custom_tags = []; }
                    }
                    if (!Array.isArray(custom_tags)) custom_tags = [];

                    return {
                        name: name.trim(),
                        stage_name: (stage_name || '').toString().trim(),
                        stage_color: stage_color,
                        custom_tags: custom_tags,
                        debt_cents: Number(c.total_debt_cents || c.TOTAL_DEBT_CENTS || 0),
                        total_orders: parseInt(c.total_orders || c.TOTAL_ORDERS || 0)
                    };
                });
        }
    } catch (err) {
        console.error('[Autocomplete] Error loading clients:', err);
    }
}

function setupClientAutocomplete() {
    const input = document.getElementById('store-customer-name');
    const dropdown = document.getElementById('store-client-dropdown');
    if (!input || !dropdown) return;

    function renderDropdown(filterValue = '') {
        const lowerVal = filterValue.toLowerCase();
        const matches = storeClientList.filter(c => c.name.toLowerCase().includes(lowerVal));
        dropdown.innerHTML = '';
        if (matches.length === 0 || !storeAuthUser || !storeActiveSeller) {
            dropdown.classList.remove('show');
            return;
        }
        matches.slice(0, 30).forEach(client => {
            const li = document.createElement('li');
            
            // Name container
            const nameSpan = document.createElement('span');
            nameSpan.textContent = client.name;
            li.appendChild(nameSpan);

            // Tags container
            const tagContainer = document.createElement('div');
            tagContainer.className = 'autocomplete-tag-container';
            
            // 1. Custom Tags (CRM Personal tags always first)
            if (client.custom_tags && client.custom_tags.length > 0) {
                client.custom_tags.forEach(t => {
                    const cTag = document.createElement('span');
                    cTag.className = 'autocomplete-tag';
                    cTag.textContent = t.name || t.NAME || '';
                    cTag.style.background = t.color || t.COLOR || '#818cf8';
                    tagContainer.appendChild(cTag);
                });
            }

            // 2. Stage Tag OR Prospecto Fallback
            if (client.stage_name && client.stage_name.length > 0) {
                const sTag = document.createElement('span');
                sTag.className = 'autocomplete-tag';
                sTag.textContent = client.stage_name;
                sTag.style.background = client.stage_color;
                tagContainer.appendChild(sTag);
            } else if (tagContainer.childNodes.length === 0 && client.total_orders === 0) {
                // If NO custom tags AND NO stage AND 0 orders -> Real prospecto
                const pTag = document.createElement('span');
                pTag.className = 'autocomplete-tag';
                pTag.textContent = 'PROSPECTO';
                pTag.style.background = '#94a3b8'; // CRM Gray
                tagContainer.appendChild(pTag);
            }

            // 3. Debt Tag
            if (client.debt_cents > 0) {
                const dTag = document.createElement('span');
                dTag.className = 'autocomplete-tag';
                dTag.textContent = 'DEUDA';
                dTag.style.background = 'var(--danger)';
                tagContainer.appendChild(dTag);
            }

            if (tagContainer.hasChildNodes()) {
                li.appendChild(tagContainer);
            }

            li.addEventListener('mousedown', (e) => {
                e.preventDefault();
                input.value = client.name;
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
        const lowerC = c.name.toLowerCase();
        const dist = levenshteinDistance(lowerName, lowerC);
        return { client: c, dist, includes: lowerC.includes(lowerName) || lowerName.includes(lowerC) };
    }).filter(m => m.dist <= threshold || m.includes)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 3);
    return matches.map(m => m.client.name);
}

/* openNewClientModal moved to store.html inline script to ensure tag loading coordination */

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

async function uploadStoreOrder(customerName, phone) {
    try {
        // 1. Find "Jorge" seller
        const res = await fetch('/api/get-sellers');
        if (!res.ok) throw new Error('No se pudo conectar con el servidor.');
        const sellers = await res.json();
        const jorge = sellers.find(s => s.name.trim().toLowerCase() === 'jorge') || 
                      sellers.find(s => s.name.toLowerCase().includes('jorge'));
        
        if (!jorge) throw new Error('El sistema de pedidos está temporalmente fuera de servicio (Jorge no encontrado).');

        // 2. Prepare sale data
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
            id: 'store_' + Date.now(),
            customerName: customerName,
            whatsapp: phone,
            items: saleItems,
            seller: jorge, // Dedicated seller: Jorge
            user: null,    // Anonymous store order
            timestamp: new Date().toISOString()
        };

        // 3. Queue and clear
        pendingSales.push(saleData);
        if (window.safeLS) safeLS.setItem('pending_sales', JSON.stringify(pendingSales));
        
        for (const id in cart) delete cart[id];
        const nameInput = document.getElementById('store-customer-name');
        if (nameInput) nameInput.value = '';
        updateCartUI();
        if (typeof loadStore === 'function') loadStore();

        // 4. Show confirmation message
        const confirmMsg = window.storeUploadConfirmMsg || 'Hemos recibido tu pedido, te contactaremos pronto';
        const successModal = document.getElementById('store-order-success-modal');
        const successMsgEl = document.getElementById('order-success-msg');
        if (successModal && successMsgEl) {
            successMsgEl.textContent = confirmMsg;
            successModal.style.display = 'flex';
        } else {
            alert(confirmMsg);
        }

        // 5. Sync
        syncPendingSales();
    } catch (err) {
        alert('Error al subir el pedido: ' + err.message);
        throw err;
    }
}

async function syncPendingSales() {
    if (isSyncing || pendingSales.length === 0) return;
    
    isSyncing = true;
    document.getElementById('sync-indicator').style.display = 'flex';

    try {
        console.log(`[Sync] Starting synchronization of ${pendingSales.length} sales...`);
        while (pendingSales.length > 0) {
            if (!navigator.onLine) break;

            const sale = pendingSales[0];
            console.log(`[Sync] Processing sale for ${sale.customerName}...`);
            const success = await processSingleSale(sale);
            
            if (success) {
                pendingSales.shift();
                safeLS.setItem('pending_sales', JSON.stringify(pendingSales));
                console.log(`[Sync] Successfully processed sale for ${sale.customerName}.`);
            } else {
                console.warn(`[Sync] Failed to process sale for ${sale.customerName}. Will retry later.`);
                break;
            }
        }
    } catch (err) {
        console.error('CRITICAL: Sync loop failed', err);
    } finally {
        isSyncing = false;
        document.getElementById('sync-indicator').style.display = 'none';
        console.log('[Sync] Synchronization cycle finished.');
    }
}

/**
 * Sends a pulse to the embedded sales table iframe to trigger a data refresh.
 */
function refreshSalesTable() {
    try {
        const iframe = document.querySelector('.embedded-sales-iframe');
        if (iframe && iframe.contentWindow) {
            console.log('[Store] Sending refresh request to embedded sales table.');
            iframe.contentWindow.postMessage('refreshSales', '*');
        }
    } catch (e) {
        console.error('[Store] Could not refresh sales table:', e);
    }
}

async function processSingleSale(sale) {
    try {
        const authHeaders = { 'Content-Type': 'application/json' };
        if (sale.user) {
            if (sale.user.token) authHeaders['Authorization'] = 'Bearer ' + sale.user.token;
            if (sale.user.username) authHeaders['x-actor-name'] = sale.user.username;
        }
        const actorName = sale.user ? (sale.user.name || sale.user.username) : 'Tienda Online';

        // 1. Parallelize Initial Lookups (Days and Desserts)
        const [daysRes, dessertsRes] = await Promise.all([
            fetch(`/api/days?seller_id=${sale.seller.id}`, { headers: authHeaders }).catch(e => ({ ok: false })),
            fetch('/api/desserts', { headers: authHeaders }).catch(e => ({ ok: false }))
        ]);

        let targetDayId = null;
        if (daysRes.ok) {
            const days = await daysRes.json();
            const targetDay = days[0];
            if (targetDay) targetDayId = targetDay.id;
        }

        if (!dessertsRes.ok) return false;
        const adminDesserts = await dessertsRes.json();

        let qty_arco = 0, qty_melo = 0, qty_mara = 0, qty_oreo = 0, qty_nute = 0;
        const dynamicItems = [];

        console.log(`🔍 [Sync] Processing ${sale.items.length} items for client: ${sale.customerName}`);
        for (const item of sale.items) {
            const name = (item.name || '').toLowerCase().trim();
            console.log(`   🔸 Item: "${item.name}" (ID: ${item.id})`);
            
            // 1. Match by store_product_id
            let matchedDessert = adminDesserts.find(d => d.store_product_id === item.id);
            if (matchedDessert) console.log(`      ✅ Matched by store_product_id: ${matchedDessert.name}`);
            
            // 2. Match by store_name or exact name (case-insensitive)
            if (!matchedDessert) {
                matchedDessert = adminDesserts.find(d => 
                    (d.store_name || '').toLowerCase().trim() === name || 
                    (d.name || '').toLowerCase().trim() === name
                );
                if (matchedDessert) console.log(`      ✅ Matched by name/store_name: ${matchedDessert.name}`);
            }

            // 3. Match by partial name (fuzzy)
            if (!matchedDessert) {
                matchedDessert = adminDesserts.find(d => {
                    const dName = (d.name || '').toLowerCase().trim();
                    const sName = (d.store_name || '').toLowerCase().trim();
                    return (dName.length > 2 && name.includes(dName)) || (sName.length > 2 && name.includes(sName));
                });
                if (matchedDessert) console.log(`      ✅ Matched by partial name: ${matchedDessert.name}`);
            }

            // 3.5 Match by short_code directly (item.id may be the product id from store, but let's also try item.name vs short_code)
            if (!matchedDessert) {
                const normalizedItemName = name.replace(/[.\s]/g, '');
                matchedDessert = adminDesserts.find(d => {
                    const sc = (d.short_code || '').toLowerCase().replace(/[.\s]/g, '');
                    return sc === normalizedItemName || sc === (item.id || '').toString().toLowerCase().replace(/[.\s]/g, '');
                });
                if (matchedDessert) console.log(`      ✅ Matched by short_code direct: ${matchedDessert.name}`);
            }

            // 4. Fallback: hardcoded mapping logic for short codes
            if (!matchedDessert) {
                let sc = '';
                if (name.includes('arcoiris') || name.includes('arco')) sc = 'arco';
                else if (name.includes('melocoton') || name.includes('melo')) sc = 'melo';
                else if (name.includes('maracumango') || name.includes('mara')) sc = 'mara';
                else if (name.includes('oreo')) sc = 'oreo';
                else if (name.includes('nutella') || name.includes('nute')) sc = 'nute';
                else if (name.includes('leches') || name.includes('3lec')) { sc = '3lec'; }
                else if (name.includes('brigadeiro') || name.includes('brig')) {
                    if (name.includes('x 5') || name.includes('x5')) sc = 'bx5';
                    else if (name.includes('x 10') || name.includes('x10')) sc = 'bx10';
                    else if (name.includes('x 12') || name.includes('x12')) sc = 'bx12';
                    else sc = 'brig'; 
                }

                if (sc) {
                    // Normalize stored short_code (strip trailing dots/spaces) before comparing
                    matchedDessert = adminDesserts.find(d => (d.short_code || '').toLowerCase().replace(/[.\s]+$/, '') === sc);
                    if (matchedDessert) console.log(`      ✅ Matched by short_code fallback (${sc}): ${matchedDessert.name}`);
                }
            }

            if (matchedDessert) {
                dynamicItems.push({ dessert_id: matchedDessert.id, quantity: item.qty, unit_price: item.price });
                const sc = (matchedDessert.short_code || '').toLowerCase();
                if (sc === 'arco') qty_arco += item.qty;
                else if (sc === 'melo') qty_melo += item.qty;
                else if (sc === 'mara') qty_mara += item.qty;
                else if (sc === 'oreo') qty_oreo += item.qty;
                else if (sc === 'nute') qty_nute += item.qty;
            } else {
                console.warn(`      ❌ Could not map store product "${item.name}" to any dessert.`);
            }
        }

        // 3. Post Sale
        const payload = { 
            seller_id: sale.seller.id, 
            sale_day_id: targetDayId, 
            client_name: sale.customerName, 
            _actor_name: actorName, 
            qty_arco, qty_melo, qty_mara, qty_oreo, qty_nute 
        };
        const saleRes = await fetch('/api/sales', { method: 'POST', headers: authHeaders, body: JSON.stringify(payload) });
        if (!saleRes.ok) return false;
        const createdSale = await saleRes.json();

        // 4. Put Items
        if (dynamicItems.length > 0) {
            const updateRes = await fetch('/api/sales', {
                method: 'PUT',
                headers: authHeaders,
                body: JSON.stringify({ id: createdSale.id, seller_id: sale.seller.id, sale_day_id: createdSale.sale_day_id, client_name: sale.customerName, items: dynamicItems, _actor_name: actorName })
            });
            if (!updateRes.ok) return false;
        }

        // 5. WhatsApp — send seller-configured new_order message with tag replacement
        // Only trigger for seller-initiated checkouts (where sale.user is present)
        if (sale.user) try {
            const msgRes = await fetch(`/api/seller-messages?seller_id=${sale.seller.id}`, { headers: authHeaders });
            if (msgRes.ok) {
                const msgs = await msgRes.json();
                const newOrderMsg = Array.isArray(msgs) ? msgs.find(m => m.event_type === 'new_order') : null;

                if (newOrderMsg && newOrderMsg.is_active && newOrderMsg.message_text) {
                    // Only open WhatsApp if we can — requires user gesture context.
                    // We rely on the fact that executeCheckout is called from a button click,
                    // which keeps the user-gesture context for a short time window.

                    // Resolve {cliente} — use short name if available
                    const clientDisplayName = sale.customerName || '';

                    // Resolve {pedido} — customized formatting
                    const pedidoStr = (sale.items || [])
                        .filter(item => item.qty > 0)
                        .map(item => {
                            const name = item.name || '';
                            const lowerName = name.toLowerCase();
                            const qty = item.qty || 0;

                            // Brigadeiro rules
                            if (lowerName.includes('brigadeiro')) {
                                // If it's a box, leave as is
                                if (lowerName.includes('caja')) {
                                    return `${qty} ${name}`;
                                }
                                // Otherwise, use brigadeiro/brigadeiros
                                const label = qty === 1 ? 'brigadeiro' : 'brigadeiros';
                                return `${qty} ${label}`;
                            }

                            // Regular desserts: "postre de" or "postres de"
                            const label = qty === 1 ? 'postre' : 'postres';
                            return `${qty} ${label} de ${name}`;
                        })
                        .join(', ') || 'tu pedido';

                    // Resolve {total} — formatted as COP currency
                    let grandTotal = 0;
                    for (const item of (sale.items || [])) {
                        grandTotal += (item.qty || 0) * (item.price || 0);
                    }
                    let fmtTotal;
                    try {
                        fmtTotal = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(grandTotal);
                    } catch (e) {
                        fmtTotal = '$' + grandTotal.toLocaleString();
                    }

                    // Resolve {vendedor}
                    const vendedorName = (sale.seller && sale.seller.name) ? sale.seller.name : '';

                    // Fetch client to get short name and WhatsApp number
                    let clientShortName = clientDisplayName;
                    let clientWhatsapp = sale.whatsapp;

                    try {
                        const clientsRes = await fetch(`/api/clients?seller_id=${sale.seller.id}`, { headers: authHeaders });
                        if (clientsRes.ok) {
                            const clientsArr = await clientsRes.json();
                            const clientRecord = Array.isArray(clientsArr)
                                ? clientsArr.find(c => (c.name || '').toLowerCase().trim() === clientDisplayName.toLowerCase().trim())
                                : null;

                            if (clientRecord) {
                                if (clientRecord.short_name) {
                                    clientShortName = clientRecord.short_name;
                                }
                                if (clientRecord.whatsapp) {
                                    clientWhatsapp = clientRecord.whatsapp;
                                }
                            }
                        }
                    } catch (clientErr) {
                        console.error('Error fetching client for WhatsApp tags:', clientErr);
                    }

                    // Apply all tag replacements
                    let text = newOrderMsg.message_text;
                    text = text.replace(/{cliente}/g, clientShortName);
                    text = text.replace(/{pedido}/g, pedidoStr);
                    text = text.replace(/{total}/g, fmtTotal);
                    text = text.replace(/{vendedor}/g, vendedorName);

                    if (clientWhatsapp) {
                        let cleanNum = clientWhatsapp.replace(/\D/g, '');
                        if (cleanNum.length === 10) cleanNum = '57' + cleanNum;
                        const isAndroid = /Android/i.test(navigator.userAgent);
                        const encodedMsg = encodeURIComponent(text);
                        
                        let waUrl = `whatsapp://send?phone=${cleanNum}&text=${encodedMsg}`;
                        if (isAndroid) {
                            waUrl = `intent://send?phone=${cleanNum}&text=${encodedMsg}#Intent;package=com.whatsapp.w4b;scheme=whatsapp;end`;
                        }
                        
                        window.open(waUrl, '_blank');
                    }
                }
            }
        } catch (waErr) {
            // WhatsApp is optional — don't fail the sale if it errors
            console.error('Error sending WhatsApp on new order:', waErr);
        }

        // 6. Refresh the sales table instantly if successful
        refreshSalesTable();

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
