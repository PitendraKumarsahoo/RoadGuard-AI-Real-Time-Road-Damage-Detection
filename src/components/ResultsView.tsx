import { useState } from 'react';
import { ArrowLeft, Camera, Download, MapPin } from 'lucide-react';
import type { ScanSessionSummary } from '../types/detection';
import {
  formatCoordinate,
  formatDamageLabel,
  getSeverityColors,
} from '../utils/severity';
import { DetectionMap } from './DetectionMap';

interface ResultsViewProps {
  summary: ScanSessionSummary;
  onStartNewScan: () => void;
  onBackHome: () => void;
}

export function ResultsView({
  summary,
  onStartNewScan,
  onBackHome,
}: ResultsViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    summary.records.find((r) => r.latitude !== null)?.id ?? null
  );

  const hasSimulatedRecords = summary.records.some((r) => r.isSimulated);
  const geoCount = summary.records.filter(
    (r) => r.latitude !== null && r.longitude !== null
  ).length;

  const handleExportJson = () => {
    const cleanSummary = {
      ...summary,
      records: summary.records.map(({ thumbnailDataUrl: _omit, ...rest }) => rest),
    };
    const blob = new Blob([JSON.stringify(cleanSummary, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `roadguard-${summary.sessionId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-5 sm:px-6 lg:py-8">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackHome}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-800 hover:bg-slate-100"
            aria-label="Back to home"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              Scan Results
            </h1>
            <p className="text-xs text-slate-600">
              {new Date(summary.endedAt).toLocaleString()} · {summary.records.length}{' '}
              confirmed detection{summary.records.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportJson}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-800 hover:bg-slate-100 whitespace-nowrap"
          >
            <Download className="h-4 w-4" />
            <span>Export JSON</span>
          </button>
          <button
            type="button"
            onClick={onStartNewScan}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-amber-500 px-4 text-xs font-semibold text-slate-950 hover:bg-amber-400 whitespace-nowrap"
          >
            <Camera className="h-4 w-4" />
            <span>New Scan</span>
          </button>
        </div>
      </div>

      {hasSimulatedRecords && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          These detections were produced in <strong>Simulation Mode (Prototype Stub)</strong> for pipeline testing and are not real AI predictions.
        </div>
      )}

      {/* 3 Summary Metrics */}
      <div className="mt-5 grid grid-cols-3 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Total Potholes</p>
          <p className="font-mono-data mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">
            {summary.totalPotholes}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Total Cracks</p>
          <p className="font-mono-data mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">
            {summary.totalCracks}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Highest Severity</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">
            {summary.highestSeverity}
          </p>
        </div>
      </div>

      {/* Map + Detected Locations List */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Detected Damage Map
            </h2>
            <span className="text-xs text-slate-500">
              {geoCount} geotagged location{geoCount === 1 ? '' : 's'}
            </span>
          </div>
          <DetectionMap
            records={summary.records}
            selectedId={selectedId}
            onSelectRecord={setSelectedId}
          />
        </div>

        <div className="lg:col-span-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Detected Locations
            </h2>
            <span className="text-xs text-slate-500">
              Tap item to focus map
            </span>
          </div>

          {summary.records.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
              <p className="text-sm font-semibold text-slate-900">
                No Road Damage Logged
              </p>
              <p className="mt-1 text-xs text-slate-600">
                No potholes or cracks were confirmed during this scan session.
              </p>
            </div>
          ) : (
            <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
              {summary.records.map((rec) => {
                const colors = getSeverityColors(rec.severity);
                const isSelected = rec.id === selectedId;
                return (
                  <button
                    key={rec.id}
                    type="button"
                    onClick={() => setSelectedId(rec.id)}
                    className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                      isSelected
                        ? 'border-slate-900 bg-slate-100'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    {rec.thumbnailDataUrl && (
                      <img
                        src={rec.thumbnailDataUrl}
                        alt={formatDamageLabel(rec.type)}
                        className="h-14 w-16 shrink-0 rounded-lg border border-slate-200 object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-slate-900">
                          {rec.isSimulated ? '[Sim] ' : ''}
                          {formatDamageLabel(rec.type)}
                        </span>
                        <span
                          className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${colors.softBg} ${colors.border} ${colors.text}`}
                        >
                          {rec.severity}
                        </span>
                      </div>

                      <div className="font-mono-data mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-600">
                        <span>{Math.round(rec.confidence * 100)}% conf</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {new Date(rec.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </span>
                      </div>

                      <div className="font-mono-data mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                        <MapPin className="h-3 w-3 shrink-0 text-amber-600" />
                        {rec.latitude !== null && rec.longitude !== null ? (
                          <span>
                            {formatCoordinate(rec.latitude)},{' '}
                            {formatCoordinate(rec.longitude)}
                          </span>
                        ) : (
                          <span>GPS coordinates unavailable</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
