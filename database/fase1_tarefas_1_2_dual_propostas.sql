-- ==========================================
-- FASE 1 (Tarefas 1 e 2) - Base do dual de propostas
-- Objetivo: manter o fluxo promocional atual e preparar o banco
-- para convivência com proposta personalizada.
--
-- ATENCAO:
-- 1) Revise em staging antes de aplicar em producao.
-- 2) Este script NAO remove/alterar campos atuais usados pelo fluxo promocional.
-- ==========================================

-- ------------------------------------------
-- AUDITORIA ANTES
-- ------------------------------------------
-- Verificar estrutura atual da tabela propostas
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'propostas'
-- order by ordinal_position;

BEGIN;

-- ------------------------------------------
-- TAREFA 1: colunas base para dual mode
-- ------------------------------------------
ALTER TABLE public.propostas
  ADD COLUMN IF NOT EXISTS proposal_mode text,
  ADD COLUMN IF NOT EXISTS custom_config jsonb,
  ADD COLUMN IF NOT EXISTS custom_totals jsonb,
  ADD COLUMN IF NOT EXISTS source_product_id uuid;

COMMENT ON COLUMN public.propostas.proposal_mode IS
  'Modo da proposta: PROMOCIONAL (padrao) ou PERSONALIZADA.';
COMMENT ON COLUMN public.propostas.custom_config IS
  'Configuracoes do modo personalizado (Fase 1: estrutura inicial).';
COMMENT ON COLUMN public.propostas.custom_totals IS
  'Totais calculados da proposta personalizada (Fase 1: estrutura inicial).';
COMMENT ON COLUMN public.propostas.source_product_id IS
  'Kit base utilizado para proposta (quando aplicavel).';

-- Retrocompatibilidade: propostas antigas viram PROMOCIONAL
UPDATE public.propostas
SET proposal_mode = 'PROMOCIONAL'
WHERE proposal_mode IS NULL;

ALTER TABLE public.propostas
  ALTER COLUMN proposal_mode SET DEFAULT 'PROMOCIONAL';

ALTER TABLE public.propostas
  ALTER COLUMN proposal_mode SET NOT NULL;

-- ------------------------------------------
-- TAREFA 2: consistencia minima do modo
-- ------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_propostas_proposal_mode'
      AND conrelid = 'public.propostas'::regclass
  ) THEN
    ALTER TABLE public.propostas
      ADD CONSTRAINT chk_propostas_proposal_mode
      CHECK (proposal_mode IN ('PROMOCIONAL', 'PERSONALIZADA'));
  END IF;
END $$;

COMMIT;

-- Indice opcional para listagens/filtros por modo
CREATE INDEX IF NOT EXISTS idx_propostas_proposal_mode
  ON public.propostas (proposal_mode);

-- ------------------------------------------
-- AUDITORIA DEPOIS
-- ------------------------------------------
-- 1) Conferir defaults e nulabilidade
-- select column_name, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'propostas'
--   and column_name in ('proposal_mode','custom_config','custom_totals','source_product_id')
-- order by column_name;

-- 2) Conferir distribuicao atual por modo
-- select proposal_mode, count(*)
-- from public.propostas
-- group by proposal_mode
-- order by proposal_mode;

-- 3) Conferir constraint
-- select conname, pg_get_constraintdef(c.oid) as definition
-- from pg_constraint c
-- where conname = 'chk_propostas_proposal_mode';
