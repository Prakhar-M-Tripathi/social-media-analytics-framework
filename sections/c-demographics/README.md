# Section C: Demographic Profiling ("Audience Atlas")

- Owner team: (add names)
- Input: `data/posts.csv` (shared contract) when it carries profile fields; otherwise Section C's own sample `sample/audience_sample.csv`. Any CSV can also be loaded in the page.
- Output: an interactive, aggregate-only audience dashboard (`index.html`) plus a downloadable summary CSV
- Status: Ready for review

## What the page does

A static, dependency-free GitHub Pages page (no CDN, no model download, no server). Everything is computed in the visitor's browser.

- **Audience constellation:** every glowing dot is one anonymous profile. Switch the lens to regroup the dots by **language, region, interest, life stage or platform**. Hover a cluster for its size, click it to **focus the whole page** on that group.
- **Arrival replay:** a timeline with an arrival curve replays how the audience first appeared. Play, pause or scrub, and every number on the page follows the timeline. Add `?intro=0` to the page address to skip the opening replay.
- **Key findings** written from the current view, and **audience personas** (for example "The Storyteller, Marketing, Media & Brands, Europe"): group-level archetypes built from the largest region and interest segments.
- **Detail panels** for languages, regions, professional interests and life-stage cues, a **platform comparison**, and a **segments table**.
- **Export this view** saves the aggregate numbers for whatever is on screen.

## Data

- `sample/audience_sample.csv`: 1,354 synthetic posts from 652 fictional profiles on X, Telegram, Instagram, Facebook, YouTube and Reddit over 30 days. It uses the six shared columns plus the optional `language`, `user_bio` and `user_location`. Everything in it is fictional.
- `sample/audience_sample.js`: the same CSV as a script, so the page also works when `index.html` is opened by double-click (browsers block file reads from a file page).
- `make_sample.js`: regenerates both files (`node make_sample.js`). It is seeded, so the output is repeatable.
- Load order: shared `data/posts.csv` (with profile fields, or joined from Section A's `*_post_metadata.csv` by `post_id`) then the sample.

## Privacy rules built into the code

- Dots are anonymous and carry no text. Only group totals are shown or exported.
- Groups with fewer than 5 profiles are merged into "Other (grouped for privacy)" and their size is shown as "<5".
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
- In the interest view each dot sits in its primary interest. Profiles can have several, so the interest panel shares add up to more than 100%.
- The sample describes fictional users and only shows that the page works.
- `docs/DATA_CONTRACT.md` lists the three profile columns as optional. Section A's `--publish-shared` currently writes only the six required columns, so for real data the lead should either include those columns in `data/posts.csv` or keep publishing Section A's `*_post_metadata.csv`.
- Section A's README says not to infer age from these records. The life-stage panel is aggregate-only and labelled a weak signal. The project lead should confirm whether to keep it.
