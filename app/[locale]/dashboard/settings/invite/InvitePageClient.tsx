'use client'

import { useEffect, useState, useCallback } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Loader2, Search, Send, MailPlus, Trash2, UserPlus, X, Link2 } from 'lucide-react'
import type { Role } from '@/lib/types'
import { GhlUserCombobox, type GhlUserOption } from '@/components/shared/ghl-user-combobox'

type SortKey = 'name' | 'email' | 'role' | 'org' | 'invited_at'
type SortDir = 'asc' | 'desc'

// Header de coluna clicável. Bota o ícone na própria direção (asc=up, desc=down)
// quando ativa; ArrowUpDown opaco em colunas não-ordenadas pra sinalizar
// affordance sem destacar.
function SortableHeader({
  label,
  sortKey,
  currentSort,
  onSort,
  icon,
}: {
  label: string
  sortKey: SortKey
  currentSort: SortKey
  onSort: (key: SortKey) => void
  icon: React.ReactNode
}) {
  const isActive = currentSort === sortKey
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className="flex items-center gap-1.5 text-left -ml-1 px-1 py-0.5 rounded hover:bg-muted/50 transition-colors"
      aria-sort={isActive ? undefined : 'none'}
    >
      <span className={isActive ? 'text-foreground' : ''}>{label}</span>
      {icon}
    </button>
  )
}

interface OrgRef {
  id: string
  name: string
}

interface UserRef {
  id: string
  name: string
}

interface InviteUser {
  id: string
  // Em multi-org o mesmo user_id aparece em N rows (uma por membership);
  // membershipId = `${user_id}:${org_id}` é único por row e o que React
  // deve usar como key. Vem pronto do GET /api/invites.
  membershipId: string
  name: string
  email: string
  role: Role
  avatar: string | null
  avatar_color: string | null
  invited_at: string | null
  invite_status: 'pending' | 'accepted'
  created_at: string
  org: OrgRef | null
  invitedBy: UserRef | null
  // ID do usuário GHL vinculado a este membro (trainer/owner), ou null.
  ghlUserId: string | null
}

interface PaginatedResponse {
  items: InviteUser[]
  page: number
  pageSize: number
  total: number
}

interface FormState {
  name: string
  email: string
  role: 'trainer' | 'owner'
  orgId: string
  ownerId: string
}

interface OrgOption {
  id: string
  name: string
  owners: { id: string; name: string; email: string }[]
}

const INITIAL_FORM: FormState = {
  name: '',
  email: '',
  role: 'trainer',
  orgId: '',
  ownerId: '',
}

const ACTIVE_PAGE_SIZE = 10
const PENDING_PAGE_SIZE = 100 // pendentes costumam ser lista pequena; trazemos tudo de uma vez

interface Props {
  role: Role
}

