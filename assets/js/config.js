// ==========================================
// CONFIGURACAO SUPABASE + ESTADO GLOBAL
// ==========================================

const SUPABASE_URL = 'https://tzwjxgprhorqrmpqudgg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6d2p4Z3ByaG9ycXJtcHF1ZGdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMjczNTksImV4cCI6MjA4NzcwMzM1OX0.hwfzCb9FGVXX7Uf0pY7zFS6SZHrh0pzWk1gKFVq2DX4';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- CONSTANTES DE NEGOCIO ---
const COMISSAO_POR_VENDA    = 2500;   // R$ por venda fechada (alterar conforme acordo)
const SESSION_TIMEOUT_HOURS = 6;      // Logout automatico apos N horas sem atividade
const MAX_LOGIN_ATTEMPTS    = 3;      // Tentativas antes de bloquear login
const LOGIN_LOCKOUT_SECONDS = 30;     // Segundos de bloqueio apos exceder tentativas
const TURNSTILE_SITE_KEY    = '0x4AAAAAACyD0uPARxpOHPqH'; // Cloudflare Turnstile Site Key (publica, seguro expor)

function createInitialChatState() {
  return {
    initialized: false,
    hasAccess: false,
    isOpen: false,
    isMobile: false,
    mobileView: 'list', // 'list' | 'thread'
    loadingConversations: false,
    loadingMessages: false,
    conversations: [],
    activeConversationId: null,
    activeConversation: null,
    activeConversationTitle: '',
    messages: [],
    unreadTotal: 0,
    directory: [],
    searchTerm: '',
    directorySearch: '',
    conversationChannel: null,
    threadChannel: null,
    pollTimer: null,
    profileCardOpen: false,
  };
}

function createInitialState() {
  return {
    data: [],
    clientes: [],
    propostas: [],
    vendas: [],
    franquiasCatalog: [],

    activeTab: 'dashboard',
    searchTerm: '',
    viewMode: 'grid',
    isEditMode: false,
    currentUser: null,
    currentAal: null,

    // Clientes
    clienteFilter: 'TODOS',   // Filtro de status na aba clientes (vendedor/gestor)
    clienteSort:   'recent',  // Ordenacao: 'recent' | 'alpha' (vendedor/gestor)
    adminClientesViewMode: 'list', // 'list' | 'kanban'
    adminClientesFilters: {
      search: '',
      status: 'TODOS',
      vendedor_email: 'all',
      franquia_id: 'all',
      cidade: 'all',
      mes: 'all',
      preset: 'all',
    },

    // Proposta builder
    pbActiveClient: null,
    pbProposalMode: 'PROMOCIONAL', // 'PROMOCIONAL' | 'PERSONALIZADA' (EQUIPAMENTOS legado)
    pbCategory: 'kitsInversor',
    pbSearch: '',
    pbViewMode: 'list',
    pbMainTab: 'kits',        // 'kits' | 'financiamento' | 'historico'
    componentes: [],          // modulos e inversores (sem preco)
    pbEquipDraft: {
      descricao:      '',
      valorEquip:     '',
      potencia:       '',
      paymentNote:    '',
      commercialNote: '',
    },

    // Vendas / dashboard
    vendasPeriod: '',         // Filtro de periodo legado para vendedor/gestor
    adminVendasFilters: {
      search: '',
      vendedor_email: 'all',
      franquia_id: 'all',
      period: 'all', // 'all' | 'today' | 'month' | '30d' | 'YYYY-MM'
      min_price: '',
      max_price: '',
      sort: 'recent', // 'recent' | 'oldest' | 'value_desc' | 'value_asc'
      preset: 'all',
    },
    dashPeriod: '',           // Periodo filtro dashboard (legado)
    dashComunicadosPage: 0,
    dashComunicadoModalOpen: false,
    dashComunicadoModalId: null,

    // Permissoes
    isAdmin: false,
    isGestor: false,

    // Admin
    adminSection: 'produtos',
    adminComunicadosSearch: '',
    adminComunicadosStatus: 'all',
    adminKitsFranquia: null,
    adminScopeFranquiaId: 'all', // Drill-down global quando adminViewAll = true
    adminViewAll: true,          // true = consolidado | false = minha unidade (franquia)
    adminPrefsLoaded: false,

    // Gestor
    gestorViewAll: true,      // true = unidade inteira | false = apenas carteira propria

    // Multi-franquia
    franquiaId: null,
    franquiaNome: '',
    franquiaHsp: 5.4,

    // Indicadores pessoais
    comissaoPct: 5,

    // Perfil
    profile: {
      nome: '',
      telefone: '',
      avatar_url: '',
    },

    // Resultados filtrados para exportacao respeitar UI
    lastFilteredClientes: [],
    lastFilteredVendas: [],

    // Chat interno
    chat: createInitialChatState(),
  };
}

