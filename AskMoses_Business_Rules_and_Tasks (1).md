# AskMoses.AI — Regras de Negócio Consolidadas + Tasks de Desenvolvimento

> **Audiência:** Devs, PO, time de negócios
> **Fonte primária:** `docs/AskMoses-Business-Rules.pdf` (Victor Slompo, April 2026) — 70+ regras confirmadas com Ariel Bacal
> **Fonte secundária:** `docs/AskMoses_Decision_Log_Fase2.md` — decisões tomadas em sessões internas
> **Regra de ouro:** Quando houver contradição entre o Business Rules PDF e o Decision Log, **o Business Rules PDF prevalece**.

---

# PARTE 1 — REGRAS DE NEGÓCIO COMPLETAS

Cada regra tem um ID único (SC-xx, RB-xx, CL-xx, etc.) que deve ser referenciado em code comments e PRs.

---

## 1. Scoring Engine — Como calls são pontuadas

### 1.1 Escala de Score

| ID | Regra | Status |
|----|-------|--------|
| SC-01 | Escala de score é **1–5 por seção** do rubric | ✅ CONFIRMADO |
| SC-02 | Descritores comportamentais: 1 = Não Tentou, 2 = Tentou mas Errou, 3 = Adequado, 4 = Forte, 5 = Excelente | ✅ CONFIRMADO |
| SC-03 | A escala é configurável por admin para flexibilidade futura. Default Phase 1: 1–5 | ✅ CONFIRMADO |
| SC-04 | **Conversão para exibição:** para mostrar como %, multiplicar por 20 (ex: score 4 = 80%) | ✅ CONFIRMADO |

**O que isso significa na prática:** A IA dá nota de 1 a 5 para cada seção. Na tela, o usuário vê como porcentagem. Um trainer com score 4.2 vê "84%" na UI.

### 1.2 Cálculo do Score Geral

| ID | Regra | Status |
|----|-------|--------|
| SC-05 | **IA retorna score (1–5) por seção. IA NÃO retorna score geral.** | ✅ CONFIRMADO |
| SC-06 | Score geral = **média ponderada**: Σ(score_seção × peso_seção) / Σ(peso_seção) | ✅ CONFIRMADO |
| SC-07 | Pesos definidos por seção no rubric. Default: 20. Range: 1–100 | ✅ CONFIRMADO |
| SC-08 | Pesos **NÃO precisam somar 100**. O sistema normaliza automaticamente | ✅ CONFIRMADO |
| SC-09 | Score geral arredondado para 1 casa decimal (ex: 4.2 de 5 = 84%) | ✅ CONFIRMADO |

**Fórmula concreta:**
```
overall_score = Σ(section.score × section.weight) / Σ(section.weight)

Exemplo com 3 seções:
  Discovery:    score 4, peso 25  → 4 × 25 = 100
  Presentation: score 3, peso 20  → 3 × 20 = 60
  Close:        score 5, peso 15  → 5 × 15 = 75
  
  overall = (100 + 60 + 75) / (25 + 20 + 15) = 235 / 60 = 3.9
  display = 3.9 × 20 = 78%
```

**⚠️ Nota sobre contradição resolvida:** O Decision Log (decisão 2.1) dizia "pesos fixos para todos os clientes". O Business Rules diz "pesos configuráveis por seção, owner define" (SC-07). **Prevalece o Business Rules: pesos são configuráveis.**

### 1.3 Thresholds de Exibição

| ID | Regra | Status |
|----|-------|--------|
| SC-10 | ≥85% = verde (forte), 75–84% = âmbar (adequado), <75% = vermelho (precisa melhorar) | ✅ CONFIRMADO |
| SC-11 | Thresholds hardcoded no Phase 1. Configuráveis por rubric no futuro | ✅ CONFIRMADO |
| SC-12 | Thresholds são **apenas visuais**. NÃO rejeitam ou flagram calls automaticamente | ✅ CONFIRMADO |

**Importante:** Um score vermelho não "reprova" a call. É só um indicador visual para o owner/trainer.

### 1.4 Calibração da IA

| ID | Regra | Status |
|----|-------|--------|
| SC-13 | **Gate de aceite do Phase 1:** IA precisa alinhar >80% com avaliação manual do Ariel em 10+ calls reais | ✅ CONFIRMADO |
| SC-14 | Calibração testada com 3 LLMs: GPT-4o-mini, Gemini 2.5 Flash, Claude | ✅ CONFIRMADO |
| SC-15 | Se alinhamento <80%, prompt tuning continua até atingir. **Incluído no preço do Phase 1** | ✅ CONFIRMADO |

**O que isso significa:** O Phase 1 SÓ É ACEITO quando a IA demonstrar que concorda com o Ariel em pelo menos 8 de cada 10 avaliações manuais. Isso é um critério de entrega, não uma feature.

**🔴 BLOQUEADO POR:** Ariel e Eliana precisam fornecer os critérios de avaliação (o que é 5/5 e o que é 1/5 em cada seção) e avaliar manualmente 10+ calls reais.

---

## 2. Sistema de Rubric — O coração da avaliação

O rubric é o framework que define COMO uma call de vendas é avaliada. Cada empresa define o seu.

### 2.1 Estrutura

| ID | Regra | Status |
|----|-------|--------|
| RB-01 | Seções do rubric são **DINÂMICAS**. Cada empresa define as suas. **NÃO hardcoded** | ✅ CONFIRMADO |
| RB-02 | Mínimo: 3 seções. Máximo: ilimitado (recomendado ≤8 para qualidade da IA) | ✅ CONFIRMADO |
| RB-03 | Cada seção tem: name (obrigatório), description (obrigatório), weight (1–100, default 20), is_critical (boolean, default false) | ✅ CONFIRMADO |
| RB-04 | O frontend carrega seções do banco de dados. Nenhuma seção hardcoded no TypeScript | ✅ CONFIRMADO |

**O que isso significa na prática:**
- A empresa "Dog Wizard" pode ter 5 seções: Discovery, Agitation, Presentation, Objection, Close
- A empresa "Taking the Lead" pode ter 4 seções: Greeting, Qualification, Demo, Booking
- O frontend renderiza N barras de rubric dinamicamente, não 5 fixas

**⚠️ Estado atual do código:** O `types.ts` tem `RubricScores` com 5 campos fixos (discovery, problemAgitation, etc.). Isso PRECISA ser refatorado para array dinâmico.

### 2.2 Múltiplos Rubrics

| ID | Regra | Status |
|----|-------|--------|
| RB-05 | Cada empresa pode ter **múltiplos rubrics** (ex: um para B2B, um para B2C, um para cold calls) | ✅ CONFIRMADO |
| RB-06 | Apenas **um rubric pode ser "default"** por empresa | ✅ CONFIRMADO |
| RB-07 | Cada call é associada a um rubric específico **no momento do upload** | ✅ CONFIRMADO |
| RB-08 | Um rubric pode ser **desativado mas nunca deletado**. Calls históricas mantêm o link | ✅ CONFIRMADO |

**Exemplo prático:**
```
Dog Wizard HQ (org):
  ├── Rubric "Cold Call B2C" (default, ativo)
  ├── Rubric "Follow-up B2B" (ativo)
  └── Rubric "Old Process 2025" (desativado — 47 calls históricas vinculadas)
```

### 2.3 Edição de Rubric

