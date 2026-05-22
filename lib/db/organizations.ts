import { createAdminClient } from '@/lib/supabase/admin'

export interface OrgGhlConfig {
  orgId: string
  locationId: string
  accessToken: string
  webhookSecret: string
  enabled: boolean
}

export interface OrgGhlAdminView {
  locationId: string | null
  accessTokenMasked: string | null
  webhookSecretMasked: string | null
  hasAccessToken: boolean
  hasWebhookSecret: boolean
  enabled: boolean
  configuredAt: string | null
  lastAuthErrorAt: string | null
}

function maskSecret(value: string | null): string | null {
  if (!value) return null
  const tail = value.slice(-4)
  return `••••••••${tail}`
}

/**
 * Lookup quente usado pelo webhook handler. Retorna apenas se a org
 * estiver com `ghl_integration_enabled = true` e com credenciais
 * configuradas — qualquer outro caso vira `null` (handler responde 404
 * ou 403 conforme).
 */
export async function dbGetOrgGhlConfigByLocation(
  locationId: string,
): Promise<OrgGhlConfig | null> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('organizations')
    .select('id, ghl_location_id, ghl_access_token, ghl_webhook_secret, ghl_integration_enabled')
    .eq('ghl_location_id', locationId)
    .maybeSingle()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`dbGetOrgGhlConfigByLocation: ${error.message}`)
  }
  if (!data) return null

  const accessToken = data.ghl_access_token as string | null
  const webhookSecret = data.ghl_webhook_secret as string | null
  const enabled = Boolean(data.ghl_integration_enabled)
  const dbLocation = data.ghl_location_id as string | null

  if (!enabled || !accessToken || !webhookSecret || !dbLocation) {
    // Webhook handler usa `null` para 403/404; manter consistente.
    return null
  }

  return {
    orgId: data.id as string,
    locationId: dbLocation,
    accessToken,
    webhookSecret,
    enabled,
  }
}

/**
 * View mascarada para a UI admin. Nunca retorna plaintext de token/secret.
 */
export async function dbGetOrgGhlAdminView(
  orgId: string,
): Promise<OrgGhlAdminView | null> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('organizations')
    .select(
      'id, ghl_location_id, ghl_access_token, ghl_webhook_secret, ghl_integration_enabled, ghl_configured_at, ghl_last_auth_error_at',
    )
    .eq('id', orgId)
    .maybeSingle()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`dbGetOrgGhlAdminView: ${error.message}`)
  }
  if (!data) return null

  const accessToken = (data.ghl_access_token as string | null) ?? null
  const webhookSecret = (data.ghl_webhook_secret as string | null) ?? null

  return {
    locationId: (data.ghl_location_id as string | null) ?? null,
    accessTokenMasked: maskSecret(accessToken),
    webhookSecretMasked: maskSecret(webhookSecret),
    hasAccessToken: accessToken !== null && accessToken !== '',
    hasWebhookSecret: webhookSecret !== null && webhookSecret !== '',
    enabled: Boolean(data.ghl_integration_enabled),
    configuredAt: (data.ghl_configured_at as string | null) ?? null,
    lastAuthErrorAt: (data.ghl_last_auth_error_at as string | null) ?? null,
  }
}

/**
 * Marca timestamp da última falha de auth GHL pra esta org. Usado pelo
 * banner em /admin/.../integrations/ghl. Best-effort: erros são logados,
 * não propagados — pipeline não pode quebrar por causa de update de
 * observabilidade.
 */
export async function dbMarkOrgGhlAuthError(orgId: string): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('organizations')
    .update({ ghl_last_auth_error_at: new Date().toISOString() })
    .eq('id', orgId)
  if (error) {
    console.error('[organizations] failed to mark ghl auth error', { orgId, err: error.message })
  }
}

export interface UpdateOrgGhlConfigInput {
  locationId?: string | null
  accessToken?: string | null
  newWebhookSecret?: string
  enabled?: boolean
}

/**
 * Update de campos GHL na org. Caller decide quando regenerar o secret
 * (passando `newWebhookSecret`).
 *
 * Convenção: `accessToken` undefined = não tocar; null = limpar; string = substituir.
 * Mesmo para `locationId`.
 */
export async function dbUpdateOrgGhlConfig(
  orgId: string,
  input: UpdateOrgGhlConfigInput,
): Promise<void> {
  const supabase = createAdminClient()

  const patch: Record<string, unknown> = {}
  if (input.locationId !== undefined) patch.ghl_location_id = input.locationId
  if (input.accessToken !== undefined) {
    patch.ghl_access_token = input.accessToken
    // Token novo (string não-nula) limpa marca de erro de auth — o banner
    // some no próximo load do admin form. Token=null (limpar) também limpa,
    // porque a integração tá sendo desativada.
    patch.ghl_last_auth_error_at = null
  }
  if (input.newWebhookSecret !== undefined) patch.ghl_webhook_secret = input.newWebhookSecret
  if (input.enabled !== undefined) patch.ghl_integration_enabled = input.enabled

  if (Object.keys(patch).length === 0) return

  patch.ghl_configured_at = new Date().toISOString()

  const { error } = await supabase
    .from('organizations')
    .update(patch)
    .eq('id', orgId)

  if (error) throw new Error(`dbUpdateOrgGhlConfig: ${error.message}`)
}
