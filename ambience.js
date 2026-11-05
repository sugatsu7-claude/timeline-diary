// diary-release: 2026.11.05.1
/* 烟雨声景 (ink theme only, off by default): gentle background music, occasional birdsong with an ink
   bird flying past, a water drop + ripple when empty background is tapped, and a seal thump when a
   diary is stamped. Music is either an endlessly varied guqin-like improvisation synthesised on the
   device (Karplus-Strong plucks on a pentatonic scale, with slides and harmonics) or a track the user
   picked from their own phone. No audio files ship with the app; everything works offline. */
(function () {
  'use strict';
  var KEY = 'ambience', root = document.documentElement, MUSIC_KEY = 'ambience-music';
  var cfg = { on: false, music: 'guqin', volume: 60, name: '' };
  try { var saved = DiaryStore.config(KEY, {}); cfg = { on: saved.on === true, music: saved.music || 'guqin', volume: saved.volume == null ? 60 : +saved.volume, name: saved.name || '' }; } catch (e) {}
  var ctx = null, voices = null, birdTimer = 0, musicTimer = 0, running = false, playing = '', mineEl = null, mineUrl = '', mineNode = null;
  var stats = { musicStarts: 0, notes: 0, birds: 0, drops: 0, thumps: 0, mineStarts: 0 };
  function ink() { return root.getAttribute('data-theme') === 'ink'; }
  function reducedMotion() { return matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function active() { return cfg.on && ink() && !document.hidden; }
  function save() { try { return DiaryStore.setConfig(KEY, cfg); } catch (e) { return Promise.resolve(); } }

  // ---- Voices: built for any AudioContext, so the same code can render an offline preview ----
  function makeVoices(c) {
    var out = c.createGain(); out.gain.value = 0.9; out.connect(c.destination);
    // A soft room: generated impulse response (decaying noise), mixed in as a send.
    var rev = c.createConvolver(), len = Math.floor(c.sampleRate * 2.6), ir = c.createBuffer(2, len, c.sampleRate);
    for (var ch = 0; ch < 2; ch++) { var d = ir.getChannelData(ch), lp = 0; for (var i = 0; i < len; i++) { lp = lp * 0.55 + (Math.random() * 2 - 1) * 0.45; d[i] = lp * Math.pow(1 - i / len, 2.4); } }
    rev.buffer = ir; var wet = c.createGain(); wet.gain.value = 0.38; rev.connect(wet); wet.connect(out);
    var music = c.createGain(); music.gain.value = 0; music.connect(out); music.connect(rev);
    var fx = c.createGain(); fx.gain.value = 1; fx.connect(out);
    var fxWet = c.createGain(); fxWet.gain.value = 0.55; fx.connect(fxWet); fxWet.connect(rev);
    var strings = {};
    function stringBuffer(freq) { // Karplus-Strong: a plucked string decaying naturally
      var key = Math.round(freq * 10); if (strings[key]) return strings[key];
      var sr = c.sampleRate, n = Math.floor(sr * 3.4), b = c.createBuffer(1, n, sr), y = b.getChannelData(0);
      var N = Math.max(2, Math.round(sr / freq)), prev = 0;
      for (var i = 0; i < N; i++) { var w = Math.random() * 2 - 1; prev = prev * 0.5 + w * 0.5; y[i] = prev; } // soft pluck (filtered noise)
      for (i = N; i < n; i++) y[i] = 0.9975 * 0.5 * (y[i - N] + y[i - N - 1 < 0 ? 0 : i - N - 1]);
      return (strings[key] = b);
    }
    function pluck(freq, t, vol, slide) {
      var s = c.createBufferSource(); s.buffer = stringBuffer(freq);
      if (slide) { s.playbackRate.setValueAtTime(1, t + 0.35); s.playbackRate.linearRampToValueAtTime(slide, t + 0.75); }   // 上下滑音
      else { s.playbackRate.setValueAtTime(1, t); s.playbackRate.setTargetAtTime(1.004, t + 0.5, 0.25); }               // a little 吟揉
      var body = c.createBiquadFilter(); body.type = 'lowpass'; body.frequency.value = 2600; body.Q.value = 0.6;
      var warm = c.createBiquadFilter(); warm.type = 'peaking'; warm.frequency.value = 220; warm.gain.value = 5;
      var g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.setTargetAtTime(0.0001, t + 2.2, 0.5);
      s.connect(body); body.connect(warm); warm.connect(g); g.connect(music); s.start(t); s.stop(t + 3.4); stats.notes++;
    }
    function harmonic(freq, t, vol) { // 泛音: pure, bell-like, long
      var o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain();
      o.frequency.value = freq; o2.frequency.value = freq * 2.001; var g2 = c.createGain(); g2.gain.value = 0.18;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
      o.connect(g); o2.connect(g2); g2.connect(g); g.connect(music); o.start(t); o2.start(t); o.stop(t + 2.7); o2.stop(t + 2.7); stats.notes++;
    }
    function tone(f0, f1, t, len, vol, dest, type) {
      var o = c.createOscillator(), g = c.createGain(); o.type = type || 'sine';
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + len * 0.6);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g); g.connect(dest || fx); o.start(t); o.stop(t + len + 0.02);
    }
    function click(t, vol) { // the tiny impact when the drop meets the water
      var n = Math.floor(c.sampleRate * 0.006), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
      var s = c.createBufferSource(), hp = c.createBiquadFilter(), g = c.createGain(); s.buffer = b; hp.type = 'highpass'; hp.frequency.value = 2500; g.gain.value = vol;
      s.connect(hp); hp.connect(g); g.connect(fx); s.start(t);
    }
    // Water drop: the air bubble it traps rings with a pitch that rises quickly ("bloop"), then a smaller echo drop.
    function drop(t) {
      var f = 520 + Math.random() * 260;
      click(t, 0.05); tone(f, f * (2.4 + Math.random() * 0.8), t + 0.004, 0.16, 0.2);
      var f2 = f * (1.5 + Math.random() * 0.4); tone(f2, f2 * 2.2, t + 0.11 + Math.random() * 0.05, 0.1, 0.06);
    }
    function thump(t) { tone(118, 50, t, 0.45, 0.32); click(t, 0.08); tone(320, 150, t, 0.12, 0.06, fx, 'triangle'); }
    function bird(t) {
      var at = t, kind = Math.floor(Math.random() * 3), n = 3 + Math.floor(Math.random() * 3);
      for (var i = 0; i < n; i++) {
        if (kind === 0) tone(3300, 4600, at, 0.08, 0.045);
        else if (kind === 1) tone(4700, 3200, at, 0.09, 0.04);
        else { tone(3000, 4100, at, 0.05, 0.045); tone(4100, 3500, at + 0.05, 0.05, 0.035); }
        at += 0.12 + Math.random() * 0.1;
      }
    }
    return { ctx: c, music: music, fx: fx, pluck: pluck, harmonic: harmonic, drop: drop, thump: thump, bird: bird };
  }
  // Guqin-like improvisation on D 宫 pentatonic: short phrases, rests, now and then a double stop, a slide or a harmonic.
  var SCALE = [146.83, 164.81, 185.0, 220.0, 246.94, 293.66, 329.63, 369.99, 440.0, 493.88];
  var pos = 5;
  function phrase(v, t) {
    var notes = 2 + Math.floor(Math.random() * 3), at = t;
    for (var i = 0; i < notes; i++) {
      pos = Math.max(0, Math.min(SCALE.length - 1, pos + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)]));
      var f = SCALE[pos], r = Math.random();
      if (r < 0.12) v.harmonic(f * 2, at, 0.05);
      else {
        v.pluck(f, at, 0.32 + Math.random() * 0.08, r > 0.85 ? (Math.random() < 0.5 ? 1.1225 : 0.8909) : 0);
        if (r > 0.7 && r <= 0.85) v.pluck(SCALE[Math.max(0, pos - 3)], at + 0.02, 0.22, 0); // double stop
      }
      at += 0.5 + Math.random() * 0.75;
    }
    return at - t + 1.6 + Math.random() * 2.6; // length of the phrase plus a breathing rest
  }
  function scheduleMusic(v, from, until) { var t = from; while (t < until) t += phrase(v, t); return t; }

  // ---- Live playback ----
  function audio() {
    if (ctx) return ctx;
    var C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
    try { ctx = new C(); voices = makeVoices(ctx); } catch (e) { ctx = null; }
    return ctx;
  }
  function musicLevel() { return Math.max(0, Math.min(100, cfg.volume)) / 100 * 0.9; }
  function fadeMusic(level) { if (voices) voices.music.gain.setTargetAtTime(level, ctx.currentTime, 0.6); }
  function startGuqin() {
    var next = ctx.currentTime + 0.6;
    (function loop() { if (playing !== 'guqin') return; next = scheduleMusic(voices, Math.max(next, ctx.currentTime + 0.1), ctx.currentTime + 6); musicTimer = setTimeout(loop, 2500); })();
  }
  async function startMine() {
    try {
      if (!window.MediaAssets) { musicTimer = setTimeout(function () { if (playing === 'mine') startMine(); }, 600); return; }
      var blob = await MediaAssets.store('get', MUSIC_KEY);
      if (!blob || playing !== 'mine') return;
      if (!mineEl) { mineEl = new Audio(); mineEl.loop = true; mineEl.preload = 'auto'; mineEl.setAttribute('playsinline', ''); mineNode = ctx.createMediaElementSource(mineEl); mineNode.connect(voices.music); }
      if (mineUrl) URL.revokeObjectURL(mineUrl); mineUrl = URL.createObjectURL(blob); mineEl.src = mineUrl;
      stats.mineStarts++; await mineEl.play().catch(function () {});
    } catch (e) {}
  }
  function startMusic() {
    var want = cfg.on ? cfg.music : 'off';
    if (want === playing) return;
    stopMusic(); playing = want; if (want === 'off') return;
    stats.musicStarts++; fadeMusic(musicLevel());
    if (want === 'guqin') startGuqin(); else if (want === 'mine') startMine();
  }
  function stopMusic() {
    clearTimeout(musicTimer); var was = playing; playing = '';
    if (voices) voices.music.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
    if (was === 'mine' && mineEl) setTimeout(function () { if (playing !== 'mine') mineEl.pause(); }, 900);
  }
  function scheduleBird() {
    clearTimeout(birdTimer);
    birdTimer = setTimeout(function () { if (active() && voices) { voices.bird(ctx.currentTime + 0.05); stats.birds++; flyBird(); } scheduleBird(); }, 11000 + Math.random() * 16000);
  }
  function flyBird() {
    if (reducedMotion()) return;
    var b = document.createElement('div'); b.className = 'ambience-bird'; b.setAttribute('aria-hidden', 'true');
    b.style.top = (70 + Math.random() * 110) + 'px'; if (Math.random() < 0.5) b.classList.add('rtl');
    b.innerHTML = '<svg viewBox="0 0 64 30" width="46" height="22"><path d="M2 18 Q16 2 32 16 Q48 2 62 18" fill="none" stroke="#3B4348" stroke-width="3.4" stroke-linecap="round"/></svg>';
    document.body.appendChild(b); setTimeout(function () { b.remove(); }, 9000);
  }
  function ripple(x, y) {
    if (reducedMotion()) return;
    var r = document.createElement('div'); r.className = 'ambience-ripple'; r.setAttribute('aria-hidden', 'true');
    r.style.left = x + 'px'; r.style.top = y + 'px'; r.innerHTML = '<i></i><i></i>';
    document.body.appendChild(r); setTimeout(function () { r.remove(); }, 1500);
  }
  function update() {
    var want = active();
    if (want) { var c = audio(); if (c && c.state === 'suspended') c.resume(); if (!running) scheduleBird(); running = true; startMusic(); }
    else if (running) { running = false; clearTimeout(birdTimer); stopMusic(); }
  }

  // A tap on empty background (not on a card, button, field or panel) makes a ripple and a water drop.
  var down = null;
  var interactive = 'button,a,input,textarea,select,label,.entry-card,.toolbar,.sheet,.sheet-backdrop,.filter-panel,.settings-drawer,dialog,.toast,.fab,.top-fab,.tag-chip,.setup-intro,.update-banner';
  document.addEventListener('pointerdown', function (e) {
    if (ctx && ctx.state === 'suspended' && active()) ctx.resume();
    if (active() && mineEl && playing === 'mine' && mineEl.paused) mineEl.play().catch(function () {}); // iPhone needs a tap to start audio
    down = active() && !e.target.closest(interactive) ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
  }, { passive: true });
  document.addEventListener('pointerup', function (e) {
    if (!down || !active()) return;
    var moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), quick = performance.now() - down.t < 450; down = null;
    if (moved > 10 || !quick) return; // a scroll or a long press, not a tap
    ripple(e.clientX, e.clientY); if (audio()) { voices.drop(ctx.currentTime + 0.01); stats.drops++; }
  }, { passive: true });
  // The stamp lands about a quarter second after a row gets saved-highlight (see the seal-stamp keyframes).
  new MutationObserver(function (records) {
    if (!active() || !audio()) return;
    records.forEach(function (r) { if (r.target.classList && r.target.classList.contains('saved-highlight') && !(r.oldValue || '').includes('saved-highlight')) { voices.thump(ctx.currentTime + 0.23); stats.thumps++; } });
  }).observe(document.getElementById('timeline'), { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  new MutationObserver(function () { update(); describe(); }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  document.addEventListener('visibilitychange', function () {
    if (ctx) { if (document.hidden) { ctx.suspend(); if (mineEl) mineEl.pause(); } else if (active()) ctx.resume(); }
    if (!document.hidden) playing = ''; update();
  });

  // ---- Settings ----
  var $ = function (id) { return document.getElementById(id); };
  var box = $('ambience-toggle'), note = $('ambience-note'), options = $('ambience-options'), sel = $('ambience-music'), mine = $('ambience-mine'), file = $('ambience-file'), fileStatus = $('ambience-file-status'), vol = $('ambience-volume'), volOut = $('ambience-volume-value');
  function describe() {
    if (options) options.hidden = !cfg.on;
    if (mine) mine.hidden = cfg.music !== 'mine';
    if (fileStatus) fileStatus.textContent = cfg.name ? '正在使用：' + cfg.name + '（只存在本机，不会上传或同步）' : '还没有选择音乐。';
    if (note) note.textContent = !cfg.on ? '' : ink() ? '已开启。点一下背景空白处，会泛起涟漪。' : '已开启，切换到「水墨国风」主题后生效。';
  }
  function unlock() { audio(); if (ctx && ctx.state === 'suspended') ctx.resume(); }
  if (box) {
    box.checked = cfg.on; if (sel) sel.value = cfg.music; if (vol) { vol.value = cfg.volume; volOut.textContent = cfg.volume; }
    box.onchange = async function () { cfg.on = box.checked; if (cfg.on) unlock(); await save(); describe(); playing = playing && cfg.on ? playing : ''; update(); if (!cfg.on) stopMusic(); };
    if (sel) sel.onchange = async function () { cfg.music = sel.value; unlock(); await save(); describe(); if (active()) { stopMusic(); startMusic(); } };
    if (vol) vol.oninput = function () { cfg.volume = +vol.value; volOut.textContent = vol.value; if (playing) fadeMusic(musicLevel()); };
    if (vol) vol.onchange = function () { save(); };
    if (file) file.onchange = async function () {
      var f = file.files && file.files[0]; file.value = ''; if (!f) return;
      if (f.size > 40 * 1048576) { showToast('音乐文件太大了，请选 40MB 以内的'); return; }
      try { await MediaAssets.store('put', MUSIC_KEY, f); cfg.name = f.name; cfg.music = 'mine'; if (sel) sel.value = 'mine'; await save(); describe(); unlock(); if (active()) { stopMusic(); startMusic(); } showToast('已设为背景音乐'); }
      catch (e) { showToast('音乐没有保存成功：' + e.message); }
    };
  }
  // 「试一下」previews the soundscape: a bird call, an ink bird and a water drop.
  var test = $('feedback-test');
  function chirp() { if (!active() || !audio()) return false; if (ctx.state === 'suspended') ctx.resume(); voices.bird(ctx.currentTime + 0.05); stats.birds++; flyBird(); voices.drop(ctx.currentTime + 1.3); return true; }
  if (test) test.addEventListener('click', chirp);
  describe(); update();
  window.DiaryAmbience = { stats: stats, isRunning: function () { return running; }, playing: function () { return playing; }, chirp: chirp,
    // Renders a preview of the voices offline (used to audition the sounds without a phone).
    renderPreview: function (seconds) { var c = new OfflineAudioContext(2, 48000 * seconds, 48000), v = makeVoices(c); v.music.gain.value = 0.55;
      [0.4, 1.4, 2.3].forEach(function (t) { v.drop(t); }); v.thump(3.4); v.bird(4.4); scheduleMusic(v, 5.5, seconds - 3); return c.startRendering(); } };
})();
