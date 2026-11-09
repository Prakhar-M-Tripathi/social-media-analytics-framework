# Section D: Trend and Topic Detection ("Trend Radar")

- Owner team: Prinshu Somay
- Input: `data/posts.csv` (shared contract, six columns). Until it exists, Section D's own sample `sample/trend_sample.csv` or Section A's demo posts.
- Output: an interactive trend dashboard (`index.html`) plus saved CSVs of ranked topics and keywords in `output/`
- Status: Ready for review

## What the page does

A static, dependency free GitHub Pages page (no CDN, no model download, no server). Everything is computed in the visitor's browser by `trends.js`.

- **Early warnings:** topics, keywords and hashtags whose latest complete time step is at least 3 standard deviations above their normal level (and at least 5 posts).
- **Rising topics ranked:** posts grouped into topics, each with keywords, posts, unique users, trend score, z score, confidence (High, Medium, Low), burst, momentum, status (Rising, Steady, Falling, New) and a Likely to rise prediction.
- **Topic timeline:** posts per topic per step, a 3 step forecast and a shaded likely range. Click a legend name to hide or show a topic.
- **Rising keywords**, **fading keywords** and **emerging terms** (absent before, now repeated), all tested for significance.
- **Hashtags:** usage, growth and the platform where each is used most.
- **Topics across platforms:** heatmap of each topic's platform share, the platform where it started and when.
- **Shifting discussions:** each topic's share of the conversation in the first half vs the second half.
- **Forecast accuracy check:** hides the last 3 steps, forecasts them and compares with what happened and with a simple guess.
- **Topic details:** size, replies, platforms, start, busiest step, forecast with range, related topics (shared users) and example posts.
- Filters: dataset, platform, date range, time step (auto, hour, day, week).
- The page only reads the project's own files (no upload). Saved results are made by `node make_summary.js` into `output/`.

## Data

- `sample/trend_sample.csv`: 5,072 synthetic posts from about 1,500 fictional accounts on X, Telegram, Instagram, Facebook, Reddit and YouTube over 45 days (25 Sep to 8 Nov 2026), in English, Hinglish and Hindi. It uses the six shared columns. Everything in it is fictional. It contains known events so the results can be checked: a petrol price hike rumour that starts on Telegram and spreads, a one day UPI outage, an exam paper leak that peaks and fades, onion prices appearing in the last week, a growing Diwali sale, steady background topics, and a few accounts copy pasting the rumour.
- `sample/trend_sample.js`: the same CSV as a script, so the page also works when `index.html` is opened by double click (browsers block file reads from a file page).
- `make_sample.js`: regenerates both files (`node make_sample.js`). It is seeded, so the output is repeatable.
- Load order: shared `data/posts.csv`, then the Section D sample, then Section A's `demo_posts.csv` (all three can be picked from the Dataset menu).

## Method

- **Cleaning:** lower case; links, mentions, numbers and stop words (English, Hindi, Hinglish, Spanish) removed. Hindi script is kept. The same text repeated by the same account is counted once.
- **Topics:** frequent terms, plus terms growing fastest in the recent window, are merged when they appear in the same posts (Jaccard similarity above 0.3). Each post goes to the topic it matches best, weighted by IDF. Topics are ranked by size with extra weight for recent posts, so a small new topic is not missed.
- **Trend score:** average posts per step in the last 25% of the period ÷ average before it (+1 smoothing).
- **Significance:** Poisson z test of recent posts against the earlier rate. High confidence z ≥ 3, Medium z ≥ 2. Rising needs trend score ≥ 1.2 and z ≥ 2; Falling needs ≤ 0.83 and z ≤ −2.
- **Burst:** standard deviations of the latest complete step above the earlier average (never below Poisson noise).
- **Forecast:** damped trend Holt exponential smoothing, weights tuned per topic by grid search on one step ahead error; range = ±1.64 × error standard deviation (about 90%).
- A newest time step that is less than half complete is left out of scores and forecasts.

## Validation

`node make_summary.js` checks the sample against its planted events. Current result: **8 of 8 passed**.

| Planted event | Result |
|---|---|
| Petrol rumour rising, High confidence | PASS |
| Petrol rumour started on Telegram | PASS |
| UPI outage gives an early warning | PASS |
| Onion prices rising | PASS |
| Diwali sale rising | PASS |
| Paper leak falling | PASS |
| Background topics stay steady | PASS |
| Copy pasted repeats ignored | PASS |

Forecast check (last 3 days hidden): on the Section D sample the forecast error is about the same as the simple guess (5.4 vs 5.4 posts per day) with 78% of real values inside the range; on Section A's demo it is slightly better than the simple guess (2.7 vs 2.7) with 89% inside the range.

## Privacy rules built into the code

- Only counts, scores and group totals are shown or exported. Author IDs are the anonymised IDs from the shared data and are never displayed.
- Example posts are shown with handles, links, e-mail addresses and phone numbers masked.
- No demographic, sentiment or personal attributes are inferred in this section.

## Files

- `index.html`: the page
- `trends.js`: analysis logic (runs in the browser and in Node)
- `sample/`: sample data (see above)
- `make_sample.js`, `make_summary.js`: optional helpers (`node make_sample.js`, `node make_summary.js`)
- `output/trending_topics_sample.csv`, `output/trending_keywords_sample.csv`: results for the Section D sample
- `output/trending_topics_demo.csv`, `output/trending_keywords_demo.csv`: results for Section A's demo data

## Limits

- The method is transparent word counting and statistics, not a trained model. Topics are word patterns, so sarcasm, spelling variants and very short posts can be grouped imperfectly.
- Topic labels come from the most common phrase in each topic and may need a human rename. A big topic can split into two (for example cricket posts in English and in Hindi).
- Forecasts are short term statistical estimates, not certainties.
- The samples describe fictional users and only show that the page works. Real results come once `data/posts.csv` is published.
