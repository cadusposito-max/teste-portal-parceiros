const fs = require('fs');
const files = ['assets/js/clientes.js', 'assets/js/vendas.js', 'assets/js/produtos.js', 'assets/js/proposta-builder.js'];

files.forEach(f => {
  if (!fs.existsSync(f)) return;
  let code = fs.readFileSync(f, 'utf8');

  // Replace Toolbar and Main Wrappers
  code = code.replace(/class="relative bg-(?:\[#080808\]|black) bg-grid overflow-hidden p-6 md:p-8 border border-neutral-800 mb-2"/g, 
    'class="relative bg-[#080808] bg-grid overflow-hidden p-6 md:p-8 glass-surface ghost-border mb-2"');
    
  code = code.replace(/class="relative bg-(?:\[#080808\]|black) bg-grid overflow-hidden p-6 md:p-8 border border-neutral-800"/g, 
    'class="relative bg-[#080808] bg-grid overflow-hidden p-6 md:p-8 glass-surface ghost-border"');

  // Replace Kanban / Container blocks
  code = code.replace(/class="border border-neutral-800 bg-\[#080808\] min-h-\[220px\] flex flex-col"/g, 
    'class="glass-surface ghost-border min-h-[220px] flex flex-col"');

  code = code.replace(/class="px-3 py-2\.5 border-b border-neutral-800 flex items-center justify-between gap-2"/g, 
    'class="px-3 py-2.5 border-b border-stitch-border/30 flex items-center justify-between gap-2"');

  // Replace Cards and list items
  code = code.replace(/class="([^"]*)border border-neutral-800 hover:border-orange-500\/25 ([^"]*) bg-\[#080808\]"/g,
    'class="$1 glass-surface ghost-border hover:border-stitch-primary/30 $2"');

  // Replace basic panels and wrappers that use "border border-neutral-800/something bg-something"
  code = code.replace(/bg-neutral-900\/80 border border-neutral-800\/60/g, 'glass-surface ghost-border');
  code = code.replace(/bg-[#0a0a0a] border border-neutral-800\/40/g, 'glass-surface ghost-border');
  
  // Replace Modal inner blocks if any (bg-neutral-900 border border-neutral-800)
  code = code.replace(/bg-neutral-900 border border-neutral-800/g, 'glass-surface ghost-border');

  fs.writeFileSync(f, code);
});
console.log('Component files replaced successfully.');
