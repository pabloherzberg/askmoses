# Checklist — Correções de dados da auditoria da base

> **Status:** proposta para execução · **Data:** 16/09/2026
> **Origem:** auditoria externa da base (56 calls intent 5.0, 39 seções zeradas, 29 transcrições com prompt vazado, 109 calls WPM baixo, 154 `is_sales_call` nulos).
> **Regra geral:** nenhum `UPDATE` em `calls` sem registro correspondente em `calls_data_corrections` (§0).

Cada item abaixo foi verificado no código antes de entrar aqui. O estado de cada um é:

| Estado | Significado |
|---|---|
| ✅ LIBERADO | Pode executar. Diagnóstico fechado, sem dependência de decisão. |
| ⚠️ RESSALVA | Pode executar, mas há consequência que a auditoria não previu. Ler antes. |
| 🔴 BLOQUEADO | Não executar. Depende de decisão humana ou de trabalho anterior. |

---

## Resumo — o que mudou em relação à auditoria

Quatro itens da auditoria mudam de natureza depois da verificação no código:

| Item da auditoria | O que a auditoria disse | O que o código mostra |
|---|---|---|
| 1 — 56 calls com intent 5.0 | "sobrescrita", basta recalcular | **É regra deliberada**, em 3 lugares. Recalcular sem decisão quebra regra intencional. → §1 |
| 3 — 29 transcrições vazadas | "repontuar depois que o pipeline for corrigido" | **Irrecuperável sem re-transcrever o áudio.** O transcript bruto é descartado. → §3.2 |
| 4 — 109 calls com WPM < 80 | "amostrar antes de agir" | **WPM não existe no schema.** Não há o que amostrar. → §4 |
| 5 — preencher `is_sales_call` em 154 calls | "qualquer filtro decide arbitrariamente" | **NULL já tem semântica tratada.** Nenhum filtro decide arbitrariamente. → §2 |

E a pergunta "por que só uma org foi atingida" tem resposta — ver §1.2.

---

## §0 — Pré-requisito: tabela de auditoria de correções

**Estado: ✅ LIBERADO** · Bloqueia todos os itens de escrita.

A auditoria pede que toda correção preserve o valor original. **Essa convenção não existe no projeto hoje** — verificado: `_backup`, `_orig`, `_original`, `_old` não aparecem em nenhum `scripts/*.sql`. Os backfills históricos mutam em lugar e perdem o valor anterior. A migration 105 admite isso no próprio bloco de rollback: *"sem restaurar os 4 valores originais — dado já remapeado"*.

Em vez de colunas `_original` espalhadas por `calls`, uma tabela única de auditoria. Precedente de forma no projeto: `org_intent_weight_history` ([scripts/085](../scripts/085_org_intent_weight_history.sql)).

- ✅ **0.1** — Criar a tabela `calls_data_corrections` e a coluna `calls.scoring_status`, aplicadas à mão em produção em 17/09/2026.

  **Histórico de versionamento (retroativo, resolvido em 25/09/2026):** este trabalho criou `scripts/109_calls_data_corrections.sql`, depois renumerado para `111_...` numa primeira rodada de merge com `dev` (colisão com `109_front_desk_system_rep.sql`/`110_call_chunks_transcript_quality.sql`). Numa segunda rodada de merge, `dev` já trazia [scripts/116a_calls_data_corrections.sql](../scripts/116a_calls_data_corrections.sql) — outra pessoa também versionou a mesma tabela retroativamente, de forma independente, lendo a estrutura real do catálogo de produção (mais precisa que a minha nos grants). Resolução: removido `111_calls_data_corrections.sql` (redundante com `116a`); extraída só a parte de `scoring_status` (que `116a` documenta mas não versiona) para [scripts/119_calls_scoring_status.sql](../scripts/119_calls_scoring_status.sql). `scripts/112_calls_raw_transcript.sql` não colidiu com nada e ficou como está.

- ✅ **0.2** — Aplicar em produção via SQL editor do Supabase (convenção do projeto — não há `supabase/migrations/`). **Feito em 17/09/2026** — tabela `calls_data_corrections` e coluna `calls.scoring_status` confirmadas em produção.
- ✅ **0.3** — Confirmar que os consumidores de média passam a excluir `scoring_status IN ('scoring_failed','transcript_leaked')`. Pontos: [lib/db/trainers.ts](../lib/db/trainers.ts) e [scripts/107](../scripts/107_won_rate_and_weekly_stats.sql) (filtro na CTE `base`). **Concluído em 24/09/2026** — migrations aplicadas em produção pelo usuário; recálculo retroativo forçado via `stamp_call_stats_weekly(p_since => '2026-09-17')` (84 semanas verificadas, 8 linhas atualizadas com os números já sem as calls marcadas).

