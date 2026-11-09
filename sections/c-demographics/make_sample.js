// Generates a rich SYNTHETIC audience dataset for Section C.
//   node make_sample.js
// Writes sample/audience_sample.csv (the real file) and sample/audience_sample.js
// (the same CSV as a script, so the page also works when opened by double-click).
//
// Every profile, bio, location, follower count and post is fictional. The file follows the
// shared data contract (six required columns) plus optional profile columns:
//   language, user_bio, user_location, followers, joined
// Posting hours follow each profile's local time zone, so activity rhythms differ by region.
// The generator is seeded, so running it again gives the same file.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let seed = 20261109;
function rnd() { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
function pick(a) { return a[Math.floor(rnd() * a.length)]; }
function weighted(obj) { const e = Object.entries(obj); let r = rnd() * e.reduce((s, x) => s + x[1], 0); for (const [k, w] of e) { r -= w; if (r <= 0) return k; } return e[e.length - 1][0]; }
function gauss() { return Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd()); }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/* ------------------------------ places and languages ------------------------------ */
// [city text as people write it, UTC offset in hours]
const REGIONS = {
  'North America': { cities: [['New York, USA', -5], ['Toronto, Canada', -5], ['Austin, Texas', -6], ['San Francisco, CA', -8], ['Chicago, USA', -6], ['Vancouver, Canada', -8], ['Seattle, USA', -8], ['Boston, USA', -5], ['Los Angeles', -8], ['Montreal, Canada', -5]], langs: { en: 0.86, es: 0.06, 'en-es': 0.06, fr: 0.02 } },
  'Latin America': { cities: [['São Paulo, Brazil', -3], ['Mexico City, Mexico', -6], ['Bogotá, Colombia', -5], ['Buenos Aires, Argentina', -3], ['Lima, Peru', -5], ['Santiago, Chile', -4], ['Rio de Janeiro, Brazil', -3], ['Medellín, Colombia', -5]], langs: { es: 0.5, 'en-es': 0.14, pt: 0.26, en: 0.1 } },
  'Europe': { cities: [['London, UK', 0], ['Berlin, Germany', 1], ['Madrid, Spain', 1], ['Paris, France', 1], ['Amsterdam', 1], ['Dublin, Ireland', 0], ['Lisbon, Portugal', 0], ['Stockholm', 1], ['Milan, Italy', 1], ['Warsaw', 1], ['Vienna', 1], ['Manchester, England', 0]], langs: { en: 0.46, es: 0.1, de: 0.13, fr: 0.12, it: 0.06, pt: 0.04, 'en-es': 0.03, pl: 0.03, sv: 0.03 } },
  'South Asia': { cities: [['Mumbai, India', 5.5], ['Delhi', 5.5], ['Bengaluru, India', 5.5], ['Hyderabad', 5.5], ['Pune, India', 5.5], ['Chennai', 5.5], ['Kolkata', 5.5], ['Karachi, Pakistan', 5], ['Lahore', 5], ['Dhaka, Bangladesh', 6], ['Colombo, Sri Lanka', 5.5], ['Kathmandu, Nepal', 5.75]], langs: { en: 0.36, hi: 0.2, 'en-hi': 0.3, bn: 0.05, ta: 0.05, ur: 0.04 } },
  'Middle East & Africa': { cities: [['Lagos, Nigeria', 1], ['Nairobi, Kenya', 3], ['Cairo, Egypt', 2], ['Dubai, UAE', 4], ['Riyadh, Saudi Arabia', 3], ['Cape Town, South Africa', 2], ['Istanbul', 3], ['Accra, Ghana', 0]], langs: { en: 0.5, ar: 0.28, fr: 0.07, sw: 0.06, tr: 0.09 } },
  'East Asia & Pacific': { cities: [['Singapore', 8], ['Sydney, Australia', 11], ['Tokyo, Japan', 9], ['Seoul, Korea', 9], ['Manila, Philippines', 8], ['Melbourne, Australia', 11], ['Jakarta, Indonesia', 7], ['Hong Kong', 8]], langs: { en: 0.5, ja: 0.14, ko: 0.1, zh: 0.1, id: 0.08, fil: 0.08 } }
};

