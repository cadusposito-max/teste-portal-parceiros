// ==========================================
// MATERIAIS ÚTEIS — Biblioteca de Documentos
// ==========================================
//
// Arquitetura:
//   Google Drive (arquivos, organizados em subpastas por categoria)
//     → Google Apps Script (Web App que lê a pasta e devolve JSON)
//       → Front-end (consome o JSON e renderiza a biblioteca)
//
// Para ativar a integração real com o Google Drive:
//   1. Faça deploy de scripts/gas_materiais.js no Google Apps Script
//   2. Copie a URL do Web App gerado após o deploy
//   3. Cole essa URL em MATERIAIS_API_URL no config.js
//
// Enquanto MATERIAIS_API_URL estiver vazio (''), a biblioteca usa
// os dados em MATERIAIS_MOCK abaixo — sem nenhuma chamada de rede.
// ==========================================

// ── Tipo de arquivo → ícone Lucide + cor base ────────────────
const MATERIAIS_TIPO_MAP = {
  pdf:  { icone: 'file-text',        cor: 'red',     label: 'PDF'   },
  xlsx: { icone: 'file-spreadsheet', cor: 'green',   label: 'Excel' },
  xls:  { icone: 'file-spreadsheet', cor: 'green',   label: 'Excel' },
  csv:  { icone: 'file-spreadsheet', cor: 'green',   label: 'CSV'   },
  docx: { icone: 'file-type-2',      cor: 'blue',    label: 'Word'  },
  doc:  { icone: 'file-type-2',      cor: 'blue',    label: 'Word'  },
  pptx: { icone: 'presentation',     cor: 'orange',  label: 'PPT'   },
  ppt:  { icone: 'presentation',     cor: 'orange',  label: 'PPT'   },
  jpg:  { icone: 'image',            cor: 'purple',  label: 'Imagem'},
  jpeg: { icone: 'image',            cor: 'purple',  label: 'Imagem'},
  png:  { icone: 'image',            cor: 'purple',  label: 'Imagem'},
  zip:  { icone: 'archive',          cor: 'yellow',  label: 'ZIP'   },
};

// ── Cor → classes Tailwind ───────────────────────────────────
const MATERIAIS_COR_MAP = {
  red:    { bg: 'bg-red-500/10',    border: 'border-red-500/30',    text: 'text-red-400',    hoverBorder: 'hover:border-red-500/50'    },
  green:  { bg: 'bg-green-500/10',  border: 'border-green-500/30',  text: 'text-green-400',  hoverBorder: 'hover:border-green-500/50'  },
  blue:   { bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   text: 'text-blue-400',   hoverBorder: 'hover:border-blue-500/50'   },
  orange: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400', hoverBorder: 'hover:border-orange-500/50' },
  purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400', hoverBorder: 'hover:border-purple-500/50' },
  yellow: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400', hoverBorder: 'hover:border-yellow-500/50' },
  neutral:{ bg: 'bg-neutral-500/10',border: 'border-neutral-500/30',text: 'text-neutral-400',hoverBorder: 'hover:border-neutral-500/50'},
};

// ── Categoria → cor padrão ───────────────────────────────────
const MATERIAIS_CAT_COR = {
  'Apresentações': 'orange',
  'Financeiro':    'green',
  'Técnico':       'blue',
  'Treinamento':   'purple',
  'Comercial':     'yellow',
};

// ── DADOS MOCKADOS ────────────────────────────────────────────
// Mesma estrutura exata que o Google Apps Script retorna.
// Substituídos automaticamente quando MATERIAIS_API_URL estiver configurado.
const MATERIAIS_MOCK = [
  {
    id:          'mock-001',
    nome:        'Apresentação Ágil Solar',
    categoria:   'Apresentações',
    tipo:        'pptx',
    tamanho:     '4.2 MB',
    atualizadoEm:'2026-03-10',
    descricao:   'Pitch deck oficial para apresentar aos clientes.',
    viewUrl:     '#',
    downloadUrl: '#',
  },
  {
    id:          'mock-002',
    nome:        'Tabela de Juros Atualizada',
    categoria:   'Financeiro',
    tipo:        'xlsx',
    tamanho:     '480 KB',
    atualizadoEm:'2026-03-08',
    descricao:   'Taxas de financiamento parceiros — março/2026.',
    viewUrl:     '#',
    downloadUrl: '#',
  },
  {
    id:          'mock-003',
    nome:        'Ficha Técnica de Inversores',
    categoria:   'Técnico',
    tipo:        'pdf',
    tamanho:     '1.1 MB',
    atualizadoEm:'2026-02-20',
    descricao:   'Especificações completas dos modelos disponíveis.',
    viewUrl:     '#',
    downloadUrl: '#',
  },
  {
    id:          'mock-004',
    nome:        'Script de Abordagem',
    categoria:   'Treinamento',
    tipo:        'docx',
    tamanho:     '95 KB',
    atualizadoEm:'2026-02-14',
    descricao:   'Roteiro de prospecção e contorno de objeções.',
    viewUrl:     '#',
    downloadUrl: '#',
  },
  {
    id:          'mock-005',
    nome:        'Catálogo de Kits 2026',
    categoria:   'Comercial',
    tipo:        'pdf',
    tamanho:     '3.7 MB',
    atualizadoEm:'2026-01-15',
    descricao:   'Linha completa de kits com especificações e preços sugeridos.',
    viewUrl:     '#',
    downloadUrl: '#',
  },
];

