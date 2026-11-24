# Prediction model notes

## Probability layer in the starter MVP

The current workbench accepts expected goal rates (lambda) for each team:
- Full-time home and away.
- First-half home and away.
- Second-half home and away.

For a Poisson variable with rate λ, the probability of at most k goals is:

`P(X <= k) = exp(-λ) * sum(λ^i / i!, i=0..k)`

The total-goals model uses the sum of the two teams' rates. BTTS is calculated as:

`P(BTTS) = (1 - exp(-λ_home)) * (1 - exp(-λ_away))`

First-half and second-half calculations use their own input rates. This avoids deriving a half prediction by subtracting one score from another.

## Limitations

- The independent Poisson assumption is a baseline, not a finished football model.
- The workbench rates are user-entered examples, not automatically estimated from real fixtures.
- No H2H, xG, injuries, lineups, odds or live data are currently connected.
- The current UI does not claim calibrated confidence or recommend a bet.

## Production model requirements

Estimate rates from sourced data with league-level shrinkage, opponent strength, home advantage and recency weighting. Validate out of sample using time-ordered splits. Evaluate Brier score, log loss, calibration curves and market-level accuracy. Compare against simple league-average baselines. Track sample size and model version. Treat first-half and second-half distributions as separate targets.
