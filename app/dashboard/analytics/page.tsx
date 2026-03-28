"use client";

// ─── Transition guide ─────────────────────────────────────────────────────────
// BEFORE (Supabase): const { data } = await supabase.from("calls").select("*")
// AFTER  (API route): const { data } = await fetch("/api/calls").then(r => r.json())
//
// Phase 1 → MSW intercepts /api/calls and returns mock data from lib/mock-data.ts
// Phase 2 → app/api/calls/route.ts is implemented; zero changes needed here
// ─────────────────────────────────────────────────────────────────────────────

import type { Call } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Award, Loader2, Target, TrendingUp, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Maps rubricScores keys → display labels
const RUBRIC_LABELS: Record<string, string> = {
  discovery: "Discovery",
  problemAgitation: "Problem Agitation",
  offerPresentation: "Offer Presentation",
  objectionHandling: "Objection Handling",
  closeAndNextSteps: "Close & Next Steps",
};

interface SectionAvg {
  name: string;
  avgScore: number;
}

interface Achievement {
  trainer: string;
  badge: string;
  icon: string;
  reason: string;
}

export default function AnalyticsPage() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [trendData, setTrendData] = useState<{ date: string; avgScore: number; calls: number }[]>([]);
  const [weakSections, setWeakSections] = useState<SectionAvg[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<string[]>([]);
  const [outcomeMetrics, setOutcomeMetrics] = useState({
    closed: 0,
    notClosed: 0,
    partial: 0,
    closeRate: 0,
  });
  const [trainerConversions, setTrainerConversions] = useState<
    { name: string; closed: number; total: number; rate: number }[]
  >([]);

  useEffect(() => {
    async function fetchAnalytics() {
      setLoading(true);

      // ─── BEFORE: supabase.from("calls").select("*").order("created_at", ...)
      // ─── AFTER:  fetch("/api/calls") — intercepted by MSW (Phase 1) or real route (Phase 2)
      const res = await fetch("/api/calls");
      const { data: callsData, error } = (await res.json()) as {
        data: Call[] | null;
        error: unknown;
      };

      if (!callsData || error) {
        setLoading(false);
        return;
      }

      // Sort by date ascending for trend calculations
      // BEFORE: Supabase .order("created_at", { ascending: true })
      // AFTER:  client-side sort on call.date (YYYY-MM-DD)
      const sorted = [...callsData].sort((a, b) => a.date.localeCompare(b.date));
      setCalls(sorted);

      // ─── Trend data — group by date, average score per day
      // BEFORE: group by call.created_at (ISO timestamp), score = overall_score / total_criteria * 100
      // AFTER:  group by call.date (YYYY-MM-DD), score = call.score (already 0–100)
      const trends = new Map<string, { total: number; count: number }>();
      sorted.forEach((call) => {
        const label = new Date(call.date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
        if (!trends.has(label)) trends.set(label, { total: 0, count: 0 });
        const entry = trends.get(label)!;
        entry.total += call.score;
        entry.count += 1;
      });
      setTrendData(
        Array.from(trends.entries()).map(([date, d]) => ({
          date,
          avgScore: parseFloat((d.total / d.count).toFixed(1)),
          calls: d.count,
        })),
      );

      // ─── Weak sections — average rubricScores per section, sorted ascending
      // BEFORE: criteria[] array with { name, passed } — failure = not passed
      // AFTER:  rubricScores object with numeric values per section — lower = weaker
      const sectionTotals: Record<string, { total: number; count: number }> = {};
      sorted.forEach((call) => {
        for (const [key, value] of Object.entries(call.rubricScores)) {
          if (!sectionTotals[key]) sectionTotals[key] = { total: 0, count: 0 };
          sectionTotals[key].total += value;
          sectionTotals[key].count += 1;
        }
      });
      setWeakSections(
        Object.entries(sectionTotals)
          .map(([key, d]) => ({
            name: RUBRIC_LABELS[key] ?? key,
            avgScore: Math.round(d.total / d.count),
          }))
          .sort((a, b) => a.avgScore - b.avgScore),
      );

      // ─── Achievements
      // BEFORE: call.trainer_name, call.overall_score === call.total_criteria (perfect)
      // AFTER:  call.trainerName, call.score >= 95 (perfect)
      const trainerStats = new Map<
        string,
        { total: number; count: number; perfect: number }
      >();
      sorted.forEach((call) => {
        if (!trainerStats.has(call.trainerName))
          trainerStats.set(call.trainerName, { total: 0, count: 0, perfect: 0 });
        const s = trainerStats.get(call.trainerName)!;
        s.total += call.score;
        s.count += 1;
        if (call.score >= 95) s.perfect += 1;
      });

      const achievementsList: Achievement[] = [];
      const trainerEntries = Array.from(trainerStats.entries());

      if (trainerEntries.length > 0) {
        const [topName, topStats] = trainerEntries.reduce((a, b) =>
          b[1].total / b[1].count > a[1].total / a[1].count ? b : a,
        );
        if (topStats.count > 0) {
          achievementsList.push({
            trainer: topName,
            badge: "Master Coach",
            icon: "👑",
            reason: `Highest average score: ${(topStats.total / topStats.count).toFixed(1)}`,
          });
        }
      }

      const perfectEntry = trainerEntries.find(([, s]) => s.perfect > 0);
      if (perfectEntry) {
        achievementsList.push({
          trainer: perfectEntry[0],
          badge: "Perfect Calls",
          icon: "⭐",
          reason: `${perfectEntry[1].perfect} call(s) with score ≥ 95`,
        });
      }

      if (sorted.length >= 4) {
        const recent = sorted.slice(-3);
        const older = sorted.slice(0, 3);
        const recentAvg =
          recent.reduce((sum, c) => sum + c.score, 0) / recent.length;
        const olderAvg =
          older.reduce((sum, c) => sum + c.score, 0) / older.length;
        if (recentAvg > olderAvg) {
          achievementsList.push({
            trainer: recent[recent.length - 1].trainerName,
            badge: "Rising Star",
            icon: "🚀",
            reason: "Recent improvement trend",
          });
        }
      }

      setAchievements(achievementsList);

      // ─── Insights
      const insightsList: string[] = [];
      if (sorted.length > 0) {
        const avg = sorted.reduce((sum, c) => sum + c.score, 0) / sorted.length;
        insightsList.push(
          `Overall performance: ${avg.toFixed(0)} avg score across ${sorted.length} calls`,
        );
      }
      const sections = Object.entries(sectionTotals)
        .map(([key, d]) => ({ name: RUBRIC_LABELS[key] ?? key, avgScore: Math.round(d.total / d.count) }))
        .sort((a, b) => a.avgScore - b.avgScore);
      if (sections.length > 0) {
        insightsList.push(
          `Top improvement area: "${sections[0].name}" with avg score ${sections[0].avgScore}`,
        );
      }
      if (trainerEntries.length > 0) {
        const teamAvg =
          trainerEntries.reduce((sum, [, s]) => sum + s.total / s.count, 0) /
          trainerEntries.length;
        insightsList.push(`Team average: ${teamAvg.toFixed(0)} — Focus on consistency`);
      }
      setInsights(insightsList);

      // ─── Outcome metrics
      // BEFORE: call.call_outcome === "closed" | "not_closed" | "partial"
      // AFTER:  call.result === "closed" | "no-close" | "follow-up"  (CallResult type)
      const closed = sorted.filter((c) => c.result === "closed").length;
      const notClosed = sorted.filter((c) => c.result === "no-close").length;
      const partial = sorted.filter((c) => c.result === "follow-up").length;
      const closeRate =
        sorted.length > 0 ? Math.round((closed / sorted.length) * 100) : 0;
      setOutcomeMetrics({ closed, notClosed, partial, closeRate });

      // ─── Per-trainer conversion rates
      // BEFORE: call.trainer_name, call.call_outcome === "closed"
      // AFTER:  call.trainerName, call.result === "closed"
      const trainerMap = new Map<string, { closed: number; total: number }>();
      sorted.forEach((call) => {
        if (!trainerMap.has(call.trainerName))
          trainerMap.set(call.trainerName, { closed: 0, total: 0 });
        const t = trainerMap.get(call.trainerName)!;
        t.total += 1;
        if (call.result === "closed") t.closed += 1;
      });
      setTrainerConversions(
        Array.from(trainerMap.entries())
          .map(([name, d]) => ({
            name,
            closed: d.closed,
            total: d.total,
            rate: d.total > 0 ? Math.round((d.closed / d.total) * 100) : 0,
          }))
          .sort((a, b) => b.rate - a.rate),
      );

      setLoading(false);
    }

    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16 lg:pb-0">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Analytics & Insights
        </h2>
        <p className="text-muted-foreground">
          Aggregate performance trends and improvement recommendations
        </p>
      </div>

      {/* Key Insights */}
      {insights.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-3">
          {insights.map((insight, idx) => (
            <Card
              key={idx}
              className="border-slate-700 bg-slate-900 dark:border-slate-600 dark:bg-slate-800"
            >
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-blue-400" />
                  <CardTitle className="text-sm text-slate-100">
                    Insight
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-200">{insight}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Conversion Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-3xl font-bold text-green-600 dark:text-green-400">
              {outcomeMetrics.closed}
            </p>
            <p className="text-sm text-muted-foreground">Closed Deals</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-3xl font-bold text-red-600 dark:text-red-400">
              {outcomeMetrics.notClosed}
            </p>
            <p className="text-sm text-muted-foreground">Not Closed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">
              {outcomeMetrics.partial}
            </p>
            <p className="text-sm text-muted-foreground">Partial</p>
          </CardContent>
        </Card>
        <Card
          className={
            outcomeMetrics.closeRate >= 50
              ? "border-green-200 dark:border-green-800"
              : "border-red-200 dark:border-red-800"
          }
        >
          <CardContent className="pt-6">
            <p
              className={`text-3xl font-bold ${outcomeMetrics.closeRate >= 50 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
            >
              {outcomeMetrics.closeRate}%
            </p>
            <p className="text-sm text-muted-foreground">Close Rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Trainer Conversion Leaderboard */}
      {trainerConversions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-4 w-4" />
              Conversion Leaderboard
            </CardTitle>
            <CardDescription>Close rate per trainer</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {trainerConversions.map((trainer, i) => (
                <div key={i} className="flex items-center gap-4">
                  <span className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {trainer.name}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${trainer.rate >= 50 ? "bg-green-500" : "bg-red-500"}`}
                          style={{ width: `${trainer.rate}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {trainer.closed}/{trainer.total} ({trainer.rate}%)
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts Grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Performance Trend
            </CardTitle>
            <CardDescription>Average score over time</CardDescription>
          </CardHeader>
          <CardContent>
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="avgScore"
                    stroke="#3b82f6"
                    name="Avg Score %"
                    isAnimationActive={true}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-80 items-center justify-center text-muted-foreground">
                No data available yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Weak Sections Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              Top Improvement Areas
            </CardTitle>
            <CardDescription>
              Rubric sections with lowest average score
            </CardDescription>
          </CardHeader>
          <CardContent>
            {weakSections.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={weakSections}
                  layout="vertical"
                  margin={{ left: 120 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" domain={[0, 100]} />
                  <YAxis dataKey="name" type="category" width={110} />
                  <Tooltip />
                  <Bar dataKey="avgScore" fill="#ef4444" name="Avg Score" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-80 items-center justify-center text-muted-foreground">
                No data available yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Achievements */}
      {achievements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-4 w-4" />
              Team Achievements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {achievements.map((achievement, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border-2 border-yellow-300 p-4 dark:border-yellow-800 dark:bg-yellow-950"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{achievement.icon}</span>
                        <Badge variant="secondary">{achievement.badge}</Badge>
                      </div>
                      <p className="mt-2 font-medium">{achievement.trainer}</p>
                      <p className="text-sm text-muted-foreground">
                        {achievement.reason}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {calls.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Target className="h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-semibold">No data yet</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Process some calls to see analytics and insights
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
