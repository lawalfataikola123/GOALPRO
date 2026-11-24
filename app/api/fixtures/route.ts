import { NextRequest, NextResponse } from "next/server";

const API_BASE = "https://v3.football.api-sports.io";

export async function GET(request: NextRequest) {
  const apiKey = process.env.API_FOOTBALL_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Football data is not configured on the server yet." },
      { status: 503 },
    );
  }

  const date = request.nextUrl.searchParams.get("date");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const fixtureDate = date ?? today;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fixtureDate)) {
    return NextResponse.json(
      { error: "Use a date in YYYY-MM-DD format." },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(
      `${API_BASE}/fixtures?date=${encodeURIComponent(fixtureDate)}&timezone=Africa%2FLagos`,
      {
        headers: { "x-apisports-key": apiKey },
        next: { revalidate: 300 },
      },
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "The football data provider could not complete the request." },
        { status: 502 },
      );
    }

    const payload = await response.json();

    if (payload.errors && Object.keys(payload.errors).length > 0) {
      return NextResponse.json(
        { error: "The football data provider returned an error." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      date: fixtureDate,
      timezone: "Africa/Lagos",
      results: payload.results ?? 0,
      fixtures: payload.response ?? [],
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to reach the football data provider. Try again later." },
      { status: 502 },
    );
  }
}
