/**
 * Demo client/account roster for the /login screen.
 *
 * Each entry maps the 3 tenants used in the demo to their 5 demo Auth users
 * (1 owner + 4 sales people). The Supabase Auth users are seeded by
 * `scripts/setup-three-clients.mjs` (orgs 200 + 300) and by the legacy
 * `scripts/setup-supabase.mjs` for org 100. Each user's JWT carries the
 * org_id of the client they belong to, so RLS isolates data automatically
 * after login.
 *
 * Plan and org mapping mirrors the actual Supabase rows (see
 * Downloads/{plans,clients,organizations}_rows.json):
 *   org 100 → Dog Wizard HQ      → Pro
 *   org 200 → K9 Elite Training  → Pro + RAG
 *   org 300 → Paw Academy        → Starter
 */

import type { PlanCode } from '@/lib/types'

export interface DemoUser {
  email: string
  password: string
  /** Display label, e.g. "Owner" / "Sales Person 1" */
  roleLabel: string
  /** Real name shown next to the role */
  name: string
}

export interface DemoClient {
  /** Stable id used for tab keys */
  id: string
  /** Client display name */
  name: string
  /** Plan badge — short label */
  planName: string
  /** Plan code (matches `Plan.code`) — drives badge color */
  planCode: PlanCode
  /** org_id propagated to JWT after login */
  orgId: string
  /** 1 owner + 4 sales people, in display order */
  users: DemoUser[]
}

const DEMO_PASSWORD = 'demo123'

export const DEMO_CLIENTS: DemoClient[] = [
  {
    id: 'dog-wizard-hq',
    name: 'Dog Wizard HQ',
    planName: 'Pro',
    planCode: 'pro',
    orgId: '00000000-0000-0000-0000-000000000100',
    users: [
      { email: 'owner@demo.askmoses.ai',    password: DEMO_PASSWORD, roleLabel: 'Owner',          name: 'Lindsay R.' },
      { email: 'trainer@demo.askmoses.ai',  password: DEMO_PASSWORD, roleLabel: 'Sales Person 1', name: 'Marcus R.'  },
      { email: 'trainer2@demo.askmoses.ai', password: DEMO_PASSWORD, roleLabel: 'Sales Person 2', name: 'Jamie L.'   },
      { email: 'trainer3@demo.askmoses.ai', password: DEMO_PASSWORD, roleLabel: 'Sales Person 3', name: 'Jordan K.'  },
      { email: 'trainer4@demo.askmoses.ai', password: DEMO_PASSWORD, roleLabel: 'Sales Person 4', name: 'Taylor M.'  },
    ],
  },
  {
    id: 'k9-elite-training',
    name: 'K9 Elite Training',
    planName: 'Pro + RAG',
    planCode: 'pro_rag',
    orgId: '00000000-0000-0000-0000-000000000200',
    users: [
      { email: 'owner-k9elite@demo.askmoses.ai',    password: DEMO_PASSWORD, roleLabel: 'Owner',          name: 'Diana K.'  },
      { email: 'trainer-k9elite-1@demo.askmoses.ai', password: DEMO_PASSWORD, roleLabel: 'Sales Person 1', name: 'Priya V.'  },
      { email: 'trainer-k9elite-2@demo.askmoses.ai', password: DEMO_PASSWORD, roleLabel: 'Sales Person 2', name: 'Felix C.'  },
      { email: 'trainer-k9elite-3@demo.askmoses.ai', password: DEMO_PASSWORD, roleLabel: 'Sales Person 3', name: 'Yuki H.'   },
      { email: 'trainer-k9elite-4@demo.askmoses.ai', password: DEMO_PASSWORD, roleLabel: 'Sales Person 4', name: 'Leo D.'    },
    ],
  },
  {
    id: 'paw-academy',
    name: 'Paw Academy',
    planName: 'Starter',
    planCode: 'starter',
    orgId: '00000000-0000-0000-0000-000000000300',
    users: [
      { email: 'owner-pawacademy@demo.askmoses.ai',    password: DEMO_PASSWORD, roleLabel: 'Owner',          name: 'Ricardo M.' },
      { email: 'trainer-pawacademy-1@demo.askmoses.ai', password: DEMO_PASSWORD, roleLabel: 'Sales Person 1', name: 'Alex P.'    },
      { email: 'trainer-pawacademy-2@demo.askmoses.ai', password: DEMO_PASSWORD, roleLabel: 'Sales Person 2', name: 'Sofia G.'   },
      { email: 'trainer-pawacademy-3@demo.askmoses.ai', password: DEMO_PASSWORD, roleLabel: 'Sales Person 3', name: 'Hassan B.'  },
      { email: 'trainer-pawacademy-4@demo.askmoses.ai', password: DEMO_PASSWORD, roleLabel: 'Sales Person 4', name: 'Naomi T.'   },
    ],
  },
]
