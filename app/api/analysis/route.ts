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
type FootballDataTeam = { id: number; name: string; shortName?: string; tla?: string };
type FootballDataMatch = {
  id: number;
  utcDate: string;
  status: string;
  competition?: { name?: string; code?: string };
  homeTeam: FootballDataTeam;
  awayTeam: FootballDataTeam;
  score: { fullTime: { home: number | null; away: number | null }; halfTime: { home: number | null; away: number | null } };
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

const footballDataCompetitions = new Set(["CL", "PL", "PD", "BL1", "SA", "FL1", "DED", "ELC", "PPL"]);

async function getFootballDataMatches(competition: string, apiKey: string): Promise<FootballDataMatch[]> {
  const url = new URL(`https://api.football-data.org/v4/competitions/${competition}/matches`);
  url.searchParams.set("status", "FINISHED");
  const response = await fetch(url, {
    headers: { "X-Auth-Token": apiKey },
    next: { revalidate: 900 },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(payload?.matches)) {
    console.error("[GOALPRO analysis] football-data.org request failed", {
      status: response.status,
      error: payload?.message ?? payload?.error ?? "Unexpected response",
      competition,
    });
    if (response.status === 401) throw new Error("football-data.org rejected FOOTBALL_DATA_API_KEY. Check the key in Vercel.");
    if (response.status === 403) throw new Error("football-data.org does not allow this competition on the current API plan.");
    if (response.status === 429) throw new Error("football-data.org request limit reached. Try again shortly.");
    throw new Error("football-data.org could not return completed matches for this competition.");
  }
  return payload.matches as FootballDataMatch[];
}

function normalizeFootballDataName(value: string): string {
  return value.normalize("NFD").replace(/\\p{Diacritic}/gu, "").toLowerCase()
    .replace(/\\b(fc|cf|afc|sc|club|football|soccer)\\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\\s+/g, " ");
}

function footballDataTeamNames(team: FootballDataTeam): string[] {
  return [team.name, team.shortName ?? "", team.tla ?? ""].filter(Boolean);
}

function resolveFootballDataTeam(matches: FootballDataMatch[], requestedName: string): string | null {
  const requested = normalizeFootballDataName(requestedName);
  const teams = new Map<string, string[]>();
  for (const match of matches) {
    for (const team of [match.homeTeam, match.awayTeam]) {
      const key = String(team.id);
      teams.set(key, footballDataTeamNames(team));
    }
  }
  const entries = [...teams.entries()].map(([id, names]) => ({ id, names, normalized: names.map(normalizeFootballDataName) }));
  const exact = entries.filter((entry) => entry.normalized.includes(requested));
  if (exact.length === 1) return exact[0].id;
  const requestedTokens = new Set(requested.split(" "));
  const partial = entries.filter((entry) => entry.normalized.some((name) => {
    const tokens = new Set(name.split(" "));
    return tokens.size > 0 && [...tokens].every((token) => requestedTokens.has(token));
  }));
  return partial.length === 1 ? partial[0].id : null;
}

function summarizeFootballData(matches: FootballDataMatch[], teamId: string): TeamSummary {
  const recent = matches.filter((match) =>
    String(match.homeTeam.id) === teamId || String(match.awayTeam.id) === teamId
  ).sort((a, b) => Date.parse(b.utcDate) - Date.parse(a.utcDate)).slice(0, 10);
  let scored = 0, conceded = 0, btts = 0, over15 = 0, over25 = 0;
  let firstHalfOver05 = 0, secondHalfOver05 = 0, halfSamples = 0;
  for (const match of recent) {
    const home = String(match.homeTeam.id) === teamId;
    const gf = home ? match.score.fullTime.home : match.score.fullTime.away;
    const ga = home ? match.score.fullTime.away : match.score.fullTime.home;
    if (gf === null || ga === null) continue;
    scored += gf; conceded += ga;
    if (gf > 0 && ga > 0) btts++;
    if (gf + ga > 1) over15++;
    if (gf + ga > 2) over25++;
    const htHome = match.score.halfTime.home, htAway = match.score.halfTime.away;
    if (htHome !== null && htAway !== null) {
      const firstHalfGoals = htHome + htAway;
      const secondHalfGoals = gf + ga - firstHalfGoals;
      if (firstHalfGoals > 0) firstHalfOver05++;
      if (secondHalfGoals > 0) secondHalfOver05++;
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

function resolveAnySportTeamName(matches: AnySportMatch[], requestedName: string): string | null {
  const requested = normalizeAnySportTeamName(requestedName);
  if (!requested) return null;
  const names = [...new Set(matches.flatMap((match) => [match.home.name, match.away.name]))];
  const normalizedNames = names.map((name) => ({ name, normalized: normalizeAnySportTeamName(name) }));
  const exact = normalizedNames.filter((entry) => entry.normalized === requested);
  if (exact.length === 1) return exact[0].name;

  // Accept a shorter provider name only when its tokens identify one unique team.
  const requestedTokens = new Set(requested.split(" "));
  const candidates = normalizedNames.filter((entry) => {
    const tokens = new Set(entry.normalized.split(" "));
    return tokens.size > 0 && tokens.size < requestedTokens.size &&
      [...tokens].every((token) => requestedTokens.has(token));
  });
  return candidates.length === 1 ? candidates[0].name : null;
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

  const footballDataCompetition = params.get("footballDataCompetition")?.trim().toUpperCase() ?? "";
  if (footballDataCompetition) {
    if (!footballDataCompetitions.has(footballDataCompetition)) {
      return NextResponse.json({ error: "This competition is not supported by football-data.org on the configured GOALPRO provider map." }, { status: 400 });
    }
    const apiKey = process.env.FOOTBALL_DATA_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "football-data.org is not configured. Add FOOTBALL_DATA_API_KEY in Vercel." }, { status: 503 });
    try {
      const matches = await getFootballDataMatches(footballDataCompetition, apiKey);
      const homeId = resolveFootballDataTeam(matches, homeName);
      const awayId = resolveFootballDataTeam(matches, awayName);
      const home = homeId ? summarizeFootballData(matches, homeId) : summarizeFootballData([], "");
      const away = awayId ? summarizeFootballData(matches, awayId) : summarizeFootballData([], "");
      if (!home.matches || !away.matches) {
        const returnedTeams = [...new Map(matches.flatMap((match) => [match.homeTeam, match.awayTeam]).map((team) => [team.id, team.name])).values()].sort();
        return NextResponse.json({
          error: "football-data.org returned completed competition matches, but could not find recent form for both fixture teams. No statistics were generated.",
          diagnostics: { returnedMatches: matches.length, resolvedTeams: { home: homeId, away: awayId }, matchedCounts: { home: home.matches, away: away.matches }, returnedTeams: returnedTeams.slice(0, 50) },
        }, { status: 404 });
      }
      const h2h = matches.filter((match) =>
        [String(match.homeTeam.id), String(match.awayTeam.id)].includes(homeId!) &&
        [String(match.homeTeam.id), String(match.awayTeam.id)].includes(awayId!)
      ).sort((a, b) => Date.parse(b.utcDate) - Date.parse(a.utcDate)).slice(0, 10).map((match) => ({
        fixtureId: match.id,
        date: match.utcDate,
        home: match.homeTeam.shortName ?? match.homeTeam.name,
        away: match.awayTeam.shortName ?? match.awayTeam.name,
        score: [match.score.fullTime.home ?? 0, match.score.fullTime.away ?? 0] as [number, number],
        competition: match.competition?.name ?? footballDataCompetition,
      }));
      return NextResponse.json({
        fixtureId,
        formSource: "football-data.org completed current-season competition results",
        sampleSizes: { homeRecent: home.matches, awayRecent: away.matches, headToHead: h2h.length },
        home, away, headToHead: h2h,
        limitations: [
          "Team form uses up to the latest 10 completed matches returned for the current competition season.",
          "Half-specific rates use published half-time scores; unavailable half-time data is excluded from those rates.",
          "Only competitions covered by football-data.org and enabled on the API plan can be analysed.",
          "These are observed historical rates, not calibrated probabilities or guaranteed predictions.",
        ],
      }, { headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=300" } });
    } catch (error) {
      console.error("[GOALPRO analysis] football-data.org analysis failed", { message: error instanceof Error ? error.message : "Unknown error" });
      return NextResponse.json({ error: error instanceof Error ? error.message : "football-data.org analysis is unavailable." }, { status: 502 });
    }
  }

  if (anySportLeagueId) {
    if (!/^asl_[a-f0-9]{32}$/.test(anySportLeagueId)) {
      return NextResponse.json({ error: "The AnySport competition identifier is invalid." }, { status: 400 });
    }
    const apiKey = process.env.ANYSPORT_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "AnySport is not configured on the server. Add ANYSPORT_API_KEY in Vercel." }, { status: 503 });
    try {
      const matches = await getAnySportLeagueMatches(anySportLeagueId, apiKey);
      const resolvedHomeName = resolveAnySportTeamName(matches, homeName);
      const resolvedAwayName = resolveAnySportTeamName(matches, awayName);
      const home = resolvedHomeName ? summarizeAnySport(matches, resolvedHomeName) : summarizeAnySport([], homeName);
      const away = resolvedAwayName ? summarizeAnySport(matches, resolvedAwayName) : summarizeAnySport([], awayName);
      const statusCounts = matches.reduce<Record<string, number>>((counts, match) => {
        const status = String(match.status ?? "missing");
        counts[status] = (counts[status] ?? 0) + 1;
        return counts;
      }, {});
      const teamMatchSamples = matches
        .filter((match) => [resolvedHomeName, resolvedAwayName].filter(Boolean).some((name) =>
          normalizeAnySportTeamName(match.home.name) === normalizeAnySportTeamName(name!) ||
          normalizeAnySportTeamName(match.away.name) === normalizeAnySportTeamName(name!)
        ))
        .slice(0, 8)
        .map((match) => ({ date: match.date, status: match.status, home: match.home.name, away: match.away.name, ftScore: match.ft_score ?? null, htScore: match.ht_score ?? null }));
      if (!home.matches || !away.matches) {
        const availableTeams = [...new Set(matches.flatMap((m) => [m.home.name, m.away.name]))].sort();
        console.warn("[GOALPRO analysis] AnySport team-name diagnostic", {
          leagueId: anySportLeagueId,
          returnedMatches: matches.length,
          statusCounts,
          teamMatchSamples,
          requestedTeams: [homeName, awayName],
          resolvedTeams: { home: resolvedHomeName, away: resolvedAwayName },
          matchedCounts: { home: home.matches, away: away.matches },
          returnedTeams: availableTeams.slice(0, 40),
        });
        return NextResponse.json({
          error: `AnySport returned no completed Liga de Ascenso matches for one or both teams in the last 90 days. No form statistics were generated. Returned team names: ${availableTeams.slice(0, 20).join(", ") || "none"}.`,
          diagnostics: {
            returnedMatches: matches.length,
            statusCounts,
            teamMatchSamples,
            matchedCounts: { home: home.matches, away: away.matches },
            resolvedTeams: { home: resolvedHomeName, away: resolvedAwayName },
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