// ── Cache em memória — compartilhado entre widget e página ───
let _materiaisCache = null;

// ── Contador de falhas de thumbnail (cookies bloqueados) ─────
let _matThumbErrors = 0;

// ── Serviço: busca da API ou usa mock ────────────────────────
async function materiaisfetchItems() {
  // Retorna cache se já carregado nesta sessão
  if (_materiaisCache) return _materiaisCache;

  if (!MATERIAIS_API_URL) {
    _materiaisCache = MATERIAIS_MOCK;
    return MATERIAIS_MOCK;
  }
  try {
    // GAS faz redirect 302; redirect:'follow' garante que fetch segue corretamente
    const res = await fetch(MATERIAIS_API_URL, { redirect: 'follow' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    if (!json.ok || !Array.isArray(json.items)) {
      throw new Error(json.erro || 'Resposta inválida da API');
    }
    _materiaisCache = json.items;
    return json.items;
  } catch (err) {
    console.warn('[Materiais] Falha ao buscar API, usando dados mockados:', err.message);
    // Não cacheia erro — tenta de novo na próxima navegação
    return MATERIAIS_MOCK;
  }
}

// ── Helper: resolve cor do ícone de tipo ─────────────────────
function _matTipoMeta(tipo) {
  return MATERIAIS_TIPO_MAP[tipo] || { icone: 'file', cor: 'neutral', label: (tipo || 'DOC').toUpperCase() };
}
function _matCorMeta(cor) {
  return MATERIAIS_COR_MAP[cor] || MATERIAIS_COR_MAP.neutral;
}

// ── Formata data ISO para "15 fev. 2026" ─────────────────────
function _matFmtDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  } catch { return iso; }
}