/* ------------------------------ platforms ------------------------------ */
// hours = local-time peaks [mean, sd, weight]; reach = log10 follower mean
const PLATFORMS = {
  X:         { users: 170, reach: 2.7, hours: [[8.5, 1.3, 0.22], [13, 1.6, 0.26], [21.5, 2.0, 0.52]], regions: { 'North America': 0.32, Europe: 0.26, 'South Asia': 0.16, 'East Asia & Pacific': 0.1, 'Latin America': 0.08, 'Middle East & Africa': 0.08 }, interests: { tech: 22, marketing: 22, business: 14, consumer: 10, students: 7, finance: 9, sustain: 4, ent: 6, health: 2, travel: 4 } },
  Telegram:  { users: 120, reach: 2.4, hours: [[10, 2.0, 0.18], [15, 2.2, 0.2], [23.2, 2.3, 0.62]], regions: { 'South Asia': 0.34, 'Middle East & Africa': 0.18, Europe: 0.18, 'Latin America': 0.14, 'North America': 0.08, 'East Asia & Pacific': 0.08 }, interests: { business: 18, finance: 17, tech: 14, consumer: 12, students: 12, ent: 8, marketing: 6, sustain: 3, health: 4, travel: 6 } },
  Instagram: { users: 160, reach: 3.0, hours: [[12.5, 1.5, 0.34], [20.5, 2.0, 0.66]], regions: { 'Latin America': 0.26, Europe: 0.22, 'North America': 0.2, 'South Asia': 0.16, 'East Asia & Pacific': 0.1, 'Middle East & Africa': 0.06 }, interests: { marketing: 26, travel: 14, students: 12, sustain: 10, consumer: 12, ent: 8, health: 8, business: 6, tech: 4 } },
  Facebook:  { users: 140, reach: 2.6, hours: [[8, 1.5, 0.3], [13, 2.0, 0.2], [20, 2.1, 0.5]], regions: { 'North America': 0.26, 'Latin America': 0.22, 'South Asia': 0.2, Europe: 0.16, 'Middle East & Africa': 0.1, 'East Asia & Pacific': 0.06 }, interests: { consumer: 26, business: 14, health: 10, travel: 10, ent: 10, students: 6, marketing: 8, finance: 6, sustain: 5, tech: 5 } },
  YouTube:   { users: 150, reach: 2.8, hours: [[16, 2.0, 0.25], [22, 2.2, 0.75]], regions: { 'North America': 0.24, 'South Asia': 0.24, Europe: 0.18, 'Latin America': 0.14, 'East Asia & Pacific': 0.12, 'Middle East & Africa': 0.08 }, interests: { ent: 20, tech: 18, students: 14, consumer: 12, travel: 8, marketing: 8, health: 6, business: 6, finance: 5, sustain: 3 } },
  Reddit:    { users: 140, reach: 2.0, hours: [[13, 2.0, 0.28], [22.5, 2.2, 0.72]], regions: { 'North America': 0.44, Europe: 0.28, 'East Asia & Pacific': 0.1, 'South Asia': 0.1, 'Latin America': 0.04, 'Middle East & Africa': 0.04 }, interests: { tech: 30, students: 14, ent: 14, finance: 10, consumer: 8, sustain: 6, business: 6, marketing: 4, health: 4, travel: 4 } }
};

