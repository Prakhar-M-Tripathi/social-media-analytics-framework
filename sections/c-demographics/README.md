# Section C: Demographic Profiling

- Owner team: (add names)
- Input: `data/posts.csv` (shared contract). Profile fields (`language`, `user_bio`, `user_location`) are joined from Section A's sidecar files when the shared file lacks them. Any CSV can also be loaded in the page.
- Output: aggregate, anonymised audience estimates on `index.html`, plus a downloadable summary CSV
- Status: Ready for review

## What the page shows

A static, dependency-free GitHub Pages dashboard (no CDN, no model download, no server). Everything is computed in the visitor's browser.

- **Languages**: main language per profile, from the language code or, if missing, the writing script (Devanagari, Arabic, Cyrillic and so on). Code-mixed labels such as Hinglish and Spanglish are kept.
- **Regions**: broad world region matched from the stated location text. Exact places are never shown.
- **Professional interests**: interest themes found in bio text with keyword rules (a profile can have several).
- **Life-stage cues**: approximate age brackets suggested by self-described words such as "student". This is the weakest signal and is shown with a warning.
- **Platform comparison** for language, region or interest, and the **largest region by interest segments**.
- Platform filter, a "Key findings" summary, and **Export aggregates** (CSV of group totals only).

## Privacy rules built into the code

- Aggregates only. No per-user row, handle, name or bio text is shown or exported.
- Groups with fewer than 5 profiles are merged into "Other (grouped for privacy)" and their exact size is shown as "<5".
- Brand or official accounts (for example "Official campaign account") are excluded from audience figures.
- Gender, ethnicity, religion, politics and health are not inferred.

## Files produced

- `index.html`: the dashboard
- `profiler.js`: analysis logic (runs in the browser and in Node)
- `make_summary.js`: optional helper that regenerates the saved summary (`node make_summary.js`)
- `output/demographic_summary_demo.csv`: aggregate results for the Section A synthetic demo data

## Limits

- Method is transparent keyword rules, not a trained model. Bios and locations are self-reported, short, and sometimes jokes. Rules miss many profiles (the page shows "not available" counts) and can mislabel others.
- One profile is one anonymised `user_id`; the same person on two platforms counts twice.
- With the Section A demo data the results describe fictional users and only show that the workflow works.
- `docs/DATA_CONTRACT.md` lists the three profile columns as optional. Section A's `--publish-shared` currently writes only the six required columns, so Section C reads the profile fields from `a-data-collection/output/*_post_metadata.csv` by `post_id`. If the lead adds the optional columns to `data/posts.csv`, Section C will use them directly with no change.
- Section A's README says not to infer age from these records. The life-stage panel is therefore aggregate-only and labelled a weak signal. The project lead should confirm whether to keep it.
