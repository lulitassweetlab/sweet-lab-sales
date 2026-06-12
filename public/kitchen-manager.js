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

            // 6. Load Production Logs
            await this.loadProductionLogs();

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

    startTimerForStep(stepId, targetDate) {
        const key = `${stepId}_${targetDate}`;
        if (!this.timers[key]) this.timers[key] = { elapsedBefore: 0 };
        this.timers[key].startTime = Date.now();
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

    async loadProductionLogs() {
        try {
            const logs = await window.api('GET', `/api/inventory?action=get_production_logs&_t=${Date.now()}`) || [];
            this.productionLogsByStep = {};
            this.productionLogsRaw = logs;
            logs.forEach(log => {
                const sid = log.step_id;
                if (!this.productionLogsByStep[sid]) {
                    this.productionLogsByStep[sid] = [];
                }
                this.productionLogsByStep[sid].push(log);
            });
            console.log("📊 Loaded production logs:", logs.length);
        } catch (err) {
            console.warn("Could not load production logs:", err);
            this.productionLogsByStep = {};
            this.productionLogsRaw = [];
        }
    },

    getAverageTimePerUnit(stepId) {
        if (!stepId || !this.productionLogsByStep) return null;
        const logs = this.productionLogsByStep[stepId] || [];
        if (logs.length === 0) return null;
        let totalSeconds = 0;
        let totalQty = 0;
        logs.forEach(log => {
            totalSeconds += Number(log.duration_seconds || 0);
            totalQty += Number(log.qty || 0);
        });
        return totalQty > 0 ? (totalSeconds / totalQty) : null;
    },

    getAverageTimeForQty(stepId, qty) {
        const avgPerUnit = this.getAverageTimePerUnit(stepId);
        if (avgPerUnit === null) return null;
        return Math.round(avgPerUnit * qty);
    },

    showProductionLogsPopover(stepId, titleName) {
        const existing = document.getElementById('production-logs-modal');
        if (existing) existing.remove();

        const logs = (this.productionLogsRaw || []).filter(l => l.step_id === Number(stepId));

        const backdrop = document.createElement('div');
        backdrop.id = 'production-logs-modal';
        backdrop.style = `
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(15, 23, 42, 0.4);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            z-index: 100000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            animation: fadeIn 0.2s ease-out;
        `;

        const modal = document.createElement('div');
        modal.style = `
            background: rgba(255, 255, 255, 0.85);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.4);
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04), inset 0 1px 1px 0 rgba(255, 255, 255, 0.8);
            border-radius: 24px;
            max-width: 500px;
            width: 100%;
            padding: 24px;
            display: flex;
            flex-direction: column;
            gap: 16px;
            animation: scaleUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            color: #1e293b;
        `;

        if (!document.getElementById('kitchen-modal-styles')) {
            const style = document.createElement('style');
            style.id = 'kitchen-modal-styles';
            style.textContent = `
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes scaleUp { from { transform: scale(0.9) translateY(10px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
            `;
            document.head.appendChild(style);
        }

        const header = document.createElement('div');
        header.style = "display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid rgba(226, 232, 240, 0.8); padding-bottom: 12px;";
        header.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:4px;">
                <h3 style="margin:0; font-size:1.35rem; font-weight:900; color:#0f172a;">Historial de Producción</h3>
                <span style="font-size:0.95rem; color:#64748b; font-weight:600;">${titleName}</span>
            </div>
            <button onclick="document.getElementById('production-logs-modal').remove()" 
                class="press-btn" style="border:none; background:rgba(241,245,249,0.8); color:#64748b; font-size:18px; font-weight:700; width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer;">
                ✕
            </button>
        `;
        modal.appendChild(header);

        const listContainer = document.createElement('div');
        listContainer.style = "max-height: 350px; overflow-y: auto; display:flex; flex-direction:column; gap:12px; padding-right: 4px;";

        if (logs.length === 0) {
            listContainer.innerHTML = `
                <div style="text-align:center; padding:32px 16px; color:#94a3b8; font-size:1.1rem; display:flex; flex-direction:column; gap:8px;">
                    <span>🥞</span>
                    <span>No hay registros anteriores de producción para este paso.</span>
                </div>
            `;
        } else {
            logs.forEach(log => {
                const date = new Date(log.created_at);
                const dateStr = date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                const duration = this.formatDuration(log.duration_seconds);
                const perUnit = log.qty > 0 ? this.formatDuration(Math.round(log.duration_seconds / log.qty)) : 'N/D';

                const card = document.createElement('div');
                card.id = `prod-log-row-${log.id}`;
                card.style = `
                    background: rgba(255, 255, 255, 0.6);
                    border: 1px solid rgba(226, 232, 240, 0.8);
                    border-radius: 14px;
                    padding: 12px 16px;
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                `;
                card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:0.9rem; color:#94a3b8; font-weight:600;">${dateStr}</span>
                        <div style="display:flex; align-items:center; gap:10px;">
                            <span style="font-size:0.95rem; color:#64748b; font-weight:700; background:rgba(241,245,249,0.8); padding:2px 8px; border-radius:6px;">👨‍🍳 ${log.actor_name || 'Cocinero'}</span>
                            <button onclick="window.KitchenManager.editProductionLog(${log.id}, ${stepId}, '${titleName.replace(/'/g, "\\'")}')" 
                                class="press-btn" style="border:none; background:transparent; font-size:16px; cursor:pointer; padding:2px;" title="Editar registro">
                                ✏️
                            </button>
                            <button onclick="window.KitchenManager.deleteProductionLog(${log.id}, ${stepId}, '${titleName.replace(/'/g, "\\'")}')" 
                                class="press-btn" style="border:none; background:transparent; font-size:16px; cursor:pointer; padding:2px;" title="Eliminar registro">
                                🗑️
                            </button>
                        </div>
                    </div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr 1.2fr; gap:10px; margin-top:4px;">
                        <div style="display:flex; flex-direction:column;">
                            <span style="font-size:0.85rem; color:#94a3b8; text-transform:uppercase; font-weight:700;">Lote</span>
                            <span style="font-size:1.15rem; font-weight:800; color:#1e293b;">${log.qty} uds</span>
                        </div>
                        <div style="display:flex; flex-direction:column;">
                            <span style="font-size:0.85rem; color:#94a3b8; text-transform:uppercase; font-weight:700;">Tiempo</span>
                            <span style="font-size:1.15rem; font-weight:800; color:#4f46e5;">${duration}</span>
                        </div>
                        <div style="display:flex; flex-direction:column;">
                            <span style="font-size:0.85rem; color:#94a3b8; text-transform:uppercase; font-weight:700;">Tiempo / U.</span>
                            <span style="font-size:1.15rem; font-weight:800; color:#10b981;">${perUnit}</span>
                        </div>
                    </div>
                `;
                listContainer.appendChild(card);
            });
        }
        modal.appendChild(listContainer);

        backdrop.appendChild(modal);

        backdrop.onclick = (e) => {
            if (e.target === backdrop) {
                backdrop.remove();
            }
        };

        document.body.appendChild(backdrop);
    },

    editProductionLog(logId, stepId, titleName) {
        const log = (this.productionLogsRaw || []).find(l => l.id === Number(logId));
        if (!log) return;

        const rowEl = document.getElementById(`prod-log-row-${logId}`);
        if (!rowEl) return;

        const minutes = Math.floor(log.duration_seconds / 60);
        const seconds = log.duration_seconds % 60;

        rowEl.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:6px; margin-bottom:8px;">
                <span style="font-size:1rem; color:#64748b; font-weight:700;">Editar Registro</span>
                <div style="display:flex; gap:6px;">
                    <button onclick="window.KitchenManager.saveProductionLog(${logId}, ${stepId}, '${titleName.replace(/'/g, "\\'")}')" 
                        class="press-btn" style="border:none; background:#10b981; color:white; padding:6px 12px; border-radius:6px; font-size:1rem; font-weight:700; cursor:pointer;">
                        Guardar
                    </button>
                    <button onclick="window.KitchenManager.showProductionLogsPopover(${stepId}, '${titleName.replace(/'/g, "\\'")}')" 
                        class="press-btn" style="border:none; background:#cbd5e1; color:#1e293b; padding:6px 12px; border-radius:6px; font-size:1rem; font-weight:700; cursor:pointer;">
                        Cancelar
                    </button>
                </div>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px;">
                <div style="display:flex; flex-direction:column; gap:4px;">
                    <span style="font-size:0.85rem; color:#94a3b8; text-transform:uppercase; font-weight:700;">Lote</span>
                    <input type="number" id="edit-log-qty-${logId}" value="${log.qty}" min="1" 
                        style="width:100%; padding:8px; border-radius:8px; border:1px solid #cbd5e1; font-size:1.1rem; font-weight:700; text-align:center; outline:none;">
                </div>
                <div style="display:flex; flex-direction:column; gap:4px;">
                    <span style="font-size:0.85rem; color:#94a3b8; text-transform:uppercase; font-weight:700;">Minutos</span>
                    <input type="number" id="edit-log-min-${logId}" value="${minutes}" min="0" 
                        style="width:100%; padding:8px; border-radius:8px; border:1px solid #cbd5e1; font-size:1.1rem; font-weight:700; text-align:center; outline:none;">
                </div>
                <div style="display:flex; flex-direction:column; gap:4px;">
                    <span style="font-size:0.85rem; color:#94a3b8; text-transform:uppercase; font-weight:700;">Segundos</span>
                    <input type="number" id="edit-log-sec-${logId}" value="${seconds}" min="0" max="59" 
                        style="width:100%; padding:8px; border-radius:8px; border:1px solid #cbd5e1; font-size:1.1rem; font-weight:700; text-align:center; outline:none;">
                </div>
            </div>
        `;
    },

    async saveProductionLog(logId, stepId, titleName) {
        const qtyInp = document.getElementById(`edit-log-qty-${logId}`);
        const minInp = document.getElementById(`edit-log-min-${logId}`);
        const secInp = document.getElementById(`edit-log-sec-${logId}`);

        if (!qtyInp || !minInp || !secInp) return;

        const qty = Number(qtyInp.value) || 0;
        const minutes = Number(minInp.value) || 0;
        const seconds = Number(secInp.value) || 0;
        const duration = (minutes * 60) + seconds;

        if (qty <= 0) return window.showToast("Ingresa una cantidad de lote válida", "warning");
        if (duration <= 0) return window.showToast("Ingresa un tiempo válido", "warning");

        try {
            const res = await window.api('POST', '/api/inventory', {
                action: 'update_production_log',
                log_id: logId,
                qty: qty,
                duration_seconds: duration
            });

            if (res.ok) {
                const logIndex = (this.productionLogsRaw || []).findIndex(l => l.id === Number(logId));
                if (logIndex !== -1) {
                    this.productionLogsRaw[logIndex].qty = qty;
                    this.productionLogsRaw[logIndex].duration_seconds = duration;
                }

                this.productionLogsByStep = {};
                this.productionLogsRaw.forEach(l => {
                    const sid = l.step_id;
                    if (!this.productionLogsByStep[sid]) {
                        this.productionLogsByStep[sid] = [];
                    }
                    this.productionLogsByStep[sid].push(l);
                });

                window.showToast("✅ Registro de producción actualizado", "success");

                const badge = document.querySelector(`.average-time-badge[data-step-id="${stepId}"]`);
                if (badge) {
                    const avgValSpan = badge.querySelector('.avg-val');
                    const inputElement = document.querySelector(`input[data-step-id="${stepId}"]`);
                    const multiplier = inputElement ? (Number(inputElement.value) || 1) : 1;

                    const newBaseAvg = this.getAverageTimePerUnit(stepId) || 0;
                    avgValSpan.setAttribute('data-base-avg', newBaseAvg);

                    const newTotalSeconds = Math.round(newBaseAvg * multiplier);
                    avgValSpan.textContent = this.formatDuration(newTotalSeconds);
                }

                this.showProductionLogsPopover(stepId, titleName);
            } else {
                throw new Error(res.error || "No se pudo actualizar");
            }
        } catch (err) {
            console.error("Save Log Error:", err);
            window.showToast("Error al guardar: " + err.message, "error");
        }
    },

    async deleteProductionLog(logId, stepId, titleName) {
        if (!confirm("¿Estás seguro de que deseas eliminar este registro de tiempo? (Esto no afectará el inventario físico de insumos)")) {
            return;
        }

        try {
            window.notify.info("Eliminando...");
            const res = await window.api('POST', '/api/inventory', {
                action: 'delete_production_log',
                log_id: logId
            });

            if (res.ok) {
                this.productionLogsRaw = (this.productionLogsRaw || []).filter(l => l.id !== Number(logId));

                this.productionLogsByStep = {};
                this.productionLogsRaw.forEach(l => {
                    const sid = l.step_id;
                    if (!this.productionLogsByStep[sid]) {
                        this.productionLogsByStep[sid] = [];
                    }
                    this.productionLogsByStep[sid].push(l);
                });

                window.showToast("✅ Registro de tiempo eliminado", "success");

                const badge = document.querySelector(`.average-time-badge[data-step-id="${stepId}"]`);
                if (badge) {
                    const avgValSpan = badge.querySelector('.avg-val');
                    const inputElement = document.querySelector(`input[data-step-id="${stepId}"]`);
                    const multiplier = inputElement ? (Number(inputElement.value) || 1) : 1;

                    const newBaseAvg = this.getAverageTimePerUnit(stepId);
                    if (newBaseAvg !== null) {
                        avgValSpan.setAttribute('data-base-avg', newBaseAvg);
                        const newTotalSeconds = Math.round(newBaseAvg * multiplier);
                        avgValSpan.textContent = this.formatDuration(newTotalSeconds);
                    } else {
                        badge.style.display = 'none';
                    }
                }

                this.showProductionLogsPopover(stepId, titleName);
            } else {
                throw new Error(res.error || "No se pudo eliminar");
            }
        } catch (err) {
            console.error("Delete Log Error:", err);
            window.showToast("Error al eliminar: " + err.message, "error");
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
        
        // Sum totals per dessert across all batches, accounting for already produced quantities
        const totals = {};
        this.batches.forEach(batch => {
            const recipe = this.recipes.find(r => r.name === batch.recipeName);
            let minProduced = 0;
            
            // If the recipe has steps, check how many have been produced for this specific batch date
            if (recipe && recipe.steps && recipe.steps.length > 0) {
                const stepTotals = recipe.steps.map(s => this.producedStepsMap[`${s.id}_${batch.day}`] || 0);
                minProduced = Math.min(...stepTotals);
            }
            
            // Calculate what is truly remaining to produce for this batch
            const remaining = Math.max(0, batch.total - minProduced);
            
            if (remaining > 0) {
                totals[batch.recipeName] = (totals[batch.recipeName] || 0) + remaining;
            }
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
                                <h3 style="margin:0; font-size:1.1rem; font-weight:900; color:#1e293b;">${batch.recipeName}</h3>
                                <span class="pending-label" style="font-size:0.75rem; color:#db2777; font-weight:700;">Faltan: ${remaining} <small style="font-weight:400; color:#94a3b8;">(de ${totalNeeded})</small></span>
                            </div>
                        </div>
                        <div class="chevron" style="transition: transform 0.2s ease; transform:${isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'};">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                        </div>
                    </div>
                    <div class="steps-list-container" style="max-height:${isExpanded ? '2000px' : '0'}; overflow:hidden; transition: all 0.3s ease; opacity:${isExpanded ? '1' : '0'};">
                        <div style="padding-top:16px; display:flex; flex-direction:column; gap:12px;">
                            ${batch.recipeName.toLowerCase().includes('oreo') ? (() => {
                                // Consolidation logic ONLY for Oreo
                                const consolidated = {};
                                recipe.steps.forEach(s => {
                                    (s.items || []).forEach(it => {
                                        const key = it.ingredient.trim();
                                        if (!consolidated[key]) consolidated[key] = { qty: 0, unit: it.unit };
                                        consolidated[key].qty += (Number(it.qty_per_unit) || 0) * totalNeeded;
                                    });
                                });
                                const entries = Object.entries(consolidated);
                                if (entries.length === 0) return '';
                                return `
                                    <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:12px; padding:12px; margin-bottom:8px;">
                                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px; color:#0369a1;">
                                            <span style="font-size:1.2rem;">💡</span>
                                            <strong style="font-size:0.85rem; text-transform:uppercase; letter-spacing:0.5px;">Consolidado de Insumos (Oreo)</strong>
                                        </div>
                                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                                            ${entries.map(([name, info]) => `
                                                <div style="display:flex; flex-direction:column; background:white; padding:6px 10px; border-radius:8px; border:1px solid #e0f2fe;">
                                                    <span style="font-size:0.65rem; color:#64748b; font-weight:700; text-transform:uppercase;">${name}</span>
                                                    <strong style="font-size:0.9rem; color:#0369a1;">${info.qty.toLocaleString()} ${info.unit}</strong>
                                                </div>
                                            `).join('')}
                                        </div>
                                    </div>
                                `;
                            })() : ''}
                            
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
                    if (e.target.closest('input') || e.target.closest('button') || e.target.closest('.average-time-badge')) return;
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

    toggleIngredientEdit(inputId) {
        const cont = document.getElementById(`ingredients-container-${inputId}`);
        if (!cont) return;
        const readOnly = cont.querySelector('.ingredients-readonly');
        const edit = cont.querySelector('.ingredients-edit');
        
        if (readOnly.style.display !== 'none') {
            readOnly.style.display = 'none';
            edit.style.display = 'flex';
            cont.classList.add('is-editing');
        } else {
            readOnly.style.display = 'block';
            edit.style.display = 'none';
            cont.classList.remove('is-editing');
        }
    },

    recalculateIngredients(inputId) {
        const loteInput = document.getElementById(inputId);
        if (!loteInput) return;
        const multiplier = Number(loteInput.value) || 0;
        
        const stepId = loteInput.getAttribute('data-step-id');
        const targetDate = loteInput.getAttribute('data-date');
        if (stepId && targetDate) {
            this.customQuantities = this.customQuantities || {};
            this.customQuantities[`${stepId}_${targetDate}`] = multiplier;
        }
        
        const cont = document.getElementById(`ingredients-container-${inputId}`);
        if (!cont) return;
        
        // Update readonly
        cont.querySelectorAll('.ingredients-readonly .qty-calc').forEach(span => {
            const base = Number(span.getAttribute('data-base')) || 0;
            span.textContent = (base * multiplier).toFixed(2);
        });
        
        // Update edit mode
        cont.querySelectorAll('.ingredients-edit .ing-qty[data-base]').forEach(inp => {
            const base = Number(inp.getAttribute('data-base')) || 0;
            inp.value = (base * multiplier).toFixed(2);
        });

        // Update average time dynamically if the badge exists
        const stepBlock = loteInput.closest('div').parentElement.parentElement;
        if (stepBlock) {
            const avgValSpan = stepBlock.querySelector('.avg-val');
            if (avgValSpan) {
                const baseAvg = Number(avgValSpan.getAttribute('data-base-avg')) || 0;
                const newSeconds = Math.round(baseAvg * multiplier);
                avgValSpan.textContent = this.formatDuration(newSeconds);
            }
        }
    },

    addExtraIngredientRow(inputId) {
        const cont = document.getElementById(`extra-ing-container-${inputId}`);
        if (!cont) return;
        
        // Build a select with all inventory items
        let optionsHtml = '<option value="">Selecciona...</option>';
        const uniqueItems = new Map();
        (this.inventory || []).forEach(inv => {
            if (inv.ingredient) {
                const name = inv.ingredient.trim();
                const key = name.toLowerCase();
                if (!uniqueItems.has(key)) {
                    uniqueItems.set(key, { name: name, unit: inv.unit || 'g' });
                }
            }
        });
        
        const sortedItems = Array.from(uniqueItems.values()).sort((a,b) => a.name.localeCompare(b.name));
        sortedItems.forEach(it => {
            optionsHtml += `<option value="${it.name}" data-unit="${it.unit}">${it.name} (${it.unit})</option>`;
        });
        
        const row = document.createElement('div');
        row.className = 'custom-ing-row extra-ing-row';
        row.style = "display:flex; align-items:center; gap:8px; justify-content:space-between;";
        row.innerHTML = `
            <select class="ing-name-select" style="flex:1; padding:4px; border:1px solid #cbd5e1; border-radius:6px; font-size:12px; width:100px; text-overflow:ellipsis;" onchange="this.parentElement.querySelector('.ing-name').value = this.value; this.parentElement.querySelector('.ing-unit').value = this.options[this.selectedIndex].getAttribute('data-unit') || 'u'; this.parentElement.querySelector('.unit-display').textContent = this.options[this.selectedIndex].getAttribute('data-unit') || 'u';">
                ${optionsHtml}
            </select>
            <input type="hidden" class="ing-name" value="">
            <input type="hidden" class="ing-unit" value="u">
            <input type="number" class="ing-qty" placeholder="0" style="width:70px; padding:4px; border:1px solid #cbd5e1; border-radius:6px; text-align:right;">
            <span class="unit-display" style="width:20px; font-size:12px;">u</span>
            <button type="button" class="press-btn" onclick="this.parentElement.remove()" style="padding:4px 8px; font-size:10px; background:#f1f5f9; color:#ef4444; border:none; border-radius:6px;">❌</button>
        `;
        cont.appendChild(row);
    },

    renderStepRow(recipeName, step, targetDate, totalNeeded) {
        if (!step) return "";
        const inputId = `input-${step.id || Math.random().toString(36).substr(2, 9)}`;
        const producedInWindow = this.producedStepsMap && step.id ? (this.producedStepsMap[`${step.id}_${targetDate}`] || 0) : 0;
        
        const timerKey = `${step.id}_${targetDate}`;
        const activeTimer = this.timers[timerKey];
        const isRunning = activeTimer && activeTimer.startTime;
        const elapsed = this.getElapsedSeconds(step.id, targetDate);
        const isStepActive = isRunning || elapsed > 0;

        const isDone = producedInWindow >= totalNeeded && totalNeeded > 0 && !isStepActive;

        this.customQuantities = this.customQuantities || {};
        const savedQty = this.customQuantities[timerKey];
        let defaultQty;
        if (savedQty !== undefined) {
            defaultQty = savedQty;
        } else {
            defaultQty = Math.max(0, totalNeeded - producedInWindow) || totalNeeded || 1;
        }

        const hasIngredients = step.items && step.items.length > 0;
        const btnTextDone = hasIngredients ? 'Producir Más' : 'Completar Más';
        const btnTextPending = hasIngredients ? 'Producir' : 'Completar';

        const avgSeconds = this.getAverageTimeForQty(step.id, defaultQty);
        let averageTimeHtml = "";
        if (avgSeconds !== null) {
            averageTimeHtml = `
                <span class="average-time-badge" 
                    onclick="event.stopPropagation(); window.KitchenManager.showProductionLogsPopover(${step.id}, '${recipeName} - ${step.name || 'General'}')"
                    style="position:absolute; top:12px; right:12px; font-size:1.05rem; color:#64748b; font-weight:700; background:#f1f5f9; padding:4px 10px; border-radius:8px; cursor:pointer; transition:all 0.2s; display:inline-flex; align-items:center; gap:4px; border:1px solid #e2e8f0; pointer-events:auto; z-index:10;"
                    onmouseover="this.style.background='#e2e8f0'; this.style.color='#1e293b';"
                    onmouseout="this.style.background='#f1f5f9'; this.style.color='#64748b';"
                    title="Ver historial de producción"
                    data-step-id="${step.id}">
                    ⏱️ Promedio: <span class="avg-val" data-base-avg="${this.getAverageTimePerUnit(step.id)}">${this.formatDuration(avgSeconds)}</span>
                </span>
            `;
        }

        let actionButtonsHtml = "";
        if (isDone) {
            actionButtonsHtml = `
                <button onclick="window.KitchenManager.startTimerForStep('${step.id}', '${targetDate}')" 
                    class="press-btn" style="width:100%; background:#10b981; color:white; border:none; padding:12px; border-radius:12px; font-weight:700; font-size:1.25rem; box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.2);">
                    ${btnTextDone}
                </button>
            `;
        } else {
            if (isRunning) {
                actionButtonsHtml = `
                    <div style="display:flex; gap:8px; width:100%;">
                        <button onclick="window.KitchenManager.toggleTimer('${step.id}', '${targetDate}')" 
                            class="press-btn" style="flex:1; background:#f59e0b; color:white; border:none; padding:12px; border-radius:12px; font-size:1.3rem; display:flex; align-items:center; justify-content:center;" title="Pausar">
                            ⏸
                        </button>
                        <button onclick="window.KitchenManager.produceStep('${step.id || ''}', '${recipeName}', '${step.name || ''}', '${inputId}', '${targetDate}')" 
                            class="press-btn" style="flex:1.2; background:#ef4444; color:white; border:none; padding:12px; border-radius:12px; font-size:1.3rem; display:flex; align-items:center; justify-content:center;" title="Completar y Detener">
                            ⏹
                        </button>
                    </div>
                `;
            } else if (elapsed > 0) {
                actionButtonsHtml = `
                    <div style="display:flex; gap:8px; width:100%;">
                        <button onclick="window.KitchenManager.toggleTimer('${step.id}', '${targetDate}')" 
                            class="press-btn" style="flex:1; background:#4f46e5; color:white; border:none; padding:12px; border-radius:12px; font-size:1.3rem; display:flex; align-items:center; justify-content:center;" title="Reanudar">
                            ▶
                        </button>
                        <button onclick="window.KitchenManager.produceStep('${step.id || ''}', '${recipeName}', '${step.name || ''}', '${inputId}', '${targetDate}')" 
                            class="press-btn" style="flex:1.2; background:#ef4444; color:white; border:none; padding:12px; border-radius:12px; font-size:1.3rem; display:flex; align-items:center; justify-content:center;" title="Completar y Detener">
                            ⏹
                        </button>
                    </div>
                `;
            } else {
                actionButtonsHtml = `
                    <button onclick="window.KitchenManager.startTimerForStep('${step.id}', '${targetDate}')" 
                        ${!step.id ? 'disabled' : ''}
                        class="press-btn" style="width:100%; background:#4f46e5; color:white; border:none; padding:12px; border-radius:12px; font-weight:700; font-size:1.25rem; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2); opacity:${!step.id ? 0.5 : 1};">
                        ${btnTextPending}
                    </button>
                `;
            }
        }

        return `
            <div style="position:relative; background:${isDone ? '#f0fdf4' : '#f8fafc'}; border:1px solid ${isDone ? '#bbf7d0' : '#e2e8f0'}; border-radius:16px; padding:16px; transition: all 0.2s ease;">
                <div class="flex" style="margin-bottom:12px; justify-content:space-between; align-items:center; gap:10px;">
                    <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0; padding-right:120px;">
                        <div style="display:flex; align-items:baseline; gap:10px; min-width:0; flex:1;">
                            <strong style="font-size:1.55rem; color:${isDone ? '#16a34a' : '#1e293b'}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:800; display:inline-flex; align-items:center;">
                                ${step.name || 'Proceso General'}
                                ${producedInWindow > 0 ? `<span style="font-size:1.1rem; color:#16a34a; font-weight:900; background:#dcfce7; padding:3px 8px; border-radius:8px; margin-left:8px; display:inline-block; vertical-align:middle; line-height:1;">✓ ${producedInWindow}</span>` : ''}
                            </strong>
                            <span class="timer-display" data-step-id="${step.id}" data-date="${targetDate}" 
                                style="font-family:monospace; font-size:1.3rem; color:${isRunning ? '#ef4444' : '#64748b'}; font-weight:700; letter-spacing:0.5px;">
                                ${this.formatDuration(elapsed)}
                            </span>
                            ${isRunning ? '<span style="width:6px; height:6px; background:#ef4444; border-radius:50%; animation: pulse 1.5s infinite; flex-shrink:0;"></span>' : ''}
                        </div>
                    </div>
                    ${averageTimeHtml}
                </div>
                <div style="display:flex; gap:10px; align-items:center;">
                    <div style="display:flex; flex-direction:column; gap:4px; flex:1;">
                        <small style="font-size:0.95rem; color:#64748b; font-weight:600;">Lote</small>
                        <input type="number" id="${inputId}" 
                            data-step-id="${step.id || ''}" 
                            data-date="${targetDate}"
                            value="${defaultQty}" min="1" 
                            style="width:100%; padding:10px; border-radius:12px; border:1px solid #cbd5e1; font-weight:700; text-align:center; font-size:1.25rem; outline:none;"
                            onfocus="this.select()"
                            oninput="window.KitchenManager.recalculateIngredients('${inputId}')">
                    </div>
                    
                    ${step.produces_ingredient ? `
                    <div style="display:flex; flex-direction:column; gap:4px; flex:1;">
                        <small style="font-size:0.95rem; color:#0ea5e9; font-weight:600;">Obtenido</small>
                        <input type="number" id="${inputId}-produced" placeholder="?"
                            style="width:100%; padding:10px; border-radius:12px; border:1px solid #0ea5e9; font-weight:700; text-align:center; font-size:1.25rem; outline:none; background:rgba(14,165,233,0.02)"
                            onfocus="this.select()">
                    </div>
                    ` : ''}

                    <div style="display:flex; flex-direction:column; gap:4px; flex:1.2; align-self: flex-end;">
                        ${actionButtonsHtml}
                    </div>
                </div>
                <div id="ingredients-container-${inputId}" style="margin-top:14px; font-size:1.1rem; color:#94a3b8; border-top:1px solid #eef2f6; padding-top:10px;">
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 8px;">
                        <span style="font-size:1.05rem; font-weight:700; color:#64748b; text-transform:uppercase;">Insumos a descontar</span>
                        ${hasIngredients ? `<button type="button" class="press-btn" onclick="window.KitchenManager.toggleIngredientEdit('${inputId}')" style="padding:4px 10px; font-size:15px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; color:var(--text);">✏️ Ajustar</button>` : ''}
                    </div>
                    
                    <div class="ingredients-readonly" style="font-size:1.2rem; line-height:1.5; color:#334155; margin-top:4px;">
                        ${(step.items || []).map(it => {
                            const key = (it.ingredient || "").toLowerCase().trim();
                            const currentProjected = this.virtualStockMap[key] || 0;
                            const qtyNeeded = Number(it.qty_per_unit || 0) * defaultQty;
                            
                            if (qtyNeeded > 0 && !isDone) {
                                this.virtualStockMap[key] = currentProjected - qtyNeeded;
                            }

                            const isLow = (currentProjected < qtyNeeded && qtyNeeded > 0 && !isDone) || currentProjected < 0;
                            
                            return `<div style="display:flex; justify-content:space-between; margin-bottom:6px; ${isLow ? 'color:#ef4444; font-weight:700;' : ''}">
                                <span style="font-weight:500;">• ${it.ingredient}</span>
                                <span><span class="qty-calc" data-base="${it.qty_per_unit}" style="font-weight:700; color:#1e293b;">${Number(qtyNeeded).toFixed(2)}</span> / ${Number(currentProjected).toFixed(2)} ${it.unit}</span>
                            </div>`;
                        }).join('')}
                    </div>
                    
                    <div class="ingredients-edit" style="display:none; flex-direction:column; gap:10px;">
                        ${(step.items || []).map(it => {
                            const qtyNeeded = Number(it.qty_per_unit || 0) * defaultQty;
                            return `
                            <div style="display:flex; align-items:center; gap:8px; justify-content:space-between;" class="custom-ing-row">
                                <strong style="color:var(--text); flex:1; overflow:hidden; text-overflow:ellipsis; font-size:1.15rem;">${it.ingredient}</strong>
                                <input type="hidden" class="ing-name" value="${it.ingredient}">
                                <input type="hidden" class="ing-unit" value="${it.unit}">
                                <input type="number" class="ing-qty" data-base="${it.qty_per_unit}" value="${Number(qtyNeeded).toFixed(2)}" style="width:80px; padding:6px; border:1px solid #cbd5e1; border-radius:8px; text-align:right; font-size:1.15rem;">
                                <span style="font-size:1.15rem;">${it.unit}</span>
                                <button type="button" class="press-btn" onclick="this.parentElement.remove()" style="padding:6px 10px; font-size:14px; background:#f1f5f9; color:#ef4444; border:none; border-radius:8px;">❌</button>
                            </div>
                            `;
                        }).join('')}
                        <div id="extra-ing-container-${inputId}" style="display:flex; flex-direction:column; gap:10px;"></div>
                        <button type="button" class="press-btn" onclick="window.KitchenManager.addExtraIngredientRow('${inputId}')" style="padding:8px; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; font-size:15px; text-align:center; width:100%; color:var(--text); font-weight:600;">+ Añadir ingrediente</button>
                    </div>
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
        
        const cont = document.getElementById(`ingredients-container-${inputId}`);
        let customIngredients = null;
        if (cont && cont.classList.contains('is-editing')) {
            customIngredients = [];
            cont.querySelectorAll('.custom-ing-row').forEach(row => {
                const name = row.querySelector('.ing-name').value;
                const unit = row.querySelector('.ing-unit').value;
                const ingQty = Number(row.querySelector('.ing-qty').value) || 0;
                if (name && ingQty > 0) {
                    customIngredients.push({ ingredient: name, unit: unit, qty: ingQty });
                }
            });
        }
        
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
                custom_ingredients: customIngredients,
                actor_name: window.state?.currentUser?.name || window.state?.currentUser?.username || "Cocinero"
            });

            if (res.ok) {
                // Reset timer
                delete this.timers[`${stepId}_${targetDate}`];
                if (this.customQuantities) {
                    delete this.customQuantities[`${stepId}_${targetDate}`];
                }
                
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