| ID | Regra | Status |
|----|-------|--------|
| RB-09 | Somente o **Owner** pode criar e editar rubrics. CS (Phase 2) também pode | ✅ CONFIRMADO |
| RB-10 | Admin (equipe do Ariel) **NÃO edita** rubrics de clientes. Admin é backoffice | ✅ CONFIRMADO |
| RB-11 | Quando rubric é editado, **calls existentes mantêm scores originais**. Sem re-scoring automático | ✅ CONFIRMADO |
| RB-12 | Re-scoring de calls antigas com novo rubric = **ação manual do owner. Requer job queue. Phase 2+** | ✅ CONFIRMADO |

**Regra de ouro:** Editar rubric NUNCA muda o passado. Se o owner muda o peso de "Discovery" de 20 para 30, todas as calls já avaliadas mantêm o score original. Somente novas calls usam o peso novo.

### 2.4 Audit Trail do Rubric

| ID | Regra | Status |
|----|-------|--------|
| RB-13 | Quando IA auto-gera rubric a partir de calls, cada seção é tagueada: "from script" ou "AI suggested" | ✅ CONFIRMADO |
| RB-14 | Owner revisa e aprova cada seção antes do rubric ficar ativo | ✅ CONFIRMADO |
| RB-15 | **IA NUNCA pode adicionar seções durante análise de call que não existam no rubric ativo** | ✅ CONFIRMADO |

**Contexto real:** No teste com "Taking the Lead", a IA inventou uma seção "Show Demo" que não estava no script. Isso é proibido. A IA só pode avaliar contra seções que existem no rubric.

### 2.5 Campos Configuráveis no Rubric

Cada rubric carrega configurações que personalizam como a empresa usa a plataforma:

| ID | Campo | Default | Descrição |
|----|-------|---------|-----------|
| RB-16 | `role_label` | "trainer" | Como a empresa chama seus vendedores. Opções: setter, rep, consultant, agent. Texto livre | 
| RB-17 | `call_goal` | "close deal" | O que a call deve alcançar. Opções: book appointment, qualify lead, schedule eval. Texto livre |
| RB-18 | `coaching_boundaries` | vazio | O que a IA **NÃO DEVE** aconselhar. Ex: "Nunca sugerir dar conselhos de treinamento durante uma call de vendas" |
| RB-19 | `coaching_tone` | "encouraging" | Tom do feedback da IA: encouraging / direct / balanced |
| RB-20 | `outcome_options` | ["closed", "not_closed", "partial", "no_outcome"] | Lista de outcomes possíveis para calls. Owner pode adicionar custom (ex: "booked", "qualified") |

**Por que isso existe:** O cliente "Taking the Lead" chama seus vendedores de "setters", não "trainers". Se a IA escrevesse "the trainer should..." no feedback, a Lindsay (dona) estranharia. Com `role_label = "setter"`, a IA escreve "the setter should...".

---

## 3. Processamento de Calls — Do upload ao score

### 3.1 Upload de Calls

| ID | Regra | Status |
|----|-------|--------|
| CL-01 | **Phase 1:** calls uploaded manualmente pelo operador (Eliana/owner). Trainer NÃO faz upload no Phase 1 | ✅ CONFIRMADO |
| CL-02 | **Phase 2:** trainer pode fazer upload das próprias calls se rep accounts estiverem configurados | ✅ CONFIRMADO |
| CL-03 | **Phase 3:** ingestão automática via webhook Twilio. Sem upload manual para clientes integrados | ✅ CONFIRMADO |
| CL-04 | Formatos aceitos: MP3, WAV, M4A. Tamanho máximo: 50MB. WAV >25MB auto-convertido para MP3 | ✅ CONFIRMADO |
| CL-05 | Formulário de upload requer: arquivo de áudio, seleção de rubric, lead_name, caller/setter_name, outcome | ✅ CONFIRMADO |

**⚠️ Nota sobre contradição resolvida:** O Decision Log (decisão 3.2) dizia "trainer pode fazer upload — pronto para dev". O Business Rules diz "Phase 1: só operator" (CL-01). **Prevalece o Business Rules: trainer upload é Phase 2.**

### 3.2 Detecção de Tipo de Call

Antes de avaliar, a IA classifica o tipo da call. Isso é importante porque nem toda gravação é uma call de vendas.

| ID | Regra | Status |
|----|-------|--------|
| CL-06 | IA classifica: `sales_call` / `non_sales` / `rescheduling` / `support` / `unknown` | ✅ CONFIRMADO |
| CL-07 | Se `non_sales`: pula scoring inteiro. Armazena com type = non_sales. Sem email de coaching | ✅ CONFIRMADO |
| CL-08 | Se `rescheduling`: avalia com rubric reduzido (só seções relevantes). Sinaliza na UI | ✅ CONFIRMADO |
| CL-09 | Sub-tipos para sales calls: `cold_inbound`, `scheduled_followup`, `partner_callback`, `warm_referral` | ✅ CONFIRMADO |
| CL-10 | Sub-tipo ajusta expectativa de scoring. Cold calls **não são penalizadas** por falta de preparação prévia | ✅ CONFIRMADO |
| CL-11 | Phase 1: sub-tipo inserido manualmente pelo operador. Phase 3: auto-detectado via metadata Twilio | ✅ CONFIRMADO |

**Contexto real:** No teste com "Taking the Lead", uma cold call recebeu nota baixa em "preparação" — injusto, porque numa cold call o vendedor não tinha como se preparar. Com CL-10, o sistema ajusta a expectativa.

**Fluxo:**
```
Áudio uploaded → IA classifica tipo
  ├── non_sales → salva sem score, sem email
  ├── rescheduling → rubric reduzido, flag na UI
  └── sales_call → sub-tipo (manual Phase 1) → scoring normal
```

### 3.3 Análise pela IA

| ID | Regra | Status |
|----|-------|--------|
| CL-12 | System prompt montado **dinamicamente** a partir do rubric: base_prompt + role_label + call_goal + coaching_boundaries + coaching_tone + definições das seções | ✅ CONFIRMADO |
| CL-13 | IA avalia **SOMENTE** contra seções do rubric ativo. Nunca inventa critérios novos | ✅ CONFIRMADO |
| CL-14 | IA retorna JSON estruturado: `{ sections: [{ name, score, feedback }], summary, strengths[], improvements[] }` | ✅ CONFIRMADO |
| CL-15 | Resposta da IA **validada contra schema do rubric**. Se IA retorna seção que não existe no rubric, ela é removida antes de salvar | ✅ CONFIRMADO |
| CL-16 | Se IA falha ou retorna JSON inválido, call marcada como `analysis_failed`. Operador notificado. Sem email de coaching | ✅ CONFIRMADO |
| CL-17 | Multi-model: GPT-4o-mini (default), Gemini 2.5 Flash (alternativa), Claude (testes). Modelo selecionado por rubric ou global | ✅ CONFIRMADO |

**Fluxo de análise:**
```
1. Buscar rubric selecionado + seções + campos configuráveis
2. Montar system prompt dinamicamente
3. Enviar transcrição + prompt para LLM
4. Receber JSON de resposta
5. Validar: remover seções que não existem no rubric (CL-15)
6. Se JSON inválido: marcar call como "analysis_failed" (CL-16)
7. Calcular overall_score via média ponderada (SC-06)
8. Salvar call com sections_json, overall_score, suggested_outcome
```

### 3.4 Email de Coaching

