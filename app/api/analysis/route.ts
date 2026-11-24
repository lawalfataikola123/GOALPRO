import { NextRequest, NextResponse } from "next/server";

const API_BASE = "https://v3.football.api-sports.io";
const completedStatuses = new Set(["FT", "AET", "PEN"]);

type ApiFixture = {
  fixture: { id: number; date: string; status: { short: string } };
  league: { name: string; season: number };
  teams: {
    home: { id: number; name: string };
    away: { id: number; name: string };
  };
  goals: { home: number | null; away: number | null };
  score: { halftime: { home: number | null; away: number | null } };
};

type TeamSummary = {
  teamId: number;
  matches: number;
  averageGoalsFor: number;
  averageGoalsAgainst: number;
  bttsRate: number;
  over15Rate: number;
  over25Rate: number;
  firstHalfOver05Rate: number | null;
  secondHalfOver05Rate: number | null;
  homeMatches: number;
  awayMatches: number;
};

async function providerGet(path: string, apiKey: string) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "x-apisports-key": apiKey },
    next: { revalidate: 900 },
  });

  if (!response.ok) throw new Error("provider");
  const payload = await response.json();
  if (payload.errors && Object.keys(payload.errors).length > 0) {
    throw new Error("provider");
  }
  return (payload.response ?? []) as ApiFixture[];
}

function summarizeTeam(fixtures: ApiFixture[], teamId: number): TeamSummary {
  const matches = fixtures.filter((match) =>
    completedStatuses.has(match.fixture.status.short) &&
    match.goals.home !== null &&
    match.goals.away !== null
  );

  let scored = 0;
  let conceded = 0;
  let btts = 0;
  let over15 = 0;
  let over25 = 0;
  let firstHalfOver05 = 0;
  let secondHalfOver05 = 0;
  let firstHalfSamples = 0;
  let secondHalfSamples = 0;
  let homeMatches = 0;
  let awayMatches = 0;

  for (const match of matches) {
    const isHome = match.teams.home.id === teamId;
    const goalsFor = isHome ? match.goals.home! : match.goals.away!;
    const goalsAgainst = isHome ? match.goals.away! : match.goals.home!;
    const total = goalsFor + goalsAgainst;
    scored += goalsFor;
    conceded += goalsAgainst;
    if (goalsFor > 0 && goalsAgainst > 0) btts += 1;
    if (total > 1) over15 += 1;
    if (total > 2) over25 += 1;
    if (isHome) homeMatches += 1;
    else awayMatches += 1;

    const halfHome = match.score.halftime.home;
    const halfAway = match.score.halftime.away;
    if (halfHome !== null && halfAway !== null) {
      firstHalfSamples += 1;
      if (halfHome + halfAway > 0) firstHalfOver05 += 1;
      const secondHome = match.goals.home! - halfHome;
      const secondAway = match.goals.away! - halfAway;
      secondHalfSamples += 1;
      if (secondHome + secondAway > 0) secondHalfOver05 += 1;
    }
  }

  const count = matches.length;
  const rate = (value: number, sample: number) =>
    sample ? Number((value / sample).toFixed(3)) : null;

  return {
    teamId,
    matches: count,
    averageGoalsFor: count ? Number((scored / count).toFixed(2)) : 0,
    averageGoalsAgainst: count ? Number((conceded / count).toFixed(2)) : 0,
    bttsRate: rate(btts, count) ?? 0,
    over15Rate: rate(over15, count) ?? 0,
    over25Rate: rate(over25, count) ?? 0,
    firstHalfOver05Rate: rate(firstHalfOver05, firstHalfSamples),
    secondHalfOver05Rate: rate(secondHalfOver05, secondHalfSamples),
    homeMatches,
    awayMatches,
  };
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Football data is not configured on the server." },
      { status: 503 },
    );
  }

  const params = request.nextUrl.searchParams;
  const fixtureId = Number(params.get("fixture"));
  const homeId = Number(params.get("home"));
  const awayId = Number(params.get("away"));
  const season = Number(params.get("season"));

  if (![fixtureId, homeId, awayId, season].every(Number.isSafeInteger) ||
      fixtureId <= 0 || homeId <= 0 || awayId <= 0 || homeId === awayId ||
      season < 2000 || season > 2100) {
    return NextResponse.json(
      { error: "Provide valid fixture, home, away and season IDs." },
      { status: 400 },
    );
  }

  try {
    const [homeRecent, awayRecent, headToHead] = await Promise.all([
      providerGet(`/fixtures?team=${homeId}&last=10&season=${season}`, apiKey),
      providerGet(`/fixtures?team=${awayId}&last=10&season=${season}`, apiKey),
      providerGet(`/fixtures/headtohead?h2h=${homeId}-${awayId}&last=10`, apiKey),
    ]);

    const home = summarizeTeam(homeRecent, homeId);
    const away = summarizeTeam(awayRecent, awayId);
    const h2h = headToHead
      .filter((match) =>
        completedStatuses.has(match.fixture.status.short) &&
        match.goals.home !== null &&
        match.goals.away !== null
      )
      .map((match) => ({
        fixtureId: match.fixture.id,
        date: match.fixture.date,
        home: match.teams.home.name,
        away: match.teams.away.name,
        score: [match.goals.home, match.goals.away],
        competition: match.league.name,
      }));

    return NextResponse.json({
      fixtureId,
      season,
      sampleSizes: {
        homeRecent: home.matches,
        awayRecent: away.matches,
        headToHead: h2h.length,
      },
      home,
      away,
      headToHead: h2h,
      limitations: [
        "Rates are calculated from completed matches returned by the provider.",
        "Half-specific rates use matches with available half-time scores.",
        "xG and injury data are not included in this analysis.",
        "A small sample or missing provider data can reduce reliability.",
      ],
    });
  } catch {
    return NextResponse.json(
      { error: "Match analysis could not be retrieved. Check provider access and try again later." },
      { status: 502 },
    );
  }
}
