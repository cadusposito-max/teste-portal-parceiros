// ==========================================
// RENDERIZADOR: CLIENTES
// ==========================================

function renderClientesList(container) {
  container.className = 'flex flex-col gap-4';

  const STATUS_OPTS = ['TODOS', 'NOVO', 'PROPOSTA ENVIADA', 'EM NEGOCIAÇÃO', 'FECHADO'];
  const SORT_OPTS   = [{ v: 'recent', l: 'MAIS RECENTES' }, { v: 'alpha', l: 'A-Z' }];

  // Filtra por busca
  let list = state.clientes;
  if (state.searchTerm) {
    const lower = state.searchTerm.toLowerCase();
    list = list.filter(c =>
      c.nome.toLowerCase().includes(lower) || c.telefone.includes(lower)
    );
  }

  // Filtra por status
  if (state.clienteFilter && state.clienteFilter !== 'TODOS') {
    list = list.filter(c => (c.status || 'NOVO') === state.clienteFilter);
  }

  // Ordena
  if (state.clienteSort === 'alpha') {
    list = [...list].sort((a, b) => a.nome.localeCompare(b.nome));
  }

  const emptyState = document.getElementById('empty-state');
  const emptyBtn   = document.getElementById('empty-state-btn');

  if (state.clientes.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    document.getElementById('empty-state-text').innerText = 'Nenhum cliente na sua carteira';
    document.getElementById('empty-state-icon').innerHTML = '<i data-lucide="users" class="w-10 h-10"></i>';
    emptyBtn.classList.remove('hidden');
    emptyBtn.innerText = '+ CADASTRAR CLIENTE';
    emptyBtn.onclick = openClientModal;
    return;
  } else {
    emptyState.classList.add('hidden');
  }

  // Contagens por status para os filtros
  const counts = { 'TODOS': state.clientes.length };
  state.clientes.forEach(c => {
    const s = c.status || 'NOVO';
    counts[s] = (counts[s] || 0) + 1;
  });

  const filterHTML = STATUS_OPTS.map(s => {
    const active = state.clienteFilter === s;
    const count  = counts[s] || 0;
    return `
      <button onclick="setClienteFilter('${s}')" aria-pressed="${active}" aria-label="Filtrar por ${s}"
        class="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest border transition-all whitespace-nowrap
          ${active ? 'bg-orange-600 text-black border-orange-500' : 'bg-black text-neutral-500 border-neutral-800 hover:border-neutral-600 hover:text-white'}">
        ${escapeHTML(s)} ${count > 0 ? `<span class="opacity-60">(${count})</span>` : ''}
      </button>`;
  }).join('');

  const sortHTML = SORT_OPTS.map(o => {
    const active = state.clienteSort === o.v;
    return `
      <button onclick="setClienteSort('${o.v}')" aria-pressed="${active}" aria-label="Ordenar por ${o.l}"
        class="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest border transition-all whitespace-nowrap
          ${active ? 'bg-neutral-700 text-white border-neutral-600' : 'bg-black text-neutral-600 border-neutral-800 hover:text-white'}">
        ${o.l}
      </button>`;
  }).join('');

  // --- Avatar color palette & status config ---
  const AVATAR_COLORS = [
    'from-orange-600 to-orange-400', 'from-yellow-600 to-yellow-400',
    'from-green-600 to-emerald-400', 'from-blue-600 to-blue-400',
    'from-purple-600 to-purple-400', 'from-pink-600 to-pink-400',
  ];
  const STATUS_SEQ = ['NOVO', 'PROPOSTA ENVIADA', 'EM NEGOCIAÇÃO', 'FECHADO'];
  const STATUS_STYLE = {
    'NOVO':             { bg: 'bg-orange-500/10', text: 'text-orange-400',  border: 'border-orange-500/30'  },
    'PROPOSTA ENVIADA': { bg: 'bg-blue-500/10',   text: 'text-blue-400',    border: 'border-blue-500/30'    },
    'EM NEGOCIAÇÃO':    { bg: 'bg-yellow-500/10',  text: 'text-yellow-400',  border: 'border-yellow-500/30'  },
    'FECHADO':          { bg: 'bg-green-500/10',   text: 'text-green-400',   border: 'border-green-500/30'   },
  };
  const STAGGER = ['stagger-1','stagger-2','stagger-3','stagger-4','stagger-5','stagger-6'];

  // --- Hero header ---
  let html = `
    <div class="relative bg-[#080808] bg-grid overflow-hidden p-6 md:p-8 border border-neutral-800 mb-2">
      <div class="absolute inset-0 pointer-events-none">
        <div class="absolute -top-10 -left-10 w-48 h-48 bg-orange-600/8 rounded-full blur-3xl"></div>
        <div class="absolute -bottom-8 -right-8 w-32 h-32 bg-yellow-500/6 rounded-full blur-3xl"></div>
      </div>
      <div class="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p class="text-orange-500 text-[10px] font-black uppercase tracking-[0.3em] mb-1 flex items-center gap-2">
            <i data-lucide="users" class="w-3.5 h-3.5"></i> CRM — CARTEIRA DE CLIENTES
          </p>
          <h2 class="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter leading-none">
            Meus Clientes&nbsp;<span class="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-yellow-400">${state.clientes.length}</span>
          </h2>
          <p class="text-neutral-600 text-[10px] font-bold uppercase tracking-widest mt-1">${list.length} exibindo &middot; ${state.clienteFilter !== 'TODOS' ? escapeHTML(state.clienteFilter) : 'Todos os status'}</p>
        </div>
        <div class="flex gap-2 flex-wrap">
          <button onclick="exportClientesXLSX()" aria-label="Exportar XLSX"
            class="flex items-center gap-2 bg-neutral-900 border border-neutral-700 hover:border-green-500 hover:text-green-400 text-neutral-500 px-4 py-2.5 font-black uppercase tracking-wider transition-all text-[10px]">
            <i data-lucide="download" class="w-3.5 h-3.5"></i> XLSX
          </button>
          <button onclick="openClientModal()" aria-label="Novo cliente"
            class="flex items-center gap-2 bg-gradient-to-r from-orange-600 to-yellow-500 hover:from-orange-500 hover:to-yellow-400 text-black px-4 py-2.5 font-black uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(234,88,12,0.3)] active:scale-95 text-[10px]">
            <i data-lucide="user-plus" class="w-3.5 h-3.5 stroke-[3px]"></i> NOVO CLIENTE
          </button>
        </div>
      </div>
    </div>

    <!-- Filtros e ordenação -->
    <div class="flex flex-col sm:flex-row gap-2 pb-2">
      <div class="flex flex-wrap gap-1" role="group" aria-label="Filtrar por status">${filterHTML}</div>
      <div class="flex gap-1 ml-auto shrink-0" role="group" aria-label="Ordenar">${sortHTML}</div>
    </div>
  `;

  if (list.length === 0) {
    html += `<div class="py-16 text-center text-neutral-600 font-bold uppercase tracking-widest text-xs border border-dashed border-neutral-800/60 bg-neutral-950/40">
      <i data-lucide="filter-x" class="w-10 h-10 mx-auto mb-3 opacity-30"></i>
      Nenhum cliente com status "${escapeHTML(state.clienteFilter)}"
    </div>`;
    container.innerHTML = html;
    lucide.createIcons();
    return;
  }

  // --- Premium cards ---
  html += list.map((c, i) => {
    const cStatus    = c.status || 'NOVO';
    const stageIdx   = STATUS_SEQ.indexOf(cStatus);
    const sc         = STATUS_STYLE[cStatus] || STATUS_STYLE['NOVO'];
    const grad       = AVATAR_COLORS[c.nome.charCodeAt(0) % AVATAR_COLORS.length];
    const initial    = c.nome.charAt(0).toUpperCase();
    const stagger    = STAGGER[Math.min(i, 5)];
    const waNum      = c.telefone.replace(/\D/g, '');
    const waLink     = `https://wa.me/55${waNum}?text=${encodeURIComponent('Olá ' + c.nome.split(' ')[0] + ', tudo bem? Gostaria de conversar sobre energia solar!')}`;

    const pipelineBar = STATUS_SEQ.map((s, idx) => {
      const done   = idx <= stageIdx;
      const active = idx === stageIdx;
      const clr    = done ? (active ? 'bg-orange-500' : 'bg-orange-500/35') : 'bg-neutral-800';
      const r      = idx === 0 ? 'rounded-l' : idx === STATUS_SEQ.length - 1 ? 'rounded-r' : '';
      return `<div class="flex-1 h-1 ${clr} ${r} transition-all duration-500"></div>`;
    }).join('');

    return `
    <div class="metric-card client-metric-card shine-effect ${stagger} relative border border-neutral-800 hover:border-orange-500/25 p-5 group transition-all duration-300">
      <!-- Glow blob -->
      <div class="absolute top-0 right-0 w-24 h-24 bg-orange-500/3 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>

      <div class="relative z-10 flex items-start gap-4">
        <!-- Avatar -->
        <div class="shrink-0 w-11 h-11 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center text-black font-black text-base shadow-[0_0_12px_rgba(249,115,22,0.2)] ring-2 ring-black select-none">
          ${escapeHTML(initial)}
        </div>

        <!-- Info -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap mb-0.5">
            <h3 class="text-white font-black text-sm md:text-base uppercase truncate group-hover:text-orange-400 transition-colors leading-tight">${escapeHTML(c.nome)}</h3>
            <button
              onclick="handleCycleClientStatus('${c.id}', '${escapeHTML(cStatus)}')"
              class="text-[8px] px-2 py-0.5 uppercase font-black tracking-widest border transition-all ${sc.bg} ${sc.text} ${sc.border} hover:brightness-125 shrink-0"
              title="Clique para avançar o status" aria-label="Status: ${escapeHTML(cStatus)}">
              ${escapeHTML(cStatus)}
            </button>
          </div>
          <div class="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-neutral-600 font-mono mb-3 mt-1">
            <span class="flex items-center gap-1"><i data-lucide="phone" class="w-2.5 h-2.5"></i>${escapeHTML(c.telefone)}</span>
            ${c.cidade ? `<span class="flex items-center gap-1"><i data-lucide="map-pin" class="w-2.5 h-2.5"></i>${escapeHTML(c.cidade)}</span>` : ''}
            <span class="flex items-center gap-1"><i data-lucide="calendar" class="w-2.5 h-2.5"></i>${formatDate(c.created_at)}</span>
            ${(state.isAdmin && state.adminViewAll && c.vendedor_email) ? `<span class="flex items-center gap-1 text-purple-400 font-bold"><i data-lucide="user" class="w-2.5 h-2.5"></i>${escapeHTML(c.vendedor_email.split('@')[0])}</span>` : ''}
            ${(state.isGestor && state.gestorViewAll && c.vendedor_email) ? `<span class="flex items-center gap-1 text-blue-400 font-bold"><i data-lucide="user" class="w-2.5 h-2.5"></i>${escapeHTML(c.vendedor_email.split('@')[0])}</span>` : ''}
          </div>

          <!-- Pipeline progress -->
          <div class="mb-0">
            <div class="flex gap-0.5 mb-1">${pipelineBar}</div>
            <div class="flex justify-between text-[8px] text-neutral-700 font-bold uppercase">
              <span>Novo</span><span>Proposta</span><span>Negoc.</span><span>Fechado</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Action row -->
      <div class="relative z-10 flex gap-2 mt-4 pt-3.5 border-t border-neutral-800/50">
        <a href="${waLink}" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp ${escapeHTML(c.nome)}"
          class="flex items-center gap-1.5 bg-green-600 border border-green-500 hover:bg-green-700 hover:border-green-400 text-white px-3 py-2 font-black uppercase tracking-wider transition-all active:scale-95 text-[9px] shrink-0">
          <i data-lucide="message-circle" class="w-3.5 h-3.5 stroke-[2.5px]"></i>
          <span class="hidden sm:inline">WhatsApp</span>
        </a>
        <button onclick="openProposalBuilder('${c.id}')" aria-label="Expandir cliente para ${escapeHTML(c.nome)}"
          class="flex-1 bg-neutral-800/50 border border-neutral-700/50 hover:border-orange-500/50 hover:bg-orange-500/8 hover:text-orange-400 text-neutral-400 px-4 py-2 font-black uppercase tracking-wider transition-all active:scale-95 flex gap-2 items-center justify-center text-[9px]">
          <i data-lucide="file-text" class="w-3.5 h-3.5 stroke-[3px]"></i>
          EXPANDIR CLIENTE
        </button>
        <button onclick="openFechaVenda('${c.id}')" aria-label="Fechar venda para ${escapeHTML(c.nome)}"
          class="bg-green-600 border border-green-500 hover:bg-green-700 hover:border-green-400 text-white px-3 py-2 font-black uppercase tracking-wider transition-all active:scale-95 flex gap-1.5 items-center justify-center text-[9px] shrink-0">
          <i data-lucide="trophy" class="w-3.5 h-3.5 stroke-[2.5px]"></i>
          <span class="hidden md:inline">FECHAR</span>
        </button>
      </div>
    </div>
  `;
  }).join('');

  container.innerHTML = html;
  lucide.createIcons();
}

