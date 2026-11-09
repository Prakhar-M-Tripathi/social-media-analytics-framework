# Section E: Network and Influence Analysis ("The Grapevine")

- Owner team: (add names)
- Input: `data/posts.csv` when it has at least 30 links; otherwise the shared sample at `../c-demographics/sample/audience_sample.csv`, the same file Section C reads. Any CSV can also be loaded in the page.
- Output: an interactive network atlas (`index.html`) plus a downloadable summary CSV
- Status: Ready for review

## What the page does

A static GitHub Pages page. Everything is computed in the visitor's browser. The only outside request is the optional Google Fonts stylesheet, and the page falls back to system fonts without it.

**The living network**, with three arrangements (Web, Orbits, Islands), four colourings (Circle, Platform, Role, Mood), pan and zoom, and five tools:

| Tool | What you do |
|---|---|
| Explore | Watch the network grow over time, or click a voice to open its dossier |
| Replay a trend | Pick a hashtag and watch it spread hop by hop, coloured by mood |
| Whisper | Release a simulated rumour from any voice, tune how catching it is, compare with 200 runs |
| Cut the wires | Remove bridges, the loudest voices or random voices and watch the network break |
| Six degrees | Click two voices to see the shortest route between them |

**Below the stage:** Overheard (headline findings written from the numbers), The whisperers (top voices by four measures), and eleven plates: Four ways to matter, The cast, Anatomy of a vine, The relay, Neighbourhoods, Who answers whom, Border crossings, Mood is catching, The waiting room, The long tail, and The breaking point.

## Methods

PageRank, Brandes betweenness, k-core, Louvain community detection, cascade reconstruction with structural virality, independent-cascade simulation, targeted and random knock-out, a mixing matrix with expected-by-chance baseline, and a power-law slope estimate.

Region and interest labels come from Section C's `profiler.js`, so both sections read people the same way.

## Data

The dataset is `../c-demographics/sample/audience_sample.csv`. Section E uses these optional columns:

| Column | Meaning |
|---|---|
| `interaction` | post, reply, quote, repost or share |
| `ref_post_id` | the post this one reacts to, for every kind of interaction |
| `sentiment` | positive, neutral or negative |

Hashtags in `text` are the trends. A plain six-column file also works: replies come from `parent_id`, and the mood plates say they have no data.

## Privacy rules built into the code

- Every voice appears only under a generated codename such as "Amber Heron". Bios, locations and user IDs are read once to derive labels and then dropped.
- Dossiers show network measures only.
- Groups under 5 people are folded away.
- Gender, ethnicity, religion, politics and health are not inferred.

## Files

- `index.html`: the page and its styles
- `grapevine.js`: stage, tools and plates
- `network.js`: analysis engine (runs in the browser and in Node)
- `make_summary.js`: optional helper that regenerates the saved summary (`node make_summary.js`)
- `output/network_summary_sample.csv`: aggregate results for the shared sample

## Limits

- The sample describes fictional people, and its network structure was generated. It shows that the page works and says nothing about a real audience.
- `sentiment` in the sample is a label matched to the wording. On real data it should come from Section B.
- A reply, quote, repost or share is evidence of one public event, not of friendship or endorsement.
- Whisper shows what could happen under a simple contagion model. It is not a forecast.
- This page depends on Section C's `profiler.js` and sample file, so Section C's folder must be present.
