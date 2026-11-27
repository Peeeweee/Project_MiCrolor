"""
Local Workspace Storage & Controlled-Concurrency Batch Processor.

- Keeps original uploaded files untouched (non-destructive).
- Stores lightweight thumbnails (320px) and workspace previews (1400px) on disk
  so large batches (50-200+ images) do not exhaust RAM.
- Processes full-resolution images in a bounded ThreadPoolExecutor with
  progress tracking, cancellation, retry, and settings-hash deduplication.
"""

from __future__ import annotations

import os
import shutil
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

from .color_engine import apply_color_settings, compute_settings_hash
from .image_io import (
    SUPPORTED_EXTENSIONS,
    ImageMetadata,
    build_multipage_pdf,
    build_zip_archive,
    generate_preview,
    load_image,
    save_image,
)
from .models import (
    BatchJobStatus,
    ColorSettings,
    ExportRequest,
    ExportSummary,
    ImageRecord,
)
from .presets import PresetStore


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_stem(filename: str) -> str:
    stem = Path(filename).stem
    cleaned = "".join(ch if ch.isalnum() or ch in ("-", "_", ".", " ") else "_" for ch in stem).strip()
    return cleaned or "image"


class StudioWorkspace:
    def __init__(self, base_dir: Path, max_workers: Optional[int] = None) -> None:
        self.base_dir = base_dir
        self.originals_dir = base_dir / "originals"
        self.thumbs_dir = base_dir / "thumbs"
        self.previews_dir = base_dir / "previews"
        self.processed_dir = base_dir / "processed"
        self.exports_dir = base_dir / "exports"
        for d in (
            self.originals_dir,
            self.thumbs_dir,
            self.previews_dir,
            self.processed_dir,
            self.exports_dir,
        ):
            d.mkdir(parents=True, exist_ok=True)

        self.presets = PresetStore(base_dir / "custom_presets.json")
        self._lock = threading.RLock()
        self.images: Dict[str, ImageRecord] = {}
        self.image_paths: Dict[str, Path] = {}
        self.processed_paths: Dict[str, Path] = {}
        self.jobs: Dict[str, BatchJobStatus] = {}
        self.job_order: List[str] = []
        self._cancel_events: Dict[str, threading.Event] = {}
        self.exports: Dict[str, Path] = {}

        cpu = os.cpu_count() or 4
        self.max_workers = max_workers or max(2, min(4, cpu))
        self._executor = ThreadPoolExecutor(max_workers=self.max_workers, thread_name_prefix="microscope-worker")

    def add_uploaded_file(self, filename: str, content: bytes) -> ImageRecord:
        ext = Path(filename).suffix.lower()
        if ext not in SUPPORTED_EXTENSIONS:
            raise ValueError(
                f"Unsupported file format '{ext or 'unknown'}'. Supported: JPG, JPEG, PNG, TIFF, WebP."
            )

        img_id = uuid.uuid4().hex[:12]
        orig_path = self.originals_dir / f"{img_id}{ext}"
        orig_path.write_bytes(content)

        try:
            arr, meta = load_image(orig_path)
            generate_preview(arr, 320, self.thumbs_dir / f"{img_id}.jpg")
            generate_preview(arr, 1400, self.previews_dir / f"{img_id}_orig.png")
            # Release array promptly
            del arr
        except Exception as exc:
            orig_path.unlink(missing_ok=True)
            raise ValueError(f"Failed to decode '{filename}': {exc}") from exc

        record = ImageRecord(
            id=img_id,
            filename=Path(filename).name,
            format=meta.format_name,
            width=meta.width,
            height=meta.height,
            sizeBytes=len(content),
            bitDepth=meta.bit_depth,
            channels=meta.channels,
            hasAlpha=meta.has_alpha,
            colorMode=meta.color_mode,
            status="uploaded",
            uploadedAt=_utc_now(),
        )
        with self._lock:
            self.images[img_id] = record
            self.image_paths[img_id] = orig_path
        return record

    def list_images(self) -> List[ImageRecord]:
        with self._lock:
            return list(self.images.values())

    def get_image(self, img_id: str) -> Optional[ImageRecord]:
        with self._lock:
            return self.images.get(img_id)

    def remove_image(self, img_id: str) -> bool:
        with self._lock:
            if img_id not in self.images:
                return False
            self.images.pop(img_id, None)
            orig = self.image_paths.pop(img_id, None)
            proc = self.processed_paths.pop(img_id, None)

        if orig:
            orig.unlink(missing_ok=True)
        if proc:
            proc.unlink(missing_ok=True)
        (self.thumbs_dir / f"{img_id}.jpg").unlink(missing_ok=True)
        (self.thumbs_dir / f"{img_id}_proc.jpg").unlink(missing_ok=True)
        (self.previews_dir / f"{img_id}_orig.png").unlink(missing_ok=True)
        (self.previews_dir / f"{img_id}_proc.png").unlink(missing_ok=True)
        return True

    def clear_all(self) -> int:
        with self._lock:
            ids = list(self.images.keys())
        for img_id in ids:
            self.remove_image(img_id)
        return len(ids)

    def get_thumbnail_path(self, img_id: str, processed: bool = False) -> Optional[Path]:
        if processed:
            p = self.thumbs_dir / f"{img_id}_proc.jpg"
            if p.exists():
                return p
        p = self.thumbs_dir / f"{img_id}.jpg"
        return p if p.exists() else None

    def get_preview_path(self, img_id: str, processed: bool = False) -> Optional[Path]:
        suffix = "_proc.png" if processed else "_orig.png"
        p = self.previews_dir / f"{img_id}{suffix}"
        return p if p.exists() else None

    def _process_single_image(
        self,
        img_id: str,
        settings: ColorSettings,
        settings_hash: str,
        force: bool,
        cancel_event: threading.Event,
    ) -> Tuple[str, str, Optional[str]]:
        """Process one image at full resolution and save lossless intermediate."""
        if cancel_event.is_set():
            return (img_id, "cancelled", None)

        with self._lock:
            rec = self.images.get(img_id)
            orig_path = self.image_paths.get(img_id)
            if not rec or not orig_path:
                return (img_id, "error", "Image not found")
            # Avoid reprocessing unnecessarily when already processed with identical settings
            if (
                not force
                and rec.status == "processed"
                and rec.settingsHash == settings_hash
                and img_id in self.processed_paths
                and self.processed_paths[img_id].exists()
            ):
                return (img_id, "skipped", None)
            rec.status = "processing"
            rec.errorMessage = None

        try:
            arr, meta = load_image(orig_path)
            processed_arr = apply_color_settings(arr, settings)
            del arr

            # Store full-resolution lossless intermediate on disk:
            # 16-bit -> lossless TIFF; 8-bit -> lossless PNG
            if processed_arr.dtype == np.uint16:
                proc_path = self.processed_dir / f"{img_id}.tiff"
                save_image(processed_arr, proc_path, "TIFF", meta, tiff_bit_depth="16", tiff_compression="lzw")
            else:
                proc_path = self.processed_dir / f"{img_id}.png"
                save_image(processed_arr, proc_path, "PNG", meta)

            generate_preview(processed_arr, 320, self.thumbs_dir / f"{img_id}_proc.jpg")
            generate_preview(processed_arr, 1400, self.previews_dir / f"{img_id}_proc.png")
            ph, pw = processed_arr.shape[:2]
            del processed_arr

            with self._lock:
                if img_id in self.images:
                    rec = self.images[img_id]
                    rec.status = "processed"
                    rec.errorMessage = None
                    rec.settingsHash = settings_hash
                    rec.appliedSettings = settings.model_copy()
                    rec.processedWidth = pw
                    rec.processedHeight = ph
                    rec.processedAt = _utc_now()
                    self.processed_paths[img_id] = proc_path
            return (img_id, "processed", None)
        except Exception as exc:
            with self._lock:
                if img_id in self.images:
                    rec = self.images[img_id]
                    rec.status = "error"
                    rec.errorMessage = str(exc)
            return (img_id, "error", str(exc))

    def start_batch_job(
        self,
        image_ids: List[str],
        settings: ColorSettings,
        preset_name: str = "Soft Pale Pink",
        force_reprocess: bool = False,
    ) -> BatchJobStatus:
        with self._lock:
            valid_ids = [iid for iid in image_ids if iid in self.images]
            if not valid_ids:
                raise ValueError("No valid images selected for batch processing.")
            settings_hash = compute_settings_hash(settings)
            for iid in valid_ids:
                rec = self.images[iid]
                if force_reprocess or rec.settingsHash != settings_hash or rec.status != "processed":
                    rec.status = "queued"
                    rec.errorMessage = None

            job_id = uuid.uuid4().hex[:10]
            job = BatchJobStatus(
                jobId=job_id,
                status="running",
                total=len(valid_ids),
                completed=0,
                failed=0,
                skipped=0,
                currentFilename=self.images[valid_ids[0]].filename,
                startedAt=_utc_now(),
                presetName=preset_name,
                settings=settings.model_copy(),
            )
            cancel_event = threading.Event()
            self.jobs[job_id] = job
            self.job_order.insert(0, job_id)
            self._cancel_events[job_id] = cancel_event

        def _run_batch() -> None:
            futures = []
            for iid in valid_ids:
                futures.append(
                    (
                        iid,
                        self._executor.submit(
                            self._process_single_image,
                            iid,
                            settings,
                            settings_hash,
                            force_reprocess,
                            cancel_event,
                        ),
                    )
                )

            for iid, fut in futures:
                with self._lock:
                    rec = self.images.get(iid)
                    if rec:
                        job.currentFilename = rec.filename
                _, outcome, err = fut.result()
                with self._lock:
                    if outcome == "processed":
                        job.completed += 1
                    elif outcome == "skipped":
                        job.completed += 1
                        job.skipped += 1
                    elif outcome == "error":
                        job.failed += 1
                        job.errors[iid] = err or "Unknown processing error"

            with self._lock:
                if cancel_event.is_set():
                    job.status = "cancelled"
                    # Reset any remaining queued images to uploaded
                    for iid in valid_ids:
                        rec = self.images.get(iid)
                        if rec and rec.status == "queued":
                            rec.status = "uploaded"
                elif job.failed > 0 and job.completed == 0:
                    job.status = "failed"
                else:
                    job.status = "completed"
                job.currentFilename = None
                job.finishedAt = _utc_now()

        threading.Thread(target=_run_batch, daemon=True, name=f"batch-{job_id}").start()
        return job

    def cancel_job(self, job_id: str) -> bool:
        ev = self._cancel_events.get(job_id)
        if not ev:
            return False
        ev.set()
        return True

    def get_job(self, job_id: str) -> Optional[BatchJobStatus]:
        with self._lock:
            return self.jobs.get(job_id)

    def list_jobs(self) -> List[BatchJobStatus]:
        with self._lock:
            return [self.jobs[jid] for jid in self.job_order if jid in self.jobs]

    def export_images(self, req: ExportRequest) -> ExportSummary:
        with self._lock:
            selected = [self.images[iid] for iid in req.imageIds if iid in self.images]
        if not selected:
            raise ValueError("No valid images specified for export.")

        export_id = uuid.uuid4().hex[:10]
        export_subdir = self.exports_dir / export_id
        export_subdir.mkdir(parents=True, exist_ok=True)

        prefix = req.filenamePrefix.strip()
        fmt = req.format.upper()
        ext_map = {"PNG": ".png", "JPEG": ".jpg", "TIFF": ".tiff", "PDF": ".pdf"}
        notes: List[str] = []

        if fmt == "JPEG":
            notes.append(
                f"JPEG export uses quality={req.jpegQuality} with 4:4:4 chroma subsampling (for quality >= 90). "
                "Note: JPEG is inherently a lossy format; use PNG or TIFF for strictly lossless archival output."
            )
        elif fmt == "PNG":
            notes.append("PNG export uses lossless DEFLATE compression preserving original dimensions and alpha.")
        elif fmt == "TIFF":
            notes.append(
                f"TIFF export uses bit-depth='{req.tiffBitDepth}' and compression='{req.tiffCompression}', "
                "preserving 16-bit depth when present."
            )

        # Resolve source arrays: always ensure current settings are applied if provided
        req_hash = compute_settings_hash(req.settings) if req.settings is not None else None

        def _load_best(rec: ImageRecord) -> Tuple[np.ndarray, ImageMetadata]:
            orig_path = self.image_paths[rec.id]
            proc_path = self.processed_paths.get(rec.id)

            # If caller passed active settings and image is unprocessed or stale, apply them now
            if req.settings is not None and (
                rec.settingsHash != req_hash or not proc_path or not proc_path.exists()
            ):
                arr_orig, orig_meta = load_image(orig_path)
                processed_arr = apply_color_settings(arr_orig, req.settings)
                del arr_orig
                if processed_arr.dtype == np.uint16:
                    new_proc = self.processed_dir / f"{rec.id}.tiff"
                    save_image(processed_arr, new_proc, "TIFF", orig_meta, tiff_bit_depth="16", tiff_compression="lzw")
                else:
                    new_proc = self.processed_dir / f"{rec.id}.png"
                    save_image(processed_arr, new_proc, "PNG", orig_meta)
                generate_preview(processed_arr, 320, self.thumbs_dir / f"{rec.id}_proc.jpg")
                generate_preview(processed_arr, 1400, self.previews_dir / f"{rec.id}_proc.png")
                ph, pw = processed_arr.shape[:2]
                with self._lock:
                    if rec.id in self.images:
                        cur = self.images[rec.id]
                        cur.status = "processed"
                        cur.settingsHash = req_hash
                        cur.appliedSettings = req.settings.model_copy()
                        cur.processedWidth = pw
                        cur.processedHeight = ph
                        cur.processedAt = _utc_now()
                        self.processed_paths[rec.id] = new_proc
                return processed_arr, orig_meta

            _, orig_meta = load_image(orig_path)
            if proc_path and proc_path.exists():
                arr, _ = load_image(proc_path)
                return arr, orig_meta
            arr, _ = load_image(orig_path)
            return arr, orig_meta

        # PDF Export
        if fmt == "PDF":
            pdf_name = f"{prefix}microscope_batch_{export_id}.pdf" if prefix else f"microscope_batch_{export_id}.pdf"
            entries = []
            for rec in selected:
                arr, meta = _load_best(rec)
                entries.append((rec.filename, arr, meta))

            if req.delivery == "folder" and req.outputFolder:
                target_dir = Path(req.outputFolder).expanduser()
                target_dir.mkdir(parents=True, exist_ok=True)
                pdf_path = target_dir / pdf_name
                pdf_notes = build_multipage_pdf(entries, pdf_path, req.pdfOrientation, req.pdfPageSize)
                notes.extend(pdf_notes)
                return ExportSummary(
                    exportId=export_id,
                    format="PDF",
                    delivery="folder",
                    exportedCount=len(selected),
                    totalBytes=pdf_path.stat().st_size,
                    outputFolder=str(target_dir),
                    files=[pdf_name],
                    notes=notes,
                )

            pdf_path = export_subdir / pdf_name
            pdf_notes = build_multipage_pdf(entries, pdf_path, req.pdfOrientation, req.pdfPageSize)
            notes.extend(pdf_notes)
            self.exports[export_id] = pdf_path
            return ExportSummary(
                exportId=export_id,
                format="PDF",
                delivery="single",
                exportedCount=len(selected),
                totalBytes=pdf_path.stat().st_size,
                files=[pdf_name],
                notes=notes,
                downloadUrl=f"/api/exports/{export_id}/download",
            )

        # Raster Export (PNG / JPEG / TIFF)
        exported_files: List[Tuple[Path, str]] = []
        used_names: Dict[str, int] = {}
        out_dir = (
            Path(req.outputFolder).expanduser()
            if (req.delivery == "folder" and req.outputFolder)
            else export_subdir
        )
        out_dir.mkdir(parents=True, exist_ok=True)

        for rec in selected:
            arr, meta = _load_best(rec)
            base_stem = f"{prefix}{_safe_stem(rec.filename)}"
            count = used_names.get(base_stem, 0)
            used_names[base_stem] = count + 1
            final_stem = f"{base_stem}_{count + 1}" if count > 0 else base_stem
            out_name = f"{final_stem}{ext_map[fmt]}"
            out_path = out_dir / out_name
            save_image(
                arr,
                out_path,
                fmt=fmt,
                meta=meta,
                jpeg_quality=req.jpegQuality,
                tiff_bit_depth=req.tiffBitDepth,
                tiff_compression=req.tiffCompression,
            )
            del arr
            exported_files.append((out_path, out_name))

        if req.delivery == "folder" and req.outputFolder:
            total_bytes = sum(p.stat().st_size for p, _ in exported_files)
            return ExportSummary(
                exportId=export_id,
                format=fmt,
                delivery="folder",
                exportedCount=len(exported_files),
                totalBytes=total_bytes,
                outputFolder=str(out_dir),
                files=[name for _, name in exported_files],
                notes=notes,
            )

        if req.delivery == "single" and len(exported_files) == 1:
            single_path, single_name = exported_files[0]
            self.exports[export_id] = single_path
            return ExportSummary(
                exportId=export_id,
                format=fmt,
                delivery="single",
                exportedCount=1,
                totalBytes=single_path.stat().st_size,
                files=[single_name],
                notes=notes,
                downloadUrl=f"/api/exports/{export_id}/download",
            )

        zip_name = f"{prefix}microscope_batch_{fmt.lower()}_{export_id}.zip"
        zip_path = export_subdir / zip_name
        build_zip_archive(exported_files, zip_path)
        self.exports[export_id] = zip_path
        return ExportSummary(
            exportId=export_id,
            format=fmt,
            delivery="zip",
            exportedCount=len(exported_files),
            totalBytes=zip_path.stat().st_size,
            files=[name for _, name in exported_files],
            notes=notes,
            downloadUrl=f"/api/exports/{export_id}/download",
        )

    def cleanup_exports(self) -> None:
        if self.exports_dir.exists():
            shutil.rmtree(self.exports_dir, ignore_errors=True)
            self.exports_dir.mkdir(parents=True, exist_ok=True)
