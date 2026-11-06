# Section B: Sentiment Analysis

- Owner team: (add names)
- Input: `data/posts.csv` using the agreed six columns, or a local CSV selected in the page
- Output: NLP sentiment/emotion estimates, time trends, emotion and stance-cue charts, platform comparisons, reply tone shifts, and downloadable results
- Status: In progress

## Browser NLP prototype

`index.html` is a static GitHub Pages dashboard. It automatically reads `../../data/posts.csv` when that shared file exists; otherwise it starts with a clearly marked fictional demo. A user can also load a CSV locally. It uses Hugging Face Transformers.js to run two pretrained ONNX models in the visitor's browser:

- `Horizon-Labs/multilingual-sentiment-small`: negative, neutral, positive; multilingual.
- `Horizon-Labs/multilingual-emotions-small`: GoEmotions based multilingual multi-label emotion estimates.

The first analysis downloads the browser runtime and quantized model weights from public CDNs/model hosting. The two model files total about 536 MB; the browser caches them for later use. There is no inference API key, paid inference subscription, or project server. The uploaded CSV text is processed on the device and is not sent to the model host. The first run requires a network connection; later runs may use cached model files.

The dashboard includes:

- Sentiment share over time.
- Daily emotion share for the four most common emotion labels.
- Top emotion cues, with multiple emotions allowed per post.
- Sentiment composition by platform.
- Reply versus parent sentiment changes, only for `parent_id` values matched in the loaded data.
- Supportive, opposition, and concern proxy groups mapped from emotion labels; these are not direct stance-model predictions.
- A post-level results table and downloadable CSV with model scores.

The default 24-post demo is fictional and should be used only to demonstrate the workflow. Upload a CSV containing exactly these shared fields: `post_id`, `platform`, `user_id`, `timestamp`, `text`, and `parent_id`. The analysis scope can be set to the first 100, first 500, or all posts. Platform filtering updates the dashboard after analysis.

## Limits

Scores are estimates, not probabilities that a post is objectively positive or negative. The emotion model's labels are English/Western social emotion categories, even where it supports multiple input languages. The supportive/opposition groupings are hand-mapped proxy cues. Neither model has a dedicated sarcasm class, and the dashboard does not claim to detect sarcasm. Performance depends on language, domain, short-text context, irony, and the campaign audience; review important results before making decisions. Large files can take a while to analyze in a browser.

The project currently has no shared `data/posts.csv` on this branch; the demo loads until Section A/project lead publishes the shared dataset. The shared schema does not include campaign ID, so campaign-specific comparisons need a lead-approved contract update.

## Files produced

- `index.html`: static dashboard, demo rows, model loading/inference, visualizations, CSV upload, and result export.

## References

- [Transformers.js pipeline documentation](https://huggingface.co/docs/transformers.js/v3.8.1/pipelines)
- [Multilingual sentiment model card](https://huggingface.co/Horizon-Labs/multilingual-sentiment-small)
- [Multilingual emotion model card](https://huggingface.co/Horizon-Labs/multilingual-emotions-small)
