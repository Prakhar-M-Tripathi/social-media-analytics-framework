// Generates a rich SYNTHETIC audience dataset for Section C.
//   node make_sample.js
// Writes sample/audience_sample.csv (the real file) and sample/audience_sample.js
// (the same CSV as a script, so the page also works when opened by double-click).
//
// Every profile, bio, location, follower count and post is fictional. One file serves both
// Section C (who the audience is) and Section E (how they influence each other). It follows the
// shared data contract (six required columns) plus optional columns:
//   language, user_bio, user_location, followers, joined          used by Section C
//   interaction (post/reply/quote/repost/share), ref_post_id, sentiment   used by Section E
// parent_id stays reply-only, as the contract says; ref_post_id holds the target of every kind
// of interaction. Posting hours follow each profile's local time zone. Trends are #hashtags in
// the text and spread as branching cascades through circles of people, and sentiment matches
// the wording of each post. The generator is seeded, so running it again gives the same file.
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
  user.calling = weighted(spec.interests);
  const c1 = CALLINGS[user.calling];
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
  const user = { id: anon(platform + ':' + (++userSerial)), platform };
  if (brand) {
    Object.assign(user, { bio: 'Official campaign account (simulated)', loc: 'Not specified', lang: 'en', brand: true, tz: 0, followers: Math.round(Math.pow(10, 4.7 + rnd() * 0.8)), joinedYear: 2013 + Math.floor(rnd() * 4), calling: 'marketing', region: 'None' });
    return user;
  }
  const region = weighted(spec.regions), R = REGIONS[region];
  user.region = region;
  user.calling = weighted(spec.interests);          // makeBio overrides this when it writes the bio
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

let userSerial = 0;
const users = [];
Object.keys(PLATFORMS).forEach(p => {
  for (let i = 0; i < PLATFORMS[p].users; i++) users.push(makeUser(p, false));
  users.push(makeUser(p, true), makeUser(p, true));
});

/* ------------------------------ social structure ------------------------------ */
// Three interest families per platform give the circles that people mostly talk within.
const FAMILY = { tech: 'makers', finance: 'makers', business: 'makers', marketing: 'culture', ent: 'culture', students: 'culture', consumer: 'everyday', health: 'everyday', travel: 'everyday', sustain: 'everyday' };
const FAMILIES = ['makers', 'culture', 'everyday'];
const circles = {}, onPlatform = {};
users.forEach(u => {
  u.family = FAMILY[u.calling];
  u.circle = u.platform + ':' + u.family;
  (circles[u.circle] = circles[u.circle] || []).push(u);
  (onPlatform[u.platform] = onPlatform[u.platform] || []).push(u);
  u.pull = Math.min(40, Math.pow(u.followers / 300, 0.55) * (0.5 + rnd()));   // how much attention a voice draws
  u.chatty = Math.min(8, Math.pow(1 - rnd(), -0.5) - 0.6);                     // how often a voice joins in
  u.bridge = rnd() < 0.07;                                                     // happy to carry things between circles
  u.lean = gauss() * 0.25;                                                     // personal mood
  const joinMs = Date.UTC(u.joinedYear, Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 28));
  u.joined = new Date(Math.min(joinMs, START - 86400000 * (1 + Math.floor(rnd() * 20)))).toISOString().slice(0, 10);
  u.acts = 0;
});

