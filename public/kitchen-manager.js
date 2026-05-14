
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
            // 1. Load Recipes (including items and step_id)
            const recipeData = await window.api('GET', '/api/recipes?all_items=1');
            this.recipes = this.processRecipes(recipeData);

            // 2. Load Inventory (for stock levels)
            this.inventory = await window.api('GET', '/api/inventory');

            // 3. Load Suggestions (Future orders)
            await this.loadSuggestions();

            // 4. Load Today's History
            await this.loadHistory();

            this.render();
        } catch (err) {
            console.error("Kitchen Load Error:", err);
            window.showToast("Error al cargar datos de cocina", "error");
        }
    },

    processRecipes(data) {
        if (!data || !data.desserts) return [];
        return data.desserts.map(name => {
            const items = (data.items || []).filter(it => it.dessert === name);
            const stepsMap = {};
            items.forEach(it => {
                const stepKey = it.step_name || 'General';
                if (!stepsMap[stepKey]) {
                    stepsMap[stepKey] = { 
                        id: it.step_id,
                        name: it.step_name, 
                        items: [] 
                    };
                }
                stepsMap[stepKey].items.push(it);
            });
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
        future.setDate(today.getDate() + 5);
        const end = future.toISOString().split('T')[0];
        
        try {
            // Fix: Use correct parameter names for sales range query
            const sales = await window.api('GET', `/api/sales?date_range_start=${start}&date_range_end=${end}`);
            const counts = {};
            
            (sales || []).forEach(s => {
                // 1. Process legacy qty columns for main 5 desserts
                if (s.qty_arco) counts['Arco'] = (counts['Arco'] || 0) + Number(s.qty_arco);
                if (s.qty_melo) counts['Melo'] = (counts['Melo'] || 0) + Number(s.qty_melo);
                if (s.qty_mara) counts['Mara'] = (counts['Mara'] || 0) + Number(s.qty_mara);
                if (s.qty_oreo) counts['Oreo'] = (counts['Oreo'] || 0) + Number(s.qty_oreo);
                if (s.qty_nute) counts['Nute'] = (counts['Nute'] || 0) + Number(s.qty_nute);

                // 2. Process modern items array
                const items = s.items || [];
                items.forEach(it => {
                    // Try to match the name with our recipes
                    const rawName = it.name || it.short_code || '';
                    if (!rawName) return;

                    // Find matching recipe name (case insensitive)
                    const match = this.recipes.find(r => 
                        r.name.toLowerCase() === rawName.toLowerCase() || 
                        (it.short_code && r.name.toLowerCase().startsWith(it.short_code.toLowerCase()))
                    );

                    const finalName = match ? match.name : rawName;
                    
                    // If it was already counted by legacy columns, don't double count 
                    // (though usually items and legacy columns are kept in sync, 
                    // but some older data might vary)
                    // Let's assume modern items are more reliable if present
                    if (match && ['Arco', 'Melo', 'Mara', 'Oreo', 'Nute'].includes(match.name)) {
                        // For the main 5, we already counted them above from the columns 
                        // unless items has a different value. Let's just avoid duplication.
                        return; 
                    }
                    
                    counts[finalName] = (counts[finalName] || 0) + (Number(it.quantity) || 0);
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
        const movements = await window.api('GET', `/api/inventory?history_all=1`);
        this.history = (movements || []).filter(m => 
            m.kind === 'produccion' && 
            m.created_at.startsWith(today)
        );
    },

    render() {
        this.renderSuggestions();
        this.renderRecipes();
        this.renderHistory();
    },

    renderSuggestions() {
        const cont = document.getElementById('kitchen-suggestions');
        if (!cont) return;
        cont.innerHTML = '';
        
        const sorted = Object.entries(this.suggestions).sort((a,b) => b[1] - a[1]);
        if (sorted.length === 0) {
            cont.innerHTML = '<span style="font-size:0.8rem; color:#64748b;">No hay pedidos pendientes para los próximos 5 días.</span>';
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

    renderRecipes() {
        const grid = document.getElementById('kitchen-recipes-grid');
        if (!grid) return;
        grid.innerHTML = '';
        
        if (this.recipes.length === 0) {
            grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:40px; color:#64748b;">No se encontraron recetas configuradas.</div>';
            return;
        }

        this.recipes.forEach(recipe => {
            const card = document.createElement('div');
            card.className = 'box';
            card.style = "margin:0; padding:20px; border-radius:24px; display:flex; flex-direction:column; gap:16px; border: 1px solid #f1f5f9;";
            
            card.innerHTML = `
                <div class="flex" style="align-items:center; gap:12px;">
                    <div style="width:40px; height:40px; background:#fff7ed; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:1.2rem;">🍰</div>
                    <h3 style="margin:0; font-size:1.1rem; font-weight:900; color:#1e293b;">${recipe.name}</h3>
                </div>
                <div class="steps-list" style="display:flex; flex-direction:column; gap:12px;">
                    ${recipe.steps.map(step => this.renderStepRow(recipe.name, step)).join('')}
                </div>
            `;
            grid.appendChild(card);
        });
    },

    renderStepRow(recipeName, step) {
        const suggested = this.suggestions[recipeName] || 0;
        const inputId = `input-${step.id}`;
        
        return `
            <div style="background:#f8fafc; border:1px solid #f1f5f9; border-radius:16px; padding:12px; transition: all 0.2s ease;">
                <div class="flex" style="margin-bottom:8px;">
                    <strong style="font-size:0.85rem; color:#475569;">${step.name || 'Proceso General'}</strong>
                </div>
                <div style="display:flex; gap:8px; align-items:center;">
                    <input type="number" id="${inputId}" value="${suggested || 1}" min="1" 
                        style="width:65px; padding:8px; border-radius:10px; border:1px solid #cbd5e1; font-weight:700; text-align:center; outline:none;"
                        onfocus="this.select()">
                    <button onclick="window.KitchenManager.produceStep('${step.id}', '${recipeName}', '${step.name}', '${inputId}')" 
                        class="press-btn" style="flex:1; background:#4f46e5; color:white; border:none; padding:10px; border-radius:10px; font-weight:700; font-size:0.8rem; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2);">
                        Producir
                    </button>
                </div>
                <div style="margin-top:10px; font-size:0.7rem; color:#94a3b8; border-top:1px solid #eef2f6; padding-top:8px;">
                    ${step.items.map(it => {
                        const inv = this.inventory.find(i => i.ingredient.toLowerCase() === it.ingredient.toLowerCase());
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
        const input = document.getElementById(inputId);
        const qty = Number(input.value) || 0;
        if (qty <= 0) return window.showToast("Ingresa una cantidad válida", "warning");

        const btn = document.querySelector(`button[onclick*="'${inputId}'"]`);
        const originalText = btn.innerText;
        
        try {
            btn.innerText = "⏳...";
            btn.disabled = true;

            const res = await window.api('POST', '/api/inventory', {
                action: 'produccion_paso',
                step_id: Number(stepId),
                multiplier: qty,
                actor_name: window.state?.currentUser?.name || window.state?.currentUser?.username || "Cocinero"
            });

            if (res.ok) {
                window.showToast(`✅ Producido: ${qty} de ${dessertName} (${stepName || 'General'})`, "success");
                // Reset input to 0 or something else? Maybe keep it.
                await this.loadData(); // Refresh stock and history
            } else {
                throw new Error(res.error || "Error desconocido");
            }
        } catch (err) {
            console.error("Produce Step Error:", err);
            window.showToast("Error al procesar: " + err.message, "error");
            btn.innerText = originalText;
            btn.disabled = false;
        }
    },

    renderHistory() {
        const cont = document.getElementById('kitchen-history-list');
        if (!cont) return;
        
        if (this.history.length === 0) {
            cont.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b; font-size:0.9rem;">No hay producción registrada hoy.</div>';
            return;
        }

        // Group history by Note
        const grouped = {};
        this.history.forEach(m => {
            if (!grouped[m.note]) {
                grouped[m.note] = { 
                    time: m.created_at, 
                    actor: m.actor_name,
                    items: []
                };
            }
            grouped[m.note].items.push(m);
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
