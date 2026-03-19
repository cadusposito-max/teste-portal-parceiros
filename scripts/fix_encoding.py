# -*- coding: utf-8 -*-
import os

base = r'g:\Meu Drive\Sites\Projetos Sites\teste\site-agilsolar-parceiros-test\assets\js'
pb_file     = os.path.join(base, 'proposta-builder.js')
config_file = os.path.join(base, 'config.js')

# proposta-builder.js: 0-based line indices mapped to correct replacement text
pb_replacements = {
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
}

# config.js: 0-based line indices mapped to correct replacement text
config_replacements = {
    1:  "// CONFIGURAÇÃO SUPABASE + ESTADO GLOBAL",
    9:  "// --- CONSTANTES DE NEGÓCIO ---",
    11: "const SESSION_TIMEOUT_HOURS = 6;      // Logout automático após N horas sem atividade",
    13: "const LOGIN_LOCKOUT_SECONDS = 30;     // Segundos de bloqueio após exceder tentativas",
    15: "// --- ESTADO GLOBAL DA APLICAÇÃO ---",
    27: "  clienteSort:   'recent',  // Ordenação: 'recent' | 'alpha'",
    47: "  vendasPeriod: '',         // Período filtro vendas: '' = mês atual, 'all' = geral, 'YYYY-MM' = mês específico",
    48: "  dashPeriod:   '',         // Período filtro dashboard (mesmas regras)",
}


def fix_file(filepath, replacements):
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        lines = f.readlines()
    changed = 0
    for idx, new_line in replacements.items():
        if idx < len(lines):
            orig = lines[idx]
            ending = '\r\n' if orig.endswith('\r\n') else '\n'
            lines[idx] = new_line + ending
            changed += 1
        else:
            print(f'  WARNING: index {idx} out of range (file has {len(lines)} lines)')
    with open(filepath, 'w', encoding='utf-8', newline='') as f:
        f.writelines(lines)
    print(f'Fixed {changed} lines in {os.path.basename(filepath)}')


fix_file(pb_file, pb_replacements)
fix_file(config_file, config_replacements)
print('All done!')
