"use client"

import { useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  FileText,
  Upload,
  Mail,
  BarChart3,
  Settings,
  CheckCircle,
  ArrowRight,
  Lightbulb,
  AlertCircle,
  Brain,
} from "lucide-react"

const steps = [
  {
    number: 1,
    title: "Configure Your Sales Script",
    icon: Settings,
    description: "Set up your ideal sales process that trainers should follow",
    location: "Rubric page",
    details: [
      "Go to the Rubric page in the sidebar",
      "Click 'Create Script' to add a new sales script",
      "Add a name and description for your script",
      "Define sections (e.g., Greeting, Discovery, Demo, Closing)",
      "For each section, add instructions and tips",
      "The system will automatically generate evaluation criteria",
    ],
    tips: [
      "Be specific in your section instructions for better AI analysis",
      "Include tips that help trainers understand what good looks like",
      "You can create multiple scripts for different call types",
    ],
  },
  {
    number: 2,
    title: "Upload a Sales Call",
    icon: Upload,
    description: "Submit call recordings or transcripts for AI analysis",
    location: "Upload Call page",
    details: [
      "Navigate to Upload Call in the sidebar",
      "Enter the trainer's name and email",
      "Select which sales script to evaluate against",
      "Choose upload method: Audio file or paste transcript",
      "For audio: Upload MP3, WAV, or M4A files (max 25MB)",
      "For transcript: Paste the call transcript directly",
      "Click 'Analyze Call' to start the AI evaluation",
    ],
    tips: [
      "Audio files are automatically transcribed using AI",
      "Clear audio quality produces better transcriptions",
      "Include speaker labels in transcripts when pasting manually",
    ],
  },
  {
    number: 3,
    title: "Review AI Analysis",
    icon: CheckCircle,
    description: "See detailed feedback on how well the trainer followed the script",
    location: "After upload",
    details: [
      "View the overall score (sections covered vs total)",
      "See pass/fail status for each evaluation criterion",
      "Read specific feedback for each section",
      "Review strengths highlighted by the AI",
      "Check suggested areas for improvement",
      "Access the full call transcript for reference",
    ],
    tips: [
      "The AI evaluates based on your script sections",
      "Feedback is constructive and actionable",
      "Use the transcript to verify AI observations",
    ],
  },
  {
    number: 4,
    title: "Send Coaching Email",
    icon: Mail,
    description: "Deliver personalized feedback directly to the trainer",
    location: "Results page",
    details: [
      "After analysis, click 'Send Coaching Email'",
      "The email is sent to the trainer's email address",
      "Email includes score, summary, and detailed feedback",
      "Trainers receive actionable tips for improvement",
      "Call is automatically saved to history",
    ],
    tips: [
      "Emails are branded and professional",
      "Trainers can review feedback at their own pace",
      "Consider following up on areas needing improvement",
    ],
  },
  {
    number: 5,
    title: "Track Performance",
    icon: BarChart3,
    description: "Monitor trends and identify coaching opportunities",
    location: "History & Analytics pages",
    details: [
      "History: View all analyzed calls with search and filters",
      "Filter by trainer name, date range, or score",
      "Click any call to see full details and transcript",
      "Analytics: See aggregate performance metrics",
      "Track pass rates by criteria across all calls",
      "Identify which script sections need more training",
    ],
    tips: [
      "Regular review helps identify training patterns",
      "Low-performing criteria indicate coaching opportunities",
      "Use filters to focus on specific trainers or periods",
    ],
  },
  {
    number: 6,
    title: "Generate Team Insights",
    icon: Brain,
    description: "Use pattern recognition to optimize your sales script based on real performance data",
    location: "Insights page",
    details: [
      "Navigate to Insights in the sidebar",
      "Select a sales script from the dropdown",
      "Click 'Generate Insights' to analyze all calls using that script",
      "The system groups calls by outcome: Closed, Not Closed, and Partial",
      "AI analyzes patterns across all groups and generates insights",
      "Review the DO's - best practices from successful closers",
      "Review the DON'Ts - behaviors that lose deals",
      "Study common objections and how closers handle them",
      "Review the pre-call checklist and suggested optimized script",
      "Click 'Save as New Script' to create an improved script based on insights",
      "Send insights as a Weekly Bulletin email to your entire team",
    ],
    tips: [
      "You need at least 5-10 calls per script for meaningful insights",
      "Insights are based on REAL performance data, not theory",
      "This is pattern recognition, not full reinforcement learning - it identifies what works in your specific context",
      "Save successful patterns as new scripts to test in the field",
      "Share weekly bulletins with your team to align on best practices",
    ],
  },
]

