"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Filter as FilterIcon, Send, ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { Client, OrgScriptStatus, PlanCode } from "@/lib/types";
import { AdminOrgRow } from "./AdminOrgRow";
import { SendScriptModal } from "./SendScriptModal";
import {
  FiltersModal,
  EMPTY_FILTERS,
  countActiveFilters,
  type FilterValues,
} from "./FiltersModal";

interface Props {
  initialRows: Client[];
  initialTotal: number;
  initialPageSize: number;
}

function formatDate(iso: string | null, locale: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

// Body do POST /api/admin/organizations/list — mantém em sync com o tipo do
// endpoint. Campos undefined são omitidos no fetch.
interface ListRequestBody {
  search?: string;
  planCode?: PlanCode;
  planStatus?: "active" | "inactive" | "trial";
  scriptStatus?: OrgScriptStatus;
  scriptVersion?: string;
  mrrMin?: number;
  mrrMax?: number;
  lastActivityFrom?: string;
  lastActivityTo?: string;
  page: number;
  limit: number;
}

// filtersToBody converte o state do FiltersModal pro body da API. Trata
// "all" como ausência de filtro e converte strings numéricas pra Number.
function filtersToBody(
  filters: FilterValues,
  search: string,
  page: number,
  limit: number,
): ListRequestBody {
  const body: ListRequestBody = { page, limit };
  const trimmed = search.trim();
  if (trimmed.length > 0) body.search = trimmed;
  if (filters.scriptStatus !== "all") body.scriptStatus = filters.scriptStatus;
  if (filters.planCode !== "all") body.planCode = filters.planCode;
  if (filters.planStatus !== "all") body.planStatus = filters.planStatus;
  if (filters.scriptVersion !== "all") body.scriptVersion = filters.scriptVersion;
  if (filters.mrrMin !== "") {
    const n = Number(filters.mrrMin);
    if (isFinite(n) && n >= 0) body.mrrMin = n;
  }
  if (filters.mrrMax !== "") {
    const n = Number(filters.mrrMax);
    if (isFinite(n) && n >= 0) body.mrrMax = n;
  }
  if (filters.lastActivityFrom !== "") body.lastActivityFrom = filters.lastActivityFrom;
  if (filters.lastActivityTo !== "") body.lastActivityTo = filters.lastActivityTo;
  return body;
}

export function AdminPanelClient({ initialRows, initialTotal, initialPageSize }: Props) {
  const t = useTranslations("Admin.tableTools");
  const router = useRouter();
  const locale = useLocale();

  const [rows, setRows] = useState<Client[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [limit] = useState(initialPageSize);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modalOrgIds, setModalOrgIds] = useState<string[] | null>(null);

  // Cancellable fetch — guarda o request mais recente pra ignorar respostas
  // out-of-order (ex: user digita rápido, request 1 chega depois de request 2).
  const fetchSeqRef = useRef(0);

  const doFetch = useCallback(
    async (body: ListRequestBody) => {
      const seq = ++fetchSeqRef.current;
      setLoading(true);
      setFetchError(null);
      try {
        const res = await fetch("/api/admin/organizations/list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        // Ignora resposta stale (outro fetch já disparou e é mais novo).
        if (seq !== fetchSeqRef.current) return;
        if (!res.ok || !json?.data) {
          setFetchError(json?.error?.message ?? t("fetchError"));
          return;
        }
        setRows(json.data.rows as Client[]);
        setTotal(json.data.total as number);
      } catch {
        if (seq !== fetchSeqRef.current) return;
        setFetchError(t("fetchError"));
      } finally {
        if (seq === fetchSeqRef.current) setLoading(false);
      }
    },
    [t],
  );

  // Debounced fetch — dispara 250ms após o último change de filtro/search/page.
  // Não dispara no mount inicial (já temos initialRows do server).
  //
  // Reset de page=1 ao trocar filter/search é feito sincronamente nos handlers
  // (handleFiltersApply, handleSearchChange) — antes vivia em useEffect
  // separado e gerava fetch duplicado (um pra page antigo, outro pra page=1)
  // antes do cleanup do timeout cancelar.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const handle = setTimeout(() => {
      void doFetch(filtersToBody(filters, search, page, limit));
    }, 250);
    return () => clearTimeout(handle);
  }, [filters, search, page, limit, doFetch]);

  // Handlers que mudam filter/search resetam page=1 no MESMO batch — React
  // junta os setStates da mesma callback num só re-render.
  const handleFiltersApply = useCallback((next: FilterValues) => {
    setFilters(next);
    setPage(1);
  }, []);

  const handleSearchChange = useCallback((next: string) => {
    setSearch(next);
    setPage(1);
  }, []);

  // ── Bulk selection ─────────────────────────────────────────────────

  const allRowIds = rows.map((c) => c.id);
  const allSelectedOnPage =
    allRowIds.length > 0 && allRowIds.every((id) => selected.has(id));

  const toggleAll = () => {
    if (allSelectedOnPage) {
      const next = new Set(selected);
      for (const id of allRowIds) next.delete(id);
      setSelected(next);
    } else {
      const next = new Set(selected);
      for (const id of allRowIds) next.add(id);
      setSelected(next);
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  // ── Modal callbacks ─────────────────────────────────────────────────

  const orgNames = useMemo(() => {
    // Map dos org names visíveis (página corrente) — pro subtítulo do modal
    // single-send. Bulk modal mostra count, então não precisa do map completo.
    const map: Record<string, string> = {};
    for (const c of rows) map[c.id] = c.name;
    return map;
  }, [rows]);

  const handleSent = (_count: number) => {
    setModalOrgIds(null);
    setSelected(new Set());
    // Refetcha a página atual pra refletir o novo status (pending) das orgs.
    void doFetch(filtersToBody(filters, search, page, limit));
    router.refresh(); // garante que os metric cards também atualizam
  };

  // ── Versões únicas (pro filtro) ─────────────────────────────────────
  // Como só temos a página corrente, esse set é incompleto. Trade-off: pra
  // ter todas as versões precisaria de outra query. Pra demo aceitável.

  const availableScriptVersions = useMemo(() => {
    const set = new Set<string>();
    for (const c of rows) if (c.currentScript) set.add(c.currentScript.version);
    return Array.from(set).sort();
  }, [rows]);

  // ── Pagination math ─────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const canPrev = page > 1;
  const canNext = page < totalPages;
  const activeCount = countActiveFilters(filters);

  return (
    <>
      {/* ── Search + filter + bulk action bar ──────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <>
              <span
                className="text-xs font-mono px-2 py-1 rounded"
                style={{ background: "var(--am-bg4)", color: "var(--am-muted)" }}
              >
                {t("selectedCount", { count: selected.size })}
              </span>
              <button
                type="button"
                onClick={() => setModalOrgIds(Array.from(selected))}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium"
                style={{
                  background: "var(--am-accent)",
                  color: "var(--am-on-accent)",
                }}
              >
                <Send size={12} />
                {t("sendScriptBulk", { count: selected.size })}
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <label className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2"
              style={{ color: "var(--am-muted)" }}
            />
            <input
              type="search"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="pl-8 pr-3 py-1.5 rounded-md border outline-none text-sm w-64"
              style={{
                background: "var(--am-bg3)",
                borderColor: "var(--am-border)",
                color: "var(--am-text)",
              }}
            />
          </label>

          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs"
            style={{
              background: "var(--am-bg3)",
              borderColor: "var(--am-border)",
              color: "var(--am-text)",
            }}
          >
            <FilterIcon size={12} />
            {t("filter")}
            {activeCount > 0 && (
              <span
                className="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
                style={{
                  background: "var(--am-accent-bg, rgba(110,86,255,0.18))",
                  color: "var(--am-accent2)",
                }}
              >
                {t("activeFiltersCount", { count: activeCount })}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Table ───────────────────────────────────────────────── */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ background: "var(--am-bg2)", borderColor: "var(--am-border)" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--am-border)" }}>
                <th className="w-8 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allSelectedOnPage}
                    onChange={toggleAll}
                    aria-label={t("selectAll")}
                    style={{ accentColor: "var(--am-accent)" }}
                  />
                </th>
                {(
                  [
                    "client",
                    "scriptVersion",
                    "scriptStatus",
                    "plan",
                    "planStatus",
                    "salesPeople",
                    "mrr",
                    "lastActivity",
                  ] as const
                ).map((k) => (
                  <Th key={k} translationKey={k} />
                ))}
                <th
                  className="text-[11px] font-medium text-right px-3 py-3"
                  style={{ color: "var(--am-muted)" }}
                >
                  <ThActions />
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={10}
                    className="text-center py-10 text-sm"
                    style={{ color: "var(--am-muted)" }}
                  >
                    {fetchError ?? t("noResults")}
                  </td>
                </tr>
              )}
              {rows.map((client, i) => (
                <AdminOrgRow
                  key={client.id}
                  client={client}
                  isLast={i === rows.length - 1}
                  isSelected={selected.has(client.id)}
                  onToggleSelected={() => toggleOne(client.id)}
                  onSendScript={() => setModalOrgIds([client.id])}
                  lastActivityDate={formatDate(
                    client.lastCallAt ?? client.createdAt,
                    locale,
                  )}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* Loading overlay sutil — mantém a tabela mas indica refresh em andamento */}
        {loading && (
          <div
            className="px-5 py-2 text-[11px] font-mono"
            style={{ borderTop: "1px solid var(--am-border)", color: "var(--am-muted)" }}
          >
            {t("loading")}
          </div>
        )}
      </div>

      {/* ── Pagination footer ──────────────────────────────────── */}
      <div className="flex items-center justify-between mt-3 text-xs" style={{ color: "var(--am-muted)" }}>
        <span className="font-mono">
          {t("itemsTotal", { count: total })}
        </span>
        <div className="flex items-center gap-2">
          <span className="font-mono">
            {t("pageOf", { page, total: totalPages })}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={!canPrev || loading}
            className="inline-flex items-center justify-center w-7 h-7 rounded-md border disabled:opacity-40"
            style={{
              borderColor: "var(--am-border)",
              background: "var(--am-bg3)",
              color: "var(--am-text)",
            }}
            aria-label={t("prevPage")}
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={!canNext || loading}
            className="inline-flex items-center justify-center w-7 h-7 rounded-md border disabled:opacity-40"
            style={{
              borderColor: "var(--am-border)",
              background: "var(--am-bg3)",
              color: "var(--am-text)",
            }}
            aria-label={t("nextPage")}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────────── */}
      <FiltersModal
        open={filtersOpen}
        current={filters}
        availableScriptVersions={availableScriptVersions}
        onApply={handleFiltersApply}
        onClose={() => setFiltersOpen(false)}
      />

      <SendScriptModal
        open={modalOrgIds !== null}
        orgIds={modalOrgIds ?? []}
        orgNames={orgNames}
        onClose={() => setModalOrgIds(null)}
        onSent={handleSent}
      />
    </>
  );
}

function Th({ translationKey }: { translationKey: string }) {
  const tTh = useTranslations("Admin.th");
  return (
    <th
      className="text-[11px] font-medium text-left px-3 py-3 whitespace-nowrap"
      style={{ color: "var(--am-muted)" }}
    >
      {tTh(translationKey)}
    </th>
  );
}

function ThActions() {
  const tTh = useTranslations("Admin.th");
  return <span aria-label={tTh("actions")}>{tTh("actions")}</span>;
}
