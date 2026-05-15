/**
 * TC-03 — Schema documentado e acessível para Eliana
 *
 * Dado que a auditoria das tabelas foi concluída
 * Quando Eliana acessa o repositório no GitHub
 * Então encontra o documento de schema atualizado com: nome da tabela,
 *   campos, tipos e relações
 * E o documento descreve quais campos são usados para o pipeline de ML
 *
 * Estratégia: verifica existência e conteúdo do arquivo SCHEMA.md.
 */

import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, it, expect } from 'vitest'

const ROOT = resolve(__dirname, '..')
const SCHEMA_PATH = resolve(ROOT, 'SCHEMA.md')
const schema = existsSync(SCHEMA_PATH) ? readFileSync(SCHEMA_PATH, 'utf-8') : ''

// ─── 1. Existência do arquivo ─────────────────────────────────────────────────

describe('TC-03 › SCHEMA.md existe', () => {
  it('arquivo SCHEMA.md existe na raiz do repositório', () => {
    expect(existsSync(SCHEMA_PATH)).toBe(true)
  })

  it('arquivo não está vazio', () => {
    expect(schema.length).toBeGreaterThan(100)
  })
})

// ─── 2. Tabelas auditadas estão documentadas ──────────────────────────────────

describe('TC-03 › tabelas auditadas', () => {
  const REQUIRED_TABLES = ['calls', 'criteria', 'rubrics', 'organizations', 'profiles', 'scripts']

  for (const table of REQUIRED_TABLES) {
    it(`tabela \`${table}\` está documentada`, () => {
      expect(schema).toMatch(new RegExp(`###.*\`${table}\`|###.*${table}`, 'i'))
    })
  }
})

// ─── 3. Campos com tipo e descrição ──────────────────────────────────────────

describe('TC-03 › tabela calls — campos documentados com tipo', () => {
  const REQUIRED_CALLS_FIELDS: Array<[field: string, type: string]> = [
    ['id', 'UUID'],
    ['overall_score', 'NUMERIC'],
    ['sections', 'JSONB'],
    ['call_outcome', 'call_outcome_enum'],
    ['detected_outcome', 'call_outcome_enum'],
    ['org_id', 'UUID'],
    ['trainer_id', 'UUID'],
    // ML fields adicionados na 036
    ['closed', 'BOOLEAN'],
    ['call_date', 'DATE'],
    ['duration_seconds', 'INT'],
  ]

  for (const [field, type] of REQUIRED_CALLS_FIELDS) {
    it(`campo \`${field}\` (${type}) está documentado`, () => {
      expect(schema).toMatch(new RegExp(`\`?${field}\`?.*${type}|${type}.*\`?${field}\`?`, 'i'))
    })
  }
})

// ─── 4. Seção ML pipeline ────────────────────────────────────────────────────

describe('TC-03 › seção ML pipeline', () => {
  it('documento contém seção sobre ML pipeline', () => {
    expect(schema).toMatch(/ml.*pipeline|pipeline.*ml/i)
  })

  it('campo closed é identificado como label binário para ML', () => {
    expect(schema).toMatch(/closed.*bool.*label|label.*closed|binary.*label|Boolean.*label/i)
  })

  it('view calls_ml_flat está documentada', () => {
    expect(schema).toMatch(/calls_ml_flat/i)
  })

  it('query recomendada para ML está presente', () => {
    expect(schema).toMatch(/SELECT.*FROM.*calls_ml_flat/is)
  })

  it('lista as features recomendadas para o modelo', () => {
    expect(schema).toMatch(/score_discovery/i)
    expect(schema).toMatch(/score_objection_handling/i)
    expect(schema).toMatch(/overall_score/i)
  })

  it('identifica o label do modelo de classificação', () => {
    // closed como label boolean
    expect(schema).toMatch(/`closed`.*[Bb]oolean.*label|label.*classification|closed.*label/i)
  })
})

// ─── 5. Relações entre tabelas documentadas ───────────────────────────────────

describe('TC-03 › relações documentadas', () => {
  it('calls.org_id → organizations documentado', () => {
    expect(schema).toMatch(/org_id.*organizations|organizations.*org_id/i)
  })

  it('calls.trainer_id → trainers documentado', () => {
    expect(schema).toMatch(/trainer_id.*trainers|trainers.*trainer_id/i)
  })

  it('criteria.rubric_id → rubrics documentado', () => {
    expect(schema).toMatch(/rubric_id.*rubrics|rubrics.*rubric_id/i)
  })
})

// ─── 6. Historial de migrations documentado ───────────────────────────────────

describe('TC-03 › historial de migrations', () => {
  it('migration 036 está listada', () => {
    expect(schema).toMatch(/036/)
  })

  it('migration 036 descreve os campos ML adicionados', () => {
    expect(schema).toMatch(/036.*closed.*call_date.*duration|closed.*call_date.*duration.*036/is)
  })
})

// ─── 7. Tipos e nullable documentados ─────────────────────────────────────────

describe('TC-03 › nullable e tipos obrigatórios', () => {
  it('documento usa coluna Nullable (YES/NO) na tabela de campos', () => {
    expect(schema).toMatch(/Nullable|YES|NO/)
  })

  it('call_outcome_enum está explicado com seus valores', () => {
    expect(schema).toMatch(/call_outcome_enum/i)
    // Cada valor pode estar em linha separada (tabela Markdown)
    expect(schema).toMatch(/closed/i)
    expect(schema).toMatch(/not_closed/i)
    expect(schema).toMatch(/partial/i)
    expect(schema).toMatch(/no_outcome/i)
  })
})
