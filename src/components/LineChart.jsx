import { diffDays, formatCorto } from '../lib/dates.js';
import { fmt } from '../lib/format.js';

/**
 * Gráfico de líneas simple en SVG.
 * series: [{ name, color, points: [{ date, value }], dots?: boolean, line?: boolean }]
 */
export default function LineChart({ series, height = 200, unit = '', decimals = 1 }) {
  const all = series.flatMap((s) => s.points);
  if (all.length < 2) return <p className="muted">Se necesitan al menos dos registros para graficar.</p>;

  const W = 600;
  const H = height;
  const pad = { l: 44, r: 12, t: 12, b: 26 };
  const fechas = all.map((p) => p.date).sort();
  const d0 = fechas[0];
  const span = Math.max(1, diffDays(d0, fechas[fechas.length - 1]));
  const vals = all.map((p) => p.value);
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  const margen = Math.max((max - min) * 0.15, 0.5);
  min -= margen;
  max += margen;

  const x = (date) => pad.l + (diffDays(d0, date) / span) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
  const ticks = [0, 1, 2, 3].map((i) => min + ((max - min) * i) / 3);

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
      aria-label={series.map((s) => s.name).join(', ')}>
      {ticks.map((t) => (
        <g key={t}>
          <line className="grid" x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />
          <text x={pad.l - 6} y={y(t) + 4} textAnchor="end">{fmt(t, decimals)}</text>
        </g>
      ))}
      <text x={pad.l} y={H - 6}>{formatCorto(fechas[0])}</text>
      <text x={W - pad.r} y={H - 6} textAnchor="end">{formatCorto(fechas[fechas.length - 1])}</text>
      {series.map((s) => {
        const pts = [...s.points].sort((a, b) => a.date.localeCompare(b.date));
        const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
        return (
          <g key={s.name}>
            {s.line !== false && pts.length > 1 && (
              <path d={d} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            )}
            {s.dots &&
              pts.map((p) => (
                <circle key={p.date} cx={x(p.date)} cy={y(p.value)} r="3.2" fill={s.color} opacity="0.55">
                  <title>{`${formatCorto(p.date)}: ${fmt(p.value, decimals)} ${unit}`}</title>
                </circle>
              ))}
          </g>
        );
      })}
    </svg>
  );
}
