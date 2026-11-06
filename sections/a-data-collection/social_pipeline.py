"""Section A collection pipeline: rich synthetic fixtures and optional official APIs.

Only the Python standard library is required. Live collection is opt-in and needs
the user's own platform credentials, permissions, and configuration.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import hmac
import json
import os
import random
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "output"
DB_PATH = OUT / "collection.sqlite3"
SHARED_COLUMNS = ["post_id", "platform", "user_id", "timestamp", "text", "parent_id"]
PROFILE_COLUMNS = ["language", "user_bio", "user_location"]
POST_COLUMNS = SHARED_COLUMNS + PROFILE_COLUMNS
METADATA_COLUMNS = [
    "post_id", "source_mode", "source_post_id", "source_url", "content_type",
    "conversation_id", "root_post_id", "published_at_utc", "collected_at_utc",
    "likes_count", "reposts_count", "replies_count", "quotes_count", "views_count",
    "profile_provenance",
]
POST_METADATA_EXPORT_COLUMNS = METADATA_COLUMNS + PROFILE_COLUMNS
MATCH_COLUMNS = ["post_id", "campaign_id", "company", "campaign", "match_method", "matched_term", "match_reason", "confidence"]
EDGE_COLUMNS = [
    "edge_id", "source_mode", "campaign_id", "platform", "actor_user_id", "target_user_id",
    "event_post_id", "target_post_id", "edge_type", "occurred_at_utc", "evidence_ref", "provenance", "confidence",
]
LABEL_COLUMNS = ["post_id", "campaign_id", "sentiment", "emotions", "stance", "aspect", "topic", "label_status"]


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def utc_text(value: datetime | None = None) -> str:
    return (value or utc_now()).astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def api_time(value: str | None) -> str:
    if not value:
        return utc_text()
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return utc_text(parsed)


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")[:40] or "campaign"


def load_dotenv() -> None:
    """Read a local ignored .env file without printing any values."""
    env_path = HERE / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip().strip("\"'")
        if key and key not in os.environ:
            os.environ[key] = value


def anonymize(platform: str, source_user_id: str, key: str | None = None) -> str:
    secret = key or os.getenv("SOCIAL_PIPELINE_PSEUDONYM_KEY")
    if not secret:
        raise RuntimeError("Set SOCIAL_PIPELINE_PSEUDONYM_KEY in the ignored local .env before live collection.")
    digest = hmac.new(secret.encode("utf-8"), f"{platform}:{source_user_id}".encode("utf-8"), hashlib.sha256).hexdigest()[:16]
    return f"anon-{digest}"


def redact_contact_details(text: str) -> str:
    """Remove common direct contact identifiers before exporting post text."""
    text = re.sub(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", "[email removed]", text)
    text = re.sub(r"(?<!\w)@[A-Za-z0-9_]{2,30}", "[account mention]", text)
    text = re.sub(r"(?<!\w)(?:\+?\d[\d .()/-]{7,}\d)(?!\w)", "[phone removed]", text)
    return text


def load_config(path: Path) -> dict:
    config = json.loads(path.read_text(encoding="utf-8"))
    local_path = HERE / "live_campaigns.local.json"
    if local_path.exists():
        local_config = json.loads(local_path.read_text(encoding="utf-8"))
        overrides = {str(row.get("campaign_id")): row for row in local_config.get("campaigns", [])}
        for campaign in config.get("campaigns", []):
            campaign.update(overrides.get(str(campaign.get("campaign_id", "")), {}))
    if not config.get("campaigns"):
        raise ValueError("Add at least one campaign object to config.json.")
    return config


def database() -> sqlite3.Connection:
    OUT.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("""CREATE TABLE IF NOT EXISTS posts (
        post_id TEXT PRIMARY KEY, platform TEXT NOT NULL, user_id TEXT NOT NULL,
        timestamp TEXT NOT NULL, text TEXT NOT NULL, parent_id TEXT NOT NULL,
        language TEXT NOT NULL, user_bio TEXT NOT NULL, user_location TEXT NOT NULL
    )""")
    connection.execute("""CREATE TABLE IF NOT EXISTS post_metadata (
        post_id TEXT PRIMARY KEY, source_mode TEXT NOT NULL, source_post_id TEXT NOT NULL,
        source_url TEXT NOT NULL, content_type TEXT NOT NULL, conversation_id TEXT NOT NULL,
        root_post_id TEXT NOT NULL, published_at_utc TEXT NOT NULL, collected_at_utc TEXT NOT NULL,
        likes_count TEXT NOT NULL, reposts_count TEXT NOT NULL, replies_count TEXT NOT NULL,
        quotes_count TEXT NOT NULL, views_count TEXT NOT NULL, profile_provenance TEXT NOT NULL
    )""")
    connection.execute("""CREATE TABLE IF NOT EXISTS campaign_matches (
        post_id TEXT NOT NULL, campaign_id TEXT NOT NULL, company TEXT NOT NULL, campaign TEXT NOT NULL,
        match_method TEXT NOT NULL, matched_term TEXT NOT NULL, match_reason TEXT NOT NULL, confidence TEXT NOT NULL,
        PRIMARY KEY (post_id, campaign_id)
    )""")
    connection.execute("""CREATE TABLE IF NOT EXISTS interactions (
        edge_id TEXT PRIMARY KEY, source_mode TEXT NOT NULL, campaign_id TEXT NOT NULL, platform TEXT NOT NULL,
        actor_user_id TEXT NOT NULL, target_user_id TEXT NOT NULL, event_post_id TEXT NOT NULL,
        target_post_id TEXT NOT NULL, edge_type TEXT NOT NULL, occurred_at_utc TEXT NOT NULL,
        evidence_ref TEXT NOT NULL, provenance TEXT NOT NULL, confidence TEXT NOT NULL
    )""")
    connection.execute("""CREATE TABLE IF NOT EXISTS expected_labels (
        post_id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, sentiment TEXT NOT NULL, emotions TEXT NOT NULL,
        stance TEXT NOT NULL, aspect TEXT NOT NULL, topic TEXT NOT NULL, label_status TEXT NOT NULL
    )""")
    connection.execute("CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    connection.execute("""CREATE TABLE IF NOT EXISTS collection_runs (
        run_id TEXT PRIMARY KEY, platform TEXT NOT NULL, mode TEXT NOT NULL, started_at_utc TEXT NOT NULL,
        finished_at_utc TEXT NOT NULL, status TEXT NOT NULL, fetched_count INTEGER NOT NULL,
        saved_count INTEGER NOT NULL, message TEXT NOT NULL
    )""")
    connection.commit()
    return connection


def db_state(conn: sqlite3.Connection, key: str) -> str | None:
    row = conn.execute("SELECT value FROM state WHERE key = ?", (key,)).fetchone()
    return row[0] if row else None


def set_state(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute("INSERT OR REPLACE INTO state (key, value) VALUES (?, ?)", (key, value))


def edge_id(values: dict) -> str:
    encoded = "|".join(str(values.get(key, "")) for key in ("platform", "campaign_id", "actor_user_id", "target_user_id", "event_post_id", "target_post_id", "edge_type", "occurred_at_utc"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()[:24]


def save_bundle(conn: sqlite3.Connection, posts: list[dict], metadata: list[dict], matches: list[dict], edges: list[dict], labels: list[dict] | None = None) -> int:
    saved = 0
    for row in posts:
        conn.execute(
            "INSERT OR REPLACE INTO posts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [str(row.get(column, "") or "") for column in POST_COLUMNS],
        )
        saved += 1
    for row in metadata:
        conn.execute(
            "INSERT OR REPLACE INTO post_metadata VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [str(row.get(column, "") or "") for column in METADATA_COLUMNS],
        )
    for row in matches:
        conn.execute(
            "INSERT OR REPLACE INTO campaign_matches VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [str(row.get(column, "") or "") for column in MATCH_COLUMNS],
        )
    for row in edges:
        if not row.get("edge_id"):
            row["edge_id"] = edge_id(row)
        conn.execute(
            "INSERT OR REPLACE INTO interactions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [str(row.get(column, "") or "") for column in EDGE_COLUMNS],
        )
    for row in labels or []:
        conn.execute(
            "INSERT OR REPLACE INTO expected_labels VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [str(row.get(column, "") or "") for column in LABEL_COLUMNS],
        )
    conn.commit()
    return saved


def export_csv(path: Path, rows: list[dict], columns: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def rows_for_mode(conn: sqlite3.Connection, source_mode: str) -> list[dict]:
    return [dict(row) for row in conn.execute(
        "SELECT p.* FROM posts p JOIN post_metadata m ON m.post_id=p.post_id WHERE m.source_mode=? ORDER BY p.timestamp, p.post_id",
        (source_mode,),
    ).fetchall()]


def export_mode(conn: sqlite3.Connection, mode: str) -> dict:
    source_modes = ["synthetic_demo"] if mode == "demo" else ["x_live", "x_owned_live", "telegram_live"]
    placeholders = ",".join("?" for _ in source_modes)
    post_rows = [dict(row) for row in conn.execute(
        f"SELECT p.* FROM posts p JOIN post_metadata m ON m.post_id=p.post_id WHERE m.source_mode IN ({placeholders}) ORDER BY p.timestamp, p.post_id",
        source_modes,
    ).fetchall()]
    post_ids = [row["post_id"] for row in post_rows]
    if post_ids:
        ids = ",".join("?" for _ in post_ids)
        metadata_rows = [dict(row) for row in conn.execute(f"SELECT * FROM post_metadata WHERE post_id IN ({ids}) ORDER BY collected_at_utc", post_ids).fetchall()]
        match_rows = [dict(row) for row in conn.execute(f"SELECT * FROM campaign_matches WHERE post_id IN ({ids}) ORDER BY campaign_id, post_id", post_ids).fetchall()]
        label_rows = [dict(row) for row in conn.execute(f"SELECT * FROM expected_labels WHERE post_id IN ({ids}) ORDER BY campaign_id, post_id", post_ids).fetchall()] if mode == "demo" else []
    else:
        metadata_rows, match_rows, label_rows = [], [], []
    profile_by_id = {row["post_id"]: row for row in post_rows}
    metadata_rows = [
        {**row, **{column: profile_by_id.get(row["post_id"], {}).get(column, "") for column in PROFILE_COLUMNS}}
        for row in metadata_rows
    ]
    edge_rows = [dict(row) for row in conn.execute(
        f"SELECT * FROM interactions WHERE source_mode IN ({placeholders}) ORDER BY occurred_at_utc, edge_id", source_modes
    ).fetchall()]
    prefix = "demo" if mode == "demo" else "live"
    export_csv(OUT / f"{prefix}_posts.csv", post_rows, SHARED_COLUMNS)
    export_csv(OUT / f"{prefix}_post_metadata.csv", metadata_rows, POST_METADATA_EXPORT_COLUMNS)
    export_csv(OUT / f"{prefix}_campaign_matches.csv", match_rows, MATCH_COLUMNS)
    export_csv(OUT / f"{prefix}_interactions.csv", edge_rows, EDGE_COLUMNS)
    if mode == "demo":
        export_csv(OUT / "demo_expected_labels.csv", label_rows, LABEL_COLUMNS)
    status = {
        "data_status": "synthetic_demo_only" if mode == "demo" else "live_api_data",
        "warning": "Simulated records only; no platform API was called." if mode == "demo" else "Contains records returned by configured live APIs. API coverage is partial and source-limited.",
        "post_count": len(post_rows),
        "campaign_match_count": len(match_rows),
        "interaction_edge_count": len(edge_rows),
        "platforms": dict(sorted(Counter(row["platform"] for row in post_rows).items())),
        "content_types": dict(sorted(Counter(row["content_type"] for row in metadata_rows).items())),
        "match_methods": dict(sorted(Counter(row["match_method"] for row in match_rows).items())),
        "languages": dict(sorted(Counter(row["language"] or "unknown" for row in post_rows).items())),
        "interaction_types": dict(sorted(Counter(row["edge_type"] for row in edge_rows).items())),
        "campaign_ids": sorted({row["campaign_id"] for row in match_rows}),
        "start_timestamp": post_rows[0]["timestamp"] if post_rows else None,
        "end_timestamp": post_rows[-1]["timestamp"] if post_rows else None,
        "exported_at_utc": utc_text(),
        "files": [f"{prefix}_posts.csv", f"{prefix}_post_metadata.csv", f"{prefix}_campaign_matches.csv", f"{prefix}_interactions.csv"],
    }
    if mode == "demo":
        status["files"].append("demo_expected_labels.csv")
        (OUT / "demo_manifest.json").write_text(json.dumps(status, indent=2) + "\n", encoding="utf-8")
    else:
        (OUT / "live_manifest.json").write_text(json.dumps(status, indent=2) + "\n", encoding="utf-8")
    refresh_collection_status(conn)
    return status


def publish_shared_csv(conn: sqlite3.Connection, mode: str, campaign_id: str) -> Path:
    """Publish one campaign to the fixed shared CSV schema after explicit CLI opt-in."""
    if not campaign_id:
        raise ValueError("Choose one campaign with --campaign-id before publishing to the shared file.")
    source_modes = ["synthetic_demo"] if mode == "demo" else ["x_live", "x_owned_live", "telegram_live"]
    placeholders = ",".join("?" for _ in source_modes)
    query = (
        "SELECT DISTINCT " + ", ".join(f'p.\"{column}\"' for column in SHARED_COLUMNS)
        + " FROM posts p JOIN post_metadata m ON m.post_id=p.post_id"
        + " JOIN campaign_matches cm ON cm.post_id=p.post_id"
        + f" WHERE m.source_mode IN ({placeholders}) AND cm.campaign_id=?"
        + " ORDER BY p.timestamp, p.post_id"
    )
    rows = [dict(row) for row in conn.execute(query, source_modes + [campaign_id]).fetchall()]
    if not rows:
        raise ValueError(f"No {mode} records were found for campaign_id '{campaign_id}'. Generate or collect that campaign first.")
    target = HERE.parents[1] / "data" / "posts.csv"
    export_csv(target, rows, SHARED_COLUMNS)
    return target


def refresh_collection_status(conn: sqlite3.Connection) -> None:
    rows = [dict(row) for row in conn.execute("SELECT * FROM collection_runs ORDER BY started_at_utc DESC LIMIT 50").fetchall()]
    (OUT / "collection_status.json").write_text(json.dumps({"updated_at_utc": utc_text(), "recent_runs": rows}, indent=2) + "\n", encoding="utf-8")


# ------------------------------- Synthetic source ---------------------------

EMOTIONS = ["joy", "anger", "curiosity", "concern", "disappointment", "trust", "surprise", "sarcasm"]
ASPECTS = ["product_quality", "price", "campaign_message", "customer_support", "sustainability", "availability", "privacy"]
TOPICS = ["ease_of_use", "value_for_money", "sustainability", "product_quality", "launch_timing", "customer_service", "privacy_concerns", "competitor_comparison"]
BIOS = [
    "Follows product launches and customer experience", "Small business owner sharing public opinions",
    "Interested in technology and useful services", "Student interested in brands and online culture",
    "Interested in sustainability and product design", "Community member discussing everyday products",
    "Marketing professional following campaign examples", "Customer sharing a personal product experience",
]
REGIONS = ["North America", "South Asia", "Europe", "Latin America", "Not specified"]
LANGS = ["en", "en", "en", "hi", "es", "en-hi", "en-es"]
REACTIONS = {
    "positive": ["This feels like a thoughtful update.", "I like where this is going.", "That sounds useful for customers.", "Good to see the team address this."],
    "negative": ["This still leaves the main problem unresolved.", "The price makes this hard to recommend.", "I expected a clearer explanation.", "That promise does not match my experience."],
    "neutral": ["Does anyone know when this becomes available?", "I am looking for the details before deciding.", "How does this compare with the previous version?", "The announcement gives the date but not the full terms."],
    "mixed": ["The design looks good, but I am unsure about the price.", "I like the idea; the rollout needs more detail.", "Useful feature, although the campaign claim feels too broad."],
    "sarcastic": ["Sure, because another app notification was exactly what we needed.", "Great, a launch with no launch details. Very helpful.", "Nothing says simple like three extra steps."],
    "support": ["I have had a good experience and hope they keep improving it.", "The support team helped me sort this out.", "I would give this a try based on my last order."],
}
LOCALIZED = {
    "hi": ["यह बदलाव उपयोगी लग रहा है, लेकिन कीमत की जानकारी चाहिए।", "नई सुविधा अच्छी है; लॉन्च की तारीख क्या है?", "मेरा अनुभव ठीक था, पर विवरण और स्पष्ट हो सकते हैं।"],
    "es": ["La idea parece útil, pero faltan detalles sobre el precio.", "Me gusta el cambio; ¿cuándo estará disponible?", "La campaña suena bien, aunque quiero ver más pruebas."],
    "en-hi": ["Feature achha lag raha hai, but launch details abhi clear nahi hain.", "Price thoda high hai; otherwise this could help."],
    "en-es": ["Me gusta the new design, but the price is still unclear.", "La idea sounds useful; quiero ver the details first."],
}


def synthetic_user(platform: str, campaign_id: str, ordinal: int) -> str:
    digest = hashlib.sha256(f"demo:{platform}:{campaign_id}:user:{ordinal}".encode("utf-8")).hexdigest()[:16]
    return f"anon-{digest}"


def synthetic_post_text(rng: random.Random, campaign: dict, lang: str, sentiment: str, method: str, content_type: str) -> tuple[str, str]:
    company = campaign["company"]
    product = campaign.get("product", campaign["campaign"])
    terms = campaign.get("keywords", []) or [campaign["campaign"]]
    term = str(rng.choice(terms))
    hashtag = str(rng.choice(campaign.get("hashtags", []))) if campaign.get("hashtags") else "#" + slug(term).replace("-", "")
    if lang in LOCALIZED and rng.random() < 0.82:
        body = str(rng.choice(LOCALIZED[lang]))
    else:
        body = str(rng.choice(REACTIONS.get(sentiment, REACTIONS["neutral"])))
    if method == "semantic_match":
        context = f"{company} {product}"
    elif method == "hashtag":
        context = f"{company} {hashtag}"
    else:
        context = f"{company} {term}"
    if content_type == "reply":
        prefix = str(rng.choice(["Replying to the earlier post:", "Adding context to this thread:", "Following up:", ""])).strip()
        return (f"{prefix} {body} {term}".strip(), term)
    if content_type == "quote":
        return (f"Quoting the campaign discussion: {body} {context}", term)
    return (f"{context}. {body}", term)


def campaign_match(post_id: str, campaign: dict, method: str, term: str, confidence: float) -> dict:
    return {
        "post_id": post_id,
        "campaign_id": campaign["campaign_id"],
        "company": campaign["company"],
        "campaign": campaign["campaign"],
        "match_method": method,
        "matched_term": term,
        "match_reason": {
            "exact_keyword": "Synthetic fixture for an exact campaign keyword match.",
            "hashtag": "Synthetic fixture for a campaign hashtag match.",
            "official_account": "Synthetic fixture authored by a configured official account.",
            "semantic_match": "Synthetic fixture for a model-discovered related conversation.",
            "thread_connection": "Synthetic fixture connected to an in-scope parent post.",
        }.get(method, "Synthetic campaign match fixture."),
        "confidence": f"{confidence:.2f}",
    }


def make_synthetic_bundle(config: dict) -> tuple[list[dict], list[dict], list[dict], list[dict], list[dict]]:
    rng = random.Random(int(config.get("seed", 42)))
    now = utc_now()
    start = now - timedelta(days=int(config.get("window_days", 30)))
    platforms = config.get("platforms", ["X", "Telegram"])
    campaigns = config["campaigns"]
    roots_per_platform = max(10, int(config.get("records_per_platform_per_campaign", 100)))
    reply_ratio = min(0.8, max(0.0, float(config.get("reply_ratio", 0.55))))
    quote_ratio = min(0.3, max(0.0, float(config.get("quote_ratio", 0.10))))
    repost_ratio = min(1.0, max(0.0, float(config.get("repost_ratio", 0.22))))
    posts: list[dict] = []
    metadata: list[dict] = []
    matches: list[dict] = []
    edges: list[dict] = []
    labels: list[dict] = []
    profiles: dict[str, dict] = {}

    for campaign in campaigns:
        campaign = dict(campaign)
        campaign.setdefault("campaign_id", slug(campaign["company"] + "-" + campaign["campaign"]))
        campaign.setdefault("product", campaign["campaign"])
        for platform in platforms:
            roots: list[dict] = []
            for index in range(roots_per_platform):
                post_id = f"sim-{slug(platform)}-{slug(campaign['campaign_id'])}-p{index + 1:05d}"
                author_number = rng.randint(0, max(20, roots_per_platform // 2))
                user_id = synthetic_user(platform, campaign["campaign_id"], author_number)
                if user_id not in profiles:
                    profile_lang = rng.choice(LANGS)
                    profiles[user_id] = {"language": profile_lang, "user_bio": rng.choice(BIOS), "user_location": rng.choice(REGIONS)}
                profile = profiles[user_id]
                sentiment = rng.choices(["positive", "negative", "neutral", "mixed", "sarcastic", "support"], weights=[23, 19, 16, 16, 11, 15], k=1)[0]
                method = rng.choices(["exact_keyword", "hashtag", "official_account", "semantic_match"], weights=[52, 18, 12, 18], k=1)[0]
                content_type = "post"
                if method == "official_account":
                    author_number = 0
                    user_id = synthetic_user(platform, campaign["campaign_id"], author_number)
                    profiles.setdefault(user_id, {"language": "en", "user_bio": "Official campaign account (simulated)", "user_location": "Not specified"})
                lang = rng.choice(LANGS)
                text, term = synthetic_post_text(rng, campaign, lang, sentiment, method, content_type)
                published = start + timedelta(seconds=rng.randint(0, max(1, int((now - start).total_seconds()))))
                post = {"post_id": post_id, "platform": platform, "user_id": user_id, "timestamp": utc_text(published), "text": text, "parent_id": "", "language": lang, "user_bio": profiles[user_id]["user_bio"], "user_location": profiles[user_id]["user_location"]}
                posts.append(post)
                metadata.append({"post_id": post_id, "source_mode": "synthetic_demo", "source_post_id": post_id, "source_url": "", "content_type": content_type, "conversation_id": post_id, "root_post_id": post_id, "published_at_utc": post["timestamp"], "collected_at_utc": utc_text(now), "likes_count": str(rng.randint(0, 450)), "reposts_count": str(rng.randint(0, 80)), "replies_count": "0", "quotes_count": "0", "views_count": str(rng.randint(50, 25000)), "profile_provenance": "synthetic fictional profile"})
                confidence = rng.uniform(0.78, 0.99) if method != "semantic_match" else rng.uniform(0.58, 0.84)
                matches.append(campaign_match(post_id, campaign, method, term, confidence))
                aspect, topic = rng.choice(ASPECTS), rng.choice(campaign.get("topics", TOPICS))
                emotion = rng.choice(EMOTIONS) if sentiment not in ("neutral", "mixed") else ("curiosity|concern" if sentiment == "mixed" else "curiosity")
                stance = {"positive": "support", "support": "support", "negative": "opposition", "sarcastic": "opposition", "neutral": "question", "mixed": "mixed"}[sentiment]
                labels.append({"post_id": post_id, "campaign_id": campaign["campaign_id"], "sentiment": sentiment, "emotions": emotion, "stance": stance, "aspect": aspect, "topic": topic, "label_status": "synthetic_expected_label_not_model_output"})
                roots.append({"post": post, "metadata": metadata[-1], "sentiment": sentiment, "method": method})

            # Generate reply posts with stable profile fields and explicit parent IDs.
            for reply_index in range(round(roots_per_platform * reply_ratio)):
                parent = rng.choice(roots)
                parent_post = parent["post"]
                parent_time = datetime.strptime(parent_post["timestamp"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
                published = min(now, parent_time + timedelta(minutes=rng.randint(2, 72 * 60)))
                author_number = rng.randint(1, max(20, roots_per_platform // 2))
                user_id = synthetic_user(platform, campaign["campaign_id"], author_number)
                if user_id not in profiles:
                    profiles[user_id] = {"language": rng.choice(LANGS), "user_bio": rng.choice(BIOS), "user_location": rng.choice(REGIONS)}
                sentiment = rng.choice(["positive", "negative", "neutral", "mixed", "sarcastic", "support"])
                text, term = synthetic_post_text(rng, campaign, profiles[user_id]["language"], sentiment, "thread_connection", "reply")
                post_id = f"sim-{slug(platform)}-{slug(campaign['campaign_id'])}-r{reply_index + 1:05d}"
                post = {"post_id": post_id, "platform": platform, "user_id": user_id, "timestamp": utc_text(published), "text": text, "parent_id": parent_post["post_id"], "language": profiles[user_id]["language"], "user_bio": profiles[user_id]["user_bio"], "user_location": profiles[user_id]["user_location"]}
                posts.append(post)
                metadata.append({"post_id": post_id, "source_mode": "synthetic_demo", "source_post_id": post_id, "source_url": "", "content_type": "reply", "conversation_id": parent_post["post_id"], "root_post_id": parent_post["post_id"], "published_at_utc": post["timestamp"], "collected_at_utc": utc_text(now), "likes_count": str(rng.randint(0, 120)), "reposts_count": str(rng.randint(0, 20)), "replies_count": "0", "quotes_count": "0", "views_count": str(rng.randint(10, 5000)), "profile_provenance": "synthetic fictional profile"})
                matches.append(campaign_match(post_id, campaign, "thread_connection", term, rng.uniform(0.76, 0.98)))
                aspect, topic = rng.choice(ASPECTS), rng.choice(campaign.get("topics", TOPICS))
                emotion = rng.choice(EMOTIONS)
                stance = {"positive": "support", "support": "support", "negative": "opposition", "sarcastic": "opposition", "neutral": "question", "mixed": "mixed"}[sentiment]
                labels.append({"post_id": post_id, "campaign_id": campaign["campaign_id"], "sentiment": sentiment, "emotions": emotion, "stance": stance, "aspect": aspect, "topic": topic, "label_status": "synthetic_expected_label_not_model_output"})
                parent_user = parent_post["user_id"]
                edge = {"source_mode": "synthetic_demo", "campaign_id": campaign["campaign_id"], "platform": platform, "actor_user_id": user_id, "target_user_id": parent_user, "event_post_id": post_id, "target_post_id": parent_post["post_id"], "edge_type": "reply_to", "occurred_at_utc": post["timestamp"], "evidence_ref": f"synthetic:{post_id}", "provenance": "synthetic observable-style fixture", "confidence": "1.00"}
                edge["edge_id"] = edge_id(edge)
                edges.append(edge)

            # Quotes are posts with an explicit quote edge; reposts are event edges only.
            for quote_index in range(round(roots_per_platform * quote_ratio)):
                parent = rng.choice(roots)
                original = parent["post"]
                author_number = rng.randint(1, max(20, roots_per_platform // 2))
                user_id = synthetic_user(platform, campaign["campaign_id"], author_number)
                if user_id not in profiles:
                    profiles[user_id] = {"language": rng.choice(LANGS), "user_bio": rng.choice(BIOS), "user_location": rng.choice(REGIONS)}
                sentiment = rng.choice(["positive", "negative", "mixed", "sarcastic"])
                text, term = synthetic_post_text(rng, campaign, profiles[user_id]["language"], sentiment, "thread_connection", "quote")
                quote_id = f"sim-{slug(platform)}-{slug(campaign['campaign_id'])}-q{quote_index + 1:05d}"
                published = min(now, datetime.strptime(original["timestamp"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc) + timedelta(minutes=rng.randint(1, 48 * 60)))
                post = {"post_id": quote_id, "platform": platform, "user_id": user_id, "timestamp": utc_text(published), "text": text, "parent_id": "", "language": profiles[user_id]["language"], "user_bio": profiles[user_id]["user_bio"], "user_location": profiles[user_id]["user_location"]}
                posts.append(post)
                metadata.append({"post_id": quote_id, "source_mode": "synthetic_demo", "source_post_id": quote_id, "source_url": "", "content_type": "quote", "conversation_id": original["post_id"], "root_post_id": original["post_id"], "published_at_utc": post["timestamp"], "collected_at_utc": utc_text(now), "likes_count": str(rng.randint(0, 160)), "reposts_count": str(rng.randint(0, 40)), "replies_count": "0", "quotes_count": "0", "views_count": str(rng.randint(20, 8000)), "profile_provenance": "synthetic fictional profile"})
                matches.append(campaign_match(quote_id, campaign, "thread_connection", term, rng.uniform(0.75, 0.97)))
                labels.append({"post_id": quote_id, "campaign_id": campaign["campaign_id"], "sentiment": sentiment, "emotions": rng.choice(EMOTIONS), "stance": "mixed" if sentiment == "mixed" else "opposition" if sentiment in ("negative", "sarcastic") else "support", "aspect": rng.choice(ASPECTS), "topic": rng.choice(campaign.get("topics", TOPICS)), "label_status": "synthetic_expected_label_not_model_output"})
                edge = {"source_mode": "synthetic_demo", "campaign_id": campaign["campaign_id"], "platform": platform, "actor_user_id": user_id, "target_user_id": original["user_id"], "event_post_id": quote_id, "target_post_id": original["post_id"], "edge_type": "quote_of", "occurred_at_utc": post["timestamp"], "evidence_ref": f"synthetic:{quote_id}", "provenance": "synthetic observable-style fixture", "confidence": "1.00"}
                edge["edge_id"] = edge_id(edge)
                edges.append(edge)

            for repost_index in range(round(roots_per_platform * repost_ratio)):
                parent = rng.choice(roots)
                original = parent["post"]
                actor_number = rng.randint(1, max(20, roots_per_platform // 2))
                actor = synthetic_user(platform, campaign["campaign_id"], actor_number)
                published = min(now, datetime.strptime(original["timestamp"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc) + timedelta(minutes=rng.randint(1, 48 * 60)))
                edge = {"source_mode": "synthetic_demo", "campaign_id": campaign["campaign_id"], "platform": platform, "actor_user_id": actor, "target_user_id": original["user_id"], "event_post_id": "", "target_post_id": original["post_id"], "edge_type": "repost_of", "occurred_at_utc": utc_text(published), "evidence_ref": f"synthetic:repost:{repost_index + 1}", "provenance": "synthetic observable-style fixture", "confidence": "1.00"}
                edge["edge_id"] = edge_id(edge)
                edges.append(edge)

    metadata_by_id = {row["post_id"]: row for row in metadata}
    for edge in edges:
        target = metadata_by_id.get(edge.get("target_post_id", ""))
        if not target:
            continue
        metric_column = {"reply_to": "replies_count", "quote_of": "quotes_count", "repost_of": "reposts_count"}.get(edge["edge_type"])
        if metric_column:
            target[metric_column] = str(int(target.get(metric_column, "0") or "0") + 1)
    posts.sort(key=lambda row: (row["timestamp"], row["post_id"]))
    return posts, metadata, matches, edges, labels


def generate_demo(config: dict) -> dict:
    conn = database()
    try:
        # Refresh only the synthetic fixture; any live records remain untouched.
        conn.execute("DELETE FROM campaign_matches WHERE post_id IN (SELECT post_id FROM post_metadata WHERE source_mode='synthetic_demo')")
        conn.execute("DELETE FROM interactions WHERE source_mode='synthetic_demo'")
        conn.execute("DELETE FROM expected_labels WHERE post_id IN (SELECT post_id FROM post_metadata WHERE source_mode='synthetic_demo')")
        conn.execute("DELETE FROM posts WHERE post_id IN (SELECT post_id FROM post_metadata WHERE source_mode='synthetic_demo')")
        conn.execute("DELETE FROM post_metadata WHERE source_mode='synthetic_demo'")
        # Remove orphaned fixture rows created by the earlier, smaller prototype.
        conn.execute("DELETE FROM posts WHERE post_id LIKE 'sim-%' AND post_id NOT IN (SELECT post_id FROM post_metadata)")
        conn.commit()
        bundle = make_synthetic_bundle(config)
        saved = save_bundle(conn, *bundle)
        result = export_mode(conn, "demo")
        result["generated_records"] = saved
        result["window_days"] = int(config.get("window_days", 30))
        result["campaigns"] = [campaign.get("campaign_id", slug(campaign["company"] + "-" + campaign["campaign"])) for campaign in config["campaigns"]]
        (OUT / "demo_manifest.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        print(f"Generated {result['post_count']:,} simulated posts and {result['interaction_edge_count']:,} interaction edges. No API was called.")
        return result
    finally:
        conn.close()


# ------------------------------- X adapter ----------------------------------

def safe_get_json(url: str, headers: dict[str, str], timeout: int = 30) -> dict:
    request = urllib.request.Request(url, headers=headers, method="GET")
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code == 429 and attempt < 3:
                retry_after = int(exc.headers.get("Retry-After", "10"))
                time.sleep(max(1, min(retry_after, 120)))
                continue
            if exc.code >= 500 and attempt < 3:
                time.sleep(2 ** attempt)
                continue
            if exc.code in (401, 403):
                raise RuntimeError(f"The API rejected authentication or access (HTTP {exc.code}). Check credentials, permissions, and plan access.") from None
            if exc.code == 429:
                raise RuntimeError("The API rate limit was reached after retries. The run status records the failure.") from None
            raise RuntimeError(f"The API request failed with HTTP {exc.code}. No response body or credential was logged.") from None
        except urllib.error.URLError as exc:
            if attempt < 3:
                time.sleep(2 ** attempt)
                continue
            raise RuntimeError(f"Network request failed: {exc.reason}") from None
    raise RuntimeError("The API request failed after retries.")


def x_query(campaign: dict) -> str:
    terms = []
    for term in campaign.get("keywords", []) + campaign.get("hashtags", []) + campaign.get("aliases", []) + campaign.get("urls", []):
        value = str(term).strip()
        if not value:
            continue
        terms.append(value if value.startswith("#") or value.startswith("http") else '"' + value.replace('"', '') + '"')
    for account in campaign.get("official_accounts", []) + campaign.get("competitor_accounts", []):
        account = str(account).strip().lstrip("@")
        if account:
            terms.append("from:" + account)
    if not terms:
        raise ValueError(f"Campaign {campaign.get('campaign_id', campaign.get('campaign'))} needs at least one X keyword, hashtag, URL, or account.")
    query = "(" + " OR ".join(terms) + ")"
    exclusions = [str(item).strip() for item in campaign.get("exclusions", []) if str(item).strip()]
    if exclusions:
        query += " " + " ".join("-\"" + item.replace('"', '') + "\"" for item in exclusions)
    if len(query) > 512:
        raise ValueError("This campaign's X search query exceeds 512 characters. Split its terms across campaigns or reduce the term list.")
    return query


def x_match(post: dict, campaign: dict, users: dict) -> tuple[str, str, float] | None:
    text = str(post.get("text", ""))
    lowered = text.casefold()
    if any(str(item).casefold() in lowered for item in campaign.get("exclusions", [])):
        return None
    for term in campaign.get("keywords", []) + campaign.get("hashtags", []) + campaign.get("aliases", []) + campaign.get("urls", []):
        if str(term).casefold() in lowered:
            method = "hashtag" if str(term).startswith("#") else "exact_keyword"
            return method, str(term), 1.0
    user = users.get(str(post.get("author_id", "")), {})
    username = str(user.get("username", "")).casefold()
    configured = [str(item).strip().lstrip("@").casefold() for item in campaign.get("official_accounts", []) + campaign.get("competitor_accounts", [])]
    if username and username in configured:
        return "account", "configured account", 0.99
    # Results came from a constrained X query; keep the retrieval reason explicit.
    return "query_match", "configured X query", 0.75


def collect_x_campaign(conn: sqlite3.Connection, config: dict, campaign: dict, bearer: str, user_token: str | None, limits: dict) -> tuple[int, list, list, list, list]:
    posts: list[dict] = []
    metadata: list[dict] = []
    matches: list[dict] = []
    edges: list[dict] = []
    max_pages = max(1, min(20, int(limits.get("x_max_pages", 2))))
    max_results = max(10, min(100, int(limits.get("x_max_results", 100))))
    query = x_query(campaign)
    headers = {"Authorization": f"Bearer {bearer}", "User-Agent": "SocialCampaignIntelligenceDemo/1.0"}
    cursor_key = "x_since_" + campaign["campaign_id"]
    user_fields = "id,username"
    if config.get("live", {}).get("collect_public_profile_fields", False):
        user_fields += ",description,location,public_metrics"
    params = {"query": query, "max_results": str(max_results), "tweet.fields": "author_id,created_at,conversation_id,lang,public_metrics,referenced_tweets,entities,in_reply_to_user_id", "expansions": "author_id,referenced_tweets.id,referenced_tweets.id.author_id", "user.fields": user_fields}
    since_id = db_state(conn, cursor_key)
    if since_id:
        params["since_id"] = since_id
    fetched = 0
    max_seen_id = ""
    for _ in range(max_pages):
        url = "https://api.x.com/2/tweets/search/recent?" + urllib.parse.urlencode(params)
        payload = safe_get_json(url, headers)
        included_users = {str(user.get("id")): user for user in payload.get("includes", {}).get("users", [])}
        included_posts = {str(post.get("id")): post for post in payload.get("includes", {}).get("tweets", [])}
        if not payload.get("data"):
            break
        ids_in_page = [str(item.get("id", "")) for item in payload["data"] if item.get("id")]
        if ids_in_page:
            page_max = max(ids_in_page, key=lambda value: int(value) if value.isdigit() else 0)
            if not max_seen_id or (page_max.isdigit() and max_seen_id.isdigit() and int(page_max) > int(max_seen_id)):
                max_seen_id = page_max
        for item in payload["data"]:
            fetched += 1
            match = x_match(item, campaign, included_users)
            if not match:
                continue
            method, term, confidence = match
            raw_id = str(item.get("id", ""))
            author_source = str(item.get("author_id", "unknown"))
            post_id = "x-" + raw_id
            user_id = anonymize("X", author_source)
            created = api_time(item.get("created_at"))
            public_metrics = item.get("public_metrics", {})
            profile = included_users.get(author_source, {})
            collect_profile = bool(config.get("live", {}).get("collect_public_profile_fields", False))
            bio = redact_contact_details(str(profile.get("description", ""))) if collect_profile else ""
            location = str(profile.get("location", "")) if collect_profile else ""
            post = {"post_id": post_id, "platform": "X", "user_id": user_id, "timestamp": created, "text": redact_contact_details(str(item.get("text", ""))), "parent_id": "", "language": str(item.get("lang", "")), "user_bio": bio, "user_location": location}
            references = item.get("referenced_tweets", []) or []
            conversation_id = str(item.get("conversation_id", raw_id))
            root_post_id = "x-" + conversation_id
            content_type = "post"
            for reference in references:
                ref_type = str(reference.get("type", ""))
                target_id = str(reference.get("id", ""))
                if ref_type == "replied_to":
                    post["parent_id"] = "x-" + target_id
                    content_type = "reply"
                    edge_type = "reply_to"
                elif ref_type == "quoted":
                    content_type = "quote"
                    edge_type = "quote_of"
                elif ref_type == "retweeted":
                    content_type = "repost"
                    edge_type = "repost_of"
                else:
                    continue
                referenced_author = str(included_posts.get(target_id, {}).get("author_id", ""))
                edge = {"source_mode": "x_live", "campaign_id": campaign["campaign_id"], "platform": "X", "actor_user_id": user_id, "target_user_id": anonymize("X", referenced_author) if referenced_author else "", "event_post_id": post_id, "target_post_id": "x-" + target_id, "edge_type": edge_type, "occurred_at_utc": created, "evidence_ref": "https://x.com/i/status/" + raw_id, "provenance": "direct X referenced_tweets field", "confidence": "1.00"}
                edge["edge_id"] = edge_id(edge)
                edges.append(edge)
            url_ref = "https://x.com/i/status/" + raw_id
            posts.append(post)
            metadata.append({"post_id": post_id, "source_mode": "x_live", "source_post_id": raw_id, "source_url": url_ref, "content_type": content_type, "conversation_id": "x-" + conversation_id, "root_post_id": root_post_id, "published_at_utc": created, "collected_at_utc": utc_text(), "likes_count": public_metrics.get("like_count", ""), "reposts_count": public_metrics.get("retweet_count", ""), "replies_count": public_metrics.get("reply_count", ""), "quotes_count": public_metrics.get("quote_count", ""), "views_count": public_metrics.get("impression_count", ""), "profile_provenance": "source-provided public profile fields" if collect_profile else "not collected"})
            matches.append(campaign_match(post_id, campaign, method, term, confidence))
        next_token = payload.get("meta", {}).get("next_token")
        if not next_token:
            break
        params["pagination_token"] = next_token
    saved = save_bundle(conn, posts, metadata, matches, edges)
    old = db_state(conn, cursor_key)
    if max_seen_id and (not old or (max_seen_id.isdigit() and old.isdigit() and int(max_seen_id) > int(old))):
        set_state(conn, cursor_key, max_seen_id)
        conn.commit()
    return fetched, posts, metadata, matches, edges


def collect_x_owned_account(conn: sqlite3.Connection, config: dict, campaign: dict, user_token: str, limits: dict) -> tuple[int, int]:
    """Read an explicitly connected account timeline with its user token."""
    account_ids = [str(value) for value in campaign.get("connected_account_ids", [])]
    if not account_ids:
        return 0, 0
    seed_ids = {str(value) for value in campaign.get("seed_post_ids", [])}
    max_pages = max(1, min(20, int(limits.get("x_max_pages", 2))))
    max_results = max(5, min(100, int(limits.get("x_max_results", 100))))
    headers = {"Authorization": f"Bearer {user_token}", "User-Agent": "SocialCampaignIntelligenceDemo/1.0"}
    total_fetched = total_saved = 0
    for account_id in account_ids:
        cursor_key = "x_owned_since_" + campaign["campaign_id"] + "_" + account_id
        params = {"max_results": str(max_results), "tweet.fields": "author_id,created_at,conversation_id,lang,public_metrics,referenced_tweets,entities", "expansions": "author_id,referenced_tweets.id,referenced_tweets.id.author_id", "user.fields": "id"}
        since_id = db_state(conn, cursor_key)
        if since_id:
            params["since_id"] = since_id
        for _ in range(max_pages):
            url = f"https://api.x.com/2/users/{urllib.parse.quote(account_id)}/tweets?" + urllib.parse.urlencode(params)
            payload = safe_get_json(url, headers)
            items = payload.get("data", []) or []
            total_fetched += len(items)
            page_ids = [str(item.get("id", "")) for item in items if item.get("id")]
            included = {str(user.get("id")): user for user in payload.get("includes", {}).get("users", [])}
            posts, metadata, matches, edges = [], [], [], []
            for item in items:
                raw_id = str(item.get("id", ""))
                text = str(item.get("text", ""))
                lowered = text.casefold()
                if any(str(value).casefold() in lowered for value in campaign.get("exclusions", [])):
                    continue
                match = next((("exact_keyword", str(term), 1.0) for term in campaign.get("keywords", []) + campaign.get("hashtags", []) + campaign.get("aliases", []) if str(term).casefold() in lowered), None)
                if raw_id in seed_ids:
                    match = ("seed_post", raw_id, 1.0)
                elif not match and campaign.get("include_all_connected_posts"):
                    match = ("owned_account", "authorized account timeline", 0.9)
                if not match:
                    continue
                method, term, confidence = match
                # This source is the customer-authorized timeline, so inclusion
                # is also recorded as an owned-account observation.
                author_source = str(item.get("author_id", account_id))
                user_id = anonymize("X", author_source)
                post_id = "x-" + raw_id
                created = api_time(item.get("created_at"))
                metrics = item.get("public_metrics", {})
                parent_id = ""
                content_type = "post"
                for reference in item.get("referenced_tweets", []) or []:
                    ref_type, target_id = str(reference.get("type", "")), str(reference.get("id", ""))
                    edge_type = {"replied_to": "reply_to", "quoted": "quote_of", "retweeted": "repost_of"}.get(ref_type)
                    if not edge_type:
                        continue
                    if edge_type == "reply_to":
                        parent_id, content_type = "x-" + target_id, "reply"
                    elif edge_type == "quote_of":
                        content_type = "quote"
                    else:
                        content_type = "repost"
                    edge = {"source_mode": "x_owned_live", "campaign_id": campaign["campaign_id"], "platform": "X", "actor_user_id": user_id, "target_user_id": "", "event_post_id": post_id, "target_post_id": "x-" + target_id, "edge_type": edge_type, "occurred_at_utc": created, "evidence_ref": "https://x.com/i/status/" + raw_id, "provenance": "direct X referenced_tweets field", "confidence": "1.00"}
                    edge["edge_id"] = edge_id(edge)
                    edges.append(edge)
                posts.append({"post_id": post_id, "platform": "X", "user_id": user_id, "timestamp": created, "text": redact_contact_details(text), "parent_id": parent_id, "language": str(item.get("lang", "")), "user_bio": "", "user_location": ""})
                metadata.append({"post_id": post_id, "source_mode": "x_owned_live", "source_post_id": raw_id, "source_url": "https://x.com/i/status/" + raw_id, "content_type": content_type, "conversation_id": "x-" + str(item.get("conversation_id", raw_id)), "root_post_id": "x-" + str(item.get("conversation_id", raw_id)), "published_at_utc": created, "collected_at_utc": utc_text(), "likes_count": metrics.get("like_count", ""), "reposts_count": metrics.get("retweet_count", ""), "replies_count": metrics.get("reply_count", ""), "quotes_count": metrics.get("quote_count", ""), "views_count": metrics.get("impression_count", ""), "profile_provenance": "not collected"})
                matches.append(campaign_match(post_id, campaign, method, term, confidence))
            total_saved += save_bundle(conn, posts, metadata, matches, edges)
            if page_ids:
                max_id = max(page_ids, key=lambda value: int(value) if value.isdigit() else 0)
                old = db_state(conn, cursor_key)
                if not old or (max_id.isdigit() and old.isdigit() and int(max_id) > int(old)):
                    set_state(conn, cursor_key, max_id)
                    conn.commit()
            next_token = payload.get("meta", {}).get("next_token")
            if not next_token:
                break
            params["pagination_token"] = next_token
    return total_fetched, total_saved


# ----------------------------- Telegram adapter ----------------------------

def telegram_api(token: str, method: str, params: dict) -> dict:
    url = f"https://api.telegram.org/bot{token}/{method}"
    body = urllib.parse.urlencode(params).encode("utf-8")
    request = urllib.request.Request(url, data=body, headers={"Content-Type": "application/x-www-form-urlencoded", "User-Agent": "SocialCampaignIntelligenceDemo/1.0"}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=int(params.get("timeout", 15)) + 10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"Telegram API returned HTTP {exc.code}; bot token was not logged.") from None
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Telegram network request failed: {exc.reason}") from None
    if not payload.get("ok"):
        raise RuntimeError("Telegram rejected the request; check token, bot status, chat access, and allowed updates.")
    return payload


def telegram_message_to_bundle(message: dict, campaign: dict, now: datetime) -> tuple[dict, dict, dict, list] | None:
    content = str(message.get("text") or message.get("caption") or "")
    if not content.strip():
        return None
    lowered = content.casefold()
    if any(str(item).casefold() in lowered for item in campaign.get("exclusions", [])):
        return None
    term = next((str(item) for item in campaign.get("keywords", []) + campaign.get("hashtags", []) + campaign.get("aliases", []) if str(item).casefold() in lowered), "")
    if not term:
        return None
    chat = message.get("chat", {})
    sender = message.get("from", {})
    sender_chat = message.get("sender_chat", {})
    source_user_id = str(sender.get("id") or sender_chat.get("id") or "unknown")
    user_id = anonymize("Telegram", source_user_id)
    chat_id = str(chat.get("id", "unknown"))
    message_id = str(message.get("message_id", "unknown"))
    post_id = "tg-" + hashlib.sha256(f"{chat_id}:{message_id}".encode("utf-8")).hexdigest()[:20]
    reply = message.get("reply_to_message") or {}
    parent_source = str(reply.get("message_id", ""))
    parent_id = "tg-" + hashlib.sha256(f"{chat_id}:{parent_source}".encode("utf-8")).hexdigest()[:20] if parent_source else ""
    published = datetime.fromtimestamp(int(message.get("date", int(now.timestamp()))), tz=timezone.utc)
    language = str(sender.get("language_code", ""))
    post = {"post_id": post_id, "platform": "Telegram", "user_id": user_id, "timestamp": utc_text(published), "text": redact_contact_details(content), "parent_id": parent_id, "language": language, "user_bio": "", "user_location": ""}
    metadata = {"post_id": post_id, "source_mode": "telegram_live", "source_post_id": message_id, "source_url": "", "content_type": "reply" if parent_id else "post", "conversation_id": parent_id or post_id, "root_post_id": parent_id or post_id, "published_at_utc": post["timestamp"], "collected_at_utc": utc_text(now), "likes_count": "", "reposts_count": "", "replies_count": "", "quotes_count": "", "views_count": "", "profile_provenance": "language_code only; no biography or location collected"}
    match = campaign_match(post_id, campaign, "thread_connection" if parent_id else "exact_keyword", term, 1.0)
    edges = []
    if parent_id:
        edge = {"source_mode": "telegram_live", "campaign_id": campaign["campaign_id"], "platform": "Telegram", "actor_user_id": user_id, "target_user_id": "", "event_post_id": post_id, "target_post_id": parent_id, "edge_type": "reply_to", "occurred_at_utc": post["timestamp"], "evidence_ref": "telegram message reference", "provenance": "Telegram reply_to_message field", "confidence": "1.00"}
        edge["edge_id"] = edge_id(edge)
        edges.append(edge)
    return post, metadata, match, edges


def collect_telegram_once(conn: sqlite3.Connection, config: dict, token: str) -> tuple[int, int]:
    tg_config = config.get("live", {}).get("telegram", {})
    allowed_chats = {str(value) for value in tg_config.get("allowed_chat_ids", [])}
    if not allowed_chats:
        raise RuntimeError("Add authorized Telegram chat IDs to live.telegram.allowed_chat_ids before collection.")
    cursor_key = "telegram_update_offset"
    offset = int(db_state(conn, cursor_key) or "0")
    payload = telegram_api(token, "getUpdates", {"offset": offset, "timeout": int(tg_config.get("long_poll_seconds", 5)), "allowed_updates": json.dumps(["message", "edited_message", "channel_post", "edited_channel_post"])})
    posts: list[dict] = []
    metadata: list[dict] = []
    matches: list[dict] = []
    edges: list[dict] = []
    updates = payload.get("result", [])
    max_update = offset - 1
    for update in updates:
        max_update = max(max_update, int(update.get("update_id", offset - 1)))
        message = next((update.get(key) for key in ("message", "edited_message", "channel_post", "edited_channel_post") if update.get(key)), None)
        if not message or str(message.get("chat", {}).get("id", "")) not in allowed_chats:
            continue
        for campaign in config["campaigns"]:
            campaign = dict(campaign)
            campaign.setdefault("campaign_id", slug(campaign["company"] + "-" + campaign["campaign"]))
            bundle = telegram_message_to_bundle(message, campaign, utc_now())
            if bundle:
                post, meta, match, post_edges = bundle
                posts.append(post)
                metadata.append(meta)
                matches.append(match)
                edges.extend(post_edges)
                break
    saved = save_bundle(conn, posts, metadata, matches, edges)
    if updates:
        set_state(conn, cursor_key, str(max_update + 1))
        conn.commit()
    return len(updates), saved


# ------------------------------- Run tracking -------------------------------

def record_run(conn: sqlite3.Connection, platform: str, mode: str, start: str, status: str, fetched: int, saved: int, message: str) -> None:
    run_id = str(uuid.uuid4())
    conn.execute("INSERT INTO collection_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", (run_id, platform, mode, start, utc_text(), status, fetched, saved, message[:300]))
    conn.commit()


def collect_live(config: dict, sources: list[str], acknowledge_x_cost: bool, watch: bool, interval: int) -> None:
    load_dotenv()
    x_token = os.getenv("X_BEARER_TOKEN", "")
    tg_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    if "x" in sources and not acknowledge_x_cost:
        raise RuntimeError("X collection may incur usage charges. Re-run with --acknowledge-x-cost after reviewing the current X API pricing.")
    has_owned_ids = any(campaign.get("connected_account_ids") for campaign in config.get("campaigns", []))
    user_token = os.getenv("X_USER_ACCESS_TOKEN", "")
    if "x" in sources and not x_token and not (has_owned_ids and user_token):
        raise RuntimeError("X_BEARER_TOKEN is missing for public search. Add it to .env, or configure connected_account_ids and X_USER_ACCESS_TOKEN for owned-account mode. No request was sent.")
    if "telegram" in sources and not tg_token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN is missing from the local .env. No request was sent.")
    if "x" in sources or "telegram" in sources:
        if not os.getenv("SOCIAL_PIPELINE_PSEUDONYM_KEY"):
            raise RuntimeError("SOCIAL_PIPELINE_PSEUDONYM_KEY is missing from the local .env. No request was sent.")
    conn = database()
    try:
        while True:
            for source in sources:
                started = utc_text()
                fetched = saved = 0
                try:
                    if source == "x":
                        limits = config.get("live", {})
                        for campaign in config["campaigns"]:
                            scoped = dict(campaign)
                            scoped.setdefault("campaign_id", slug(campaign["company"] + "-" + campaign["campaign"]))
                            if x_token:
                                count, posts, metadata, matches, edges = collect_x_campaign(conn, config, scoped, x_token, user_token, limits)
                                fetched += count
                                saved += len(posts)
                            if user_token and scoped.get("connected_account_ids"):
                                count, stored = collect_x_owned_account(conn, config, scoped, user_token, limits)
                                fetched += count
                                saved += stored
                        record_run(conn, "X", "public_search", started, "success", fetched, saved, "X recent search completed; use sidecars for match and edge details.")
                        print(f"X: fetched {fetched:,} results; saved {saved:,} matching posts.")
                    elif source == "telegram":
                        fetched, saved = collect_telegram_once(conn, config, tg_token)
                        record_run(conn, "Telegram", "authorized_chat_updates", started, "success", fetched, saved, "Polled configured chats accessible to the bot.")
                        print(f"Telegram: received {fetched:,} updates; saved {saved:,} matching messages.")
                except Exception as exc:
                    record_run(conn, source.upper(), "live", started, "error", fetched, saved, str(exc))
                    print(f"{source.upper()} collection failed: {exc}", file=sys.stderr)
            export_mode(conn, "live")
            if not watch:
                break
            time.sleep(max(30, interval))
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a rich synthetic demo or collect from configured official APIs.")
    subparsers = parser.add_subparsers(dest="command")
    demo_parser = subparsers.add_parser("demo", help="Generate the synthetic multi-campaign demo (default).")
    demo_parser.add_argument("--config", type=Path, default=HERE / "config.json")
    collect_parser = subparsers.add_parser("collect", help="Explicitly poll selected live sources.")
    collect_parser.add_argument("--config", type=Path, default=HERE / "config.json")
    collect_parser.add_argument("--sources", nargs="+", choices=["x", "telegram"], required=True)
    collect_parser.add_argument("--acknowledge-x-cost", action="store_true", help="Acknowledge X API read usage may cost money.")
    collect_parser.add_argument("--watch", action="store_true", help="Continue polling until stopped with Ctrl+C.")
    collect_parser.add_argument("--interval", type=int, default=300, help="Seconds between polling cycles while watching; minimum 30.")
    export_parser = subparsers.add_parser("export", help="Re-export stored live or synthetic records.")
    export_parser.add_argument("--mode", choices=["demo", "live"], required=True)
    export_parser.add_argument("--campaign-id", help="Select one campaign when publishing to the shared feed.")
    export_parser.add_argument("--publish-shared", action="store_true", help="Write the selected campaign to data/posts.csv using the fixed shared columns.")
    args = parser.parse_args()
    if args.command is None:
        generate_demo(load_config(HERE / "config.json"))
        return
    command = args.command
    if command == "demo":
        generate_demo(load_config(args.config))
    elif command == "collect":
        collect_live(load_config(args.config), args.sources, args.acknowledge_x_cost, args.watch, args.interval)
    elif command == "export":
        if args.campaign_id and not args.publish_shared:
            parser.error("--campaign-id is used with --publish-shared.")
        conn = database()
        try:
            print(json.dumps(export_mode(conn, args.mode), indent=2))
            if args.publish_shared:
                target = publish_shared_csv(conn, args.mode, args.campaign_id or "")
                print(f"Published one campaign using the agreed shared columns to {target}")
        finally:
            conn.close()


if __name__ == "__main__":
    main()
