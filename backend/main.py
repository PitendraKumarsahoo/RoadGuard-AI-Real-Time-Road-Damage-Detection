import base64
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from detector import load_detector
from schemas import Base64FrameRequest, DetectionResponse

app = FastAPI(
    title="RoadGuard AI Inference API",
    description="Modular YOLO-compatible road damage detection backend.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

detector = load_detector()


@app.get("/health")
def health():
    return {
        "status": "ok",
        "detector_class": detector.__class__.__name__,
        "is_mock": detector.__class__.__name__ == "StubRoadDamageDetector",
    }


@app.post("/detect", response_model=DetectionResponse)
async def detect_upload(file: UploadFile = File(...), confidence_threshold: float = 0.35):
    """Multipart image upload endpoint compatible with YOLO pipelines."""
    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty image upload.")

    detections, width, height, model_info = detector.detect(
        image_bytes, confidence_threshold=confidence_threshold
    )
    return DetectionResponse(
        detections=detections,
        frame_width=width,
        frame_height=height,
        model_info=model_info,
    )


@app.post("/detect-base64", response_model=DetectionResponse)
async def detect_base64(payload: Base64FrameRequest):
    """Base64 JSON frame endpoint for direct browser/proxy streaming."""
    raw = payload.image_base64
    if "," in raw:
        raw = raw.split(",", 1)[1]
    try:
        image_bytes = base64.b64decode(raw)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid base64 image: {exc}")

    detections, width, height, model_info = detector.detect(
        image_bytes, confidence_threshold=payload.confidence_threshold
    )
    return DetectionResponse(
        detections=detections,
        frame_width=width,
        frame_height=height,
        model_info=model_info,
    )
