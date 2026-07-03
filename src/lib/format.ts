export function fmtUsd(n: number | null | undefined, opts?: { compact?: boolean }): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: opts?.compact ? 0 : 2,
    notation: opts?.compact && Math.abs(n) >= 10000 ? 'compact' : 'standard',
  }).format(n)
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function fmtMonth(yyyyMm: string): string {
  const d = new Date(`${yyyyMm}-15T12:00:00`)
  if (Number.isNaN(d.getTime())) return yyyyMm
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

export function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function pct(n: number): string {
  return `${Math.round(n)}%`
}
