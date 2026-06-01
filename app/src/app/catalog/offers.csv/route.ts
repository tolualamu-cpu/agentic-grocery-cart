import { getCatalogOffersCsv } from "@/data/catalogExport";

export function GET() {
  return new Response(getCatalogOffersCsv(), {
    headers: {
      "Content-Disposition": 'attachment; filename="mock-catalog-offers.csv"',
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
