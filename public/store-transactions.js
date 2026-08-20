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
        cartItemsCount.textContent = totalQty === 1 ? '1 postre' : `${totalQty} postres`;
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
            updateDateSelectorUI();
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
    const storeQrBtn = document.getElementById('store-qr-btn');
    const storeKitchenBtn = document.getElementById('store-kitchen-btn');

    const hasProductionAccess = storeAuthUser && (
        storeAuthUser.role === 'produccion' || 
        (storeAuthUser.features && storeAuthUser.features.includes('produccion')) || 
        storeAuthUser.role === 'admin' || 
        storeAuthUser.role === 'superadmin'
    );
    const hasSalesAccess = storeAuthUser && ['user', 'admin', 'superadmin'].includes(storeAuthUser.role);

    if (storeAuthUser && hasProductionAccess && !hasSalesAccess) {
        // Solo Producción
        if (storeKitchenBtn) storeKitchenBtn.style.display = 'block';
        storeAuthBtn.textContent = storeAuthUser.username;
        storeAuthBtn.style.color = 'var(--text)';
        storeAuthBtn.style.borderColor = 'transparent';
        storeAuthBtn.style.background = 'transparent';
        storeAuthBtn.style.boxShadow = 'none';
        storeClientsBtn.style.display = 'none';
        storeCrmBtn.style.display = 'none';
        if (storeQrBtn) storeQrBtn.style.display = 'none';
        document.body.classList.remove('is-seller-active');

        document.querySelectorAll('.buy-btn').forEach(b => b.style.display = 'block');
        document.querySelectorAll('.product-desc').forEach(d => d.style.display = '-webkit-box');
        document.querySelectorAll('.qty-container').forEach(q => { q.style.display = 'none'; });

        const embedContainer = document.getElementById('seller-embedded-sales-container');
        if (embedContainer) {
            embedContainer.innerHTML = '';
            embedContainer.style.display = 'none';
        }
    } else if (storeAuthUser && storeAuthUser.username && storeActiveSeller) {
        // Con acceso a ventas y vendedor seleccionado (mixto o solo ventas)
        if (storeKitchenBtn) storeKitchenBtn.style.display = hasProductionAccess ? 'block' : 'none';
        storeAuthBtn.textContent = storeActiveSeller.name;
        storeAuthBtn.style.color = 'var(--text)';
        storeAuthBtn.style.borderColor = 'transparent';
        storeAuthBtn.style.background = 'transparent';
        storeAuthBtn.style.boxShadow = 'none';
        storeClientsBtn.style.display = 'block';
        storeCrmBtn.style.display = 'block';
        if (storeQrBtn) storeQrBtn.style.display = 'block';
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
        loadSellerClients();
        loadSellerDays();
    } else if (storeAuthUser && storeAuthUser.username) {
        // Logueado pero sin vendedor seleccionado (mixto o solo ventas)
        if (storeKitchenBtn) storeKitchenBtn.style.display = hasProductionAccess ? 'block' : 'none';
        // Logged in but no seller selected yet
        storeAuthBtn.textContent = 'Ingresar';
        storeAuthBtn.style.color = 'var(--primary)';
        storeAuthBtn.style.borderColor = 'var(--primary)';
        storeAuthBtn.style.background = 'transparent';
        storeAuthBtn.style.boxShadow = 'none';
        storeClientsBtn.style.display = 'none';
        storeCrmBtn.style.display = 'none';
        if (storeQrBtn) storeQrBtn.style.display = 'none';
        document.body.classList.remove('is-seller-active');

        const embedContainer = document.getElementById('seller-embedded-sales-container');
        if (embedContainer) { embedContainer.innerHTML = ''; embedContainer.style.display = 'none'; }
    } else {
        if (storeKitchenBtn) storeKitchenBtn.style.display = 'none';
        storeAuthBtn.textContent = 'Ingresar';
        storeAuthBtn.style.color = 'var(--primary)';
        storeAuthBtn.style.borderColor = 'var(--primary)';
        storeAuthBtn.style.background = 'transparent';
        storeAuthBtn.style.boxShadow = 'none';
        storeClientsBtn.style.display = 'none';
        storeCrmBtn.style.display = 'none';
        if (storeQrBtn) storeQrBtn.style.display = 'none';
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

let storeSellerDays = [];
let storeSelectedDayId = null;

function formatStoreDayCardParts(input) {
    if (!input) return { weekday: 'Fecha', dateString: '' };
    let iso = String(input);
    if (/^\d{4}-\d{2}-\d{2}T/.test(iso)) iso = iso.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return { weekday: String(input), dateString: '' };
    const d = new Date(iso + 'T00:00:00Z');
    if (isNaN(d.getTime())) return { weekday: iso, dateString: '' };
    const weekdays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    
    return {
        weekday: weekdays[d.getUTCDay()],
        dateString: `${d.getUTCDate()} de ${months[d.getUTCMonth()]}`
    };
}

async function loadSellerDays() {
    if (!storeAuthUser || !storeActiveSeller) return;
    try {
        const headers = getAuthHeaders();
        const daysRes = await fetch(`/api/days?seller_id=${storeActiveSeller.id}`, { headers });
        if (!daysRes.ok) return;
        const days = await daysRes.json();
        if (Array.isArray(days)) {
            // Sort by date ascending (closest date first on the left, furthest on the right)
            storeSellerDays = days.sort((a, b) => new Date(a.day) - new Date(b.day));
            updateDateSelectorUI();
        }
    } catch (err) {
        console.error('[Store] Error loading seller days:', err);
    }
}

function updateDateSelectorUI() {
    const container = document.getElementById('store-order-date-container');
    if (!container) return;
    
    if (storeSellerDays.length <= 1) {
        container.style.display = 'none';
        container.innerHTML = '';
        storeSelectedDayId = storeSellerDays[0] ? storeSellerDays[0].id : null;
        return;
    }

    // Optimization: If the cards are already rendered for the current list of days, do not rebuild.
    // This preserves selection state and prevents layout flicker.
    const existingCards = container.querySelectorAll('.store-date-card');
    if (existingCards.length === storeSellerDays.length) {
        let matchesAll = true;
        existingCards.forEach((card, idx) => {
            if (card.dataset.dayId !== String(storeSellerDays[idx].id)) {
                matchesAll = false;
            }
        });
        if (matchesAll) {
            container.style.display = 'flex';
            return;
        }
    }

    container.innerHTML = '';
    
    // Set first day as default selected
    storeSelectedDayId = storeSellerDays[0].id;

    storeSellerDays.forEach((d, idx) => {
        const card = document.createElement('div');
        card.className = `store-date-card ${idx === 0 ? 'active' : ''}`;
        card.dataset.dayId = d.id;

        const parts = formatStoreDayCardParts(d.day);

        const weekdayEl = document.createElement('span');
        weekdayEl.className = 'store-date-card-day';
        weekdayEl.textContent = parts.weekday;

        const dateEl = document.createElement('span');
        dateEl.className = 'store-date-card-date';
        dateEl.textContent = parts.dateString;

        card.appendChild(weekdayEl);
        if (parts.dateString) card.appendChild(dateEl);

        card.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Update selected ID
            storeSelectedDayId = d.id;
            
            // Toggle active classes
            container.querySelectorAll('.store-date-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');

            // Send selection to embedded sales table iframe
            const iframe = document.querySelector('.embedded-sales-iframe');
            if (iframe && iframe.contentWindow) {
                iframe.contentWindow.postMessage({ type: 'selectDay', selectedDayId: d.id }, '*');
            }
        });

        container.appendChild(card);
    });
    
    container.style.display = 'flex';
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
            
            // Custom Tags ONLY (Piso 4, Piso 9, Ventas, etc. - exclude CRM stage/debt tags)
            if (client.custom_tags && client.custom_tags.length > 0) {
                client.custom_tags.forEach(t => {
                    const cTag = document.createElement('span');
                    cTag.className = 'autocomplete-tag';
                    cTag.textContent = t.name || t.NAME || '';
                    cTag.style.background = t.color || t.COLOR || '#818cf8';
                    tagContainer.appendChild(cTag);
                });
            }

            if (tagContainer.hasChildNodes()) {
                li.appendChild(tagContainer);
            }

            li.addEventListener('mousedown', (e) => {
                e.preventDefault();
                input.value = client.name;
                input.dataset.isExplicitSelection = 'true';
                if (client.whatsapp || client.phone) {
                    input.dataset.whatsapp = (client.whatsapp || client.phone).toString();
                } else {
                    delete input.dataset.whatsapp;
                }
                dropdown.classList.remove('show');
            });
            dropdown.appendChild(li);
        });
        dropdown.classList.add('show');
    }

    input.addEventListener('focus', () => renderDropdown(input.value));
    input.addEventListener('input', () => {
        delete input.dataset.isExplicitSelection;
        renderDropdown(input.value);
    });
    input.addEventListener('blur', () => dropdown.classList.remove('show'));
}

