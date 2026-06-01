import Link from "next/link";
import { getCatalogOfferRows, getCatalogProductRows } from "@/data/catalogExport";

export default function CatalogPage() {
  const products = getCatalogProductRows();
  const offers = getCatalogOfferRows();

  return (
    <main className="min-h-screen bg-[#f6f8f6] px-4 py-6 text-[#111917]">
      <div className="mx-auto grid max-w-[1480px] gap-6">
        <header className="flex flex-wrap items-start justify-between gap-4 rounded-md border border-[#dfe5e1] bg-white p-5 shadow-sm">
          <div>
            <Link className="text-sm font-semibold text-[#0f6b58] hover:underline" href="/">
              Cart builder
            </Link>
            <h1 className="mt-3 text-3xl font-semibold">Mock catalog</h1>
            <p className="mt-2 max-w-2xl text-sm text-[#607067]">
              Readable product and offer tables generated from the local mock catalog.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              className="rounded-md border border-[#0f6b58] px-4 py-2 text-sm font-semibold text-[#0f6b58] hover:bg-[#eef7f4]"
              download
              href="/catalog/products.csv"
            >
              Products CSV
            </a>
            <a
              className="rounded-md bg-[#0f6b58] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b5848]"
              download
              href="/catalog/offers.csv"
            >
              Offers CSV
            </a>
          </div>
        </header>

        <CatalogTable
          caption={`${products.length} canonical products`}
          columns={[
            "imageSrc",
            "name",
            "category",
            "subcategory",
            "aliases",
            "semanticTags",
            "dietaryTags",
            "stores",
            "minPrice",
          ]}
          rows={products}
          title="Products"
        />

        <CatalogTable
          caption={`${offers.length} retailer offers`}
          columns={[
            "imageSrc",
            "productName",
            "store",
            "offerName",
            "brand",
            "package",
            "price",
            "available",
            "organic",
            "storeBrand",
          ]}
          rows={offers}
          title="Offers"
        />
      </div>
    </main>
  );
}

function CatalogTable<TRow extends Record<string, string | number>>({
  caption,
  columns,
  rows,
  title,
}: {
  caption: string;
  columns: Array<keyof TRow & string>;
  rows: TRow[];
  title: string;
}) {
  return (
    <section className="rounded-md border border-[#dfe5e1] bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="mt-1 text-sm font-medium text-[#607067]">{caption}</p>
        </div>
      </div>
      <div className="overflow-auto rounded-md border border-[#e5ebe7]">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-[#edf4f1] text-xs uppercase tracking-[0.04em] text-[#506158]">
            <tr>
              {columns.map((column) => (
                <th className="border-b border-[#dfe5e1] px-3 py-3 font-semibold" key={column} scope="col">
                  {formatHeader(column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr className="odd:bg-white even:bg-[#fbfcfb]" key={`${title}-${index}`}>
                {columns.map((column) => (
                  <td className="max-w-[360px] border-b border-[#eef2ef] px-3 py-3 align-top" key={column}>
                    {column === "imageSrc" ? (
                      <div className="flex items-center gap-3">
                        <img
                          alt={String(row.imageAlt || "Product image")}
                          className="h-12 w-12 rounded-md border border-[#e5ebe7] bg-[#f8faf9] object-cover"
                          src={String(row[column] || "")}
                        />
                        <span className="max-w-44 break-all text-xs text-[#607067]">{String(row[column] || "")}</span>
                      </div>
                    ) : (
                      String(row[column] || "")
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatHeader(value: string): string {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase())
    .trim();
}
