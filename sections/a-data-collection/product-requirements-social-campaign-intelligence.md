# Product Requirements Specification: Social Campaign Intelligence

**Status:** Product concept synthesized from stakeholder dictation  
**Audience:** Product, design, data engineering, ML/AI, analytics, privacy, and Codex implementation teams  
**Document purpose:** Translate the product concept into a buildable specification. This document describes expected product behavior; platform access, legal review, and source-specific data availability must be confirmed before implementation.

## 1. Product summary

Build a social campaign intelligence product that collects public or otherwise authorized social content in near real time, connects relevant posts to campaigns and products, analyzes what people are saying, detects topics and competitive movement, and explains how conversations spread through observable account and post relationships.

The product should help a user answer:

1. What relevant posts, comments, hashtags, and keywords are appearing now?
2. What do people think and feel about a particular campaign, brand, product, or claim?
3. Which topics and campaigns are gaining attention, and how is our campaign performing relative to competitors?
4. How did the conversation travel from an official account or campaign asset to other posts and accounts?
5. What can be responsibly summarized about the audience, with clear separation between known, self-declared, and uncertain information?

The product is an analytics and decision-support system. It must distinguish observed facts from model inferences, preserve links to source evidence where permitted, and communicate uncertainty. It must not present demographic guesses or inferred social relationships as verified facts.

## 2. Goals and boundaries

### Goals

- Monitor configured campaigns, products, brands, keywords, and hashtags continuously or at a source-supported polling interval.
- Discover relevant discussion beyond exact hashtag matches, while showing why content was included.
- Produce contextual, multi-label sentiment and emotion analysis at post and comment level.
- Detect trends, emerging topics, campaign share of voice, and measurable narrative change over time.
- Visualize observable propagation paths and distinguish them from inferred relationships.
- Provide aggregate audience insights only when supported by authorized, sufficiently reliable data.
- Make the outputs usable by analysts through dashboards, search, alerts, exports, and documented metrics.

### Out of scope unless separately approved

- Scraping or collecting data contrary to platform terms, access controls, user consent, or applicable law.
- Identifying anonymous users, deanonymizing accounts, or linking accounts across services without an authorized basis.
- Treating inferred age, marital status, location, or other personal attributes as ground truth.
- Claiming causality between a campaign and a trend solely because the trend changed after launch.
- Predicting an individual's behavior, beliefs, or sensitive personal characteristics for targeting or eligibility decisions.

## 3. Users and key workflows

### Primary users

- **Campaign analyst:** configures monitoring, reviews sentiment and topics, compares campaigns, and explains changes.
- **Brand or marketing lead:** checks campaign reach, audience response, competitive position, and emerging issues.
- **Research/insights lead:** validates evidence, examines audience-level aggregates, and exports defensible findings.
- **Administrator:** configures sources, permissions, retention, access, and alert policies.

### Core workflow

1. Create a campaign workspace with brand/product entities, official accounts, campaign dates, known campaign assets, keywords, hashtags, language/region, competitors, and collection scope.
2. Connect authorized data sources and select the available collection mode and fields.
3. Preview inclusion rules and sample matches; refine terms and exclusions before activating collection.
4. Monitor incoming content, connected-content discovery, processing status, and source coverage.
5. Review sentiment, emotions, topics, trends, competitive metrics, and network paths with evidence and confidence indicators.
6. Investigate a change by opening the underlying posts and their observable relationships, subject to source permissions.
7. Export a report with metric definitions, date range, source coverage, and caveats.

## 4. Shared concepts and data model

The implementation should use stable identifiers and represent at least these entities:

