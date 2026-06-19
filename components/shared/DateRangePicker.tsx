"use client";

import { useState } from "react";
import { Calendar } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { pt } from "react-day-picker/locale";
import "react-day-picker/dist/style.css";

interface DateRangePickerProps {
  onDateRangeChange: (startDate: Date, endDate: Date) => void;
  defaultDays?: number;
}

const QUICK_PERIODS = [
  { label: "7 dias", days: 7 },
  { label: "15 dias", days: 15 },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
  { label: "180 dias", days: 180 },
  { label: "360 dias", days: 360 },
];

export function DateRangePicker({
  onDateRangeChange,
  defaultDays = 30,
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"quick" | "custom">("quick");
  const [selectedRange, setSelectedRange] = useState<{
    from?: Date;
    to?: Date;
  }>({});

  const today = new Date();
  const defaultStart = new Date(
    today.getTime() - defaultDays * 24 * 60 * 60 * 1000,
  );

  const handleQuickPeriod = (days: number) => {
    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    setSelectedRange({ from: start, to: end });
    onDateRangeChange(start, end);
    setIsOpen(false);
  };

  const handleCustomRange = () => {
    if (selectedRange.from && selectedRange.to) {
      const from = new Date(selectedRange.from);
      const to = new Date(selectedRange.to);
      // Swap if needed
      if (from > to) {
        onDateRangeChange(to, from);
      } else {
        onDateRangeChange(from, to);
      }
      setIsOpen(false);
    }
  };

  const formatDate = (date: Date | undefined) => {
    if (!date) return "Data";
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  };

  const rangeLabel =
    selectedRange.from && selectedRange.to
      ? `${formatDate(selectedRange.from)} - ${formatDate(selectedRange.to)}`
      : "Selecionar período";

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs border transition-colors"
        style={{
          background: "var(--am-bg3)",
          borderColor: "var(--am-border)",
          color: "var(--am-text)",
        }}
      >
        <Calendar size={14} />
        <span>{rangeLabel}</span>
      </button>

      {isOpen && (
        <div
          className="absolute top-full mt-2 left-0 z-50 rounded-lg border shadow-lg p-4"
          style={{
            background: "var(--card)",
            borderColor: "var(--am-border)",
            minWidth: "320px",
          }}
        >
          {/* Tabs */}
          <div
            className="flex gap-2 mb-4 border-b"
            style={{ borderColor: "var(--am-border)" }}
          >
            <button
              onClick={() => setMode("quick")}
              className="px-3 py-2 text-xs font-medium transition-colors"
              style={{
                color:
                  mode === "quick" ? "var(--am-accent)" : "var(--am-muted)",
                borderBottom:
                  mode === "quick" ? "2px solid var(--am-accent)" : "none",
              }}
            >
              Períodos
            </button>
            <button
              onClick={() => setMode("custom")}
              className="px-3 py-2 text-xs font-medium transition-colors"
              style={{
                color:
                  mode === "custom" ? "var(--am-accent)" : "var(--am-muted)",
                borderBottom:
                  mode === "custom" ? "2px solid var(--am-accent)" : "none",
              }}
            >
              Customizado
            </button>
          </div>

          {/* Quick Periods */}
          {mode === "quick" && (
            <div className="grid grid-cols-2 gap-2">
              {QUICK_PERIODS.map((period) => (
                <button
                  key={period.days}
                  onClick={() => handleQuickPeriod(period.days)}
                  className="px-3 py-2 rounded text-xs font-medium transition-colors"
                  style={{
                    background: "var(--am-bg3)",
                    color: "var(--am-text)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "var(--am-accent)";
                    (e.currentTarget as HTMLButtonElement).style.color = "#fff";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "var(--am-bg3)";
                    (e.currentTarget as HTMLButtonElement).style.color =
                      "var(--am-text)";
                  }}
                >
                  {period.label}
                </button>
              ))}
            </div>
          )}

          {/* Custom Calendar */}
          {mode === "custom" && (
            <div>
              <style>{`
                /* react-day-picker v9 — usa as classes .rdp-* (sem prefixo day_)
                   e variáveis CSS no .rdp-root. As classes da v8
                   (.rdp-day_selected, .rdp-day_range_middle) não existem mais. */
                .rdp-root {
                  --rdp-cell-size: 32px;
                  --rdp-accent-color: var(--am-blue);
                  --rdp-accent-background-color: rgba(94, 179, 255, 0.15);
                  --rdp-range_middle-background-color: rgba(94, 179, 255, 0.15);
                  --rdp-range_middle-color: var(--am-text);
                }
                .rdp-day_button {
                  color: var(--am-text);
                }
                /* Pontas do range (start/end e dia único): fundo azul, texto branco */
                .rdp-selected .rdp-day_button,
                .rdp-range_start .rdp-day_button,
                .rdp-range_end .rdp-day_button {
                  background-color: var(--am-blue);
                  color: #fff;
                }
                /* Meio do range: fundo azul translúcido; texto segue o tema
                   (--am-text = claro no tema escuro, escuro no tema claro).
                   Antes ficava branco fixo → branco no branco no tema claro. */
                .rdp-range_middle .rdp-day_button {
                  background-color: transparent;
                  color: var(--am-text) !important;
                }
                .rdp-disabled {
                  opacity: 0.5;
                  cursor: not-allowed;
                }
              `}</style>
              <div style={{ color: "var(--am-text)" }}>
                <DayPicker
                  mode="range"
                  selected={{
                    from: selectedRange.from,
                    to: selectedRange.to,
                  }}
                  onSelect={(range) => setSelectedRange(range || {})}
                  disabled={(date) => date > new Date()}
                  locale={pt}
                  classNames={{
                    months: "flex gap-4",
                    month: "space-y-4",
                    caption: "text-xs font-semibold text-center",
                    head_row: "flex gap-1",
                    head_cell: "w-8 h-8 text-xs font-semibold text-center",
                    row: "flex gap-1",
                    cell: "w-8 h-8 text-xs text-center",
                    day: "rounded text-xs",
                    day_disabled: "opacity-50 cursor-not-allowed",
                    day_range_start: "rounded-l",
                    day_range_end: "rounded-r",
                    day_range_middle: "rounded-none",
                  }}
                />
              </div>

              <button
                onClick={handleCustomRange}
                disabled={!selectedRange.from || !selectedRange.to}
                className="w-full mt-4 px-3 py-2 rounded text-xs font-medium transition-colors"
                style={{
                  background:
                    selectedRange.from && selectedRange.to
                      ? "var(--am-accent)"
                      : "var(--am-bg3)",
                  color:
                    selectedRange.from && selectedRange.to
                      ? "#fff"
                      : "var(--am-muted)",
                  cursor:
                    selectedRange.from && selectedRange.to
                      ? "pointer"
                      : "not-allowed",
                }}
              >
                Aplicar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
