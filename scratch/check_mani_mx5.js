
async function run() {
    try {
        const baseUrl = 'http://localhost:8888';
        const res = await fetch(`${baseUrl}/api/recipes?all_items=1`);
        if (!res.ok) throw new Error('API down');
        const data = await res.json();
        
        console.log('--- Recipes for Maní ---');
        const maniItems = (data.items || []).filter(it => it.dessert === 'Maní');
        console.log(maniItems);
        
        console.log('--- Recipes for Mx5 ---');
        const mx5Items = (data.items || []).filter(it => it.dessert === 'Mx5');
        console.log(mx5Items);

        const desserts = data.desserts || [];
        console.log('Desserts list in recipes:', desserts);
    } catch (e) {
        console.error('Error:', e.message);
    }
}
run();
