from typing import List, Literal, Optional
from pydantic import BaseModel, Field


DamageType = Literal["pothole", "crack"]
SeverityLevel = Literal["Low", "Medium", "High"]


class BoundingBox(BaseModel):
    """Normalized [0..1] bounding box relative to frame dimensions."""
    x: float = Field(..., ge=0.0, le=1.0, description="Left coordinate (0..1)")
    y: float = Field(..., ge=0.0, le=1.0, description="Top coordinate (0..1)")
    width: float = Field(..., ge=0.0, le=1.0, description="Box width (0..1)")
    height: float = Field(..., ge=0.0, le=1.0, description="Box height (0..1)")


class DetectionItem(BaseModel):
    id: str
    type: DamageType
    confidence: float = Field(..., ge=0.0, le=1.0)
    severity: SeverityLevel
    bbox: BoundingBox
    label_raw: Optional[str] = None


class ModelInfo(BaseModel):
    engine: Literal["yolo", "stub"]
    model_name: str
    is_mock: bool
    inference_ms: float


class DetectionResponse(BaseModel):
    detections: List[DetectionItem]
    frame_width: int
    frame_height: int
    model_info: ModelInfo


class Base64FrameRequest(BaseModel):
    image_base64: str
    confidence_threshold: float = Field(default=0.35, ge=0.05, le=0.95)
