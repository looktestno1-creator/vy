/* ──────────────────────────────────────────────
   Marantz Cabin Audio — UI exploration
────────────────────────────────────────────── */
(function () {
  'use strict';

  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };

  var LABEL = {
    clarity: 'Clarity',
    warmth: 'Warmth',
    spaciousness: 'Spaciousness',
    driver: 'Driver',
    passenger: 'Passenger',
    back: 'Back seat'
  };

  var state = {
    view: 'volume',
    volume: 25,
    seat: null,          // null = no seat picked, so every seat is live
    param: 'warmth',
    master: false,
    levels: {
      driver:    { clarity: 50, warmth: 50, spaciousness: 50 },
      passenger: { clarity: 50, warmth: 50, spaciousness: 50 },
      back:      { clarity: 50, warmth: 50, spaciousness: 50 }
    }
  };

  /* ── Views ─────────────────────────────── */
  var VIEW_EL = {
    volume: $('#v-volume'),
    cabin:  $('#v-cabin'),
    map:    $('#v-map'),
    levels: $('#v-levels')
  };

  function setView(view) {
    state.view = view;
    Object.keys(VIEW_EL).forEach(function (k) {
      VIEW_EL[k].classList.toggle('is-on', k === view);
    });
    $$('.view-btn').forEach(function (b) {
      b.classList.toggle('is-active', b.dataset.view === view);
    });
    // the aurora belongs to the volume, cabin and levels screens, not the flat seat map
    $('#aurora').classList.toggle('is-on', view !== 'map');
    renderAurora();
  }

  $$('.view-btn').forEach(function (b) {
    b.addEventListener('click', function () { setView(b.dataset.view); });
  });

  /* ── Volume dial ───────────────────────── */
  var dial = $('#dial');
  var dialValue = $('#dialValue');
  var aurTeal = $('.aurora-teal');
  var aurGold = $('.aurora-gold');

  function renderAurora() {
    // the glow swells with level, and the two arms lean further apart as it rises
    var t = state.volume / 100;
    var s = 0.90 + t * 0.26;
    aurTeal.style.transform = 'translate(' + (-t * 40).toFixed(1) + 'px,' + (-t * 30).toFixed(1) + 'px) rotate(-14deg) scale(' + s.toFixed(3) + ')';
    aurGold.style.transform = 'translate(' + (t * 40).toFixed(1) + 'px,' + (t * 32).toFixed(1) + 'px) rotate(-14deg) scale(' + s.toFixed(3) + ')';
    aurTeal.style.opacity = (0.82 + t * 0.18).toFixed(3);
    aurGold.style.opacity = (0.78 + t * 0.22).toFixed(3);
  }

  function renderVolume() {
    dialValue.textContent = Math.round(state.volume);
    dial.setAttribute('aria-valuenow', Math.round(state.volume));
    renderAurora();
  }

  (function dialInput() {
    var active = false, lastX = 0, lastY = 0;

    dial.addEventListener('pointerdown', function (e) {
      active = true; lastX = e.clientX; lastY = e.clientY;
      dial.setPointerCapture(e.pointerId);
    });

    dial.addEventListener('pointermove', function (e) {
      if (!active) return;
      // right / up raises, left / down lowers
      var d = (e.clientX - lastX) - (e.clientY - lastY);
      lastX = e.clientX; lastY = e.clientY;
      state.volume = clamp(state.volume + d * 0.22, 0, 100);
      renderVolume();
    });

    ['pointerup', 'pointercancel'].forEach(function (evt) {
      dial.addEventListener(evt, function () { active = false; });
    });

    dial.addEventListener('wheel', function (e) {
      e.preventDefault();
      state.volume = clamp(state.volume - Math.sign(e.deltaY) * 2, 0, 100);
      renderVolume();
    }, { passive: false });

    dial.addEventListener('keydown', function (e) {
      var step = (e.key === 'ArrowUp' || e.key === 'ArrowRight') ? 1
               : (e.key === 'ArrowDown' || e.key === 'ArrowLeft') ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      state.volume = clamp(state.volume + step * 2, 0, 100);
      renderVolume();
    });
  })();

  /* ── Seat selection ────────────────────── */
  var ALL_SEATS = ['driver', 'passenger', 'back'];

  // which seats the cards and the slider are currently driving
  function targetSeats() { return state.seat ? [state.seat] : ALL_SEATS; }

  function renderSeats() {
    var all = state.seat === null;
    $$('.seat, .top').forEach(function (img) {
      img.dataset.state = (all || img.dataset.seat === state.seat) ? 'on' : 'off';
    });
    $$('.pill').forEach(function (p) {
      p.classList.toggle('is-active', !all && p.dataset.seat === state.seat);
    });
    $$('.seat[role="button"]').forEach(function (img) {
      img.setAttribute('aria-pressed', String(all || img.dataset.seat === state.seat));
    });
    $('#levelsSeat').innerHTML = 'Seat \u00b7 <b>' + (all ? 'All seats' : LABEL[state.seat]) + '</b>';
    renderLevels();
  }

  function selectSeat(seat) { state.seat = seat; renderSeats(); }

  // clicking the seat that is already selected clears the selection — every
  // seat lights up and the cards then drive the whole cabin at once
  function toggleSeat(seat) {
    state.seat = (seat === state.seat) ? null : seat;
    renderSeats();
  }

  $$('.pill').forEach(function (p) {
    p.addEventListener('click', function () { toggleSeat(p.dataset.seat); });
  });

  /* ── Clicking a seat selects it ────────── */
  // The three 3/4 renders are full-frame transparent PNGs stacked on one another,
  // so a click has to respect both the stacking order and each layer's alpha —
  // otherwise every click lands on the driver, who is on top.
  var SEAT_STACK = ['driver', 'passenger', 'back'];   // topmost first
  var SEAT_W = 1440, SEAT_H = 810;                    // the shared render frame
  var alphaMaps = {};

  function buildAlphaMap(img) {
    var w = 480, h = Math.round(w * SEAT_H / SEAT_W);
    var canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    try {
      return { w: w, h: h, data: ctx.getImageData(0, 0, w, h).data };
    } catch (err) {
      return null;   // tainted canvas — the pills still work
    }
  }

  $$('.seats--cabin .seat').forEach(function (img) {
    function build() {
      if (!alphaMaps[img.dataset.seat]) alphaMaps[img.dataset.seat] = buildAlphaMap(img);
    }
    if (img.complete && img.naturalWidth) build();
    else img.addEventListener('load', build);
  });

  function seatAt(wrap, clientX, clientY) {
    var r = wrap.getBoundingClientRect();
    // object-fit: contain — work out where the render actually sits in the box
    var scale = Math.min(r.width / SEAT_W, r.height / SEAT_H);
    var w = SEAT_W * scale, h = SEAT_H * scale;
    var x = (clientX - (r.left + (r.width - w) / 2)) / w;
    var y = (clientY - (r.top + (r.height - h) / 2)) / h;
    if (x < 0 || x >= 1 || y < 0 || y >= 1) return null;

    for (var i = 0; i < SEAT_STACK.length; i++) {
      var map = alphaMaps[SEAT_STACK[i]];
      if (!map) continue;
      var px = Math.floor(x * map.w), py = Math.floor(y * map.h);
      if (map.data[(py * map.w + px) * 4 + 3] > 24) return SEAT_STACK[i];
    }
    return null;
  }

  function clearHover(wrap) {
    wrap.style.cursor = '';
    $$('.seat', wrap).forEach(function (img) { delete img.dataset.hover; });
  }

  $$('.seats').forEach(function (wrap) {
    wrap.addEventListener('click', function (e) {
      if (e.target.closest('.pill')) return;   // the pill handles its own click
      var seat = seatAt(wrap, e.clientX, e.clientY);
      if (seat) toggleSeat(seat);
    });

    wrap.addEventListener('pointermove', function (e) {
      if (e.target.closest('.pill')) { clearHover(wrap); return; }
      var seat = seatAt(wrap, e.clientX, e.clientY);
      wrap.style.cursor = seat ? 'pointer' : '';
      $$('.seat', wrap).forEach(function (img) {
        if (img.dataset.seat === seat) img.dataset.hover = '1';
        else delete img.dataset.hover;
      });
    });

    wrap.addEventListener('pointerleave', function () { clearHover(wrap); });
  });

  // the top-down seats don't overlap, so they need no alpha test
  $$('.top').forEach(function (img) {
    img.addEventListener('click', function () { toggleSeat(img.dataset.seat); });
  });

  // On Levels there are no pills, so the seats themselves carry the keyboard
  // control: enter or space selects, left and right walk along the row.
  var focusable = $$('.seat[role="button"]');

  focusable.forEach(function (img, i) {
    img.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        toggleSeat(img.dataset.seat);
        return;
      }
      var dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      var next = focusable[(i + dir + focusable.length) % focusable.length];
      next.focus();
      selectSeat(next.dataset.seat);
    });
  });

  /* ── Parameter + slider ────────────────── */
  var slider     = $('#slider');
  var sliderFill = $('#sliderFill');
  var sliderName = $('#sliderName');
  var sliderNum  = $('#sliderNum');

  // with no seat picked these read the cabin average and write every seat
  function getLevel(param) {
    var keys = targetSeats(), sum = 0;
    keys.forEach(function (k) { sum += state.levels[k][param]; });
    return sum / keys.length;
  }

  function setLevel(param, v) {
    v = clamp(v, 0, 100);
    targetSeats().forEach(function (k) { state.levels[k][param] = v; });
  }

  function value() { return getLevel(state.param); }

  function renderLevels() {
    var v = value();
    sliderName.textContent = LABEL[state.param];
    sliderNum.textContent = Math.round(v);
    // the white fill never shrinks past its label
    sliderFill.style.width = (190 + (750 - 190) * (v / 100)).toFixed(1) + 'px';
    slider.setAttribute('aria-label', LABEL[state.param]);
    slider.setAttribute('aria-valuenow', Math.round(v));

    $$('.params button').forEach(function (b) {
      b.classList.toggle('is-active', b.dataset.param === state.param);
    });

    $$('[data-val]').forEach(function (el) {
      el.textContent = Math.round(getLevel(el.dataset.val));
    });
    $$('[data-fill]').forEach(function (el) {
      var key = el.dataset.fill;
      var pct = key === 'master' ? (state.master ? 100 : 0) : getLevel(key);
      el.style.height = pct.toFixed(2) + '%';
    });
    $$('.tile').forEach(function (t) {
      t.classList.toggle('is-active', t.dataset.param === state.param);
      if (t.dataset.param !== 'master') {
        t.setAttribute('aria-valuenow', Math.round(getLevel(t.dataset.param)));
      }
    });
    $('#masterVal').textContent = state.master ? 'On' : 'Off';
  }

  function setParam(param) {
    state.param = param;
    renderLevels();
  }

  $$('.params button').forEach(function (b) {
    b.addEventListener('click', function () { setParam(b.dataset.param); });
  });

  (function sliderInput() {
    var active = false;

    function fromPointer(e) {
      var r = slider.getBoundingClientRect();
      // the pointer tracks the fill's trailing edge, which starts 190px in
      var raw = (e.clientX - r.left - 190) / (r.width - 190);
      setLevel(state.param, raw * 100);
      renderLevels();
    }

    slider.addEventListener('pointerdown', function (e) {
      active = true;
      slider.setPointerCapture(e.pointerId);
      fromPointer(e);
    });

    slider.addEventListener('pointermove', function (e) { if (active) fromPointer(e); });

    ['pointerup', 'pointercancel'].forEach(function (evt) {
      slider.addEventListener(evt, function () { active = false; });
    });

    slider.addEventListener('keydown', function (e) {
      var step = (e.key === 'ArrowRight' || e.key === 'ArrowUp') ? 1
               : (e.key === 'ArrowLeft' || e.key === 'ArrowDown') ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      setLevel(state.param, value() + step * 2);
      renderLevels();
    });
  })();

  /* ── Tiles ─────────────────────────────── */
  $$('.tile').forEach(function (t) {
    var param = t.dataset.param;

    if (param === 'master') {
      t.addEventListener('click', function () {
        state.master = !state.master;
        t.setAttribute('aria-pressed', String(state.master));
        renderLevels();
      });
      return;
    }

    // drag up to fill the card, down to empty it — the card's own height is the full range
    var active = false, startY = 0, startV = 0, moved = false;

    t.addEventListener('pointerdown', function (e) {
      active = true; moved = false;
      startY = e.clientY;
      startV = getLevel(param);
      setParam(param);
      t.setPointerCapture(e.pointerId);
    });

    t.addEventListener('pointermove', function (e) {
      if (!active) return;
      var dy = startY - e.clientY;
      if (Math.abs(dy) > 2) moved = true;
      setLevel(param, startV + dy / t.offsetHeight * 100);
      renderLevels();
    });

    ['pointerup', 'pointercancel'].forEach(function (evt) {
      t.addEventListener(evt, function () { active = false; });
    });

    // a plain tap only selects the parameter, so it never jumps the value
    t.addEventListener('click', function (e) { if (moved) e.preventDefault(); });

    t.addEventListener('wheel', function (e) {
      e.preventDefault();
      setParam(param);
      setLevel(param, getLevel(param) - Math.sign(e.deltaY) * 2);
      renderLevels();
    }, { passive: false });

    t.addEventListener('keydown', function (e) {
      var step = (e.key === 'ArrowUp' || e.key === 'ArrowRight') ? 1
               : (e.key === 'ArrowDown' || e.key === 'ArrowLeft') ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      setParam(param);
      setLevel(param, getLevel(param) + step * 2);
      renderLevels();
    });
  });

  /* ── Boot ──────────────────────────────── */
  selectSeat('driver');
  setParam('warmth');
  renderVolume();

  var wanted = new URLSearchParams(location.search).get('view');
  setView(VIEW_EL[wanted] ? wanted : 'volume');
})();
