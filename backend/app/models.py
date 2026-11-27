from __future__ import annotations

from typing import Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class ColorSettings(BaseModel):
    presetId: str = "soft-pale-pink"
    temperature: float = Field(default=4.0, ge=-100.0, le=100.0)
    tint: float = Field(default=14.0, ge=-100.0, le=100.0)
    hue: float = Field(default=0.0, ge=-180.0, le=180.0)
    saturation: float = Field(default=0.0, ge=-100.0, le=100.0)
    brightness: float = Field(default=2.0, ge=-100.0, le=100.0)
    contrast: float = Field(default=2.0, ge=-100.0, le=100.0)
    highlights: float = Field(default=0.0, ge=-100.0, le=100.0)
    shadows: float = Field(default=0.0, ge=-100.0, le=100.0)
    midtoneColor: str = Field(default="#F4CEDB", pattern=r"^#[0-9A-Fa-f]{6}$")
    colorIntensity: float = Field(default=72.0, ge=0.0, le=100.0)


class PresetItem(BaseModel):
    id: str
    name: str
    description: str
    swatch: str
    isCustom: bool = False
    settings: ColorSettings


class CreatePresetRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=60)
    description: str = Field(default="Custom microscope color preset", max_length=200)
    settings: ColorSettings


class ImageRecord(BaseModel):
    id: str
    filename: str
    format: str
    width: int
    height: int
    sizeBytes: int
    bitDepth: int
    channels: int
    hasAlpha: bool
    colorMode: str
    status: Literal["uploaded", "queued", "processing", "processed", "error"] = "uploaded"
    errorMessage: Optional[str] = None
    settingsHash: Optional[str] = None
    appliedSettings: Optional[ColorSettings] = None
    processedWidth: Optional[int] = None
    processedHeight: Optional[int] = None
    processedAt: Optional[str] = None
    uploadedAt: str


class BatchProcessRequest(BaseModel):
    imageIds: List[str]
    settings: ColorSettings
    presetName: str = "Soft Pale Pink"
    forceReprocess: bool = False


class BatchJobStatus(BaseModel):
    jobId: str
    status: Literal["running", "completed", "cancelled", "failed"]
    total: int
    completed: int
    failed: int
    skipped: int
    currentFilename: Optional[str] = None
    startedAt: str
    finishedAt: Optional[str] = None
    presetName: str
    settings: ColorSettings
    errors: Dict[str, str] = Field(default_factory=dict)


class ExportRequest(BaseModel):
    imageIds: List[str]
    format: Literal["PNG", "JPEG", "TIFF", "PDF"] = "PNG"
    delivery: Literal["zip", "folder", "single"] = "zip"
    filenamePrefix: str = ""
    jpegQuality: int = Field(default=100, ge=1, le=100)
    tiffBitDepth: Literal["preserve", "8", "16"] = "preserve"
    tiffCompression: Literal["lzw", "deflate", "none"] = "lzw"
    pdfOrientation: Literal["auto", "portrait", "landscape", "fit-image"] = "auto"
    pdfPageSize: Literal["A4", "Letter", "Original"] = "A4"
    outputFolder: Optional[str] = None
    settings: Optional[ColorSettings] = None


class ExportSummary(BaseModel):
    exportId: Optional[str] = None
    format: str
    delivery: str
    exportedCount: int
    totalBytes: int
    outputFolder: Optional[str] = None
    files: List[str]
    notes: List[str] = Field(default_factory=list)
    downloadUrl: Optional[str] = None
