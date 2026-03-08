// ==========================================
// BUSCA DE DADOS (Supabase)
// ==========================================

async function fetchProducts() {
  const { data, error } = await supabaseClient
    .from('produtos')
    .select('*')
    .order('power', { ascending: true });

  if (!error) state.data = data || [];
}

async function fetchClientes() {
  if (!state.currentUser) return;
  const { data, error } = await supabaseClient
    .from('clientes')
    .select('*')
    .eq('vendedor_email', state.currentUser.email)
    .order('created_at', { ascending: false });
  if (!error) state.clientes = data || [];
}

async function fetchPropostas() {
  if (!state.currentUser) return;
  const { data, error } = await supabaseClient
    .from('propostas')
    .select('*')
    .eq('vendedor_email', state.currentUser.email)
    .order('created_at', { ascending: false });
  if (!error) state.propostas = data || [];
}

async function fetchVendas() {
  if (!state.currentUser) return;
  const { data, error } = await supabaseClient
    .from('vendas')
    .select('*')
    .eq('vendedor_email', state.currentUser.email)
    .order('created_at', { ascending: false });
  // Só atualiza o state se não houver erro — tabela pode não existir ainda
  if (!error) state.vendas = data || [];
  // Não propaga o erro para não quebrar o login/init enquanto tabela não foi criada
}
