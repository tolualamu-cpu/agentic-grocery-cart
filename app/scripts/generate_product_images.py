from __future__ import annotations

import sys


MESSAGE = """
The old procedural image generator was intentionally retired.

Product images must now be ecommerce-style packshots, not generated letter cards
or icon-like placeholders. Generate product-photo sheets with the documented
packshot prompts, then crop them with:

  python3 scripts/crop_packshot_sheet.py <sheet.png> --ids <comma-separated-product-ids>

This guard prevents accidentally overwriting high-quality catalog images with
low-fidelity procedural stand-ins. The crop helper writes optimized WebP files.
""".strip()


if __name__ == "__main__":
    print(MESSAGE, file=sys.stderr)
    raise SystemExit(1)
