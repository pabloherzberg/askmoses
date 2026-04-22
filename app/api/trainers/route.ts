import { ok, unauthorized } from "@/lib/auth";
import { getSession } from "@/lib/auth";
import { getTrainers } from "@/lib/services/trainers";

export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  const trainers = await getTrainers();
  const totalCalls = trainers.reduce((sum, t) => sum + t.totalCalls, 0);
  const avgScore =
    trainers.length > 0
      ? Math.round(
          trainers.reduce((sum, t) => sum + t.score, 0) / trainers.length,
        )
      : 0;
  const avgCloseRate =
    trainers.length > 0
      ? Math.round(
          trainers.reduce((sum, t) => sum + t.closeRate, 0) / trainers.length,
        )
      : 0;
  const bestTrainer =
    trainers.length > 0
      ? trainers.reduce(
          (best, t) => (t.score > best.score ? t : best),
          trainers[0],
        )
      : null;

  const stats = {
    totalCalls,
    avgScore,
    avgCloseRate,
    bestTrainer: bestTrainer?.name ?? null,
    activeTrainers: trainers.length,
  };

  return ok({ trainers, stats });
}
