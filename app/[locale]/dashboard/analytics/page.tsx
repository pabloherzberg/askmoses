"use client";

import type { Call } from "@/lib/types";
import { useLocale, useTranslations } from "next-intl";
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

const RUBRIC_KEYS = ['discovery', 'problemAgitation', 'offerPresentation', 'objectionHandling', 'closeAndNextSteps'] as const

interface SectionAvg {
  name: string;
  avgScore: number;
}

interface Achievement {
  trainer: string;
  badgeKey: 'masterCoach' | 'perfectCalls' | 'risingStar';
  icon: string;
  reasonKey: string;
  reasonVars?: Record<string, string | number>;
}

export default function AnalyticsPage() {
  const t = useTranslations("Dashboard.analytics")
  const tBadges = useTranslations("Dashboard.analytics.badges")
  const tRubric = useTranslations("Shared.rubric")
  const locale = useLocale()
  const [calls, setCalls] = useState<Call[]>([]);
  const [trendData, setTrendData] = useState<{ date: string; avgScore: number; calls: number }[]>([]);
  const [weakSections, setWeakSections] = useState<SectionAvg[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<{ key: string; vars: Record<string, string | number> }[]>([]);
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

      const res = await fetch("/api/calls");
      const { data: callsData, error } = (await res.json()) as {
        data: Call[] | null;
        error: unknown;
      };

      if (!callsData || error) {
        setLoading(false);
        return;
      }

      const sorted = [...callsData].sort((a, b) => a.date.localeCompare(b.date));
      setCalls(sorted);

      const rubricLabel = (key: string) =>
        (RUBRIC_KEYS as readonly string[]).includes(key) ? tRubric(key) : key

      // Trend data — group by date, average score per day
      const trends = new Map<string, { total: number; count: number }>();
      sorted.forEach((call) => {
        const label = new Date(call.date).toLocaleDateString(locale, {
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
            name: rubricLabel(key),
            avgScore: Math.round(d.total / d.count),
          }))
          .sort((a, b) => a.avgScore - b.avgScore),
      );

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
            badgeKey: 'masterCoach',
            icon: "👑",
            reasonKey: 'masterCoachReason',
            reasonVars: { score: (topStats.total / topStats.count).toFixed(1) },
          });
        }
      }

      const perfectEntry = trainerEntries.find(([, s]) => s.perfect > 0);
      if (perfectEntry) {
        achievementsList.push({
          trainer: perfectEntry[0],
          badgeKey: 'perfectCalls',
          icon: "⭐",
          reasonKey: 'perfectCallsReason',
          reasonVars: { count: perfectEntry[1].perfect },
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
            badgeKey: 'risingStar',
            icon: "🚀",
            reasonKey: 'risingStarReason',
          });
        }
      }

      setAchievements(achievementsList);

      // ─── Insights
      const insightsList: { key: string; vars: Record<string, string | number> }[] = [];
      if (sorted.length > 0) {
        const avg = sorted.reduce((sum, c) => sum + c.score, 0) / sorted.length;
        insightsList.push({
          key: 'overallPerformance',
          vars: { avg: avg.toFixed(0), count: sorted.length },
        });
      }
      const sections = Object.entries(sectionTotals)
        .map(([key, d]) => ({ name: rubricLabel(key), avgScore: Math.round(d.total / d.count) }))
        .sort((a, b) => a.avgScore - b.avgScore);
      if (sections.length > 0) {
        insightsList.push({
          key: 'topImprovementArea',
          vars: { name: sections[0].name, score: sections[0].avgScore },
        });
      }
      if (trainerEntries.length > 0) {
        const teamAvg =
          trainerEntries.reduce((sum, [, s]) => sum + s.total / s.count, 0) /
          trainerEntries.length;
        insightsList.push({
          key: 'teamAverage',
          vars: { avg: teamAvg.toFixed(0) },
        });
      }
      setInsights(insightsList);

      const closed = sorted.filter((c) => c.result === "closed").length;
      const notClosed = sorted.filter((c) => c.result === "no_decision" || c.result === "objection_unresolved").length;
      const partial = sorted.filter((c) => c.result === "follow_up").length;
      const closeRate =
        sorted.length > 0 ? Math.round((closed / sorted.length) * 100) : 0;
      setOutcomeMetrics({ closed, notClosed, partial, closeRate });

      const trainerMap = new Map<string, { closed: number; total: number }>();
      sorted.forEach((call) => {
        if (!trainerMap.has(call.trainerName))
          trainerMap.set(call.trainerName, { closed: 0, total: 0 });
        const tr = trainerMap.get(call.trainerName)!;
        tr.total += 1;
        if (call.result === "closed") tr.closed += 1;
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
  }, [locale, tRubric]);

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
          {t('title')}
        </h2>
        <p className="text-muted-foreground">
          {t('subtitle')}
        </p>
      </div>

      {/* Key Insights */}
      {insights.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-3">
          {insights.map((insight, idx) => (
            <Card
              key={idx}
              className="border-border bg-card"
            >
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-blue-400" />
                  <CardTitle className="text-sm text-foreground">
                    {t('insightLabel')}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-foreground">{t(insight.key as 'overallPerformance' | 'topImprovementArea' | 'teamAverage', insight.vars)}</p>
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
            <p className="text-sm text-muted-foreground">{t('closedDeals')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-3xl font-bold text-red-600 dark:text-red-400">
              {outcomeMetrics.notClosed}
            </p>
            <p className="text-sm text-muted-foreground">{t('notClosed')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">
              {outcomeMetrics.partial}
            </p>
            <p className="text-sm text-muted-foreground">{t('partial')}</p>
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
            <p className="text-sm text-muted-foreground">{t('closeRate')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Trainer Conversion Leaderboard */}
      {trainerConversions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-4 w-4" />
              {t('conversionLeaderboard')}
            </CardTitle>
            <CardDescription>{t('conversionSubtitle')}</CardDescription>
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
              {t('performanceTrend')}
            </CardTitle>
            <CardDescription>{t('performanceTrendSubtitle')}</CardDescription>
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
                    name={t('avgScoreLine')}
                    isAnimationActive={true}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-80 items-center justify-center text-muted-foreground">
                {t('noDataYet')}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Weak Sections Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              {t('topImprovementAreas')}
            </CardTitle>
            <CardDescription>
              {t('topImprovementSubtitle')}
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
                  <Bar dataKey="avgScore" fill="#ef4444" name={t('avgScoreBar')} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-80 items-center justify-center text-muted-foreground">
                {t('noDataYet')}
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
              {t('teamAchievements')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {achievements.map((achievement, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{achievement.icon}</span>
                        <Badge variant="secondary">{tBadges(achievement.badgeKey)}</Badge>
                      </div>
                      <p className="mt-2 font-medium">{achievement.trainer}</p>
                      <p className="text-sm text-muted-foreground">
                        {tBadges(achievement.reasonKey as 'masterCoachReason' | 'perfectCallsReason' | 'risingStarReason', achievement.reasonVars ?? {})}
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
            <h3 className="mt-4 text-lg font-semibold">{t('emptyTitle')}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('emptyBody')}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