- **Workspace / Campaign:** name, owner, goals, start/end dates, campaign assets, official accounts, products, competitors, configured queries, locales, and status.
- **Source / Platform:** platform identifier, access method, permissions, field availability, rate limits, collection delay, and applicable retention rules.
- **Account:** platform-scoped account identifier, public profile fields that the source makes available, and source provenance. Do not assume a profile is a verified real-world identity.
- **Post:** platform-scoped post identifier, author account, text/media references where allowed, timestamps, language, public metrics, and source URL/reference.
- **Interaction:** reply, quote, repost/share, mention, or other platform-defined event; preserve its type, direction, timestamp, and evidence.
- **Analysis record:** model/version, task, output labels or scores, confidence/calibration data, evidence span where possible, processing timestamp, and status.
- **Topic / Entity / Campaign match:** matched concept, method (exact rule, semantic model, human review), confidence, and rationale.
- **Audience aggregate:** cohort dimensions and counts with minimum-size/privacy controls; do not expose personal-level conclusions as aggregate facts.

All records should carry source and observation timestamps, collection method, language where known, and a traceable provenance link. Record edits, deletions, and reprocessing in an auditable way where required.

## 5. Deliverable 1 — Live data collection and connected-post discovery

### Purpose

Continuously collect in-scope social posts and comments associated with configured campaigns, products, brands, hashtags, and keywords. Find relevant connected conversation, including follow-up replies and related posts, while making collection coverage and limitations visible.

### Expected functionality

- Support source-approved streaming/webhook collection where available; otherwise use polling or scheduled refresh at the fastest permitted interval.
- Monitor user-configured exact terms: campaign/product names, spelling variants, hashtags, slogans, URLs, official account handles, competitor names, and exclusion terms.
- Identify relevant posts that do not contain an exact term using configurable semantic or entity-based discovery. Mark these as model-discovered and provide a match rationale or matched text span.
- Traverse platform-provided conversation structures: replies, quote posts, reposts/shares, comments, and parent/root thread references. Collect follow-ups in the same thread when available and in scope.
- Allow bounded expansion from a seed post/account: maximum depth, maximum items, date window, source limits, and permitted interaction types.
- Deduplicate records across queries and repeated collection, preserving all matching reasons and first/last-seen times.
- Provide collection health: last successful fetch, lag, volume, errors, rate-limit state, query coverage, and known platform restrictions.
- Support configurable lookback/backfill when source access permits, separate from ongoing live collection.
- Allow an analyst to mark a result relevant/irrelevant and use that feedback to improve workspace-level matching, with visible effect and a way to undo it.

### Inputs

- Campaign and product terms, aliases, hashtags, keywords, URLs, official account IDs/handles, competitors, exclusions, languages, regions, date windows, and source selection.
- Optional seed posts or accounts and expansion limits.
- Source credentials/authorization and permitted fields, supplied through secure configuration.

### Outputs

- Normalized posts/comments and platform metadata, with original identifiers and source references.
- Match reasons: exact keyword, hashtag, account, URL, thread connection, interaction path, entity match, or semantic relevance.
- Thread parent/root relationships and interaction records when available.
- Collection status and coverage metadata, including unavailable fields and delays.
- A searchable live feed with filters for time, source, campaign, language, content type, and match method.

### Example

A toothbrush brand configures a new campaign hashtag, its product name, its official account, and two competitor brands. A post using the hashtag is collected; its comments and replies are associated with the thread. A quote post without the hashtag is included because it quotes the seed post, and a separate post mentioning the product with a campaign slogan is included as a semantic match. The interface labels the match method for each result.

### Edge cases and implementation nuances

- A platform may expose public posts but not full comments, follower lists, historical data, or real-time streaming. Show the exact access boundary rather than implying complete coverage.
- Terms can be ambiguous (e.g., common words or unrelated meanings). Support exclusions, language-specific variants, relevance feedback, and precision/recall review.
- Handle edits, deletions, private/protected accounts, inaccessible posts, duplicate cross-posts, repost cascades, and timestamps in different time zones.
- Do not silently broaden collection without the configured depth and scope. Make expansion behavior explicit and auditable.
- Distinguish a post’s publication time from collection time and analysis time.
- If a post becomes unavailable, retain only what policy permits and mark the source reference unavailable; do not fabricate missing content.
- Collection should be resilient to retries and rate limits, with idempotent ingestion and backoff.

