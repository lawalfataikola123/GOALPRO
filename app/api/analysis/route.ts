import { NextRequest, NextResponse } from "next/server";

const API_BASE = "https://api.api-ninjas.com/v1/soccermatches";
const completed = new Set(["final"]);
const supportedLeagues = new Set([
  "acl", "afcon", "aleague", "aleaguewomen", "allsvenskan", "asiancup",
  "austrianbundesliga", "belgianproleague", "brasileirao", "bundesliga",
  "bundesliga2", "cafcl", "championship", "clubworldcup", "concacafcc",
  "concacafnationsleague", "copaamerica", "copadelrey", "coppaitalia",
  "coupedefrance", "csl", "danishsuperliga", "dfbpokal", "eflcup",
  "eliteserien", "epl", "eredivisie", "euro", "euroqualifying", "facup",
  "friendlies", "goldcup", "greeksuperleague", "isl", "j1league", "laliga",
  "laliga2", "leagueone", "leaguescup", "leaguetwo", "libertadores", "ligaf",
  "ligamx", "ligaprofesional", "ligue1", "ligue2", "mls", "nationsleague",
  "nsl", "premiereligue", "primeiraliga", "rpl", "saudiproleague",
  "scottishpremiership", "seriea", "serieb", "sudamericana", "superlig",
  "ucl", "uecl", "uel", "uslc", "uslsuperleague", "usopencup", "uwcl",
  "wcqafrica", "wcqasia", "wcqeurope", "wcqnorthamerica", "wcqsouthamerica",
  "womenseuro", "womensworldcup", "worldcup", "wsl"
]);
type Match = {
  game_id: string;
  league?: string;
  date: string;
  status: string;
  home_team: { team_id?: string; name: string };
  away_team: { team_id?: string; name: string };
  home_score: number | null;
  away_score: number | null;
};
type TeamSummary = {
  matches: number;
  averageGoalsFor: number;
  averageGoalsAgainst: number;
  bttsRate: number;
  over15Rate: number;
  over25Rate: number;
  firstHalfOver05Rate: null;
  secondHalfOver05Rate: null;
};

async function getTeamMatches(teamName: string, league: string, apiKey: string): Promise<Match[]> {
  const url = new URL(API_BASE);
  url.searchParams.set("team", teamName);
  url.searchParams.set("league", league);
  const response = await fetch(url, {
    headers: { "X-Api-Key": apiKey },
    next: { revalidate: 900 },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(payload)) {
    console.error("[GOALPRO analysis] API Ninjas request failed", {
      status: response.status,
      error: payload && !Array.isArray(payload) ? payload.error ?? payload.message ?? "Unexpected response" : null,
    });
    throw new Error("Recent match data is unavailable from the configured football provider.");
  }
  return payload as Match[];
}

function summarize(matches: Match[], teamName: string): TeamSummary {
  const normalized = teamName.trim().toLowerCase();
  const recent = matches
    .filter((m) => completed.has(m.status) && Number.isFinite(m.home_score) && Number.isFinite(m.away_score))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, 10);
  let scored = 0, conceded = 0, btts = 0, over15 = 0, over25 = 0;
  for (const match of recent) {
    const isHome = match.home_team.name.trim().toLowerCase() === normalized;
    const gf = isHome ? match.home_score! : match.away_score!;
    const ga = isHome ? match.away_score! : match.home_score!;
    scored += gf;
    conceded += ga;
    if (gf > 0 && ga > 0) btts++;
    if (gf + ga > 1) over15++;
    if (gf + ga > 2) over25++;
  }
  const n = recent.length;
  return {
    matches: n,
    averageGoalsFor: n ? Number((scored / n).toFixed(2)) : 0,
    averageGoalsAgainst: n ? Number((conceded / n).toFixed(2)) : 0,
    bttsRate: n ? Number((btts / n).toFixed(3)) : 0,
    over15Rate: n ? Number((over15 / n).toFixed(3)) : 0,
    over25Rate: n ? Number((over25 / n).toFixed(3)) : 0,
    // API Ninjas documents half-by-half scores as premium-only live data.
    firstHalfOver05Rate: null,
    secondHalfOver05Rate: null,
  };
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.API_NINJAS_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API Ninjas is not configured on the server." }, { status: 503 });
  }
  const params = request.nextUrl.searchParams;
  const fixtureId = Number(params.get("fixture"));
  const homeName = params.get("homeName")?.trim() ?? "";
  const awayName = params.get("awayName")?.trim() ?? "";
  const league = params.get("league")?.trim().toLowerCase() ?? "";
  if (!Number.isSafeInteger(fixtureId) || fixtureId <= 0 || !homeName || !awayName || homeName.length > 100 || awayName.length > 100 || !supportedLeagues.has(league)) {
    return NextResponse.json({ error: "This competition is not supported by the current match-data provider, or the fixture details are invalid." }, { status: 400 });
  }
  try {
    const [homeMatches, awayMatches] = await Promise.all([
      getTeamMatches(homeName, league, apiKey),
      getTeamMatches(awayName, league, apiKey),
    ]);
    const home = summarize(homeMatches, homeName);
    const away = summarize(awayMatches, awayName);
    if (!home.matches || !away.matches) {
      return NextResponse.json({ error: "The provider returned no completed current-season matches for one or both teams in this competition. No form statistics were generated." }, { status: 404 });
    }
    const awayGameIds = new Set(awayMatches.map((m) => m.game_id));
    const h2h = homeMatches
      .filter((m) => awayGameIds.has(m.game_id) && completed.has(m.status) &&
        Number.isFinite(m.home_score) && Number.isFinite(m.away_score))
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
      .slice(0, 10)
      .map((m) => ({
        fixtureId: m.game_id,
        date: m.date,
        home: m.home_team.name,
        away: m.away_team.name,
        score: [m.home_score, m.away_score] as [number, number],
        competition: m.league ?? "Unknown competition",
      }));
    return NextResponse.json({
      fixtureId,
      formSource: "API Ninjas current-season completed match results",
      sampleSizes: { homeRecent: home.matches, awayRecent: away.matches, headToHead: h2h.length },
      home,
      away,
      headToHead: h2h,
      limitations: [
        "Team form uses the latest completed matches returned for the current season.",
        "API Ninjas free access does not provide half-by-half scores, so first-half and second-half rates are unavailable.",
        "Only competitions and teams covered by API Ninjas can be analysed.",
        "These are observed historical rates, not calibrated probabilities or guaranteed predictions.",
      ],
    }, { headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=300" } });
  } catch (error) {
    console.error("[GOALPRO analysis] Analysis failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Recent match analysis is unavailable.",
    }, { status: 502 });
  }
}
