const fs = require('fs');
const code = fs.readFileSync('scratch/heic2any.js', 'utf8');

const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const dom = new JSDOM(`<!DOCTYPE html><p>Hello world</p>`);
const window = dom.window;

// Execute the code in the JSDOM window
const script = new window.document.defaultView.Function('window', 'document', code);
script(window, window.document);

console.log("heic2any typeof:", typeof window.heic2any);
console.log("Keys in window:", Object.keys(window).filter(k => code.includes(k) || k.toLowerCase().includes('heic')));
