/* Section C: Demographic Profiling, analysis logic.
 *
 * Plain JavaScript with no dependencies. It runs in the browser (index.html) and in
 * Node (make_summary.js) so the same code produces the page and the saved CSV.
 *
 * Everything shown to a visitor is an AGGREGATE. buildProfiles() creates one internal
 * record per anonymised user_id (derived labels only: no bio, location or handle text is
 * kept), and the page only draws them as anonymous dots or counts them in groups.
 * Groups smaller than K_MIN users are merged into "Other (grouped for privacy)", and a
 * bio word is shown only when at least K_MIN profiles use it.
 * All estimates come from public, self-described indicators (bio text, location text,
 * language codes, writing script, posting hours, follower counts, join dates) using
 * transparent keyword rules.
 */
(function (root) {
  'use strict';

  var K_MIN = 5;
  var OTHER_LABEL = 'Other (grouped for privacy)';
  var NA_LABEL = 'Not available';

  /* ---------------------------------------------------------------- CSV */

  function parseCSV(text) {
    text = String(text || '').replace(/^﻿/, '');
    var rows = [], row = [], field = '', inQ = false, i, c;
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else { inQ = false; }
        } else { field += c; }
      } else if (c === '"') { inQ = true; }
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* ignore */ }
      else { field += c; }
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    if (!rows.length) return [];
    var head = rows[0].map(function (h) { return h.trim(); });
    return rows.slice(1)
      .filter(function (r) { return r.length > 1 || (r[0] || '').trim() !== ''; })
      .map(function (r) {
        var o = {};
        head.forEach(function (h, idx) { o[h] = r[idx] === undefined ? '' : r[idx]; });
        return o;
      });
  }

  function hasProfileColumns(rows) {
    var n = Math.min(rows.length, 200), i;
    for (i = 0; i < n; i++) {
      if (rows[i].user_bio || rows[i].user_location || rows[i].language) return true;
    }
    return false;
  }

  /* Add language / user_bio / user_location (and followers / joined when present) from a
     Section A sidecar file to the shared six-column posts, matching on post_id. */
  function mergeProfileFields(posts, sidecarRows) {
    var byId = {}, matched = 0, extra = ['language', 'user_bio', 'user_location', 'followers', 'joined'];
    sidecarRows.forEach(function (m) { if (m.post_id) byId[m.post_id] = m; });
    posts.forEach(function (p) {
      var m = byId[p.post_id];
      if (!m) return;
      matched++;
      extra.forEach(function (f) { if (!p[f] && m[f]) p[f] = m[f]; });
    });
    return matched;
  }

  function parseTs(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(s || ''));
    if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    var d = Date.parse(s);
    return isNaN(d) ? NaN : d;
  }

  /* ------------------------------------------------------------ Lexicons */

  // Order matters: the first matching rule wins. Free-text locations are never shown;
  // only the region label is. Accents are removed before matching.
  var REGION_RULES = [
    ['Latin America', /latin america|south america|central america|\b(brazil|brasil|argentina|mexico|colombia|chile|peru|bogota|buenos aires|sao paulo|rio de janeiro|lima|santiago|medellin)\b/i],
    ['South Asia', /south asia|\b(india|bharat|delhi|mumbai|bengaluru|bangalore|hyderabad|chennai|kolkata|pune|pakistan|karachi|lahore|islamabad|bangladesh|dhaka|sri lanka|colombo|nepal|kathmandu)\b/i],
    ['Europe', /europe|\b(uk|u\.k\.|united kingdom|england|scotland|london|manchester|germany|berlin|munich|france|paris|spain|madrid|barcelona|italy|rome|milan|netherlands|amsterdam|ireland|dublin|sweden|stockholm|poland|warsaw|portugal|lisbon|vienna|zurich|prague|oslo|copenhagen|brussels|athens|helsinki|budapest)\b/i],
    ['Middle East & Africa', /middle east|africa|\b(nigeria|lagos|kenya|nairobi|egypt|cairo|uae|dubai|saudi|riyadh|israel|turkey|istanbul|ghana|accra)\b/i],
    ['East Asia & Pacific', /asia pacific|apac|\b(china|japan|tokyo|korea|seoul|singapore|australia|sydney|melbourne|new zealand|indonesia|jakarta|philippines|manila|vietnam|thailand|hong kong|taiwan)\b/i],
    ['North America', /north america|\b(usa|u\.s\.a?\.?|united states|america|canada|toronto|vancouver|montreal|new york|nyc|california|texas|austin|chicago|los angeles|san francisco|seattle|boston)\b/i]
  ];

  var UNKNOWN_LOCATION = /^(not specified|unknown|n\/a|na|none|null|-|\?)$/i;

  function stripAccents(s) {
    try { return s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) { return s; }
  }

  function classifyRegion(location) {
    var s = String(location || '').trim();
    if (!s || UNKNOWN_LOCATION.test(s)) return null;
    s = stripAccents(s);
    for (var i = 0; i < REGION_RULES.length; i++) {
      if (REGION_RULES[i][1].test(s)) return REGION_RULES[i][0];
    }
    return 'Other region';
  }

  // A user can match several interests (multi-label). The first match is the "primary"
  // interest used to place the user in one cluster on the constellation.
  var INTEREST_RULES = [
    ['Technology & Software', /\b(tech|technology|software|developer|engineer(ing)?|coding|programm\w*|ai|data|gadgets?|digital|apps?|cyber\w*)\b|tecnolog|technologie|desenvolvedor|d[eé]veloppeur|entwickler|तकनीक/i],
    ['Marketing, Media & Brands', /\b(marketing|brands?|campaigns?|advertis\w*|media|content|journalis\w*|pr|creators?|influencers?|publicity|copywriter)\b|marca|marke|विज्ञापन/i],
    ['Business & Entrepreneurship', /\b(business|owner|founder|entrepreneur\w*|startups?|retail|shop|consultant|manager|sales|negocio)\b|व्यवसाय|empresa|empreendedor|fundador|fondateur|gr[uü]nder/i],
    ['Students & Education', /\b(students?|college|university|school|teacher|education|learning|learner|academic|undergrad\w*)\b|estudiante|estudante|[eé]tudiant|studentin|छात्र|शिक्षा/i],
    ['Sustainability & Design', /\b(sustainab\w*|climate|eco|green|design\w*|environment\w*)\b|sostenib|sustentab|diseño|durabilit/i],
    ['Consumer & Customer Experience', /\b(customers?|consumers?|shoppers?|products?|everyday|community|launch(es)?|experiences?|services?)\b|cliente|consumidor|kunde|ग्राहक/i],
    ['Finance & Economics', /\b(financ\w*|invest\w*|bank\w*|accounting|economics?|trading|crypto)\b|finanzas/i],
    ['Health & Wellness', /\b(health\w*|fitness|doctor|nurse|wellness|medical|yoga|nutrition|physio\w*)\b|salud|sa[uú]de/i],
    ['Entertainment & Sports', /\b(gaming|gamers?|gamer|music|films?|movies?|sports?|football|cricket|entertainment)\b|deporte|futebol|cin[eé]ma|musik|m[uú]sica/i],
    ['Travel & Food', /\b(travel\w*|food\w*|chef|coffee|restaurants?|cooking|recipes?|backpacker)\b|viajes|viagem|cocina/i]
  ];

  var ORG_RULE = /\b(official|verified)\b.*\b(account|brand|page)\b|\bbrand account\b|\bcustomer (care|support) team\b/i;

  function isOrganisation(bio) { return ORG_RULE.test(String(bio || '')); }

  function classifyInterests(bio) {
    var s = String(bio || '').trim(), out = [], i;
    if (!s) return out;
    for (i = 0; i < INTEREST_RULES.length; i++) {
      if (INTEREST_RULES[i][1].test(s)) out.push(INTEREST_RULES[i][0]);
    }
    return out;
  }

  // Life-stage cues from self-described bio text. These are weak signals about groups,
  // not statements about any person. Most profiles carry no cue.
  var AGE_LABELS = {
    young: 'Under 25 (student cues)',
    mid: '25 to 44 (working-professional cues)',
    senior: '45 and over (retirement or seniority cues)'
  };
  var AGE_SHORT = {};
  AGE_SHORT[AGE_LABELS.young] = 'under 25';
  AGE_SHORT[AGE_LABELS.mid] = '25 to 44';
  AGE_SHORT[AGE_LABELS.senior] = '45 and over';

  function classifyAge(bio) {
    var s = String(bio || '');
    if (!s.trim()) return null;
    if (/\b(retired|retiree|grandparent|grandmother|grandfather|boomer|pensioner|veteran)\b|jubilad/i.test(s)) return AGE_LABELS.senior;
    if (/\b(students?|undergrad\w*|college|university|high school|class of 20\d\d|gen ?z|freshman|sophomore|school)\b|estudiante|estudante|[eé]tudiant|studentin|छात्र/i.test(s)) return AGE_LABELS.young;
    if (/\b(professional|manager|founder|owner|engineer|developer|consultant|entrepreneur|director|executive|analyst|designer|parent|mom|dad|career|lead|strategist|coach)\b|profesional|fundador|fondateur/i.test(s)) return AGE_LABELS.mid;
    return null;
  }

  /* ---------------------------------------------------------- Bio vocabulary */

  var STOP = {};
  ('and the for with from that this here just its are who you your our about into than then they them one two all any can has have had was were not but also more most very too out over under new like love loves lover lovers when what where which while every each some many much other another their there these those been being does doing done make makes made get gets got going goes year years day days time times life way ways thing things people person interested sharing following discussing enjoys enjoy writes writing talks talking always weekend daily now still maybe mostly mainly often sometimes between during after before only even ever never opinions opinion own probably everything else first last later' +
    ' official account simulated campaign side class tiny good late night little real true best big small joys small' +
    ' because though really quite rather whose whom would could should might must will shall').split(' ').forEach(function (w) { STOP[w] = 1; });
  var SHORT_OK = { ai: 1, ml: 1, ux: 1, ui: 1, pr: 1 };

  /* Distinct words and #hashtags in a bio. Only the words are kept, never the bio itself. */
  function bioWords(bio) {
    var out = {}, list = [];
    var m = String(bio || '').toLowerCase().match(/#?[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || [];
    m.forEach(function (w) {
      w = w.replace(/['’]s$/, '').replace(/[-'’]+$/, '');
      var plain = w.replace(/^#/, '');
      if (!plain || /^\d+$/.test(plain)) return;
      if (plain.length < 3 && !SHORT_OK[plain]) return;
      if (STOP[plain]) return;
      if (!out[w]) { out[w] = 1; list.push(w); }
    });
    return list;
  }

  /* ------------------------------------------------------------ Language */

  // Fallback when a post has no language code: guess the writing script.
  function inferScript(text) {
    var t = String(text || '');
    if (/[ऀ-ॿ]/.test(t)) return /[A-Za-z]{3,}/.test(t) ? 'en-hi' : 'hi';
    if (/[ঀ-৿]/.test(t)) return 'bn';
    if (/[஀-௿]/.test(t)) return 'ta';
    if (/[؀-ۿ]/.test(t)) return 'ar';
    if (/[Ѐ-ӿ]/.test(t)) return 'ru';
    if (/[぀-ヿ]/.test(t)) return 'ja';
    if (/[가-힯]/.test(t)) return 'ko';
    if (/[一-鿿]/.test(t)) return 'zh';
    if (/[¿¡ñ]/.test(t)) return 'es';
    return '';
  }

  var LANG_NAMES = {
    'en': 'English', 'hi': 'Hindi', 'es': 'Spanish',
    'en-hi': 'Hinglish (English + Hindi)', 'en-es': 'Spanglish (English + Spanish)'
  };

  function languageLabel(code) {
    code = String(code || '').trim().toLowerCase();
    if (!code) return 'Undetermined';
    if (LANG_NAMES[code]) return LANG_NAMES[code];
    if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(code)) return 'Other';
    try {
      if (typeof Intl !== 'undefined' && Intl.DisplayNames) {
        var name = new Intl.DisplayNames(['en'], { type: 'language' }).of(code);
        if (name && name.toLowerCase() !== code) return name;
      }
    } catch (e) { /* fall through */ }
    return code.toUpperCase();
  }

  /* ------------------------------------------------------- Reach and tenure */

  var REACH_TIERS = ['Under 100', '100 to 1K', '1K to 10K', '10K to 100K', '100K and up'];
  function reachTier(n) {
    if (!isFinite(n) || n < 0) return null;
    return n < 100 ? REACH_TIERS[0] : n < 1000 ? REACH_TIERS[1] : n < 10000 ? REACH_TIERS[2] : n < 100000 ? REACH_TIERS[3] : REACH_TIERS[4];
  }
  var COHORTS = ['2015 or earlier', '2016 to 2017', '2018 to 2019', '2020 to 2021', '2022 to 2023', '2024 to now'];
  function cohortOf(year) {
    if (!isFinite(year) || year < 1990 || year > 2100) return null;
    return year <= 2015 ? COHORTS[0] : year <= 2017 ? COHORTS[1] : year <= 2019 ? COHORTS[2] : year <= 2021 ? COHORTS[3] : year <= 2023 ? COHORTS[4] : COHORTS[5];
  }

  /* ----------------------------------------------------------- Aggregation */

  function inc(map, key, by) { map.set(key, (map.get(key) || 0) + (by || 1)); }

  function modeOf(map) {
    var best = '', bestN = 0;
    map.forEach(function (n, key) { if (n > bestN || (n === bestN && key < best)) { best = key; bestN = n; } });
    return best;
  }

  function pct(n, total) { return total ? Math.round((1000 * n) / total) / 10 : 0; }

  function emptyHours() { var a = [], i; for (i = 0; i < 24; i++) a.push(0); return a; }

  /* One internal record per anonymised user_id. Only derived labels are kept. */
  function buildProfiles(rows) {
    var users = new Map();
    rows.forEach(function (r) {
      var id = r.user_id || ('post:' + r.post_id);
      var u = users.get(id);
      if (!u) {
        u = { platform: r.platform || 'Unknown', bio: '', loc: '', langs: new Map(), scripts: new Map(), first: Infinity, posts: 0, hours: emptyHours(), followers: NaN, joined: NaN };
        users.set(id, u);
      }
      u.posts++;
      if (!u.bio && r.user_bio) u.bio = String(r.user_bio).trim();
      if (!u.loc && r.user_location) u.loc = String(r.user_location).trim();
      if (!isFinite(u.followers) && r.followers !== undefined && r.followers !== '') {
        var f = Number(String(r.followers).replace(/[, ]/g, ''));
        if (isFinite(f)) u.followers = f;
      }
      if (!isFinite(u.joined) && r.joined) { var y = parseInt(String(r.joined).slice(0, 4), 10); if (isFinite(y)) u.joined = y; }
      var code = String(r.language || '').trim().toLowerCase();
      if (code) { inc(u.langs, code); }
      else { var g = inferScript(r.text); if (g) inc(u.scripts, g); }
      var ts = parseTs(r.timestamp);
      if (!isNaN(ts)) {
        if (ts < u.first) u.first = ts;
        u.hours[new Date(ts).getUTCHours()]++;
      }
    });
    var out = [];
    users.forEach(function (u) {
      var code = u.langs.size ? modeOf(u.langs) : modeOf(u.scripts);
      var interests = classifyInterests(u.bio);
      out.push({
        platform: u.platform,
        first: isFinite(u.first) ? u.first : NaN,
        posts: u.posts,
        hours: u.hours,
        org: isOrganisation(u.bio),
        hasBio: !!u.bio,
        declaredLang: u.langs.size > 0,
        code: code,
        lang: code ? languageLabel(code) : null,
        region: classifyRegion(u.loc),
        interests: interests,
        primaryInterest: interests[0] || null,
        age: classifyAge(u.bio),
        words: new Set(bioWords(u.bio)),
        tier: reachTier(u.followers),
        cohort: cohortOf(u.joined)
      });
    });
    return out;
  }

  /* Turn a Map(label -> users) into a privacy-safe distribution, largest first. */
  function makeDist(counter, unknown, k, base) {
    // base = number of profiles with a known value. Pass it for multi-label data
    // (interests), where the sum of counts is larger than the number of profiles.
    var items = [], known = 0, smallSum = 0, smallCount = 0;
    counter.forEach(function (n, label) { known += n; items.push({ label: label, n: n }); });
    if (base !== undefined) known = base;
    items.sort(function (a, b) { return b.n - a.n || (a.label < b.label ? -1 : 1); });
    var shown = [];
    items.forEach(function (it) {
      if (it.n >= k) { shown.push(it); } else { smallSum += it.n; smallCount++; }
    });
    if (smallCount) shown.push({ label: OTHER_LABEL, n: smallSum, grouped: true });
    shown.forEach(function (it) {
      it.share = pct(it.n, known);
      it.hidden = it.n < k;          // exact size hidden in the UI and exports
    });
    return { items: shown, known: known, unknown: unknown || 0 };
  }

  /* Like makeDist, but keeps a fixed order (tiers, cohorts) and shows every step. */
  function makeOrdered(order, counter, unknown, k) {
    var known = 0;
    order.forEach(function (l) { known += counter.get(l) || 0; });
    var items = order.map(function (l) {
      var n = counter.get(l) || 0;
      return { label: l, n: n, share: pct(n, known), hidden: n > 0 && n < k };
    });
    return { items: items, known: known, unknown: unknown || 0 };
  }

  function peakHour(hours) {
    var best = 0, i;
    for (i = 1; i < 24; i++) if (hours[i] > hours[best]) best = i;
    return best;
  }

  function aggregate(profiles, k) {
    k = k || K_MIN;
    var langC = new Map(), regC = new Map(), intC = new Map(), ageC = new Map(), segC = new Map(),
      tierC = new Map(), cohC = new Map(), wordC = new Map();
    var langUnk = 0, regUnk = 0, intUnk = 0, ageUnk = 0, tierUnk = 0, cohUnk = 0;
    var org = 0, audience = 0, withBio = 0, withLoc = 0, withLang = 0, nonEnglish = 0, langKnown = 0, posts = 0, withWords = 0;
    var hours = emptyHours();

    profiles.forEach(function (p) {
      if (p.org) { org++; return; }                      // brand accounts are not audience
      audience++; posts += p.posts;
      if (p.hasBio) withBio++;
      if (p.region) withLoc++;
      if (p.declaredLang) withLang++;
      for (var h = 0; h < 24; h++) hours[h] += p.hours[h];

      if (p.lang) { inc(langC, p.lang); langKnown++; if (p.code !== 'en') nonEnglish++; } else { langUnk++; }
      if (p.region) inc(regC, p.region); else regUnk++;
      if (p.interests.length) p.interests.forEach(function (i) { inc(intC, i); }); else intUnk++;
      if (p.age) inc(ageC, p.age); else ageUnk++;
      if (p.tier) inc(tierC, p.tier); else tierUnk++;
      if (p.cohort) inc(cohC, p.cohort); else cohUnk++;
      if (p.words.size) { withWords++; p.words.forEach(function (w) { inc(wordC, w); }); }

      if (p.region && p.interests.length) {
        p.interests.forEach(function (i) {
          var key = p.region + '\u0001' + i;
          var seg = segC.get(key);
          if (!seg) { seg = { region: p.region, interest: i, n: 0, langs: new Map(), plats: new Map(), words: new Map(), hours: emptyHours() }; segC.set(key, seg); }
          seg.n++;
          if (p.lang) inc(seg.langs, p.lang);
          inc(seg.plats, p.platform);
          p.words.forEach(function (w) { inc(seg.words, w); });
          for (var j = 0; j < 24; j++) seg.hours[j] += p.hours[j];
        });
      }
    });

    var segments = [];
    segC.forEach(function (s) {
      if (s.n < k) return;
      var sig = [];
      s.words.forEach(function (n, w) { if (n >= k) sig.push([w, n]); });
      sig.sort(function (a, b) { return b[1] - a[1] || (a[0] < b[0] ? -1 : 1); });
      segments.push({
        region: s.region, interest: s.interest, n: s.n,
        language: modeOf(s.langs) || 'Undetermined', platform: modeOf(s.plats),
        peak: peakHour(s.hours), words: sig.slice(0, 3).map(function (x) { return x[0]; })
      });
    });
    segments.sort(function (a, b) { return b.n - a.n || (a.region + a.interest < b.region + b.interest ? -1 : 1); });

    var words = [];
    wordC.forEach(function (n, w) { if (n >= k) words.push({ word: w, n: n, share: pct(n, withWords) }); });
    words.sort(function (a, b) { return b.n - a.n || (a.word < b.word ? -1 : 1); });

    return {
      posts: posts,
      profiles: profiles.length,
      organisations: org,
      audience: audience,
      coverage: { bio: pct(withBio, audience), location: pct(withLoc, audience), language: pct(withLang, audience) },
      nonEnglishShare: pct(nonEnglish, langKnown),
      language: makeDist(langC, langUnk, k),
      region: makeDist(regC, regUnk, k),
      interest: makeDist(intC, intUnk, k, audience - intUnk),
      age: makeDist(ageC, ageUnk, k),
      reach: makeOrdered(REACH_TIERS, tierC, tierUnk, k),
      tenure: makeOrdered(COHORTS, cohC, cohUnk, k),
      hours: hours,
      words: words.slice(0, 48),
      wordBase: withWords,
      segments: segments.slice(0, 8),
      k: k
    };
  }

  function analyse(rows, k) {
    var s = aggregate(buildProfiles(rows), k);
    s.posts = rows.length;
    return s;
  }

  /* Sum posting hours for any set of profiles (used for the rhythm rows). */
  function hourSums(profiles) {
    var h = emptyHours();
    profiles.forEach(function (p) { if (!p.org) for (var i = 0; i < 24; i++) h[i] += p.hours[i]; });
    return h;
  }

  /* Group profiles for the constellation. lens: language | region | interest | age | platform.
     Groups with fewer than k profiles are merged into one "Other" group. */
  function groupValue(p, lens) {
    if (lens === 'language') return p.lang || NA_LABEL;
    if (lens === 'region') return p.region || NA_LABEL;
    if (lens === 'interest') return p.primaryInterest || NA_LABEL;
    if (lens === 'age') return p.age || NA_LABEL;
    return p.platform || 'Unknown';
  }

  function mapGroups(profiles, lens, k) {
    k = k || K_MIN;
    var counts = new Map(), i;
    for (i = 0; i < profiles.length; i++) inc(counts, groupValue(profiles[i], lens));
    var labels = new Array(profiles.length), merged = new Map();
    for (i = 0; i < profiles.length; i++) {
      var v = groupValue(profiles[i], lens);
      labels[i] = counts.get(v) >= k ? v : OTHER_LABEL;
      inc(merged, labels[i]);
    }
    var groups = [];
    merged.forEach(function (n, label) { groups.push({ label: label, n: n }); });
    groups.sort(function (a, b) {
      var ao = (a.label === OTHER_LABEL || a.label === NA_LABEL) ? 1 : 0, bo = (b.label === OTHER_LABEL || b.label === NA_LABEL) ? 1 : 0;
      return ao - bo || b.n - a.n || (a.label < b.label ? -1 : 1);
    });
    return { labels: labels, groups: groups };
  }

  function summarize(rows, platform, k) {
    k = k || K_MIN;
    var platforms = {};
    rows.forEach(function (r) { platforms[r.platform || 'Unknown'] = 1; });
    var names = Object.keys(platforms).sort();
    var scope = (platform && platform !== 'all') ? rows.filter(function (r) { return (r.platform || 'Unknown') === platform; }) : rows;
    var out = analyse(scope, k);
    out.platforms = names;
    out.byPlatform = {};
    names.forEach(function (p) {
      var sub = analyse(rows.filter(function (r) { return (r.platform || 'Unknown') === p; }), k);
      out.byPlatform[p] = { audience: sub.audience, language: sub.language, region: sub.region, interest: sub.interest };
    });
    out.notes = fieldNotes(out);
    return out;
  }

  /* ------------------------------------------------------------ Field notes */
  // Short, specific observations written from the numbers on screen. Each note has a
  // kicker (what it is about), a big figure, a headline and one supporting line.

  function topItems(d) { return d.items.filter(function (i) { return !i.grouped; }); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function busiestWindow(hours, width) {
    var total = 0, i, best = 0, bestSum = -1, quiet = 0;
    for (i = 0; i < 24; i++) total += hours[i];
    for (i = 0; i < 24; i++) {
      var s = 0, j;
      for (j = 0; j < width; j++) s += hours[(i + j) % 24];
      if (s > bestSum) { bestSum = s; best = i; }
      if (hours[i] < hours[quiet]) quiet = i;
    }
    return { start: best, share: pct(bestSum, total), quiet: quiet, total: total };
  }

  function fieldNotes(s) {
    var notes = [], k = s.k || K_MIN;
    if (!s.audience) return notes;

    var reg = topItems(s.region);
    if (reg.length && reg[0].share < 99.9) {
      notes.push({
        key: 'territory', kicker: 'Home turf', fig: reg[0].share, unit: '%', ring: reg[0].share, headline: reg[0].label,
        text: (reg[1] ? reg[1].label + ' follows at ' + reg[1].share + '%. ' : '') + s.coverage.location + '% of profiles say where they are.'
      });
    }

    var langs = topItems(s.language), beyond = langs.filter(function (i) { return i.label !== 'English'; });
    if (s.language.known && beyond.length && s.nonEnglishShare > 0 && s.nonEnglishShare < 100) {
      notes.push({
        key: 'tongues', kicker: 'Beyond English', fig: s.nonEnglishShare, unit: '%', ring: s.nonEnglishShare, headline: 'write in another tongue',
        text: beyond[0].label + ' leads that chorus at ' + beyond[0].share + '%, among ' + langs.length + (s.language.items.some(function (i) { return i.grouped; }) ? '+' : '') + ' languages heard.'
      });
    }

    var ints = topItems(s.interest);
    if (ints.length && ints[0].share < 99.9) {
      notes.push({
        key: 'calling', kicker: 'Loudest calling', fig: ints[0].share, unit: '%', ring: ints[0].share, headline: ints[0].label,
        text: s.interest.unknown ? s.interest.unknown + ' profiles leave their work and hobbies unsaid.' : 'Every bio gives at least one clue.'
      });
    }

    var hrTotal = 0; s.hours.forEach(function (v) { hrTotal += v; });
    if (hrTotal >= k * 3) {
      var w = busiestWindow(s.hours, 3);
      notes.push({
        key: 'rhythm', kicker: 'Rush hour', fig: w.share, unit: '%', ring: w.share,
        headline: 'of posts land between ' + pad2(w.start) + ':00 and ' + pad2((w.start + 3) % 24) + ':00 UTC',
        text: 'The sky is quietest around ' + pad2(w.quiet) + ':00 UTC.'
      });
    }

    if (s.reach.known >= k) {
      var small = s.reach.items[0].n + s.reach.items[1].n, big = s.reach.items[3].n + s.reach.items[4].n, huge = s.reach.items[4].n;
      notes.push({
        key: 'reach', kicker: 'Small voices', fig: pct(small, s.reach.known), unit: '%', ring: pct(small, s.reach.known), headline: 'have fewer than 1,000 followers',
        text: pct(big, s.reach.known) + '% cross 10K' + (huge >= k ? ', and ' + pct(huge, s.reach.known) + '% pass 100K.' : '.')
      });
    }

    if (s.tenure.known >= k) {
      var fresh = s.tenure.items[5].n, old = s.tenure.items[0].n;
      notes.push({
        key: 'tenure', kicker: 'Fresh arrivals', fig: pct(fresh, s.tenure.known), unit: '%', ring: pct(fresh, s.tenure.known), headline: 'opened their account in 2024 or later',
        text: pct(old, s.tenure.known) + '% have been around since 2015 or earlier.'
      });
    }

    if (s.words.length) {
      var wd = s.words[0], wd2 = s.words[1];
      notes.push({
        key: 'vocab', kicker: 'Signature word', fig: wd.share, unit: '%', ring: wd.share, headline: 'of bios say “' + wd.word + '”',
        text: wd2 ? 'The runner-up is “' + wd2.word + '”. Tap any word in the vocabulary plate to light up its owners.' : 'Tap it in the vocabulary plate to light up its owners.'
      });
    }

    var ages = topItems(s.age);
    if (ages.length && s.age.known >= k) {
      notes.push({
        key: 'seasons', kicker: 'Life seasons', fig: ages[0].share, unit: '%', ring: ages[0].share, headline: 'of bios with a life-stage hint point to ages ' + (AGE_SHORT[ages[0].label] || ages[0].label),
        text: s.age.unknown + ' bios say nothing about it, so treat this as a faint signal.'
      });
    }
    return notes;
  }

  /* Plain sentences for the saved summary. */
  function insights(s) { return fieldNotes(s).map(function (n) { return n.kicker + ': ' + n.fig + n.unit + ' ' + n.headline + '. ' + n.text; }); }

  /* Flat rows for "Save this view" and make_summary.js. */
  function toCsvRows(s) {
    var rows = [];
    function add(dimension, d) {
      d.items.forEach(function (it) {
        rows.push([dimension, it.label, it.hidden ? '<' + s.k : it.n, it.share]);
      });
      rows.push([dimension, NA_LABEL, d.unknown, '']);
    }
    add('language', s.language);
    add('region', s.region);
    add('professional_interest', s.interest);
    add('age_stage_cue', s.age);
    add('reach_tier', s.reach);
    add('account_cohort', s.tenure);
    s.words.slice(0, 30).forEach(function (w) { rows.push(['bio_word', w.word, w.n, w.share]); });
    s.hours.forEach(function (v, h) { rows.push(['posts_by_hour_utc', pad2(h), v, '']); });
    s.segments.forEach(function (g) { rows.push(['segment', g.region + ' / ' + g.interest + ' / ' + g.language, g.n, '']); });
    return [['dimension', 'category', 'users', 'share_percent']].concat(rows);
  }

  function csvText(table) {
    return table.map(function (r) {
      return r.map(function (v) {
        v = String(v);
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(',');
    }).join('\n') + '\n';
  }

  var api = {
    K_MIN: K_MIN, OTHER_LABEL: OTHER_LABEL, NA_LABEL: NA_LABEL, REACH_TIERS: REACH_TIERS, COHORTS: COHORTS, AGE_SHORT: AGE_SHORT,
    parseCSV: parseCSV, hasProfileColumns: hasProfileColumns, mergeProfileFields: mergeProfileFields,
    classifyRegion: classifyRegion, classifyInterests: classifyInterests, classifyAge: classifyAge,
    isOrganisation: isOrganisation, inferScript: inferScript, languageLabel: languageLabel, bioWords: bioWords,
    buildProfiles: buildProfiles, aggregate: aggregate, analyse: analyse, mapGroups: mapGroups, hourSums: hourSums,
    groupValue: groupValue, summarize: summarize, fieldNotes: fieldNotes, insights: insights, peakHour: peakHour,
    toCsvRows: toCsvRows, csvText: csvText
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  root.Profiler = api;
})(typeof window !== 'undefined' ? window : globalThis);
