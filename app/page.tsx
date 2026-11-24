'use client';

import { useMemo, useState } from 'react';
import { calculateMarkets, type GoalInputs } from '@/lib/prediction';

const initial: GoalInputs = {
  homeFull: 1.35,
  awayFull: 1.1,
  homeFirst: 0.55,
  awayFirst: 0.45,
  homeSecond: 0.8,
  awaySecond: 0.65,
};

const marketGroups = [
  { title: 'Full-time markets', keys: ['btts', 'over15', 'over25', 'over35', 'under15', 'under25'] },
  { title: 'First-half markets', keys: ['firstBtts', 'firstOver05', 'firstOver15', 'firstUnder05'] },
  { title: 'Second-half markets', keys: ['secondBtts', 'secondOver05', 'secondOver15', 'secondUnder05'] },
] as const;

export default function Home() {
  const [inputs, setInputs] = useState(initial);
  const markets = useMemo(() => calculateMarkets(inputs), [inputs]);
  const update = (key: keyof GoalInputs, value: string) => {
    const parsed = Number(value);
    setInputs(current => ({ ...current, [key]: Number.isFinite(parsed) ? Math.max(0, Math.min(5, parsed)) : 0 }));
  };

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#top"><span className="brand-mark">G</span><span>GOAL<span className="brand-accent">PRO</span></span></a>
        <nav><a className="nav-active" href="#workbench">Goals workbench</a><a href="#markets">Markets</a><a href="#method">Method</a></nav>
        <span className="status"><i /> MODEL PREVIEW</span>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">FOOTBALL GOALS INTELLIGENCE</p>
          <h1>Read the game.<br /><em>Understand the goals.</em></h1>
          <p className="hero-text">A focused workspace for BTTS, goal totals, and separate first-half and second-half analysis.</p>
          <a className="primary-link" href="#workbench">Open goals workbench <span>↗</span></a>
        </div>
        <div className="hero-panel">
          <div className="panel-top"><span>GOALPRO ENGINE</span><span className="live-dot">● LOCAL CALCULATION</span></div>
          <div className="orb-wrap"><div className="orb"><span>G</span></div><div className="orbit orbit-one"/><div className="orbit orbit-two"/></div>
          <div className="panel-foot"><span>POISSON GOAL MODEL</span><span>v0.1.0</span></div>
        </div>
      </section>

      <section className="section-head" id="workbench">
        <div><p className="eyebrow">01 / PROBABILITY LAB</p><h2>Goals workbench</h2><p className="muted">Adjust expected scoring rates to explore market probabilities.</p></div>
        <span className="demo-tag">ILLUSTRATIVE INPUTS</span>
      </section>

      <section className="workbench-grid">
        <div className="input-card">
          <div className="card-heading"><div><span className="mini-label">MODEL INPUTS</span><h3>Expected goals per team</h3></div><button className="reset" onClick={() => setInputs(initial)}>Reset ↺</button></div>
          <p className="input-note">These starting values are examples only. Replace them with researched match rates before interpreting any output.</p>
          <div className="input-section"><h4>Full-time expected goals</h4><div className="two-inputs"><RateInput label="Home team" value={inputs.homeFull} onChange={v => update('homeFull', v)} /><RateInput label="Away team" value={inputs.awayFull} onChange={v => update('awayFull', v)} /></div></div>
          <div className="input-section"><h4>First-half expected goals</h4><div className="two-inputs"><RateInput label="Home team" value={inputs.homeFirst} onChange={v => update('homeFirst', v)} /><RateInput label="Away team" value={inputs.awayFirst} onChange={v => update('awayFirst', v)} /></div></div>
          <div className="input-section"><h4>Second-half expected goals</h4><div className="two-inputs"><RateInput label="Home team" value={inputs.homeSecond} onChange={v => update('homeSecond', v)} /><RateInput label="Away team" value={inputs.awaySecond} onChange={v => update('awaySecond', v)} /></div></div>
          <div className="formula-note"><span>ƒ</span><p>Each half is modelled independently. Full-time rates are used for full-time markets; half-specific rates power the half-time markets.</p></div>
        </div>

        <div className="results-card" id="markets">
          <div className="card-heading"><div><span className="mini-label">CALCULATED OUTPUT</span><h3>Market probabilities</h3></div><span className="calc-chip">● LIVE CALC</span></div>
          {marketGroups.map(group => <div className="market-group" key={group.title}><h4>{group.title}</h4><div className="market-list">{group.keys.map(key => { const item = markets[key]; return <div className="market-row" key={key}><span>{item.label}</span><strong>{Math.round(item.probability * 100)}<small>%</small></strong><div className="meter"><i style={{ width: `${item.probability * 100}%` }} /></div></div>; })}</div></div>)}
          <p className="disclaimer">Probabilities are mathematical estimates from the entered rates, not verified match predictions or guarantees.</p>
        </div>
      </section>

      <section className="next-section" id="method"><div><p className="eyebrow">02 / WHAT COMES NEXT</p><h2>From raw data to a reasoned prediction.</h2><p className="muted">The next build phase connects real fixtures, H2H records, recent form and an AI analyst that explains its work.</p></div><div className="pipeline"><div><b>01</b><span><strong>Collect</strong><small>Fixtures, results, H2H and team splits</small></span></div><div><b>02</b><span><strong>Model</strong><small>Poisson rates, xG and half-specific trends</small></span></div><div><b>03</b><span><strong>Explain</strong><small>AI report grounded in sourced statistics</small></span></div><div><b>04</b><span><strong>Measure</strong><small>Track every prediction against results</small></span></div></div></section>

      <footer><a className="brand" href="#top"><span className="brand-mark">G</span><span>GOAL<span className="brand-accent">PRO</span></span></a><span>Built for evidence-led football analysis.</span><span>© {new Date().getFullYear()} GOALPRO</span></footer>
    </main>
  );
}

function RateInput({ label, value, onChange }: { label: string; value: number; onChange: (value: string) => void }) {
  return <label className="rate-field"><span>{label}</span><input type="number" min="0" max="5" step="0.05" value={value} onChange={e => onChange(e.target.value)} /></label>;
}
