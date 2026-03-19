-- ============================================================
-- MIGRAÇÃO: HSP POR FRANQUIA + GERAÇÃO ESTIMADA NA PROPOSTA
-- Pré-requisito: supabase_multifranquia.sql já executado.
-- Execute este arquivo INTEIRO no Supabase SQL Editor.
-- ============================================================


-- ============================================================
-- PASSO 1: Adicionar hsp_medio na tabela franquias
-- hsp_medio = Horas de Sol Pleno médias/dia (fonte: CRESESB)
-- ============================================================
ALTER TABLE franquias
  ADD COLUMN IF NOT EXISTS hsp_medio numeric NOT NULL DEFAULT 5.4;

-- Araçatuba-SP
UPDATE franquias
SET hsp_medio = 5.4
WHERE nome = 'Ágil Solar Matriz';

-- São José dos Campos-SP
UPDATE franquias
SET hsp_medio = 4.9
WHERE nome = 'Ágil Solar São José dos Campos';


-- ============================================================
-- PASSO 2: Adicionar geracao_estimada na tabela propostas
-- Salva o valor calculado no momento da criação (imutável)
-- ============================================================
ALTER TABLE propostas
  ADD COLUMN IF NOT EXISTS geracao_estimada numeric;


-- ============================================================
-- VERIFICAÇÃO
-- ============================================================
/*
SELECT nome, cidade, hsp_medio FROM franquias ORDER BY created_at;
SELECT COUNT(*) FROM propostas WHERE geracao_estimada IS NOT NULL;
*/
