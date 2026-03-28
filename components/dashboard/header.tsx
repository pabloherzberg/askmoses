"use client";

import { usePathname } from "next/navigation";
import Image from "next/image";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Upload,
  History,
  Settings,
  BarChart3,
  HelpCircle,
  Brain,
  Wand2,
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Upload Call", href: "/dashboard/upload", icon: Upload },
  { name: "History", href: "/dashboard/history", icon: History },
  { name: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { name: "Insights", href: "/dashboard/insights", icon: Brain },
  { name: "Script Builder", href: "/dashboard/script-builder", icon: Wand2 },
  { name: "Rubric", href: "/dashboard/settings", icon: Settings },
  { name: "How to Use", href: "/dashboard/guide", icon: HelpCircle },
];

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/upload": "Upload Call",
  "/dashboard/history": "Call History",
  "/dashboard/analytics": "Analytics",
  "/dashboard/insights": "Insights",
  "/dashboard/script-builder": "Script Builder",
  "/dashboard/settings": "Rubric Settings",
  "/dashboard/guide": "How to Use",
};

export function DashboardHeader() {
  const pathname = usePathname();
  const title = pageTitles[pathname] || "Dashboard";

  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-border bg-card px-4 sm:gap-x-6 sm:px-6 lg:px-8">
      {/* Mobile menu */}
      <Sheet>
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="lg:hidden">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Open menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <div className="flex h-full flex-col">
            <div className="flex h-16 shrink-0 items-center justify-center border-b border-border px-6">
              <Image
                src="/images/logo-askmoses.png"
                alt="Ask Moses"
                width={180}
                height={50}
                className="h-12 w-auto"
              />
            </div>
            <nav className="flex-1 px-4 py-4">
              <ul className="space-y-1">
                {navigation.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/dashboard" &&
                      pathname.startsWith(item.href));
                  return (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex gap-x-3 rounded-md p-2 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                        )}
                      >
                        <item.icon className="h-5 w-5 shrink-0" />
                        {item.name}
                      </Link>
                    </li>
                  );
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
        </div>
      </div>
    </header>
  );
}
