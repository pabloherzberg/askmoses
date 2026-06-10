/**
 * Base URL para self-calls server-to-server (chunk → worker, cron → process,
 * etc.).
 *
 * Prefere `VERCEL_URL` — a URL DO PRÓPRIO deployment, injetada pela Vercel em
 * runtime. Assim o disparo interno sempre bate na mesma instância que está
 * rodando, IMUNE a `NEXT_PUBLIC_APP_URL` estar ausente, errado ou apontando pro
 * ambiente trocado (o que já travou o pipeline em prod: prod disparava pro
 * deployment de dev). `NEXT_PUBLIC_*` ainda é inlined em build, então também é
 * fácil de ficar defasado entre ambientes — `VERCEL_URL` não tem esse problema.
 *
 * NÃO usar isto pra URLs USER-FACING (redirect de checkout, magic link, webhook
 * mostrado no admin): essas precisam do domínio público canônico
 * (`NEXT_PUBLIC_APP_URL`), não da URL volátil/por-deployment.
 */
export function selfBaseUrl(): string {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
}
