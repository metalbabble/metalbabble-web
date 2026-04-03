(function () {
  'use strict';

  var canvas = document.getElementById('grid-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');

  var W, H, VPX, VPY, floorH;

  // ── Star field (generated once, re-seeded on resize) ─────────────────────────
  var stars = [];
  var STAR_PALETTE = [
    '#ffffff','#ffe8ff','#e8f0ff','#fff0cc',
    '#ffaaee','#aaeeff','#aaffcc','#ff99cc'
  ];
  function makeStars() {
    stars = [];
    for (var i = 0; i < 100; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random(),
        r: Math.random() * 1.5 + 0.25,
        a: Math.random() * 0.55 + 0.25,
        c: STAR_PALETTE[Math.floor(Math.random() * STAR_PALETTE.length)]
      });
    }
  }

  function resize() {
    W      = canvas.width  = window.innerWidth;
    H      = canvas.height = window.innerHeight;
    VPX    = W * 0.5;
    VPY    = H * 0.40;
    floorH = H - VPY;
    makeStars();
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  // ── Color helpers ─────────────────────────────────────────────────────────────
  // Horizontal grid lines: pink-left → cyan-center → teal-right
  // Vertical lines use the same palette keyed by their bottom-x position.
  var COLOR_STOPS = [
    [255,  50, 180],   // left  – hot pink
    [160,  60, 255],   // ¼    – purple
    [ 51, 200, 255],   // ½    – sky cyan
    [ 51, 255, 170],   // ¾    – cyan-green
    [ 51, 255,  80],   // right – green
  ];
  function lerpColor(t) {
    // t in 0..1 across the full width
    var s = t * (COLOR_STOPS.length - 1);
    var i = Math.min(Math.floor(s), COLOR_STOPS.length - 2);
    var f = s - i;
    var a = COLOR_STOPS[i], b = COLOR_STOPS[i + 1];
    return [
      Math.round(a[0] + f * (b[0] - a[0])),
      Math.round(a[1] + f * (b[1] - a[1])),
      Math.round(a[2] + f * (b[2] - a[2]))
    ];
  }
  function rgba(rgb, a) {
    return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + a.toFixed(3) + ')';
  }

  var SPEED    = 0.14;
  var worldPos = 0;
  var lastTs   = null;
  var raf      = null;

  function draw(ts) {
    if (lastTs !== null) worldPos += (ts - lastTs) * 0.001 * SPEED;
    lastTs = ts;
    var frac = worldPos % 1;

    ctx.clearRect(0, 0, W, H);

    // ── Sky: deep dark-blue gradient ──────────────────────────────────────────
    var sky = ctx.createLinearGradient(0, 0, 0, VPY);
    sky.addColorStop(0, '#03010a');
    sky.addColorStop(1, '#0a021a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, VPY);

    // ── Stars ─────────────────────────────────────────────────────────────────
    for (var si = 0; si < stars.length; si++) {
      var s = stars[si];
      ctx.globalAlpha = s.a;
      ctx.fillStyle   = s.c;
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * VPY * 0.94, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ── Horizon atmospheric glow (wide pink/purple band) ──────────────────────
    var glowSpan = Math.max(70, H * 0.13);
    var atmo = ctx.createLinearGradient(0, VPY - glowSpan, 0, VPY + glowSpan * 0.7);
    atmo.addColorStop(0,    'rgba(0,0,0,0)');
    atmo.addColorStop(0.30, 'rgba(180,20,120,0.13)');
    atmo.addColorStop(0.55, 'rgba(255,40,170,0.32)');
    atmo.addColorStop(0.72, 'rgba(140,60,255,0.18)');
    atmo.addColorStop(1,    'rgba(0,0,0,0)');
    ctx.fillStyle = atmo;
    ctx.fillRect(0, VPY - glowSpan, W, glowSpan * 1.7);

    // Thin bright horizon line with left→right color gradient + glow
    ctx.save();
    ctx.shadowBlur  = 14;
    ctx.shadowColor = 'rgba(255,60,200,0.85)';
    var hLine = ctx.createLinearGradient(0, 0, W, 0);
    hLine.addColorStop(0,   'rgba(255,50,180,0.80)');
    hLine.addColorStop(0.5, 'rgba(100,210,255,0.95)');
    hLine.addColorStop(1,   'rgba(51,255,150,0.80)');
    ctx.strokeStyle = hLine;
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, VPY);
    ctx.lineTo(W, VPY);
    ctx.stroke();
    ctx.restore();

    // ── Horizontal grid lines ─────────────────────────────────────────────────
    // Build one shared left→right gradient (full alpha); vary per-line via globalAlpha
    var hGrad = ctx.createLinearGradient(0, 0, W, 0);
    hGrad.addColorStop(0,   'rgb(255,50,180)');
    hGrad.addColorStop(0.5, 'rgb(51,210,255)');
    hGrad.addColorStop(1,   'rgb(51,255,130)');

    var NUM_H = 22;
    for (var n = 1; n <= NUM_H; n++) {
      var z = n - frac;
      if (z < 0.05) continue;
      var y = VPY + floorH / z;
      if (y > H + 2) continue;

      var proximity = (y - VPY) / floorH;   // 0 = horizon, 1 = bottom
      var alpha     = proximity * proximity * 0.72;

      ctx.globalAlpha = alpha;
      ctx.strokeStyle = hGrad;
      ctx.lineWidth   = proximity > 0.78 ? 1.2 : 0.65;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // ── Vertical lines ────────────────────────────────────────────────────────
    var numV = Math.min(11, Math.max(6, Math.floor(W / 110)));
    for (var i = -numV; i <= numV; i++) {
      var xBottom  = VPX + i * (W / (numV * 2));
      var xNorm    = xBottom / W;                          // 0..1 left→right
      var distNorm = Math.abs(i) / numV;                   // 0=center, 1=edge
      var maxAlpha = (1 - distNorm * 0.5) * 0.50;

      var rgb = lerpColor(xNorm);
      // Gradient along the line: transparent at VP, full at bottom
      var vGrad = ctx.createLinearGradient(VPX, VPY, xBottom, H);
      vGrad.addColorStop(0,   rgba(rgb, 0));
      vGrad.addColorStop(0.25, rgba(rgb, maxAlpha * 0.4));
      vGrad.addColorStop(1,   rgba(rgb, maxAlpha));

      ctx.strokeStyle = vGrad;
      ctx.lineWidth   = 0.85;
      ctx.beginPath();
      ctx.moveTo(VPX, VPY);
      ctx.lineTo(xBottom, H);
      ctx.stroke();
    }

    raf = requestAnimationFrame(draw);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = null;
    } else {
      lastTs = null;
      raf = requestAnimationFrame(draw);
    }
  });

  raf = requestAnimationFrame(draw);
}());