/* ------------------------------ wording and mood ------------------------------ */
// One character per snippet, in order: p positive, n neutral, x negative.
Object.entries({
  en: ['Disappointed. This is not what was promised.', 'Third refund request this month. Not great.'],
  hi: ['इस बार बहुत निराशा हुई।'], 'en-hi': ['Bilkul bekaar experience, paisa waste.'],
  es: ['Muy decepcionante, no lo recomiendo.'], 'en-es': ['Honestly muy mal, no lo compren.'],
  pt: ['Bem decepcionante, não recomendo.'], fr: ['Très décevant, je ne recommande pas.'],
  de: ['Leider enttäuschend, keine Empfehlung.'], it: ['Davvero deludente.'], ar: ['تجربة مخيبة للآمال.']
}).forEach(([k, list]) => SNIPPETS[k].push(...list));
const MOODS = { en: 'pnnpxnnpxx', hi: 'pnnpx', 'en-hi': 'nnnpx', es: 'nppnx', 'en-es': 'nnpx', pt: 'nppx', fr: 'npnx', de: 'npnx', it: 'nnx', ar: 'npx', bn: 'pn', ta: 'pn', ur: 'pn', ja: 'np', ko: 'np', zh: 'np', id: 'np', fil: 'pp', sw: 'np', tr: 'np', pl: 'n', sv: 'n' };
const MOOD_NAME = { p: 'positive', n: 'neutral', x: 'negative' }, MOOD_VALUE = { positive: 1, neutral: 0, negative: -1 };
function wording(lang, want) {
  const list = SNIPPETS[lang] ? lang : 'en', tags = MOODS[list];
  const idx = []; for (let i = 0; i < tags.length; i++) if (tags[i] === want) idx.push(i);
  const i = idx.length ? pick(idx) : Math.floor(rnd() * tags.length);    // no snippet in that mood: keep the wording honest
  return { text: SNIPPETS[list][i], sentiment: MOOD_NAME[tags[i]] };
}
function moodFor(u, tilt) { const x = u.lean + tilt + gauss() * 0.55; return x > 0.35 ? 'p' : x < -0.35 ? 'x' : 'n'; }
function poisson(l) { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L); return k - 1; }

/* ------------------------------ events ------------------------------ */
const rows = [];
function addEvent(u, ts, interaction, ref, tag, want) {
  let code = rnd() < 0.12 ? weighted({ en: 6, [u.lang]: 1 }) : u.lang, text, sentiment;
  if (interaction === 'repost') { text = ref.text; sentiment = ref.sentiment; code = ref.language || code; }
  else { const w = wording(code, want); text = w.text + (tag ? ' ' + tag : ''); sentiment = w.sentiment; }
  const r = { author: u, platform: u.platform, user_id: u.id, ts, text, sentiment, interaction, ref, language: code, user_bio: u.bio, user_location: u.loc, followers: u.followers, joined: u.joined };
  if (interaction !== 'repost' && rnd() < 0.05) r.language = '';     // a missing language code, so the page has to detect the script
  rows.push(r); u.acts++;
  return r;
}
function replyTime(parentTs, u) {
  let ts = parentTs + Math.round(Math.exp(1.1 + gauss() * 1.2) * 3600000) + 60000;
  const local = (((new Date(ts).getUTCHours() + u.tz) % 24) + 24) % 24;
  if (local >= 1 && local < 7) ts += Math.round((7 - local + rnd() * 3) * 3600000);      // nobody answers in their sleep
  return ts;
}

// 1. Ordinary posts: everyone says something of their own.
users.forEach(u => {
  const count = u.brand ? 3 + Math.floor(rnd() * 5) : 1 + Math.min(8, Math.floor(Math.log(1 - rnd()) / Math.log(0.6)));
  const firstDay = randomDay();
  for (let i = 0; i < count; i++) {
    const day = i === 0 ? firstDay : Math.min(DAYS - 1, firstDay + Math.floor(rnd() * 12));
    addEvent(u, timeFor(day, u.platform, u.tz, u.student), 'post', null, '', moodFor(u, 0));
  }
});

