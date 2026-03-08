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
  pbCategory: 'kitsInversor',
  pbSearch: '',
  pbViewMode: 'list',
  pbMainTab: 'kits',        // 'kits' | 'financiamento' | 'historico'

  vendas: []                // Vendas fechadas
};

const TABS = [
  { id: 'dashboard', label: 'DASHBOARD',      icon: 'layout-dashboard' },
  { id: 'clientes',  label: 'MEUS CLIENTES',  icon: 'users' },
  { id: 'vendas',    label: 'VENDAS',         icon: 'trophy' }
];
