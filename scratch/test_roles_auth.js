import { ensureSchema, sql } from '../netlify/functions/_db.js';

async function run() {
    console.log('🔄 Initializing database schema and ensuring migration v61 runs...');
    await ensureSchema();

    // 1. Fetch all users and check their roles
    const users = await sql`SELECT id, username, role FROM users`;
    console.log('\n👤 Database Users found:');
    console.table(users);

    // 2. Perform validations
    console.log('\n🧪 Running validations...');
    
    // Check if any user still has the 'cocina' role
    const kitchenUsers = users.filter(u => u.role === 'cocina');
    if (kitchenUsers.length > 0) {
        console.error('❌ FAIL: There are still users with role "cocina":', kitchenUsers);
        process.exit(1);
    } else {
        console.log('✅ PASS: No users with role "cocina" exist.');
    }

    // Check if user 'jaimes' exists and has role 'produccion'
    const jaimes = users.find(u => u.username.toLowerCase() === 'jaimes');
    if (!jaimes) {
        console.error('❌ FAIL: User "jaimes" does not exist in the database!');
        process.exit(1);
    } else if (jaimes.role !== 'produccion') {
        console.error(`❌ FAIL: User "jaimes" has role "${jaimes.role}", expected "produccion"!`);
        process.exit(1);
    } else {
        console.log('✅ PASS: User "jaimes" exists and has role "produccion".');
    }

    // Check that we have a 'produccion' role user
    const productionUsers = users.filter(u => u.role === 'produccion');
    if (productionUsers.length === 0) {
        console.warn('⚠️ WARNING: No users found with role "produccion".');
    } else {
        console.log(`✅ PASS: Found ${productionUsers.length} user(s) with role "produccion" (${productionUsers.map(u => u.username).join(', ')}).`);
    }

    console.log('\n🎉 All role database checks passed successfully!');
    process.exit(0);
}

run().catch(err => {
    console.error('❌ Execution error:', err);
    process.exit(1);
});