// ── Constrói HTML de um card da biblioteca ───────────────────
function _buildMatCard(item) {
  const tipo   = (item.tipo || 'pdf').toLowerCase();
  const tMeta  = _matTipoMeta(tipo);
  const cMeta  = _matCorMeta(tMeta.cor);
  const catCor = MATERIAIS_CAT_COR[item.categoria] || 'neutral';
  const catM   = _matCorMeta(catCor);
  const dataFmt= _matFmtDate(item.atualizadoEm);
  const isMock = item.viewUrl === '#' || !item.viewUrl;
  const dlAttr = isMock ? 'aria-disabled="true" tabindex="-1"' : `href="${escapeHTML(item.downloadUrl)}" target="_blank" rel="noopener"`;
  const dlCls  = isMock ? 'opacity-40 cursor-not-allowed' : '';

  // Thumbnail do Drive (funciona para PDF, imagem, Office, etc.)
  const thumbUrl = isMock
    ? ''
    : `https://drive.google.com/thumbnail?id=${encodeURIComponent(item.id)}&sz=w400`;

  // Área superior: thumbnail se disponível, senão ícone
  const topoHTML = thumbUrl
    ? `<div class="relative w-full h-36 bg-neutral-900 overflow-hidden cursor-pointer group/thumb"
            onclick="materiaisOpenPreview('${escapeHTML(item.id)}','${escapeHTML(item.nome).replace(/'/g,'&#39;')}')"
            title="Clique para visualizar">
         <img src="${thumbUrl}" alt="" loading="lazy"
              class="w-full h-full object-cover transition-transform duration-300 group-hover/thumb:scale-105"
              onerror="this.parentElement.style.display='none';this.parentElement.nextElementSibling.style.display='flex';_matHandleThumbError()">
         <!-- Hover overlay -->
         <div class="absolute inset-0 bg-black/0 group-hover/thumb:bg-black/40 transition-all flex items-center justify-center">
           <div class="opacity-0 group-hover/thumb:opacity-100 transition-opacity
                       bg-black/80 border border-white/10 rounded-full p-2.5">
             <i data-lucide="zoom-in" class="w-4 h-4 text-white"></i>
           </div>
         </div>
         <!-- Ícone de tipo — canto inferior esquerdo —-->
         <div class="absolute bottom-2 left-2 flex items-center gap-1.5
                     bg-black/70 border border-white/10 px-1.5 py-1">
           <i data-lucide="${tMeta.icone}" class="w-3 h-3 ${cMeta.text}"></i>
           <span class="text-[8px] font-black ${cMeta.text} uppercase tracking-wider">${tMeta.label}</span>
         </div>
         <!-- Badge categoria — canto superior direito —-->
         <span class="absolute top-2 right-2 bg-black/70 border border-white/10
                      text-[8px] font-black text-white px-2 py-0.5 uppercase tracking-widest">
           ${escapeHTML(item.categoria)}
         </span>
       </div>
       <!-- Fallback ícone (oculto por padrão, aparece se thumb falhar) -->
       <div style="display:none" class="px-5 pt-5 pb-4 flex items-start justify-between gap-3">
         <div class="${cMeta.bg} ${cMeta.border} border p-3 shrink-0">
           <i data-lucide="${tMeta.icone}" class="w-5 h-5 ${cMeta.text}"></i>
         </div>
         <span class="text-[8px] font-black ${catM.text} ${catM.bg} ${catM.border} border
                      px-2 py-1 uppercase tracking-widest whitespace-nowrap mt-0.5">${escapeHTML(item.categoria)}</span>
       </div>`
    : `<div class="px-5 pt-5 pb-4 flex items-start justify-between gap-3">
         <div class="${cMeta.bg} ${cMeta.border} border p-3 shrink-0">
           <i data-lucide="${tMeta.icone}" class="w-5 h-5 ${cMeta.text}"></i>
         </div>
         <span class="text-[8px] font-black ${catM.text} ${catM.bg} ${catM.border} border
                      px-2 py-1 uppercase tracking-widest whitespace-nowrap mt-0.5">${escapeHTML(item.categoria)}</span>
       </div>`;

  return `
    <div class="materiais-card flex flex-col border border-neutral-800/60 bg-[#0d0d0d] overflow-hidden
                transition-all duration-200 hover:border-neutral-700/70 hover:-translate-y-px"
         data-cat="${escapeHTML(item.categoria)}">

      ${topoHTML}

      <!-- Título e descrição -->
      <div class="px-4 pt-3 pb-3 flex flex-col gap-1.5 flex-1">
        <p class="text-sm font-black text-white leading-snug line-clamp-2">
          ${escapeHTML(item.nome)}
        </p>
        ${item.descricao
          ? `<p class="text-[10px] text-neutral-500 leading-relaxed line-clamp-2">${escapeHTML(item.descricao)}</p>`
          : ''}
      </div>

      <!-- Meta: tipo + tamanho + data -->
      <div class="px-4 pb-3 flex items-center flex-wrap gap-2">
        <span class="${cMeta.bg} ${cMeta.text} ${cMeta.border} border
                     text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5">
          ${tMeta.label}
        </span>
        ${item.tamanho ? `<span class="text-[9px] text-neutral-600 font-bold">${escapeHTML(item.tamanho)}</span>` : ''}
        ${dataFmt      ? `<span class="text-[9px] text-neutral-700 font-bold ml-auto">${dataFmt}</span>` : ''}
      </div>

      <!-- Ações: Visualizar / Baixar -->
      <div class="border-t border-neutral-800/60 grid grid-cols-2 divide-x divide-neutral-800/60">
        <button
        ${isMock ? 'disabled' : `onclick="materiaisOpenPreview('${escapeHTML(item.id)}','${escapeHTML(item.nome).replace(/'/g,'&#39;')}','${tipo}')"` }
          class="flex items-center justify-center gap-1.5 px-3 py-3
                 text-[9px] font-black uppercase tracking-widest
                 text-neutral-500 hover:text-white hover:bg-white/[0.03] transition-all
                 ${isMock ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}">
          <i data-lucide="eye" class="w-3 h-3"></i> Visualizar
        </button>
        <a ${dlAttr}
           class="flex items-center justify-center gap-1.5 px-3 py-3
                  text-[9px] font-black uppercase tracking-widest
                  text-neutral-500 hover:text-orange-400 hover:bg-orange-500/[0.04] transition-all ${dlCls}">
          <i data-lucide="download" class="w-3 h-3"></i> Baixar
        </a>
      </div>
    </div>`;
}

