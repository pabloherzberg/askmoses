"use client"

import { useState } from "react"
import { useLocale, useTranslations } from "next-intl"
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
import type { LucideIcon } from "lucide-react"

const STEP_KEYS = ['script', 'upload', 'review', 'email', 'track', 'insights'] as const
const STEP_ICONS: LucideIcon[] = [Settings, Upload, CheckCircle, Mail, BarChart3, Brain]

export default function GuidePage() {
  const t = useTranslations("Dashboard.guide")
  const locale = useLocale()
  const [expandedStep, setExpandedStep] = useState<number | null>(1)

  const faqs = t.raw('faqs') as { q: string; a: string }[]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-2">
          {t('subtitle')}
        </p>
      </div>

      {/* Quick Start */}
      <Card className="border-primary/50 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-primary" />
            {t('quickStart')}
          </CardTitle>
          <CardDescription>
            {t('quickStartSubtitle')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            {[1, 2, 3].map((n) => (
              <div key={n} className="flex-1 flex items-center gap-3 p-4 rounded-lg bg-background border">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm">
                  {n}
                </div>
                <div>
                  <p className="font-medium">{t(`quickStep${n}Title` as 'quickStep1Title' | 'quickStep2Title' | 'quickStep3Title')}</p>
                  <p className="text-sm text-muted-foreground">{t(`quickStep${n}Desc` as 'quickStep1Desc' | 'quickStep2Desc' | 'quickStep3Desc')}</p>
                </div>
                {n < 3 && <ArrowRight className="hidden md:block h-5 w-5 text-muted-foreground ml-auto self-center" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Step by Step */}
      <div>
        <h2 className="text-xl font-semibold mb-4">{t('stepByStep')}</h2>
        <div className="space-y-4">
          {STEP_KEYS.map((key, i) => {
            const Icon = STEP_ICONS[i]
            const number = i + 1
            const details = t.raw(`steps.${key}.details`) as string[]
            const tips = t.raw(`steps.${key}.tips`) as string[]
            return (
              <Card
                key={key}
                className={`cursor-pointer transition-all ${
                  expandedStep === number
                    ? "border-primary shadow-md"
                    : "hover:border-muted-foreground/50"
                }`}
                onClick={() =>
                  setExpandedStep(expandedStep === number ? null : number)
                }
              >
                <CardHeader>
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {t('stepLabel', { n: number })}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {t(`steps.${key}.location`)}
                        </Badge>
                      </div>
                      <CardTitle className="mt-2 text-lg">{t(`steps.${key}.title`)}</CardTitle>
                      <CardDescription>{t(`steps.${key}.description`)}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                {expandedStep === number && (
                  <CardContent className="pt-0">
                    <div className="ml-14 space-y-4">
                      <div>
                        <h4 className="font-medium text-sm mb-2">{t('howToDoIt')}</h4>
                        <ol className="space-y-2">
                          {details.map((detail, idx) => (
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
                          {t('proTips')}
                        </h4>
                        <ul className="space-y-1">
                          {tips.map((tip, idx) => (
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
            )
          })}
        </div>
      </div>

      {/* FAQ */}
      <div>
        <h2 className="text-xl font-semibold mb-4">{t('faqTitle')}</h2>
        <Card>
          <CardContent className="pt-6">
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((faq, idx) => (
                <AccordionItem key={idx} value={`faq-${idx}`}>
                  <AccordionTrigger className="text-left">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {faq.a}
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
              <h3 className="font-semibold">{t('needMoreHelp')}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t('needMoreHelpBody1')}
                <a href={`/${locale}/tech`} className="text-primary underline">
                  {t('needMoreHelpLink')}
                </a>
                {t('needMoreHelpBody2')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
