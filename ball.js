/*
  The spinning baseball in the intro.

  The seam is the classic "tennis ball curve" on a unit sphere, with 108
  V-shaped stitches spaced evenly along it. Each pitch spins the ball around
  its own axis at its real rpm, slowed down 40x so you can see it:

    Fastball     backspin, the four-seam orientation (4 seams per turn)
    Curveball    tilted topspin
    Slider       mostly "gyro" spin, axis pointing at you
    Knuckleball  barely spins and wobbles

  Click or tap the ball to switch pitches. With "reduce motion" turned on
  the ball is drawn once and only changes when you click it.
*/
(function () {
  "use strict";

  var wrap = document.querySelector(".pitch");
  var btn = wrap && wrap.querySelector(".ball-btn");
  var canvas = wrap && wrap.querySelector(".ball");
  if (!wrap || !btn || !canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  if (!ctx) return;
  wrap.hidden = false;

  var hero = document.querySelector(".hero");
  var typeEl = wrap.querySelector(".pitch-type");
  var rpmEl = wrap.querySelector(".pitch-rpm");
  var hintEl = wrap.querySelector(".pitch-hint");
  var motion = document.documentElement.classList.contains("motion");
  var SLOW = 40;
  var TAU = Math.PI * 2;

  /* ---------- Small vector and quaternion helpers ---------- */

  function norm(v) {
    var l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function add(a, b, s) { return [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s]; }

  // Quaternions are [w, x, y, z].
  function qAxis(axis, angle) {
    var s = Math.sin(angle / 2);
    return [Math.cos(angle / 2), axis[0] * s, axis[1] * s, axis[2] * s];
  }
  function qMul(a, b) {
    return [
      a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
      a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
      a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
      a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]
    ];
  }
  function qNorm(q) {
    var l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
  }
  // The rotation that turns direction u into direction v.
  function qFromTo(u, v) {
    var d = dot(u, v);
    if (d < -0.9999) {
      var o = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      return qAxis(norm(cross(u, o)), Math.PI);
    }
    var c = cross(u, v);
    return qNorm([1 + d, c[0], c[1], c[2]]);
  }
  function qSlerp(a, b, t) {
    var d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    if (d < 0) { b = [-b[0], -b[1], -b[2], -b[3]]; d = -d; }
    if (d > 0.9995) {
      return qNorm([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t]);
    }
    var th = Math.acos(d), s = Math.sin(th);
    var wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
    return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb, a[3] * wa + b[3] * wb];
  }
  function qMat(q) {
    var w = q[0], x = q[1], y = q[2], z = q[3];
    return [
      1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
      2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
      2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)
    ];
  }

  /* ---------- The seam ---------- */

  var A = 0.44;
  function seamPoint(t) {
    var polar = Math.PI / 2 - (Math.PI / 2 - A) * Math.cos(t);
    var az = t / 2 + A * Math.sin(2 * t);
    return [Math.sin(polar) * Math.cos(az), Math.sin(polar) * Math.sin(az), Math.cos(polar)];
  }

  var DENSE = 1600, dense = [], cum = [0];
  for (var n = 0; n < DENSE; n++) {
    dense.push(seamPoint((n / DENSE) * 2 * TAU));
    if (n > 0) {
      var a0 = dense[n - 1], a1 = dense[n];
      cum.push(cum[n - 1] + Math.hypot(a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]));
    }
  }
  var seamLen = cum[DENSE - 1] + Math.hypot(dense[0][0] - dense[DENSE - 1][0], dense[0][1] - dense[DENSE - 1][1], dense[0][2] - dense[DENSE - 1][2]);

  // The groove line, and 108 stitches spaced evenly along the seam.
  var groove = [];
  for (n = 0; n < DENSE; n += 4) groove.push(dense[n]);

  var stitches = [];
  var STITCHES = 108, k = 0;
  for (var s = 0; s < STITCHES; s++) {
    var target = (s / STITCHES) * seamLen;
    while (k < DENSE - 1 && cum[k + 1] < target) k++;
    var P = dense[k];
    var T = norm([
      dense[(k + 1) % DENSE][0] - dense[(k + DENSE - 1) % DENSE][0],
      dense[(k + 1) % DENSE][1] - dense[(k + DENSE - 1) % DENSE][1],
      dense[(k + 1) % DENSE][2] - dense[(k + DENSE - 1) % DENSE][2]
    ]);
    var S = norm(cross(T, P));
    var w = 0.072, h = 0.03;
    stitches.push([
      norm(add(add(P, S, w), T, -h * 0.6)), norm(add(add(P, S, w * 0.22), T, h)),
      norm(add(add(P, S, -w), T, -h * 0.6)), norm(add(add(P, S, -w * 0.22), T, h))
    ]);
  }

  /* ---------- Pitches ---------- */

  // Screen axes: x right, y up, z toward you (the ball is coming at you).
  // A positive spin around +x is topspin. "seam" is the ball's own axis:
  // spinning around ball z crosses 4 seams per turn, ball y crosses 2.
  var PITCHES = [
    { name: "Fastball", rpm: 2300, axis: [-1, 0, 0], seam: [0, 0, 1] },
    { name: "Curveball", rpm: 2500, axis: norm([0.9, 0.42, 0]), seam: [0, 0, 1] },
    { name: "Slider", rpm: 2400, axis: norm([0.35, 0.3, 0.88]), seam: [0, 1, 0] },
    { name: "Knuckleball", rpm: 50, axis: norm([0.3, 1, 0.2]), seam: [0, 1, 0], wobble: true }
  ];

  var idx = 0, angle = 0, clock = 0, qBase = null, qNow = [1, 0, 0, 0], trans = null;

  function baseFor(p) {
    // Line the ball's axis up with the pitch's spin axis, then give it a
    // small roll so the seams don't sit perfectly symmetric.
    return qMul(qAxis(p.axis, 0.6), qFromTo(p.seam, p.axis));
  }

  function orientation(p) {
    var q = qMul(qAxis(p.axis, angle), qBase);
    if (p.wobble) {
      q = qMul(qAxis(norm([0.5, 0.8, 0.2]), 0.28 * Math.sin(clock * 1.3)), q);
      q = qMul(qAxis(norm([0.9, -0.2, 0.4]), 0.2 * Math.sin(clock * 0.8 + 1)), q);
    }
    return q;
  }

  /* ---------- Drawing ---------- */

  var size = 0, dpr = 1;

  function resize() {
    var r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    size = Math.max(1, Math.round(r.width));
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
  }

  function darkTheme() {
    return getComputedStyle(document.documentElement).getPropertyValue("--is-dark").trim() === "1";
  }

  var dark = darkTheme();

  function draw(q) {
    var M = qMat(q);
    var cx = size / 2, cy = size * 0.46, r = size * 0.38;

    function project(v) {
      var x = M[0] * v[0] + M[1] * v[1] + M[2] * v[2];
      var y = M[3] * v[0] + M[4] * v[1] + M[5] * v[2];
      var z = M[6] * v[0] + M[7] * v[1] + M[8] * v[2];
      return [cx + x * r, cy - y * r, z];
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    // Shadow on the "ground".
    var sy = cy + r * 1.2;
    var sg = ctx.createRadialGradient(cx, sy, 0, cx, sy, r * 0.8);
    sg.addColorStop(0, dark ? "rgba(0,0,0,0.55)" : "rgba(40,30,20,0.22)");
    sg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save();
    ctx.translate(cx, sy);
    ctx.scale(1, 0.16);
    ctx.translate(-cx, -sy);
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(cx, sy, r * 0.8, 0, TAU);
    ctx.fill();
    ctx.restore();

    // Leather.
    var g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r);
    g.addColorStop(0, "#fffdf8");
    g.addColorStop(0.55, "#efe8d9");
    g.addColorStop(1, "#c4b9a2");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();

    // The groove the stitches sit in.
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(1, r * 0.014);
    ctx.strokeStyle = "rgba(120, 98, 76, 0.4)";
    ctx.beginPath();
    var pen = false;
    for (var i = 0; i <= groove.length; i++) {
      var p = project(groove[i % groove.length]);
      if (p[2] > 0.02) {
        if (pen) ctx.lineTo(p[0], p[1]);
        else ctx.moveTo(p[0], p[1]);
        pen = true;
      } else {
        pen = false;
      }
    }
    ctx.stroke();

    // Red stitches, fading out as they turn away toward the edge.
    ctx.lineWidth = Math.max(1.2, r * 0.03);
    for (i = 0; i < stitches.length; i++) {
      var st = stitches[i];
      var a1 = project(st[0]), a2 = project(st[1]), b1 = project(st[2]), b2 = project(st[3]);
      var z = (a1[2] + a2[2] + b1[2] + b2[2]) / 4;
      if (z <= 0) continue;
      var alpha = Math.min(1, z / 0.28);
      ctx.strokeStyle = "rgba(196, 22, 46," + alpha.toFixed(3) + ")";
      ctx.beginPath();
      ctx.moveTo(a1[0], a1[1]);
      ctx.lineTo(a2[0], a2[1]);
      ctx.moveTo(b1[0], b1[1]);
      ctx.lineTo(b2[0], b2[1]);
      ctx.stroke();
    }

    // Shade the edge so it reads as a sphere, then a soft highlight.
    var edge = ctx.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
    edge.addColorStop(0, "rgba(70, 50, 30, 0)");
    edge.addColorStop(1, "rgba(70, 50, 30, 0.26)");
    ctx.fillStyle = edge;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();

    var hl = ctx.createRadialGradient(cx - r * 0.42, cy - r * 0.46, 0, cx - r * 0.42, cy - r * 0.46, r * 0.55);
    hl.addColorStop(0, "rgba(255, 255, 255, 0.6)");
    hl.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = hl;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();
  }

  /* ---------- Pitch switching ---------- */

  function label(p) {
    if (typeEl) typeEl.textContent = p.name;
    if (rpmEl) rpmEl.textContent = (p.rpm < 100 ? "~" : "") + p.rpm.toLocaleString("en-US") + " rpm";
  }

  function setPitch(i, fromClick) {
    idx = i;
    var p = PITCHES[idx];
    qBase = baseFor(p);
    angle = 0;
    label(p);
    if (fromClick && motion) {
      trans = { from: qNow, start: performance.now() };
      if (canvas.animate) {
        canvas.animate({ transform: ["scale(1)", "scale(0.9)", "scale(1.04)", "scale(1)"] }, { duration: 420, easing: "ease-out" });
      }
    }
    if (fromClick && hero) {
      // Let the circuit board send a ring of signals out from the ball.
      var r = canvas.getBoundingClientRect();
      hero.dispatchEvent(new CustomEvent("circuit:burst", {
        detail: { x: r.left + r.width / 2, y: r.top + r.height * 0.46, r: r.width * 0.38 }
      }));
    }
    if (!motion) {
      qNow = orientation(p);
      draw(qNow);
    }
  }

  btn.addEventListener("click", function () {
    setPitch((idx + 1) % PITCHES.length, true);
  });

  if (hintEl) {
    var touch = window.matchMedia && window.matchMedia("(hover: none)").matches;
    hintEl.textContent = (touch ? "Tap" : "Click") + " the ball to change pitch";
    if (motion) {
      var slow = document.createElement("span");
      slow.className = "pitch-slow";
      slow.textContent = "Spin shown " + SLOW + "x slower";
      hintEl.appendChild(slow);
    }
  }

  /* ---------- Loop ---------- */

  var running = false, onScreen = true, rafId = 0, last = 0;

  function frame(now) {
    rafId = 0;
    if (!running) return;
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    clock += dt;
    var p = PITCHES[idx];
    angle += (p.rpm / 60) * TAU / SLOW * dt;
    var q = orientation(p);
    if (trans) {
      var f = Math.min(1, (now - trans.start) / 550);
      var e = 1 - Math.pow(1 - f, 3);
      q = qSlerp(trans.from, q, e);
      if (f >= 1) trans = null;
    }
    qNow = q;
    draw(q);
    rafId = requestAnimationFrame(frame);
  }

  function sync() {
    var should = motion && onScreen && !document.hidden;
    if (should && !running) {
      running = true;
      last = 0;
      rafId = requestAnimationFrame(frame);
    } else if (!should && running) {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  resize();
  setPitch(0, false);
  if (!motion) {
    qNow = orientation(PITCHES[0]);
    draw(qNow);
  }

  if ("ResizeObserver" in window) {
    new ResizeObserver(function () {
      resize();
      if (!running) draw(qNow);
    }).observe(canvas);
  }

  function onTheme() {
    dark = darkTheme();
    if (!running) draw(qNow);
  }
  new MutationObserver(function () { requestAnimationFrame(onTheme); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  if (window.matchMedia) {
    var scheme = window.matchMedia("(prefers-color-scheme: dark)");
    if (scheme.addEventListener) scheme.addEventListener("change", onTheme);
    else if (scheme.addListener) scheme.addListener(onTheme);
  }

  if (!motion) return;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      onScreen = entries[entries.length - 1].isIntersecting;
      sync();
    }).observe(canvas);
  }
  document.addEventListener("visibilitychange", sync);
  sync();
})();
