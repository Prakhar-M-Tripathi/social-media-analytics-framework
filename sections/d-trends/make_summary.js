// Optional helper: saves the trend results for the two datasets available offline and
// checks the Section D sample against the events planted in it.
// Run from this folder with Node 18 or newer:   node make_summary.js
// The website does not need this file. It only saves a copy of the results.
const fs = require('fs');
const path = require('path');
const T = require('./trends.js');

function save(name, rows) {
  fs.mkdirSync(path.join(__dirname, 'output'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'output', name), T.toCSV(rows));
}

function report(title, R) {
  console.log('\n=== ' + title);
  console.log('Posts ' + R.posts.length + ' (' + R.dupes + ' repeats ignored), ' + R.steps + ' ' + R.bucket + ' steps' + (R.partial ? ', newest one partial' : ''));
  R.topics.forEach((t, i) => console.log((i + 1) + '. ' + t.label + ': ' + t.status + ', trend ' + t.score.toFixed(2) + 'x, z ' + t.z.toFixed(1) + ' (' + t.conf + ')' + (t.likely ? ', likely to rise' : '') + ', started on ' + t.firstPlatform));
  if (R.bt) console.log('Forecast check: error ' + R.bt.mae.toFixed(2) + ' posts per step vs simple guess ' + R.bt.naive.toFixed(2) + ', direction right ' + (R.bt.dir === null ? 'n/a' : Math.round(R.bt.dir * 100) + '%') + ', inside range ' + Math.round(R.bt.cover * 100) + '%');
}

function run(file, tag, title) {
  const R = T.analyse(T.prepare(T.parseCSV(fs.readFileSync(file, 'utf8'))), { bucket: 'auto' });
  save('trending_topics_' + tag + '.csv', T.topicRows(R));
  save('trending_keywords_' + tag + '.csv', T.keywordRows(R));
  report(title, R);
  return R;
}

// 1. Section D's own sample, then check that every planted event is found
const R = run(path.join(__dirname, 'sample', 'trend_sample.csv'), 'sample', 'Section D sample (sample/trend_sample.csv)');
const find = word => R.topics.find(t => t.keywords.some(k => k.includes(word)));
const checks = [
  ['Petrol rumour is rising', () => { const t = find('petrol'); return t && t.status === 'rise' && t.conf === 'High'; }],
  ['Petrol rumour started on Telegram', () => { const t = find('petrol'); return t && t.firstPlatform === 'Telegram'; }],
  ['UPI outage gives an early warning', () => R.alerts.some(a => /upi/i.test(a.name))],
  ['Onion prices are rising', () => { const t = find('onion'); return t && (t.status === 'rise' || t.status === 'new'); }],
  ['Diwali sale is rising', () => { const t = find('diwali'); return t && t.status === 'rise'; }],
  ['Paper leak is falling', () => { const t = find('leak'); return t && t.status === 'fall'; }],
  ['Background topics stay steady', () => ['cricket', 'weather', 'metro', 'phone', 'series'].every(w => { const t = find(w); return !t || t.status === 'steady'; })],
  ['Copy pasted repeats are ignored', () => R.dupes > 0]
];
console.log('\nPlanted event check:');
let pass = 0;
checks.forEach(([name, fn]) => { const ok = !!fn(); if (ok) pass++; console.log((ok ? '  PASS  ' : '  FAIL  ') + name); });
console.log('  ' + pass + ' of ' + checks.length + ' passed');

// 2. Section A's demo data, if this folder sits inside the project
const demo = path.join(__dirname, '..', 'a-data-collection', 'output', 'demo_posts.csv');
if (fs.existsSync(demo)) run(demo, 'demo', 'Section A demo posts');
