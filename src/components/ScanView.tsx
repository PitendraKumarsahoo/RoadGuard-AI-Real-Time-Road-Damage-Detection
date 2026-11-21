import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CameraOff,
  MapPin,
  RefreshCw,
  Square,
} from 'lucide-react';
import {
  captureVideoFrame,
  mapCameraError,
  requestRearCameraStream,
  stopCameraStream,
  type CameraErrorInfo,
} from '../services/cameraService';
import { createDetector } from '../services/detectionService';
import { startGpsWatch, type GpsStatus } from '../services/gpsService';
import type {
  ConfirmedDetectionRecord,
  DetectionEngineMode,
  GpsCoordinate,
  RoadDetection,
  ScanSessionSummary,
} from '../types/detection';
import { formatCoordinate, getHighestSeverity } from '../utils/severity';
import { BoundingBoxCanvas } from './BoundingBoxCanvas';

interface ScanViewProps {
  engineMode: DetectionEngineMode;
  yoloUrl: string;
  onStopScan: (summary: ScanSessionSummary) => void;
  onCancel: () => void;
  onSwitchToUpload: () => void;
}

const CONFIRM_COOLDOWN_MS = 3500;

export function ScanView({
  engineMode,
  yoloUrl,
  onStopScan,
  onCancel,
  onSwitchToUpload,
}: ScanViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const gpsCoordRef = useRef<GpsCoordinate | null>(null);
  const recordsRef = useRef<ConfirmedDetectionRecord[]>([]);
  const lastLoggedByTypeRef = useRef<Record<string, number>>({});
  const startedAtRef = useRef<string>(new Date().toISOString());
  const sessionIdRef = useRef<string>(`scan-${Date.now()}`);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<CameraErrorInfo | null>(null);
  const [videoDims, setVideoDims] = useState({ w: 1280, h: 720 });

  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('requesting');
  const [gpsMessage, setGpsMessage] = useState<string | null>(null);
  const [latestCoord, setLatestCoord] = useState<GpsCoordinate | null>(null);

  const [liveDetections, setLiveDetections] = useState<RoadDetection[]>([]);
  const [potholeCount, setPotholeCount] = useState(0);
  const [crackCount, setCrackCount] = useState(0);
  const [inferenceError, setInferenceError] = useState<string | null>(null);
  const [activeModelLabel, setActiveModelLabel] = useState<string>(
    engineMode === 'gemini'
      ? 'AI Vision'
      : engineMode === 'yolo'
        ? 'YOLO FastAPI'
        : 'Simulated Stub'
  );

  const initCamera = useCallback(async () => {
    setCameraError(null);
    setCameraReady(false);
    stopCameraStream(streamRef.current);

    try {
      const stream = await requestRearCameraStream();
      streamRef.current = stream;

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => {});
      }
      setCameraReady(true);
    } catch (err) {
      setCameraError(mapCameraError(err));
    }
  }, []);

  // Start rear camera + GPS watch on mount
  useEffect(() => {
    if (!offscreenCanvasRef.current) {
      offscreenCanvasRef.current = document.createElement('canvas');
    }

    initCamera();

    const gpsHandle = startGpsWatch(
      (coord) => {
        gpsCoordRef.current = coord;
        setLatestCoord(coord);
        setGpsMessage(null);
      },
      (status, message) => {
        setGpsStatus(status);
        if (message) setGpsMessage(message);
      }
    );

    return () => {
      stopCameraStream(streamRef.current);
      streamRef.current = null;
      gpsHandle.stop();
    };
  }, [initCamera]);

  // Non-overlapping frame capture & AI detection loop
  useEffect(() => {
    if (!cameraReady) return;

    let cancelled = false;
    let timerId: number | null = null;
    const detector = createDetector(engineMode, yoloUrl);

    const processNextFrame = async () => {
      if (cancelled) return;

      const video = videoRef.current;
      const offscreen = offscreenCanvasRef.current;

      if (!video || !offscreen || video.readyState < 2 || !video.videoWidth) {
        timerId = window.setTimeout(processNextFrame, 300);
        return;
      }

      if (video.videoWidth !== videoDims.w || video.videoHeight !== videoDims.h) {
        setVideoDims({ w: video.videoWidth, h: video.videoHeight });
      }

      const frame = captureVideoFrame(video, offscreen, 640);
      if (!frame) {
        timerId = window.setTimeout(processNextFrame, 300);
        return;
      }

      try {
        const result = await detector.detectFrame(frame.dataUrl, 'image/jpeg');
        if (cancelled) return;

        setInferenceError(null);
        setLiveDetections(result.detections);
        setActiveModelLabel(result.modelInfo.modelName);

        const now = Date.now();
        let addedPotholes = 0;
        let addedCracks = 0;

        for (const det of result.detections) {
          if (det.confidence < 0.4) continue;
          const lastAt = lastLoggedByTypeRef.current[det.type] ?? 0;
          if (now - lastAt >= CONFIRM_COOLDOWN_MS) {
            lastLoggedByTypeRef.current[det.type] = now;
            const coord = gpsCoordRef.current;

            const record: ConfirmedDetectionRecord = {
              id: det.id,
              type: det.type,
              confidence: det.confidence,
              severity: det.severity,
              timestamp: new Date(now).toISOString(),
              latitude: coord?.latitude ?? null,
              longitude: coord?.longitude ?? null,
              accuracyMeters: coord?.accuracyMeters ?? null,
              isSimulated: det.isSimulated,
              engineName: result.modelInfo.modelName,
              thumbnailDataUrl: frame.dataUrl,
            };

            recordsRef.current.push(record);
            if (det.type === 'pothole') addedPotholes += 1;
            else addedCracks += 1;
          }
        }

        if (addedPotholes > 0) {
          setPotholeCount((c) => c + addedPotholes);
        }
        if (addedCracks > 0) {
          setCrackCount((c) => c + addedCracks);
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Frame detection failed.';
          setInferenceError(msg);
        }
      }

      if (!cancelled) {
        const delay = engineMode === 'stub' ? 500 : 900;
        timerId = window.setTimeout(processNextFrame, delay);
      }
    };

    timerId = window.setTimeout(processNextFrame, 450);

    return () => {
      cancelled = true;
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [cameraReady, engineMode, yoloUrl, videoDims.w, videoDims.h]);

  const handleFinish = () => {
    stopCameraStream(streamRef.current);
    streamRef.current = null;
    const records = [...recordsRef.current];
    const totalPotholes = records.filter((r) => r.type === 'pothole').length;
    const totalCracks = records.filter((r) => r.type === 'crack').length;

    onStopScan({
      sessionId: sessionIdRef.current,
      startedAt: startedAtRef.current,
      endedAt: new Date().toISOString(),
      engineMode,
      totalPotholes,
      totalCracks,
      highestSeverity: getHighestSeverity(records),
      records,
    });
  };

  return (
    <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-slate-950 text-white">
      {/* Live Camera Video & Bounding Box Overlay */}
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
        />

        {cameraReady && (
          <BoundingBoxCanvas
            detections={liveDetections}
            sourceWidth={videoDims.w}
            sourceHeight={videoDims.h}
            fitMode="cover"
          />
        )}

        {/* Top HUD Bar (compact <= 15% height) */}
        <div className="pt-safe pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-slate-950/85 via-slate-950/50 to-transparent px-4 pb-6">
          <div className="mx-auto flex max-w-4xl items-start justify-between gap-3">
            <button
              type="button"
              onClick={onCancel}
              aria-label="Cancel scan and return home"
              className="pointer-events-auto inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-slate-900/80 text-white backdrop-blur-md transition-colors hover:bg-slate-800"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>

            {/* Small Live Detection Counter */}
            <div className="pointer-events-auto flex flex-col items-end gap-1 rounded-xl border border-white/15 bg-slate-900/80 px-3.5 py-2 backdrop-blur-md">
              <div className="flex items-center gap-3 text-xs font-medium sm:text-sm">
                <span className="font-mono-data">
                  Potholes: <strong className="text-amber-400">{potholeCount}</strong>
                </span>
                <span className="text-slate-500" aria-hidden="true">
                  ·
                </span>
                <span className="font-mono-data">
                  Cracks: <strong className="text-teal-400">{crackCount}</strong>
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-300">
                <MapPin className="h-3 w-3 shrink-0 text-amber-400" />
                {gpsStatus === 'active' && latestCoord ? (
                  <span className="font-mono-data">
                    {formatCoordinate(latestCoord.latitude)},{' '}
                    {formatCoordinate(latestCoord.longitude)}
                  </span>
                ) : gpsStatus === 'requesting' ? (
                  <span>Acquiring GPS…</span>
                ) : (
                  <span className="text-amber-300">GPS unavailable</span>
                )}
              </div>
            </div>
          </div>

          {/* Transparent Mode Notice if Stub */}
          {engineMode === 'stub' && (
            <div className="mx-auto mt-2 max-w-4xl">
              <p className="inline-block rounded-lg bg-amber-500/90 px-2.5 py-1 text-[11px] font-semibold text-slate-950">
                Simulation Mode (Demo Stub — Not Real AI)
              </p>
            </div>
          )}
        </div>

        {/* Non-blocking GPS / Inference Status Alerts */}
        <div className="pointer-events-none absolute inset-x-4 bottom-24 z-20 mx-auto max-w-md space-y-2">
          {gpsMessage && gpsStatus !== 'active' && (
            <div className="rounded-xl border border-amber-400/30 bg-slate-900/85 px-3.5 py-2.5 text-xs text-amber-200 backdrop-blur-md">
              {gpsMessage}
            </div>
          )}

          {inferenceError && (
            <div className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-red-400/40 bg-red-950/90 px-3.5 py-2.5 text-xs text-red-100 backdrop-blur-md">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Detection Error</p>
                <p className="mt-0.5 break-words text-red-200">{inferenceError}</p>
              </div>
            </div>
          )}
        </div>

        {/* Camera Error / Permission Denied Overlay */}
        {cameraError && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/95 p-6">
            <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15 text-red-400">
                <CameraOff className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-white">
                {cameraError.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                {cameraError.message}
              </p>
              <div className="mt-6 flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={initCamera}
                  className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-400"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Retry Camera</span>
                </button>
                <button
                  type="button"
                  onClick={onSwitchToUpload}
                  className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-medium text-white hover:bg-slate-700"
                >
                  Upload Road Image Instead
                </button>
                <button
                  type="button"
                  onClick={onCancel}
                  className="inline-flex min-h-[44px] items-center justify-center text-sm text-slate-400 hover:text-white"
                >
                  Back to Home
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Thumb-Zone Control Bar */}
      <div className="pb-safe z-20 border-t border-white/10 bg-slate-950/95 px-4 pt-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <div className="min-w-0 flex-1 text-xs text-slate-300">
            <p className="truncate font-medium text-white">{activeModelLabel}</p>
            <p className="truncate text-slate-400">
              {liveDetections.length > 0
                ? `${liveDetections.length} active defect${liveDetections.length > 1 ? 's' : ''} in frame`
                : 'Scanning road surface…'}
            </p>
          </div>

          <button
            type="button"
            onClick={handleFinish}
            className="inline-flex min-h-[48px] shrink-0 items-center justify-center gap-2 rounded-xl bg-red-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-500 active:scale-[0.98]"
          >
            <Square className="h-4 w-4 fill-current" />
            <span>Stop Scan</span>
          </button>
        </div>
      </div>
    </div>
  );
}