## 6. Deliverable 2 — Multi-dimensional sentiment and emotion inference

### Purpose

Interpret what posts and comments communicate about a specified campaign, product, brand, or topic. Provide more than a single positive/negative score by separating stance, sentiment polarity, emotion, target, and relevant context.

### Expected functionality

- Analyze each post/comment in context of its campaign, product, brand, and conversation thread.
- Provide sentiment labels such as positive, negative, neutral, mixed, or unclear, and emotion labels such as joy/happiness, sadness, anger, disgust, fear, surprise, and other configured categories.
- Support multi-label output: content may express more than one emotion or mixed sentiment.
- Identify the target of a sentiment (e.g., product quality, campaign message, pricing, competitor, customer service) so criticism of one topic is not attributed to the whole campaign.
- Detect stance toward campaign/product claims, including support, opposition, question, sarcasm/irony, or no clear stance where feasible.
- Support multilingual and code-switched content, with language detection and an explicit “unsupported/low confidence” state.
- Aggregate sentiment by time, campaign, topic, source, language, and other permissible dimensions. Allow drill-down to supporting posts where access permits.
- Show model confidence or calibrated probability, model/version, and analysis timestamp; allow analysts to correct labels and record corrections.
- Optionally classify spam, bot-like patterns, or promotional content as separate signals. Do not treat these signals as proof of account identity or intent.

### Inputs

- Collected post/comment text or authorized media transcript, relevant parent/root post context, campaign/product dictionary, language, and target entities.
- Optional campaign-specific sentiment taxonomy, including product attributes and desired emotion categories.

### Outputs

- Per-content sentiment label(s), emotion label(s), stance, target/aspect, confidence, and evidence snippets where feasible.
- Aggregate distributions with denominators, timeframe, filtering rules, and sample size.
- Review queue for low-confidence, mixed, sarcastic, or unsupported-language content.
- Analyst correction data and model quality measures, separated from raw model results.

### Example

“The new brush looks great, but the ad’s ‘lasts forever’ claim is ridiculous.” should be eligible for mixed sentiment: positive toward the product design and negative/skeptical toward the campaign claim. The system should not collapse this into one overall negative judgment without exposing the aspect-level distinction.

### Edge cases and implementation nuances

- Sarcasm, memes, slang, emojis, quoted text, negation, rhetorical questions, and reclaimed language can invert literal sentiment.
- A reply such as “Exactly!” depends on its parent post; use thread context when available and indicate when context is missing.
- A post may discuss a campaign without expressing a view. Keep relevance separate from sentiment.
- Do not treat likes, reposts, or silence as sentiment unless explicitly presented as engagement behavior with its own definition.
- Avoid overconfident single scores. Calibrate confidence on representative languages and content types; expose uncertainty and abstain when needed.
- Aggregate percentages must identify whether the denominator is all collected items, campaign-relevant items, or items with a confident sentiment label.

## 7. Deliverable 3 — Audience profiling and demographic insights

### Purpose

Help users understand who is participating in campaign discussion at an appropriate, privacy-respecting level. The initial concept includes examples such as age (e.g., 42), marital status, city (e.g., Ujjain), and state/region. The product must carefully distinguish verified/self-declared fields from estimates and should default to aggregate cohort insights rather than personal-level demographic claims.

### Required product behavior

