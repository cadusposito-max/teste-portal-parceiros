# -*- coding: utf-8 -*-
"""
Corrige mojibake (texto com encoding quebrado) nos arquivos JS.
Substitui sequências UTF-8 mal codificadas pelos caracteres portugueses corretos.
"""
import os

BASE = r'g:\Meu Drive\Sites\Projetos Sites\teste\site-agilsolar-parceiros-test\assets\js'

# Mapeamento: texto errado (mojibake) -> texto correto
# Ordenado do mais longo para o mais curto para evitar substituições parciais
FIXES = [
    # Sequências de 3 chars (chars Unicode de 3 bytes UTF-8 mal lidos via cp1252)
    ('â€"',  '—'),   # em dash (—)
    ('â€¢',  '•'),   # bullet (•)
    ('â€™',  '\u2019'),  # aspas simples direita (')
    ('â€œ',  '\u201C'),  # aspas duplas esquerda (")
    ('â€ ',  '\u2020'),  # dagger (†)
    ('â€¦',  '…'),   # reticências (…)
    # Sequências de 2 chars (chars Unicode de 2 bytes UTF-8 mal lidos via cp1252)
    # Maiúsculas com acento/cedilha (capital letters)
    ('Ã‡Ãƒ', 'ÇÃ'),  # ÇÃ junto (em NEGOCIAÇÃO: ...CIAÇÃ + O)
    ('Ã‡',   'Ç'),   # Ç maiúsculo
    ('Ãƒ',   'Ã'),   # Ã (A til maiúsculo)
    ('Ã‰',   'É'),   # É
    ('Ã"',   'Ó'),   # Ó
    ('Ãš',   'Ú'),   # Ú (cobre: Último)
    ('Ã',   'Á'),   # Á — DEVE VIR POR ÚLTIMO entre as maiúsculas
    # Minúsculas com acento/cedilha (lowercase)
    ('Ã§',   'ç'),   # ç
    ('Ã£',   'ã'),   # ã
    ('Ã¡',   'á'),   # á
    ('Ã©',   'é'),   # é
    ('Ã³',   'ó'),   # ó
    ('Ãº',   'ú'),   # ú
    ('Ã­',   'í'),   # í
    ('Ã ',   'à'),   # à
    ('Ãª',   'ê'),   # ê
    ('Ã´',   'ô'),   # ô
    # Outros
    ('Â·',   '·'),   # ponto médio (·)
    ('Â©',   '©'),   # copyright (©)
    ('Â®',   '®'),   # registered (®)
    ('Â»',   '»'),   # guillemet direito
    ('Â«',   '«'),   # guillemet esquerdo
    # Sequência especial: CONCLUÍDA (Ã + byte 0x81 que some = ÃDA → ÍDA)
    # Como o 0x81 some, 'CONCLUÃDA' fica 'CONCLUÍDA' após substituir Ã→Í... 
    # mas não há Ã→Í no mapa pois Ã é til. Trata especificamente:
    ('CONCLUÃDA',    'CONCLUÍDA'),
    ('EXPORTAÃ‡ÃƒO', 'EXPORTAÇÃO'),
    # 'NEGOCIAÇÃ' já coberto pela combinação de Ã‡ -> Ç e Ãƒ -> Ã acima
]

# Arquivos a corrigir (os que têm mojibake conforme análise)
TARGET_FILES = [
    'admin.js',
    'clientes.js',
    'proposta-builder.js',
    'api.js',
]

def fix_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content
    for wrong, correct in FIXES:
        content = content.replace(wrong, correct)

    if content != original:
        with open(filepath, 'w', encoding='utf-8', newline='\n') as f:
            f.write(content)
        # Conta ocorrências corrigidas
        diffs = sum(original.count(w) for w, _ in FIXES if w in original)
        print(f'  [OK] {os.path.basename(filepath)} — {diffs} substituição(ões)')
    else:
        print(f'  [--] {os.path.basename(filepath)} — nenhuma alteração necessária')

print('=== Corrigindo mojibake nos arquivos JS ===')
for fname in TARGET_FILES:
    path = os.path.join(BASE, fname)
    if os.path.exists(path):
        fix_file(path)
    else:
        print(f'  [!] Arquivo não encontrado: {fname}')

print('=== Concluído ===')
