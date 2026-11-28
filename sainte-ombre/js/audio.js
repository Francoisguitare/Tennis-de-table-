/* Sainte-Ombre — tout le son est fabriqué en direct (Web Audio) : ambiance, pas, mécanismes, présences. */
const Snd = (() => {
  'use strict';
  let ac = null, master, comp, rev, revIn, noise, amb = null, vol = 0.9, boxTimer = null;
  const AC = window.AudioContext || window.webkitAudioContext;
  const now = () => ac.currentTime;

  function init() {
    if (ac || !AC) return;
    try { ac = new AC(); } catch (_) { ac = null; return; }
    master = ac.createGain(); master.gain.value = vol;
    comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ac.destination);
    rev = ac.createConvolver(); rev.buffer = impulse(3.4, 2.6); revIn = ac.createGain(); revIn.gain.value = 0.5; revIn.connect(rev); rev.connect(master);
    const len = ac.sampleRate * 2; noise = ac.createBuffer(1, len, ac.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    startAmbience();
  }
  function resume() { if (!ac) init(); if (ac && ac.state === 'suspended') ac.resume().catch(() => { }); }
  function impulse(sec, decay) {
    const n = Math.floor(ac.sampleRate * sec), b = ac.createBuffer(2, n, ac.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay) * (i < 200 ? i / 200 : 1); }
    return b;
  }
  // sortie : spatialisée si une position est donnée, avec un peu de réverbération
  function out(pos, wet) {
    const g = ac.createGain();
    if (pos) {
      const p = ac.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 1.6; p.rolloffFactor = 1.15; p.maxDistance = 80;
      if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
      g.connect(p); p.connect(master); const w = ac.createGain(); w.gain.value = wet == null ? 0.5 : wet; p.connect(w); w.connect(revIn);
    } else { g.connect(master); const w = ac.createGain(); w.gain.value = wet == null ? 0.35 : wet; g.connect(w); w.connect(revIn); }
    return g;
  }
  function env(g, t, a, peak, d, end) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); if (end) setTimeout(end, (a + d) * 1000 + 100); }
  function nz(dst, t, dur, type, f, q, rate) {
    const s = ac.createBufferSource(); s.buffer = noise; s.loop = true; s.playbackRate.value = rate || 1;
    const f1 = ac.createBiquadFilter(); f1.type = type; f1.frequency.value = f; f1.Q.value = q || 1; s.connect(f1); f1.connect(dst);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.1); return f1;
  }
  function osc(dst, t, dur, type, f, f2) {
    const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    o.connect(dst); o.start(t); o.stop(t + dur + 0.05); return o;
  }
  const ok = () => !!ac;

  /* ---------- ambiance continue : bourdon, vent, grondement ---------- */
  function startAmbience() {
    const t = now();
    const drone = ac.createGain(); drone.gain.value = 0.0; drone.connect(master);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180; lp.Q.value = 3; lp.connect(drone);
    const oscs = [55, 55.35, 82.6, 41.2].map((f, k) => { const o = ac.createOscillator(); o.type = k === 3 ? 'sine' : 'sawtooth'; o.frequency.value = f; const gg = ac.createGain(); gg.gain.value = k === 3 ? 0.5 : 0.18; o.connect(gg); gg.connect(lp); o.start(t); return o; });
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.07; const lg = ac.createGain(); lg.gain.value = 70; lfo.connect(lg); lg.connect(lp.frequency); lfo.start(t);
    const wind = ac.createGain(); wind.gain.value = 0; wind.connect(master); const ws = ac.createGain(); ws.gain.value = 0.6; wind.connect(ws); ws.connect(revIn);
    const s = ac.createBufferSource(); s.buffer = noise; s.loop = true; s.playbackRate.value = 0.5;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.9; s.connect(bp); bp.connect(wind); s.start(t);
    const wl = ac.createOscillator(); wl.frequency.value = 0.11; const wg = ac.createGain(); wg.gain.value = 320; wl.connect(wg); wg.connect(bp.frequency); wl.start(t);
    const rumble = ac.createGain(); rumble.gain.value = 0; rumble.connect(master);
    const rs = ac.createBufferSource(); rs.buffer = noise; rs.loop = true; rs.playbackRate.value = 0.25; const rl = ac.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 90; rs.connect(rl); rl.connect(rumble); rs.start(t);
    amb = { drone, wind, rumble, lp, oscs };
  }
  // zone : 0 intérieur, 1 cloître (vent), 2 ossuaire (grondement), 3 chapelle (vaste), 4 nef (tension)
  function setZone(z, tension) {
    if (!amb) return; const t = now(), k = 1.8;
    const D = [0.32, 0.18, 0.4, 0.26, 0.5][z] * (1 + (tension || 0) * 0.6), Wd = [0.03, 0.22, 0.0, 0.04, 0.05][z], R = [0.15, 0.05, 0.55, 0.1, 0.35][z];
    amb.drone.gain.setTargetAtTime(D * 0.5, t, k); amb.wind.gain.setTargetAtTime(Wd, t, k); amb.rumble.gain.setTargetAtTime(R, t, k);
    revIn.gain.setTargetAtTime([0.45, 0.3, 0.35, 0.95, 0.75][z], t, 1);
  }
  function silence(on) { if (amb) { const t = now(); amb.drone.gain.setTargetAtTime(on ? 0 : 0.15, t, 0.4); amb.wind.gain.setTargetAtTime(on ? 0 : 0.02, t, 0.4); amb.rumble.gain.setTargetAtTime(on ? 0 : 0.1, t, 0.4); } }
  function setListener(x, y, z, fx, fz) {
    if (!ac) return; const L = ac.listener;
    if (L.positionX) { const t = now(); L.positionX.setTargetAtTime(x, t, 0.03); L.positionY.setTargetAtTime(y, t, 0.03); L.positionZ.setTargetAtTime(z, t, 0.03); L.forwardX.setTargetAtTime(fx, t, 0.03); L.forwardY.setTargetAtTime(0, t, 0.03); L.forwardZ.setTargetAtTime(fz, t, 0.03); L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
    else { L.setPosition(x, y, z); L.setOrientation(fx, 0, fz, 0, 1, 0); }
  }

  /* ---------- pas ---------- */
  function step(kind, pos, soft) {
    if (!ok()) return; const t = now(), g = out(pos, 0.4), v = (soft ? 0.25 : 0.6) * (0.8 + Math.random() * 0.4);
    if (kind === 'snow') { env(g, t, 0.01, v * 0.6, 0.22); nz(g, t, 0.25, 'highpass', 1800 + Math.random() * 800, 0.5, 0.7); nz(g, t, 0.2, 'lowpass', 500, 1, 0.5); return; }
    if (kind === 'wood') { env(g, t, 0.004, v, 0.14); nz(g, t, 0.15, 'bandpass', 280 + Math.random() * 60, 4); const o = ac.createGain(); o.gain.value = 0.4; o.connect(g); osc(o, t, 0.1, 'sine', 120, 70); return; }
    if (kind === 'bone') { env(g, t, 0.003, v, 0.12); nz(g, t, 0.13, 'bandpass', 1200 + Math.random() * 900, 2); nz(g, t, 0.13, 'lowpass', 300, 1); return; }
    env(g, t, 0.003, v, 0.1); nz(g, t, 0.12, 'bandpass', 600 + Math.random() * 500, 1.6); const o = ac.createGain(); o.gain.value = 0.3; o.connect(g); osc(o, t, 0.06, 'sine', 90, 50);
  }

  /* ---------- mécanismes ---------- */
  function clank(pos, big) {
    if (!ok()) return; const t = now(), g = out(pos, 0.7); env(g, t, 0.002, big ? 1.0 : 0.6, big ? 1.4 : 0.7);
    nz(g, t, 0.2, 'bandpass', 2200, 3);
    [523, 1187, 1876, 2710].forEach((f, k) => { const gg = ac.createGain(); gg.gain.value = 0.25 / (k + 1); gg.connect(g); osc(gg, t, big ? 1.4 : 0.7, 'sine', f * (big ? 0.6 : 1) * (0.98 + Math.random() * 0.04)); });
    const th = ac.createGain(); th.gain.value = big ? 0.9 : 0.4; th.connect(g); osc(th, t, 0.25, 'sine', 110, 40);
  }
  function chain(pos, dur, dens) {
    if (!ok()) return; const t = now(); const n = Math.floor(dur * (dens || 22));
    for (let k = 0; k < n; k++) { const tt = t + Math.random() * dur, g = out(pos, 0.5); g.gain.setValueAtTime(0.0001, tt); g.gain.linearRampToValueAtTime(0.12 + Math.random() * 0.12, tt + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.07); nz(g, tt, 0.08, 'bandpass', 3000 + Math.random() * 3000, 6); }
  }
  function creak(pos, dur, pitch) {
    if (!ok()) return; const t = now(), g = out(pos, 0.6); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.35, t + 0.15); g.gain.setValueAtTime(0.35, t + dur - 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(28 * (pitch || 1), t);
    for (let k = 1; k < 8; k++) o.frequency.linearRampToValueAtTime((18 + Math.random() * 40) * (pitch || 1), t + dur * k / 8);
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900 * (pitch || 1); bp.Q.value = 9; const bp2 = ac.createBiquadFilter(); bp2.type = 'bandpass'; bp2.frequency.value = 1700 * (pitch || 1); bp2.Q.value = 12;
    o.connect(bp); o.connect(bp2); bp.connect(g); bp2.connect(g); o.start(t); o.stop(t + dur + 0.1);
  }
  function grind(pos, dur) {
    if (!ok()) return; const t = now(), g = out(pos, 0.7); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.7, t + 0.3); g.gain.setValueAtTime(0.7, t + dur - 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    nz(g, t, dur, 'lowpass', 260, 2, 0.6); const o = ac.createGain(); o.gain.value = 0.5; o.connect(g); osc(o, t, dur, 'sine', 38, 30);
  }
  let winchLoop = null;
  function winch(on, pos) {
    if (!ok()) return;
    if (on && !winchLoop) { const g = out(pos, 0.5); g.gain.value = 0.0001; g.gain.linearRampToValueAtTime(0.28, now() + 0.2); const f = nz(g, now(), 600, 'bandpass', 700, 3, 0.8); const iv = setInterval(() => chain(pos, 0.35, 18), 330); winchLoop = { g, f, iv }; }
    else if (!on && winchLoop) { const w = winchLoop; winchLoop = null; clearInterval(w.iv); w.g.gain.setTargetAtTime(0.0001, now(), 0.08); setTimeout(() => { try { w.g.disconnect(); } catch (_) { /* rien */ } }, 600); }
  }
  function lock(pos) { if (!ok()) return; clank(pos, false); setTimeout(() => clank(pos, false), 130); chain(pos, 0.3, 30); }

  /* ---------- présences ---------- */
  function knock(pos, n) {
    if (!ok()) return; n = n || 3;
    for (let k = 0; k < n; k++) { const t = now() + k * 0.42 + Math.random() * 0.05, g = out(pos, 0.8); env(g, t, 0.003, 1.0, 0.35); const o = ac.createGain(); o.gain.value = 1; o.connect(g); osc(o, t, 0.3, 'sine', 120, 42); nz(g, t, 0.15, 'lowpass', 400, 1); }
  }
  function whisper(pos, dur, loud) {
    if (!ok()) return; dur = dur || 2.2; const t = now(), g = out(pos, 0.9);
    g.gain.setValueAtTime(0.0001, t); let tt = t;
    while (tt < t + dur) { const sy = 0.08 + Math.random() * 0.22; g.gain.linearRampToValueAtTime((loud || 0.35) * (0.4 + Math.random() * 0.6), tt + sy * 0.3); g.gain.linearRampToValueAtTime(0.02, tt + sy); tt += sy + Math.random() * 0.08; }
    g.gain.linearRampToValueAtTime(0.0001, tt + 0.1);
    const f1 = nz(g, t, dur + 0.3, 'bandpass', 2600, 5); const f2 = nz(g, t, dur + 0.3, 'bandpass', 5200, 6);
    for (let k = 0; k < 10; k++) { const at = t + dur * k / 10; f1.frequency.linearRampToValueAtTime(1800 + Math.random() * 1600, at); f2.frequency.linearRampToValueAtTime(4000 + Math.random() * 2500, at); }
  }
  function breath(pos, slow) {
    if (!ok()) return; const t = now(), g = out(pos, 0.6), a = slow ? 1.4 : 0.9;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + a); g.gain.linearRampToValueAtTime(0.05, t + a + 0.2); g.gain.linearRampToValueAtTime(0.6, t + a + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + a * 2 + 0.8);
    const f = nz(g, t, a * 2 + 1, 'bandpass', 500, 1.2, 0.8); f.frequency.linearRampToValueAtTime(900, t + a); f.frequency.linearRampToValueAtTime(380, t + a * 2 + 0.6);
  }
  function heart(intensity) {
    if (!ok()) return; const t = now();
    for (const [dt, v] of [[0, 1], [0.24, 0.7]]) { const g = out(null, 0.05); env(g, t + dt, 0.01, 0.7 * intensity * v, 0.22); const o = ac.createGain(); o.gain.value = 1; o.connect(g); osc(o, t + dt, 0.2, 'sine', 62, 38); }
  }
  function stinger(strong) {
    if (!ok()) return; const t = now(), g = out(null, 0.8), dur = strong ? 4.5 : 3;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(strong ? 0.5 : 0.3, t + (strong ? 0.12 : 1.1)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(300, t); lp.frequency.exponentialRampToValueAtTime(strong ? 4000 : 1800, t + 1.2); lp.connect(g);
    [110, 116.5, 123.5, 155.6, 164.8, 233].forEach(f => { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f * (strong ? 2 : 1); o.detune.value = (Math.random() - 0.5) * 30; const gg = ac.createGain(); gg.gain.value = 0.12; o.connect(gg); gg.connect(lp); o.start(t); o.stop(t + dur); });
    if (strong) { nz(g, t, 0.5, 'highpass', 3000, 0.7); }
  }
  function vanish(pos) {
    if (!ok()) return; const t = now(), g = out(pos, 1); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    const f = nz(g, t, 1, 'bandpass', 300, 2); f.frequency.exponentialRampToValueAtTime(4000, t + 0.75);
  }
  function puff(pos) { if (!ok()) return; const t = now(), g = out(pos, 0.3); env(g, t, 0.02, 0.4, 0.25); nz(g, t, 0.3, 'lowpass', 700, 0.7); }
  function falls(pos) { if (!ok()) return; for (let k = 0; k < 6; k++) setTimeout(() => step('wood', pos), k * (60 + Math.random() * 120)); setTimeout(() => { const t = now(), g = out(pos, 0.6); env(g, t, 0.005, 0.8, 0.4); nz(g, t, 0.4, 'lowpass', 350, 1); }, 700); }
  // choeur grave : résolution d'une énigme
  function choir(dark) {
    if (!ok()) return; const t = now(), g = out(null, 1), dur = 6;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.28, t + 1.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const notes = dark ? [73.4, 110, 146.8, 174.6] : [73.4, 110, 146.8, 220, 277.2];
    const f1 = ac.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 720; f1.Q.value = 5; const f2 = ac.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1150; f2.Q.value = 6;
    f1.connect(g); f2.connect(g);
    notes.forEach((f, k) => { for (let v = 0; v < 2; v++) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f * (v ? 1.004 : 0.997); const vib = ac.createOscillator(); vib.frequency.value = 4.6 + k * 0.3; const vg = ac.createGain(); vg.gain.value = f * 0.006; vib.connect(vg); vg.connect(o.frequency); const gg = ac.createGain(); gg.gain.value = 0.18; o.connect(gg); gg.connect(f1); gg.connect(f2); o.start(t); vib.start(t); o.stop(t + dur); vib.stop(t + dur); } });
  }
  function bell(strength, pos) {
    if (!ok()) return; const t = now(), g = out(pos || null, 1.0), base = 196, dur = 3 + strength * 7;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.25 + strength * 0.75, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    [[0.5, 1, 1.4], [1, 0.8, 1], [1.19, 0.5, 0.8], [1.5, 0.35, 0.7], [2, 0.5, 0.6], [2.51, 0.25, 0.4], [2.66, 0.2, 0.35], [3.01, 0.15, 0.3], [4.1, 0.08, 0.2]].forEach(([r, a, l]) => {
      const gg = ac.createGain(); gg.gain.setValueAtTime(a * 0.3, t); gg.gain.exponentialRampToValueAtTime(0.0001, t + dur * l); gg.connect(g);
      const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = base * r * (1 + (Math.random() - 0.5) * 0.002); o.connect(gg); o.start(t); o.stop(t + dur);
    });
    nz(g, t, 0.05, 'bandpass', 2500, 2);
  }
  function toll(far) { if (!ok()) return; const t = now(), g = out(null, 1.2); const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = far ? 700 : 3000; lp.connect(g); g.gain.value = far ? 0.5 : 1; const base = 130.8;
    [[0.5, 1, 1.4], [1, 0.8, 1], [1.19, 0.5, 0.8], [1.5, 0.3, 0.6], [2, 0.4, 0.5], [2.66, 0.15, 0.3]].forEach(([r, a, l]) => { const gg = ac.createGain(); gg.gain.setValueAtTime(0.0001, t); gg.gain.linearRampToValueAtTime(a * 0.3, t + 0.01); gg.gain.exponentialRampToValueAtTime(0.0001, t + 9 * l); gg.connect(lp); const o = ac.createOscillator(); o.frequency.value = base * r; o.connect(gg); o.start(t); o.stop(t + 9); }); }
  function collapse(pos) {
    if (!ok()) return; const t = now(), g = out(pos, 0.8); env(g, t, 0.02, 1.0, 3.5); nz(g, t, 3.6, 'lowpass', 500, 1, 0.5);
    const o = ac.createGain(); o.gain.value = 0.8; o.connect(g); osc(o, t, 2.5, 'sine', 50, 28);
    for (let k = 0; k < 24; k++) setTimeout(() => step('stone', { x: pos.x + (Math.random() - 0.5) * 3, y: 0.5, z: pos.z + (Math.random() - 0.5) * 3 }), 80 + Math.random() * 1800);
  }
  function page() { if (!ok()) return; const t = now(); for (let k = 0; k < 3; k++) { const g = out(null, 0.1), tt = t + k * 0.07; env(g, tt, 0.01, 0.12, 0.12); nz(g, tt, 0.14, 'highpass', 3500, 0.5); } }
  function ui() { if (!ok()) return; const t = now(), g = out(null, 0.3); env(g, t, 0.003, 0.12, 0.25); osc(g, t, 0.25, 'sine', 440, 330); }
  function hum() { if (!ok()) return; const t = now(), g = out(null, 0.2); env(g, t, 0.01, 0.15, 0.3); osc(g, t, 0.3, 'triangle', 220, 180); }
  // la comptine : quelques notes de boîte à musique, lointaines
  const TUNE = [[880, 0.5], [1046.5, 0.5], [1318.5, 1], [1174.7, 0.5], [1046.5, 0.5], [987.8, 1], [880, 0.5], [987.8, 0.5], [1046.5, 0.5], [880, 1.5]];
  function musicBox(pos, on) {
    if (!ok()) return; if (boxTimer) { clearTimeout(boxTimer); boxTimer = null; }
    if (!on) return;
    let k = 0; const beat = 0.42;
    const next = () => {
      const [f, d] = TUNE[k % TUNE.length], t = now(), g = out(pos, 0.9); env(g, t, 0.003, 0.22, 1.2);
      const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.004); o.connect(g); o.start(t); o.stop(t + 1.3);
      const o2 = ac.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 3.01; const g2 = ac.createGain(); g2.gain.value = 0.12; o2.connect(g2); g2.connect(g); o2.start(t); o2.stop(t + 0.5);
      k++; boxTimer = setTimeout(next, (k % TUNE.length === 0 ? d * beat + 2.5 : d * beat) * 1000 * (1 + k * 0.004));
    };
    next();
  }
  function setVolume(v) { vol = v; if (master) master.gain.setTargetAtTime(v, now(), 0.1); }
  return { init, resume, setZone, silence, setListener, step, clank, chain, creak, grind, winch, lock, knock, whisper, breath, heart, stinger, vanish, puff, falls, choir, bell, toll, collapse, page, ui, hum, musicBox, setVolume, get ctx() { return ac; } };
})();
