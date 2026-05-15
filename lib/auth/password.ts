// Regras de senha — fonte única pra todo fluxo que define ou troca senha
// (/api/me/password e /api/auth/signup). Centralizar evita divergência: sem
// isso, cada endpoint validava só o comprimento e com mensagens diferentes.
//
// Requisitos (decisão de produto, 2026-05-14):
//   - mínimo 8 caracteres
//   - ao menos 1 letra maiúscula
//   - ao menos 1 caractere especial (não-letra, não-número)
//
// Regex Unicode-aware: o app é multilíngue (pt/en/es/fr). \p{Lu} cobre
// maiúsculas acentuadas (É, Ç, Ã) e [^\p{L}\p{N}] trata acentuadas como
// letra — não as conta como "especial". /[A-Z]/ rejeitaria "Été2024!".

export const PASSWORD_MIN_LENGTH = 8

const UPPERCASE_RE = /\p{Lu}/u
// Especial = qualquer coisa que não é letra (qualquer idioma) nem número.
const SPECIAL_RE = /[^\p{L}\p{N}]/u

export type PasswordReason =
  | 'PASSWORD_TOO_SHORT'
  | 'PASSWORD_NO_UPPERCASE'
  | 'PASSWORD_NO_SPECIAL'

export interface PasswordValidation {
  valid: boolean
  reason?: PasswordReason
  // Mensagem em PT-BR — convenção de erros de API do projeto. O frontend
  // ignora `message` e traduz via `reason` + next-intl.
  message?: string
}

// Valida senha contra as regras de produto. Retorna o PRIMEIRO requisito
// não atendido (ordem: comprimento → maiúscula → especial) — feedback
// incremental, o user corrige um por vez.
export function validatePassword(password: string): PasswordValidation {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      valid: false,
      reason: 'PASSWORD_TOO_SHORT',
      message: `Senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`,
    }
  }
  if (!UPPERCASE_RE.test(password)) {
    return {
      valid: false,
      reason: 'PASSWORD_NO_UPPERCASE',
      message: 'Senha deve conter pelo menos uma letra maiúscula.',
    }
  }
  if (!SPECIAL_RE.test(password)) {
    return {
      valid: false,
      reason: 'PASSWORD_NO_SPECIAL',
      message: 'Senha deve conter pelo menos um caractere especial.',
    }
  }
  return { valid: true }
}