| ID | Regra | Status |
|----|-------|--------|
| CL-18 | Email contém: lead name, setter name, score geral, scores por seção com barras de progresso, summary, strengths, improvements | ✅ CONFIRMADO |
| CL-19 | Tom do email controlado pelo campo `coaching_tone` do rubric (encouraging / direct / balanced) | ✅ CONFIRMADO |
| CL-20 | **Phase 1: owner/operador decide quando enviar. NÃO é automático** | ✅ CONFIRMADO |
| CL-21 | Quando rep accounts existirem, email vai direto para inbox do setter | ✅ CONFIRMADO |
| CL-22 | Owner **sempre recebe cópia** (BCC ou digest separado) | ✅ CONFIRMADO |

### 3.5 Outcomes de Calls

| ID | Regra | Status |
|----|-------|--------|
| CL-23 | Outcome é **OBRIGATÓRIO** em toda call. Selecionado da lista `outcome_options` do rubric | ✅ CONFIRMADO |
| CL-24 | Outcomes default: closed, not_closed, partial, no_outcome. Owner pode customizar por rubric | ✅ CONFIRMADO |
| CL-25 | Outcome inserido pelo operador no upload. Pode ser corrigido depois pelo owner | ✅ CONFIRMADO |
| CL-26 | IA pode **SUGERIR** outcome baseado na transcrição, mas **confirmação humana é obrigatória** | ✅ CONFIRMADO |

**⚠️ Estado atual do código:** `CallResult` em `types.ts` é um type hardcoded com 4 valores fixos. Precisa virar dinâmico (string validada contra `rubric.outcome_options`).

---

## 4. Usuários e Controle de Acesso

### 4.1 Papéis (Roles)

| Role | Quem é | O que pode fazer |
|------|--------|-----------------|
| **Admin** | Equipe AskMoses (Ariel) | Painel SaaS, métricas globais, lista de clientes, gestão de planos. **NÃO edita rubrics de clientes** |
| **Owner** | Dono do negócio (ex: Lindsay) | Criar/editar rubrics, upload calls, ver dashboard do time, enviar emails de coaching, gerenciar trainers, configurar outcomes, editar prompts |
| **CS** | Customer Success (Phase 2) | Mesmo que Owner + pode gerenciar system prompts. Papel operacional da equipe de suporte do Ariel |
| **Trainer** | Vendedor / setter | Ver dashboard próprio, suas calls, seus scores, dicas de coaching. **Não pode ver dados de outros trainers** |

### 4.2 Regras de Acesso

| ID | Regra | Status |
|----|-------|--------|
| US-01 | Um trainer pertence a **exatamente uma empresa** (org_id). Sem trainers multi-tenant | ✅ CONFIRMADO |
| US-02 | Owner convida trainer via **magic link** (email). Sem self-signup | ✅ CONFIRMADO |
| US-03 | Owner pode **desativar** um trainer. Trainers desativados mantêm dados históricos mas não podem logar | ✅ CONFIRMADO |
| US-04 | Isolamento de dados via **Supabase RLS**: Owner A nunca vê dados do Owner B. Filtrado por org_id em toda query | ✅ CONFIRMADO |
| US-05 | Owner é **apenas gestor**. Não é avaliado, não aparece no ranking, não aparece no leaderboard | ✅ CONFIRMADO |
| US-06 | Sem hierarquia intermediária (gerente regional) no Phase 1–3. **Flat: Owner → Trainers** | ✅ CONFIRMADO |

**O que isso significa na prática:**
- A Lindsay (owner da "Taking the Lead") convida seus 4 setters por email
- Cada setter recebe um magic link, cria conta, e automaticamente fica vinculado à org da Lindsay
- Se a Lindsay desativar um setter que saiu, ele perde acesso mas as 47 calls dele continuam no histórico
- Nenhum dado da Lindsay aparece para o Dog Wizard HQ (outro cliente) — RLS garante isolamento total

---

## 5. Regras de Dashboard — O que cada tela mostra

### 5.1 Owner Dashboard ("Command Center")

O dashboard do owner é um **centro de comando**, não um log de calls.

| ID | Regra | Status |
|----|-------|--------|
| DB-01 | **Close Rate** = calls com outcome "closed" / total de calls com qualquer outcome. **Follow-ups excluídos do denominador** | ✅ CONFIRMADO |
| DB-02 | **Avg Score** = média dos overall scores de todas as calls no período selecionado. Default: ciclo atual (6 semanas) | ✅ CONFIRMADO |
| DB-03 | **Est. Monthly Revenue** = close_rate × calls_per_month × avg_ticket. Avg ticket configurado por empresa. Mock: $18,200 | ✅ CONFIRMADO |
| DB-04 | **Correlation Engine** = rankeia seções + traços comportamentais por correlação com deals fechados. Phase 1: mock. Phase 2: real via correlação simples (score vs outcome) | ✅ CONFIRMADO |
| DB-05 | **Revenue Impact Estimator** = para cada seção: (target_score - current_score) / current_score × correlation_factor × monthly_revenue. Phase 1: mock. Phase 2: real | ✅ CONFIRMADO |
| DB-06 | **Rubric Gap Detection** = IA analisa calls do período e sinaliza tópicos mencionados em >30% das calls que não estão cobertos por nenhuma seção do rubric. Phase 1: mock. Phase 2: real via cron semanal | ✅ CONFIRMADO |
| DB-07 | **Team Health** = todos os trainers rankeados por close rate com delta vs período anterior. Cores: verde = melhorando, vermelho = piorando, cinza = estável | ✅ CONFIRMADO |
| DB-08 | **Active Alerts**: máximo 3 exibidos. Prioridade: vermelho (queda >10pts) > amarelo (padrão problemático) > verde (tendência positiva) | ✅ CONFIRMADO |
| DB-09 | **Recent Calls NÃO ficam no dashboard do owner.** Ficam apenas no módulo de Calls | ✅ CONFIRMADO |

**Fórmula do Close Rate (DB-01):**
```
Exemplo: 10 calls → 3 closed, 3 follow-up, 4 not_closed
Denominador = 10 - 3 (follow-ups) = 7
Close Rate = 3 / 7 = 42.8%

Diferente de: 3 / 10 = 30% (fórmula errada que conta follow-ups)
```

**Fórmula do Revenue Estimator (DB-05):**
```
Para a seção "Objection Handling":
  current_score = 3.2 (avg do time)
  target_score = 4.0 (meta)
  correlation_factor = 0.85 (quanto essa seção correlaciona com fechamento)
  monthly_revenue = $18,200

  impact = (4.0 - 3.2) / 3.2 × 0.85 × $18,200 = $3,868

  "Se o time melhorar Objection Handling de 3.2 para 4.0, estima-se +$3,868/mês"
```

**⚠️ Estado atual do código:** O `/overview` atualmente mostra "Recent Calls". Segundo DB-09, isso precisa ser removido.

### 5.2 Trainer Dashboard (Personal)

| ID | Regra | Status |
|----|-------|--------|
| DB-10 | Trainer vê **apenas dados próprios**. Não pode ver outros trainers | ✅ CONFIRMADO |
| DB-11 | Mostra: score pessoal, close rate, scores de rubric vs média do time, dica de coaching da última call, calls recentes (só próprias) | ✅ CONFIRMADO |
| DB-12 | **Coaching tip** = gerada pela IA a partir da seção com menor score na call mais recente. Uma frase, acionável | ✅ CONFIRMADO |

**Sem mudanças** em relação ao Demo v1.

### 5.3 Trainer Detail ("Coaching Center" — visão do Owner)

Tela **COMPLETAMENTE NOVA** — não existe no código atual. O owner vê o detalhe de cada trainer.

