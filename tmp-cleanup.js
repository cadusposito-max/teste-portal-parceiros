const fs = require('fs');

function applyGlassmorphism(filePath, rules) {
  if (!fs.existsSync(filePath)) return false;
  let original = fs.readFileSync(filePath, 'utf8');
  let current = original;

  for (let [pattern, replacement] of rules) {
    current = current.replace(pattern, replacement);
  }

  if (current !== original) {
    fs.writeFileSync(filePath, current);
    return true;
  }
  return false;
}

// dashboard.js
applyGlassmorphism('assets/js/dashboard.js', [
  [/bg-neutral-900\/80/g, 'glass-surface bg-stitch-surface/60'],
  [/bg-neutral-900\/30/g, 'bg-stitch-surfaceHigh/20'],
  [/bg-neutral-900\/60/g, 'glass-surface bg-stitch-surface/40'],
  [/w-24 h-16 bg-neutral-900 border border-neutral-800/g, 'w-24 h-16 glass-surface ghost-border'], // Comunicados thumb
  [/w-full h-px bg-neutral-900 rounded-full/g, 'w-full h-px bg-stitch-border/30 rounded-full'], // Separators
  [/h-1 bg-neutral-900/g, 'h-1 bg-stitch-surfaceHigh/40'], // Progress bars
  [/border border-neutral-700 bg-neutral-900/g, 'glass-surface ghost-border'] // Select inputs
]);

// clientes.js
applyGlassmorphism('assets/js/clientes.js', [
  [/bg-neutral-900 border border-neutral-700 hover:border-green-500/g, 'glass-surface ghost-border hover:border-stitch-primary/40'], // Export btn
  [/bg-neutral-950\/40/g, 'glass-surface border-stitch-border/30'] // empty filter
]);

// vendas.js
applyGlassmorphism('assets/js/vendas.js', [
  [/bg-neutral-900 border border-neutral-700 hover:border-green-500/g, 'glass-surface ghost-border hover:border-stitch-primary/40'], // Export btn
  [/bg-neutral-900\/60 border border-neutral-800 p-4/g, 'glass-surface ghost-border p-4'], // Summary metric card
  [/bg-neutral-950\/40/g, 'glass-surface border-stitch-border/30']
]);

// produtos.js
applyGlassmorphism('assets/js/produtos.js', [
  [/bg-neutral-900 mb-6 text-neutral-700 border border-neutral-800/g, 'glass-surface mb-6 text-warning border-stitch-border/30'], // Empty block
  [/bg-neutral-900/g, 'glass-surface bg-stitch-surface/60'] // Any leftover bg-neutral-900
]);

// proposta-builder.js
applyGlassmorphism('assets/js/proposta-builder.js', [
  [/bg-neutral-900 p-2 border border-neutral-800/g, 'glass-surface p-2 border border-stitch-border/30'], // Grid inner 
  [/bg-neutral-800 border border-neutral-700 hover:border-orange-500\/50 hover:text-orange-400 text-neutral-400 px-3/g, 'glass-surface ghost-border hover:border-stitch-primary/40 text-stitch-text px-3'] // historico copiar link
]);

console.log("Cleanup applied.");
