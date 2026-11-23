/*
  The circuit board behind the intro.

  Copper traces are routed out from the chip's pins (and around the board)
  on a grid, PCB style: straight runs with 45 degree corners. Signal pulses
  flow along them into the chip, the pins flash when a pulse arrives, the
  cursor lights up nearby traces, a click on the board sends a burst of
  pulses, and a click on the chip fires a surge down every pin.

  With "reduce motion" turned on, the board is drawn once and stays still.
*/
(function () {
  "use strict";

  var hero = document.querySelector(".hero");
  var canvas = hero && hero.querySelector(".circuit");
  var chip = hero && hero.querySelector(".chip");
  var textBlock = hero && hero.querySelector(".hero-text");
  if (!hero || !canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  var motion = document.documentElement.classList.contains("motion");
  hero.classList.add("has-circuit");

  // 8 directions, 45 degrees apart. Even = straight, odd = diagonal.
  var DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  var INTRO_MS = 1900;
  var TAU = Math.PI * 2;

  var W = 0, H = 0, dpr = 1, cell = 30, lw = 2, viaR = 4;
  var traces = [], pinTraces = [], dots = [];
  var colors = {};
  var traceLayer = document.createElement("canvas");
  var accentLayer = document.createElement("canvas");
  var glowCanvas = document.createElement("canvas");
  var pulses = [], rings = [];
  var pinEls = chip ? Array.prototype.slice.call(chip.querySelectorAll(".chip-pins rect")) : [];
  var led = chip ? chip.querySelector(".chip-dot") : null;
  var introStart = 0, introDone = !motion;
  var running = false, onScreen = true, rafId = 0, last = 0;
  var mouse = { x: 0, y: 0, tx: 0, ty: 0, on: false, a: 0 };

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  function rgb(color) {
    var c = String(color).trim();
    if (c.charAt(0) === "#") {
      if (c.length === 4) c = "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
      var n = parseInt(c.slice(1, 7), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    var m = c.match(/[\d.]+/g);
    return m ? [+m[0], +m[1], +m[2]] : [224, 112, 42];
  }

  function rgba(parts, alpha) {
    return "rgba(" + parts[0] + "," + parts[1] + "," + parts[2] + "," + alpha + ")";
  }

  function readColors() {
    var s = getComputedStyle(document.documentElement);
    function v(name, fallback) {
      var x = s.getPropertyValue(name).trim();
      return x || fallback;
    }
    colors.trace = v("--trace", "#d3cfc3");
    colors.dot = v("--trace-dot", "#d9d6cc");
    colors.bg = v("--bg", "#f6f5f1");
    colors.pulse = v("--pulse", "#e0702a");
    colors.pulseRgb = rgb(colors.pulse);
    colors.head = v("--pulse-head", "#b44d14");
    colors.pinHot = v("--pin-hot", "#ff9a4d");
    colors.dark = v("--is-dark", "0") === "1";
    colors.pinBase = pinEls.length ? getComputedStyle(pinEls[0]).fill : colors.pulse;
  }

  /* ---------- Routing ---------- */

  function layout() {
    var hr = hero.getBoundingClientRect();
    W = hero.clientWidth;
    H = hero.clientHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    [canvas, traceLayer, accentLayer].forEach(function (c) {
      c.width = Math.max(1, Math.round(W * dpr));
      c.height = Math.max(1, Math.round(H * dpr));
    });

    // Line the grid up with the chip's pins, so traces leave them cleanly.
    // In the chip's SVG, pins sit every 30 units starting at 70.
    var ox, oy, hasChip = false;
    var cr = chip ? chip.getBoundingClientRect() : null;
    if (cr && cr.width > 0) {
      var k = cr.width / 260;
      cell = 30 * k;
      ox = cr.left - hr.left + 70 * k;
      oy = cr.top - hr.top + 70 * k;
      hasChip = true;
    } else {
      cell = 30;
      ox = 15;
      oy = 15;
    }
    lw = clamp(cell * 0.07, 1.5, 2.4);
    viaR = clamp(cell * 0.14, 3, 5);

    var iMin = Math.ceil((2 - ox) / cell), iMax = Math.floor((W - 2 - ox) / cell);
    var jMin = Math.ceil((2 - oy) / cell), jMax = Math.floor((H - 2 - oy) / cell);
    var blocked = new Set(), occ = new Set(), diag = new Set();
    var i, j;

    function K(a, b) { return (a + 512) * 2048 + (b + 512); }
    function X(a) { return ox + a * cell; }
    function Y(b) { return oy + b * cell; }

    // Keep traces off the chip and away from the text.
    if (hasChip) {
      for (i = -1; i <= 5; i++) for (j = -1; j <= 5; j++) blocked.add(K(i, j));
    }
    if (textBlock) {
      var tr = textBlock.getBoundingClientRect(), pad = cell * 0.55;
      var x0 = tr.left - hr.left - pad, x1 = tr.right - hr.left + pad;
      var y0 = tr.top - hr.top - pad, y1 = tr.bottom - hr.top + pad;
      for (i = iMin; i <= iMax; i++) {
        for (j = jMin; j <= jMax; j++) {
          var x = X(i), y = Y(j);
          if (x >= x0 && x <= x1 && y >= y0 && y <= y1) blocked.add(K(i, j));
        }
      }
    }

    function isFree(a, b) {
      return a >= iMin && a <= iMax && b >= jMin && b <= jMax &&
        !blocked.has(K(a, b)) && !occ.has(K(a, b));
    }

    // A random walk that prefers long straight runs and short 45 degree jogs.
    function walk(a, b, d, minLen, maxLen, straight) {
      var pts = [[a, b]], added = [K(a, b)], diags = [];
      occ.add(K(a, b));
      for (var n = 0; n < maxLen; n++) {
        var t1 = (d + 1) % 8, t2 = (d + 7) % 8;
        if (Math.random() < 0.5) { var tmp = t1; t1 = t2; t2 = tmp; }
        var opts;
        if (straight > 0) opts = [d, t1, t2];
        else if (d % 2 === 1) opts = [t1, t2, d];
        else opts = Math.random() < 0.8 ? [d, t1, t2] : [t1, t2, d];

        var moved = false;
        for (var o = 0; o < opts.length; o++) {
          var c = opts[o], dx = DIRS[c][0], dy = DIRS[c][1], na = a + dx, nb = b + dy;
          if (!isFree(na, nb)) continue;
          if (c % 2 === 1) {
            // Two diagonals can't cross inside the same grid square.
            var base = K(Math.min(a, na), Math.min(b, nb)) * 2;
            var mine = dx * dy > 0 ? 0 : 1;
            if (diag.has(base + 1 - mine)) continue;
            diag.add(base + mine);
            diags.push(base + mine);
          }
          if (c !== d) straight = c % 2 === 1 ? 1 + Math.floor(Math.random() * 2) : 2 + Math.floor(Math.random() * 5);
          else straight--;
          d = c; a = na; b = nb;
          pts.push([a, b]);
          occ.add(K(a, b));
          added.push(K(a, b));
          moved = true;
          break;
        }
        if (!moved) break;
        if (pts.length > minLen && Math.random() < 0.05) break;
      }
      return { pts: pts, added: added, diags: diags };
    }

    function release(w) {
      w.added.forEach(function (key) { occ.delete(key); });
      w.diags.forEach(function (key) { diag.delete(key); });
    }

    function makeTrace(pts, pin) {
      var p = pts.map(function (q) { return { x: X(q[0]), y: Y(q[1]) }; });
      var cum = [0];
      for (var n = 1; n < p.length; n++) {
        cum.push(cum[n - 1] + Math.hypot(p[n].x - p[n - 1].x, p[n].y - p[n - 1].y));
      }
      return {
        p: p,
        cum: cum,
        len: cum[cum.length - 1],
        pin: pin,
        delay: pin >= 0 ? rand(0, 0.12) : rand(0.15, 0.45)
      };
    }

    traces = [];
    pinTraces = [];
    dots = [];

    if (hasChip) {
      // Same order as the pins in the SVG: left, right, top, bottom.
      var specs = [];
      for (j = 0; j < 5; j++) specs.push([-1, j, 4]);
      for (j = 0; j < 5; j++) specs.push([5, j, 0]);
      for (i = 0; i < 5; i++) specs.push([i, -1, 6]);
      for (i = 0; i < 5; i++) specs.push([i, 5, 2]);
      var order = specs.map(function (_, n) { return n; });
      order.sort(function () { return Math.random() - 0.5; });
      order.forEach(function (n) {
        var s = specs[n];
        var w = walk(s[0], s[1], s[2], 3, 46, 1 + Math.floor(Math.random() * 3));
        if (w.pts.length >= 3) {
          var t = makeTrace(w.pts, n);
          traces.push(t);
          pinTraces.push(t);
        }
      });
    }

    var freeCount = 0;
    for (i = iMin; i <= iMax; i++) for (j = jMin; j <= jMax; j++) if (isFree(i, j)) freeCount++;
    var want = Math.floor(freeCount / 15), tries = want * 6;
    while (want > 0 && tries-- > 0) {
      var si = iMin + Math.floor(Math.random() * (iMax - iMin + 1));
      var sj = jMin + Math.floor(Math.random() * (jMax - jMin + 1));
      if (!isFree(si, sj)) continue;
      var w2 = walk(si, sj, Math.floor(Math.random() * 4) * 2, 3,
        6 + Math.floor(Math.random() * 22), 1 + Math.floor(Math.random() * 3));
      if (w2.pts.length < 4) { release(w2); continue; }
      traces.push(makeTrace(w2.pts, -1));
      want--;
    }

    for (i = iMin; i <= iMax; i++) {
      for (j = jMin; j <= jMax; j++) if (isFree(i, j)) dots.push([X(i), Y(j)]);
    }
  }

  /* ---------- Drawing helpers ---------- */

  function pointAt(t, s) {
    var c = t.cum, p = t.p, k = 1;
    while (k < c.length - 1 && c[k] < s) k++;
    var seg = c[k] - c[k - 1] || 1, f = clamp((s - c[k - 1]) / seg, 0, 1);
    return { x: p[k - 1].x + (p[k].x - p[k - 1].x) * f, y: p[k - 1].y + (p[k].y - p[k - 1].y) * f };
  }

  // Adds the stretch of trace t between distances a and b to the current path.
  function tracePath(g, t, a, b) {
    var c = t.cum, p = t.p, s = pointAt(t, a), e = pointAt(t, b);
    g.moveTo(s.x, s.y);
    for (var k = 1; k < p.length; k++) if (c[k] > a && c[k] < b) g.lineTo(p[k].x, p[k].y);
    g.lineTo(e.x, e.y);
  }

  function drawVia(g, x, y, stroke, fill, scale) {
    var r = viaR * (scale == null ? 1 : scale);
    if (r <= 0.2) return;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = lw;
    g.strokeStyle = stroke;
    g.stroke();
  }

  function viaEnds(t) {
    var end = t.p[t.p.length - 1];
    return t.pin >= 0 ? [end] : [t.p[0], end];
  }

  function drawDots(g, alpha) {
    g.globalAlpha = alpha;
    g.fillStyle = colors.dot;
    for (var n = 0; n < dots.length; n++) g.fillRect(dots[n][0] - 1, dots[n][1] - 1, 2, 2);
    g.globalAlpha = 1;
  }

  function paintBoard(layer, stroke, withDots) {
    var g = layer.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    if (withDots) drawDots(g, 1);
    g.lineJoin = "round";
    g.lineCap = "round";
    g.lineWidth = lw;
    g.strokeStyle = stroke;
    g.beginPath();
    traces.forEach(function (t) { tracePath(g, t, 0, t.len); });
    g.stroke();
    traces.forEach(function (t) {
      viaEnds(t).forEach(function (pt) { drawVia(g, pt.x, pt.y, stroke, colors.bg); });
    });
  }

  function drawStatic() {
    paintBoard(traceLayer, colors.trace, true);
    paintBoard(accentLayer, colors.pulse, false);
  }

  function renderStill() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(traceLayer, 0, 0, W, H);
  }

  // The traces etch themselves outward on load.
  function drawIntro(p) {
    drawDots(ctx, clamp(p * 1.6, 0, 1));
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = lw;
    ctx.strokeStyle = colors.trace;
    ctx.beginPath();
    var tips = [], done = [];
    traces.forEach(function (t) {
      var f = clamp((p - t.delay) / 0.55, 0, 1);
      if (f <= 0) return;
      var L = easeOut(f) * t.len;
      tracePath(ctx, t, 0, L);
      if (f < 1) tips.push(pointAt(t, L));
      else done.push({ t: t, pop: clamp((p - t.delay - 0.55) / 0.08, 0, 1) });
    });
    ctx.stroke();
    done.forEach(function (d) {
      viaEnds(d.t).forEach(function (pt) {
        drawVia(ctx, pt.x, pt.y, colors.trace, colors.bg, easeOut(d.pop));
      });
    });
    // A bright point at the tip of every trace that is still being etched.
    ctx.fillStyle = colors.pulse;
    tips.forEach(function (pt) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, lw * 1.3, 0, TAU);
      ctx.fill();
    });
  }

  /* ---------- Pulses ---------- */

  function addPulse(t, s, dir, speed, tail) {
    pulses.push({ t: t, s: s, dir: dir, v: speed, tail: tail, done: false });
    if (pulses.length > 120) pulses.splice(0, pulses.length - 120);
  }

  function spawnPulse() {
    if (!traces.length) return;
    var t, dir;
    if (pinTraces.length && Math.random() < 0.6) {
      t = pick(pinTraces);
      dir = -1; // toward the chip
    } else {
      t = pick(traces);
      dir = Math.random() < 0.5 ? 1 : -1;
    }
    if (t.len < cell * 2) return;
    addPulse(t, dir > 0 ? 0 : t.len, dir, rand(70, 190), rand(26, 70));
  }

  function hitPin(idx) {
    var el = pinEls[idx];
    if (el && el.animate) {
      el.animate({ fill: [colors.pinHot, colors.pinBase] }, { duration: 520, easing: "ease-out" });
    }
    if (led && led.animate && chip.classList.contains("led-on")) {
      led.animate({ opacity: [1, 0.25, 1] }, { duration: 200, easing: "linear" });
    }
  }

  function arrive(q) {
    var t = q.t;
    if (q.dir < 0 && t.pin >= 0) {
      hitPin(t.pin);
      return;
    }
    var e = q.dir > 0 ? t.p[t.p.length - 1] : t.p[0];
    rings.push({ x: e.x, y: e.y, age: 0, max: 0.6, r0: viaR, r1: viaR * 4 });
  }

  function updatePulses(dt) {
    var target = Math.min(26, Math.max(6, Math.round(traces.length * 0.3)));
    if (pulses.length < target && Math.random() < 0.12) spawnPulse();
    for (var n = pulses.length - 1; n >= 0; n--) {
      var q = pulses[n];
      q.s += q.dir * q.v * dt;
      var atEnd = q.dir > 0 ? q.s >= q.t.len : q.s <= 0;
      if (atEnd && !q.done) {
        q.done = true;
        arrive(q);
      }
      var tailPos = q.s - q.dir * q.tail;
      if (q.dir > 0 ? tailPos >= q.t.len : tailPos <= 0) pulses.splice(n, 1);
    }
  }

  function drawPulses() {
    if (!pulses.length) return;
    var clear = rgba(colors.pulseRgb, 0), glow = rgba(colors.pulseRgb, 0.5);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (colors.dark) ctx.globalCompositeOperation = "lighter";
    for (var n = 0; n < pulses.length; n++) {
      var q = pulses[n], t = q.t;
      var head = clamp(q.s, 0, t.len), tail = clamp(q.s - q.dir * q.tail, 0, t.len);
      var a = Math.min(head, tail), b = Math.max(head, tail);
      if (b - a < 0.5) continue;
      var hp = pointAt(t, head), tp = pointAt(t, tail);
      var g = ctx.createLinearGradient(tp.x, tp.y, hp.x, hp.y);
      g.addColorStop(0, clear);
      g.addColorStop(1, colors.pulse);
      ctx.strokeStyle = g;
      ctx.lineWidth = lw * 1.4;
      ctx.beginPath();
      tracePath(ctx, t, a, b);
      ctx.stroke();
      if (colors.dark) {
        var rg = ctx.createRadialGradient(hp.x, hp.y, 0, hp.x, hp.y, 10);
        rg.addColorStop(0, glow);
        rg.addColorStop(1, clear);
        ctx.fillStyle = rg;
        ctx.fillRect(hp.x - 10, hp.y - 10, 20, 20);
      }
      ctx.fillStyle = colors.head;
      ctx.beginPath();
      ctx.arc(hp.x, hp.y, lw * 1.2, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function drawRings(dt) {
    for (var n = rings.length - 1; n >= 0; n--) {
      var r = rings[n];
      r.age += dt;
      var f = r.age / r.max;
      if (f >= 1) { rings.splice(n, 1); continue; }
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * easeOut(f), 0, TAU);
      ctx.strokeStyle = rgba(colors.pulseRgb, (1 - f) * 0.8);
      ctx.lineWidth = lw;
      ctx.stroke();
    }
  }

  /* ---------- Cursor glow ---------- */

  function drawCursorGlow(dt) {
    var k = Math.min(1, dt * 10);
    mouse.x += (mouse.tx - mouse.x) * k;
    mouse.y += (mouse.ty - mouse.y) * k;
    mouse.a += ((mouse.on ? 1 : 0) - mouse.a) * Math.min(1, dt * 6);
    if (mouse.a < 0.02 || !introDone) return;

    var R = 170, size = Math.ceil(R * 2 * dpr);
    if (glowCanvas.width !== size) {
      glowCanvas.width = size;
      glowCanvas.height = size;
    }
    var g = glowCanvas.getContext("2d");
    g.globalCompositeOperation = "source-over";
    g.clearRect(0, 0, size, size);
    g.drawImage(accentLayer, (mouse.x - R) * dpr, (mouse.y - R) * dpr, size, size, 0, 0, size, size);
    g.globalCompositeOperation = "destination-in";
    var rg = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    rg.addColorStop(0, "rgba(0,0,0,1)");
    rg.addColorStop(0.35, "rgba(0,0,0,0.75)");
    rg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = rg;
    g.fillRect(0, 0, size, size);
    ctx.globalAlpha = mouse.a;
    ctx.drawImage(glowCanvas, mouse.x - R, mouse.y - R, R * 2, R * 2);
    ctx.globalAlpha = 1;
  }

  /* ---------- Clicks ---------- */

  function burst(x, y) {
    rings.push({ x: x, y: y, age: 0, max: 0.7, r0: 4, r1: 46 });
    var hits = [];
    traces.forEach(function (t) {
      var best = -1, bd = Infinity;
      for (var k = 0; k < t.p.length; k++) {
        var d = Math.hypot(t.p[k].x - x, t.p[k].y - y);
        if (d < bd) { bd = d; best = k; }
      }
      if (bd < cell * 2.6) hits.push({ t: t, k: best, d: bd });
    });
    hits.sort(function (a, b) { return a.d - b.d; });
    hits.slice(0, 8).forEach(function (h) {
      var s = h.t.cum[h.k];
      if (s < h.t.len) addPulse(h.t, s, 1, rand(240, 340), rand(40, 70));
      if (s > 0) addPulse(h.t, s, -1, rand(240, 340), rand(40, 70));
    });
  }

  // Click the chip: a pulse leaves every pin at once.
  function surge() {
    pinTraces.forEach(function (t) { addPulse(t, 0, 1, rand(280, 360), rand(50, 80)); });
    pinEls.forEach(function (el, n) { hitPin(n); });
    if (chip && chip.animate) {
      chip.animate({ transform: ["scale(1)", "scale(0.96)", "scale(1)"] }, { duration: 260, easing: "ease-out" });
    }
  }

  /* ---------- Loop ---------- */

  function frame(now) {
    rafId = 0;
    if (!running) return;
    if (!introStart) introStart = now;
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    var p = 1;
    if (!introDone) {
      p = (now - introStart) / INTRO_MS;
      if (p >= 1) introDone = true;
    }
    if (introDone) ctx.drawImage(traceLayer, 0, 0, W, H);
    else drawIntro(p);
    drawCursorGlow(dt);
    if (p > 0.75) updatePulses(dt);
    drawPulses();
    drawRings(dt);
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (running || !motion) return;
    running = true;
    last = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function sync() {
    if (onScreen && !document.hidden) start();
    else stop();
  }

  function rebuild() {
    readColors();
    layout();
    drawStatic();
    pulses = [];
    rings = [];
    if (!motion) renderStill();
  }

  function recolor() {
    readColors();
    drawStatic();
    if (!motion) renderStill();
  }

  /* ---------- Chip power-on ---------- */

  function bootChip() {
    if (!chip) return;
    // Pins light up in a sweep around the chip.
    var sweep = [10, 11, 12, 13, 14, 5, 6, 7, 8, 9, 19, 18, 17, 16, 15, 4, 3, 2, 1, 0];
    sweep.forEach(function (idx, n) {
      if (pinEls[idx]) pinEls[idx].style.setProperty("--i", n);
    });
    if (!motion) {
      chip.classList.add("is-on", "led-on");
      return;
    }
    var label = chip.querySelector(".chip-label");
    var word = label ? label.textContent : "";
    if (label) label.textContent = "";
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { chip.classList.add("is-on"); });
    });
    setTimeout(function () {
      if (!label) { chip.classList.add("led-on"); return; }
      var n = 0;
      var timer = setInterval(function () {
        n++;
        label.textContent = word.slice(0, n) + (n < word.length ? "_" : "");
        if (n >= word.length) {
          clearInterval(timer);
          chip.classList.add("led-on");
        }
      }, 85);
    }, 800);
  }

  /* ---------- Wiring ---------- */

  rebuild();
  bootChip();

  var resizeTimer = 0, lastW = W, lastH = H;
  if ("ResizeObserver" in window) {
    new ResizeObserver(function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (hero.clientWidth === lastW && hero.clientHeight === lastH) return;
        lastW = hero.clientWidth;
        lastH = hero.clientHeight;
        rebuild();
      }, 150);
    }).observe(hero);
  } else {
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(rebuild, 150);
    });
  }

  // Redraw in the new colors when the theme changes.
  new MutationObserver(function () {
    requestAnimationFrame(recolor);
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  if (window.matchMedia) {
    var scheme = window.matchMedia("(prefers-color-scheme: dark)");
    var onScheme = function () { requestAnimationFrame(recolor); };
    if (scheme.addEventListener) scheme.addEventListener("change", onScheme);
    else if (scheme.addListener) scheme.addListener(onScheme);
  }

  if (!motion) return;

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      onScreen = entries[entries.length - 1].isIntersecting;
      sync();
    }).observe(hero);
  }
  document.addEventListener("visibilitychange", sync);
  sync();

  hero.addEventListener("pointermove", function (e) {
    if (e.pointerType !== "mouse") return;
    var r = hero.getBoundingClientRect();
    mouse.tx = e.clientX - r.left;
    mouse.ty = e.clientY - r.top;
    if (mouse.a < 0.02) {
      mouse.x = mouse.tx;
      mouse.y = mouse.ty;
    }
    mouse.on = true;
  });
  hero.addEventListener("pointerleave", function () { mouse.on = false; });

  hero.addEventListener("click", function (e) {
    if (e.target.closest("a, button")) return;
    if (window.getSelection && String(window.getSelection())) return;
    if (chip && chip.contains(e.target)) { surge(); return; }
    var r = hero.getBoundingClientRect();
    burst(e.clientX - r.left, e.clientY - r.top);
  });
})();