// --- Filtros e ordenação ---
function setClienteFilter(filter) {
  state.clienteFilter = filter;
  renderContent();
}

function setClienteSort(sort) {
  state.clienteSort = sort;
  renderContent();
}

// --- Ciclo de status com confirmação ao "regredir" ---
function handleCycleClientStatus(id, currentStatus) {
  const seq = ['NOVO', 'PROPOSTA ENVIADA', 'EM NEGOCIAÇÃO', 'FECHADO'];
  const nextIdx  = (seq.indexOf(currentStatus) + 1) % seq.length;
  const newStatus = seq[nextIdx];

  if (nextIdx === 0) {
    // Voltar para NOVO é ação "destrutiva" — pede confirmação
    showConfirmModal(
      `Rebaixar o status de volta para "NOVO"? O progresso atual será perdido.`,
      () => cycleClientStatus(id, currentStatus)
    );
  } else {
    cycleClientStatus(id, currentStatus);
  }
}

async function cycleClientStatus(id, currentStatus) {
  const seq = ['NOVO', 'PROPOSTA ENVIADA', 'EM NEGOCIAÇÃO', 'FECHADO'];
  let nextIdx = seq.indexOf(currentStatus) + 1;
  if (nextIdx >= seq.length) nextIdx = 0;
  const newStatus = seq[nextIdx];

  const cIndex = state.clientes.findIndex(c => c.id === id);
  if (cIndex > -1) state.clientes[cIndex].status = newStatus;
  renderContent();

  try {
    await supabaseClient.from('clientes').update({ status: newStatus }).eq('id', id);
    showToast(`STATUS: ${newStatus}`);
  } catch (e) {
    console.warn('[cycleClientStatus] Falha ao persistir status do cliente.', { id, currentStatus, newStatus, error: e });
  }
}

