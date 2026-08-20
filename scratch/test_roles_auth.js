import { ensureSchema, sql } from '../netlify/functions/_db.js';

async function run() {
    console.log('🔄 Initializing database schema and ensuring migration v63 runs...');
    await ensureSchema();

    // 1. Fetch all users and check their roles
    const users = await sql`SELECT id, username, role FROM users`;
    console.log('\n👤 Database Users found:');
    console.table(users);

    // 2. Fetch all sellers
    const sellers = await sql`SELECT id, name FROM sellers`;
    console.log('\n🏪 Database Sellers found:');
    console.table(sellers);

    // 3. Fetch feature permissions
    const permissions = await sql`SELECT username, feature FROM user_feature_permissions`;
    console.log('\n🔑 Feature Permissions found:');
    console.table(permissions);

    // 4. Perform validations
    console.log('\n🧪 Running validations...');
    
    // Check if any user still has the 'cocina' role
    const kitchenUsers = users.filter(u => u.role === 'cocina');
    if (kitchenUsers.length > 0) {
        console.error('❌ FAIL: There are still users with role "cocina":', kitchenUsers);
        process.exit(1);
    } else {
        console.log('✅ PASS: No users with role "cocina" exist.');
    }

    // Check if user 'jaimes' exists and has role 'user' (mixed/seller)
    const jaimes = users.find(u => u.username.toLowerCase() === 'jaimes');
    if (!jaimes) {
        console.error('❌ FAIL: User "jaimes" does not exist in the database!');
        process.exit(1);
    } else if (jaimes.role !== 'user') {
        console.error(`❌ FAIL: User "jaimes" has role "${jaimes.role}", expected "user" (seller)!`);
        process.exit(1);
    } else {
        console.log('✅ PASS: User "jaimes" exists and has role "user" (seller).');
    }

    // Check if user 'jaimes' has 'produccion' feature permission
    const jaimesProdFeature = permissions.find(p => p.username.toLowerCase() === 'jaimes' && p.feature === 'produccion');
    if (!jaimesProdFeature) {
        console.error('❌ FAIL: User "jaimes" does not have the "produccion" feature permission!');
        process.exit(1);
    } else {
        console.log('✅ PASS: User "jaimes" has the "produccion" feature permission.');
    }

    // Check if seller 'Jaimes' exists in sellers table
    const jaimesSeller = sellers.find(s => s.name.toLowerCase() === 'jaimes');
    if (!jaimesSeller) {
        console.error('❌ FAIL: Seller "Jaimes" does not exist in the database!');
        process.exit(1);
    } else {
        console.log('✅ PASS: Seller "Jaimes" exists in the database.');
    }

    // Check if table active_production_timers exists
    try {
        const tableCheck = await sql`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'active_production_timers'
            );
        `;
        if (tableCheck[0]?.exists) {
            console.log('✅ PASS: active_production_timers table exists.');
        } else {
            console.error('❌ FAIL: active_production_timers table does not exist!');
            process.exit(1);
        }
    } catch (err) {
        console.error('❌ FAIL: Error checking active_production_timers table:', err);
        process.exit(1);
    }

    // Check if table production_sync_meta exists
    try {
        const tableCheck = await sql`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'production_sync_meta'
            );
        `;
        if (tableCheck[0]?.exists) {
            console.log('✅ PASS: production_sync_meta table exists.');
        } else {
            console.error('❌ FAIL: production_sync_meta table does not exist!');
            process.exit(1);
        }
    } catch (err) {
        console.error('❌ FAIL: Error checking production_sync_meta table:', err);
        process.exit(1);
    }

    console.log('\n🎉 All role, timer, and sync metadata database checks passed successfully!');
    process.exit(0);
}

run().catch(err => {
    console.error('❌ Execution error:', err);
    process.exit(1);
});
