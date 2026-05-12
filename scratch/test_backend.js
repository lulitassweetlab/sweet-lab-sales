import { handler } from '../netlify/functions/partners-report.js';

const mockEvent = {
    queryStringParameters: { force_sync: '1' },
    httpMethod: 'GET',
    headers: {}
};

const mockContext = {};

async function test() {
    try {
        console.log("Starting backend test...");
        const response = await handler(mockEvent, mockContext);
        console.log("Response Status:", response.statusCode);
        console.log("Response Body (first 500 chars):", response.body.substring(0, 500));
        if (response.statusCode !== 200) {
            console.error("FULL ERROR BODY:", response.body);
        }
    } catch (e) {
        console.error("Test Crash:", e);
    }
}

test();
