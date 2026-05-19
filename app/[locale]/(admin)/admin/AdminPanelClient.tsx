"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, Filter as FilterIcon, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Client, OrgScriptStatus } from "@/lib/types";
import { AdminOrgRow } from "./AdminOrgRow";
import { SendScriptModal } from "./SendScriptModal";
import {
  FiltersModal,
  EMPTY_FILTERS,
  countActiveFilters,
  applyFiltersToClient,
  type FilterValues,
} from "./FiltersModal";

interface Props {
  clients: Client[];
  // Filtro inicial de script status vindo da URL (?filter=pending) — usado
  // quando o card "Pending Approvals" foi clicado.
  initialScriptFilter: OrgScriptStatus | "all";
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

export function AdminPanelClient({ clients, initialScriptFilter }: Props) {
  const t = useTranslations("Admin.tableTools");
  const router = useRouter();
  const pathname = usePathname();

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>({
    ...EMPTY_FILTERS,
    scriptStatus: initialScriptFilter,
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modalOrgIds, setModalOrgIds] = useState<string[] | null>(null);

  // Sincroniza o filtro de scriptStatus com a URL — necessário pq useState
  // só roda a inicialização uma vez. Quando o card "Pending Approvals" no
  // topo é clicado, o <Link> navega via client-side, a página server
  // re-renderiza com novo initialScriptFilter, mas o useState aqui
  // preserva o valor antigo. Esse effect propaga a mudança da URL pro state.
  useEffect(() => {
    setFilters((f) =>
      f.scriptStatus === initialScriptFilter
        ? f
        : { ...f, scriptStatus: initialScriptFilter },
    );
  }, [initialScriptFilter]);

  // syncUrlFilter mantém o URL coerente com o filtro de scriptStatus do
  // state. Usado quando o user aplica/limpa filtros via modal — sem isso, o
  // URL fica com ?filter=pending grudado mesmo depois de limpar, e clicar
  // novamente no card "Pending Approvals" vira no-op (URL já bate).
  // router.replace sem scroll evita pollution do history e flicker.
  const syncUrlFilter = (status: FilterValues["scriptStatus"]) => {
    const params = new URLSearchParams(
      typeof window !== "undefined" ? window.location.search : "",
    );
    if (status === "all") params.delete("filter");
    else params.set("filter", status);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const orgNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of clients) map[c.id] = c.name;
    return map;
  }, [clients]);

  // Versões de script únicas presentes nos dados — alimenta o select do modal.
  const availableScriptVersions = useMemo(() => {
    const set = new Set<string>();
    for (const c of clients)
      if (c.currentScript) set.add(c.currentScript.version);
    return Array.from(set).sort();
  }, [clients]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return applyFiltersToClient(c, filters);
    });
  }, [clients, search, filters]);

  const activeCount = countActiveFilters(filters);

  const allFilteredIds = filtered.map((c) => c.id);
  const allSelected =
    allFilteredIds.length > 0 && allFilteredIds.every((id) => selected.has(id));

  const toggleAll = () => {
    if (allSelected) {
      const next = new Set(selected);
      for (const id of allFilteredIds) next.delete(id);
      setSelected(next);
    } else {
      const next = new Set(selected);
      for (const id of allFilteredIds) next.add(id);
      setSelected(next);
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const handleSent = (count: number) => {
    setModalOrgIds(null);
    setSelected(new Set());
    router.refresh();
    return count;
  };

  return (
    <>
      {/* ── Search + filter + bulk action bar ──────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          {/* Selected counter aparece só quando há seleção; libera bulk send. */}
          {selected.size > 0 && (
            <>
              <span
                className="text-xs font-mono px-2 py-1 rounded"
                style={{
                  background: "var(--am-bg4)",
                  color: "var(--am-muted)",
                }}
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
              onChange={(e) => setSearch(e.target.value)}
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
                    checked={allSelected}
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
              {filtered.map((client, i) => (
                <AdminOrgRow
                  key={client.id}
                  client={client}
                  isLast={i === filtered.length - 1}
                  isSelected={selected.has(client.id)}
                  onToggleSelected={() => toggleOne(client.id)}
                  onSendScript={() => setModalOrgIds([client.id])}
                  lastActivityDate={formatDate(
                    client.lastCallAt ?? client.createdAt,
                    "en-US",
                  )}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Filters modal ──────────────────────────────────────── */}
      <FiltersModal
        open={filtersOpen}
        current={filters}
        availableScriptVersions={availableScriptVersions}
        onApply={(next) => {
          setFilters(next);
          syncUrlFilter(next.scriptStatus);
        }}
        onClose={() => setFiltersOpen(false)}
      />

      {/* ── Send Script modal ──────────────────────────────────── */}
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

// Th + ThActions extraídos pra reduzir JSX e usar useTranslations apenas
// uma vez por header — alternativa seria passar as labels via props mas
// fica mais verbose.
function Th({ translationKey }: { translationKey: string }) {
  const tTh = useTranslations("Admin.th");
  return (
    <th
      className="text-[11px] font-medium text-left px-5 py-3 whitespace-nowrap"
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
