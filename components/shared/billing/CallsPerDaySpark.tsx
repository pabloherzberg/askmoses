interface Props {
  title: string;
  subtitle: string;
  data: number[];
}

// Mini bar chart "Calls per day · last 14 days" (owner, Bloco 1). Barras
// verticais — o pico de cada janela fica destacado no accent.
export function CallsPerDaySpark({ title, subtitle, data }: Props) {
  const max = Math.max(...data, 1);
  return (
    <div
      className="rounded-2xl border p-5 mt-4"
      style={{ background: "var(--am-bg2)", borderColor: "var(--am-border)" }}
    >
      <p className="text-[15px] font-semibold" style={{ color: "var(--am-text)" }}>
        {title}
      </p>
      <p className="text-[12.5px] mb-4" style={{ color: "var(--am-muted)" }}>
        {subtitle}
      </p>
      <div className="flex items-end gap-1.5 h-24">
        {data.map((v, i) => {
          const pct = Math.max((v / max) * 100, 6);
          const isPeak = v === max;
          return (
            <div
              key={i}
              className="flex-1 rounded-t"
              style={{
                height: `${pct}%`,
                background: isPeak ? "var(--am-accent)" : "var(--am-accent2-bg, rgba(155,135,255,0.2))",
              }}
              title={`${v} calls`}
            />
          );
        })}
      </div>
    </div>
  );
}
