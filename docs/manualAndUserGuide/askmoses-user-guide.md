# AskMoses.AI — User Guide

**Understanding your sales coaching platform — what every screen shows and how to read it**

Version 1.5 · September 2026
Supersedes v1.4 (September 2026). Section 4.4 revised: the Coaching Drivers panel is now labelled as team averages. In v1.4, section 6.1 was revised against the weekly Script Intelligence of PR #238 (`77915b5`, 30 September 2026).

---

## Contents

1. [Welcome](#1-welcome)
2. [Getting Started](#2-getting-started)
3. [Understanding Your Scores](#3-understanding-your-scores)
4. [The Owner Dashboard](#4-the-owner-dashboard)
5. [Analytics](#5-analytics)
6. [Coaching Insights](#6-coaching-insights)
7. [Setting up a client's sales script](#7-setting-up-a-clients-sales-script)
8. [Call History](#8-call-history)
9. [Your Personal Dashboard (for reps)](#9-your-personal-dashboard)
10. [Reading a Call in Detail](#10-reading-a-call-in-detail)
11. [Buying Intent](#11-buying-intent)
12. [Appointments](#12-appointments)
13. [Marketing Intelligence](#13-marketing-intelligence)
14. [Plans and Billing](#14-plans-and-billing)
15. [Frequently Asked Questions](#15-frequently-asked-questions)

---

## 1. Welcome

AskMoses.AI turns your sales calls into structured coaching. It listens to every conversation, scores it against your own sales playbook, and tells each rep exactly where they are strong and where they can improve — automatically, after every call.

This guide explains what each screen shows and, just as importantly, how to read the numbers. Sales metrics can be measured in many valid ways, and knowing which question a number answers is what turns a dashboard into a decision. By the end of this guide you will know what every figure means and how to act on it.

The platform serves three kinds of user, and each sees a view tailored to them. Wherever a feature is specific to one role, you will see a marker like this: **`OWNER`**

---

## 2. Getting Started

### 2.1 Roles and what each one sees

| Role | Home screen | What they can do |
|---|---|---|
| **`REP`** | My Page | See their own calls, scores, and personal coaching. Focused entirely on their own growth. |
| **`OWNER`** | Dashboard | See the whole team — every rep, every call, team trends, and coaching tools for the group. |
| **`ADMIN`** | Admin Panel | Platform-level management across organisations. Reserved for the AskMoses team. |

> **GOOD TO KNOW**
>
> Reps see only their own data — never a teammate's scores or the team ranking. This is intentional: the rep view is a private coaching space, so people engage with their feedback honestly rather than defensively.

### 2.2 How a call becomes a coaching report

Every call follows the same journey, whether you upload it by hand or it arrives automatically from your CRM:

1. **The call is captured** — uploaded as audio, or pulled automatically the moment your CRM records it.
2. **It is transcribed** — the audio becomes an accurate written transcript.
3. **It is analysed** — the AI reads the transcript against your sales playbook, not a generic template.
4. **You get a report** — a score for each part of the conversation, written feedback, clear strengths, and specific things to improve.

> **GOOD TO KNOW**
>
> Because the analysis uses your own playbook, the coaching reflects how your business sells — your discovery questions, your objection responses, your close. You define what "good" looks like in the Script Builder, and every call is measured against that.

> **GOOD TO KNOW**
>
> A call is never lost because of who it belongs to. When AskMoses cannot match a call to one of your reps, it is analysed like any other and assigned to a system rep called **Front Desk - AskMoses**. There are two cases:
>
> - **The CRM user is not linked to a rep yet.** The call waits in Front Desk. As soon as that CRM user is linked to a rep who has accepted their invitation, their Front Desk calls move to the rep automatically.
> - **The CRM sent no user at all.** This is typical of an inbound call from a brand-new lead whose contact has no owner in the CRM yet. With no user to match, the call **stays in Front Desk permanently**.

---

## 3. Understanding Your Scores

### 3.1 The 0–5 rating

Every call receives an overall score from 0 to 5, shown with one decimal — for example, **4.2 out of 5**. Each part of the call is rated the same way, so you can see not just how a call went but exactly which moment lifted or lowered it.

> **Overall score = the weighted average of the section scores**
>
> Each section counts in proportion to the weight set for it in your script. With weights of 20% / 5% / 25% / 25% / 25% and section ratings of 4.5, 2.0, 4.0, 4.0, 4.0, the call scores **4.0** overall. A plain average would give 3.7 — the weak section carries only 5% of the weight, so it pulls the score down much less.
>
> If a script has no weight on one or more of its sections, every section counts equally (a plain average).

> **GOOD TO KNOW**
>
> The overall score measures **how well the call was run** — not whether it closed. A rep can run an excellent call that a customer simply was not ready to buy, and a weaker call can close because the customer arrived ready. Keeping the score about execution is what makes it fair and useful for coaching. Whether the deal closed is tracked separately, as the call outcome.

### 3.2 The five coaching dimensions

Every call is scored across the same five stages of a sales conversation. Your script supplies the wording for each stage — your questions, your offer, your objection responses — and sets how much each stage weighs; the five stages themselves stay fixed (see section 7).

| Dimension | What it measures |
|---|---|
| Discovery | How well the rep understood the customer's situation and needs |
| Problem Agitation | Whether the rep helped the customer feel the cost of not solving the problem |
| Offer Presentation | How clearly and compellingly the solution was presented |
| Objection Handling | How well concerns and hesitations were addressed |
| Close & Next Steps | Whether the rep secured a clear commitment or next action |

### 3.3 Colours at a glance

Scores are colour-coded everywhere in the product, so you can scan a screen and know instantly where to look.

| Colour | Score | Meaning |
|---|---|---|
| 🟢 Green | 4.25 – 5.0 | Strong. This is a model to learn from. |
| 🟠 Amber | 3.5 – 4.2 | Solid, with room to sharpen. |
| 🔴 Red | Below 3.5 | Needs coaching attention. |

### 3.4 Call outcomes

Alongside the score, each call records how it ended. This is kept separate from the score on purpose.

| Outcome | Meaning |
|---|---|
| **Closed** | The deal moved forward on this call — either won outright, or advanced with a scheduled follow-up or another decision-maker brought in. |
| **Not Closed** | The call ended without the deal advancing. This also covers calls where no result could be determined. |

> **CHANGED IN v1.1**
>
> Outcomes used to have four values: Closed, Partial, Not Closed, and No Outcome. They were simplified to two. **Partial now counts as Closed** (the deal advanced), and **No Outcome now counts as Not Closed** (an ambiguous result is, in practice, not a close).
>
> This matters if you are comparing against older reports: a close rate calculated today will be **higher** than the same period calculated under the old four-value scheme, because follow-ups now count as closes. The change was applied to historical calls too, so your own screens are internally consistent — but a number you wrote down before the change will not match.

---

## 4. The Owner Dashboard `OWNER`

Your command centre. In one screen it answers the three questions you ask most: is the team selling well, who needs my attention this week, and what should we improve?

### 4.1 Average Close Rate

> **Close Rate = closed calls ÷ sales calls with a result**
>
> Counted across every sales call the team has ever made that has a result (closed or not closed). Two kinds of call are left out:
>
> - calls identified as *Not a Sales Call* (voicemails, logistics, existing customers — see section 8);
> - calls that never got a result, because the recording was missing, the transcription failed, or the call is still being processed. Nobody knows yet whether they closed, so they don't count as "not closed".

This is your headline number: of all the sales calls your team has made, what share resulted in a closed deal.

> **GOOD TO KNOW**
>
> This figure counts every sales call equally, across the whole team and your entire history. A rep who made 50 calls and a rep who made 5 both contribute exactly the calls they made — no single person's numbers distort the team picture. That makes it a stable, honest measure of overall sales performance that is hard to skew. The small trend indicator beside it shows how recent weeks compare, so you can see momentum at a glance.

### 4.2 Team Average Call Score

The average quality of your team's calls, on the 0–5 scale. Read together with the close rate, this separates two very different situations: a low close rate with high scores points to a lead-quality or pricing issue, while a low close rate with low scores points to a coaching opportunity.

> **GOOD TO KNOW**
>
> Only calls that were actually scored count. A call that has no score yet (missing recording, failed transcription, still processing) is left out rather than counted as zero. Likewise, a rep only counts toward this average once they have at least one scored call, so inviting a new team member never makes your team score suddenly drop.

### 4.3 Total Calls and Active Sales People

Your team's total activity and headcount. These give context to every other number — a close rate based on 200 calls is far more reliable than one based on 5.

### 4.4 Coaching Drivers

Your team's average score in each coaching dimension, coloured with the same bands used everywhere else in the product (§3.3), so strengths and weaknesses stand out at a glance. This is where you decide what to focus training on next: the dimensions in red are where the team scores lowest and coaching has the most room to help.

### 4.5 Team Health

A per-rep summary of recent activity and performance, designed to answer "who should I talk to this week?"

| Status | Meaning |
|---|---|
| Active | Made a call within the last day |
| Recent | Active within the last week |
| Away | No calls in over a week |

> **GOOD TO KNOW**
>
> Each rep's stats here refresh whenever a new call of theirs is analysed. If you have just uploaded a batch of calls, give it a moment for the numbers to catch up.

### 4.6 Close Rate Trend

Your team's close rate over the last six weeks, one point per week. The line shows whether coaching is moving the needle over time.

> **GOOD TO KNOW**
>
> A week with no calls appears as a **gap** in the line, not as a zero. This is deliberate — showing 0% would suggest the team failed to close, when in fact no calls were made that week. The gap tells the true story.

### 4.7 Score by Sales Person

A grid comparing each rep across every coaching dimension. The top score in each dimension is highlighted, so you can instantly see who your reference performer is for Discovery, for Closing, and so on — and pair them with a teammate who needs to grow there.

### 4.8 AI Insights

A set of automatically generated observations that read your recent calls and surface patterns worth acting on — a strong performer worth learning from, a rep who may need support, an area to focus coaching next. A quick prompt for where to look.

### 4.9 Won Rate

> **Won Rate = leads who became paying clients after scheduling on a call ÷ leads who scheduled an evaluation**
>
> Counted across the whole team and your entire history. A lead becomes a paying client when their deal is marked **Won** in your CRM.

Where the close rate tells you how often a call books the evaluation, the Won Rate tells you how many of those bookings turned into paying clients.

> **GOOD TO KNOW**
>
> - **Counted per lead, not per call.** A lead who spoke to your team several times counts once.
> - **Only a Won that happens after the call counts.** A lead who was already a client before the call where they scheduled — for example, a past customer booking a new evaluation — is not counted as a new win. The call didn't produce that sale.
> - **A Won is never taken back.** Once a lead is Won in your CRM, they stay Won here, even if the deal is later reopened or moved in the CRM.

---

## 5. Analytics `OWNER`

A deeper view of your team's performance over time, for when you want to go beyond the dashboard summary.

**5.1 Performance Trend** — Your team's average call score over time, so you can see the shape of your progress.

**5.2 Top Improvement Areas** — Your coaching dimensions ranked weakest-first — a direct answer to "what should our next training session cover?"

**5.3 Outcome Breakdown** — A count of how your calls ended — closed and not closed — with your overall close rate.

**5.4 Conversion Leaderboard** — Your reps ranked by close rate, so top performers are recognised and coaching can be targeted where it is needed.

**5.5 Achievements** — Highlights that celebrate wins — your highest-scoring coach, perfect calls, and reps on an upward trajectory. A light way to keep the team motivated.

---

## 6. Coaching Insights `OWNER`

AskMoses reads your real conversations and helps you keep your sales playbook sharp.

### 6.1 Script Intelligence

Every week, AskMoses proposes the **AskMoses network script**: one shared script, generated automatically from what is working across the businesses on the platform. You review it next to your current script and decide whether to adopt it. Nothing changes until you approve.

**How the weekly suggestion is built**

- **Source:** the **3 best calls** of each business on the platform that closed on the call **and** became a Won deal in the CRM in the last **90 days**. "Best" means the highest-scoring calls.
- **Who contributes:** a business needs at least 3 such calls to take part that week. Demonstration and test accounts never take part.
- **One script for everyone:** the AI reads those winning calls, extracts the patterns they have in common (the discovery questions, how objections were answered, how the close was made) and writes **one** script in the 5 standard sections: Discovery, Problem Agitation, Offer Presentation, Objection Handling, Close & Next Steps.
- **Anonymized:** before the script is saved, AskMoses automatically replaces any price with *[price]*, the names of the contributing businesses with *[business name]*, and the names of the reps and customers in the calls used with *[name]*. The AI is also instructed to leave out the names of dogs, brands and places; that part relies on the AI and is not checked automatically.
- **Every week:** a new suggestion replaces the one from the previous week if you did not act on it.

> **IMPORTANT**
>
> - **This is not an analysis of your calls only.** The suggested script is the network standard: every business receives the same one, built from winning calls across the network. Your own calls may or may not be among them.
> - **Your active script never changes on its own.** It changes only when you approve the suggestion.
> - **Adopting it replaces your playbook.** Calls from then on are scored against the network script. If your business sells differently, keep your own script and use the suggestion as a source of ideas.

> **GOOD TO KNOW**
>
> Next to the suggestion, the screen shows the AI's comparison of your current script and the suggested one, read against your own recent calls. Treat the scores and percentages there as the AI's **qualitative read**, not as measurements. The health score and the uplift figures beside suggested phrases are the model's assessment — they are not derived from your close-rate data. The value is in the language suggestions; weigh those on their merits.
>
> If your business has no calls yet, the suggestion still arrives, but without that comparison.

### 6.2 Script Gap Detection

This looks for moments of friction in real conversations that your current script does not yet address — a recurring objection, a question reps struggle with — and proposes a targeted addition. Each finding shows how often it appeared across the calls reviewed, so you can prioritise the gaps that come up most.

> **GOOD TO KNOW**
>
> This feature reads **three** calls at a time, so a frequency badge can only read 33%, 67%, or 100%. Read it as "this came up in 1, 2, or 3 conversations" rather than as a fine-grained statistic. Results refresh weekly.

---

## 7. Setting up a client's sales script `ADMIN`

How the AskMoses team turns the script a client sends us into the playbook their calls are scored against.

**Where:** in the Admin Panel sidebar, open **Rubric Config** and click **New Script**. The form is titled **Create New Sales Script**.

> **IMPORTANT**
>
> - **Always exactly five sections, with these names, in this order:** Discovery, Problem Agitation, Offer Presentation, Objection Handling, Close & Next Steps. Never rename them, and never use **Add Section** to create a sixth.
> - **Never leave a section empty and never remove one.** If the client's script has nothing that fits one of the five, use a short generic text for it and tell the client that section is a placeholder for them to rewrite. An empty section drags down the score of every call for a reason that has nothing to do with the sale.
> - **The weights must add up to exactly 100%.** The **Create & Generate Criteria** button stays disabled until they do.
> - **An organisation has a single owner.**

### 7.1 Step by step

1. **Script Name.** Use the owning organisation's name followed by the name of its script — for example, *Happy With Dogs — Script for IC*.

2. **Description.** Paste the client's **original** script here, complete and unchanged. It stays as the permanent record of exactly what the client sent us.

3. **Map the script to the five sections.** In parallel, open Claude (or another AI assistant) and ask it to convert the original script into the five AskMoses sections. Use this prompt as it is, pasting the client's script at the end:

   ```text
   Below is a client's sales script. Map it into exactly these five sections, in this order: Discovery, Problem Agitation, Offer Presentation, Objection Handling, Close & Next Steps.
   Rules:
   - Keep the client's wording exactly as written. Do not rewrite, shorten or reorder anything inside a block.
   - Keep the client's original step numbers next to each block so it can be traced back.
   - If the script has NO content for one of the five sections, say so explicitly at the top of your answer, and write a short generic version for that section, clearly labelled as a placeholder for the client to rewrite.
   - List separately any parts of the script that don't belong to any section (e.g. opening/rapport, service-area checks) — they are left out of scoring.
   - Flag any contradictions, such as the same price appearing with different values.
   - Suggest weights for the five sections that add up to exactly 100%, with Problem Agitation never below 5%.
   [paste the client's script here]
   ```

4. **Fill in the five sections** with the AI's answer. The form starts with one section row: click **Add Section** until there are exactly five. For each row:
   - **Section name** — the exact name of the standard section.
   - **Instructions** — the client's text mapped to that section.
   - **Weight** — the suggested weight.

5. **Save and put the script into use.** Click **Create & Generate Criteria**. Saving alone does **not** change how the client's calls are scored:
   - From the Admin Panel, send the script to the client's organisation (**Send script**).
   - The owner sees *"A new script version is awaiting your approval"* and must click **Accept & activate**. Tell the owner which script to approve **by its name** — organisation name, then script name, for example *Happy With Dogs — Script for IC*. Other versions may also be waiting, such as the weekly script suggestion. Until they approve, their calls keep being scored against the previously approved script.
   - Once it is active, confirm that the organisation's next calls are scored against the new script.

> **GOOD TO KNOW**
>
> Parts of the client's script that fit none of the five sections — the opening, rapport, checking the customer is in the service area — are deliberately left out. They still matter on the call, but they are not what the score measures.

---

## 8. Call History `OWNER`

A complete, searchable record of every analysed call.

Browse and search your team's calls, filter by rep or outcome, and open any call to see its full analysis. Calls with the same customer are grouped together, so you can follow a deal across multiple conversations.

> **GOOD TO KNOW**
>
> The **Calls** screen opens filtered to **Closed** and **Not Closed**. Calls identified as *Not a Sales Call* are hidden until you tick them in the result filter, and calls still being analysed always appear. If a call seems to be missing, check the result filter first.

> **GOOD TO KNOW — Calls that are not scored**
>
> Voicemails, messages left for someone, and logistics calls or calls with existing customers (rescheduling, directions, questions about a service already booked) are usually classified as **Not a Sales Call**. They get no score and are hidden by the default filter. This is intentional: there is no selling in them to coach, and counting them would drag down your close rate. The classification is the AI's judgement of whether any selling took place, so an occasional call can land on the other side.

---

## 9. Your Personal Dashboard `REP`

Your private coaching space. Everything here is about your growth, and only you and your manager see it.

### 9.1 Your KPI cards

Four numbers summarise your recent performance, and you can switch between a 2-, 4-, or 6-week window:

| Card | What it shows |
|---|---|
| My Score | Your average call quality in the selected window |
| Close Rate | The share of your calls that closed |
| Calls | How many calls you made |
| Closed | How many you won |

> **GOOD TO KNOW**
>
> Each card shows your window figure prominently, with your **lifetime** figure in smaller text underneath — so you can see both "how am I doing lately?" and "how do I look overall?" at once. The little arrow shows how you have moved compared with before. If you see no arrow at all, it means nothing changed.

### 9.2 Your coaching

Below your numbers you will find personalised coaching based on your calls — what is working, what to practise, and specific suggestions. This is generated from your own conversations, so it reflects how you actually sell.

---

## 10. Reading a Call in Detail

The full analysis of a single conversation — the most valuable coaching surface in the product.

Opening any call shows you:

- **The overall score**, colour-coded, front and centre.
- **A score and written note for each dimension** — not just the number, but *why* the AI rated it that way, grounded in what happened in the call.
- **Strengths** — what the rep did well, worth repeating.
- **Improvements** — specific, actionable things to do differently next time.
- **Buying intent** — how ready the customer was to purchase (see section 11).
- **The outcome** — how the call ended.
- **Actual close** **`OWNER`** — whether the customer actually became paying: *paying*, *not paying*, or *pending*. When the deal is marked **Won** in your CRM, the call is set to *paying* automatically. Anything you set by hand is kept — the CRM never overwrites it.

> **GOOD TO KNOW**
>
> The per-section notes are where the real coaching lives. A score tells a rep that a section was weak; the written note tells them **what to say differently**. Encourage reps to read these, not just the numbers.

---

## 11. Buying Intent

A measure of how ready each customer was to buy — separate from how well the rep performed.

For every call, the platform assesses the customer's buying intent on a 0–5 scale, built from four signals it reads in the conversation:

| Signal | Question it answers |
|---|---|
| **Financial** | Does the customer have budget for this, and how did they react to the price? |
| **Urgency** | Is there a specific, pressing reason driving the call, or just casual interest? |
| **Authority** | Can this person make the final decision without consulting anyone else? |
| **Engagement** | Are they asking detailed questions and thinking about next steps, or giving short, vague answers? |

Each signal carries a weight, and the four weights are configurable for your organisation. By default each counts for 25%.

> **GOOD TO KNOW**
>
> Intent answers the question behind every disappointing call: **was it a bad call, or a bad lead?** A rep with low close rates but consistently low-intent conversations has a lead-quality challenge, not a selling one — and that changes how you coach them. It also feeds Marketing Intelligence, helping you attract more of the customers who are ready to buy.

---

## 12. Appointments

For teams connected to the CRM, each call can show the lead's **scheduled appointment** alongside the conversation — when it is booked for and what state it is in (booked, confirmed, cancelled, showed, or no-show).

This sits next to the **Call Date** — the date the conversation actually happened, which is not always the date it was uploaded. Together they let you follow a lead from the call through to whether they actually turned up.

> **GOOD TO KNOW**
>
> Appointment data is pulled from your CRM on a schedule, not the instant it changes. A booking made moments ago may take a little while to appear.

---

## 13. Marketing Intelligence `OWNER`

Turns your best calls into marketing fuel.

The platform studies your strongest closed calls and extracts the language that works — the phrases, angles, and objection responses that land when everything goes right. It packages these as ready-to-use suggestions for your ads and outreach, refreshed each week.

> **GOOD TO KNOW**
>
> The best marketing copy often already exists — in the words your top reps use when they win. This feature surfaces that language so your acquisition and your sales floor speak with one voice.
>
> The confidence bar on each suggestion is the AI's own read of how strong the signal was, not a statistical confidence interval. The "based on N calls" badge, however, is the real sample size.

---

## 14. Plans and Billing

### 14.1 Choosing a plan

| Plan | Sales people | Calls / month | Highlights |
|---|---|---|---|
| **Starter** | Up to 5 | 200 | Manual upload, AI analysis, post-call coaching email |
| **Pro** | Up to 15 | 1,000 | Everything in Starter, plus automatic call capture from your CRM |
| **Pro + RAG** | Unlimited | Unlimited | Everything in Pro, plus a knowledge base the AI draws on for richer coaching |

Owners do not count against the seat limit — only reps do. The monthly call allowance runs on the calendar month.

### 14.2 How usage-based billing works

> **You are billed per minute of call analysed.**
>
> - Each call is rounded **up** to the next whole minute.
> - Calls under **30 seconds** are not billed.

> **GOOD TO KNOW**
>
> The 30-second minimum means misdials and instant hang-ups never appear on your bill. Rounding up per call is standard, transparent, and easy to reconcile against your call log. You are charged monthly for what you actually used.

---

## 15. Frequently Asked Questions

**Why did a call that closed get a low score?**

The score measures how well the call was **run**, not whether it closed. Some customers arrive ready to buy, and a rep can win without a textbook conversation. Separating the two is what makes the score useful for coaching — it shows where a rep can still grow even on a winning call.

**Why did an excellent call not close?**

For the same reason in reverse: a rep can do everything right with a customer who was never going to buy today. That is exactly where buying intent (section 11) helps — a high-scoring call with low intent tells you the rep performed well and the lead simply was not ready.

**My close rate went up and nobody did anything differently. Why?**

Outcomes were simplified from four values to two, and calls that used to be marked "Partial" now count as **Closed** (see section 3.4). If your close rate jumped around that change, this is why. It is a change in definition, not in performance.

**My team's numbers look different on two screens — why?**

Different screens answer different questions. Your dashboard close rate covers your **entire history**; a trend line covers **recent weeks**; a rep's personal page covers the **window they have selected**. Each is correct for what it measures. When comparing, always check the time period each number covers.

**A week shows no data on the trend chart. Is something wrong?**

No — a gap means no calls were made that week. The chart deliberately shows a gap rather than a zero, so that "no activity" is never mistaken for "no closes".

**Why might a score appear on a different scale?**

In the product, scores are always shown on a **0–5** scale. Internally the platform works on a **0–100** scale — a 4.2 on screen is an 84 underneath. If you ever encounter the larger number, for example through a data export or a direct integration, it is the same score expressed on the other scale.

**How current are the numbers?**

Most figures update as soon as a call is analysed. A few team summaries refresh when new calls come in rather than on every page load, so immediately after a large upload you may briefly see the previous values. Appointment data from your CRM syncs on a schedule.

**A client says a call is missing or wasn't scored. What do I do?**

1. **Ask for the specific call:** date, time, the rep, and who they were talking to.
2. **Open Calls, filter by that rep, and tick *Not a Sales Call*** in the result filter. The list shows the most recent calls first. Calls with the same customer are grouped, so the call may be behind **View All** on that customer's row.
3. **If it is there without a score, open it and read the transcript.** It is almost always a voicemail, a logistics call or an existing customer (see section 8).
4. **Escalate only if the call really is not in the list**, and attach the specific call from step 1.

**An inbound call shows up under the wrong rep. Why?**

For inbound calls, the CRM does not record who actually answered the phone. The user it sends with the call is the one **assigned to the contact** — the lead's owner — so the call goes to that person, even if a teammate picked up. If the contact has no owner yet, the call goes to Front Desk (see section 2.2). To have inbound calls land with the right rep, keep contact ownership up to date in the CRM.

**Can I change what "good" means for my team?**

Yes. Your script defines what good looks like inside each of the five stages — your questions, your offer, your objection responses — and how much each stage weighs in the overall score. Every call is scored against it, so the platform coaches to your standard, not a generic one. The five stages themselves stay the same for every client.

> **Note:** section **weights** change the overall score (see section 3.1). Marking a section **critical** is saved and displayed, but does not currently change the score.

---

*AskMoses.AI — User Guide v1.5 · September 2026 · For questions not covered here, contact your account team.*
