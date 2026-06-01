import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extname, join } from "node:path";
import { categoryFallbackImage, offers, products, resolveOfferImage, resolveProductImage } from "@/data/mockCatalog";
import {
  getCatalogOfferRows,
  getCatalogOffersCsv,
  getCatalogProductRows,
  getCatalogProductsCsv,
} from "@/data/catalogExport";

describe("catalog export tables", () => {
  it("renders a readable product table for every mock product", () => {
    const rows = getCatalogProductRows();

    expect(rows).toHaveLength(products.length);
    expect(rows.find((row) => row.id === "oat-milk")).toMatchObject({
      name: "oat milk",
      subcategory: "plant milk",
      dietaryTags: "dairy-free",
      imageSrc: "/catalog/products/oat-milk.webp",
      imageAlt: "oat milk product image",
    });
    expect(rows.find((row) => row.id === "black-beans")?.semanticTags).toContain("plant based");
  });

  it("renders a readable offer table for every mock retailer offer", () => {
    const rows = getCatalogOfferRows();

    expect(rows).toHaveLength(offers.length);
    expect(rows.find((row) => row.id === "wm-almond-milk")).toMatchObject({
      productName: "almond milk",
      store: "Walmart",
      price: "$2.98",
      imageSrc: "/catalog/products/almond-milk.webp",
      imageAlt: "almond milk product image",
    });
  });

  it("exports products and offers as downloadable CSV", () => {
    expect(getCatalogProductsCsv()).toContain("id,name,category");
    expect(getCatalogProductsCsv()).toContain("imageSrc,imageAlt");
    expect(getCatalogProductsCsv()).toContain("oat-milk,oat milk,dairy");
    expect(getCatalogOffersCsv()).toContain("id,productId,productName");
    expect(getCatalogOffersCsv()).toContain("imageSrc,imageAlt");
    expect(getCatalogOffersCsv()).toContain("wm-almond-milk,almond-milk,almond milk");
  });

  it("attaches valid local image metadata to every product and offer", () => {
    for (const product of products) {
      expect(product.image.src).toMatch(/^\/catalog\/products\/.+\.(png|webp)$/);
      expect(product.image.src.endsWith(".svg")).toBe(false);
      expect(product.image.alt).toContain("product image");
      const imagePath = join(process.cwd(), "public", product.image.src);
      expect(existsSync(imagePath)).toBe(true);
      expect(readImageDimensions(imagePath)).toEqual({ width: 512, height: 512 });
    }

    for (const offer of offers) {
      const image = resolveOfferImage(offer);

      expect(image.src).toMatch(/^\/catalog\/products\/.+\.(png|webp)$/);
      expect(image.src.endsWith(".svg")).toBe(false);
      expect(image.alt).toContain("product image");
      const imagePath = join(process.cwd(), "public", image.src);
      expect(existsSync(imagePath)).toBe(true);
      expect(readImageDimensions(imagePath)).toEqual({ width: 512, height: 512 });
    }
  });

  it("does not ship old letter-card SVG product assets", () => {
    const imageFiles = readdirSync(join(process.cwd(), "public", "catalog", "products"));

    expect(imageFiles.some((file) => extname(file) === ".svg")).toBe(false);
    expect(imageFiles.every((file) => [".png", ".webp"].includes(extname(file)))).toBe(true);
  });

  it("resolves offer overrides, product images, and category fallbacks in order", () => {
    const override = {
      src: "/catalog/products/fallback-grocery.webp",
      alt: "Override product image",
      background: "#ffffff",
    };

    expect(resolveOfferImage({ ...offers[0], image: override })).toEqual(override);
    expect(resolveProductImage(products.find((product) => product.id === "oat-milk"))?.src).toBe(
      "/catalog/products/oat-milk.webp",
    );
    expect(categoryFallbackImage("Frozen").src).toBe("/catalog/products/fallback-frozen.webp");
    expect(existsSync(join(process.cwd(), "public", categoryFallbackImage("Frozen").src))).toBe(true);
  });

  it("keeps the retired procedural generator from overwriting packshot assets", () => {
    const result = spawnSync("python3", ["scripts/generate_product_images.py"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("procedural image generator was intentionally retired");
    expect(result.stderr).toContain("packshots");
  });
});

function readImageDimensions(path: string): { width: number; height: number } {
  const buffer = readFileSync(path);

  if (path.endsWith(".webp")) {
    const chunkType = buffer.toString("ascii", 12, 16);

    if (chunkType === "VP8X") {
      const widthMinusOne = buffer.readUIntLE(24, 3);
      const heightMinusOne = buffer.readUIntLE(27, 3);

      return {
        width: widthMinusOne + 1,
        height: heightMinusOne + 1,
      };
    }

    if (chunkType === "VP8 ") {
      return {
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
      };
    }

    if (chunkType === "VP8L") {
      const bits = buffer.readUInt32LE(21);

      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }

    throw new Error(`Unsupported WebP chunk type: ${chunkType}`);
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}
