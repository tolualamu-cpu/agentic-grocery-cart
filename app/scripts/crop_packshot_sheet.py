from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "catalog" / "products"


def main() -> None:
    parser = argparse.ArgumentParser(description="Crop a generated grocery packshot sheet into catalog product assets.")
    parser.add_argument("sheet", type=Path)
    parser.add_argument("--ids", required=True, help="Comma-separated product ids in row-major order.")
    parser.add_argument("--columns", type=int, default=4)
    parser.add_argument("--size", type=int, default=512)
    parser.add_argument("--pad", type=int, default=10)
    args = parser.parse_args()

    ids = [item.strip() for item in args.ids.split(",") if item.strip()]
    if not ids:
        raise SystemExit("Provide at least one product id.")

    image = Image.open(args.sheet).convert("RGB")
    rows = (len(ids) + args.columns - 1) // args.columns
    cell_width = image.width / args.columns
    cell_height = image.height / rows
    OUT.mkdir(parents=True, exist_ok=True)

    for index, product_id in enumerate(ids):
        column = index % args.columns
        row = index // args.columns
        left = round(column * cell_width) + args.pad
        upper = round(row * cell_height) + args.pad
        right = round((column + 1) * cell_width) - args.pad
        lower = round((row + 1) * cell_height) - args.pad
        crop = image.crop((left, upper, right, lower))
        crop = ImageOps.pad(crop, (args.size, args.size), color=(248, 250, 247), centering=(0.5, 0.5))
        crop.save(OUT / f"{product_id}.webp", "WEBP", quality=82, method=6)

    print(f"Cropped {len(ids)} packshots from {args.sheet}")


if __name__ == "__main__":
    main()
