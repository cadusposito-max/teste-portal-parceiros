// ==========================================
// APP: ORQUESTRADOR PRINCIPAL
// ==========================================

// --- Relógio ao vivo (Dashboard) ---
let _clockInterval = null;

function startDashboardClock() {
  const tick = () => {
    const el = document.getElementById('dashboard-clock');
    if (!el) return;
    el.textContent = new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  };
  tick();
  _clockInterval = setInterval(tick, 1000);
}

function stopDashboardClock() {
  if (_clockInterval) { clearInterval(_clockInterval); _clockInterval = null; }
}

function toggleMobileMenu() {
  const menu = document.getElementById('mobile-menu');
  const btn  = document.getElementById('hamburger-btn');
  const icon = document.getElementById('hamburger-icon');
  const isOpen = !menu.classList.contains('hidden');
  menu.classList.toggle('hidden', isOpen);
  if (btn) btn.setAttribute('aria-expanded', String(!isOpen));
  if (icon) {
    icon.setAttribute('data-lucide', isOpen ? 'menu' : 'x');
    lucide.createIcons();
  }
}

function closeMobileMenu() {
  const menu = document.getElementById('mobile-menu');
  const btn  = document.getElementById('hamburger-btn');
  const icon = document.getElementById('hamburger-icon');
  if (menu) menu.classList.add('hidden');
  if (btn)  btn.setAttribute('aria-expanded', 'false');
  if (icon) { icon.setAttribute('data-lucide', 'menu'); lucide.createIcons(); }
}

// --- Header User Pill ---
function renderHeaderUser() {
  const firstName = getFirstName();
  const email     = state.currentUser ? state.currentUser.email : '';
  const initial   = firstName ? firstName.charAt(0).toUpperCase()
                  : email.charAt(0).toUpperCase();

  const avatarEl = document.getElementById('header-user-avatar');
  const nameEl   = document.getElementById('header-user-name');
  const wrapEl   = document.getElementById('header-user');

  if (avatarEl) avatarEl.textContent = initial;
  if (nameEl)   nameEl.textContent   = firstName || email.split('@')[0];
  if (wrapEl)   wrapEl.classList.replace('hidden', 'flex');
}

function initSplash() {
  const MESSAGES = [
    'Sincronizando Banco de Dados...',
    'Carregando Catálogo de Kits...',
    'Validando Credenciais...',
    'Preparando Dashboard...',
  ];
  let progress = 0;
  let msgIdx   = 0;
  const percentageEl = document.getElementById('loading-percentage');
  const barEl        = document.getElementById('loading-bar');
  const msgEl        = document.querySelector('#splash-screen .animate-pulse');

  const interval = setInterval(() => {
    progress += Math.floor(Math.random() * 12) + 4;
    if (progress > 100) progress = 100;
    percentageEl.innerText = `${progress}%`;
    barEl.style.width      = `${progress}%`;

    if (progress > 25 && msgIdx === 0) { msgIdx = 1; if (msgEl) msgEl.textContent = MESSAGES[1]; }
    if (progress > 55 && msgIdx === 1) { msgIdx = 2; if (msgEl) msgEl.textContent = MESSAGES[2]; }
    if (progress > 80 && msgIdx === 2) { msgIdx = 3; if (msgEl) msgEl.textContent = MESSAGES[3]; }

    if (progress === 100) {
      clearInterval(interval);
      setTimeout(() => {
        document.getElementById('splash-screen').classList.add('opacity-0', 'pointer-events-none');
        document.getElementById('splash-content').classList.add('scale-110');
        document.getElementById('app-content').classList.remove('opacity-0', 'scale-95', 'hidden');
        document.getElementById('app-content').classList.add('opacity-100', 'scale-100');
        renderHeaderUser();
        renderContent();
      }, 500);
      setTimeout(() => document.getElementById('splash-screen').classList.add('hidden'), 2000);
    }
  }, 95);
}