| ID | Regra | Status |
|----|-------|--------|
| DB-13 | Owner vê visão detalhada de cada trainer. **Tabs para alternar entre trainers** | ✅ CONFIRMADO |
| DB-14 | **Behavioral Correlation Profile:** 6 dimensões (seções do rubric + traços comportamentais) com score e delta vs média do time | ✅ CONFIRMADO |
| DB-15 | **Best Call This Week:** 2 cards. IA seleciona as calls com maior score. Mostra timestamp do momento-chave + análise da IA | ✅ CONFIRMADO |
| DB-16 | **Needs Improvement:** 2 cards. IA seleciona calls com menor score. Mostra falha específica + timestamp | ✅ CONFIRMADO |
| DB-17 | **AI Coaching Recommendations:** 3 itens acionáveis por trainer. Gerados a partir de tendências de score + padrões de calls | ✅ CONFIRMADO |
| DB-18 | **Head to Head:** compara trainer selecionado vs top performer do time em 3 dimensões-chave | ✅ CONFIRMADO |
| DB-19 | **Overall Performance Trend:** gráfico de linha — close rate + avg score ao longo de 6 semanas | ✅ CONFIRMADO |

**Citação do Ariel:** *"The owner can visualize itself coaching his team. Imagine Lindsay with this dashboard."*

### 5.4 Health Status (calculado automaticamente)

| ID | Regra | Critério |
|----|-------|----------|
| DB-20 | **Healthy** | Ativo nos últimos 7 dias + score estável ou melhorando |
| DB-21 | **At Risk** | Score caiu >10pts em 2 semanas OU sem calls submetidas em >7 dias |
| DB-22 | **Churning** | Sem login >14 dias OU pedido de downgrade submetido |
| DB-23 | Health calculado **diariamente**. Owner vê badge no card Team Health |

---

## 6. Modelo de Dados — Schema do Banco

Regras que definem a estrutura do banco de dados.

| ID | Regra |
|----|-------|
| DM-01 | **Toda tabela com dados de cliente DEVE ter `org_id`**. RLS policy obrigatória |
| DM-02 | **calls:** id, org_id, user_id (nullable), rubric_id, transcript, sections_json (JSONB), overall_score, call_outcome, call_type, lead_name, caller_name, email_sent, created_at |
| DM-03 | **users:** id, name, email, role (owner\|trainer), org_id, invited_by, status (active\|deactivated), created_at |
| DM-04 | **rubrics:** id, org_id, name, is_active, is_default, role_label, call_goal, coaching_boundaries, coaching_tone, outcome_options (JSONB), system_prompt, llm_model, created_at |
| DM-05 | **rubric_sections:** id, rubric_id, name, description, weight, is_critical, sort_order, source (from_script\|ai_suggested), created_at |
| DM-06 | **Soft deletes only.** Nunca hard delete em calls, users ou rubrics. Usar flags is_active / status |
| DM-07 | Todos os timestamps em **UTC**. Frontend converte para timezone do usuário |

**Comparação: schema atual vs. schema necessário**

| Tabela | Existe? | O que falta |
|--------|---------|-------------|
| `organizations` | ❌ NÃO EXISTE | Criar do zero: id, name, avg_ticket |
| `rubrics` | ✅ Existe | Adicionar: org_id, is_default, role_label, call_goal, coaching_boundaries, coaching_tone, outcome_options |
| `criteria` → `rubric_sections` | ✅ Existe como `criteria` | Renomear + adicionar: weight, is_critical, source |
| `calls` | ✅ Existe | Adicionar: org_id, call_type, call_subtype, lead_name, caller_name, sections_json, score_override, overridden_by, overridden_at |
| `profiles` → alinhar com `users` | ✅ Existe como `profiles` | Adicionar: org_id, invited_by, status |
| `scripts` | ✅ Existe | Adicionar: org_id |

---

## 7. Integrações (Phase 3 — fora do escopo atual)

| ID | Regra |
|----|-------|
| INT-01 | Twilio é a integração principal (P0). Webhook recebe eventos `call.completed` |
| INT-02 | Webhook valida assinatura Twilio antes de processar |
| INT-03 | URL da gravação extraída do payload. Download e storage no Vercel Blob |
| INT-04 | Metadata do caller (telefone, duração, direção) mapeada para campos do AskMoses |
| INT-05 | Idempotência: eventos duplicados (mesmo call SID) são ignorados |
| INT-06 | Tipo da call (inbound/outbound) auto-detectado via metadata Twilio |
| INT-07 | Sistema de filas: calls enfileiradas para processamento. Retry 3x. Dead letter após 3 falhas |
| INT-08 | **Sem integração GHL.** Removido do escopo. Twilio é a única plataforma de ingestão |

---

## 8. Itens Pendentes de Validação com Ariel

12 itens com regra proposta que precisam de confirmação do Ariel antes de implementar:

| # | Tópico | Regra Proposta | Impacto se errar |
|---|--------|---------------|-----------------|
| V1 | Pesos configuráveis? | Sim, owner define por seção. Sistema normaliza | Muda cálculo de score |
| V2 | IA sugere outcome? | Sim, mas humano confirma. Nunca auto-aceito | Decisão de UX |
| V3 | Email: auto ou manual? | Phase 1: manual. Com rep accounts: auto + cópia pro owner | Mudança de workflow |
| V4 | Tom de coaching default? | "encouraging". Owner pode mudar para "direct" ou "balanced" | Tom de todos os emails |
| V5 | Ajuste para cold calls? | Seções de preparação são avaliadas mas flagadas como "not applicable" em vez de penalizar | Justiça do scoring |
| V6 | Avg ticket pro Revenue Estimator? | Owner insere durante onboarding. Pode atualizar a qualquer momento | Precisão do display de revenue |
| V7 | Threshold de gap detection? | >30% das calls mencionam tópico sem cobertura no rubric. Threshold configurável | Sensibilidade da feature |
| V8 | Trainer self-upload? | Phase 1: NÃO. Phase 2: SIM, quando rep accounts existirem | Clareza do workflow |
| V9 | Calls de rubric desativado? | Permanecem visíveis no histórico com label "archived". NÃO desaparecem | Retenção de dados |
| V10 | Script Builder: core ou nice-to-have? | Nice-to-have para Phase 2. Qualidade precisa de testes com calls reais | Escopo do Phase 1 |
| V11 | AI Insights: quando reais? | Phase 1: mock. Phase 2: real via cron semanal. NÃO requer RAG | Arquitetura Phase 2 |
| V12 | Behavioral scoring: quando real? | Demo: mock. Phase 2: mock melhorado. Phase 4: real via GPT-4o Audio | Prioridade no roadmap |

---

# PARTE 2 — O QUE ESTÁ BLOQUEADO (não pode ir para dev)

| # | Bloqueio | Por que trava | Quem desbloqueia |
|---|----------|--------------|-----------------|
| 1 | **LLM não avalia transcrições reais** — tudo é mock | Sem critérios reais definidos, IA não sabe o que é nota 5 vs nota 1 | Ariel + Eliana: preencher critérios por seção |
| 2 | **Critérios de avaliação por seção** — o que é 5/5 e 0/5 | Sem isso, a calibração (SC-13) é impossível | Ariel + Eliana |
| 3 | **Calibração >80%** (SC-13) — gate de aceite do Phase 1 | Precisa de 10+ calls reais avaliadas manualmente pelo Ariel E pela IA | Ariel (avaliação manual) + Dev (pipeline IA) |
| 4 | **Revenue Estimator e Correlation Engine reais** — dependem de dados históricos | Sem volume de calls reais, a correlação estatística não funciona | Tempo + uso real |
| 5 | **Fórmula de scoring para cold calls** (CL-10) — validação V5 pendente | Sem decisão do Ariel, cold calls podem ser penalizadas injustamente | Ariel |

