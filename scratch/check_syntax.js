import fs from 'fs';
const content = fs.readFileSync('public/partners.html', 'utf8');
try {
    const scripts = content.match(/<script/g) || [];
    const endScripts = content.match(/<\/script>/g) || [];
    console.log(`Scripts: ${scripts.length}, EndScripts: ${endScripts.length}`);
    
    const jsPart = content.match(/<script>([\s\S]*?)<\/script>/);
    if (jsPart) {
        // We can't use new Function directly easily with imports, but we can check for simple syntax
        // Or just print the scripts count for now.
    }
} catch (e) {
    console.error("Syntax Error:", e);
}
