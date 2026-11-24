# GOALPRO roadmap

## Phase 1 — foundation (in progress)
- [x] Create public GitHub repository.
- [x] Add responsive Next.js + TypeScript shell.
- [x] Add editable Poisson probability workbench.
- [x] Separate full-time, first-half and second-half goal rates.
- [ ] Install dependencies and run typecheck/build.

## Phase 2 — real football data
- [ ] Select a provider based on coverage, cost, rate limits and rights.
- [ ] Build server-only provider adapter for fixtures, results, H2H, team form and xG.
- [ ] Normalize teams, competitions, fixture IDs and kickoff timestamps.
- [ ] Show source attribution and data freshness on every match.
- [ ] Add match search and a real fixtures dashboard; show an honest empty state when no data is returned.

## Phase 3 — prediction engine
- [ ] Estimate team scoring rates from weighted recent form, home/away splits, league baselines and opponent strength.
- [ ] Fit and validate full-time and half-specific goal models.
- [ ] Add calibration and uncertainty/data-quality indicators.
- [ ] Add market-level probability outputs and model versioning.

## Phase 4 — AI match analyst
- [ ] Generate grounded H2H and form summaries from retrieved structured data.
- [ ] Explain each market using supporting and opposing evidence.
- [ ] Cite the data source and observation window in each analysis.
- [ ] Refuse to fill gaps with invented facts.

## Phase 5 — tracking and launch
- [ ] Persist immutable pre-kickoff predictions.
- [ ] Settle markets from verified match results.
- [ ] Report accuracy, sample size and calibration by market.
- [ ] Add authentication, user preferences and notifications.
- [ ] Security, accessibility and production deployment review.
