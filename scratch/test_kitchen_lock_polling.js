import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';

// Load index.html content
const htmlPath = path.resolve('public/index.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

// Create a JSDOM instance with scripts enabled
const dom = new JSDOM(htmlContent, {
    url: "http://localhost/index.html",
    runScripts: "dangerously"
});

const { window } = dom;

// Mock window globals and functions
window.state = {
    currentUser: {
        role: 'produccion',
        name: 'jaimes'
    }
};

window.notify = {
    success: (msg) => console.log(`[Notify Success] ${msg}`),
    error: (msg) => console.log(`[Notify Error] ${msg}`)
};

// Mock the window.api function to capture requests
const apiCalls = [];
let apiResponse = { production_access_approved: 'false', next_production_datetime: '27 de Junio, 2:00 pm' };

window.api = async (method, endpoint, data) => {
    apiCalls.push({ method, endpoint, data, timestamp: Date.now() });
    if (endpoint === '/api/store-settings') {
        return apiResponse;
    }
    if (endpoint === '/api/inventory?action=production_sync_check') {
        return { last_change: 'some-timestamp' };
    }
    return [];
};

// Load and evaluate kitchen-manager.js in the JSDOM context
const jsPath = path.resolve('public/kitchen-manager.js');
let jsContent = fs.readFileSync(jsPath, 'utf8');

// Evaluate the script in the DOM window context
window.eval(jsContent);

// Extract KitchenManager from window
const km = window.KitchenManager;
if (!km) {
    console.error("FAIL: KitchenManager not loaded into JSDOM window");
    process.exit(1);
}

// Mock methods that load external data so we focus on access / polling logic
km.loadData = async () => {
    console.log("Mocked loadData called");
};

// Mock timers (setInterval and setTimeout) to control time
const originalSetInterval = global.setInterval;
const originalClearInterval = global.clearInterval;
const originalSetTimeout = global.setTimeout;
const originalClearTimeout = global.clearTimeout;

const activeIntervals = new Map();
const activeTimeouts = new Map();
let timerIdCounter = 1;

global.setInterval = (fn, delay) => {
    const id = timerIdCounter++;
    activeIntervals.set(id, { fn, delay });
    return id;
};

global.clearInterval = (id) => {
    activeIntervals.delete(id);
};

global.setTimeout = (fn, delay) => {
    const id = timerIdCounter++;
    activeTimeouts.set(id, { fn, delay });
    return id;
};

global.clearTimeout = (id) => {
    activeTimeouts.delete(id);
};

// Also map JSDOM window functions
window.setInterval = global.setInterval;
window.clearInterval = global.clearInterval;
window.setTimeout = global.setTimeout;
window.clearTimeout = global.clearTimeout;

// Helper to fast-forward time asynchronously
async function advanceTime(ms) {
    console.log(`⏱️ Fast-forwarding time by ${ms} ms...`);
    
    // Check timeouts
    const timeoutsToRun = [];
    for (const [id, t] of activeTimeouts.entries()) {
        t.delay -= ms;
        if (t.delay <= 0) {
            timeoutsToRun.push({ id, fn: t.fn });
        }
    }
    // Run timeouts that expired
    timeoutsToRun.sort((a,b) => a.id - b.id).forEach(({ id, fn }) => {
        activeTimeouts.delete(id);
        fn();
    });

    // Check intervals
    for (const [id, interval] of activeIntervals.entries()) {
        // Run the interval fn if delay has passed
        let remaining = ms;
        while (remaining >= interval.delay) {
            // Run the interval and wait for its microtasks to finish
            interval.fn();
            remaining -= interval.delay;
        }
    }
    
    // Flush the promise queue so async operations inside interval functions can run
    await new Promise(resolve => originalSetTimeout(resolve, 10));
}

async function runTests() {
    console.log("🚀 Starting DOM Lock Polling Test Suite...");

    // Test 1: Check access closed initially starts polling
    console.log("\n--- Test 1: Initializing while blocked starts 10s interval & 2m timeout ---");
    apiResponse = { production_access_approved: 'false', next_production_datetime: '27 de Junio, 2:00 pm' };
    apiCalls.length = 0;
    
    await km.init();

    // Verify view state
    const isBlockedHidden = window.document.getElementById('kitchen-blocked-content').classList.contains('hidden');
    const isActiveHidden = window.document.getElementById('kitchen-active-content').classList.contains('hidden');
    console.log("Blocked screen visible (expected true):", !isBlockedHidden);
    console.log("Active screen hidden (expected true):", isActiveHidden);
    
    if (isBlockedHidden || !isActiveHidden) {
        console.error("FAIL: Incorrect visibility states when access is closed");
        process.exit(1);
    }

    // Verify polling timers exist
    console.log("Active intervals (expected 1):", activeIntervals.size);
    console.log("Active timeouts (expected 1):", activeTimeouts.size);
    if (activeIntervals.size !== 1 || activeTimeouts.size !== 1) {
        console.error("FAIL: Did not setup polling interval or timeout");
        process.exit(1);
    }

    // Test 2: Polling calls API every 10 seconds
    console.log("\n--- Test 2: Polling calls API every 10 seconds ---");
    apiCalls.length = 0;
    
    await advanceTime(30000); // 30 seconds
    console.log("API calls during 30s polling (expected 3):", apiCalls.filter(c => c.endpoint === '/api/store-settings').length);
    if (apiCalls.filter(c => c.endpoint === '/api/store-settings').length !== 3) {
        console.error("FAIL: Polling did not check API every 10s");
        process.exit(1);
    }

    // Test 3: Polling expires after 2 minutes (120 seconds total)
    console.log("\n--- Test 3: Polling automatically stops after 2 minutes ---");
    apiCalls.length = 0;
    // We already advanced 30s. Advance 95s more to reach 125s total (> 120s)
    await advanceTime(95000);
    
    console.log("Active intervals after 2 minutes (expected 0):", activeIntervals.size);
    console.log("Active timeouts after 2 minutes (expected 0):", activeTimeouts.size);
    if (activeIntervals.size !== 0 || activeTimeouts.size !== 0) {
        console.error("FAIL: Polling timers were not cleaned up after 2 minutes");
        process.exit(1);
    }

    // Confirm no more calls are made after expiration
    apiCalls.length = 0;
    await advanceTime(30000);
    console.log("API calls after expiration (expected 0):", apiCalls.filter(c => c.endpoint === '/api/store-settings').length);
    if (apiCalls.filter(c => c.endpoint === '/api/store-settings').length !== 0) {
        console.error("FAIL: Polling continued after expiration");
        process.exit(1);
    }

    // Test 4: Clicking recheck button restarts the 2-minute window
    console.log("\n--- Test 4: Clicking 'Reintentar' restarts the 2-minute polling window ---");
    const recheckBtn = window.document.getElementById('kitchen-recheck-btn');
    if (!recheckBtn) {
        console.error("FAIL: 'Reintentar' button not found in DOM");
        process.exit(1);
    }

    apiCalls.length = 0;
    // Simulate click
    await recheckBtn.onclick();
    // Flush promise queue to allow onclick async calls to process
    await new Promise(resolve => originalSetTimeout(resolve, 10));

    // Verify immediate call is made
    console.log("Immediate check made (expected at least 1 API call):", apiCalls.length > 0);
    console.log("Active intervals restarted (expected 1):", activeIntervals.size);
    console.log("Active timeouts restarted (expected 1):", activeTimeouts.size);
    if (activeIntervals.size !== 1 || activeTimeouts.size !== 1) {
        console.error("FAIL: 'Reintentar' did not restart the 2-minute polling timers");
        process.exit(1);
    }

    // Test 5: Dynamic unlock when approved
    console.log("\n--- Test 5: Dynamic unlock during polling when access is approved ---");
    apiResponse = { production_access_approved: 'true', next_production_datetime: '27 de Junio, 2:00 pm' };
    apiCalls.length = 0;

    // Advance 10s to trigger next interval tick
    await advanceTime(10000);

    const isBlockedHiddenNow = window.document.getElementById('kitchen-blocked-content').classList.contains('hidden');
    const isActiveHiddenNow = window.document.getElementById('kitchen-active-content').classList.contains('hidden');
    console.log("Blocked screen hidden after approval (expected true):", isBlockedHiddenNow);
    console.log("Active screen visible after approval (expected true):", !isActiveHiddenNow);
    
    console.log("Lock polling interval is null (expected true):", km._lockPollingInterval === null);
    console.log("Lock polling timeout is null (expected true):", km._lockPollingTimeout === null);
    
    // Verify that active kitchen intervals were resumed
    console.log("Active kitchen intervals started (expected 2):", activeIntervals.size);
    
    if (!isBlockedHiddenNow || isActiveHiddenNow || km._lockPollingInterval !== null || km._lockPollingTimeout !== null || activeIntervals.size !== 2) {
        console.error("FAIL: Did not unlock dynamically or stop lock polling properly");
        process.exit(1);
    }

    console.log("\n🎉 ALL DOM/FRONTEND LOCK POLLING TESTS PASSED SUCCESSFULLY!");
    process.exit(0);
}

runTests().catch(err => {
    console.error("Test suite crashed:", err);
    process.exit(1);
});
