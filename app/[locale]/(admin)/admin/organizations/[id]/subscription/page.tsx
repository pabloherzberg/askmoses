export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { dbGetActiveOrgScript } from "@/lib/db/scripts";
import { SubscriptionOverrideForm } from "./SubscriptionOverrideForm";

type PlanCode = "starter" | "pro" | "pro_rag";
type SubStatus = "active" | "inactive" | "trial";

interface PageProps {
  params: Promise<{ id: string; locale: string }>;
}

// Layout (admin) já garante role=admin via middleware. Aqui só carregamos
// o estado atual da subscription pra hidratar o form com defaults.
export default async function SubscriptionPage({ params }: PageProps) {
  const { id: orgId } = await params;

  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("id, name, subscription_status, trial_ends_at, mrr, plans(code)")
    .eq("id", orgId)
    .maybeSingle();

  if (!org) notFound();

  // Script atual da org: mesma fonte que /api/analyze usa via auto-fill —
  // dbGetActiveOrgScript resolve via org_scripts (status='active', ended_at=NULL)
  // e fetcha o script row separado. Funciona pra template (org_id=NULL) E
  // local da org, diferente de scripts!inner que depende do PostgREST inferir
  // a FK em tempo de runtime.
  const [currentScript, scriptsRes] = await Promise.all([
    dbGetActiveOrgScript(orgId),
    // Admin escolhe de TODO o catálogo. Filtros por tenant aqui limitam a
    // escolha do Admin e não impedem o write (a route /script valida que
    // o script existe, sem checar pertencimento).
    admin
      .from("scripts")
      .select("id, name, description")
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  if (scriptsRes.error) {
    console.error("[admin/organizations/subscription] scripts fetch failed:", scriptsRes.error);
  }

  type ScriptOption = { id: string; name: string; description: string | null };
  const availableScripts = ((scriptsRes.data ?? []) as ScriptOption[]).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
  }));

  // Supabase nested select retorna array quando a relação é definida como
  // hasMany no schema gerado. plans(code) pode vir como objeto OU array
  // dependendo do TS gerado pelo Supabase — normalizamos via unknown cast.
  const orgRow = org as unknown as {
    id: string;
    name: string;
    subscription_status: SubStatus;
    trial_ends_at: string | null;
    mrr: number | string | null;
    plans: { code: PlanCode } | { code: PlanCode }[] | null;
  };
  const planRaw = orgRow.plans;
  const plan = Array.isArray(planRaw) ? (planRaw[0] ?? null) : planRaw;

  return (
    // min-h-[70vh] preenche viewport sobrando espaço pro header (61px) +
    // banner de impersonate (se ativo) + paddings do layout; items-center
    // centraliza vertical, justify-center centraliza horizontal.
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <SubscriptionOverrideForm
        orgId={orgRow.id}
        orgName={orgRow.name}
        initialStatus={orgRow.subscription_status}
        initialPlanCode={plan?.code ?? null}
        initialTrialEndsAt={orgRow.trial_ends_at}
        initialMrr={Number(orgRow.mrr ?? 0)}
        initialScriptId={currentScript?.id ?? null}
        initialScriptName={currentScript?.name ?? null}
        availableScripts={availableScripts}
      />
    </div>
  );
}
