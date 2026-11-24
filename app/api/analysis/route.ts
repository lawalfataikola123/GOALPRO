import { NextRequest, NextResponse } from "next/server";

const API_BASE = "https://api.api-ninjas.com/v1/soccermatches";
const ANYSPORT_BASE = "https://data.anysport.io/v1/soccer";
const completed = new Set(["final"]);
const anySportCompleted = new Set(["FT", "AET", "Pen."]);
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
type AnySportMatch = {
  match_id: string;
  date: string;
  status: string;
  league?: string;
  home: { name: string };
  away: { name: string };
  ht_score?: string;
  ft_score?: string;
};
type TeamSummary = {
  matches: number;
  averageGoalsFor: number;
  averageGoalsAgainst: number;
  bttsRate: number;
  over15Rate: number;
  over25Rate: number;
  firstHalfOver05Rate: number | null;
  secondHalfOver05Rate: number | null;
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

function parseScore(value?: string): [number, number] | null {
  if (!value || !/^\d+\s*-\s*\d+$/.test(value.trim())) return null;
  const [home, away] = value.split("-").map((part) => Number(part.trim()));
  return Number.isFinite(home) && Number.isFinite(away) ? [home, away] : null;
}

async function getAnySportLeagueMatches(leagueId: string, apiKey: string): Promise<AnySportMatch[]> {
  const all: AnySportMatch[] = [];
  for (let page = 1; page <= 3; page++) {
    const url = new URL(`${ANYSPORT_BASE}/matches/window`);
    url.searchParams.set("from_days", "-90");
    url.searchParams.set("to_days", "0");
    url.searchParams.set("league_id", leagueId);
    url.searchParams.set("limit", "100");
    url.searchParams.set("page", String(page));
    url.searchParams.set("lang", "en");
    const response = await fetch(url, {
      headers: { apikey: apiKey },
      next: { revalidate: 900 },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.success !== true || !Array.isArray(payload.data)) {
      console.error("[GOALPRO analysis] AnySport request failed", {
        status: response.status,
        code: payload?.error?.code ?? null,
        message: payload?.error?.message ?? null,
      });
      if (response.status === 401) throw new Error("AnySport rejected the API key. Check ANYSPORT_API_KEY in Vercel.");
      if (response.status === 403) throw new Error("AnySport does not allow this endpoint on the current plan.");
      if (response.status === 429) throw new Error("AnySport request limit reached. Try again later.");
      throw new Error("AnySport could not return Costa Rica Liga de Ascenso match data.");
    }
    all.push(...payload.data as AnySportMatch[]);
    const totalPages = Number(payload.meta?.total_pages ?? page);
    if (page >= totalPages || payload.data.length === 0) break;
  }
  return all;
}

function summarizeNinjas(matches: Match[], teamName: string): TeamSummary {
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
    scored += gf; conceded += ga;
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
    firstHalfOver05Rate: null,
    secondHalfOver05Rate: null,
  };
}

function normalizeAnySportTeamName(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\b(adr|fc|cf|afc|sc|sercoba)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function summarizeAnySport(matches: AnySportMatch[], teamName: string): TeamSummary {
  const normalized = normalizeAnySportTeamName(teamName);
  const recent = matches
    .filter((m) => anySportCompleted.has(m.status) && parseScore(m.ft_score))
    .filter((m) => normalizeAnySportTeamName(m.home.name) === normalized || normalizeAnySportTeamName(m.away.name) === normalized)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, 10);
  let scored = 0, conceded = 0, btts = 0, over15 = 0, over25 = 0, firstHalfOver05 = 0, secondHalfOver05 = 0, halfSamples = 0;
  for (const match of recent) {
    const score = parseScore(match.ft_score)!;
    const isHome = normalizeAnySportTeamName(match.home.name) === normalized;
    const gf = isHome ? score[0] : score[1];
    const ga = isHome ? score[1] : score[0];
    scored += gf; conceded += ga;
    if (gf > 0 && ga > 0) btts++;
    if (score[0] + score[1] > 1) over15++;
    if (score[0] + score[1] > 2) over25++;
    const half = parseScore(match.ht_score);
    if (half) {
      const secondHome = score[0] - half[0];
      const secondAway = score[1] - half[1];
      if (half[0] + half[1] > 0) firstHalfOver05++;
      if (secondHome + secondAway > 0) secondHalfOver05++;
      halfSamples++;
    }
  }
  const n = recent.length;
  return {
    matches: n,
    averageGoalsFor: n ? Number((scored / n).toFixed(2)) : 0,
    averageGoalsAgainst: n ? Number((conceded / n).toFixed(2)) : 0,
    bttsRate: n ? Number((btts / n).toFixed(3)) : 0,
    over15Rate: n ? Number((over15 / n).toFixed(3)) : 0,
    over25Rate: n ? Number((over25 / n).toFixed(3)) : 0,
    firstHalfOver05Rate: halfSamples ? Number((firstHalfOver05 / halfSamples).toFixed(3)) : null,
    secondHalfOver05Rate: halfSamples ? Number((secondHalfOver05 / halfSamples).toFixed(3)) : null,
  };
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const fixtureId = Number(params.get("fixture"));
  const homeName = params.get("homeName")?.trim() ?? "";
  const awayName = params.get("awayName")?.trim() ?? "";
  const anySportLeagueId = params.get("anysportLeagueId")?.trim() ?? "";
  const league = params.get("league")?.trim().toLowerCase() ?? "";
  if (!Number.isSafeInteger(fixtureId) || fixtureId <= 0 || !homeName || !awayName || homeName.length > 100 || awayName.length > 100) {
    return NextResponse.json({ error: "The fixture details are invalid." }, { status: 400 });
  }

  if (anySportLeagueId) {
    if (!/^asl_[a-f0-9]{32}$/.test(anySportLeagueId)) {
      return NextResponse.json({ error: "The AnySport competition identifier is invalid." }, { status: 400 });
    }
    const apiKey = process.env.ANYSPORT_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "AnySport is not configured on the server. Add ANYSPORT_API_KEY in Vercel." }, { status: 503 });
    try {
      const matches = await getAnySportLeagueMatches(anySportLeagueId, apiKey);
      const home = summarizeAnySport(matches, homeName);
      const away = summarizeAnySport(matches, awayName);
      if (!home.matches || !away.matches) {
        const availableTeams = [...new Set(matches.flatMap((m) => [m.home.name, m.away.name]))].sort();
        console.warn("[GOALPRO analysis] AnySport team-name diagnostic", {
          leagueId: anySportLeagueId,
          returnedMatches: matches.length,
          requestedTeams: [homeName, awayName],
          matchedCounts: { home: home.matches, away: away.matches },
          returnedTeams: availableTeams.slice(0, 40),
        });
        return NextResponse.json({
          error: `AnySport returned no completed Liga de Ascenso matches for one or both teams in the last 90 days. No form statistics were generated. Returned team names: ${availableTeams.slice(0, 20).join(", ") || "none"}.`,
          diagnostics: {
            returnedMatches: matches.length,
            matchedCounts: { home: home.matches, away: away.matches },
            returnedTeams: availableTeams.slice(0, 40),
          },
        }, { status: 404 });
      }
      const h2h = matches
        .filter((m) => anySportCompleted.has(m.status) && parseScore(m.ft_score))
        .filter((m) => {
          const pair = [normalizeAnySportTeamName(m.home.name), normalizeAnySportTeamName(m.away.name)];
          return pair.includes(normalizeAnySportTeamName(homeName)) && pair.includes(normalizeAnySportTeamName(awayName));
        })
        .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
        .slice(0, 10)
        .map((m) => ({
          fixtureId: m.match_id,
          date: m.date,
          home: m.home.name,
          away: m.away.name,
          score: parseScore(m.ft_score)!,
          competition: m.league ?? "Costa Rica Liga de Ascenso",
        }));
      return NextResponse.json({
        fixtureId,
        formSource: "AnySport Costa Rica Liga de Ascenso results (last 90 days)",
        sampleSizes: { homeRecent: home.matches, awayRecent: away.matches, headToHead: h2h.length },
        home, away, headToHead: h2h,
        limitations: [
          "Recent form is limited to completed matches returned in the last 90 days, with up to 10 matches per team.",
          "First-half and second-half over 0.5 rates use matches with a published half-time score.",
          "These are observed historical rates, not calibrated probabilities or guaranteed predictions."
        ],
      }, { headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=300" } });
    } catch (error) {
      console.error("[GOALPRO analysis] AnySport analysis failed", { message: error instanceof Error ? error.message : "Unknown error" });
      return NextResponse.json({ error: error instanceof Error ? error.message : "AnySport analysis is unavailable." }, { status: 502 });
    }
  }

  const apiKey = process.env.API_NINJAS_KEY;
  if (!apiKey) return NextResponse.json({ error: "API Ninjas is not configured on the server." }, { status: 503 });
  if (!supportedLeagues.has(league)) {
    return NextResponse.json({ error: "This competition is not supported by the current match-data provider." }, { status: 400 });
  }
  try {
    const [homeMatches, awayMatches] = await Promise.all([
      getTeamMatches(homeName, league, apiKey),
      getTeamMatches(awayName, league, apiKey),
    ]);
    const home = summarizeNinjas(homeMatches, homeName);
    const away = summarizeNinjas(awayMatches, awayName);
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
        fixtureId: m.game_id, date: m.date, home: m.home_team.name, away: m.away_team.name,
        score: [m.home_score, m.away_score] as [number, number], competition: m.league ?? "Unknown competition",
      }));
    return NextResponse.json({
      fixtureId, formSource: "API Ninjas current-season completed match results",
      sampleSizes: { homeRecent: home.matches, awayRecent: away.matches, headToHead: h2h.length },
      home, away, headToHead: h2h,
      limitations: [
        "Team form uses the latest completed matches returned for the current season.",
        "API Ninjas free access does not provide half-by-half scores, so first-half and second-half rates are unavailable.",
        "Only competitions and teams covered by API Ninjas can be analysed.",
        "These are observed historical rates, not calibrated probabilities or guaranteed predictions.",
      ],
    }, { headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=300" } });
  } catch (error) {
    console.error("[GOALPRO analysis] Analysis failed", { message: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Recent match analysis is unavailable." }, { status: 502 });
  }
}