export function InvitePageClient({ role: callerRole }: Props) {
  const t = useTranslations('Invite')
  const locale = useLocale()
  const isAdmin = callerRole === 'admin'

  const [pending, setPending] = useState<InviteUser[]>([])
  const [active, setActive] = useState<InviteUser[]>([])
  const [activeTotal, setActiveTotal] = useState(0)
  const [activePage, setActivePage] = useState(1)
  const [orgFilter, setOrgFilter] = useState<string>('') // só admin
  // searchInput é o que o user digita; debouncedSearch é o que dispara o fetch
  // (300ms após parar de digitar). Sem o debounce, cada keystroke gera request.
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('invited_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const [orgs, setOrgs] = useState<OrgOption[]>([])
  const [loadingPending, setLoadingPending] = useState(true)
  const [loadingActive, setLoadingActive] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<InviteUser | null>(null)
  const [resendingKey, setResendingKey] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)

  // Fluxo GHL (criação de vendedor): usuário GHL escolhido + flag de org sem
  // integração configurada (bloqueia o submit).
  const [selectedGhlUser, setSelectedGhlUser] = useState<GhlUserOption | null>(null)
  const [ghlNotConfigured, setGhlNotConfigured] = useState(false)

  // Edição do vínculo GHL de um membro ativo.
  const [ghlEditTarget, setGhlEditTarget] = useState<InviteUser | null>(null)
  const [ghlEditUser, setGhlEditUser] = useState<GhlUserOption | null>(null)
  const [ghlEditSaving, setGhlEditSaving] = useState(false)

  const buildQuery = useCallback(
    (params: Record<string, string | number | undefined>) => {
      const qs = new URLSearchParams()
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === '' || v === null) continue
        qs.set(k, String(v))
      }
      if (isAdmin && orgFilter) qs.set('orgId', orgFilter)
      if (debouncedSearch) qs.set('q', debouncedSearch)
      return qs.toString()
    },
    [isAdmin, orgFilter, debouncedSearch]
  )

  const fetchPending = useCallback(async () => {
    setLoadingPending(true)
    try {
      const qs = buildQuery({ status: 'pending', pageSize: PENDING_PAGE_SIZE })
      const res = await fetch(`/api/invites?${qs}`)
      const json = (await res.json()) as { data: PaginatedResponse | null; error: { message: string } | null }
      if (res.ok && json.data) setPending(json.data.items)
      else setPending([])
    } finally {
      setLoadingPending(false)
    }
  }, [buildQuery])

  const fetchActive = useCallback(
    async (page: number) => {
      setLoadingActive(true)
      try {
        const qs = buildQuery({
          status: 'accepted',
          page,
          pageSize: ACTIVE_PAGE_SIZE,
          sort: sortKey,
          dir: sortDir,
        })
        const res = await fetch(`/api/invites?${qs}`)
        const json = (await res.json()) as { data: PaginatedResponse | null; error: { message: string } | null }
        if (res.ok && json.data) {
          setActive(json.data.items)
          setActiveTotal(json.data.total)
          setActivePage(json.data.page)
        } else {
          setActive([])
          setActiveTotal(0)
        }
      } finally {
        setLoadingActive(false)
      }
    },
    [buildQuery, sortKey, sortDir]
  )

  const fetchOrgs = useCallback(async () => {
    const res = await fetch('/api/organizations')
    const json = (await res.json()) as { data: OrgOption[] | null; error: { message: string } | null }
    if (res.ok && json.data) setOrgs(json.data)
  }, [])

  useEffect(() => {
    if (isAdmin) void fetchOrgs()
  }, [fetchOrgs, isAdmin])

  // Debounce do search input — 300ms é o sweet spot entre responsividade
  // perceptível e poupar requests enquanto o user ainda está digitando.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  // Recarrega listas sempre que o filtro de org, busca ou ordenação mudar.
  // fetchActive sempre volta pra page 1 — sem isso, pode ficar numa página
  // que não existe mais depois do filtro reduzir o total.
  useEffect(() => {
    void fetchPending()
    void fetchActive(1)
  }, [fetchPending, fetchActive])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      // Mesma coluna: toggle de direção.
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      // Coluna nova: começa em asc (UX padrão de tabelas).
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ArrowUpDown className="h-3 w-3 opacity-40" />
    return sortDir === 'asc'
      ? <ArrowUp className="h-3 w-3" />
      : <ArrowDown className="h-3 w-3" />
  }

  // Trocar org limpa o owner selecionado (lista de owners muda) e o vínculo
  // GHL (usuários do GHL são por org).
  const handleOrgChange = (orgId: string) => {
    setForm((f) => ({ ...f, orgId, ownerId: '', name: '', email: '' }))
    setSelectedGhlUser(null)
  }

  // Trocar role limpa owner + identidade: trainer puxa nome/email do GHL,
  // owner digita manualmente. O estado de um não vale para o outro.
  const handleRoleChange = (role: 'trainer' | 'owner') => {
    setForm((f) => ({ ...f, role, ownerId: '', name: '', email: '' }))
    setSelectedGhlUser(null)
    setGhlNotConfigured(false)
  }

  // Vendedor escolhido no combobox do GHL: trava nome/email com os valores
  // do GHL (fonte da verdade).
  const handleGhlSelect = (user: GhlUserOption | null) => {
    setSelectedGhlUser(user)
    setForm((f) => ({ ...f, name: user?.name ?? '', email: user?.email ?? '' }))
  }

  const selectedOrg = orgs.find((o) => o.id === form.orgId)
  const ownerOptions = selectedOrg?.owners ?? []

  const roleLabel = (role: Role) =>
    role === 'trainer'
      ? t('form.roleTrainer')
      : role === 'owner'
      ? t('form.roleOwner')
      : role

  // Trainer (vendedor) é sempre criado a partir de um usuário do GHL; owner
  // segue o fluxo manual (nome/email digitados). Para owner-caller o role é
  // sempre trainer.
  const isTrainerFlow = form.role === 'trainer'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFeedback(null)

    const body: Record<string, string> = { role: form.role, locale }

    if (isTrainerFlow) {
      // Admin precisa escolher org + owner antes de listar/escolher o GHL user.
      if (isAdmin) {
        if (!form.orgId.trim()) {
          setFeedback({ kind: 'error', message: t('feedback.orgRequired') })
          return
        }
        if (!form.ownerId.trim()) {
          setFeedback({ kind: 'error', message: t('feedback.ownerRequired') })
          return
        }
        body.orgId = form.orgId.trim()
        body.ownerId = form.ownerId.trim()
      }
      if (ghlNotConfigured) {
        setFeedback({ kind: 'error', message: t('ghl.notConfigured') })
        return
      }
      if (!selectedGhlUser) {
        setFeedback({ kind: 'error', message: t('ghl.selectRequired') })
        return
      }
      // Nome/email vão do GHL; o servidor revalida e usa os do GHL de qualquer forma.
      body.name = selectedGhlUser.name
      body.email = selectedGhlUser.email
      body.ghlUserId = selectedGhlUser.id
    } else {
      // Owner manual (apenas admin chega aqui).
      const name = form.name.trim()
      const email = form.email.trim()
      if (!name || !email) {
        setFeedback({ kind: 'error', message: t('feedback.fillFields') })
        return
      }
      if (!form.orgId.trim()) {
        setFeedback({ kind: 'error', message: t('feedback.orgRequired') })
        return
      }
      body.name = name
      body.email = email
      body.orgId = form.orgId.trim()
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json()) as { data: unknown; error: { message: string } | null }

      if (!res.ok || json.error) {
        setFeedback({
          kind: 'error',
          message: json.error?.message ?? t('feedback.inviteError'),
        })
        return
      }

      setFeedback({ kind: 'success', message: t('feedback.invited') })
      setForm(INITIAL_FORM)
      setSelectedGhlUser(null)
      void fetchPending()
      void fetchActive(activePage)
    } finally {
      setSubmitting(false)
    }
  }

  // Salva o vínculo GHL editado de um membro ativo. `ghlUserId=null` limpa.
  const saveGhlEdit = async (ghlUserId: string | null) => {
    if (!ghlEditTarget) return
    const orgId = ghlEditTarget.org?.id
    if (isAdmin && !orgId) return

    setGhlEditSaving(true)
    setFeedback(null)
    try {
      const qs = isAdmin && orgId ? `?orgId=${encodeURIComponent(orgId)}` : ''
      const res = await fetch(`/api/memberships/${ghlEditTarget.id}${qs}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ghlUserId }),
      })
      const json = (await res.json()) as { data: unknown; error: { message: string } | null }
      if (!res.ok || json.error) {
        setFeedback({ kind: 'error', message: json.error?.message ?? t('ghl.editError') })
        return
      }
      setFeedback({ kind: 'success', message: t('ghl.editSaved') })
      setGhlEditTarget(null)
      setGhlEditUser(null)
      void fetchActive(activePage)
    } finally {
      setGhlEditSaving(false)
    }
  }

  const handleResend = async (u: InviteUser) => {
    // Admin precisa mandar orgId no querystring pra desambiguar multi-org
    // (mesma regra do DELETE). Owner sempre age na própria active_org —
    // o endpoint ignora orgId nesse caso, mas mandamos por consistência.
    const orgId = u.org?.id
    if (isAdmin && !orgId) return

    const key = `${u.id}:${orgId ?? ''}`
    setResendingKey(key)
    setFeedback(null)
    try {
      const qs = isAdmin && orgId ? `?orgId=${encodeURIComponent(orgId)}` : ''
      const res = await fetch(`/api/invites/${u.id}/resend${qs}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale }),
      })
      const json = (await res.json()) as { data: unknown; error: { message: string } | null }

      if (!res.ok || json.error) {
        setFeedback({ kind: 'error', message: t('feedback.resendError') })
        return
      }

      setFeedback({ kind: 'success', message: t('feedback.resent') })
      void fetchPending()
    } finally {
      setResendingKey(null)
    }
  }

  const confirmRevoke = async () => {
    if (!revokeTarget) return
    const id = revokeTarget.id

    // Admin precisa mandar orgId no querystring pra desambiguar multi-org
    // (mesma regra do resend). Owner sempre age na própria active_org —
    // o endpoint ignora orgId nesse caso.
    const orgId = revokeTarget.org?.id
    if (isAdmin && !orgId) return

    setRevokingId(id)
    setFeedback(null)
    try {
      const qs = isAdmin && orgId ? `?orgId=${encodeURIComponent(orgId)}` : ''
      const res = await fetch(`/api/invites/${id}${qs}`, { method: 'DELETE' })
      const json = (await res.json()) as { data: unknown; error: { message: string } | null }

      if (!res.ok || json.error) {
        setFeedback({
          kind: 'error',
          message: t('feedback.revokeError'),
        })
        return
      }

      setFeedback({ kind: 'success', message: t('feedback.revoked') })
      void fetchPending()
      void fetchActive(activePage)
    } finally {
      setRevokingId(null)
      setRevokeTarget(null)
    }
  }

  const totalPages = Math.max(1, Math.ceil(activeTotal / ACTIVE_PAGE_SIZE))
  const showingFrom = activeTotal === 0 ? 0 : (activePage - 1) * ACTIVE_PAGE_SIZE + 1
  const showingTo = Math.min(activePage * ACTIVE_PAGE_SIZE, activeTotal)

  return (
    <div className="space-y-8 pb-16 lg:pb-0">
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground mt-2">{t('subtitle')}</p>
      </div>

      {feedback && (
        <div
          className="rounded-lg p-3 text-sm"
          style={{
            background: feedback.kind === 'success' ? 'var(--am-green-bg)' : 'var(--am-red-bg)',
            color: feedback.kind === 'success' ? 'var(--am-green)' : 'var(--am-red)',
          }}
        >
          {feedback.message}
        </div>
      )}

      {/* ─── Formulário de convite ─────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            {t('card.title')}
          </CardTitle>
          <CardDescription>
            {callerRole === 'owner' ? t('card.descriptionOwner') : t('card.descriptionAdmin')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Admin escolhe o papel primeiro; owner-caller só cria vendedor. */}
            {isAdmin && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="invite-role">{t('form.roleLabel')}</Label>
                  <select
                    id="invite-role"
                    value={form.role}
                    onChange={(e) => handleRoleChange(e.target.value as 'trainer' | 'owner')}
                    className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
                  >
                    <option value="trainer">{t('form.roleTrainer')}</option>
                    <option value="owner">{t('form.roleOwner')}</option>
                  </select>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="invite-org">{t('form.orgLabel')}</Label>
                    <select
                      id="invite-org"
                      value={form.orgId}
                      onChange={(e) => handleOrgChange(e.target.value)}
                      required
                      className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
                    >
                      <option value="">{t('form.orgPlaceholder')}</option>
                      {orgs.map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                  </div>
                  {form.role === 'trainer' && (
                    <div className="space-y-2">
                      <Label htmlFor="invite-owner">{t('form.ownerLabel')}</Label>
                      <select
                        id="invite-owner"
                        value={form.ownerId}
                        onChange={(e) => setForm({ ...form, ownerId: e.target.value })}
                        required
                        disabled={!form.orgId || ownerOptions.length === 0}
                        className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground disabled:opacity-60"
                      >
                        <option value="">
                          {!form.orgId
                            ? t('form.ownerSelectOrgFirst')
                            : ownerOptions.length === 0
                            ? t('form.ownerNoneInOrg')
                            : t('form.ownerPlaceholder')}
                        </option>
                        {ownerOptions.map((o) => (
                          <option key={o.id} value={o.id}>{o.name} ({o.email})</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ─── Identidade ─────────────────────────────────────────── */}
            {isTrainerFlow ? (
              // Vendedor: nome/email vêm do GHL (escolhidos no combobox).
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{t('ghl.label')}</Label>
                  {isAdmin && !form.orgId ? (
                    <p className="text-sm text-muted-foreground rounded-md border border-dashed p-3">
                      {t('ghl.selectOrgFirst')}
                    </p>
                  ) : (
                    <GhlUserCombobox
                      orgId={isAdmin ? form.orgId || null : null}
                      value={selectedGhlUser}
                      onSelect={handleGhlSelect}
                      onNotConfigured={setGhlNotConfigured}
                    />
                  )}
                  <p className="text-xs text-muted-foreground">{t('ghl.help')}</p>
                </div>

                {selectedGhlUser && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="invite-name">{t('form.nameLabel')}</Label>
                      <Input id="invite-name" value={form.name} readOnly disabled />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="invite-email">{t('form.emailLabel')}</Label>
                      <Input id="invite-email" value={form.email} readOnly disabled />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              // Owner: cadastro manual (sem integração GHL).
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="invite-name">{t('form.nameLabel')}</Label>
                  <Input
                    id="invite-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder={t('form.namePlaceholder')}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-email">{t('form.emailLabel')}</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder={t('form.emailPlaceholder')}
                    required
                  />
                </div>
              </div>
            )}

            <Button
              type="submit"
              disabled={submitting || (isTrainerFlow && (ghlNotConfigured || !selectedGhlUser))}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('form.submitting')}
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  {t('form.submit')}
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ─── Filtros: busca (sempre) + org (admin) ─────────────────── */}
      <div className="flex flex-col md:flex-row md:items-end gap-3">
        <div className="space-y-2 flex-1 max-w-md">
          <Label htmlFor="filter-search">{t('searchLabel')}</Label>
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
              aria-hidden="true"
            />
            <Input
              id="filter-search"
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="pl-9 pr-9"
              autoComplete="off"
              role="searchbox"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted transition-colors"
                aria-label={t('searchClear')}
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
        {isAdmin && (
          <div className="space-y-2 max-w-xs flex-1">
            <Label htmlFor="filter-org">{t('filterOrgLabel')}</Label>
            <select
              id="filter-org"
              value={orgFilter}
              onChange={(e) => setOrgFilter(e.target.value)}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
            >
              <option value="">{t('filterAllOrgs')}</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ─── Lista de pendentes ────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-xl font-semibold">{t('pendingTitle')}</h2>
        {loadingPending ? (
          <Card>
            <CardContent className="py-6 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        ) : pending.length === 0 ? (
          debouncedSearch ? (
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                {t('emptyPendingSearch', { q: debouncedSearch })}
              </CardContent>
            </Card>
          ) : isAdmin && orgFilter ? (
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                {t('emptyPendingFiltered')}
              </CardContent>
            </Card>
          ) : null
        ) : (
          <div className="space-y-2">
            {pending.map((u) => (
              <Card key={u.membershipId}>
                <CardContent className="flex items-center justify-between gap-4 py-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium truncate">{u.name}</p>
                      <Badge variant="secondary">{roleLabel(u.role)}</Badge>
                      <Badge variant="outline" style={{ color: 'var(--am-amber)', borderColor: 'var(--am-amber)' }}>
                        {t('pendingBadge')}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{u.email}</p>
                    <div className="flex items-center gap-2 flex-wrap mt-1.5">
                      {u.org && (
                        <Badge
                          variant="outline"
                          className="font-mono text-[11px]"
                          style={{ color: 'var(--am-blue)', borderColor: 'var(--am-blue)' }}
                        >
                          {t('orgLabel')}: {u.org.name}
                        </Badge>
                      )}
                      {u.invitedBy && (
                        <Badge
                          variant="outline"
                          className="font-mono text-[11px]"
                          style={{ color: 'var(--am-muted)', borderColor: 'var(--am-bg4)' }}
                        >
                          {t('invitedByLabel')}: {u.invitedBy.name}
                        </Badge>
                      )}
                    </div>
                    {u.invited_at && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('sentAt', { date: new Date(u.invited_at).toLocaleString(locale) })}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleResend(u)}
                      disabled={resendingKey === `${u.id}:${u.org?.id ?? ''}` || revokingId === u.id}
                      title={t('resendButton')}
                      aria-label={t('resendButton')}
                    >
                      {resendingKey === `${u.id}:${u.org?.id ?? ''}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <MailPlus className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRevokeTarget(u)}
                      disabled={revokingId === u.id || resendingKey === `${u.id}:${u.org?.id ?? ''}`}
                    >
                      {revokingId === u.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ─── Lista de membros ativos ───────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-xl font-semibold">{t('activeTitle')}</h2>
        <Card>
          <CardContent className="p-0">
            {loadingActive ? (
              <div className="py-8 flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : active.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {debouncedSearch
                  ? t('emptyActiveSearch', { q: debouncedSearch })
                  : isAdmin && orgFilter
                    ? t('emptyActiveFiltered')
                    : t('emptyActive')}
              </div>
            ) : (
              <Table className="[&_tr>*:first-child]:pl-6 [&_tr>*:last-child]:pr-6">
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <SortableHeader
                        label={t('form.nameLabel')}
                        sortKey="name"
                        currentSort={sortKey}
                        onSort={handleSort}
                        icon={sortIcon('name')}
                      />
                    </TableHead>
                    <TableHead>
                      <SortableHeader
                        label={t('form.emailLabel')}
                        sortKey="email"
                        currentSort={sortKey}
                        onSort={handleSort}
                        icon={sortIcon('email')}
                      />
                    </TableHead>
                    <TableHead>
                      <SortableHeader
                        label={t('form.roleLabel')}
                        sortKey="role"
                        currentSort={sortKey}
                        onSort={handleSort}
                        icon={sortIcon('role')}
                      />
                    </TableHead>
                    {isAdmin && (
                      <TableHead>
                        <SortableHeader
                          label={t('orgLabel')}
                          sortKey="org"
                          currentSort={sortKey}
                          onSort={handleSort}
                          icon={sortIcon('org')}
                        />
                      </TableHead>
                    )}
                    <TableHead>{t('ghl.columnLabel')}</TableHead>
                    <TableHead className="text-right">{t('ghl.actionsLabel')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {active.map((u) => (
                    <TableRow key={u.membershipId}>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell className="text-muted-foreground">{u.email}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{roleLabel(u.role)}</Badge>
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-muted-foreground">
                          {u.org?.name ?? '—'}
                        </TableCell>
                      )}
                      <TableCell>
                        {u.ghlUserId ? (
                          <Badge
                            variant="outline"
                            className="font-mono text-[11px] max-w-[160px] truncate inline-block"
                            style={{ color: 'var(--am-green)', borderColor: 'var(--am-green)' }}
                            title={u.ghlUserId}
                          >
                            {u.ghlUserId}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">{t('ghl.unlinked')}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setGhlEditTarget(u)
                            setGhlEditUser(null)
                          }}
                          title={t('ghl.editButton')}
                          aria-label={t('ghl.editButton')}
                        >
                          <Link2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {activeTotal > 0 && (
          <div className="flex items-center justify-between gap-3 text-sm">
            <p className="text-muted-foreground font-mono text-xs">
              {t('pagination.showing', { from: showingFrom, to: showingTo, total: activeTotal })}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={activePage <= 1 || loadingActive}
                onClick={() => fetchActive(activePage - 1)}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                {t('pagination.previous')}
              </Button>
              <span className="text-muted-foreground font-mono text-xs px-2">
                {t('pagination.page', { page: activePage, total: totalPages })}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={activePage >= totalPages || loadingActive}
                onClick={() => fetchActive(activePage + 1)}
              >
                {t('pagination.next')}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Modal de confirmação de revoke ──────────────────────────── */}
      <Dialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          // Não permite fechar enquanto a request está rodando
          if (!open && revokingId === null) setRevokeTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('revokeDialog.title')}</DialogTitle>
            <DialogDescription>{t('revokeDialog.description')}</DialogDescription>
          </DialogHeader>
          {revokeTarget && (
            <div className="rounded-md border border-border bg-secondary/30 p-3 text-sm">
              <p className="font-medium">{revokeTarget.name}</p>
              <p className="text-muted-foreground">{revokeTarget.email}</p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRevokeTarget(null)}
              disabled={revokingId !== null}
            >
              {t('revokeDialog.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmRevoke}
              disabled={revokingId !== null}
            >
              {revokingId !== null ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t('revokeDialog.confirm')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal de edição do vínculo GHL ──────────────────────────── */}
      <Dialog
        open={ghlEditTarget !== null}
        onOpenChange={(open) => {
          if (!open && !ghlEditSaving) {
            setGhlEditTarget(null)
            setGhlEditUser(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {ghlEditTarget?.role === 'owner' ? t('ghl.ownerEditTitle') : t('ghl.editTitle')}
            </DialogTitle>
            <DialogDescription>
              {ghlEditTarget?.role === 'owner' ? t('ghl.ownerEditDescription') : t('ghl.editDescription')}
            </DialogDescription>
          </DialogHeader>
          {ghlEditTarget && (
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-secondary/30 p-3 text-sm">
                <p className="font-medium">{ghlEditTarget.name}</p>
                <p className="text-muted-foreground">{ghlEditTarget.email}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('ghl.currentLink')}:{' '}
                  <span className="font-mono">{ghlEditTarget.ghlUserId ?? t('ghl.unlinked')}</span>
                </p>
              </div>
              <div className="space-y-2">
                <Label>{t('ghl.label')}</Label>
                <GhlUserCombobox
                  orgId={isAdmin ? ghlEditTarget.org?.id ?? null : null}
                  value={ghlEditUser}
                  onSelect={setGhlEditUser}
                  includeGhlUserId={ghlEditTarget.ghlUserId ?? undefined}
                  modalPopover
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            {ghlEditTarget?.ghlUserId && (
              <Button
                variant="outline"
                onClick={() => saveGhlEdit(null)}
                disabled={ghlEditSaving}
                style={{ color: 'var(--am-red)' }}
              >
                {ghlEditTarget.role === 'owner' ? t('ghl.ownerClearLink') : t('ghl.clearLink')}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => {
                setGhlEditTarget(null)
                setGhlEditUser(null)
              }}
              disabled={ghlEditSaving}
            >
              {t('revokeDialog.cancel')}
            </Button>
            <Button
              onClick={() => ghlEditUser && saveGhlEdit(ghlEditUser.id)}
              disabled={ghlEditSaving || !ghlEditUser}
            >
              {ghlEditSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : t('ghl.editSave')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
