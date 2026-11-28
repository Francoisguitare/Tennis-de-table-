const path = require('path');
for (const f of ['data.js', 'map.js', 'path.js', 'sim.js', 'ai.js']) require(path.join(__dirname, '..', 'js', f));
const R = globalThis.R, U = R.UNITS;
const seed = +(process.argv[2] || 1), minutes = +(process.argv[3] || 20);
const g = new R.Game({ seed, players: [{ name: 'A', color: 0, ai: 'normal' }, { name: 'B', color: 1, ai: 'difficile' }], size: 'normale', mapType: 'plaine', startRes: 'standard', popCap: 200, speed: 1.7 });
const msgs = [];
for (let i = 0; i < minutes * 600; i++) {
  g.step();
  for (const e of g.ev) if (e.k === 'msg' || e.k === 'age') msgs.push(Math.round(g.time) + ' ' + JSON.stringify(e));
  g.ev.length = 0;
  if (i % 1200 === 0) {
    for (const p of g.players) {
      const st = {}, cm = {}, rt = {};
      let n = 0;
      for (const e of g.list) if (!e.dead && e.o === p.id && e.t === 'villager') {
        n++; st[e.st] = (st[e.st] || 0) + 1; const k = e.cmd ? e.cmd.k : 'none'; cm[k] = (cm[k] || 0) + 1;
        if (e.cmd && e.cmd.rt) rt[e.cmd.rt] = (rt[e.cmd.rt] || 0) + 1;
      }
      const tc = g.list.find(e => !e.dead && e.k === 'b' && e.t === 'tc' && e.o === p.id);
      console.log(`t=${Math.round(g.time)} ${p.name} age${p.age} v=${n} pop=${p.pop}/${p.popCap} res=${Object.values(p.res).map(Math.floor).join('/')} st=${JSON.stringify(st)} cmd=${JSON.stringify(cm)} rt=${JSON.stringify(rt)} tcq=${tc ? tc.q.map(q => q.t + (q.housed ? 'H' : '')).join(',') : '-'} busy=${Object.keys(p.busy)}`);
    }
  }
}
console.log(msgs.slice(0, 40).join('\n'));