- For every attribute, label its provenance: **self-declared**, **source-provided**, **verified by an approved source**, **inferred**, or **unknown**. Never conflate these categories.
- Do not state an inferred attribute as fact. If an estimate is legally and ethically permitted, show its confidence, method, date, and limitations; otherwise return “unknown/not available.”
- Treat age and precise location estimates as particularly sensitive. Do not infer or display precise personal attributes based on writing style, network neighbors, or weak proxies. Prefer broad, non-identifying aggregate bands only where a documented lawful basis and product approval exist.
- Marital status is a sensitive personal attribute and should not be inferred from social posts or behavior. Only use it when directly and appropriately self-declared or supplied under an approved, lawful basis, and default to not collecting it.
- Avoid sensitive-trait inference (health, religion, political affiliation, ethnicity, sexuality, financial status) unless an explicitly approved, lawful use case and safeguards exist; these are out of scope for the default product.
- Provide an “insufficient evidence” outcome. Do not fill missing attributes with a model guess merely to complete a profile.
- Prefer cohort summaries with minimum cohort size thresholds and suppression of small cells. Prevent drill-down that reconstructs individual attributes.
- Make user-facing wording precise: “estimated audience concentration in…” or “X% of profiles self-report…” rather than “commenters are…” when the underlying evidence is partial.

### Inputs

- Public/source-provided profile fields that the platform makes available and permits use of; explicitly self-declared information; approved demographic data at aggregate level; and workspace-level reporting configuration.
- Any optional inference model must have documented validation, permitted purpose, approved attributes, locale coverage, confidence thresholds, and privacy review.

### Outputs

- Aggregate audience breakdowns by approved dimensions (for example, source-reported location or broad region) with counts, denominator, provenance mix, confidence, and minimum cohort safeguards.
- Where approved, broad age-band estimates or summaries with clear “inferred” labeling and sufficient confidence; avoid presenting exact ages like “42” unless that age is explicitly self-declared/verified and its use is permitted.
- Attribute coverage report: known, self-declared, inferred, and unavailable proportions.
- No individual marital-status prediction in the default product.

### Example

If a profile explicitly lists Ujjain as its location and the platform permits use, the product can report “profile location: Ujjain (self-reported/source-provided)” at an appropriate view level. If a model merely estimates that an account may be in Ujjain, it must not present this as fact; where such estimation is approved at all, it should be generalized to a broad region, confidence-labeled, and excluded from small cohorts.

### Edge cases and implementation nuances

- Profile fields may be stale, joke locations, incomplete, or refer to a place of interest rather than residence. Preserve “profile says” provenance.
- Demographic coverage will be uneven across platforms, regions, languages, and user groups. Report missingness and potential sampling bias.
- Do not infer that two users are the same person from similar demographics or writing style.
- Demographic data must not be used to make eligibility, employment, credit, health, or other high-impact decisions.
- Enforce access control, retention limits, purpose limitation, export controls, aggregation thresholds, and audit logs.
- Require privacy/legal approval and documented model validation before enabling any demographic inference beyond directly supplied fields.

## 8. Deliverable 4 — Real-time trend/topic detection and competitive benchmarking

### Purpose

Show which campaigns, brands, and topics are gaining attention in a segment, how the user’s campaign compares, and whether the conversation narrative changed before and after launch. Identify plausible future opportunities or shifts as hypotheses, not guaranteed outcomes.

### Expected functionality

- Detect topics, themes, entities, product attributes, claims, questions, and emerging phrases in collected content.
- Surface trend velocity and persistence, not just raw volume. Identify sudden spikes, sustained growth, declining topics, and new topics relative to a baseline.
- Compare configured competitors and campaigns within the same product segment (e.g., toothbrush campaigns), including campaign volume, share of relevant conversation, engagement, sentiment/emotion, topic mix, and change over time.
- Provide configurable baseline and comparison windows: pre-campaign, launch, post-campaign, and matched time periods when possible.
- Show narrative shifts as changes in topic prevalence, sentiment by aspect, key language, and audience discussion—not as one opaque “narrative score.”
- Distinguish observation from causal attribution. State “changed after launch” unless experimental or other credible causal evidence supports “changed because of launch.”
- Provide scenario or opportunity insights such as “this topic is rising and is underrepresented in campaign discussion,” with evidence, uncertainty, and recommended validation. Do not promise that a campaign can shift a narrative.
- Support alerts for configured thresholds (e.g., unusual volume spike, new topic, negative sentiment increase, competitor surge), with adjustable noise controls.
- Let analysts inspect representative posts, topic examples, and the metric calculations behind every finding.

