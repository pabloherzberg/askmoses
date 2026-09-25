# AskMoses — Insights Engine (Admin)
**Spec de feature · v0.1 (MVP)**
Base: call Ariel Bacal × Victor Slompo — 03/09/2026
Driver de prazo: **webinar com dog trainers em outubro/2026**

---

## 1. Problema e objetivo

O AskMoses já processa e armazena um volume relevante de calls (SPAR/script, intent analysis, marketing insights), mas hoje esse dado só existe **por call e por org**. Não há nenhuma camada agregada.

O Ariel precisa dessa camada agregada por dois motivos comerciais:

1. **Conteúdo de marketing.** Referência explícita ao modelo Gong: o ativo de marketing mais forte do produto é o próprio dado. O webinar de outubro não deve vender AskMoses — deve entregar insights de mercado ("é assim que os dog trainers estão vendendo"), e a ferramenta aparece como consequência.
2. **Retenção e engajamento de clientes.** Ariel quer reuniões quinzenais com cada org onde ele abre o admin e mostra: "isto é o que aconteceu nas suas calls, e é assim que você se compara ao mercado".

> Objetivo do MVP: dar ao Ariel uma tela de admin onde ele seleciona um recorte (indústria inteira ou uma org) e obtém insights agregados prontos para exportar/apresentar.

---

## 2. Escopo do MVP

**Admin-only.** Nada disso é exposto para as orgs clientes nesta fase. É ferramenta de sales engine do Ariel.

### 2.1 Módulo A — Word Cloud / "Mind Map" de linguagem do lead

Visualização de frequência de termos, onde o tamanho da palavra reflete a recorrência nas calls.

- Fonte: dados de marketing insights + transcrições já processadas.
- Recortes: **indústria** (todas as calls, todas as orgs) e **por org**.
- Interação mínima: clicar num termo expande contexto (calls/trechos em que aparece).
- Precisa de **nome comercial próprio** — será compartilhado com clientes. Ariel e Victor conversaram sobre "AskMoses Mind Map" ou similar. *Decisão pendente.*

#### Referência visual (enviada pelo Ariel)

Word cloud clássico, monocromático, hierarquia dada apenas por tamanho e peso da fonte. É o formato certo para o objetivo — legível em screen-share e imediato de entender sem legenda.

Três problemas visíveis na referência que precisam ser resolvidos na nossa implementação:

1. **Termos funcionais dominam.** Na referência, as palavras maiores são "media", "page", "content", "click" — vocabulário do domínio, não insight. Traduzido para o AskMoses: "dog", "training", "call", "price" vão ocupar o centro e não dizem nada ao cliente. Isso mata a feature como material de venda.
   → Solução: além de stopwords genéricas, uma **stoplist por indústria** e, principalmente, ponderação por **distintividade** (tipo TF-IDF): o termo aparece mais nesta org / neste recorte do que na média? É essa métrica que produz "estes são os pain points que *você* está encontrando", que é o insight que o Ariel quer vender.
2. **Cauda longa vira ruído.** A referência mostra ~200 termos, com dezenas ilegíveis nas bordas. Sugiro cap de **60–100 termos** exibidos, com o resto acessível por drill-down.
3. **Sujeira de pipeline.** A referência tem artefatos claros (URL colada, contrações quebradas). Precisamos de normalização: lowercase, lematização, remoção de URLs/números, merge de plural/singular.

Além disso, a referência é **estática** — o Ariel pediu clique para expandir contexto, então isso é adição nossa.

### 2.2 Módulo B — Correlação script × fechamento

Correlação entre as **5 seções do script** (discovery, etc.) e o resultado da call (closed / not closed).

- Pergunta-alvo típica: "se você faz perguntas de discovery, sua probabilidade de fechamento é maior?"
- Saída: taxa de fechamento por seção executada / não executada, com volume amostral visível.

### 2.3 Módulo C — Correlação intent analysis × fechamento

Mesma lógica do Módulo B, usando o **grade do intent analysis** como variável independente: qual faixa de nota correlaciona com fechamento.

### 2.4 Módulo D — Comparativo org × indústria

Camada transversal aos módulos A–C: o mesmo indicador mostrado lado a lado, org vs. média da indústria.

- É o que sustenta a conversa quinzenal: "sua conversão está acima/abaixo do mercado", "estes são os pain points que você não está endereçando".

---

## 3. Decisões técnicas já tomadas na call

