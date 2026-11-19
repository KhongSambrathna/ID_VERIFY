// Tiny dependency-free charts (plain divs + CSS) for the shop report and
// the analytics page — enough for "how did this week go" at a glance
// without pulling in a chart library.

// Vertical bars over time. series: [{ label, values: [n, n…] }]
// keys: [{ name, color }] — one per value in each point.
export function BarChart({ data, keys, height = 180, format = (n) => n }) {
  const max = Math.max(1, ...data.flatMap((d) => d.values.map((v) => Math.abs(v))));
  const showEvery = Math.ceil(data.length / 10);
  return (
    <div className="mini-chart">
      <div className="mini-chart-legend">
        {keys.map((k) => (
          <span key={k.name}>
            <i style={{ background: k.color }} /> {k.name}
          </span>
        ))}
      </div>
      <div className="mini-chart-bars" style={{ height }}>
        {data.map((d, i) => (
          <div
            className="mini-chart-col"
            key={d.label + i}
            title={`${d.label}\n${keys.map((k, j) => `${k.name}: ${format(d.values[j])}`).join("\n")}`}
          >
            <div className="mini-chart-stack">
              {d.values.map((v, j) => (
                <div
                  key={j}
                  className="mini-chart-bar"
                  style={{
                    height: `${(Math.max(v, 0) / max) * 100}%`,
                    background: keys[j].color,
                  }}
                />
              ))}
            </div>
            <div className="mini-chart-label">{i % showEvery === 0 ? d.label : ""}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Horizontal "share of total" list. rows: [{ key, value, sub? }]
export function HBarList({ rows, format = (n) => n, color = "var(--navy)", empty = "—" }) {
  if (!rows?.length) return <p className="mini-empty">{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((s, r) => s + r.value, 0) || 1;
  return (
    <div className="hbar-list">
      {rows.map((r) => (
        <div className="hbar-row" key={r.key}>
          <div className="hbar-top">
            <span className="hbar-key" title={r.key}>
              {r.key}
              {r.sub && <small> · {r.sub}</small>}
            </span>
            <span className="hbar-val">
              {format(r.value)} <small>({Math.round((r.value / total) * 100)}%)</small>
            </span>
          </div>
          <div className="hbar-track">
            <div className="hbar-fill" style={{ width: `${(r.value / max) * 100}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Big-number summary tile.
export function StatTile({ label, value, sub, tone }) {
  return (
    <div className={`stat-tile ${tone || ""}`}>
      <div className="stat-tile-label">{label}</div>
      <div className="stat-tile-value">{value}</div>
      {sub && <div className="stat-tile-sub">{sub}</div>}
    </div>
  );
}
