"use client"

import type React from "react"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()

  useEffect(() => {
    const auth = sessionStorage.getItem("askmoses_auth")
    if (!auth) {
      router.replace("/")
    }
  }, [router])

  return (
    <div className="rounded-lg border-2 p-4 dark:border-yellow-800 dark:bg-yellow-950 bg-black border-secondary">
      <DashboardSidebar />
      <div className="lg:pl-64">
        <DashboardHeader />
        <main className="p-6">{children}</main>
      </div>
    </div>
  )
}