const faqs = [
  {
    question: "What audio formats are supported?",
    answer: "We support MP3, WAV, M4A, and most common audio formats. Files must be under 25MB. For larger files, consider compressing or splitting the recording.",
  },
  {
    question: "How accurate is the AI transcription?",
    answer: "Our AI transcription uses OpenAI Whisper, which is highly accurate for clear audio. For best results, ensure good audio quality with minimal background noise.",
  },
  {
    question: "Can I edit the generated criteria?",
    answer: "Currently, criteria are auto-generated based on your script sections. You can modify the script and sections to adjust what gets evaluated.",
  },
  {
    question: "How does the AI scoring work?",
    answer: "The AI reads the transcript and compares it against your defined script sections. Each section is marked as 'covered' or 'not covered' based on whether the trainer addressed the key points.",
  },
  {
    question: "Can I use different AI models?",
    answer: "Yes! In the Rubric settings, you can choose between OpenAI GPT-4o Mini (fast and economical) or Google Gemini 2.5 (more powerful analysis).",
  },
  {
    question: "Why can't I send emails to other addresses?",
    answer: "For MVP/testing, emails are restricted to the registered account. To send to any email, a custom domain needs to be verified in Resend settings.",
  },
  {
    question: "How do I create multiple scripts?",
    answer: "Go to Rubric, click 'Create Script', and define a new script with its own sections. When uploading calls, select which script to evaluate against.",
  },
  {
    question: "What is the Insights feature?",
    answer: "Insights uses pattern recognition to analyze all your calls grouped by outcome (Closed, Not Closed, Partial). It identifies what successful closers have in common, what non-closers do wrong, common objections, and generates a suggested optimized script. This is different from reinforcement learning - it's data-driven pattern matching based on your actual call data.",
  },
  {
    question: "How is Insights different from Reinforcement Learning?",
    answer: "True reinforcement learning would automatically iterate on scripts based on continuous feedback loops with reward signals. Insights is one level simpler: it's pattern recognition + script generation. You upload calls, we analyze patterns and suggest improvements. You then decide whether to test the new script. Future versions could automate the iteration loop.",
  },
  {
    question: "How many calls do I need to generate insights?",
    answer: "While you can generate insights with fewer calls, 5-10 calls per script provides meaningful patterns. With more calls, especially diverse trainer outcomes, patterns become more statistically significant.",
  },
  {
    question: "Can I customize the insights analysis?",
    answer: "Currently, the AI analyzes based on call outcomes and transcripts against your script. The analysis includes DO's, DON'Ts, common objections, and a suggested script. Future versions could allow custom analysis parameters.",
  },
]

export default function GuidePage() {
  const [expandedStep, setExpandedStep] = useState<number | null>(1)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">How to Use</h1>
        <p className="text-muted-foreground mt-2">
          Complete guide to analyzing sales calls and coaching your team
        </p>
      </div>

      {/* Quick Start */}
      <Card className="border-primary/50 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-primary" />
            Quick Start
          </CardTitle>
          <CardDescription>
            Get up and running in 3 simple steps
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 flex items-center gap-3 p-4 rounded-lg bg-background border">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm">
                1
              </div>
              <div>
                <p className="font-medium">Create a Script</p>
                <p className="text-sm text-muted-foreground">Define your sales process</p>
              </div>
            </div>
            <ArrowRight className="hidden md:block h-5 w-5 text-muted-foreground self-center" />
            <div className="flex-1 flex items-center gap-3 p-4 rounded-lg bg-background border">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm">
                2
              </div>
              <div>
                <p className="font-medium">Upload a Call</p>
                <p className="text-sm text-muted-foreground">Audio or transcript</p>
              </div>
            </div>
            <ArrowRight className="hidden md:block h-5 w-5 text-muted-foreground self-center" />
            <div className="flex-1 flex items-center gap-3 p-4 rounded-lg bg-background border">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm">
                3
              </div>
              <div>
                <p className="font-medium">Send Feedback</p>
                <p className="text-sm text-muted-foreground">Email coaching to sales person</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step by Step */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Step-by-Step Guide</h2>
        <div className="space-y-4">
          {steps.map((step) => (
            <Card
              key={step.number}
              className={`cursor-pointer transition-all ${
                expandedStep === step.number
                  ? "border-primary shadow-md"
                  : "hover:border-muted-foreground/50"
              }`}
              onClick={() =>
                setExpandedStep(expandedStep === step.number ? null : step.number)
              }
            >
              <CardHeader>
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <step.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        Step {step.number}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {step.location}
                      </Badge>
                    </div>
                    <CardTitle className="mt-2 text-lg">{step.title}</CardTitle>
                    <CardDescription>{step.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              {expandedStep === step.number && (
                <CardContent className="pt-0">
                  <div className="ml-14 space-y-4">
                    <div>
                      <h4 className="font-medium text-sm mb-2">How to do it:</h4>
                      <ol className="space-y-2">
                        {step.details.map((detail, idx) => (
                          <li
                            key={idx}
                            className="flex items-start gap-2 text-sm text-muted-foreground"
                          >
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs font-medium shrink-0">
                              {idx + 1}
                            </span>
                            {detail}
                          </li>
                        ))}
                      </ol>
                    </div>
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <h4 className="font-medium text-sm mb-2 flex items-center gap-2 text-amber-600 dark:text-amber-400">
                        <Lightbulb className="h-4 w-4" />
                        Pro Tips
                      </h4>
                      <ul className="space-y-1">
                        {step.tips.map((tip, idx) => (
                          <li
                            key={idx}
                            className="text-sm text-amber-700 dark:text-amber-300"
                          >
                            • {tip}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Frequently Asked Questions</h2>
        <Card>
          <CardContent className="pt-6">
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((faq, idx) => (
                <AccordionItem key={idx} value={`faq-${idx}`}>
                  <AccordionTrigger className="text-left">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      </div>

      {/* Need Help */}
      <Card className="border-blue-500/50 bg-blue-500/5">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold">Need More Help?</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Check the{" "}
                <a href="/tech" className="text-primary underline">
                  Technical Documentation
                </a>{" "}
                for API details, database schema, and integration guides. For feature
                requests or issues, contact your administrator.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
