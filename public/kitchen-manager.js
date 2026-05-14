
const KitchenManager = {
    recipes: [],
    inventory: [],
    suggestions: {},
    history: [],
    isInitialized: false,

    async init() {
        if (this.isInitialized) {
            await this.loadData();
            return;
        }
        console.log("👨‍🍳 Initializing Kitchen Manager...");
        this.bindEvents();
        await this.loadData();
        this.isInitialized = true;
    },

    bindEvents() {
        const refreshBtn = document.getElementById('kitchen-refresh');
        if (refreshBtn) {
            refreshBtn.onclick = () => this.loadData();
        }
        
        const goHomeBtn = document.getElementById('kitchen-go-home');
        if (goHomeBtn) {
            goHomeBtn.onclick = () => window.switchView('#view-select-seller');
        }
    },

    async loadData() {
        const grid = document.getElementById('kitchen-recipes-grid');
        if (grid) grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:40px;">⏳ Cargando bitácora...</div>';

        try {
            console.log("📥 Loading Kitchen Data...");
            // 1. Load Master Desserts (for name mapping)
            this.allDesserts = await window.api('GET', '/api/desserts') || [];

            // 2. Load Recipes (including items and step_id)
            const recipeData = await window.api('GET', '/api/recipes?all_items=1');
            console.log("📋 Raw Recipes:", recipeData);
            this.recipes = this.processRecipes(recipeData);

            // 3. Load Inventory (for stock levels)
            this.inventory = await window.api('GET', '/api/inventory') || [];

            // 4. Load Suggestions (Future orders)
            await this.loadSuggestions();

            // 5. Load Today's History
            await this.loadHistory();

            this.render();
        } catch (err) {
            console.error("Kitchen Load Error:", err);
            window.notify.error("Error al cargar datos de cocina: " + err.message);
            if (grid) grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:40px; color:#ef4444;">❌ Error al cargar la bitácora.<br><small>${err.message}</small></div>`;
        }
    },

    processRecipes(data) {
        if (!data || !data.desserts) return [];
        const items = data.items || [];
        
        return data.desserts.map(name => {
            const recipeItems = items.filter(it => it.dessert === name);
            const stepsMap = {};
            
            recipeItems.forEach(it => {
                const stepKey = it.step_name || 'General';
                if (!stepsMap[stepKey]) {
                    stepsMap[stepKey] = { 
                        id: it.step_id,
                        name: it.step_name, 
                        items: [] 
                    };
                }
                if (it.ingredient) {
                    stepsMap[stepKey].items.push(it);
                }
            });

            // Ensure we have at least one step if it's a known recipe
            if (Object.keys(stepsMap).length === 0) {
                const anyItem = recipeItems[0];
                stepsMap['General'] = { id: anyItem?.step_id || null, name: 'General', items: [] };
            }

            return {
                name,
                steps: Object.values(stepsMap)
            };
        });
    },

    async loadSuggestions() {
        const today = new Date();
        const start = today.toISOString().split('T')[0];
        const future = new Date();
        future.setDate(today.getDate() + 30); // Expanded to 30 days to see all future sales
        const end = future.toISOString().split('T')[0];
        
        try {
            const sales = await window.api('GET', `/api/sales?date_range_start=${start}&date_range_end=${end}`);
            const counts = {}; // { [recipeName]: { total: 0, sellers: { [sellerName]: qty } } }

            const findRecipeName = (code) => {
                if (!code) return null;
                const match = this.recipes.find(r => 
                    r.name.toLowerCase() === code.toLowerCase() || 
                    r.name.toLowerCase().startsWith(code.toLowerCase())
                );
                return match ? match.name : null;
            };

            const addCount = (recipeName, sellerName, sellerId, day, qty) => {
                if (!recipeName || !qty) return;
                if (!counts[recipeName]) counts[recipeName] = { total: 0, sellers: [] };
                counts[recipeName].total += qty;
                
                // Find if we already have this seller+day for this recipe
                const isoDay = String(day || '').slice(0, 10);
                let entry = counts[recipeName].sellers.find(e => e.sellerId === sellerId && e.day === isoDay);
                if (!entry) {
                    entry = { sellerName, sellerId, day: isoDay, qty: 0 };
                    counts[recipeName].sellers.push(entry);
                }
                entry.qty += qty;
            };
            
            (sales || []).forEach(s => {
                const sellerName = s.seller_name || 'Tienda';
                const sellerId = s.seller_id;
                const saleDay = s.sale_day;

                // 1. Legacy columns
                const legacyMapping = {
                    qty_arco: findRecipeName('Arco') || 'Arco',
                    qty_melo: findRecipeName('Melo') || 'Melo',
                    qty_mara: findRecipeName('Mara') || 'Mara',
                    qty_oreo: findRecipeName('Oreo') || 'Oreo',
                    qty_nute: findRecipeName('Nute') || 'Nute'
                };

                Object.entries(legacyMapping).forEach(([col, recipeName]) => {
                    const q = Number(s[col] || 0);
                    if (q > 0) addCount(recipeName, sellerName, sellerId, saleDay, q);
                });

                // 2. Items array
                const items = s.items || [];
                items.forEach(it => {
                    const sc = (it.short_code || '').toLowerCase().trim();
                    const rawName = it.name || '';
                    if (!sc && !rawName) return;

                    let displayName = rawName;
                    if (sc) {
                        const masterMatch = (this.allDesserts || []).find(d => (d.short_code || '').toLowerCase().trim() === sc);
                        if (masterMatch) displayName = masterMatch.name;
                    }

                    if (!displayName || displayName === sc) {
                        const recipeMatch = findRecipeName(rawName || sc);
                        if (recipeMatch) displayName = recipeMatch;
                    }

                    if (!displayName) displayName = sc || rawName;

                    const isLegacy = sc && ['arco', 'melo', 'mara', 'oreo', 'nute'].includes(sc);
                    if (isLegacy) return;

                    const q = Number(it.quantity || 0);
                    if (q > 0) addCount(displayName, sellerName, sellerId, saleDay, q);
                });
            });
            
            this.suggestions = counts;
        } catch (err) {
            console.warn("Could not load suggestions:", err);
            this.suggestions = {};
        }
    },

    async loadHistory() {
        const today = new Date().toISOString().split('T')[0];
        try {
            const movements = await window.api('GET', `/api/inventory?history_all=1`);
            this.history = (movements || []).filter(m => 
                m.kind === 'produccion' && 
                m.created_at && m.created_at.startsWith(today)
            );
        } catch (err) {
            console.warn("Could not load history:", err);
            this.history = [];
        }
    },

    render() {
        try {
            this.renderSuggestions();
            this.renderRecipes();
            this.renderHistory();
        } catch (err) {
            console.error("Render Error:", err);
            window.showToast("Error al renderizar cocina", "error");
        }
    },

    renderSuggestions() {
        const cont = document.getElementById('kitchen-suggestions');
        if (!cont) return;
        cont.innerHTML = '';
        
        const sorted = Object.entries(this.suggestions).sort((a,b) => (b[1].total || 0) - (a[1].total || 0));
        if (sorted.length === 0) {
            cont.innerHTML = '<span style="font-size:0.8rem; color:#64748b;">No hay pedidos pendientes para los próximos 5 días.</span>';
            return;
        }
        
        sorted.forEach(([name, data]) => {
            const qty = data.total || 0;
            if (qty <= 0) return;
            const pill = document.createElement('div');
            pill.className = 'suggest-pill';
            pill.style = "background:#fff; border:1px solid #e2e8f0; padding:6px 12px; border-radius:12px; font-size:0.85rem; font-weight:700; color:#1e293b; display:flex; gap:8px; align-items:center; box-shadow:0 2px 4px rgba(0,0,0,0.02); cursor:pointer;";
            pill.innerHTML = `<span>${name}</span> <span style="background:#ff9800; color:white; padding:2px 6px; border-radius:6px; font-size:0.75rem;">${qty}</span>`;
            pill.onclick = (e) => {
                e.stopPropagation();
                this.showSellerBreakdown(name, pill);
            };
            cont.appendChild(pill);
        });
    },

    showSellerBreakdown(recipeName, targetEl) {
        const data = this.suggestions[recipeName];
        if (!data || !data.sellers) return;

        // Remove any existing breakdown
        const existing = document.getElementById('seller-breakdown-pop');
        if (existing) existing.remove();

        const pop = document.createElement('div');
        pop.id = 'seller-breakdown-pop';
        pop.className = 'aladdin-pop';
        pop.style = `position:fixed; z-index:10000; background:white; border-radius:16px; box-shadow:0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1); padding:16px; min-width:250px; border:1px solid #f1f5f9;`;
        
        const rect = targetEl.getBoundingClientRect();
        pop.style.left = Math.min(window.innerWidth - 270, Math.max(10, rect.left)) + 'px';
        pop.style.top = (rect.bottom + 8) + 'px';

        const header = document.createElement('h4');
        header.style = "margin:0 0 10px 0; font-size:0.85rem; color:#64748b; border-bottom:1px solid #f1f5f9; padding-bottom:8px;";
        header.textContent = "Pedidos Detallados:";
        pop.appendChild(header);

        const container = document.createElement('div');
        container.style = "display:flex; flex-direction:column; gap:8px;";
        
        // Sort by date then seller
        const sorted = [...data.sellers].sort((a,b) => b.day.localeCompare(a.day) || a.sellerName.localeCompare(b.sellerName));
        
        sorted.forEach(entry => {
            const dateLabel = entry.day.split('-').slice(1).reverse().join('/'); // MM/DD -> DD/MM
            const row = document.createElement('div');
            row.className = 'press-btn';
            row.style = `display:flex; justify-content:space-between; align-items:center; font-size:0.85rem; cursor:pointer; padding:8px; border-radius:10px; background:#f8fafc; border:1px solid #f1f5f9; transition:all 0.2s;`;
            row.innerHTML = `
                <div style="display:flex; flex-direction:column;">
                    <span style="color:#1e293b; font-weight:700;">${entry.sellerName}</span>
                    <span style="font-size:0.7rem; color:#94a3b8;">${dateLabel}</span>
                </div>
                <span style="background:#4f46e5; color:white; padding:2px 10px; border-radius:8px; font-weight:900; font-size:0.9rem;">${entry.qty}</span>
            `;
            row.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log('KITCHEN: Click detected on row', entry);
                if (window.KitchenManager && window.KitchenManager.jumpToSales) {
                    window.KitchenManager.jumpToSales(entry.sellerId, entry.day);
                } else {
                    console.error('KITCHEN: KitchenManager.jumpToSales not found!');
                }
            });
            container.appendChild(row);
        });
        
        pop.appendChild(container);
        document.body.appendChild(pop);

        const close = (e) => {
            if (!pop.contains(e.target) && e.target !== targetEl) {
                pop.remove();
                document.removeEventListener('click', close);
            }
        };
        setTimeout(() => document.addEventListener('click', close), 10);
    },

    async jumpToSales(sellerId, dayIso) {
        console.log('KITCHEN: jumpToSales called with:', { sellerId, dayIso });
        if (!window.enterSeller || !window.state) {
            console.error("KITCHEN: Global navigation functions NOT found on window.", { 
                enterSeller: !!window.enterSeller, 
                state: !!window.state 
            });
            return window.notify.error("Error: Funciones de navegación no disponibles. Por favor recarga.");
        }
        
        const existing = document.getElementById('seller-breakdown-pop');
        if (existing) existing.remove();

        window.notify.info("Navegando...");

        try {
            console.log('KITCHEN: Calling window.enterSeller(', sellerId, ')');
            // 1. Enter the seller view (this loads days and switches view)
            await window.enterSeller(sellerId);
            console.log('KITCHEN: enterSeller finished. Current saleDays count:', (window.state.saleDays || []).length);
            
            // 2. Find the day record in the state
            const dayRecord = (window.state.saleDays || []).find(d => String(d.day || '').startsWith(dayIso));
            console.log('KITCHEN: Day record found:', dayRecord);
            
            if (dayRecord) {
                // 3. Select the day and show the wrapper
                window.state.selectedDayId = dayRecord.id;
                const wrapper = document.getElementById('sales-wrapper');
                if (wrapper) wrapper.classList.remove('hidden');
                
                // 4. Load the sales for that specific day
                if (window.loadSales) await window.loadSales();
                
                // 5. Scroll to top of table for better visibility
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                window.notify.error("Día no encontrado en el archivo de este vendedor.");
                // Even if day not found, we already switched to the seller view
            }
        } catch (err) {
            console.error("Error jumping to sales:", err);
            window.notify.error("No se pudo completar la navegación: " + err.message);
        }
    },

    renderRecipes() {
        const grid = document.getElementById('kitchen-recipes-grid');
        if (!grid) return;
        grid.innerHTML = '';
        
        // Merge this.recipes with items from suggestions that don't have a recipe
        const recipesToShow = [...this.recipes];
        Object.keys(this.suggestions).forEach(sName => {
            if (!sName || sName === 'null' || sName === 'undefined') return;
            const exists = recipesToShow.some(r => r.name && r.name.toLowerCase() === sName.toLowerCase());
            if (!exists) {
                recipesToShow.push({
                    name: sName,
                    steps: [{ id: null, name: 'Receta no configurada', items: [] }],
                    isMissing: true
                });
            }
        });

        if (recipesToShow.length === 0) {
            grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:40px; color:#64748b;">No se encontraron recetas configuradas.</div>';
            return;
        }

        // Sort recipes by suggestion count (descending)
        recipesToShow.sort((a, b) => {
            const countA = (this.suggestions[a.name]?.total || 0);
            const countB = (this.suggestions[b.name]?.total || 0);
            if (countB !== countA) return countB - countA;
            return (a.name || "").localeCompare(b.name || "");
        });

        recipesToShow.forEach(recipe => {
            if (!recipe || !recipe.name) return;
            const card = document.createElement('div');
            card.className = 'box kitchen-card';
            const data = this.suggestions[recipe.name];
            const count = data?.total || 0;
            const isSuggested = count > 0;
            const isMissing = recipe.isMissing;
            
            card.style = `margin:0; padding:16px; border-radius:24px; display:flex; flex-direction:column; gap:0; border: 1px solid ${isMissing ? '#f1f5f9' : (isSuggested ? '#f4a6b7' : '#f1f5f9')}; cursor:pointer; background:${isSuggested ? '#fffdfd' : '#fff'}; opacity:${isMissing ? 0.7 : 1};`;
            
            card.innerHTML = `
                <div class="card-header" style="display:flex; align-items:center; justify-content:space-between; width:100%;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <div style="width:36px; height:36px; background:${isMissing ? '#f1f5f9' : (isSuggested ? '#fce7f3' : '#f8fafc')}; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:1.1rem;">🍰</div>
                        <div>
                            <h3 style="margin:0; font-size:1rem; font-weight:900; color:#1e293b;">${recipe.name}</h3>
                            ${isSuggested ? `<span class="pending-label" style="font-size:0.7rem; color:#db2777; font-weight:700; cursor:help;">Pendiente: ${count}</span>` : '<span style="font-size:0.7rem; color:#94a3b8;">Sin pedidos</span>'}
                        </div>
                    </div>
                    <div class="chevron" style="transition: transform 0.2s ease;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                    </div>
                </div>
                <div class="steps-list-container" style="max-height:0; overflow:hidden; transition: all 0.3s ease; opacity:0;">
                    <div style="padding-top:16px; display:flex; flex-direction:column; gap:12px;">
                        ${isMissing ? 
                            `<div style="padding:20px; text-align:center; color:#94a3b8; font-size:0.8rem; border:1px dashed #e2e8f0; border-radius:12px;">
                                ⚠️ No hay una receta configurada para este postre.<br>Ve a la sección de Recetas para configurarla.
                             </div>` :
                            (recipe.steps || []).map(step => this.renderStepRow(recipe.name, step)).join('')
                        }
                    </div>
                </div>
            `;

            card.onclick = (e) => {
                if (e.target.closest('.pending-label')) {
                    e.stopPropagation();
                    this.showSellerBreakdown(recipe.name, e.target.closest('.pending-label'));
                    return;
                }
                if (e.target.closest('input') || e.target.closest('button')) return;
                const container = card.querySelector('.steps-list-container');
                const chevron = card.querySelector('.chevron');
                const isExpanded = container.style.maxHeight !== '0px';
                if (isExpanded) {
                    container.style.maxHeight = '0px';
                    container.style.opacity = '0';
                    chevron.style.transform = 'rotate(0deg)';
                } else {
                    container.style.maxHeight = '2000px';
                    container.style.opacity = '1';
                    chevron.style.transform = 'rotate(180deg)';
                }
            };

            grid.appendChild(card);
        });
    },

    renderStepRow(recipeName, step) {
        if (!step) return "";
        const suggested = (this.suggestions[recipeName]?.total || 0);
        const inputId = `input-${step.id || Math.random().toString(36).substr(2, 9)}`;
        
        return `
            <div style="background:#f8fafc; border:1px solid #f1f5f9; border-radius:16px; padding:12px; transition: all 0.2s ease;">
                <div class="flex" style="margin-bottom:8px;">
                    <strong style="font-size:0.85rem; color:#475569;">${step.name || 'Proceso General'}</strong>
                </div>
                <div style="display:flex; gap:8px; align-items:center;">
                    <input type="number" id="${inputId}" value="${suggested || 1}" min="1" 
                        style="width:65px; padding:8px; border-radius:10px; border:1px solid #cbd5e1; font-weight:700; text-align:center; outline:none;"
                        onfocus="this.select()">
                    <button onclick="window.KitchenManager.produceStep('${step.id || ''}', '${recipeName}', '${step.name || ''}', '${inputId}')" 
                        ${!step.id ? 'disabled' : ''}
                        class="press-btn" style="flex:1; background:#4f46e5; color:white; border:none; padding:10px; border-radius:10px; font-weight:700; font-size:0.8rem; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2); opacity:${!step.id ? 0.5 : 1};">
                        Producir
                    </button>
                </div>
                <div style="margin-top:10px; font-size:0.7rem; color:#94a3b8; border-top:1px solid #eef2f6; padding-top:8px;">
                    ${(step.items || []).map(it => {
                        const inv = (this.inventory || []).find(i => i.ingredient && i.ingredient.toLowerCase() === (it.ingredient || "").toLowerCase());
                        const stock = inv ? inv.saldo : 0;
                        const qtyNeeded = Number(it.qty_per_unit || 0) * (suggested || 1);
                        const isLow = stock < qtyNeeded;
                        return `<div style="display:flex; justify-content:space-between; margin-bottom:2px; ${isLow ? 'color:#ef4444; font-weight:700;' : ''}">
                            <span>• ${it.ingredient}</span>
                            <span>${stock} / ${qtyNeeded} ${it.unit}</span>
                        </div>`;
                    }).join('')}
                </div>
            </div>
        `;
    },

    async produceStep(stepId, dessertName, stepName, inputId) {
        if (!stepId) return window.showToast("Esta receta no tiene ID de producción", "warning");
        const input = document.getElementById(inputId);
        const qty = Number(input.value) || 0;
        if (qty <= 0) return window.showToast("Ingresa una cantidad válida", "warning");

        const btn = document.querySelector(`button[onclick*="'${inputId}'"]`);
        const originalText = btn ? btn.innerText : "Producir";
        
        try {
            if (btn) {
                btn.innerText = "⏳...";
                btn.disabled = true;
            }

            const res = await window.api('POST', '/api/inventory', {
                action: 'produccion_paso',
                step_id: Number(stepId),
                multiplier: qty,
                actor_name: window.state?.currentUser?.name || window.state?.currentUser?.username || "Cocinero"
            });

            if (res.ok) {
                window.showToast(`✅ Producido: ${qty} de ${dessertName} (${stepName || 'General'})`, "success");
                await this.loadData();
            } else {
                throw new Error(res.error || "Error desconocido");
            }
        } catch (err) {
            console.error("Produce Step Error:", err);
            window.showToast("Error al procesar: " + err.message, "error");
            if (btn) {
                btn.innerText = originalText;
                btn.disabled = false;
            }
        }
    },

    renderHistory() {
        const cont = document.getElementById('kitchen-history-list');
        if (!cont) return;
        
        if (this.history.length === 0) {
            cont.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b; font-size:0.9rem;">No hay producción registrada hoy.</div>';
            return;
        }

        const grouped = {};
        this.history.forEach(m => {
            const note = m.note || "Producción";
            if (!grouped[note]) {
                grouped[note] = { 
                    time: m.created_at, 
                    actor: m.actor_name,
                    items: []
                };
            }
            grouped[note].items.push(m);
        });

        const sortedNotes = Object.keys(grouped).sort((a,b) => new Date(grouped[b].time) - new Date(grouped[a].time));

        cont.innerHTML = sortedNotes.map(note => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; border-bottom:1px solid #f1f5f9;">
                <div style="flex:1;">
                    <div style="font-size:0.9rem; font-weight:700; color:#1e293b;">${note}</div>
                    <div style="font-size:0.75rem; color:#94a3b8;">
                        ${new Date(grouped[note].time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} • Por ${grouped[note].actor || 'Desconocido'}
                    </div>
                </div>
                <div style="width:32px; height:32px; background:#f0fdf4; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#16a34a; font-weight:900;">✓</div>
            </div>
        `).join('');
    }
};

window.KitchenManager = KitchenManager;
