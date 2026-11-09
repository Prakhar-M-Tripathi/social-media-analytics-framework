/* Section C: Demographic Profiling, analysis logic.
 *
 * Plain JavaScript with no dependencies. It runs in the browser (index.html) and in
 * Node (make_summary.js) so the same code produces the page and the saved CSV.
 *
 * Everything here works on AGGREGATES. Per-user results are never returned or shown.
 * Groups smaller than K_MIN users are merged into "Other (grouped for privacy)".
 * All estimates come from public, self-described indicators (bio text, location
 * text, language codes, writing script) using transparent keyword rules.
 */
(function (root) {
  'use strict';

  var K_MIN = 5;

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

  /* Add language / user_bio / user_location from Section A sidecar files to the shared
     six-column posts, matching on post_id. Returns how many posts were enriched. */
  function mergeProfileFields(posts, sidecarRows) {
    var byId = {}, matched = 0;
    sidecarRows.forEach(function (m) { if (m.post_id) byId[m.post_id] = m; });
    posts.forEach(function (p) {
      var m = byId[p.post_id];
      if (!m) return;
      matched++;
      if (!p.language) p.language = m.language || '';
      if (!p.user_bio) p.user_bio = m.user_bio || '';
      if (!p.user_location) p.user_location = m.user_location || '';
    });
    return matched;
  }

  /* ------------------------------------------------------------ Lexicons */

  // Order matters: the first matching rule wins. Free-text locations are never shown;
  // only the region label is.
  var REGION_RULES = [
    ['Latin America', /latin america|south america|central america|\b(brazil|brasil|argentina|mexico|colombia|chile|peru|bogota|buenos aires|sao paulo|lima|santiago)\b/i],
    ['South Asia', /south asia|\b(india|bharat|delhi|mumbai|bengaluru|bangalore|hyderabad|chennai|kolkata|pune|pakistan|karachi|lahore|bangladesh|dhaka|sri lanka|colombo|nepal|kathmandu)\b/i],
    ['Europe', /europe|\b(uk|u\.k\.|united kingdom|england|scotland|london|germany|berlin|france|paris|spain|madrid|barcelona|italy|rome|netherlands|amsterdam|ireland|dublin|sweden|poland|portugal|lisbon)\b/i],
    ['Middle East & Africa', /middle east|africa|\b(nigeria|lagos|kenya|nairobi|egypt|cairo|uae|dubai|saudi|riyadh|israel|turkey|istanbul)\b/i],
    ['East Asia & Pacific', /asia pacific|apac|\b(china|japan|tokyo|korea|seoul|singapore|australia|sydney|melbourne|new zealand|indonesia|philippines|manila|vietnam|thailand)\b/i],
    ['North America', /north america|\b(usa|u\.s\.a?\.?|united states|america|canada|toronto|vancouver|new york|nyc|california|texas|chicago|los angeles|san francisco|seattle|boston)\b/i]
  ];

  var UNKNOWN_LOCATION = /^(not specified|unknown|n\/a|na|none|null|-|\?)$/i;

  function classifyRegion(location) {
    var s = String(location || '').trim();
    if (!s || UNKNOWN_LOCATION.test(s)) return null;
    for (var i = 0; i < REGION_RULES.length; i++) {
      if (REGION_RULES[i][1].test(s)) return REGION_RULES[i][0];
    }
    return 'Other region';
  }

  // A user can match several interests (multi-label).
  var INTEREST_RULES = [
    ['Technology & Software', /\b(tech|technology|software|developer|engineer(ing)?|coding|programm\w*|ai|data|gadgets?|digital|apps?|cyber\w*)\b|tecnolog/i],
    ['Marketing, Media & Brands', /\b(marketing|brands?|campaigns?|advertis\w*|media|content|journalis\w*|pr|creators?|influencers?|publicity)\b|marca|विज्ञापन/i],
    ['Business & Entrepreneurship', /\b(business|owner|founder|entrepreneur\w*|startups?|retail|shop|consultant|manager|sales|negocio)\b|व्यवसाय|empresa/i],
    ['Students & Education', /\b(students?|college|university|school|teacher|education|learning|academic|undergrad\w*)\b|estudiante|छात्र|शिक्षा/i],
    ['Sustainability & Design', /\b(sustainab\w*|climate|eco|green|design\w*|environment\w*)\b|sostenib|diseño/i],
    ['Consumer & Customer Experience', /\b(customers?|consumers?|shoppers?|products?|everyday|community|launch(es)?|experiences?|services?)\b|cliente|consumidor|ग्राहक/i],
    ['Finance & Economics', /\b(financ\w*|invest\w*|bank\w*|accounting|economics?|trading|crypto)\b|finanzas/i],
    ['Health & Wellness', /\b(health\w*|fitness|doctor|nurse|wellness|medical|yoga)\b|salud/i],
    ['Entertainment & Sports', /\b(gaming|gamers?|music|films?|movies?|sports?|football|cricket|entertainment)\b|deporte/i],
    ['Travel & Food', /\b(travel\w*|food\w*|chef|coffee|restaurants?|cooking)\b|viajes|cocina/i]
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

  function classifyAge(bio) {
    var s = String(bio || '');
    if (!s.trim()) return null;
    if (/\b(retired|retiree|grandparent|grandmother|grandfather|boomer|pensioner|veteran)\b|jubilad/i.test(s)) return AGE_LABELS.senior;
    if (/\b(students?|undergrad\w*|college|university|high school|class of 20\d\d|gen ?z|freshman|sophomore|school)\b|estudiante|छात्र/i.test(s)) return AGE_LABELS.young;
    if (/\b(professional|manager|founder|owner|engineer|developer|consultant|entrepreneur|director|executive|analyst|designer|parent|career)\b|profesional/i.test(s)) return AGE_LABELS.mid;
    return null;
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

  function isEnglishOnly(code) { return code === 'en'; }

  /* ----------------------------------------------------------- Aggregation */

  function inc(map, key, by) { map.set(key, (map.get(key) || 0) + (by || 1)); }

  function modeOf(map) {
    var best = '', bestN = 0;
    map.forEach(function (n, key) { if (n > bestN || (n === bestN && key < best)) { best = key; bestN = n; } });
    return best;
  }

  function pct(n, total) { return total ? Math.round((1000 * n) / total) / 10 : 0; }

  /* Turn a Map(label -> users) into a privacy-safe distribution. */
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
    if (smallCount) shown.push({ label: 'Other (grouped for privacy)', n: smallSum, grouped: true });
    shown.forEach(function (it) {
      it.share = pct(it.n, known);
      it.hidden = it.n < k;          // exact size hidden in the UI and exports
    });
    return { items: shown, known: known, unknown: unknown || 0 };
  }

  function analyse(rows, k) {
    k = k || K_MIN;
    var users = new Map();
    rows.forEach(function (r) {
      var id = r.user_id || ('post:' + r.post_id);
      var u = users.get(id);
      if (!u) {
        u = { platform: r.platform || 'Unknown', bio: '', loc: '', langs: new Map(), scripts: new Map() };
        users.set(id, u);
      }
      if (!u.bio && r.user_bio) u.bio = String(r.user_bio).trim();
      if (!u.loc && r.user_location) u.loc = String(r.user_location).trim();
      var code = String(r.language || '').trim().toLowerCase();
      if (code) { inc(u.langs, code); }
      else { var g = inferScript(r.text); if (g) inc(u.scripts, g); }
    });

    var langC = new Map(), regC = new Map(), intC = new Map(), ageC = new Map(), segC = new Map();
    var langUnk = 0, regUnk = 0, intUnk = 0, ageUnk = 0;
    var org = 0, audience = 0, withBio = 0, withLoc = 0, withLangDeclared = 0, nonEnglish = 0, langKnown = 0;

    users.forEach(function (u) {
      if (isOrganisation(u.bio)) { org++; return; }       // brand accounts are not audience
      audience++;
      if (u.bio) withBio++;
      var region = classifyRegion(u.loc);
      if (region) withLoc++;
      var code = u.langs.size ? modeOf(u.langs) : modeOf(u.scripts);
      if (u.langs.size) withLangDeclared++;

      if (code) { inc(langC, languageLabel(code)); langKnown++; if (!isEnglishOnly(code)) nonEnglish++; }
      else { langUnk++; }

      if (region) inc(regC, region); else regUnk++;

      var interests = classifyInterests(u.bio);
      if (interests.length) interests.forEach(function (i) { inc(intC, i); }); else intUnk++;

      var age = classifyAge(u.bio);
      if (age) inc(ageC, age); else ageUnk++;

      if (region && interests.length) {
        interests.forEach(function (i) {
          var key = region + '\u0001' + i;
          var seg = segC.get(key);
          if (!seg) { seg = { region: region, interest: i, n: 0, langs: new Map() }; segC.set(key, seg); }
          seg.n++;
          if (code) inc(seg.langs, languageLabel(code));
        });
      }
    });

    var segments = [];
    segC.forEach(function (s) {
      if (s.n >= k) segments.push({ region: s.region, interest: s.interest, n: s.n, language: modeOf(s.langs) || 'Undetermined' });
    });
    segments.sort(function (a, b) { return b.n - a.n || (a.region + a.interest < b.region + b.interest ? -1 : 1); });

    return {
      posts: rows.length,
      profiles: users.size,
      organisations: org,
      audience: audience,
      coverage: {
        bio: pct(withBio, audience),
        location: pct(withLoc, audience),
        language: pct(withLangDeclared, audience)
      },
      nonEnglishShare: pct(nonEnglish, langKnown),
      language: makeDist(langC, langUnk, k),
      region: makeDist(regC, regUnk, k),
      interest: makeDist(intC, intUnk, k, audience - intUnk),
      age: makeDist(ageC, ageUnk, k),
      segments: segments.slice(0, 8),
      k: k
    };
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
    out.insights = insights(out);
    return out;
  }

  function insights(s) {
    var lines = [];
    if (!s.audience) return ['No audience profiles found in this selection.'];
    var topReg = s.region.items.filter(function (i) { return !i.grouped; })[0];
    if (topReg) lines.push(topReg.label + ' is the largest region, at ' + topReg.share + '% of profiles that state a location (' + s.coverage.location + '% of profiles do).');
    var topLang = s.language.items.filter(function (i) { return !i.grouped; })[0];
    if (topLang) lines.push(topLang.label + ' is the most common language (' + topLang.share + '%). ' + s.nonEnglishShare + '% of profiles with a known language use something other than plain English.');
    var topInt = s.interest.items.filter(function (i) { return !i.grouped; })[0];
    if (topInt) lines.push('The leading professional interest is ' + topInt.label + ' (' + topInt.share + '% of profiles with an interest cue; users can have more than one).');
    if (s.segments.length) lines.push('Largest audience segment: ' + s.segments[0].interest + ' in ' + s.segments[0].region + ', mostly ' + s.segments[0].language + '.');
    if (s.organisations) lines.push(s.organisations + ' brand or official accounts were excluded from the audience figures.');
    return lines;
  }

  /* Flat rows for the "Export aggregates" button and make_summary.js. */
  function toCsvRows(s) {
    var rows = [];
    function add(dimension, d) {
      d.items.forEach(function (it) {
        rows.push([dimension, it.label, it.hidden ? '<' + s.k : it.n, it.share]);
      });
      rows.push([dimension, 'Not available', d.unknown, '']);
    }
    add('language', s.language);
    add('region', s.region);
    add('professional_interest', s.interest);
    add('age_stage_cue', s.age);
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
    K_MIN: K_MIN, parseCSV: parseCSV, hasProfileColumns: hasProfileColumns,
    mergeProfileFields: mergeProfileFields, classifyRegion: classifyRegion,
    classifyInterests: classifyInterests, classifyAge: classifyAge, isOrganisation: isOrganisation,
    inferScript: inferScript, languageLabel: languageLabel, analyse: analyse,
    summarize: summarize, toCsvRows: toCsvRows, csvText: csvText
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  root.Profiler = api;
})(typeof window !== 'undefined' ? window : globalThis);
