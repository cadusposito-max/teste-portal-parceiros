// ==========================================
// UTILITÁRIOS GERAIS
// ==========================================

// --- Segurança: sanitizar strings antes de inserir no DOM ---
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatCurrency(val) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

function formatDate(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  return d.toLocaleDateString('pt-BR');
}

// --- Toast com fila (evita sobreposição) ---
let _toastQueue   = [];
let _toastShowing = false;

function showToast(msg) {
  _toastQueue.push(msg);
  if (!_toastShowing) _processToastQueue();
}

function _processToastQueue() {
  if (_toastQueue.length === 0) { _toastShowing = false; return; }
  _toastShowing = true;
  const msg   = _toastQueue.shift();
  const toast = document.getElementById('toast');
  document.getElementById('toast-msg').innerText = msg;
  toast.classList.remove('translate-y-full', 'opacity-0');
  setTimeout(() => {
    toast.classList.add('translate-y-full', 'opacity-0');
    setTimeout(_processToastQueue, 350);
  }, 3000);
}

// --- Modal de confirmação genérico ---
function showConfirmModal(message, onConfirm, confirmLabel = 'CONFIRMAR', danger = true) {
  document.getElementById('confirm-modal-msg').innerText = message;
  const btnYes = document.getElementById('btn-confirm-yes');
  btnYes.innerText = confirmLabel;
  btnYes.className = danger
    ? 'flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-black uppercase tracking-widest transition-colors text-sm'
    : 'flex-1 py-3 bg-orange-600 hover:bg-orange-500 text-black font-black uppercase tracking-widest transition-colors text-sm';
  btnYes.onclick = () => { hideConfirmModal(); onConfirm(); };
  document.getElementById('confirm-modal-overlay').classList.remove('hidden');
}

function hideConfirmModal() {
  document.getElementById('confirm-modal-overlay').classList.add('hidden');
}

// ==========================================
// ANIMAÇÃO DE CONTADORES
// ==========================================
function animateCounters() {
  document.querySelectorAll('[data-count]').forEach(el => {
    const target     = parseFloat(el.dataset.count) || 0;
    const isCurrency = el.dataset.countCurrency === 'true';
    const duration   = 1200;
    const start      = performance.now();

    const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

    const tick = (now) => {
      const elapsed  = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const current  = target * easeOutCubic(progress);

      if (isCurrency) {
        el.textContent = formatCurrency(Math.floor(current));
      } else {
        el.textContent = Math.floor(current).toLocaleString('pt-BR');
      }

      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        el.textContent = isCurrency
          ? formatCurrency(target)
          : target.toLocaleString('pt-BR');
      }
    };

    requestAnimationFrame(tick);
  });
}

// ==========================================
// SAUDAÇÃO E INFO DO USUÁRIO
// ==========================================
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function getFirstName() {
  if (!state.currentUser) return '';
  const meta = state.currentUser.user_metadata || {};
  const full  = meta.full_name || meta.name || '';
  if (full) return full.split(' ')[0];
  const email = state.currentUser.email || '';
  const prefix = email.split('@')[0];
  const name   = prefix.split('.')[0].split('_')[0];
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

function getBadgeStyles(tag) {
  const styles = {
    'MAIS VENDIDO':    'bg-gradient-to-r from-orange-600 to-yellow-500 text-black border-orange-500',
    'PREMIUM':         'bg-neutral-800 text-orange-400 border-orange-500',
    'CUSTO-BENEFÍCIO': 'bg-green-600 text-white border-green-500',
    'LANÇAMENTO':      'bg-blue-600 text-white border-blue-500',
    'ALTA POTÊNCIA':   'bg-red-600 text-white border-red-500',
    'PROJETO ESPECIAL':'bg-neutral-700 text-neutral-300 border-neutral-600',
  };
  return styles[tag] || styles['PROJETO ESPECIAL'];
}

function getStatusColor(status) {
  switch (status) {
    case 'NOVO':              return 'text-blue-400 border-blue-500/50 bg-blue-500/10 hover:bg-blue-500/20';
    case 'PROPOSTA ENVIADA':  return 'text-yellow-400 border-yellow-500/50 bg-yellow-500/10 hover:bg-yellow-500/20';
    case 'EM NEGOCIAÇÃO':     return 'text-orange-500 border-orange-500/50 bg-orange-500/10 hover:bg-orange-500/20';
    case 'FECHADO':           return 'text-green-400 border-green-500/50 bg-green-500/10 hover:bg-green-500/20';
    default:                  return 'text-blue-400 border-blue-500/50 bg-blue-500/10 hover:bg-blue-500/20';
  }
}

// Estima geração mensal em kWh
function calcularGeracaoEstimada(potencia_kWp, categoria) {
  const horasSolMesBruto = 153.75;
  const eficiencia = categoria === 'kitsMicro' ? 0.85 : 0.80;
  return potencia_kWp * horasSolMesBruto * eficiencia;
}

function copiarTextoBlindado(texto) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(texto).catch(() => fallbackCopiar(texto));
  } else {
    fallbackCopiar(texto);
  }
}

