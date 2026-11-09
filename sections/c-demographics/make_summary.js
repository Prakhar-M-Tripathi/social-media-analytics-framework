// Optional helper: builds output/demographic_summary_demo.csv from the Section A demo data.
// Run from this folder with Node 16 or newer:   node make_summary.js
// The website does not need this file. It only saves a copy of the aggregate results.
const fs = require('fs');
const path = require('path');
const P = require('./profiler.js');

const a = path.join(__dirname, '..', 'a-data-collection', 'output');
const posts = P.parseCSV(fs.readFileSync(path.join(a, 'demo_posts.csv'), 'utf8'));
const meta = P.parseCSV(fs.readFileSync(path.join(a, 'demo_post_metadata.csv'), 'utf8'));
const matched = P.mergeProfileFields(posts, meta);

const summary = P.summarize(posts, 'all');
fs.mkdirSync(path.join(__dirname, 'output'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'output', 'demographic_summary_demo.csv'), '﻿' + P.csvText(P.toCsvRows(summary)));

console.log('Posts: ' + posts.length + ', enriched from sidecar: ' + matched);
console.log('Profiles: ' + summary.profiles + ' (audience ' + summary.audience + ', brand accounts ' + summary.organisations + ')');
console.log('Coverage %:', JSON.stringify(summary.coverage));
['language', 'region', 'interest', 'age'].forEach(function (d) {
  console.log('\n' + d + ' (known ' + summary[d].known + ', not available ' + summary[d].unknown + ')');
  summary[d].items.forEach(function (i) { console.log('  ' + i.label + ': ' + (i.hidden ? '<' + summary.k : i.n) + ' (' + i.share + '%)'); });
});
console.log('\nSegments:'); summary.segments.forEach(function (s) { console.log('  ' + s.region + ' / ' + s.interest + ' / ' + s.language + ': ' + s.n); });
console.log('\nInsights:'); summary.insights.forEach(function (l) { console.log('  - ' + l); });
console.log('\nPlatforms: ' + summary.platforms.join(', '));
