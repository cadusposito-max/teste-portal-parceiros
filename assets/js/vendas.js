// ==========================================
// RENDERIZADOR: VENDAS
// ==========================================

function renderVendas(container) {
  container.className = 'flex flex-col gap-4';

  // --- Período ---
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (!state.vendasPeriod) state.vendasPeriod = currentMonth;

  const allVendas = state.vendas || [];

  // Meses disponíveis com dados (ordem decrescente)
  const availableMonths = [...new Set(allVendas.map(v => {
    const d = new Date(v.created_at);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }))].sort().reverse();
  if (!availableMonths.includes(currentMonth)) availableMonths.unshift(currentMonth);

  // Vendas filtradas pelo período selecionado
  const vendas = state.vendasPeriod === 'all'
    ? allVendas
    : allVendas.filter(v => {
        const d = new Date(v.created_at);
        const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return m === state.vendasPeriod;
      });

  // --- Botões de período pré-calculados (evita template literal aninhado complexo) ---
  const _geralAtivo = state.vendasPeriod === 'all';
  const _periodoBtns = availableMonths.map(m => {
    const ativo   = state.vendasPeriod === m;
    const ehAtual = m === currentMonth;
    const cls = ativo
      ? (ehAtual ? 'bg-green-600 text-black border-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-neutral-700 text-white border-neutral-600')
      : 'bg-transparent border-neutral-800 text-neutral-600 hover:text-neutral-300 hover:border-neutral-700';
    const label = formatMonthLabel(m) + (ehAtual ? ' ●' : '');
    return `<button onclick="setVendasPeriod('${m}')" class="${cls} border px-2.5 py-1 font-black uppercase text-[8px] tracking-widest transition-all whitespace-nowrap">${label}</button>`;
  }).join('');

  // --- Métricas ---
  const totalVendido = vendas.reduce((s, v) => s + (Number(v.kit_price) || 0), 0);
  const qtd          = vendas.length;
  const ticketMedio  = qtd > 0 ? totalVendido / qtd : 0;

  // Última venda (do período filtrado)
  const ultima = vendas[0] || null;

  let html = `
    <!-- Hero -->
    <div class="relative bg-[#080808] bg-grid overflow-hidden p-6 md:p-8 border border-neutral-800">
      <div class="absolute inset-0 pointer-events-none">
        <div class="absolute -top-10 -left-10 w-48 h-48 bg-green-600/8 rounded-full blur-3xl"></div>
        <div class="absolute -bottom-8 -right-8 w-32 h-32 bg-yellow-500/6 rounded-full blur-3xl"></div>
      </div>
      <div class="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p class="text-green-400 text-[10px] font-black uppercase tracking-[0.3em] mb-1 flex items-center gap-2">
            <i data-lucide="trophy" class="w-3.5 h-3.5"></i> BOARD DE VENDAS FECHADAS
          </p>
          <h2 class="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter leading-none">
            Minhas Vendas&nbsp;<span class="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-300">${qtd}</span>
          </h2>
          <p class="text-neutral-600 text-[10px] font-bold uppercase tracking-widest mt-1">
            ${ultima ? `Última: ${formatDate(ultima.created_at)}` : 'Nenhuma venda ainda'}
          </p>
        </div>
        <div class="flex gap-2 flex-wrap">
          <button onclick="exportVendasXLSX()" aria-label="Exportar vendas XLSX"
            class="flex items-center gap-2 bg-neutral-900 border border-neutral-700 hover:border-green-500 hover:text-green-400 text-neutral-500 px-4 py-2.5 font-black uppercase tracking-wider transition-all text-[10px]">
            <i data-lucide="download" class="w-3.5 h-3.5"></i> XLSX
          </button>
        </div>
      </div>

      <!-- Filtros de período -->
      <div class="relative z-10 flex flex-wrap items-center gap-1.5 mt-4 pt-4 border-t border-neutral-800/40">
        <span class="text-[8px] text-neutral-700 font-black uppercase tracking-widest mr-2">Período:</span>
        <button onclick="setVendasPeriod('all')"
          class="${_geralAtivo ? 'bg-neutral-700 text-white border-neutral-600' : 'bg-transparent border-neutral-800 text-neutral-600 hover:text-neutral-300 hover:border-neutral-700'} border px-2.5 py-1 font-black uppercase text-[8px] tracking-widest transition-all">GERAL</button>
        ${_periodoBtns}
      </div>

      <!-- Metric cards row -->
      <div class="relative z-10 grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
        <div class="bg-neutral-900/60 border border-neutral-800 p-4">
          <p class="text-neutral-600 text-[9px] font-black uppercase tracking-widest mb-1">Total Vendido</p>
          <p class="text-2xl font-black text-green-400">${formatCurrency(totalVendido)}</p>
        </div>
        <div class="bg-neutral-900/60 border border-neutral-800 p-4">
          <p class="text-neutral-600 text-[9px] font-black uppercase tracking-widest mb-1">Ticket Médio</p>
          <p class="text-2xl font-black text-blue-400">${formatCurrency(ticketMedio)}</p>
        </div>
        <div class="bg-neutral-900/60 border border-neutral-800 p-4">
          <p class="text-neutral-600 text-[9px] font-black uppercase tracking-widest mb-1">Negócios Fechados</p>
          <p class="text-2xl font-black text-white">${qtd}</p>
        </div>
      </div>
    </div>
  `;

  if (vendas.length === 0) {
    const _filtrado = state.vendasPeriod !== 'all' && allVendas.length > 0;
    html += `
      <div class="py-20 text-center border border-dashed border-neutral-800/60 bg-neutral-950/40">
        <i data-lucide="${_filtrado ? 'calendar-x' : 'trophy'}" class="w-12 h-12 mx-auto mb-4 text-neutral-700"></i>
        <p class="text-neutral-500 text-xs font-black uppercase tracking-widest mb-1">
          ${_filtrado ? `Nenhuma venda em ${formatMonthLabel(state.vendasPeriod)}` : 'Nenhuma venda registrada ainda'}
        </p>
        <p class="text-neutral-700 text-[10px] font-bold uppercase">
          ${_filtrado ? 'Selecione outro período ou clique em GERAL para ver tudo' : 'Feche sua primeira venda pelos cards de cliente ou pela modal de proposta'}
        </p>
      </div>
    `;
    container.innerHTML = html;
    lucide.createIcons();
    return;
  }

  // --- Lista de vendas ---
  html += `<div class="flex flex-col gap-2">`;

  vendas.forEach((v, i) => {
    const stagger = ['stagger-1','stagger-2','stagger-3','stagger-4','stagger-5','stagger-6'][Math.min(i, 5)];
    const waNum  = (v.cliente_telefone || '').replace(/\D/g, '');
    const waLink = waNum
      ? `https://wa.me/55${waNum}?text=${encodeURIComponent('Olá ' + (v.cliente_nome || '').split(' ')[0] + ', parabéns pela aquisição do seu sistema solar!')}`
      : null;

    html += `
      <div class="metric-card venda-metric-card ${stagger} relative border border-neutral-800 hover:border-green-500/25 p-5 group transition-all duration-300">
        <div class="absolute top-0 right-0 w-24 h-24 bg-green-500/3 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>

        <div class="relative z-10 flex items-start gap-4">
          <!-- Trophy badge -->
          <div class="shrink-0 w-11 h-11 rounded-full bg-gradient-to-br from-green-600 to-emerald-400 flex items-center justify-center text-black shadow-[0_0_12px_rgba(34,197,94,0.25)] ring-2 ring-black">
            <i data-lucide="trophy" class="w-5 h-5 stroke-[2.5px]"></i>
          </div>

          <!-- Info -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap mb-1">
              <h3 class="text-white font-black text-sm uppercase truncate group-hover:text-green-400 transition-colors leading-tight">
                ${escapeHTML(v.cliente_nome || '—')}
              </h3>
              <span class="text-[8px] px-2 py-0.5 uppercase font-black tracking-widest border bg-green-500/10 text-green-400 border-green-500/30 shrink-0">
                ✓ FECHADO
              </span>
            </div>

            <div class="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-neutral-600 font-mono mb-2">
              <span class="flex items-center gap-1"><i data-lucide="zap" class="w-2.5 h-2.5"></i>${escapeHTML(v.kit_nome || '—')}</span>
              ${v.kit_power ? `<span class="flex items-center gap-1"><i data-lucide="sun" class="w-2.5 h-2.5"></i>${v.kit_power} kWp</span>` : ''}
              <span class="flex items-center gap-1"><i data-lucide="calendar" class="w-2.5 h-2.5"></i>${formatDate(v.created_at)}</span>
              ${(state.isAdmin && state.adminViewAll && v.vendedor_email) ? `<span class="flex items-center gap-1 text-purple-400 font-bold"><i data-lucide="user" class="w-2.5 h-2.5"></i>${escapeHTML(v.vendedor_email.split('@')[0])}</span>` : ''}
            </div>

            <p class="text-green-400 font-black text-lg leading-none">${formatCurrency(v.kit_price)}</p>
          </div>

          <!-- Actions -->
          <div class="shrink-0 flex flex-col items-end gap-1">
            ${waLink ? `
            <a href="${waLink}" target="_blank" rel="noopener noreferrer"
              class="flex items-center gap-1.5 bg-green-600 border border-green-500 hover:bg-green-700 hover:border-green-400 text-white px-3 py-1.5 font-black uppercase text-[8px] tracking-widest transition-all">
              <i data-lucide="message-circle" class="w-3 h-3"></i> WhatsApp
            </a>` : ''}
            ${state.isAdmin ? `
            <button onclick="deleteVenda('${v.id}')" title="Excluir venda"
              class="flex items-center gap-1.5 bg-red-600 border border-red-500 hover:bg-red-700 hover:border-red-400 text-white px-3 py-1.5 font-black uppercase text-[8px] tracking-widest transition-all">
              <i data-lucide="trash-2" class="w-3 h-3"></i> Excluir
            </button>` : ''}
            <p class="text-neutral-700 text-[9px] font-mono uppercase">${escapeHTML(v.kit_brand || '')}</p>
          </div>
        </div>
      </div>
    `;
  });

  html += `</div>`;
  container.innerHTML = html;
  lucide.createIcons();
}

