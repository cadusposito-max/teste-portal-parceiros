// ==========================================
// CONFIGURAÇÃO SUPABASE + ESTADO GLOBAL
// ==========================================

const SUPABASE_URL = 'https://tzwjxgprhorqrmpqudgg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6d2p4Z3ByaG9ycXJtcHF1ZGdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMjczNTksImV4cCI6MjA4NzcwMzM1OX0.hwfzCb9FGVXX7Uf0pY7zFS6SZHrh0pzWk1gKFVq2DX4';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- CONSTANTES DE NEGÓCIO ---
const COMISSAO_POR_VENDA    = 2500;   // R$ por venda fechada (alterar conforme acordo)
const SESSION_TIMEOUT_HOURS = 6;      // Logout automático após N horas sem atividade
const MAX_LOGIN_ATTEMPTS    = 3;      // Tentativas antes de bloquear login
const LOGIN_LOCKOUT_SECONDS = 30;     // Segundos de bloqueio após exceder tentativas

// --- ESTADO GLOBAL DA APLICAÇÃO ---
let state = {
  data: [],
  clientes: [],
  propostas: [],
  activeTab: 'dashboard',
  searchTerm: '',
  viewMode: 'grid',
  isEditMode: false,
  currentUser: null,

  clienteFilter: 'TODOS',   // Filtro de status na aba clientes
  clienteSort:   'recent',  // Ordenação: 'recent' | 'alpha'

  pbActiveClient: null,
  pbProposalMode: 'PROMOCIONAL', // 'PROMOCIONAL' | 'PERSONALIZADA' (EQUIPAMENTOS legado)
  pbCategory: 'kitsInversor',
  pbSearch: '',
  pbViewMode: 'list',
  pbMainTab: 'kits',        // 'kits' | 'financiamento' | 'historico'
  componentes: [],           // módulos e inversores (sem preço)
  pbEquipDraft: {
    descricao:      '',       // Descricao da proposta personalizada
    valorEquip:     '',       // Valor numerico da proposta (R$)
    potencia:       '',       // Potencia do sistema (kWp)
    paymentNote:    '',
    commercialNote: '',
  },

  vendas: [],               // Vendas fechadas
  vendasPeriod: '',         // Período filtro vendas: '' = mês atual, 'all' = geral, 'YYYY-MM' = mês específico
  dashPeriod:   '',         // Período filtro dashboard (mesmas regras)
  dashComunicadosPage: 0,     // Paginacao do bloco de comunicados na home
  dashComunicadoModalOpen: false,
  dashComunicadoModalId: null,

  isAdmin:      false,      // Usuário com role:admin no app_metadata (detectado via JWT)
  adminSection: 'produtos', // Sub-aba ativa no painel admin
  adminComunicadosSearch: '',
  adminComunicadosStatus: 'all',
  adminKitsFranquia: null,  // Franquia selecionada na aba KITS do admin (null = não iniciado)
  adminViewAll: true,       // Admin: true = ver tudo (consolidado), false = ver só própria franquia
  gestorViewAll: true,      // Gestor: true = ver toda a unidade, false = ver só os próprios clientes

  // Multi-franquia
  franquiaId:   null,       // UUID da franquia do usuário logado (de app_metadata.franquia_id)
  franquiaNome: '',         // Nome da franquia (carregado no boot)

  comissaoPct:  5,          // % de comissão do vendedor logado (carregado de vendedores_stats)

  // Perfil do usuário (carregado de profiles no login)
  profile: {
    nome:       '',
    telefone:   '',
    avatar_url: '',
  },

  // Chat interno
  chat: {
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
    profileCardOpen: false,
  },
};

const TABS = [
  { id: 'dashboard', label: 'DASHBOARD',      icon: 'layout-dashboard' },
  { id: 'clientes',  label: 'MEUS CLIENTES',  icon: 'users' },
  { id: 'vendas',    label: 'VENDAS',         icon: 'trophy'          },
  { id: 'materiais', label: 'MATERIAIS',       icon: 'library'         },
];

// URL do Web App do Google Apps Script (ver scripts/gas_materiais.js).
// Deixe vazio ('') para usar dados mockados localmente.
const MATERIAIS_API_URL = 'https://script.google.com/macros/s/AKfycbzXY5YiEgUrXX4E1CsHWoDHRRqZMomTPzbNaY8M8CljI3MRneF6LT5bORvKj2VbiUZGMQ/exec'; // Cole aqui a URL do deploy do Google Apps Script









