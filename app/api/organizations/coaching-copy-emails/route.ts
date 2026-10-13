import { type NextRequest } from 'next/server'
import { forbidden, getActiveOrgContext, getSession, ok, requireOwnerWrite, unauthorized } from '@/lib/auth'
import {
  CoachingCopyEmailsColumnMissingError,
  dbGetOrgCoachingCopyEmails,
  dbSetOrgCoachingCopyEmails,
} from '@/lib/db/organizations'
import { COACHING_COPY_EMAILS_MAX, validateCoachingCopyEmails } from '@/lib/coaching-copy-emails'

// Lista de cópias do email de coaching da org ativa (migration 126).
// Owner da org ou admin impersonando (owner efetivo). Trainer → 403. Admin sem
// impersonar não tem org ativa → 403: a lista é sempre da org em que se está.
//
// Erros levam `reason` além de message/code, para a tela traduzir.

function fail(status: number, reason: string, message: string, email?: string) {
  return Response.json(
    { data: null, error: { message, code: status, reason, ...(email ? { email } : {}) } },
    { status },
  )
}

function columnMissing() {
  return fail(
    503,
    'MIGRATION_PENDING',
    'Coaching email copies are not available yet: migration 126 (organizations.coaching_copy_emails) is not applied to this database.',
  )
}

async function resolveOrgId(): Promise<{ orgId: string } | { response: Response }> {
  const session = await getSession()
  if (!session) return { response: unauthorized() }
  const ctx = await getActiveOrgContext()
  const orgId = ctx?.activeOrgId
  const canManage = ctx?.role === 'owner' || (ctx?.isSuperAdmin && ctx.isImpersonating)
  if (!orgId || !canManage) return { response: forbidden() }
  return { orgId }
}

export async function GET() {
  const resolved = await resolveOrgId()
  if ('response' in resolved) return resolved.response

  try {
    const emails = await dbGetOrgCoachingCopyEmails(resolved.orgId)
    return ok({ emails, max: COACHING_COPY_EMAILS_MAX })
  } catch (err) {
    if (err instanceof CoachingCopyEmailsColumnMissingError) return columnMissing()
    console.error('[coaching-copy-emails] GET failed', {
      orgId: resolved.orgId,
      err: err instanceof Error ? err.message : String(err),
    })
    return fail(500, 'INTERNAL', 'Could not load the coaching email copies.')
  }
}

// Substitui a lista inteira: body { emails: string[] }.
export async function PUT(request: NextRequest) {
  const resolved = await resolveOrgId()
  if ('response' in resolved) return resolved.response

  const blocked = await requireOwnerWrite()
  if (blocked) return blocked

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fail(400, 'INVALID_BODY', 'Request body must be JSON: { "emails": string[] }.')
  }
  const input = (body as { emails?: unknown } | null)?.emails
  if (!Array.isArray(input)) {
    return fail(400, 'INVALID_BODY', 'Request body must be JSON: { "emails": string[] }.')
  }

  const result = validateCoachingCopyEmails(input)
  if (!result.ok) {
    if (result.reason === 'LIMIT_REACHED') {
      return fail(400, result.reason, `You can add up to ${COACHING_COPY_EMAILS_MAX} addresses.`)
    }
    if (result.reason === 'DUPLICATE_EMAIL') {
      return fail(400, result.reason, `${result.email} is already on the list.`, result.email)
    }
    return fail(
      400,
      result.reason,
      result.email ? `${result.email} is not a valid email address.` : 'Every item must be an email address.',
      result.email,
    )
  }

  try {
    await dbSetOrgCoachingCopyEmails(resolved.orgId, result.emails)
    return ok({ emails: result.emails, max: COACHING_COPY_EMAILS_MAX })
  } catch (err) {
    if (err instanceof CoachingCopyEmailsColumnMissingError) return columnMissing()
    console.error('[coaching-copy-emails] PUT failed', {
      orgId: resolved.orgId,
      err: err instanceof Error ? err.message : String(err),
    })
    return fail(500, 'INTERNAL', 'Could not save the coaching email copies.')
  }
}
