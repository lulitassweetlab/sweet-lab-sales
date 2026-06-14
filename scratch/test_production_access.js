import { ensureSchema, sql } from '../netlify/functions/_db.js';
import { handler as storeSettingsHandler } from '../netlify/functions/store-settings.js';
import { handler as inventoryHandler } from '../netlify/functions/inventory.js';

async function run() {
    console.log('🔄 Ensuring schema migration v66 runs and db is ready...');
    await ensureSchema();

    // Store original settings to restore at the end
    const [origApprovedRow] = await sql`SELECT value FROM store_settings WHERE key = 'production_access_approved' LIMIT 1`;
    const [origNextRow] = await sql`SELECT value FROM store_settings WHERE key = 'next_production_datetime' LIMIT 1`;
    const origApproved = origApprovedRow?.value || 'false';
    const origNext = origNextRow?.value || '27 de Junio, 2:00 pm';

    console.log(`Original settings -> Approved: ${origApproved}, Next Date: ${origNext}`);

    console.log('\n🧪 Running test cases...');

    // Test Case 1: Superadmin (jorge) can disable production access
    console.log('\n--- Test Case 1: Superadmin (jorge) disables access ---');
    const disableRes = await storeSettingsHandler({
        httpMethod: 'POST',
        headers: {
            'x-actor-name': 'jorge'
        },
        body: JSON.stringify({
            production_access_approved: 'false',
            next_production_datetime: '27 de Junio, 2:00 pm'
        })
    });
    console.log(`Status: ${disableRes.statusCode}`);
    const disableBody = JSON.parse(disableRes.body);
    if (disableRes.statusCode === 200 && disableBody.production_access_approved === 'false') {
        console.log('✅ PASS: Superadmin successfully disabled production access.');
    } else {
        console.error('❌ FAIL: Superadmin failed to disable production access.', disableRes);
        process.exit(1);
    }

    // Test Case 2: Production user (jaimes) is blocked from accessing inventory GET endpoints
    console.log('\n--- Test Case 2: Production user (jaimes) is blocked from inventory GET endpoints ---');
    const getRes = await inventoryHandler({
        httpMethod: 'GET',
        headers: {
            'x-actor-name': 'jaimes'
        },
        rawQuery: 'action=active_timers'
    });
    console.log(`Status: ${getRes.statusCode}`);
    const getBody = JSON.parse(getRes.body);
    if (getRes.statusCode === 403 && getBody.error === 'production_access_denied') {
        console.log('✅ PASS: Production user was successfully blocked with 403 Forbidden.');
    } else {
        console.error('❌ FAIL: Production user was not blocked or returned incorrect status.', getRes);
        process.exit(1);
    }

    // Test Case 3: Production user (jaimes) is blocked from starting timers (POST)
    console.log('\n--- Test Case 3: Production user (jaimes) is blocked from inventory POST endpoints ---');
    const postRes = await inventoryHandler({
        httpMethod: 'POST',
        headers: {
            'x-actor-name': 'jaimes'
        },
        body: JSON.stringify({
            action: 'timer.start',
            step_id: 1,
            target_date: '2026-06-27',
            qty: 5
        })
    });
    console.log(`Status: ${postRes.statusCode}`);
    const postBody = JSON.parse(postRes.body);
    if (postRes.statusCode === 403 && postBody.error === 'production_access_denied') {
        console.log('✅ PASS: Production user was successfully blocked from writing with 403.');
    } else {
        console.error('❌ FAIL: Production user was not blocked from writing.', postRes);
        process.exit(1);
    }

    // Test Case 4: Production user (jaimes) cannot enable access themselves
    console.log('\n--- Test Case 4: Production user (jaimes) cannot modify access settings ---');
    const hackRes = await storeSettingsHandler({
        httpMethod: 'POST',
        headers: {
            'x-actor-name': 'jaimes'
        },
        body: JSON.stringify({
            production_access_approved: 'true'
        })
    });
    console.log(`Status: ${hackRes.statusCode}`);
    const hackBody = JSON.parse(hackRes.body);
    if (hackRes.statusCode === 403 && hackBody.error.includes('No autorizado')) {
        console.log('✅ PASS: Production user was blocked from modifying access settings.');
    } else {
        console.error('❌ FAIL: Production user was allowed to modify access settings or returned wrong status.', hackRes);
        process.exit(1);
    }

    // Test Case 5: Superadmin (jorge) can enable production access
    console.log('\n--- Test Case 5: Superadmin (jorge) enables access ---');
    const enableRes = await storeSettingsHandler({
        httpMethod: 'POST',
        headers: {
            'x-actor-name': 'jorge'
        },
        body: JSON.stringify({
            production_access_approved: 'true'
        })
    });
    console.log(`Status: ${enableRes.statusCode}`);
    const enableBody = JSON.parse(enableRes.body);
    if (enableRes.statusCode === 200 && enableBody.production_access_approved === 'true') {
        console.log('✅ PASS: Superadmin successfully enabled production access.');
    } else {
        console.error('❌ FAIL: Superadmin failed to enable production access.', enableRes);
        process.exit(1);
    }

    // Test Case 6: Production user (jaimes) can access inventory when approved is true
    console.log('\n--- Test Case 6: Production user (jaimes) can access inventory when approved is true ---');
    const activeTimersRes = await inventoryHandler({
        httpMethod: 'GET',
        headers: {
            'x-actor-name': 'jaimes'
        },
        rawQuery: 'action=active_timers'
    });
    console.log(`Status: ${activeTimersRes.statusCode}`);
    if (activeTimersRes.statusCode === 200) {
        console.log('✅ PASS: Production user successfully retrieved active timers when approved.');
    } else {
        console.error('❌ FAIL: Production user was blocked even though approved was true.', activeTimersRes);
        process.exit(1);
    }

    // Test Case 7: Admin (marcela) always retains access even if approved is false
    console.log('\n--- Test Case 7: Admin (marcela) always retains access even when closed ---');
    // Disable access again first
    await storeSettingsHandler({
        httpMethod: 'POST',
        headers: { 'x-actor-name': 'jorge' },
        body: JSON.stringify({ production_access_approved: 'false' })
    });
    const adminRes = await inventoryHandler({
        httpMethod: 'GET',
        headers: {
            'x-actor-name': 'marcela'
        },
        rawQuery: 'action=active_timers'
    });
    console.log(`Status: ${adminRes.statusCode}`);
    if (adminRes.statusCode === 200) {
        console.log('✅ PASS: Admin (marcela) successfully bypassed the production access restrictions.');
    } else {
        console.error('❌ FAIL: Admin was incorrectly blocked when production access was closed.', adminRes);
        process.exit(1);
    }

    // Restore original settings
    console.log('\n♻️ Restoring original settings...');
    await storeSettingsHandler({
        httpMethod: 'POST',
        headers: { 'x-actor-name': 'jorge' },
        body: JSON.stringify({
            production_access_approved: origApproved,
            next_production_datetime: origNext
        })
    });
    console.log('✅ Original settings restored.');

    console.log('\n🎉 All temporal production access backend checks passed successfully!');
    process.exit(0);
}

run().catch(err => {
    console.error('❌ Test execution error:', err);
    process.exit(1);
});