// 2. Everyday conversation: people answer bigger voices, mostly inside their own circle.
const organic = rows.slice(), postsIn = {}, postsOn = {};
organic.forEach(r => { (postsIn[r.author.circle] = postsIn[r.author.circle] || []).push(r); (postsOn[r.platform] = postsOn[r.platform] || []).push(r); });
users.forEach(u => {
  const n = u.brand ? 0 : Math.floor(u.chatty * rnd() * 3.2);
  for (let i = 0; i < n; i++) {
    const pool = rnd() < 0.86 && postsIn[u.circle] ? postsIn[u.circle] : postsOn[u.platform];
    let best = null;
    for (let t = 0; t < 6; t++) { const c = pick(pool); if (c.author !== u && (!best || c.author.pull * (0.5 + rnd()) > best.author.pull * (0.5 + rnd()))) best = c; }
    if (!best) continue;
    const ts = replyTime(best.ts, u);
    if (ts > END) continue;
    const roll = rnd(), kind = roll < 0.68 ? 'reply' : roll < 0.8 ? 'quote' : 'repost';
    const r = addEvent(u, ts, kind, best, '', moodFor(u, MOOD_VALUE[best.sentiment] * 0.45));
    if (kind === 'reply' && rnd() < 0.25) {                                 // the author answers back
      const back = replyTime(ts, best.author);
      if (back <= END) addEvent(best.author, back, 'reply', r, '', moodFor(best.author, MOOD_VALUE[r.sentiment] * 0.45));
    }
  }
});

// 3. Trends: a #tag starts with a few voices and branches outward, then jumps platforms.
// tilt = starting mood, drift = how the mood moves as the tag travels further from its source.
const TRENDS = [
  { tag: '#LumenLaunch', day: 2, family: 'culture', platforms: ['X', 'Instagram', 'YouTube'], gap: 2.0, power: 2.6, tilt: 0.45, drift: 0, cap: 190, brand: true },
  { tag: '#BatteryGate', day: 9, family: 'makers', platforms: ['Reddit', 'X', 'YouTube', 'Facebook'], gap: 1.2, power: 3.0, tilt: -0.5, drift: -0.05, cap: 240 },
  { tag: '#PriceCheck', day: 5, family: 'everyday', platforms: ['Facebook', 'Telegram'], gap: 2.5, power: 2.1, tilt: -0.15, drift: 0, cap: 110 },
  { tag: '#RightToRepair', day: 13, family: 'everyday', platforms: ['Reddit', 'Instagram'], gap: 3.0, power: 2.2, tilt: 0.2, drift: 0.04, cap: 120 },
  { tag: '#NightShift', day: 16, family: 'makers', platforms: ['Telegram', 'X'], gap: 1.8, power: 2.0, tilt: 0.1, drift: 0, cap: 90 },
  { tag: '#GreenBox', day: 7, family: 'everyday', platforms: ['Instagram', 'Facebook'], gap: 3.0, power: 1.9, tilt: 0.5, drift: 0, cap: 80 },
  { tag: '#CameraWars', day: 11, family: 'culture', platforms: ['YouTube', 'Reddit', 'X'], gap: 1.5, power: 2.4, tilt: 0, drift: -0.02, cap: 150 },
  { tag: '#SupportStory', day: 18, family: 'culture', platforms: ['X', 'Telegram', 'Facebook'], gap: 1.4, power: 2.6, tilt: 0.6, drift: -0.28, cap: 170 },
  { tag: '#EarlyAccess', day: 1, family: 'makers', platforms: ['Telegram', 'Reddit'], gap: 2.2, power: 1.8, tilt: 0.4, drift: 0, cap: 70, brand: true },
  { tag: '#RefundQueue', day: 21, family: 'everyday', platforms: ['Facebook', 'X', 'Telegram'], gap: 1.0, power: 2.8, tilt: -0.6, drift: -0.03, cap: 180 },
  { tag: '#UnboxDay', day: 23, family: 'culture', platforms: ['YouTube', 'Instagram'], gap: 1.6, power: 2.2, tilt: 0.45, drift: 0, cap: 110, brand: true }
];
function tournament(pool, parent, gen) {
  let best = null, bestScore = -1;
  const sameRegion = Math.max(1, 6 - gen * 1.5);                       // early on it travels among neighbours
  for (let i = 0; i < 8; i++) {
    const c = pick(pool);
    if (c === parent.author || c.brand || c.acts > 14) continue;
    const s = c.chatty * (c.region === parent.author.region ? sameRegion : 1) * (0.5 + rnd());
    if (s > bestScore) { bestScore = s; best = c; }
  }
  return best;
}
TRENDS.forEach(t => {
  let made = 0;
  const queue = [];
  let lastWave = null;
  t.platforms.forEach((platform, wave) => {
    const start = START + (t.day + wave * t.gap) * 86400000;
    const pool = circles[platform + ':' + t.family].filter(u => !u.brand).sort((a, b) => b.pull - a.pull).slice(0, 10);
    const seeds = [];
    if (t.brand && wave === 0) seeds.push(onPlatform[platform].find(u => u.brand));
    const nSeeds = wave === 0 ? 2 : 1;
    for (let i = 0; i < nSeeds; i++) seeds.push(pick(pool));
    seeds.forEach(u => {
      let ts = start + Math.round(rnd() * 8 * 3600000);
      if (lastWave) { ts = Math.max(ts, lastWave.ts + 3600000); }
      const r = lastWave ? addEvent(u, ts, 'share', lastWave, t.tag, moodFor(u, t.tilt + t.drift * 3)) : addEvent(u, ts, 'post', null, t.tag, moodFor(u, t.tilt));
      queue.push({ r, gen: lastWave ? 1 : 0 });
      made++;
    });
    if (rows.length) lastWave = queue[Math.floor(queue.length / 2)].r;
  });
  for (let q2 = 0; q2 < queue.length && made < t.cap; q2++) {
    const { r: parent, gen } = queue[q2];
    const lambda = 1.45 * t.power * (0.55 + 0.35 * Math.log10(1 + parent.author.pull)) * Math.pow(0.82, gen);
    const kids = Math.min(14, poisson(lambda));
    for (let k = 0; k < kids && made < t.cap; k++) {
      const roll = rnd();
      let pool, kind;
      if (roll < 0.7) pool = circles[parent.author.circle];
      else if (roll < 0.94) pool = onPlatform[parent.platform];
      else {
        const others = Object.keys(PLATFORMS).filter(p => p !== parent.platform);
        pool = circles[pick(others) + ':' + t.family].filter(u => u.bridge || rnd() < 0.2);
        kind = 'share';
      }
      if (!pool.length) continue;
      const u = tournament(pool, parent, gen);
      if (!u) continue;
      const ts = replyTime(parent.ts, u);
      if (ts > END) continue;
      if (!kind) { const x = rnd(); kind = x < 0.5 ? 'reply' : x < 0.65 ? 'quote' : 'repost'; }
      const tilt = t.tilt + t.drift * (gen + 1) + MOOD_VALUE[parent.sentiment] * 0.3;
      queue.push({ r: addEvent(u, ts, kind, parent, t.tag, moodFor(u, tilt)), gen: gen + 1 });
      made++;
    }
  }
});

