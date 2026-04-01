import type { NextRequest } from "next/server";
import { mockDeals } from "@/lib/mock-data";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const sort = searchParams.get("sort") || "score";
  const dir = searchParams.get("dir") || "desc";

  let deals = [...mockDeals];

  if (status && status !== "all") {
    deals = deals.filter((d) => d.status === status);
  }

  deals.sort((a, b) => {
    let cmp = 0;
    switch (sort) {
      case "score":
        cmp = (a.score || 0) - (b.score || 0);
        break;
      case "name":
        cmp = a.companyName.localeCompare(b.companyName);
        break;
      case "updated":
        cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        break;
    }
    return dir === "desc" ? -cmp : cmp;
  });

  return Response.json({ deals, total: deals.length });
}