---

# PARTE 3 — TASKS DE DESENVOLVIMENTO

Organizadas por épico, com dependências explícitas e critérios de aceite.

---

## ÉPICO 0 — Schema & Fundações

> Tudo depende deste épico. Sem ele, nenhuma feature real funciona.
> Pode ser desenvolvido em paralelo com frontend (ÉPICO 2) usando dados mock.

### TASK-F2-001 — Criar tabela `organizations` e adicionar `org_id` em todas as tabelas

**Regras:** DM-01, DM-04, US-01, US-04
**Prioridade:** P0 BLOQUEANTE — tudo depende disso
**Depende de:** nada

**Contexto:** Hoje os dados não têm isolamento por empresa. O campo `owner_id` no `profiles` faz uma ligação fraca trainer→owner, mas não existe entidade "organização". Múltiplos owners de empresas diferentes compartilham o mesmo banco sem proteção.

**O que criar:**

1. Tabela `organizations`:
   ```sql
   CREATE TABLE organizations (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     name TEXT NOT NULL,
     avg_ticket NUMERIC DEFAULT 0,   -- DB-03: Revenue Estimator
     created_at TIMESTAMPTZ DEFAULT now()
   );
   ```

2. Adicionar `org_id` como FK em: `rubrics`, `calls`, `profiles`, `scripts`

3. Configurar RLS em todas essas tabelas:
   ```sql
   CREATE POLICY "isolate by org" ON rubrics
     USING (org_id = (auth.jwt()->'app_metadata'->>'org_id')::uuid);
   ```

4. Migrar dados existentes: criar 1 org de demo, vincular todos os registros

**Critérios de aceite:**
- [ ] Tabela `organizations` existe com dados de demo
- [ ] Todas as tabelas com dados de cliente têm `org_id` NOT NULL
- [ ] RLS policies ativas: Owner A não consegue SELECT dados de Owner B
- [ ] `org_id` propagado no JWT via app_metadata (trigger no profiles)
- [ ] Migration scripts versionados em `/scripts/`

---

### TASK-F2-002 — Migrar `criteria` para `rubric_sections` com novos campos

**Regras:** DM-05, RB-03
**Prioridade:** P0 BLOQUEANTE
**Depende de:** TASK-F2-001

**Contexto:** A tabela `criteria` atual tem apenas: id, rubric_id, name, description, sort_order. Faltam os campos que definem o peso e a importância de cada seção.

**O que mudar:**
```sql
ALTER TABLE criteria RENAME TO rubric_sections;
ALTER TABLE rubric_sections ADD COLUMN weight INTEGER DEFAULT 20 CHECK (weight BETWEEN 1 AND 100);
ALTER TABLE rubric_sections ADD COLUMN is_critical BOOLEAN DEFAULT false;
ALTER TABLE rubric_sections ADD COLUMN source TEXT DEFAULT 'manual' CHECK (source IN ('from_script', 'ai_suggested', 'manual'));
```

**Atualizar `lib/db/rubric.ts`:**
- Renomear `DbCriterion` → `DbRubricSection`
- Adicionar weight, is_critical, source ao type
- Renomear todas as funções: `dbGetCriteriaByRubric` → `dbGetSectionsByRubric`, etc.

**Critérios de aceite:**
- [ ] Tabela renomeada para `rubric_sections`
- [ ] Campos weight, is_critical, source existem
- [ ] DB layer atualizado com novos nomes e tipos
- [ ] Dados de demo com pesos preenchidos

---

### TASK-F2-003 — Adicionar campos configuráveis na tabela `rubrics`

**Regras:** DM-04, RB-16 a RB-20
**Prioridade:** P0 BLOQUEANTE
**Depende de:** TASK-F2-001

**Contexto:** Hoje a tabela `rubrics` tem: id, name, description, is_active, system_prompt, llm_model. Faltam todos os campos que personalizam a experiência por empresa.

**O que adicionar:**
```sql
ALTER TABLE rubrics ADD COLUMN org_id UUID REFERENCES organizations(id);
ALTER TABLE rubrics ADD COLUMN is_default BOOLEAN DEFAULT false;
ALTER TABLE rubrics ADD COLUMN role_label TEXT DEFAULT 'trainer';
ALTER TABLE rubrics ADD COLUMN call_goal TEXT DEFAULT 'close deal';
ALTER TABLE rubrics ADD COLUMN coaching_boundaries TEXT;
ALTER TABLE rubrics ADD COLUMN coaching_tone TEXT DEFAULT 'encouraging'
  CHECK (coaching_tone IN ('encouraging', 'direct', 'balanced'));
ALTER TABLE rubrics ADD COLUMN outcome_options JSONB 
  DEFAULT '["closed", "not_closed", "partial", "no_outcome"]';
```

**Atualizar `lib/db/rubric.ts`:**
- `DbRubric`: adicionar todos os novos campos ao interface
- `dbGetActiveRubric()` → `dbGetDefaultRubric(orgId)`: filtrar por org_id + is_default
- `dbGetRubrics()` → `dbGetRubrics(orgId)`: filtrar por org_id
- Novo: `dbCreateRubric(input)` — owner cria rubrics (RB-09)
- Novo: `dbDeactivateRubric(id)` — soft delete (RB-08, DM-06)

**Critérios de aceite:**
- [ ] Todos os novos campos existem na tabela
- [ ] DB layer tem funções de criação, listagem por org, desativação
- [ ] Constraint: apenas 1 rubric default por org (RB-06)
- [ ] Nenhum hard delete — apenas desativação (DM-06)
- [ ] Dados de demo com campos preenchidos

---

### TASK-F2-004 — Adicionar novos campos na tabela `calls`

**Regras:** DM-02, CL-05, CL-06, CL-09
**Prioridade:** P0 BLOQUEANTE
**Depende de:** TASK-F2-001

**Contexto:** A tabela `calls` atual não suporta: tipo de call, sub-tipo, nome do lead, scores dinâmicos por seção, nem override de score.

**O que adicionar:**
```sql
ALTER TABLE calls ADD COLUMN org_id UUID REFERENCES organizations(id);
ALTER TABLE calls ADD COLUMN call_type TEXT DEFAULT 'sales_call';
ALTER TABLE calls ADD COLUMN call_subtype TEXT;
ALTER TABLE calls ADD COLUMN lead_name TEXT;
ALTER TABLE calls ADD COLUMN caller_name TEXT;
ALTER TABLE calls ADD COLUMN sections_json JSONB;        -- scores por seção dinâmica
ALTER TABLE calls ADD COLUMN suggested_outcome TEXT;      -- CL-26: IA sugere
ALTER TABLE calls ADD COLUMN score_override NUMERIC;      -- owner corrige score
ALTER TABLE calls ADD COLUMN overridden_by UUID;
ALTER TABLE calls ADD COLUMN overridden_at TIMESTAMPTZ;
```

**Atualizar `lib/db/calls.ts`:**
- `DbCall`: adicionar todos os novos campos
- `CreateCallInput`: adicionar leadName, callerName, callType, callSubtype, sectionsJson
- Novo: `dbOverrideCallScore(callId, newScore, userId)` — registra override com audit trail

