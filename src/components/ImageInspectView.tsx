import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ImagePlus,
  Loader2,
  MapPin,
} from 'lucide-react';
import { createDetector } from '../services/detectionService';
import { getSingleGpsFix } from '../services/gpsService';
import type {
  ConfirmedDetectionRecord,
  DetectionEngineMode,
  GpsCoordinate,
  RoadDetection,
  ScanSessionSummary,
} from '../types/detection';
import {
  formatCoordinate,
  formatDamageLabel,
  getHighestSeverity,
  getSeverityColors,
} from '../utils/severity';
import { BoundingBoxCanvas } from './BoundingBoxCanvas';

interface ImageInspectViewProps {
  imageSourceUrl: string;
  imageLabel: string;
  engineMode: DetectionEngineMode;
  yoloUrl: string;
  onBack: () => void;
  onUploadAnother: (file: File) => void;
  onViewSummary: (summary: ScanSessionSummary) => void;
}

function resizeImageToDataUrl(src: string, maxWidth = 960): Promise<{
  dataUrl: string;
  width: number;
  height: number;
}> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const scale = img.naturalWidth > maxWidth ? maxWidth / img.naturalWidth : 1;
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context unavailable.'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve({
        dataUrl: canvas.toDataURL('image/jpeg', 0.85),
        width: w,
        height: h,
      });
    };
    img.onerror = () => reject(new Error('Failed to load selected image.'));
    img.src = src;
  });
}

export function ImageInspectView({
  imageSourceUrl,
  imageLabel,
  engineMode,
  yoloUrl,
  onBack,
  onUploadAnother,
  onViewSummary,
}: ImageInspectViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resizedDataUrl, setResizedDataUrl] = useState<string | null>(null);
  const [imageDims, setImageDims] = useState({ w: 800, h: 600 });
  const [detections, setDetections] = useState<RoadDetection[]>([]);
  const [modelName, setModelName] = useState<string>('');
  const [inferenceMs, setInferenceMs] = useState<number>(0);
  const [gpsCoord, setGpsCoord] = useState<GpsCoordinate | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    // Fetch GPS fix in parallel without blocking AI road detection
    getSingleGpsFix().then((coord) => {
      if (!cancelled && coord) {
        setGpsCoord(coord);
      }
    });

    const runInspection = async () => {
      setLoading(true);
      setError(null);
      setDetections([]);

      try {
        const { dataUrl, width, height } = await resizeImageToDataUrl(
          imageSourceUrl,
          960
        );

        if (cancelled) return;
        setResizedDataUrl(dataUrl);
        setImageDims({ w: width, h: height });

        const detector = createDetector(engineMode, yoloUrl);
        const result = await detector.detectFrame(dataUrl, 'image/jpeg');

        if (cancelled) return;
        setDetections(result.detections);
        setModelName(result.modelInfo.modelName);
        setInferenceMs(result.modelInfo.inferenceMs);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Image inspection failed.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    runInspection();
    return () => {
      cancelled = true;
    };
  }, [imageSourceUrl, engineMode, yoloUrl, retryToken]);

  const handleOpenSummary = () => {
    const nowIso = new Date().toISOString();
    const records: ConfirmedDetectionRecord[] = detections.map((det) => ({
      id: det.id,
      type: det.type,
      confidence: det.confidence,
      severity: det.severity,
      timestamp: nowIso,
      latitude: gpsCoord?.latitude ?? null,
      longitude: gpsCoord?.longitude ?? null,
      accuracyMeters: gpsCoord?.accuracyMeters ?? null,
      isSimulated: det.isSimulated,
      engineName: modelName || engineMode,
      thumbnailDataUrl: resizedDataUrl ?? undefined,
    }));

    onViewSummary({
      sessionId: `img-${Date.now()}`,
      startedAt: nowIso,
      endedAt: nowIso,
      engineMode,
      totalPotholes: records.filter((r) => r.type === 'pothole').length,
      totalCracks: records.filter((r) => r.type === 'crack').length,
      highestSeverity: getHighestSeverity(records),
      records,
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-5 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-800 hover:bg-slate-100"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Home</span>
        </button>

        <h1 className="truncate text-sm font-semibold text-slate-900 sm:text-base">
          {imageLabel}
        </h1>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-800 hover:bg-slate-100 whitespace-nowrap"
        >
          <ImagePlus className="h-4 w-4" />
          <span>Another</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUploadAnother(f);
            e.target.value = '';
          }}
          className="hidden"
        />
      </div>

      {/* Annotated Image Preview */}
      <div className="relative mt-4 aspect-[4/3] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-950">
        <img
          src={resizedDataUrl || imageSourceUrl}
          alt={imageLabel}
          referrerPolicy="no-referrer"
          className="h-full w-full object-contain"
        />
        {!loading && !error && (
          <BoundingBoxCanvas
            detections={detections}
            sourceWidth={imageDims.w}
            sourceHeight={imageDims.h}
            fitMode="contain"
          />
        )}

        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/60 text-white backdrop-blur-xs">
            <Loader2 className="h-7 w-7 animate-spin text-amber-400" />
            <p className="text-sm font-medium">Analyzing road surface…</p>
          </div>
        )}
      </div>

      {/* Metadata Strip */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span>
          Engine: <strong className="text-slate-900">{modelName || engineMode}</strong>
          {inferenceMs > 0 && ` · ${inferenceMs} ms`}
        </span>
        <span className="inline-flex items-center gap-1 font-mono-data">
          <MapPin className="h-3.5 w-3.5 text-amber-600" />
          {gpsCoord
            ? `${formatCoordinate(gpsCoord.latitude)}, ${formatCoordinate(gpsCoord.longitude)}`
            : 'GPS unavailable'}
        </span>
      </div>

      {/* Error or Detection Breakdown */}
      {error ? (
        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            <div>
              <p className="font-semibold">Detection Failed</p>
              <p className="mt-1 text-red-800">{error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setRetryToken((t) => t + 1)}
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl bg-red-600 px-4 text-xs font-semibold text-white hover:bg-red-500"
          >
            Retry Analysis
          </button>
        </div>
      ) : !loading && detections.length === 0 ? (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" />
          <div>
            <p className="font-semibold text-slate-900">No Road Damage Detected</p>
            <p className="mt-0.5 text-xs text-slate-600">
              No potholes or pavement cracks were identified in this image.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {detections.map((d) => {
            const colors = getSeverityColors(d.severity);
            return (
              <div
                key={d.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {d.isSimulated ? '[Simulated] ' : ''}
                    {formatDamageLabel(d.type)}
                  </p>
                  <p className="font-mono-data text-xs text-slate-600">
                    Confidence: {Math.round(d.confidence * 100)}%
                  </p>
                </div>
                <span
                  className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${colors.softBg} ${colors.border} ${colors.text}`}
                >
                  {d.severity}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {!loading && !error && (
        <div className="mt-5 pb-4">
          <button
            type="button"
            onClick={handleOpenSummary}
            className="w-full min-h-[48px] rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          >
            View Scan Summary &amp; Map
          </button>
        </div>
      )}
    </div>
  );
}
