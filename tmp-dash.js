const fs = require('fs');
let code = fs.readFileSync('assets/js/dashboard.js', 'utf8');

// 1. Metric Cards
code = code.replace(
  /class="metric-card dash-metric-card stagger-2 shine-effect border border-neutral-800\/60/g,
  'class="metric-card dash-metric-card stagger-2 glass-surface ghost-border ambient-shadow-primary'
);

// 2. Hero Header
code = code.replace(
  /dash-hero stagger-1 relative overflow-hidden border border-neutral-800\/60 p-6 md:p-8 group" style="background: linear-gradient\(135deg, #0f0f0f 0%, #080808 100%\);"/g,
  'dash-hero stagger-1 relative overflow-hidden glass-surface ghost-border p-6 md:p-8 group"'
);

// 3. Pipeline Wrapper
code = code.replace(
  /dash-pipeline stagger-3 relative overflow-hidden border border-neutral-800\/60 p-6 md:p-7" style="background: linear-gradient\(135deg, #0e0e0e 0%, #080808 100%\);"/g,
  'dash-pipeline stagger-3 relative overflow-hidden glass-surface ghost-border p-6 md:p-7"'
);

// 4. Comunicados Wrapper
code = code.replace(
  /dash-comunicados-panel col-span-1 lg:col-span-2 border border-neutral-800\/60 flex flex-col" style="background: linear-gradient\(180deg, #0d0d0d 0%, #080808 100%\);"/g,
  'dash-comunicados-panel col-span-1 lg:col-span-2 glass-surface ghost-border flex flex-col"'
);

// 5. Materiais Úteis Wrapper
code = code.replace(
  /dash-materials-panel border border-neutral-800\/60 p-5 flex flex-col gap-3" style="background: #0d0d0d;"/g,
  'dash-materials-panel glass-surface ghost-border p-5 flex flex-col gap-3"'
);

// 6. Admin Panel Wrappers (Lines 166, 174, 175, 176)
code = code.replace(
  /border border-neutral-800\/60 p-4" style="background: linear-gradient\(135deg, #0d0d0d 0%, #080808 100%\);"/g,
  'glass-surface ghost-border p-4"'
);
code = code.replace(
  /border border-neutral-800\/60 p-4" style="background:#0b0b0b;"/g,
  'glass-surface ghost-border p-4"'
);

// 7. Small lists/tables in Admin block items:
// border border-neutral-800 -> border border-stitch-border/30 (just softer)
code = code.replace(
  /border border-neutral-800 px-3 py-2/g,
  'border border-stitch-border/30 px-3 py-2 glass-surface'
);
code = code.replace(
  /border border-neutral-800 p-3/g,
  'border border-stitch-border/30 p-3 glass-surface'
);

// Remove specific extra gradients from CTA
code = code.replace(
  /style="background: linear-gradient\(135deg, rgba\(234,88,12,0.06\) 0%, #080808 60%\);"/g,
  'class="ambient-shadow-primary"'
);

fs.writeFileSync('assets/js/dashboard.js', code);
console.log('Dashboard Replaced');
