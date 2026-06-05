import type { IntentScore } from "@/lib/types";

const MESSAGES: Record<string, Record<IntentScore, string>> = {
  en: {
    5: "The prospect showed very clear buying intent — great job driving the close.",
    4: "The prospect signaled strong interest. The close was within reach — revisit the objections.",
    3: "Moderate intent. The prospect was engaged but unsure. Dig deeper into the problem next call.",
    2: "Low intent detected. The prospect may not be the decision-maker, or the fit may be weak.",
    1: "No buying intent identified. Assess whether the lead is worth re-engaging or should be disqualified.",
  },
  pt: {
    5: "O prospect demonstrou intenção de compra muito clara — ótimo trabalho conduzindo o fechamento.",
    4: "O prospect sinalizou forte interesse. Faltou pouco para o fechamento — revisite as objeções.",
    3: "Intenção moderada. O prospect estava engajado mas inseguro. Aprofunde o problema na próxima call.",
    2: "Baixa intenção detectada. O prospect pode não ser o decisor ou o fit pode ser fraco.",
    1: "Nenhuma intenção de compra identificada. Avalie se vale reengajar ou desqualificar o lead.",
  },
  es: {
    5: "El prospecto mostró una intención de compra muy clara — excelente trabajo conduciendo el cierre.",
    4: "El prospecto señaló un fuerte interés. Faltó poco para el cierre — retoma las objeciones.",
    3: "Intención moderada. El prospecto estaba comprometido pero inseguro. Profundiza en el problema en la próxima llamada.",
    2: "Baja intención detectada. El prospecto puede no ser quien decide o el encaje puede ser débil.",
    1: "No se identificó intención de compra. Evalúa si vale la pena reactivar o descalificar el lead.",
  },
  fr: {
    5: "Le prospect a montré une intention d'achat très claire — excellent travail pour mener la conclusion.",
    4: "Le prospect a signalé un fort intérêt. La conclusion était à portée — revenez sur les objections.",
    3: "Intention modérée. Le prospect était engagé mais hésitant. Approfondissez le problème au prochain appel.",
    2: "Faible intention détectée. Le prospect n'est peut-être pas le décideur ou l'adéquation est faible.",
    1: "Aucune intention d'achat identifiée. Évaluez s'il vaut la peine de relancer ou de disqualifier le lead.",
  },
};

export function intentFeedback(score: number, locale = "en"): string {
  const lang = MESSAGES[locale] ?? MESSAGES.en;
  const clamped = Math.max(1, Math.min(5, Math.round(score))) as IntentScore;
  return lang[clamped];
}
