from __future__ import annotations

import json
import re
import uuid
from pathlib import Path
from typing import List

from .models import ColorSettings, CreatePresetRequest, PresetItem

BUILTIN_PRESETS: List[PresetItem] = [
    PresetItem(
        id="reference-rose-pink",
        name="Reference Rose Pink",
        description="Calibrated directly to your reference slide: dusty rose-pink field with vivid preserved blue & orange cell outlines.",
        swatch="#F0B2C8",
        isCustom=False,
        settings=ColorSettings(
            presetId="reference-rose-pink",
            temperature=16.0,
            tint=60.0,
            hue=0.0,
            saturation=28.0,
            brightness=28.0,
            contrast=42.0,
            highlights=36.0,
            shadows=-22.0,
            midtoneColor="#F0B2C8",
            colorIntensity=82.0,
        ),
    ),
    PresetItem(
        id="soft-pale-pink",
        name="Soft Pale Pink",
        description="Default subtle pink microscope illumination preserving blue & orange specimen outlines.",
        swatch="#F4CEDB",
        isCustom=False,
        settings=ColorSettings(
            presetId="soft-pale-pink",
            temperature=4.0,
            tint=14.0,
            hue=0.0,
            saturation=0.0,
            brightness=2.0,
            contrast=2.0,
            highlights=0.0,
            shadows=0.0,
            midtoneColor="#F4CEDB",
            colorIntensity=72.0,
        ),
    ),
    PresetItem(
        id="light-rose",
        name="Light Rose",
        description="Gentle rose tint with slightly deeper pastel warmth for high-contrast brightfield fields.",
        swatch="#F0BCCD",
        isCustom=False,
        settings=ColorSettings(
            presetId="light-rose",
            temperature=8.0,
            tint=20.0,
            hue=0.0,
            saturation=4.0,
            brightness=0.0,
            contrast=4.0,
            highlights=-2.0,
            shadows=2.0,
            midtoneColor="#F0BCCD",
            colorIntensity=78.0,
        ),
    ),
    PresetItem(
        id="warm-pink",
        name="Warm Pink",
        description="Soft blush-peach illumination for warm histological presentation.",
        swatch="#F5C9CE",
        isCustom=False,
        settings=ColorSettings(
            presetId="warm-pink",
            temperature=18.0,
            tint=12.0,
            hue=0.0,
            saturation=2.0,
            brightness=2.0,
            contrast=3.0,
            highlights=0.0,
            shadows=0.0,
            midtoneColor="#F5C9CE",
            colorIntensity=74.0,
        ),
    ),
    PresetItem(
        id="lavender",
        name="Lavender",
        description="Cool lilac-lavender field background with clean chromatic separation.",
        swatch="#DFD4F2",
        isCustom=False,
        settings=ColorSettings(
            presetId="lavender",
            temperature=-14.0,
            tint=16.0,
            hue=0.0,
            saturation=0.0,
            brightness=2.0,
            contrast=2.0,
            highlights=0.0,
            shadows=0.0,
            midtoneColor="#DFD4F2",
            colorIntensity=70.0,
        ),
    ),
    PresetItem(
        id="soft-blue",
        name="Soft Blue",
        description="Subtle pale cyan-blue brightfield cast for cool optical balance.",
        swatch="#D4E7F5",
        isCustom=False,
        settings=ColorSettings(
            presetId="soft-blue",
            temperature=-18.0,
            tint=-4.0,
            hue=0.0,
            saturation=0.0,
            brightness=2.0,
            contrast=3.0,
            highlights=0.0,
            shadows=0.0,
            midtoneColor="#D4E7F5",
            colorIntensity=68.0,
        ),
    ),
    PresetItem(
        id="warm-beige",
        name="Warm Beige",
        description="Natural ivory-parchment tungsten microscope lamp tone.",
        swatch="#EFE3D0",
        isCustom=False,
        settings=ColorSettings(
            presetId="warm-beige",
            temperature=16.0,
            tint=-2.0,
            hue=0.0,
            saturation=-2.0,
            brightness=2.0,
            contrast=2.0,
            highlights=0.0,
            shadows=0.0,
            midtoneColor="#EFE3D0",
            colorIntensity=68.0,
        ),
    ),
    PresetItem(
        id="neutral",
        name="Neutral",
        description="Zero color shift — preserves original pixel values untouched.",
        swatch="#E6E7EB",
        isCustom=False,
        settings=ColorSettings(
            presetId="neutral",
            temperature=0.0,
            tint=0.0,
            hue=0.0,
            saturation=0.0,
            brightness=0.0,
            contrast=0.0,
            highlights=0.0,
            shadows=0.0,
            midtoneColor="#FFFFFF",
            colorIntensity=0.0,
        ),
    ),
    PresetItem(
        id="custom-color",
        name="Custom Color",
        description="Customizable color tint — pick any target hue with the color picker.",
        swatch="#E8D2E8",
        isCustom=False,
        settings=ColorSettings(
            presetId="custom-color",
            temperature=0.0,
            tint=6.0,
            hue=0.0,
            saturation=0.0,
            brightness=0.0,
            contrast=0.0,
            highlights=0.0,
            shadows=0.0,
            midtoneColor="#E8D2E8",
            colorIntensity=65.0,
        ),
    ),
]


class PresetStore:
    def __init__(self, storage_file: Path) -> None:
        self.storage_file = storage_file
        self.storage_file.parent.mkdir(parents=True, exist_ok=True)

    def _load_custom(self) -> List[PresetItem]:
        if not self.storage_file.exists():
            return []
        try:
            raw = json.loads(self.storage_file.read_text(encoding="utf-8"))
            return [PresetItem(**item) for item in raw]
        except Exception:
            return []

    def _save_custom(self, presets: List[PresetItem]) -> None:
        self.storage_file.write_text(
            json.dumps([p.model_dump() for p in presets], indent=2),
            encoding="utf-8",
        )

    def list_all(self) -> List[PresetItem]:
        return [*BUILTIN_PRESETS, *self._load_custom()]

    def create(self, req: CreatePresetRequest) -> PresetItem:
        slug = re.sub(r"[^a-z0-9]+", "-", req.name.lower()).strip("-") or "custom"
        preset_id = f"custom-{slug}-{uuid.uuid4().hex[:6]}"
        settings = req.settings.model_copy(update={"presetId": preset_id})
        item = PresetItem(
            id=preset_id,
            name=req.name.strip(),
            description=req.description.strip() or "Custom microscope color preset",
            swatch=settings.midtoneColor,
            isCustom=True,
            settings=settings,
        )
        customs = self._load_custom()
        customs.append(item)
        self._save_custom(customs)
        return item

    def delete(self, preset_id: str) -> bool:
        customs = self._load_custom()
        filtered = [p for p in customs if p.id != preset_id]
        if len(filtered) == len(customs):
            return False
        self._save_custom(filtered)
        return True