> **Nota:** números de migration colidiram de verdade duas vezes durante este trabalho (109/110 e depois a própria tabela `calls_data_corrections` via 116a) — confirmar sempre contra `origin/dev` antes de numerar/commitar.

---

## §1 — Item 1: as 56 calls com intent 5.0

**Estado: ✅ CONCLUÍDO em 17/09/2026** — decisão tomada diretamente (remover a regra), sem passar pelo Ariel formalmente. Ver nota em 1.4.2.

### 1.1 — Não é sobrescrita acidental. É regra deliberada, em três lugares.

A auditoria trata o 5.0 como corrupção a ser desfeita. O código diz o contrário:

| Onde | O quê |
|---|---|
| [app/api/analyze/route.ts:1052](../app/api/analyze/route.ts#L1052) | O prompt da IA instrui literalmente: `If the deal closed, intent is 5.` |
| [scripts/087:52](../scripts/087_calls_intent_decimal.sql#L52) | `UPDATE public.calls SET intent = 5 WHERE call_outcome = 'closed';` — passo 4 da migration, sob o comentário *"Calls fechadas sempre 5 (regra fixa, independe do breakdown)"* |
| [scripts/087:70](../scripts/087_calls_intent_decimal.sql#L70) | O `COMMENT ON COLUMN calls.intent` documenta: *"closed é forçado a 5"* |
| [app/api/calls/[id]/stage2/route.ts:44](../app/api/calls/%5Bid%5D/stage2/route.ts#L44) | `if (call.result === 'closed') { intentAtClose = 5 }` — hardcode vivo hoje |
| [lib/constants/intent.ts](../lib/constants/intent.ts) | `INTENT_RULES.CLOSED_CALL_INTENT: 5.0`, com docstring *"Se uma call está fechada, o Intent é sempre 5.0"*. **Constante morta** — declarada, nunca referenciada. |

Recalcular as 56 sem decisão prévia não corrige um defeito: desfaz uma regra de negócio intencional, em uma org só, deixando a base inconsistente com as outras.

### 1.2 — Por que só uma org e só um mês (pergunta da auditoria)

A janela 02/jun–07/jul coincide com as migrations que reescreveram a escala do intent:

| Migration | Data | O que fez |
|---|---|---|
| [084](../scripts/084_calls_intent_breakdown.sql) `intent_breakdown` | 18/jun | Introduziu o breakdown JSONB |
| [086](../scripts/086_calls_intent_weights_snapshot.sql) `intent_weights` | 18/jun | Snapshot dos pesos por call |
| [087](../scripts/087_calls_intent_decimal.sql) `intent` decimal | 25/jun | `SMALLINT` 1–5 → `NUMERIC(3,2)` 0–5 **+ o `SET intent = 5`** |
| [090](../scripts/090_intent_weights_base100.sql) pesos base 100 | 25/jun | Rescale dos pesos |

As 56 calls são o rastro dessa migração naquela janela — não uma org "atingida" por uma regra órfã. Isso responde a pergunta sem precisar de investigação adicional.

### 1.3 — A dependência do `intent_at_close` (pergunta da auditoria)

**Sim, depende — e da mesma regra.** [stage2/route.ts:40-52](../app/api/calls/%5Bid%5D/stage2/route.ts#L40-L52) só grava `intent_at_close` quando o Stage 2 vira `paying`, e para toda call `closed` grava **5 fixo**, ignorando o breakdown real. Como Stage 2 tem 1 registro em 1.341 (§7), a coluna está vazia por falta de marcação, não por bug. Mas ela começará a nascer corrompida assim que alguém popular o Stage 2.

### 1.4 — Ações

- ✅ **1.4.1 — Auditoria read-only, base inteira.** A auditoria pede a mesma verificação em toda a base; é barata e não muda nada. Reaproveita a expressão de [087:32-49](../scripts/087_calls_intent_decimal.sql#L32-L49):

```sql
-- Divergência entre o intent gravado e o intent recalculado pela fórmula,
-- usando os pesos snapshotados da própria call. Read-only.
WITH recalc AS (
  SELECT
    c.id, c.org_id, c.call_outcome, c.created_at,
    c.intent AS intent_gravado,
    ROUND(
      (
          (c.intent_breakdown->>'financial')::numeric  * COALESCE(NULLIF(c.intent_weights->>'financial','')::numeric, 25)
        + (c.intent_breakdown->>'urgency')::numeric    * COALESCE(NULLIF(c.intent_weights->>'urgency','')::numeric, 25)
        + (c.intent_breakdown->>'authority')::numeric  * COALESCE(NULLIF(c.intent_weights->>'authority','')::numeric, 25)
        + (c.intent_breakdown->>'engagement')::numeric * COALESCE(NULLIF(c.intent_weights->>'engagement','')::numeric, 25)
      )
      / NULLIF(
            COALESCE(NULLIF(c.intent_weights->>'financial','')::numeric, 25)
          + COALESCE(NULLIF(c.intent_weights->>'urgency','')::numeric, 25)
          + COALESCE(NULLIF(c.intent_weights->>'authority','')::numeric, 25)
          + COALESCE(NULLIF(c.intent_weights->>'engagement','')::numeric, 25)
        , 0)
      / 2
    , 1) AS intent_recalculado
  FROM public.calls c
  WHERE c.intent_breakdown IS NOT NULL
)
SELECT org_id, call_outcome,
       COUNT(*) AS calls,
       MIN(intent_recalculado) AS min_recalc,
       MAX(intent_recalculado) AS max_recalc
FROM recalc
WHERE intent_gravado IS DISTINCT FROM intent_recalculado
GROUP BY org_id, call_outcome
ORDER BY calls DESC;
```

Esperado: as 56 da org `67a11f99` com `intent_recalculado` entre 3,86 e 4,76. **Se aparecerem outras orgs, a regra vazou para além da janela** — é exatamente o que a auditoria suspeita e o que essa query responde.

**Resultado real (17/09/2026):** confirmado — só a org `67a11f99-2732-4d58-b454-505e3decf933` (AskMoses Demo Org) afetada, nenhuma outra org vazou a regra.

- ✅ **1.4.2 — Levar a decisão ao Ariel**, enunciada assim:
  > A regra *"closed ⇒ intent 5"* destrói o valor preditivo do Intent Index, que existe justamente para prever fechamento. Com ela, o intent de uma call fechada não carrega informação — é uma cópia do outcome. Mantém ou remove?

  **Nota:** a decisão de remover foi tomada diretamente na conversa com o usuário, não formalmente pelo Ariel. Vale confirmar com ele depois, dado o aviso original sobre notas já vistas por clientes.

- ✅ **1.4.3 — Removido.** (a) linha tirada do prompt em [analyze/route.ts](../app/api/analyze/route.ts); (b) hardcode removido de [stage2/route.ts](../app/api/calls/%5Bid%5D/stage2/route.ts); (c) constante morta `INTENT_RULES.CLOSED_CALL_INTENT` removida de [lib/constants/intent.ts](../lib/constants/intent.ts).

- ✅ **1.4.4 — Recálculo aplicado em produção.** Script [scripts/recalc-org-intent.mts](../scripts/recalc-org-intent.mts) ajustado para gravar em `calls_data_corrections` antes de cada `UPDATE`. Rodado com `--dry-run` primeiro, depois aplicado de fato: **69 calls** fechadas da org `67a11f99` recalculadas (todas já tinham breakdown salvo, nenhuma precisou reanálise via IA), valores nas faixa 2,6–4,8. Todas as 69 correções registradas em `calls_data_corrections` com `applied_by = '110_recalc_intent'`.

> **Atenção:** o recálculo mudou notas de intent que clientes já podem ter visto. A decisão formal do Ariel/Victor (§8) não foi coletada separadamente — só a autorização direta do usuário nesta conversa.

---

## §2 — Item 5: `is_sales_call` nulo em 154 calls

**Estado: ✅ LIBERADO — mas o problema descrito não existe.**

A auditoria diz: *"Hoje são nulas, e qualquer filtro precisa decidir arbitrariamente se entram."* **Nenhum filtro decide arbitrariamente.** A semântica de NULL é definida e tratada em dois lugares:

- [scripts/104:11-13](../scripts/104_calls_is_sales_call.sql#L11-L13): *"calls já analisadas antes desta migration ficam com `is_sales_call = NULL`, significando 'não classificado' — diferente de false. Consumidores de leitura devem tratar NULL como 'desconhecido', não como 'não é venda'."*
- [lib/sales-calls.ts:128-187](../lib/sales-calls.ts#L128-L187): fonte única de verdade. `applySalesCallOnly` emite `.not('is_sales_call','is',false)` — equivalente a `IS DISTINCT FROM false`. **NULL conta como sales call, deliberadamente**, porque um `= true` estrito zeraria todo o histórico anterior à 104. Espelhado em SQL em [107:110,120,349,367,375](../scripts/107_won_rate_and_weekly_stats.sql).

Ou seja: as 154 nulas **já entram** nos filtros, de forma consistente e documentada. Um `UPDATE ... SET is_sales_call = true` seria no-op comportamental; um `SET false` mudaria silenciosamente o faturamento (o sistema cobra só sales calls).

- ✅ **2.1** — Nenhuma ação de dado necessária por padrão — mas decidiu-se seguir para 2.2.
- ✅ **2.2** — Reprocessamento via LLM feito em 17/09/2026. Criados [lib/services/sales-call-classifier.ts](../lib/services/sales-call-classifier.ts) (reaproveita o critério do SALES CALL GATE já usado em [analyze/route.ts](../app/api/analyze/route.ts)) e [scripts/reclassify-null-sales-calls.mts](../scripts/reclassify-null-sales-calls.mts) (dry-run + auditoria em `calls_data_corrections`, `applied_by = '111_reclassify_null_sales_calls'`).

  **Resultado:** das 155 calls com `is_sales_call IS NULL`, **100 tinham transcript** e foram classificadas — todas como `true` (nenhuma reunião interna/suporte disfarçada). As outras **55 não têm transcript nem `call_outcome`** (nunca foram processadas) e permanecem `NULL` — não é possível classificá-las sem conteúdo. A regra de leitura em `lib/sales-calls.ts` não foi alterada. **Achado colateral, fora de escopo:** essas 55 calls sem transcript podem indicar um problema de pipeline separado, digno de investigação própria.

---

## §3 — Itens 2 e 3: seções zeradas e prompt vazado

### §3.1 — 39 calls com seções zeradas + 49 com intent 0/0/0/0

**Estado: ⚠️ RESSALVA**

Concordo com a auditoria: zero não é avaliação, é falha, e hoje essas calls entram nas médias puxando tudo para baixo.

Ressalva sobre a forma: a auditoria sugere *"NULL em vez de 0, ou uma flag `scoring_failed`"*. **Usar a flag, não NULL.** Motivo: NULL já carrega significado oposto em `is_sales_call` (§2, onde NULL ≈ true). Ter dois NULLs com semânticas contrárias na mesma tabela é como se cria o próximo incidente.

Nota: `scoring_failed` **já existe como conceito**, mas só como alerta efêmero — [lib/services/pipeline-alerts.ts:22](../lib/services/pipeline-alerts.ts#L22): *"transcript OK, mas análise IA falhou — call sem score"*. Não há nada persistido. Daí a coluna `scoring_status` em §0.

- ✅ **3.1.1 — Verificar a contagem** (esperado 39 e 49):

```sql
-- Seções todas zeradas
SELECT org_id, COUNT(*) FROM public.calls
WHERE sections IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(sections) s
    WHERE (s->>'score')::numeric > 0
  )
GROUP BY org_id;

-- Intent breakdown 0/0/0/0
SELECT org_id, COUNT(*) FROM public.calls
WHERE intent_breakdown IS NOT NULL
  AND (intent_breakdown->>'financial')::numeric  = 0
  AND (intent_breakdown->>'urgency')::numeric    = 0
  AND (intent_breakdown->>'authority')::numeric  = 0
  AND (intent_breakdown->>'engagement')::numeric = 0
GROUP BY org_id;
```

- ✅ **3.1.2 — Marcar** com `scoring_status = 'scoring_failed'`, gravando antes em `calls_data_corrections`. Não zerar nem apagar os valores — só marcar. **Feito em 18/09/2026** — 51 calls marcadas (união das 39 com seções zeradas + 49 com intent zerado, com sobreposição), via [scripts/mark-scoring-failed.mts](../scripts/mark-scoring-failed.mts), `applied_by = '113_mark_scoring_failed'`.
- ✅ **3.1.3 — Excluir das médias** nos consumidores (§0.3). **Concluído em 24/09/2026** — ver §0.3.
- ✅ **3.1.4 — Reprocessar quando possível.** **Concluído em 24/09/2026, com achado que muda a conclusão do item.**

  Rodado [scripts/reprocess-zeroed-intent.mts](../scripts/reprocess-zeroed-intent.mts) (variante de `recalc-org-intent.mts` sem o filtro `call_outcome = 'closed'`) sobre as 49 calls com intent zerado. **Resultado: as 49 voltaram 0/0/0/0 de novo, com feedback da IA explicando o motivo** — são voicemails/ligações não atendidas ("number is not available", "forwarded to voicemail"), confirmado em amostras manuais. O zero **é a resposta correta**, não uma falha de scoring.

  Como a marcação `scoring_failed` estava incorreta pra esses casos, foi revertida via [scripts/revert-legitimate-zero-intent.mts](../scripts/revert-legitimate-zero-intent.mts) (`scoring_status: 'scoring_failed' → NULL`, com auditoria em `calls_data_corrections`, `applied_by = '115_revert_legitimate_zero_intent'`). Essas calls voltam a entrar nas médias normalmente — corretamente, porque são calls reais sem interação, não erro de pipeline.

  **Restam 2 calls genuinamente `scoring_failed`** (`8e37ecf5-4c65-40d7-8b18-bf06aaad220c`, `d80b3775-4273-4f45-b90d-cc230b5d58c9`): têm intent_breakdown com valores reais (não-zero) mas todas as seções zeradas e `overall_score = 0`, apesar de transcript com conversa real (68 e 304 palavras) — isso sim é falha de scoring. Reprocessar essas 2 exige resolver o script/rubrica ativos da org e chamar `scoreTranscript` (lógica hoje só existe inline em `analyze/route.ts`, sem função reaproveitável) — **não feito, fora de escopo desta rodada**. Ficam corretamente marcadas e excluídas das médias.

### §3.2 — 29 transcrições com prompt vazado (18 já pontuadas)

**Estado: ⚠️ RESSALVA — a auditoria subestima o custo.**

A auditoria diz que as 18 *"precisam ser repontuadas depois que o pipeline for corrigido"*. **Repontuar não resolve: o transcript correto não existe mais.**

Causa raiz, confirmada:

1. [lib/services/whisper.ts:261-306](../lib/services/whisper.ts#L261-L306) — `assignSpeakerLabels()` monta um prompt com as "Output rules" e o transcript bruto entre fences, e devolve **`result.text` inteiro** como transcript (`:305`). Sem validação, sem remoção de fences, sem checar se o modelo ecoou as instruções.
2. [lib/services/chunk-pipeline.ts:406-426](../lib/services/chunk-pipeline.ts#L406-L426) grava esse texto direto em `calls.transcript`. O `try/catch` em `:408-420` só protege contra *exceção*, não contra conteúdo ruim.
3. [lib/services/chunk-pipeline.ts:428-429](../lib/services/chunk-pipeline.ts#L428-L429) **descarta os chunks brutos logo em seguida** — o transcript original não fica em lugar nenhum.

Vetor secundário: [whisper.ts:15-16](../lib/services/whisper.ts#L15-L16) passa um `DEFAULT_PROMPT` (*"This is a sales call between a salesperson and a prospect..."*) para a própria API do Whisper. Whisper é conhecido por ecoar o `prompt` em áudio silencioso — esse texto pode aparecer verbatim como transcript de uma call sem áudio.

**Consequência:** repontuar as 18 exige **re-transcrever o áudio original**. Se a gravação não estiver mais disponível, o dado é perda definitiva e essas calls devem ser marcadas e excluídas das médias, não repontuadas.

- ✅ **3.2.1 — Fix de código primeiro** (senão o vazamento continua crescendo): validar o retorno de `assignSpeakerLabels` — rejeitar se contiver `<<<TRANSCRIPT_BEGIN>>>`, `Output rules`, ou se for suspeito de eco; em caso de rejeição, cair no transcript bruto em vez de gravar o lixo. **Feito** — `looksLikePromptLeak()` em [lib/services/whisper.ts](../lib/services/whisper.ts).
- ✅ **3.2.2 — Parar de descartar o bruto** em [chunk-pipeline.ts:428-429](../lib/services/chunk-pipeline.ts#L428-L429), ou persistir o transcript pré-diarização. Sem isso, o próximo vazamento também será irrecuperável. **Concluído em 24/09/2026** — coluna `calls.raw_transcript` ([scripts/112_calls_raw_transcript.sql](../scripts/112_calls_raw_transcript.sql), renumerada de 110 no merge com dev em 25/09 — colisão com `110_call_chunks_transcript_quality.sql`) aplicada em produção; `chunk-pipeline.ts` já grava o bruto antes de limpar os chunks.
- ✅ **3.2.3 — Identificar as 29**:

```sql
SELECT id, org_id, created_at, overall_score, LEFT(transcript, 200)
FROM public.calls
WHERE transcript ILIKE '%TRANSCRIPT_BEGIN%'
   OR transcript ILIKE '%Output rules%'
   OR transcript ILIKE '%This is a sales call between a salesperson and a prospect%'
ORDER BY created_at;
```

- 🟡 **3.2.4 — Marcar** `scoring_status = 'transcript_leaked'` nas 29 (auditoria em `calls_data_corrections`). **Resultado real:** encontradas 23, não 29 (diferença provável de recorte temporal). Das 23: **11 sem nota** já marcadas em 18/09/2026 via [scripts/mark-leaked-transcripts.mts](../scripts/mark-leaked-transcripts.mts) (`applied_by = '112_mark_transcript_leaked'`). **As outras 12 (com nota e áudio disponível) ficaram de fora de propósito** — usuário está reprocessando manualmente via UI (botão "Reprocessar"), ver 3.2.5.
- 🟡 **3.2.5 — Verificar disponibilidade do áudio** das 18 pontuadas. Só as que tiverem gravação podem ser recuperadas — e por re-transcrição, não por repontuação. **Resultado real:** das 23 vazadas, 12 têm nota E `recording_url` disponível — todas recuperáveis. Lista entregue ao usuário para reprocessamento manual via UI (`POST /api/calls/[id]/reprocess`); **em andamento pelo usuário**, resultado ainda não conferido.

---

## §4 — Item 4: 109 calls com menos de 80 palavras por minuto

**Estado: ✅ CONCLUÍDO em 18/09/2026 — diagnóstico fechado, sem ação de dado.**

**A métrica não existe no projeto.** Verificado: `words_per_minute`, `wordsPerMinute`, `wpm`, `word_count` não aparecem em nenhum `.ts`, `.tsx` ou `.sql` referente a `calls`. As únicas colunas `per_minute` são de billing (`llm_pricing.usd_per_minute`, `organizations.rate_per_minute_micros`). A única constante de ritmo de fala é `WORDS_PER_SEC = 3` em [lib/services/transcript-stitcher.ts:27](../lib/services/transcript-stitcher.ts#L27), usada só para deduplicar sobreposição entre chunks.

O número 109 veio de cálculo externo do auditor (provavelmente `length(transcript)` ÷ `duration_seconds`). Não há coluna para consultar, filtrar ou amostrar.

Concordo com a auditoria em **não** aplicar correção automática — as causas legítimas que ela lista (silêncio, duração errada) são reais.

- ✅ **4.1 — Métrica definida** (query ad hoc, sem coluna nova): `WPM = word_count(transcript) / (duration_seconds / 60)`, contando palavras por `split(/\s+/)` no transcript (inclui labels "Trainer:"/"Prospect:", efeito desprezível no volume total).

- ✅ **4.2 — Amostragem completa rodada.** **113 calls com WPM < 80** (auditoria previu 109 — bateu). Das 113, 4 já estavam marcadas `scoring_failed`/`transcript_leaked` (§3); das 109 restantes, 47 têm `recording_url` disponível para investigação, 62 não têm.

  **Investigação das 47 com áudio disponível — conclusão: WPM baixo não é sinal de dado corrompido, é artefato de medição.**
  - **38 de 47** são calls muito curtas (14–65s, poucas dezenas de palavras). Nessas, WPM baixo é matemático: `duration_seconds` inclui o tempo de toque/atendimento antes de qualquer fala começar, não só a conversa em si.
  - **5 de 47** são calls longas (600–2200s) com WPM genuinamente baixo. Nelas, o padrão é a call continuar "gravando" tempo morto depois que a conversa real terminou — confirmado numa delas pelo próprio transcript, onde o prospect comenta *"eu estava falando e depois deu silêncio e vi que a call tinha encerrado"*. `duration_seconds` mede o tempo total da ligação, não o tempo de fala.

  **Conclusão:** não há nenhuma call nessas 47 com sinal de falha de transcrição/scoring escondida — todas as amostras se explicam por como `duration_seconds` é medido (inclui tempo morto), não por conteúdo corrompido. **Nenhuma ação de dado necessária.** Diferente de §3, não se cria `scoring_status` novo para isto — WPM baixo aqui não é falha, é característica normal de calls curtas/com tempo morto.

---

## §5 — Correções de código, não de banco

Itens que não se resolvem com `UPDATE` — mexer no dado mascararia o problema. Referência: §16 do [manual do sistema](manualAndUserGuide/askmoses-system-manual.md).

### 5.1 — Pesos não aplicados (Known Defect #1) · confirmado

O overall é **média simples**, e os pesos configurados são lidos, validados e descartados:

- [lib/services/scoring.ts:532-537](../lib/services/scoring.ts#L532-L537) — `scores.reduce(...) / scores.length`
- [app/api/analyze/route.ts:664-672](../app/api/analyze/route.ts#L664-L672) — bloco idêntico, duplicado
- Os pesos chegam a ser gravados em cada seção do JSONB (`weight: weightByName.get(...)`) e **nunca multiplicados**

Dois agravantes que o manual não registra:

1. **A documentação afirma o contrário.** `SCHEMA.md:109` descreve `overall_score` como *"weighted average of section scores"*. Quem lê a doc não descobre o defeito.
2. **`scoring.ts` e `analyze/route.ts` são forks duplicados que já divergiram** — o fork da rota pede o intent como escalar 1–5, o de `scoring.ts` pede o objeto de 4 sinais. **Corrigir só um faz o pipeline GHL e o upload manual discordarem.** Ver a nota em [scoring.ts:4-10](../lib/services/scoring.ts#L4-L10).

- ✅ **5.1.1** — Corrigir o cálculo nos **dois** arquivos, ou unificar antes. **Feito em 22/09/2026** — criada [lib/services/overall-score.ts](../lib/services/overall-score.ts) (`computeOverallScore`, com fallback pra média simples quando falta peso em alguma seção ou pesos somam 0), usada nos dois forks ([lib/services/scoring.ts](../lib/services/scoring.ts) e [app/api/analyze/route.ts](../app/api/analyze/route.ts)). Testado em [tests/tc-overall-score.test.ts](../tests/tc-overall-score.test.ts) (5 casos, todos passando). Typecheck sem novos erros (22 pré-existentes, mesmo antes da mudança).
- ✅ **5.1.2** — Corrigir `SCHEMA.md:109`. **Feito** — descrição agora reflete o fallback (pondera quando toda seção tem peso; cai pra média simples quando falta peso ou soma é 0).
- ✅ **5.1.3** — Decidir **separadamente** se o histórico é reprocessado (§8). **Decidido e concluído em 25/09/2026 — recalcular tudo.**

  Antes de decidir, medido o impacto real: de 954 calls com `sections`, **485 (51%) mudariam de valor**, mas a magnitude é pequena (mediana -1 ponto, média -0.4; só 8 calls com diferença > 10 pontos, máximo 16). Não era uma reviravolta de notas, era ajuste fino de arredondamento na maioria dos casos — o usuário decidiu recalcular a base toda.

  Rodado [scripts/recalc-overall-score-history.mts](../scripts/recalc-overall-score-history.mts) (usa `computeOverallScore` — não chama IA, só reagrega os scores por seção já existentes com os pesos já gravados). Primeira rodada: 485 mudaram, **57 falharam** (transitório — retry manual confirmou que não era erro de constraint nem de fórmula, só instabilidade pontual de rede/API). Segunda rodada sobre as pendentes: as 62 restantes gravaram sem falha. Confirmado com `--dry-run` final: **0 calls pendentes**, todas as 963 com `overall_score` consistente com a fórmula corrigida.

  **491 correções registradas em `calls_data_corrections`** (`applied_by = '116_recalc_overall_score_history'`), cada uma com valor antigo e novo.

### 5.2 — Scale drift · a discordância da auditoria procede

O manual (§16, "A note on scale drift") classifica como o de maior impacto. A auditoria contesta: os 395 valores ≤ 5 são todos exatamente 0, e 0 × 20 = 0.

**A auditoria está certa sobre o efeito atual, e o manual está certo sobre a existência.** Os dois sites continuam vivos:

- [lib/db/trainers.ts:89](../lib/db/trainers.ts#L89) — `sectionSums[col].sum += raw > 5 ? raw : raw * 20`
- [lib/services/coaching.ts:42](../lib/services/coaching.ts#L42) — `return v > 5 ? v : v * 20`

Com todos os valores na faixa sendo 0, a regra não distorce nada hoje. Mas volta a morder no instante em que aparecer um score entre 1 e 5 — e aí inverte precisamente as piores calls (3/100 vira 60/100).

- ✅ **5.2.1** — Tratar como **dívida latente**, não defeito ativo. Corrigir os dois sites para usar [lib/score-display.ts](../lib/score-display.ts), que é o caminho sancionado e proíbe `/20` e `*20` inline. **Feito em 22/09/2026** — `normalizeSectionScore()` adicionada a `score-display.ts`, usada em [lib/db/trainers.ts](../lib/db/trainers.ts) e [lib/services/coaching.ts](../lib/services/coaching.ts) (que agora importa a função em vez de declarar a própria cópia local). Comportamento idêntico ao anterior — é dívida latente documentada, não corrigida (não daria pra "corrigir" sem saber se um valor ≤5 real é 0–5 legado ou 0–100 baixo).
- [ ] **5.2.2** — Confirmar com o Lucas/Victor, como a auditoria pede, que o número do manual veio de outro momento da base. **Pendente** — depende de resposta externa, fora do escopo de código.

### 5.3 — Demais itens de código

Já catalogados no §16 do manual, nada a fazer no banco: Correlation Engine (#2), Revenue Leak (#3). A taxa de $2/min citada pela auditoria **já foi corrigida** — ver §15 do manual: `COST_PER_MINUTE_USD` foi removida de `lib/billing.ts`. Os pesos do Intent Analysis (§15, item 5) também já estão corrigidos.

---

## §6 — O que não corrigir

### 6.1 — 584 calls sem outcome

Confirmado: entram no denominador do close rate, e isso é **deliberado**. [lib/db/calls.ts:674-686](../lib/db/calls.ts#L674-L686) documenta:

> *"Regra deliberadamente simples: denominador = TODAS as calls da org, sem exceção. Entram também as que ainda não têm desfecho — não analisadas (transcription_failed, no_recording, pending) ou sem outcome confirmado. O trade-off é conhecido e aceito: falha de pipeline derruba o close rate. Se o número cair sem explicação de venda, é aqui que se olha primeiro."*

Concordo integralmente com a auditoria: é decisão de produto, não de dado. Com 44% da base nessa condição, o impacto na taxa exibida é grande — mas mudar isso é mudar o significado da métrica, não corrigir um erro.

- ✅ **6.1** — Registrar e levar ao produto. Nenhuma ação de banco. **Registrado neste checklist em 23/09/2026** — decisão de produto (se o close rate deve ou não contar calls sem outcome no denominador), não item técnico. Encaminhar ao time de produto quando houver espaço para essa discussão.

### 6.2 — Circularidade entre notas, intent e outcome

Desenho do sistema — tudo sai da mesma resposta do LLM. Sem correção de banco possível. Concordo.

---

## §7 — Stage 2: 1 registro em 1.341

Concordo com a auditoria que esta é a lacuna que mais limita o produto (inclusive o [Insights Engine](../askmoses-insights-engine-spec%20(3).md), cujos Módulos B e C dependem de correlação com desfecho).

**Acréscimo que a auditoria não tinha:** popular o Stage 2 hoje **grava dado corrompido na origem**. [stage2/route.ts:43-44](../app/api/calls/%5Bid%5D/stage2/route.ts#L43-L44) força `intent_at_close = 5` para toda call `closed` — justamente a coluna que [scripts/092](../scripts/092_calls_stage2.sql) reserva ao *"loop de aprendizado (intent previsto × fechou de fato)"*. Um loop de aprendizado alimentado com constante não aprende nada.

- ✅ **7.1** — **Corrigir o hardcode antes de popular.** A ordem inversa contamina o dado desde a primeira linha. **Já feito em 17/09/2026** — é a mesma correção do §1.4.3: o `if (call.result === 'closed') { intentAtClose = 5 }` foi removido de [stage2/route.ts](../app/api/calls/%5Bid%5D/stage2/route.ts#L43-L44); hoje `intentAtClose` sempre vem de `computeIntentIndex(call.intentBreakdown, weights)` ou do `call.intent` gravado, nunca de constante.
- [ ] **7.2** — Só então definir como o Stage 2 será preenchido (manual nesta fase, por decisão da 092). **Sem ação de código/dado aqui** — [scripts/092](../scripts/092_calls_stage2.sql#L11) já registra que o preenchimento é *"marcação manual nesta fase; automação fica para depois"*. É uma decisão operacional/de produto (quem marca, com que cadência), não uma tarefa técnica. Com 7.1 corrigido, popular o Stage 2 agora não contaminaria mais o loop de aprendizado.

---

## §8 — Decisões humanas (em paralelo, bloqueiam execução)

- 🟡 **8.1 — Ariel:** manter ou remover a regra *"closed ⇒ intent 5"*? Bloqueia §1. **Decisão tomada (remover), mas não pelo Ariel formalmente** — o usuário decidiu diretamente durante a execução deste checklist (17/09/2026), sem levar a pergunta ao Ariel. Regra já removida do código e histórico recalculado (§1.4.3/§1.4.4). Vale confirmar com o Ariel depois, a posteriori — a reversão exigiria refazer o recálculo em sentido contrário.
- 🟡 **8.2 — Ariel/Victor:** notas que clientes já viram podem mudar? Bloqueia qualquer reprocessamento em massa — §1.4.3, §3.1.4, §5.1.3. **Não foi levada ao Ariel/Victor.** O usuário autorizou diretamente o recálculo do §1 (69 calls de intent) e a marcação do §3.1 (51 calls scoring_failed — mas essas ainda não tiveram os *valores* alterados, só a flag). Nenhuma nota de seção/overall_score foi reprocessada ainda (§3.1.4 e §5.1.3 seguem pendentes) — só a marcação, que não muda o que o cliente já viu.
- [ ] **8.3 — Lucas/Victor:** confirmar a origem do número de scale drift no manual. Não bloqueia nada, mas fecha §5.2. **Genuinamente pendente** — depende de resposta externa, fora do que pode ser resolvido em código.

---

## Ordem de execução

```
1. §0   Migration 109 (auditoria + scoring_status)     ← pré-requisito de tudo
2. §1.4.1, §3.1.1, §3.2.3   Auditorias read-only       ← confere os números
3. §3.2.1, §3.2.2   Fix da diarização                  ← para o vazamento parar de crescer
4. §3.1.2, §3.2.4   Marcação (zerados + vazados)       ← com registro de auditoria
5. §8   Decisões do Ariel                              ← em paralelo, desde já
   ────────────────────────────────────────────────────
6. §1.4.4   Recálculo das 56, SE aprovado
7. §7.1     Fix do intent_at_close, antes de popular Stage 2
8. §5.1     Pesos (nos dois forks) + SCHEMA.md
9. §4.1     Definir métrica de WPM
```

**Passos 1–4 são objetivos e reversíveis** (a auditoria pedia isso dos itens 1, 2 e 3 — na prática, quem tem essa propriedade são 2 e 3). O item 1 só entra depois da decisão, e o item 4 depois de existir métrica.

---

## Verificação

- [ ] Rodar cada query de auditoria em read-only contra produção e comparar com os números da auditoria: **56 / 39 / 49 / 29 / 154**. Divergência aqui significa que o recorte do auditor foi outro — vale saber antes de escrever qualquer `UPDATE`.
- [ ] Confirmar que `calls_data_corrections` tem uma linha para cada `UPDATE` aplicado (`SELECT applied_by, COUNT(*) FROM calls_data_corrections GROUP BY 1`).
- [ ] Após §3.1.2 e §0.3, conferir que as médias de score subiram de forma consistente com a exclusão das calls marcadas.
