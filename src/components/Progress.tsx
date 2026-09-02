export function Progress({ value, tone = 'green', label }: { value: number; tone?: 'green' | 'gold' | 'clay'; label?: string }) {
  const safe = Math.min(100, Math.max(0, value));
  return <div className="progress" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(safe)} role="progressbar"><span className={`progress__fill progress__fill--${tone}`} style={{ width: `${safe}%` }} /></div>;
}
