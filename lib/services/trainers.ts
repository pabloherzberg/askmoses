import type { Trainer, PerformanceTrendPoint } from "@/lib/types";
import type { CallsByTrainerMap, BehavioralDimension, CoachingRec, BehavioralTrendDimension } from "@/lib/mock-data";

const USE_MOCK = process.env.USE_MOCK_DATA !== "false";
import { getOrgId } from "@/lib/auth";

export async function getTrainers(): Promise<Trainer[]> {
  const { dbGetTrainers } = await import("@/lib/db/trainers");
  const orgId = await getOrgId();
  return orgId ? dbGetTrainers({ orgId }) : [];
}

export async function getTrainerById(id: string): Promise<Trainer | null> {
  const { dbGetTrainerById } = await import("@/lib/db/trainers");
  return dbGetTrainerById(id);
}

// Maps mock trend data to real trainer IDs using demo email convention.
// trainer@demo → Marcus, trainer2@demo → Jamie, trainer3@demo → Jordan, trainer4@demo → Taylor
const EMAIL_TO_MOCK_KEY: Record<string, string> = {
  "trainer@demo.askmoses.ai":  "00000000-0000-0000-0000-000000000301",
  "trainer2@demo.askmoses.ai": "00000000-0000-0000-0000-000000000302",
  "trainer3@demo.askmoses.ai": "00000000-0000-0000-0000-000000000303",
  "trainer4@demo.askmoses.ai": "00000000-0000-0000-0000-000000000304",
}

export async function getTrainersWithMockData(): Promise<Trainer[]> {
  if (USE_MOCK) {
    const { trainers } = await import("@/lib/mock-data");
    return trainers;
  }
  return getTrainers();
}

export async function getBestAndWorstCalls(): Promise<{ bestCalls: CallsByTrainerMap; worstCalls: CallsByTrainerMap }> {
  const { bestCalls, worstCalls } = await import("@/lib/mock-data");
  return { bestCalls, worstCalls };
}

export async function getBehavioralProfile(trainerKey: string): Promise<BehavioralDimension[]> {
  const { trainerBehavioral } = await import("@/lib/mock-data");
  return trainerBehavioral[trainerKey] ?? [];
}

export async function getCoachingRecs(trainerKey: string): Promise<CoachingRec[]> {
  const { coachingRecs } = await import("@/lib/mock-data");
  return coachingRecs[trainerKey] ?? [];
}

export async function getBehavioralTrends(trainerKey: string): Promise<BehavioralTrendDimension[]> {
  const { trainerTrends } = await import("@/lib/mock-data");
  return trainerTrends[trainerKey] ?? [];
}

export async function getPerformanceTrends(
  realTrainers: { id: string; email?: string }[]
): Promise<Record<string, PerformanceTrendPoint[]>> {
  if (USE_MOCK) {
    const { performanceTrends } = await import("@/lib/mock-data");
    const remapped: Record<string, PerformanceTrendPoint[]> = { team: performanceTrends.team }
    for (const trainer of realTrainers) {
      const mockKey = trainer.email ? EMAIL_TO_MOCK_KEY[trainer.email] : undefined
      if (mockKey && performanceTrends[mockKey]) {
        remapped[trainer.id] = performanceTrends[mockKey]
      }
    }
    return remapped;
  }
  return {};
}
