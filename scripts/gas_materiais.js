/**
 * ============================================================
 * Google Apps Script — Materiais Úteis (Biblioteca de Arquivos)
 * ============================================================
 *
 * COMO USAR:
 * 1. Abra script.google.com e crie um novo projeto
 * 2. Cole este código substituindo o conteúdo padrão
 * 3. Preencha PASTA_RAIZ_ID com o ID da sua pasta do Drive
 *    (o ID fica na URL do Drive: drive.google.com/drive/folders/SEU_ID_AQUI)
 * 4. Clique em "Implantar" > "Nova implantação"
 *    - Tipo: Aplicativo Web
 *    - Executar como: Eu (meu e-mail)
 *    - Quem pode acessar: Qualquer pessoa
 * 5. Copie a URL gerada e cole em MATERIAIS_API_URL no config.js
 *
 * ESTRUTURA RECOMENDADA DE PASTAS NO DRIVE:
 *   📁 Ágil Solar - Materiais  ← esta pasta (cole o ID dela)
 *     📁 Apresentações
 *         📄 Apresentação Ágil Solar.pdf
 *     📁 Financeiro
 *         📄 Tabela de Juros Março 2026.xlsx
 *     📁 Técnico
 *         📄 Ficha Técnica de Inversores.pdf
 *     📁 Treinamento
 *         📄 Script de Abordagem.docx
 *     📁 Comercial
 *         📄 Catálogo de Kits 2026.pdf
 *
 * FORMATO DE RESPOSTA JSON:
 * {
 *   "ok": true,
 *   "items": [
 *     {
 *       "id":           "ID do arquivo no Drive",
 *       "nome":         "Nome sem extensão",
 *       "categoria":    "Nome da subpasta",
 *       "tipo":         "pdf" | "xlsx" | "docx" | "pptx" | ...,
 *       "tamanho":      "2.4 MB",
 *       "atualizadoEm": "2026-03-15",
 *       "descricao":    "",          // preenchimento manual futuro
 *       "viewUrl":      "https://drive.google.com/file/d/ID/view",
 *       "downloadUrl":  "https://drive.google.com/uc?export=download&id=ID"
 *     }
 *   ]
 * }
 * ============================================================
 */

// ── CONFIGURAÇÃO — preencha antes do deploy ──────────────────
var PASTA_RAIZ_ID = 'SEU_FOLDER_ID_AQUI';
// ─────────────────────────────────────────────────────────────

/**
 * Entry point do Web App — responde a requisições GET.
 * O front-end chama: fetch(MATERIAIS_API_URL)
 */
function doGet(e) {
  var output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);

  try {
    if (PASTA_RAIZ_ID === 'SEU_FOLDER_ID_AQUI') {
      throw new Error('PASTA_RAIZ_ID não foi configurado. Edite o script e faça um novo deploy.');
    }
    var items = listarArquivos_();
    output.setContent(JSON.stringify({ ok: true, items: items }));
  } catch (err) {
    output.setContent(JSON.stringify({ ok: false, erro: err.message }));
  }

  return output;
}

/**
 * Percorre todas as subpastas da pasta raiz e retorna um array
 * plano de arquivos com seus metadados.
 */
function listarArquivos_() {
  var resultado = [];
  var raiz      = DriveApp.getFolderById(PASTA_RAIZ_ID);
  var subpastas = raiz.getFolders();

  while (subpastas.hasNext()) {
    var pasta     = subpastas.next();
    var categoria = pasta.getName();
    var arquivos  = pasta.getFiles();

    while (arquivos.hasNext()) {
      var arquivo  = arquivos.next();
      var id       = arquivo.getId();
      var nomeRaw  = arquivo.getName();
      // Remove extensão conhecida do nome de exibição
      var nome     = nomeRaw.replace(/\.(pdf|xlsx|xls|csv|docx|doc|pptx|ppt|jpg|jpeg|png|zip)$/i, '');
      var mime     = arquivo.getMimeType();
      var tipo     = mimeParaTipo_(mime);
      var tamanho  = formatarTamanho_(arquivo.getSize());
      var atualizado = Utilities.formatDate(
        arquivo.getLastUpdated(),
        Session.getScriptTimeZone(),
        'yyyy-MM-dd'
      );

      resultado.push({
        id:          id,
        nome:        nome,
        categoria:   categoria,
        tipo:        tipo,
        tamanho:     tamanho,
        atualizadoEm: atualizado,
        descricao:   '',
        viewUrl:     'https://drive.google.com/file/d/' + id + '/view',
        downloadUrl: 'https://drive.google.com/uc?export=download&id=' + id
      });
    }
  }

  // Ordena: por categoria e depois por nome
  resultado.sort(function(a, b) {
    if (a.categoria < b.categoria) return -1;
    if (a.categoria > b.categoria) return 1;
    if (a.nome < b.nome) return -1;
    if (a.nome > b.nome) return 1;
    return 0;
  });

  return resultado;
}

/**
 * Converte MIME type do Drive para string de tipo curto (pdf, xlsx, ...).
 */
function mimeParaTipo_(mime) {
  var map = {
    'application/pdf':                                                          'pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':       'xlsx',
    'application/vnd.ms-excel':                                                 'xls',
    'text/csv':                                                                 'csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/msword':                                                       'doc',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/vnd.ms-powerpoint':                                            'ppt',
    'image/jpeg':                                                               'jpg',
    'image/png':                                                                'png',
    'application/zip':                                                          'zip',
    // Google Workspace Editors — export automático
    'application/vnd.google-apps.presentation':                                'pptx',
    'application/vnd.google-apps.spreadsheet':                                 'xlsx',
    'application/vnd.google-apps.document':                                    'docx',
  };
  return map[mime] || 'pdf';
}

/**
 * Converte bytes para string legível (KB / MB).
 */
function formatarTamanho_(bytes) {
  if (!bytes || bytes === 0) return '—';
  if (bytes < 1024)             return bytes + ' B';
  if (bytes < 1024 * 1024)      return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
