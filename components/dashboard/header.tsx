"use client"

import { usePathname, useRouter } from "next/navigation"
import { Menu, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet"
import Link from "next/link"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Upload,
  History,
  Settings,
  FileText,
} from "lucide-react"

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Upload Call", href: "/dashboard/upload", icon: Upload },
  { name: "History", href: "/dashboard/history", icon: History },
  { name: "Rubric", href: "/dashboard/settings", icon: Settings },
]

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/upload": "Upload Call",
  "/dashboard/history": "Call History",
  "/dashboard/settings": "Rubric Settings",
}

export function DashboardHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const title = pageTitles[pathname] || "Dashboard"

  function handleLogout() {
    sessionStorage.removeItem("askmoses_auth")
    router.push("/")
  }

  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-border bg-card px-4 sm:gap-x-6 sm:px-6 lg:px-8">
      {/* Mobile menu */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="lg:hidden">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Open menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <div className="flex h-full flex-col">
            <div className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-6">
              <FileText className="h-6 w-6 text-primary" />
              <span className="text-lg font-semibold">Ask Moses</span>
            </div>
            <nav className="flex-1 px-4 py-4">
              <ul className="space-y-1">
                {navigation.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/dashboard" &&
                      pathname.startsWith(item.href))
                  return (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex gap-x-3 rounded-md p-2 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                        )}
                      >
                        <item.icon className="h-5 w-5 shrink-0" />
                        {item.name}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </nav>
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex flex-1 items-center justify-between">
        <h1 className="text-lg font-semibold">{title}</h1>
        <div className="flex items-center gap-4">
          <span className="hidden text-sm text-muted-foreground sm:block">
            Unleashed Consulting
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sair</span>
          </Button>
        </div>
      </div>
    </header>
  )
}
