import { redirect } from 'next/navigation'

// Página consolidada em /admin/organizations/[id] (cards Owner + Subscription
// + Script). Mantemos esta rota como redirect 308 pra não quebrar links
// antigos (bookmarks, emails internos do admin, etc).
interface PageProps {
  params: Promise<{ id: string; locale: string }>
}

export default async function SubscriptionRedirect({ params }: PageProps) {
  const { id, locale } = await params
  redirect(`/${locale}/admin/organizations/${id}`)
}
