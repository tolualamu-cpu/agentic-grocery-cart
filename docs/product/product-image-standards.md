# Product Image Standards

Product images are part of the grocery decision system, not decoration. A shopper should be able to scan a cart line and recognize the item quickly.

## Standard

- Use ecommerce-style product packshots: centered item, light neutral background, realistic texture, and soft contact shadow.
- Produce should look like real produce.
- Meat and seafood should look like clean grocery product photography.
- Packaged goods should use generic packaging without fake brands or readable labels.
- Household, baby, and pet products should use clear generic product packaging.
- Do not use letters, initials, vector icons, flat symbolic illustrations, watermarks, logos, decorative cards, or baked-in UI labels.
- Keep images visually subordinate to the cart content: selected item images may be larger; substitutes remain compact thumbnails.

## Mock Catalog Source

The mock catalog uses local AI-generated packshot assets under `app/public/catalog/products`.
Final app-referenced assets should be optimized WebP files so the catalog table can render quickly.

Generated source sheets should be cropped with:

```bash
python3 scripts/crop_packshot_sheet.py <sheet.png> --ids <comma-separated-product-ids>
```

The retired procedural generator is intentionally guarded so it cannot overwrite packshot assets with low-fidelity placeholders.

## Future Retailer Connectors

When live retailer connectors are added, retailer-provided product imagery can override mock product imagery through `Offer.image`. The resolver order remains:

```text
Offer image -> Product image -> Category fallback
```
