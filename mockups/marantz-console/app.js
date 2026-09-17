/* ──────────────────────────────────────────────
   Marantz Cabin Audio — console screen
────────────────────────────────────────────── */
(function () {
  'use strict';

  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };

  var RANGE = {
    warmth:       { min: -10, max: 10,  step: 1 },
    spaciousness: { min: -10, max: 10,  step: 1 },
    clarity:      { min: -10, max: 10,  step: 1 }
  };

  // Warmth recolours the dash pattern only: blue below zero, amber above,
  // through the pattern's own green-teal at zero.
  var DASH_COOL    = [0x43, 0x87, 0xd2];
  var DASH_NEUTRAL = [0x4b, 0x78, 0x67];
  var DASH_WARM    = [0xd2, 0x8f, 0x43];

  var ALL_SEATS = ['driver', 'passenger', 'back'];
  var VOICING = ['warmth', 'spaciousness', 'clarity'];

  // Sound Master is Marantz's own tuning — it owns the voicing, so the three
  // controls are not adjustable while it is on
  function locked(key) { return state.modes.master && VOICING.indexOf(key) > -1; }

  var state = {
    seat: 'passenger',           // 'driver' | 'passenger' | 'all'
    modes: { master: false, dialogue: true, quiet: false },
    // one voicing for the whole cabin: the seat only decides where that sound
    // is focused, it does not carry settings of its own
    voicing: { warmth: -10, spaciousness: 0, clarity: 0 }
  };

  /* ── Seats ─────────────────────────────── */
  // the seat is where the sound is aimed, nothing more: 'all' lights the whole
  // cabin, a single seat dims the others, and the voicing is left alone
  function targetSeats() { return state.seat === 'all' ? ALL_SEATS : [state.seat]; }

  function renderSeats() {
    var live = targetSeats();
    $$('.layer').forEach(function (img) {
      var seat = img.dataset.seat;
      if (seat === 'console') return;                 // the dash is always lit
      img.dataset.state = live.indexOf(seat) > -1 ? 'on' : 'off';
    });
    $$('.card--seat').forEach(function (c) {
      c.setAttribute('aria-pressed', String(c.dataset.seat === state.seat));
    });
  }

  $$('.card--seat').forEach(function (c) {
    c.addEventListener('click', function () {
      state.seat = c.dataset.seat;
      renderSeats();
    });
  });

  /* ── Voicing ───────────────────────────── */
  // global to the cabin, whichever seat is selected
  function getValue(key) {
    return state.voicing[key];
  }

  function setValue(key, v) {
    var r = RANGE[key];
    state.voicing[key] = clamp(v, r.min, r.max);
  }

  var screenEl = $('.screen');

  function mix(a, b, t) {
    return 'rgb(' + [0, 1, 2].map(function (i) {
      return Math.round(a[i] + (b[i] - a[i]) * t);
    }).join(',') + ')';
  }

  // Recolouring the full-screen masked pattern is the most expensive thing on
  // the page, so coalesce it to one write per frame and skip it when the
  // colour has not actually moved.
  var patternWrap = $('.pattern');
  var warmthRaf = 0, lastDash = '';

  function renderWarmth() {
    if (warmthRaf) return;
    warmthRaf = requestAnimationFrame(function () {
      warmthRaf = 0;
      var t = clamp(getValue('warmth') / RANGE.warmth.max, -1, 1);   // -1 … 1
      var dash = t >= 0 ? mix(DASH_NEUTRAL, DASH_WARM, t)
                        : mix(DASH_NEUTRAL, DASH_COOL, -t);
      if (dash === lastDash) return;
      lastDash = dash;
      screenEl.style.setProperty('--dash', dash);
    });
  }

  // Warmth recolours the dash pattern; Spaciousness resizes it. 85% at -10,
  // unchanged at 0, 115% at +10. Coalesced per frame like the recolour, since a
  // drag fires far faster than paint.
  var DASH_SPREAD = 0.15;
  var spaceRaf = 0, lastScale = '';

  function renderSpaciousness() {
    if (spaceRaf) return;
    spaceRaf = requestAnimationFrame(function () {
      spaceRaf = 0;
      var t = clamp(getValue('spaciousness') / RANGE.spaciousness.max, -1, 1);
      var scale = (1 + t * DASH_SPREAD).toFixed(4);
      if (scale === lastScale) return;
      lastScale = scale;
      screenEl.style.setProperty('--dash-scale', scale);
    });
  }

  // Clarity blurs the dash field: sharp at +10, soft at -10, linear between.
  var DASH_BLUR_MAX = 6;   // px, at -10
  var blurRaf = 0, lastBlur = '';

  function renderClarity() {
    if (blurRaf) return;
    blurRaf = requestAnimationFrame(function () {
      blurRaf = 0;
      var t = clamp(getValue('clarity') / RANGE.clarity.max, -1, 1);   // -1 … 1
      var blur = ((1 - t) / 2 * DASH_BLUR_MAX).toFixed(2) + 'px';
      if (blur === lastBlur) return;
      lastBlur = blur;
      screenEl.style.setProperty('--dash-blur', blur);
    });
  }

  // The travel is fixed while the layout is, so measure it once instead of
  // reading offsetWidth on every pointer move.
  function travel(track) {
    if (!track._travel) track._travel = track.offsetWidth - 66;
    return track._travel;
  }

  function renderTrack(track) {
    var key = track.dataset.slider;
    var r = RANGE[key];
    var v = getValue(key);
    var t = (v - r.min) / (r.max - r.min);
    track.querySelector('.knob').style.transform =
      'translate3d(' + (t * travel(track)).toFixed(1) + 'px,0,0)';
    track.setAttribute('aria-valuenow', Math.round(v));
    $('[data-num="' + key + '"]').textContent = Math.round(v);
    if (key === 'warmth') renderWarmth();
    if (key === 'spaciousness') renderSpaciousness();
    if (key === 'clarity') renderClarity();
  }

  function renderSliders() {
    $$('.track').forEach(renderTrack);
  }

  $$('.track').forEach(function (track) {
    var key = track.dataset.slider;
    var r = RANGE[key];
    var active = false, left = 0;

    function fromPointer(e) {
      if (locked(key)) return;
      // the pointer drives the knob's centre, so discount its width
      var t = (e.clientX - left - 33) / travel(track);
      setValue(key, r.min + clamp(t, 0, 1) * (r.max - r.min));
      renderTrack(track);          // only the track being dragged
    }

    track.addEventListener('pointerdown', function (e) {
      if (locked(key)) return;
      active = true;
      left = track.getBoundingClientRect().left;   // cached for the whole drag
      track.classList.add('is-dragging');
      patternWrap.classList.add('is-live');
      track.setPointerCapture(e.pointerId);
      fromPointer(e);
    });

    track.addEventListener('pointermove', function (e) { if (active) fromPointer(e); });

    ['pointerup', 'pointercancel'].forEach(function (evt) {
      track.addEventListener(evt, function () {
        active = false;
        track.classList.remove('is-dragging');
        patternWrap.classList.remove('is-live');
      });
    });

    track.addEventListener('wheel', function (e) {
      if (locked(key)) return;
      e.preventDefault();
      setValue(key, getValue(key) - Math.sign(e.deltaY) * r.step);
      renderTrack(track);
    }, { passive: false });

    track.addEventListener('keydown', function (e) {
      var step = (e.key === 'ArrowRight' || e.key === 'ArrowUp') ? 1
               : (e.key === 'ArrowLeft' || e.key === 'ArrowDown') ? -1 : 0;
      if (!step || locked(key)) return;
      e.preventDefault();
      setValue(key, getValue(key) + step * r.step);
      renderTrack(track);
    });
  });

  /* ── Modes ─────────────────────────────── */
  var bottom = $('.bottom');

  function renderMaster() {
    var on = state.modes.master;
    screenEl.classList.toggle('is-master', on);
    // the row is still painted while it fades, so take it out of reach
    // rather than leaving focusable controls behind an invisible card
    bottom.setAttribute('aria-hidden', String(on));
    $$('.bottom .track').forEach(function (t) {
      t.setAttribute('aria-disabled', String(on));
      t.tabIndex = on ? -1 : 0;
    });
  }

  $$('.card--mode').forEach(function (c) {
    c.addEventListener('click', function () {
      var mode = c.dataset.mode;
      state.modes[mode] = !state.modes[mode];
      c.setAttribute('aria-pressed', String(state.modes[mode]));
      if (mode === 'master') renderMaster();
    });
  });

  /* ── Boot ──────────────────────────────── */
  renderSeats();
  renderSliders();
  renderMaster();
  window.addEventListener('resize', function () {
    $$('.track').forEach(function (t) { t._travel = 0; });
    renderSliders();
  });
})();