function renderTabs() {
  const container = document.getElementById('tab-container');
  const mobileNav = document.getElementById('mobile-menu-tabs');

  const desktopHTML = TABS.map(tab => {
    const isActive = state.activeTab === tab.id;
    return `
      <button onclick="setTab('${tab.id}')"
        class="relative flex items-center gap-2 px-5 py-2.5 text-[10px] font-black uppercase tracking-wider transition-all duration-200 whitespace-nowrap
          ${isActive
            ? 'text-black bg-gradient-to-r from-orange-600 to-yellow-500 shadow-[0_0_12px_rgba(234,88,12,0.3)]'
            : 'text-neutral-500 hover:text-neutral-300 bg-transparent'
          }">
        <i data-lucide="${tab.icon}" class="w-3.5 h-3.5 ${isActive ? 'stroke-[3px]' : ''}"></i>
        ${tab.label}
      </button>
    `;
  }).join('');

  container.innerHTML = desktopHTML;

  if (mobileNav) {
    mobileNav.innerHTML = TABS.map(tab => {
      const isActive = state.activeTab === tab.id;
      return `
        <button onclick="setTab('${tab.id}')"
          class="flex items-center gap-3 w-full px-4 py-4 text-sm font-black uppercase tracking-widest transition-all duration-200
            ${isActive
              ? 'bg-gradient-to-r from-orange-600 to-yellow-500 text-black shadow-[inset_0_0_20px_rgba(0,0,0,0.15)]'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900/80 border-l-2 border-transparent hover:border-orange-500/40'
            }">
          <i data-lucide="${tab.icon}" class="w-5 h-5 ${isActive ? 'stroke-[3px]' : ''}"></i>
          <span class="flex-1 text-left">${tab.label}</span>
          ${isActive ? '<i data-lucide="chevron-right" class="w-4 h-4"></i>' : ''}
        </button>
      `;
    }).join('');
  }

  lucide.createIcons();
}

function setTab(tabId) {
  closeMobileMenu();
  stopDashboardClock();
  state.activeTab = tabId;
  renderTabs();
  renderContent();
}

function setViewMode(mode) {
  state.viewMode = mode;
  document.getElementById('btn-grid').className = mode === 'grid'
    ? 'p-3 transition-all bg-gradient-to-r from-orange-600 to-yellow-500 text-black'
    : 'p-3 transition-all text-neutral-600 hover:text-white';
  document.getElementById('btn-list').className = mode === 'list'
    ? 'p-3 transition-all bg-gradient-to-r from-orange-600 to-yellow-500 text-black'
    : 'p-3 transition-all text-neutral-600 hover:text-white';
  renderContent();
}

function renderContent() {
  const container       = document.getElementById('main-container');
  const toggleContainer = document.getElementById('view-toggle-container');
  const adminBar        = document.getElementById('admin-bar');
  const mainToolbar     = document.getElementById('main-toolbar');
  const emptyState      = document.getElementById('empty-state');

  emptyState.classList.add('hidden');

  if (state.activeTab === 'dashboard') {
    mainToolbar.classList.add('hidden');
    toggleContainer.classList.add('hidden');
    if (adminBar) adminBar.classList.add('hidden');
    renderDashboard(container);
  } else if (state.activeTab === 'clientes') {
    stopDashboardClock();
    mainToolbar.classList.remove('hidden');
    toggleContainer.classList.add('hidden');
    if (adminBar) adminBar.classList.add('hidden');
    renderClientesList(container);
  } else if (state.activeTab === 'vendas') {
    stopDashboardClock();
    mainToolbar.classList.add('hidden');
    toggleContainer.classList.add('hidden');
    if (adminBar) adminBar.classList.add('hidden');
    renderVendas(container);
  } else {
    stopDashboardClock();
    if (!state.isEditMode) {
      mainToolbar.classList.add('hidden');
    } else {
      mainToolbar.classList.remove('hidden');
      toggleContainer.classList.remove('hidden');
      if (adminBar) adminBar.classList.remove('hidden');
    }
    renderProductsList(container);
  }
  lucide.createIcons();
}

// --- Event Listeners Globais ---
document.getElementById('search-input').addEventListener('input', (e) => {
  state.searchTerm = e.target.value;
  renderContent();
});

document.getElementById('client-telefone').addEventListener('input', formatarTelefone);

// --- Inicialização ---
lucide.createIcons();
checkAuth();
