// ==========================================
// RENDERIZADOR: PRODUTOS (Admin)
// ==========================================

function renderProductsList(container) {
  const emptyState = document.getElementById('empty-state');
  const emptyBtn   = document.getElementById('empty-state-btn');

  if (!state.isEditMode) {
    container.innerHTML  = '';
    container.className  = 'flex flex-col';
    emptyState.classList.remove('hidden');

    document.getElementById('empty-state-icon').innerHTML  = '<i data-lucide="lock" class="w-10 h-10 text-red-500"></i>';
    document.getElementById('empty-state-icon').className  = 'inline-flex items-center justify-center w-20 h-20 bg-red-900/10 mb-6 text-red-500 border border-red-800';
    document.getElementById('empty-state-text').innerHTML  = "<span class='text-red-500 text-2xl'>ACESSO BLOQUEADO</span><br><span class='text-sm font-medium text-neutral-400 lowercase normal-case mt-4 block max-w-md mx-auto'>Os kits e valores agora são exclusivos do <b>Criador de Propostas</b>.<br>Aceda aos seus clientes e clique em 'Nova Proposta' para gerar o orçamento.</span>";

    emptyBtn.classList.remove('hidden');
    emptyBtn.innerText = 'IR PARA MEUS CLIENTES';
    emptyBtn.onclick = () => setTab('clientes');
    lucide.createIcons();
    return;
  }

  document.getElementById('empty-state-icon').innerHTML = '<i data-lucide="search" class="w-10 h-10"></i>';
  document.getElementById('empty-state-icon').className = 'inline-flex items-center justify-center w-20 h-20 bg-neutral-900 mb-6 text-neutral-700 border border-neutral-800';

  let list = state.data.filter(item => item.categoria === state.activeTab);
  if (state.searchTerm) {
    const lower = state.searchTerm.toLowerCase();
    list = list.filter(item =>
      item.name.toLowerCase().includes(lower) || item.brand.toLowerCase().includes(lower)
    );
  }

  if (list.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    document.getElementById('empty-state-text').innerText = 'Nenhum kit encontrado';
    if (state.isEditMode) {
      emptyBtn.classList.remove('hidden');
      emptyBtn.innerText = '+ CRIAR NOVO ITEM';
      emptyBtn.onclick = () => openModal();
    } else {
      emptyBtn.classList.add('hidden');
    }
    return;
  } else {
    emptyState.classList.add('hidden');
  }

  container.className = state.viewMode === 'grid'
    ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8'
    : 'flex flex-col gap-4 bg-neutral-900/50 border border-neutral-800 rounded-none';

  container.innerHTML = list.map(item => {
    const discount          = Math.round(((item.list_price - item.price) / item.list_price) * 100);
    const badgeClass        = getBadgeStyles(item.tag);
    const formattedPrice    = formatCurrency(item.price);
    const formattedListPrice= formatCurrency(item.list_price);

    const adminButtons = `
      <div class="flex gap-2">
        <button data-item-id="${item.id}" onclick="openModalById(this.dataset.itemId)" aria-label="Editar ${escapeHTML(item.name)}" class="p-1.5 bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white transition-colors"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
        <button onclick="deleteItem('${item.id}')" aria-label="Excluir ${escapeHTML(item.name)}" class="p-1.5 bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white transition-colors"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
      </div>`;

    if (state.viewMode === 'grid') {
      return `
        <div class="relative group flex flex-col overflow-hidden transition-all duration-300 bg-neutral-900 border-2 border-dashed border-orange-500/50 hover:-translate-y-1 opacity-80 hover:opacity-100">
          <div class="absolute top-0 right-0 p-2 z-20 flex gap-1 bg-black/80 backdrop-blur border-b border-l border-neutral-700">${adminButtons}</div>
          <div class="absolute -left-1 top-4 z-10"><div class="bg-red-600 text-white text-xs font-black px-3 py-1 shadow-lg flex items-center gap-1 skew-x-[-10deg] border-2 border-red-800"><span class="skew-x-[10deg]">-${discount}% OFF</span></div></div>
          <div class="p-6 relative z-10 flex flex-col h-full">
            <div class="flex justify-end mb-4"><span class="px-2 py-0.5 rounded-none skew-x-[-10deg] text-[10px] font-black uppercase tracking-tighter border-l-4 shadow-[0_0_10px_rgba(0,0,0,0.5)] ${badgeClass}"><span class="skew-x-[10deg] inline-block">${item.tag}</span></span></div>
            <div class="mb-1"><span class="text-[10px] text-neutral-500 font-bold uppercase tracking-[0.2em]">${item.brand}</span></div>
            <h3 class="text-white font-black text-xl leading-none uppercase tracking-tight mb-4">${item.name}</h3>
            <div class="bg-black/50 border border-neutral-800 p-3 mb-6 grid grid-cols-2 gap-2">
              <div class="flex flex-col"><span class="text-[10px] text-neutral-500 font-bold uppercase">Potência</span><span class="text-orange-500 font-black text-lg flex items-center gap-1"><i data-lucide="zap" class="w-4 h-4 fill-orange-500"></i> ${item.power} <span class="text-xs">kWp</span></span></div>
              <div class="flex flex-col border-l border-neutral-800 pl-3"><span class="text-[10px] text-neutral-500 font-bold uppercase">Tipo</span><span class="text-neutral-300 font-bold text-sm uppercase mt-1 truncate">${item.type}</span></div>
            </div>
            <div class="mt-auto pt-4 border-t-2 border-dashed border-neutral-800">
              <div class="flex flex-col mb-1"><span class="text-xs text-neutral-500 line-through font-bold decoration-red-500 decoration-2">DE: ${formattedListPrice}</span></div>
              <div>
                <span class="text-[10px] text-orange-500 font-black uppercase tracking-wider block mb-[-4px]">À VISTA</span>
                <div class="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-yellow-400 tracking-tighter pb-1 pr-1 inline-block"><span class="text-base align-top text-neutral-500 mr-0.5">R$</span>${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(item.price)}<span class="text-lg align-top text-neutral-500">,00</span></div>
              </div>
            </div>
          </div>
        </div>`;
    } else {
      return `
        <div class="relative flex flex-col sm:flex-row sm:items-center p-5 gap-4 group bg-neutral-900 border-b border-dashed border-orange-500/30 transition-all opacity-80 hover:opacity-100">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-3 mb-2 flex-wrap">
              <span class="px-2 py-0.5 rounded-none skew-x-[-10deg] text-[10px] font-black uppercase tracking-tighter border-l-4 shadow-[0_0_10px_rgba(0,0,0,0.5)] ${badgeClass}"><span class="skew-x-[10deg] inline-block">${item.tag}</span></span>
              <span class="text-[10px] font-black text-neutral-500 uppercase tracking-widest bg-black px-2 py-0.5">${item.brand}</span>
            </div>
            <h3 class="text-white font-black text-lg uppercase tracking-tight truncate group-hover:text-orange-400 transition-colors">${item.name}</h3>
            <div class="flex items-center gap-4 text-xs mt-2 text-neutral-400 uppercase font-bold">
              <span class="flex items-center text-orange-500"><i data-lucide="zap" class="w-3 h-3 mr-1"></i> ${item.power} kWp</span>
              <span class="w-1 h-1 bg-neutral-600 rounded-full"></span>
              <span class="truncate max-w-[300px]">${item.description}</span>
            </div>
          </div>
          <div class="flex items-center justify-between sm:justify-end gap-6 sm:min-w-[300px] border-t sm:border-t-0 border-neutral-800 pt-3 sm:pt-0 mt-2 sm:mt-0">
            <div class="text-right">
              <div class="text-[10px] font-bold text-neutral-500 line-through decoration-red-600">${formattedListPrice}</div>
              <div class="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-yellow-400 tracking-tighter pb-1 pr-1 inline-block">${formattedPrice}</div>
            </div>
            ${adminButtons}
          </div>
        </div>`;
    }
  }).join('');
}

