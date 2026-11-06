# Section A: Data Collection and Timeline

- Owner team: (add names)
- Status: In progress
- Role: Backend ingestion component. Customers do not use this page to configure or start collection.
- Primary live source: X
- Other live connector: Telegram Bot API (only configured chats that the bot can access)
- Demo source: rich synthetic conversations across X, Telegram, Instagram, Facebook, YouTube, and Reddit labels
- Outputs produced: see the `output/` links on `index.html`; all generated data is clearly separated by source mode.

## What the pipeline does

The pipeline normalizes collected content to the project's shared post columns and keeps richer collection details in Section A sidecar files. These include campaign matches, source and observation timestamps, post types, available engagement counts, and typed interaction edges. The shared columns are not changed.

The synthetic fixture uses real company and product names ([Apple iPhone 17](https://www.apple.com/iphone-17/) and [The Coca-Cola Company Coca-Cola Zero Sugar](https://www.coca-cola.com/us/en/brands/coca-cola/products/zero)) in two explicitly marked discussion scenarios. Every post, reply, quote, repost, author profile, engagement count, and expected label is generated fiction. The scenarios are not real campaigns, customer statements, company statements, or API observations. The expected labels are synthetic references, not AI model results. No real official account handles are configured in the fixture.

The pipeline is started manually by the project operator using a campaign configuration file. A future product interface or scheduler can produce the same configuration and invoke the collector; Section A itself is a backend, not a customer-facing setup screen.

## Generate the synthetic demo

Use Python 3.9 or newer. From this folder run:

```powershell
python pipeline.py demo
```

Edit `config.json` to change company and product examples, campaign scenario names, keywords, hashtags, exclusion terms, simulated languages, platforms, and sample size. The default fixture creates 100 root posts per campaign/platform over a 30-day window, plus replies, quote posts, and repost edges. For actual customer account filters, use the ignored local `live_campaigns.local.json` overlay so real handles or account IDs are not added to the shared repository.

## Optional live collection

Live requests are opt-in. No API calls happen when generating the demo or opening the page. The X API currently uses consumption-based billing for read requests; check [X Developer Platform pricing](https://developer.x.com/) before using the X command. The CLI requires an explicit cost acknowledgement for X.

1. Copy `.env.example` to `.env` in this folder. `.env` is ignored by Git.
2. Add only credentials you obtained directly from the platform. Do not put tokens in `config.json`, commit them, or send them in chat.
3. For pseudonymous live author IDs, set `SOCIAL_PIPELINE_PSEUDONYM_KEY` to a long random private value. Keep this key stable for a workspace; changing it changes the pseudonyms.
4. For X public keyword/account search, set `X_BEARER_TOKEN`. The collector requests recent results and stores only configured campaign matches. X access, history, fields, and rates depend on the app's approved access plan.
5. For an authorized X account timeline, put the numeric account ID in that campaign's `connected_account_ids` and provide an appropriately scoped `X_USER_ACCESS_TOKEN`. `seed_post_ids` can include known campaign posts. The collector includes matching campaign content by default; `include_all_connected_posts` can be enabled only when the account owner has authorized collection and the workspace intends to analyze all its posts.
6. For Telegram, create a bot, add it to the group or channel the project is allowed to monitor, and set `TELEGRAM_BOT_TOKEN`. Put the permitted chat IDs in `live.telegram.allowed_chat_ids`. The bot cannot search all Telegram or retrieve arbitrary chat history; it receives only updates available to it. The chat must be authorized by its owner/admin.

Commands:

```powershell
python pipeline.py collect --sources x --acknowledge-x-cost
python pipeline.py collect --sources telegram
python pipeline.py collect --sources x telegram --acknowledge-x-cost --watch --interval 300
```

The watch mode polls until stopped with `Ctrl+C`. A computer must remain on and connected. X's recent-search API does not mean complete historical coverage. The collector does not scrape web pages or bypass platform restrictions. Instagram, Facebook, YouTube, and Reddit are currently synthetic fixture sources only; their live APIs are not connected in this version.

## Output files

- `output/demo_posts.csv`: synthetic posts using exactly the six agreed shared columns.
- `output/demo_post_metadata.csv`: content type, source mode, publication/collection time, source reference, mock engagement counters, and optional profile fields.
- `output/demo_campaign_matches.csv`: campaign identity, match type, matched term, rationale, and confidence.
- `output/demo_interactions.csv`: synthetic reply, quote, and repost edges for network demos.
- `output/demo_expected_labels.csv`: simulated reference sentiment/emotion/topic labels, never model output.
- `output/demo_manifest.json`: data label, counts, platforms, and generated artifacts.
- `output/live_*.csv` and `output/live_manifest.json`: separate live exports after an authorized API run.
- `output/collection_status.json`: recent run status, counts, and errors without credentials.
- `output/collection.sqlite3`: local working database, ignored by Git so live data is not accidentally committed.

The post CSV uses exactly the six columns listed in `data/README.md`: `post_id`, `platform`, `user_id`, `timestamp`, `text`, and `parent_id`. Language, fictional/demo profile attributes, source references, campaign matches, collection times, and typed network events stay in Section A sidecars; they do not change the shared schema.

The ordinary demo and live exports stay under this section folder. For a reviewed integration handoff, the project lead can publish exactly one campaign to the shared file:

```powershell
python pipeline.py export --mode demo --campaign-id apple-iphone-17-synthetic-scenario --publish-shared
```

Use `--mode live` for authorized live records. The explicit `--publish-shared` flag writes `data/posts.csv`; `--campaign-id` is required so separate customer campaigns are not mixed in a schema that has no campaign ID. The project lead reviews and commits that shared file. Sidecars remain in Section A unless the lead approves a shared interface for them.

## Privacy and limits

- Live author IDs are HMAC-pseudonymized and names/handles are not written to the author field. Common emails, phone numbers, and `@mentions` are redacted from post text.
- Profile fields are not requested from X unless `collect_public_profile_fields` is explicitly enabled after the team reviews its privacy and platform-policy basis. The default Telegram connector stores no bio or location.
- Use only authorized public or connected account data. Do not infer age, marital status, identity, friendship, or coordination from these records.
- A reply, quote, or repost edge is evidence of that platform event, not proof of friendship or endorsement. Unknown and unavailable relationships remain unknown.
- The current shared CSV does not carry campaign IDs, collection times, match reasons, or non-reply edge types. Those stay in the sidecars until the project lead approves a broader contract.
