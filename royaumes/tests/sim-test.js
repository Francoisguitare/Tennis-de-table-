// Test headless : parties IA contre IA, vérifie l'absence d'erreurs et la progression.
const path = require('path');
const dir = path.join(__dirname, '..', 'js');
for (const f of ['data.js', 'map.js', 'path.js', 'sim.js', 'ai.js']) require(path.join(dir, f));
const R = globalThis.R;
const U = R.UNITS, B = R.BLDS;

function run(opts, minutes) {
  const errs = [];
  const oe = console.error; console.error = (...a) => { errs.push(a.map(String).join(' ')); };
  const g = new R.Game(opts);
  const ticks = Math.round(minutes * 60 / R.TICK);
  let t0 = Date.now(), worst = 0;
  for (let i = 0; i < ticks; i++) {
    const a = Date.now();
    g.step(); g.ev.length = 0;
    worst = Math.max(worst, Date.now() - a);
    if (g.winner) break;
    if (i % 50 === 0) {
      for (const e of g.list) {
        if (e.dead) continue;
        if (!isFinite(e.x) || !isFinite(e.y) || !isFinite(e.hp)) errs.push('NaN ent ' + e.id + ' ' + e.t);
        if (e.k === 'u' && !e.inside) {
          const tx = Math.floor(e.x), ty = Math.floor(e.y);
          if (tx < 0 || ty < 0 || tx >= g.N || ty >= g.N) errs.push('hors carte ' + e.t);
        }
      }
      for (const p of g.players) for (const k of R.RES) if (!isFinite(p.res[k]) || p.res[k] < -0.5) errs.push('res ' + p.name + ' ' + k + ' ' + p.res[k]);
    }
  }
  console.error = oe;
  const ms = Date.now() - t0;
  const sum = g.players.map(p => {
    const c = {}; let mil = 0;
    for (const e of g.list) if (!e.dead && e.o === p.id) { c[e.t] = (c[e.t] || 0) + 1; if (e.k === 'u' && e.t !== 'villager' && !U[e.t].animal) mil++; }
    return `${p.name}[${p.ai}] age=${p.age} pop=${p.pop}/${p.popCap} vill=${c.villager || 0} mil=${mil} res=${Object.values(p.res).map(Math.floor).join('/')} techs=${Object.keys(p.techs).length} alive=${p.alive} k=${p.stats.kills} bld=${Object.keys(c).filter(t => B[t]).map(t => t + ':' + c[t]).join(',')}`;
  });
  return { g, errs, ms, worst, sum, ticks: g.tick };
}

const seeds = (process.argv[2] || '1,2,3').split(',').map(Number);
const minutes = +(process.argv[3] || 30);
const nP = +(process.argv[4] || 2);
let bad = 0;
for (const seed of seeds) {
  const players = [];
  const lv = ['normal', 'difficile', 'facile', 'normal', 'difficile', 'facile'];
  for (let i = 0; i < nP; i++) players.push({ name: 'IA' + (i + 1), color: i, team: 0, ai: lv[i] });
  const r = run({ seed, players, size: 'normale', mapType: ['plaine', 'foret', 'lacs'][seed % 3], startRes: 'standard', popCap: 200, speed: 1.7 }, minutes);
  console.log(`seed ${seed}: ${r.ticks} ticks en ${r.ms} ms (pire tick ${r.worst} ms) gagnant=${r.g.winner ? JSON.stringify(r.g.winner) : '-'} t=${Math.round(r.g.time)}s`);
  for (const s of r.sum) console.log('  ' + s);
  if (r.errs.length) { bad++; console.log('  ERREURS:', [...new Set(r.errs)].slice(0, 10).join('\n   ')); }
}
process.exit(bad ? 1 : 0);
