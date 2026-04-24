"use client"

import { useState } from "react"
import { LogoSVG } from "@/components/shared/LogoSVG"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import {
  TrendingUp,
  TrendingDown,
  Phone,
  Users,
  Target,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Mail,
  Calendar,
  BarChart3,
  Zap,
  Clock,
  Award,
  MessageSquare,
  ChevronRight,
  Bell,
  Settings,
  LogOut,
  User,
  Building2,
} from "lucide-react"

// Fake data for the demo
const teamMembers = [
  {
    id: 1,
    name: "Pablo Santos",
    avatar: "PS",
    calls: 47,
    closed: 19,
    conversionRate: 40.4,
    trend: "up",
    trendValue: 8.2,
    avgDuration: "14:32",
    lastCall: "2 hours ago",
    status: "excellent",
  },
  {
    id: 2,
    name: "Maria Silva",
    avatar: "MS",
    calls: 52,
    closed: 12,
    conversionRate: 23.1,
    trend: "down",
    trendValue: -5.3,
    avgDuration: "8:45",
    lastCall: "45 min ago",
    status: "needs_attention",
  },
  {
    id: 3,
    name: "Jose Oliveira",
    avatar: "JO",
    calls: 38,
    closed: 13,
    conversionRate: 34.2,
    trend: "up",
    trendValue: 2.1,
    avgDuration: "12:18",
    lastCall: "1 hour ago",
    status: "good",
  },
]

const actionItems = [
  {
    id: 1,
    type: "urgent",
    title: "Coach Maria on discovery questions",
    description: "Maria's conversion dropped 5.3% this week. Her calls are 6 minutes shorter than team average.",
    action: "Schedule 1:1 coaching session",
    user: "Maria Silva",
  },
  {
    id: 2,
    type: "opportunity",
    title: "Share Pablo's objection handling",
    description: "Pablo closes 40% of his calls. His objection responses are 2x more effective than team average.",
    action: "Create team training from Pablo's calls",
    user: "Pablo Santos",
  },
  {
    id: 3,
    type: "insight",
    title: "Update script for pricing objections",
    description: "32% of lost calls mention pricing concerns. Current script success rate on pricing: 18%.",
    action: "Review suggested script changes",
    user: null,
  },
]

const recentCalls = [
  { id: 1, user: "Pablo Santos", outcome: "closed", duration: "16:42", time: "2h ago", lead: "John D." },
  { id: 2, user: "Maria Silva", outcome: "not_closed", duration: "7:23", time: "2.5h ago", lead: "Sarah M." },
  { id: 3, user: "Jose Oliveira", outcome: "partial", duration: "12:05", time: "3h ago", lead: "Mike T." },
  { id: 4, user: "Pablo Santos", outcome: "closed", duration: "18:31", time: "4h ago", lead: "Lisa K." },
  { id: 5, user: "Maria Silva", outcome: "not_closed", duration: "5:12", time: "4.5h ago", lead: "Tom R." },
]

const weeklyStats = {
  totalCalls: 137,
  totalClosed: 44,
  conversionRate: 32.1,
  avgDuration: "11:52",
  revenueImpact: "$12,400",
  vsLastWeek: "+12%",
}

