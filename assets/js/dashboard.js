// ==========================================
// RENDERIZADOR: DASHBOARD
// ==========================================

function renderDashboard(container) {
  container.className = 'flex flex-col gap-5 w-full';

  // --- Dados ---
  const totalClientes  = state.clientes.length;
  const propostasReais = state.propostas.length;

  const funil = { 'NOVO': 0, 'PROPOSTA ENVIADA': 0, 'EM NEGOCIAÇÃO': 0, 'FECHADO': 0 };
  state.clientes.forEach(c => {
    const s = c.status || 'NOVO';
    if (funil[s] !== undefined) funil[s]++;
    else funil['NOVO']++;
  });

  const vendasFechadas = funil['FECHADO'];
  // Comissão real: 5% sobre o total de vendas fechadas registradas
  const totalVendido   = (state.vendas || []).reduce((s, v) => s + (Number(v.kit_price) || 0), 0);
  const qtdVendas      = (state.vendas || []).length;
  const comissaoEst    = totalVendido * 0.05;
  const taxaConversao  = totalClientes > 0 ? Math.round((vendasFechadas / totalClientes) * 100) : 0;

  // Percentuais do funil (relativo ao total de clientes)
  const maxF   = totalClientes || 1;
  const fPct   = k => Math.round((funil[k] / maxF) * 100);
  const fWidth = k => Math.max(fPct(k), 2); // mínimo visual de 2%

  // Taxa de avanço entre etapas
  const toNum = (a, b) => funil[a] > 0 ? Math.round((funil[b] / funil[a]) * 100) : 0;
  const convProp = toNum('NOVO',             'PROPOSTA ENVIADA');
  const convNeg  = toNum('PROPOSTA ENVIADA', 'EM NEGOCIAÇÃO');
  const convFech = toNum('EM NEGOCIAÇÃO',    'FECHADO');

  // Saudação
  const greeting  = getGreeting();
  const firstName = getFirstName();
  const hoje      = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const dateStr   = hoje.charAt(0).toUpperCase() + hoje.slice(1);

  // Tabela de propostas
  const recentes = state.propostas.slice(0, 5);
  const totalPropostasLabel = state.propostas.length > 5
    ? `<span class="text-[9px] text-neutral-600 italic">${state.propostas.length - 5} mais no histórico</span>`
    : '';

  const AVATAR_COLORS = ['bg-blue-600','bg-purple-600','bg-orange-600','bg-green-600','bg-pink-600','bg-cyan-600'];
  const avatarColor = (nome) => AVATAR_COLORS[nome.charCodeAt(0) % AVATAR_COLORS.length];

  let tabelaHTML = '';
  if (recentes.length === 0) {
    tabelaHTML = `
      <tr><td colspan="4" class="py-14 text-center">
        <div class="flex flex-col items-center gap-3">
          <i data-lucide="file-plus" class="w-9 h-9 text-neutral-800"></i>
          <span class="text-neutral-600 font-bold uppercase tracking-widest text-[10px]">Nenhuma proposta ainda</span>
          <button onclick="setTab('clientes')" class="text-orange-500 text-[10px] font-black uppercase tracking-widest hover:underline mt-1">Ir para clientes →</button>
        </div>
      </td></tr>`;
  } else {
    tabelaHTML = recentes.map(p => {
      const nome  = escapeHTML(p.cliente_nome);
      const inits = nome.substring(0, 2).toUpperCase();
      const color = avatarColor(escapeHTML(p.cliente_nome));
      return `
        <tr class="border-b border-neutral-900 table-row-hover border-l-2 border-l-transparent group">
          <td class="py-3 pl-4">
            <div class="flex items-center gap-3">
              <div class="w-7 h-7 ${color} rounded-full flex items-center justify-center text-white font-black text-[10px] shrink-0 select-none">${inits}</div>
              <span class="font-bold text-white uppercase text-xs truncate max-w-[110px]">${nome}</span>
            </div>
          </td>
          <td class="py-3 text-neutral-600 hidden sm:table-cell text-[10px] font-mono">
            ${escapeHTML(String(p.kit_power))} kWp · ${escapeHTML(p.kit_brand)}
          </td>
          <td class="py-3 font-black text-green-400 text-sm tabular-nums">${formatCurrency(p.kit_price)}</td>
          <td class="py-3 pr-4 text-right">
            <button onclick="copiarLinkExistente('${p.id}', this)"
              aria-label="Copiar link da proposta de ${nome}"
              class="opacity-0 group-hover:opacity-100 text-blue-400 hover:text-white transition-all
                bg-blue-500/10 hover:bg-blue-600 px-3 py-1 flex items-center gap-1.5 ml-auto
                text-[9px] font-black uppercase tracking-widest border border-blue-500/20
                hover:border-blue-500">
              <i data-lucide="link" class="w-3 h-3"></i> Copiar
            </button>
          </td>
        </tr>`;
    }).join('');
  }

  container.innerHTML = `
    <!-- ════════════════════════════════════════
         HERO HEADER — saudação + relógio
         ════════════════════════════════════════ -->
    <div class="stagger-1 relative overflow-hidden border border-neutral-800/60 p-6 md:p-8 group" style="background: linear-gradient(135deg, #0f0f0f 0%, #080808 100%);">
      <div class="absolute inset-0 bg-grid opacity-50 pointer-events-none"></div>
      <div class="absolute -right-16 -top-16 w-64 h-64 bg-orange-600/5 rounded-full blur-[80px] group-hover:bg-orange-600/8 transition-all duration-1000 pointer-events-none"></div>
      <div class="absolute -left-8 -bottom-8 w-48 h-48 bg-yellow-500/3 rounded-full blur-[60px] pointer-events-none"></div>

      <div class="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div>
          <p class="text-[9px] font-black uppercase tracking-[0.4em] text-neutral-600 mb-2">${dateStr}</p>
          <h2 class="text-3xl md:text-4xl font-black text-white leading-none tracking-tight">
            ${greeting}${firstName
              ? `, <span class="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-yellow-300">${escapeHTML(firstName)}</span>.`
              : '.'}
          </h2>
          <p class="text-neutral-500 text-sm font-medium mt-2.5">Aqui está o resumo da sua carteira.</p>
        </div>
        <div class="flex flex-col items-start md:items-end gap-1 shrink-0">
          <div id="dashboard-clock" class="text-4xl md:text-5xl font-black text-white live-clock tabular-nums leading-none">00:00:00</div>
          <span class="text-[9px] text-neutral-700 font-bold uppercase tracking-[0.3em]">Horário local</span>
        </div>
      </div>
    </div>

    <!-- ════════════════════════════════════════
         CARDS DE MÉTRICAS
         ════════════════════════════════════════ -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">

      <!-- Clientes -->
      <div class="metric-card stagger-2 shine-effect border border-neutral-800/60 p-5 md:p-6 flex flex-col gap-4 relative overflow-hidden group cursor-default">
        <div class="absolute -top-6 -right-6 w-28 h-28 bg-blue-500 opacity-[0.05] rounded-full blur-2xl group-hover:opacity-[0.1] transition-opacity duration-700 pointer-events-none"></div>
        <div class="flex justify-between items-start relative z-10">
          <span class="text-[9px] text-neutral-600 font-black uppercase tracking-widest">Meus Clientes</span>
          <div class="p-2 bg-blue-500/10 border border-blue-500/20 group-hover:border-blue-500/40 transition-colors">
            <i data-lucide="users" class="w-3.5 h-3.5 text-blue-400"></i>
          </div>
        </div>
        <div class="relative z-10">
          <div class="text-4xl md:text-5xl font-black text-white tabular-nums leading-none" data-count="${totalClientes}">0</div>
          <div class="text-[9px] text-neutral-600 font-bold uppercase tracking-widest mt-1.5">na carteira</div>
        </div>
        <div class="relative z-10 space-y-1.5">
          <div class="flex justify-between text-[8px] text-neutral-700 font-bold uppercase tracking-widest">
            <span>Meta</span><span class="text-blue-500">${Math.min(totalClientes * 10, 100)}%</span>
          </div>
          <div class="w-full h-px bg-neutral-900 rounded-full">
            <div class="h-full bg-gradient-to-r from-blue-600 to-blue-400 bar-animated rounded-full" style="width: ${Math.min(totalClientes * 10, 100)}%"></div>
          </div>
        </div>
      </div>

      <!-- Propostas -->
      <div class="metric-card stagger-2 shine-effect border border-neutral-800/60 p-5 md:p-6 flex flex-col gap-4 relative overflow-hidden group cursor-default" style="animation-delay: 80ms">
        <div class="absolute -top-6 -right-6 w-28 h-28 bg-orange-500 opacity-[0.05] rounded-full blur-2xl group-hover:opacity-[0.1] transition-opacity duration-700 pointer-events-none"></div>
        <div class="flex justify-between items-start relative z-10">
          <span class="text-[9px] text-neutral-600 font-black uppercase tracking-widest">Propostas</span>
          <div class="p-2 bg-orange-500/10 border border-orange-500/20 group-hover:border-orange-500/40 transition-colors">
            <i data-lucide="file-text" class="w-3.5 h-3.5 text-orange-400"></i>
          </div>
        </div>
        <div class="relative z-10">
          <div class="text-4xl md:text-5xl font-black text-white tabular-nums leading-none" data-count="${propostasReais}">0</div>
          <div class="text-[9px] text-neutral-600 font-bold uppercase tracking-widest mt-1.5">orçamentos gerados</div>
        </div>
        <div class="relative z-10 space-y-1.5">
          <div class="flex justify-between text-[8px] text-neutral-700 font-bold uppercase tracking-widest">
            <span>Volume</span><span class="text-orange-400">${Math.min(propostasReais * 5, 100)}%</span>
          </div>
          <div class="w-full h-px bg-neutral-900 rounded-full">
            <div class="h-full bg-gradient-to-r from-orange-600 to-yellow-400 bar-animated rounded-full" style="width: ${Math.min(propostasReais * 5, 100)}%"></div>
          </div>
        </div>
      </div>

      <!-- Fechados -->
      <div class="metric-card stagger-2 shine-effect border border-neutral-800/60 p-5 md:p-6 flex flex-col gap-4 relative overflow-hidden group cursor-default" style="animation-delay: 160ms">
        <div class="absolute -top-6 -right-6 w-28 h-28 bg-green-500 opacity-[0.05] rounded-full blur-2xl group-hover:opacity-[0.1] transition-opacity duration-700 pointer-events-none"></div>
        <div class="flex justify-between items-start relative z-10">
          <span class="text-[9px] text-neutral-600 font-black uppercase tracking-widest">Negócios Fechados</span>
          <div class="p-2 bg-green-500/10 border border-green-500/20 group-hover:border-green-500/40 transition-colors">
            <i data-lucide="trophy" class="w-3.5 h-3.5 text-green-400"></i>
          </div>
        </div>
        <div class="relative z-10">
          <div class="text-4xl md:text-5xl font-black text-white tabular-nums leading-none neon-green" data-count="${vendasFechadas}">0</div>
          <div class="text-[9px] text-neutral-600 font-bold uppercase tracking-widest mt-1.5">vendas confirmadas</div>
        </div>
        <div class="relative z-10 space-y-1.5">
          <div class="flex justify-between text-[8px] text-neutral-700 font-bold uppercase tracking-widest">
            <span>Conversão</span><span class="text-green-400">${taxaConversao}%</span>
          </div>
          <div class="w-full h-px bg-neutral-900 rounded-full">
            <div class="h-full bg-gradient-to-r from-green-600 to-green-400 bar-animated rounded-full" style="width: ${taxaConversao}%"></div>
          </div>
        </div>
      </div>

      <!-- Comissão -->
      <div class="metric-card stagger-2 shine-effect border border-neutral-800/60 p-5 md:p-6 flex flex-col gap-4 relative overflow-hidden group cursor-default" style="animation-delay: 240ms">
        <div class="absolute -top-6 -right-6 w-28 h-28 bg-yellow-400 opacity-[0.04] rounded-full blur-2xl group-hover:opacity-[0.08] transition-opacity duration-700 pointer-events-none"></div>
        <div class="flex justify-between items-start relative z-10">
          <span class="text-[9px] text-neutral-600 font-black uppercase tracking-widest">Comissão Est.</span>
          <div class="p-2 bg-yellow-400/10 border border-yellow-400/20 group-hover:border-yellow-400/40 transition-colors">
            <i data-lucide="coins" class="w-3.5 h-3.5 text-yellow-400"></i>
          </div>
        </div>
        <div class="relative z-10">
          <div class="text-3xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-400 tabular-nums leading-none pb-0.5" data-count="${comissaoEst}" data-count-currency="true">R$ 0</div>
          <div class="text-[9px] text-neutral-600 font-bold uppercase tracking-widest mt-1.5">${qtdVendas > 0 ? `${qtdVendas} venda${qtdVendas > 1 ? 's' : ''} fechada${qtdVendas > 1 ? 's' : ''}` : 'nenhuma venda registrada'}</div>
        </div>
        <div class="relative z-10 space-y-1.5">
          <div class="flex justify-between text-[8px] text-neutral-700 font-bold uppercase tracking-widest">
            <span>5% s/ vendido</span><span class="text-yellow-500">${formatCurrency(totalVendido)}</span>
          </div>
          <div class="w-full h-px bg-neutral-900 rounded-full">
            <div class="h-full bg-gradient-to-r from-yellow-500 to-orange-400 bar-animated rounded-full" style="width: ${Math.min(qtdVendas * 20, 100)}%"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- ════════════════════════════════════════
         PIPELINE DE VENDAS
         ════════════════════════════════════════ -->
    <div class="stagger-3 relative overflow-hidden border border-neutral-800/60 p-6 md:p-7" style="background: linear-gradient(135deg, #0e0e0e 0%, #080808 100%);">
      <div class="absolute right-0 top-0 w-48 h-48 bg-purple-600/4 rounded-full blur-3xl pointer-events-none"></div>

      <div class="flex items-center justify-between mb-6 relative z-10">
        <div class="flex items-center gap-2.5">
          <div class="p-1.5 bg-purple-500/10 border border-purple-500/25">
            <i data-lucide="git-merge" class="w-3.5 h-3.5 text-purple-400"></i>
          </div>
          <h3 class="text-[10px] font-black text-white uppercase tracking-widest">Pipeline de Vendas</h3>
        </div>
        <div class="text-[9px] text-neutral-600 font-bold">
          Conversão global: <span class="text-purple-400 font-black">${taxaConversao}%</span>
        </div>
      </div>

      <div class="grid grid-cols-4 gap-2 md:gap-5 relative z-10">
        <!-- NOVO -->
        <div class="flex flex-col gap-2.5">
          <div class="flex items-center justify-between">
            <span class="text-[9px] font-black uppercase tracking-widest text-blue-400">Novos</span>
            <span class="text-[9px] text-neutral-700 font-bold tabular-nums">${fPct('NOVO')}%</span>
          </div>
          <div class="h-1 bg-neutral-900 rounded-none overflow-hidden">
            <div class="h-full bg-gradient-to-r from-blue-700 to-blue-400 funnel-bar rounded-none" style="width: ${fWidth('NOVO')}%"></div>
          </div>
          <div class="text-2xl md:text-3xl font-black text-white tabular-nums leading-none">${funil['NOVO']}</div>
          <div class="text-[8px] text-neutral-700 font-bold uppercase tracking-widest leading-tight">leads</div>
          ${convProp > 0 ? `
            <div class="hidden md:flex items-center gap-1 text-[8px] text-blue-500/60 font-bold">
              <i data-lucide="arrow-right" class="w-2.5 h-2.5 shrink-0"></i>${convProp}% passaram
            </div>` : ''}
        </div>

        <!-- PROPOSTA ENVIADA -->
        <div class="flex flex-col gap-2.5">
          <div class="flex items-center justify-between">
            <span class="text-[9px] font-black uppercase tracking-widest text-yellow-400 hidden md:block">Proposta</span>
            <span class="text-[9px] font-black uppercase tracking-widest text-yellow-400 md:hidden">Prop.</span>
            <span class="text-[9px] text-neutral-700 font-bold tabular-nums">${fPct('PROPOSTA ENVIADA')}%</span>
          </div>
          <div class="h-1 bg-neutral-900 rounded-none overflow-hidden">
            <div class="h-full bg-gradient-to-r from-yellow-700 to-yellow-400 funnel-bar rounded-none" style="width: ${fWidth('PROPOSTA ENVIADA')}%; animation-delay: 180ms;"></div>
          </div>
          <div class="text-2xl md:text-3xl font-black text-white tabular-nums leading-none">${funil['PROPOSTA ENVIADA']}</div>
          <div class="text-[8px] text-neutral-700 font-bold uppercase tracking-widest leading-tight">enviadas</div>
          ${convNeg > 0 ? `
            <div class="hidden md:flex items-center gap-1 text-[8px] text-yellow-500/60 font-bold">
              <i data-lucide="arrow-right" class="w-2.5 h-2.5 shrink-0"></i>${convNeg}% passaram
            </div>` : ''}
        </div>

        <!-- EM NEGOCIAÇÃO -->
        <div class="flex flex-col gap-2.5">
          <div class="flex items-center justify-between">
            <span class="text-[9px] font-black uppercase tracking-widest text-orange-400 hidden md:block">Negociação</span>
            <span class="text-[9px] font-black uppercase tracking-widest text-orange-400 md:hidden">Neg.</span>
            <span class="text-[9px] text-neutral-700 font-bold tabular-nums">${fPct('EM NEGOCIAÇÃO')}%</span>
          </div>
          <div class="h-1 bg-neutral-900 rounded-none overflow-hidden">
            <div class="h-full bg-gradient-to-r from-orange-700 to-orange-400 funnel-bar rounded-none" style="width: ${fWidth('EM NEGOCIAÇÃO')}%; animation-delay: 360ms;"></div>
          </div>
          <div class="text-2xl md:text-3xl font-black text-white tabular-nums leading-none">${funil['EM NEGOCIAÇÃO']}</div>
          <div class="text-[8px] text-neutral-700 font-bold uppercase tracking-widest leading-tight">em andamento</div>
          ${convFech > 0 ? `
            <div class="hidden md:flex items-center gap-1 text-[8px] text-orange-500/60 font-bold">
              <i data-lucide="arrow-right" class="w-2.5 h-2.5 shrink-0"></i>${convFech}% fecharam
            </div>` : ''}
        </div>

        <!-- FECHADO -->
        <div class="flex flex-col gap-2.5">
          <div class="flex items-center justify-between">
            <span class="text-[9px] font-black uppercase tracking-widest text-green-400">Fechado</span>
            <span class="text-[9px] text-neutral-700 font-bold tabular-nums">${fPct('FECHADO')}%</span>
          </div>
          <div class="h-1 bg-neutral-900 rounded-none overflow-hidden">
            <div class="h-full bg-gradient-to-r from-green-700 to-green-400 funnel-bar rounded-none" style="width: ${fWidth('FECHADO')}%; animation-delay: 540ms;"></div>
          </div>
          <div class="text-2xl md:text-3xl font-black text-green-400 tabular-nums leading-none neon-green">${funil['FECHADO']}</div>
          <div class="text-[8px] text-neutral-700 font-bold uppercase tracking-widest leading-tight">concluídos</div>
          <div class="hidden md:flex items-center gap-1 text-[8px] text-yellow-500/60 font-bold">
            <i data-lucide="coins" class="w-2.5 h-2.5 shrink-0"></i>${qtdVendas > 0 ? formatCurrency(comissaoEst) + ' comis.' : 'sem vendas'}
          </div>
        </div>
      </div>
    </div>

    <!-- ════════════════════════════════════════
         TABELA DE PROPOSTAS + LATERAL
         ════════════════════════════════════════ -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 stagger-4">

      <!-- Tabela -->
      <div class="col-span-1 lg:col-span-2 border border-neutral-800/60 flex flex-col" style="background: linear-gradient(180deg, #0d0d0d 0%, #080808 100%);">
        <div class="flex items-center justify-between px-5 py-4 border-b border-neutral-800/50">
          <h3 class="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
            <div class="p-1.5 bg-orange-500/10 border border-orange-500/20">
              <i data-lucide="history" class="w-3 h-3 text-orange-400"></i>
            </div>
            Últimas Propostas
          </h3>
          ${totalPropostasLabel}
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs text-neutral-500 min-w-[400px]">
            <thead>
              <tr class="border-b border-neutral-900">
                <th class="px-4 py-3 text-[8px] font-black uppercase tracking-widest text-neutral-700">Cliente</th>
                <th class="py-3 text-[8px] font-black uppercase tracking-widest text-neutral-700 hidden sm:table-cell">Kit</th>
                <th class="py-3 text-[8px] font-black uppercase tracking-widest text-neutral-700">Valor</th>
                <th class="py-3 pr-4 text-[8px] font-black uppercase tracking-widest text-neutral-700 text-right">Ação</th>
              </tr>
            </thead>
            <tbody>${tabelaHTML}</tbody>
          </table>
        </div>
      </div>

      <!-- Coluna lateral -->
      <div class="flex flex-col gap-3">

        <!-- Materiais Úteis -->
        <div class="border border-neutral-800/60 p-5 flex flex-col gap-3" style="background: #0d0d0d;">
          <h3 class="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
            <div class="p-1.5 bg-blue-500/10 border border-blue-500/20">
              <i data-lucide="folder-down" class="w-3 h-3 text-blue-400"></i>
            </div>
            Materiais Úteis
          </h3>
          <a href="#" class="flex items-center justify-between p-3 border border-neutral-800/50 hover:border-red-500/40 hover:bg-red-500/4 transition-all group">
            <div class="flex items-center gap-2.5">
              <div class="p-1.5 bg-red-500/10 shrink-0"><i data-lucide="file-text" class="w-3.5 h-3.5 text-red-400"></i></div>
              <span class="text-[10px] font-bold text-neutral-400 group-hover:text-white uppercase tracking-wider transition-colors">Apresentação Ágil</span>
            </div>
            <i data-lucide="download" class="w-3 h-3 text-neutral-700 group-hover:text-red-400 shrink-0 transition-colors"></i>
          </a>
          <a href="#" class="flex items-center justify-between p-3 border border-neutral-800/50 hover:border-green-500/40 hover:bg-green-500/4 transition-all group">
            <div class="flex items-center gap-2.5">
              <div class="p-1.5 bg-green-500/10 shrink-0"><i data-lucide="file-spreadsheet" class="w-3.5 h-3.5 text-green-400"></i></div>
              <span class="text-[10px] font-bold text-neutral-400 group-hover:text-white uppercase tracking-wider transition-colors">Tabela de Juros</span>
            </div>
            <i data-lucide="download" class="w-3 h-3 text-neutral-700 group-hover:text-green-400 shrink-0 transition-colors"></i>
          </a>
          <a href="#" class="flex items-center justify-between p-3 border border-neutral-800/50 hover:border-orange-500/40 hover:bg-orange-500/4 transition-all group">
            <div class="flex items-center gap-2.5">
              <div class="p-1.5 bg-orange-500/10 shrink-0"><i data-lucide="file-check-2" class="w-3.5 h-3.5 text-orange-400"></i></div>
              <span class="text-[10px] font-bold text-neutral-400 group-hover:text-white uppercase tracking-wider transition-colors">Ficha Inversores</span>
            </div>
            <i data-lucide="download" class="w-3 h-3 text-neutral-700 group-hover:text-orange-400 shrink-0 transition-colors"></i>
          </a>
        </div>

        <!-- CTA Ação Rápida -->
        <div class="relative overflow-hidden border border-orange-500/15 p-5 flex flex-col gap-4"
          style="background: linear-gradient(135deg, rgba(234,88,12,0.06) 0%, #080808 60%);">
          <div class="absolute inset-0 bg-grid-sm opacity-30 pointer-events-none"></div>
          <div class="relative z-10">
            <div class="text-[8px] font-black text-orange-400/50 uppercase tracking-[0.3em] mb-2">Ação Rápida</div>
            <p class="text-sm font-bold text-neutral-300 leading-snug">Tem um cliente em mente?<br>Crie o orçamento agora.</p>
          </div>
          <button onclick="setTab('clientes')"
            class="relative z-10 flex items-center gap-2 bg-gradient-to-r from-orange-600 to-yellow-500
              hover:from-orange-500 hover:to-yellow-400 text-black px-4 py-2.5 font-black uppercase
              tracking-widest text-[10px] transition-all active:scale-95
              shadow-[0_0_20px_rgba(234,88,12,0.2)] hover:shadow-[0_0_30px_rgba(234,88,12,0.5)]">
            <i data-lucide="users" class="w-3.5 h-3.5"></i> Ir para Clientes
          </button>
        </div>

      </div>
    </div>
  `;

  lucide.createIcons();
  animateCounters();
  startDashboardClock();
}