**Critérios de aceite:**
- [ ] Todos os novos campos existem
- [ ] lead_name e caller_name são obrigatórios no insert (CL-05)
- [ ] sections_json armazena array de `{ sectionId, sectionName, score, feedback }`
- [ ] score_override tem audit trail (quem, quando)
- [ ] Dados de demo migrados

---

### TASK-F2-005 — Refatorar `types.ts` para modelo dinâmico

**Regras:** RB-01, RB-04, CL-14, CL-23/24
**Prioridade:** P0 BLOQUEANTE
**Depende de:** TASK-F2-001 a F2-004

**Contexto:** O `types.ts` atual tem interfaces hardcoded que assumem 5 seções fixas e 4 outcomes fixos. Isso precisa virar dinâmico.

**O que remover:**
- `RubricScores` (interface com 5 campos fixos) → substituir por `SectionScore[]`
- `CallResult` (type com 4 valores fixos) → outcomes vêm do rubric
- `TrainerScore` (interface com marcus/jamie/jordan/taylor) → nomes hardcoded

**O que criar:**
```typescript
// Score por seção — dinâmico
export interface SectionScore {
  sectionId: string
  sectionName: string
  score: number        // 1–5 (SC-01)
  feedback: string     // CL-14
}

// Call atualizada
export interface Call {
  id: string
  orgId: string
  trainerId: string
  trainerName: string
  rubricId: string
  date: string
  duration: string
  overallScore: number      // calculado via SC-06
  result: string            // dinâmico do rubric.outcome_options
  suggestedOutcome?: string // CL-26
  leadName: string          // CL-05
  callerName: string        // CL-05
  callType: string          // CL-06
  callSubtype?: string      // CL-09
  sections: SectionScore[]  // dinâmico — N seções
  summary: string
  strengths: string[]
  improvements: string[]
  transcript: string
  scoreOverride?: number
  overriddenBy?: string
}

// RubricSection atualizada
export interface RubricSection {
  id: string
  rubricId: string
  name: string
  description: string
  weight: number           // 1–100
  isCritical: boolean
  sortOrder: number
  source: 'from_script' | 'ai_suggested' | 'manual'
}

// Rubric atualizado
export interface Rubric {
  id: string
  orgId: string
  name: string
  isActive: boolean
  isDefault: boolean
  roleLabel: string         // RB-16
  callGoal: string          // RB-17
  coachingBoundaries?: string  // RB-18
  coachingTone: 'encouraging' | 'direct' | 'balanced'  // RB-19
  outcomeOptions: string[]  // RB-20
  systemPrompt?: string
  llmModel?: string
  sections: RubricSection[]
}

// Trainer atualizado — sem rubricScores hardcoded
export interface Trainer {
  id: string
  orgId: string
  name: string
  email?: string
  avatar: string
  avatarColor: AvatarColor
  role: Role
  totalCalls: number
  closeRate: number
  closeDelta: number
  score: number
  scoreDelta: number
  lastActive: string
  status: 'active' | 'deactivated'  // US-03
}
```

**Critérios de aceite:**
- [ ] `RubricScores`, `CallResult`, `TrainerScore` removidos — zero referências no código
- [ ] `SectionScore` usado em Call.sections
- [ ] `Rubric` inclui todos os campos configuráveis (RB-16 a RB-20)
- [ ] Build passa (componentes podem precisar de stubs temporários)

---

### TASK-F2-006 — Implementar cálculo de score no backend

**Regras:** SC-04 a SC-09
**Prioridade:** P0
**Depende de:** TASK-F2-005

**Contexto:** Hoje o overall_score é um número fixo retornado pelo mock. Na versão real, a IA retorna apenas scores por seção e o backend calcula o overall.

**O que criar em `lib/services/scoring.ts`:**

```typescript
/**
 * SC-06: Overall score = weighted average
 * SC-08: Pesos não precisam somar 100 — sistema normaliza
 * SC-09: Arredondado para 1 decimal
 */
function calculateOverallScore(
  sections: SectionScore[], 
  rubricSections: RubricSection[]
): number {
  let weightedSum = 0
  let totalWeight = 0
  for (const section of sections) {
    const rs = rubricSections.find(r => r.id === section.sectionId)
    if (!rs) continue
    weightedSum += section.score * rs.weight
    totalWeight += rs.weight
  }
  if (totalWeight === 0) return 0
  return Math.round((weightedSum / totalWeight) * 10) / 10
}

/**
 * SC-04: Display como porcentagem
 */
function scoreToPercentage(score1to5: number): number {
  return Math.round(score1to5 * 20)
}
```

**Critérios de aceite:**
- [ ] `calculateOverallScore` implementado e funciona com N seções
- [ ] `scoreToPercentage` converte 1–5 → 0–100 corretamente
- [ ] Edge cases: 1 seção, pesos desiguais, score 1.0 e 5.0
- [ ] Usado no pipeline de análise (TASK-F2-008)

---

### TASK-F2-007 — Implementar fórmula de Close Rate

**Regras:** DB-01
**Prioridade:** P0
**Depende de:** TASK-F2-005

**Contexto:** Hoje close rate = closed / total. A regra real é: **follow-ups são excluídos do denominador**.

```typescript
/**
 * DB-01: Close Rate = closed / (total - follow_ups)
 * "partial" e outcomes que indicam follow-up são excluídos do denominador
 */
function calculateCloseRate(
  calls: Call[], 
  outcomeOptions: string[],
  followUpOutcomes: string[] = ['partial']
): number {
  const relevantCalls = calls.filter(c => !followUpOutcomes.includes(c.result))
  const closed = relevantCalls.filter(c => c.result === 'closed')
  return relevantCalls.length > 0 
    ? Math.round((closed.length / relevantCalls.length) * 1000) / 10 
    : 0
}
```

**Critérios de aceite:**
- [ ] Follow-ups excluídos do denominador
- [ ] Fórmula usada em: /overview, /me, ranking, alertas, trend
- [ ] Funciona com outcomes customizados (owner pode ter outcomes diferentes)

---

## ÉPICO 1 — Pipeline de Análise pela IA

> O core do produto: call entra → IA transcreve → IA classifica → IA avalia → score aparece.
> Depende do ÉPICO 0 (schema) e da calibração com Ariel (SC-13).

### TASK-F2-008 — Prompt dinâmico montado a partir do rubric

**Regras:** CL-12, CL-13, CL-14, CL-15, CL-16, CL-17, RB-15
**Prioridade:** P0 — core do produto
**Depende de:** TASK-F2-003, TASK-F2-005, TASK-F2-006

**Contexto:** Hoje o prompt é estático. Na versão real, cada empresa tem seu rubric com campos diferentes, e o prompt da IA precisa refletir isso.

**O que construir:**

1. **Prompt assembler** — função que monta o system prompt a partir do rubric:
   ```
   base_prompt
   + "You are evaluating a {role_label} call."                    // RB-16
   + "The goal of this call is to {call_goal}."                   // RB-17
   + "IMPORTANT: {coaching_boundaries}"                           // RB-18
   + "Provide feedback in a {coaching_tone} tone."                // RB-19
   + "Evaluate ONLY these sections: [section definitions]"        // CL-13
   + "Return JSON: { sections: [{name, score, feedback}], ... }"  // CL-14
   ```

2. **Validador de resposta** — após receber JSON da IA:
   - Validar que todas as seções existem no rubric
   - **Remover** seções extras que a IA inventou (CL-15, RB-15)
   - Validar que scores estão entre 1–5 (SC-01)
   - Se JSON inválido ou IA falhou: marcar call como `analysis_failed` (CL-16)

