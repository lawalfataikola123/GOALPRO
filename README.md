# GOALPRO ⚽

AI-assisted football goals analysis focused on BTTS/GG, Over/Under goals, and first-half/second-half markets.

> **Current stage: foundation MVP.** The repository starts with a responsive goals-probability workbench. Live fixtures, historical H2H data, and AI-generated match reports are not connected yet. The app intentionally does not invent fixtures or statistics.

## Product scope

- Full-time: BTTS/GG, Over 0.5/1.5/2.5/3.5, Under 1.5/2.5/3.5.
- First half: BTTS, Over 0.5/1.5, Under 0.5/1.5.
- Second half: BTTS, Over 0.5/1.5, Under 0.5/1.5.
- Match analysis: H2H, last 5–10 results, home/away splits, xG/xGA, goal timing, and match context when sourced.
- Prediction tracking: immutable pre-kickoff snapshots and post-match settlement.

## Run locally

Requirements: Node.js 20.9+.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Current MVP

The Goals Workbench lets a user enter expected full-time, first-half, and second-half scoring rates. It calculates Poisson-based probabilities for selected goal markets. The starting values are illustrative assumptions, not live match data or recommendations.

## Planned architecture

- **Web client:** Next.js App Router, TypeScript, responsive UI.
- **Prediction core:** deterministic probability calculations, independently modelled halves, calibration layer to be added.
- **Data adapters:** fixtures, results, H2H, team form, xG and event timing from a licensed football data provider.
- **AI analysis:** grounded explanations generated only from retrieved and calculated data; no invented facts.
- **Persistence:** database-backed fixtures, source snapshots, model versions, predictions and settlements.
- **Timezone:** Africa/Lagos for display; store timestamps in UTC.

## Environment variables (future integrations)

Never commit secrets. Add server-side variables through your hosting provider:

- `FOOTBALL_API_BASE_URL`
- `FOOTBALL_API_KEY`
- `AI_API_BASE_URL`
- `AI_API_KEY`
- `AI_MODEL`
- `DATABASE_URL`

The data-provider adapter and AI route must validate responses and show source timestamps. Do not expose keys to browser code.

## Prediction integrity

- Probabilities are estimates, not guarantees.
- Do not create synthetic fixtures, H2H records, xG values or results and present them as real.
- Record model version, source snapshot and prediction timestamp before kickoff.
- Never rewrite a historical prediction after a match finishes.
- Report accuracy with sample size and market-level breakdowns.

## Development status

See [docs/ROADMAP.md](docs/ROADMAP.md) and [docs/MODEL.md](docs/MODEL.md).