"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// Credenciais hardcoded
const VALID_USERS = [
  { login: "admin", password: "askmoses2025" },
  { login: "moses", password: "askmoses2025" },
]

export default function LoginPage() {
  const router = useRouter()
  const [login, setLogin] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    // Simula um pequeno delay para UX
    await new Promise((r) => setTimeout(r, 400))

    const valid = VALID_USERS.some(
      (u) => u.login === login.trim() && u.password === password
    )

    if (valid) {
      // Salva sessão simples no sessionStorage
      sessionStorage.setItem("askmoses_auth", "true")
      router.push("/dashboard")
    } else {
      setError("Incorrect username or password.")
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo / Marca */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
            <svg
              viewBox="0 0 32 32"
              className="w-8 h-8 text-primary"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2" />
              <path
                d="M10 20 Q16 10 22 20"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
              />
              <circle cx="12" cy="14" r="1.5" fill="currentColor" />
              <circle cx="20" cy="14" r="1.5" fill="currentColor" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Ask Moses
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI Sales Coaching
          </p>
          <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
            Centurion K9
          </p>
        </div>

        {/* Card de login */}
        <div className="bg-card border border-border rounded-xl p-8 shadow-lg">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="login" className="text-sm font-medium text-foreground">
                Username
              </Label>
              <Input
                id="login"
                type="text"
                autoComplete="username"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="your username"
                required
                disabled={loading}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password" className="text-sm font-medium text-foreground">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={loading}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive-foreground bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full mt-1" disabled={loading}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in...
                </span>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>
        </div>


      </div>
    </div>
  )
}