3. **Multi-model** — suportar GPT-4o-mini, Gemini 2.5 Flash, Claude (CL-17)
   - Modelo selecionado no rubric.llm_model ou configuração global

**JSON esperado da IA (CL-14):**
```json
{
  "sections": [
    { "name": "Discovery", "score": 4, "feedback": "Strong open-ended questions..." },
    { "name": "Objection Handling", "score": 2, "feedback": "Got defensive on price..." }
  ],
  "summary": "Well-structured call with room for improvement in objections.",
  "strengths": ["3 open-ended questions before presenting offer", "..."],
  "improvements": ["Practice price reframing", "..."],
  "suggested_outcome": "not_closed"
}
```

**Critérios de aceite:**
- [ ] Prompt montado dinamicamente com todos os campos do rubric
- [ ] Seções extras da IA são removidas antes de salvar
- [ ] JSON inválido → call marcada `analysis_failed` + operador notificado
- [ ] `suggested_outcome` retornado mas NÃO auto-aceito (CL-26)
- [ ] Funciona com GPT-4o-mini, Gemini, Claude

---

### TASK-F2-009 — Call Type Detection

**Regras:** CL-06 a CL-11
**Prioridade:** P1
**Depende de:** TASK-F2-008

**Contexto:** Nem toda gravação é uma call de vendas. A IA classifica o tipo antes de avaliar.

**O que construir:**

1. **Classificador de tipo** — primeiro passo antes da avaliação:
   - `sales_call` → procede para avaliação normal
   - `non_sales` → salva sem score, sem email (CL-07)
   - `rescheduling` → rubric reduzido (CL-08)
   - `support` / `unknown` → salva sem score

2. **Dropdown de sub-tipo** no form de upload (Phase 1: manual — CL-11):
   - `cold_inbound`, `scheduled_followup`, `partner_callback`, `warm_referral`

3. **Ajuste de expectativa** para cold calls (CL-10):
   - Seções de preparação são avaliadas mas flagadas como "not applicable"

**Critérios de aceite:**
- [ ] IA classifica tipo antes do scoring
- [ ] non_sales e unknown pulam scoring completamente
- [ ] Dropdown de sub-tipo no form de upload
- [ ] Cold calls: seções de preparação flagadas, não penalizadas

---

### TASK-F2-010 — Calibração com calls reais (gate de aceite)

**Regras:** SC-13, SC-14, SC-15
**Prioridade:** P0 — GATE DE ACEITE DO PHASE 1
**Depende de:** TASK-F2-008 + critérios do Ariel

**O que é:** Não é uma feature — é um teste de qualidade. O Phase 1 só é considerado entregue quando este gate passar.

**Processo:**
1. Ariel avalia manualmente 10+ calls reais (score por seção)
2. Mesmas calls avaliadas por GPT-4o-mini, Gemini 2.5 Flash, Claude
3. Comparação por seção: score_IA vs score_Ariel
4. Alinhamento precisa ser >80%
5. Se <80%: tuning de prompt até atingir

**Critérios de aceite:**
- [ ] 10+ calls reais com avaliação manual do Ariel
- [ ] Avaliação automática das mesmas calls por 3 LLMs
- [ ] Relatório de comparação com % de alinhamento
- [ ] Alinhamento >80% em pelo menos 1 LLM
- [ ] Prompt final documentado e versionado

**🔴 BLOQUEADO POR:** Ariel e Eliana fornecerem: (a) critérios detalhados por seção e (b) avaliações manuais de 10+ calls.

---

## ÉPICO 2 — Frontend Dinâmico

> Adaptar todas as telas para rubric dinâmico e novas métricas.
> Pode iniciar em paralelo com ÉPICO 0 usando dados mock.

### TASK-F2-011 — Adaptar componentes shared para rubric dinâmico

**Regras:** SC-04, SC-10, RB-01, RB-04
**Prioridade:** P0
**Depende de:** TASK-F2-005

**O que mudar:**

- **`ScorePill`**: receber score 1–5, converter para % via ×20, depois aplicar thresholds (SC-04, SC-10)
- **`RubricBar`**: receber array dinâmico de seções, não 5 fixas. Escala 1–5
- **`CallDetail`**: renderizar N barras (não 5). Mostrar `suggested_outcome` vs outcome confirmado
- **`ScoreCard`**: adaptar para score 1–5 exibido como %
- **Todos**: remover qualquer referência a `RubricScores` ou campos hardcoded

**Critérios de aceite:**
- [ ] Zero referências a `RubricScores` em componentes
- [ ] Componentes renderizam corretamente com 3, 5, ou 8 seções
- [ ] Scores exibidos como % (×20)
- [ ] Thresholds: ≥85% verde, 75–84% âmbar, <75% vermelho

---

### TASK-F2-012 — Atualizar Owner Dashboard (Command Center)

**Regras:** DB-01 a DB-09
**Prioridade:** P1
**Depende de:** TASK-F2-011, TASK-F2-007

**Mudanças na tela `/overview`:**

| Elemento | Ação | Regra |
|----------|------|-------|
| Close Rate | Mudar fórmula — excluir follow-ups do denominador | DB-01 |
| Est. Monthly Revenue | **NOVO** card: close_rate × calls/month × avg_ticket | DB-03 |
| Correlation Engine | **NOVO** card: ranking de seções por correlação com fechamento. Phase 1: mock | DB-04 |
| Revenue Impact Estimator | **NOVO** card: estima ganho por melhoria em cada seção. Phase 1: mock | DB-05 |
| Rubric Gap Detection | **NOVO** card: tópicos sem cobertura no rubric. Phase 1: mock | DB-06 |
| Team Health | Ranking por close rate com delta colorido | DB-07 |
| Active Alerts | Max 3. Prioridade: red > yellow > green | DB-08 |
| Recent Calls | **REMOVER** do dashboard. Calls ficam só no módulo /calls | DB-09 |

**Critérios de aceite:**
- [ ] Close rate usa fórmula correta (DB-01)
- [ ] Card de Est. Monthly Revenue com avg_ticket da org
- [ ] Cards de Correlation, Revenue Estimator, Gap Detection (mock Phase 1)
- [ ] Recent Calls removido
- [ ] Alertas com prioridade correta
- [ ] Health badges calculados (DB-20/21/22)

---

### TASK-F2-013 — Construir Trainer Detail (Coaching Center)

**Regras:** DB-13 a DB-19
**Prioridade:** P1 — TELA NOVA
**Depende de:** TASK-F2-011

**Tela completamente nova — rota sugerida: `/trainers/[id]`**

Seções:
1. **Tabs** para alternar entre trainers (DB-13)
2. **Behavioral Correlation Profile** — 6 dimensões com score e delta vs team avg (DB-14)
3. **Best Call This Week** — 2 cards com calls de maior score + timestamp do momento-chave (DB-15)
4. **Needs Improvement** — 2 cards com calls de menor score + falha específica (DB-16)
5. **AI Coaching Recommendations** — 3 itens acionáveis por trainer (DB-17)
6. **Head to Head** — trainer vs top performer em 3 dimensões (DB-18)
7. **Performance Trend** — line chart: close rate + avg score, 6 semanas (DB-19)

**Critérios de aceite:**
- [ ] Tela renderiza com dados do trainer selecionado
- [ ] Tabs funcionam para alternar trainers
- [ ] Best/Worst calls com timestamp
- [ ] H2H comparison funcional
- [ ] Trend chart com 6 semanas
- [ ] Phase 1: mock onde necessário (behavioral, correlation, recommendations)

