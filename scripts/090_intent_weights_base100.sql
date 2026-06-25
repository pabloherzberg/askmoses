-- ============================================================
-- 090_intent_weights_base100.sql
--
-- Metodologia do Intent passa a ser IGUAL ao Rubric: 4 sinais com pesos
-- configuráveis que somam 100% (default 25/25/25/25), em vez da base total=10
-- (4/3/2/1) anterior.
--
-- O Intent Index é INVARIANTE à base dos pesos — computeIntentIndex normaliza
-- por (Σ score·peso)/(Σ peso)/2. Logo pesos 4/3/2/1 (soma 10) e 40/30/20/10
-- (soma 100) produzem exatamente o mesmo índice 0–5. Esta migração NÃO altera
-- nenhum valor de calls.intent.
--
-- O que faz: normaliza COSMETICAMENTE os snapshots de pesos já gravados
-- (org_intent_weight_history.new_weights/old_weights e calls.intent_weights)
-- da base 10 para a base 100, por proporção, para consistência de EXIBIÇÃO
-- (a UI mostra % = peso/total). Snapshots já em base 100 ficam inalterados.
--
-- Idempotente: só reescala linhas cuja soma ainda está ~10 (base antiga).
-- Reexecutar não muda nada (após reescalado, soma vira 100 e o WHERE pula).
-- ============================================================

BEGIN;

-- Helper inline: reescala um JSONB de 4 pesos para somar 100, preservando
-- proporções. Aplicado só quando a soma atual está na faixa da base antiga
-- (entre 1 e ~40), evitando tocar snapshots já em base 100.
-- 1. calls.intent_weights
UPDATE public.calls c
SET intent_weights = jsonb_build_object(
  'financial',  ROUND( (c.intent_weights->>'financial')::numeric  / s.total * 100 ),
  'urgency',    ROUND( (c.intent_weights->>'urgency')::numeric    / s.total * 100 ),
  'authority',  ROUND( (c.intent_weights->>'authority')::numeric  / s.total * 100 ),
  'engagement', ROUND( (c.intent_weights->>'engagement')::numeric / s.total * 100 )
)
FROM (
  SELECT id,
    COALESCE(NULLIF(intent_weights->>'financial','')::numeric,0)
  + COALESCE(NULLIF(intent_weights->>'urgency','')::numeric,0)
  + COALESCE(NULLIF(intent_weights->>'authority','')::numeric,0)
  + COALESCE(NULLIF(intent_weights->>'engagement','')::numeric,0) AS total
  FROM public.calls
  WHERE intent_weights IS NOT NULL
) s
WHERE c.id = s.id
  AND s.total > 0
  AND s.total < 50;  -- só base antiga (≈10); base 100 fica de fora

-- 2. org_intent_weight_history.new_weights
UPDATE public.org_intent_weight_history h
SET new_weights = jsonb_build_object(
  'financial',  ROUND( (h.new_weights->>'financial')::numeric  / s.total * 100 ),
  'urgency',    ROUND( (h.new_weights->>'urgency')::numeric    / s.total * 100 ),
  'authority',  ROUND( (h.new_weights->>'authority')::numeric  / s.total * 100 ),
  'engagement', ROUND( (h.new_weights->>'engagement')::numeric / s.total * 100 )
)
FROM (
  SELECT id,
    COALESCE(NULLIF(new_weights->>'financial','')::numeric,0)
  + COALESCE(NULLIF(new_weights->>'urgency','')::numeric,0)
  + COALESCE(NULLIF(new_weights->>'authority','')::numeric,0)
  + COALESCE(NULLIF(new_weights->>'engagement','')::numeric,0) AS total
  FROM public.org_intent_weight_history
  WHERE new_weights IS NOT NULL
) s
WHERE h.id = s.id
  AND s.total > 0
  AND s.total < 50;

-- 3. org_intent_weight_history.old_weights (mesmo critério; pode ser NULL)
UPDATE public.org_intent_weight_history h
SET old_weights = jsonb_build_object(
  'financial',  ROUND( (h.old_weights->>'financial')::numeric  / s.total * 100 ),
  'urgency',    ROUND( (h.old_weights->>'urgency')::numeric    / s.total * 100 ),
  'authority',  ROUND( (h.old_weights->>'authority')::numeric  / s.total * 100 ),
  'engagement', ROUND( (h.old_weights->>'engagement')::numeric / s.total * 100 )
)
FROM (
  SELECT id,
    COALESCE(NULLIF(old_weights->>'financial','')::numeric,0)
  + COALESCE(NULLIF(old_weights->>'urgency','')::numeric,0)
  + COALESCE(NULLIF(old_weights->>'authority','')::numeric,0)
  + COALESCE(NULLIF(old_weights->>'engagement','')::numeric,0) AS total
  FROM public.org_intent_weight_history
  WHERE old_weights IS NOT NULL
) s
WHERE h.id = s.id
  AND s.total > 0
  AND s.total < 50;

COMMIT;