/* ------------------------------ bios ------------------------------ */
// Each calling has roles, things people love, and signature hashtags. Wording is chosen so the
// page's keyword rules can read it, but loves sometimes pull in a second interest on purpose.
const CALLINGS = {
  tech: { roles: ['Software engineer', 'Backend developer', 'Data scientist', 'Cybersecurity analyst', 'Product engineer', 'AI tinkerer', 'Open-source developer', 'Gadget reviewer', 'Mobile developer'], loves: ['building developer tools', 'clean APIs', 'late-night debugging', 'retro keyboards', 'tiny side projects', 'coffee-powered deploys', 'shipping on Fridays', 'dashboards nobody asked for'], tags: ['#OpenSource', '#BuildInPublic', '#DevLife', '#AI'] },
  marketing: { roles: ['Brand strategist', 'Content creator', 'Social media manager', 'Copywriter', 'Campaign analyst', 'Journalist covering media', 'Creative director', 'Podcast producer, media nerd'], loves: ['storytelling', 'creative briefs', 'good typography', 'campaign post-mortems', 'memes with a point', 'a sharp headline', 'making brands human'], tags: ['#Branding', '#ContentCreator', '#Marketing', '#CreativeLife'] },
  business: { roles: ['Founder', 'Small business owner', 'Startup mentor', 'Retail entrepreneur', 'Sales lead', 'Operations consultant', 'Co-founder', 'Shop owner'], loves: ['first customers', 'scrappy growth', 'local suppliers', 'pricing experiments', 'bootstrapped dreams', 'hiring slowly', 'cash-flow spreadsheets'], tags: ['#Startup', '#SmallBusiness', '#Entrepreneur'] },
  students: { roles: ['Undergrad', 'Student', 'Grad student', 'University researcher', 'College freshman', 'Student, class of 2027', 'Student, class of 2028'], loves: ['group projects', 'campus life', 'late library nights', 'learning in public', 'exam-season coffee', 'side hustles', 'internship hunting'], tags: ['#StudentLife', '#Learning', '#GenZ'] },
  sustain: { roles: ['Sustainable designer', 'Climate-conscious product designer', 'Eco-fashion maker', 'Environment policy nerd', 'Green architect', 'Sustainable packaging designer'], loves: ['circular design', 'repair culture', 'second-hand finds', 'low-waste living', 'honest materials', 'cycling to work'], tags: ['#Sustainability', '#ClimateAction', '#Design'] },
  consumer: { roles: ['Everyday shopper', 'Loyal customer', 'Product reviewer', 'Community member', 'Parent and daily consumer', 'Launch-day regular', 'Customer with opinions'], loves: ['honest reviews', 'unboxing', 'comparing specs', 'value for money', 'good packaging', 'return policies', 'a fair price'], tags: ['#Review', '#Unboxing', '#Shopping'] },
  finance: { roles: ['Investor', 'Personal finance writer', 'Banking analyst', 'Accounting nerd', 'Economics nerd', 'Quant hobbyist, investing on the side'], loves: ['index funds', 'market charts', 'budget spreadsheets', 'long-term thinking', 'boring portfolios'], tags: ['#Investing', '#PersonalFinance', '#Markets'] },
  health: { roles: ['Fitness coach', 'Nurse', 'Yoga instructor', 'Nutrition writer', 'Physiotherapist', 'Wellness coach'], loves: ['morning runs', 'meal prep', 'sleep science', 'mobility drills', 'cold-water swims'], tags: ['#Wellness', '#Fitness', '#Health'] },
  ent: { roles: ['Gamer', 'Football fan', 'Cricket tragic', 'Film buff', 'Music lover', 'Sports analyst', 'Movie podcaster'], loves: ['match days', 'vinyl crates', 'co-op nights', 'soundtracks', 'box-office debates', 'fantasy leagues'], tags: ['#Gaming', '#Music', '#Football', '#Cricket'] },
  travel: { roles: ['Travel photographer', 'Home chef', 'Food blogger', 'Coffee nerd', 'Backpacker and travel obsessive', 'Travel writer'], loves: ['street food', 'night trains', 'tiny cafes', 'market mornings', 'one-bag trips', 'regional recipes'], tags: ['#Travel', '#Foodie', '#Wanderlust'] }
};
const STAGE_NOTES = ['mom of two', 'dad jokes included', 'parent of two', 'new parent', 'class of 2028', 'weekend gardener'];
const LOCAL_BIOS = {
  hi: ['छात्र, तकनीक में रुचि', 'व्यवसाय और स्टार्टअप की बातें', 'ग्राहक अनुभव पर अपनी राय', 'छात्र और क्रिकेट प्रेमी'],
  es: ['Estudiante de diseño y sostenibilidad', 'Cliente que comparte su experiencia', 'Tecnología y negocio, en español', 'Marca personal, marketing y café'],
  pt: ['Estudante de design e sustentabilidade', 'Empreendedor e fundador de startup', 'Tecnologia, marketing e futebol', 'Cliente que gosta de dar opinião'],
  fr: ['Étudiant en marketing et design', 'Fondateur de startup, café et technologie', 'Client exigeant, fan de cinéma'],
  de: ['Student, interessiert an Technologie und Design', 'Gründer eines kleinen Online-Shops', 'Kunde mit Meinung, Musikfan']
};
const OTHER_BIOS = ['Retired teacher, now volunteering and sharing opinions', 'Proud grandparent and weekend gardener', 'Retired banker, enjoys investing and travel', 'Here for the memes', 'Just a person on the internet', 'Dreamer. Walker. Tea drinker.', 'Opinions are my own, probably', 'Making it up as I go', 'Cat person with a keyboard', 'Retired nurse who still reads every label', 'Collector of small joys', 'Tea first, everything else later'];