### Inputs

- Campaigns/products/brands and competitor list; segment definition; keywords/entities; collection period; geographic/language scope; baseline and comparison windows; topic sensitivity and alert thresholds.
- Engagement fields only where authorized and available.

### Outputs

- Live trend stream with topics, volume, rate of change, persistence, source mix, representative content, and confidence.
- Benchmark dashboard comparing campaign/brand measures on common definitions and time windows.
- Pre/post narrative comparison with topic prevalence and sentiment-by-topic changes, sample sizes, and coverage notes.
- Alert events and evidence links.
- Exportable charts/tables and a concise explanation of metric definitions.

### Example

For a toothbrush campaign, the analyst compares the user’s campaign with two competitors in the oral-care segment. The dashboard may show that competitor A currently has the largest share of relevant public posts, while the user’s campaign is gaining discussion around sustainability. After launch, discussion of recyclable packaging increases relative to the pre-launch baseline. The product reports the measured change and notes that timing alone does not prove the campaign caused it.

### Metrics and definitions

At minimum, define and consistently calculate:

- **Relevant conversation volume:** count of unique content items meeting campaign relevance rules.
- **Share of voice:** campaign/brand relevant volume divided by total relevant volume across the configured comparison set, with inclusion rules disclosed.
- **Engagement:** source-specific interactions, with platform differences documented; do not compare incomparable metrics without normalization or caveat.
- **Trend velocity:** change in content rate over a selected interval versus a stated baseline.
- **Topic prevalence:** share of relevant items assigned to a topic, with multi-label counting rules specified.
- **Narrative shift:** change in topic, aspect, framing, or sentiment distribution across defined windows.

### Edge cases and implementation nuances

- Competitor names and campaign terms may have unequal ambiguity and collection coverage. Show query coverage and normalize carefully.
- Platform algorithm changes, news events, bots, paid promotion, and seasonality can affect volume. Flag known confounders when available.
- Low-volume topics can produce noisy percentage swings. Enforce minimum sample thresholds and show counts alongside percentages.
- Topic labels can drift over time. Preserve versioning and allow analysts to merge, split, rename, or exclude topics with an audit trail.
- Distinguish actual observed trend from model forecast. Forecasts should include horizon, confidence interval, and backtest quality; omit forecasts when data is insufficient.

## 9. Deliverable 5 — Link analysis and network topology

### Purpose

Explain how a campaign conversation appears to propagate from an official account or seed post through subsequent posts and accounts. Also help determine whether two accounts are connected in an observable platform sense, merely discuss the same subject, or have no known relationship.

### Expected functionality

- Create a graph of accounts, posts, campaigns/topics, and interaction events.
- Represent observed interaction edges with explicit types and direction: authored-by, reply-to, quote-of, repost/share-of, mentions, comments-on, and platform-provided follow/follower relationship when available and permitted.
- Model posts and accounts separately: a post-to-post quote/reply path is evidence of content linkage; it is not automatically evidence that the authors follow or know each other.
- Trace a seed campaign post from the official account to direct reposts/quotes/replies, and onward only where the platform provides a reliable observable parent/interaction chain.
- Show depth, timestamps, branch volume, unique accounts, and available engagement at each step. Provide filters by time, interaction type, campaign, and source.
- Classify each edge as **observed/direct**, **platform-reported**, **inferred**, or **unknown**, with the supporting evidence and confidence. Never render an inferred diffusion edge as an observed fact.
- When two accounts discuss the same product/campaign, test for an actual social connection only if the platform provides authorized follow/follower or interaction data. Label outcomes precisely: “follows,” “is followed by,” “mutual follow,” “interacted in this thread,” “co-mentioned topic only,” or “relationship data unavailable.”
- A shared topic, similar timing, same city, or similar demographics is not proof that two accounts are socially connected or coordinated.
- If accounts are not observably linked, allow aggregate comparison of approved audience characteristics (e.g., broad region or age band only if permitted and sufficiently aggregated). Do not infer an individual relationship from demographic similarity.
- Include thread reply/follow-up chains. A follow-up reply belongs to a conversation path even when it does not create an account-level follow relationship.
- Provide graph exploration and a table/list alternative for accessibility and dense networks.

