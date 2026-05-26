"use client";

import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  FileAudio,
  FileVideo,
  FileText,
  X,
  Loader2,
  CheckCircle,
  XCircle,
  Send,
  RotateCcw,
  Sparkles,
  ChevronDown,
} from "lucide-react";
import type { CallResult as CallOutcome, Trainer } from "@/lib/types";
import { toNumber5 } from "@/lib/score-display";
import { UpsellCard } from "@/components/shared/UpsellCard";
import { useCurrentClient } from "@/lib/hooks/use-current-client";

type UploadStep = "input" | "processing" | "results" | "sending" | "complete";

interface FormData {
  trainerId: string;
  trainerName: string;
  trainerEmail: string;
  clientName: string;
  audioFile: File | null;
  transcript: string;
  callOutcome: CallOutcome | "";
}

interface SectionResult {
  name: string;
  score: number;
  feedback: string;
  critical?: boolean;
}

interface AnalysisResult {
  overallScore: number;
  sections: SectionResult[];
  detectedOutcome?: CallOutcome;
  summary: string;
  strengths: string[];
  improvements: string[];
  transcript: string;
}

export default function UploadPage() {
  const t = useTranslations("Dashboard.upload");
  const tUpsell = useTranslations("Shared.upsell.uploadTwilio");
  const locale = useLocale();
  const [step, setStep] = useState<UploadStep>("input");
  const [uploadType, setUploadType] = useState<"audio" | "transcript">("audio");
  const [progress, setProgress] = useState(0);
  const [formData, setFormData] = useState<FormData>({
    trainerId: "",
    trainerName: "",
    trainerEmail: "",
    clientName: "",
    audioFile: null,
    transcript: "",
    callOutcome: "",
  });
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(
    null,
  );
  const [expandedSections, setExpandedSections] = useState<Set<number>>(
    new Set(),
  );
  const [processingStatus, setProcessingStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isTrainer, setIsTrainer] = useState(false);
  const { client: currentClient, loading: clientLoading } = useCurrentClient();
  // Hide upsell while plan is unknown (avoid flicker) and on fetch failure;
  // only render once the plan is confirmed to lack the feature.
  const showTwilioUpsell =
    !clientLoading && !!currentClient && !currentClient.plan.hasTwilio;

  useEffect(() => {
    async function init() {
      // Script é resolvido server-side em /api/analyze via dbGetActiveOrgScript
      // (org_scripts.status='active' AND ended_at IS NULL). Sem seleção manual.
      const meRes = await fetch("/api/me");

      const { data: meData } = (await meRes.json()) as {
        data: {
          id: string;
          email: string | null;
          role: string;
          name: string;
          trainerId: string | null;
        } | null;
        error: unknown;
      };
      if (meData?.role === "trainer") {
        setIsTrainer(true);
        // trainerId vem direto do backend (/api/me resolve trainers.id pelo session.user.id).
        // Setar explícito evita o fallback servidor → menos fragilidade no FK calls_trainer_id_fkey.
        setFormData((prev) => ({
          ...prev,
          trainerId: meData.trainerId ?? "",
          trainerEmail: meData.email ?? "",
          trainerName: meData.name ?? "",
        }));
      } else {
        // Owner/admin: fetch trainers list for the select
        const trainersRes = await fetch("/api/trainers");
        const { data: trainersData } = (await trainersRes.json()) as {
          data: { trainers: Trainer[] } | null;
          error: unknown;
        };
        if (trainersData?.trainers) setTrainers(trainersData.trainers);
      }

      setLoading(false);
    }

    init();
  }, []);

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: any[]) => {
      if (rejectedFiles.length > 0) {
        const rejection = rejectedFiles[0];
        if (rejection.errors[0]?.code === "file-too-large") {
          alert(t("errors.fileTooLarge"));
          return;
        }
      }
      if (acceptedFiles.length > 0) {
        setFormData((prev) => ({ ...prev, audioFile: acceptedFiles[0] }));
      }
    },
    [t],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "audio/mpeg": [".mp3"],
      "audio/wav": [".wav"],
      "audio/m4a": [".m4a"],
      "audio/ogg": [".ogg"],
      "audio/webm": [".webm"],
      "video/mp4": [".mp4"],
      "video/quicktime": [".mov"],
      "video/x-msvideo": [".avi"],
      "video/webm": [".webm"],
    },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024, // 50MB limit via Blob
  });

  const removeFile = () => {
    setFormData((prev) => ({ ...prev, audioFile: null }));
  };

  const isFormValid = () => {
    // trainerId é obrigatório nos 2 fluxos — vem do backend (/api/me pra trainer,
    // /api/trainers pra owner). Sem ele, INSERT em calls quebra no FK trainer_id.
    const hasTrainerInfo = !!formData.trainerId && !!formData.trainerName;
    const hasContent =
      uploadType === "audio" ? formData.audioFile : formData.transcript.trim();
    // Outcome é seleção obrigatória do usuário. `""` = ainda não escolhido;
    // `"no_outcome"` é um outcome legítimo (call sem desfecho detectado),
    // por isso precisamos distinguir os dois estados.
    const hasOutcome = formData.callOutcome !== "";
    return hasTrainerInfo && hasContent && hasOutcome;
  };

  const handleSubmit = async () => {
    if (!isFormValid()) return;

    console.log("[v0] Starting upload with:", {
      trainerName: formData.trainerName,
      uploadType,
      hasAudio: !!formData.audioFile,
    });
    setStep("processing");
    setError(null);
    setProgress(0);

    try {
      let transcript = formData.transcript;

      // Step 1: Transcribe audio if needed
      if (uploadType === "audio" && formData.audioFile) {
        // Step 1a: Upload to Vercel Blob via server
        setProcessingStatus(t("processing.uploadingAudio"));
        setProgress(10);

        // Create FormData to send file to server
        const uploadFormData = new FormData();
        uploadFormData.append("file", formData.audioFile);
        uploadFormData.append("filename", formData.audioFile.name);

        const uploadRes = await fetch("/api/blob-token", {
          method: "POST",
          body: uploadFormData,
        });

        if (!uploadRes.ok) {
          const errData = await uploadRes.json().catch(() => ({}));
          throw new Error(errData.error || t("errors.uploadFailed"));
        }

        const uploadData = await uploadRes.json();
        const blobUrl = uploadData.url;

        setProgress(30);

        // Step 1b: Transcribe using Blob URL
        setProcessingStatus(t("processing.transcribingAudio"));
        setProgress(40);

        const transcribeRes = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            blobUrl,
            filename: formData.audioFile.name,
          }),
        });

        console.log("[v0] Transcribe response status:", transcribeRes.status);

        if (!transcribeRes.ok) {
          let errorMsg = t("errors.transcribeFailed");
          const contentType = transcribeRes.headers.get("content-type") || "";
          if (contentType.includes("application/json")) {
            try {
              const errData = await transcribeRes.clone().json();
              errorMsg = errData.error || errorMsg;
            } catch {
              /* ignore parse error */
            }
          } else {
            errorMsg =
              transcribeRes.status === 404
                ? t("errors.apiUnavailable")
                : t("errors.httpStatus", { status: transcribeRes.status });
          }
          console.error("[v0] Transcribe error:", errorMsg);
          throw new Error(errorMsg);
        }

        const transcribeData = await transcribeRes.json();
        console.log(
          "[v0] Transcript received:",
          transcribeData.transcript?.substring(0, 100),
        );
        transcript = transcribeData.transcript;
        setProgress(50);
      }

      // Step 2: Analyze transcript (API fetches criteria + system prompt from Supabase)
      setProcessingStatus(t("processing.analyzingRubric"));
      setProgress(60);

      console.log(
        "[v0] Starting analysis with transcript length:",
        transcript.length,
      );
      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          trainerId: formData.trainerId || undefined,
          trainerName: formData.trainerName,
          trainerEmail: formData.trainerEmail,
          clientName: formData.clientName,
          callOutcome: formData.callOutcome,
        }),
      });

      console.log("[v0] Analyze response status:", analyzeRes.status);

      if (!analyzeRes.ok) {
        let errorMsg = t("errors.analyzeFailed");
        const contentType = analyzeRes.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          try {
            const errData = await analyzeRes.clone().json();
            // Concatena details (mensagem real do Supabase: FK/CHECK/etc.)
            // pra debug ficar visível na UI em vez de só log do servidor.
            errorMsg = errData.details
              ? `${errData.error || errorMsg}: ${errData.details}`
              : errData.error || errorMsg;
            if (errData.context) {
              console.error("[v0] Analyze error context:", errData.context);
            }
          } catch {
            /* ignore parse error */
          }
        } else {
          errorMsg =
            analyzeRes.status === 404
              ? t("errors.apiUnavailable")
              : t("errors.httpStatus", { status: analyzeRes.status });
        }
        console.error("[v0] Analyze error:", errorMsg);
        throw new Error(errorMsg);
      }

      const analysis = await analyzeRes.json();
      console.log("[v0] Analysis complete:", {
        score: analysis.overallScore,
        sections: analysis.sections?.length,
      });
      setProgress(100);
      setAnalysisResult(analysis);
      const sections: SectionResult[] = analysis.sections ?? [];
      const initialExpanded = new Set(
        sections
          .map((s: SectionResult, i: number) =>
            s.critical && s.score <= 2 ? i : -1,
          )
          .filter((i: number) => i !== -1),
      );
      setExpandedSections(initialExpanded);
      setStep("results");
    } catch (err) {
      console.error("[v0] Full error:", err);
      setError(err instanceof Error ? err.message : t("errors.generic"));
      setStep("input");
    }
  };

  const handleSendEmail = async () => {
    if (!analysisResult) return;

    setSendingEmail(true);
    setError(null);

    try {
      const emailRes = await fetch("/api/send-coaching", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trainerName: formData.trainerName,
          trainerEmail: formData.trainerEmail,
          clientName: formData.clientName,
          overallScore: analysisResult.overallScore,
          sections: analysisResult.sections,
          summary: analysisResult.summary,
          strengths: analysisResult.strengths,
          improvements: analysisResult.improvements,
          transcript: analysisResult.transcript,
          callOutcome: formData.callOutcome,
          detectedOutcome: analysisResult.detectedOutcome,
          locale,
        }),
      });

      if (!emailRes.ok) {
        throw new Error(t("errors.sendEmailFailed"));
      }

      setStep("complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.generic"));
    } finally {
      setSendingEmail(false);
    }
  };

  const resetForm = () => {
    setStep("input");
    setProgress(0);
    setAnalysisResult(null);
    setExpandedSections(new Set());
    setError(null);
    setFormData({
      trainerId: "",
      trainerName: "",
      trainerEmail: "",
      clientName: "",
      audioFile: null,
      transcript: "",
      callOutcome: "",
    });
  };

  if (step === "processing") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center pb-16 lg:pb-0">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <h3 className="mt-4 text-lg font-semibold">
                {t("processing.heading")}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {processingStatus || t("processing.starting")}
              </p>
              <Progress value={progress} className="mt-4 w-full" />
              <p className="mt-2 text-sm text-muted-foreground">
                {t("processing.percentComplete", { progress })}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "results" && analysisResult) {
    const overallScore = Math.round(toNumber5(analysisResult.overallScore) * 10) / 10;
    const overallLabel =
      overallScore >= 4
        ? t("results.badges.strong")
        : overallScore >= 3
          ? t("results.badges.adequate")
          : overallScore >= 2
            ? t("results.badges.needsWork")
            : t("results.badges.critical");

    return (
      <div className="space-y-6 pb-16 lg:pb-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              {t("results.title")}
            </h2>
            <p className="text-muted-foreground">
              {t("results.subtitle", { name: formData.trainerName })}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={resetForm}>
              <RotateCcw className="mr-2 h-4 w-4" />
              {t("results.startOver")}
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
            {error}
          </div>
        )}

        {/* Score Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {t("results.overallScore")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="text-5xl font-bold tabular-nums">
                {overallScore}
                <span className="text-2xl font-normal text-muted-foreground">
                  {t("results.scoreSuffix")}
                </span>
              </div>
              <div className="flex-1">
                <Progress value={(overallScore / 5) * 100} className="h-3" />
              </div>
              <Badge
                variant={
                  overallScore >= 4
                    ? "default"
                    : overallScore >= 3
                      ? "secondary"
                      : "destructive"
                }
                className="text-sm"
              >
                {overallLabel}
              </Badge>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{t("results.scoreScaleHint")}</span>
              {analysisResult.detectedOutcome &&
                (() => {
                  const outcomeMeta: Record<string, { cap: number }> = {
                    closed: { cap: 5 },
                    partial: { cap: 4 },
                    not_closed: { cap: 3 },
                    no_outcome: { cap: 2.5 },
                  };
                  const outcomeKey = analysisResult.detectedOutcome;
                  const meta = outcomeMeta[outcomeKey] ?? { cap: 100 };
                  const knownOutcomes = [
                    "closed",
                    "partial",
                    "not_closed",
                    "no_outcome",
                  ] as const;
                  const isKnown = (knownOutcomes as readonly string[]).includes(
                    outcomeKey,
                  );
                  const label = isKnown
                    ? t(
                        `results.outcomes.${outcomeKey as (typeof knownOutcomes)[number]}.label`,
                      )
                    : outcomeKey;
                  const note = isKnown
                    ? t(
                        `results.outcomes.${outcomeKey as (typeof knownOutcomes)[number]}.note`,
                      )
                    : "";
                  return (
                    <span
                      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium"
                      title={note}
                    >
                      {t("results.outcomeBadge", { label, cap: meta.cap })}
                    </span>
                  );
                })()}
            </div>
          </CardContent>
        </Card>

        {/* Section Scores */}
        <Card>
          <CardHeader>
            <CardTitle>{t("results.sectionBreakdown")}</CardTitle>
            <CardDescription>
              {t("results.sectionBreakdownHint")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(analysisResult.sections ?? []).map(
              (section, index) => {
                const score = Math.round(toNumber5(section.score ?? 0) * 10) / 10;
                const pct = (score / 5) * 100;
                const isCriticalAlert = section.critical && score <= 2;
                const isExpanded = expandedSections.has(index);
                const borderColor = isCriticalAlert
                  ? "border-red-400"
                  : score >= 4.5
                    ? "border-green-200"
                    : score >= 3.5
                      ? "border-blue-200"
                      : score >= 2.5
                        ? "border-amber-200"
                        : "border-red-200";
                const headerColor = isCriticalAlert
                  ? "text-red-700 bg-red-50"
                  : score >= 4.5
                    ? "text-green-700 bg-green-50"
                    : score >= 3.5
                      ? "text-blue-700 bg-blue-50"
                      : score >= 2.5
                        ? "text-amber-700 bg-amber-50"
                        : "text-red-700 bg-red-50";
                const barColor =
                  score >= 4.5
                    ? "bg-green-500"
                    : score >= 3.5
                      ? "bg-blue-500"
                      : score >= 2.5
                        ? "bg-amber-500"
                        : "bg-red-500";
                const label =
                  score >= 4.5
                    ? t("results.sectionLabels.excellent")
                    : score >= 3.5
                      ? t("results.sectionLabels.strong")
                      : score >= 2.5
                        ? t("results.sectionLabels.adequate")
                        : score >= 1.5
                          ? t("results.sectionLabels.needsWork")
                          : t("results.sectionLabels.notAttempted");

                return (
                  <div
                    key={index}
                    className={`rounded-lg border ${borderColor} overflow-hidden`}
                  >
                    {/* Accordion header */}
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedSections((prev) => {
                          const next = new Set(prev);
                          next.has(index)
                            ? next.delete(index)
                            : next.add(index);
                          return next;
                        })
                      }
                      className={`w-full flex items-center justify-between px-4 py-3 ${headerColor} hover:opacity-90 transition-opacity`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isCriticalAlert && (
                          <span className="shrink-0">⚠️</span>
                        )}
                        <span className="font-semibold text-sm truncate">
                          {section.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <Badge variant="outline" className="font-bold text-xs">
                          {t("results.sectionScore", { score, label })}
                        </Badge>
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        />
                      </div>
                    </button>

                    {/* Progress bar always visible */}
                    <div className="h-1.5 bg-black/10">
                      <div
                        className={`h-1.5 ${barColor} transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    {/* Accordion body */}
                    {isExpanded && section.feedback && (
                      <div className="px-4 py-3 bg-background text-sm text-muted-foreground leading-relaxed">
                        {isCriticalAlert && (
                          <div className="flex items-center gap-1.5 text-xs font-medium text-red-700 bg-red-100 border border-red-200 rounded px-2 py-1 mb-2">
                            <span>⚠</span>
                            <span>{t("results.criticalSectionAlert")}</span>
                          </div>
                        )}
                        {section.feedback}
                      </div>
                    )}
                  </div>
                );
              },
            )}
          </CardContent>
        </Card>

        {/* Summary & Insights */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-green-500">
                {t("results.strengths")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {analysisResult.strengths.map((strength, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm">
                    <CheckCircle className="mt-0.5 h-4 w-4 text-green-500 shrink-0" />
                    {strength}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-amber-500">
                {t("results.areasForImprovement")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {analysisResult.improvements.map((improvement, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm">
                    <XCircle className="mt-0.5 h-4 w-4 text-amber-500 shrink-0" />
                    {improvement}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Summary */}
        <Card>
          <CardHeader>
            <CardTitle>{t("results.summary")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{analysisResult.summary}</p>
          </CardContent>
        </Card>

        {/* Transcript */}
        <Card>
          <CardHeader>
            <CardTitle>{t("results.callTranscript")}</CardTitle>
            <CardDescription>{t("results.transcriptSubtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border bg-muted/50 p-4 font-mono text-sm max-h-96 overflow-y-auto whitespace-pre-wrap break-words scrollbar-thin scrollbar-thumb-muted-foreground/30 hover:scrollbar-thumb-muted-foreground/50">
              {analysisResult.transcript}
            </div>
          </CardContent>
        </Card>

        {/* Send Email Action — owner/admin only. Trainer não dispara coaching
            email (nem pra si mesmo) — função é do Owner. */}
        {!isTrainer && (
          <Card className="border-primary/50 bg-primary/5">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center sm:flex-row sm:justify-between sm:text-left">
                <div>
                  <h3 className="font-semibold">{t("results.readyToSend")}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t("results.readyToSendSubtitle", {
                      email: formData.trainerEmail,
                    })}
                  </p>
                </div>
                <Button
                  size="lg"
                  className="mt-4 sm:mt-0"
                  onClick={handleSendEmail}
                  disabled={sendingEmail}
                >
                  {sendingEmail ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("results.sending")}
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      {t("results.sendCoachingEmail")}
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  if (step === "complete") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center pb-16 lg:pb-0">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center">
              <div className="rounded-full bg-green-500/10 p-3">
                <CheckCircle className="h-12 w-12 text-green-500" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">
                {t("complete.heading")}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("complete.subtitle", { email: formData.trainerEmail })}
              </p>
              <div className="mt-6 flex gap-2">
                <Button variant="outline" onClick={resetForm}>
                  {t("complete.uploadAnother")}
                </Button>
                <Button asChild>
                  <a href={`/${locale}/dashboard/history`}>
                    {t("complete.viewHistory")}
                  </a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16 lg:pb-0">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t("title")}</h2>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      {showTwilioUpsell && (
        <UpsellCard
          requires="pro"
          title={tUpsell("title")}
          description={tUpsell("description")}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Trainer Info */}
        <Card>
          <CardHeader>
            <CardTitle>{t("form.salesPersonInfoTitle")}</CardTitle>
            <CardDescription>
              {t("form.salesPersonInfoSubtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isTrainer ? (
              <div className="space-y-2">
                <Label>{t("form.salesPersonLabel")}</Label>
                <Input value={formData.trainerName} disabled />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="trainerId">{t("form.salesPersonLabel")}</Label>
                <Select
                  value={formData.trainerId}
                  onValueChange={(value) => {
                    const trainer = trainers.find((t) => t.id === value);
                    if (!trainer) return;
                    setFormData((prev) => ({
                      ...prev,
                      trainerId: trainer.id,
                      trainerName: trainer.name,
                      trainerEmail: trainer.email ?? "",
                    }));
                  }}
                >
                  <SelectTrigger id="trainerId">
                    <SelectValue
                      placeholder={t("form.selectTrainerPlaceholder")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {trainers.map((trainer) => (
                      <SelectItem key={trainer.id} value={trainer.id}>
                        {trainer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="clientName">{t("form.clientNameLabel")}</Label>
              <Input
                id="clientName"
                placeholder={t("form.clientNamePlaceholder")}
                value={formData.clientName}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    clientName: e.target.value,
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                {t("form.clientNameHint")}
              </p>
            </div>
            <div className="space-y-2">
              <Label>{t("form.callOutcomeLabel")}</Label>
              <div className="grid grid-cols-2 gap-2">
                {/* Cores alinhadas semanticamente com RESULT_STYLES (lib/constants):
                    closed=green, partial=amber, not_closed=red, no_outcome=muted/gray.
                    Mantém consistência visual entre form de seleção e badges de listagem. */}
                {(
                  [
                    {
                      value: "closed",
                      color:
                        "bg-green-100 border-green-500 text-green-700 dark:bg-green-900 dark:text-green-300",
                    },
                    {
                      value: "partial",
                      color:
                        "bg-amber-100 border-amber-500 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
                    },
                    {
                      value: "not_closed",
                      color:
                        "bg-red-100 border-red-500 text-red-700 dark:bg-red-900 dark:text-red-300",
                    },
                    {
                      value: "no_outcome",
                      color:
                        "bg-gray-100 border-gray-400 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
                    },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        callOutcome: option.value as CallOutcome,
                      }))
                    }
                    className={`px-3 py-2.5 rounded-md border-2 text-sm font-medium transition-all text-left ${
                      formData.callOutcome === option.value
                        ? option.color
                        : "bg-muted/50 border-transparent text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {t(`form.outcomes.${option.value}`)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("form.callOutcomeHint")}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Call Content */}
        <Card>
          <CardHeader>
            <CardTitle>{t("form.callContentTitle")}</CardTitle>
            <CardDescription>{t("form.callContentSubtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs
              value={uploadType}
              onValueChange={(v) => setUploadType(v as "audio" | "transcript")}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="audio">
                  <FileAudio className="mr-2 h-4 w-4" />
                  {t("form.tabs.audio")}
                </TabsTrigger>
                <TabsTrigger value="transcript">
                  <FileText className="mr-2 h-4 w-4" />
                  {t("form.tabs.transcript")}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="audio" className="mt-4">
                {formData.audioFile ? (
                  <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 p-4">
                    <div className="flex items-center gap-3">
                      {formData.audioFile.type.startsWith("video/") ? (
                        <FileVideo className="h-8 w-8 text-primary" />
                      ) : (
                        <FileAudio className="h-8 w-8 text-primary" />
                      )}
                      <div>
                        <p className="font-medium">{formData.audioFile.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {t("form.fileSizeMb", {
                            size: (
                              formData.audioFile.size /
                              1024 /
                              1024
                            ).toFixed(2),
                          })}
                        </p>
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" onClick={removeFile}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div
                    {...getRootProps()}
                    className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                      isDragActive
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <input {...getInputProps()} />
                    <Upload className="mx-auto h-10 w-10 text-muted-foreground" />
                    <p className="mt-2 text-sm font-medium">
                      {isDragActive
                        ? t("form.dropFileHere")
                        : t("form.dragAndDrop")}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("form.supportedFormats")}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4 bg-transparent"
                    >
                      {t("form.browseFiles")}
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="transcript" className="mt-4">
                <Textarea
                  placeholder={t("form.transcriptPlaceholder")}
                  rows={10}
                  value={formData.transcript}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      transcript: e.target.value,
                    }))
                  }
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("form.charactersCount", {
                    count: formData.transcript.length,
                  })}
                </p>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end">
        <Button size="lg" onClick={handleSubmit} disabled={!isFormValid()}>
          <Sparkles className="mr-2 h-4 w-4" />
          {t("analyzeCall")}
        </Button>
      </div>
    </div>
  );
}
