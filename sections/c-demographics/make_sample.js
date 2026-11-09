// Generates a richer SYNTHETIC audience dataset for Section C.
//   node make_sample.js
// Writes sample/audience_sample.csv (the real file) and sample/audience_sample.js
// (the same CSV as a script, so the page also works when opened by double-click).
//
// Every profile, bio, location and post is fictional. The output follows the shared data
// contract (six required columns) plus the three optional profile columns.
// The generator is seeded, so running it again gives the same file.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let seed = 20261106;
function rnd() { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
function pick(a) { return a[Math.floor(rnd() * a.length)]; }
function weighted(obj) { const e = Object.entries(obj); let r = rnd() * e.reduce((s, x) => s + x[1], 0); for (const [k, w] of e) { r -= w; if (r <= 0) return k; } return e[e.length - 1][0]; }

const REGIONS = {
  'North America': { cities: ['New York, USA', 'Toronto, Canada', 'Austin, Texas', 'San Francisco, CA', 'Chicago, USA', 'Vancouver, Canada', 'Seattle, USA', 'Boston, USA', 'Los Angeles'], langs: { en: 0.86, es: 0.06, 'en-es': 0.06, fr: 0.02 } },
  'Latin America': { cities: ['São Paulo, Brazil', 'Mexico City, Mexico', 'Bogotá, Colombia', 'Buenos Aires, Argentina', 'Lima, Peru', 'Santiago, Chile', 'Rio de Janeiro, Brazil'], langs: { es: 0.5, 'en-es': 0.16, pt: 0.24, en: 0.1 } },
  'Europe': { cities: ['London, UK', 'Berlin, Germany', 'Madrid, Spain', 'Paris, France', 'Amsterdam', 'Dublin, Ireland', 'Lisbon, Portugal', 'Stockholm', 'Milan, Italy', 'Warsaw'], langs: { en: 0.46, es: 0.1, de: 0.12, fr: 0.12, it: 0.06, pt: 0.04, 'en-es': 0.04, pl: 0.03, sv: 0.03 } },
  'South Asia': { cities: ['Mumbai, India', 'Delhi', 'Bengaluru, India', 'Hyderabad', 'Pune, India', 'Chennai', 'Kolkata', 'Karachi, Pakistan', 'Lahore', 'Dhaka, Bangladesh', 'Colombo, Sri Lanka', 'Kathmandu, Nepal'], langs: { en: 0.36, hi: 0.2, 'en-hi': 0.3, bn: 0.05, ta: 0.05, ur: 0.04 } },
  'Middle East & Africa': { cities: ['Lagos, Nigeria', 'Nairobi, Kenya', 'Cairo, Egypt', 'Dubai, UAE', 'Riyadh, Saudi Arabia', 'Cape Town, South Africa', 'Istanbul'], langs: { en: 0.5, ar: 0.28, fr: 0.08, sw: 0.06, tr: 0.08 } },
  'East Asia & Pacific': { cities: ['Singapore', 'Sydney, Australia', 'Tokyo, Japan', 'Seoul, Korea', 'Manila, Philippines', 'Melbourne, Australia', 'Jakarta, Indonesia'], langs: { en: 0.5, ja: 0.14, ko: 0.1, zh: 0.1, id: 0.08, fil: 0.08 } }
};

const PLATFORMS = {
  X:         { users: 130, regions: { 'North America': 0.32, Europe: 0.26, 'South Asia': 0.16, 'East Asia & Pacific': 0.1, 'Latin America': 0.08, 'Middle East & Africa': 0.08 }, interests: { tech: 22, marketing: 22, business: 14, consumer: 12, students: 8, finance: 8, sustain: 4, ent: 5, health: 2, travel: 3 } },
  Telegram:  { users: 90,  regions: { 'South Asia': 0.34, 'Middle East & Africa': 0.18, Europe: 0.18, 'Latin America': 0.14, 'North America': 0.08, 'East Asia & Pacific': 0.08 }, interests: { business: 18, finance: 16, tech: 14, consumer: 14, students: 12, ent: 8, marketing: 6, sustain: 3, health: 4, travel: 5 } },
  Instagram: { users: 120, regions: { 'Latin America': 0.26, Europe: 0.22, 'North America': 0.2, 'South Asia': 0.16, 'East Asia & Pacific': 0.1, 'Middle East & Africa': 0.06 }, interests: { marketing: 26, travel: 14, students: 12, sustain: 10, consumer: 12, ent: 8, health: 8, business: 6, tech: 4 } },
  Facebook:  { users: 100, regions: { 'North America': 0.26, 'Latin America': 0.22, 'South Asia': 0.2, Europe: 0.16, 'Middle East & Africa': 0.1, 'East Asia & Pacific': 0.06 }, interests: { consumer: 28, business: 14, health: 10, travel: 10, ent: 10, students: 6, marketing: 8, finance: 6, sustain: 4, tech: 4 } },
  YouTube:   { users: 100, regions: { 'North America': 0.24, 'South Asia': 0.24, Europe: 0.18, 'Latin America': 0.14, 'East Asia & Pacific': 0.12, 'Middle East & Africa': 0.08 }, interests: { ent: 20, tech: 18, students: 14, consumer: 14, travel: 8, marketing: 8, health: 6, business: 6, finance: 4, sustain: 2 } },
  Reddit:    { users: 100, regions: { 'North America': 0.44, Europe: 0.28, 'East Asia & Pacific': 0.1, 'South Asia': 0.1, 'Latin America': 0.04, 'Middle East & Africa': 0.04 }, interests: { tech: 30, students: 14, ent: 14, finance: 10, consumer: 8, sustain: 6, business: 6, marketing: 4, health: 4, travel: 4 } }
};

const BIOS = {
  tech: ['Software engineer building developer tools', 'Data and AI tinkerer, coffee powered', 'Gadget reviewer and open-source contributor', 'Cybersecurity analyst by day, gamer by night', 'Backend developer who writes about apps', 'Interested in technology and useful services'],
  marketing: ['Brand strategist and storyteller', 'Content creator talking about campaigns', 'Social media marketing manager', 'Journalist covering media and advertising', 'Marketing professional following campaign examples', 'Creator, copywriter, brand nerd'],
  business: ['Founder of a small online shop', 'Entrepreneur and startup mentor', 'Retail business owner', 'Sales lead at a young startup', 'Small business owner sharing public opinions', 'Consultant helping local businesses grow'],
  students: ['Undergrad studying communication', 'Student, class of 2027', 'University researcher in social science', 'Student interested in brands and online culture', 'College student, always learning', 'Gen Z learner who loves group projects'],
  sustain: ['Climate-conscious designer', 'Sustainable fashion and eco living', 'Environment policy nerd', 'Product design with a green mindset', 'Interested in sustainability and product design'],
  consumer: ['Everyday shopper sharing honest product reviews', 'Customer who loves launch days', 'Community member discussing everyday products', 'Customer sharing a personal product experience', 'Follows product launches and customer experience', 'Parent and daily consumer'],
  finance: ['Investor and personal finance blogger', 'Banking analyst', 'Economics nerd who tracks markets', 'Accounting by day, investing by night'],
  health: ['Fitness coach and nutrition fan', 'Nurse sharing wellness tips', 'Yoga teacher and health writer', 'Doctor who reads too much'],
  ent: ['Gamer and music lover', 'Football and cricket fan', 'Film buff and weekend gamer', 'Sports fan, big on music'],
  travel: ['Travel photographer and coffee fan', 'Home chef exploring street food', 'Food blogger on the road', 'Travel lover collecting recipes']
};
const BIOS_LOCAL = {
  hi: ['छात्र, तकनीक में रुचि', 'व्यवसाय और स्टार्टअप की बातें', 'ग्राहक अनुभव पर अपनी राय'],
  es: ['Estudiante de diseño y sostenibilidad', 'Cliente que comparte su experiencia', 'Tecnología y negocio, en español']
};
const BIOS_OTHER = ['Retired teacher now volunteering and sharing opinions', 'Proud grandparent and weekend gardener', 'Retired banker, enjoys investing and travel', 'Here for the memes', 'Just a person on the internet', 'Dreamer. Walker. Tea drinker.'];

const SNIPPETS = {
  en: ['The new update looks genuinely useful.', 'Not sure about the price, but the design is nice.', 'Anyone tried this yet? Curious about real experiences.', 'Support was quick and helpful for me.', 'Launch timing feels a bit rushed.'],
  hi: ['यह नया बदलाव काफी उपयोगी लग रहा है।', 'कीमत थोड़ी ज़्यादा है, लेकिन डिज़ाइन अच्छा है।', 'क्या किसी ने इसे आज़माया है?'],
  'en-hi': ['Feature achha lag raha hai, but price thoda high hai.', 'Launch details abhi clear nahi hain, wait karte hain.', 'Experience mixed raha, support helpful tha.'],
  es: ['La idea parece útil, pero faltan detalles sobre el precio.', 'Me gusta el cambio, ¿cuándo estará disponible?', 'El servicio me ayudó rápido.'],
  'en-es': ['Me gusta the new design, pero el precio no está claro.', 'La idea sounds useful; quiero ver más details.'],
  pt: ['A ideia parece útil, mas faltam detalhes sobre o preço.', 'Gostei da mudança, quando estará disponível?'],
  fr: ['L’idée semble utile, mais le prix reste flou.', 'Le support m’a répondu rapidement.'],
  de: ['Die Idee wirkt nützlich, aber der Preis ist unklar.', 'Der Support war schnell und freundlich.'],
  it: ['L’idea sembra utile, ma il prezzo non è chiaro.'],
  ar: ['الفكرة تبدو مفيدة لكن السعر غير واضح.', 'خدمة العملاء كانت سريعة.'],
  bn: ['নতুন পরিবর্তনটি বেশ কাজের মনে হচ্ছে।'],
  ta: ['புதிய மாற்றம் பயனுள்ளதாகத் தெரிகிறது.'],
  ur: ['یہ نئی تبدیلی کافی مفید لگتی ہے۔'],
  ja: ['新しい機能は便利そうですが、価格が気になります。'],
  ko: ['새 기능은 유용해 보이지만 가격이 궁금해요.'],
  zh: ['新功能看起来很实用，但价格还不清楚。'],
  id: ['Fitur barunya terlihat berguna, tapi harganya belum jelas.'],
  fil: ['Mukhang kapaki-pakinabang ang bagong update.'],
  sw: ['Wazo linaonekana zuri, lakini bei haijulikani.'],
  tr: ['Fikir faydalı görünüyor ama fiyat net değil.'],
  pl: ['Pomysł wydaje się przydatny, ale cena jest niejasna.'],
  sv: ['Idén verkar användbar, men priset är oklart.']
};

const START = Date.UTC(2026, 9, 8, 0, 0, 0);       // 2026-10-08
const DAYS = 30;
function dayWeights() { const w = []; for (let d = 0; d < DAYS; d++) w.push(1 + d * 0.09 + (d === 9 ? 4 : 0) + (d === 10 ? 2 : 0) + (d === 21 ? 3 : 0) + (d === 22 ? 1.5 : 0)); return w; }
const DW = dayWeights(), DWSUM = DW.reduce((a, b) => a + b, 0);
function randomTime() { let r = rnd() * DWSUM, d = 0; while (d < DAYS - 1 && r > DW[d]) { r -= DW[d]; d++; } return START + d * 86400000 + Math.floor(rnd() * 86400000); }
function fmtTs(ms) { return new Date(ms).toISOString().slice(0, 19).replace('T', ' '); }
function anon(key) { return 'anon-' + crypto.createHash('sha256').update('c-sample:' + key).digest('hex').slice(0, 16); }

const rows = [];
let userNo = 0;

function makeUser(platform, brand) {
  const spec = PLATFORMS[platform];
  userNo++;
  const user = { id: anon(platform + ':' + userNo), platform };
  if (brand) {
    Object.assign(user, { bio: 'Official campaign account (simulated)', loc: 'Not specified', lang: 'en', brand: true });
    return user;
  }
  const region = weighted(spec.regions);
  const R = REGIONS[region];
  let langs = Object.assign({}, R.langs);
  if (platform === 'Telegram' && region === 'South Asia') { langs['en-hi'] = (langs['en-hi'] || 0) + 0.15; langs.hi = (langs.hi || 0) + 0.08; }
  if (platform === 'Reddit') { langs.en = (langs.en || 0) + 0.35; }
  user.lang = weighted(langs);

  const lr = rnd();
  user.loc = lr < 0.14 ? '' : lr < 0.19 ? 'Not specified' : lr < 0.22 ? 'somewhere on the internet' : pick(R.cities);

  const br = rnd();
  if (br < 0.09) user.bio = '';
  else if (br < 0.15) user.bio = pick(BIOS_OTHER);
  else if (br < 0.2 && BIOS_LOCAL[user.lang.split('-').pop()] && (user.lang === 'hi' || user.lang === 'es' || user.lang.startsWith('en-'))) user.bio = pick(BIOS_LOCAL[user.lang === 'hi' || user.lang === 'en-hi' ? 'hi' : 'es']);
  else {
    const interest = weighted(spec.interests);
    user.bio = pick(BIOS[interest]);
    if (rnd() < 0.12) user.bio += ' and ' + pick(BIOS[weighted(spec.interests)]).split(' ').slice(-2).join(' ').toLowerCase();
  }
  return user;
}

const users = [];
Object.keys(PLATFORMS).forEach(p => {
  for (let i = 0; i < PLATFORMS[p].users; i++) users.push(makeUser(p, false));
  users.push(makeUser(p, true), makeUser(p, true));
});

users.forEach(u => {
  const first = randomTime();
  const count = u.brand ? 3 + Math.floor(rnd() * 4) : 1 + Math.min(6, Math.floor(Math.log(1 - rnd()) / Math.log(0.5)));
  for (let i = 0; i < count; i++) {
    const ts = i === 0 ? first : Math.min(START + DAYS * 86400000 - 1000, first + Math.floor(rnd() * 12 * 86400000));
    let code = rnd() < 0.12 ? weighted({ en: 6, [u.lang]: 1 }) : u.lang;
    const text = pick(SNIPPETS[code] || SNIPPETS.en);
    if (rnd() < 0.05) code = '';           // missing language code, so the page must detect the script
    rows.push({ platform: u.platform, user_id: u.id, ts, text, language: code, user_bio: u.bio, user_location: u.loc });
  }
});

rows.sort((a, b) => a.ts - b.ts || (a.user_id < b.user_id ? -1 : 1));
const byPlatform = {};
rows.forEach((r, i) => {
  r.post_id = 'csample-' + String(i + 1).padStart(5, '0');
  const list = (byPlatform[r.platform] = byPlatform[r.platform] || []);
  r.parent_id = '';
  if (list.length > 5 && rnd() < 0.22) {
    const cand = pick(list);
    if (cand.user_id !== r.user_id) r.parent_id = cand.post_id;
  }
  list.push(r);
});

function q(v) { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
const header = ['post_id', 'platform', 'user_id', 'timestamp', 'text', 'parent_id', 'language', 'user_bio', 'user_location'];
const csv = [header.join(',')].concat(rows.map(r => [r.post_id, r.platform, r.user_id, fmtTs(r.ts), r.text, r.parent_id, r.language, r.user_bio, r.user_location].map(q).join(','))).join('\n') + '\n';

const dir = path.join(__dirname, 'sample');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'audience_sample.csv'), '﻿' + csv);
fs.writeFileSync(path.join(dir, 'audience_sample.js'),
  '// Generated by make_sample.js. Synthetic data only. Same content as audience_sample.csv.\n' +
  'window.SAMPLE_AUDIENCE_CSV = ' + JSON.stringify(csv) + ';\n');
console.log('Wrote ' + rows.length + ' posts from ' + users.length + ' fictional profiles (' + users.filter(u => u.brand).length + ' brand accounts).');
console.log('CSV size: ' + Math.round(Buffer.byteLength(csv) / 1024) + ' KB');
