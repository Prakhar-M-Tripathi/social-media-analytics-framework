// Optional helper: saves aggregate network results for the shared sample.
// Run from this folder with Node 16 or newer:   node make_summary.js
// The website does not need this file. It only saves a copy of the aggregate results.
const fs = require('fs');
const path = require('path');
const P = require('../c-demographics/profiler.js');
const N = require('./network.js');

const rows = P.parseCSV(fs.readFileSync(path.join(__dirname, '..', 'c-demographics', 'sample', 'audience_sample.csv'), 'utf8'));
const t0 = Date.now();
const G = N.build(rows, P);
const ms = Date.now() - t0;
fs.mkdirSync(path.join(__dirname, 'output'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'output', 'network_summary_sample.csv'), '﻿' + N.csvText(N.summaryRows(G)));

console.log('Built in ' + ms + ' ms from ' + rows.length + ' rows');
console.log(JSON.stringify(G.stats));
console.log('Circles:', G.comms.map(c => c.name + ' ' + c.size + ' (' + Math.round(100 * c.internal / Math.max(1, c.all)) + '% in)').join('; '));
console.log('Top by weight:', G.audienceLinked.slice().sort((a, b) => b.pr - a.pr).slice(0, 6).map(n => n.name + ' [' + n.role + ']').join(', '));
console.log('Top by bridge:', G.audienceLinked.slice().sort((a, b) => b.bc - a.bc).slice(0, 6).map(n => n.name + ' [' + n.role + ', touches ' + n.circlesTouched + ']').join(', '));
console.log('Cascades:', G.cascades.slice(0, 6).map(c => (c.tag || 'untagged') + ' size ' + c.size + ' depth ' + c.depth + ' virality ' + c.virality + ' on ' + c.platforms.length).join('; '));
console.log('Trends:', G.trends.map(t => t.tag + ' ' + t.n + 'p ' + t.voiceCount + 'v ' + t.avgMood.toFixed(2)).join('; '));
const r = N.relay(G, G.trends[0].tag, 'platform');
console.log('Relay', r.tag, r.span + ' days:', r.rows.map(x => x.label + ' ' + x.n).join(', '));
const sup = N.relay(G, '#SupportStory', 'platform');
if (sup) console.log('#SupportStory mood by day:', sup.moodDay.map(d => d.count ? (d.sum / d.count).toFixed(1) : '.').join(' '));
['platform', 'region', 'calling', 'circle'].forEach(d => { const m = N.mixing(G, d, 30); console.log('Mixing', d, 'inside', m.inside + '%', 'expected', m.expected + '%', m.labels.length, 'groups'); });
console.log('Border total', N.borderFlows(G).total, '| alpha', N.degreeDist(G).alpha);
console.log('Mood contagion', JSON.stringify(N.moodContagion(G).matrix));
console.log('Speed', JSON.stringify(N.replySpeed(G).byType.all), 'median h', N.replySpeed(G).median.toFixed(1));
const rb = N.robustness(G);
console.log('Robustness at 10%: bridge', rb.bridge[4].toFixed(2), 'loud', rb.loud[4].toFixed(2), 'random', rb.random[4].toFixed(2));
const top = G.audienceLinked.slice().sort((a, b) => b.pr - a.pr)[0];
const o = N.whisperOdds(G, top.i, 0.2, 200);
console.log('Whisper from', top.name, 'median', o.median, 'p10', o.p10, 'p90', o.p90);
const a = G.audienceLinked[3], b = G.audienceLinked[300];
console.log('Path', a.name, '->', b.name, (N.shortestPath(G, a.i, b.i) || []).length - 1, 'hops');
console.log('Notes:'); N.notes(G).forEach(n => console.log('  [' + n.kick + '] ' + n.fig + n.unit + ' ' + n.head + ' | ' + n.text));
