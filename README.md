# RoadGuard AI – Real-Time Road Damage Detection (Prototype)

A mobile-first prototype for detecting potholes and road cracks from a smartphone rear camera in real time, displaying bounding boxes and severity overlays over the live camera preview, tagging detections with GPS coordinates, and plotting them on a Leaflet map.

## Modular Architecture

```text
Phone Camera (getUserMedia, facingMode: environment)
  └──▶ Frame Capture (src/services/cameraService.ts)
         └──▶ Pluggable AI Detection Service (src/services/detectionService.ts)
                ├── AI Vision (server.ts -> /api/detect -> Gemini Vision)
                ├── FastAPI YOLO (backend/main.py -> /detect or /detect-base64)
                └── Prototype Stub (explicitly flagged [SIM] for offline pipeline tests)
                       └──▶ Bounding Box Overlay (src/components/BoundingBoxCanvas.tsx)
                              └──▶ Geolocation Tagging (src/services/gpsService.ts)
                                     └──▶ Summary & Leaflet Map (src/components/DetectionMap.tsx)
```

## Project Structure

- `src/components/` — Mobile-first UI screens (`HomeView`, `ScanView`, `ImageInspectView`, `ResultsView`, `DetectionMap`, `BoundingBoxCanvas`)
- `src/services/` — Modular browser services (`cameraService.ts`, `gpsService.ts`, `detectionService.ts`)
- `src/types/detection.ts` — Shared detection & session contracts
- `server.ts` — Express + Vite server (port 3000) handling `/api/detect` and serving the SPA
- `backend/` — Standalone Python FastAPI + YOLO-compatible inference backend (`main.py`, `detector.py`, `schemas.py`, `requirements.txt`)

## Running Locally

### 1. Frontend & Express API Server (Port 3000)

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

> **Testing on a smartphone:** Mobile browsers require **HTTPS** (or `localhost`) for `getUserMedia` camera access and Geolocation. When testing over a local Wi-Fi IP on your phone, expose port 3000 via an HTTPS tunnel (e.g., `cloudflared tunnel --url http://localhost:3000` or `ngrok http 3000`).

### 2. Optional: Python FastAPI YOLO Backend (Port 8000)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Plugging in a Trained YOLO Road-Damage Model (`.pt`)

1. Install `ultralytics` in `backend/requirements.txt`.
2. Set `YOLO_MODEL_PATH=/path/to/road_damage_yolov8.pt` before starting `uvicorn main:app`.
3. `YOLORoadDamageDetector` in `backend/detector.py` automatically maps standard labels (`pothole`, `crack`) as well as RDD2022 classes (`D00`, `D10`, `D20` → `crack`, `D40` → `pothole`) into the exact JSON schema expected by the frontend.
4. Select **YOLO API** on the RoadGuard AI home screen.