const SNIPPETS = {
  en: ['The new update looks genuinely useful.', 'Not sure about the price, but the design is nice.', 'Anyone tried this yet? Curious about real experiences.', 'Support was quick and helpful for me.', 'Launch timing feels a bit rushed.', 'Packaging is lovely, the manual could be clearer.', 'Waiting for the first proper reviews before I decide.', 'It does what it says. That is rarer than it should be.'],
  hi: ['यह नया बदलाव काफी उपयोगी लग रहा है।', 'कीमत थोड़ी ज़्यादा है, लेकिन डिज़ाइन अच्छा है।', 'क्या किसी ने इसे आज़माया है?', 'सपोर्ट टीम ने जल्दी मदद की।'],
  'en-hi': ['Feature achha lag raha hai, but price thoda high hai.', 'Launch details abhi clear nahi hain, wait karte hain.', 'Experience mixed raha, support helpful tha.', 'Design mast hai, battery ka review chahiye.'],
  es: ['La idea parece útil, pero faltan detalles sobre el precio.', 'Me gusta el cambio, ¿cuándo estará disponible?', 'El servicio me ayudó rápido.', 'El diseño es bonito, la entrega fue lenta.'],
  'en-es': ['Me gusta the new design, pero el precio no está claro.', 'La idea sounds useful; quiero ver más details.', 'Great launch, aunque falta stock.'],
  pt: ['A ideia parece útil, mas faltam detalhes sobre o preço.', 'Gostei da mudança, quando estará disponível?', 'O atendimento foi rápido.'],
  fr: ['L’idée semble utile, mais le prix reste flou.', 'Le support m’a répondu rapidement.', 'Le design est soigné, la livraison un peu lente.'],
  de: ['Die Idee wirkt nützlich, aber der Preis ist unklar.', 'Der Support war schnell und freundlich.', 'Schönes Design, Lieferung dauerte etwas.'],
  it: ['L’idea sembra utile, ma il prezzo non è chiaro.', 'Il design è bello, la consegna un po’ lenta.'],
  ar: ['الفكرة تبدو مفيدة لكن السعر غير واضح.', 'خدمة العملاء كانت سريعة.'],
  bn: ['নতুন পরিবর্তনটি বেশ কাজের মনে হচ্ছে।', 'দাম একটু বেশি, তবে ডিজাইন ভালো।'],
  ta: ['புதிய மாற்றம் பயனுள்ளதாகத் தெரிகிறது.', 'விலை கொஞ்சம் அதிகம்.'],
  ur: ['یہ نئی تبدیلی کافی مفید لگتی ہے۔', 'قیمت تھوڑی زیادہ ہے۔'],
  ja: ['新しい機能は便利そうですが、価格が気になります。', 'デザインは素敵です。'],
  ko: ['새 기능은 유용해 보이지만 가격이 궁금해요.', '디자인이 마음에 들어요.'],
  zh: ['新功能看起来很实用，但价格还不清楚。', '设计很好看。'],
  id: ['Fitur barunya terlihat berguna, tapi harganya belum jelas.', 'Desainnya bagus.'],
  fil: ['Mukhang kapaki-pakinabang ang bagong update.', 'Maganda ang disenyo.'],
  sw: ['Wazo linaonekana zuri, lakini bei haijulikani.', 'Huduma ilikuwa ya haraka.'],
  tr: ['Fikir faydalı görünüyor ama fiyat net değil.', 'Tasarım güzel.'],
  pl: ['Pomysł wydaje się przydatny, ale cena jest niejasna.'],
  sv: ['Idén verkar användbar, men priset är oklart.']
};

