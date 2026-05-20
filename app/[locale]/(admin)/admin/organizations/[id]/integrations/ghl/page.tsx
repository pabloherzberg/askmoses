export const dynamic = "force-dynamic"

import { notFound } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { dbGetOrgGhlAdminView } from "@/lib/db/organizations"
import { GhlIntegrationForm } from "./GhlIntegrationForm"
import { headers } from "next/headers"

interface PageProps {
  params: Promise<{ id: string; locale: string }>
}

function getBaseUrl(host: string | null, proto: string | null): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")
  }
  if (!host) return ""
  const scheme = proto ?? (host.includes("localhost") ? "http" : "https")
  return `${scheme}://${host}`
}

// Layout (admin) já garante role=admin via middleware. Aqui só carregamos
// o estado atual da integração GHL pra hidratar o form com defaults.
export default async function GhlIntegrationPage({ params }: PageProps) {
  const { id: orgId } = await params

  const admin = createAdminClient()
  const { data: org } = await admin
    .from("organizations")
    .select("id, name")
    .eq("id", orgId)
    .maybeSingle()

  if (!org) notFound()

  const view = await dbGetOrgGhlAdminView(orgId)
  if (!view) notFound()

  const headerList = await headers()
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host")
  const proto = headerList.get("x-forwarded-proto")
  const webhookUrl = `${getBaseUrl(host, proto)}/api/webhooks/ghl`

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-8">
      <GhlIntegrationForm
        orgId={org.id as string}
        orgName={org.name as string}
        initial={view}
        webhookUrl={webhookUrl}
      />
    </div>
  )
}