| Tema | Decisão |
|---|---|
| Ferramenta de BI | **Não** usar Tableau / Looker Studio / Power BI. Construir dentro do admin, em TypeScript. |
| Processamento | Processo **determinístico** sobre o que já está no banco. Não é um quarto pipeline de LLM. |
| Persistência | Nova tabela agregada (termos + frequência + correlações) por org e por indústria. |
| Frequência | Batch recorrente (alinhar com o job existente de segunda-feira). |
| Amostra inicial | 20–50 calls fechadas top-performance para validar os primeiros insights antes de rodar tudo. |
| Filosofia | MVP. Dado pode ser estático nesta fase. Não sobre-engenheirar — o objetivo é validar se isso traz cliente. |

**Nota de arquitetura (Victor):** hoje existem três processamentos independentes — SPAR/script, intent analysis e marketing insights. O Insights Engine é uma quarta camada, mas de **agregação**, não de inferência. O trabalho real é: mapear como os dados estão salvos hoje → definir o schema agregado → job de agregação → UI com seletor de recorte.

---

## 4. UX mínima

**Premissa central:** a interface não é uma tela interna de análise — ela **é o material de apresentação**. O Ariel vai abrir o admin ao vivo, em call com o cliente, e conduzir a conversa por ela. Isso muda os requisitos:

- Nada de clutter de admin (IDs, logs, campos técnicos) na área visível.
- Tipografia grande o suficiente para screen-share comprimido.
- O sistema deve **guiar a conversa**: a tela precisa ter uma ordem de leitura óbvia (o que está acontecendo → como se compara ao mercado → o que fazer a respeito), porque o Ariel navega falando.

Fluxo:

1. Entrada pelo admin.
2. Seletor de recorte: `Indústria (todas as orgs)` | `Org específica`.
3. Painel com os módulos A–D.
4. Export: o Ariel precisa levar isso para reels, webinar e reunião de cliente. Mínimo viável: export de imagem/CSV ou a própria tela em compartilhamento.

---

## 5. Fora de escopo (nesta fase)

- Exposição da feature para orgs clientes (self-service).
- Qualquer novo processamento de LLM.
- Dashboards configuráveis pelo usuário.
- Billing dinâmico via Stripe (ver seção 7).

---

## 6. Pendências e bloqueios

| # | Item | Responsável | Status |
|---|---|---|---|
| 1 | Verificar se **Script Intelligence** e **Marketing Insights** estão de fato atualizando (job de segunda-feira) — Ariel relata que não vê atualização | Victor → time | **Aberto — checar antes de tudo.** Se o pipeline base estiver parado, a agregação nasce com dado velho. |
| 2 | Referências de design do word cloud / mind map (Ariel vai gerar no Claude e enviar) | Ariel | Aguardando |
| 3 | Nome comercial da visualização | Ariel + Victor | Aberto |
| 4 | Mapeamento do schema atual (como marketing insights e intent analysis estão persistidos) | Victor / Pablo | Pré-requisito do dev |
| 5 | Eliana faria as correlações originalmente; está indisponível (universidade). O trabalho passa a ser produto, não análise ad hoc. | — | Contexto |

---

## 7. Assunto paralelo: pricing (não faz parte desta feature)

Registrado aqui só para não se perder:

- **Confirmado:** o sistema já cobra apenas calls classificadas como *sales call*. Ariel confirmou.
- **Novo modelo:** cliente que **não** faz marketing com o Ariel → **US$ 6 por hora de sales call + US$ 200 de mínimo**. Cliente com marketing → US$ 4/h (modelo atual).
- **Implementação hoje:** integração Stripe existente suporta apenas **planos de valor fixo** (produtos criados no Stripe e referenciados no AskMoses). Ação de curto prazo: renomear/duplicar os planos para refletir "com marketing" / "sem marketing" e configurar os valores fixos.
- **Pedido do Ariel:** cobrança **dinâmica** — o AskMoses calcula o valor total (mínimo + minutos) e envia o valor para o Stripe.
- **Resposta do Victor:** é factível e não é complexo, mas exige um tipo diferente de integração. **Adiado.** Por ora, Ariel lança manualmente.

---

## 8. Sequência sugerida

1. **Checar o job de atualização** (pendência #1) — sem isso, nada mais importa.
2. Mapear schema atual e desenhar a tabela agregada.
3. Rodar agregação sobre uma amostra de 20–50 calls fechadas e validar os insights com o Ariel **antes** de construir UI.
4. Construir Módulo A (word cloud) — é o que tem maior impacto visual no webinar.
5. Módulos B e C (correlações).
6. Módulo D (comparativo org × indústria).
7. Export.

Alvo: material utilizável em outubro. Se o prazo apertar, os Módulos A + B já sustentam o webinar sozinhos.