### Inputs

- Seed official account(s), campaign post(s), hashtags/keywords, time window, expansion depth, selected platforms, and permitted interaction data.
- Optional platform-provided follow graph or relationship endpoint, only when access and use are authorized.

### Outputs

- Interactive network graph and ranked path/branch view.
- Edge list with source/target IDs, edge type, timestamp, evidence reference, provenance, confidence, and collection time.
- Diffusion summary: directly observed reshares/quotes/replies, inferred or unknown branches separated, unique reach proxy where available, and limitations.
- Pairwise relationship status with evidence category and “unknown” as a valid result.
- Aggregate cohort comparisons with privacy thresholds, where approved.

### Example

The official toothbrush campaign account posts a launch video. Account B reposts it, Account C quotes B’s post, and Account D replies to C. The system displays that observable sequence as a post-level propagation chain. It does not assume B follows the official account, C follows B, or that any two authors are friends unless authorized platform relationship data separately confirms the relevant follow status. Two additional accounts that use the same campaign hashtag but have no observable interaction are shown as co-discussing the topic, not connected in the diffusion path.

### Edge cases and implementation nuances

- A user may independently create a similar post without seeing the seed content. Do not infer exposure absent a direct/traceable interaction or clearly labeled model inference.
- Deleted, private, or inaccessible intermediate posts can break a path. Show gaps and do not invent missing nodes.
- Reposts may be hidden, aggregated, or represented differently by each platform. Preserve platform-specific edge semantics.
- Mutual follows are not equivalent to friendship, endorsement, or coordination. Use platform terms such as “mutual follow,” not social conclusions.
- Dense graphs can obscure useful paths. Support time slicing, depth limits, community clustering, and a clear explanation of any algorithmic grouping.
- Do not claim coordinated behavior from shared hashtags, synchronized timing, or demographic similarity alone. Any coordination signal requires separate, validated methods and should remain a qualified indicator.

## 10. Cross-cutting requirements

### Explainability and evidence

- Every result should expose the source, time window, collection/matching method, analysis version, and relevant denominator.
- Users should be able to reach source items where permitted and understand why each item was included or labeled.
- Store model and taxonomy versions so historical dashboards can be reproduced or reprocessed transparently.

### Privacy, security, and governance

- Collect only fields necessary for the stated campaign analytics purpose and supported by source authorization.
- Apply role-based access, secure credential handling, encryption in transit/at rest, retention/deletion controls, audit logs, and export safeguards.
- Provide workspace-level retention and deletion settings; honor source deletion/withdrawal obligations where applicable.
- Establish a documented review gate for demographic inference, sensitive attributes, cross-platform identity resolution, and any expanded collection scope.
- Use aggregation thresholds and suppression to limit re-identification in small groups.

### Quality and reliability

- Monitor ingestion lag, source errors, duplicate rate, language coverage, model abstention, confidence calibration, and label quality.
- Support analyst feedback and corrections without overwriting the original model output.
- Evaluate models across languages, dialects, code-switching, and relevant content formats; publish known limitations in product help.
- Use graceful degradation: if a source or model is unavailable, show last-updated time and partial status instead of stale results presented as current.

### Accessibility and usability

- Provide keyboard-accessible dashboards, graph alternatives, readable color contrast, text labels in addition to color, and export formats that preserve metric definitions.
- Use clear labels (“observed,” “self-reported,” “inferred,” “unknown”) consistently throughout the interface.
- Localize date/time, language, and regional formats without changing metric definitions.

