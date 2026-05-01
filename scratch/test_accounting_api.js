import http from 'http';

async function test() {
    const start = '2026-05-01';
    const end = '2026-05-31';
    const url = `http://localhost:8888/api/accounting?start=${start}&end=${end}`;
    console.log(`Fetching ${url}...`);

    http.get(url, (res) => {
        console.log(`Status: ${res.statusCode}`);
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
            try {
                const json = JSON.parse(data);
                console.log(`Data length: ${json.length}`);
                if (json.length > 0) {
                    console.log('First entry:', JSON.stringify(json[0], null, 2));
                }
            } catch (e) {
                console.log('Raw data (first 200 chars):', data.substring(0, 200));
                console.error('JSON Parse Error:', e.message);
            }
        });
    }).on('error', (e) => {
        console.error('Error:', e.message);
    });
}

test();