async function showSellerSelection() {
    try {
        const res = await fetch('/api/sellers');
        if (!res.ok) throw new Error('Error al cargar vendedores');
        const allSellers = await res.json();

        if (storeActiveSeller) {
            const fresh = allSellers.find(s => s.id === storeActiveSeller.id || s.name.toLowerCase() === storeActiveSeller.name.toLowerCase());
            if (fresh) {
                storeActiveSeller = fresh;
                safeLS.setItem('storeActiveSeller', JSON.stringify(fresh));
            }
        }

        const matchedSeller = allSellers.find(s =>
            s.name.toLowerCase() === (storeAuthUser.username || '').toLowerCase() ||
            s.name.toLowerCase() === (storeAuthUser.name || '').toLowerCase()
        );

        if (matchedSeller) {
            setSeller(matchedSeller);
            return;
        }

        // Si se autenticó correctamente pero aún no tiene perfil en la tabla de vendedores, crearlo automáticamente
        if (storeAuthUser && storeAuthUser.username) {
            try {
                const createRes = await fetch('/api/sellers', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-actor-name': storeAuthUser.username
                    },
                    body: JSON.stringify({ name: storeAuthUser.username, actor_name: storeAuthUser.username })
                });
                if (createRes.ok) {
                    const newSeller = await createRes.json();
                    if (newSeller && newSeller.name) {
                        setSeller(newSeller);
                        return;
                    }
                }
            } catch (createErr) {
                console.error('Error auto-creando perfil de vendedor:', createErr);
            }
        }

        // Si es un vendedor estándar (rol 'user') y por alguna razón falló la auto-creación, usar perfil virtual
        if (storeAuthUser && storeAuthUser.username) {
            const fallbackSeller = { id: storeAuthUser.username, name: storeAuthUser.username };
            setSeller(fallbackSeller);
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
    loadSellerClients();
    loadSellerDays();
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
        const lowerC = c.name.toLowerCase().trim();
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
    let whatsappValue = (newClientWhatsApp ? newClientWhatsApp.value : '') || customerNameInput.dataset.whatsapp || '';
    
    // Check if client exists in loaded client list and has a saved whatsapp number
    if (!whatsappValue && typeof storeClientList !== 'undefined' && Array.isArray(storeClientList)) {
        const clientObj = storeClientList.find(c => (c.name || '').trim().toLowerCase() === (customerName || '').trim().toLowerCase());
        if (clientObj && (clientObj.whatsapp || clientObj.phone)) {
            whatsappValue = (clientObj.whatsapp || clientObj.phone).toString();
        }
    }

    const isWaRequired = storeActiveSeller && (storeActiveSeller.require_whatsapp === true || storeActiveSeller.require_whatsapp === 'true' || storeActiveSeller.require_whatsapp === 1);
    if (isWaRequired && !whatsappValue.trim()) {
        if (typeof openNewClientModal === 'function') {
            openNewClientModal(customerName);
        }
        return;
    }
    
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
        timestamp: new Date().toISOString(),
        sale_day_id: storeSelectedDayId
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
        const res = await fetch('/api/sellers');
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
                sale.attempts = (sale.attempts || 0) + 1;
                console.warn(`[Sync] Failed to process sale for ${sale.customerName} (Attempt ${sale.attempts}/3).`);
                
                if (sale.attempts >= 3) {
                    console.error(`[Sync] Permanent failure for ${sale.customerName}. Moving to failed sales storage.`);
                    pendingSales.shift();
                    
                    try {
                        const savedFailed = safeLS.getItem('failed_sales') || '[]';
                        const failedSales = JSON.parse(savedFailed);
                        sale.failReason = "Error al sincronizar después de 3 intentos";
                        failedSales.push(sale);
                        safeLS.setItem('failed_sales', JSON.stringify(failedSales));
                    } catch (e) {
                        console.error('Error saving to failed sales history', e);
                    }
                    
                    safeLS.setItem('pending_sales', JSON.stringify(pendingSales));
                    
                    const toast = document.getElementById('store-toast');
                    if (toast) {
                        toast.textContent = `Error al sincronizar el pedido de ${sale.customerName}. Se guardó localmente.`;
                        toast.classList.add('show');
                        setTimeout(() => toast.classList.remove('show'), 5000);
                    }
                } else {
                    safeLS.setItem('pending_sales', JSON.stringify(pendingSales));
                    break;
                }
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
            iframe.contentWindow.postMessage({ type: 'refreshSales', selectedDayId: storeSelectedDayId }, '*');
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
        let targetDayId = sale.sale_day_id || null;
        let daysPromise;
        if (!targetDayId) {
            daysPromise = fetch(`/api/days?seller_id=${sale.seller.id}`, { headers: authHeaders }).catch(e => ({ ok: false }));
        } else {
            daysPromise = Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
        }

        const [daysRes, dessertsRes] = await Promise.all([
            daysPromise,
            fetch('/api/desserts', { headers: authHeaders }).catch(e => ({ ok: false }))
        ]);

        if (!targetDayId && daysRes.ok) {
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
                    const clientNameClean = (sale.customerName || '').trim();
                    let clientShortName = clientNameClean;
                    let clientWhatsapp = (sale.whatsapp || '').trim();

                    try {
                        const clientsRes = await fetch(`/api/clients?seller_id=${sale.seller.id}`, { headers: authHeaders });
                        if (clientsRes.ok) {
                            const clientsArr = await clientsRes.json();
                            const clientRecord = Array.isArray(clientsArr)
                                ? clientsArr.find(c => (c.name || c.NAME || '').toLowerCase().trim() === clientNameClean.toLowerCase())
                                : null;

                            if (clientRecord) {
                                const sn = clientRecord.short_name || clientRecord.SHORT_NAME;
                                if (sn) {
                                    clientShortName = sn;
                                } else {
                                    // Fallback to first name if short_name is truly empty
                                    clientShortName = clientNameClean.split(' ')[0] || clientNameClean;
                                }

                                const wa = clientRecord.whatsapp || clientRecord.WHATSAPP;
                                if (wa) {
                                    clientWhatsapp = wa;
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

// Listen to date changes made within the embedded sales table to sync store UI
window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'selectDay') {
        const dayId = event.data.selectedDayId;
        console.log('[Store] Selected day update received from iframe:', dayId);
        storeSelectedDayId = dayId;
        
        // Update active class on cards
        const container = document.getElementById('store-order-date-container');
        if (container) {
            container.querySelectorAll('.store-date-card').forEach(card => {
                if (card.dataset.dayId === String(dayId)) {
                    card.classList.add('active');
                } else {
                    card.classList.remove('active');
                }
            });
        }
    }
});