function replaceStateSnapshot(nextState) {
  if (!nextState || typeof nextState !== 'object') return;

  Object.keys(state).forEach((key) => {
    delete state[key];
  });

  Object.assign(state, nextState);
}

function decodeSessionJwtClaims(session) {
  const token = session?.access_token || '';
  if (!token) return {};

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return {};

    const normalized = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=');

    return JSON.parse(atob(normalized));
  } catch (_) {
    return {};
  }
}

function applySessionIdentity(session) {
  const user = session?.user || null;
  const appMeta = user?.app_metadata || {};
  const claims = decodeSessionJwtClaims(session);

  state.currentUser = user;
  state.isAdmin = appMeta.role === 'admin';
  state.isGestor = appMeta.role === 'gestor';
  state.franquiaId = appMeta.franquia_id || null;
  state.currentAal = claims.aal || null;
  state.adminPrefsLoaded = false;

  if (state.isAdmin && state.franquiaId && !state.adminKitsFranquia) {
    state.adminKitsFranquia = state.franquiaId;
  }
}

function clearSessionState() {
  replaceStateSnapshot(createInitialState());

  try {
    localStorage.removeItem('admin_qol_prefs_v1');
  } catch (_) {
    // noop
  }

  const adminBtn = document.getElementById('admin-toggle-btn');
  if (adminBtn) adminBtn.classList.add('hidden');

  const headerUser = document.getElementById('header-user');
  if (headerUser) headerUser.classList.replace('flex', 'hidden');

  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';

  const loginError = document.getElementById('login-error');
  if (loginError) {
    loginError.textContent = '';
    loginError.classList.add('hidden');
    loginError.style.color = '';
    loginError.style.borderColor = '';
    loginError.style.background = '';
  }

  const mfaLoginError = document.getElementById('mfa-login-error');
  if (mfaLoginError) {
    mfaLoginError.textContent = '';
    mfaLoginError.classList.add('hidden');
  }

  const mfaSetupError = document.getElementById('mfa-setup-error');
  if (mfaSetupError) {
    mfaSetupError.textContent = '';
    mfaSetupError.classList.add('hidden');
  }

  const screensToHide = ['mfa-step', 'mfa-setup-admin', 'mfa-api-error', 'reset-password-screen'];
  screensToHide.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });

  const loginForm = document.getElementById('login-form');
  if (loginForm) loginForm.classList.remove('hidden');

  const mfaLoginCode = document.getElementById('mfa-login-code');
  if (mfaLoginCode) mfaLoginCode.value = '';

  const mfaSetupCode = document.getElementById('mfa-setup-code');
  if (mfaSetupCode) mfaSetupCode.value = '';

  const mainContainer = document.getElementById('main-container');
  if (mainContainer) mainContainer.innerHTML = '';

  const tabContainer = document.getElementById('tab-container');
  if (tabContainer) tabContainer.innerHTML = '';

  const mobileTabs = document.getElementById('mobile-menu-tabs');
  if (mobileTabs) mobileTabs.innerHTML = '';

  if (typeof chatTeardown === 'function') chatTeardown(true);
}

// --- ESTADO GLOBAL DA APLICACAO ---
let state = createInitialState();

window.createInitialState = createInitialState;
window.clearSessionState = clearSessionState;
window.applySessionIdentity = applySessionIdentity;
window.decodeSessionJwtClaims = decodeSessionJwtClaims;

const TABS = [
  { id: 'dashboard', label: 'DASHBOARD',      icon: 'layout-dashboard' },
  { id: 'clientes',  label: 'MEUS CLIENTES',  icon: 'users' },
  { id: 'vendas',    label: 'VENDAS',         icon: 'trophy' }
];
