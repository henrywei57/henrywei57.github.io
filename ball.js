/*
  The spinning baseball in the intro.

  The seam is the classic "tennis ball curve" on a unit sphere, with 108
  V-shaped stitches spaced evenly along it. Every MLB pitch type spins the
  ball around its own axis at a typical rpm, slowed down 40x so you can see
  it. Each visit starts on a random pitch and a random ball style. Clicking
  the ball throws a random different pitch, and the two menus pick any
  pitch or style.

  Styles: Classic, Dodgers (team colors, fan-made), ASCII, and Wireframe
  (which also draws the spin axis).

  With "reduce motion" turned on the ball is drawn once and only changes
  when you click it or use the menus.
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
  var pitchSelect = wrap.querySelector(".pitch-select");
  var styleSelect = wrap.querySelector(".style-select");
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
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

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

  var DENSE = 1600, dense = [], cum = [0], n;
  for (n = 0; n < DENSE; n++) {
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

  // Screen axes: x right, y up, z toward you (you're the catcher, the
  // pitcher is a righty). "move" is the direction the spin pushes the ball,
  // "gyro" is how many degrees the axis tips toward you (bullet spin), and
  // "seam" is the ball's own axis: around ball z it crosses 4 seams per
  // turn, around ball y it crosses 2. rpm values are typical MLB numbers.
  var FOUR = [0, 0, 1], TWO = [0, 1, 0];
  var PITCHES = [
    { name: "4-Seam Fastball", rpm: 2300, move: [-0.45, 1], gyro: 10, seam: FOUR },
    { name: "Sinker", rpm: 2150, move: [-1, 0.35], gyro: 15, seam: TWO },
    { name: "Cutter", rpm: 2400, move: [0.4, 0.8], gyro: 40, seam: FOUR },
    { name: "Slider", rpm: 2450, move: [0.9, 0.05], gyro: 55, seam: FOUR },
    { name: "Sweeper", rpm: 2550, move: [1, 0.1], gyro: 20, seam: TWO },
    { name: "Slurve", rpm: 2450, move: [0.8, -0.6], gyro: 30, seam: FOUR },
    { name: "Curveball", rpm: 2550, move: [0.45, -1], gyro: 20, seam: FOUR },
    { name: "Knuckle Curve", rpm: 2450, move: [0.35, -1], gyro: 20, seam: FOUR },
    { name: "Slow Curve", rpm: 2100, move: [0.3, -1], gyro: 15, seam: FOUR },
    { name: "Changeup", rpm: 1750, move: [-1, 0.45], gyro: 20, seam: TWO },
    { name: "Splitter", rpm: 1350, move: [-0.7, 0.3], gyro: 35, seam: TWO },
    { name: "Forkball", rpm: 1000, move: [-0.5, 0.1], gyro: 40, seam: TWO },
    { name: "Screwball", rpm: 2000, move: [-1, -0.5], gyro: 20, seam: TWO },
    { name: "Knuckleball", rpm: 50, wobble: true, seam: TWO },
    { name: "Eephus", rpm: 1300, move: [0, 1], gyro: 10, seam: FOUR }
  ];

  PITCHES.forEach(function (p) {
    if (p.wobble) {
      p.axis = norm([0.3, 1, 0.2]);
      return;
    }
    var m = norm([p.move[0], p.move[1], 0]);
    var g = (p.gyro * Math.PI) / 180;
    // The spin axis is (z cross movement), tipped toward you by the gyro angle.
    p.axis = norm([-m[1] * Math.cos(g), m[0] * Math.cos(g), Math.sin(g)]);
  });

  var STYLES = [
    { id: "classic", name: "Classic" },
    { id: "dodgers", name: "Dodgers" },
    { id: "ascii", name: "ASCII" },
    { id: "wire", name: "Wireframe" }
  ];

  function randomIndex(length, not) {
    var i = Math.floor(Math.random() * length);
    if (length > 1 && i === not) i = (i + 1 + Math.floor(Math.random() * (length - 1))) % length;
    return i;
  }

  var pIdx = randomIndex(PITCHES.length, -1);
  var sIdx = randomIndex(STYLES.length, -1);
  var angle = Math.random() * TAU, clock = 0, qBase = null, qNow = [1, 0, 0, 0], trans = null;
  var axisNow = PITCHES[pIdx].axis.slice();

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

  /* ---------- Theme colors ---------- */

  var theme = {};
  function readTheme() {
    var st = getComputedStyle(document.documentElement);
    function v(name, fallback) {
      var x = st.getPropertyValue(name).trim();
      return x || fallback;
    }
    theme.dark = v("--is-dark", "0") === "1";
    theme.ink = v("--ink", "#17181b");
    theme.ink3 = v("--ink-3", "#676b74");
    theme.line = v("--line", "#dedbd2");
    theme.accent = v("--accent", "#a44a17");
  }
  readTheme();

  /* ---------- Shared drawing bits ---------- */

  var size = 0, dpr = 1;

  function resize() {
    var r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    size = Math.max(1, Math.round(r.width));
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
  }

  function geometry() {
    return { cx: size / 2, cy: size * 0.46, r: size * 0.38 };
  }

  function projector(M, G) {
    return function (v) {
      var x = M[0] * v[0] + M[1] * v[1] + M[2] * v[2];
      var y = M[3] * v[0] + M[4] * v[1] + M[5] * v[2];
      var z = M[6] * v[0] + M[7] * v[1] + M[8] * v[2];
      return [G.cx + x * G.r, G.cy - y * G.r, z];
    };
  }

  function drawShadow(G, strength) {
    var sy = G.cy + G.r * 1.2;
    var sg = ctx.createRadialGradient(G.cx, sy, 0, G.cx, sy, G.r * 0.8);
    sg.addColorStop(0, theme.dark ? "rgba(0,0,0," + 0.55 * strength + ")" : "rgba(40,30,20," + 0.22 * strength + ")");
    sg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save();
    ctx.translate(G.cx, sy);
    ctx.scale(1, 0.16);
    ctx.translate(-G.cx, -sy);
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(G.cx, sy, G.r * 0.8, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /* ---------- Dodgers stamp ---------- */

  // The stamp sits on the leather spot farthest from the seam.
  var stampSpot = null, stampTex = null;

  function findStampSpot() {
    var best = -1, bestP = null, N = 1200;
    for (var i = 0; i < N; i++) {
      var y = 1 - ((i + 0.5) / N) * 2, rr = Math.sqrt(1 - y * y), phi = i * 2.399963;
      var p = [Math.cos(phi) * rr, y, Math.sin(phi) * rr];
      var dmin = 9;
      for (var j = 0; j < groove.length; j++) {
        var g = groove[j], dx = p[0] - g[0], dy = p[1] - g[1], dz = p[2] - g[2];
        var d = dx * dx + dy * dy + dz * dz;
        if (d < dmin) dmin = d;
      }
      if (dmin > best) { best = dmin; bestP = p; }
    }
    var C = bestP, near = groove[0], nd = 9;
    groove.forEach(function (g) {
      var d = (C[0] - g[0]) * (C[0] - g[0]) + (C[1] - g[1]) * (C[1] - g[1]) + (C[2] - g[2]) * (C[2] - g[2]);
      if (d < nd) { nd = d; near = g; }
    });
    // Run the text along the leather, at right angles to the nearest seam.
    var toward = norm(add(near, C, -dot(near, C)));
    var U = norm(cross(C, toward));
    stampSpot = { C: C, U: U, V: cross(U, C) };
  }

  function buildStampTexture() {
    var c = document.createElement("canvas");
    c.width = 512;
    c.height = 220;
    var g = c.getContext("2d");
    g.fillStyle = "#005a9c";
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    g.font = '700 30px ui-sans-serif, system-ui, "Segoe UI", Arial, sans-serif';
    if ("letterSpacing" in g) g.letterSpacing = "8px";
    g.fillText("LOS ANGELES", 256, 44);
    if ("letterSpacing" in g) g.letterSpacing = "0px";
    g.font = 'italic 700 118px "Brush Script MT", "Segoe Script", "Snell Roundhand", "Lucida Handwriting", cursive';
    g.fillText("Dodgers", 256, 168);
    g.fillRect(96, 192, 320, 5);
    stampTex = c;
  }

  function drawStamp(M, G) {
    if (!stampSpot) findStampSpot();
    if (!stampTex) buildStampTexture();
    var sp = stampSpot;
    function rot(v) {
      return [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
    }
    var C = rot(sp.C), U = rot(sp.U), V = rot(sp.V);
    if (C[2] < 0.08) return;
    var W = 0.95, Hh = W * (stampTex.height / stampTex.width);
    var ux = U[0] * G.r, uy = -U[1] * G.r, vx = V[0] * G.r, vy = -V[1] * G.r;
    var cx = G.cx + C[0] * G.r, cy = G.cy - C[1] * G.r;
    var a = (ux * W) / stampTex.width, b = (uy * W) / stampTex.width;
    var c = (vx * Hh) / stampTex.height, d = (vy * Hh) / stampTex.height;
    ctx.save();
    ctx.beginPath();
    ctx.arc(G.cx, G.cy, G.r, 0, TAU);
    ctx.clip();
    ctx.globalAlpha = 0.9 * clamp((C[2] - 0.08) / 0.3, 0, 1);
    ctx.setTransform(a * dpr, b * dpr, c * dpr, d * dpr,
      (cx - (ux * W) / 2 - (vx * Hh) / 2) * dpr, (cy - (uy * W) / 2 - (vy * Hh) / 2) * dpr);
    ctx.drawImage(stampTex, 0, 0);
    ctx.restore();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ---------- Style: leather (Classic and Dodgers) ---------- */

  function drawLeather(M, G, stitchRgb, stamp) {
    var project = projector(M, G);
    drawShadow(G, 1);

    var g = ctx.createRadialGradient(G.cx - G.r * 0.35, G.cy - G.r * 0.4, G.r * 0.05, G.cx, G.cy, G.r);
    g.addColorStop(0, "#fffdf8");
    g.addColorStop(0.55, "#efe8d9");
    g.addColorStop(1, "#c4b9a2");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(G.cx, G.cy, G.r, 0, TAU);
    ctx.fill();

    if (stamp) drawStamp(M, G);

    // The groove the stitches sit in.
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(1, G.r * 0.014);
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

    // Stitches, fading out as they turn away toward the edge.
    ctx.lineWidth = Math.max(1.2, G.r * 0.03);
    for (i = 0; i < stitches.length; i++) {
      var st = stitches[i];
      var a1 = project(st[0]), a2 = project(st[1]), b1 = project(st[2]), b2 = project(st[3]);
      var z = (a1[2] + a2[2] + b1[2] + b2[2]) / 4;
      if (z <= 0) continue;
      ctx.strokeStyle = "rgba(" + stitchRgb + "," + Math.min(1, z / 0.28).toFixed(3) + ")";
      ctx.beginPath();
      ctx.moveTo(a1[0], a1[1]);
      ctx.lineTo(a2[0], a2[1]);
      ctx.moveTo(b1[0], b1[1]);
      ctx.lineTo(b2[0], b2[1]);
      ctx.stroke();
    }

    // Shade the edge so it reads as a sphere, then a soft highlight.
    var edge = ctx.createRadialGradient(G.cx, G.cy, G.r * 0.55, G.cx, G.cy, G.r);
    edge.addColorStop(0, "rgba(70, 50, 30, 0)");
    edge.addColorStop(1, "rgba(70, 50, 30, 0.26)");
    ctx.fillStyle = edge;
    ctx.beginPath();
    ctx.arc(G.cx, G.cy, G.r, 0, TAU);
    ctx.fill();

    var hx = G.cx - G.r * 0.42, hy = G.cy - G.r * 0.46;
    var hl = ctx.createRadialGradient(hx, hy, 0, hx, hy, G.r * 0.55);
    hl.addColorStop(0, "rgba(255, 255, 255, 0.6)");
    hl.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = hl;
    ctx.beginPath();
    ctx.arc(G.cx, G.cy, G.r, 0, TAU);
    ctx.fill();
  }

  /* ---------- Style: ASCII ---------- */

  // Distance to the seam for every spot on the ball, on a lat/long grid.
  // Built the first time ASCII is shown.
  var seamGrid = null, GW = 180, GH = 90;

  function buildSeamGrid() {
    seamGrid = new Float32Array(GW * GH);
    for (var j = 0; j < GH; j++) {
      var pol = ((j + 0.5) / GH) * Math.PI, sp = Math.sin(pol), cp = Math.cos(pol);
      for (var i = 0; i < GW; i++) {
        var az = ((i + 0.5) / GW) * TAU - Math.PI;
        var x = sp * Math.cos(az), y = sp * Math.sin(az), z = cp, best = 9;
        for (var q = 0; q < groove.length; q++) {
          var g = groove[q], dx = x - g[0], dy = y - g[1], dz = z - g[2];
          var d = dx * dx + dy * dy + dz * dz;
          if (d < best) best = d;
        }
        seamGrid[j * GW + i] = Math.sqrt(best);
      }
    }
  }

  function seamDistance(p) {
    var pol = Math.acos(clamp(p[2], -1, 1)), az = Math.atan2(p[1], p[0]);
    var j = Math.min(GH - 1, Math.floor((pol / Math.PI) * GH));
    var i = Math.min(GW - 1, Math.floor(((az + Math.PI) / TAU) * GW));
    return seamGrid[j * GW + i];
  }

  var RAMP = ".:-=+*#%@";
  var LIGHT = norm([-0.45, 0.55, 0.7]);

  function drawAscii(M, G) {
    if (!seamGrid) buildSeamGrid();
    var cw = clamp(size / 34, 5.6, 8.6), ch = cw * 1.75;
    var cols = Math.floor(size / cw), rows = Math.floor(size / ch);
    var offX = (size - cols * cw) / 2, offY = (size - rows * ch) / 2;
    ctx.font = "700 " + (ch * 0.92).toFixed(1) + 'px ui-monospace, "SFMono-Regular", "Cascadia Mono", Menlo, Consolas, monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    var stitchColor = theme.dark ? "#ff6b7d" : "#c4162e";
    var body = [], seam = [];
    for (var row = 0; row < rows; row++) {
      for (var col = 0; col < cols; col++) {
        var sx = offX + (col + 0.5) * cw, sy = offY + (row + 0.5) * ch;
        var x = (sx - G.cx) / G.r, y = -(sy - G.cy) / G.r, d2 = x * x + y * y;
        if (d2 > 1) continue;
        var z = Math.sqrt(1 - d2);
        // Back into the ball's own frame to find the seam.
        var bx = M[0] * x + M[3] * y + M[6] * z;
        var by = M[1] * x + M[4] * y + M[7] * z;
        var bz = M[2] * x + M[5] * y + M[8] * z;
        var sd = seamDistance([bx, by, bz]);
        if (sd < 0.085) {
          seam.push([sx, sy, sd < 0.03 ? "=" : "x"]);
          continue;
        }
        var lam = Math.max(0, x * LIGHT[0] + y * LIGHT[1] + z * LIGHT[2]);
        var bright = 0.12 + 0.88 * lam;
        var level = theme.dark ? bright : 1 - bright * 0.85;
        body.push([sx, sy, RAMP.charAt(Math.min(RAMP.length - 1, Math.floor(level * RAMP.length)))]);
      }
    }
    ctx.fillStyle = theme.ink;
    body.forEach(function (c) { ctx.fillText(c[2], c[0], c[1]); });
    ctx.fillStyle = stitchColor;
    seam.forEach(function (c) { ctx.fillText(c[2], c[0], c[1]); });
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  /* ---------- Style: Wireframe ---------- */

  var wireLines = null;

  function buildWire() {
    wireLines = [];
    var i, t, line;
    for (i = 0; i < 12; i++) {
      var lon = (i * Math.PI) / 12;
      line = [];
      for (t = 0; t <= 64; t++) {
        var a = (t / 64) * TAU;
        line.push([Math.cos(a) * Math.cos(lon), Math.cos(a) * Math.sin(lon), Math.sin(a)]);
      }
      wireLines.push(line);
    }
    [-60, -30, 0, 30, 60].forEach(function (deg) {
      var lat = (deg * Math.PI) / 180;
      line = [];
      for (t = 0; t <= 64; t++) {
        var b = (t / 64) * TAU;
        line.push([Math.cos(lat) * Math.cos(b), Math.cos(lat) * Math.sin(b), Math.sin(lat)]);
      }
      wireLines.push(line);
    });
  }

  function strokeSplit(points, project, front, back) {
    // Draws the parts facing you and the parts facing away in two passes.
    [true, false].forEach(function (facing) {
      var style = facing ? front : back;
      if (!style) return;
      ctx.strokeStyle = style.color;
      ctx.globalAlpha = style.alpha;
      ctx.lineWidth = style.width;
      ctx.beginPath();
      var pen = false;
      for (var i = 0; i < points.length; i++) {
        var p = project(points[i]);
        if ((p[2] > 0) === facing) {
          if (pen) ctx.lineTo(p[0], p[1]);
          else ctx.moveTo(p[0], p[1]);
          pen = true;
        } else {
          pen = false;
        }
      }
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  function drawWire(M, G) {
    if (!wireLines) buildWire();
    var project = projector(M, G);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.strokeStyle = theme.ink3;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(G.cx, G.cy, G.r, 0, TAU);
    ctx.stroke();

    wireLines.forEach(function (line) {
      strokeSplit(line, project, { color: theme.ink3, alpha: 0.55, width: 1 }, { color: theme.ink3, alpha: 0.14, width: 1 });
    });
    var loop = groove.concat([groove[0]]);
    strokeSplit(loop, project, { color: theme.accent, alpha: 1, width: Math.max(1.6, G.r * 0.022) },
      { color: theme.accent, alpha: 0.25, width: 1 });

    // The spin axis, with an arrow on the end the right-hand rule points to.
    var ax = axisNow, len = G.r * 1.32;
    var x0 = G.cx - ax[0] * len, y0 = G.cy + ax[1] * len;
    var x1 = G.cx + ax[0] * len, y1 = G.cy - ax[1] * len;
    ctx.strokeStyle = theme.ink;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.setLineDash([]);
    var dx = x1 - x0, dy = y1 - y0, dl = Math.hypot(dx, dy);
    if (dl > 8) {
      var ux = dx / dl, uy = dy / dl, hs = 8;
      ctx.fillStyle = theme.ink;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - ux * hs - uy * hs * 0.55, y1 - uy * hs + ux * hs * 0.55);
      ctx.lineTo(x1 - ux * hs + uy * hs * 0.55, y1 - uy * hs - ux * hs * 0.55);
      ctx.closePath();
      ctx.fill();
    } else {
      // Axis pointing straight at you: draw it as a dot.
      ctx.fillStyle = theme.ink;
      ctx.beginPath();
      ctx.arc(G.cx, G.cy, 3.5, 0, TAU);
      ctx.fill();
    }
  }

  /* ---------- Draw dispatcher ---------- */

  function draw(q) {
    var M = qMat(q), G = geometry();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    var style = STYLES[sIdx].id;
    if (style === "dodgers") drawLeather(M, G, "0, 90, 156", true);
    else if (style === "ascii") drawAscii(M, G);
    else if (style === "wire") drawWire(M, G);
    else drawLeather(M, G, "196, 22, 46", false);
  }

  /* ---------- Labels, menus and hints ---------- */

  var touch = window.matchMedia && window.matchMedia("(hover: none)").matches;

  function label(p) {
    if (typeEl) typeEl.textContent = p.name;
    if (rpmEl) rpmEl.textContent = "~" + p.rpm.toLocaleString("en-US") + " rpm";
  }

  function updateHint() {
    if (!hintEl) return;
    hintEl.textContent = (touch ? "Tap" : "Click") + " the ball for a random pitch";
    function line(text) {
      var span = document.createElement("span");
      span.className = "pitch-line";
      span.textContent = text;
      hintEl.appendChild(span);
    }
    if (motion) line("Spin shown " + SLOW + "x slower");
    if (STYLES[sIdx].id === "dodgers") line("Fan-made style, not an official Dodgers ball");
  }

  function fillSelect(select, items, current) {
    if (!select) return;
    select.textContent = "";
    items.forEach(function (item, i) {
      var opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = item.name;
      select.appendChild(opt);
    });
    select.value = String(current);
  }

  function burstFromBall() {
    if (!hero) return;
    var r = canvas.getBoundingClientRect();
    hero.dispatchEvent(new CustomEvent("circuit:burst", {
      detail: { x: r.left + r.width / 2, y: r.top + r.height * 0.46, r: r.width * 0.38 }
    }));
  }

  function setPitch(i, animate) {
    pIdx = i;
    var p = PITCHES[pIdx];
    qBase = baseFor(p);
    angle = Math.random() * TAU;
    label(p);
    if (pitchSelect) pitchSelect.value = String(pIdx);
    if (animate && motion) {
      trans = { from: qNow, start: performance.now() };
      if (canvas.animate) {
        canvas.animate({ transform: ["scale(1)", "scale(0.9)", "scale(1.04)", "scale(1)"] }, { duration: 420, easing: "ease-out" });
      }
    }
    if (animate) burstFromBall();
    if (!motion) {
      axisNow = p.axis.slice();
      qNow = orientation(p);
      draw(qNow);
    }
  }

  function setStyle(i) {
    sIdx = i;
    if (styleSelect) styleSelect.value = String(sIdx);
    updateHint();
    if (!running) draw(qNow);
  }

  fillSelect(pitchSelect, PITCHES, pIdx);
  fillSelect(styleSelect, STYLES, sIdx);

  btn.addEventListener("click", function () {
    setPitch(randomIndex(PITCHES.length, pIdx), true);
  });
  if (pitchSelect) {
    pitchSelect.addEventListener("change", function () {
      setPitch(parseInt(pitchSelect.value, 10) || 0, true);
    });
  }
  if (styleSelect) {
    styleSelect.addEventListener("change", function () {
      setStyle(parseInt(styleSelect.value, 10) || 0);
    });
  }

  /* ---------- Loop ---------- */

  var running = false, onScreen = true, rafId = 0, last = 0;

  function frame(now) {
    rafId = 0;
    if (!running) return;
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    clock += dt;
    var p = PITCHES[pIdx];
    angle += ((p.rpm / 60) * TAU * dt) / SLOW;
    var kk = Math.min(1, dt * 8);
    axisNow = norm([
      axisNow[0] + (p.axis[0] - axisNow[0]) * kk,
      axisNow[1] + (p.axis[1] - axisNow[1]) * kk,
      axisNow[2] + (p.axis[2] - axisNow[2]) * kk
    ]);
    var q = orientation(p);
    if (trans) {
      var f = Math.min(1, (now - trans.start) / 550);
      q = qSlerp(trans.from, q, 1 - Math.pow(1 - f, 3));
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
  updateHint();
  setPitch(pIdx, false);
  qNow = orientation(PITCHES[pIdx]);
  if (!motion) draw(qNow);

  if ("ResizeObserver" in window) {
    new ResizeObserver(function () {
      resize();
      if (!running) draw(qNow);
    }).observe(canvas);
  }

  function onTheme() {
    readTheme();
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