/* ------------------------------ time ------------------------------ */
const START = Date.UTC(2026, 9, 8, 0, 0, 0);       // 2026-10-08
const DAYS = 30;
const END = START + DAYS * 86400000 - 1000;
const DW = Array.from({ length: DAYS }, (_, d) => 1 + d * 0.09 + (d === 9 ? 4 : 0) + (d === 10 ? 2 : 0) + (d === 21 ? 3 : 0) + (d === 22 ? 1.5 : 0));
const DWSUM = DW.reduce((a, b) => a + b, 0);
function randomDay() { let r = rnd() * DWSUM, d = 0; while (d < DAYS - 1 && r > DW[d]) { r -= DW[d]; d++; } return d; }
function localHour(platform, student) {
  const peaks = PLATFORMS[platform].hours; let r = rnd() * peaks.reduce((s, p) => s + p[2], 0), pk = peaks[peaks.length - 1];
  for (const p of peaks) { r -= p[2]; if (r <= 0) { pk = p; break; } }
  let h = pk[0] + gauss() * pk[1] + (student ? 1.4 : 0);
  return ((h % 24) + 24) % 24;
}
function timeFor(day, platform, tz, student) {
  const local = localHour(platform, student);
  let ms = START + day * 86400000 + Math.round((local - tz) * 3600000);
  ms = Math.max(START, Math.min(END, ms));
  return ms;
}
function fmtTs(ms) { return new Date(ms).toISOString().slice(0, 19).replace('T', ' '); }
function anon(key) { return 'anon-' + crypto.createHash('sha256').update('c-sample:' + key).digest('hex').slice(0, 16); }

/* ------------------------------ users ------------------------------ */
function makeBio(spec, user) {
  const c1 = CALLINGS[weighted(spec.interests)];
  const role = pick(c1.roles), love = pick(c1.loves), tag = pick(c1.tags);
  const form = Math.floor(rnd() * 5);
  const love2 = rnd() < 0.2 ? pick(CALLINGS[weighted(spec.interests)].loves) : '';
  const lovePart = love2 ? love + ' & ' + love2 : love;
  let bio;
  if (form === 0) bio = role + ' · ' + lovePart;
  else if (form === 1) bio = role + '. ' + cap(lovePart) + '.';
  else if (form === 2) bio = role + ' | ' + lovePart + ' | ' + tag;
  else if (form === 3) bio = tag + ' ' + role.toLowerCase() + ', ' + lovePart;
  else bio = role + ' who loves ' + lovePart;
  if (rnd() < 0.1) bio = bio.replace(/\.$/, '') + ', ' + pick(STAGE_NOTES);
  return bio;
}

function makeUser(platform, brand) {
  const spec = PLATFORMS[platform];
  const user = { id: anon(platform + ':' + (users.length + 1)), platform };
  if (brand) {
    Object.assign(user, { bio: 'Official campaign account (simulated)', loc: 'Not specified', lang: 'en', brand: true, tz: 0, followers: Math.round(Math.pow(10, 4.7 + rnd() * 0.8)), joinedYear: 2013 + Math.floor(rnd() * 4) });
    return user;
  }
  const region = weighted(spec.regions), R = REGIONS[region];
  const langs = Object.assign({}, R.langs);
  if (platform === 'Telegram' && region === 'South Asia') { langs['en-hi'] = (langs['en-hi'] || 0) + 0.15; langs.hi = (langs.hi || 0) + 0.08; }
  if (platform === 'Reddit') langs.en = (langs.en || 0) + 0.35;
  user.lang = weighted(langs);

  const city = pick(R.cities);
  user.tz = city[1];
  const lr = rnd();
  user.loc = lr < 0.13 ? '' : lr < 0.18 ? 'Not specified' : lr < 0.21 ? 'somewhere on the internet' : lr < 0.3 ? city[0].split(',').pop().trim() : city[0];

  const br = rnd();
  if (br < 0.08) user.bio = '';
  else if (br < 0.16) user.bio = pick(OTHER_BIOS);
  else if (br < 0.24 && LOCAL_BIOS[user.lang.replace('en-', '')]) user.bio = pick(LOCAL_BIOS[user.lang.replace('en-', '')]);
  else user.bio = makeBio(spec, user);
  user.student = /student|undergrad|college|class of|gen ?z|universit/i.test(user.bio);

  // reach: lognormal around the platform mean, shifted by calling
  let mu = spec.reach + gauss() * 0.72;
  if (/creator|brand|journalis|gamer|travel photographer|music|film|podcast|director/i.test(user.bio)) mu += 0.45;
  if (user.student) mu -= 0.3;
  if (/founder|owner|entrepreneur|startup/i.test(user.bio)) mu += 0.15;
  user.followers = Math.max(3, Math.round(Math.pow(10, mu)));
  // account age: skewed to recent years, students very recent
  const yw = {}; for (let y = 2012; y <= 2026; y++) yw[y] = 1 + (y - 2012) * 0.35 + (y >= 2023 ? 1.5 : 0);
  if (user.student) for (let y = 2012; y < 2019; y++) yw[y] = 0.1;
  user.joinedYear = parseInt(weighted(yw), 10);
  return user;
}

