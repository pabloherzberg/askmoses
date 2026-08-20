import { ok, unauthorized, forbidden, getSession, getOrgId, getRole } from '@/lib/auth'
import { dbGetOrgWonRate } from '@/lib/db/calls'

// GET /api/won-rate
//
//   Won Rate da org ativa: leads que fecharam venda ÷ leads que agendaram
//   avaliação (call_outcome='closed' — Stage 1 do funil). Contado por lead
//   (contact_id distinto), nunca por call. Ver scripts/107_org_won_rate.sql.
//
//   Resposta:
//     {
//       closedLeads: number,   // denominador — leads que agendaram
//       wonLeads:    number,   // numerador   — desses, quantos compraram
//       wonRate:     number,   // wonLeads/closedLeads em %, inteiro
//       byTrainer: { [trainerId]: { closedLeads, wonLeads, wonRate } }
//     }
//
//   Duas armadilhas de leitura, ambas propositais:
//
//   1. closedLeads === 0 é "ninguém agendou ainda", NÃO "ninguém comprou".
//      wonRate vem 0 nesse caso porque não há divisão possível — quem exibe
//      precisa checar o denominador antes de escrever "0%".
//
//   2. A soma de byTrainer não reproduz o total da org. Um lead atendido
//      por dois vendedores conta uma vez para cada um e uma vez só na org.
//
//   Histórico completo, sem recorte de período — mesma regra do card
//   "Avg Close Rate" (dbGetOrgCloseRate).
//
//   Sem org ativa devolve os zeros, não 404: é o estado de um usuário recém
//   convidado, não um recurso inexistente.

export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()

  // Owner e admin só. É número do time inteiro — a matriz de permissões
  // (CLAUDE.md) já barra trainer em "ranking, alertas e insights do time",
  // e o middleware barra trainer no /team-command-center. Sem esta linha a
  // rota seria o buraco por onde o trainer leria os agregados da org.
  const role = await getRole()
  if (role !== 'owner' && role !== 'admin') return forbidden()

  const orgId = await getOrgId()
  if (!orgId) return ok({ closedLeads: 0, wonLeads: 0, wonRate: 0, byTrainer: {} })

  return ok(await dbGetOrgWonRate(orgId))
}
