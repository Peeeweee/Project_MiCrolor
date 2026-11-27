from __future__ import annotations

import os
from pathlib import Path
from typing import List

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .models import (
    BatchJobStatus,
    BatchProcessRequest,
    CreatePresetRequest,
    ExportRequest,
    ExportSummary,
    ImageRecord,
    PresetItem,
)
from .storage import StudioWorkspace

BASE_DATA_DIR = Path(os.environ.get("STUDIO_DATA_DIR", Path(__file__).resolve().parent.parent / "workspace_data"))
workspace = StudioWorkspace(BASE_DATA_DIR)

app = FastAPI(
    title="Microscope Batch Color Studio API",
    version="1.0.0",
    description="Local-only scientific batch microscope color processing engine.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "localOnly": True,
        "imageCount": len(workspace.images),
        "defaultExportDir": str((Path.home() / "Pictures" / "MicroscopeBatchStudio").resolve()),
    }


@app.get("/api/presets", response_model=List[PresetItem])
def list_presets():
    return workspace.presets.list_all()


@app.post("/api/presets", response_model=PresetItem)
def create_preset(req: CreatePresetRequest):
    return workspace.presets.create(req)


@app.delete("/api/presets/{preset_id}")
def delete_preset(preset_id: str):
    if not workspace.presets.delete(preset_id):
        raise HTTPException(status_code=404, detail="Custom preset not found")
    return {"deleted": True, "id": preset_id}


@app.get("/api/images", response_model=List[ImageRecord])
def list_images():
    return workspace.list_images()


@app.post("/api/images/upload")
async def upload_images(files: List[UploadFile] = File(...)):
    uploaded: List[ImageRecord] = []
    errors: List[dict] = []
    for f in files:
        try:
            content = await f.read()
            rec = workspace.add_uploaded_file(f.filename or "untitled.png", content)
            uploaded.append(rec)
        except Exception as exc:
            errors.append({"filename": f.filename or "unknown", "error": str(exc)})
    return {"uploaded": [u.model_dump() for u in uploaded], "errors": errors}


@app.delete("/api/images/{image_id}")
def delete_image(image_id: str):
    if not workspace.remove_image(image_id):
        raise HTTPException(status_code=404, detail="Image not found")
    return {"deleted": True, "id": image_id}


@app.delete("/api/images")
def clear_images():
    removed = workspace.clear_all()
    return {"cleared": removed}


@app.get("/api/images/{image_id}/thumb")
def get_thumbnail(image_id: str, processed: bool = Query(default=False)):
    p = workspace.get_thumbnail_path(image_id, processed=processed)
    if not p:
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    return FileResponse(p, headers={"Cache-Control": "no-cache"})


@app.get("/api/images/{image_id}/preview")
def get_preview(image_id: str, processed: bool = Query(default=False)):
    p = workspace.get_preview_path(image_id, processed=processed)
    if not p:
        raise HTTPException(status_code=404, detail="Preview not found")
    return FileResponse(p, media_type="image/png", headers={"Cache-Control": "no-cache"})


@app.post("/api/batch/process", response_model=BatchJobStatus)
def start_batch(req: BatchProcessRequest):
    try:
        return workspace.start_batch_job(
            image_ids=req.imageIds,
            settings=req.settings,
            preset_name=req.presetName,
            force_reprocess=req.forceReprocess,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/batch/jobs", response_model=List[BatchJobStatus])
def list_jobs():
    return workspace.list_jobs()


@app.get("/api/batch/jobs/{job_id}", response_model=BatchJobStatus)
def get_job(job_id: str):
    job = workspace.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@app.post("/api/batch/jobs/{job_id}/cancel")
def cancel_job(job_id: str):
    if not workspace.cancel_job(job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    return {"cancelled": True, "jobId": job_id}


@app.post("/api/export", response_model=ExportSummary)
def export_batch(req: ExportRequest):
    try:
        return workspace.export_images(req)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Export failed: {exc}") from exc


@app.get("/api/exports/{export_id}/download")
def download_export(export_id: str):
    path = workspace.exports.get(export_id)
    if not path or not path.exists():
        raise HTTPException(status_code=404, detail="Export archive not found")
    return FileResponse(path, filename=path.name)


FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")

