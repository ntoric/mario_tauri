import React, { useId } from 'react';

export interface ChartDatum {
  label: string;
  value: number;
  color: string;
}

export const CHART_COLORS = [
  'var(--primary)',
  '#63b3ed',
  '#b794f4',
  'var(--success)',
  '#f6ad55',
  '#fc8181',
  '#4fd1c5',
  '#f687b3',
  '#76e4f7',
  '#d6bcfa',
];

/* ---------------- Donut Chart ---------------- */
export const DonutChart: React.FC<{
  data: ChartDatum[];
  size?: number;
  thickness?: number;
  centerValue?: string;
  centerLabel?: string;
}> = ({ data, size = 150, thickness = 20, centerValue, centerLabel }) => {
  const total = data.reduce((s, d) => s + d.value, 0);
  const radius = (size - thickness) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * radius;
  const gap = data.length > 1 ? 2.5 : 0;
  let offset = 0;

  return (
    <div className="donut-chart" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={c} cy={c} r={radius}
          fill="none"
          stroke="rgba(22, 30, 42, 0.07)"
          strokeWidth={thickness}
        />
        {total > 0 && data.map((d, i) => {
          const frac = d.value / total;
          const len = frac * circ;
          const seg = (
            <circle
              key={i}
              cx={c} cy={c} r={radius}
              fill="none"
              stroke={d.color}
              strokeWidth={thickness}
              strokeDasharray={`${Math.max(len - gap, 0.5)} ${circ}`}
              strokeDashoffset={-offset}
              strokeLinecap="round"
              transform={`rotate(-90 ${c} ${c})`}
              className="donut-segment"
            >
              <title>{`${d.label}: ${d.value}`}</title>
            </circle>
          );
          offset += len;
          return seg;
        })}
      </svg>
      {(centerValue || centerLabel) && (
        <div className="donut-center">
          {centerValue && <div className="donut-center-value">{centerValue}</div>}
          {centerLabel && <div className="donut-center-label">{centerLabel}</div>}
        </div>
      )}
    </div>
  );
};

/* ---------------- Legend ---------------- */
export const ChartLegend: React.FC<{
  data: ChartDatum[];
  formatValue?: (v: number) => string;
}> = ({ data, formatValue }) => {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="chart-legend">
      {data.map((d, i) => {
        const pct = total > 0 ? (d.value / total) * 100 : 0;
        return (
          <div className="chart-legend-row" key={i}>
            <span className="chart-legend-dot" style={{ background: d.color }} />
            <span className="chart-legend-label">{d.label}</span>
            {formatValue && <span className="chart-legend-value">{formatValue(d.value)}</span>}
            <span className="chart-legend-pct">{pct.toFixed(1)}%</span>
          </div>
        );
      })}
    </div>
  );
};

/* ---------------- Smooth Area Chart ---------------- */
function smoothPath(points: [number, number][]): string {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M ${points[0][0]} ${points[0][1]} L ${points[1][0]} ${points[1][1]}`;
  }
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

export const AreaChart: React.FC<{
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
  formatValue?: (v: number) => string;
}> = ({ data, height = 170, color = 'var(--primary)', formatValue }) => {
  const gradId = `areaFill-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const width = 640;
  const pad = { top: 16, right: 14, bottom: 6, left: 14 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(...data.map(d => d.value), 1);

  const pts: [number, number][] = data.map((d, i) => [
    pad.left + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW),
    pad.top + innerH - (d.value / max) * innerH,
  ]);

  const line = smoothPath(pts);
  const base = pad.top + innerH;
  const area = pts.length
    ? `${line} L ${pts[pts.length - 1][0]} ${base} L ${pts[0][0]} ${base} Z`
    : '';

  return (
    <div className="area-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height, display: 'block' }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.32} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {[0.33, 0.66].map(f => (
          <line
            key={f}
            x1={pad.left} x2={width - pad.right}
            y1={pad.top + innerH * f} y2={pad.top + innerH * f}
            stroke="rgba(22, 30, 42, 0.07)"
            strokeDasharray="3 5"
          />
        ))}
        <line
          x1={pad.left} x2={width - pad.right}
          y1={base} y2={base}
          stroke="rgba(22, 30, 42, 0.12)"
        />
        {area && <path d={area} fill={`url(#${gradId})`} />}
        {line && (
          <path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p[0]} cy={p[1]} r={4} fill="#fff" stroke={color} strokeWidth={2} />
            <title>{formatValue ? `${data[i].label}: ${formatValue(data[i].value)}` : `${data[i].label}: ${data[i].value}`}</title>
          </g>
        ))}
      </svg>
      <div className="area-chart-labels">
        {data.map((d, i) => (
          <span key={i}>{d.label}</span>
        ))}
      </div>
    </div>
  );
};
