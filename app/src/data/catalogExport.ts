import { offers, products, resolveOfferImage, stores } from "@/data/mockCatalog";

const storeById = new Map(stores.map((store) => [store.id, store]));
const productById = new Map(products.map((product) => [product.id, product]));
const offersByProductId = offers.reduce<Map<string, typeof offers>>((groups, offer) => {
  const productOffers = groups.get(offer.productId) ?? [];
  productOffers.push(offer);
  groups.set(offer.productId, productOffers);
  return groups;
}, new Map());

export type CatalogProductRow = {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  aliases: string;
  tags: string;
  semanticTags: string;
  dietaryTags: string;
  imageSrc: string;
  imageAlt: string;
  offerCount: number;
  availableOfferCount: number;
  stores: string;
  minPrice: string;
};

export type CatalogOfferRow = {
  id: string;
  productId: string;
  productName: string;
  store: string;
  offerName: string;
  brand: string;
  package: string;
  price: string;
  available: string;
  organic: string;
  storeBrand: string;
  dietaryTags: string;
  imageSrc: string;
  imageAlt: string;
};

export function getCatalogProductRows(): CatalogProductRow[] {
  return products.map((product) => {
    const productOffers = offersByProductId.get(product.id) ?? [];
    const availableOffers = productOffers.filter((offer) => offer.available);
    const prices = availableOffers.map((offer) => offer.price);

    return {
      id: product.id,
      name: product.canonicalName,
      category: product.category,
      subcategory: product.subcategory ?? "",
      aliases: joinValues(product.aliases),
      tags: joinValues(product.tags),
      semanticTags: joinValues(product.semanticTags),
      dietaryTags: joinValues(product.dietaryTags),
      imageSrc: product.image.src,
      imageAlt: product.image.alt,
      offerCount: productOffers.length,
      availableOfferCount: availableOffers.length,
      stores: joinValues(uniqueValues(productOffers.map((offer) => storeById.get(offer.storeId)?.name ?? offer.storeId))),
      minPrice: prices.length > 0 ? money(Math.min(...prices)) : "",
    };
  });
}

export function getCatalogOfferRows(): CatalogOfferRow[] {
  return offers.map((offer) => {
    const product = productById.get(offer.productId);
    const store = storeById.get(offer.storeId);
    const image = resolveOfferImage(offer);

    return {
      id: offer.id,
      productId: offer.productId,
      productName: product?.canonicalName ?? offer.productId,
      store: store?.name ?? offer.storeId,
      offerName: offer.name,
      brand: offer.brand,
      package: `${offer.packageQuantity} ${offer.packageUnit}`,
      price: money(offer.price),
      available: offer.available ? "yes" : "no",
      organic: offer.organic ? "yes" : "no",
      storeBrand: offer.storeBrand ? "yes" : "no",
      dietaryTags: joinValues(offer.dietaryTags),
      imageSrc: image.src,
      imageAlt: image.alt,
    };
  });
}

export function getCatalogProductsCsv(): string {
  return toCsv(getCatalogProductRows());
}

export function getCatalogOffersCsv(): string {
  return toCsv(getCatalogOfferRows());
}

function toCsv<TRow extends Record<string, string | number>>(rows: TRow[]): string {
  if (rows.length === 0) {
    return "";
  }

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCsv(String(row[header]))).join(",")),
  ];

  return `${lines.join("\n")}\n`;
}

function escapeCsv(value: string): string {
  if (!/[",\n]/.test(value)) {
    return value;
  }

  return `"${value.replaceAll('"', '""')}"`;
}

function joinValues(values: string[] | undefined): string {
  return values?.filter(Boolean).join("; ") ?? "";
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}
