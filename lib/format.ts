// Formatação de duração — display-only, neutra de role (Owner/Trainer/Admin).

/**
 * Formata uma duração em segundos como "1m30s" / "45s" / "620m00s".
 *
 * NÃO arredonda para minutos — preserva os segundos. Decisão de billing: a UI
 * mostra a duração real da call (ex.: "1m30s"), evitando a divergência entre
 * minutos exibidos e minutos cobrados.
 *
 * Retorna "—" para null/0/negativo (duração desconhecida — ver decisão de
 * manter duration_seconds NULL no fluxo de upload).
 */
export function formatDuration(totalSeconds: number | null | undefined): string {
  if (
    totalSeconds == null ||
    !Number.isFinite(totalSeconds) ||
    totalSeconds <= 0
  ) {
    return "—";
  }
  const whole = Math.round(totalSeconds);
  const minutes = Math.floor(whole / 60);
  const seconds = whole % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m${seconds.toString().padStart(2, "0")}s`;
}
