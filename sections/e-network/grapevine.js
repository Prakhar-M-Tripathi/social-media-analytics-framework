/* Section E page logic: the living network, its five tools, and the plates. */
(function () {
  'use strict';
  var P = window.Profiler, N = window.Network, K = N.K_MIN;
  var $ = function (id) { return document.getElementById(id); };
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var SHARED = '../../data/posts.csv', SAMPLE_CSV = '../c-demographics/sample/audience_sample.csv', SAMPLE_JS = '../c-demographics/sample/audience_sample.js';
  var A = '../a-data-collection/output/', SIDECARS = [A + 'live_post_metadata.csv', A + 'demo_post_metadata.csv'];

  var PALETTE = ['#a3de76', '#b48cff', '#ffc266', '#ff7f9e', '#78c8ff', '#62e0c0', '#ff9f73', '#ec83e0', '#d3e070', '#8da2ff', '#f7a6c4', '#6fd6e8'];
  var GREY = '#7d7290';
  var PLAT = { X: '#78c8ff', Telegram: '#62e0c0', Instagram: '#ec83e0', Facebook: '#8da2ff', YouTube: '#ff7f9e', Reddit: '#ff9f73' };
  var ROLE = { Bridge: '#ffc266', Hub: '#a3de76', Spark: '#ff7f9e', Amplifier: '#b48cff', Regular: '#8d84a0', Listener: '#544a66', Official: '#ffffff' };
  var ROLE_LINE = { Bridge: 'Joins circles that would otherwise drift apart.', Hub: 'Where everyone comes to talk.', Spark: 'Starts what others carry.', Amplifier: 'Passes it on, loudly.', Regular: 'The steady middle of the crowd.', Listener: 'Joins in, never answered.' };
  var MOOD_COL = { '1': '#a3de76', '0': '#ffc266', '-1': '#ff7f9e' };
  var FONT = getComputedStyle(document.body).fontFamily, DISPLAY = 'Fraunces, Georgia, serif';

  var S = {
    G: null, V: [], tool: 'explore', arrange: 'web', colorBy: 'circle', focus: -1, hover: -1, hl: null,
    cam: { x: 0, y: 0, z: 1 }, W: 0, H: 0, dpr: 1, ctx: null, layer: null, lctx: null, layerDirty: true,
    px: null, py: null, tx: null, ty: null, moving: true, onscreen: true, manual: false,
    clock: { t: 1, playing: false, dur: 16000 }, last: 0, pulses: [],
    tag: null, replay: null, whisper: null, wp: 0.2, wseed: -1, cut: { how: 'bridge', frac: 0, res: null }, path: { a: -1, b: -1, nodes: null },
    layouts: {}, nodeFirst: null, top: [], metric: 'pr', vineIdx: 0, vineX: 'hops', relayTag: null, relayDim: 'platform', relayView: 'volume', mixDim: 'region', speedType: 'all'
  };

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return Number(n).toLocaleString('en-US'); }
  function hexA(hex, a) { var n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }
  function notice(kind, html) { $('notice').innerHTML = html ? '<div class="banner ' + kind + '">' + html + '</div>' : ''; }
  function dayLabel(ms) { return new Date(ms).toUTCString().slice(5, 16); }
  function mark() { S.layerDirty = true; }
  function press(host, attr, val) { host.querySelectorAll('button').forEach(function (b) { if (b.hasAttribute(attr)) b.setAttribute('aria-pressed', String(b.getAttribute(attr) === val)); }); }

  /* ==================================== data ==================================== */
  function fetchText(url) { return fetch(url, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.text(); }); }
  function tryText(url) { return fetchText(url).catch(function () { return null; }); }
  function loadSample() {
    if (window.SAMPLE_AUDIENCE_CSV) return Promise.resolve(window.SAMPLE_AUDIENCE_CSV);
    return fetchText(SAMPLE_CSV).catch(function () {
      return new Promise(function (ok, bad) {
        var s = document.createElement('script'); s.src = SAMPLE_JS;
        s.onload = function () { window.SAMPLE_AUDIENCE_CSV ? ok(window.SAMPLE_AUDIENCE_CSV) : bad(new Error('empty')); };
        s.onerror = function () { bad(new Error('missing')); };
        document.head.appendChild(s);
      });
    });
  }
  function linkCount(rows) { var c = 0; rows.forEach(function (r) { if (r.ref_post_id || r.parent_id) c++; }); return c; }
  function loadDefault() {
    return tryText(SHARED).then(function (t) {
      var rows = t ? P.parseCSV(t) : [];
      if (linkCount(rows) < 30) return null;
      if (P.hasProfileColumns(rows)) return { rows: rows, title: 'Shared project dataset', meta: 'data/posts.csv', demo: false };
      return Promise.all(SIDECARS.map(tryText)).then(function (ts) {
        ts.forEach(function (x) { if (x) P.mergeProfileFields(rows, P.parseCSV(x)); });
        return { rows: rows, title: 'Shared project dataset', meta: 'data/posts.csv', demo: false };
      });
    }).then(function (found) {
      if (found) return found;
      return loadSample().then(function (t) { return { rows: P.parseCSV(t), title: 'Shared sample audience', meta: 'the same file Section C reads', demo: true }; });
    }).then(function (d) { if (!S.manual) setData(d.rows, d.title, d.meta, d.demo); }).catch(function () {
      if (S.manual) return;
      $('dataset-title').textContent = 'Nothing to listen to yet';
      $('dataset-meta').textContent = 'Load a CSV with post_id, user_id, timestamp and parent_id or ref_post_id.';
      notice('error', '<b>No data</b><span>The shared sample could not be loaded. Load a CSV to begin.</span>');
    });
  }

  function setData(rows, title, meta, demo) {
    var G = N.build(rows, P);
    S.G = G;
    S.V = G.nodes.filter(function (n) { return n.linked; }).map(function (n) { return n.i; });
    var n = G.nodes.length;
    S.px = new Float32Array(n); S.py = new Float32Array(n); S.tx = new Float32Array(n); S.ty = new Float32Array(n);
    S.focus = -1; S.hl = null; S.layouts = {}; S.cut = { how: 'bridge', frac: 0, res: null }; S.whisper = null; S.path = { a: -1, b: -1, nodes: null }; S.replay = null;
    S.clock.t = 1; S.clock.playing = false;
    S.nodeFirst = new Float64Array(n).fill(Infinity);
    G.edges.forEach(function (e) { if (e.first < S.nodeFirst[e.s]) S.nodeFirst[e.s] = e.first; if (e.first < S.nodeFirst[e.t]) S.nodeFirst[e.t] = e.first; });
    S.top = G.audienceLinked.slice().sort(function (a, b) { return b.pr - a.pr; });
    S.wseed = S.top.length ? S.top[0].i : -1;
    S.tag = G.trends.length ? G.trends[0].tag : null;
    S.relayTag = S.tag; S.vineIdx = 0;
    S.edgeTime = { min: G.tMin, max: G.tMax };
    if (G.edges.length) { S.edgeTime.min = Math.min.apply(null, G.edges.map(function (e) { return e.first; })); }

    $('dataset-title').textContent = title;
    $('dataset-meta').innerHTML = fmt(rows.length) + ' posts &middot; ' + fmt(n) + ' anonymous voices &middot; ' + meta;
    notice(demo ? 'demo' : '', demo ? '<b>Synthetic data</b><span>Every voice and conversation here is fictional and generated for the demo. Codenames are invented too.</span>' : '');
    $('download').disabled = !G.edges.length;

    if (!G.edges.length) {
      notice('error', '<b>No threads</b><span>This file has no parent_id or ref_post_id links, so there is no network to draw.</span>');
    }
    arrange(S.arrange, true);
    kpis(); renderLegend(); setTool('explore'); renderPlates();
  }

  function kpis() {
    var s = S.G.stats, mix = N.mixing(S.G, 'circle', 30);
    $('k-voices').textContent = fmt(s.voices); $('k-silent').textContent = fmt(s.silent) + ' spoke and heard nothing back';
    $('k-threads').textContent = fmt(s.threads); $('k-inter').textContent = fmt(s.interactions) + ' exchanges';
    $('k-circles').textContent = fmt(s.communities); $('k-inside').textContent = Math.round(mix.inside) + '% of talk stays inside';
    $('k-hops').textContent = s.avgPath; $('k-far').textContent = 'on average, ' + s.diameter + ' at the very most';
  }

  /* ==================================== layouts ==================================== */
  function layoutWeb() {
    var G = S.G, V = S.V, n = G.nodes.length, r = N.rngFrom(42), x = new Float32Array(n), y = new Float32Array(n);
    var order = G.comms.slice().sort(function (a, b) { return a.platform < b.platform ? -1 : a.platform > b.platform ? 1 : b.size - a.size; }), center = {};
    order.forEach(function (c, i) { var a = i / order.length * Math.PI * 2 - 1.2, rad = 0.62 + (i % 2) * 0.1; center[c.id] = [Math.cos(a) * rad, Math.sin(a) * rad]; });
    center[-1] = [0, 0];
    V.forEach(function (i) { var c = center[G.nodes[i].comm]; x[i] = c[0] + (r() - .5) * .3; y[i] = c[1] + (r() - .5) * .3; });
    var fx = new Float32Array(n), fy = new Float32Array(n), cell = 0.14, it;
    for (it = 0; it < 280; it++) {
      fx.fill(0); fy.fill(0);
      var grid = new Map(), i, j;
      for (i = 0; i < V.length; i++) { var v = V[i], key = Math.floor(x[v] / cell) * 4096 + Math.floor(y[v] / cell); var g = grid.get(key); if (g) g.push(v); else grid.set(key, [v]); }
      for (i = 0; i < V.length; i++) {
        var a = V[i], cx = Math.floor(x[a] / cell), cy = Math.floor(y[a] / cell);
        for (var ax = -1; ax <= 1; ax++) for (var ay = -1; ay <= 1; ay++) {
          var list = grid.get((cx + ax) * 4096 + cy + ay); if (!list) continue;
          for (j = 0; j < list.length; j++) {
            var b = list[j]; if (b === a) continue;
            var dx = x[a] - x[b], dy = y[a] - y[b], d2 = dx * dx + dy * dy + 1e-5;
            if (d2 > cell * cell) continue;
            var f = 0.00012 / d2; fx[a] += dx * f; fy[a] += dy * f;
          }
        }
        var ct = center[G.nodes[a].comm], pull = G.nodes[a].comm < 0 ? 0.002 : 0.009;
        fx[a] += (ct[0] - x[a]) * pull; fy[a] += (ct[1] - y[a]) * pull;
      }
      G.edges.forEach(function (e) {
        var dx = x[e.t] - x[e.s], dy = y[e.t] - y[e.s], same = G.nodes[e.s].comm === G.nodes[e.t].comm, k = same ? 0.011 : 0.0016;
        fx[e.s] += dx * k; fy[e.s] += dy * k; fx[e.t] -= dx * k; fy[e.t] -= dy * k;
      });
      var cool = 1 - it / 340;
      for (i = 0; i < V.length; i++) { var q = V[i], m = Math.hypot(fx[q], fy[q]), lim = 0.03 * cool; if (m > lim) { fx[q] *= lim / m; fy[q] *= lim / m; } x[q] += fx[q]; y[q] += fy[q]; }
    }
    var mx = 0.01; V.forEach(function (i) { mx = Math.max(mx, Math.abs(x[i]), Math.abs(y[i])); });
    V.forEach(function (i) { x[i] /= mx; y[i] /= mx; });
    return { x: x, y: y };
  }
  function layoutOrbit() {
    var G = S.G, V = S.V, n = G.nodes.length, x = new Float32Array(n), y = new Float32Array(n);
    var rank = V.slice().sort(function (a, b) { return G.nodes[b].pr - G.nodes[a].pr; }), rk = {};
    rank.forEach(function (v, i) { rk[v] = i; });
    var groups = {}; V.forEach(function (v) { (groups[G.nodes[v].comm] = groups[G.nodes[v].comm] || []).push(v); });
    var keys = Object.keys(groups).sort(function (a, b) { return groups[b].length - groups[a].length; }), ang = 0, total = V.length;
    keys.forEach(function (k) {
      var span = groups[k].length / total * Math.PI * 2;
      groups[k].sort(function (a, b) { return rk[a] - rk[b]; }).forEach(function (v, i) {
        var a = ang + span * (((i * 0.618034) % 1) * 0.9 + 0.05), t = rk[v] / total, r = 0.1 + 0.86 * Math.pow(t, 0.55);
        x[v] = Math.cos(a) * r; y[v] = Math.sin(a) * r;
      });
      ang += span;
    });
    return { x: x, y: y, rings: [0.32, 0.6, 0.96] };
  }
  function layoutIsles() {
    var G = S.G, V = S.V, n = G.nodes.length, x = new Float32Array(n), y = new Float32Array(n), plats = {};
    V.forEach(function (v) { (plats[G.nodes[v].platform] = plats[G.nodes[v].platform] || []).push(v); });
    var names = Object.keys(plats).sort(), maxSize = 1, labels = [];
    names.forEach(function (p) { maxSize = Math.max(maxSize, plats[p].length); });
    names.forEach(function (p, i) {
      var a = i / names.length * Math.PI * 2 - Math.PI / 2, cx = Math.cos(a) * 0.62, cy = Math.sin(a) * 0.62, list = plats[p].sort(function (u, v) { return G.nodes[v].pr - G.nodes[u].pr; });
      var R = 0.34 * Math.sqrt(list.length / maxSize), c = R / Math.sqrt(Math.max(1, list.length));
      list.forEach(function (v, j) { var ang = j * 2.39996, rad = c * Math.sqrt(j + 0.5); x[v] = cx + Math.cos(ang) * rad; y[v] = cy + Math.sin(ang) * rad; });
      labels.push({ x: cx, y: cy - R - 0.05, text: p });
    });
    return { x: x, y: y, labels: labels };
  }
  function arrange(kind, first) {
    S.arrange = kind;
    var L = S.layouts[kind] || (S.layouts[kind] = kind === 'orbit' ? layoutOrbit() : kind === 'isles' ? layoutIsles() : layoutWeb());
    S.tx.set(L.x); S.ty.set(L.y);
    if (first && !reduce) { S.px.fill(0); S.py.fill(0); } else if (reduce) { S.px.set(L.x); S.py.set(L.y); }
    S.moving = true; mark();
    press(document.querySelector('.hud'), 'data-arr', kind);
  }

  /* ==================================== canvas ==================================== */
  function resize() {
    var el = $('sky'), r = el.getBoundingClientRect(), cv = $('web');
    S.dpr = Math.min(2, window.devicePixelRatio || 1);
    S.W = Math.round(r.width); S.H = Math.round(r.height);
    cv.width = S.W * S.dpr; cv.height = S.H * S.dpr;
    S.ctx = cv.getContext ? cv.getContext('2d') : null;
    if (!S.layer) S.layer = document.createElement('canvas');
    S.layer.width = cv.width; S.layer.height = cv.height;
    S.lctx = S.layer.getContext ? S.layer.getContext('2d') : null;
    mark();
  }
  function sx(x) { return S.W / 2 + S.cam.x + x * Math.min(S.W / 2 - 24, (S.H / 2 - 30) * 1.75) * S.cam.z; }
  function hudPad() { return S.W < 560 ? 56 : 0; }
  function sy(y) { return S.H / 2 + hudPad() + S.cam.y + y * (S.H / 2 - 30 - hudPad()) * S.cam.z; }
  function radius(n) { return (1.7 + 9.5 * Math.sqrt(n.influence)) * Math.pow(S.cam.z, 0.35) * (S.W < 560 ? 0.75 : 1); }

  function baseColor(n) {
    if (S.colorBy === 'platform') return PLAT[n.platform] || GREY;
    if (S.colorBy === 'role') return ROLE[n.role] || GREY;
    if (S.colorBy === 'mood') { var m = n.moodN ? n.moodSum / n.moodN : 0; return m > 0.2 ? MOOD_COL['1'] : m < -0.2 ? MOOD_COL['-1'] : MOOD_COL['0']; }
    return n.comm >= 0 ? PALETTE[n.comm % PALETTE.length] : GREY;
  }
  function groupKey(n) {
    if (S.colorBy === 'platform') return n.platform;
    if (S.colorBy === 'role') return n.role;
    if (S.colorBy === 'mood') { var m = n.moodN ? n.moodSum / n.moodN : 0; return m > 0.2 ? 'Warm' : m < -0.2 ? 'Sour' : 'Even'; }
    return n.circle;
  }
  function cutTime() { var e = S.edgeTime; return e.min + (e.max - e.min) * S.clock.t + 1; }

  /* What each voice looks like under the current tool: [colour, alpha, size multiplier]. */
  function look(n, now) {
    var i = n.i, ego = S.focus >= 0;
    if (S.tool === 'replay' && S.replay) {
      var m = S.replay.state[i];
      if (m === undefined) return [GREY, 0.16, 0.8];
      return [MOOD_COL[String(m)], 1, 1.25];
    }
    if (S.tool === 'whisper' && S.whisper) {
      var hop = S.whisper.shown[i];
      if (hop === undefined) return [GREY, 0.14, 0.8];
      return [hop === 0 ? '#ffffff' : S.whisper.color(hop), 1, hop === 0 ? 2 : 1.2];
    }
    if (S.tool === 'cut' && S.cut.res && S.cut.frac > 0) {
      if (S.cut.res.removed[i]) return ['#ff7f9e', 0.5, 0.8];
      var cid = S.cut.res.comp[i];
      if (S.cut.res.sizes[cid] === S.cut.res.largest) return [baseColor(n), 0.85, 1];
      return ['#ffc266', 1, 1.1];
    }
    if (S.tool === 'path' && S.path.nodes) { if (S.path.nodes[i] !== undefined) return ['#ffc266', 1, 2]; return [baseColor(n), 0.14, 0.9]; }
    if (S.tool === 'path' && (i === S.path.a)) return ['#ffc266', 1, 2];
    if (S.tool === 'explore' && S.nodeFirst[i] > cutTime()) return [GREY, 0, 0];
    if (ego) { if (i === S.focus) return ['#ffffff', 1, 1.8]; if (S.G.und[S.focus].has(i)) return [baseColor(n), 1, 1.2]; return [baseColor(n), 0.12, 0.9]; }
    if (S.hl) return groupKey(n) === S.hl ? [baseColor(n), 1, 1.15] : [baseColor(n), 0.1, 0.9];
    return [baseColor(n), 0.95, 1];
  }

  function drawLayer(now) {
    var c = S.lctx; if (!c) return;
    var G = S.G, V = S.V, L = S.layouts[S.arrange], i;
    c.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    c.clearRect(0, 0, S.W, S.H);
    if (L.rings) { c.strokeStyle = 'rgba(255,255,255,.06)'; c.setLineDash([2, 7]); L.rings.forEach(function (r) { c.beginPath(); c.ellipse(sx(0), sy(0), Math.abs(sx(r) - sx(0)), Math.abs(sy(r) - sy(0)), 0, 0, 6.2832); c.stroke(); }); c.setLineDash([]); }
    // threads, batched by colour
    var buckets = {}, muted = S.tool !== 'explore' || S.focus >= 0 || S.hl, cut = cutTime(), res = S.tool === 'cut' && S.cut.frac > 0 ? S.cut.res : null, ego = S.focus;
    G.edges.forEach(function (e) {
      if (S.tool === 'explore' && e.first > cut) return;
      if (res && (res.removed[e.s] || res.removed[e.t])) return;
      var a = G.nodes[e.s], b = G.nodes[e.t], key;
      if (ego >= 0 && S.tool === 'explore' && (e.s === ego || e.t === ego)) key = '#ffffff|0.55';
      else if (muted) key = '#b9aec9|0.05';
      else if (e.cross) key = '#ffc266|0.35';
      else if (S.colorBy === 'circle' && a.comm >= 0 && a.comm === b.comm) key = PALETTE[a.comm % PALETTE.length] + '|0.17';
      else if (S.colorBy === 'platform') key = (PLAT[a.platform] || GREY) + '|0.14';
      else key = '#b9aec9|0.09';
      (buckets[key] = buckets[key] || []).push(e);
    });
    c.lineWidth = 1;
    Object.keys(buckets).forEach(function (k) {
      var p = k.split('|'); c.strokeStyle = hexA(p[0], p[1]); c.beginPath();
      buckets[k].forEach(function (e) {
        var x1 = sx(S.px[e.s]), y1 = sy(S.py[e.s]), x2 = sx(S.px[e.t]), y2 = sy(S.py[e.t]);
        c.moveTo(x1, y1); c.quadraticCurveTo((x1 + x2) / 2 + (y2 - y1) * 0.12, (y1 + y2) / 2 - (x2 - x1) * 0.12, x2, y2);
      });
      c.stroke();
    });
    if (S.tool === 'path' && S.path.list) {
      c.strokeStyle = '#ffc266'; c.lineWidth = 2.4; c.beginPath();
      S.path.list.forEach(function (v, j) { var x = sx(S.px[v]), y = sy(S.py[v]); if (j) c.lineTo(x, y); else c.moveTo(x, y); }); c.stroke();
    }
    // voices
    for (i = 0; i < V.length; i++) {
      var n = G.nodes[V[i]], l = look(n, now); if (!l[1]) continue;
      var x = sx(S.px[n.i]), y = sy(S.py[n.i]), r = radius(n) * l[2];
      if (x < -20 || y < -20 || x > S.W + 20 || y > S.H + 20) continue;
      if (r > 4 && l[1] > 0.5) { c.fillStyle = hexA(l[0], 0.16); c.beginPath(); c.arc(x, y, r * 2.3, 0, 6.2832); c.fill(); }
      c.globalAlpha = l[1]; c.fillStyle = l[0]; c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill();
      if (n.org && l[1] > 0.5) { c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 1; c.beginPath(); c.arc(x, y, r + 2.5, 0, 6.2832); c.stroke(); }
      c.globalAlpha = 1;
      if (res && res.removed[n.i]) { c.strokeStyle = '#ff7f9e'; c.lineWidth = 1; c.beginPath(); c.moveTo(x - 3, y - 3); c.lineTo(x + 3, y + 3); c.moveTo(x + 3, y - 3); c.lineTo(x - 3, y + 3); c.stroke(); }
    }
    // names of the biggest voices and island labels
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    if (L.labels) { c.font = 'italic 17px ' + DISPLAY; c.fillStyle = 'rgba(240,235,245,.75)'; L.labels.forEach(function (l) { c.fillText(l.text, sx(l.x), sy(l.y)); }); }
    if (S.tool === 'explore' && S.focus < 0 && !S.hl && !S.moving && S.clock.t >= 0.999 && S.W > 620) {
      c.font = 'italic 13px ' + DISPLAY; c.fillStyle = 'rgba(240,235,245,.82)';
      var seen = {}, boxes = [];
      S.top.forEach(function (n) {
        if (boxes.length >= 9 || seen[n.comm]) return;
        var lx = sx(S.px[n.i]), ly = sy(S.py[n.i]) - radius(n) - 6, w = c.measureText(n.name).width;
        if (boxes.some(function (b) { return Math.abs(b[0] - lx) < (b[2] + w) / 2 + 8 && Math.abs(b[1] - ly) < 18; })) return;
        seen[n.comm] = 1; boxes.push([lx, ly, w]); c.fillText(n.name, lx, ly);
      });
    }
    if (S.focus >= 0) { var f = G.nodes[S.focus]; c.font = 'italic 15px ' + DISPLAY; c.fillStyle = '#fff'; c.fillText(f.name, sx(S.px[S.focus]), sy(S.py[S.focus]) - radius(f) * 1.8 - 8); }
    if (S.tool === 'path') [S.path.a, S.path.b].forEach(function (v) { if (v >= 0) { c.font = 'italic 14px ' + DISPLAY; c.fillStyle = '#ffc266'; c.fillText(G.nodes[v].name, sx(S.px[v]), sy(S.py[v]) - 16); } });
  }

  function travel(ctx, a, b, f, color) {
    var x1 = sx(S.px[a]), y1 = sy(S.py[a]), x2 = sx(S.px[b]), y2 = sy(S.py[b]), mx = (x1 + x2) / 2 + (y2 - y1) * 0.12, my = (y1 + y2) / 2 - (x2 - x1) * 0.12, u = 1 - f;
    var x = u * u * x1 + 2 * u * f * mx + f * f * x2, y = u * u * y1 + 2 * u * f * my + f * f * y2;
    ctx.fillStyle = hexA(color, 0.28); ctx.beginPath(); ctx.arc(x, y, 6, 0, 6.2832); ctx.fill();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 2.3, 0, 6.2832); ctx.fill();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(64, now - (S.last || now)); S.last = now;
    if (!S.G || !S.G.edges.length || !S.onscreen || !S.ctx) return;
    var G = S.G, V = S.V, i;
    if (S.moving) {
      var ease = reduce ? 1 : 0.075, mv = 0;
      for (i = 0; i < V.length; i++) { var v = V[i], dx = S.tx[v] - S.px[v], dy = S.ty[v] - S.py[v]; S.px[v] += dx * ease; S.py[v] += dy * ease; mv += Math.abs(dx) + Math.abs(dy); }
      if (mv / Math.max(1, V.length) < 0.0009) { S.px.set(S.tx); S.py.set(S.ty); S.moving = false; }
      mark();
    }
    if (S.clock.playing) {
      S.clock.t = Math.min(1, S.clock.t + dt / S.clock.dur);
      var sc = $('scrub'); if (sc) sc.value = Math.round(S.clock.t * 1000);
      if (S.clock.t >= 1) { S.clock.playing = false; setPlayUI(); }
      if (S.tool === 'replay') updateReplay(now);
      updateRead(); mark();
    }
    if (S.tool === 'whisper' && S.whisper && S.whisper.running) stepWhisper(now);
    if (S.layerDirty) { drawLayer(now); S.layerDirty = false; }
    var c = S.ctx; c.setTransform(S.dpr, 0, 0, S.dpr, 0, 0); c.clearRect(0, 0, S.W, S.H);
    c.drawImage(S.layer, 0, 0, S.W, S.H);
    // moving dots
    if (S.tool === 'explore' && !reduce && S.focus < 0 && !S.hl && S.clock.t >= 1) {
      if (S.pulses.length < 9 && Math.random() < 0.09) { var e = G.edges[Math.floor(Math.random() * G.edges.length)]; S.pulses.push({ a: e.t, b: e.s, t: 0, col: e.cross ? '#ffc266' : '#ffffff' }); }
      S.pulses = S.pulses.filter(function (p) { p.t += dt / 1300; if (p.t >= 1) return false; travel(c, p.a, p.b, p.t, p.col); return true; });
    }
    if (S.tool === 'replay' && S.replay) S.replay.active.forEach(function (p) { travel(c, p.from, p.to, p.f, MOOD_COL[String(p.mood)]); });
    if (S.tool === 'whisper' && S.whisper && S.whisper.running) S.whisper.active.forEach(function (p) { travel(c, p.from, p.to, p.f, '#ffc266'); });
    if (S.hover >= 0) { var h = G.nodes[S.hover]; c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.arc(sx(S.px[h.i]), sy(S.py[h.i]), radius(h) + 3.5, 0, 6.2832); c.stroke(); }
  }

  /* pointer */
  function local(e) { var r = $('sky').getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function hit(pos) {
    if (!S.G) return -1;
    var best = -1, bd = 1e9;
    S.V.forEach(function (v) { var n = S.G.nodes[v]; if (S.tool === 'explore' && S.nodeFirst[v] > cutTime()) return; var dx = sx(S.px[v]) - pos.x, dy = sy(S.py[v]) - pos.y, d = dx * dx + dy * dy, r = Math.max(radius(n) + 3, 9); if (d < r * r && d < bd) { bd = d; best = v; } });
    return best;
  }
  var drag = null;
  function overUi(e) { return e.target.closest && e.target.closest('.hud,.zoom,.dossier'); }
  $('sky').addEventListener('pointerdown', function (e) { if (overUi(e)) return; drag = { x: e.clientX, y: e.clientY, cx: S.cam.x, cy: S.cam.y, moved: 0, touch: e.pointerType === 'touch' }; });
  window.addEventListener('pointerup', function () { $('sky').classList.remove('drag'); setTimeout(function () { drag = null; }, 0); });
  $('sky').addEventListener('pointermove', function (e) {
    if (overUi(e)) { S.hover = -1; $('tip').hidden = true; return; }
    if (drag && !drag.touch && e.buttons) {
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
      if (drag.moved > 4) { $('sky').classList.add('drag'); S.cam.x = drag.cx + dx; S.cam.y = drag.cy + dy; mark(); $('tip').hidden = true; S.hover = -1; return; }
    }
    var pos = local(e), h = hit(pos);
    S.hover = h; $('sky').style.cursor = h >= 0 ? 'pointer' : '';
    var tip = $('tip');
    if (h < 0) { tip.hidden = true; return; }
    var n = S.G.nodes[h];
    tip.innerHTML = '<b>' + esc(n.name) + '</b><span>' + esc(n.role) + ' &middot; ' + esc(n.circle) + '</span>';
    tip.hidden = false; tip.style.left = Math.max(110, Math.min(S.W - 110, pos.x)) + 'px'; tip.style.top = Math.max(60, pos.y) + 'px';
  });
  $('sky').addEventListener('pointerleave', function () { S.hover = -1; $('tip').hidden = true; });
  $('sky').addEventListener('click', function (e) {
    if (overUi(e) || !S.G || (drag && drag.moved > 4)) return;
    var v = hit(local(e));
    if (S.tool === 'whisper') { if (v >= 0) { S.wseed = v; startWhisper(); } return; }
    if (S.tool === 'path') { if (v >= 0) pickPath(v); return; }
    if (S.tool === 'explore') { setFocus(v >= 0 && v !== S.focus ? v : -1); }
  });
  $('sky').addEventListener('wheel', function (e) { if (!e.ctrlKey) return; e.preventDefault(); zoom(e.deltaY < 0 ? 1.15 : 0.87); }, { passive: false });
  $('sky').addEventListener('dblclick', function (e) { if (!overUi(e)) zoom(1.5); });
  function zoom(f) { S.cam.z = Math.max(0.6, Math.min(7, S.cam.z * f)); S.cam.x *= f; S.cam.y *= f; mark(); }
  $('zin').addEventListener('click', function () { zoom(1.3); });
  $('zout').addEventListener('click', function () { zoom(1 / 1.3); });
  $('zfit').addEventListener('click', function () { S.cam = { x: 0, y: 0, z: 1 }; mark(); });

  function setFocus(v) {
    S.focus = v; var d = $('dossier');
    if (v < 0) { d.hidden = true; mark(); return; }
    var n = S.G.nodes[v], c = ROLE[n.role] || GREY;
    d.innerHTML = '<button type="button" class="x" data-act="close" aria-label="Close">&times;</button><h4>' + esc(n.name) + '</h4><div class="sub">' + esc(n.circle) + '</div><span class="rolechip" style="--c:' + c + '">' + esc(n.role) + '</span>' +
      '<div class="dl"><span>Answered by</span><b>' + fmt(n.inD) + ' voices</b><span>Talks to</span><b>' + fmt(n.outD) + ' voices</b><span>Circles touched</span><b>' + fmt(n.circlesTouched) + '</b><span>Weight rank</span><b>' + (n.rank_weight ? '#' + n.rank_weight : '–') + '</b><span>Bridge rank</span><b>' + (n.rank_bridge ? '#' + n.rank_bridge : '–') + '</b><span>Grew from their posts</span><b>' + fmt(n.spark) + '</b><span>Inner-core depth</span><b>' + n.core + '</b></div>' +
      '<div class="acts"><button type="button" class="btn go" data-act="whisper">Whisper from here</button><button type="button" class="btn" data-act="path">Trace</button></div>';
    d.hidden = false; mark();
  }
  $('dossier').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]'); if (!b) return;
    var a = b.getAttribute('data-act'), f = S.focus;
    if (a === 'close') setFocus(-1);
    if (a === 'whisper') { S.wseed = f; setTool('whisper'); startWhisper(); }
    if (a === 'path') { setTool('path'); pickPath(f); }
  });

  /* ==================================== tools ==================================== */
  var PLAY = '<svg viewBox="0 0 14 14"><path d="M3 1.5v11l9-5.5z"/></svg>', PAUSE = '<svg viewBox="0 0 14 14"><rect x="2" y="1" width="3.5" height="12" rx="1"/><rect x="8.5" y="1" width="3.5" height="12" rx="1"/></svg>';
  function setPlayUI() { var b = $('play'); if (b) { b.innerHTML = S.clock.playing ? PAUSE : PLAY; b.setAttribute('aria-label', S.clock.playing ? 'Pause' : 'Play'); } }
  function scrubRow() { return '<div class="timebar"><button type="button" class="play" id="play"></button><div class="scrub"><svg id="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"></svg><input type="range" id="scrub" min="0" max="1000" value="' + Math.round(S.clock.t * 1000) + '" aria-label="Timeline"></div><div class="read" id="read"></div></div>'; }
  function spark(times, t0, t1) {
    var svg = $('spark'); if (!svg) return;
    var bins = 60, c = new Array(bins).fill(0);
    times.forEach(function (x) { c[Math.min(bins - 1, Math.max(0, Math.floor((x - t0) / Math.max(1, t1 - t0) * bins)))]++; });
    var mx = Math.max.apply(null, c) || 1, d = 'M0 30', i;
    for (i = 0; i < bins; i++) d += ' L' + (i / (bins - 1) * 100).toFixed(2) + ' ' + (30 - 26 * c[i] / mx).toFixed(2);
    svg.innerHTML = '<defs><linearGradient id="sg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#a3de76" stop-opacity=".55"/><stop offset="1" stop-color="#a3de76" stop-opacity="0"/></linearGradient></defs><path d="' + d + ' L100 30 Z" fill="url(#sg)" stroke="#a3de76" stroke-opacity=".7" stroke-width="1" vector-effect="non-scaling-stroke"/>';
  }
  function wireClock() {
    setPlayUI();
    $('play').addEventListener('click', function () { if (S.clock.t >= 0.999) { S.clock.t = 0; } S.clock.playing = !S.clock.playing; S.last = performance.now(); setPlayUI(); mark(); if (S.tool === 'replay') updateReplay(performance.now()); });
    $('scrub').addEventListener('input', function () { S.clock.playing = false; setPlayUI(); S.clock.t = this.value / 1000; if (S.tool === 'replay') updateReplay(performance.now()); updateRead(); mark(); });
  }

  function setTool(t) {
    S.tool = t; S.clock.playing = false; S.hover = -1;
    document.querySelectorAll('#tools button').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-tool') === t)); });
    if (t !== 'explore') setFocus(-1);
    if (t === 'explore') toolExplore(); else if (t === 'replay') toolReplay(); else if (t === 'whisper') toolWhisper(); else if (t === 'cut') toolCut(); else toolPath();
    mark();
  }
  $('tools').addEventListener('click', function (e) { var b = e.target.closest('button[data-tool]'); if (b && S.G) setTool(b.getAttribute('data-tool')); });

  function toolExplore() {
    S.clock.t = 1; S.clock.dur = 16000;
    $('toolbar').innerHTML = scrubRow() + '<div class="hint">Press play to watch the vine grow. Click a voice to read its dossier. Drag to move around.</div>';
    spark(S.G.edges.map(function (e) { return e.first; }), S.edgeTime.min, S.edgeTime.max); wireClock(); updateRead();
  }

  function toolReplay() {
    S.clock.t = 0; S.clock.dur = 20000;
    var G = S.G;
    if (!G.trends.length) { $('toolbar').innerHTML = '<div class="hint">No trend shared by 5 voices in this file.</div>'; return; }
    $('toolbar').innerHTML = '<div class="tagchips" id="replay-tags">' + G.trends.map(function (t) { return '<button type="button" class="tagc" data-t="' + esc(t.tag) + '" aria-pressed="' + (t.tag === S.tag) + '">' + esc(t.tag) + '</button>'; }).join('') + '</div>' + scrubRow();
    $('replay-tags').addEventListener('click', function (e) { var b = e.target.closest('button[data-t]'); if (!b) return; S.tag = b.getAttribute('data-t'); press($('replay-tags'), 'data-t', S.tag); startReplay(true); });
    wireClock(); startReplay(!reduce);
  }
  function startReplay(auto) {
    var t = S.G.trends.filter(function (x) { return x.tag === S.tag; })[0];
    S.replay = { trend: t, state: {}, active: [] };
    S.clock.t = auto ? 0 : 1; var sc = $('scrub'); if (sc) sc.value = Math.round(S.clock.t * 1000);
    S.clock.playing = !!auto; setPlayUI();
    spark(t.posts.map(function (i) { return S.G.posts[i].ts; }), t.first, t.last);
    updateReplay(performance.now()); updateRead(); mark();
  }
  function updateReplay() {
    var r = S.replay; if (!r) return;
    var G = S.G, t = r.trend, cut = t.first + (t.last - t.first) * S.clock.t, win = Math.max(3600000, (t.last - t.first) * 0.035), st = {}, act = [], neg = 0, n = 0, plats = {}, voices = {};
    t.posts.forEach(function (pi) {
      var p = G.posts[pi]; if (p.ts > cut + 1) return;
      n++; plats[p.platform] = 1; voices[p.a] = 1; st[p.a] = p.mood === null ? 0 : p.mood; if (p.mood === -1) neg++;
      if (p.ref >= 0 && cut - p.ts < win) act.push({ from: G.posts[p.ref].a, to: p.a, f: Math.min(1, (cut - p.ts) / win), mood: p.mood === null ? 0 : p.mood });
    });
    r.state = st; r.active = act; r.counts = { n: n, neg: neg, plats: Object.keys(plats).length, voices: Object.keys(voices).length, cut: cut };
  }
  function updateRead() {
    var el = $('read'); if (!el) return;
    if (S.tool === 'replay' && S.replay && S.replay.counts) { var c = S.replay.counts; el.innerHTML = '<b>' + dayLabel(c.cut) + '</b><br>' + fmt(c.voices) + ' voices &middot; ' + c.plats + ' platform' + (c.plats === 1 ? '' : 's') + ' &middot; ' + (c.n ? Math.round(100 * c.neg / c.n) : 0) + '% sour'; return; }
    var ct = cutTime(), seen = S.G.edges.filter(function (e) { return e.first <= ct; }).length;
    el.innerHTML = '<b>' + dayLabel(Math.min(ct, S.edgeTime.max)) + '</b><br>' + fmt(seen) + ' of ' + fmt(S.G.edges.length) + ' threads';
  }

  /* whisper */
  function toolWhisper() {
    var G = S.G, hub = S.top[0], br = G.audienceLinked.slice().sort(function (a, b) { return b.bc - a.bc; })[0], listener = G.audienceLinked.filter(function (n) { return n.role === 'Listener'; })[0];
    $('toolbar').innerHTML = '<div class="row-t"><div class="slider"><label for="wp">How catching is it?</label><input type="range" id="wp" min="3" max="60" value="' + Math.round(S.wp * 100) + '"><output id="wpv">' + Math.round(S.wp * 100) + '%</output></div><div class="tagchips" id="wstart"><button type="button" class="tagc" data-v="' + hub.i + '">Biggest hub</button><button type="button" class="tagc" data-v="' + br.i + '">Top bridge</button>' + (listener ? '<button type="button" class="tagc" data-v="' + listener.i + '">A listener</button>' : '') + '</div><button type="button" class="btn go" id="wgo">Release the rumour</button></div><div class="result" id="wres"></div>';
    $('wp').addEventListener('input', function () { S.wp = this.value / 100; $('wpv').textContent = this.value + '%'; });
    $('wp').addEventListener('change', startWhisper);
    $('wstart').addEventListener('click', function (e) { var b = e.target.closest('button[data-v]'); if (b) { S.wseed = Number(b.getAttribute('data-v')); startWhisper(); } });
    $('wgo').addEventListener('click', startWhisper);
    startWhisper();
  }
  function startWhisper() {
    if (S.wseed < 0) return;
    var r = N.whisper(S.G, S.wseed, S.wp), odds = N.whisperOdds(S.G, S.wseed, S.wp, 200);
    S.whisper = { run: r, odds: odds, shown: {}, active: [], running: true, start: performance.now(), hopMs: reduce ? 1 : 520, color: function (h) { var c = ['#ffe29a', '#ffc266', '#ff9f73', '#ff7f9e', '#ec83e0', '#b48cff', '#8da2ff']; return c[Math.min(c.length - 1, h - 1)]; } };
    S.whisper.shown[S.wseed] = 0;
    var el = $('wres');
    if (el) {
      var bins = new Array(24).fill(0), mx = odds.max || 1, cnt = S.G.nodes.length;
      odds.sizes.forEach(function (s) { bins[Math.min(23, Math.floor(s / Math.max(1, S.V.length) * 24))]++; });
      var top = Math.max.apply(null, bins) || 1, thisBin = Math.min(23, Math.floor(r.reached / Math.max(1, S.V.length) * 24));
      el.innerHTML = '<div><b id="wnow">1</b>heard it, this run</div><div><b>' + r.hops + '</b>hops to the last ear</div><div><b>' + fmt(odds.median) + '</b>typical reach, of 200 runs</div><div><b>' + fmt(odds.p10) + '–' + fmt(odds.p90) + '</b>likely range</div><div class="minibars" title="Reach across 200 simulated runs, from none to everyone">' + bins.map(function (b, i) { return '<i class="' + (i === thisBin ? 'on' : '') + '" style="height:' + Math.max(2, 38 * b / top) + 'px"></i>'; }).join('') + '</div><div class="hint" style="flex-basis:100%">' + esc(S.G.nodes[S.wseed].name) + ' starts it. Click any voice to start from there instead.</div>';
      void mx; void cnt;
    }
    mark();
  }
  function stepWhisper(now) {
    var w = S.whisper, el = (now - w.start) / w.hopMs, cur = Math.floor(el), f = el - cur, shown = {}, act = [], heard = 0;
    w.run.order.forEach(function (o) {
      if (o.hop <= cur) { shown[o.i] = o.hop; heard++; }
      else if (o.hop === cur + 1) act.push({ from: o.from, to: o.i, f: f });
    });
    w.shown = shown; w.active = act;
    var e = $('wnow'); if (e) e.textContent = fmt(heard);
    if (cur > w.run.hops) w.running = false;
    mark();
  }

  /* cut */
  function toolCut() {
    var how = S.cut.how;
    $('toolbar').innerHTML = '<div class="row-t"><div class="tabs" id="chow"><button type="button" data-h="bridge" aria-pressed="' + (how === 'bridge') + '">Bridges first</button><button type="button" data-h="loud" aria-pressed="' + (how === 'loud') + '">Loudest first</button><button type="button" data-h="random" aria-pressed="' + (how === 'random') + '">At random</button></div><div class="slider"><label for="cf">Voices removed</label><input type="range" id="cf" min="0" max="30" step="1" value="' + Math.round(S.cut.frac * 100) + '"><output id="cfv">' + Math.round(S.cut.frac * 100) + '%</output></div></div><div class="result" id="cres"></div>';
    $('cf').addEventListener('input', function () { S.cut.frac = this.value / 100; $('cfv').textContent = this.value + '%'; applyCut(); });
    $('chow').addEventListener('click', function (e) { var b = e.target.closest('button[data-h]'); if (!b) return; S.cut.how = b.getAttribute('data-h'); press($('chow'), 'data-h', S.cut.how); applyCut(); });
    if (!S.cut.frac) { S.cut.frac = 0.08; $('cf').value = 8; $('cfv').textContent = '8%'; }
    applyCut();
  }
  function applyCut() {
    var r = N.knockout(S.G, S.cut.how, S.cut.frac, 7); S.cut.res = r;
    var left = r.total - r.cut, stranded = left - r.largest, el = $('cres');
    if (el) el.innerHTML = '<div><b>' + fmt(r.cut) + '</b>voices removed</div><div><b>' + Math.round(100 * r.largest / Math.max(1, S.G.stats.largest)) + '%</b>of the vine still joined</div><div><b>' + fmt(r.sizes.length) + '</b>separate pieces</div><div><b>' + fmt(stranded) + '</b>voices stranded, shown in amber</div>';
    mark();
  }

  /* six degrees */
  function toolPath() {
    S.path = { a: -1, b: -1, nodes: null, list: null };
    $('toolbar').innerHTML = '<div class="row-t"><button type="button" class="btn go" id="psur">Surprise me</button><div class="hint" id="ptext">Click one voice, then another.</div></div><div class="result" id="pres"></div>';
    $('psur').addEventListener('click', function () { var A = S.G.audienceLinked, a = A[Math.floor(Math.random() * A.length)].i, b = A[Math.floor(Math.random() * A.length)].i; S.path = { a: -1, b: -1, nodes: null, list: null }; pickPath(a); pickPath(b); });
    renderPathHist(-1);
  }
  function renderPathHist(h) {
    var el = $('pres'), d = S.G.stats.distances; if (!el) return;
    var keys = Object.keys(d).map(Number).sort(function (a, b) { return a - b; }), mx = Math.max.apply(null, keys.map(function (k) { return d[k]; })) || 1;
    el.innerHTML = '<div class="minibars" style="height:44px">' + keys.map(function (k) { return '<i class="' + (k === h ? 'on' : '') + '" style="width:14px;height:' + Math.max(2, 44 * d[k] / mx) + 'px" title="' + k + ' hops"></i>'; }).join('') + '</div><div>How far apart voices usually are, from 1 to ' + keys[keys.length - 1] + ' hops. Average <b style="display:inline;font-size:16px">' + S.G.stats.avgPath + '</b></div>';
  }
  function pickPath(v) {
    var p = S.path, G = S.G;
    if (p.a < 0 || p.b >= 0) { S.path = { a: v, b: -1, nodes: null, list: null }; var t = $('ptext'); if (t) t.textContent = G.nodes[v].name + ' chosen. Now click another voice.'; renderPathHist(-1); mark(); return; }
    p.b = v;
    var path = N.shortestPath(G, p.a, p.b), te = $('ptext');
    if (!path) { p.nodes = null; p.list = null; if (te) te.textContent = 'No route: these two voices sit on separate pieces of the vine.'; mark(); return; }
    p.list = path; p.nodes = {}; path.forEach(function (x) { p.nodes[x] = 1; });
    if (te) te.innerHTML = esc(path.map(function (x) { return G.nodes[x].name; }).join('  →  ')) + ' &middot; <b>' + (path.length - 1) + ' hop' + (path.length === 2 ? '' : 's') + '</b>';
    renderPathHist(path.length - 1); mark();
  }

  /* legend + stage controls */
  function renderLegend() {
    var host = $('legend'), G = S.G, c = {};
    G.nodes.forEach(function (n) { if (n.linked) { var k = groupKey(n); c[k] = c[k] || { n: 0, col: baseColor(n) }; c[k].n++; } });
    var keys = Object.keys(c).filter(function (k) { return c[k].n >= K; }).sort(function (a, b) { return c[b].n - c[a].n; });
    var tot = S.V.length || 1;
    host.innerHTML = keys.map(function (k) { return '<button type="button" class="chip" data-k="' + esc(k) + '" aria-pressed="' + (S.hl === k) + '" style="--c:' + c[k].col + '"><i></i>' + esc(k) + ' <b>' + Math.round(100 * c[k].n / tot) + '%</b></button>'; }).join('');
  }
  $('legend').addEventListener('click', function (e) { var b = e.target.closest('button[data-k]'); if (!b) return; var k = b.getAttribute('data-k'); S.hl = S.hl === k ? null : k; if (S.tool !== 'explore') setTool('explore'); renderLegend(); mark(); });
  document.querySelector('.hud').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b || !S.G) return;
    if (b.hasAttribute('data-arr')) arrange(b.getAttribute('data-arr'));
    if (b.hasAttribute('data-col')) { S.colorBy = b.getAttribute('data-col'); S.hl = null; press(document.querySelector('.hud'), 'data-col', S.colorBy); renderLegend(); mark(); }
  });

  function focusNode(v) { setTool('explore'); setFocus(v); $('sky').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }); }

  /* ==================================== plates ==================================== */
  function renderPlates() {
    var G = S.G;
    renderNotes(); renderVoices(); renderSlope(); renderCast();
    if (G.cascades.length) { renderVinePicks(); renderVine(); } else { $('vine').innerHTML = '<text class="t" x="500" y="200" text-anchor="middle">No cascade of 3 or more posts in this file.</text>'; }
    if (G.trends.length) { renderRelayTags(); renderRelay(); }
    renderChord(); renderMix(); renderBorder(); renderMood(); renderSpeed(); renderTail(); renderBreak();
  }

  function waffle(frac, color) {
    var on = Math.round(Math.max(0, Math.min(100, frac))), o = '<svg class="waffle" viewBox="0 0 50 50" aria-hidden="true">', i = 0, x, y;
    for (y = 9; y >= 0; y--) for (x = 0; x < 10; x++) { o += '<rect x="' + (x * 5 + .4) + '" y="' + (y * 5 + .4) + '" width="4.2" height="4.2" rx="1" fill="' + (i < on ? color : 'rgba(255,255,255,.09)') + '"/>'; i++; }
    return o + '</svg>';
  }
  function renderNotes() {
    var list = N.notes(S.G);
    $('notes').innerHTML = list.map(function (n, i) { var c = PALETTE[i % PALETTE.length]; return '<article class="note" style="--c:' + c + '">' + (n.frac === null ? '' : waffle(n.frac, c)) + '<div class="kick">' + esc(n.kick) + '</div><div class="fig">' + esc(n.fig) + '<small>' + esc(n.unit) + '</small></div><div class="head">' + esc(n.head) + '</div><p>' + esc(n.text) + '</p></article>'; }).join('') || '<div class="glass empty" style="grid-column:1/-1">Too few threads to say anything fair.</div>';
  }
  function egoGlyph(n, color) {
    var h = N.hash(n.name), s = Math.min(16, 4 + n.inD), o = '<svg viewBox="-26 -26 52 52" width="52" height="52" aria-hidden="true">', i;
    for (i = 0; i < s; i++) { var a = i * 2.39996 + (h % 628) / 100, r = 11 + ((h >> (i % 20)) & 3) * 3.6; o += '<line x2="' + (Math.cos(a) * r).toFixed(1) + '" y2="' + (Math.sin(a) * r).toFixed(1) + '" stroke="' + color + '" stroke-opacity=".45"/><circle cx="' + (Math.cos(a) * r).toFixed(1) + '" cy="' + (Math.sin(a) * r).toFixed(1) + '" r="1.8" fill="' + color + '"/>'; }
    return o + '<circle r="5" fill="' + color + '"/></svg>';
  }
  var METRIC = { pr: { label: 'weight', v: function (n) { return Math.round(n.influence * 100); }, unit: ' / 100' }, inW: { label: 'answers received', v: function (n) { return n.inW; }, unit: '' }, bc: { label: 'bridge score', v: function (n) { return Math.round(n.bridge * 100); }, unit: ' / 100' }, spark: { label: 'posts grew from them', v: function (n) { return n.spark; }, unit: '' } };
  function renderVoices() {
    var m = METRIC[S.metric], list = S.G.audienceLinked.slice().sort(function (a, b) { return b[S.metric] - a[S.metric]; }).slice(0, 6);
    $('voices').innerHTML = list.map(function (n, i) { var c = ROLE[n.role] || GREY; return '<button type="button" class="voice" data-v="' + n.i + '" style="--c:' + c + '"><span class="rk">' + (i + 1) + '</span>' + egoGlyph(n, c) + '<h4>' + esc(n.name) + '</h4><span class="rolechip" style="--c:' + c + '">' + esc(n.role) + '</span><div class="m">' + fmt(m.v(n)) + '</div><small>' + m.label + m.unit + '</small><small>' + esc(n.circle) + '</small></button>'; }).join('');
  }
  $('metric-tabs').addEventListener('click', function (e) { var b = e.target.closest('button[data-m]'); if (!b) return; S.metric = b.getAttribute('data-m'); press($('metric-tabs'), 'data-m', S.metric); renderVoices(); });
  $('voices').addEventListener('click', function (e) { var b = e.target.closest('button[data-v]'); if (b) focusNode(Number(b.getAttribute('data-v'))); });

  function renderSlope() {
    var G = S.G, svg = $('slope'), keys = ['rank_weight', 'rank_answered', 'rank_bridge', 'rank_spark'], heads = ['Weight', 'Answered', 'Bridges', 'Sparks'], set = {};
    keys.forEach(function (k) { G.audienceLinked.slice().sort(function (a, b) { return a[k] - b[k]; }).slice(0, 5).forEach(function (n) { set[n.i] = n; }); });
    var list = Object.keys(set).map(function (k) { return set[k]; }), cap = 30, xs = [130, 250, 370, 490], y = function (r) { return 44 + (Math.min(r, cap) - 1) / (cap - 1) * 350; }, o = '';
    heads.forEach(function (h, i) { o += '<text class="t b" x="' + xs[i] + '" y="20" text-anchor="middle">' + h + '</text><line x1="' + xs[i] + '" x2="' + xs[i] + '" y1="34" y2="404" stroke="rgba(255,255,255,.08)"/>'; });
    [1, 10, 20, 30].forEach(function (r) { o += '<text class="t f" x="96" y="' + (y(r) + 4) + '" text-anchor="end">' + (r === 30 ? '30+' : '#' + r) + '</text>'; });
    list.forEach(function (n) {
      var c = ROLE[n.role] || GREY, d = keys.map(function (k, i) { return (i ? 'L' : 'M') + xs[i] + ' ' + y(n[k]).toFixed(1); }).join(' ');
      o += '<g class="ln" data-v="' + n.i + '"><title>' + esc(n.name) + '</title><path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="2" stroke-opacity=".75"/><path d="' + d + '" fill="none" stroke="transparent" stroke-width="12"/>' + keys.map(function (k, i) { return '<circle cx="' + xs[i] + '" cy="' + y(n[k]).toFixed(1) + '" r="3.4" fill="' + c + '"/>'; }).join('') + '<text class="t d" x="' + (xs[3] + 12) + '" y="' + (y(n[keys[3]]) + 4).toFixed(1) + '" style="font-size:12px">' + esc(n[keys[3]] <= cap ? n.name : '') + '</text></g>';
    });
    svg.innerHTML = o;
  }
  $('slope').addEventListener('mouseover', function (e) { var g = e.target.closest('g.ln'), s = $('slope'); s.querySelectorAll('g.ln.on').forEach(function (x) { x.classList.remove('on'); }); if (g) { s.classList.add('hot'); g.classList.add('on'); } else s.classList.remove('hot'); });
  $('slope').addEventListener('mouseleave', function () { $('slope').classList.remove('hot'); });
  $('slope').addEventListener('click', function (e) { var g = e.target.closest('g.ln'); if (g) focusNode(Number(g.getAttribute('data-v'))); });

  function renderCast() {
    var G = S.G, c = G.stats.census, tot = G.audienceLinked.length || 1, svg = $('scatter');
    $('census').innerHTML = N.ROLES.map(function (r) { return c[r] ? '<i style="width:' + (100 * c[r] / tot) + '%;background:' + ROLE[r] + '" title="' + r + '"></i>' : ''; }).join('');
    $('roles').innerHTML = N.ROLES.map(function (r) { return '<div class="rolec" style="--c:' + ROLE[r] + '"><b>' + r + 's</b><span>' + fmt(c[r] || 0) + '</span>' + ROLE_LINE[r] + '</div>'; }).join('');
    var A = G.audienceLinked, mxI = Math.max.apply(null, A.map(function (n) { return n.inW; })) || 1, mxB = Math.max.apply(null, A.map(function (n) { return n.bc; })) || 1;
    var X = function (v) { return 52 + Math.log(1 + v) / Math.log(1 + mxI) * 546; }, Y = function (v) { return 262 - Math.log(1 + v) / Math.log(1 + mxB) * 246; };
    var o = '<line x1="52" x2="600" y1="262" y2="262" stroke="rgba(255,255,255,.12)"/><line x1="52" x2="52" y1="14" y2="262" stroke="rgba(255,255,255,.12)"/><text class="t f" x="326" y="290" text-anchor="middle">answers received (log)</text><text class="t f" transform="translate(16 138) rotate(-90)" text-anchor="middle">bridging (log)</text>';
    A.forEach(function (n, i) { var jx = ((N.hash(n.name) % 100) / 100 - .5) * 6; o += '<circle class="pt" data-v="' + n.i + '" cx="' + (X(n.inW) + jx).toFixed(1) + '" cy="' + Y(n.bc).toFixed(1) + '" r="' + (n.role === 'Regular' || n.role === 'Listener' ? 2.6 : 4) + '" fill="' + ROLE[n.role] + '" fill-opacity=".8" style="cursor:pointer"><title>' + esc(n.name) + ', ' + n.role + '</title></circle>'; void i; });
    svg.innerHTML = o;
  }
  $('scatter').addEventListener('click', function (e) { var c = e.target.closest('circle[data-v]'); if (c) focusNode(Number(c.getAttribute('data-v'))); });

  /* vine */
  function renderVinePicks() {
    var list = S.G.cascades.slice(0, 8);
    $('vine-picks').innerHTML = list.map(function (c, i) { return '<button type="button" class="tagc" data-i="' + i + '" aria-pressed="' + (i === S.vineIdx) + '">' + esc(c.tag || 'Untagged') + ' &middot; ' + c.size + '</button>'; }).join('');
  }
  $('vine-picks').addEventListener('click', function (e) { var b = e.target.closest('button[data-i]'); if (!b) return; S.vineIdx = Number(b.getAttribute('data-i')); press($('vine-picks'), 'data-i', String(S.vineIdx)); renderVine(); });
  $('vine-x').addEventListener('click', function (e) { var b = e.target.closest('button[data-x]'); if (!b) return; S.vineX = b.getAttribute('data-x'); press($('vine-x'), 'data-x', S.vineX); renderVine(); });
  $('vine-grow').addEventListener('click', function () { renderVine(); });
  function renderVine() {
    var G = S.G, c = G.cascades[S.vineIdx]; if (!c) return;
    var T = N.cascadeTree(G, c), svg = $('vine'), w = 1000, h = Math.max(300, Math.min(560, T.leaves * 7 + 60));
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    var byTime = S.vineX === 'hours', mxX = Math.max.apply(null, T.nodes.map(function (n) { return byTime ? Math.sqrt(Math.max(0, n.hours)) : n.depth; })) || 1;
    var X = function (n) { return 30 + (byTime ? Math.sqrt(Math.max(0, n.hours)) : n.depth) / mxX * (w - 90); }, Y = function (n) { return 22 + n.y / Math.max(1, T.leaves - 1) * (h - 50); };
    var delay = function (n) { return (byTime ? Math.sqrt(Math.max(0, n.hours)) / mxX : n.depth / mxX) * 1.8; }, o = '';
    T.nodes.forEach(function (n) {
      if (!n.parent) return;
      var x0 = X(n.parent), y0 = Y(n.parent), x1 = X(n), y1 = Y(n), mx = (x0 + x1) / 2, cross = n.type === 'share';
      o += '<path class="vine-s" pathLength="1" style="animation-delay:' + delay(n.parent).toFixed(2) + 's' + (cross ? ';stroke:#ffc266;stroke-opacity:.95' : '') + '" stroke-width="' + (cross ? 2 : 1.3) + '" d="M' + x0.toFixed(1) + ' ' + y0.toFixed(1) + 'C' + mx.toFixed(1) + ' ' + y0.toFixed(1) + ' ' + mx.toFixed(1) + ' ' + y1.toFixed(1) + ' ' + x1.toFixed(1) + ' ' + y1.toFixed(1) + '"/>';
    });
    T.nodes.forEach(function (n) {
      var x = X(n).toFixed(1), y = Y(n).toFixed(1), col = MOOD_COL[String(n.mood === null ? 0 : n.mood)], d = delay(n).toFixed(2);
      if (!n.kids && n.parent) o += '<g transform="translate(' + x + ' ' + y + ') rotate(' + ((N.hash(String(n.post)) % 60) - 30) + ')"><path class="vine-l" style="animation-delay:' + d + 's" d="M0 0C4 -5 10 -4 13 0C10 4 4 5 0 0Z"/></g>';
      o += '<circle class="vine-n" style="animation-delay:' + d + 's" cx="' + x + '" cy="' + y + '" r="' + (n.parent ? (n.kids ? 3.6 : 2.6) : 8) + '" fill="' + col + '"><title>' + esc(n.type) + ' on ' + esc(n.platform) + ', ' + Math.round(n.hours) + ' hours in</title></circle>';
    });
    svg.innerHTML = o;
    var days = (c.end - c.start) / 86400000;
    $('vine-stats').innerHTML = [['Posts', c.size], ['Voices', c.voices], ['Hops deep', c.depth], ['Widest', c.breadth], ['Virality', c.virality], ['Platforms', c.platforms.length], ['Lived for', days >= 1 ? days.toFixed(1) + ' days' : Math.round(days * 24) + ' hours']].map(function (x) { return '<div><b>' + x[1] + '</b>' + x[0] + '</div>'; }).join('');
  }

  /* relay */
  function renderRelayTags() { $('relay-tags').innerHTML = S.G.trends.map(function (t) { return '<button type="button" class="tagc" data-t="' + esc(t.tag) + '" aria-pressed="' + (t.tag === S.relayTag) + '">' + esc(t.tag) + '</button>'; }).join(''); }
  $('relay-tags').addEventListener('click', function (e) { var b = e.target.closest('button[data-t]'); if (!b) return; S.relayTag = b.getAttribute('data-t'); press($('relay-tags'), 'data-t', S.relayTag); renderRelay(); });
  $('relay-dim').addEventListener('click', function (e) { var b = e.target.closest('button[data-d]'); if (!b) return; S.relayDim = b.getAttribute('data-d'); press($('relay-dim'), 'data-d', S.relayDim); renderRelay(); });
  $('relay-view').addEventListener('click', function (e) { var b = e.target.closest('button[data-v]'); if (!b) return; S.relayView = b.getAttribute('data-v'); press($('relay-view'), 'data-v', S.relayView); renderRelay(); });
  function moodFill(v, a) { var c = v > 0.15 ? '#a3de76' : v < -0.15 ? '#ff7f9e' : '#ffc266'; return hexA(c, a); }
  function renderRelay() {
    var r = N.relay(S.G, S.relayTag, S.relayDim), svg = $('relay'); if (!r) return;
    var left = 196, cw = (1000 - left - 24) / r.span, rh = 30, top = 28, H = top + r.rows.length * rh + 74, o = '', mx = 1;
    svg.setAttribute('viewBox', '0 0 1000 ' + H);
    r.rows.forEach(function (s) { s.cells.forEach(function (c) { if (c.n > mx) mx = c.n; }); });
    for (var d = 0; d < r.span; d++) o += '<text class="t f" x="' + (left + cw * (d + .5)).toFixed(1) + '" y="16" text-anchor="middle">' + new Date((r.d0 + d) * 86400000).toUTCString().slice(5, 11).replace(/^0/, '') + '</text>';
    var pts = [];
    r.rows.forEach(function (s, i) {
      var y = top + i * rh;
      o += '<text class="t" x="' + (left - 12) + '" y="' + (y + rh / 2 + 4) + '" text-anchor="end">' + esc(s.label.length > 24 ? s.label.slice(0, 23) + '…' : s.label) + '</text>';
      s.cells.forEach(function (c, j) {
        var fill = !c.n ? 'rgba(255,255,255,.03)' : S.relayView === 'mood' ? moodFill(c.count ? c.sum / c.count : 0, 0.3 + 0.7 * Math.min(1, Math.abs(c.count ? c.sum / c.count : 0) + 0.15)) : hexA('#a3de76', 0.12 + 0.88 * Math.pow(c.n / mx, 0.6));
        o += '<rect x="' + (left + cw * j + 1).toFixed(1) + '" y="' + (y + 2) + '" width="' + Math.max(1, cw - 2).toFixed(1) + '" height="' + (rh - 4) + '" rx="4" fill="' + fill + '"><title>' + esc(s.label) + ': ' + c.n + ' posts</title></rect>';
      });
      var day = Math.floor(s.first / 86400000) - r.d0, frac = (s.first / 86400000 - r.d0 - day);
      if (s.label !== 'Other groups') pts.push([left + cw * (day + frac), y + rh / 2]);
    });
    if (pts.length > 1) o += '<path d="' + pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1]; }).join(' ') + '" fill="none" stroke="#ffc266" stroke-width="1.8"/>';
    pts.forEach(function (p) { o += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1] + '" r="4.5" fill="#ffc266" stroke="#120b20" stroke-width="1.5"/>'; });
    var y0 = top + r.rows.length * rh + 36;
    o += '<text class="t f" x="' + (left - 12) + '" y="' + (y0 + 4) + '" text-anchor="end">overall mood</text><line x1="' + left + '" x2="' + (left + cw * r.span) + '" y1="' + y0 + '" y2="' + y0 + '" stroke="rgba(255,255,255,.14)" stroke-dasharray="2 4"/>';
    var line = [];
    r.moodDay.forEach(function (m, j) { if (!m.count) return; var v = m.sum / m.count, x = left + cw * (j + .5), y = y0 - v * 26; line.push([x, y]); o += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4" fill="' + moodFill(v, 1) + '"><title>' + v.toFixed(2) + '</title></circle>'; });
    if (line.length > 1) o = o + '<path d="' + line.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ') + '" fill="none" stroke="#fff" stroke-opacity=".5"/>';
    svg.innerHTML = o;
  }

  /* chord */
  function renderChord() {
    var G = S.G, svg = $('chord'), m = N.mixing(G, 'circle', 12), n = m.labels.length;
    if (n < 2) { svg.innerHTML = '<text class="t" text-anchor="middle">Not enough circles.</text>'; return; }
    var sym = m.labels.map(function (_, i) { return m.labels.map(function (__, j) { return i === j ? 0 : m.matrix[i][j] + m.matrix[j][i]; }); });
    var totals = sym.map(function (r) { return r.reduce(function (a, b) { return a + b; }, 0); }), all = totals.reduce(function (a, b) { return a + b; }, 0) || 1;
    var gap = 0.05, R = 200, k = (Math.PI * 2 - gap * n) / all, ang = -Math.PI / 2, arcs = [], o = '';
    m.labels.forEach(function (l, i) { var a0 = ang, a1 = ang + totals[i] * k; arcs.push({ a0: a0, a1: a1, cur: a0 }); ang = a1 + gap; });
    function pt(a, r) { return (Math.cos(a) * r).toFixed(1) + ' ' + (Math.sin(a) * r).toFixed(1); }
    var colorOf = function (i) { var c = G.comms.filter(function (x) { return x.name === m.labels[i]; })[0]; return c ? PALETTE[c.id % PALETTE.length] : GREY; };
    for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) {
      if (!sym[i][j]) continue;
      var ai = arcs[i], aj = arcs[j], w = sym[i][j] * k, a0 = ai.cur, a1 = a0 + w, b0 = aj.cur, b1 = b0 + w; ai.cur = a1; aj.cur = b1;
      o += '<path class="ribbon" data-a="' + i + '" data-b="' + j + '" fill="' + colorOf(m.matrix[i][j] >= m.matrix[j][i] ? i : j) + '" fill-opacity=".5" d="M' + pt(a0, R - 8) + 'A' + (R - 8) + ' ' + (R - 8) + ' 0 0 1 ' + pt(a1, R - 8) + 'Q0 0 ' + pt(b0, R - 8) + 'A' + (R - 8) + ' ' + (R - 8) + ' 0 0 1 ' + pt(b1, R - 8) + 'Q0 0 ' + pt(a0, R - 8) + 'Z"><title>' + esc(m.labels[i]) + ' and ' + esc(m.labels[j]) + ': ' + sym[i][j] + ' exchanges</title></path>';
    }
    arcs.forEach(function (a, i) {
      var large = a.a1 - a.a0 > Math.PI ? 1 : 0, mid = (a.a0 + a.a1) / 2, deg = mid * 180 / Math.PI, flip = mid > Math.PI / 2 && mid < Math.PI * 1.5;
      o += '<path class="arc" data-g="' + i + '" fill="' + colorOf(i) + '" style="cursor:pointer" d="M' + pt(a.a0, R) + 'A' + R + ' ' + R + ' 0 ' + large + ' 1 ' + pt(a.a1, R) + 'L' + pt(a.a1, R - 7) + 'A' + (R - 7) + ' ' + (R - 7) + ' 0 ' + large + ' 0 ' + pt(a.a0, R - 7) + 'Z"><title>' + esc(m.labels[i]) + '</title></path>';
      o += '<text class="t" style="font-size:12.5px" transform="rotate(' + deg.toFixed(1) + ') translate(' + (R + 10) + ' 0)' + (flip ? ' rotate(180)' : '') + '" text-anchor="' + (flip ? 'end' : 'start') + '" dominant-baseline="middle">' + esc(m.labels[i]) + '</text>';
    });
    svg.innerHTML = o;
    S.chordLabels = m.labels;
  }
  $('chord').addEventListener('mouseover', function (e) {
    var a = e.target.closest('.arc'), svg = $('chord');
    svg.querySelectorAll('.ribbon.on').forEach(function (x) { x.classList.remove('on'); });
    if (!a) { svg.classList.remove('hot'); return; }
    var g = a.getAttribute('data-g'); svg.classList.add('hot');
    svg.querySelectorAll('.ribbon').forEach(function (r) { if (r.getAttribute('data-a') === g || r.getAttribute('data-b') === g) r.classList.add('on'); });
  });
  $('chord').addEventListener('mouseleave', function () { $('chord').classList.remove('hot'); });
  $('chord').addEventListener('click', function (e) { var a = e.target.closest('.arc'); if (!a) return; S.colorBy = 'circle'; press(document.querySelector('.hud'), 'data-col', 'circle'); S.hl = S.chordLabels[Number(a.getAttribute('data-g'))]; setTool('explore'); renderLegend(); $('sky').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }); });

  /* mixing */
  $('mix-dim').addEventListener('click', function (e) { var b = e.target.closest('button[data-d]'); if (!b) return; S.mixDim = b.getAttribute('data-d'); press($('mix-dim'), 'data-d', S.mixDim); renderMix(); });
  function renderMix() {
    var m = N.mixing(S.G, S.mixDim, 10), svg = $('mix'), n = m.labels.length;
    if (n < 2) { svg.innerHTML = '<text class="t" x="320" y="200" text-anchor="middle">Not enough groups in this view.</text>'; return; }
    var left = 188, top = 112, size = Math.min(44, (640 - left - 8) / n), o = '';
    svg.setAttribute('viewBox', '0 0 640 ' + (top + size * n + 10));
    function sh(l) { return l.replace('Consumer & Customer Experience', 'Consumer & Customer').replace('Business & Entrepreneurship', 'Business').replace('Marketing, Media & Brands', 'Marketing & Media').replace('Technology & Software', 'Technology').replace('Sustainability & Design', 'Sustainability').replace('Entertainment & Sports', 'Entertainment').replace('Students & Education', 'Students').replace('Finance & Economics', 'Finance').replace('Health & Wellness', 'Health'); }
    m.labels.forEach(function (l, i) {
      o += '<text class="t" x="' + (left - 10) + '" y="' + (top + size * i + size / 2 + 4) + '" text-anchor="end">' + esc(sh(l)) + '</text>';
      o += '<text class="t" transform="translate(' + (left + size * i + size / 2 + 4) + ' ' + (top - 8) + ') rotate(-42)">' + esc(sh(l)) + '</text>';
      var tot = m.matrix[i].reduce(function (a, b) { return a + b; }, 0) || 1;
      m.matrix[i].forEach(function (v, j) {
        var f = v / tot, col = i === j ? '#ffc266' : '#b48cff';
        o += '<rect x="' + (left + size * j + 1) + '" y="' + (top + size * i + 1) + '" width="' + (size - 2) + '" height="' + (size - 2) + '" rx="5" fill="' + hexA(col, f ? 0.1 + 0.9 * Math.pow(f, 0.6) : 0.03) + '"><title>' + esc(l) + ' to ' + esc(m.labels[j]) + ': ' + Math.round(f * 100) + '%</title></rect>';
        if (f >= 0.05) o += '<text x="' + (left + size * j + size / 2) + '" y="' + (top + size * i + size / 2 + 4) + '" text-anchor="middle" style="font-size:11px;fill:' + (f > 0.35 ? '#120b20' : '#efe8f6') + '">' + Math.round(f * 100) + '</text>';
      });
    });
    svg.innerHTML = o;
    $('mix-tag').textContent = Math.round(m.inside) + '% inside vs ' + Math.round(m.expected) + '% by chance';
  }

  function renderBorder() {
    var b = N.borderFlows(S.G), svg = $('border'), n = b.names.length;
    if (!b.total) { svg.innerHTML = '<text class="t" x="500" y="150" text-anchor="middle">No cross-platform shares in this file.</text>'; return; }
    var mid = 158, x = function (i) { return 90 + i * (820 / Math.max(1, n - 1)); }, mx = 1, o = '';
    b.matrix.forEach(function (r) { r.forEach(function (v) { if (v > mx) mx = v; }); });
    b.matrix.forEach(function (r, i) { r.forEach(function (v, j) {
      if (!v || i === j) return;
      var x1 = x(i), x2 = x(j), h = Math.min(135, Math.abs(x2 - x1) * 0.42) * (i < j ? -1 : 1) * 1.35, c = PLAT[b.names[i]] || '#ffc266';
      o += '<path d="M' + x1 + ' ' + mid + 'C' + x1 + ' ' + (mid + h) + ' ' + x2 + ' ' + (mid + h) + ' ' + x2 + ' ' + mid + '" fill="none" stroke="' + c + '" stroke-opacity=".62" stroke-width="' + (1 + 7 * v / mx).toFixed(1) + '" stroke-linecap="round"><title>' + esc(b.names[i]) + ' to ' + esc(b.names[j]) + ': ' + v + ' shares</title></path>';
    }); });
    b.names.forEach(function (p, i) { o += '<circle cx="' + x(i) + '" cy="' + mid + '" r="13" fill="' + (PLAT[p] || GREY) + '"/><circle cx="' + x(i) + '" cy="' + mid + '" r="19" fill="none" stroke="' + (PLAT[p] || GREY) + '" stroke-opacity=".3"/><text class="t d" x="' + x(i) + '" y="' + (mid + 6) + '" text-anchor="middle" style="fill:#120b20;font-size:15px;font-style:normal;font-weight:700">' + esc(p.charAt(0)) + '</text><text class="t b" x="' + x(i) + '" y="330" text-anchor="middle">' + esc(p) + '</text>'; });
    svg.innerHTML = o;
  }

  function renderMood() {
    var m = N.moodContagion(S.G), host = $('moodgrid'), cols = ['#a3de76', '#ffc266', '#ff7f9e'];
    if (m.any < K) { host.innerHTML = '<div style="grid-column:1/-1" class="empty">This file has no sentiment column.</div>'; return; }
    var o = '<div></div>' + m.names.map(function (x) { return '<div class="h">' + x + ' answer</div>'; }).join('');
    m.matrix.forEach(function (r, i) {
      var t = r[0] + r[1] + r[2] || 1;
      o += '<div class="h rl">' + m.names[i] + ' post</div>';
      r.forEach(function (v, j) { var f = v / t, d = Math.round(Math.sqrt(f) * 82), lift = m.base[j] ? f / m.base[j] : 0; o += '<div class="mcell" style="--c:' + cols[j] + '"><i style="width:' + d + 'px;height:' + d + 'px"></i><b>' + Math.round(f * 100) + '%</b><small>' + lift.toFixed(1) + '&times;</small></div>'; });
    });
    host.innerHTML = o;
  }

  $('speed-type').addEventListener('click', function (e) { var b = e.target.closest('button[data-t]'); if (!b) return; S.speedType = b.getAttribute('data-t'); press($('speed-type'), 'data-t', S.speedType); renderSpeed(); });
  function renderSpeed() {
    var s = N.replySpeed(S.G), v = s.byType[S.speedType], mx = Math.max.apply(null, v) || 1, svg = $('speed'), bw = 560 / v.length, o = '<line x1="30" x2="600" y1="236" y2="236" stroke="rgba(255,255,255,.12)"/>';
    v.forEach(function (c, i) { var h = 200 * c / mx, x = 34 + i * bw; o += '<rect x="' + (x + 4).toFixed(1) + '" y="' + (236 - h).toFixed(1) + '" width="' + (bw - 8).toFixed(1) + '" height="' + h.toFixed(1) + '" rx="5" fill="' + hexA('#b48cff', 0.35 + 0.65 * c / mx) + '"/><text class="t b" x="' + (x + bw / 2).toFixed(1) + '" y="' + (230 - h).toFixed(1) + '" text-anchor="middle">' + (c ? fmt(c) : '') + '</text><text class="t f" x="' + (x + bw / 2).toFixed(1) + '" y="256" text-anchor="middle">' + s.labels[i] + '</text>'; });
    o += '<text class="t d" x="600" y="24" text-anchor="end" style="font-size:16px">median wait ' + (s.medians[S.speedType] < 1 ? Math.round(s.medians[S.speedType] * 60) + ' minutes' : s.medians[S.speedType].toFixed(1) + ' hours') + '</text>';
    svg.innerHTML = o;
  }

  function renderTail() {
    var d = N.degreeDist(S.G), svg = $('tail');
    if (!d.points.length) return;
    var mxD = d.points[d.points.length - 1].d, mxN = Math.max.apply(null, d.points.map(function (p) { return p.n; }));
    var X = function (v) { return 56 + Math.log10(v) / Math.max(.3, Math.log10(mxD)) * 544; }, Y = function (v) { return 258 - Math.log10(v) / Math.max(.3, Math.log10(mxN)) * 240; };
    var o = '<line x1="56" x2="604" y1="258" y2="258" stroke="rgba(255,255,255,.12)"/><line x1="56" x2="56" y1="10" y2="258" stroke="rgba(255,255,255,.12)"/><text class="t f" x="330" y="290" text-anchor="middle">voices answering this voice (log)</text><text class="t f" transform="translate(16 134) rotate(-90)" text-anchor="middle">how many voices (log)</text>';
    [1, 2, 5, 10, 20, 50].forEach(function (t) { if (t <= mxD) o += '<text class="t f" x="' + X(t).toFixed(1) + '" y="273" text-anchor="middle">' + t + '</text>'; });
    [1, 10, 100].forEach(function (t) { if (t <= mxN) o += '<text class="t f" x="48" y="' + (Y(t) + 4).toFixed(1) + '" text-anchor="end">' + t + '</text>'; });
    d.points.forEach(function (p) { o += '<circle cx="' + X(p.d).toFixed(1) + '" cy="' + Y(p.n).toFixed(1) + '" r="5" fill="#a3de76" fill-opacity=".8"><title>' + p.n + ' voices answered by ' + p.d + '</title></circle>'; });
    svg.innerHTML = o;
    $('tail-tag').textContent = 'Slope ' + d.alpha;
  }

  function renderBreak() {
    var r = N.robustness(S.G), svg = $('break'), X = function (f) { return 56 + f / 0.3 * 540; }, Y = function (v) { return 254 - v * 236; };
    var o = '<line x1="56" x2="600" y1="254" y2="254" stroke="rgba(255,255,255,.12)"/><line x1="56" x2="56" y1="14" y2="254" stroke="rgba(255,255,255,.12)"/>';
    [0, .1, .2, .3].forEach(function (f) { o += '<text class="t f" x="' + X(f) + '" y="272" text-anchor="middle">' + (f * 100) + '%</text>'; });
    [0, .5, 1].forEach(function (v) { o += '<text class="t f" x="48" y="' + (Y(v) + 4) + '" text-anchor="end">' + (v * 100) + '%</text><line x1="56" x2="600" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="rgba(255,255,255,.05)"/>'; });
    [['random', '#8d84a0', 'At random'], ['loud', '#a3de76', 'Loudest first'], ['bridge', '#ffc266', 'Bridges first']].forEach(function (s, i) {
      var v = r[s[0]];
      o += '<path d="' + r.steps.map(function (f, j) { return (j ? 'L' : 'M') + X(f).toFixed(1) + ' ' + Y(v[j]).toFixed(1); }).join(' ') + '" fill="none" stroke="' + s[1] + '" stroke-width="2.4"/>';
      o += '<circle cx="' + (440 + 0) + '" cy="' + (26 + i * 20) + '" r="5" fill="' + s[1] + '"/><text class="t" x="452" y="' + (30 + i * 20) + '">' + s[2] + '</text>';
    });
    o += '<text class="t f" x="328" y="292" text-anchor="middle">share of voices removed</text>';
    svg.innerHTML = o;
  }

  /* ==================================== chrome ==================================== */
  function drawRules() {
    document.querySelectorAll('[data-rule]').forEach(function (svg, k) {
      var w = 1280, n = 16, d = 'M0 24', i, leaves = '', r = N.rngFrom(k + 5);
      svg.setAttribute('viewBox', '0 0 ' + w + ' 46');
      for (i = 0; i < n; i++) {
        var x0 = i * w / n, x1 = (i + 1) * w / n, up = i % 2 ? 40 : 8;
        d += ' C' + (x0 + 28) + ' ' + up + ' ' + (x1 - 28) + ' ' + up + ' ' + x1 + ' 24';
        if (r() < 0.8) leaves += '<g transform="translate(' + ((x0 + x1) / 2).toFixed(0) + ' ' + (i % 2 ? 33 : 15) + ') rotate(' + (i % 2 ? 30 : -30) + ')"><path class="l" style="animation-delay:' + (i * .13).toFixed(2) + 's" d="M0 0C5 -6 13 -5 17 0C13 5 5 6 0 0Z"/></g>';
      }
      svg.innerHTML = '<path class="s" pathLength="1" d="' + d + '"/>' + leaves;
    });
  }

  $('csv-file').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0]; if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      S.manual = true;
      var data = P.parseCSV(String(reader.result));
      if (!data.length || !('user_id' in data[0] || 'post_id' in data[0])) { notice('error', '<b>Could not read file</b><span>The CSV needs a header row with <code>post_id</code>, <code>user_id</code> and <code>parent_id</code> or <code>ref_post_id</code>.</span>'); return; }
      setData(data, 'Your file', esc(f.name).slice(0, 80), false);
    };
    reader.onerror = function () { notice('error', '<b>Could not read file</b><span>The file could not be opened.</span>'); };
    reader.readAsText(f);
  });
  $('download').addEventListener('click', function () {
    if (!S.G) return;
    var blob = new Blob(['﻿' + N.csvText(N.summaryRows(S.G))], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'network_summary.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });

  if ('IntersectionObserver' in window) new IntersectionObserver(function (en) { S.onscreen = en[0].isIntersecting; }, { threshold: 0 }).observe($('sky'));
  if (window.ResizeObserver) new ResizeObserver(resize).observe($('sky')); else window.addEventListener('resize', resize);
  resize(); drawRules(); requestAnimationFrame(frame); loadDefault();

  window.__grapevine = S;      // handy for debugging in the browser console
})();
