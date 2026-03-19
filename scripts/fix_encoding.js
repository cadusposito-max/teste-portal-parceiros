// fix_encoding.js - Node.js script to fix corrupted lines in JS files
const fs   = require('fs');
const path = require('path');

const base = String.raw`g:\Meu Drive\Sites\Projetos Sites\teste\site-agilsolar-parceiros-test\assets\js`;
const pbFile     = path.join(base, 'proposta-builder.js');
const configFile = path.join(base, 'config.js');

// proposta-builder.js: 0-based line indices => correct replacement text
const pbReplacements = {
  826: "    console.error('Erro na geração da proposta personalizada:', err);",
  840: "  // Pode ser chamado dos cards (clientId presente) ou do botão dentro do modal de proposta",
  846: "    showToast('Cliente não encontrado. Atualize a página.');",
  855: "  // Popula o select com os kits do catálogo",
  857: "  select.innerHTML = '<option value=\"\">» SELECIONE O KIT «</option>';",
  859: "  // Adiciona kits do catálogo + propostas do cliente como opções",
  864: "  // Se tem propostas, exibe só elas; caso contrário exibe todos os kits",
  871: "      opt.textContent = `${p.kit_nome} → ${formatCurrency(p.kit_price)}`;",
  878: "  groupAll.label = clientPropostas.length > 0 ? 'Todos os Kits do Catálogo' : 'Kits do Catálogo';",
  882: "    opt.textContent = `${k.name} → ${formatCurrency(k.price)}`;",
  903: "    document.getElementById('fv-kit-power').innerText = kit.power ? `${kit.power} kWp` : 'N/A';",
  931: "    errEl.innerText = 'Sessão expirada. Recarregue a página.';",
  958: "      // Erro mais legível para tabela não existente",
  960: "        ? 'Tabela \"vendas\" não encontrada no Supabase. Execute o SQL de criação.'",
  975: "    showToast(`🎉 VENDA FECHADA! ${kit.nome}`);",
  983: "    // Garante que o botão SEMPRE volta ao estado original",
};

// config.js: 0-based line indices => correct replacement text
const configReplacements = {
  1:  "// CONFIGURAÇÃO SUPABASE + ESTADO GLOBAL",
  9:  "// --- CONSTANTES DE NEGÓCIO ---",
  11: "const SESSION_TIMEOUT_HOURS = 6;      // Logout automático após N horas sem atividade",
  13: "const LOGIN_LOCKOUT_SECONDS = 30;     // Segundos de bloqueio após exceder tentativas",
  15: "// --- ESTADO GLOBAL DA APLICAÇÃO ---",
  27: "  clienteSort:   'recent',  // Ordenação: 'recent' | 'alpha'",
  47: "  vendasPeriod: '',         // Período filtro vendas: '' = mês atual, 'all' = geral, 'YYYY-MM' = mês específico",
  48: "  dashPeriod:   '',         // Período filtro dashboard (mesmas regras)",
};

function fixFile(filepath, replacements) {
  const raw   = fs.readFileSync(filepath, 'utf8');
  const lines = raw.split('\n');        // split on LF; \r stays in each line if CRLF
  let changed = 0;

  for (const [idxStr, newLine] of Object.entries(replacements)) {
    const idx = Number(idxStr);
    if (idx >= lines.length) {
      console.warn(`  WARNING: index ${idx} out of range (file has ${lines.length} lines)`);
      continue;
    }
    // Preserve the trailing \r if original line had CRLF
    const hasCR = lines[idx].endsWith('\r');
    lines[idx]  = newLine + (hasCR ? '\r' : '');
    changed++;
  }

  fs.writeFileSync(filepath, lines.join('\n'), 'utf8');
  console.log(`Fixed ${changed} lines in ${path.basename(filepath)}`);
}

fixFile(pbFile,     pbReplacements);
fixFile(configFile, configReplacements);
console.log('All done!');
