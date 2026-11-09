# Section D: Trend and Topic Detection

- Owner team: Prinshu Somay
- Input: `data/posts.csv` (shared six columns). Until it exists, the page uses `sections/a-data-collection/output/demo_posts.csv`. Any CSV with `text` and `timestamp` can also be loaded from the page.
- Output: interactive dashboard in `index.html` plus a downloadable CSV of ranked topics
- Status: Ready for review

## What the page shows
1. **Rising topics ranked**: posts grouped into topics, each with keywords, post count, trend score, burst score, status (Rising, Steady, Falling, New) and a prediction (Likely to rise).
2. **Topic timeline**: posts per topic per time step, with a dotted 3 step forecast.
3. **Top trending keywords**: words and two word phrases ranked by growth.
4. **Hashtags**: most used hashtags and their growth.
5. **Shifting discussions**: each topic's share of conversation in the first half vs second half of the period.
6. **Topic details**: keywords, platforms, busiest step, forecast and latest example posts.

Filters: platform, time step (auto, hour, day, week).

## Method
- Cleaning: lower case, remove links, mentions and stop words (English, Hindi, Hinglish, Spanish). Hindi script is kept.
- Topics: frequent terms that appear in the same posts are merged by co occurrence (Jaccard similarity above 0.3). Each post is assigned to the topic it matches best, weighted by how rare each term is (IDF).
- Trend score: average posts per step in the last 25% of the period, divided by the average before it, both plus 1 for smoothing. Above 1.2 is Rising, below 0.83 is Falling.
- Burst score: how many standard deviations the latest step is above the topic's earlier average.
- Prediction: straight line fitted to the last 7 steps, extended 3 steps. Likely to rise when the slope is clearly positive and the trend score is above 1.

Everything runs in the visitor's browser with plain JavaScript. No server, API key or library download is needed, so it works on GitHub Pages.

## Limits
- Topic labels come from the most common phrase in each topic and may need a human rename.
- The forecast is a simple straight line, good for short term direction, not exact numbers.
- On the synthetic demo data the trends are artificial; real results come once `data/posts.csv` is published.

## Files produced
- `index.html`: Section D dashboard
- `README.md`: this file
