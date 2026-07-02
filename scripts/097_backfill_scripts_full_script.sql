-- ============================================================
-- 097_backfill_scripts_full_script.sql
-- Preenche scripts.full_script onde está NULL/vazio, derivando o
-- texto das sections. Mesmo formato do helper TS
-- buildFullScriptFromSections() (lib/db/scripts.ts):
--
--   1. <name>
--   <instructions>
--   Tip: <tips>        (linha só aparece quando tips não é vazio)
--
--   <blank line entre seções>
--
-- Idempotente: roda só em linhas sem full_script e com sections
-- array não-vazio. Re-executar não altera linhas já preenchidas.
-- ============================================================

UPDATE public.scripts AS s
SET full_script = sub.built,
    updated_at = now()
FROM (
  SELECT
    s2.id,
    string_agg(
      format('%s. %s', sec.ord, sec.elem->>'name')
        || E'\n' || COALESCE(sec.elem->>'instructions', '')
        || CASE
             WHEN COALESCE(NULLIF(trim(sec.elem->>'tips'), ''), '') <> ''
             THEN E'\nTip: ' || trim(sec.elem->>'tips')
             ELSE ''
           END,
      E'\n\n'
      ORDER BY sec.ord
    ) AS built
  FROM public.scripts s2
  CROSS JOIN LATERAL jsonb_array_elements(s2.sections)
    WITH ORDINALITY AS sec(elem, ord)
  WHERE (s2.full_script IS NULL OR trim(s2.full_script) = '')
    AND jsonb_typeof(s2.sections) = 'array'
    AND jsonb_array_length(s2.sections) > 0
  GROUP BY s2.id
) AS sub
WHERE s.id = sub.id;
