// ==========================================
// POPUP: CONSTRUTOR DE PROPOSTAS
// ==========================================

// Bancos de financiamento solar
const BANCOS_FINANCIAMENTO = [
  { nome: 'Solfácil',   url: 'https://app.solfacil.com.br',          cor: 'from-orange-600 to-orange-500',  taxa: 'A partir de 0,79% a.m.', prazo: 'Até 84 meses',    icon: '⚡' },
  { nome: 'BV',         url: 'https://www.bv.com.br/para-voce/credito/financiamento-solar', cor: 'from-blue-700 to-blue-600',    taxa: 'A partir de 0,89% a.m.', prazo: 'Até 60 meses',    icon: '🏦' },
  { nome: 'Santander',  url: 'https://www.santander.com.br/negocios/credito-garantido',     cor: 'from-red-700 to-red-600',      taxa: 'Consulte condições',     prazo: 'Até 60 meses',    icon: '🔴' },
  { nome: 'Sicoob',     url: 'https://www.sicoob.com.br/simuladores', cor: 'from-green-700 to-green-600',  taxa: 'Taxas cooperadas',       prazo: 'Até 84 meses',    icon: '🤝' },
  { nome: 'Sicredi',    url: 'https://www.sicredi.com.br/site/para-voce/credito/', cor: 'from-emerald-700 to-emerald-600', taxa: 'Taxas cooperadas', prazo: 'Até 84 meses', icon: '🌿' },
  { nome: 'Losango',    url: 'https://www.losango.com.br',            cor: 'from-purple-700 to-purple-600', taxa: 'Consulte condições',     prazo: 'Até 72 meses',    icon: '💜' },
];

function openProposalBuilder(clientId) {
  state.pbActiveClient = state.clientes.find(c => c.id === clientId);
  const client = state.pbActiveClient;

  // Atualiza header do modal
  const nome    = client.nome;
  const initial = nome.charAt(0).toUpperCase();
  const GRADS   = ['from-orange-600 to-orange-400','from-yellow-600 to-yellow-400','from-green-600 to-emerald-400',
                   'from-blue-600 to-blue-400','from-purple-600 to-purple-400','from-pink-600 to-pink-400'];
  const grad    = GRADS[nome.charCodeAt(0) % GRADS.length];

  const avatarEl = document.getElementById('pb-client-avatar');
  if (avatarEl) {
    avatarEl.textContent  = initial;
    avatarEl.className    = `shrink-0 w-10 h-10 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center text-black font-black text-lg select-none avatar-pulse`;
  }
  document.getElementById('pb-client-name').innerText = nome;

  state.pbCategory = 'kitsInversor';
  state.pbSearch   = '';
  state.pbMainTab  = 'kits';
  document.getElementById('pb-search').value = '';

  setPBMainTab('kits');
  updatePBTabsUI();
  renderModalProducts();
  document.getElementById('proposal-builder-modal').classList.remove('hidden');
  lucide.createIcons();
}

function closeProposalBuilder() {
  document.getElementById('proposal-builder-modal').classList.add('hidden');
  state.pbActiveClient = null;
  state.pbSearch = '';
  const searchEl = document.getElementById('pb-search');
  if (searchEl) searchEl.value = '';
}

// ==========================================
// ABAS PRINCIPAIS DO MODAL
// ==========================================
function setPBMainTab(tab) {
  state.pbMainTab = tab;
  const SECTIONS = ['kits', 'financiamento', 'historico'];
  SECTIONS.forEach(s => {
    const section = document.getElementById(`pb-section-${s}`);
    const btn     = document.getElementById(`pb-main-tab-${s}`);
    if (section) section.classList.add('hidden');
    if (btn) {
      if (s === tab) {
        btn.className = 'flex items-center gap-1.5 px-3 py-2 text-[9px] font-black uppercase tracking-wider transition-all bg-gradient-to-r from-orange-600 to-yellow-500 text-black' + (s !== 'kits' ? ' border-l border-neutral-800' : '');
      } else {
        btn.className = 'flex items-center gap-1.5 px-3 py-2 text-[9px] font-black uppercase tracking-wider transition-all text-neutral-500 hover:text-white border-l border-neutral-800';
      }
    }
  });
  const active = document.getElementById(`pb-section-${tab}`);
  if (active) active.classList.remove('hidden');

  if (tab === 'financiamento') renderFinanciamento();
  if (tab === 'historico')     renderHistorico();
  lucide.createIcons();
}