// --- Exportar XLSX ---
function exportClientesXLSX() {
  if (state.clientes.length === 0) {
    showToast('Nenhum cliente para exportar.');
    return;
  }
  const columns = [
    { key: 'nome',       header: 'Nome' },
    { key: 'telefone',   header: 'Telefone' },
    { key: 'cidade',     header: 'Cidade' },
    { key: 'status',     header: 'Status' },
    { key: 'created_at', header: 'Cadastrado em' },
  ];
  const rows = state.clientes.map(c => ({
    nome:       c.nome || '',
    telefone:   c.telefone || '',
    cidade:     c.cidade || '',
    status:     c.status || 'NOVO',
    created_at: formatDate(c.created_at),
  }));
  exportToXLSX(rows, columns, `clientes_${new Date().toISOString().split('T')[0]}`);
  showToast('EXPORTAÇÃO XLSX CONCLUÍDA!');
}

function openClientModal() {
  document.getElementById('client-modal-overlay').classList.remove('hidden');
  document.getElementById('client-form').reset();
}

function closeClientModal() {
  document.getElementById('client-modal-overlay').classList.add('hidden');
}

function formatarTelefone(event) {
  let campo    = event.target;
  let numeros  = campo.value.replace(/\D/g, '');
  let resultado = '';

  if (numeros.length > 0) resultado = '(' + numeros.substring(0, 2);
  if (numeros.length > 2) resultado += ') ' + numeros.substring(2, 7);
  if (numeros.length > 7) resultado += '-' + numeros.substring(7, 11);

  campo.value = resultado;
}