---

### TASK-F2-014 — Atualizar fluxo de upload

**Regras:** CL-05, CL-25, CL-26, RB-07
**Prioridade:** P1
**Depende de:** TASK-F2-003, TASK-F2-004

**Mudanças em `/dashboard/upload`:**

| Campo | Ação | Regra |
|-------|------|-------|
| Rubric selector | **NOVO** dropdown com rubrics ativos da org | RB-07 |
| Lead name | **NOVO** campo obrigatório | CL-05 |
| Caller/setter name | **NOVO** campo obrigatório | CL-05 |
| Call sub-type | **NOVO** dropdown: cold_inbound, scheduled_followup, etc. | CL-09, CL-11 |
| Outcome | Mudar para dropdown dinâmico do rubric.outcome_options | CL-23/24 |
| Pós-análise: suggested outcome | **NOVO** IA sugere outcome, humano confirma ou corrige | CL-26 |
| Score override | **NOVO** owner pode corrigir score com audit trail | Decisão confirmada |
| Email | Mudar para botão manual "Send Coaching Email" | CL-20 |

**Critérios de aceite:**
- [ ] Dropdown de rubrics ativos da org
- [ ] lead_name e caller_name obrigatórios
- [ ] Outcomes dinâmicos do rubric selecionado
- [ ] Sub-tipo selecionável
- [ ] IA sugere outcome, humano confirma
- [ ] Score override com audit trail (quem, quando)
- [ ] Email enviado manualmente

---

### TASK-F2-015 — Health Status calculado

**Regras:** DB-20 a DB-23
**Prioridade:** P2
**Depende de:** TASK-F2-004

**Implementar função `calculateHealth(trainer)`:**

| Status | Condição |
|--------|----------|
| Healthy | Ativo nos últimos 7 dias + score estável ou melhorando |
| At Risk | Score caiu >10pts em 2 semanas OU sem calls >7 dias |
| Churning | Sem login >14 dias OU pedido de downgrade |

**Critérios de aceite:**
- [ ] Função implementada com as 3 condições
- [ ] Badge renderizado no Team Health do /overview
- [ ] Phase 1: cálculo on-demand (cron diário fica para Phase 2)

---

## ÉPICO 3 — Onboarding & Acesso

### TASK-F2-016 — Magic link invite para trainers

**Regras:** US-01 a US-06
**Prioridade:** P1
**Depende de:** TASK-F2-001

**O que construir:**
1. UI no dashboard do owner com campo de email + botão "Invite"
2. Backend envia magic link via Supabase Auth
3. Trainer clica → cria conta → vinculado ao org_id do owner automaticamente
4. Owner pode desativar trainer (US-03): status = 'deactivated', mantém dados, bloqueia login
5. Sem self-signup (US-02)

**Critérios de aceite:**
- [ ] Owner consegue convidar trainer por email
- [ ] Magic link funciona e cria conta com org_id correto
- [ ] Trainer desativado perde acesso mas dados permanecem
- [ ] Sem opção de self-signup na tela de login

---

## ÉPICO 4 — Coaching Email

### TASK-F2-017 — Email de coaching via Resend

**Regras:** CL-18 a CL-22
**Prioridade:** P2
**Depende de:** TASK-F2-008

**O que construir:**
1. Template Resend com: lead name, setter name, overall score, scores por seção (barras de progresso), summary, strengths, improvements (CL-18)
2. Tom controlado por `coaching_tone` do rubric (CL-19)
3. Botão "Send Coaching Email" no detalhe da call — manual, não automático (CL-20)
4. Quando rep accounts existirem: rota direto para inbox do trainer (CL-21)
5. Owner recebe cópia BCC sempre (CL-22)
6. NÃO enviar para calls com `analysis_failed` ou `non_sales`

**Critérios de aceite:**
- [ ] Template com todos os campos especificados
- [ ] Tom respeita coaching_tone do rubric
- [ ] Envio manual pelo owner
- [ ] Owner recebe cópia
- [ ] Sem email para calls com erro ou non_sales

---

# PARTE 4 — ORDEM DE EXECUÇÃO

```
FASE A — Schema (semanas 1–2)
  ├── TASK-F2-001  organizations + org_id
  ├── TASK-F2-002  rubric_sections (renomear + campos)
  ├── TASK-F2-003  rubrics (campos configuráveis)
  ├── TASK-F2-004  calls (novos campos)
  └── TASK-F2-005  types.ts refactor

FASE B — Backend Core (semanas 2–3, paralelo com C)
  ├── TASK-F2-006  cálculo de score
  ├── TASK-F2-007  fórmula close rate
  ├── TASK-F2-008  prompt dinâmico + validação
  └── TASK-F2-009  call type detection

FASE C — Frontend (semanas 2–4, paralelo com B)
  ├── TASK-F2-011  componentes shared
  ├── TASK-F2-012  owner dashboard (command center)
  ├── TASK-F2-013  trainer detail (coaching center) — NOVO
  └── TASK-F2-014  fluxo de upload

FASE D — Acesso & Email (semanas 4–5)
  ├── TASK-F2-015  health status
  ├── TASK-F2-016  magic link invite
  └── TASK-F2-017  coaching email

GATE — Calibração (paralelo, depende do Ariel)
  └── TASK-F2-010  calibração >80% com calls reais
```

---

# PARTE 5 — FORA DO ESCOPO (Phase 2+)

| Feature | Phase | Por quê |
|---------|-------|---------|
| Correlation Engine real (DB-04) | Phase 2 | Precisa de volume de dados reais |
| Revenue Impact Estimator real (DB-05) | Phase 2 | Precisa de dados históricos |
| Rubric Gap Detection real (DB-06) | Phase 2 | Cron semanal + volume de calls |
| AI Insights real (V11) | Phase 2 | Cron semanal, sem RAG |
| Re-scoring de calls antigas (RB-12) | Phase 2+ | Job queue |
| Behavioral scoring real (V12) | Phase 4 | GPT-4o Audio |
| Twilio integration (INT-01 a INT-08) | Phase 3 | Webhooks, filas, retry |
| Trainer self-upload (CL-02) | Phase 2 | Rep accounts |
| CS role (Phase 2) | Phase 2 | Novo papel operacional |
| Admin panel real | Adiado | Decisão do time |
| Billing / Stripe | Futuro | Não definido |

---

# PARTE 6 — COMO VERIFICAR

| Teste | O que validar |
|-------|--------------|
| **Schema** | Rodar migrations, verificar RLS: Owner A não vê dados de Owner B |
| **Score** | Unit test: 3 seções com pesos 25/20/15, scores 4/3/5 → overall = 3.9 → display 78% |
| **Close Rate** | 10 calls (3 closed, 3 follow-up, 4 not_closed) → rate = 3/7 = 42.8%, **NÃO** 3/10 = 30% |
| **Rubric dinâmico** | Criar rubric com 3 seções, outro com 7. UI adapta em todas as telas |
| **Prompt** | Enviar call real. Verificar que IA só retorna seções do rubric. Seções extras são removidas |
| **Calibração** | 10 calls: IA vs Ariel. Alinhamento >80% por seção |
| **RLS** | Login como Owner A, chamar API de calls, verificar que retorna 0 calls de Owner B |
| **Email** | Enviar coaching email. Verificar tom (encouraging vs direct). Owner recebe cópia |

---

*Documento consolidado em 09/04/2026 · Fontes: AskMoses-Business-Rules.pdf (Victor Slompo) + Decision Log Fase 2 + Código atual*
