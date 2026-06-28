const KitchenManager = {
    recipes: [],
    inventory: [],
    batches: [], // Array of { day, recipeName, total, sellers: [] }
    history: [],
    expandedRecipes: new Set(),
    timers: {}, // { "stepId_targetDate": { startTime: Date, elapsedBefore: seconds } }
    isInitialized: false,
    lastSyncTimestamp: null,

    async init() {
        if (this.isInitialized) {
            const hasAccess = await this.checkAccess();
            if (hasAccess) {
                await this.loadData();
            }
            return;
        }
        console.log("👨‍🍳 Initializing Kitchen Manager...");
        this.bindEvents();
        
        const hasAccess = await this.checkAccess();
        if (hasAccess) {
            await this.loadData();
            this.startIntervals();
        }
        this.isInitialized = true;
    },

    startIntervals() {
        if (this._timerInterval) clearInterval(this._timerInterval);
        this._timerInterval = setInterval(() => this.updateTimerDisplays(), 1000);

        if (this._syncInterval) clearInterval(this._syncInterval);
        this._syncInterval = setInterval(() => this.syncActiveTimersSilently(), 10000); // Check for updates every 10 seconds
    },

    stopIntervals() {
        if (this._timerInterval) {
            clearInterval(this._timerInterval);
            this._timerInterval = null;
        }
        if (this._syncInterval) {
            clearInterval(this._syncInterval);
            this._syncInterval = null;
        }
    },

    async syncActiveTimersSilently() {
        try {
            const check = await window.api('GET', '/api/inventory?action=production_sync_check');
            const serverTs = check?.last_change;
            if (!serverTs) return;
            
            if (this.lastSyncTimestamp && serverTs === this.lastSyncTimestamp) {
                // No change, skip database query
                return;
            }
            
            this.lastSyncTimestamp = serverTs;
            
            // Reload active timers, history, and production logs in background
            this.dbActiveTimers = await window.api('GET', '/api/inventory?action=active_timers') || [];
            await this.loadHistory();
            await this.loadProductionLogs();
            await this.loadCheckedInstructions();
            
            const isUserInteracting = document.activeElement && 
                (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT') &&
                document.getElementById('kitchen-recipes-grid')?.contains(document.activeElement);
                
            if (!isUserInteracting) {
                this.render();
            } else {
                this.syncActiveTimerUI();
                this.updateTimerDisplays();
            }
        } catch (e) {
            console.error("Error silently syncing production data:", e);
            if (e.message && (e.message.includes('403') || e.message.includes('production_access_denied'))) {
                console.warn("⚠️ Production access was revoked by admin. Locking...");
                this.stopIntervals();
                await this.checkAccess();
            }
        }
    },

    syncActiveTimerUI() {
        const currentUsername = window.state?.currentUser?.name || window.state?.currentUser?.username;
        
        // 1. Update recipe cards expansion
        document.querySelectorAll('.kitchen-card').forEach(card => {
            const cardId = card.getAttribute('data-card-id');
            if (!cardId) return;
            const [day, recipeName] = cardId.split('_');
            const recipe = this.recipes.find(r => r.name === recipeName);
            if (!recipe) return;

            const hasActiveStep = recipe.steps.some(step => {
                const timerKey = `${step.id}_${day}`;
                const localRunning = this.timers[timerKey]?.startTime;
                const remoteRunning = (this.dbActiveTimers || []).some(x => 
                    Number(x.step_id) === Number(step.id) && 
                    String(x.target_date).slice(0, 10) === String(day).slice(0, 10)
                );
                return localRunning || remoteRunning;
            });

            if (hasActiveStep && !this.expandedRecipes.has(cardId)) {
                this.expandedRecipes.add(cardId);
                const container = card.querySelector('.steps-list-container');
                const chevron = card.querySelector('.chevron');
                if (container) {
                    container.style.maxHeight = '2000px';
                    container.style.opacity = '1';
                }
                if (chevron) {
                    chevron.style.transform = 'rotate(180deg)';
                }
            }
        });

        // 2. Update step rows highlighting, badges, and blinking dots
        document.querySelectorAll('.step-row-container').forEach(row => {
            const stepId = row.getAttribute('data-step-id');
            const targetDate = row.getAttribute('data-date');
            if (!stepId || !targetDate) return;

            const timerKey = `${stepId}_${targetDate}`;
            const activeTimer = this.timers[timerKey];
            const isRunning = activeTimer && activeTimer.startTime;

            const dbTimer = (this.dbActiveTimers || []).find(x => 
                Number(x.step_id) === Number(stepId) && 
                String(x.target_date).slice(0, 10) === String(targetDate).slice(0, 10)
            );
            const isRemoteRunning = dbTimer && dbTimer.username && (!currentUsername || dbTimer.username.toLowerCase() !== currentUsername.toLowerCase());
            const isTimerRunning = isRunning || isRemoteRunning;

            const isDone = row.querySelector('strong')?.textContent.includes('✓');

            if (!isDone) {
                if (isTimerRunning) {
                    row.style.background = '#fff5f5';
                    row.style.border = '1px solid #fca5a5';
                    row.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.05)';
                } else {
                    row.style.background = '#f8fafc';
                    row.style.border = '1px solid #e2e8f0';
                    row.style.boxShadow = 'none';
                }
            }

            // Blinking dot next to the timer display
            let dot = row.querySelector('.timer-pulse-dot');
            if (isTimerRunning) {
                if (!dot) {
                    dot = document.createElement('span');
                    dot.className = 'timer-pulse-dot';
                    dot.style = 'width:6px; height:6px; background:#ef4444; border-radius:50%; animation: pulse 1.5s infinite; flex-shrink:0;';
                    const timerDisplay = row.querySelector('.timer-display');
                    if (timerDisplay) {
                        timerDisplay.parentElement.appendChild(dot);
                    }
                }
            } else {
                if (dot) dot.remove();
            }

            // Remote actor badge
            const badgeContainer = row.querySelector('.remote-actor-badge-container');
            if (badgeContainer) {
                if (isRemoteRunning) {
                    badgeContainer.innerHTML = `
                        <span style="font-size:0.95rem; color:#ef4444; font-weight:700; background:rgba(239,68,68,0.08); padding:3px 8px; border-radius:8px; display:inline-flex; align-items:center; gap:6px; vertical-align:middle; animation: pulse 2s infinite;">
                            <span style="width:6px; height:6px; background:#ef4444; border-radius:50%;"></span>
                            ${dbTimer.username} está produciendo
                        </span>
                    `;
                } else {
                    badgeContainer.innerHTML = '';
                }
            }
        });
    },

    bindEvents() {
        const refreshBtn = document.getElementById('kitchen-refresh');
        if (refreshBtn) {
            refreshBtn.onclick = () => this.loadData();
        }
        
        const goHomeBtn = document.getElementById('kitchen-go-home');
        if (goHomeBtn) {
            const isAdm = this.isSuperAdmin() || window.state?.currentUser?.role === 'admin';
            goHomeBtn.textContent = isAdm ? 'Inicio' : 'Tienda';
            goHomeBtn.onclick = () => {
                if (isAdm) {
                    window.switchView('#view-select-seller');
                } else {
                    window.location.href = '/store.html';
                }
            };
        }

        // Recheck access button on wait screen
        const recheckBtn = document.getElementById('kitchen-recheck-btn');
        if (recheckBtn) {
            recheckBtn.onclick = async () => {
                recheckBtn.disabled = true;
                recheckBtn.textContent = 'Verificando...';
                try {
                    const hasAccess = await this.checkAccess();
                    if (hasAccess) {
                        window.notify.success("¡Acceso abierto! Cargando producción...");
                        await this.loadData();
                        this.startIntervals();
                    } else {
                        window.notify.error("El acceso aún está cerrado.");
                    }
                } catch (err) {
                    console.error("Error rechecking access:", err);
                } finally {
                    recheckBtn.disabled = false;
                    recheckBtn.textContent = 'Reintentar';
                }
            };
        }

        // Toggle access button for superadmin
        const toggleAccessBtn = document.getElementById('kitchen-toggle-access');
        if (toggleAccessBtn) {
            toggleAccessBtn.onclick = async () => {
                toggleAccessBtn.disabled = true;
                try {
                    const settings = await window.api('GET', '/api/store-settings');
                    const currentlyApproved = settings.production_access_approved === 'true';
                    const newApproved = !currentlyApproved;
                    
                    const actorName = window.state?.currentUser?.name || window.state?.currentUser?.username || '';
                    await window.api('POST', '/api/store-settings', {
                        production_access_approved: String(newApproved),
                        actor_name: actorName
                    });
                    
                    // Touch sync meta via a dummy timer.stop to force all clients to notice state change instantly
                    try {
                        await window.api('POST', '/api/inventory', {
                            action: 'timer.stop',
                            step_id: -99,
                            target_date: '1970-01-01',
                            actor_name: 'system'
                        });
                    } catch {}
                } catch (err) {
                    console.error("Error toggling kitchen access:", err);
                    window.notify.error("Error al cambiar acceso: " + err.message);
                } finally {
                    toggleAccessBtn.disabled = false;
                    await this.loadAdminControls();
                }
            };
        }

        // Save production date button for superadmin
        const saveDateBtn = document.getElementById('kitchen-save-prod-date');
        const nextProdInput = document.getElementById('kitchen-next-prod-input');
        if (saveDateBtn && nextProdInput) {
            saveDateBtn.onclick = async () => {
                saveDateBtn.disabled = true;
                const value = nextProdInput.value.trim();
                if (!value) {
                    window.notify.error("La fecha no puede estar vacía");
                    saveDateBtn.disabled = false;
                    return;
                }

                try {
                    const actorName = window.state?.currentUser?.name || window.state?.currentUser?.username || '';
                    await window.api('POST', '/api/store-settings', {
                        next_production_datetime: value,
                        actor_name: actorName
                    });
                    window.notify.success("Próxima producción actualizada: " + value);
                    
                    // Touch sync meta via a dummy timer.stop to force all clients to notice state change instantly
                    try {
                        await window.api('POST', '/api/inventory', {
                            action: 'timer.stop',
                            step_id: -99,
                            target_date: '1970-01-01',
                            actor_name: 'system'
                        });
                    } catch {}
                } catch (err) {
                    console.error("Error saving next production datetime:", err);
                    window.notify.error("Error al guardar: " + err.message);
                } finally {
                    saveDateBtn.disabled = false;
                    await this.loadAdminControls();
                }
            };
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

            // Load Checked Instructions from DB
            await this.loadCheckedInstructions();

            // 7. Load Active Timers from DB
            this.dbActiveTimers = await window.api('GET', '/api/inventory?action=active_timers') || [];

            // Initialize lastSyncTimestamp
            try {
                const check = await window.api('GET', '/api/inventory?action=production_sync_check');
                this.lastSyncTimestamp = check?.last_change || new Date().toISOString();
            } catch (e) {
                console.error("Failed to initialize lastSyncTimestamp:", e);
            }

            // Restore running timers from DB for the current user
            const currentUsername = window.state?.currentUser?.name || window.state?.currentUser?.username;
            if (currentUsername) {
                (this.dbActiveTimers || []).forEach(dbTimer => {
                    if (dbTimer.username.toLowerCase() === currentUsername.toLowerCase()) {
                        const key = `${dbTimer.step_id}_${String(dbTimer.target_date || '').slice(0, 10)}`;
                        if (!this.timers[key]) {
                            this.timers[key] = {
                                elapsedBefore: 0,
                                startTime: new Date(dbTimer.start_time).getTime()
                            };
                        }
                    }
                });
            }

            this.render();
        } catch (err) {
            console.error("Kitchen Load Error:", err);
            if (err.message && (err.message.includes('403') || err.message.includes('production_access_denied'))) {
                console.warn("⚠️ Access denied during loadData. Locking...");
                this.stopIntervals();
                await this.checkAccess();
            } else {
                window.notify.error("Error al cargar datos de producción: " + err.message);
                if (grid) grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:40px; color:#ef4444;">❌ Error al cargar la bitácora.<br><small>${err.message}</small></div>`;
            }
        }
    },

    toggleTimer(stepId, targetDate) {
        const key = `${stepId}_${targetDate}`;
        const t = this.timers[key];
        const actorName = window.state?.currentUser?.name || window.state?.currentUser?.username;
        if (t && t.startTime) {
            // Stop timer (pause)
            const elapsed = Math.floor((Date.now() - t.startTime) / 1000);
            t.elapsedBefore = (t.elapsedBefore || 0) + elapsed;
            t.startTime = null;

            // Delete from DB on pause
            if (actorName) {
                window.api('POST', '/api/inventory', {
                    action: 'timer.stop',
                    step_id: stepId,
                    target_date: targetDate,
                    actor_name: actorName
                }).catch(e => console.error("Error pausing timer in DB:", e));
            }
        } else {
            // Start/Resume timer
            if (!t) this.timers[key] = { elapsedBefore: 0 };
            this.timers[key].startTime = Date.now();

            // Save to DB on resume
            const qtyInput = document.getElementById(`input-${stepId}`);
            const qty = qtyInput ? Number(qtyInput.value) : 1;
            if (actorName) {
                window.api('POST', '/api/inventory', {
                    action: 'timer.start',
                    step_id: stepId,
                    target_date: targetDate,
                    qty: qty,
                    actor_name: actorName
                }).catch(e => console.error("Error resuming active timer in DB:", e));
            }
        }
        this.render(); 
    },

    startTimerForStep(stepId, targetDate) {
        const key = `${stepId}_${targetDate}`;
        if (!this.timers[key]) this.timers[key] = { elapsedBefore: 0 };
        this.timers[key].startTime = Date.now();

        // Save to DB
        const qtyInput = document.getElementById(`input-${stepId}`);
        const qty = qtyInput ? Number(qtyInput.value) : 1;
        const actorName = window.state?.currentUser?.name || window.state?.currentUser?.username;
        if (actorName) {
            window.api('POST', '/api/inventory', {
                action: 'timer.start',
                step_id: stepId,
                target_date: targetDate,
                qty: qty,
                actor_name: actorName
            }).catch(e => console.error("Error starting active timer in DB:", e));
        }

        this.render();
    },

    getElapsedSeconds(stepId, targetDate) {
        const key = `${stepId}_${targetDate}`;
        const t = this.timers[key];
        
        // If there's a local timer running, use it
        if (t) {
            let total = t.elapsedBefore || 0;
            if (t.startTime) {
                total += Math.floor((Date.now() - t.startTime) / 1000);
            }
            return total;
        }

        // Otherwise, check if there is an active timer from another user in the DB
        if (this.dbActiveTimers) {
            const dbTimer = this.dbActiveTimers.find(x => 
                Number(x.step_id) === Number(stepId) && 
                String(x.target_date).slice(0, 10) === String(targetDate).slice(0, 10)
            );
            if (dbTimer) {
                const elapsed = Math.floor((Date.now() - new Date(dbTimer.start_time)) / 1000);
                return Math.max(0, elapsed);
            }
        }

        return 0;
    },

    formatDuration(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    },

    async loadCheckedInstructions() {
        try {
            const start = this.suggestionStartDate || new Date().toISOString().split('T')[0];
            const list = await window.api('GET', `/api/inventory?action=get_checked_instructions&date_start=${start}&_t=${Date.now()}`) || [];
            this.checkedInstructionsMap = {};
            list.forEach(item => {
                const key = `${item.step_id}_${item.target_date}_${item.instruction_index}`;
                this.checkedInstructionsMap[key] = {
                    checked_at: item.checked_at,
                    username: item.username
                };
            });
            console.log("📋 Loaded checked instructions:", list.length);
        } catch (err) {
            console.warn("Could not load checked instructions:", err);
            this.checkedInstructionsMap = {};
        }
    },

    isInstructionChecked(stepId, targetDate, index) {
        if (!this.checkedInstructionsMap) return false;
        const key = `${stepId}_${targetDate}_${index}`;
        return !!this.checkedInstructionsMap[key];
    },

    async toggleInstructionCheck(stepId, targetDate, index, checkbox) {
        const actorName = window.state?.currentUser?.name || window.state?.currentUser?.username || "Cocinero";
        const label = checkbox.closest('label');
        
        if (label) {
            label.style.color = checkbox.checked ? '#94a3b8' : '#334155';
            label.style.textDecoration = checkbox.checked ? 'line-through' : 'none';
        }

        try {
            if (checkbox.checked) {
                await window.api('POST', '/api/inventory', {
                    action: 'instruction.check',
                    step_id: stepId,
                    target_date: targetDate,
                    instruction_index: index,
                    actor_name: actorName
                });
            } else {
                await window.api('POST', '/api/inventory', {
                    action: 'instruction.uncheck',
                    step_id: stepId,
                    target_date: targetDate,
                    instruction_index: index
                });
            }
            
            await this.loadCheckedInstructions();
            // Re-render UI to display printed completion hour
            this.render();
        } catch (err) {
            console.error("Error toggling checklist:", err);
            window.showToast("Error al guardar marca de paso a paso", "error");
            checkbox.checked = !checkbox.checked;
            if (label) {
                label.style.color = checkbox.checked ? '#94a3b8' : '#334155';
                label.style.textDecoration = checkbox.checked ? 'line-through' : 'none';
            }
        }
    },

    updateTimerDisplays() {
        document.querySelectorAll('.timer-display').forEach(el => {
            const stepId = el.getAttribute('data-step-id');
            const targetDate = el.getAttribute('data-date');
            if (stepId && targetDate) {
                const row = el.closest('.step-row-container');
                
                const hasLocalActive = this.timers[`${stepId}_${targetDate}`]?.startTime;
                const dbTimer = this.dbActiveTimers ? this.dbActiveTimers.find(x => 
                    Number(x.step_id) === Number(stepId) && 
                    String(x.target_date).slice(0, 10) === String(targetDate).slice(0, 10)
                ) : null;
                const isRunning = hasLocalActive || dbTimer;

                if (isRunning) {
                    const elapsed = this.getElapsedSeconds(stepId, targetDate);
                    el.textContent = this.formatDuration(elapsed);
                    el.style.color = '#ef4444';
                } else {
                    // Timer is not running. Find the last completed log for today
                    const stepLogs = (this.productionLogsRaw || []).filter(l => 
                        Number(l.step_id) === Number(stepId) &&
                        String(l.created_at).slice(0, 10) === String(targetDate).slice(0, 10)
                    );
                    const latestLog = stepLogs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
                    const completedDuration = latestLog ? Number(latestLog.duration_seconds || 0) : 0;
                    
                    el.textContent = this.formatDuration(completedDuration);
                    if (completedDuration > 0) {
                        el.style.color = '#2e7d32';
                    } else {
                        el.style.color = '#94a3b8';
                    }
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
                    let inst = [];
                    if (it.instructions) {
                        if (typeof it.instructions === 'string') {
                            try { inst = JSON.parse(it.instructions); } catch (e) { inst = []; }
                        } else if (Array.isArray(it.instructions)) {
                            inst = it.instructions;
                        }
                    }
                    const newStep = { 
                        id: stepId,
                        name: it.step_name || 'General', 
                        produces_ingredient: it.produces_ingredient,
                        produces_unit: it.produces_unit,
                        instructions: inst,
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
                const perUnit = log.qty > 0 ? this.formatDuration(Math.round(log.duration_seconds / log.qty)) : 'N/D';
                const hours = Math.floor(log.duration_seconds / 3600);
                const minutes = Math.floor((log.duration_seconds % 3600) / 60);
                const seconds = log.duration_seconds % 60;

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
                            <span style="font-size:0.95rem; color:#64748b; font-weight:700; background:rgba(241,245,249,0.8); padding:2px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:4px;">
                                👨‍🍳 
                                <select onchange="window.KitchenManager.autoSaveLog(${log.id}, ${stepId}, '${titleName.replace(/'/g, "\\'")}', this.value, 'actor')"
                                    style="border:none; background:transparent; font-size:0.95rem; font-weight:700; color:#64748b; padding:0; outline:none; cursor:pointer;">
                                    <option value="Jaimes" ${log.actor_name === 'Jaimes' ? 'selected' : ''}>Jaimes</option>
                                    <option value="Jorge" ${log.actor_name === 'Jorge' ? 'selected' : ''}>Jorge</option>
                                    ${(log.actor_name !== 'Jaimes' && log.actor_name !== 'Jorge') ? `<option value="${log.actor_name}" selected>${log.actor_name}</option>` : ''}
                                </select>
                            </span>
                            <button onclick="window.KitchenManager.deleteProductionLog(${log.id}, ${stepId}, '${titleName.replace(/'/g, "\\'")}')" 
                                class="press-btn" style="border:none; background:transparent; font-size:16px; cursor:pointer; padding:2px;" title="Eliminar registro">
                                🗑️
                            </button>
                        </div>
                    </div>
                    <div style="display:grid; grid-template-columns: 1fr 1.8fr 1.2fr; gap:10px; margin-top:4px; align-items:end;">
                        <div style="display:flex; flex-direction:column; gap:4px;">
                            <span style="font-size:0.85rem; color:#94a3b8; text-transform:uppercase; font-weight:700;">Lote</span>
                            <div style="display:flex; align-items:center; gap:4px;">
                                <input type="number" value="${log.qty}" min="1" 
                                    onchange="window.KitchenManager.autoSaveLog(${log.id}, ${stepId}, '${titleName.replace(/'/g, "\\'")}', this.value, 'qty')"
                                    style="width:100%; padding:6px; border-radius:8px; border:1px solid #cbd5e1; font-size:1.1rem; font-weight:700; text-align:center; outline:none; background:white;">
                                <span style="font-size:0.85rem; color:#64748b; font-weight:600;">uds</span>
                            </div>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:4px;">
                            <span style="font-size:0.85rem; color:#94a3b8; text-transform:uppercase; font-weight:700;">Tiempo (Hrs : Min : Seg)</span>
                            <div style="display:flex; align-items:center; gap:4px;">
                                <input type="number" value="${hours}" min="0" 
                                    onchange="window.KitchenManager.autoSaveLog(${log.id}, ${stepId}, '${titleName.replace(/'/g, "\\'")}', this.value, 'hrs')"
                                    style="width:40px; padding:6px; border-radius:8px; border:1px solid #cbd5e1; font-size:1.1rem; font-weight:700; text-align:center; outline:none; background:white;" title="Horas">
                                <span style="font-size:1.1rem; font-weight:700; color:#cbd5e1;">:</span>
                                <input type="number" value="${minutes}" min="0" max="59" 
                                    onchange="window.KitchenManager.autoSaveLog(${log.id}, ${stepId}, '${titleName.replace(/'/g, "\\'")}', this.value, 'min')"
                                    style="width:40px; padding:6px; border-radius:8px; border:1px solid #cbd5e1; font-size:1.1rem; font-weight:700; text-align:center; outline:none; background:white;" title="Minutos">
                                <span style="font-size:1.1rem; font-weight:700; color:#cbd5e1;">:</span>
                                <input type="number" value="${seconds}" min="0" max="59" 
                                    onchange="window.KitchenManager.autoSaveLog(${log.id}, ${stepId}, '${titleName.replace(/'/g, "\\'")}', this.value, 'sec')"
                                    style="width:40px; padding:6px; border-radius:8px; border:1px solid #cbd5e1; font-size:1.1rem; font-weight:700; text-align:center; outline:none; background:white;" title="Segundos">
                            </div>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:4px; align-items:center; justify-content:center; height:100%;">
                            <span style="font-size:0.85rem; color:#94a3b8; text-transform:uppercase; font-weight:700;">Tiempo / U.</span>
                            <span class="per-unit-val" style="font-size:1.15rem; font-weight:800; color:#10b981; margin-bottom:8px;">${perUnit}</span>
                        </div>
                    </div>
                `;
                listContainer.appendChild(card);
            });
        }
        // Group logs by actor for Super Admin comparison
        let statsHeaderHtml = '';
        if (this.isSuperAdmin()) {
            statsHeaderHtml = `
                <button type="button" class="press-btn" style="background:rgba(79,70,229,0.06); color:#4f46e5; border:1px solid rgba(79,70,229,0.15); padding:10px; border-radius:12px; font-weight:700; width:100%; text-align:center; font-size:1rem; cursor:pointer; margin-bottom:4px;">
                    📊 Comparativa de Rendimiento
                </button>
            `;
        }

        if (statsHeaderHtml) {
            const statsWrapper = document.createElement('div');
            statsWrapper.innerHTML = statsHeaderHtml;
            modal.appendChild(statsWrapper.firstElementChild);
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

    async autoSaveLog(logId, stepId, titleName, value, type) {
        const log = (this.productionLogsRaw || []).find(l => l.id === Number(logId));
        if (!log) return;

        let qty = log.qty;
        let duration = log.duration_seconds;
        let hours = Math.floor(duration / 3600);
        let minutes = Math.floor((duration % 3600) / 60);
        let seconds = duration % 60;
        let logActorName = log.actor_name;

        if (type === 'qty') {
            qty = Number(value) || 0;
        } else if (type === 'hrs') {
            hours = Number(value) || 0;
        } else if (type === 'min') {
            minutes = Number(value) || 0;
        } else if (type === 'sec') {
            seconds = Number(value) || 0;
        } else if (type === 'actor') {
            logActorName = (value || '').toString().trim();
            if (!logActorName) return window.showToast("Ingresa un nombre de empleado válido", "warning");
        }
        duration = (hours * 3600) + (minutes * 60) + seconds;

        if (qty <= 0) return window.showToast("Ingresa una cantidad de lote válida", "warning");
        if (duration <= 0) return window.showToast("Ingresa un tiempo válido", "warning");

        try {
            const res = await window.api('POST', '/api/inventory', {
                action: 'update_production_log',
                log_id: logId,
                qty: qty,
                duration_seconds: duration,
                log_actor_name: logActorName,
                actor_name: window.state?.currentUser?.name || window.state?.currentUser?.username || "Cocinero"
            });

            if (res.ok) {
                log.qty = qty;
                log.duration_seconds = duration;
                log.actor_name = logActorName;

                const logIndex = (this.productionLogsRaw || []).findIndex(l => l.id === Number(logId));
                if (logIndex !== -1) {
                    this.productionLogsRaw[logIndex].qty = qty;
                    this.productionLogsRaw[logIndex].duration_seconds = duration;
                    this.productionLogsRaw[logIndex].actor_name = logActorName;
                }

                this.productionLogsByStep = {};
                this.productionLogsRaw.forEach(l => {
                    const sid = l.step_id;
                    if (!this.productionLogsByStep[sid]) {
                        this.productionLogsByStep[sid] = [];
                    }
                    this.productionLogsByStep[sid].push(l);
                });

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

                const rowEl = document.getElementById(`prod-log-row-${logId}`);
                if (rowEl) {
                    const perUnitSpan = rowEl.querySelector('.per-unit-val');
                    if (perUnitSpan) {
                        const perUnit = qty > 0 ? this.formatDuration(Math.round(duration / qty)) : 'N/D';
                        perUnitSpan.textContent = perUnit;
                    }
                }
                
                if (type === 'actor') {
                    setTimeout(() => this.showProductionLogsPopover(stepId, titleName), 300);
                }
            } else {
                throw new Error(res.error || "No se pudo actualizar");
            }
        } catch (err) {
            console.error("Save Log Error:", err);
            window.showToast("Error al guardar: " + err.message, "error");
        }
    },

    async deleteProductionLog(logId, stepId, titleName) {
        try {
            window.notify.info("Eliminando...");
            const res = await window.api('POST', '/api/inventory', {
                action: 'delete_production_log',
                log_id: logId,
                actor_name: window.state?.currentUser?.name || window.state?.currentUser?.username || "Cocinero"
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
            window.showToast("Error al renderizar producción", "error");
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
                card.setAttribute('data-card-id', cardId);
                let isExpanded = this.expandedRecipes.has(cardId);
                if (!isExpanded) {
                    const hasActiveStep = recipe.steps.some(step => {
                        const timerKey = `${step.id}_${batch.day}`;
                        const localRunning = this.timers[timerKey]?.startTime;
                        const remoteRunning = (this.dbActiveTimers || []).some(x => 
                            Number(x.step_id) === Number(step.id) && 
                            String(x.target_date).slice(0, 10) === String(batch.day).slice(0, 10)
                        );
                        return localRunning || remoteRunning;
                    });
                    if (hasActiveStep) {
                        isExpanded = true;
                        this.expandedRecipes.add(cardId);
                    }
                }
                
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

                card.querySelector('.card-header').onclick = (e) => {
                    const container = card.querySelector('.steps-list-container');
                    const chevron = card.querySelector('.chevron');
                    const isNowExpanded = container.style.maxHeight === '0px' || container.style.maxHeight === '';
                    
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
            span.textContent = Math.round(base * multiplier);
        });
        
        // Update edit mode
        cont.querySelectorAll('.ingredients-edit .ing-qty[data-base]').forEach(inp => {
            const base = Number(inp.getAttribute('data-base')) || 0;
            inp.value = Math.round(base * multiplier);
        });

        // Update inline instruction quantities
        const stepBlock = loteInput.closest('div').parentElement.parentElement;
        if (stepBlock) {
            stepBlock.querySelectorAll('.inst-qty-calc').forEach(span => {
                const base = Number(span.getAttribute('data-base-qty')) || 0;
                span.textContent = Math.round(base * multiplier);
            });

            // Update average time dynamically if the badge exists
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

        // Fetch current batch quantity dynamically
        const batchQtyInput = document.getElementById(inputId);
        const batchQty = batchQtyInput ? Number(batchQtyInput.value) : 1;
        
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
        row.style = "display:flex; align-items:center; gap:8px; justify-content:space-between; margin-bottom:8px;";
        row.innerHTML = `
            <select class="ing-name-select" style="flex:1.5; padding:6px; border:1px solid #cbd5e1; border-radius:8px; font-size:14px; width:100px; text-overflow:ellipsis;" onchange="this.parentElement.querySelector('.ing-name').value = this.value; this.parentElement.querySelector('.ing-unit').value = this.options[this.selectedIndex].getAttribute('data-unit') || 'u'; this.parentElement.querySelector('.unit-display').textContent = this.options[this.selectedIndex].getAttribute('data-unit') || 'u';">
                ${optionsHtml}
            </select>
            <input type="hidden" class="ing-name" value="">
            <input type="hidden" class="ing-unit" value="u">
            <span style="font-size:13px; color:#64748b; font-weight:600; white-space:nowrap;">Lote: ${batchQty}</span>
            <input type="number" class="ing-qty" placeholder="${batchQty}" value="${batchQty}" style="width:80px; padding:6px; border:1px solid #cbd5e1; border-radius:8px; text-align:right; font-size:1.15rem;">
            <span class="unit-display" style="width:25px; font-size:1.15rem;">u</span>
            <button type="button" class="press-btn" onclick="this.parentElement.remove()" style="padding:6px 10px; font-size:14px; background:#f1f5f9; color:#ef4444; border:none; border-radius:8px;">❌</button>
        `;
        cont.appendChild(row);
    },

    formatInstructionWithQuantities(text, items, batchQty) {
        if (!text) return '';
        if (!items || items.length === 0) {
            return text.replace(/\{([^{}]+)\}/g, '$1');
        }

        return text.replace(/\{([^{}]+)\}/g, (match, ingName) => {
            const trimmedName = ingName.trim();
            const it = items.find(x => x.ingredient.trim().toLowerCase() === trimmedName.toLowerCase());
            
            if (it) {
                const qtyNeeded = Math.round(Number(it.qty_per_unit || 0) * batchQty);
                const qtySpan = `<span class="inst-qty-calc" data-base-qty="${it.qty_per_unit}">${qtyNeeded}</span>`;
                const formattedQty = `${qtySpan} ${it.unit}`;
                return `${it.ingredient} <strong style="color:#db2777; font-size:1.1rem; background:rgba(219,39,119,0.06); padding:2px 6px; border-radius:6px; white-space:nowrap;">(${formattedQty})</strong>`;
            }
            
            return trimmedName;
        });
    },

    renderStepRow(recipeName, step, targetDate, totalNeeded) {
        if (!step) return "";
        const inputId = `input-${step.id || Math.random().toString(36).substr(2, 9)}`;
        const producedInWindow = this.producedStepsMap && step.id ? (this.producedStepsMap[`${step.id}_${targetDate}`] || 0) : 0;
        
        const timerKey = `${step.id}_${targetDate}`;
        const activeTimer = this.timers[timerKey];
        const isRunning = activeTimer && activeTimer.startTime;
        const isLocalActiveOrPaused = activeTimer && (activeTimer.startTime || activeTimer.elapsedBefore > 0);

        const currentUsername = window.state?.currentUser?.name || window.state?.currentUser?.username;
        const dbTimer = (this.dbActiveTimers || []).find(x => 
            Number(x.step_id) === Number(step.id) && 
            String(x.target_date).slice(0, 10) === String(targetDate).slice(0, 10)
        );
        const isRemoteRunning = dbTimer && dbTimer.username && (!currentUsername || dbTimer.username.toLowerCase() !== currentUsername.toLowerCase());
        
        const isTimerRunning = isRunning || isRemoteRunning;
        const isStepActive = isLocalActiveOrPaused || isRemoteRunning;

        const isDone = producedInWindow >= totalNeeded && totalNeeded > 0 && !isStepActive;

        // Fetch duration and actor of the completed production log
        const stepLogs = (this.productionLogsRaw || []).filter(l => 
            Number(l.step_id) === Number(step.id) &&
            String(l.created_at).slice(0, 10) === String(targetDate).slice(0, 10)
        );
        const latestLog = stepLogs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        const completedDuration = latestLog ? Number(latestLog.duration_seconds || 0) : 0;
        const completedBy = latestLog ? latestLog.actor_name : '';

        const elapsed = isTimerRunning ? this.getElapsedSeconds(step.id, targetDate) : completedDuration;

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
        if (avgSeconds !== null || this.isSuperAdmin()) {
            const avgValHtml = avgSeconds !== null ? this.formatDuration(avgSeconds) : 'Sin registros';
            const baseAvgAttr = avgSeconds !== null ? `data-base-avg="${this.getAverageTimePerUnit(step.id)}"` : '';
            averageTimeHtml = `
                <span class="average-time-badge" 
                    onclick="event.stopPropagation(); window.KitchenManager.showProductionLogsPopover(${step.id}, '${recipeName} - ${step.name || 'General'}')"
                    style="position:absolute; top:12px; right:12px; font-size:1.05rem; color:#64748b; font-weight:700; background:#f1f5f9; padding:4px 10px; border-radius:8px; cursor:pointer; transition:all 0.2s; display:inline-flex; align-items:center; gap:4px; border:1px solid #e2e8f0; pointer-events:auto; z-index:10;"
                    onmouseover="this.style.background='#e2e8f0'; this.style.color='#1e293b';"
                    onmouseout="this.style.background='#f1f5f9'; this.style.color='#64748b';"
                    title="Ver historial de producción"
                    data-step-id="${step.id}">
                    ⏱️ Promedio: <span class="avg-val" ${baseAvgAttr}>${avgValHtml}</span>
                </span>
            `;
        }

        let remoteActorHtml = "";
        if (isRemoteRunning) {
            remoteActorHtml = `
                <span style="font-size:0.95rem; color:#ef4444; font-weight:700; background:rgba(239,68,68,0.08); padding:3px 8px; border-radius:8px; display:inline-flex; align-items:center; gap:6px; vertical-align:middle; animation: pulse 2s infinite;">
                    <span style="width:6px; height:6px; background:#ef4444; border-radius:50%;"></span>
                    ${dbTimer.username} está produciendo
                </span>
            `;
        }

        let actionButtonsHtml = "";
        if (isDone) {
            actionButtonsHtml = `
                <button onclick="window.KitchenManager.startTimerForStep('${step.id}', '${targetDate}')" 
                    class="press-btn" style="width:100%; background:#e8f5e9; color:#2e7d32; border:1px solid #c8e6c9; padding:12px; border-radius:12px; font-weight:700; font-size:1.25rem; box-shadow: none;">
                    Completado
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
            } else if (activeTimer && activeTimer.elapsedBefore > 0) {
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
            } else if (isRemoteRunning) {
                if (this.isSuperAdmin()) {
                    actionButtonsHtml = `
                        <button onclick="window.KitchenManager.produceStep('${step.id || ''}', '${recipeName}', '${step.name || ''}', '${inputId}', '${targetDate}', '${dbTimer.username}')" 
                            class="press-btn" style="width:100%; background:#ef4444; color:white; border:none; padding:12px; border-radius:12px; font-weight:700; font-size:1.25rem; box-shadow: 0 4px 6px -1px rgba(239, 68, 68, 0.2);" title="Completar producción de ${dbTimer.username}">
                            Completar
                        </button>
                    `;
                } else {
                    actionButtonsHtml = `
                        <button disabled
                            class="press-btn" style="width:100%; background:#64748b; color:white; border:none; padding:12px; border-radius:12px; font-weight:700; font-size:1.25rem; opacity:0.55; cursor:not-allowed;">
                            En Producción
                        </button>
                    `;
                }
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
            <div class="step-row-container" data-step-id="${step.id}" data-date="${targetDate}" data-is-done="${isDone}" style="position:relative; background:${isDone ? '#e8f5e9' : (isTimerRunning ? '#fff5f5' : '#f8fafc')}; border:1px solid ${isDone ? '#c8e6c9' : (isTimerRunning ? '#fca5a5' : '#e2e8f0')}; border-radius:16px; padding:16px; transition: all 0.2s ease; box-shadow: ${isTimerRunning ? '0 4px 12px rgba(239, 68, 68, 0.05)' : 'none'};">
                <div class="flex" style="margin-bottom:12px; justify-content:space-between; align-items:center; gap:10px;">
                    <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0; padding-right:120px;">
                        <div style="display:flex; flex-direction:column; gap:4px; min-width:0; flex:1;">
                            <div style="display:flex; align-items:baseline; gap:10px; min-width:0; flex-wrap:wrap;">
                                <strong style="font-size:1.55rem; color:${isDone ? '#2e7d32' : '#1e293b'}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:800; display:inline-flex; align-items:center;">
                                    ${step.name || 'Proceso General'}
                                    ${producedInWindow > 0 ? (
                                        isDone 
                                        ? `<span style="font-size:0.95rem; color:#2e7d32; font-weight:700; background:#e8f5e9; border:1px solid #c8e6c9; padding:3px 8px; border-radius:8px; margin-left:8px; display:inline-block; vertical-align:middle; line-height:1;">✓ ${producedInWindow} completado ${completedBy ? `por ${completedBy}` : ''}</span>`
                                        : `<span style="font-size:1.1rem; color:#16a34a; font-weight:900; background:#dcfce7; padding:3px 8px; border-radius:8px; margin-left:8px; display:inline-block; vertical-align:middle; line-height:1;">✓ ${producedInWindow}</span>`
                                    ) : ''}
                                </strong>
                                <span class="timer-display" data-step-id="${step.id}" data-date="${targetDate}" 
                                    style="font-family:monospace; font-size:1.3rem; color:${isDone || (!isTimerRunning && completedDuration > 0) ? '#2e7d32' : (isTimerRunning ? '#ef4444' : '#64748b')}; font-weight:700; letter-spacing:0.5px;">
                                    ${this.formatDuration(elapsed)}
                                </span>
                                ${isTimerRunning ? '<span class="timer-pulse-dot" style="width:6px; height:6px; background:#ef4444; border-radius:50%; animation: pulse 1.5s infinite; flex-shrink:0;"></span>' : ''}
                            </div>
                            <div class="remote-actor-badge-container" style="margin-top:2px;">${remoteActorHtml ? remoteActorHtml : ''}</div>
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
                                <span><span class="qty-calc" data-base="${it.qty_per_unit}" style="font-weight:700; color:#1e293b;">${Math.round(qtyNeeded)}</span> / ${Math.round(currentProjected)} ${it.unit}</span>
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
                                <input type="number" class="ing-qty" data-base="${it.qty_per_unit}" value="${Math.round(qtyNeeded)}" style="width:80px; padding:6px; border:1px solid #cbd5e1; border-radius:8px; text-align:right; font-size:1.15rem;">
                                <span style="font-size:1.15rem;">${it.unit}</span>
                                <button type="button" class="press-btn" onclick="this.parentElement.remove()" style="padding:6px 10px; font-size:14px; background:#f1f5f9; color:#ef4444; border:none; border-radius:8px;">❌</button>
                            </div>
                            `;
                        }).join('')}
                        <div id="extra-ing-container-${inputId}" style="display:flex; flex-direction:column; gap:10px;"></div>
                        <button type="button" class="press-btn" onclick="window.KitchenManager.addExtraIngredientRow('${inputId}')" style="padding:8px; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; font-size:15px; text-align:center; width:100%; color:var(--text); font-weight:600;">+ Añadir ingrediente</button>
                    </div>
                </div>
                ${step.instructions && step.instructions.length > 0 ? `
                <div style="margin-top:14px; border-top:1px solid #eef2f6; padding-top:10px;">
                    <div style="font-size:1.05rem; font-weight:700; color:#db2777; text-transform:uppercase; margin-bottom:8px;">Paso a Paso</div>
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        ${step.instructions.map((inst, idx) => {
                            const checkKey = `${step.id}_${targetDate}_${idx}`;
                            const checkData = this.checkedInstructionsMap && this.checkedInstructionsMap[checkKey];
                            const isChecked = !!checkData;
                            
                            let timeLabel = '';
                            if (checkData && checkData.checked_at) {
                                const timeStr = new Date(checkData.checked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                timeLabel = `<span style="font-size:0.85rem; color:#0f766e; font-weight:700; background:#ccfbf1; padding:2px 6px; border-radius:6px; margin-left:6px; white-space:nowrap; display:inline-block; vertical-align:middle; text-decoration:none !important;">⏱️ ${timeStr} (${checkData.username || 'Cocinero'})</span>`;
                            }

                            return `
                            <label style="display:flex; align-items:flex-start; gap:10px; cursor:pointer; font-size:1.2rem; color:${isChecked ? '#94a3b8' : '#334155'}; text-decoration:${isChecked ? 'line-through' : 'none'}; transition:all 0.2s; padding:4px 0;">
                                <input type="checkbox" ${isChecked ? 'checked' : ''} 
                                    onclick="window.KitchenManager.toggleInstructionCheck('${step.id}', '${targetDate}', ${idx}, this)"
                                    style="width:20px; height:20px; border-radius:6px; border:2px solid #cbd5e1; cursor:pointer; margin-top:2px; flex-shrink: 0;">
                                <span style="display:inline-block; line-height:1.3;">
                                    ${idx + 1}. ${this.formatInstructionWithQuantities(inst, step.items, defaultQty)}${timeLabel}
                                </span>
                            </label>
                            `;
                        }).join('')}
                    </div>
                </div>
                ` : ''}
            </div>
        `;
    },

    async produceStep(stepId, dessertName, stepName, inputId, targetDate, targetUsername) {
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
                target_username: targetUsername || null,
                actor_name: targetUsername || window.state?.currentUser?.name || window.state?.currentUser?.username || "Cocinero"
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
                    duration: m.metadata?.duration_seconds || 0,
                    ids: [m.id]
                });
            } else {
                existing.ids.push(m.id);
                if (m.metadata?.duration_seconds) {
                    existing.duration = (existing.duration || 0) + m.metadata.duration_seconds;
                }
            }
        });

        actions.slice(0, 20).forEach(action => {
            const row = document.createElement('div');
            row.style = "background:white; border:1px solid #f1f5f9; border-radius:16px; padding:12px 16px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 2px 4px rgba(0,0,0,0.02); margin-bottom:8px;";
            
            const time = new Date(action.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const date = new Date(action.created_at).toLocaleDateString([], { day: '2-digit', month: 'short' });
            const durationText = action.duration ? ` • ⏱️ ${this.formatDuration(action.duration)}` : '';
            
            row.innerHTML = `
                <div style="display:flex; align-items:center; gap:12px;">
                    <div style="width:40px; height:40px; background:#f0fdf4; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:1.2rem;">🍳</div>
                    <div>
                        <div style="font-weight:700; font-size:0.9rem; color:#1e293b;">${action.note}</div>
                        <div style="font-size:0.75rem; color:#94a3b8;">
                            ${date} ${time} • ${action.actor || 'Cocinero'} 
                            ${action.target_date ? `• <span style="color:var(--primary); font-weight:600;">Para: ${action.target_date}</span>` : ''}
                            ${durationText}
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
    },

    isProductionUser() {
        const user = window.state?.currentUser;
        if (!user) return false;
        return user.role === 'produccion' || (user.features && user.features.includes('produccion'));
    },

    isSuperAdmin() {
        const user = window.state?.currentUser;
        if (!user) return false;
        return user.role === 'superadmin' || !!user.isSuperAdmin;
    },

    async checkAccess() {
        if (!this.isProductionUser()) {
            // Admin and superadmin always have access
            document.getElementById('kitchen-blocked-content')?.classList.add('hidden');
            document.getElementById('kitchen-active-content')?.classList.remove('hidden');
            
            // Show admin controls
            if (this.isSuperAdmin()) {
                document.getElementById('kitchen-admin-controls')?.classList.remove('hidden');
                await this.loadAdminControls();
            } else {
                document.getElementById('kitchen-admin-controls')?.classList.add('hidden');
            }
            
            // Update exit button dynamically for admins
            const goHomeBtn = document.getElementById('kitchen-go-home');
            if (goHomeBtn) {
                goHomeBtn.textContent = 'Inicio';
            }
            return true;
        }

        // Hide admin controls for normal production users
        document.getElementById('kitchen-admin-controls')?.classList.add('hidden');

        // Update exit button dynamically for production users
        const goHomeBtn = document.getElementById('kitchen-go-home');
        if (goHomeBtn) {
            goHomeBtn.textContent = 'Tienda';
        }

        try {
            const settings = await window.api('GET', '/api/store-settings');
            const approved = settings.production_access_approved === 'true';
            const nextProduction = settings.next_production_datetime || 'Pendiente de confirmación';

            if (!approved) {
                // Show blocked screen, hide active content
                document.getElementById('kitchen-active-content')?.classList.add('hidden');
                document.getElementById('kitchen-blocked-content')?.classList.remove('hidden');
                
                // Set next production date/time message
                const msgEl = document.getElementById('kitchen-next-production-msg');
                if (msgEl) {
                    msgEl.textContent = `Próxima fecha de producción: ${nextProduction}`;
                }
                
                // Clear any running intervals so no background requests are sent
                this.stopIntervals();
                return false;
            } else {
                // Access approved, show active content and hide blocked screen
                document.getElementById('kitchen-blocked-content')?.classList.add('hidden');
                document.getElementById('kitchen-active-content')?.classList.remove('hidden');
                return true;
            }
        } catch (e) {
            console.error("Error checking production access settings:", e);
            // Default to let it load if settings API fails
            return true;
        }
    },

    async loadAdminControls() {
        try {
            const settings = await window.api('GET', '/api/store-settings');
            const approved = settings.production_access_approved === 'true';
            const nextProduction = settings.next_production_datetime || '27 de Junio, 2:00 pm';

            // 1. Render toggle button
            const toggleBtn = document.getElementById('kitchen-toggle-access');
            if (toggleBtn) {
                if (approved) {
                    toggleBtn.className = 'press-btn success';
                    toggleBtn.textContent = '🟢 Acceso Cocina: Abierto';
                } else {
                    toggleBtn.className = 'press-btn danger';
                    toggleBtn.textContent = '🔴 Acceso Cocina: Cerrado';
                }
            }

            // 2. Render input value
            const inputEl = document.getElementById('kitchen-next-prod-input');
            if (inputEl) {
                inputEl.value = nextProduction;
            }
        } catch (err) {
            console.error("Error loading admin production access controls:", err);
        }
    }
};

window.KitchenManager = KitchenManager;