function fallbackCopiar(texto) {
  const textArea = document.createElement('textarea');
  textArea.value = texto;
  textArea.style.position = 'fixed';
  textArea.style.top = '-9999px';
  textArea.style.left = '-9999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try { document.execCommand('copy'); } catch (err) {}
  document.body.removeChild(textArea);
}

// ==========================================
// EXPORTAR XLSX (requer SheetJS)
// ==========================================
function exportToXLSX(rows, columns, filename) {
  if (typeof XLSX === 'undefined') {
    showToast('Biblioteca XLSX não carregada. Recarregue a página.');
    return;
  }
  if (!rows || rows.length === 0) {
    showToast('Nenhum dado para exportar.');
    return;
  }
  const sheetData = rows.map(row => {
    const obj = {};
    columns.forEach(col => {
      // Suporta tanto col.value(row) quanto col.key
      obj[col.header] = typeof col.value === 'function'
        ? col.value(row)
        : (row[col.key] ?? '');
    });
    return obj;
  });
  const ws = XLSX.utils.json_to_sheet(sheetData);
  ws['!cols'] = columns.map(c => ({ wch: Math.max((c.header || '').length + 4, 16) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Dados');
  XLSX.writeFile(wb, `${filename}.xlsx`);
  // Nota: o caller é responsável pelo toast (evita toast duplo)
}

// ==========================================
// CELEBRAÇÃO DE VENDA (confetti + som)
// ==========================================
function showSalesCelebration() {
  // — Som: fanfarra ascendente em C Maior —
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const actx = new AudioCtx();
    [[523.25,0],[659.25,0.13],[783.99,0.26],[1046.5,0.39],[1318.5,0.52]].forEach(([freq, delay]) => {
      const osc  = actx.createOscillator();
      const gain = actx.createGain();
      osc.connect(gain); gain.connect(actx.destination);
      osc.frequency.value = freq;
      osc.type = 'triangle';
      const t = actx.currentTime + delay;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.28, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      osc.start(t); osc.stop(t + 0.55);
    });
  } catch (_) {}

  // — Confetti canvas —
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.classList.remove('hidden');
  const cx = canvas.getContext('2d');
  const COLORS = ['#f97316','#facc15','#22c55e','#3b82f6','#ec4899','#a855f7','#ef4444','#fbbf24'];
  const pieces = Array.from({ length: 200 }, () => ({
    x:  Math.random() * canvas.width,
    y:  -20 - Math.random() * 150,
    w:  Math.random() * 12 + 5,
    h:  Math.random() * 7  + 3,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    vx: (Math.random() - 0.5) * 6,
    vy: Math.random() * 3.5 + 1.5,
    rot:  Math.random() * 360,
    rotV: (Math.random() - 0.5) * 10,
    op: 1,
  }));
  let frame = 0;
  function draw() {
    cx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      cx.save();
      cx.globalAlpha = Math.max(0, p.op);
      cx.translate(p.x, p.y);
      cx.rotate(p.rot * Math.PI / 180);
      cx.fillStyle = p.color;
      cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      cx.restore();
      p.x  += p.vx;
      p.y  += p.vy * (1 + frame * 0.004);
      p.rot += p.rotV;
      if (frame > 80) p.op -= 0.01;
    });
    frame++;
    if (frame < 220) requestAnimationFrame(draw);
    else { cx.clearRect(0, 0, canvas.width, canvas.height); canvas.classList.add('hidden'); }
  }
  draw();
}
