import { type NextRequest } from 'next/server'
import { dbListGhlEnabledOrgs, dbMarkOrgGhlAuthError } from '@/lib/db/organizations'
import { dbListRecentContactIds } from '@/lib/db/calls'
import { dbUpsertGhlAppointment } from '@/lib/db/appointments'
import { fetchContactAppointments, GhlAuthError } from '@/lib/services/ghl-api'
import { notifyPipelineFailure } from '@/lib/services/pipeline-alerts'

// GET /api/cron/sync-ghl-appointments
//
//   Alternativa por POLLING ao webhook de agendamento — exatamente o mesmo
//   desenho do /api/cron/sync-ghl-opportunities (fluxo do "Won"):
//
//     Won:          webhook OpportunityStatusChanged  +  cron diário poll
//     Appointment:  webhook appointmentScheduled      +  ESTE cron
//
//   Diferença de varredura: opportunities dá pra buscar por status na location
//   inteira (`/opportunities/search`). A agenda não — `/calendars/events` exige
//   calendarId/userId/groupId, que não guardamos por org. Então varremos por
//   CONTATO: os contact_ids das calls recentes da org, que é justamente o
//   universo que a coluna "Appointment" do Intent Analysis exibe.
//
//   Persistência: mesmo upsert idempotente do webhook (dbUpsertGhlAppointment,
//   chave org_id + ghl_appointment_id) — rodar duas vezes não duplica, e um
//   agendamento remarcado/cancelado no Pepper tem scheduled_at/status
//   atualizados na próxima passada.
//
//   Auth: header 'Authorization: Bearer $CRON_SECRET' (padrão Vercel Cron).

// O cron varre um contato por request ao GHL, sequencialmente. Medido em prod
// (jul/2026): 139 contatos nas 6 orgs ativas ≈ 35s. Os 300s dão ~8x de folga
// pro crescimento da base antes de precisar paralelizar ou subir pra 800
// (Fluid Compute).
export const maxDuration = 300

// Janela de calls consideradas. 30 dias cobre a janela máxima do Intent
// Analysis (filtro "Last 30 days") sem varrer a base histórica inteira.
const RECENT_CALLS_DAYS = 30
// Cap defensivo por org/run — evita que uma org grande estoure o tempo do cron.
const MAX_CONTACTS_PER_ORG = 500

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || auth !== expected) {
    return Response.json({ error: 'forbidden' }, { status: 401 })
  }

  let orgs
  try {
    orgs = await dbListGhlEnabledOrgs()
  } catch (err) {
    console.error('[cron/sync-ghl-appointments] failed to list orgs:', err)
    return Response.json({ error: 'failed to list orgs' }, { status: 500 })
  }

  let orgsScanned = 0
  let contactsScanned = 0
  let contactsSkipped = 0
  let appointmentsFound = 0
  let upserted = 0
  let errored = 0

  for (const org of orgs) {
    orgsScanned += 1
    try {
      const allContactIds = await dbListRecentContactIds(org.orgId, RECENT_CALLS_DAYS)
      const contactIds = allContactIds.slice(0, MAX_CONTACTS_PER_ORG)
      if (allContactIds.length > contactIds.length) {
        contactsSkipped += allContactIds.length - contactIds.length
        console.warn('[cron/sync-ghl-appointments] contact cap atingido — restante não varrido', {
          orgId: org.orgId,
          total: allContactIds.length,
          scanned: contactIds.length,
        })
      }

      for (const contactId of contactIds) {
        contactsScanned += 1
        // GhlAuthError sobe pro catch da org (PIT morto vale pra todos os
        // contatos); erro pontual de um contato não derruba a org inteira.
        let appointments
        try {
          appointments = await fetchContactAppointments(contactId, org.accessToken)
        } catch (err) {
          if (err instanceof GhlAuthError) throw err
          errored += 1
          console.error('[cron/sync-ghl-appointments] fetch failed', {
            orgId: org.orgId,
            contactId,
            err,
          })
          continue
        }

        appointmentsFound += appointments.length

        for (const appt of appointments) {
          if (!appt.id || !appt.startTime) continue
          const parsed = new Date(appt.startTime)
          if (Number.isNaN(parsed.getTime())) continue
          try {
            await dbUpsertGhlAppointment({
              orgId: org.orgId,
              ghlAppointmentId: appt.id,
              contactId: appt.contactId ?? contactId,
              contactName: appt.contactName,
              trainerName: appt.assignedUserName,
              scheduledAt: parsed.toISOString(),
              status: appt.appointmentStatus,
              ghlPayload: appt as unknown as Record<string, unknown>,
            })
            upserted += 1
          } catch (err) {
            errored += 1
            console.error('[cron/sync-ghl-appointments] upsert failed', {
              orgId: org.orgId,
              contactId,
              appointmentId: appt.id,
              err,
            })
          }
        }
      }
    } catch (err) {
      errored += 1
      if (err instanceof GhlAuthError) {
        // PIT rotacionado/revogado — mesmo tratamento do cron de opportunities:
        // marca a org pra acender o banner no admin, não derruba o cron inteiro.
        await dbMarkOrgGhlAuthError(org.orgId).catch(() => {})
      }
      console.error('[cron/sync-ghl-appointments] org sync failed', {
        orgId: org.orgId,
        err,
      })
      await notifyPipelineFailure('webhook_failed', {
        callId: `sync-error:appointments-cron:${org.orgId}`,
        orgId: org.orgId,
        orgName: org.orgName,
        error: err,
        stage: 'webhook',
        reason: err instanceof GhlAuthError ? 'ghl_auth_expired' : 'ghl_api_error',
        meta: { operation: 'sync-ghl-appointments', locationId: org.locationId },
      }).catch(() => {})
    }
  }

  return Response.json({
    orgsScanned,
    contactsScanned,
    contactsSkipped,
    appointmentsFound,
    upserted,
    errored,
  })
}