document.getElementById('client-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!state.currentUser) {
    showToast('Faça login primeiro!');
    return;
  }

  const btnSave = document.getElementById('btn-save-client');
  btnSave.innerText = 'SALVANDO...';

  const newClient = {
    vendedor_email: state.currentUser.email,
    nome:    document.getElementById('client-nome').value.toUpperCase(),
    telefone:document.getElementById('client-telefone').value,
    cidade:  document.getElementById('client-cidade').value,
    status:  'NOVO',
    franquia_id: state.franquiaId
  };

  let { data, error } = await supabaseClient.from('clientes').insert([newClient]);
  if (error && error.code === '42703') {
    delete newClient.status;
    const { error: error2 } = await supabaseClient.from('clientes').insert([newClient]);
    if (error2) {
      console.error('Erro ao salvar cliente:', error2);
      showToast(`Erro ao salvar cliente: ${error2.message}`);
      btnSave.innerText = 'SALVAR CLIENTE';
      return;
    }
  } else if (error) {
    console.error('Erro ao salvar cliente:', error);
    showToast(`Erro ao salvar cliente: ${error.message}`);
    btnSave.innerText = 'SALVAR CLIENTE';
    return;
  }

  await fetchClientes();
  closeClientModal();
  showToast('CLIENTE SALVO!');
  renderContent();
  btnSave.innerText = 'SALVAR CLIENTE';
});


