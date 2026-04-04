(function () {
  'use strict';

  var canvas = document.getElementById('spaceship-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');

  // Match site's CSS custom properties
  var GREEN  = '#33ff33';
  var AMBER  = '#ffb000';

  var W  = canvas.width;   // 560
  var H  = canvas.height;  // 160
  var CX = W / 2;
  var CY = H / 2;
  var FOV   = 4.0;
  var SCALE = H * 0.34;

  // ── Vertices  [x, y, z]  (z+ = away from viewer) ──
  var V = [
    // Nose
    [ 0.00,  0.00, -2.00],  //  0  nose tip
    // Forward hull ring
    [ 0.28,  0.20, -0.75],  //  1  fwd TR
    [-0.28,  0.20, -0.75],  //  2  fwd TL
    [ 0.28, -0.18, -0.75],  //  3  fwd BR
    [-0.28, -0.18, -0.75],  //  4  fwd BL
    // Gun barrel tips (one per wing)
    [ 2.00,  0.70, -1.20],  //  5  UR gun tip
    [-2.00,  0.70, -1.20],  //  6  UL gun tip
    [ 2.00, -0.62, -1.20],  //  7  LR gun tip
    [-2.00, -0.62, -1.20],  //  8  LL gun tip
    // Rear hull ring
    [ 0.38,  0.20,  1.10],  //  9  rear TR
    [-0.38,  0.20,  1.10],  // 10  rear TL
    [ 0.38, -0.18,  1.10],  // 11  rear BR
    [-0.38, -0.18,  1.10],  // 12  rear BL
    // Engine pods
    [ 0.47,  0.00,  1.38],  // 13  R engine inlet
    [-0.47,  0.00,  1.38],  // 14  L engine inlet
    [ 0.47,  0.00,  2.00],  // 15  R engine nozzle  ← exhaust glow
    [-0.47,  0.00,  2.00],  // 16  L engine nozzle  ← exhaust glow
    // Dorsal fin
    [ 0.00,  0.58, -0.20],  // 17  fin apex
    [ 0.00,  0.20,  0.75],  // 18  fin base rear
    // Upper-right wing (trapezoid panel, angled up)
    [ 0.60,  0.20, -0.10],  // 19  UR root leading
    [ 0.60,  0.20,  0.85],  // 20  UR root trailing
    [ 2.00,  0.70,  0.05],  // 21  UR tip leading
    [ 2.00,  0.58,  0.85],  // 22  UR tip trailing
    // Upper-left wing (mirror)
    [-0.60,  0.20, -0.10],  // 23  UL root leading
    [-0.60,  0.20,  0.85],  // 24  UL root trailing
    [-2.00,  0.70,  0.05],  // 25  UL tip leading
    [-2.00,  0.58,  0.85],  // 26  UL tip trailing
    // Lower-right wing (angled down)
    [ 0.60, -0.18, -0.10],  // 27  LR root leading
    [ 0.60, -0.18,  0.85],  // 28  LR root trailing
    [ 2.00, -0.62,  0.05],  // 29  LR tip leading
    [ 2.00, -0.50,  0.85],  // 30  LR tip trailing
    // Lower-left wing (mirror)
    [-0.60, -0.18, -0.10],  // 31  LL root leading
    [-0.60, -0.18,  0.85],  // 32  LL root trailing
    [-2.00, -0.62,  0.05],  // 33  LL tip leading
    [-2.00, -0.50,  0.85],  // 34  LL tip trailing
  ];

  // ── Edges: pairs of vertex indices ──
  var E = [
    // Nose strakes
    [0, 1], [0, 2], [0, 3], [0, 4],
    // Fwd hull ring
    [1, 2], [2, 4], [4, 3], [3, 1],
    // Upper-right wing panel + gun barrel
    [19, 21], [20, 22], [21, 22], [19, 20], [19, 22],
    [19,  1], [20,  9],   // root connects to fwd/rear hull TR
    [21,  5],             // gun barrel
    // Upper-left wing panel + gun barrel
    [23, 25], [24, 26], [25, 26], [23, 24], [23, 26],
    [23,  2], [24, 10],   // root connects to fwd/rear hull TL
    [25,  6],             // gun barrel
    // Lower-right wing panel + gun barrel
    [27, 29], [28, 30], [29, 30], [27, 28], [27, 30],
    [27,  3], [28, 11],   // root connects to fwd/rear hull BR
    [29,  7],             // gun barrel
    // Lower-left wing panel + gun barrel
    [31, 33], [32, 34], [33, 34], [31, 32], [31, 34],
    [31,  4], [32, 12],   // root connects to fwd/rear hull BL
    [33,  8],             // gun barrel
    // Hull fore→aft strakes
    [1, 9], [2, 10], [3, 11], [4, 12],
    // Rear hull ring
    [9, 10], [10, 12], [12, 11], [11, 9],
    // Engine pods
    [9, 13], [11, 13],
    [10, 14], [12, 14],
    [13, 15], [14, 16],
    [15, 16],
    // Dorsal fin
    [1, 17], [2, 17], [17, 18], [18, 9], [18, 10],
  ];

  // ─── Rotation helpers ────────────────────────────────────────────────────────
  function ry(v, a) {
    var c = Math.cos(a), s = Math.sin(a);
    return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
  }
  function rx(v, a) {
    var c = Math.cos(a), s = Math.sin(a);
    return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
  }

  // Perspective projection → screen coords, keeping z for depth sort
  function proj(v) {
    var z  = v[2] + FOV;
    var sc = (FOV / z) * SCALE;
    return [CX + v[0] * sc, CY - v[1] * sc, v[2]];
  }

  // ─── Drag-to-rotate state ─────────────────────────────────────────────────────
  var manualYaw   = 0, manualPitch = 0;
  var velYaw      = 0, velPitch    = 0;
  var userMoved   = false;   // true once the user has dragged
  var dragging    = false;
  var dragX       = 0, dragY = 0;
  var lastDX      = 0, lastDY = 0;  // last frame's delta for velocity capture
  var SENSITIVITY = 0.009;          // radians per pixel

  function pointerPos(e) {
    var r  = canvas.getBoundingClientRect();
    var sx = canvas.width  / r.width;
    var sy = canvas.height / r.height;
    var src = e.touches ? e.touches[0] : e;
    return [(src.clientX - r.left) * sx, (src.clientY - r.top) * sy];
  }

  function onDragStart(e) {
    e.preventDefault();
    dragging = true;
    var p = pointerPos(e);
    dragX = p[0]; dragY = p[1];
    lastDX = lastDY = 0;
    velYaw = velPitch = 0;
  }

  function onDragMove(e) {
    if (!dragging) return;
    e.preventDefault();
    var p  = pointerPos(e);
    lastDX = (p[0] - dragX) * SENSITIVITY;
    lastDY = (p[1] - dragY) * SENSITIVITY;
    manualYaw   += lastDX;
    manualPitch += lastDY;
    // clamp pitch so ship doesn't flip past poles
    manualPitch = Math.max(-Math.PI * 0.45, Math.min(Math.PI * 0.45, manualPitch));
    dragX = p[0]; dragY = p[1];
    userMoved = true;
  }

  function onDragEnd() {
    if (!dragging) return;
    dragging = false;
    // carry the last-frame delta as angular velocity
    velYaw   = lastDX;
    velPitch = lastDY;
  }

  canvas.addEventListener('mousedown',  onDragStart, { passive: false });
  canvas.addEventListener('mousemove',  onDragMove,  { passive: false });
  canvas.addEventListener('mouseup',    onDragEnd);
  canvas.addEventListener('mouseleave', onDragEnd);

  canvas.addEventListener('touchstart', onDragStart, { passive: false });
  canvas.addEventListener('touchmove',  onDragMove,  { passive: false });
  canvas.addEventListener('touchend',   onDragEnd);

  // visual cue: grab cursor when hovering
  canvas.style.cursor = 'grab';

  // ─── Animation loop ───────────────────────────────────────────────────────────
  var raf    = null;
  var paused = false;

  function draw(ts) {
    if (paused) return;

    ctx.clearRect(0, 0, W, H);

    var ay, ax;
    if (userMoved) {
      // After first interaction: use manual angles + inertia
      if (!dragging) {
        manualYaw   += velYaw;
        manualPitch += velPitch;
        manualPitch  = Math.max(-Math.PI * 0.45, Math.min(Math.PI * 0.45, manualPitch));
      }
      ay = manualYaw;
      ax = manualPitch;
    } else {
      // Default auto-rotation until user touches it
      ay = ts * 0.00055;
      ax = Math.sin(ts * 0.00028) * 0.22;  // gentle pitch wobble
    }

    var pts = V.map(function (v) { return proj(rx(ry(v, ay), ax)); });

    // ── Wireframe edges ──
    ctx.lineWidth = 1.5;

    for (var i = 0; i < E.length; i++) {
      var a = E[i][0], b = E[i][1];
      var pa = pts[a], pb = pts[b];

      // depth: -2 = closest, +2 = farthest → map to alpha 1.0 → 0.28
      var depth = (pa[2] + pb[2]) * 0.5;
      var t     = Math.max(0, Math.min(1, (depth + 2) / 4));
      var alpha = 1 - t * 0.72;

      ctx.globalAlpha  = alpha;
      ctx.shadowBlur   = 6 * alpha;
      ctx.shadowColor  = GREEN;
      ctx.strokeStyle  = GREEN;

      ctx.beginPath();
      ctx.moveTo(pa[0], pa[1]);
      ctx.lineTo(pb[0], pb[1]);
      ctx.stroke();
    }

    // ── Engine exhaust glow (amber) ──
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;
    var pulse = 0.55 + 0.45 * Math.sin(ts * 0.005);

    [15, 16].forEach(function (idx) {
      var p = pts[idx];
      var r = 11 * pulse;
      var g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r * 2.4);
      g.addColorStop(0,   AMBER);
      g.addColorStop(0.4, 'rgba(255,176,0,0.4)');
      g.addColorStop(1,   'rgba(255,176,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p[0], p[1], r * 2.4, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 0;

    raf = requestAnimationFrame(draw);
  }

  // ── Pause when scrolled off-screen (saves CPU) ───────────────────────────────
  if (window.IntersectionObserver) {
    var obs = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) {
        if (paused) { paused = false; raf = requestAnimationFrame(draw); }
      } else {
        paused = true;
        cancelAnimationFrame(raf);
      }
    }, { threshold: 0.1 });
    obs.observe(canvas);
  }

  raf = requestAnimationFrame(draw);
}());
