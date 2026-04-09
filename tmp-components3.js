const fs = require('fs');
const f = 'assets/js/proposta-builder.js';
if (fs.existsSync(f)) {
  let code = fs.readFileSync(f, 'utf8');

  // Replace Product cards in grid and list
  code = code.replace(/bg-\[#0f0f0f\] border border-neutral-800 hover:border-orange-500/g, 'glass-surface ghost-border hover:border-stitch-primary/30');

  // Replace Historico container border styles (if possible)
  // Or just leave them since they have specific dynamic tailwind classes like border-green-900/40

  // Replace Financiamento cards
  code = code.replace(/metric-card shine-effect group block border border-neutral-800 hover:border-orange-500\/30/g, 'metric-card shine-effect group block glass-surface ghost-border hover:border-stitch-primary/30');

  fs.writeFileSync(f, code);
}
console.log('Proposta-builder stlyed');
