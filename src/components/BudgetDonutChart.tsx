import { useMemo } from 'react';
import { formatCurrency } from '../domain/financeEngine';

interface DonutSlice {
  label: string;
  value: number;
  color: string;
  percentage: number;
}

interface BudgetDonutChartProps {
  slices: DonutSlice[];
  centerValue: number;
  centerLabel: string;
  total: number;
  size?: number;
  strokeWidth?: number;
}

export function BudgetDonutChart({ slices, centerValue, centerLabel, total, size = 200, strokeWidth = 20 }: BudgetDonutChartProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const sortedSlices = useMemo(() => [...slices].sort((a, b) => b.value - a.value), [slices]);

  if (total === 0 || sortedSlices.length === 0) {
    return (
      <div className="budget-donut-chart" style={{ width: size, height: size }} role="img" aria-label={`${centerLabel}: ${formatCurrency(centerValue)}`}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="var(--line)"
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={0}
            opacity={0.3}
          />
        </svg>
        <div className="budget-donut-chart__center" style={{ width: size, height: size }}>
          <strong>{formatCurrency(centerValue)}</strong>
          <span>{centerLabel}</span>
          <p className="empty-message">Henüz veri yok.</p>
        </div>
      </div>
    );
  }

  let accumulatedOffset = 0;

  return (
    <div className="budget-donut-chart" style={{ width: size, height: size }} role="img" aria-label={`${centerLabel}: ${formatCurrency(centerValue)}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="var(--line)"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={0}
          opacity={0.2}
        />
        {sortedSlices.map((slice, index) => {
          const sliceLength = (slice.value / total) * circumference;
          const strokeDashoffset = circumference - accumulatedOffset - sliceLength;
          accumulatedOffset += sliceLength;

          return (
            <circle
              key={index}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={slice.color}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              style={{ transform: 'rotate(-90deg)', transformOrigin: `${size / 2}px ${size / 2}px` }}
            />
          );
        })}
      </svg>
      <div className="budget-donut-chart__center" style={{ width: size, height: size }}>
        <strong>{formatCurrency(centerValue)}</strong>
        <span>{centerLabel}</span>
      </div>
    </div>
  );
}

export function BudgetDonutLegend({ slices }: { slices: DonutSlice[] }) {
  const sortedSlices = useMemo(() => [...slices].sort((a, b) => b.value - a.value), [slices]);

  if (sortedSlices.length === 0) return null;

  return (
    <div className="budget-donut-legend" role="list" aria-label="Grafik açıklaması">
      {sortedSlices.map((slice, index) => (
        <div key={index} className="budget-donut-legend__item">
          <span className="budget-donut-legend__color" style={{ background: slice.color }} aria-hidden="true" />
          <span className="budget-donut-legend__label">{slice.label}</span>
          <strong className="budget-donut-legend__value">{formatCurrency(slice.value)}</strong>
          <span className="budget-donut-legend__percentage">%{slice.percentage.toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}