// --- Filtro de período de vendas ---
function setVendasPeriod(period) {
  state.vendasPeriod = period;
  renderContent();
}

// --- Excluir venda (somente admin) ---
function deleteVenda(id) {
  if (!state.isAdmin) return;

  showConfirmModal(
    'Tem certeza que deseja excluir esta venda? Esta ação não pode ser desfeita.',
    async () => {
      const { error } = await supabaseClient.from('vendas').delete().eq('id', id);
      if (error) {
        showToast('ERRO AO EXCLUIR VENDA: ' + error.message);
        return;
      }

      state.vendas = (state.vendas || []).filter(v => v.id !== id);
      showToast('VENDA EXCLUÍDA COM SUCESSO.');
      renderContent();
    },
    'EXCLUIR VENDA'
  );
}

// --- Exportar XLSX ---
function exportVendasXLSX() {
  const vendas = state.vendas || [];
  if (vendas.length === 0) {
    showToast('Nenhuma venda para exportar.');
    return;
  }
  const columns = [
    { key: 'created_at',       header: 'Data' },
    { key: 'cliente_nome',     header: 'Cliente' },
    { key: 'cliente_telefone', header: 'Telefone' },
    { key: 'kit_nome',         header: 'Kit' },
    { key: 'kit_brand',        header: 'Marca' },
    { key: 'kit_power',        header: 'Potência (kWp)' },
    { key: 'kit_price',        header: 'Valor (R$)' },
    { key: 'vendedor_nome',    header: 'Vendedor' },
    { key: 'vendedor_email',   header: 'E-mail Vendedor' },
  ];
  const rows = vendas.map(v => ({
    created_at:       formatDate(v.created_at),
    cliente_nome:     v.cliente_nome     || '',
    cliente_telefone: v.cliente_telefone || '',
    kit_nome:         v.kit_nome         || '',
    kit_brand:        v.kit_brand        || '',
    kit_power:        v.kit_power        || '',
    kit_price:        v.kit_price        || 0,
    vendedor_nome:    v.vendedor_nome     || '',
    vendedor_email:   v.vendedor_email   || '',
  }));
  exportToXLSX(rows, columns, `vendas_${new Date().toISOString().split('T')[0]}`);
  showToast('EXPORTAÇÃO XLSX CONCLUÍDA!');
}
