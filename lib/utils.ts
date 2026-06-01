import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── Billing por minuto ──────────────────────────────────────────────────────
// Modelo de cobrança: US$ por minuto consumido (substitui o MRR fixo). A
// tarifa fica centralizada aqui — única fonte da verdade pra cálculo de custo.

/** Tarifa de cobrança por minuto, em USD. */
export const COST_PER_MINUTE_USD = 2

/**
 * Custo em USD para uma quantidade de minutos consumidos.
 * Uso restrito às views de Admin — Owner/Trainer nunca veem custo.
 */
export function minutesToCostValue(minutes: number): number {
  return Math.max(0, minutes) * COST_PER_MINUTE_USD
}

/**
 * Mesmo cálculo de `minutesToCostValue`, formatado como string USD
 * (ex.: "$1,240"). Usado apenas nas telas de Admin.
 */
export function minutesToCost(minutes: number): string {
  return `$${minutesToCostValue(minutes).toLocaleString('en-US')}`
}
