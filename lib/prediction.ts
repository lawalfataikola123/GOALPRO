export type GoalInputs = {
  homeFull: number;
  awayFull: number;
  homeFirst: number;
  awayFirst: number;
  homeSecond: number;
  awaySecond: number;
};

type Market = { label: string; probability: number };

function poissonAtMost(lambda: number, maxGoals: number): number {
  if (lambda < 0 || !Number.isFinite(lambda)) return 0;
  let probability = Math.exp(-lambda);
  let cumulative = probability;
  for (let goals = 1; goals <= maxGoals; goals += 1) {
    probability *= lambda / goals;
    cumulative += probability;
  }
  return Math.min(1, Math.max(0, cumulative));
}

function over(lambda: number, line: number): number {
  return 1 - poissonAtMost(lambda, line);
}

function btts(homeLambda: number, awayLambda: number): number {
  return (1 - Math.exp(-homeLambda)) * (1 - Math.exp(-awayLambda));
}

export function calculateMarkets(input: GoalInputs): Record<string, Market> {
  const full = input.homeFull + input.awayFull;
  const first = input.homeFirst + input.awayFirst;
  const second = input.homeSecond + input.awaySecond;
  const make = (label: string, probability: number): Market => ({ label, probability: Math.min(1, Math.max(0, probability)) });

  return {
    btts: make('BTTS / GG', btts(input.homeFull, input.awayFull)),
    over15: make('Over 1.5 goals', over(full, 1)),
    over25: make('Over 2.5 goals', over(full, 2)),
    over35: make('Over 3.5 goals', over(full, 3)),
    under15: make('Under 1.5 goals', poissonAtMost(full, 1)),
    under25: make('Under 2.5 goals', poissonAtMost(full, 2)),
    firstBtts: make('First-half BTTS', btts(input.homeFirst, input.awayFirst)),
    firstOver05: make('First-half Over 0.5', over(first, 0)),
    firstOver15: make('First-half Over 1.5', over(first, 1)),
    firstUnder05: make('First-half Under 0.5', poissonAtMost(first, 0)),
    secondBtts: make('Second-half BTTS', btts(input.homeSecond, input.awaySecond)),
    secondOver05: make('Second-half Over 0.5', over(second, 0)),
    secondOver15: make('Second-half Over 1.5', over(second, 1)),
    secondUnder05: make('Second-half Under 0.5', poissonAtMost(second, 0)),
  };
}
