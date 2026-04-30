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
import { ChevronLeft, ChevronRight, Loader2, Send, Trash2, UserPlus } from 'lucide-react'
import type { Role } from '@/lib/types'

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

  const [orgs, setOrgs] = useState<OrgOption[]>([])
  const [loadingPending, setLoadingPending] = useState(true)
  const [loadingActive, setLoadingActive] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<InviteUser | null>(null)
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)

  const buildQuery = useCallback(
    (params: Record<string, string | number | undefined>) => {
      const qs = new URLSearchParams()
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === '' || v === null) continue
        qs.set(k, String(v))
      }
      if (isAdmin && orgFilter) qs.set('orgId', orgFilter)
      return qs.toString()
    },
    [isAdmin, orgFilter]
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
        const qs = buildQuery({ status: 'accepted', page, pageSize: ACTIVE_PAGE_SIZE })
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
    [buildQuery]
  )

  const fetchOrgs = useCallback(async () => {
    const res = await fetch('/api/organizations')
    const json = (await res.json()) as { data: OrgOption[] | null; error: { message: string } | null }
    if (res.ok && json.data) setOrgs(json.data)
  }, [])

  useEffect(() => {
    if (isAdmin) void fetchOrgs()
  }, [fetchOrgs, isAdmin])

  // Recarrega listas sempre que o filtro de org mudar
  useEffect(() => {
    void fetchPending()
    void fetchActive(1)
  }, [fetchPending, fetchActive])

  // Trocar org limpa o owner selecionado (lista de owners muda)
  const handleOrgChange = (orgId: string) => {
    setForm((f) => ({ ...f, orgId, ownerId: '' }))
  }

  // Trocar role limpa o owner (campo só faz sentido pra trainer)
  const handleRoleChange = (role: 'trainer' | 'owner') => {
    setForm((f) => ({ ...f, role, ownerId: '' }))
  }

  const selectedOrg = orgs.find((o) => o.id === form.orgId)
  const ownerOptions = selectedOrg?.owners ?? []

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFeedback(null)

    const name = form.name.trim()
    const email = form.email.trim()
    if (!name || !email) {
      setFeedback({ kind: 'error', message: t('feedback.fillFields') })
      return
    }

    const body: Record<string, string> = { name, email, role: form.role, locale }
    if (isAdmin) {
      if (!form.orgId.trim()) {
        setFeedback({ kind: 'error', message: t('feedback.orgRequired') })
        return
      }
      body.orgId = form.orgId.trim()
      if (form.role === 'trainer') {
        if (!form.ownerId.trim()) {
          setFeedback({ kind: 'error', message: t('feedback.ownerRequired') })
          return
        }
        body.ownerId = form.ownerId.trim()
      }
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
          message: t('feedback.inviteError'),
        })
        return
      }

      setFeedback({ kind: 'success', message: t('feedback.invited') })
      setForm(INITIAL_FORM)
      void fetchPending()
      void fetchActive(activePage)
    } finally {
      setSubmitting(false)
    }
  }

  const confirmRevoke = async () => {
    if (!revokeTarget) return
    const id = revokeTarget.id

    setRevokingId(id)
    setFeedback(null)
    try {
      const res = await fetch(`/api/invites/${id}`, { method: 'DELETE' })
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

            <Button type="submit" disabled={submitting}>
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

      {/* ─── Filtro de org (admin) ─────────────────────────────────── */}
      {isAdmin && (
        <div className="flex items-end gap-3">
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
        </div>
      )}

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
          isAdmin && orgFilter ? (
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                {t('emptyPendingFiltered')}
              </CardContent>
            </Card>
          ) : null
        ) : (
          <div className="space-y-2">
            {pending.map((u) => (
              <Card key={u.id}>
                <CardContent className="flex items-center justify-between gap-4 py-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium truncate">{u.name}</p>
                      <Badge variant="secondary" className="capitalize">{u.role}</Badge>
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRevokeTarget(u)}
                    disabled={revokingId === u.id}
                  >
                    {revokingId === u.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
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
                {isAdmin && orgFilter ? t('emptyActiveFiltered') : t('emptyActive')}
              </div>
            ) : (
              <Table className="[&_tr>*:first-child]:pl-6 [&_tr>*:last-child]:pr-6">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('form.nameLabel')}</TableHead>
                    <TableHead>{t('form.emailLabel')}</TableHead>
                    <TableHead>{t('form.roleLabel')}</TableHead>
                    {isAdmin && <TableHead>{t('orgLabel')}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {active.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell className="text-muted-foreground">{u.email}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">{u.role}</Badge>
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-muted-foreground">
                          {u.org?.name ?? '—'}
                        </TableCell>
                      )}
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
    </div>
  )
}
