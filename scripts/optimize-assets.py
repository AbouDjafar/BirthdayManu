"""Regenerate published image renditions from ignored originals.

Run from the repository root with Python + Pillow installed:
    python scripts/optimize-assets.py

Sources stay in assets-originaux/nouveautes; they are never committed. Widths
match the responsive avatar sources in storage.ts. Compression uses the source
PNG/JPEG, never an already compressed WebP. Alpha and the artwork are preserved.
"""

from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets-originaux" / "nouveautes"
TARGET = ROOT / "public" / "assets"
PORTRAITS = {
    "affamee": "affamée.png",
    "akah": "exclamation - akah.png",
    "bisous": "bisous.png",
    "cogite": "cogite.png",
    "combattive": "combattive.png",
    "emue": "émue.png",
    "etonnee": "étonnée.png",
    "pensive": "pensive.png",
    "rememore": "remémore.png",
    "somnole": "somnole.png",
    "suspicieuse": "suspicieuse.png",
    "triste": "triste.png",
}


def publish(image: Image.Image, width: int, output: Path) -> None:
    width = min(width, image.width)
    resized = image.resize(
        (width, round(image.height * width / image.width)), Image.Resampling.LANCZOS
    )
    resized.save(output, "WEBP", quality=86, method=6, exact=True)
    print(f"{output.relative_to(ROOT)}: {resized.width}×{resized.height}, {output.stat().st_size:,} bytes")


for name, filename in PORTRAITS.items():
    image = ImageOps.exif_transpose(Image.open(SOURCE / filename)).convert("RGBA")
    if name == "akah":
        image = image.convert("RGB")
    for width in (160, 320, 480):
        suffix = "" if width == 480 else f"-{width}"
        publish(image, width, TARGET / "portraits" / f"{name}{suffix}.webp")

photo = ImageOps.exif_transpose(Image.open(SOURCE / "La surprise.jpg")).convert("RGB")
publish(photo, photo.width, TARGET / "surprise.webp")
publish(photo, 360, TARGET / "surprise-360.webp")