export default function DemoBizPage() {
  const [activeTab, setActiveTab] = useState("overview")
  const [showNotification, setShowNotification] = useState(true)

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <LogoSVG width={160} height={45} className="h-10 w-auto" />
            </div>
            
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" className="relative">
                <Bell className="h-5 w-5" />
                {showNotification && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center">
                    3
                  </span>
                )}
              </Button>
              <Button variant="ghost" size="sm">
                <Settings className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-2 pl-4 border-l border-border">
                <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-medium">
                  DW
                </div>
                <div className="hidden sm:block">
                  <p className="text-sm font-medium">Dog Wizard HQ</p>
                  <p className="text-xs text-muted-foreground">Franchisor Account</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Banner */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-6 mb-8 text-white">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold mb-1">Good morning, Ariel!</h1>
              <p className="text-blue-100">Your team made 47 calls this week. Here's what needs your attention.</p>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" className="bg-white/90 text-primary hover:bg-white">
                <Calendar className="mr-2 h-4 w-4" />
                Schedule Team Review
              </Button>
            </div>
          </div>
        </div>

        {/* Action Items - Priority Section */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">Priority Actions</h2>
              <p className="text-sm text-muted-foreground">AI-powered recommendations to improve your team's performance</p>
            </div>
            <Badge variant="secondary" className="bg-amber-100 text-amber-700">
              3 items need attention
            </Badge>
          </div>
          
          <div className="grid gap-4">
            {actionItems.map((item) => (
              <Card key={item.id} className={`border-l-4 ${
                item.type === "urgent" ? "border-l-red-500 bg-red-50/50" :
                item.type === "opportunity" ? "border-l-green-500 bg-green-50/50" :
                "border-l-blue-500 bg-blue-50/50"
              }`}>
                <CardContent className="p-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex gap-3">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                        item.type === "urgent" ? "bg-red-100" :
                        item.type === "opportunity" ? "bg-green-100" :
                        "bg-blue-100"
                      }`}>
                        {item.type === "urgent" ? (
                          <AlertTriangle className="h-5 w-5 text-red-600" />
                        ) : item.type === "opportunity" ? (
                          <Award className="h-5 w-5 text-green-600" />
                        ) : (
                          <Zap className="h-5 w-5 text-blue-600" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium">{item.title}</h3>
                          {item.user && (
                            <Badge variant="outline" className="text-xs">
                              {item.user}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{item.description}</p>
                      </div>
                    </div>
                    <Button size="sm" className={
                      item.type === "urgent" ? "bg-red-600 hover:bg-red-700" :
                      item.type === "opportunity" ? "bg-green-600 hover:bg-green-700" :
                      "bg-blue-600 hover:bg-blue-700"
                    }>
                      {item.action}
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Stats Overview */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4">This Week's Performance</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Phone className="h-4 w-4" />
                  <span className="text-xs">Total Calls</span>
                </div>
                <p className="text-2xl font-bold">{weeklyStats.totalCalls}</p>
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  {weeklyStats.vsLastWeek} vs last week
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-xs">Closed</span>
                </div>
                <p className="text-2xl font-bold">{weeklyStats.totalClosed}</p>
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  +18% vs last week
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Target className="h-4 w-4" />
                  <span className="text-xs">Conversion</span>
                </div>
                <p className="text-2xl font-bold">{weeklyStats.conversionRate}%</p>
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  +4.2% vs last week
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Clock className="h-4 w-4" />
                  <span className="text-xs">Avg Duration</span>
                </div>
                <p className="text-2xl font-bold">{weeklyStats.avgDuration}</p>
                <p className="text-xs text-muted-foreground">Target: 15:00</p>
              </CardContent>
            </Card>
            
            <Card className="col-span-2">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs">Revenue Impact</span>
                </div>
                <p className="text-2xl font-bold text-green-600">{weeklyStats.revenueImpact}</p>
                <p className="text-xs text-muted-foreground">Estimated from closed calls</p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Team Performance */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">Team Performance</h2>
              <p className="text-sm text-muted-foreground">Click on a team member to see detailed analytics</p>
            </div>
            <Button variant="outline" size="sm">
              <Users className="mr-2 h-4 w-4" />
              Manage Team
            </Button>
          </div>
          
          <div className="grid md:grid-cols-3 gap-4">
            {teamMembers.map((member) => (
              <Card 
                key={member.id} 
                className={`cursor-pointer hover:shadow-md transition-shadow ${
                  member.status === "needs_attention" ? "ring-2 ring-amber-400" : ""
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`h-12 w-12 rounded-full flex items-center justify-center text-white font-medium ${
                        member.status === "excellent" ? "bg-green-600" :
                        member.status === "needs_attention" ? "bg-amber-500" :
                        "bg-blue-600"
                      }`}>
                        {member.avatar}
                      </div>
                      <div>
                        <h3 className="font-medium">{member.name}</h3>
                        <p className="text-xs text-muted-foreground">Last call: {member.lastCall}</p>
                      </div>
                    </div>
                    {member.status === "needs_attention" && (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                        Needs attention
                      </Badge>
                    )}
                    {member.status === "excellent" && (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        Top performer
                      </Badge>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Calls</p>
                      <p className="text-lg font-semibold">{member.calls}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Closed</p>
                      <p className="text-lg font-semibold">{member.closed}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Rate</p>
                      <p className="text-lg font-semibold">{member.conversionRate}%</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-sm">
                      {member.trend === "up" ? (
                        <>
                          <TrendingUp className="h-4 w-4 text-green-600" />
                          <span className="text-green-600">+{member.trendValue}%</span>
                        </>
                      ) : (
                        <>
                          <TrendingDown className="h-4 w-4 text-red-600" />
                          <span className="text-red-600">{member.trendValue}%</span>
                        </>
                      )}
                      <span className="text-muted-foreground">vs last week</span>
                    </div>
                    <Button variant="ghost" size="sm">
                      View Details
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Recent Activity */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">Recent Calls</h2>
              <p className="text-sm text-muted-foreground">Latest calls from your team</p>
            </div>
            <Button variant="outline" size="sm">
              View All Calls
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
          
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {recentCalls.map((call) => (
                  <div key={call.id} className="flex items-center justify-between p-4 hover:bg-muted/50 cursor-pointer">
                    <div className="flex items-center gap-4">
                      <div className={`h-3 w-3 rounded-full ${
                        call.outcome === "closed" ? "bg-green-500" :
                        call.outcome === "partial" ? "bg-amber-500" :
                        "bg-red-500"
                      }`} />
                      <div>
                        <p className="font-medium">{call.lead}</p>
                        <p className="text-sm text-muted-foreground">{call.user}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-sm font-medium">{call.duration}</p>
                        <p className="text-xs text-muted-foreground">{call.time}</p>
                      </div>
                      <Badge variant={
                        call.outcome === "closed" ? "default" :
                        call.outcome === "partial" ? "secondary" :
                        "outline"
                      } className={
                        call.outcome === "closed" ? "bg-green-600" :
                        call.outcome === "partial" ? "bg-amber-100 text-amber-700" :
                        "bg-red-50 text-red-600"
                      }>
                        {call.outcome === "closed" ? "Closed" :
                         call.outcome === "partial" ? "Partial" :
                         "Not Closed"}
                      </Badge>
                      <Button variant="ghost" size="sm">
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Footer */}
        <footer className="mt-12 pt-8 border-t border-border text-center">
          <p className="text-sm text-muted-foreground mb-2">
            <span className="font-medium text-foreground">Ask Moses</span> — Turn conversations into profit
          </p>
          <p className="text-xs text-muted-foreground">
            Demo Version | Data shown is for demonstration purposes only
          </p>
        </footer>
      </main>
    </div>
  )
}