// ── Modal de preview inline ───────────────────────────────────
function materiaisOpenPreview(id, nome, tipo) {
  const existing = document.getElementById('mat-preview-modal');
  if (existing) existing.remove();

  const isImage   = ['imagem', 'jpg', 'jpeg', 'png', 'gif', 'webp'].includes((tipo || '').toLowerCase());
  const driveUrl  = `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;
  const thumbBig  = `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1600`;

  // Conteúdo: imagem direta OU thumbnail grande + botão abrir
  const bodyHTML = isImage
    ? `<div class="flex-1 relative bg-neutral-950 flex items-center justify-center overflow-auto p-4">
         <img src="${thumbBig}" alt="${escapeHTML(nome)}"
              class="max-w-full max-h-full object-contain"
              onerror="this.parentElement.innerHTML='<p class=\'text-neutral-600 text-xs\'>Imagem não disponível.</p>'">
       </div>`
    : `<div class="flex-1 flex flex-col items-center justify-center gap-6 bg-neutral-950 p-8">
         <img src="${thumbBig}" alt=""
              class="max-h-64 max-w-full object-contain opacity-80 border border-neutral-800"
              onerror="this.style.display='none'">
         <div class="flex flex-col items-center gap-2 text-center">
           <p class="text-xs text-neutral-500">O preview deste tipo de arquivo só está disponível no Google Drive.</p>
           <a href="${driveUrl}" target="_blank" rel="noopener"
              class="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-400
                     text-[10px] font-black text-white uppercase tracking-widest transition-colors">
             <i data-lucide="external-link" class="w-3.5 h-3.5"></i> Abrir no Drive
           </a>
         </div>
       </div>`;

  const modal = document.createElement('div');
  modal.id = 'mat-preview-modal';
  modal.className = 'fixed inset-0 z-[9999] flex items-center justify-center p-4';
  modal.innerHTML = `
    <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" onclick="materiaisClosePreview()"></div>
    <div class="relative z-10 w-full max-w-4xl h-[85vh] flex flex-col
                border border-neutral-700/60 bg-[#0d0d0d] shadow-2xl">
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-neutral-800/60 shrink-0">
        <div class="flex items-center gap-2.5 min-w-0">
          <i data-lucide="file-text" class="w-4 h-4 text-neutral-500 shrink-0"></i>
          <span class="text-xs font-black text-white truncate">${escapeHTML(nome)}</span>
        </div>
        <div class="flex items-center gap-1 shrink-0 ml-3">
          <a href="${driveUrl}" target="_blank" rel="noopener"
             class="flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest
                    text-neutral-500 hover:text-white border border-neutral-800 hover:border-neutral-600 transition-all">
            <i data-lucide="external-link" class="w-3 h-3"></i> Abrir no Drive
          </a>
          <button onclick="materiaisClosePreview()"
            class="flex items-center justify-center w-8 h-8 border border-neutral-800
                   text-neutral-500 hover:text-white hover:border-neutral-600 transition-all ml-1">
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        </div>
      </div>
      ${bodyHTML}
    </div>`;

  document.body.appendChild(modal);
  queueAppLucideCreateIcons();
  modal._escHandler = (e) => { if (e.key === 'Escape') materiaisClosePreview(); };
  document.addEventListener('keydown', modal._escHandler);
}

function materiaisClosePreview() {
  const modal = document.getElementById('mat-preview-modal');
  if (!modal) return;
  document.removeEventListener('keydown', modal._escHandler);
  modal.remove();
}

// ── Detecta thumbnails bloqueadas por cookies e exibe aviso ──
function _matHandleThumbError() {
  _matThumbErrors++;
  // Só mostra o aviso uma vez, na primeira falha
  if (_matThumbErrors > 1) return;

  // Garante que o banner não seja duplicado
  if (document.getElementById('mat-cookie-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'mat-cookie-banner';
  banner.className = [
    'flex items-start gap-3 border border-orange-500/25 bg-orange-500/5',
    'px-4 py-3 text-xs text-orange-400/80 my-1'
  ].join(' ');
  banner.innerHTML = `
    <i data-lucide="cookie" class="w-4 h-4 shrink-0 mt-0.5 text-orange-400"></i>
    <div class="flex-1">
      <p class="font-black text-orange-300 mb-0.5">Previews bloqueados pelo navegador</p>
      <p class="text-orange-400/70 leading-relaxed">
        As miniaturas usam o Google Drive, que precisa de
        <strong>cookies de terceiros</strong> habilitados.
        Você ainda pode baixar os arquivos normalmente.
      </p>
    </div>
    <button onclick="_matDismissCookieBanner()"
      class="shrink-0 text-neutral-600 hover:text-white transition-colors mt-0.5">
      <i data-lucide="x" class="w-4 h-4"></i>
    </button>`;

  // Insere antes do grid de cards
  const grid = document.getElementById('materiais-grid');
  if (grid) {
    grid.parentElement.insertBefore(banner, grid);
    queueAppLucideCreateIcons();
  }
}

function _matDismissCookieBanner() {
  const b = document.getElementById('mat-cookie-banner');
  if (b) b.remove();
}

// ── Widget compacto renderizado DENTRO do dashboard ──────────
// Os itens são previews que abrem a aba Materiais ao clicar.
// Downloads diretos ficam na página completa.
function renderMateriaisWidget() {
  const items = MATERIAIS_MOCK.slice(0, 3);

  const rows = items.map(item => {
    const tipo  = (item.tipo || 'pdf').toLowerCase();
    const tMeta = _matTipoMeta(tipo);
    const cMeta = _matCorMeta(tMeta.cor);
    return `
      <button onclick="setTab('materiais')"
        class="w-full flex items-center justify-between p-3 border border-neutral-800/50
               ${cMeta.hoverBorder} hover:bg-white/[0.02] transition-all group text-left">
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="p-1.5 ${cMeta.bg} shrink-0">
            <i data-lucide="${tMeta.icone}" class="w-3.5 h-3.5 ${cMeta.text}"></i>
          </div>
          <span class="text-[10px] font-bold text-neutral-400 group-hover:text-white
                       uppercase tracking-wider transition-colors truncate">
            ${escapeHTML(item.nome)}
          </span>
        </div>
        <i data-lucide="arrow-right" class="w-3 h-3 text-neutral-700 group-hover:${cMeta.text} shrink-0 transition-colors ml-2"></i>
      </button>`;
  }).join('');

  return `
    <div class="dash-materials-panel border border-neutral-800/60 p-5 flex flex-col gap-3"
         style="background: #0d0d0d;">
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
          <div class="p-1.5 bg-blue-500/10 border border-blue-500/20">
            <i data-lucide="library" class="w-3 h-3 text-blue-400"></i>
          </div>
          Materiais Úteis
        </h3>
        <button onclick="setTab('materiais')"
          class="text-[8px] font-black text-neutral-600 hover:text-orange-400
                 uppercase tracking-widest transition-colors flex items-center gap-1">
          Ver todos <i data-lucide="arrow-right" class="w-2.5 h-2.5"></i>
        </button>
      </div>
      ${rows}
    </div>`;
}

// ── Página completa da Biblioteca ─────────────────────────────
async function renderMateriais(container) {
  container.className = 'flex flex-col gap-5 w-full';

  // — Estado de carregamento —
  container.innerHTML = `
    <div class="stagger-1 flex items-center gap-3">
      <div class="p-2.5 bg-blue-500/10 border border-blue-500/20">
        <i data-lucide="library" class="w-5 h-5 text-blue-400"></i>
      </div>
      <div>
        <h1 class="text-xl font-black text-white uppercase tracking-tight">Biblioteca de Materiais</h1>
        <p class="text-xs text-neutral-500">Documentos oficiais, técnicos e comerciais da Ágil Solar.</p>
      </div>
    </div>
    <div class="flex items-center gap-2 text-neutral-600 py-4">
      <i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>
      <span class="text-xs">Carregando materiais...</span>
    </div>`;
  queueAppLucideCreateIcons();

  // — Busca dados (API → mock fallback) —
  let items = [];
  let erroApi = null;
  let usandoMock = false;

  if (!MATERIAIS_API_URL) {
    items = MATERIAIS_MOCK;
    usandoMock = true;
  } else {
    try {
      const res = await fetch(MATERIAIS_API_URL, { redirect: 'follow' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (!json.ok || !Array.isArray(json.items)) {
        throw new Error(json.erro || 'Resposta inválida da API');
      }
      items = json.items;
      _materiaisCache = items;
    } catch (err) {
      erroApi = err.message;
      items = MATERIAIS_MOCK;
      usandoMock = true;
      console.warn('[Materiais] Falha ao buscar API:', err.message);
    }
  }

  // — Extrai categorias únicas —
  const categorias = [...new Set(items.map(i => i.categoria))];

  // — Banner de status —
  let bannerHTML = '';
  if (erroApi) {
    bannerHTML = `
      <div class="flex items-start gap-2.5 border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-400/80">
        <i data-lucide="alert-triangle" class="w-3.5 h-3.5 shrink-0 mt-0.5"></i>
        <span>
          <strong class="font-black">Não foi possível conectar ao Google Drive.</strong>
          Exibindo exemplos de demonstração.
          <span class="block mt-1 text-red-500/50 font-mono">${escapeHTML(erroApi)}</span>
        </span>
      </div>`;
  } else if (usandoMock) {
    bannerHTML = `
      <div class="flex items-start gap-2.5 border border-yellow-500/20 bg-yellow-500/5 px-4 py-3 text-xs text-yellow-500/70">
        <i data-lucide="info" class="w-3.5 h-3.5 shrink-0 mt-0.5"></i>
        <span>
          <strong class="font-black">Modo demonstração</strong> — dados de exemplo.
          Para conectar ao Google Drive, configure <code class="font-mono bg-yellow-500/10 px-1">MATERIAIS_API_URL</code> no config.js.
        </span>
      </div>`;
  }

  // — Renderiza página completa —
  container.innerHTML = `
    <!-- Cabeçalho da seção -->
    <div class="stagger-1 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <div class="p-2.5 bg-blue-500/10 border border-blue-500/20">
          <i data-lucide="library" class="w-5 h-5 text-blue-400"></i>
        </div>
        <div>
          <h1 class="text-xl font-black text-white uppercase tracking-tight">Biblioteca de Materiais</h1>
          <p class="text-xs text-neutral-500">
            ${items.length} documento${items.length !== 1 ? 's' : ''} disponíve${items.length !== 1 ? 'is' : 'l'} para download.
          </p>
        </div>
      </div>
    </div>

    ${bannerHTML}

    <!-- Filtros de categoria -->
    <div class="stagger-2 flex flex-wrap gap-2">
      <button data-cat-btn="Todos" onclick="materiaisFilterCat('Todos')"
        class="materiais-cat-btn is-active px-3 py-1.5 text-[9px] font-black uppercase tracking-widest border transition-all">
        Todos
        <span class="ml-1 opacity-70">${items.length}</span>
      </button>
      ${categorias.map(cat => {
        const cnt    = items.filter(i => i.categoria === cat).length;
        const catCor = MATERIAIS_CAT_COR[cat] || 'neutral';
        const cMeta  = _matCorMeta(catCor);
        return `
          <button data-cat-btn="${escapeHTML(cat)}" onclick="materiaisFilterCat('${escapeHTML(cat)}')"
            class="materiais-cat-btn px-3 py-1.5 text-[9px] font-black uppercase tracking-widest border transition-all">
            <span class="w-1.5 h-1.5 rounded-full inline-block mr-1 ${cMeta.bg} border ${cMeta.border}"></span>
            ${escapeHTML(cat)}
            <span class="ml-1 opacity-60">${cnt}</span>
          </button>`;
      }).join('')}
    </div>

    <!-- Grid de cards -->
    <div class="stagger-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
         id="materiais-grid">
      ${items.length > 0
        ? items.map(_buildMatCard).join('')
        : `<div class="col-span-full flex flex-col items-center gap-3 py-16 text-neutral-600">
             <i data-lucide="folder-open" class="w-10 h-10"></i>
             <p class="text-sm font-bold uppercase tracking-widest">Nenhum arquivo encontrado</p>
             <p class="text-xs text-neutral-700">Adicione arquivos nas subpastas do Google Drive.</p>
           </div>`
      }
    </div>
  `;

  queueAppLucideCreateIcons();
}

// ── Filtro por categoria (sem re-render) ─────────────────────
function materiaisFilterCat(cat) {
  // Atualiza estilos dos botões de filtro
  document.querySelectorAll('[data-cat-btn]').forEach(btn => {
    const isActive = btn.dataset.catBtn === cat;
    btn.classList.toggle('is-active', isActive);
  });

  // Mostra / oculta cards pelo data-cat
  const grid = document.getElementById('materiais-grid');
  if (!grid) return;
  grid.querySelectorAll('.materiais-card[data-cat]').forEach(card => {
    const visible = cat === 'Todos' || card.dataset.cat === cat;
    card.style.display = visible ? '' : 'none';
  });
}
