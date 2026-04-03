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
    // Wings
    [ 2.15,  0.08,  0.05],  //  5  R wing tip
    [-2.15,  0.08,  0.05],  //  6  L wing tip
    [ 0.82,  0.08,  0.05],  //  7  R wing root
    [-0.82,  0.08,  0.05],  //  8  L wing root
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
  ];

  // ── Edges: pairs of vertex indices ──
  var E = [
    // Nose strakes
    [0, 1], [0, 2], [0, 3], [0, 4],
    // Fwd hull ring
    [1, 2], [2, 4], [4, 3], [3, 1],
    // Wings
    [5, 7], [7, 8], [8, 6],
    [7, 1], [7, 3],   // R wing connects to fwd hull
    [8, 2], [8, 4],   // L wing connects to fwd hull
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

  // ─── Animation loop ───────────────────────────────────────────────────────────
  var raf    = null;
  var paused = false;

  function draw(ts) {
    if (paused) return;

    ctx.clearRect(0, 0, W, H);

    var ay = ts * 0.00055;
    var ax = Math.sin(ts * 0.00028) * 0.22;  // gentle pitch wobble

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