const users = [];
Object.keys(PLATFORMS).forEach(p => {
  for (let i = 0; i < PLATFORMS[p].users; i++) users.push(makeUser(p, false));
  users.push(makeUser(p, true), makeUser(p, true));
});

const rows = [];
users.forEach(u => {
  const count = u.brand ? 3 + Math.floor(rnd() * 5) : 1 + Math.min(8, Math.floor(Math.log(1 - rnd()) / Math.log(0.6)));
  const joinMs = Date.UTC(u.joinedYear, Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 28));
  const joined = new Date(Math.min(joinMs, START - 86400000 * (1 + Math.floor(rnd() * 20)))).toISOString().slice(0, 10);
  const firstDay = randomDay();
  for (let i = 0; i < count; i++) {
    const day = i === 0 ? firstDay : Math.min(DAYS - 1, firstDay + Math.floor(rnd() * 12));
    const ts = timeFor(day, u.platform, u.tz, u.student);
    let code = rnd() < 0.12 ? weighted({ en: 6, [u.lang]: 1 }) : u.lang;
    const text = pick(SNIPPETS[code] || SNIPPETS.en);
    if (rnd() < 0.05) code = '';           // a missing language code, so the page has to detect the script
    rows.push({ platform: u.platform, user_id: u.id, ts, text, language: code, user_bio: u.bio, user_location: u.loc, followers: u.followers, joined });
  }
});

// each user's first appearance must be their earliest post; sort and wire up replies
rows.sort((a, b) => a.ts - b.ts || (a.user_id < b.user_id ? -1 : 1));
const byPlatform = {};
rows.forEach((r, i) => {
  r.post_id = 'csample-' + String(i + 1).padStart(5, '0');
  const list = (byPlatform[r.platform] = byPlatform[r.platform] || []);
  r.parent_id = '';
  if (list.length > 5 && rnd() < 0.22) { const cand = pick(list); if (cand.user_id !== r.user_id) r.parent_id = cand.post_id; }
  list.push(r);
});

function q(v) { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
const header = ['post_id', 'platform', 'user_id', 'timestamp', 'text', 'parent_id', 'language', 'user_bio', 'user_location', 'followers', 'joined'];
const csv = [header.join(',')].concat(rows.map(r => [r.post_id, r.platform, r.user_id, fmtTs(r.ts), r.text, r.parent_id, r.language, r.user_bio, r.user_location, r.followers, r.joined].map(q).join(','))).join('\n') + '\n';

const dir = path.join(__dirname, 'sample');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'audience_sample.csv'), '﻿' + csv);
fs.writeFileSync(path.join(dir, 'audience_sample.js'),
  '// Generated by make_sample.js. Synthetic data only. Same content as audience_sample.csv.\n' +
  'window.SAMPLE_AUDIENCE_CSV = ' + JSON.stringify(csv) + ';\n');
console.log('Wrote ' + rows.length + ' posts from ' + users.length + ' fictional profiles (' + users.filter(u => u.brand).length + ' brand accounts).');
console.log('CSV size: ' + Math.round(Buffer.byteLength(csv) / 1024) + ' KB');
