import type { ConfirmedDetectionRecord, SeverityLevel } from '../types/detection';

const SEVERITY_WEIGHT: Record<SeverityLevel, number> = {
  Low: 1,
  Medium: 2,
  High: 3,
};

export function getHighestSeverity(
  records: ConfirmedDetectionRecord[]
): SeverityLevel | 'None' {
  if (records.length === 0) return 'None';
  let highest: SeverityLevel = 'Low';
  for (const r of records) {
    if (SEVERITY_WEIGHT[r.severity] > SEVERITY_WEIGHT[highest]) {
      highest = r.severity;
    }
  }
  return highest;
}

export function getSeverityColors(severity: SeverityLevel): {
  stroke: string;
  badgeBg: string;
  badgeText: string;
  softBg: string;
  border: string;
  text: string;
  markerHex: string;
} {
  switch (severity) {
    case 'High':
      return {
        stroke: '#EF4444',
        badgeBg: '#DC2626',
        badgeText: '#FFFFFF',
        softBg: 'bg-red-50',
        border: 'border-red-200',
        text: 'text-red-700',
        markerHex: '#DC2626',
      };
    case 'Medium':
      return {
        stroke: '#F59E0B',
        badgeBg: '#D97706',
        badgeText: '#FFFFFF',
        softBg: 'bg-amber-50',
        border: 'border-amber-200',
        text: 'text-amber-800',
        markerHex: '#D97706',
      };
    case 'Low':
    default:
      return {
        stroke: '#14B8A6',
        badgeBg: '#0D9488',
        badgeText: '#FFFFFF',
        softBg: 'bg-teal-50',
        border: 'border-teal-200',
        text: 'text-teal-800',
        markerHex: '#0D9488',
      };
  }
}

export function formatDamageLabel(type: 'pothole' | 'crack'): string {
  return type === 'pothole' ? 'Pothole' : 'Crack';
}

export function formatCoordinate(val: number | null): string {
  if (val === null || !Number.isFinite(val)) return '—';
  return val.toFixed(6);
}
