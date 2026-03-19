import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const BASE = String.raw`g:\Meu Drive\Sites\Projetos Sites\teste\site-agilsolar-parceiros-test\assets\js`;

// Ordenado do mais longo para o mais curto para evitar substituições parciais
const FIXES = [
  // Sequências de 3 chars (3-byte UTF-8 mal lidos via cp1252)
  ['â€"', '—'],
  ['â€¢', '•'],
  ['â€™', '\u2019'],
  ['â€œ', '\u201C'],
  ['â€¦', '…'],
  // Maiúsculas (capital letters) - mais longas primeiro
  ['Ã‡Ãƒ', 'ÇÃ'],   // ÇÃ junto (NEGOCIAÇÃO = ...CIAÇÃ+O)
  ['Ã‡',   'Ç'],
  ['Ãƒ',   'Ã'],
  ['Ã‰',   'É'],
  ['Ã"',   'Ó'],
  ['Ãš',   'Ú'],    // Ú — cobre "Último"
  // Minúsculas
  ['Ã§',   'ç'],
  ['Ã£',   'ã'],
  ['Ã¡',   'á'],
  ['Ã©',   'é'],
  ['Ã³',   'ó'],
  ['Ãº',   'ú'],
  ['Ã­',   'í'],
  ['Ã ',   'à'],
  ['Ãª',   'ê'],
  ['Ã´',   'ô'],
  // Outros
  ['Â·',   '·'],
  ['Â©',   '©'],
  ['Â»',   '»'],
  ['Â«',   '«'],
  // Casos especiais que não são cobertos pelas regras acima
  ['CONCLUÃDA',    'CONCLUÍDA'],
  ['EXPORTAÃ‡ÃƒO', 'EXPORTAÇÃO'],
];

const FILES = ['admin.js', 'clientes.js', 'proposta-builder.js', 'api.js'];

for (const fname of FILES) {
  const path = join(BASE, fname);
  let content = readFileSync(path, 'utf8');
  const original = content;

  for (const [wrong, correct] of FIXES) {
    content = content.replaceAll(wrong, correct);
  }

  if (content !== original) {
    writeFileSync(path, content, 'utf8');
    console.log(`[OK] ${fname} — corrigido`);
  } else {
    console.log(`[--] ${fname} — sem alterações`);
  }
}

console.log('Concluído!');