// ==========================================
// SEÇÃO: FINANCIAMENTO
// ==========================================
function renderFinanciamento() {
  const container = document.getElementById('pb-section-financiamento');
  if (!container) return;

  const cardsHTML = BANCOS_FINANCIAMENTO.map(b => `
    <a href="${b.url}" target="_blank" rel="noopener noreferrer"
      class="metric-card shine-effect group block border border-neutral-800 hover:border-orange-500/30 p-5 transition-all duration-300 cursor-pointer">
      <div class="flex items-center gap-4 mb-4">
        <div class="w-12 h-12 rounded-full bg-gradient-to-br ${b.cor} flex items-center justify-center text-2xl shadow-[0_0_12px_rgba(249,115,22,0.2)] shrink-0">
          ${b.icon}
        </div>
        <div class="min-w-0">
          <h3 class="text-white font-black text-base uppercase group-hover:text-orange-400 transition-colors leading-tight">${b.nome}</h3>
          <p class="text-[9px] text-neutral-500 font-bold uppercase tracking-widest mt-0.5">Financiamento Solar</p>
        </div>
        <i data-lucide="external-link" class="w-4 h-4 text-neutral-600 group-hover:text-orange-400 transition-colors ml-auto shrink-0"></i>
      </div>
      <div class="grid grid-cols-2 gap-2 border-t border-neutral-800 pt-3">
        <div>
          <p class="text-[9px] text-neutral-600 font-bold uppercase tracking-widest">Taxa</p>
          <p class="text-orange-400 font-black text-xs mt-0.5">${b.taxa}</p>
        </div>
        <div>
          <p class="text-[9px] text-neutral-600 font-bold uppercase tracking-widest">Prazo Máx.</p>
          <p class="text-yellow-400 font-black text-xs mt-0.5">${b.prazo}</p>
        </div>
      </div>
    </a>
  `).join('');

  container.innerHTML = `
    <div class="mb-6">
      <p class="text-orange-500 text-[10px] font-black uppercase tracking-[0.3em] flex items-center gap-2 mb-1">
        <i data-lucide="landmark" class="w-3.5 h-3.5"></i> BANCOS &amp; FINANCIADORAS
      </p>
      <h3 class="text-xl font-black text-white uppercase tracking-tighter">Opções de Financiamento Solar</h3>
      <p class="text-neutral-500 text-xs mt-1">Clique em qualquer banco para abrir o simulador direto no site. Taxas sujeitas a alteração.</p>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      ${cardsHTML}
    </div>
    <div class="mt-6 p-4 bg-yellow-950/20 border border-yellow-900/30 flex items-start gap-3">
      <i data-lucide="info" class="w-4 h-4 text-yellow-500 shrink-0 mt-0.5"></i>
      <p class="text-yellow-500/80 text-xs leading-relaxed font-medium">
        <strong class="text-yellow-400 font-black">Dica:</strong> Solicite ao cliente a fatura de energia antes de simular — a maioria das financiadoras usa o valor da conta como base para aprovação de crédito.
      </p>
    </div>
  `;
  lucide.createIcons();
}

