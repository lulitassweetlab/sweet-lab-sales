const KitchenManager = {
    recipes: [],
    inventory: [],
    batches: [], // Array of { day, recipeName, total, sellers: [] }
    history: [],
    expandedRecipes: new Set(),
    timers: {}, // { "stepId_targetDate": { startTime: Date, elapsedBefore: seconds } }
    isInitialized: false,

    async init() {
        if (this.isInitialized) {
            await this.loadData();
            return;
        }
        console.log("👨‍🍳 Initializing Kitchen Manager...");
        this.bindEvents();
        await this.loadData();
        this.startIntervals();
        this.isInitialized = true;
    },

    startIntervals() {
        if (this._timerInterval) clearInterval(this._timerInterval);
        this._timerInterval = setInterval(() => this.updateTimerDisplays(), 1000);
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
        // Only show full loading indicator on first time
        if (grid && !this.isInitialized) {
            grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:40px;">⏳ Cargando bitácora...</div>';
        }

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

    toggleTimer(stepId, targetDate) {
        const key = `${stepId}_${targetDate}`;
        const t = this.timers[key];
        if (t && t.startTime) {
            // Stop timer
            const elapsed = Math.floor((Date.now() - t.startTime) / 1000);
            t.elapsedBefore = (t.elapsedBefore || 0) + elapsed;
            t.startTime = null;
        } else {
            // Start timer
            if (!this.timers[key]) this.timers[key] = { elapsedBefore: 0 };
            this.timers[key].startTime = Date.now();
        }
        this.render(); 
    },

    getElapsedSeconds(stepId, targetDate) {
        const key = `${stepId}_${targetDate}`;
        const t = this.timers[key];
        if (!t) return 0;
        let total = t.elapsedBefore || 0;
        if (t.startTime) {
            total += Math.floor((Date.now() - t.startTime) / 1000);
        }
        return total;
    },

    formatDuration(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    },

    updateTimerDisplays() {
        document.querySelectorAll('.timer-display').forEach(el => {
            const stepId = el.getAttribute('data-step-id');
            const targetDate = el.getAttribute('data-date');
            if (stepId && targetDate) {
                const elapsed = this.getElapsedSeconds(stepId, targetDate);
                el.textContent = this.formatDuration(elapsed);
                if (this.timers[`${stepId}_${targetDate}`]?.startTime) {
                    el.style.color = '#ef4444';
                } else {
                    el.style.color = '#94a3b8';
                }
            }
        });
    },

    processRecipes(data) {
        if (!data || !data.desserts) return [];
        const items = data.items || [];
        
        return data.desserts.map(name => {
            const recipeItems = items.filter(it => it.dessert === name);
            const steps = [];
            const stepsById = {};
            
            recipeItems.forEach(it => {
                const stepId = it.step_id;
                if (!stepsById[stepId]) {
                    const newStep = { 
                        id: stepId,
                        name: it.step_name || 'General', 
                        produces_ingredient: it.produces_ingredient,
                        produces_unit: it.produces_unit,
                        items: [] 
                    };
                    stepsById[stepId] = newStep;
                    steps.push(newStep);
                }
                
                if (it.ingredient) {
                    stepsById[stepId].items.push(it);
                }
            });

            return {
                name,
                steps: steps
            };
        });
    },

    async loadSuggestions() {
        const today = new Date();
        // Go back 3 days and forward 30 days to ensure we don't miss anything recent or upcoming
        const past = new Date();
        past.setDate(today.getDate() - 3);
        this.suggestionStartDate = past.toISOString().split('T')[0];
        const start = this.suggestionStartDate;
        
        const future = new Date();
        future.setDate(today.getDate() + 30);
        const end = future.toISOString().split('T')[0];
        
        console.log(`KITCHEN: Suggestion range: ${start} to ${end}`);
        
        try {
            const sales = await window.api('GET', `/api/sales?date_range_start=${start}&date_range_end=${end}&all_sellers=1`);
            console.log(`KITCHEN: Fetched ${sales?.length || 0} sales rows.`);
            
            const batchMap = {}; // { [isoDay + "_" + recipeName]: { day, recipeName, total, sellers: [] } }

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
                
                // Robust date parsing: ensure we have YYYY-MM-DD
                let isoDay = '';
                if (day instanceof Date) isoDay = day.toISOString().split('T')[0];
                else if (typeof day === 'string') isoDay = day.split('T')[0];
                else if (day) isoDay = String(day).slice(0, 10);
                
                if (!isoDay) {
                    console.warn('KITCHEN: Sale missing day:', { recipeName, sellerName, qty });
                    isoDay = 'Sin fecha';
                }

                const key = `${isoDay}_${recipeName}`;
                if (!batchMap[key]) {
                    batchMap[key] = { day: isoDay, recipeName, total: 0, sellers: [] };
                }

                batchMap[key].total += qty;
                
                let entry = batchMap[key].sellers.find(e => e.sellerId === sellerId);
                if (!entry) {
                    entry = { sellerName, sellerId, qty: 0 };
                    batchMap[key].sellers.push(entry);
                }
                entry.qty += qty;
            };
            
            (sales || []).forEach(s => {
                const sellerName = s.seller_name || 'Tienda';
                const sellerId = s.seller_id;
                const saleDay = s.sale_day;
                const items = s.items || [];

                if (items.length > 0) {
                    items.forEach(it => {
                        const sc = (it.short_code || it.code || '').toLowerCase().trim();
                        const rawName = it.name || '';
                        if (!sc && !rawName) return;

                        let displayName = rawName;
                        if (sc) {
                            const masterMatch = (this.allDesserts || []).find(d => (d.short_code || '').toLowerCase().trim() === sc);
                            if (masterMatch) displayName = masterMatch.name;
                        }

                        if (!displayName || displayName.toLowerCase() === sc) {
                            const recipeMatch = findRecipeName(rawName || sc);
                            if (recipeMatch) displayName = recipeMatch;
                        }

                        if (!displayName) displayName = sc || rawName;
                        const q = Number(it.quantity || 0);
                        if (q > 0) addCount(displayName, sellerName, sellerId, saleDay, q);
                    });
                } else {
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
                }
            });
            
            this.batches = Object.values(batchMap).sort((a,b) => a.day.localeCompare(b.day) || a.recipeName.localeCompare(b.recipeName));
            console.log('KITCHEN: Final batches list:', this.batches);
        } catch (err) {
            console.warn("Could not load suggestions:", err);
            this.batches = [];
        }
    },

    async loadHistory() {
        const start = this.suggestionStartDate || new Date().toISOString().split('T')[0];
        try {
            // Fetch movements from the same start date as suggestions (last 3 days) + cache buster
            const movements = await window.api('GET', `/api/inventory?history_all=1&date_start=${start}&_t=${Date.now()}`);
            this.history = (movements || []).filter(m => 
                m.kind === 'produccion'
            );

            // Aggregate production by (note + timestamp window)
            this.producedStepsMap = {}; 
            const actionGroups = [];
            
            this.history.forEach(m => {
                const t = new Date(m.created_at).getTime();
                const existing = actionGroups.find(a => 
                    a.note === m.note && 
                    Math.abs(new Date(a.created_at).getTime() - t) < 10000
                );
                
                if (!existing) {
                    actionGroups.push(m);
                    if (m.metadata && m.metadata.step_id) {
                        const sid = m.metadata.step_id;
                        const qty = Number(m.metadata.multiplier || 0);
                        const tDate = m.metadata.target_date || m.created_at.split('T')[0];
                        const key = `${sid}_${tDate}`;
                        this.producedStepsMap[key] = (this.producedStepsMap[key] || 0) + qty;
                    }
                }
            });
            console.log("✅ Produced Map (sid_date):", this.producedStepsMap);
        } catch (err) {
            console.warn("Could not load history:", err);
            this.history = [];
            this.producedStepsMap = {};
        }
    },

    render() {
        // Initialize virtual stock map to project availability across cards
        this.virtualStockMap = {};
        (this.inventory || []).forEach(inv => {
            if (inv.ingredient) {
                const key = (inv.ingredient || "").toLowerCase().trim();
                this.virtualStockMap[key] = Number(inv.saldo || 0);
            }
        });

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
        
        // Sum totals per dessert across all batches
        const totals = {};
        this.batches.forEach(b => {
            totals[b.recipeName] = (totals[b.recipeName] || 0) + b.total;
        });

        const sorted = Object.entries(totals).sort((a,b) => b[1] - a[1]);
        if (sorted.length === 0) {
            cont.innerHTML = '<span style="font-size:0.8rem; color:#64748b;">No hay pedidos pendientes para los próximos días.</span>';
            return;
        }
        
        sorted.forEach(([name, qty]) => {
            if (qty <= 0) return;
            const pill = document.createElement('div');
            pill.className = 'suggest-pill';
            pill.style = "background:#fff; border:1px solid #e2e8f0; padding:6px 12px; border-radius:12px; font-size:0.85rem; font-weight:700; color:#1e293b; display:flex; gap:8px; align-items:center; box-shadow:0 2px 4px rgba(0,0,0,0.02);";
            pill.innerHTML = `<span>${name}</span> <span style="background:#ff9800; color:white; padding:2px 6px; border-radius:6px; font-size:0.75rem;">${qty}</span>`;
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
        grid.style.display = 'flex';
        grid.style.flexDirection = 'column';
        grid.style.gap = '40px';

        if (this.batches.length === 0) {
            grid.innerHTML = '<div style="text-align:center; padding:40px; color:#64748b;">No hay lotes de producción pendientes.</div>';
            return;
        }

        // Group batches by day
        const days = {};
        this.batches.forEach(batch => {
            if (!days[batch.day]) days[batch.day] = [];
            days[batch.day].push(batch);
        });

        Object.keys(days).sort().forEach(day => {
            const dayBatches = days[day];
            
            // Filter out fully completed batches within this day
            const pendingBatches = dayBatches.filter(batch => {
                const recipe = this.recipes.find(r => r.name === batch.recipeName);
                if (!recipe || !recipe.steps || recipe.steps.length === 0) return true;
                
                const stepTotals = recipe.steps.map(s => this.producedStepsMap[`${s.id}_${batch.day}`] || 0);
                const minProduced = Math.min(...stepTotals);
                return minProduced < batch.total;
            });

            if (pendingBatches.length === 0) return;

            const daySection = document.createElement('div');
            daySection.className = 'day-section';
            
            const todayStr = new Date().toISOString().split('T')[0];
            let dayLabel = day === todayStr ? "Hoy" : (day === new Date(Date.now() + 86400000).toISOString().split('T')[0] ? "Mañana" : day);
            
            daySection.innerHTML = `
                <h3 style="margin: 0 0 16px 0; display:flex; align-items:center; gap:10px; color:var(--primary);">
                    <span style="font-size:1.4rem;">📅</span> ${dayLabel}
                </h3>
                <div class="batches-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap:20px;"></div>
            `;
            
            const batchesGrid = daySection.querySelector('.batches-grid');
            
            pendingBatches.forEach(batch => {
                const recipe = this.recipes.find(r => r.name === batch.recipeName) || {
                    name: batch.recipeName,
                    steps: [{ id: null, name: 'Receta no configurada', items: [] }],
                    isMissing: true
                };

                const totalNeeded = batch.total;
                const stepTotals = recipe.steps.map(s => this.producedStepsMap[`${s.id}_${batch.day}`] || 0);
                const minProduced = Math.min(...stepTotals);
                const remaining = Math.max(0, totalNeeded - minProduced);
                
                const card = document.createElement('div');
                card.className = 'box kitchen-card';
                card.style = `margin:0; padding:16px; border-radius:24px; display:flex; flex-direction:column; gap:0; border: 1px solid #f4a6b7; cursor:pointer; background:#fffdfd; transition: all 0.3s ease;`;
                
                const cardId = `${batch.day}_${batch.recipeName}`;
                const isExpanded = this.expandedRecipes.has(cardId);
                
                card.innerHTML = `
                    <div class="card-header" style="display:flex; align-items:center; justify-content:space-between; width:100%;">
                        <div style="display:flex; align-items:center; gap:12px;">
                            <div style="width:36px; height:36px; background:#fce7f3; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:1.1rem;">🍰</div>
                            <div>
                                <h3 style="margin:0; font-size:1rem; font-weight:900; color:#1e293b;">${batch.recipeName}</h3>
                                <span class="pending-label" style="font-size:0.7rem; color:#db2777; font-weight:700;">Faltan: ${remaining} <small style="font-weight:400; color:#94a3b8;">(de ${totalNeeded})</small></span>
                            </div>
                        </div>
                        <div class="chevron" style="transition: transform 0.2s ease; transform:${isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'};">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                        </div>
                    </div>
                    <div class="steps-list-container" style="max-height:${isExpanded ? '2000px' : '0'}; overflow:hidden; transition: all 0.3s ease; opacity:${isExpanded ? '1' : '0'};">
                        <div style="padding-top:16px; display:flex; flex-direction:column; gap:12px;">
                            ${recipe.isMissing ? 
                                `<div style="padding:20px; text-align:center; color:#94a3b8; font-size:0.8rem; border:1px dashed #e2e8f0; border-radius:12px;">
                                    ⚠️ No hay una receta configurada para este postre.
                                 </div>` :
                                (recipe.steps || []).map(step => this.renderStepRow(batch.recipeName, step, batch.day, totalNeeded)).join('')
                            }
                        </div>
                    </div>
                `;

                card.onclick = (e) => {
                    if (e.target.closest('input') || e.target.closest('button')) return;
                    const container = card.querySelector('.steps-list-container');
                    const chevron = card.querySelector('.chevron');
                    const isNowExpanded = container.style.maxHeight === '0px';
                    
                    if (!isNowExpanded) {
                        container.style.maxHeight = '0px';
                        container.style.opacity = '0';
                        chevron.style.transform = 'rotate(0deg)';
                        this.expandedRecipes.delete(cardId);
                    } else {
                        container.style.maxHeight = '2000px';
                        container.style.opacity = '1';
                        chevron.style.transform = 'rotate(180deg)';
                        this.expandedRecipes.add(cardId);
                    }
                };

                batchesGrid.appendChild(card);
            });
            grid.appendChild(daySection);
        });
    },

    renderStepRow(recipeName, step, targetDate, totalNeeded) {
        if (!step) return "";
        const inputId = `input-${step.id || Math.random().toString(36).substr(2, 9)}`;
        const producedInWindow = this.producedStepsMap && step.id ? (this.producedStepsMap[`${step.id}_${targetDate}`] || 0) : 0;
        const isDone = producedInWindow >= totalNeeded && totalNeeded > 0;
        
        const timerKey = `${step.id}_${targetDate}`;
        const activeTimer = this.timers[timerKey];
        const isRunning = activeTimer && activeTimer.startTime;
        const elapsed = this.getElapsedSeconds(step.id, targetDate);

        return `
            <div style="background:${isDone ? '#f0fdf4' : '#f8fafc'}; border:1px solid ${isDone ? '#bbf7d0' : '#f1f5f9'}; border-radius:18px; padding:10px; transition: all 0.2s ease;">
                <div class="flex" style="margin-bottom:8px; justify-content:space-between; align-items:center; gap:8px;">
                    <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0;">
                        <button onclick="window.KitchenManager.toggleTimer('${step.id}', '${targetDate}')" 
                            class="press-btn" 
                            style="width:26px; height:26px; border-radius:8px; border:none; display:flex; align-items:center; justify-content:center; background:${isRunning ? '#ef4444' : '#6366f1'}; color:white; padding:0; flex-shrink:0; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
                            ${isRunning ? 
                                '<svg width="10" height="10" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>' : 
                                '<svg width="10" height="10" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>'
                            }
                        </button>
                        <div style="display:flex; flex-direction:column; min-width:0;">
                            <strong style="font-size:0.8rem; color:${isDone ? '#16a34a' : '#334155'}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${step.name || 'Proceso General'}</strong>
                            <div style="display:flex; align-items:center; gap:4px;">
                                <span class="timer-display" data-step-id="${step.id}" data-date="${targetDate}" 
                                    style="font-family:'Courier New', monospace; font-size:0.7rem; color:${isRunning ? '#ef4444' : '#94a3b8'}; font-weight:800; letter-spacing:0.5px;">
                                    ${this.formatDuration(elapsed)}
                                </span>
                                ${isRunning ? '<span style="width:4px; height:4px; background:#ef4444; border-radius:50%; animation: pulse 1.5s infinite;"></span>' : ''}
                            </div>
                        </div>
                    </div>
                    ${producedInWindow > 0 ? `<span style="font-size:0.65rem; color:#16a34a; font-weight:800; background:#dcfce7; padding:2px 8px; border-radius:6px; flex-shrink:0;">✓ Hecho: ${producedInWindow}</span>` : ''}
                </div>
                <div style="display:flex; gap:6px; align-items:center;">
                    <div style="display:flex; flex-direction:column; gap:2px; flex:1;">
                        <small style="font-size:0.6rem; color:#64748b; font-weight:700; text-transform:uppercase; margin-left:4px;">Lote</small>
                        <input type="number" id="${inputId}" value="${Math.max(0, totalNeeded - producedInWindow) || totalNeeded || 1}" min="1" 
                            style="width:100%; padding:7px; border-radius:12px; border:1px solid #e2e8f0; font-weight:800; text-align:center; font-size:0.85rem; outline:none; background:white;"
                            onfocus="this.select()">
                    </div>
                    
                    ${step.produces_ingredient ? `
                    <div style="display:flex; flex-direction:column; gap:2px; flex:1;">
                        <small style="font-size:0.6rem; color:#0ea5e9; font-weight:700; text-transform:uppercase; margin-left:4px;">Obtenido</small>
                        <input type="number" id="${inputId}-produced" placeholder="?"
                            style="width:100%; padding:7px; border-radius:12px; border:1px solid #bae6fd; font-weight:800; text-align:center; font-size:0.85rem; outline:none; background:#f0f9ff"
                            onfocus="this.select()">
                    </div>
                    ` : ''}

                    <div style="display:flex; flex-direction:column; gap:2px; flex:1.2; align-self: flex-end;">
                        <button onclick="window.KitchenManager.produceStep('${step.id || ''}', '${recipeName}', '${step.name || ''}', '${inputId}', '${targetDate}')" 
                            ${!step.id ? 'disabled' : ''}
                            class="press-btn" style="width:100%; background:${isDone ? '#10b981' : '#4f46e5'}; color:white; border:none; padding:9px; border-radius:12px; font-weight:800; font-size:0.75rem; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.15); opacity:${!step.id ? 0.5 : 1};">
                            ${isDone ? 'MÁS' : 'LISTO'}
                        </button>
                    </div>
                </div>
                <div style="margin-top:10px; font-size:0.7rem; color:#94a3b8; border-top:1px solid #eef2f6; padding-top:8px;">
                    ${(step.items || []).map(it => {
                        const key = (it.ingredient || "").toLowerCase().trim();
                        // Get projected stock BEFORE this step
                        const currentProjected = this.virtualStockMap[key] || 0;
                        
                        // Calculate what remains to be produced in this specific step
                        const qtyRemaining = Math.max(0, totalNeeded - producedInWindow);
                        const qtyNeeded = Number(it.qty_per_unit || 0) * qtyRemaining;
                        
                        // Update virtual stock for SUBSEQUENT cards/steps (allow negative)
                        if (qtyNeeded > 0) {
                            this.virtualStockMap[key] = currentProjected - qtyNeeded;
                        }

                        // Highlight if insufficient OR already negative
                        const isLow = (currentProjected < qtyNeeded && qtyNeeded > 0) || currentProjected < 0;
                        
                        return `<div style="display:flex; justify-content:space-between; margin-bottom:2px; ${isLow ? 'color:#ef4444; font-weight:700;' : ''}">
                            <span>• ${it.ingredient}</span>
                            <span>${Number(qtyNeeded).toFixed(2)} / ${Number(currentProjected).toFixed(2)} ${it.unit}</span>
                        </div>`;
                    }).join('')}
                </div>
            </div>
        `;
    },

    async produceStep(stepId, dessertName, stepName, inputId, targetDate) {
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

            const producedInp = document.getElementById(`${inputId}-produced`);
            const producedQty = producedInp ? (Number(producedInp.value) || 0) : 0;

            const res = await window.api('POST', '/api/inventory', {
                action: 'produccion_paso',
                step_id: Number(stepId),
                multiplier: qty,
                produced_qty: producedQty,
                duration_seconds: this.getElapsedSeconds(stepId, targetDate),
                target_date: targetDate,
                actor_name: window.state?.currentUser?.name || window.state?.currentUser?.username || "Cocinero"
            });

            if (res.ok) {
                // Reset timer
                delete this.timers[`${stepId}_${targetDate}`];
                
                if (btn) {
                    btn.innerText = "✅ Hecho";
                    btn.style.background = "#10b981";
                }
                let toastMsg = `✅ Producido: ${qty} de ${dessertName} (${stepName || 'General'})`;
                if (res.produced) {
                    toastMsg += ` + ${res.produced.qty} ${res.produced.ingredient} al stock.`;
                }
                window.showToast(toastMsg, "success");
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
        cont.innerHTML = '';

        if (!this.history || this.history.length === 0) {
            cont.innerHTML = '<div style="text-align:center; padding:20px; color:#94a3b8; font-size:0.9rem; background:#f8fafc; border-radius:16px; border:1px dashed #e2e8f0;">No hay producción registrada en este periodo.</div>';
            return;
        }

        // Group history by action (note + created_at window)
        const actions = [];
        
        // Sort history by date DESC
        const sortedHistory = [...this.history].sort((a,b) => b.created_at.localeCompare(a.created_at));
        
        sortedHistory.forEach(m => {
            const t = new Date(m.created_at).getTime();
            // Find if there's an existing action with the same note and within 10 seconds
            const existing = actions.find(a => 
                a.note === m.note && 
                Math.abs(new Date(a.created_at).getTime() - t) < 10000
            );
            
            if (!existing) {
                actions.push({
                    note: m.note,
                    created_at: m.created_at,
                    actor: m.actor_name,
                    target_date: m.metadata?.target_date,
                    ids: [m.id]
                });
            } else {
                existing.ids.push(m.id);
            }
        });

        actions.slice(0, 20).forEach(action => {
            const row = document.createElement('div');
            row.style = "background:white; border:1px solid #f1f5f9; border-radius:16px; padding:12px 16px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 2px 4px rgba(0,0,0,0.02); margin-bottom:8px;";
            
            const time = new Date(action.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const date = new Date(action.created_at).toLocaleDateString([], { day: '2-digit', month: 'short' });
            
            row.innerHTML = `
                <div style="display:flex; align-items:center; gap:12px;">
                    <div style="width:40px; height:40px; background:#f0fdf4; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:1.2rem;">🍳</div>
                    <div>
                        <div style="font-weight:700; font-size:0.9rem; color:#1e293b;">${action.note}</div>
                        <div style="font-size:0.75rem; color:#94a3b8;">
                            ${date} ${time} • ${action.actor || 'Cocinero'} 
                            ${action.target_date ? `• <span style="color:var(--primary); font-weight:600;">Para: ${action.target_date}</span>` : ''}
                        </div>
                    </div>
                </div>
                <button 
                    data-ids='${JSON.stringify(action.ids)}' 
                    data-note="${action.note.replace(/"/g, '&quot;')}"
                    onclick="window.KitchenManager.showDeleteConfirm(event)" 
                    class="press-btn" style="background:#fee2e2; color:#ef4444; border:none; width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:1rem; transition:all 0.2s;">
                    🗑️
                </button>
            `;
            cont.appendChild(row);
        });
    },

    async deleteProduction(ids, note) {
        if (!ids || !ids.length) {
            window.showToast("No se encontraron registros para eliminar", "error");
            return;
        }

        try {
            console.log("KITCHEN: Deleting production ids:", ids, "note:", note);
            window.showToast("Eliminando...", "info");
            
            const res = await window.api('POST', '/api/inventory', {
                action: 'delete_production',
                ids: ids
            });

            console.log("KITCHEN: Delete result:", res);
            
            if (res && res.ok) {
                const count = res.deletedCount || ids.length;
                window.showToast(`✅ Eliminados ${count} registros`, "success");
                
                // Small delay to ensure DB consistency before reload
                setTimeout(async () => {
                    await this.loadData();
                }, 500);
            } else {
                throw new Error((res && res.error) || "La respuesta del servidor no fue exitosa");
            }
        } catch (err) {
            console.error("KITCHEN: Delete Production Error:", err);
            window.showToast("Error al eliminar: " + (err.message || "Error desconocido"), "error");
        }
    },

    showDeleteConfirm(ev) {
        ev.stopPropagation();
        const btn = ev.currentTarget;
        const ids = JSON.parse(btn.dataset.ids || '[]');
        const note = btn.dataset.note || '';

        // Remove existing popovers
        const existing = document.querySelectorAll('.delete-popover');
        existing.forEach(p => p.remove());

        const pop = document.createElement('div');
        pop.className = 'delete-popover';
        pop.style = `
            position: fixed;
            background: white;
            border: 1px solid #fee2e2;
            box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
            border-radius: 12px;
            padding: 12px;
            z-index: 10000;
            display: flex;
            flex-direction: column;
            gap: 8px;
            width: 140px;
        `;
        
        // Position popover relative to the button
        const rect = btn.getBoundingClientRect();
        // If there's enough space on the left, show it there, otherwise on the right
        if (rect.left > 160) {
            pop.style.left = (rect.left - 150) + 'px';
        } else {
            pop.style.left = (rect.right + 10) + 'px';
        }
        pop.style.top = (rect.top - 10) + 'px';

        pop.innerHTML = `
            <div style="font-size:0.75rem; font-weight:700; color:#1e293b; text-align:center; margin-bottom:4px;">¿Eliminar registro?</div>
            <div style="display:flex; gap:8px;">
                <button id="confirm-del-btn" class="press-btn" style="flex:1; background:#ef4444; color:white; border:none; padding:10px 4px; border-radius:10px; font-size:0.75rem; font-weight:700;">Sí</button>
                <button id="cancel-del-btn" class="press-btn" style="flex:1; background:#f1f5f9; color:#475569; border:none; padding:10px 4px; border-radius:10px; font-size:0.75rem; font-weight:700;">No</button>
            </div>
        `;

        document.body.appendChild(pop);

        const confirmBtn = pop.querySelector('#confirm-del-btn');
        confirmBtn.onclick = async (e) => {
            e.stopPropagation();
            confirmBtn.disabled = true;
            confirmBtn.textContent = '...';
            await this.deleteProduction(ids, note);
            pop.remove();
        };
        pop.querySelector('#cancel-del-btn').onclick = (e) => {
            e.stopPropagation();
            pop.remove();
        };

        const outside = (e) => {
            if (!pop.contains(e.target)) {
                pop.remove();
                document.removeEventListener('click', outside);
            }
        };
        setTimeout(() => document.addEventListener('click', outside), 10);
    }
};

window.KitchenManager = KitchenManager;
