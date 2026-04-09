const fs = require('fs');

let f = 'assets/js/produtos.js';
if (fs.existsSync(f)) {
  let code = fs.readFileSync(f, 'utf8');

  // Replace grid items
  code = code.replace(/bg-neutral-900 border-2 border-dashed border-orange-500\/50/g, 'glass-surface ghost-border');
  
  // Replace list items
  code = code.replace(/bg-neutral-900 border-b border-dashed border-orange-500\/30/g, 'glass-surface ghost-border border-b');

  // Replace wrapper bg-neutral-900/50
  code = code.replace(/bg-neutral-900\/50 border border-neutral-800/g, 'glass-surface ghost-border');
  
  // Replace sub detail box bg-black/50 border border-neutral-800
  code = code.replace(/bg-black\/50 border border-neutral-800/g, 'glass-surface border border-stitch-border/30');

  fs.writeFileSync(f, code);
}

f = 'assets/js/proposta-builder.js';
if (fs.existsSync(f)) {
  let code = fs.readFileSync(f, 'utf8');
  // Proposta builder uses bg-neutral-900/40, bg-[#0a0a0a], border-neutral-800
  code = code.replace(/bg-\[#0a0a0a\] border border-neutral-800\/60/g, 'glass-surface ghost-border');
  code = code.replace(/bg-neutral-900\/40 border border-neutral-800\/60/g, 'glass-surface ghost-border');
  code = code.replace(/bg-neutral-950\/80 border border-neutral-800\/60/g, 'glass-surface ghost-border');
  
  fs.writeFileSync(f, code);
}

console.log('Rest of components styled');
