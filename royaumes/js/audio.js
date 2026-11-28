/* Royaumes — moteur sonore entièrement synthétisé (Web Audio API).
   Aucun fichier audio, aucun accès réseau : chaque son est fabriqué à la volée.
   - R.sfx   : effets (interface, sélection et construction des bâtiments, unités,
               récolte, combat, cloche d'alarme, cor de guerre…).
   - R.audio : musique générative (nappes très douces, jamais en boucle) et ambiance
               de nature (vent, feuillages, eau, oiseaux, grillons) pilotée par la scène.
   Tout est sans effet tant que le contexte audio n'est pas débloqué, et sous Node. */
(function (R) {
  'use strict';

  const W = typeof window !== 'undefined' ? window : null;
  const DOC = typeof document !== 'undefined' ? document : null;
  const AC = W ? (W.AudioContext || W.webkitAudioContext || null) : null;

  // ---------- Petits outils ----------
  const rnd = Math.random;
  const rr = (a, b) => a + rnd() * (b - a);
  const ri = (a, b) => Math.floor(rr(a, b + 1));
  const pick = a => a[Math.floor(rnd() * a.length)];
  const cl = (x, a, b) => (x < a ? a : x > b ? b : x);
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const expRand = mean => -Math.log(1 - rnd() * 0.999) * mean;
  const num = (x, d) => (typeof x === 'number' && isFinite(x) ? x : d);
  function lsGet(k) { try { return W && W.localStorage ? W.localStorage.getItem(k) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { if (W && W.localStorage) W.localStorage.setItem(k, v); } catch (e) { /* stockage indisponible */ } }
  function disc(n) { try { n.disconnect(); } catch (e) { /* déjà déconnecté */ } }

  // ---------- Réglages persistants ----------
  const VOL_DEF = { sfx: 0.7, music: 0.35, amb: 0.45 };
  const vol = {};
  for (const k in VOL_DEF) { const v = parseFloat(lsGet('roy.vol.' + k)); vol[k] = isFinite(v) ? cl(v, 0, 1) : VOL_DEF[k]; }

  const S = { on: lsGet('roy.sfx') !== '0' };   // R.sfx (compatibilité : on, toggle, unlock, play)
  const A = {};                                  // R.audio
  R.sfx = S; R.audio = A;

  // ---------- Contexte et graphe ----------
  let ctx = null, N = null, BUF = null, KSF = 293.66;
  let unlocked = false, started = false, paused = false, timer = null, SESS = null, lastTick = 0;
  let liveSrc = 0;                 // sources actuellement vivantes (diagnostic)
  let sfxAct = [];                 // effets en cours : { k, end, lo }
  let ambAct = [];                 // événements d'ambiance en cours (fins)
  const lastPlay = {};

  function ensure() {
    if (ctx) return ctx;
    if (!AC) return null;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { try { ctx = new AC(); } catch (e2) { return null; } }
    try { build(); } catch (e) { ctx = null; return null; }
    return ctx;
  }

  function gainNode(v) { const g = ctx.createGain(); g.gain.value = v; return g; }

  function build() {
    const c = ctx;
    N = {};
    // Chaîne maître : bus → compresseur doux → limiteur → sortie
    N.master = gainNode(0.85);
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 2.5; comp.attack.value = 0.02; comp.release.value = 0.3;
    const lim = c.createDynamicsCompressor();
    lim.threshold.value = -4; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.12;
    N.master.connect(comp); comp.connect(lim); lim.connect(c.destination);
    N.out = lim;
    // Tampons générés une seule fois
    BUF = makeBuffers();
    // Réverbération algorithmique partagée (réponse impulsionnelle de bruit décroissant)
    N.rev = c.createConvolver(); N.rev.buffer = makeIR(3.4);
    N.revOut = gainNode(0.9); N.rev.connect(N.revOut); N.revOut.connect(N.master);
    // Bus : entrée sèche + entrée réverbérée, chacune avec son atténuateur de volume
    for (const k of ['sfx', 'music', 'amb']) {
      const b = { dry: gainNode(1), wet: gainNode(1), vol: gainNode(busLevel(k)), wvol: gainNode(busLevel(k)) };
      b.dry.connect(b.vol); b.vol.connect(N.master);
      b.wet.connect(b.wvol); b.wvol.connect(N.rev);
      N[k] = b;
    }
  }

  const BUS_G = { sfx: 1.9, music: 3.2, amb: 4.5 };   // étalonnage relatif des bus
  function busLevel(k) {
    let g = vol[k] * vol[k] * BUS_G[k];          // courbe perceptive
    if (k === 'sfx' && !S.on) g = 0;
    if (k !== 'sfx' && paused) g *= 0.25;
    return g;
  }
  function applyVol(k, tc) {
    if (!ctx || !N) return;
    const g = busLevel(k), now = ctx.currentTime;
    for (const p of [N[k].vol.gain, N[k].wvol.gain]) { p.cancelScheduledValues(now); p.setTargetAtTime(g, now, tc || 0.06); }
  }

  // ---------- Tampons : bruits, frottements, corde pincée, réverbe ----------
  function makeBuffers() {
    const sr = ctx.sampleRate;
    const loopBuf = (sec, gen) => {          // tampon bouclable sans couture (fondu enchaîné)
      const n = Math.floor(sr * sec), X = Math.floor(sr * 0.15), tmp = new Float32Array(n + X);
      gen(tmp);
      const b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
      let pk = 0;
      for (let i = 0; i < n; i++) {
        d[i] = i < X ? tmp[i] * (i / X) + tmp[n + i] * (1 - i / X) : tmp[i];
        const a = Math.abs(d[i]); if (a > pk) pk = a;
      }
      const s = 0.9 / (pk || 1); for (let i = 0; i < n; i++) d[i] *= s;
      return b;
    };
    const B = {};
    B.w = loopBuf(2.5, d => { for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1; });
    B.p = loopBuf(4, d => {     // bruit rose (filtre de Kellet)
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < d.length; i++) {
        const w = rnd() * 2 - 1;
        b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = b0 + b1 + b2 + w * 0.1848;
      }
    });
    B.n = loopBuf(4, d => {     // bruit brun (grave, pour le vent et les chocs sourds)
      let x = 0;
      for (let i = 0; i < d.length; i++) { x = (x + 0.02 * (rnd() * 2 - 1)) / 1.02; d[i] = x; }
    });
    // Froissement : grains irréguliers (feuilles, tissu, terre)
    {
      const n = Math.floor(sr * 3), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (rnd() * 2 - 1) * 0.08;
      const grains = Math.floor(n / sr * 260);
      for (let k = 0; k < grains; k++) {
        const p = Math.floor(rnd() * n), len = Math.floor(sr * rr(0.001, 0.006)), a = rr(0.1, 1) * rr(0.2, 1);
        for (let i = 0; i < len && p + i < n; i++) d[p + i] += (rnd() * 2 - 1) * a * (1 - i / len);
      }
      let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(d[i]));
      for (let i = 0; i < n; i++) d[i] *= 0.9 / pk;
      B.r = b;
    }
    // Corde pincée (Karplus-Strong) au ré 4, rejouée à d'autres hauteurs par vitesse de lecture
    {
      const P = Math.round(sr / 293.66), n = Math.floor(sr * 3), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
      KSF = sr / (P + 0.5);
      let lp = 0;
      for (let i = 0; i <= P; i++) { lp += ((rnd() * 2 - 1) - lp) * 0.5; d[i] = lp; }
      for (let i = P + 1; i < n; i++) d[i] = 0.4985 * (d[i - P] + d[i - P - 1]);
      let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(d[i]));
      for (let i = 0; i < n; i++) d[i] *= 0.9 / pk;
      for (let i = 0; i < 64; i++) d[i] *= i / 64;
      B.ks = b;
    }
    return B;
  }

  function makeIR(sec) {
    const sr = ctx.sampleRate, n = Math.floor(sr * sec), b = ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const x = i / n, t = i / sr;
        lp += ((rnd() * 2 - 1) - lp) * (0.6 - 0.52 * x);          // la queue s'assombrit
        d[i] = lp * Math.exp(-t * 6.2 / sec) * (t < 0.015 ? t / 0.015 : 1);
      }
      for (let k = 0; k < 7; k++) {                                // premières réflexions
        const p = Math.floor(sr * rr(0.008, 0.07)); d[p] += rr(-0.5, 0.5);
      }
    }
    return b;
  }

  // ---------- Voix : sortie panoramique + départ réverbe, nettoyage automatique ----------
  function V(dst, g, pan, wet, t) {
    const out = gainNode(g);
    const v = { t: t || ctx.currentTime + 0.006, out, n: 0, nodes: [out], S: dst.S || null };
    let head = out;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = cl(pan, -1, 1); out.connect(p); head = p; v.nodes.push(p);
    }
    head.connect(dst.dry);
    if (wet > 0) { const w = gainNode(wet); head.connect(w); w.connect(dst.wet); v.nodes.push(w); }
    return v;
  }
  function mk(v, n) { v.nodes.push(n); return n; }
  function track(v, s) {
    v.n++; liveSrc++;
    const ss = v.S; if (ss) ss.srcs.add(s);     // sources d'une session musique/ambiance
    s.onended = () => {
      liveSrc--; disc(s); if (ss) ss.srcs.delete(s);
      if (--v.n <= 0) { for (const n of v.nodes) disc(n); v.nodes.length = 0; }
    };
  }
  function env(p, t, a, d, g) {
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(g, t + a);
    p.setTargetAtTime(0, t + a, Math.max(0.003, (d - a) / 5));
  }
  function filt(v, type, f, q) {
    const b = mk(v, ctx.createBiquadFilter()); b.type = type; b.frequency.value = f; b.Q.value = q == null ? 0.7 : q; return b;
  }

  // Oscillateur à enveloppe percussive. o : f, f2 (glissé), fd, at, d, a, g, type, dt, to
  function tone(v, o) {
    const t = v.t + (o.at || 0), d = o.d, a = o.a || 0.004;
    const s = ctx.createOscillator(), e = mk(v, ctx.createGain());
    s.type = o.type || 'sine';
    s.frequency.setValueAtTime(o.f, t);
    if (o.f2) s.frequency.exponentialRampToValueAtTime(o.f2, t + (o.fd || d));
    if (o.dt) s.detune.value = o.dt;
    env(e.gain, t, a, d, o.g);
    s.connect(e); e.connect(o.to || v.out);
    s.start(t); s.stop(t + d + 0.03);
    track(v, s);
    return s;
  }
  // Bruit filtré. o : b (w blanc, p rose, n brun, r froissement), at, d, a, g, ft, f, f2, q, rate, to
  function nz(v, o) {
    const t = v.t + (o.at || 0), d = o.d, a = o.a || 0.002, buf = BUF[o.b || 'w'];
    const s = ctx.createBufferSource(), e = mk(v, ctx.createGain());
    s.buffer = buf;
    const rate = o.rate || 1; if (rate !== 1) s.playbackRate.value = rate;
    let head = s;
    if (o.ft) {
      const f = filt(v, o.ft, o.f, o.q);
      if (o.f2) { f.frequency.setValueAtTime(o.f, t); f.frequency.exponentialRampToValueAtTime(o.f2, t + (o.fd || d)); }
      s.connect(f); head = f;
    }
    env(e.gain, t, a, d, o.g);
    head.connect(e); e.connect(o.to || v.out);
    const need = (d + 0.03) * rate;
    s.start(t, rnd() * Math.max(0, buf.duration - need - 0.01), need);
    track(v, s);
  }
  // Modulation de fréquence. o : f, f2, m (rapport) ou mf (Hz), i (indice) ou dev (Hz), i2/dev2, at, d, a, g, type
  function fm(v, o) {
    const t = v.t + (o.at || 0), d = o.d;
    const c = ctx.createOscillator(), mo = ctx.createOscillator(), mg = mk(v, ctx.createGain()), e = mk(v, ctx.createGain());
    c.type = o.type || 'sine';
    c.frequency.setValueAtTime(o.f, t);
    if (o.f2) c.frequency.exponentialRampToValueAtTime(o.f2, t + d);
    const mf = o.mf || o.f * o.m;
    mo.frequency.setValueAtTime(mf, t);
    if (o.f2 && !o.mf) mo.frequency.exponentialRampToValueAtTime(o.f2 * o.m, t + d);
    const dev = o.dev != null ? o.dev : mf * o.i, dev2 = o.dev2 != null ? o.dev2 : (o.i2 != null ? mf * o.i2 : dev * 0.25);
    mg.gain.setValueAtTime(dev, t); mg.gain.linearRampToValueAtTime(dev2, t + d);
    mo.connect(mg); mg.connect(c.frequency);
    env(e.gain, t, o.a || 0.005, d, o.g);
    c.connect(e); e.connect(o.to || v.out);
    c.start(t); mo.start(t); c.stop(t + d + 0.03); mo.stop(t + d + 0.03);
    track(v, c); track(v, mo);
  }

  // ---------- Briques sonores ----------
  // Cloche : partiels inharmoniques (bourdon, fondamentale, tierce mineure, quinte, nominale…)
  const BELL_P = [[0.5, 0.5, 1.4], [1, 1, 1], [1.19, 0.55, 0.7], [1.5, 0.4, 0.55], [2, 0.45, 0.45], [2.51, 0.18, 0.3], [2.66, 0.15, 0.25], [3.01, 0.1, 0.2]];
  function bell(v, f, at, d, g, np) {
    const n = Math.min(np || BELL_P.length, BELL_P.length);
    for (let i = 0; i < n; i++) {
      const p = BELL_P[i];
      tone(v, { f: f * p[0] * (1 + (rnd() - 0.5) * 0.008), at: at + rnd() * 0.003, d: d * p[2], a: 0.002, g: g * p[1] * 0.4 });
    }
    nz(v, { at, d: 0.025, g: g * 0.12, ft: 'bandpass', f: Math.min(4000, f * 4), q: 1.2 });
  }
  function knock(v, at, f, g) {                    // coup sur du bois
    tone(v, { f, f2: f * 0.9, at, d: rr(0.07, 0.1), g: g * 0.5, type: 'triangle' });
    tone(v, { f: f * 0.42, at, d: 0.11, g: g * 0.6 });
    nz(v, { at, d: 0.025, g: g * 0.4, ft: 'bandpass', f: f * 3.2, q: 1.4 });
  }
  function hammer(v, at, g) {                      // marteau sur bois
    const f = rr(560, 760);
    nz(v, { at, d: 0.03, g: g * 0.6, ft: 'bandpass', f: rr(1900, 2700), q: 1.6 });
    tone(v, { f, f2: f * 0.85, at, d: 0.07, g: g * 0.3, type: 'triangle' });
    tone(v, { f: rr(150, 190), f2: 110, at, d: 0.08, g: g * 0.5 });
  }
  function thud(v, at, f, d, g) {                  // choc sourd (pierre, terre)
    tone(v, { f, f2: f * 0.5, at, d, g: g * 0.7, a: 0.003 });
    nz(v, { b: 'n', at, d: d * 0.7, g, ft: 'lowpass', f: f * 5, q: 0.6, a: 0.003 });
  }
  function ting(v, at, f, d, g) {                  // petit tintement métallique
    tone(v, { f, at, d, g, a: 0.001 });
    tone(v, { f: f * 2.71, at, d: d * 0.5, g: g * 0.3, a: 0.001 });
  }
  function rattle(v, at, n, spread, g) {           // cliquetis d'armure
    for (let i = 0; i < n; i++) ting(v, at + rnd() * spread, rr(1800, 3000), rr(0.03, 0.08), g * rr(0.4, 1));
  }
  function step(v, at, g) {                        // pas sur la terre
    nz(v, { b: 'n', at, d: rr(0.05, 0.08), g, ft: 'lowpass', f: rr(500, 800), q: 0.8 });
    nz(v, { b: 'r', at: at + 0.005, d: 0.05, g: g * 0.3, ft: 'bandpass', f: rr(1500, 2500), q: 0.8 });
  }
  function hoof(v, at, g) {                        // sabot
    const f = rr(240, 320);
    tone(v, { f, f2: f * 0.6, at, d: 0.05, g: g * 0.6 });
    nz(v, { at, d: 0.03, g: g * 0.5, ft: 'bandpass', f: rr(900, 1500), q: 2 });
  }
  function whoosh(v, at, d, g, f1, f2) {
    nz(v, { b: 'p', at, d, a: d * 0.45, g, ft: 'bandpass', f: f1, f2, q: 2.2 });
  }
  function crackle(v, at, n, spread, g) {          // crépitement (feu, débris fins)
    for (let i = 0; i < n; i++) nz(v, { at: at + rnd() * spread, d: rr(0.004, 0.012), g: g * rr(0.3, 1), ft: 'bandpass', f: rr(1400, 3200), q: 1 });
  }
  function coins(v, at, n, spread, g) {            // pièces qui tintent
    for (let i = 0; i < n; i++) {
      const f = rr(2300, 3700), a2 = at + rnd() * spread, gg = g * rr(0.4, 1);
      tone(v, { f, at: a2, d: rr(0.08, 0.2), g: gg, a: 0.001 });
      tone(v, { f: f * 1.34, at: a2, d: 0.06, g: gg * 0.4, a: 0.001 });
    }
  }
  function creak(v, at, d, g, f0, fc) {            // bois qui grince : impulsions lentes dans un filtre résonant
    const t = v.t + at, s = ctx.createOscillator(), e = mk(v, ctx.createGain());
    g *= 5;                                        // compense le peu d'énergie qui traverse le filtre étroit
    s.type = 'sawtooth';
    s.frequency.setValueAtTime(f0, t);
    s.frequency.linearRampToValueAtTime(f0 * rr(0.6, 1.4), t + d * 0.5);
    s.frequency.linearRampToValueAtTime(f0 * rr(0.6, 1.3), t + d);
    const bp = filt(v, 'bandpass', fc, 6);
    bp.frequency.setValueAtTime(fc, t); bp.frequency.linearRampToValueAtTime(fc * rr(0.8, 1.3), t + d);
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + d * 0.25);
    e.gain.linearRampToValueAtTime(g * 0.6, t + d * 0.7); e.gain.linearRampToValueAtTime(0, t + d);
    s.connect(bp); bp.connect(e); e.connect(v.out);
    s.start(t); s.stop(t + d + 0.02); track(v, s);
  }
  function pluck(v, f, at, d, g, bright) {         // luth / harpe (corde pincée)
    const t = v.t + at, s = ctx.createBufferSource(), e = mk(v, ctx.createGain());
    s.buffer = BUF.ks; s.playbackRate.value = f / KSF;
    const lp = filt(v, 'lowpass', bright || 2400, 0.5);
    e.gain.setValueAtTime(g, t); e.gain.setTargetAtTime(0, t + d * 0.65, d * 0.08);
    s.connect(lp); lp.connect(e); e.connect(v.out);
    s.start(t); s.stop(t + Math.min(d, BUF.ks.duration / s.playbackRate.value) + 0.05);
    track(v, s);
  }
  function horn(v, f, at, d, g, br) {              // cor : deux scies désaccordées + sinus, filtre qui s'ouvre
    const t = v.t + at, end = t + d;
    const lp = filt(v, 'lowpass', f * 1.2, 0.8);
    lp.frequency.setValueAtTime(f * 1.2, t); lp.frequency.linearRampToValueAtTime(f * (br || 4.2), t + 0.16);
    lp.frequency.setTargetAtTime(f * 2.4, t + 0.16, d * 0.3); lp.frequency.setTargetAtTime(f * 1.1, end - 0.2, 0.08);
    const e = mk(v, ctx.createGain());
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + 0.1);
    e.gain.setTargetAtTime(g * 0.75, t + 0.1, 0.25); e.gain.setTargetAtTime(0, end - 0.18, 0.07);
    lp.connect(e); e.connect(v.out);
    for (const [type, dt, a] of [['sawtooth', -6, 0.45], ['sawtooth', 7, 0.45], ['sine', 0, 0.8]]) {
      const s = ctx.createOscillator(), sg = mk(v, gainNode(a));
      s.type = type; s.detune.value = dt;
      s.frequency.setValueAtTime(f * 0.955, t); s.frequency.exponentialRampToValueAtTime(f, t + 0.11);
      s.connect(sg); sg.connect(lp); s.start(t); s.stop(end + 0.35); track(v, s);
    }
  }
  function choir(v, notes, at, d, g) {             // chœur « aah » : scies douces et trois formants
    const t = v.t + at, sum = mk(v, gainNode(1)), e = mk(v, ctx.createGain());
    for (const [f, a, q] of [[780, 1, 7], [1150, 0.55, 8], [2700, 0.12, 10]]) {
      const b = filt(v, 'bandpass', f * rr(0.97, 1.03), q), gg = mk(v, gainNode(a));
      sum.connect(b); b.connect(gg); gg.connect(e);
    }
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + d * 0.3);
    e.gain.setTargetAtTime(0, t + d * 0.6, d * 0.12);
    e.connect(v.out);
    const lfo = ctx.createOscillator(), lg = mk(v, gainNode(12));
    lfo.frequency.value = rr(4.6, 5.6); lfo.connect(lg);
    for (const m of notes) for (const dt of [-9, 8]) {
      const s = ctx.createOscillator(); s.type = 'sawtooth';
      s.frequency.value = mtof(m); s.detune.value = dt + rr(-3, 3);
      lg.connect(s.detune); s.connect(sum); s.start(t); s.stop(t + d * 1.3); track(v, s);
    }
    lfo.start(t); lfo.stop(t + d * 1.3); track(v, lfo);
  }
  function murmur(v, at, d, g) {                   // brouhaha de foule, lointain
    const t = v.t + at, s = ctx.createBufferSource(), am = mk(v, gainNode(0.5)), e = mk(v, ctx.createGain());
    s.buffer = BUF.p;
    const b1 = filt(v, 'bandpass', rr(450, 650), 3), b2 = filt(v, 'bandpass', rr(1000, 1400), 4);
    b1.frequency.linearRampToValueAtTime(rr(380, 720), t + d);
    s.connect(b1); s.connect(b2); b1.connect(am); b2.connect(am);
    for (const f of [rr(3.3, 4.4), rr(5.7, 7.1)]) {
      const l = ctx.createOscillator(), lg = mk(v, gainNode(0.25)); l.frequency.value = f; l.connect(lg); lg.connect(am.gain);
      l.start(t); l.stop(t + d + 0.05); track(v, l);
    }
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + d * 0.3); e.gain.linearRampToValueAtTime(0, t + d);
    am.connect(e); e.connect(v.out);
    s.start(t, rnd() * 2, d + 0.05); track(v, s);
  }
  function bleat(v, at, g) {                       // bêlement stylisé
    const t = v.t + at, f = rr(330, 420), d = rr(0.4, 0.55);
    const s = ctx.createOscillator(), am = mk(v, gainNode(0.55)), e = mk(v, ctx.createGain());
    s.type = 'sawtooth'; s.frequency.setValueAtTime(f, t); s.frequency.linearRampToValueAtTime(f * 0.9, t + d);
    const l = ctx.createOscillator(), lg = mk(v, gainNode(0.45)); l.frequency.value = rr(15, 21); l.connect(lg); lg.connect(am.gain);
    const b1 = filt(v, 'bandpass', rr(900, 1150), 3), b2 = filt(v, 'bandpass', 480, 2);
    s.connect(am); am.connect(b1); am.connect(b2); b1.connect(e); b2.connect(e);
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + 0.05); e.gain.setTargetAtTime(0, t + d * 0.7, 0.05);
    e.connect(v.out);
    s.start(t); l.start(t); s.stop(t + d + 0.1); l.stop(t + d + 0.1); track(v, s); track(v, l);
  }
  function grunt(v, at, g) {                       // grognement (sanglier)
    const t = v.t + at, d = rr(0.18, 0.28);
    const s = ctx.createOscillator(), am = mk(v, gainNode(0.5)), e = mk(v, ctx.createGain());
    s.type = 'sawtooth'; s.frequency.setValueAtTime(rr(85, 100), t); s.frequency.linearRampToValueAtTime(rr(60, 70), t + d);
    const l = ctx.createOscillator(), lg = mk(v, gainNode(0.5)); l.frequency.value = rr(22, 30); l.connect(lg); lg.connect(am.gain);
    const lp = filt(v, 'lowpass', 520, 2);
    s.connect(am); am.connect(lp); lp.connect(e);
    env(e.gain, t, 0.02, d, g); e.connect(v.out);
    s.start(t); l.start(t); s.stop(t + d + 0.05); l.stop(t + d + 0.05); track(v, s); track(v, l);
  }
  function whinny(v, at, g) {                      // hennissement stylisé
    const t = v.t + at, d = rr(0.55, 0.75);
    const s = ctx.createOscillator(), e = mk(v, ctx.createGain());
    s.type = 'sawtooth';
    s.frequency.setValueAtTime(rr(520, 600), t); s.frequency.linearRampToValueAtTime(rr(800, 900), t + 0.12);
    s.frequency.linearRampToValueAtTime(rr(430, 500), t + d);
    const l = ctx.createOscillator(), lg = mk(v, ctx.createGain()); l.frequency.value = rr(8, 11);
    lg.gain.setValueAtTime(10, t); lg.gain.linearRampToValueAtTime(45, t + d);
    l.connect(lg); lg.connect(s.frequency);
    const b1 = filt(v, 'bandpass', 1100, 3), b2 = filt(v, 'bandpass', 2200, 4), g2 = mk(v, gainNode(0.4));
    s.connect(b1); s.connect(b2); b2.connect(g2); b1.connect(e); g2.connect(e);
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + 0.08); e.gain.linearRampToValueAtTime(g * 0.7, t + d * 0.6);
    e.gain.linearRampToValueAtTime(0, t + d);
    e.connect(v.out);
    s.start(t); l.start(t); s.stop(t + d + 0.05); l.stop(t + d + 0.05); track(v, s); track(v, l);
  }
  function flute(v, f, at, d, g) {                 // flûte douce avec souffle et vibrato tardif
    const t = v.t + at, s = ctx.createOscillator(), e = mk(v, ctx.createGain());
    s.type = 'triangle'; s.frequency.value = f;
    const lp = filt(v, 'lowpass', Math.min(2400, f * 2.5), 0.5);
    const l = ctx.createOscillator(), lg = mk(v, ctx.createGain()); l.frequency.value = rr(4.5, 5.3);
    lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(0.6, d));
    l.connect(lg); lg.connect(s.frequency);
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + 0.14);
    e.gain.setTargetAtTime(g * 0.8, t + 0.14, 0.2); e.gain.setTargetAtTime(0, t + d - 0.1, 0.09);
    s.connect(lp); lp.connect(e); e.connect(v.out);
    s.start(t); l.start(t); s.stop(t + d + 0.5); l.stop(t + d + 0.5); track(v, s); track(v, l);
    nz(v, { b: 'p', at, d: 0.22, a: 0.06, g: g * 0.12, ft: 'bandpass', f: Math.min(3000, f * 2), q: 1.5 });
  }
  function modeNotes(n, base) {                    // quelques notes du mode musical courant (pour les fanfares)
    const m = M.mode || MODES[0], out = [];
    for (let k = 0; k < n; k++) out.push(d2m(m, base + k * 2));
    return out;
  }

  // ---------- Effets : interface et jeu ----------
  const SND = {
    click(v) {
      const f = rr(1050, 1250);
      tone(v, { f, f2: f * 0.72, d: 0.05, g: 0.22, type: 'triangle' });
      nz(v, { d: 0.015, g: 0.06, ft: 'bandpass', f: 2600, q: 1.5 });
    },
    cmd(v) {
      const f = rr(510, 540);
      tone(v, { f, d: 0.07, g: 0.2, type: 'triangle' });
      tone(v, { f: f * 1.5, at: 0.045, d: 0.09, g: 0.15, type: 'triangle' });
    },
    err(v) {
      tone(v, { f: 220, f2: 170, d: 0.14, g: 0.3, type: 'triangle' });
      tone(v, { f: 185, f2: 140, at: 0.1, d: 0.2, g: 0.26, type: 'triangle' });
    },
    train(v) {
      const f = rr(580, 595);
      pluck(v, f, 0, 0.6, 0.35); pluck(v, f * 1.5, 0.09, 0.8, 0.3);
      bell(v, f * 2, 0.16, 0.7, 0.12, 5);
    },
    built(v) {                                   // générique
      hammer(v, 0, 0.5); hammer(v, rr(0.14, 0.18), 0.45);
      pluck(v, rr(436, 444), 0.32, 0.9, 0.3);
    },
    alert(v) {                                   // cor de guerre bref : ré grave puis la
      const f = rr(145, 149);
      horn(v, f, 0, 0.42, 0.32); horn(v, f * 1.5, 0.5, 0.85, 0.3);
      horn(v, f * 0.5, 0.5, 0.85, 0.12, 3);
    },
    alarm(v) {                                   // tocsin : la cloche de la ville sonne à la volée
      const f = rr(300, 318);
      let t = 0;
      for (let i = 0; i < 5; i++) { bell(v, f * (1 + (rnd() - 0.5) * 0.01), t, 1.7, i === 0 ? 0.5 : rr(0.36, 0.46), 7); t += rr(0.47, 0.6); }
    },
    bell_off(v) {                                // fin d'alerte : deux tintements doux
      bell(v, rr(520, 528), 0, 1.6, 0.26, 6); bell(v, rr(390, 394), 0.55, 2.0, 0.24, 6);
    },
    age(v) {
      const n = modeNotes(3, 7);
      horn(v, mtof(n[0] - 12), 0, 0.5, 0.22); horn(v, mtof(n[2] - 12), 0.42, 0.5, 0.22); horn(v, mtof(n[0]), 0.84, 1.3, 0.24);
      bell(v, mtof(n[0] + 12), 0.84, 2.0, 0.16, 6);
    },
    tech(v) { const f = rr(655, 665); bell(v, f, 0, 1.0, 0.18, 5); bell(v, f * 1.5, 0.12, 1.2, 0.14, 5); },
    win(v) {
      const n = modeNotes(5, 7);
      n.forEach((m, i) => { horn(v, mtof(m - 12), i * 0.2, i === 4 ? 1.6 : 0.4, 0.18); pluck(v, mtof(m), i * 0.2, 1.4, 0.22); });
      bell(v, mtof(n[0] + 12), 1.0, 2.6, 0.18, 7); bell(v, mtof(n[2] + 12), 1.25, 2.6, 0.12, 6);
    },
    lose(v) {
      [57, 53, 50].forEach((m, i) => horn(v, mtof(m - 12), i * 0.45, i === 2 ? 1.6 : 0.5, 0.2, 3));
      bell(v, mtof(38), 0.9, 3, 0.2, 6);
    },
    msg(v) { const f = rr(875, 885); tone(v, { f, d: 0.35, g: 0.16 }); tone(v, { f: f * 2.01, d: 0.18, g: 0.05 }); },
    place(v) {                                   // fondation posée
      thud(v, 0, rr(120, 150), 0.18, 0.45);
      nz(v, { b: 'r', at: 0.02, d: 0.18, a: 0.03, g: 0.08, ft: 'bandpass', f: 1200, q: 0.8 });
    },
    build_hit(v) { hammer(v, rr(0, 0.02), 0.6); },
    chop(v) {                                    // hache dans le bois
      nz(v, { d: 0.05, g: 0.35, ft: 'bandpass', f: rr(950, 1350), q: 1.8 });
      tone(v, { f: rr(230, 270), f2: 130, d: 0.09, g: 0.3 });
      tone(v, { f: rr(400, 460), d: 0.1, g: 0.08, type: 'triangle' });
    },
    mine_hit(v) {                                // pioche sur la pierre
      ting(v, 0, rr(2100, 2800), rr(0.08, 0.14), 0.12);
      nz(v, { d: 0.04, g: 0.25, ft: 'bandpass', f: rr(1300, 1900), q: 0.9 });
      nz(v, { b: 'n', d: 0.07, g: 0.25, ft: 'lowpass', f: 450 });
    },
    farm(v) {                                    // houe dans la terre
      nz(v, { b: 'r', d: rr(0.15, 0.26), a: 0.03, g: 0.3, ft: 'bandpass', f: rr(1100, 1700), q: 0.8 });
      nz(v, { b: 'n', d: 0.06, g: 0.2, ft: 'lowpass', f: 380 });
    },
    hit(v) {
      if (rnd() < 0.6) {                         // lames qui se croisent
        const f = rr(1250, 1750);
        nz(v, { d: 0.04, g: 0.18, ft: 'bandpass', f: rr(2500, 3400), q: 2.5 });
        tone(v, { f, d: rr(0.1, 0.18), g: 0.07, a: 0.001 }); tone(v, { f: f * 1.41, d: 0.08, g: 0.04, a: 0.001 });
      } else {                                   // coup sourd sur bouclier
        thud(v, 0, rr(140, 190), 0.1, 0.4);
        nz(v, { d: 0.02, g: 0.1, ft: 'bandpass', f: 1500, q: 1 });
      }
    },
    death(v) {
      thud(v, 0, rr(95, 120), 0.3, 0.45);
      nz(v, { b: 'p', d: 0.35, a: 0.04, g: 0.08, ft: 'lowpass', f: 700, f2: 250 });
      rattle(v, 0.06, ri(2, 3), 0.15, 0.03);
    },
    arrow(v) {
      nz(v, { b: 'p', d: rr(0.14, 0.2), a: 0.05, g: 0.18, ft: 'bandpass', f: rr(900, 1200), f2: rr(2000, 2600), q: 2.5 });
      tone(v, { f: rr(150, 180), d: 0.06, g: 0.05, type: 'triangle' });
    },
    convert(v) {                                 // conversion : arpège qui s'élève, lumineux mais doux
      const r = rr(438, 442);
      [1, 1.5, 2, 3].forEach((k, i) => tone(v, { f: r * k, at: i * 0.12, d: 1.1 - i * 0.1, a: 0.08, g: 0.07 }));
      choir(v, [62, 69], 0.1, 1.1, 0.25);
    },
    heal(v) {
      const r = rr(655, 665);
      tone(v, { f: r, d: 0.9, a: 0.05, g: 0.08 }); tone(v, { f: r * 1.5, at: 0.1, d: 0.9, a: 0.05, g: 0.06 });
      nz(v, { b: 'r', d: 0.4, a: 0.1, g: 0.03, ft: 'bandpass', f: 2200, q: 1 });
    },
    collapse(v) {                                // effondrement : grondement + débris
      nz(v, { d: 0.05, g: 0.2, ft: 'bandpass', f: 1800, q: 1 });
      nz(v, { b: 'n', d: 1.7, a: 0.06, g: 0.6, ft: 'lowpass', f: 320, f2: 90 });
      tone(v, { f: 58, f2: 36, d: 1.3, a: 0.03, g: 0.35 });
      for (let i = 0; i < ri(9, 14); i++) {
        const at = rr(0.1, 1.3);
        if (rnd() < 0.5) knock(v, at, rr(250, 500), rr(0.05, 0.16));
        else nz(v, { at, d: rr(0.02, 0.06), g: rr(0.04, 0.12), ft: 'bandpass', f: rr(700, 2200), q: 1.4 });
      }
    }
  };

  // ---------- Sélection d'un bâtiment : une signature par type ----------
  const SEL_B = {
    tc(v) { bell(v, rr(255, 268), 0, 1.3, 0.32, 6); murmur(v, 0.05, 1.05, 0.18); },
    house(v) {
      creak(v, 0, rr(0.32, 0.45), 0.12, rr(55, 80), rr(750, 1000));
      knock(v, rr(0.36, 0.44), rr(300, 360), 0.28);
      crackle(v, 0.15, ri(5, 8), 0.8, 0.07);
      nz(v, { b: 'n', at: 0.05, d: 0.8, a: 0.3, g: 0.08, ft: 'lowpass', f: 420 });
    },
    lumber(v) {
      for (const [at, g] of [[0, 0.42], [rr(0.28, 0.36), 0.36]]) {
        nz(v, { at, d: 0.05, g, ft: 'bandpass', f: rr(950, 1300), q: 1.6 });
        tone(v, { f: rr(240, 280), f2: 130, at, d: 0.1, g: g * 0.7 });
        tone(v, { f: rr(400, 450), at, d: 0.12, g: g * 0.15, type: 'triangle' });
      }
    },
    mine(v) {
      for (const [at, g] of [[0, 0.2], [rr(0.3, 0.38), 0.15]]) {
        const f = rr(1900, 2300);
        ting(v, at, f, 0.25, g); tone(v, { f: f * 1.52, at, d: 0.15, g: g * 0.4, a: 0.001 });
        nz(v, { at, d: 0.05, g: g * 1.8, ft: 'bandpass', f: rr(1300, 1700), q: 0.9 });
      }
      crackle(v, 0.45, 5, 0.4, 0.05);
    },
    mill(v) {
      creak(v, 0, rr(0.6, 0.8), 0.1, rr(30, 45), rr(450, 600));
      nz(v, { b: 'r', at: 0.15, d: 0.75, a: 0.25, g: 0.25, ft: 'bandpass', f: rr(2000, 2600), q: 0.9 });
      nz(v, { b: 'n', at: 0.1, d: 0.6, a: 0.2, g: 0.06, ft: 'lowpass', f: 300 });
    },
    farm(v) {
      nz(v, { b: 'r', d: 0.55, a: 0.15, g: 0.3, ft: 'bandpass', f: rr(1300, 1700), q: 0.7 });
      const f = rr(480, 560);   // gloussement discret, filtré, pas criard
      for (const [at, k, d] of [[0.12, 1, 0.08], [0.24, 0.95, 0.08], [0.38, 1.15, 0.13]]) {
        const s = { f: f * k, f2: f * k * 0.82, at, d, g: 0.12, type: 'triangle' };
        tone(v, s);
        nz(v, { at, d, g: 0.04, ft: 'bandpass', f: 1000, q: 3 });
      }
    },
    barracks(v) {
      const f = rr(520, 620);
      for (const [r, a, d] of [[1, 1, 0.6], [2.76, 0.45, 0.35], [5.4, 0.2, 0.2], [8.9, 0.08, 0.1]]) tone(v, { f: f * r, d, g: 0.09 * a, a: 0.001 });
      nz(v, { d: 0.03, g: 0.12, ft: 'bandpass', f: 3500, q: 1.5 });
      const f2 = f * rr(1.12, 1.25);
      for (const [r, a, d] of [[1, 1, 0.4], [2.76, 0.4, 0.22]]) tone(v, { f: f2 * r, at: 0.17, d, g: 0.05 * a, a: 0.001 });
      thud(v, 0.36, rr(110, 140), 0.16, 0.3);
    },
    palisade(v) { knock(v, 0, rr(380, 450), 0.35); knock(v, rr(0.16, 0.22), rr(340, 410), 0.3); },
    pgate(v) { knock(v, 0, rr(360, 420), 0.33); creak(v, 0.12, 0.4, 0.09, rr(50, 70), rr(650, 850)); knock(v, 0.55, rr(300, 350), 0.25); },
    archery(v) {
      pluck(v, rr(165, 190), 0, 0.5, 0.45, 1500);
      whoosh(v, 0.04, 0.26, 0.15, 900, 2400);
      knock(v, 0.34, rr(220, 260), 0.25);
    },
    stable(v) {
      hoof(v, 0, 0.35); hoof(v, 0.1, 0.28); hoof(v, 0.21, 0.32);
      if (rnd() < 0.45) whinny(v, 0.3, 0.05);
      else nz(v, { b: 'p', at: 0.32, d: 0.3, a: 0.05, g: 0.1, ft: 'bandpass', f: rr(500, 700), q: 1.5 });  // ébrouement
    },
    smith(v) {
      const f = rr(830, 900);
      for (const [at, g] of [[0, 0.16], [rr(0.26, 0.32), 0.1]]) {
        for (const [r, a, d] of [[1, 1, 1.0], [2.41, 0.5, 0.6], [3.93, 0.25, 0.35], [5.2, 0.1, 0.2]]) tone(v, { f: f * r * rr(0.998, 1.002), at, d, g: g * a, a: 0.001 });
        nz(v, { at, d: 0.02, g: g, ft: 'bandpass', f: 3000, q: 1 });
      }
    },
    market(v) { coins(v, 0, ri(7, 10), 0.45, 0.075); thud(v, 0.5, rr(160, 200), 0.1, 0.2); },
    tower(v) {
      nz(v, { b: 'p', d: 1.0, a: 0.4, g: 0.9, ft: 'bandpass', f: rr(500, 650), f2: rr(800, 1000), q: 3.5 });
      creak(v, 0.25, rr(0.5, 0.7), 0.08, rr(35, 55), rr(500, 700));
    },
    wall(v) {
      thud(v, 0, rr(70, 85), 0.35, 0.55);
      nz(v, { at: 0.01, d: 0.12, g: 0.06, ft: 'bandpass', f: 1800, q: 0.8 });
    },
    gate(v) {
      let t = 0;
      for (let i = 0; i < ri(8, 11); i++) { ting(v, t, rr(1500, 2600), 0.05, rr(0.03, 0.06)); nz(v, { at: t, d: 0.015, g: 0.03, ft: 'bandpass', f: 2500, q: 2 }); t += rr(0.04, 0.08); }
      thud(v, t + 0.05, rr(65, 80), 0.4, 0.5);
    },
    monastery(v) {
      const n = modeNotes(3, 0).map(m => m + 12);
      choir(v, [n[0], n[2], n[0] + 12].map(x => Math.min(x, 72)), 0, 1.1, 0.3);
    },
    siege(v) {
      let t = 0;
      for (let i = 0; i < ri(7, 10); i++) {
        nz(v, { at: t, d: 0.015, g: 0.18, ft: 'bandpass', f: rr(1300, 1700), q: 3 });
        tone(v, { f: rr(550, 650), at: t, d: 0.025, g: 0.06, type: 'triangle' });
        t += rr(0.045, 0.06);
      }
      knock(v, t + 0.06, rr(180, 220), 0.3);
    },
    castle(v) {
      const f = rr(108, 112);
      horn(v, f, 0, 1.0, 0.21, 3.5); horn(v, f * 1.5, 0.02, 1.0, 0.08, 3);
    },
    wonder(v) {
      const n = modeNotes(4, 7);
      n.concat([n[0] + 12]).forEach((m, i) => {
        tone(v, { f: mtof(m), at: i * 0.06, d: 1.2, a: 0.15, g: 0.08 });
        tone(v, { f: mtof(m) * 1.003, at: i * 0.06, d: 1.2, a: 0.2, g: 0.045 });
      });
      bell(v, mtof(n[0] + 12), 0.3, 0.9, 0.06, 5);
    },
    _(v) { SND.click(v); }
  };

  // ---------- Sélection d'une unité : accusé discret, sans voix ----------
  const SEL_U = {
    villager(v) { step(v, 0, 0.35); step(v, rr(0.17, 0.24), 0.28); },
    scout(v) { hoof(v, 0, 0.3); hoof(v, 0.08, 0.22); hoof(v, 0.18, 0.26); },
    militia(v) { rattle(v, 0, 4, 0.12, 0.05); step(v, 0.05, 0.3); },
    spear(v) { knock(v, 0, rr(520, 600), 0.2); rattle(v, 0.02, 2, 0.1, 0.035); },
    archer(v) { pluck(v, rr(175, 200), 0, 0.45, 0.3, 1400); nz(v, { b: 'r', at: 0.04, d: 0.15, g: 0.06, ft: 'bandpass', f: 1800 }); },
    skirm(v) { pluck(v, rr(210, 240), 0, 0.35, 0.25, 1300); step(v, 0.1, 0.22); },
    knight(v) { hoof(v, 0, 0.4); hoof(v, 0.11, 0.33); rattle(v, 0.02, 5, 0.2, 0.05); },
    monk(v) { nz(v, { b: 'r', d: 0.3, a: 0.08, g: 0.12, ft: 'bandpass', f: 1300, q: 0.7 }); ting(v, 0.1, rr(980, 1000), 0.5, 0.08); },
    ram(v) { creak(v, 0, rr(0.35, 0.45), 0.1, rr(35, 45), rr(420, 520)); thud(v, 0.3, 90, 0.15, 0.25); },
    mangonel(v) { creak(v, 0, 0.3, 0.08, rr(40, 55), rr(550, 650)); for (let i = 0; i < 3; i++) nz(v, { at: 0.3 + i * 0.05, d: 0.015, g: 0.12, ft: 'bandpass', f: 1500, q: 3 }); },
    treb(v) { creak(v, 0, rr(0.5, 0.6), 0.1, rr(28, 36), rr(380, 460)); knock(v, 0.45, 200, 0.18); },
    guard(v) { rattle(v, 0, 6, 0.15, 0.05); step(v, 0.04, 0.38); },
    sheep(v) { bleat(v, 0, 0.13); },
    deer(v) { hoof(v, 0, 0.18); hoof(v, 0.07, 0.14); nz(v, { b: 'r', at: 0.05, d: 0.2, g: 0.05, ft: 'bandpass', f: 1600 }); },
    boar(v) { grunt(v, 0, 0.18); },
    _(v) { step(v, 0, 0.3); }
  };

  // ---------- Fin de construction, selon le bâtiment ----------
  const BUILT = {
    house(v) {
      let t = 0;
      for (let i = 0; i < ri(3, 4); i++) { hammer(v, t, rr(0.4, 0.5)); t += rr(0.11, 0.2); }
      creak(v, t, 0.25, 0.06, 45, 600); thud(v, t + 0.12, 120, 0.22, 0.3);
      pluck(v, mtof(modeNotes(1, 7)[0]), t + 0.2, 0.9, 0.22);
    },
    farm(v) {
      nz(v, { b: 'r', d: 0.5, a: 0.1, g: 0.18, ft: 'bandpass', f: 1200, q: 0.7 });
      thud(v, 0.05, 90, 0.2, 0.25);
      const n = modeNotes(2, 7);
      pluck(v, mtof(n[0]), 0.3, 0.8, 0.2); pluck(v, mtof(n[1]), 0.45, 1.0, 0.18);
    },
    wood(v) { knock(v, 0, rr(380, 440), 0.22); knock(v, rr(0.15, 0.2), rr(330, 380), 0.2); thud(v, 0.35, 110, 0.15, 0.15); },
    stone(v) {
      thud(v, 0, rr(85, 95), 0.3, 0.32); nz(v, { at: 0.01, d: 0.1, g: 0.06, ft: 'bandpass', f: 2000, q: 0.8 });
      thud(v, rr(0.2, 0.25), rr(70, 80), 0.35, 0.28); tone(v, { f: rr(290, 310), at: 0.22, d: 0.12, g: 0.08, type: 'triangle' });
    },
    big(v) {
      hammer(v, 0, 0.5); hammer(v, rr(0.13, 0.16), 0.45); hammer(v, rr(0.28, 0.32), 0.5);
      const n = modeNotes(3, 7);
      n.forEach((m, i) => pluck(v, mtof(m), 0.45 + i * 0.1, 1.2, 0.22));
      bell(v, mtof(n[0] + 12), 0.75, 1.3, 0.1, 5);
    },
    grand(v) {
      hammer(v, 0, 0.5); hammer(v, 0.15, 0.5);
      const n = modeNotes(3, 7);
      horn(v, mtof(n[0] - 12), 0.35, 1.3, 0.2); horn(v, mtof(n[2] - 12), 0.37, 1.3, 0.14);
      bell(v, mtof(n[0] + 12), 0.4, 2.2, 0.16, 7); bell(v, mtof(n[2] + 12), 0.7, 2.0, 0.1, 6);
    }
  };
  const BUILT_OF = { house: 'house', farm: 'farm', palisade: 'wood', pgate: 'wood', wall: 'stone', gate: 'stone', tower: 'stone', castle: 'grand', wonder: 'grand' };

  // ---------- Métadonnées : gain, réverbe, durée, anti-empilement, priorité ----------
  // g gain, w départ réverbe, d durée de comptage, gap intervalle mini (s), n instances max, lo basse priorité
  const DEF = { g: 0.7, w: 0.12, d: 0.4, gap: 0.12, n: 2, lo: false };
  const META = {
    click: { g: 0.5, w: 0.04, d: 0.08, gap: 0.05 },
    cmd: { g: 0.5, w: 0.05, d: 0.16 },
    err: { g: 0.55, w: 0.04, d: 0.32 },
    train: { g: 1.0, w: 0.2, d: 0.9 },
    built: { g: 0.7, w: 0.18, d: 1.4, gap: 0.25 },
    alert: { g: 0.7, w: 0.35, d: 1.5, gap: 1.5, n: 1 },
    alarm: { g: 0.7, w: 0.4, d: 3.6, gap: 2.2, n: 1 },
    bell_off: { g: 0.6, w: 0.4, d: 2.5, gap: 1.5, n: 1 },
    age: { g: 0.7, w: 0.35, d: 2.6, gap: 1, n: 1 },
    tech: { g: 0.9, w: 0.3, d: 1.3 },
    win: { g: 0.7, w: 0.35, d: 3.6, gap: 2, n: 1 },
    lose: { g: 0.7, w: 0.35, d: 3.6, gap: 2, n: 1 },
    msg: { g: 0.5, w: 0.15, d: 0.35 },
    place: { g: 0.38, w: 0.08, d: 0.25 },
    build_hit: { g: 0.16, w: 0.06, d: 0.1, gap: 0.06, n: 3, lo: true },
    chop: { g: 0.15, w: 0.06, d: 0.12, gap: 0.08, n: 2, lo: true },
    mine_hit: { g: 0.2, w: 0.06, d: 0.14, gap: 0.08, n: 2, lo: true },
    farm: { g: 0.45, w: 0.04, d: 0.26, gap: 0.12, n: 2, lo: true },
    hit: { g: 0.5, w: 0.06, d: 0.18, gap: 0.05, n: 4, lo: true },
    death: { g: 0.27, w: 0.1, d: 0.4, gap: 0.08, n: 3, lo: true },
    arrow: { g: 0.9, w: 0.05, d: 0.2, gap: 0.06, n: 3, lo: true },
    convert: { g: 0.6, w: 0.45, d: 1.2, gap: 0.3, n: 1 },
    heal: { g: 0.5, w: 0.35, d: 0.9, gap: 0.4, n: 1, lo: true },
    collapse: { g: 0.55, w: 0.3, d: 1.7, gap: 0.3, n: 2 },
    sel: { g: 0.65, w: 0.2, d: 1.2, gap: 0.15, n: 2 },
    sel_unit: { g: 0.45, w: 0.06, d: 0.4, gap: 0.12, n: 2 }
  };
  const MAXV = 24;

  function resolve(name, o) {
    if (name === 'sel_unit') return { fn: SEL_U[o.t] || SEL_U._, m: META.sel_unit, key: 'sel_unit' };
    if (name.indexOf('sel_') === 0) return { fn: SEL_B[name.slice(4)] || SEL_B._, m: META.sel, key: 'sel' };
    if (name === 'built' && o.t) return { fn: BUILT[BUILT_OF[o.t] || 'big'], m: META.built, key: 'built' };
    const fn = SND[name];
    return fn ? { fn, m: META[name] || DEF, key: name } : null;
  }

  // ---------- API R.sfx ----------
  S.unlock = function () {
    const c = ensure(); if (!c) return;
    if (!unlocked) {
      unlocked = true;
      try {                                      // iOS : jouer un échantillon muet débloque la sortie
        const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, c.sampleRate); s.connect(c.destination); s.start(0);
      } catch (e) { /* rien */ }
    }
    if (c.state === 'suspended' && !(DOC && DOC.hidden)) c.resume().catch(() => {});
  };
  S.toggle = function () {
    S.on = !S.on;
    lsSet('roy.sfx', S.on ? '1' : '0');
    applyVol('sfx');
    return S.on;
  };
  S.play = function (name, opts) {
    if (!S.on || !ctx || ctx.state !== 'running' || typeof name !== 'string') return false;
    const o = opts && typeof opts === 'object' ? opts : {};
    const r = resolve(name, o); if (!r) return false;
    const m = Object.assign({}, DEF, r.m), now = ctx.currentTime;
    const g = m.g * cl(num(o.gain, 1), 0, 1);
    if (g < 0.008) return false;
    if (lastPlay[r.key] != null && now - lastPlay[r.key] < m.gap) return false;
    sfxAct = sfxAct.filter(a => a.end > now);
    let same = 0; for (const a of sfxAct) if (a.k === r.key) same++;
    if (same >= m.n) return false;
    if (sfxAct.length >= (m.lo ? MAXV - 6 : MAXV)) {
      if (m.lo) return false;
      // priorité : on retire de la liste la voix secondaire la plus ancienne (elle s'éteint d'elle-même)
      const i = sfxAct.findIndex(a => a.lo);
      if (i < 0 || sfxAct.length >= MAXV + 6) return false;
      sfxAct.splice(i, 1);
    }
    lastPlay[r.key] = now;
    try {
      const v = V(N.sfx, g, cl(num(o.pan, 0), -1, 1), m.w);
      r.fn(v, o);
      sfxAct.push({ k: r.key, end: now + m.d, lo: m.lo });
      return true;
    } catch (e) { return false; }
  };

  // =====================================================================
  // MUSIQUE GÉNÉRATIVE — nappes très douces, accords modaux, rares fragments mélodiques
  // =====================================================================
  // Modes (racine MIDI, gamme, degrés d'accords favoris, famille de notes)
  const MODES = [
    { n: 'ré dorien', r: 50, s: [0, 2, 3, 5, 7, 9, 10], deg: [0, 0, 2, 3, 3, 4, 6], c: 0 },
    { n: 'la éolien', r: 45, s: [0, 2, 3, 5, 7, 8, 10], deg: [0, 0, 2, 3, 5, 5, 6], c: 0 },
    { n: 'fa lydien', r: 53, s: [0, 2, 4, 6, 7, 9, 11], deg: [0, 0, 1, 4, 5, 2], c: 0 },
    { n: 'sol mixolydien', r: 43, s: [0, 2, 4, 5, 7, 9, 10], deg: [0, 0, 3, 6, 6, 4], c: 0 },
    { n: 'ré éolien', r: 50, s: [0, 2, 3, 5, 7, 8, 10], deg: [0, 0, 2, 3, 5, 6], c: 1 },
    { n: 'sol dorien', r: 43, s: [0, 2, 3, 5, 7, 9, 10], deg: [0, 0, 2, 3, 4, 6], c: 1 },
    { n: 'si bémol lydien', r: 46, s: [0, 2, 4, 6, 7, 9, 11], deg: [0, 0, 1, 4, 5], c: 1 }
  ];
  function d2m(m, k) { const o = Math.floor(k / 7), i = ((k % 7) + 7) % 7; return m.r + m.s[i] + 12 * o; }
  const M = { mode: null, left: 0, prev: [], deg: -1, chordDeg: [0, 2, 4], nextChord: 0, nextMel: 0, drumNext: 0, step: 0, pat: null, eighth: 0.32 };
  const PATS = [[1, 0, 0, 0.55, 0, 0, 0.75, 0], [1, 0, 0.45, 0, 0.8, 0, 0.45, 0.35], [1, 0, 0, 0, 0.7, 0, 0.5, 0], [0.9, 0, 0.4, 0.4, 0.8, 0, 0, 0.4]];

  // Scène (cibles données par le jeu, valeurs lissées dans le temps)
  const scT = { forest: 0.3, water: 0, open: 0.5, battle: 0, age: 1, night: 0 };
  const sc = Object.assign({}, scT);

  function pickMode() {
    const cur = M.mode;
    const pool = MODES.filter(m => m !== cur && (!cur || (rnd() < 0.8 ? m.c === cur.c : m.c !== cur.c)));
    M.mode = pick(pool.length ? pool : MODES);
    M.left = ri(3, 6);
  }
  function voiceLead(pcs, prev, lo, hi) {
    const out = [], ref = prev.length ? prev : [60, 64, 67];
    for (const pc of pcs) {
      let best = null, bd = 1e9;
      for (let m = lo; m <= hi; m++) {
        if (m % 12 !== pc || out.indexOf(m) >= 0) continue;
        let d = 1e9; for (const r of ref) d = Math.min(d, Math.abs(r - m));
        for (const x of out) if (Math.abs(x - m) < 3 && m < 60) d += 6;   // pas d'amas dans le grave
        d += rnd() * 1.5;
        if (d < bd) { bd = d; best = m; }
      }
      if (best != null) out.push(best);
    }
    return out.sort((a, b) => a - b);
  }

  function chord(t, D) {
    if (!M.mode || --M.left <= 0) pickMode();
    const m = M.mode;
    let deg = pick(m.deg); if (deg === M.deg) deg = pick(m.deg);
    M.deg = deg;
    let ks = [deg, deg + 2, deg + 4];
    const x = rnd();
    if (x < 0.32) ks.push(deg + 6);                       // septième
    else if (x < 0.5) ks[1] = deg + 1;                    // sus2
    else if (x < 0.64) ks.push(deg + 8);                  // neuvième
    else if (x < 0.78) ks = [deg, deg + 4, deg + 7];      // quinte à vide, couleur médiévale
    if (sc.age >= 2.5 && rnd() < 0.5 && ks.indexOf(deg + 8) < 0) ks.push(deg + 8);
    M.chordDeg = ks;
    const pcs = []; for (const k of ks) { const pc = d2m(m, k) % 12; if (pcs.indexOf(pc) < 0) pcs.push(pc); }
    const notes = voiceLead(pcs, M.prev, 52, 72);
    M.prev = notes;
    let bass = d2m(m, deg); while (bass > 47) bass -= 12; while (bass < 36) bass += 12;

    const A1 = rr(4.5, 7.5), Rl = rr(6, 9), end = t + D + Rl;
    const v = V(SESS.mus, 1, 0, 0.6, t);
    const cut = (620 + 130 * (cl(sc.age, 1, 4) - 1)) * (sc.night > 0.5 ? 0.75 : 1);
    const lp = filt(v, 'lowpass', cut, 0.4);
    const lfo = ctx.createOscillator(), lg = mk(v, gainNode(cut * 0.3));
    lfo.frequency.value = rr(0.035, 0.09); lfo.connect(lg); lg.connect(lp.frequency);
    lfo.start(t); lfo.stop(end + 0.1); track(v, lfo);
    const e = mk(v, ctx.createGain());
    e.gain.setValueAtTime(0, t); e.gain.setTargetAtTime(1, t, A1 / 3); e.gain.setTargetAtTime(0, t + D, Rl / 4.5);
    lp.connect(e); e.connect(v.out);
    const add = (f, gain, pan, types) => {
      const ng = mk(v, gainNode(gain));
      let head = ng;
      if (pan && ctx.createStereoPanner) { const p = mk(v, ctx.createStereoPanner()); p.pan.value = pan; ng.connect(p); head = p; }
      head.connect(lp);
      for (const [type, dt, a] of types) {
        const s = ctx.createOscillator(), sg = mk(v, gainNode(a));
        s.type = type; s.frequency.value = f; s.detune.value = dt + rr(-2, 2);
        s.connect(sg); sg.connect(ng); s.start(t); s.stop(end + 0.1); track(v, s);
      }
    };
    notes.forEach(n => add(mtof(n), 0.034 * (n > 66 ? 0.8 : 1), rr(-0.55, 0.55), [['triangle', -6, 1], ['sawtooth', 7, 0.22]]));
    add(mtof(bass), 0.05, 0, [['sine', 0, 1], ['triangle', 4, 0.35]]);
  }

  function phrase(t) {
    const m = M.mode || MODES[0], lute = rnd() < 0.65;
    const v = V(SESS.mus, 1, rr(-0.4, 0.4), 0.75, t);
    let k = pick(M.chordDeg) + 7;
    while (d2m(m, k) < 62) k += 7; while (d2m(m, k) > 76) k -= 7;
    const n = ri(3, 6), beat = rr(0.55, 0.85);
    let at = 0;
    for (let i = 0; i < n; i++) {
      const last = i === n - 1, dur = last ? beat * rr(2, 3) : beat * pick([1, 1, 1.5, 2, 0.5]);
      const f = mtof(d2m(m, k));
      if (lute) pluck(v, f, at + rr(0, 0.02), Math.max(1.2, dur * 1.8), 0.11 * rr(0.8, 1), 2000);
      else flute(v, f, at, dur * 1.1, 0.045 * rr(0.85, 1));
      at += dur;
      let nk = k + pick([-2, -1, -1, 1, 1, 2, -3, 3]);
      if (d2m(m, nk) < 60 || d2m(m, nk) > 79) nk = k - (nk - k);
      k = nk;
    }
  }

  function drumHit(t, a) {
    const v = V(SESS.mus, 1, rr(-0.15, 0.15), 0.25, t);
    tone(v, { f: rr(78, 88), f2: 46, d: 0.45, a: 0.004, g: 0.34 * a });
    nz(v, { b: 'n', d: 0.12, g: 0.22 * a, ft: 'lowpass', f: 260 });
    if (a > 0.85) nz(v, { d: 0.03, g: 0.025 * a, ft: 'bandpass', f: 900, q: 1.2 });
  }

  function musicTick(now, ahead) {
    if (M.nextChord < now - 2) M.nextChord = now + 0.3;
    while (M.nextChord < ahead) { const D = rr(12, 28); chord(M.nextChord, D); M.nextChord += D; }
    if (M.nextMel < now - 2) M.nextMel = now + rr(15, 35);
    if (M.nextMel < ahead) {
      if (rnd() > 0.3 && sc.battle < 0.6) phrase(M.nextMel);
      M.nextMel += rr(20, 60) * (rnd() < 0.2 ? 2 : 1);            // parfois de longs silences
    }
    // Tambour sourd : n'apparaît qu'en bataille, s'efface ensuite
    const b = sc.battle;
    if (b < 0.08) { M.pat = null; return; }
    if (!M.pat || M.drumNext < now - 0.5) { M.drumNext = now + 0.1; M.step = 0; M.pat = pick(PATS); M.eighth = rr(0.3, 0.34); }
    while (M.drumNext < ahead) {
      if (M.step % 8 === 0) M.pat = rnd() < 0.7 ? M.pat : pick(PATS);
      const a = M.pat[M.step % 8];
      if (a) drumHit(M.drumNext + rr(-0.008, 0.008), a * cl(b, 0, 1) * rr(0.85, 1.05));
      M.drumNext += M.eighth; M.step++;
    }
  }

  // =====================================================================
  // AMBIANCE — vent, feuillages, eau, oiseaux variés, grillons
  // =====================================================================
  const AM = { nextWind: 0, gustEnd: 0, nextLeaf: 0, nextWater: 0, nextBird: 0, nextBug: 0, lastSp: '' };

  function ambStart(now) {
    const loop = (buf, type, f, q, pan) => {
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = gainNode(0);
      s.connect(fl); fl.connect(g);
      let head = g;
      if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); head = p; SESS.nodes.push(p); }
      head.connect(SESS.amb.dry);
      s.start(now, rnd() * buf.duration);
      SESS.nodes.push(fl, g); SESS.loops.push(s);
      return { s, f: fl, g };
    };
    SESS.L = {
      w1: loop(BUF.n, 'lowpass', 380, 0.5, -0.3),       // vent grave
      w2: loop(BUF.p, 'bandpass', 800, 1.3, 0.35),      // souffle plus aérien
      wa: loop(BUF.p, 'lowpass', 500, 0.6, 0.1)         // lit d'eau
    };
    AM.nextWind = now; AM.nextLeaf = now + rr(2, 6); AM.nextWater = now + rr(0.5, 2);
    AM.nextBird = now + rr(2, 6); AM.nextBug = now + rr(4, 10); AM.gustEnd = 0;
  }

  function ambVoice(t, g, pan, wet, dur) {
    ambAct = ambAct.filter(e => e > t - 0.5);
    if (ambAct.length >= 7) return null;
    ambAct.push(t + dur);
    return V(SESS.amb, g, pan, wet, t);
  }

  function leaves(t, f) {
    const d = rr(1.8, 4), v = ambVoice(t, 1, rr(-0.8, 0.8), 0.15, d); if (!v) return;
    const s = ctx.createBufferSource(), bp = filt(v, 'bandpass', rr(1300, 2400), 0.6), lp = filt(v, 'lowpass', 3500, 0.5), e = mk(v, ctx.createGain());
    s.buffer = BUF.r; s.playbackRate.value = rr(0.7, 1.1);
    const a = d * rr(0.3, 0.5), g = 0.07 * (0.4 + 0.6 * f) * rr(0.6, 1);
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + a); e.gain.linearRampToValueAtTime(g * rr(0.5, 0.9), t + d * 0.7); e.gain.linearRampToValueAtTime(0, t + d);
    s.connect(bp); bp.connect(lp); lp.connect(e); e.connect(v.out);
    s.start(t, rnd() * 0.5); s.stop(t + d + 0.05); track(v, s);
  }
  function lap(t, w) {
    const d = rr(0.45, 1.1), v = ambVoice(t, 1, rr(-0.6, 0.6), 0.2, d); if (!v) return;
    const f = rr(320, 750);
    nz(v, { b: 'p', d, a: rr(0.08, 0.25), g: 0.085 * w * rr(0.4, 1), ft: 'lowpass', f, f2: f * rr(0.5, 0.8), q: rr(0.7, 2) });
    if (rnd() < 0.1) { const pf = rr(650, 1050); tone(v, { f: pf, f2: pf * 1.8, fd: 0.04, at: rr(0, 0.3), d: 0.06, g: 0.015 }); }
  }

  // Espèces d'oiseaux synthétisées (toutes originales)
  const BIRDS = {
    pinson: { w: (f, o, n) => (n ? 0 : 0.8 + f), fn(v) {        // série de pépiements descendants + fioriture
      let at = 0; const n = ri(3, 6), f0 = rr(3000, 3900);
      for (let i = 0; i < n; i++) { const f = f0 * rr(0.95, 1.05); tone(v, { f, f2: f * 0.62, at, d: 0.055, g: 0.03 }); at += rr(0.07, 0.11); }
      tone(v, { f: f0 * 1.1, f2: f0 * 0.5, at: at + 0.03, d: 0.18, g: 0.028 });
    } },
    trille: { w: (f, o, n) => (n ? 0 : 0.6 + 0.6 * o), fn(v) {   // trille rapide
      const d = rr(0.7, 1.4), f = rr(2900, 3500);
      fm(v, { f, f2: f * rr(0.85, 1.1), mf: rr(20, 30), dev: rr(250, 450), dev2: rr(150, 300), d, a: d * 0.3, g: 0.02 });
    } },
    coucou: { w: (f, o, n) => (n ? 0 : 1.2 * f), fn(v) {         // appel à deux notes, lointain
      const f1 = rr(640, 720), f2 = f1 * 0.8;
      let at = 0;
      for (let i = 0; i < ri(2, 3); i++) {
        tone(v, { f: f1, f2: f1 * 0.98, at, d: 0.24, a: 0.03, g: 0.04 }); tone(v, { f: f1 * 2, at, d: 0.15, a: 0.03, g: 0.004 });
        tone(v, { f: f2, f2: f2 * 0.97, at: at + 0.28, d: 0.36, a: 0.04, g: 0.035 });
        at += rr(0.95, 1.15);
      }
    } },
    pic: { w: (f, o, n) => (n ? 0 : 0.9 * f), fn(v) {             // pic qui tambourine au loin
      let at = 0, dt = rr(0.05, 0.06); const n = ri(12, 19), f = rr(900, 1300);
      for (let i = 0; i < n; i++) {
        const a = 0.04 * (i < 3 ? 0.6 + i * 0.15 : 1 - i / n * 0.6);
        nz(v, { at, d: 0.02, g: a, ft: 'bandpass', f, q: 4 }); tone(v, { f: f * 0.55, at, d: 0.015, g: a * 0.4 });
        at += dt; dt *= rr(1.0, 1.04);
      }
    } },
    fauvette: { w: (f, o, n) => (n ? 0 : 0.7 + 0.4 * f), fn(v) { // chant volubile
      let at = 0;
      for (let i = 0; i < ri(5, 9); i++) {
        const f = rr(2200, 3600), d = rr(0.06, 0.12);
        tone(v, { f, f2: f * rr(0.85, 1.2), at, d, a: 0.01, g: 0.022 * rr(0.6, 1) }); at += d + rr(0.02, 0.06);
      }
    } },
    tourterelle: { w: (f, o, n) => (n ? 0 : 0.3 + 0.7 * o), fn(v) { // roucoulement grave
      const f = rr(380, 440);
      let at = 0;
      for (const [d, k] of [[0.25, 1], [0.38, 1.06], [0.28, 0.97]]) {
        tone(v, { f: f * k, f2: f * k * 0.96, at, d, a: 0.06, g: 0.04 }); tone(v, { f: f * k * 2, at, d: d * 0.7, a: 0.06, g: 0.004, type: 'triangle' });
        at += d + rr(0.08, 0.14);
      }
    } },
    merle: { w: (f, o, n) => (n ? 0 : 0.8), fn(v) {              // phrase sifflée, mélodieuse
      let at = 0;
      for (let i = 0; i < ri(3, 5); i++) {
        const f = rr(1500, 2500), d = rr(0.1, 0.22);
        tone(v, { f, f2: f * rr(0.85, 1.25), at, d, a: 0.02, g: 0.03 }); at += d + rr(0.04, 0.1);
      }
    } },
    chouette: { w: (f, o, n) => (n ? 1 : 0), fn(v) {             // hululement nocturne
      tone(v, { f: rr(370, 390), f2: 350, d: 0.4, a: 0.06, g: 0.04 });
      const t2 = rr(0.85, 1.05); fm(v, { f: rr(365, 380), f2: 345, mf: rr(9, 13), dev: 12, dev2: 6, at: t2, d: 0.65, a: 0.1, g: 0.035 });
    } }
  };
  function bird(t) {
    const f = sc.forest, o = sc.open, n = sc.night > 0.5;
    const names = Object.keys(BIRDS).filter(k => k !== AM.lastSp);
    let tot = 0; const ws = names.map(k => { const w = Math.max(0, BIRDS[k].w(f, o, n)); tot += w; return w; });
    if (tot <= 0) return;
    let x = rnd() * tot, i = 0; while (x > ws[i] && i < ws.length - 1) x -= ws[i++];
    const sp = names[i], dist = rr(0.35, 1);
    const v = ambVoice(t, dist, rr(-0.9, 0.9), 0.15 + (1 - dist) * 0.5, 3.5); if (!v) return;
    AM.lastSp = sp;
    const lp = filt(v, 'lowpass', 2000 + dist * 3000, 0.5);        // plus lointain = plus sourd
    lp.connect(v.out);
    const out = v.out; v.out = lp; BIRDS[sp].fn(v); v.out = out;
  }
  function crickets(t) {
    const v = ambVoice(t, 1, rr(-0.8, 0.8), 0.2, 3); if (!v) return;
    const f = rr(3700, 4400), s = ctx.createOscillator(), e = mk(v, gainNode(0)), g = 0.009 * rr(0.6, 1);
    s.type = 'sine'; s.frequency.value = f;
    let at = t; const reps = ri(3, 6), pulses = ri(3, 4);
    for (let r = 0; r < reps; r++) {
      for (let p = 0; p < pulses; p++) {
        const a = at + p * 0.03;
        e.gain.setValueAtTime(0, a); e.gain.linearRampToValueAtTime(g, a + 0.006); e.gain.linearRampToValueAtTime(0, a + 0.018);
      }
      at += rr(0.3, 0.45);
    }
    s.connect(e); e.connect(v.out); s.start(t); s.stop(at + 0.1); track(v, s);
  }

  function ambTick(now, ahead) {
    const L = SESS.L, f = sc.forest, wa = sc.water, op = sc.open, ba = sc.battle, ni = sc.night > 0.5;
    // Vent : marche aléatoire lente du niveau et du timbre, rafales occasionnelles
    if (now >= AM.nextWind) {
      AM.nextWind = now + rr(1.5, 5);
      if (AM.gustEnd < now && rnd() < 0.12) { AM.gustEnd = now + rr(3, 7); if (f > 0.25) leaves(now + rr(0.3, 1.2), f); }
      const gust = AM.gustEnd > now ? rr(1.5, 2.2) : 1;
      const lv = (0.05 + 0.065 * op + 0.025 * (1 - f)) * rr(0.55, 1.15) * gust * (ni ? 0.7 : 1);
      L.w1.g.gain.setTargetAtTime(lv, now, rr(1.2, 3.5));
      L.w1.f.frequency.setTargetAtTime(rr(220, 520) * (gust > 1 ? 1.4 : 1), now, rr(1.5, 4));
      L.w2.g.gain.setTargetAtTime(lv * rr(0.12, 0.35) * (0.5 + op), now, rr(1.5, 4));
      L.w2.f.frequency.setTargetAtTime(rr(500, 1100), now, rr(2, 5));
    }
    L.wa.g.gain.setTargetAtTime(wa * 0.032, now, 2);
    // Événements ponctuels (processus aléatoires, jamais périodiques)
    if (AM.nextLeaf < now - 2) AM.nextLeaf = now + rr(1, 4);
    while (AM.nextLeaf < ahead) { if (rnd() < f * 0.8) leaves(AM.nextLeaf, f); AM.nextLeaf += expRand(7) + 1.5; }
    if (AM.nextWater < now - 2) AM.nextWater = now + rr(0.3, 1);
    while (AM.nextWater < ahead) { if (rnd() < wa) lap(AM.nextWater, wa); AM.nextWater += rr(0.35, 1.5) + expRand(0.6); }
    if (AM.nextBird < now - 2) AM.nextBird = now + rr(1, 5);
    while (AM.nextBird < ahead) {
      const p = (ni ? 0.12 : 0.25 + 0.6 * f + 0.15 * op) * (1 - 0.75 * cl(ba, 0, 1));
      if (rnd() < p) bird(AM.nextBird);
      AM.nextBird += expRand(6) + 1.2;
    }
    if (AM.nextBug < now - 2) AM.nextBug = now + rr(2, 6);
    while (AM.nextBug < ahead) {
      if (rnd() < op * (ni ? 0.9 : 0.25) * (1 - 0.8 * cl(ba, 0, 1))) crickets(AM.nextBug);
      AM.nextBug += expRand(9) + 2;
    }
  }

  // ---------- Ordonnanceur léger (toutes les 250 ms, 0,6 s d'avance) ----------
  function tick() {
    if (!ctx || !started || !SESS || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    try {
      if (!SESS.init) {
        SESS.init = true; lastTick = now;
        for (const g of SESS.gains) { g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(1, now + 3); }
        M.nextChord = now + 0.2; M.nextMel = now + rr(18, 40); M.pat = null;
        ambStart(now);
      }
      const dt = Math.min(2, Math.max(0, now - lastTick)); lastTick = now;
      for (const k in scT) {
        const tc = k === 'battle' ? (scT.battle > sc.battle ? 2.5 : 9) : 4;
        sc[k] += (scT[k] - sc[k]) * (1 - Math.exp(-dt / tc));
      }
      const ahead = now + 0.6;
      musicTick(now, ahead);
      ambTick(now, ahead);
    } catch (e) { /* jamais d'erreur visible pour le joueur */ }
  }

  function newSession() {
    const mus = { dry: gainNode(0), wet: gainNode(0) }, amb = { dry: gainNode(0), wet: gainNode(0) };
    mus.dry.connect(N.music.dry); mus.wet.connect(N.music.wet); amb.dry.connect(N.amb.dry); amb.wet.connect(N.amb.wet);
    const s = { mus, amb, gains: [mus.dry, mus.wet, amb.dry, amb.wet], loops: [], nodes: [], srcs: new Set(), init: false, L: null };
    mus.S = amb.S = s;
    return s;
  }

  // ---------- API R.audio ----------
  A.start = function () {
    const c = ensure(); if (!c) return false;
    S.unlock();
    if (started) return true;
    started = true;
    SESS = newSession();
    if (!timer) timer = setInterval(tick, 250);
    tick();
    return true;
  };
  A.stop = function () {
    if (!started) return;
    started = false;
    if (timer) { clearInterval(timer); timer = null; }
    const s = SESS; SESS = null;
    if (!s || !ctx) return;
    const now = ctx.currentTime;
    for (const g of s.gains) { g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(g.gain.value, now); g.gain.linearRampToValueAtTime(0, now + 1.5); }
    setTimeout(() => {
      for (const l of s.loops) { try { l.stop(); } catch (e) { /* déjà arrêté */ } disc(l); }
      for (const x of Array.from(s.srcs)) { try { x.stop(); } catch (e) { /* pas encore démarrée ou déjà finie */ } }
      for (const n of s.nodes) disc(n);
      for (const g of s.gains) disc(g);
    }, 1700);
  };
  A.pause = function (p) {
    paused = !!p;
    applyVol('music', 0.35); applyVol('amb', 0.35);
  };
  A.setVol = function (kind, v) {
    if (!(kind in vol)) return;
    vol[kind] = cl(num(+v, vol[kind]), 0, 1);
    lsSet('roy.vol.' + kind, String(Math.round(vol[kind] * 100) / 100));
    applyVol(kind);
  };
  A.getVol = function (kind) { return kind in vol ? vol[kind] : 0; };
  A.setScene = function (s) {
    if (!s || typeof s !== 'object') return;
    for (const k of ['forest', 'water', 'open', 'battle']) if (k in s) scT[k] = cl(num(+s[k], scT[k]), 0, 1);
    if ('age' in s) scT.age = cl(num(+s.age, scT.age), 1, 4);
    if ('night' in s) scT.night = s.night ? 1 : 0;
  };
  A.isStarted = function () { return started; };
  // Diagnostic (tests) : état et nœuds internes
  A.stats = function () {
    const now = ctx ? ctx.currentTime : 0;
    return {
      state: ctx ? ctx.state : 'aucun', started, paused,
      voices: sfxAct.filter(a => a.end > now).length, amb: ambAct.filter(e => e > now).length, sources: liveSrc,
      scene: Object.assign({}, sc), mode: M.mode ? M.mode.n : null
    };
  };
  A._nodes = function () { return N ? { ctx, sfx: N.sfx.vol, music: N.music.vol, amb: N.amb.vol, rev: N.revOut, out: N.out } : null; };
  A.SOUNDS = Object.keys(SND).concat(Object.keys(SEL_B).filter(k => k !== '_').map(k => 'sel_' + k), ['sel_unit']);
  A.UNIT_SOUNDS = Object.keys(SEL_U).filter(k => k !== '_');

  // Page masquée : on suspend le contexte (batterie), on reprend au retour
  if (DOC && DOC.addEventListener) {
    DOC.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (DOC.hidden) { if (ctx.state === 'running') ctx.suspend().catch(() => {}); }
      else if (unlocked) ctx.resume().catch(() => {});
    });
  }
})(typeof globalThis !== 'undefined' ? (globalThis.R = globalThis.R || {}) : (window.R = window.R || {}));