rows.sort((a, b) => a.ts - b.ts || (a.user_id < b.user_id ? -1 : 1));
rows.forEach((r, i) => { r.post_id = 'csample-' + String(i + 1).padStart(5, '0'); });

function q(v) { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
const header = ['post_id', 'platform', 'user_id', 'timestamp', 'text', 'parent_id', 'language', 'user_bio', 'user_location', 'followers', 'joined', 'interaction', 'ref_post_id', 'sentiment'];
const csv = [header.join(',')].concat(rows.map(r => [r.post_id, r.platform, r.user_id, fmtTs(r.ts), r.text, r.interaction === 'reply' ? r.ref.post_id : '', r.language, r.user_bio, r.user_location, r.followers, r.joined, r.interaction, r.ref ? r.ref.post_id : '', r.sentiment].map(q).join(','))).join('\n') + '\n';

const dir = path.join(__dirname, 'sample');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'audience_sample.csv'), '﻿' + csv);
fs.writeFileSync(path.join(dir, 'audience_sample.js'),
  '// Generated by make_sample.js. Synthetic data only. Same content as audience_sample.csv.\n' +
  'window.SAMPLE_AUDIENCE_CSV = ' + JSON.stringify(csv) + ';\n');
console.log('Wrote ' + rows.length + ' posts from ' + users.length + ' fictional profiles (' + users.filter(u => u.brand).length + ' brand accounts).');
console.log('CSV size: ' + Math.round(Buffer.byteLength(csv) / 1024) + ' KB');
