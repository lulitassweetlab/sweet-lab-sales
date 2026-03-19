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

async function processSingleSale(sale) {
    try {
        const authHeaders = { 'Content-Type': 'application/json' };
        if (sale.user) {
            if (sale.user.token) authHeaders['Authorization'] = 'Bearer ' + sale.user.token;
            if (sale.user.username) authHeaders['x-actor-name'] = sale.user.username;
        }
        const actorName = sale.user ? (sale.user.name || sale.user.username) : 'Tienda Online';

        // 1. Determine Target Day (Always attempt to find the latest table)
        let targetDayId = null;
        try {
            const daysRes = await fetch(`/api/days?seller_id=${sale.seller.id}`, { headers: authHeaders });
            if (daysRes.ok) {
                const days = await daysRes.json();
                const targetDay = days[0];
                if (targetDay) targetDayId = targetDay.id;
            }
        } catch (err) {
            console.warn('Could not fetch days, will let backend handle it:', err);
        }
        // If targetDayId is still null, the backend POST /api/sales will handle it (creating for "today")

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
                else if (name.includes('brigadeiro') || name.includes('brig')) {
                    // Specific matching for box sizes
                    if (name.includes('x 5') || name.includes('x5')) sc = 'bx5';
                    else if (name.includes('x 10') || name.includes('x10')) sc = 'bx10';
                    else if (name.includes('x 12') || name.includes('x12')) sc = 'bx12';
                    else sc = 'brig'; 
                }
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

                            // Regular desserts: prefix with "un postre de"
                            return `${qty} un postre de ${name}`;
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
                        const waUrl = `https://wa.me/${cleanNum}?text=${encodeURIComponent(text)}`;
                        window.open(waUrl, '_blank');
                    }
                }
            }
        } catch (waErr) {
            // WhatsApp is optional — don't fail the sale if it errors
            console.error('Error sending WhatsApp on new order:', waErr);
        }

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
