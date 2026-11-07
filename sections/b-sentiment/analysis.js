/**
 * Section B's lightweight enrichment layer. All helpers are dependency-free and
 * run locally in the browser; the shared six-column CSV is never modified.
 * @typedef {Object} RawPost
 * @property {string} post_id
 * @property {string} platform
 * @property {string} user_id
 * @property {string} timestamp
 * @property {string} text
 * @property {string} parent_id
 * @typedef {Object} ProcessedPost
 * @property {string} post_id
 * @property {string} platform
 * @property {string} user_id
 * @property {string} timestamp
 * @property {string} text
 * @property {string} parent_id
 * @property {'positive'|'neutral'|'negative'|'unknown'} sentiment
 * @property {number} confidence
 * @property {number} polarity
 * @property {Array<{label:string,score:number}>} emotions
 * @property {string|null} primary_emotion
 * @property {string} intent_class
 * @property {Record<string,number>} aspect_scores
 * @property {number|null} sarcasm_probability
 * @property {number} virality_score
 * @property {string} topic_cluster
 */

export const INTENT_LABELS = ['purchase intent', 'churn risk', 'support request', 'general feedback'];
export const DEFAULT_ASPECTS = ['promo code', 'website', 'spokesperson', 'customer service', 'price', 'product', 'delivery', 'campaign'];
const STOP_WORDS = new Set(('a an and are as at be been but by can could did do does for from had has have he her here hers him his how i if in into is it its just me more most my no not of on or our out they this that the their them then there these those to too up us was we were what when where which who will with would you your about after again all also any because before being both each few further get got having other same she so than through under until very while own campaign post posts x telegram apple coca cola iphone real zero sugar the new great good bad like love').split(' '));
const TOKEN_RE = /[\p{L}\p{N}][\p{L}\p{N}'-]*/gu;

function tokens(text) {
  return (String(text || '').toLocaleLowerCase().match(TOKEN_RE) || []).filter(t => t.length > 2 && !STOP_WORDS.has(t));
}

/** Assign a transparent keyword-rule intent. This is a heuristic, not a model prediction. */
export function classifyIntent(text) {
  const t = String(text || '').toLocaleLowerCase();
  if (/\b(cancel|unsubscribe|switch(ing)?|leaving|leave|won't renew|will not renew|never again|stop using)\b/.test(t)) return 'churn risk';
  if (/\b(help|how do i|how can i|can't (log|access|find)|cannot (log|access|find)|support|issue|problem|broken|not working|error|refund)\b/.test(t)) return 'support request';
  if (/\b(buy|purchase|ordering|order|sign up|signup|subscribe|where can i get|available to buy|promo code|discount)\b/.test(t)) return 'purchase intent';
  return 'general feedback';
}

/** Match configured aspects, assigning each the post's overall sentiment polarity. */
export function extractAspectScores(text, polarity, aspects = DEFAULT_ASPECTS) {
  const normalized = String(text || '').toLocaleLowerCase();
  const scores = {};
  for (const raw of aspects) {
    const aspect = String(raw).trim();
    if (aspect && normalized.includes(aspect.toLocaleLowerCase())) scores[aspect] = Number(polarity) || 0;
  }
  return scores;
}

/** Assign a corpus keyword label; scoring is linear in total text tokens. */
export function assignTopicClusters(posts) {
  const docFreq = new Map();
  const perPost = posts.map(post => {
    const terms = [...new Set(tokens(post.text))];
    terms.forEach(term => docFreq.set(term, (docFreq.get(term) || 0) + 1));
    return terms;
  });
  return posts.map((post, index) => {
    const label = perPost[index].sort((a, b) => (docFreq.get(b) - docFreq.get(a)) || a.localeCompare(b))[0] || 'unclassified';
    return {...post, topic_cluster: label};
  });
}

/**
 * Derive a bounded reply-count proxy (0..1), not platform virality. The six-column
 * contract has no impressions/likes/shares, so only observed in-file replies count.
 */
export function addViralityProxy(posts) {
  const replies = new Map();
  posts.forEach(post => { if (post.parent_id) replies.set(post.parent_id, (replies.get(post.parent_id) || 0) + 1); });
  const counts = posts.map(post => replies.get(post.post_id) || 0).sort((a, b) => a - b);
  const rank = value => {
    let low = 0, high = counts.length;
    while (low < high) { const middle = (low + high) >> 1; if (counts[middle] <= value) low = middle + 1; else high = middle; }
    return Math.max(0, low - 1);
  };
  return posts.map(post => {
    const count = replies.get(post.post_id) || 0;
    return {...post, virality_score: counts.length < 2 ? 0 : rank(count) / (counts.length - 1)};
  });
}

/** Attach all deterministic fields to the existing model outputs. */
export function enrichResults(posts, aspects = DEFAULT_ASPECTS) {
  const enriched = posts.map(post => ({
    ...post,
    primary_emotion: post.emotionScores?.[0]?.label || post.emotions?.[0]?.label || null,
    intent_class: classifyIntent(post.text),
    aspect_scores: extractAspectScores(post.text, post.polarity, aspects),
    sarcasm_probability: null,
    topic_cluster: 'unclassified',
    virality_score: 0
  }));
  return addViralityProxy(assignTopicClusters(enriched));
}

function mean(values) { return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0; }
function sampleStd(values) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  return Math.sqrt(values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (values.length - 1));
}

/** Compare each daily negative count to the preceding rolling baseline only. */
export function detectCrisis(posts, {windowSize = 7, sigma = 2, minBaselineBlocks = 3, minNegativePosts = 3, viralityThreshold = 0.65} = {}) {
  const days = new Map();
  posts.forEach(post => {
    const d = new Date(post.timestamp);
    if (Number.isNaN(d.getTime())) return;
    const key = d.toISOString().slice(0, 10);
    if (!days.has(key)) days.set(key, {negative: [], all: []});
    const bucket = days.get(key); bucket.all.push(post);
    if (post.sentiment === 'negative') bucket.negative.push(post);
  });
  const dates = [...days.keys()].sort();
  const blocks = dates.map((date, index) => {
    const bucket = days.get(date), history = dates.slice(Math.max(0, index - windowSize), index).map(d => days.get(d).negative.length);
    const baseline = mean(history), sd = sampleStd(history), averageVirality = mean(bucket.negative.map(p => p.virality_score || 0));
    const isCrisis = history.length >= minBaselineBlocks && bucket.negative.length >= minNegativePosts && bucket.negative.length > baseline + sigma * sd && averageVirality >= viralityThreshold;
    return {date, negativeCount: bucket.negative.length, baselineMean: baseline, baselineStdDev: sd, averageVirality, isCrisis};
  });
  const alerts = blocks.filter(block => block.isCrisis).map(block => ({
    date: block.date, negativePosts: block.negativeCount, expectedNegativePosts: Number(block.baselineMean.toFixed(2)),
    baselineStdDev: Number(block.baselineStdDev.toFixed(2)), averageReplyViralityProxy: Number(block.averageVirality.toFixed(2)),
    rule: `Negative post count exceeded rolling baseline by ${sigma} standard deviations and reply proxy met ${viralityThreshold}.`
  }));
  return {isCrisis: alerts.length > 0, alertPayload: alerts, blocks};
}

/** Build a compact template-based summary from day-over-day emotion shifts. */
export function createExecutiveSummary(posts, crisis = detectCrisis(posts)) {
  if (!posts.length) return 'Load and analyze posts to generate an executive summary.';
  const days = new Map();
  posts.forEach(post => {
    const date = new Date(post.timestamp);
    if (Number.isNaN(date.getTime())) return;
    const key = date.toISOString().slice(0, 10);
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(post);
  });
  const dates = [...days.keys()].sort();
  const intentCounts = new Map(), topicCounts = new Map();
  posts.forEach(p => { intentCounts.set(p.intent_class, (intentCounts.get(p.intent_class) || 0) + 1); topicCounts.set(p.topic_cluster, (topicCounts.get(p.topic_cluster) || 0) + 1); });
  const topIntent = [...intentCounts].sort((a,b)=>b[1]-a[1])[0]?.[0] || 'general feedback';
  const topTopic = [...topicCounts].filter(([name])=>name!=='unclassified').sort((a,b)=>b[1]-a[1])[0]?.[0] || 'the conversation';
  let shift = null;
  for (let i = 1; i < dates.length; i++) {
    const previous = days.get(dates[i - 1]), current = days.get(dates[i]);
    const previousEmotion = new Map(), currentEmotion = new Map();
    previous.forEach(p => { if (p.primary_emotion) previousEmotion.set(p.primary_emotion, (previousEmotion.get(p.primary_emotion)||0)+1); });
    current.forEach(p => { if (p.primary_emotion) currentEmotion.set(p.primary_emotion, (currentEmotion.get(p.primary_emotion)||0)+1); });
    for (const emotion of new Set([...previousEmotion.keys(), ...currentEmotion.keys()])) {
      const delta = (currentEmotion.get(emotion)||0)/current.length - (previousEmotion.get(emotion)||0)/previous.length;
      if (!shift || Math.abs(delta) > Math.abs(shift.delta)) shift = {date: dates[i], emotion, delta};
    }
  }
  if (!shift) return `Most common intent was ${topIntent}; the leading keyword topic was “${topTopic}”. More than one date is needed to calculate an emotion shift.`;
  const direction = shift.delta > 0 ? 'increased' : shift.delta < 0 ? 'decreased' : 'was unchanged';
  const alertText = crisis.isCrisis ? ` Crisis alert: negative volume exceeded its rolling baseline on ${crisis.alertPayload.map(a=>a.date).join(', ')}.` : ' No crisis rule triggered.';
  return `On ${shift.date}, ${shift.emotion} signals ${direction} by about ${Math.round(Math.abs(shift.delta)*100)} percentage points versus the prior day. The leading keyword topic was “${topTopic}” and the most common intent cue was ${topIntent}.${alertText}`;
}