// --- Modal de Kit (Admin) ---
const modal = document.getElementById('modal-overlay');

function openModalById(itemId) {
  const item = state.data.find(k => String(k.id) === String(itemId));
  if (item) openModal(item);
}

function openModal(item = null) {
  modal.classList.remove('hidden');
  if (item) {
    document.getElementById('modal-title').innerText     = 'EDITAR OFERTA';
    document.getElementById('form-id').value             = item.id;
    document.getElementById('form-name').value           = item.name;
    document.getElementById('form-brand').value          = item.brand;
    document.getElementById('form-power').value          = item.power;
    document.getElementById('form-price').value          = item.price;
    document.getElementById('form-listPrice').value      = item.list_price;
    document.getElementById('form-type').value           = item.type;
    document.getElementById('form-tag').value            = item.tag;
  } else {
    document.getElementById('modal-title').innerText = 'NOVA OFERTA';
    document.getElementById('product-form').reset();
    document.getElementById('form-id').value = '';
  }
}

function closeModal() {
  modal.classList.add('hidden');
}

document.getElementById('product-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id      = document.getElementById('form-id').value;
  const btnSave = document.getElementById('btn-save-modal');
  btnSave.innerHTML = 'SALVANDO...';

  const productData = {
    categoria:  state.activeTab === 'clientes' ? 'kitsInversor' : state.activeTab,
    name:       document.getElementById('form-name').value.toUpperCase(),
    brand:      document.getElementById('form-brand').value.toUpperCase(),
    power:      Number(document.getElementById('form-power').value),
    price:      Number(document.getElementById('form-price').value),
    list_price: Number(document.getElementById('form-listPrice').value),
    type:       document.getElementById('form-type').value,
    tag:        document.getElementById('form-tag').value,
    description:document.getElementById('form-power').value + 'kWp - ' + document.getElementById('form-brand').value.toUpperCase()
  };

  if (id) {
    await supabaseClient.from('produtos').update(productData).eq('id', id);
  } else {
    await supabaseClient.from('produtos').insert([productData]);
  }

  await fetchProducts();
  closeModal();
  showToast('OFERTA SALVA COM SUCESSO');
  btnSave.innerHTML = 'SALVAR OFERTA';
  renderContent();
});

async function deleteItem(id) {
  if (confirm('TEM CERTEZA? ESSA AÇÃO NÃO PODE SER DESFEITA.')) {
    await supabaseClient.from('produtos').delete().eq('id', id);
    await fetchProducts();
    showToast('ITEM REMOVIDO');
    renderContent();
  }
}

function toggleAdminMode() {
  state.isEditMode = !state.isEditMode;
  document.getElementById('admin-toggle-btn').className = state.isEditMode
    ? 'p-3 border transition-all duration-300 bg-red-600 border-red-500 text-white animate-pulse'
    : 'p-3 border transition-all duration-300 bg-black border-neutral-800 text-neutral-500 hover:text-white hover:border-white';
  renderContent();
}
