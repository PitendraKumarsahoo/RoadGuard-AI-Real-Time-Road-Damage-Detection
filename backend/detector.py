import os
import time
import uuid
from abc import ABC, abstractmethod
from io import BytesIO
from typing import List, Tuple

from PIL import Image

from schemas import BoundingBox, DetectionItem, ModelInfo, SeverityLevel


def compute_severity(bbox: BoundingBox, confidence: float) -> SeverityLevel:
    """Estimate road damage severity from normalized box area and confidence."""
    area = bbox.width * bbox.height
    score = area * 0.7 + confidence * 0.3
    if area >= 0.08 or score >= 0.45:
        return "High"
    if area >= 0.025 or score >= 0.30:
        return "Medium"
    return "Low"


class BaseRoadDamageDetector(ABC):
    """Pluggable interface for road damage detection models (YOLO, ONNX, Stub)."""

    @abstractmethod
    def detect(
        self, image_bytes: bytes, confidence_threshold: float = 0.35
    ) -> Tuple[List[DetectionItem], int, int, ModelInfo]:
        raise NotImplementedError


class YOLORoadDamageDetector(BaseRoadDamageDetector):
    """
    Ultralytics YOLO road-damage detector.
    Supports standard class names ('pothole', 'crack') as well as RDD2022 labels
    (D00/D10/D20 -> crack, D40 -> pothole).
    """

    RDD_CLASS_MAP = {
        "pothole": "pothole",
        "d40": "pothole",
        "crack": "crack",
        "longitudinal crack": "crack",
        "transverse crack": "crack",
        "alligator crack": "crack",
        "d00": "crack",
        "d10": "crack",
        "d20": "crack",
    }

    def __init__(self, weights_path: str):
        from ultralytics import YOLO  # type: ignore

        self.weights_path = weights_path
        self.model = YOLO(weights_path)
        self.model_name = os.path.basename(weights_path)

    def detect(
        self, image_bytes: bytes, confidence_threshold: float = 0.35
    ) -> Tuple[List[DetectionItem], int, int, ModelInfo]:
        started = time.perf_counter()
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
        width, height = image.size

        results = self.model.predict(
            source=image, conf=confidence_threshold, verbose=False
        )
        detections: List[DetectionItem] = []

        if results:
            res = results[0]
            names = res.names or {}
            for box in res.boxes:
                cls_idx = int(box.cls[0].item())
                conf = float(box.conf[0].item())
                raw_label = str(names.get(cls_idx, f"class_{cls_idx}"))
                mapped_type = self.RDD_CLASS_MAP.get(raw_label.lower())
                if mapped_type is None:
                    if "pothole" in raw_label.lower():
                        mapped_type = "pothole"
                    elif "crack" in raw_label.lower():
                        mapped_type = "crack"
                    else:
                        continue

                x1, y1, x2, y2 = box.xyxy[0].tolist()
                norm_box = BoundingBox(
                    x=max(0.0, min(1.0, x1 / width)),
                    y=max(0.0, min(1.0, y1 / height)),
                    width=max(0.0, min(1.0, (x2 - x1) / width)),
                    height=max(0.0, min(1.0, (y2 - y1) / height)),
                )
                detections.append(
                    DetectionItem(
                        id=str(uuid.uuid4()),
                        type=mapped_type,
                        confidence=round(conf, 3),
                        severity=compute_severity(norm_box, conf),
                        bbox=norm_box,
                        label_raw=raw_label,
                    )
                )

        elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
        info = ModelInfo(
            engine="yolo",
            model_name=self.model_name,
            is_mock=False,
            inference_ms=elapsed_ms,
        )
        return detections, width, height, info


class StubRoadDamageDetector(BaseRoadDamageDetector):
    """
    Transparent prototype stub used ONLY when no trained YOLO .pt weights
    are loaded. Explicitly flags is_mock=True so the UI never misleads users.
    """

    def detect(
        self, image_bytes: bytes, confidence_threshold: float = 0.35
    ) -> Tuple[List[DetectionItem], int, int, ModelInfo]:
        started = time.perf_counter()
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
        width, height = image.size

        # Return an empty detection list by default unless demo boxes are requested,
        # or perform simple frame-statistics stubbing clearly marked is_mock=True.
        elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
        info = ModelInfo(
            engine="stub",
            model_name="No YOLO weights configured (FastAPI Stub)",
            is_mock=True,
            inference_ms=elapsed_ms,
        )
        return [], width, height, info


def load_detector() -> BaseRoadDamageDetector:
    """Factory that loads YOLORoadDamageDetector when weights exist, else Stub."""
    weights_path = os.environ.get("YOLO_MODEL_PATH", "").strip()
    if weights_path and os.path.exists(weights_path):
        try:
            return YOLORoadDamageDetector(weights_path)
        except Exception as exc:
            print(f"[RoadGuard FastAPI] Failed to load YOLO weights ({exc}); falling back to stub.")
    return StubRoadDamageDetector()
