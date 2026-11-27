# MiCrolor — Microscope Batch Color Studio

A locally running, high-integrity scientific web application for batch color grading of microscope photographs. Designed specifically for converting whitish or grayish brightfield microscope backgrounds into **Soft Pale Pink** (or any custom illumination tone) while preserving original specimen structures, dimensions, and bit depth.

---

## Core Workflow

`UPLOAD → BATCH SELECTION → COLOR CUSTOMIZATION → PROCESS → PREVIEW → EXPORT`

1. **Upload**: Drag-and-drop or browse 1–200+ microscope photographs (`JPG`, `JPEG`, `PNG`, `TIFF` 8-bit/16-bit, `WebP`). Chunked uploads and lightweight thumbnails keep the interface responsive.
2. **Batch Selection**: Clean gallery with Select All, Deselect All, individual selection, per-image status badges, retry for failed images, and queue management.
3. **Color Customization**:
   - **8 Built-in Presets**: `Soft Pale Pink` (default), `Light Rose`, `Warm Pink`, `Lavender`, `Soft Blue`, `Warm Beige`, `Neutral`, and `Custom Color`.
   - **Full Controls**: Midtone/Field Color Picker, Color Intensity, Temperature, Tint, Hue, Saturation, Brightness, Contrast, Highlights, and Shadows.
   - Save, load, and delete custom presets locally.
4. **Process**: Controlled-concurrency background processing engine on your local machine with progress bar, cancellation, error reporting, and settings-hash caching (avoids redundant reprocessing).
5. **Preview**: Instant real-time 60fps preview with **Before / After Slider**, **Side-by-Side**, **Zoom In/Out**, **Fit**, **100% Pixel Inspection**, original vs. processed dimension display, and filmstrip navigation.
6. **Export**: Export individual images, selected images, or the full batch as **PNG**, **JPEG**, **TIFF**, or **Multipage PDF** via **ZIP download** or directly into a **local output folder** with custom filename prefixes.

---

## Scientific Image Integrity & Color Science

### Chroma-Preserving Optical Illumination Tinting
Instead of placing a flat, opaque pink overlay over the image (which washes out contrast and shifts specimen hues), the color engine operates in normalized 32-bit floating-point space:
- **Neutrality Weighting**: Identifies high-luminance, low-chroma brightfield background pixels (`S ≈ 0`) and applies a physically motivated multiplicative illumination filter `C_out = C_in * ((1 - α) + α * F)`.
- **Specimen Outline Protection**: High-chroma structures (such as blue and orange circular outlines) and dark edges have low neutrality weights, preserving their original hue, sharpness, and contrast.
- **Zero AI / Generative Modification**: No generative fill, no default sharpening, no default denoising, no automatic cropping, and no artificial reconstruction.

### Format Quality & Lossless vs. Lossy Explanation
- **PNG (Lossless)**: Uses lossless DEFLATE compression, preserving exact pixel dimensions, alpha transparency, and ICC profiles.
- **TIFF (Lossless, 8-bit & 16-bit)**: Preserves original 16-bit depth (`uint16`) when present (or allows explicit 8-bit / 16-bit output) with lossless LZW, Deflate, or Uncompressed encoding.
- **JPEG (Lossy)**: Defaults to `quality=100` with 4:4:4 chroma subsampling (`subsampling=0`) and preserves original dimensions and ICC profiles. **Note:** JPEG is inherently a lossy format even at quality 100; use **PNG** or **TIFF** for strictly lossless archival output.
- **PDF (Multipage)**: Embeds full-resolution lossless PNG streams without raster downsampling. Supports `Original` page sizing (matches native aspect ratio/DPI) as well as `A4` and `Letter` (with `Auto`, `Portrait`, `Landscape`, and `Fit-to-Image` orientation) and reports effective print DPI when fixed page dimensions constrain print area.

---

## Open-Source Libraries & Licenses

| Library | Role | License |
| --- | --- | --- |
| **React** (`19.x`) & **TypeScript** | Frontend UI framework & type safety | MIT / Apache-2.0 |
| **Vite** (`6.x`) & **Tailwind CSS** (`4.x`) | Fast local dev server, bundler, and styling | MIT |
| **Lucide React** | Clean UI iconography | ISC |
| **FastAPI** & **Uvicorn** | Local-only asynchronous API server | MIT / BSD-3-Clause |
| **NumPy** | Vectorized float32/uint16 color-space math | BSD-3-Clause |
| **Pillow (PIL)** | Lossless PNG, high-quality JPEG, WebP, thumbnails | MIT-CMU |
| **tifffile** & **imagecodecs** | True 8-bit & 16-bit TIFF reading and lossless writing | BSD-3-Clause |
| **ReportLab** | High-resolution multipage PDF compilation | BSD |
| **pytest** & **httpx** | Automated QA and scientific integrity test suite | MIT / BSD-3-Clause |

---

## Project Structure

```text
Project_Color/
├── package.json                  # Root scripts (npm run dev, npm run test:backend, npm run build)
├── README.md
├── samples/                      # Optional synthetic microscope test slides (PNG, JPEG, 16-bit TIFF)
├── backend/
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py               # FastAPI endpoints & CORS
│   │   ├── models.py             # Pydantic schemas
│   │   ├── color_engine.py       # Vectorized float32 / 16-bit color engine
│   │   ├── image_io.py           # PNG, JPEG, 16-bit TIFF, PDF, ZIP I/O
│   │   ├── presets.py            # 8 built-in presets + custom preset persistence
│   │   └── storage.py            # Non-destructive workspace & concurrent batch processor
│   └── tests/
│       └── test_engine_and_api.py
└── frontend/
    ├── package.json
    ├── vite.config.ts            # Proxies /api -> http://127.0.0.1:8000
    └── src/
        ├── App.tsx
        ├── types/index.ts
        ├── utils/
        │   ├── api.ts
        │   ├── colorEngine.ts    # Matching client-side 60fps live preview engine
        │   └── format.ts
        └── components/
            ├── TopBar.tsx
            ├── LeftSidebar.tsx
            ├── UploadZone.tsx
            ├── ImageGallery.tsx
            ├── PreviewWorkspace.tsx
            ├── RightSidebar.tsx
            ├── PresetsPanel.tsx
            ├── BatchHistoryPanel.tsx
            └── ExportPanel.tsx
```

---

## Installation & Running Locally

### Prerequisites
- **Node.js** 18+ and **npm**
- **Python** 3.10+

### 1. Install Dependencies (One-Time Setup)
```powershell
npm run setup
```
*(Or manually: create `backend\.venv`, `pip install -r backend\requirements.txt`, `npm install`, and `npm --prefix frontend install`.)*

### 2. Start the Application
```powershell
npm run dev
```
This starts both:
- **Local Processing API**: `http://127.0.0.1:8000`
- **Web Studio UI**: `http://127.0.0.1:5173`

Open **`http://127.0.0.1:5173`** in your browser. All images remain strictly on your local computer.

### 3. Run Automated QA & Integrity Tests
```powershell
npm run test:backend
```
