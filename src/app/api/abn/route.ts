import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const abn = new URL(req.url).searchParams.get("abn");
  if (!abn) return NextResponse.json({ error: "Missing ABN" }, { status: 400 });

  const clean = abn.replace(/\s/g, "");
  
  try {
    const res = await fetch(
      `https://api.abr.business.gov.au/abn/v3/json?abn=${clean}&guid=00000000-0000-0000-0000-000000000000`,
      { headers: { "Accept": "application/json" } }
    );
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
