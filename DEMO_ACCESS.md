# AskMoses.AI — Demo Access Guide

Live demo for prospects. All data is fictional — Dog Wizard HQ dog training business.

---

## Quick Start

Open the app and click any of the shortcut buttons on the login screen, or use the credentials below.

---

## Demo Accounts

| Role | Email | Password | Redirects to |
|---|---|---|---|
| **Trainer** | `trainer@demo.askmoses.ai` | `demo123` | `/me` |
| **Owner** | `owner@demo.askmoses.ai` | `demo123` | `/overview` |
| **Admin** | `admin@askmoses.ai` | `demo123` | `/admin` |

---

## What Each Role Sees

### Trainer — `/me`
Personal performance dashboard for Marcus Rivera (demo trainer).

- Personal score + close rate with trend vs previous period
- Personal rubric breakdown with delta vs team average
- AI coaching tip of the week
- Quick stats (closed / follow-up / no-close)
- Recent calls list → click any row to open call detail

**Can access:** `/me`, `/me/calls/[id]`
**Cannot access:** `/overview`, `/calls`, `/admin`

---

### Owner — `/overview` and `/calls`
Executive view of the entire team.

**Overview (`/overview`):**
- Team metrics: total calls, avg score, close rate, top performer
- Trainer ranking with score + close rate
- Active alerts (trainers needing attention)
- Team rubric breakdown
- Score & close rate trend chart (last 5 weeks)
- AI-generated insights with action items

**Calls (`/calls`):**
- Full call list across all trainers
- Filter by trainer and by result (Closed / Follow-up / No Close)
- Click any row to open full call detail with coaching notes

**Can access:** `/overview`, `/calls`, `/calls/[id]`, `/dashboard/*`
**Cannot access:** `/admin`

---

### Admin — `/admin` and `/admin/rubric`
SaaS-level panel (AskMoses internal).

**SaaS Panel (`/admin`):**
- Global metrics: total clients, MRR, avg score, active trainers
- Client table with plan, health, MRR, avg score

**Rubric Config (`/admin/rubric`):**
- Toggle rubric sections Critical / Optional
- System prompt preview
- Save button (shows "Feature coming soon" in Phase 1)

**Can access:** Everything

---

## Navigation

| Page | Path | Roles |
|---|---|---|
| Login | `/login` | Public |
| Trainer Dashboard | `/me` | trainer |
| Call Detail (trainer view) | `/me/calls/[id]` | trainer |
| Team Overview | `/overview` | owner, admin |
| Team Calls | `/calls` | owner, admin |
| Call Detail (owner view) | `/calls/[id]` | owner, admin |
| SaaS Panel | `/admin` | admin |
| Rubric Config | `/admin/rubric` | admin |

---

## Notes for the Demo

- All data is static mock data — no real calls, no real trainers
- MSW (Mock Service Worker) intercepts all API calls in the browser
- Theme toggle in the header switches between light and dark mode
- The "Upload", "Analytics", "Insights", and other dashboard pages (`/dashboard/*`) are the original functional scaffold — they connect to Supabase Auth but use demo data
- No data persists between sessions (no real database in Phase 1)
