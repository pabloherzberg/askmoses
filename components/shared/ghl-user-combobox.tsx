"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface GhlUserOption {
  id: string;
  name: string;
  email: string;
}

interface Props {
  /** Org alvo. Admin passa o orgId selecionado; owner passa null (a API usa
   *  a org ativa do caller). */
  orgId: string | null;
  /** Usuário GHL selecionado atualmente (controlado pelo pai). */
  value: GhlUserOption | null;
  onSelect: (user: GhlUserOption | null) => void;
  /** Mantém esse ghl_user_id na lista mesmo já vinculado (edição). */
  includeGhlUserId?: string;
  disabled?: boolean;
  /** Notifica o pai quando a org não tem integração GHL (HTTP 409). */
  onNotConfigured?: (notConfigured: boolean) => void;
  modalPopover?: boolean;
}

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; users: GhlUserOption[] }
  | { kind: "not_configured" }
  | { kind: "error"; message: string };

export function GhlUserCombobox({
  orgId,
  value,
  onSelect,
  includeGhlUserId,
  disabled,
  onNotConfigured,
  modalPopover,
}: Props) {
  const t = useTranslations("Invite");
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  // ID do item destacado (teclado OU hover do mouse) — dirige o preview.
  const [highlighted, setHighlighted] = useState<string>("");

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const qs = new URLSearchParams();
      if (orgId) qs.set("orgId", orgId);
      if (includeGhlUserId) qs.set("includeGhlUserId", includeGhlUserId);
      const res = await fetch(`/api/ghl-users?${qs.toString()}`);
      const json = (await res.json()) as {
        data: { users: GhlUserOption[] } | null;
        error: { message: string; code: number } | null;
      };
      if (res.status === 409) {
        setState({ kind: "not_configured" });
        onNotConfigured?.(true);
        return;
      }
      if (!res.ok || !json.data) {
        setState({
          kind: "error",
          message: json.error?.message ?? t("ghl.loadError"),
        });
        return;
      }
      onNotConfigured?.(false);
      setState({ kind: "ready", users: json.data.users });
    } catch {
      setState({ kind: "error", message: t("ghl.loadError") });
    }
  }, [orgId, includeGhlUserId, onNotConfigured, t]);

  // Recarrega quando a org muda. Limpa a seleção: um usuário GHL de outra org
  // não vale para a org nova.
  useEffect(() => {
    onSelect(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const users = state.kind === "ready" ? state.users : [];
  const preview = users.find((u) => u.id === highlighted) ?? value;

  if (state.kind === "not_configured") {
    return (
      <div
        className="flex items-start gap-2 rounded-md border p-3 text-sm"
        style={{ borderColor: "var(--am-amber)", color: "var(--am-amber)" }}
      >
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>{t("ghl.notConfigured")}</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen} modal={modalPopover}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled || state.kind === "loading"}
            className="w-full justify-between font-normal dark:hover:text-foreground"
          >
            {state.kind === "loading" ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("ghl.loading")}
              </span>
            ) : value ? (
              <span className="truncate">{value.name}</span>
            ) : (
              <span className="text-muted-foreground">
                {t("ghl.placeholder")}
              </span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-(--radix-popover-trigger-width) p-0"
          align="start"
        >
          {state.kind === "error" ? (
            <div className="p-3 text-sm" style={{ color: "var(--am-red)" }}>
              {state.message}
            </div>
          ) : (
            <Command
              // value/onValueChange do cmdk rastreiam o item destacado — o
              // cmdk destaca no hover do mouse, então isto também dispara ao
              // passar o mouse por cima, atualizando o preview em tempo real.
              value={highlighted}
              onValueChange={setHighlighted}
            >
              <CommandInput placeholder={t("ghl.searchPlaceholder")} />
              <CommandList>
                <CommandEmpty>{t("ghl.empty")}</CommandEmpty>
                <CommandGroup>
                  {users.map((u) => (
                    <CommandItem
                      key={u.id}
                      value={u.id}
                      keywords={[u.name, u.email]}
                      onSelect={() => {
                        onSelect(u);
                        setOpen(false);
                      }}
                      className="group flex flex-col items-start gap-0.5"
                    >
                      <div className="flex w-full items-center">
                        <span className="font-medium">{u.name}</span>
                        <Check
                          className={cn(
                            "ml-auto h-4 w-4",
                            value?.id === u.id ? "opacity-100" : "opacity-0",
                          )}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground group-data-[selected=true]:text-accent-foreground/80">
                        {u.email}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
              {/* Preview do item sob o cursor/teclado — nome e email mudam ao
                  passar o mouse, como pedido. */}
              {preview && (
                <div className="border-t p-3">
                  <p className="text-xs text-muted-foreground">
                    {t("ghl.previewLabel")}
                  </p>
                  <p className="text-sm font-medium">{preview.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {preview.email}
                  </p>
                </div>
              )}
            </Command>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
