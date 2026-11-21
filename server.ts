import "dotenv/config";
import express from "express";
import path from "node:path";
import fs from "node:fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";

const PORT = Number(process.env.PORT || 3000);
const DEFAULT_YOLO_URL = process.env.YOLO_API_URL || "http://127.0.0.1:8000/detect-base64";

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function clamp01(val: number): number {
  return Math.max(0, Math.min(1, val));
}

function extractReadableError(err: unknown): { status: number; message: string } {
  if (!(err instanceof Error)) {
    return { status: 500, message: "Road damage detection failed." };
  }
  const raw = err.message || "Road damage detection failed.";
  try {
    const parsed = JSON.parse(raw);
    const code = Number(parsed?.error?.code) || 500;
    const msg = parsed?.error?.message || raw;
    return { status: code >= 400 && code < 600 ? code : 500, message: msg };
  } catch {
    return { status: 500, message: raw };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface GeminiCandidateModel {
  model: string;
  label: string;
  thinkingLevel: ThinkingLevel;
}

const VISION_MODELS: GeminiCandidateModel[] = [
  {
    model: "gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash Lite Vision",
    thinkingLevel: ThinkingLevel.MINIMAL,
  },
  {
    model: "gemini-4-hydrogen",
    label: "Gemini 4 Hydrogen Vision",
    thinkingLevel: ThinkingLevel.LOW,
  },
];

async function runGeminiRoadDetection(
  ai: GoogleGenAI,
  cleanBase64: string,
  mimeType: string
) {
  let lastError: unknown = null;

  for (const candidate of VISION_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: candidate.model,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: cleanBase64,
                },
              },
              {
                text:
                  "Inspect this road/pavement image for real visible road damage ONLY: potholes ('pothole') and pavement cracks ('crack'). " +
                  "If the image does not show road damage (e.g. smooth undamaged pavement, indoor scene, desk, wall, or sky), return an empty array []. " +
                  "Do NOT invent or guess detections. For each clearly visible pothole or crack, provide: " +
                  "type ('pothole' or 'crack'), confidence (0.4 to 0.99), severity ('Low', 'Medium', or 'High'), " +
                  "and tight bounding box coordinates ymin, xmin, ymax, xmax normalized to 0..1000 integers.",
              },
            ],
          },
          config: {
            systemInstruction:
              "You are a civil road-inspection computer vision detector. Only report clearly visible potholes and asphalt/concrete cracks with accurate 0..1000 bounding boxes. Return [] if no road damage is present.",
            responseMimeType: "application/json",
            thinkingConfig: { thinkingLevel: candidate.thinkingLevel },
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: {
                    type: Type.STRING,
                    description: "Must be 'pothole' or 'crack'.",
                  },
                  confidence: {
                    type: Type.NUMBER,
                    description: "Confidence between 0.0 and 1.0.",
                  },
                  severity: {
                    type: Type.STRING,
                    description: "Must be 'Low', 'Medium', or 'High'.",
                  },
                  ymin: { type: Type.INTEGER },
                  xmin: { type: Type.INTEGER },
                  ymax: { type: Type.INTEGER },
                  xmax: { type: Type.INTEGER },
                },
                required: ["type", "confidence", "severity", "ymin", "xmin", "ymax", "xmax"],
              },
            },
          },
        });

        const rawText = (response.text ?? "[]").trim();
        const parsed = JSON.parse(rawText);
        return { parsed, modelLabel: candidate.label };
      } catch (err) {
        lastError = err;
        const { status } = extractReadableError(err);
        const isTransient = status === 503 || status === 429 || status === 500;
        if (!isTransient) {
          throw err;
        }
        await sleep(350 * (attempt + 1));
      }
    }
  }

  throw lastError ?? new Error("All vision models are temporarily unavailable.");
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "12mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      defaultYoloUrl: DEFAULT_YOLO_URL,
    });
  });

  app.post("/api/detect", async (req, res) => {
    const started = Date.now();
    try {
      const { imageBase64, mimeType = "image/jpeg", engine = "gemini", yoloUrl } = req.body ?? {};

      if (!imageBase64 || typeof imageBase64 !== "string") {
        res.status(400).json({ error: "Missing imageBase64 payload." });
        return;
      }

      const cleanBase64 = imageBase64.includes(",")
        ? imageBase64.split(",", 2)[1]
        : imageBase64;

      if (engine === "yolo") {
        const targetUrl =
          typeof yoloUrl === "string" && yoloUrl.trim()
            ? yoloUrl.trim()
            : DEFAULT_YOLO_URL;

        const upstream = await fetch(targetUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_base64: cleanBase64,
            confidence_threshold: 0.35,
          }),
          signal: AbortSignal.timeout(8000),
        });

        if (!upstream.ok) {
          const text = await upstream.text();
          res.status(upstream.status).json({
            error: `FastAPI YOLO endpoint returned ${upstream.status}: ${text}`,
          });
          return;
        }

        const data = await upstream.json();
        res.json({
          detections: Array.isArray(data.detections)
            ? data.detections.map((d: Record<string, unknown>, idx: number) => ({
                id: typeof d.id === "string" ? d.id : `yolo-${Date.now()}-${idx}`,
                type: d.type === "pothole" ? "pothole" : "crack",
                confidence: Number(d.confidence ?? 0),
                severity:
                  d.severity === "High" || d.severity === "Medium" || d.severity === "Low"
                    ? d.severity
                    : "Medium",
                bbox: d.bbox,
                isSimulated: Boolean(data.model_info?.is_mock),
              }))
            : [],
          modelInfo: {
            engine: "yolo",
            modelName: data.model_info?.model_name || "FastAPI YOLO",
            isSimulated: Boolean(data.model_info?.is_mock),
            inferenceMs: data.model_info?.inference_ms ?? Date.now() - started,
          },
        });
        return;
      }

      const ai = getGeminiClient();
      const { parsed, modelLabel } = await runGeminiRoadDetection(ai, cleanBase64, mimeType);

      const items = Array.isArray(parsed) ? parsed : [];
      const detections = items
        .filter(
          (item: Record<string, unknown>) =>
            item && (item.type === "pothole" || item.type === "crack")
        )
        .map((item: Record<string, unknown>, idx: number) => {
          const xmin = clamp01(Number(item.xmin ?? 0) / 1000);
          const ymin = clamp01(Number(item.ymin ?? 0) / 1000);
          const xmax = clamp01(Number(item.xmax ?? 0) / 1000);
          const ymax = clamp01(Number(item.ymax ?? 0) / 1000);
          const width = Math.max(0.02, xmax - xmin);
          const height = Math.max(0.02, ymax - ymin);
          const severity =
            item.severity === "High" || item.severity === "Medium" || item.severity === "Low"
              ? item.severity
              : "Medium";

          return {
            id: `gem-${Date.now()}-${idx}`,
            type: item.type === "pothole" ? "pothole" : "crack",
            confidence: Math.max(0, Math.min(1, Number(item.confidence ?? 0.75))),
            severity,
            bbox: { x: xmin, y: ymin, width, height },
            isSimulated: false,
          };
        });

      res.json({
        detections,
        modelInfo: {
          engine: "gemini",
          modelName: modelLabel,
          isSimulated: false,
          inferenceMs: Date.now() - started,
        },
      });
    } catch (err: unknown) {
      const { status, message } = extractReadableError(err);
      res.status(status).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), "dist");
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get("*", (_req, res) => {
        res.sendFile(path.join(distDir, "index.html"));
      });
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`RoadGuard AI server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
