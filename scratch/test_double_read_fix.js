import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';

// Load index.html content
const htmlPath = path.resolve('public/index.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

// Create JSDOM instance
const dom = new JSDOM(htmlContent, {
    url: "http://localhost/index.html",
    runScripts: "dangerously"
});

const { window } = dom;

// Mock window.matchMedia for JSDOM
window.matchMedia = window.matchMedia || function() {
    return {
        matches: false,
        addListener: function() {},
        removeListener: function() {}
    };
};

// Mock globals needed by app.js
window.state = {
    currentUser: {
        username: 'jaimes',
        role: 'user',
        features: ['produccion']
    }
};

window.notify = {
    success: (msg) => console.log(`[Notify Success] ${msg}`),
    error: (msg) => console.log(`[Notify Error] ${msg}`)
};

// Create a custom mock for fetch that supports clone()
let mockResponseData = {
    status: 403,
    ok: false,
    json: async () => ({ error: 'production_access_denied', message: 'El acceso a la cocina está cerrado' }),
    text: async () => JSON.stringify({ error: 'production_access_denied', message: 'El acceso a la cocina está cerrado' })
};

window.fetch = async (url, options) => {
    // Return a Response-like object that supports cloning
    const makeResponse = (bodyRead = false) => {
        let isRead = bodyRead;
        return {
            status: mockResponseData.status,
            ok: mockResponseData.ok,
            clone: () => {
                if (isRead) throw new TypeError("Failed to execute 'clone' on 'Response': body stream already read");
                return makeResponse(false);
            },
            json: async () => {
                if (isRead) throw new TypeError("Failed to execute 'json' on 'Response': body stream already read");
                isRead = true;
                return mockResponseData.json();
            },
            text: async () => {
                if (isRead) throw new TypeError("Failed to execute 'text' on 'Response': body stream already read");
                isRead = true;
                return mockResponseData.text();
            }
        };
    };
    return makeResponse(false);
};

// Load app.js in window context
const appJsPath = path.resolve('public/app.js');
const appJsContent = fs.readFileSync(appJsPath, 'utf8');
window.eval(appJsContent);

// Mock window.KitchenManager
let checkAccessCalled = false;
let stopIntervalsCalled = false;

window.KitchenManager = {
    isProductionUser: () => true,
    stopIntervals: () => {
        stopIntervalsCalled = true;
        console.log("Mock KitchenManager.stopIntervals() invoked");
    },
    checkAccess: async () => {
        checkAccessCalled = true;
        console.log("Mock KitchenManager.checkAccess() invoked");
        return false;
    }
};

async function runTests() {
    console.log("🚀 Running API Stream and Proactive Lock Test...");

    try {
        // Trigger a request that returns 403 production_access_denied
        await window.api('GET', '/api/inventory?action=production_sync_check');
        console.error("FAIL: Expected API call to throw a 403 error, but it succeeded!");
        process.exit(1);
    } catch (e) {
        console.log("Caught expected error:", e.message);
        
        // Assert that it did NOT throw a body stream already read TypeError
        if (e.message.includes("body stream already read")) {
            console.error("FAIL: TypeError body stream already read was thrown!");
            process.exit(1);
        } else {
            console.log("✅ PASS: Correct error thrown, no stream consumption TypeError detected.");
        }
    }

    // Assert that KitchenManager was proactively called to lock the UI
    console.log("KitchenManager.stopIntervals() called:", stopIntervalsCalled);
    console.log("KitchenManager.checkAccess() called:", checkAccessCalled);

    if (stopIntervalsCalled && checkAccessCalled) {
        console.log("✅ PASS: KitchenManager was proactively called to lock the UI.");
        console.log("\n🎉 ALL API STREAM AND PROACTIVE LOCK TESTS PASSED!");
        process.exit(0);
    } else {
        console.error("FAIL: KitchenManager was not proactively called on access denial.");
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error("Test execution crashed:", err);
    process.exit(1);
});
