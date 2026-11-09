// Section D: Trend and Topic Detection, analysis logic.
//
// Plain JavaScript with no dependencies. It runs in the browser (index.html) and in
// Node (make_summary.js), so the same code produces the page and the saved CSV files.
//
// Steps: clean text -> count words, two word phrases and hashtags per time step ->
// group terms that appear in the same posts into topics -> score growth with a Poisson
// z test -> flag bursts -> forecast with damped trend Holt smoothing -> backtest the forecast.
// Only counts and scores are produced. Example posts are shown with handles, links,
// e-mail addresses and phone numbers masked.
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- CSV
  function parseCSV(text) {
    text = String(text || '').replace(/^﻿/, '');
    const rows = []; let row = [], field = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    if (!rows.length) return [];
    const head = rows.shift().map(h => h.trim());
    return rows.filter(r => r.length > 1).map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
  }
  function toCSV(rows) {
    if (!rows.length) return '';
    const cols = Object.keys(rows[0]);
    const esc = v => { v = String(v ?? ''); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n') + '\n';
  }

  // ---------------------------------------------------------------- text cleaning
  const STOP = new Set(`a an the and or but if then so than too very of to in on at by for with from up down out over under again further once here there when where why how all any both each few more most other some such no nor not only own same can will just don should now is are was were be been being have has had having do does did doing i me my myself we our ours you your yours he him his she her it its they them their what which who whom this that these those am would could also into about as get got it's im i'm dont didn't doesn't isn't wasn't can't won't us one like really still much many even well back new make made way going go see know think want need say said post thread comment comments context following adding update yes okay ok thanks thank via rt amp let lets let's ive i've youre you're thats that's there's per before after every since today tonight yet everyone please inside says sharing
que pero sobre para por con los las del una uno muy más mas está esta este esto como sus son hay ser nos les todo
hai hain ho hota hoti tha thi the nahi nahin na kya kyu kyun kaise kab koi kuch sab bhi aur ya par pe se ko ka ki ke mein me main mai hum tum aap yeh ye woh wo is us isko usko ab abhi phir toh to bhai yaar bahut thoda jo jab tak liye wala wali raha rahi rahe gaya gayi kar karo karna kiya diya lag
है हैं था थी थे और या पर में से को का की के यह वह ये वो कि जो तो भी नहीं ही एक कुछ सब लिए हो रहा रही रहे गया गई कर किया करना मेरा मेरी हम आप तुम इस उस अब बहुत लेकिन ने दी काफी`.split(/\s+/));
  const TOKEN_RE = /#[\p{L}\p{N}_]+|[\p{L}\p{M}\p{N}]+/gu;
  const DEVANAGARI = /[ऀ-ॿ]/;
  function tokens(text) {
    const t = text.toLowerCase().replace(/https?:\/\/\S+/g, ' ').replace(/@\w+/g, ' ');
    const out = [], tags = [];
    for (const m of t.matchAll(TOKEN_RE)) {
      let w = m[0];
      if (w[0] === '#') { if (w.length > 2) tags.push(w); w = w.slice(1); }
      if (w.length < 3 && !DEVANAGARI.test(w)) continue;
      if (/^\d+$/.test(w) || STOP.has(w)) continue;
      out.push(w);
    }
    return { words: out, tags };
  }
  function terms(words) {
    const set = new Set(words);
    for (let i = 0; i < words.length - 1; i++) if (words[i] !== words[i + 1]) set.add(words[i] + ' ' + words[i + 1]);
    return set;
  }
  // privacy: hide handles, links, e-mails and phone numbers before any post text is shown
  function maskText(s) {
    return String(s || '').replace(/https?:\/\/\S+/g, '[link]').replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
      .replace(/@\w+/g, '@[user]').replace(/\+?\d[\d\s-]{8,}\d/g, '[number]');
  }

  // ---------------------------------------------------------------- time
  function parseTime(s) {
    s = (s || '').trim(); if (!s) return null;
    const d = new Date(/^\d{4}-\d{2}-\d{2} \d/.test(s) ? s.replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z') : s);
    return isNaN(d) ? null : d;
  }
  const STEP_MS = { hour: 3600e3, day: 86400e3, week: 7 * 86400e3 };
  function chooseBucket(min, max) { const span = max - min; return span <= 3 * 86400e3 ? 'hour' : span <= 120 * 86400e3 ? 'day' : 'week'; }
  function bucketStart(t, b) { if (b === 'week') return Math.floor((t - 4 * 86400e3) / STEP_MS.week) * STEP_MS.week + 4 * 86400e3; return Math.floor(t / STEP_MS[b]) * STEP_MS[b]; }
  function fmt(t, b) { const o = b === 'hour' ? { month: 'short', day: 'numeric', hour: '2-digit', timeZone: 'UTC' } : { month: 'short', day: 'numeric', timeZone: 'UTC' }; return new Date(t).toLocaleString('en-GB', o); }
  const isoDay = t => new Date(t).toISOString().slice(0, 10);

  // ---------------------------------------------------------------- statistics
  const avg = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
  const sum = a => a.reduce((s, x) => s + x, 0);
  // Damped trend Holt smoothing. The weights are chosen per series from a small grid,
  // keeping the pair with the smallest one step ahead error.
  function holtFit(y, alpha, beta, phi) {
    let level = y[0], trend = y.length > 1 ? y[1] - y[0] : 0; const errs = [];
    for (let i = 1; i < y.length; i++) {
      const pred = level + phi * trend; errs.push(y[i] - pred);
      const prev = level; level = alpha * y[i] + (1 - alpha) * (level + phi * trend); trend = beta * (level - prev) + (1 - beta) * phi * trend;
    }
    return { level, trend, errs };
  }
  function holt(y, h) {
    if (y.length < 3) return { fc: Array(h).fill(y[y.length - 1] || 0), sd: 0, trend: 0 };
    const phi = 0.9; let best = null;
    for (const alpha of [0.2, 0.35, 0.5, 0.65, 0.8]) for (const beta of [0, 0.05, 0.1, 0.2]) {
      const f = holtFit(y, alpha, beta, phi), sse = f.errs.slice(1).reduce((s, e) => s + e * e, 0);
      if (!best || sse < best.sse) best = { ...f, sse };
    }
    const sd = Math.sqrt(avg(best.errs.slice(1).map(e => e * e)));
    let damp = 0; const fc = [];
    for (let k = 1; k <= h; k++) { damp += Math.pow(phi, k); fc.push(Math.max(0, best.level + damp * best.trend)); }
    return { fc, sd, trend: best.trend, level: best.level };
  }
  // series: counts per complete time step
  function trendStats(series) {
    const n = series.length, cut = Math.max(1, Math.floor(n * 0.75));
    const before = series.slice(0, cut), recent = series.slice(cut);
    const rB = avg(before), rR = recent.length ? avg(recent) : rB;
    const score = (rR + 1) / (rB + 1);
    // Poisson test: is the recent total higher than the earlier rate predicts?
    const expected = rB * recent.length, observed = sum(recent);
    const z = recent.length ? (observed - expected) / Math.sqrt(expected + 1) : 0;
    const sd = Math.max(Math.sqrt(avg(before.map(x => (x - rB) ** 2))), Math.sqrt(rB + 1));   // never below Poisson noise
    const burst = (series[n - 1] - rB) / sd;
    const H = holt(series, 3);
    const conf = z >= 3 ? 'High' : z >= 2 ? 'Medium' : 'Low';
    let status = 'steady';
    if (rB < 0.2 && observed >= 3 && z >= 2) status = 'new';
    else if (score >= 1.2 && z >= 2) status = 'rise';
    else if (score <= 0.83 && z <= -2) status = 'fall';
    const likely = H.trend > 0 && z >= 2 && score > 1;
    return { score, z, conf, burst, forecast: H.fc, band: 1.64 * H.sd, momentum: H.trend, status, likely, recentAvg: rR, beforeAvg: rB };
  }

  // ---------------------------------------------------------------- topics (co-occurrence clustering)
  function buildTopics(docs) {
    const df = new Map();
    docs.forEach(d => d.terms.forEach(t => df.set(t, (df.get(t) || 0) + 1)));
    const N = docs.length, minDf = Math.max(5, Math.round(N * 0.005)), maxDf = N * 0.5;
    // candidate terms: the most frequent ones, plus the ones growing fastest recently (so new topics are found)
    const maxStep = Math.max(...docs.map(d => d.step)), recentFrom = Math.floor(maxStep * 0.75);
    const rdf = new Map(); docs.forEach(d => { if (d.step >= recentFrom) d.terms.forEach(t => rdf.set(t, (rdf.get(t) || 0) + 1)); });
    const ok = [...df].filter(([t, c]) => c >= minDf && c <= maxDf);
    const byFreq = ok.slice().sort((a, b) => b[1] - a[1]).slice(0, 60).map(x => x[0]);
    const share = docs.filter(d => d.step >= recentFrom).length / N, excess = t => (rdf.get(t[0]) || 0) - t[1] * share;
    // skip terms that only repeat a phrase already picked (same posts), so different new topics all get a place
    const growing = ok.filter(t => excess(t) >= minDf / 2).sort((a, b) => excess(b) - excess(a)).slice(0, 300).map(x => x[0]);
    const postsOf = new Map(growing.map(t => [t, new Set()]));
    docs.forEach((d, di) => d.terms.forEach(t => { const s = postsOf.get(t); if (s) s.add(di); }));
    const byGrowth = [], keptSets = [];
    for (const t of growing) {
      const st = postsOf.get(t); let dup = false;
      for (const k of keptSets) { let i = 0; st.forEach(x => { if (k.has(x)) i++; }); if (i >= 0.8 * st.size) { dup = true; break; } }
      if (!dup) { byGrowth.push(t); keptSets.push(st); if (byGrowth.length >= 30) break; }
    }
    const cand = [...new Set([...byFreq, ...byGrowth])];
    const idx = new Map(cand.map((t, i) => [t, i]));
    const sets = cand.map(() => new Set());
    docs.forEach((d, di) => d.terms.forEach(t => { if (idx.has(t)) sets[idx.get(t)].add(di); }));
    const jac = (a, b) => { let inter = 0; const [s, l] = a.size < b.size ? [a, b] : [b, a]; s.forEach(x => { if (l.has(x)) inter++; }); return inter / (a.size + b.size - inter || 1); };
    let clusters = cand.map((t, i) => ({ terms: [t], docs: new Set(sets[i]) }));
    while (true) {
      let best = null, bv = 0.3;
      for (let i = 0; i < clusters.length; i++) for (let j = i + 1; j < clusters.length; j++) {
        const v = jac(clusters[i].docs, clusters[j].docs); if (v > bv) { bv = v; best = [i, j]; }
      }
      if (!best) break;
      const [i, j] = best; const a = clusters[i], b = clusters[j];
      a.terms.push(...b.terms); b.docs.forEach(x => a.docs.add(x)); clusters.splice(j, 1);
    }
    // keep the biggest topics, with extra weight for recent posts so a small new topic is not missed
    const weight = c => { let r = 0; c.docs.forEach(i => { if (docs[i].step >= recentFrom) r++; }); return c.docs.size + 4 * r; };
    const growthSet = new Set(byGrowth);
    clusters = clusters.filter(c => c.docs.size >= minDf && (c.terms.length > 1 || c.docs.size >= N * 0.08 ||
      (growthSet.has(c.terms[0]) && (rdf.get(c.terms[0]) || 0) >= 2 * minDf && (rdf.get(c.terms[0]) || 0) >= 0.6 * c.docs.size)))
      .sort((a, b) => weight(b) - weight(a)).slice(0, 14);
    const idf = t => Math.log(N / (df.get(t) || 1));
    docs.forEach(d => {
      let best = -1, bs = 0;
      clusters.forEach((c, ci) => { let s = 0; c.terms.forEach(t => { if (d.terms.has(t)) s += idf(t); }); if (s > bs) { bs = s; best = ci; } });
      d.topic = best;
    });
    const used = new Set();
    return clusters.map((c, ci) => {
      const counts = new Map();
      docs.filter(d => d.topic === ci).forEach(d => d.terms.forEach(t => counts.set(t, (counts.get(t) || 0) + 1)));
      // order terms by how often they occur in this topic times how specific they are (IDF)
      const top = c.terms.slice().sort((a, b) => (counts.get(b) || 0) * idf(b) - (counts.get(a) || 0) * idf(a));
      const lead = top[0] || '', phrase = top.slice(0, 6).find(t => t.includes(' ') && t.includes(lead.split(' ')[0]) && !used.has(t));
      let label = phrase || (top[1] ? lead + ' / ' + top[1] : lead);
      used.add(label);
      if (/^[a-z]{2,3}$/.test(label)) label = label.toUpperCase();   // short single word topics are usually acronyms (UPI, GST)
      return { id: ci, label: label.replace(/(^|\s|\/)(\p{L})/gu, (m, a, b) => a + b.toUpperCase()), keywords: top.slice(0, 8) };
    });
  }

  // ---------------------------------------------------------------- main
  // rows: objects with the shared columns. Returns posts ready for analyse().
  function prepare(rows) {
    return rows.map(r => {
      const t = parseTime(r.timestamp), tk = tokens(r.text || '');
      return { post_id: r.post_id, user_id: r.user_id || '', parent_id: (r.parent_id || '').trim(), platform: (r.platform || 'Unknown').trim(), text: r.text || '', t: t && t.getTime(), words: tk.words, tags: tk.tags };
    }).filter(p => p.t && p.text.trim());
  }

  // opts: {platform, from, to (ms), bucket: 'auto'|'hour'|'day'|'week'}
  function analyse(all, opts) {
    opts = opts || {};
    const from = opts.from ?? -Infinity, to = opts.to ?? Infinity;
    const posts = all.filter(p => (!opts.platform || p.platform === opts.platform) && p.t >= from && p.t <= to);
    if (posts.length < 20) return { error: 'Need at least 20 posts with text and time for this filter.' };
    const tmin = Math.min(...posts.map(p => p.t)), tmax = Math.max(...posts.map(p => p.t));
    let b = opts.bucket && opts.bucket !== 'auto' ? opts.bucket : chooseBucket(tmin, tmax);
    let steps = Math.floor((bucketStart(tmax, b) - bucketStart(tmin, b)) / STEP_MS[b]) + 1;
    if (steps > 400) { b = b === 'hour' ? 'day' : 'week'; steps = Math.floor((bucketStart(tmax, b) - bucketStart(tmin, b)) / STEP_MS[b]) + 1; }
    const start = bucketStart(tmin, b);
    // leave out the newest step from scoring if it is less than half complete
    const lastFrac = (tmax - bucketStart(tmax, b)) / STEP_MS[b];
    const partial = steps > 4 && lastFrac < 0.5;
    const S = partial ? steps - 1 : steps;
    const stepOf = t => Math.floor((bucketStart(t, b) - start) / STEP_MS[b]);
    const axis = [...Array(steps)].map((_, i) => start + i * STEP_MS[b]);
    // the same text from the same account is counted once
    const seenText = new Set(); let dupes = 0;
    const docs = [];
    posts.forEach(p => { const key = p.user_id + '|' + p.text.trim().toLowerCase(); if (seenText.has(key)) { dupes++; return; } seenText.add(key); docs.push({ ...p, step: stepOf(p.t), terms: terms(p.words) }); });
    const topics = buildTopics(docs);
    const series = sel => { const s = Array(steps).fill(0); sel.forEach(d => s[d.step]++); return s; };
    const plats = [...new Set(docs.map(d => d.platform))].sort();

    topics.forEach(tp => {
      tp.posts = docs.filter(d => d.topic === tp.id);
      tp.series = series(tp.posts);
      Object.assign(tp, trendStats(tp.series.slice(0, S)));
      tp.total = tp.posts.length;
      const pc = {}; tp.posts.forEach(d => pc[d.platform] = (pc[d.platform] || 0) + 1);
      tp.pc = pc;
      tp.platforms = Object.entries(pc).sort((a, b) => b[1] - a[1]);
      const first = tp.posts.reduce((m, d) => d.t < m.t ? d : m, tp.posts[0]);
      tp.firstPlatform = first ? first.platform : '';
      tp.firstSeen = first ? first.t : 0;
      tp.peak = axis[tp.series.indexOf(Math.max(...tp.series))];
      tp.users = new Set(tp.posts.map(d => d.user_id).filter(Boolean)).size;
      tp.replies = tp.posts.filter(d => d.parent_id).length;
    });
    // drop topics that ended up with no posts (their posts all matched another topic better)
    for (let i = topics.length - 1; i >= 0; i--) if (topics[i].total < 3) topics.splice(i, 1);
    topics.sort((a, b) => (b.likely - a.likely) || (b.z - a.z));
    // related topics: share of users who post in both
    topics.forEach(a => {
      const ua = new Set(a.posts.map(d => d.user_id));
      a.related = topics.filter(b => b !== a).map(b => { const ub = new Set(b.posts.map(d => d.user_id)); let i = 0; ub.forEach(u => { if (ua.has(u)) i++; }); return { label: b.label, j: i / ((ua.size + ub.size - i) || 1) }; }).sort((x, y) => y.j - x.j).slice(0, 3);
    });

    // keywords, hashtags, emerging terms
    const termSeries = new Map(), tagSeries = new Map(), tagPlat = new Map();
    docs.forEach(d => {
      d.terms.forEach(t => { if (!termSeries.has(t)) termSeries.set(t, Array(steps).fill(0)); termSeries.get(t)[d.step]++; });
      new Set(d.tags).forEach(t => {
        if (!tagSeries.has(t)) tagSeries.set(t, Array(steps).fill(0)); tagSeries.get(t)[d.step]++;
        if (!tagPlat.has(t)) tagPlat.set(t, {}); const m = tagPlat.get(t); m[d.platform] = (m[d.platform] || 0) + 1;
      });
    });
    const rank = (map, min) => [...map].map(([term, s]) => ({ term, total: sum(s), ...trendStats(s.slice(0, S)) }))
      .filter(x => x.total >= min && x.total <= docs.length * 0.6);
    let allKw = rank(termSeries, 5);
    // remove words that only ever appear inside a longer phrase, and identical phrase chains
    const sig = k => k.total + ':' + termSeries.get(k.term).join(',');
    const phraseSig = new Set(allKw.filter(k => k.term.includes(' ')).map(sig));
    allKw = allKw.filter(k => k.term.includes(' ') || !phraseSig.has(sig(k)));
    const seen = new Set(); allKw = allKw.filter(k => { const s = sig(k); if (seen.has(s)) return false; seen.add(s); return true; });
    const rising = allKw.filter(k => k.z >= 2 && k.score > 1).sort((a, b) => b.z - a.z);
    const fading = allKw.filter(k => k.z <= -2 && k.score < 1).sort((a, b) => a.z - b.z);
    const cut = Math.max(1, Math.floor(S * 0.75));
    const emerging = [...termSeries].sort((a, b) => b[0].split(' ').length - a[0].split(' ').length).map(([term, s]) => ({ term, early: sum(s.slice(0, cut)), late: sum(s.slice(cut, S)) }))
      .filter(x => x.late >= 4 && x.early <= Math.max(1, x.late * 0.1)).sort((a, b) => b.late - a.late);
    const eSeen = new Set();
    const emergingClean = emerging.filter(e => { const k = e.early + ':' + e.late + ':' + termSeries.get(e.term).join(','); if (eSeen.has(k)) return false; eSeen.add(k); return true; }).slice(0, 12);
    const hashtags = rank(tagSeries, 2).sort((a, b) => b.total - a.total).map(h => ({ ...h, top: Object.entries(tagPlat.get(h.term)).sort((a, b) => b[1] - a[1])[0][0] }));

    // early warnings on the latest complete step
    const alerts = [];
    topics.forEach(t => { if (t.burst >= 3 && t.series[S - 1] >= 5) alerts.push({ kind: 'Topic', name: t.label, burst: t.burst, count: t.series[S - 1] }); });
    rising.slice(0, 30).forEach(k => { if (k.burst >= 3 && termSeries.get(k.term)[S - 1] >= 5) alerts.push({ kind: 'Keyword', name: k.term, burst: k.burst, count: termSeries.get(k.term)[S - 1] }); });
    hashtags.forEach(h => { if (h.burst >= 3 && tagSeries.get(h.term)[S - 1] >= 5) alerts.push({ kind: 'Hashtag', name: h.term, burst: h.burst, count: tagSeries.get(h.term)[S - 1] }); });
    alerts.sort((a, b) => b.burst - a.burst);

    // backtest: hide the last 3 complete steps and forecast them
    let bt = null;
    if (S >= 10 && topics.length) {
      const H = 3; let errM = 0, errN = 0, dirOk = 0, dirN = 0, tot = 0, inBand = 0;
      topics.forEach(t => {
        const train = t.series.slice(0, S - H), test = t.series.slice(S - H, S);
        const m = holt(train, H), last = train[train.length - 1];
        test.forEach((v, i) => { errM += Math.abs(m.fc[i] - v); errN += Math.abs(last - v); tot += v; if (Math.abs(m.fc[i] - v) <= 1.64 * m.sd + 0.5) inBand++; });
        const base = avg(train.slice(-H)), actualDir = Math.sign(avg(test) - base), predDir = Math.sign(avg(m.fc) - base);
        if (actualDir !== 0) { dirN++; if (actualDir === predDir) dirOk++; }
      });
      const n = topics.length * H;
      bt = { mae: errM / n, naive: errN / n, wape: errM / (tot || 1), dir: dirN ? dirOk / dirN : null, dirN, cover: inBand / n, H };
    }
    return { posts: docs, dupes, topics, rising, fading, emerging: emergingClean, hashtags, alerts, axis, bucket: b, steps, S, partial, plats, bt };
  }

  // ---------------------------------------------------------------- exports for CSV files
  function topicRows(R) {
    return R.topics.map((t, i) => ({ rank: i + 1, topic: t.label, keywords: t.keywords.join(' | '), posts: t.total, users: t.users, trend_score: t.score.toFixed(3), z_score: t.z.toFixed(2), confidence: t.conf, burst: t.burst.toFixed(2), momentum_per_step: t.momentum.toFixed(2), status: t.status, likely_to_rise: t.likely, started_on: t.firstPlatform, first_seen: new Date(t.firstSeen).toISOString(), forecast_next_3: t.forecast.map(v => v.toFixed(1)).join(' | '), forecast_range: '+/- ' + t.band.toFixed(1) }));
  }
  function keywordRows(R) {
    return [...R.rising.slice(0, 25).map(k => ({ type: 'rising', term: k.term, mentions: k.total, trend_score: k.score.toFixed(3), z_score: k.z.toFixed(2) })),
      ...R.fading.slice(0, 25).map(k => ({ type: 'fading', term: k.term, mentions: k.total, trend_score: k.score.toFixed(3), z_score: k.z.toFixed(2) })),
      ...R.emerging.map(e => ({ type: 'emerging', term: e.term, mentions: e.early + e.late, trend_score: '', z_score: '' })),
      ...R.hashtags.slice(0, 25).map(h => ({ type: 'hashtag', term: h.term, mentions: h.total, trend_score: h.score.toFixed(3), z_score: h.z.toFixed(2) }))];
  }

  const api = { parseCSV, toCSV, tokens, maskText, parseTime, fmt, isoDay, holt, trendStats, prepare, analyse, topicRows, keywordRows };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  root.Trends = api;
})(typeof window !== 'undefined' ? window : globalThis);
