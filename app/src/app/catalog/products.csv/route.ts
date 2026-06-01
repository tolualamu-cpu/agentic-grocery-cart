import { getCatalogProductsCsv } from "@/data/catalogExport";

export function GET() {
  return new Response(getCatalogProductsCsv(), {
    headers: {
      "Content-Disposition": 'attachment; filename="mock-catalog-products.csv"',
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