## 11. Non-functional requirements

Exact service levels depend on the chosen data providers and deployment. The implementation should make the following configurable and measurable:

- **Freshness:** target near-real-time updates for streaming sources; display per-source observed lag and a workspace freshness target.
- **Scalability:** support configurable campaign volume, concurrency, backfill windows, and graph size, with pagination and bounded expansion.
- **Reliability:** idempotent ingestion, retry/backoff, dead-letter handling, and visible recovery state.
- **Performance:** searchable feeds and common dashboards should remain responsive at the agreed dataset scale; use asynchronous processing for heavy graph/model jobs.
- **Auditability:** record configuration changes, analyst corrections, exports, and model/version changes.
- **Portability:** normalized internal schema with platform-specific metadata retained so source semantics are not lost.

## 12. Acceptance criteria

The product is ready for an initial release when:

1. A user can configure campaign keywords, hashtags, official accounts, competitors, exclusions, and a date window, then see the available source coverage before activating collection.
2. New in-scope content appears with distinct publication, collection, and analysis timestamps, a deduplication identity, and a visible match reason.
3. Replies and follow-ups can be opened as a thread when the source provides them; missing context is clearly indicated.
4. A content item can receive contextual sentiment, emotion, target/aspect, and confidence outputs, including mixed and unknown/abstain outcomes.
5. Campaign and competitor comparisons show counts, denominators, date windows, query coverage, and metric definitions.
6. Pre/post reporting shows measured changes and does not label correlation as causation by default.
7. Network paths distinguish observed repost/reply/quote edges from inferred or unavailable paths; account follow status is shown only from authorized platform relationship data.
8. Demographic outputs clearly identify provenance and confidence, suppress small cohorts, and do not present inferred exact age or marital status as fact. Default behavior does not infer marital status.
9. Users can inspect evidence for model-derived findings, correct labels, and see the original output and model version.
10. Source outages, rate limits, stale data, model failures, and unavailable fields are visible in product status.

## 13. Open product decisions for implementation

These choices should be resolved during discovery and platform design; they do not change the product intent above:

- Which social platforms and approved data providers are in the first release?
- Which account types and content types (posts, comments, stories, video transcripts) are accessible and permitted?
- What is the target freshness and historical lookback for each source?
- Which languages and geographic markets are supported at launch?
- Which competitor and segment comparison rules define a fair benchmark?
- Which sentiment/emotion taxonomy and confidence thresholds are preferred?
- What minimum cohort size and retention periods should apply?
- Is demographic reporting limited to self-declared/source-provided fields in the first release? This is the recommended default.
- Are network follow relationships needed at launch, and does the selected platform provide authorized access?
- What user roles, export formats, alert channels, and deployment requirements are needed?

## 14. Suggested phased delivery

### Phase 1: Evidence-first monitoring

Authorized collection, query setup, deduplication, thread structure, searchable feed, collection health, campaign relevance, and source coverage.

### Phase 2: Conversation intelligence

Contextual sentiment/emotion, topic detection, trend views, competitive benchmarks, evidence drill-down, and analyst corrections.

### Phase 3: Network analysis and governed audience summaries

Observed propagation graphs and pairwise relationship evidence; aggregate audience reporting from permitted, reliable fields. Any demographic inference requires a separate privacy and validation approval before enablement.

### Phase 4: Forecasting and advanced insights

Optional trend forecasts, anomaly alerts, and scenario insights after historical validation, with uncertainty and backtesting shown.

---

**Implementation note for Codex:** Treat this document as product behavior and acceptance guidance, not as authorization to access any particular platform or infer any personal attribute. Before choosing APIs, models, or storage, inspect the repository and its existing architecture, preserve source-specific constraints, and make the provenance, confidence, and privacy rules first-class in the data model and UI.
