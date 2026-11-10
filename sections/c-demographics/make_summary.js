// Optional helper: saves aggregate results for the two datasets available offline.
// Run from this folder with Node 16 or newer:   node make_summary.js
// The website does not need this file. It only saves a copy of the aggregate results.
const fs = require('fs');
const path = require('path');
const P = require('./profiler.js');

function save(name, summary) {
  fs.mkdirSync(path.join(__dirname, 'output'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'output', name), '﻿' + P.csvText(P.toCsvRows(summary)));
}

function report(title, s) {
  console.log('\n=== ' + title);
  console.log('Profiles: ' + s.profiles + ' (audience ' + s.audience + ', brand accounts ' + s.organisations + '), posts ' + s.posts);
  console.log('Coverage %:', JSON.stringify(s.coverage));
  ['language', 'region', 'interest', 'age', 'reach', 'tenure'].forEach(function (d) {
    console.log(d + ' (known ' + s[d].known + ', not available ' + s[d].unknown + '): ' +
      s[d].items.map(function (i) { return i.label + ' ' + (i.hidden ? '<' + s.k : i.n); }).join('; '));
  });
  console.log('Top words:', s.words.slice(0, 12).map(function (w) { return w.word + ' ' + w.n; }).join(', '));
  console.log('Peak hour (UTC):', P.peakHour(s.hours));
  console.log('Top segments:', s.segments.slice(0, 3).map(function (g) { return g.region + ' / ' + g.interest + ' / ' + g.language + ' (' + g.n + ') ' + g.words.join('+'); }).join('; '));
  console.log('Field notes:'); s.notes.forEach(function (n) { console.log('  [' + n.kicker + '] ' + n.fig + n.unit + ' ' + n.headline + ' | ' + n.text); });
}

// 1. Section C's own sample audience
const sample = P.parseCSV(fs.readFileSync(path.join(__dirname, 'sample', 'audience_sample.csv'), 'utf8'));
const s1 = P.summarize(sample, 'all');
save('demographic_summary_sample.csv', s1);
report('Section C sample (' + sample.length + ' posts)', s1);

// 2. Section A synthetic demo (profile fields joined from the sidecar by post_id)
const a = path.join(__dirname, '..', 'a-data-collection', 'output');
if (fs.existsSync(path.join(a, 'demo_posts.csv'))) {
  const posts = P.parseCSV(fs.readFileSync(path.join(a, 'demo_posts.csv'), 'utf8'));
  const meta = P.parseCSV(fs.readFileSync(path.join(a, 'demo_post_metadata.csv'), 'utf8'));
  P.mergeProfileFields(posts, meta);
  const s2 = P.summarize(posts, 'all');
  save('demographic_summary_demo.csv', s2);
  report('Section A demo (' + posts.length + ' posts)', s2);
}
