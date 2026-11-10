/* Section E: Network and Influence Analysis, analysis engine.
 *
 * Plain JavaScript with no dependencies. It runs in the browser (index.html) and in Node
 * (make_summary.js). It reuses Section C's profiler.js for region and interest rules, so both
 * sections read people the same way.
 *
 * What it computes: an interaction graph, PageRank, betweenness, k-core, Louvain communities,
 * roles, cascades, trend relays, mixing matrices, mood contagion, reply speed, knock-out
 * robustness, shortest paths and a contagion simulator.
 *
 * Privacy: every voice is shown only under a generated codename. Bio, location and user IDs
 * are read once to derive labels and then dropped. Group figures need at least K_MIN people.
 */
(function (root) {
  'use strict';

  var K_MIN = 5, NA = 'Not stated', SCATTERED = 'Scattered voices';
  var ROLES = ['Bridge', 'Hub', 'Spark', 'Amplifier', 'Regular', 'Listener'];
  var ARCHETYPE = {
    'Technology & Software': 'Builders', 'Marketing, Media & Brands': 'Storytellers',
    'Business & Entrepreneurship': 'Founders', 'Students & Education': 'Learners',
    'Sustainability & Design': 'Stewards', 'Consumer & Customer Experience': 'Everyday Voices',
    'Finance & Economics': 'Analysts', 'Health & Wellness': 'Caretakers',
    'Entertainment & Sports': 'Fans', 'Travel & Food': 'Explorers'
  };

  var ADJ = 'Amber Ashen Azure Brass Briar Cedar Cinder Clover Copper Coral Crimson Dusk Ember Fennel Fern Flint Frost Gilded Hazel Hollow Indigo Ivory Jade Juniper Lilac Linen Lunar Maple Marble Meadow Mist Moss Myrtle Ochre Onyx Opal Pearl Plum Quartz Quill Raven Rowan Russet Saffron Sable Silver Slate Sorrel Tawny Thistle Umber Velvet Willow Wren Yarrow'.split(' ');
  var NOUN = 'Heron Lantern Finch Otter Sparrow Comet Harbor Kestrel Lynx Magpie Marten Moth Nightjar Osprey Owl Pike Plover Quail Raven Robin Salmon Shrike Skylark Stoat Swift Tern Thrush Vole Warbler Weasel Badger Beacon Bellows Bramble Brook Compass Cricket Curlew Dipper Falcon Ferret Gannet Grouse Hare Hornet Ibis Jackdaw Kite Lark Linnet Loon Merlin Newt Oriole'.split(' ');

  function hash(s) { var h = 2166136261, i; for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rngFrom(seed) { var s = seed | 0; return function () { s = (s + 0x6D2B79F5) | 0; var t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function pct(n, d) { return d ? Math.round(1000 * n / d) / 10 : 0; }
  function inc(o, k, by) { o[k] = (o[k] || 0) + (by === undefined ? 1 : by); }
  function modeOf(o, skip) { var best = null, n = -1; Object.keys(o).sort().forEach(function (k) { if (k !== skip && o[k] > n) { n = o[k]; best = k; } }); return best; }
  function quantile(sorted, q) { if (!sorted.length) return 0; return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]; }
  function parseTs(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(s || ''));
    if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    var d = Date.parse(s); return isNaN(d) ? NaN : d;
  }
  var MOOD = { positive: 1, neutral: 0, negative: -1 };
  var TAG_RE = /#[\p{L}\p{N}_]{2,}/u;

  /* ------------------------------------------------------------ graph */
  function build(rows, P) {
    var byUser = new Map(), nodes = [], posts = [], idx = new Map();
    rows.forEach(function (r) {
      var uid = r.user_id || ('post:' + r.post_id), n = byUser.get(uid);
      if (!n) { n = { i: nodes.length, uid: uid, platform: r.platform || 'Unknown', bio: '', loc: '', followers: NaN, first: Infinity, posts: 0, moodSum: 0, moodN: 0 }; byUser.set(uid, n); nodes.push(n); }
      n.posts++;
      if (!n.bio && r.user_bio) n.bio = String(r.user_bio);
      if (!n.loc && r.user_location) n.loc = String(r.user_location);
      if (!isFinite(n.followers) && r.followers) { var f = Number(String(r.followers).replace(/[, ]/g, '')); if (isFinite(f)) n.followers = f; }
      var ts = parseTs(r.timestamp), mood = (r.sentiment in MOOD) ? MOOD[r.sentiment] : null, tag = String(r.text || '').match(TAG_RE);
      if (!isNaN(ts) && ts < n.first) n.first = ts;
      if (mood !== null) { n.moodSum += mood; n.moodN++; }
      var type = r.interaction || (r.parent_id ? 'reply' : 'post');
      if (r.post_id) idx.set(r.post_id, posts.length);
      posts.push({ a: n.i, ts: ts, type: type, refId: r.ref_post_id || r.parent_id || '', ref: -1, tag: tag ? tag[0] : null, mood: mood, kids: [], platform: n.platform });
    });

    var used = {};
    nodes.forEach(function (n) {
      n.org = P.isOrganisation(n.bio);
      n.region = P.classifyRegion(n.loc) || NA;
      n.calling = P.classifyInterests(n.bio)[0] || NA;
      var h = hash(n.uid), name = ADJ[h % ADJ.length] + ' ' + NOUN[(h >>> 8) % NOUN.length];
      used[name] = (used[name] || 0) + 1;
      n.name = used[name] > 1 ? name + ' ' + ['', '', 'II', 'III', 'IV', 'V', 'VI'][Math.min(6, used[name])] : name;
      delete n.uid; delete n.bio; delete n.loc;             // only derived labels survive this point
    });

    var edgeMap = new Map(), N = nodes.length;
    posts.forEach(function (p, pi) {
      if (!p.refId) return;
      var t = idx.get(p.refId);
      if (t === undefined || t === pi) return;
      p.ref = t; posts[t].kids.push(pi);
      var s = p.a, d = posts[t].a;
      if (s === d) return;
      var key = s * N + d, e = edgeMap.get(key);
      if (!e) { e = { s: s, t: d, w: 0, first: p.ts, cross: nodes[s].platform !== nodes[d].platform }; edgeMap.set(key, e); }
      e.w++;
      if (p.ts < e.first) e.first = p.ts;
    });
    var edges = Array.from(edgeMap.values());

    var G = { nodes: nodes, posts: posts, edges: edges, und: nodes.map(function () { return new Map(); }), k: K_MIN };
    nodes.forEach(function (n) { n.inW = 0; n.outW = 0; n.inD = 0; n.outD = 0; });
    edges.forEach(function (e) {
      nodes[e.s].outW += e.w; nodes[e.s].outD++; nodes[e.t].inW += e.w; nodes[e.t].inD++;
      G.und[e.s].set(e.t, (G.und[e.s].get(e.t) || 0) + e.w);
      G.und[e.t].set(e.s, (G.und[e.t].get(e.s) || 0) + e.w);
    });
    nodes.forEach(function (n, i) { n.linked = G.und[i].size > 0; });
    G.adj = G.und.map(function (m) { return Array.from(m.entries()); });

    pagerank(G); betweenness(G); kcore(G); louvain(G); cascades(G); roles(G); trends(G);
    G.stats = stats(G);
    return G;
  }

  function pagerank(G) {
    var n = G.nodes.length, d = 0.85, pr = new Float64Array(n).fill(1 / n), next = new Float64Array(n), it;
    for (it = 0; it < 50; it++) {
      next.fill((1 - d) / n);
      var dangling = 0;
      G.nodes.forEach(function (nd, i) { if (!nd.outW) dangling += pr[i]; });
      G.edges.forEach(function (e) { next[e.t] += d * pr[e.s] * e.w / G.nodes[e.s].outW; });
      for (var i = 0; i < n; i++) next[i] += d * dangling / n;
      pr.set(next);
    }
    var max = 0; pr.forEach(function (v) { if (v > max) max = v; });
    G.nodes.forEach(function (nd, i) { nd.pr = pr[i]; nd.influence = max ? pr[i] / max : 0; });
  }

  /* Brandes betweenness on the undirected, unweighted graph. */
  function betweenness(G) {
    var n = G.nodes.length, bc = new Float64Array(n), s;
    var sigma = new Float64Array(n), dist = new Int32Array(n), delta = new Float64Array(n), preds = [], queue = new Int32Array(n), stack = new Int32Array(n);
    for (s = 0; s < n; s++) preds.push([]);
    for (s = 0; s < n; s++) {
      if (!G.nodes[s].linked) continue;
      sigma.fill(0); dist.fill(-1); delta.fill(0);
      var v, i, head = 0, tail = 0, top = 0;
      sigma[s] = 1; dist[s] = 0; queue[tail++] = s;
      while (head < tail) {
        v = queue[head++]; stack[top++] = v;
        var nb = G.adj[v];
        for (i = 0; i < nb.length; i++) {
          var w = nb[i][0];
          if (dist[w] < 0) { dist[w] = dist[v] + 1; queue[tail++] = w; preds[w].length = 0; }
          if (dist[w] === dist[v] + 1) { sigma[w] += sigma[v]; preds[w].push(v); }
        }
      }
      while (top > 0) {
        var x = stack[--top], ps = preds[x];
        for (i = 0; i < ps.length; i++) delta[ps[i]] += sigma[ps[i]] / sigma[x] * (1 + delta[x]);
        if (x !== s) bc[x] += delta[x];
      }
    }
    var max = 0; bc.forEach(function (b) { if (b > max) max = b; });
    G.nodes.forEach(function (nd, i) { nd.bc = bc[i] / 2; nd.bridge = max ? bc[i] / max : 0; });
  }

  function kcore(G) {
    var deg = G.adj.map(function (a) { return a.length; }), n = deg.length, done = new Uint8Array(n), core = 0, left = n;
    while (left > 0) {
      var removed = true;
      while (removed) {
        removed = false;
        for (var i = 0; i < n; i++) if (!done[i] && deg[i] <= core) {
          done[i] = 1; left--; G.nodes[i].core = core; removed = true;
          G.adj[i].forEach(function (e) { if (!done[e[0]]) deg[e[0]]--; });
        }
      }
      core++;
    }
  }

  /* Louvain community detection on the weighted, undirected graph. */
  function louvain(G) {
    var graph = G.adj.map(function (a) { return a.map(function (e) { return [e[0], e[1]]; }); });
    var member = G.nodes.map(function (_, i) { return i; }), level, self = graph.map(function () { return 0; });
    for (level = 0; level < 12; level++) {
      var N = graph.length, comm = [], tot = [], k = [], m2 = 0, i, moved = true, any = false, pass = 0;
      for (i = 0; i < N; i++) { var s = self[i] * 2; graph[i].forEach(function (e) { s += e[1]; }); k.push(s); tot.push(s); comm.push(i); m2 += s; }
      if (!m2) break;
      while (moved && pass++ < 30) {
        moved = false;
        for (i = 0; i < N; i++) {
          var c0 = comm[i], links = {};
          graph[i].forEach(function (e) { inc(links, comm[e[0]], e[1]); });
          tot[c0] -= k[i];
          var best = c0, bestGain = (links[c0] || 0) - tot[c0] * k[i] / m2;
          Object.keys(links).map(Number).sort(function (a, b) { return a - b; }).forEach(function (c) {
            var g = links[c] - tot[c] * k[i] / m2;
            if (g > bestGain + 1e-9) { bestGain = g; best = c; }
          });
          tot[best] += k[i];
          if (best !== c0) { comm[i] = best; moved = true; any = true; }
        }
      }
      if (!any) break;
      var remap = {}, nc = 0;
      comm = comm.map(function (c) { if (remap[c] === undefined) remap[c] = nc++; return remap[c]; });
      member = member.map(function (c) { return comm[c]; });
      var agg = [], selfN = new Array(nc).fill(0);
      for (i = 0; i < nc; i++) agg.push({});
      for (i = 0; i < N; i++) {
        selfN[comm[i]] += self[i];
        graph[i].forEach(function (e) { if (comm[e[0]] === comm[i]) selfN[comm[i]] += e[1] / 2; else inc(agg[comm[i]], comm[e[0]], e[1]); });
      }
      graph = agg.map(function (o) { return Object.keys(o).map(function (j) { return [Number(j), o[j]]; }); });
      self = selfN;
    }
    // keep real groups, name them from their most common calling and platform
    var groups = {};
    G.nodes.forEach(function (n, i) { if (n.linked) (groups[member[i]] = groups[member[i]] || []).push(n); });
    var list = Object.keys(groups).map(function (c) { return groups[c]; }).filter(function (g) { return g.length >= K_MIN; }).sort(function (a, b) { return b.length - a.length; });
    G.nodes.forEach(function (n) { n.comm = -1; });
    var usedNames = {};
    G.comms = list.map(function (g, id) {
      var cal = {}, plat = {}, reg = {}, internal = 0, all = 0;
      g.forEach(function (n) { n.comm = id; inc(cal, n.calling); inc(plat, n.platform); inc(reg, n.region); });
      var plTop = modeOf(plat), calTop = modeOf(cal, NA), pure = plat[plTop] / g.length;
      var name = (pure >= 0.6 ? plTop + ' ' : 'Roaming ') + (ARCHETYPE[calTop] || 'Regulars');
      used(name);
      function used(nm) { usedNames[nm] = (usedNames[nm] || 0) + 1; }
      if (usedNames[name] > 1) name += ' ' + ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][Math.min(7, usedNames[name])];
      return { id: id, name: name, size: g.length, platform: plTop, calling: calTop, region: modeOf(reg, NA), purity: pct(plat[plTop], g.length), internal: internal, all: all };
    });
    G.edges.forEach(function (e) {
      var a = G.nodes[e.s].comm, b = G.nodes[e.t].comm;
      if (a >= 0) { G.comms[a].all += e.w; if (a === b) G.comms[a].internal += e.w; }
    });
    G.nodes.forEach(function (n) {
      n.circle = n.comm >= 0 ? G.comms[n.comm].name : SCATTERED;
      var seen = {}, c = 0;
      G.adj[n.i].forEach(function (e) { var cm = G.nodes[e[0]].comm; if (cm >= 0 && !seen[cm]) { seen[cm] = 1; c++; } });
      n.circlesTouched = c;
    });
  }

  /* ------------------------------------------------------------ cascades */
  function cascades(G) {
    var P_ = G.posts, list = [];
    G.nodes.forEach(function (n) { n.spark = 0; });
    function subtree(i) {                 // iterative post-order: size, depth, wiener
      var order = [], stack = [i], depthOf = {};
      depthOf[i] = 0;
      while (stack.length) { var v = stack.pop(); order.push(v); P_[v].kids.forEach(function (c) { depthOf[c] = depthOf[v] + 1; stack.push(c); }); }
      return { order: order, depthOf: depthOf };
    }
    P_.forEach(function (p, i) {
      if (p.ref >= 0 || !p.kids.length) return;
      var t = subtree(i), size = {}, n = t.order.length, wiener = 0, maxDepth = 0, levels = {}, plats = {}, voices = {}, tags = {}, last = p.ts, moods = 0, moodN = 0;
      for (var j = n - 1; j >= 0; j--) {
        var v = t.order[j], s = 1;
        P_[v].kids.forEach(function (c) { s += size[c]; wiener += size[c] * (n - size[c]); });
        size[v] = s;
        if (P_[v].a !== undefined) G.nodes[P_[v].a].spark += s - 1;
        var q = P_[v], d = t.depthOf[v];
        if (d > maxDepth) maxDepth = d;
        inc(levels, d); inc(plats, q.platform); voices[q.a] = 1;
        if (q.tag) inc(tags, q.tag);
        if (q.ts > last) last = q.ts;
        if (q.mood !== null) { moods += q.mood; moodN++; }
      }
      if (n < 3) return;
      list.push({
        root: i, size: n, depth: maxDepth, breadth: Math.max.apply(null, Object.keys(levels).map(function (k) { return levels[k]; })),
        virality: n > 1 ? Math.round(100 * 2 * wiener / (n * (n - 1))) / 100 : 0, start: p.ts, end: last,
        platforms: Object.keys(plats), voices: Object.keys(voices).length, tag: modeOf(tags), mood: moodN ? moods / moodN : 0
      });
    });
    list.sort(function (a, b) { return b.size - a.size || a.start - b.start; });
    G.cascades = list;
  }

  /* The tree of one cascade, laid out for drawing. x is hops or hours; y is leaf order. */
  function cascadeTree(G, c) {
    var P_ = G.posts, nodes = [], leaf = 0;
    (function walk(i, depth, parent) {
      var kids = P_[i].kids.slice().sort(function (a, b) { return P_[a].ts - P_[b].ts; });
      var me = { post: i, depth: depth, parent: parent, hours: (P_[i].ts - c.start) / 3600000, mood: P_[i].mood, type: P_[i].type, platform: P_[i].platform, kids: kids.length, y: 0 };
      nodes.push(me);
      if (!kids.length) { me.y = leaf++; return me; }
      var ys = kids.map(function (k) { return walk(k, depth + 1, me).y; });
      me.y = (ys[0] + ys[ys.length - 1]) / 2;
      return me;
    })(c.root, 0, null);
    return { nodes: nodes, leaves: leaf };
  }

  /* ------------------------------------------------------------ roles */
  function roles(G) {
    var aud = G.nodes.filter(function (n) { return n.linked && !n.org; });
    function cut(f, q) { return quantile(aud.map(f).sort(function (a, b) { return a - b; }), q); }
    var bc92 = cut(function (n) { return n.bc; }, 0.92), pr90 = cut(function (n) { return n.pr; }, 0.9), sp92 = cut(function (n) { return n.spark; }, 0.92), out85 = cut(function (n) { return n.outW; }, 0.85), in50 = cut(function (n) { return n.inW; }, 0.5);
    G.nodes.forEach(function (n) {
      if (!n.linked) { n.role = 'Silent'; return; }
      if (n.org) { n.role = 'Official'; return; }
      if (n.bc >= bc92 && n.bc > 0 && n.circlesTouched >= 2) n.role = 'Bridge';
      else if (n.pr >= pr90) n.role = 'Hub';
      else if (n.spark >= sp92 && n.spark > 0) n.role = 'Spark';
      else if (n.outW >= out85 && n.inW <= in50) n.role = 'Amplifier';
      else if (n.inW === 0) n.role = 'Listener';
      else n.role = 'Regular';
    });
    var byMetric = { inW: 'answered', pr: 'weight', bc: 'bridge', spark: 'spark' };
    Object.keys(byMetric).forEach(function (m) {
      aud.slice().sort(function (a, b) { return b[m] - a[m]; }).forEach(function (n, i) { n['rank_' + byMetric[m]] = i + 1; });
    });
    G.audienceLinked = aud;
  }

  /* ------------------------------------------------------------ trends */
  function trends(G) {
    var map = {}, ts = G.posts.map(function (p) { return p.ts; }).filter(isFinite);
    G.tMin = ts.length ? Math.min.apply(null, ts) : 0;
    G.tMax = ts.length ? Math.max.apply(null, ts) : 1;
    G.dayZero = Math.floor(G.tMin / 86400000);
    G.days = Math.floor(G.tMax / 86400000) - G.dayZero + 1;
    G.posts.forEach(function (p, i) {
      if (!p.tag) return;
      var t = map[p.tag] || (map[p.tag] = { tag: p.tag, posts: [], voices: {}, plats: {}, mood: 0, moodN: 0 });
      t.posts.push(i); t.voices[p.a] = 1; inc(t.plats, p.platform);
      if (p.mood !== null) { t.mood += p.mood; t.moodN++; }
    });
    G.trends = Object.keys(map).map(function (k) {
      var t = map[k];
      t.posts.sort(function (a, b) { return G.posts[a].ts - G.posts[b].ts; });
      t.n = t.posts.length; t.voiceCount = Object.keys(t.voices).length; t.avgMood = t.moodN ? t.mood / t.moodN : 0;
      t.first = G.posts[t.posts[0]].ts; t.last = G.posts[t.posts[t.n - 1]].ts; t.platformCount = Object.keys(t.plats).length;
      var byDay = {};
      t.posts.forEach(function (i) { inc(byDay, Math.floor(G.posts[i].ts / 86400000)); });
      t.peakDay = Number(modeOf(byDay)) - G.dayZero;
      return t;
    }).filter(function (t) { return t.voiceCount >= K_MIN; }).sort(function (a, b) { return b.n - a.n; });
  }

  function segmentOf(n, dim) { return dim === 'platform' ? n.platform : dim === 'region' ? n.region : dim === 'calling' ? n.calling : n.circle; }

  /* How one trend moves between segments, day by day. */
  function relay(G, tag, dim) {
    var t = G.trends.filter(function (x) { return x.tag === tag; })[0];
    if (!t) return null;
    var d0 = Math.floor(t.first / 86400000), d1 = Math.floor(t.last / 86400000), span = d1 - d0 + 1, seg = {}, moodDay = [], i;
    for (i = 0; i < span; i++) moodDay.push({ n: 0, sum: 0, count: 0 });
    t.posts.forEach(function (pi) {
      var p = G.posts[pi], n = G.nodes[p.a], day = Math.floor(p.ts / 86400000) - d0, lab = segmentOf(n, dim);
      var s = seg[lab] || (seg[lab] = { label: lab, first: p.ts, voices: {}, cells: Array.from({ length: span }, function () { return { n: 0, sum: 0, count: 0 }; }), n: 0 });
      s.voices[p.a] = 1; s.n++;
      if (p.ts < s.first) s.first = p.ts;
      s.cells[day].n++; moodDay[day].n++;
      if (p.mood !== null) { s.cells[day].sum += p.mood; s.cells[day].count++; moodDay[day].sum += p.mood; moodDay[day].count++; }
    });
    var rows = [], small = null;
    Object.keys(seg).forEach(function (k) {
      var s = seg[k];
      if (Object.keys(s.voices).length >= K_MIN && k !== NA && k !== SCATTERED) rows.push(s);
      else {
        if (!small) small = { label: 'Other groups', first: s.first, voices: {}, cells: Array.from({ length: span }, function () { return { n: 0, sum: 0, count: 0 }; }), n: 0 };
        small.n += s.n; if (s.first < small.first) small.first = s.first;
        s.cells.forEach(function (c, j) { small.cells[j].n += c.n; small.cells[j].sum += c.sum; small.cells[j].count += c.count; });
      }
    });
    rows.sort(function (a, b) { return a.first - b.first; });
    if (small) rows.push(small);
    return { tag: tag, d0: d0, span: span, rows: rows, moodDay: moodDay, trend: t };
  }

  /* Share of interactions flowing from each segment to each segment. */
  function mixing(G, dim, limit) {
    var size = {}, flows = {};
    G.nodes.forEach(function (n) { if (n.linked && !n.org) inc(size, segmentOf(n, dim)); });
    var labels = Object.keys(size).filter(function (l) { return size[l] >= K_MIN && l !== NA && l !== SCATTERED; }).sort(function (a, b) { return size[b] - size[a]; }).slice(0, limit || 12);
    var pos = {}; labels.forEach(function (l, i) { pos[l] = i; });
    var m = labels.map(function () { return labels.map(function () { return 0; }); }), inside = 0, total = 0, sAll = {}, tAll = {};
    G.edges.forEach(function (e) {
      var a = segmentOf(G.nodes[e.s], dim), b = segmentOf(G.nodes[e.t], dim);
      if (pos[a] === undefined || pos[b] === undefined) return;
      m[pos[a]][pos[b]] += e.w; total += e.w; inc(sAll, a, e.w); inc(tAll, b, e.w);
      if (a === b) inside += e.w;
    });
    var expected = 0;
    labels.forEach(function (l) { expected += (sAll[l] || 0) * (tAll[l] || 0) / Math.max(1, total * total); });
    return { labels: labels, matrix: m, inside: pct(inside, total), expected: Math.round(expected * 1000) / 10, total: total, flows: flows };
  }

  function borderFlows(G) {
    var names = Array.from(new Set(G.nodes.map(function (n) { return n.platform; }))).sort(), pos = {}, total = 0;
    names.forEach(function (n, i) { pos[n] = i; });
    var m = names.map(function () { return names.map(function () { return 0; }); });
    G.edges.forEach(function (e) { if (e.cross) { m[pos[G.nodes[e.t].platform]][pos[G.nodes[e.s].platform]] += e.w; total += e.w; } });   // words travel from target to actor
    return { names: names, matrix: m, total: total };
  }

  function degreeDist(G) {
    var aud = G.audienceLinked, counts = {}, sum = 0, n = 0, xmin = 2;
    aud.forEach(function (nd) { inc(counts, nd.inD); if (nd.inD >= xmin) { sum += Math.log(nd.inD / (xmin - 0.5)); n++; } });
    var points = Object.keys(counts).map(Number).filter(function (d) { return d > 0; }).sort(function (a, b) { return a - b; }).map(function (d) { return { d: d, n: counts[d] }; });
    return { points: points, alpha: n ? Math.round((1 + n / sum) * 100) / 100 : 0, zero: counts[0] || 0 };
  }

  function moodContagion(G) {
    var names = ['positive', 'neutral', 'negative'], val = { '1': 0, '0': 1, '-1': 2 }, m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], base = [0, 0, 0];
    G.posts.forEach(function (p) {
      if (p.mood === null || p.type === 'repost') return;
      if (p.ref >= 0) { var q = G.posts[p.ref]; if (q.mood !== null) m[val[q.mood]][val[p.mood]]++; }
      base[val[p.mood]]++;
    });
    var total = base[0] + base[1] + base[2], any = m[0][0] + m[0][1] + m[0][2] + m[1][0] + m[1][1] + m[1][2] + m[2][0] + m[2][1] + m[2][2];
    return { names: names, matrix: m, base: base.map(function (b) { return total ? b / total : 0; }), any: any };
  }

  var SPEED_EDGES = [0.25, 1, 3, 6, 12, 24, 48, 96];
  var SPEED_LABELS = ['under 15m', '15m–1h', '1–3h', '3–6h', '6–12h', '12–24h', '1–2d', '2–4d', '4d+'];
  function replySpeed(G) {
    var byType = { all: SPEED_LABELS.map(function () { return 0; }), reply: SPEED_LABELS.map(function () { return 0; }), quote: SPEED_LABELS.map(function () { return 0; }), repost: SPEED_LABELS.map(function () { return 0; }), share: SPEED_LABELS.map(function () { return 0; }) };
    var all = [], waits = { reply: [], quote: [], repost: [], share: [] };
    G.posts.forEach(function (p) {
      if (p.ref < 0) return;
      var h = (p.ts - G.posts[p.ref].ts) / 3600000;
      if (!isFinite(h) || h < 0) return;
      all.push(h); if (waits[p.type]) waits[p.type].push(h);
      var b = 0; while (b < SPEED_EDGES.length && h >= SPEED_EDGES[b]) b++;
      byType.all[b]++; if (byType[p.type]) byType[p.type][b]++;
    });
    all.sort(function (a, b) { return a - b; });
    var medians = { all: quantile(all, 0.5) };
    Object.keys(waits).forEach(function (t) { waits[t].sort(function (a, b) { return a - b; }); medians[t] = quantile(waits[t], 0.5); });
    return { labels: SPEED_LABELS, byType: byType, median: medians.all, medians: medians, n: all.length };
  }

  /* ------------------------------------------------------------ experiments */
  function components(G, removed) {
    var n = G.nodes.length, comp = new Int32Array(n).fill(-1), sizes = [], stack = [], i;
    for (i = 0; i < n; i++) {
      if (comp[i] >= 0 || !G.nodes[i].linked || (removed && removed[i])) continue;
      var id = sizes.length, size = 0;
      stack.push(i); comp[i] = id;
      while (stack.length) {
        var v = stack.pop(); size++;
        var nb = G.adj[v];
        for (var j = 0; j < nb.length; j++) { var w = nb[j][0]; if (comp[w] < 0 && !(removed && removed[w])) { comp[w] = id; stack.push(w); } }
      }
      sizes.push(size);
    }
    var largest = 0; sizes.forEach(function (s) { if (s > largest) largest = s; });
    return { comp: comp, sizes: sizes, largest: largest };
  }

  function cutOrder(G, how, seed) {
    var list = G.nodes.filter(function (n) { return n.linked; }).map(function (n) { return n.i; });
    if (how === 'bridge') list.sort(function (a, b) { return G.nodes[b].bc - G.nodes[a].bc; });
    else if (how === 'loud') list.sort(function (a, b) { return G.adj[b].length - G.adj[a].length; });
    else { var r = rngFrom(seed || 7); for (var i = list.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = list[i]; list[i] = list[j]; list[j] = t; } }
    return list;
  }

  function knockout(G, how, frac, seed) {
    var order = cutOrder(G, how, seed), cut = Math.round(order.length * frac), removed = new Uint8Array(G.nodes.length), i;
    for (i = 0; i < cut; i++) removed[order[i]] = 1;
    var c = components(G, removed);
    return { removed: removed, cut: cut, comp: c.comp, sizes: c.sizes, largest: c.largest, total: order.length };
  }

  function robustness(G) {
    var steps = [], f, base = components(G).largest || 1;
    for (f = 0; f <= 0.3001; f += 0.025) steps.push(Math.round(f * 1000) / 1000);
    function curve(how, seed) { return steps.map(function (fr) { return knockout(G, how, fr, seed).largest / base; }); }
    var r = steps.map(function () { return 0; });
    [1, 2, 3, 4, 5].forEach(function (s) { curve('random', s).forEach(function (v, i) { r[i] += v / 5; }); });
    return { steps: steps, bridge: curve('bridge'), loud: curve('loud'), random: r };
  }

  function shortestPath(G, a, b) {
    if (a === b) return [a];
    var prev = {}, q = [a], h = 0; prev[a] = -1;
    while (h < q.length) {
      var v = q[h++];
      for (var i = 0; i < G.adj[v].length; i++) {
        var w = G.adj[v][i][0];
        if (prev[w] !== undefined) continue;
        prev[w] = v;
        if (w === b) { var path = [b], c = v; while (c !== -1) { path.push(c); c = prev[c]; } return path.reverse(); }
        q.push(w);
      }
    }
    return null;
  }

  /* Independent-cascade contagion: returns who hears it, from whom, at which hop. */
  function whisper(G, seed, p, rand, blocked) {
    rand = rand || Math.random;
    var reached = new Map(), frontier = [seed], hop = 0, order = [{ i: seed, from: -1, hop: 0 }];
    reached.set(seed, 0);
    while (frontier.length && hop < 40) {
      hop++;
      var next = [];
      for (var f = 0; f < frontier.length; f++) {
        var v = frontier[f], nb = G.adj[v];
        for (var j = 0; j < nb.length; j++) {
          var w = nb[j][0];
          if (reached.has(w) || (blocked && blocked[w])) continue;
          if (rand() < 1 - Math.pow(1 - p, nb[j][1])) { reached.set(w, hop); next.push(w); order.push({ i: w, from: v, hop: hop }); }
        }
      }
      frontier = next;
    }
    return { order: order, reached: reached.size, hops: order.length ? order[order.length - 1].hop : 0 };
  }

  function whisperOdds(G, seed, p, runs) {
    var r = rngFrom(hash(String(seed) + ':' + p)), sizes = [], i;
    for (i = 0; i < (runs || 200); i++) sizes.push(whisper(G, seed, p, r).reached);
    sizes.sort(function (a, b) { return a - b; });
    return { sizes: sizes, median: quantile(sizes, 0.5), p10: quantile(sizes, 0.1), p90: quantile(sizes, 0.9), max: sizes[sizes.length - 1] };
  }

  /* ------------------------------------------------------------ summary */
  function stats(G) {
    var aud = G.audienceLinked, linked = G.nodes.filter(function (n) { return n.linked; });
    var attn = aud.map(function (n) { return n.inW; }).sort(function (a, b) { return b - a; }), total = attn.reduce(function (a, b) { return a + b; }, 0);
    function topShare(q) { var c = Math.max(1, Math.round(attn.length * q)), s = 0; for (var i = 0; i < c; i++) s += attn[i]; return pct(s, total); }
    var pairs = {}, recip = 0, nPairs = 0, n = G.nodes.length;
    G.edges.forEach(function (e) { pairs[e.s * n + e.t] = 1; });
    G.edges.forEach(function (e) { nPairs++; if (pairs[e.t * n + e.s]) recip++; });
    var comp = components(G);
    // sampled distances inside the largest connected group
    var big = -1; comp.sizes.forEach(function (s, i) { if (s === comp.largest && big < 0) big = i; });
    var bigNodes = linked.filter(function (nd) { return comp.comp[nd.i] === big; }), r = rngFrom(11), distSum = 0, distN = 0, diam = 0, hist = {};
    for (var s = 0; s < Math.min(80, bigNodes.length); s++) {
      var src = bigNodes[Math.floor(r() * bigNodes.length)].i, d = {}, q = [src], h = 0; d[src] = 0;
      while (h < q.length) { var v = q[h++]; G.adj[v].forEach(function (e) { if (d[e[0]] === undefined) { d[e[0]] = d[v] + 1; q.push(e[0]); } }); }
      Object.keys(d).forEach(function (k) { if (d[k] > 0) { distSum += d[k]; distN++; inc(hist, d[k]); if (d[k] > diam) diam = d[k]; } });
    }
    var cl = 0, clN = 0;
    linked.forEach(function (nd) {
      var nb = G.adj[nd.i]; if (nb.length < 2) return;
      var t = 0;
      for (var i = 0; i < nb.length; i++) for (var j = i + 1; j < nb.length; j++) if (G.und[nb[i][0]].has(nb[j][0])) t++;
      cl += 2 * t / (nb.length * (nb.length - 1)); clN++;
    });
    var census = {}; aud.forEach(function (nd) { inc(census, nd.role); });
    var crossW = 0, allW = 0; G.edges.forEach(function (e) { allW += e.w; if (e.cross) crossW += e.w; });
    var maxDepth = 0; G.cascades.forEach(function (c) { if (c.depth > maxDepth) maxDepth = c.depth; });
    var sc = G.nodes.filter(function (nd) { return !nd.linked; }).length;
    return {
      voices: linked.length, silent: sc, threads: G.edges.length, interactions: allW, top1: topShare(0.01), top5: topShare(0.05), top10: topShare(0.1),
      reciprocity: pct(recip, nPairs), avgPath: distN ? Math.round(distSum / distN * 10) / 10 : 0, diameter: diam, distances: hist,
      clustering: clN ? Math.round(cl / clN * 100) / 100 : 0, largest: comp.largest, groups: comp.sizes.length, largestShare: pct(comp.largest, linked.length),
      census: census, cross: pct(crossW, allW), crossN: crossW, communities: G.comms.length, deepest: maxDepth, cascadeCount: G.cascades.length,
      density: Math.round(10000 * 2 * G.edges.length / Math.max(1, linked.length * (linked.length - 1))) / 100
    };
  }

  /* Observations written from the numbers. */
  function notes(G) {
    var s = G.stats, out = [], c = mixing(G, 'circle', 30), p = mixing(G, 'platform', 12), sp = replySpeed(G), mc = moodContagion(G), t = G.trends;
    if (G.edges.length < K_MIN) return out;
    out.push({ kick: 'The loud few', fig: s.top5, unit: '%', frac: s.top5, head: 'of all attention goes to the top 5% of voices', text: 'The top 1% alone collect ' + s.top1 + '%.' });
    out.push({ kick: 'Small world', fig: s.avgPath, unit: ' hops', frac: null, head: 'separate two voices, on average', text: 'The longest route found takes ' + s.diameter + ' hops.' });
    if (G.comms.length) out.push({ kick: 'Echo', fig: Math.round(c.inside), unit: '%', frac: c.inside, head: 'of exchanges stay inside one circle', text: 'Random mixing would give about ' + Math.round(c.expected) + '%. ' + G.comms.length + ' circles found.' });
    var bridges = s.census.Bridge || 0;
    out.push({ kick: 'Load-bearing', fig: bridges, unit: '', frac: pct(bridges, s.voices), head: 'bridges hold separate circles together', text: 'They are ' + pct(bridges, G.audienceLinked.length) + '% of connected voices.' });
    out.push({ kick: 'Conversation', fig: Math.round(s.reciprocity), unit: '%', frac: s.reciprocity, head: 'of ties run both ways', text: 'The rest is one-way traffic.' });
    if (G.cascades.length) { var top = G.cascades[0]; out.push({ kick: 'Longest vine', fig: s.deepest, unit: ' hops', frac: null, head: 'from first post to the furthest echo', text: 'The largest cascade reached ' + top.size + ' posts' + (top.tag ? ' under ' + top.tag : '') + '.' }); }
    if (s.crossN) out.push({ kick: 'Border crossings', fig: s.cross, unit: '%', frac: s.cross, head: 'of exchanges jump between platforms', text: 'Few, but they carry trends to new crowds.' });
    if (sp.n) out.push({ kick: 'Quick to answer', fig: sp.median < 1 ? Math.round(sp.median * 60) : Math.round(sp.median * 10) / 10, unit: sp.median < 1 ? ' min' : ' h', frac: null, head: 'is the median wait for a response', text: 'Half of all reactions land sooner than this.' });
    if (mc.any >= K_MIN) {
      var neg = mc.matrix[2], nT = neg[0] + neg[1] + neg[2];
      if (nT) out.push({ kick: 'Mood travels', fig: Math.round(pct(neg[2], nT)), unit: '%', frac: pct(neg[2], nT), head: 'of answers to a negative post are negative', text: 'The baseline is ' + Math.round(mc.base[2] * 100) + '%.' });
    }
    if (t.length) out.push({ kick: 'Widest trend', fig: t[0].voiceCount, unit: '', frac: pct(t[0].voiceCount, s.voices), head: 'voices picked up ' + t[0].tag, text: 'Across ' + t[0].platformCount + ' platforms, peaking on day ' + (t[0].peakDay + 1) + '.' });
    return out;
  }

  /* Aggregate rows for saving. Codenames only appear for the top voices. */
  function summaryRows(G) {
    var s = G.stats, rows = [['dimension', 'category', 'value', 'share_percent']];
    [['voices_connected', s.voices], ['voices_silent', s.silent], ['threads', s.threads], ['interactions', s.interactions], ['avg_path_hops', s.avgPath], ['longest_path_hops', s.diameter], ['clustering', s.clustering], ['reciprocity_percent', s.reciprocity], ['communities', s.communities], ['largest_connected_group', s.largest], ['cascades', s.cascadeCount], ['deepest_cascade_hops', s.deepest]].forEach(function (x) { rows.push(['network', x[0], x[1], '']); });
    Object.keys(s.census).forEach(function (r) { rows.push(['role', r, s.census[r], pct(s.census[r], G.audienceLinked.length)]); });
    G.comms.forEach(function (c) { rows.push(['circle', c.name, c.size, pct(c.size, s.voices)]); });
    G.trends.forEach(function (t) { rows.push(['trend_posts', t.tag, t.n, '']); rows.push(['trend_voices', t.tag, t.voiceCount, '']); });
    G.audienceLinked.slice().sort(function (a, b) { return b.pr - a.pr; }).slice(0, 15).forEach(function (n) { rows.push(['top_voice_codename', n.name, Math.round(n.influence * 1000) / 1000, '']); });
    return rows;
  }
  function csvText(table) { return table.map(function (r) { return r.map(function (v) { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\n') + '\n'; }

  var api = {
    K_MIN: K_MIN, NA: NA, SCATTERED: SCATTERED, ROLES: ROLES, ARCHETYPE: ARCHETYPE, build: build, relay: relay, mixing: mixing, borderFlows: borderFlows,
    degreeDist: degreeDist, moodContagion: moodContagion, replySpeed: replySpeed, components: components, knockout: knockout,
    robustness: robustness, shortestPath: shortestPath, whisper: whisper, whisperOdds: whisperOdds, cascadeTree: cascadeTree,
    notes: notes, summaryRows: summaryRows, csvText: csvText, rngFrom: rngFrom, hash: hash, pct: pct, segmentOf: segmentOf
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Network = api;
})(typeof window !== 'undefined' ? window : globalThis);