// ==========================================
// SEÇÃO: HISTÓRICO DE PROPOSTAS
// ==========================================
function renderHistorico() {
  const container = document.getElementById('pb-section-historico');
  if (!container || !state.pbActiveClient) return;

  const clienteNome  = state.pbActiveClient.nome;
  const propostas    = state.propostas.filter(p =>
    p.cliente_nome && p.cliente_nome.toUpperCase() === clienteNome.toUpperCase()
  );
  const vendasCliente = state.vendas.filter(v =>
    v.cliente_nome && v.cliente_nome.toUpperCase() === clienteNome.toUpperCase()
  );

  if (propostas.length === 0) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full gap-4 text-center py-20">
        <i data-lucide="file-clock" class="w-14 h-14 text-neutral-700"></i>
        <p class="text-neutral-500 font-black uppercase tracking-widest text-sm">Nenhuma proposta gerada ainda</p>
        <p class="text-neutral-700 text-xs">Vá até a aba KITS e gere a primeira proposta para este cliente.</p>
      </div>`;
    lucide.createIcons();
    return;
  }

  const vendasKits = new Set(vendasCliente.map(v => v.kit_nome));

  container.innerHTML = `
    <div class="mb-5 flex items-center justify-between flex-wrap gap-3">
      <div>
        <p class="text-orange-500 text-[10px] font-black uppercase tracking-[0.3em] flex items-center gap-2 mb-1">
          <i data-lucide="history" class="w-3.5 h-3.5"></i> HISTÓRICO
        </p>
        <h3 class="text-xl font-black text-white uppercase tracking-tighter">
          ${propostas.length} Proposta${propostas.length > 1 ? 's' : ''} Gerada${propostas.length > 1 ? 's' : ''}
          ${vendasCliente.length > 0 ? `<span class="text-green-400 ml-2">· ${vendasCliente.length} Venda${vendasCliente.length > 1 ? 's' : ''} Fechada${vendasCliente.length > 1 ? 's' : ''} ✓</span>` : ''}
        </h3>
      </div>
    </div>
    <div class="space-y-3">
      ${propostas.map(p => {
        const isVendido = vendasKits.has(p.kit_nome);
        const baseUrl   = window.location.href.split('index.html')[0].replace(/\/$/, '');
        const link      = `${baseUrl}/proposta.html?id=${p.id}`;
        return `
        <div class="metric-card border ${isVendido ? 'border-green-900/40' : 'border-neutral-800'} p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 group">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap mb-1">
              <span class="text-white font-black text-sm uppercase truncate group-hover:text-orange-400 transition-colors">${escapeHTML(p.kit_nome)}</span>
              ${isVendido ? '<span class="text-[8px] bg-green-500/15 text-green-400 border border-green-500/30 px-2 py-0.5 font-black uppercase tracking-widest">✓ VENDIDO</span>' : ''}
            </div>
            <div class="flex flex-wrap gap-x-3 text-[10px] text-neutral-600 font-mono">
              <span class="flex items-center gap-1"><i data-lucide="calendar" class="w-2.5 h-2.5"></i>${formatDate(p.created_at)}</span>
              <span class="flex items-center gap-1 text-orange-400/70 font-bold">${formatCurrency(p.kit_price)}</span>
              ${p.kit_power ? `<span class="flex items-center gap-1"><i data-lucide="zap" class="w-2.5 h-2.5"></i>${p.kit_power} kWp</span>` : ''}
            </div>
          </div>
          <button onclick="copiarLinkExistente('${p.id}', this)"
            class="shrink-0 flex items-center gap-1.5 bg-neutral-800 border border-neutral-700 hover:border-orange-500/50 hover:text-orange-400 text-neutral-400 px-3 py-2 font-black uppercase tracking-wider transition-all text-[9px]">
            <i data-lucide="copy" class="w-3.5 h-3.5"></i>COPIAR LINK
          </button>
        </div>`;
      }).join('')}
    </div>
  `;
  lucide.createIcons();
}

function setPBTab(category) {
  state.pbCategory = category;
  updatePBTabsUI();
  renderModalProducts();
}

function setPBViewMode(mode) {
  state.pbViewMode = mode;
  const btnGrid = document.getElementById('pb-btn-grid');
  const btnList = document.getElementById('pb-btn-list');
  if (mode === 'grid') {
    btnGrid.className = 'p-2.5 transition-all bg-orange-500 text-black';
    btnList.className = 'p-2.5 transition-all text-neutral-500 hover:text-white border-l border-neutral-800';
  } else {
    btnList.className = 'p-2.5 transition-all bg-orange-500 text-black';
    btnGrid.className = 'p-2.5 transition-all text-neutral-500 hover:text-white border-l border-neutral-800';
  }
  renderModalProducts();
}

function updatePBTabsUI() {
  const btnInv = document.getElementById('pb-tab-inversor');
  const btnMic = document.getElementById('pb-tab-micro');
  const BASE   = 'flex-1 px-4 py-2.5 text-[10px] font-black uppercase transition-all whitespace-nowrap';
  if (state.pbCategory === 'kitsInversor') {
    btnInv.className = BASE + ' bg-orange-500 text-black';
    btnMic.className = BASE + ' text-neutral-500 hover:text-white border-l border-neutral-800';
  } else {
    btnMic.className = BASE + ' bg-orange-500 text-black';
    btnInv.className = BASE + ' text-neutral-500 hover:text-white';
  }
}

document.getElementById('pb-search').addEventListener('input', (e) => {
  state.pbSearch = e.target.value.toLowerCase();
  renderModalProducts();
});

function renderModalProducts() {
  const container = document.getElementById('pb-products-container');
  const emptyEl   = document.getElementById('pb-empty');

  let list = state.data.filter(k => k.categoria === state.pbCategory);

  if (state.pbSearch) {
    const searchNum = parseInt(state.pbSearch, 10);
    list = list.filter(item => {
      const estGeneration  = calcularGeracaoEstimada(item.power, item.categoria);
      const textMatch      = item.name.toLowerCase().includes(state.pbSearch) ||
                             item.brand.toLowerCase().includes(state.pbSearch) ||
                             item.power.toString().includes(state.pbSearch);
      const generationMatch= !isNaN(searchNum) && Math.abs(estGeneration - searchNum) <= 50;
      return textMatch || generationMatch;
    });
  }

  if (list.length === 0) {
    container.classList.add('hidden');
    emptyEl.classList.remove('hidden');
    emptyEl.classList.add('flex');
  } else {
    emptyEl.classList.add('hidden');
    emptyEl.classList.remove('flex');
    container.classList.remove('hidden');

    container.className = state.pbViewMode === 'list'
      ? 'flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-3 bg-[#050505] content-start'
      : 'flex-1 overflow-y-auto p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 bg-[#050505] content-start';

    container.innerHTML = list.map(item => {
      const estGeneration    = calcularGeracaoEstimada(item.power, item.categoria).toFixed(0);
      const formattedPrice   = formatCurrency(item.price);
      const formattedListPrice= formatCurrency(item.list_price);
      const safeId           = escapeHTML(String(item.id));
      const safeName         = escapeHTML(item.name);
      const safeBrand        = escapeHTML(item.brand);
      const safePower        = escapeHTML(String(item.power));

      if (state.pbViewMode === 'grid') {
        return `
          <div class="bg-[#0f0f0f] border border-neutral-800 hover:border-orange-500 p-5 flex flex-col gap-4 group transition-all rounded-sm shadow-xl">
            <div class="flex justify-between items-start">
              <span class="text-[10px] bg-orange-600/20 text-orange-500 px-2 py-0.5 font-bold uppercase tracking-widest border border-orange-500/30">${safeBrand}</span>
              <span class="text-[10px] text-neutral-500 line-through decoration-red-500 font-bold">DE: ${formattedListPrice}</span>
            </div>
            <h3 class="text-white font-black text-sm uppercase leading-tight group-hover:text-orange-400 transition-colors">${safeName}</h3>
            <div class="grid grid-cols-2 gap-2 text-xs">
              <div class="bg-black p-2 border border-neutral-800 flex flex-col items-center justify-center">
                <span class="text-[9px] text-neutral-500 font-bold uppercase tracking-widest">Potência</span>
                <span class="text-orange-500 font-black flex items-center gap-1 mt-1 text-sm"><i data-lucide="zap" class="w-3 h-3"></i> ${safePower} kWp</span>
              </div>
              <div class="bg-neutral-900 p-2 border border-neutral-800 flex flex-col items-center justify-center shadow-[inset_0_0_10px_rgba(59,130,246,0.05)]">
                <span class="text-[9px] text-neutral-500 font-bold uppercase tracking-widest">Geração Est.</span>
                <span class="text-blue-400 font-black flex items-center gap-1 mt-1 text-sm"><i data-lucide="sun" class="w-3 h-3"></i> ${estGeneration} kWh</span>
              </div>
            </div>
            <div class="mt-auto pt-4 border-t border-neutral-800 flex items-center justify-between gap-3">
              <div class="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-yellow-400 tracking-tighter pb-1 pr-1 inline-block">${formattedPrice}</div>
              <button data-kit-id="${safeId}" onclick="copyProposalLinkById(this.dataset.kitId, event)" aria-label="Gerar proposta para ${safeName}" class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 flex items-center justify-center gap-2 transition-all active:scale-95 shadow-[0_0_15px_rgba(37,99,235,0.3)] hover:shadow-[0_0_20px_rgba(37,99,235,0.5)] text-[10px] font-black uppercase tracking-widest min-w-[110px]">
                <i data-lucide="file-text" class="w-4 h-4"></i> GERAR PROPOSTA
              </button>
            </div>
          </div>`;
      } else {
        return `
          <div class="bg-[#0f0f0f] border border-neutral-800 hover:border-orange-500 p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 group transition-all rounded-sm shadow-xl">
            <div class="flex-1 min-w-0 flex flex-col gap-2">
              <div class="flex items-center gap-2">
                <span class="text-[10px] bg-orange-600/20 text-orange-500 px-2 py-0.5 font-bold uppercase tracking-widest border border-orange-500/30">${safeBrand}</span>
                <span class="text-[10px] text-neutral-500 line-through decoration-red-500 font-bold hidden md:inline-block">DE: ${formattedListPrice}</span>
              </div>
              <h3 class="text-white font-black text-sm md:text-base uppercase leading-tight group-hover:text-orange-400 transition-colors truncate" title="${safeName}">${safeName}</h3>
            </div>
            <div class="flex items-center gap-4 md:px-6 md:border-x border-neutral-800 shrink-0">
              <div class="flex flex-col items-center justify-center">
                <span class="text-[9px] text-neutral-500 font-bold uppercase tracking-widest">Potência</span>
                <span class="text-orange-500 font-black flex items-center gap-1 text-sm"><i data-lucide="zap" class="w-3 h-3"></i> ${safePower} kWp</span>
              </div>
              <div class="flex flex-col items-center justify-center">
                <span class="text-[9px] text-neutral-500 font-bold uppercase tracking-widest">Geração Est.</span>
                <span class="text-blue-400 font-black flex items-center gap-1 text-sm"><i data-lucide="sun" class="w-3 h-3"></i> ${estGeneration} kWh</span>
              </div>
            </div>
            <div class="flex items-center justify-between w-full md:w-auto md:justify-end gap-4 shrink-0 mt-2 md:mt-0 pt-3 md:pt-0 border-t md:border-0 border-neutral-800">
              <div class="text-right">
                <span class="text-[10px] text-neutral-500 line-through decoration-red-500 font-bold md:hidden block">DE: ${formattedListPrice}</span>
                <div class="text-xl md:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-yellow-400 tracking-tighter pb-1 pr-1 inline-block">${formattedPrice}</div>
              </div>
              <button data-kit-id="${safeId}" onclick="copyProposalLinkById(this.dataset.kitId, event)" aria-label="Gerar proposta para ${safeName}" class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 flex items-center justify-center gap-2 transition-all active:scale-95 shadow-[0_0_15px_rgba(37,99,235,0.3)] hover:shadow-[0_0_20px_rgba(37,99,235,0.5)] text-[10px] font-black uppercase tracking-widest min-w-[110px]">
                <i data-lucide="file-text" class="w-4 h-4"></i> GERAR PROPOSTA
              </button>
            </div>
          </div>`;
      }
    }).join('');
    lucide.createIcons();
  }
}

// --- Lookup por ID para evitar JSON em onclick ---
function copyProposalLinkById(kitId, event) {
  const kit = state.data.find(k => String(k.id) === String(kitId));
  if (!kit) return;
  copyProposalLink(kit, event);
}

// --- Gerar e copiar link ---
function copiarLinkExistente(id, btnElement) {
  const originalHTML = btnElement.innerHTML;
  btnElement.innerHTML = '<i class="w-3 h-3 inline" data-lucide="check"></i> Copiado!';
  lucide.createIcons();

  const baseUrl   = window.location.href.split('index.html')[0].replace(/\/$/, '');
  const linkFinal = `${baseUrl}/proposta.html?id=${id}`;
  copiarTextoBlindado(linkFinal);
  showToast('LINK DA PROPOSTA COPIADO!');

  setTimeout(() => {
    btnElement.innerHTML = originalHTML;
    lucide.createIcons();
  }, 3000);
}

async function copyProposalLink(kit, event) {
  const client = state.pbActiveClient;
  if (!client) return alert('Nenhum cliente em atendimento!');

  const btnCopiar   = event.currentTarget;
  const originalText= btnCopiar.innerHTML;
  btnCopiar.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> GERANDO...';
  lucide.createIcons();

  const novaAba = window.open('', '_blank');

  try {
    const vendedorMeta  = state.currentUser.user_metadata || {};
    const vendedorNome  = vendedorMeta.full_name || vendedorMeta.name || state.currentUser.email.split('@')[0];
    const vendedorTel   = vendedorMeta.phone || state.currentUser.phone || '';

    const { data, error } = await supabaseClient.from('propostas').insert([{
      vendedor_email:    state.currentUser.email,
      vendedor_nome:     vendedorNome,
      vendedor_telefone: vendedorTel,
      cliente_nome:      client.nome,
      cliente_telefone:  client.telefone,
      cliente_cidade:    client.cidade,
      kit_nome:          kit.name,
      kit_brand:         kit.brand,
      kit_power:         kit.power,
      kit_price:         kit.price,
      kit_list_price:    kit.list_price
    }]).select();

    if (error) throw error;

    const baseUrl   = window.location.href.split('index.html')[0].replace(/\/$/, '');
    const linkFinal = `${baseUrl}/proposta.html?id=${data[0].id}`;

    novaAba.location.href = linkFinal;
    copiarTextoBlindado(linkFinal);

    if (!client.status || client.status === 'NOVO') {
      await cycleClientStatus(client.id, 'NOVO');
    }

    await fetchPropostas();

    btnCopiar.innerHTML = '<i data-lucide="check" class="w-4 h-4"></i> GERADO E COPIADO!';
    btnCopiar.classList.remove('bg-blue-600', 'hover:bg-blue-500');
    btnCopiar.classList.add('bg-green-600', 'hover:bg-green-500');
    lucide.createIcons();
    showToast('LINK DA PROPOSTA COPIADO!');

    setTimeout(() => {
      btnCopiar.innerHTML = originalText;
      btnCopiar.classList.remove('bg-green-600', 'hover:bg-green-500');
      btnCopiar.classList.add('bg-blue-600', 'hover:bg-blue-500');
      lucide.createIcons();
    }, 3000);

  } catch (err) {
    console.error('Erro na geração:', err);
    alert('Erro ao gerar a proposta. Tente novamente.');
    novaAba.close();
    btnCopiar.innerHTML = originalText;
    lucide.createIcons();
  }
}

// ==========================================
// FECHAR VENDA
// ==========================================
let _fechaVendaClientId = null;

function openFechaVenda(clientId) {
  // Pode ser chamado dos cards (clientId presente) ou do botão dentro do modal de proposta
  const client = clientId
    ? state.clientes.find(c => String(c.id) === String(clientId))
    : state.pbActiveClient;

  if (!client) {
    showToast('Cliente não encontrado. Atualize a página.');
    return;
  }

  _fechaVendaClientId = client.id;
  document.getElementById('fv-client-name').innerText = client.nome;
  document.getElementById('fv-error').classList.add('hidden');
  document.getElementById('fv-kit-info').classList.add('hidden');

  // Popula o select com os kits do catálogo
  const select = document.getElementById('fv-kit-select');
  select.innerHTML = '<option value="">— SELECIONE O KIT —</option>';

  // Adiciona kits do catálogo + propostas do cliente como opções
  const clientPropostas = state.propostas.filter(
    p => p.cliente_nome && p.cliente_nome.toUpperCase() === client.nome.toUpperCase()
  );

  // Se tem propostas, exibe só elas; caso contrário exibe todos os kits
  if (clientPropostas.length > 0) {
    const group = document.createElement('optgroup');
    group.label = 'Propostas Enviadas para este Cliente';
    clientPropostas.forEach(p => {
      const opt = document.createElement('option');
      opt.value = JSON.stringify({ nome: p.kit_nome, preco: p.kit_price, power: p.kit_power, brand: p.kit_brand });
      opt.textContent = `${p.kit_nome} — ${formatCurrency(p.kit_price)}`;
      group.appendChild(opt);
    });
    select.appendChild(group);
  }

  const groupAll = document.createElement('optgroup');
  groupAll.label = clientPropostas.length > 0 ? 'Todos os Kits do Catálogo' : 'Kits do Catálogo';
  state.data.forEach(k => {
    const opt = document.createElement('option');
    opt.value = JSON.stringify({ nome: k.name, preco: k.price, power: k.power, brand: k.brand });
    opt.textContent = `${k.name} — ${formatCurrency(k.price)}`;
    groupAll.appendChild(opt);
  });
  select.appendChild(groupAll);

  document.getElementById('fecha-venda-modal').classList.remove('hidden');
  lucide.createIcons();
}

function closeFechaVenda() {
  document.getElementById('fecha-venda-modal').classList.add('hidden');
  _fechaVendaClientId = null;
}

function onFvKitChange() {
  const select  = document.getElementById('fv-kit-select');
  const infoDiv = document.getElementById('fv-kit-info');
  if (!select.value) { infoDiv.classList.add('hidden'); return; }
  try {
    const kit = JSON.parse(select.value);
    document.getElementById('fv-kit-price').innerText = formatCurrency(kit.preco);
    document.getElementById('fv-kit-power').innerText = kit.power ? `${kit.power} kWp` : '—';
    infoDiv.classList.remove('hidden');
  } catch (_) { infoDiv.classList.add('hidden'); }
}

async function confirmarFechaVenda() {
  const select = document.getElementById('fv-kit-select');
  const errEl  = document.getElementById('fv-error');
  const btn    = document.getElementById('btn-confirmar-venda');

  errEl.classList.add('hidden');

  if (!select.value) {
    errEl.innerText = 'Selecione o kit que foi vendido.';
    errEl.classList.remove('hidden');
    return;
  }

  let kit;
  try { kit = JSON.parse(select.value); }
  catch (_) {
    errEl.innerText = 'Erro ao ler os dados do kit. Tente novamente.';
    errEl.classList.remove('hidden');
    return;
  }

  const client = state.clientes.find(c => c.id === _fechaVendaClientId);
  if (!client || !state.currentUser) {
    errEl.innerText = 'Sessão expirada. Recarregue a página.';
    errEl.classList.remove('hidden');
    return;
  }

  const originalHTML = btn.innerHTML;
  btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin inline mr-2"></i>REGISTRANDO...';
  btn.disabled  = true;
  lucide.createIcons();

  const meta         = state.currentUser.user_metadata || {};
  const vendedorNome = meta.full_name || meta.name || state.currentUser.email.split('@')[0];

  try {
    const { error: insertError } = await supabaseClient.from('vendas').insert([{
      vendedor_email:    state.currentUser.email,
      vendedor_nome:     vendedorNome,
      cliente_id:        client.id,
      cliente_nome:      client.nome,
      cliente_telefone:  client.telefone || '',
      kit_nome:          kit.nome  || '',
      kit_brand:         kit.brand || '',
      kit_power:         Number(kit.power) || 0,
      kit_price:         Number(kit.preco) || 0,
    }]);

    if (insertError) {
      // Erro mais legível para tabela não existente
      const msg = insertError.code === '42P01'
        ? 'Tabela "vendas" não encontrada no Supabase. Execute o SQL de criação.'
        : (insertError.message || 'Erro ao inserir venda.');
      throw new Error(msg);
    }

    // Atualiza status do cliente para FECHADO localmente + remotamente
    const idx = state.clientes.findIndex(c => c.id === client.id);
    if (idx > -1) state.clientes[idx].status = 'FECHADO';
    await supabaseClient.from('clientes').update({ status: 'FECHADO' }).eq('id', client.id);

    // Atualiza lista de vendas (silencioso se der erro)
    await fetchVendas();

    closeFechaVenda();
    showSalesCelebration();
    showToast(`🏆 VENDA FECHADA! ${kit.nome}`);
    renderContent();

  } catch (err) {
    console.error('[confirmarFechaVenda]', err);
    errEl.innerText = err.message || 'Erro ao registrar. Tente novamente.';
    errEl.classList.remove('hidden');
  } finally {
    // Garante que o botão SEMPRE volta ao estado original
    btn.innerHTML = originalHTML;
    btn.disabled  = false;
    lucide.createIcons();
  }
}
