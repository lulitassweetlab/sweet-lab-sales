
async function run() {
    try {
        const baseUrl = 'http://localhost:8888'; // Netlify dev default
        const res = await fetch(`${baseUrl}/api/desserts`);
        if (!res.ok) throw new Error('API not available. Make sure netlify dev is running.');
        const desserts = await res.json();
        const bx5 = desserts.find(d => d.name.includes('Bx5') || d.short_code === 'bx5');
        
        if (bx5) {
            console.log('Found dessert:', bx5);
            const updateRes = await fetch(`${baseUrl}/api/desserts`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...bx5,
                    short_code: 'bx5' // Ensuring it is bx5 lowercase and persists
                })
            });
            if (updateRes.ok) {
                console.log('Successfully updated short_code to bx5');
            } else {
                const err = await updateRes.json();
                console.error('Failed to update:', err);
            }
        } else {
            console.log('Dessert Bx5 not found in database.');
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
}
run();
