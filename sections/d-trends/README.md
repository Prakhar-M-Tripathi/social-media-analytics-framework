# Section D: Trend and Topic Detection

- Owner team: Prinshu Somay
- Input: `data/posts.csv` (shared six columns). Until it exists, the Dataset menu offers two practice datasets: the built in Section D scenario (`scenario.js`) and Section A's `demo_posts.csv`. Any CSV with `text` and `timestamp` can also be loaded from the page.
- Output: interactive dashboard in `index.html` plus a downloadable CSV of ranked topics
- Status: Ready for review

## What the page shows
1. **Early warnings**: topics, keywords or hashtags whose latest complete time step is at least 3 standard deviations above normal (and at least 5 posts).
2. **Rising topics ranked**: posts grouped into topics with keywords, posts, unique users, trend score, z score, confidence (High, Medium, Low), burst, momentum, status (Rising, Steady, Falling, New) and a Likely to rise prediction.
3. **Topic timeline**: posts per topic per step, a 3 step forecast and a shaded likely range. Topics can be hidden from the legend.
4. **Top rising keywords** and **fading keywords**, both tested for statistical significance.
5. **Emerging terms**: terms that were absent before and appear repeatedly in the recent window.
6. **Hashtags**: usage, growth and the platform where each is used most.
7. **Topics across platforms**: heatmap of each topic's platform share, the platform where it started and when it was first seen.
8. **Shifting discussions**: each topic's share of conversation in the first half vs second half.
9. **Forecast accuracy check**: backtest that hides the last 3 steps, forecasts them and reports average error, volume accuracy, direction accuracy and range coverage, compared with a simple guess.
10. **Topic details**: keywords, size, replies, platforms, start, busiest step, forecast with range, related topics (shared users) and latest example posts.

Filters: dataset, platform, date range, time step (auto, hour, day, week). Results can be downloaded as CSV.

## Practice datasets
- **Section D scenario** (`scenario.js`, synthetic): about 5,000 posts over 45 days on X, Telegram, Instagram, Facebook, Reddit and YouTube, from about 1,500 anonymous accounts, in English, Hinglish and Hindi. It is generated in the browser with a fixed seed, so it is the same every time. It contains known events so the results can be checked: a petrol price hike rumour that starts on Telegram and spreads, a one day UPI outage spike, an exam paper leak that peaks and fades, onion prices appearing in the last week, a growing Diwali sale topic, steady background topics, and a few accounts copy pasting the rumour.
- **Section A demo posts** (`demo_posts.csv`, synthetic): about 2,000 posts from Section A's pipeline demo.

## Method
- Cleaning: lower case; links, mentions, numbers and stop words (English, Hindi, Hinglish, Spanish) removed. Hindi script is kept. The same text repeated by the same account is counted once.
- Topics: frequent terms that appear in the same posts are merged by co occurrence (Jaccard similarity above 0.3). Each post goes to the topic it matches best, weighted by IDF.
- Trend score: average posts per step in the last 25% of the period ÷ average before it (+1 smoothing).
- Significance: Poisson z test of recent posts against the earlier rate. High confidence z ≥ 3, Medium z ≥ 2. Rising needs trend score ≥ 1.2 and z ≥ 2; Falling needs ≤ 0.83 and z ≤ −2.
- Burst: standard deviations of the latest complete step above the earlier average.
- Forecast: damped trend Holt exponential smoothing, with weights tuned per topic by grid search on one step ahead error; range = ±1.64 × error standard deviation (about 90%).
- A newest time step that is less than half complete is left out of scores and forecasts.

## Validation
- Tested on a synthetic file with a planted rising topic (petrol price, growing after day 20), a one day spike (bank outage) and four stable topics. The page ranked petrol price first (Rising, High confidence, Likely to rise), flagged the bank outage as New with an early warning, and kept all four stable topics Steady.
- On the Section D scenario the page finds every planted event: petrol price hike (Rising, High confidence, started on Telegram), UPI (New, early warning), onion prices and Diwali sale (Rising), paper leak (Falling), and the background topics stay Steady.
- Forecast accuracy figures are shown live on the page for whichever dataset is selected.

Everything runs in the visitor's browser with plain JavaScript. No server, API key or library download is needed, so it works on GitHub Pages.

## Limits
- Topic labels come from the most common phrase in each topic and may need a human rename. A big topic can sometimes split into two (for example cricket posts in English and in Hindi).
- Forecasts are short term statistical estimates, not certainties.
- On the synthetic demo data the trends are artificial; real results come once `data/posts.csv` is published.

## Files produced
- `index.html`: Section D dashboard
- `scenario.js`: Section D practice scenario dataset
- `README.md`: this file
