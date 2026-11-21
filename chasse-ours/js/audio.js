/* Chassé d'Ours — son. Tout est synthétisé en WebAudio : nappes, arpèges, nature, bruitages d'impact. */
const Snd = (() => {
  'use strict';
  let ctx = null, master, musicBus, musicLP, sfxBus, revIn, noise, padLP, arpBus, natureBus;
  let mood = 'calm', muted = false, step = 0, nextT = 0, chord = 0, ch = null, rushG = null, rushF = null, rushK = 0;
  const pads = new Set();
  const STEP = 0.125;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  // Ré majeur, quatre accords ouverts qui tournent lentement
  const CHORDS = [[50, 57, 64, 66, 73], [47, 54, 62, 64, 69], [43, 50, 59, 66, 69], [45, 52, 59, 62, 66]];
  const ARP = [0, 2, 4, 1, 3, 4, 2, 3, 0, 4, 2, 3, 1, 4, 3, 2];
  const TOMS = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 0];
  const now = () => ctx.currentTime;

  function makeIR(sec) {
    const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6); }
    return b;
  }

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ctx = new AC(); } catch (e) { ctx = null; return; }
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.25;
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9;
    master.connect(comp); comp.connect(ctx.destination);

    const rev = ctx.createConvolver(); rev.buffer = makeIR(3.2);
    revIn = ctx.createGain(); revIn.connect(rev);
    const revOut = ctx.createGain(); revOut.gain.value = 0.5; rev.connect(revOut); revOut.connect(master);

    musicLP = ctx.createBiquadFilter(); musicLP.type = 'lowpass'; musicLP.frequency.value = 18000;
    musicBus = ctx.createGain(); musicBus.gain.value = 0.85; musicBus.connect(musicLP); musicLP.connect(master);
    const mRev = ctx.createGain(); mRev.gain.value = 0.45; musicLP.connect(mRev); mRev.connect(revIn);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    natureBus = ctx.createGain(); natureBus.gain.value = 1; natureBus.connect(master);
    const nRev = ctx.createGain(); nRev.gain.value = 0.5; natureBus.connect(nRev); nRev.connect(revIn);

    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    // nappes : filtre commun qui respire lentement
    padLP = ctx.createBiquadFilter(); padLP.type = 'lowpass'; padLP.frequency.value = 780; padLP.Q.value = 0.6;
    padLP.connect(musicBus);
    const lfo = ctx.createOscillator(), lfoG = ctx.createGain(); lfo.frequency.value = 0.07; lfoG.gain.value = 240;
    lfo.connect(lfoG); lfoG.connect(padLP.frequency); lfo.start();

    // arpège : écho pointé pour le côté pétillant
    arpBus = ctx.createGain(); arpBus.gain.value = 1; arpBus.connect(musicBus);
    const dl = ctx.createDelay(1); dl.delayTime.value = STEP * 3;
    const fb = ctx.createGain(); fb.gain.value = 0.36; const dw = ctx.createGain(); dw.gain.value = 0.5;
    arpBus.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(dw); dw.connect(musicBus);

    // vent
    const ws = ctx.createBufferSource(); ws.buffer = noise; ws.loop = true;
    const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 420; wf.Q.value = 0.5;
    const wg = ctx.createGain(); wg.gain.value = 0.05;
    const wl = ctx.createOscillator(), wlg = ctx.createGain(), wlf = ctx.createGain(); wl.frequency.value = 0.11; wlg.gain.value = 0.03; wlf.gain.value = 160;
    wl.connect(wlg); wlg.connect(wg.gain); wl.connect(wlf); wlf.connect(wf.frequency); wl.start();
    ws.connect(wf); wf.connect(wg); wg.connect(natureBus); ws.start();

    // souffle du sprint : un bruit filtré qui monte avec la vitesse
    const rs = ctx.createBufferSource(); rs.buffer = noise; rs.loop = true; rushF = ctx.createBiquadFilter(); rushF.type = 'bandpass'; rushF.frequency.value = 700; rushF.Q.value = 0.7;
    rushG = ctx.createGain(); rushG.gain.value = 0; rs.connect(rushF); rushF.connect(rushG); rushG.connect(sfxBus); rs.start();
    nextT = ctx.currentTime + 0.1; step = 0;
    setInterval(schedule, 60);
  }

  function schedule() {
    if (!ctx || ctx.state !== 'running') return;
    if (nextT < ctx.currentTime - 0.4) nextT = ctx.currentTime + 0.05;
    while (nextT < ctx.currentTime + 0.25) { tick(step, nextT); step++; nextT += STEP; }
  }

  function tick(s, t) {
    if (s % 64 === 0) { chord = (s / 64) % 4; padChord(CHORDS[chord], t, 64 * STEP); }
    const c = CHORDS[chord];
    if (mood !== 'calm') {
      if (s % 2 === 0 || Math.random() < 0.45) {
        const oct = (s % 8 >= 4 || Math.random() < 0.3) ? 24 : 12;
        pluck(mtof(c[ARP[s % 16]] + oct), t, s % 4 === 0 ? 0.15 : 0.09);
      }
      if (s % 2 === 0) shaker(t, s % 4 === 2 ? 0.08 : 0.04); else if (Math.random() < 0.5) shaker(t, 0.022);
    }
    if (mood === 'sighted' && (s % 16 === 0 || s % 16 === 3)) tone(t, 0.2, 'sine', 78, 42, 0.32, musicBus);
    if (mood === 'alert') {
      if (TOMS[s % 16]) tom(t, s % 16 === 0 ? 62 : (s % 3 ? 92 : 78), s % 16 === 0 ? 0.6 : 0.4);
      if (s % 4 === 0) bass(mtof(c[0] - 12), t);
    }
    if (mood === 'calm' && Math.random() < 0.04) bird(t + Math.random() * 0.1);
  }

  function padChord(notes, t, dur) {
    notes.forEach((m, i) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 2.8);
      g.gain.setValueAtTime(0.05, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 4);
      g.connect(padLP);
      for (const det of [-8, 7]) {
        const o = ctx.createOscillator(); o.type = i < 2 ? 'triangle' : 'sawtooth';
        o.frequency.value = mtof(m); o.detune.value = det; o._d = det;
        o.connect(g); o.start(t); o.stop(t + dur + 4.1);
        pads.add(o); o.onended = () => pads.delete(o);
      }
    });
  }

  function pluck(f, t, vol) {
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2; const g2 = ctx.createGain(); g2.gain.value = 0.35;
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(arpBus);
    o.start(t); o2.start(t); o.stop(t + 0.45); o2.stop(t + 0.45);
  }
  const shaker = (t, vol) => nz(t, 0.045, 'highpass', 6500, 0.7, vol, musicBus);
  function tom(t, f, vol) { tone(t, 0.28, 'sine', f * 1.7, f, vol, musicBus); nz(t, 0.05, 'lowpass', 900, 0.7, vol * 0.3, musicBus); }
  function bass(f, t) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.2, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(lp); lp.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.35);
  }
  function bird(t) {
    const base = 2400 + Math.random() * 2000, n = 2 + Math.floor(Math.random() * 3), up = Math.random() < 0.6;
    let dest = natureBus;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.random() * 1.6 - 0.8; p.connect(natureBus); dest = p; }
    for (let i = 0; i < n; i++) {
      const tt = t + i * 0.11;
      tone(tt, 0.08, 'sine', up ? base : base * 1.35, up ? base * 1.35 : base, 0.03 + Math.random() * 0.02, dest, 0.01);
    }
  }

  /* ---------- briques de bruitage ---------- */
  function tone(t, dur, type, f1, f2, vol, dest, atk) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type;
    o.frequency.setValueAtTime(f1, t);
    if (f2 && f2 !== f1) o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + (atk || 0.004)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || sfxBus); o.start(t); o.stop(t + dur + 0.05);
    return g;
  }
  function nz(t, dur, type, f, q, vol, dest, f2) {
    const s = ctx.createBufferSource(); s.buffer = noise;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(dest || sfxBus);
    s.start(t, Math.random() * 1.2); s.stop(t + dur + 0.05);
    return g;
  }
  const ok = () => ctx && ctx.state !== 'closed';

  /* ---------- le coup ---------- */
  function impact(p, mega) {
    if (!ok()) return;
    const t = now(), v = 0.55 + 0.45 * Math.min(1, p);
    tone(t, 0.9 + 0.5 * p, 'sine', 175, 30, 1.0 * v);                       // le sub qui tombe : la lourdeur
    tone(t, 0.16, 'triangle', 270, 55, 0.7 * v);                            // le poing dans le ventre
    nz(t, 0.07, 'highpass', 1800, 0.7, 0.9 * v).connect(revIn);             // le claquement
    nz(t, 0.34, 'lowpass', 750, 0.7, 0.9 * v, null, 120).connect(revIn);    // le corps
    nz(t + 0.02, 1.8 + p, 'lowpass', 150, 0.5, 0.6 * v, null, 40).connect(revIn); // le grondement qui roule
    if (mega) {
      tone(t, 1.7, 'sine', 95, 24, 1.0);
      nz(t, 1.6, 'bandpass', 5200, 0.8, 0.32).connect(revIn);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(300, t + 1.8);
      lp.connect(sfxBus); lp.connect(revIn);
      [38, 50, 57, 62, 66, 69].forEach(m => tone(t, 1.9, 'sawtooth', mtof(m), mtof(m), 0.075, lp, 0.01));
    }
    // la musique s'écrase sous le coup
    musicBus.gain.cancelScheduledValues(t); musicBus.gain.setValueAtTime(0.22, t); musicBus.gain.linearRampToValueAtTime(0.85, t + 1.6);
  }
  function slowmo(dur) {
    if (!ok()) return;
    const t = now();
    musicLP.frequency.cancelScheduledValues(t);
    musicLP.frequency.setTargetAtTime(260, t, 0.03);
    musicLP.frequency.setTargetAtTime(18000, t + dur * 0.6, dur * 0.22);
    pads.forEach(o => { o.detune.cancelScheduledValues(t); o.detune.setTargetAtTime(o._d - 420, t, 0.05); o.detune.setTargetAtTime(o._d, t + dur * 0.55, dur * 0.2); });
  }
  function whoosh(p) {
    if (!ok()) return;
    const t = now(), s = ctx.createBufferSource(); s.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.3;
    f.frequency.setValueAtTime(350, t); f.frequency.exponentialRampToValueAtTime(2600, t + 0.1); f.frequency.exponentialRampToValueAtTime(500, t + 0.3);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5 * p, t + 0.07); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t); s.stop(t + 0.4);
  }
  function chargeStart() {
    if (!ok() || ch) return;
    const t = now();
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(); o1.type = o2.type = 'sawtooth'; o1.frequency.value = 55; o2.frequency.value = 82.6;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180; lp.Q.value = 7;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    const tr = ctx.createOscillator(), trG = ctx.createGain(); tr.frequency.value = 9; trG.gain.value = 0.02; tr.connect(trG); trG.connect(g.gain);
    o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(sfxBus); g.connect(revIn);
    o1.start(t); o2.start(t); tr.start(t);
    ch = { o1, o2, lp, g, tr };
  }
  function chargeSet(c) {
    if (!ch) return;
    const t = now(), f = 55 + 55 * c;
    ch.o1.frequency.setTargetAtTime(f, t, 0.05); ch.o2.frequency.setTargetAtTime(f * 1.503, t, 0.05);
    ch.lp.frequency.setTargetAtTime(180 + 2400 * c * c, t, 0.05); ch.g.gain.setTargetAtTime(0.03 + 0.1 * c, t, 0.05);
    ch.tr.frequency.setTargetAtTime(9 + 14 * c, t, 0.05);
  }
  function chargeStop() {
    if (!ch) return;
    const t = now(), c = ch; ch = null;
    c.g.gain.cancelScheduledValues(t); c.g.gain.setTargetAtTime(0.0001, t, 0.03);
    [c.o1, c.o2, c.tr].forEach(o => o.stop(t + 0.2));
  }
  function step_(grass, vol) {
    if (!ok()) return;
    const t = now();
    if (grass) nz(t, 0.14, 'bandpass', 3200 + Math.random() * 1200, 0.8, 0.07 * vol);
    else { nz(t, 0.06, 'lowpass', 700 + Math.random() * 300, 0.7, 0.16 * vol); tone(t, 0.05, 'sine', 110, 60, 0.07 * vol); }
  }
  function growl(pitch, vol, dur) {
    if (!ok()) return;
    const t = now();
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(95 * pitch, t); o.frequency.linearRampToValueAtTime(135 * pitch, t + dur * 0.25); o.frequency.linearRampToValueAtTime(68 * pitch, t + dur);
    const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 27; lg.gain.value = 24 * pitch; l.connect(lg); lg.connect(o.frequency);
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 520; f1.Q.value = 3;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1150; f2.Q.value = 4;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.08); g.gain.setValueAtTime(vol, t + dur * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(sfxBus); g.connect(revIn);
    o.start(t); l.start(t); o.stop(t + dur + 0.05); l.stop(t + dur + 0.05);
    nz(t, dur, 'bandpass', 700, 1, vol * 0.35, null, 400);
  }
  const roar = (size) => growl(1.15 / size, 0.55, 1.0);
  const yelp = (size) => growl(2.2 / size, 0.5, 0.32);
  function fly(delay) {
    if (!ok()) return;
    const t = now() + delay, g = tone(t, 1.5, 'sine', 1700, 420, 0.06, null, 0.08); g.connect(revIn);
  }
  function twinkle() {
    if (!ok()) return;
    const t = now();
    [[2637, 0, 0.12], [3951, 0.02, 0.08], [3136, 0.11, 0.07], [5274, 0.16, 0.05]].forEach(([f, d, v]) => tone(t + d, 0.9, 'sine', f, f, v).connect(revIn));
  }
  function spot() {
    if (!ok()) return;
    const t = now();
    [62, 66, 69, 73, 76, 81].forEach((m, i) => pluck(mtof(m + 12), t + i * 0.055, 0.12));
    nz(t + 0.3, 0.7, 'highpass', 7000, 0.7, 0.05).connect(revIn);
  }
  function alert() {
    if (!ok()) return;
    const t = now();
    [38, 44, 45, 51].forEach(m => tone(t, 0.7, 'sawtooth', mtof(m), mtof(m) * 0.97, 0.1, null, 0.02).connect(revIn));
    tone(t, 0.4, 'sine', 90, 45, 0.5);
  }
  function levelUp() {
    if (!ok()) return;
    const t = now();
    [62, 66, 69, 74, 78, 81, 86].forEach((m, i) => pluck(mtof(m), t + i * 0.08, 0.16));
    nz(t + 0.5, 1.4, 'highpass', 6000, 0.7, 0.07).connect(revIn);
    tone(t + 0.56, 1.6, 'triangle', mtof(50), mtof(50), 0.2).connect(revIn);
  }
  function hurt() {
    if (!ok()) return;
    const t = now();
    tone(t, 0.35, 'sine', 140, 40, 0.9); nz(t, 0.2, 'lowpass', 1200, 0.7, 0.6);
    tone(t, 0.5, 'sawtooth', 311, 147, 0.12).connect(revIn);
  }
  function pickup() { if (!ok()) return; const t = now(); pluck(mtof(81), t, 0.14); pluck(mtof(88), t + 0.07, 0.14); }
  function perfect() { if (!ok()) return; const t = now(); tone(t, 0.5, 'sine', 1760, 1760, 0.1).connect(revIn); tone(t, 0.5, 'sine', 2637, 2637, 0.07).connect(revIn); }
  function ui() { if (!ok()) return; tone(now(), 0.08, 'triangle', 660, 880, 0.1); }
  function swipe() { if (!ok()) return; const t = now(); nz(t, 0.18, 'bandpass', 900, 1.2, 0.4, null, 2400); }
  function bell(p) {
    if (!ok()) return;
    const t = now(), v = 0.35 + 0.65 * p;
    [[1, 0.5, 5], [2.0, 0.3, 4], [2.4, 0.22, 3.2], [3.0, 0.16, 2.6], [4.2, 0.1, 1.8], [5.4, 0.07, 1.2]].forEach(([k, a, d]) => tone(t, d, 'sine', 196 * k, 196 * k, a * v, null, 0.003).connect(revIn));
    nz(t, 0.05, 'highpass', 2500, 0.7, 0.5 * v);
  }
  // mur du son : deux claquements secs rapprochés, puis le grondement qui roule
  function boom(tier) {
    if (!ok()) return;
    const t = now();
    nz(t, 0.06, 'highpass', 1400, 0.7, 1.0).connect(revIn); nz(t + 0.085, 0.07, 'highpass', 900, 0.7, 0.9).connect(revIn);
    tone(t, 1.4, 'sine', 110, 26, 1.0); tone(t + 0.085, 0.9, 'triangle', 190, 40, 0.5);
    nz(t + 0.05, 2.6, 'lowpass', 220, 0.5, 0.7, null, 40).connect(revIn);
    if (tier >= 3) nz(t + 0.1, 1.6, 'bandpass', 900, 0.8, 0.3, null, 2600).connect(revIn);
    if (tier >= 4) [74, 81, 86].forEach((m, i) => tone(t + 0.15 + i * 0.05, 2.2, 'sine', mtof(m), mtof(m), 0.07).connect(revIn));
    musicBus.gain.cancelScheduledValues(t); musicBus.gain.setValueAtTime(0.15, t); musicBus.gain.linearRampToValueAtTime(0.85, t + 1.8);
  }
  function parry() { if (!ok()) return; const t = now(); nz(t, 0.09, 'bandpass', 3200, 2, 0.6).connect(revIn); tone(t, 0.18, 'square', 520, 240, 0.14); tone(t, 0.25, 'sine', 120, 60, 0.4); }
  function miss() { if (!ok()) return; tone(now(), 0.25, 'triangle', 300, 160, 0.08); }

  function setMood(m) {
    mood = m;
    if (!ok()) return;
    padLP.frequency.setTargetAtTime(m === 'calm' ? 780 : m === 'sighted' ? 1700 : 2400, now(), 0.6);
  }
  function setRush(k) { if (!rushG || Math.abs(k - rushK) < 0.02) return; rushK = k; const t = now(); rushG.gain.setTargetAtTime(0.16 * k, t, 0.06); rushF.frequency.setTargetAtTime(600 + 900 * k, t, 0.08); }
  function setMuted(v) { muted = v; if (ctx) master.gain.setTargetAtTime(v ? 0 : 0.9, now(), 0.03); }
  function suspend(v) { if (!ctx) return; if (v) ctx.suspend(); else ctx.resume(); }

  return { init, setMood, setRush, setMuted, suspend, impact, slowmo, whoosh, chargeStart, chargeSet, chargeStop, step: step_, roar, yelp, growl, fly, twinkle, spot, alert, levelUp, hurt, pickup, perfect, ui, swipe, miss, bell, parry, boom, get muted() { return muted; } };
})();
