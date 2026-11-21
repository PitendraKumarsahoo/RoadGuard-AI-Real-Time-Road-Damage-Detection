import type {
  DetectionEngineMode,
  DetectionResultPayload,
  RoadDetection,
} from '../types/detection';

/**
 * Modular interface allowing seamless swapping between:
 * 1) Server-side Gemini Vision road-damage analysis
 * 2) External Python FastAPI YOLOv8/YOLOv11 road-damage endpoint
 * 3) Transparent Prototype Stub (explicitly flagged isSimulated=true)
 */
export interface IRoadDamageDetector {
  readonly mode: DetectionEngineMode;
  detectFrame(
    imageDataUrl: string,
    mimeType?: string
  ): Promise<DetectionResultPayload>;
}

class GeminiVisionDetector implements IRoadDamageDetector {
  readonly mode: DetectionEngineMode = 'gemini';

  async detectFrame(
    imageDataUrl: string,
    mimeType = 'image/jpeg'
  ): Promise<DetectionResultPayload> {
    const res = await fetch('/api/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: imageDataUrl,
        mimeType,
        engine: 'gemini',
      }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `AI detection error (${res.status})`);
    }
    return data as DetectionResultPayload;
  }
}

class FastApiYoloDetector implements IRoadDamageDetector {
  readonly mode: DetectionEngineMode = 'yolo';
  private readonly yoloUrl?: string;

  constructor(yoloUrl?: string) {
    this.yoloUrl = yoloUrl;
  }

  async detectFrame(
    imageDataUrl: string,
    mimeType = 'image/jpeg'
  ): Promise<DetectionResultPayload> {
    const res = await fetch('/api/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: imageDataUrl,
        mimeType,
        engine: 'yolo',
        yoloUrl: this.yoloUrl,
      }),
      signal: AbortSignal.timeout(10000),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(
        data.error ||
          'FastAPI YOLO service unreachable. Start backend/main.py or switch detection engine.'
      );
    }
    return data as DetectionResultPayload;
  }
}

/**
 * Transparent Prototype Stub Detector:
 * Used ONLY when the user explicitly selects Prototype Stub mode to test the
 * frame-capture -> bounding-box -> GPS -> Leaflet map pipeline offline without
 * model weights. Every output is explicitly marked `isSimulated: true`.
 */
class PrototypeStubDetector implements IRoadDamageDetector {
  readonly mode: DetectionEngineMode = 'stub';
  private frameCounter = 0;

  async detectFrame(imageDataUrl: string): Promise<DetectionResultPayload> {
    const started = performance.now();
    this.frameCounter += 1;

    // Brief async yield to mirror real network/inference pipeline timing
    await new Promise((resolve) => setTimeout(resolve, 180));

    // Deterministic lightweight pixel contrast check so stub reacts slightly to frame changes
    const seed = (imageDataUrl.length + this.frameCounter * 31) % 100;
    const detections: RoadDetection[] = [];

    // Emit periodic simulated bounding boxes so the UI & GPS logging can be tested end-to-end
    if (this.frameCounter === 1 || seed % 3 !== 0) {
      const isPothole = seed % 2 === 0;
      const boxW = isPothole ? 0.28 : 0.36;
      const boxH = isPothole ? 0.22 : 0.16;
      const x = 0.22 + ((seed % 25) / 100);
      const y = 0.42 + ((seed % 18) / 100);

      detections.push({
        id: `stub-${Date.now()}-${this.frameCounter}`,
        type: isPothole ? 'pothole' : 'crack',
        confidence: Number((0.72 + (seed % 22) / 100).toFixed(2)),
        severity: seed > 68 ? 'High' : seed > 34 ? 'Medium' : 'Low',
        bbox: {
          x: Math.min(0.95 - boxW, x),
          y: Math.min(0.95 - boxH, y),
          width: boxW,
          height: boxH,
        },
        isSimulated: true,
      });
    }

    return {
      detections,
      modelInfo: {
        engine: 'stub',
        modelName: 'Prototype Stub (Simulated — Not Real AI)',
        isSimulated: true,
        inferenceMs: Math.round(performance.now() - started),
      },
    };
  }
}

export function createDetector(
  mode: DetectionEngineMode,
  yoloUrl?: string
): IRoadDamageDetector {
  switch (mode) {
    case 'yolo':
      return new FastApiYoloDetector(yoloUrl);
    case 'stub':
      return new PrototypeStubDetector();
    case 'gemini':
    default:
      return new GeminiVisionDetector();
  }
}
