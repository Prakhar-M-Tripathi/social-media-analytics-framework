# Section C: Demographic Profiling ("Audience Atlas")

- Owner team: (add names)
- Input: `data/posts.csv` (shared contract) when it carries profile fields; otherwise Section C's own sample `sample/audience_sample.csv`. Any CSV can also be loaded in the page.
- Output: an interactive, aggregate-only audience atlas (`index.html`) plus a downloadable summary CSV
- Status: Ready for review

## What the page does

A static, dependency-free GitHub Pages page. Everything is computed in the visitor's browser. The only outside request is the optional Google Fonts stylesheet, and the page falls back to system fonts without it.

- **Audience constellation:** every glowing dot is one anonymous profile. Switch the lens to regroup the dots by language, region, interest, life stage, platform, mood or manner. Tap a trend and everyone who used that hashtag lights up. Hover a cluster for its size, click it to follow that group across the whole page.
- **Arrival replay:** a timeline with an arrival curve replays how the audience first appeared. Every number follows the playhead. Add `?intro=0` to the page address to skip the opening replay.
- **Field notes:** twelve headline figures with ring gauges, written fresh from whatever is on screen.
- **Cast of characters:** group-level personas (for example "The Storyteller, Marketing, Media & Brands, Europe") with their signature bio words and busiest hour.
- **Twelve plates:** Tongues (language), Territories (region), Callings (interest), Seasons (life stage), Rhythm (a 24-hour posting clock and a "who is awake when" heat strip), Reach (follower tiers), Tenure (account age) and Vocabulary (a bio-word cloud). Tap a word and the profiles that use it light up in the constellation. Then Fashions (which groups took up which trends), Temperament (who runs warm or sour), Manners (who starts, answers or passes things on) and Standing ovation (reactions earned per post).
- **Face-off:** pick any two crowds and compare them side by side on ten measures and their own bio words.
- **Habitats** (platform comparison), **Tribes** (largest region and calling pairings) and a four-step "how the atlas is drawn" strip.
- **Save this view** saves the aggregate numbers for whatever is on screen.

## Data

`sample/audience_sample.csv` has 5,221 synthetic posts from 892 fictional profiles on X, Telegram, Instagram, Facebook, YouTube and Reddit over 30 days. Everything in it is fictional. The same file also feeds Section E. It uses the six shared columns plus optional columns:

| Column | Meaning |
|---|---|
| `language` | language tag of the post (some are blank on purpose, so the page has to detect the script) |
| `user_bio` | bio text, with roles, hobbies, hashtags and life-stage hints |
| `user_location` | place as people write it (cities, countries, blanks, a few jokes) |
| `followers` | public follower count |
| `joined` | public join date |
| `interaction` | what the row is: post, reply, quote, repost or share (Section E) |
| `ref_post_id` | the post this one reacts to, for every kind of interaction. `parent_id` stays reply-only, as the contract says (Section E) |
| `sentiment` | positive, neutral or negative, matching the wording of the post (Section E) |

Posting hours follow each profile's local time zone, so activity rhythms differ by region.

- `sample/audience_sample.js`: the same CSV as a script, so the page also works when `index.html` is opened by double-click (browsers block file reads from a file page).
- `make_sample.js`: regenerates both files (`node make_sample.js`). It is seeded, so the output is repeatable.
- Load order: shared `data/posts.csv` (with profile fields, or joined from Section A's `*_post_metadata.csv` by `post_id`), then the sample. Reach and Tenure need `followers` and `joined`; without them those plates say so.

## Privacy rules built into the code

- Dots are anonymous and carry no text. Only group totals are shown or exported.
- Groups with fewer than 5 profiles are merged into "Other (grouped for privacy)" and their size is shown as "<5". A bio word appears only when at least 5 profiles use it.
- Bios, locations and handles are never displayed or exported. Only derived labels are kept in memory.
- Brand or official accounts (for example "Official campaign account") are excluded from audience figures.
- Gender, ethnicity, religion, politics and health are not inferred.

## Files

- `index.html`: the page
- `profiler.js`: analysis logic (runs in the browser and in Node)
- `sample/`: sample data (see above)
- `make_sample.js`, `make_summary.js`: optional helpers (`node make_sample.js`, `node make_summary.js`)
- `output/demographic_summary_sample.csv`, `output/demographic_summary_demo.csv`: aggregate results for the Section C sample and the Section A demo data

## Limits

- The method is transparent keyword rules and writing-script detection, not a trained model. Bios and locations are self-reported, short and sometimes jokes. Rules miss many profiles (the page shows "not available" counts) and can mislabel others.
- One profile is one anonymised `user_id`; the same person on two platforms counts twice.
- In the interest view each dot sits in its primary interest. Profiles can have several, so the Callings shares add up to more than 100%.
- Posting hours are in UTC. The page does not guess a time zone for any profile.
- The sample describes fictional users and only shows that the page works.
- `docs/DATA_CONTRACT.md` lists `language`, `user_bio` and `user_location` as optional. `followers` and `joined` are Section C additions and only appear in `sample/`. Section A's `--publish-shared` currently writes only the six required columns, so for real data the lead should either include the optional columns in `data/posts.csv` or keep publishing Section A's `*_post_metadata.csv`.
- Section A's README says not to infer age from these records. The life-stage plate is aggregate-only and labelled a faint signal. The project lead should confirm whether to keep it.
