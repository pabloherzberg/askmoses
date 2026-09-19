/**
 * Front Desk — o rep de SISTEMA de cada org (um por org, migration 109).
 *
 * Recebe as calls cujo GHLUSERID não está vinculado a nenhum membro, e as que
 * chegam sem userId no payload. Antes da 109 essas calls eram descartadas no
 * webhook sem gravar nada.
 *
 * Na operação do cliente ele é a RECEPÇÃO: telefone compartilhado, quem está
 * mais perto atende, não há como o sistema saber quem foi. É um posto de
 * trabalho e é medido como qualquer rep — não há filtro de exibição por
 * `is_system` em nenhuma tela.
 *
 * A atribuição é PROVISÓRIA: vinculado o rep real, a call migra pra ele
 * (ver lib/services/ghl-call-recovery.ts).
 */

/** users.name do rep de sistema. Aparece como está na UI — é o nome que o
 *  dono do negócio vê no ranking, no Team Health e na lista de calls. */
export const FRONT_DESK_NAME = 'Front Desk - AskMoses'

/** Iniciais do avatar. Sem isto, users.avatar fica NULL e toTrainer cai no
 *  default '??', que apareceria no Team Health e no leaderboard. */
export const FRONT_DESK_AVATAR = 'FD'

/** Domínio dos emails sintéticos. Não recebe correio: os dois remetentes de
 *  coaching são gateados por is_system antes de enviar. Um domínio que só
 *  existe aqui torna óbvio no banco (e num log de bounce) que a linha é nossa. */
export const FRONT_DESK_EMAIL_DOMAIN = 'system.askmoses.ai'

/**
 * Email sintético do Front Desk de uma org. Determinístico e único por org —
 * users.email é UNIQUE NOT NULL global, então não dá pra reusar um endereço
 * fixo entre orgs. O orgId no local-part também faz o get-or-create ser
 * idempotente sem depender de outro lookup.
 */
export function frontDeskEmail(orgId: string): string {
  return `front-desk+${orgId}@${FRONT_DESK_EMAIL_DOMAIN}`
}
