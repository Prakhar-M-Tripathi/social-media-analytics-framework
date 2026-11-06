# Project Context

## Project
AI Social Media Analytics Framework, built for a hackathon. The system processes social media data to reveal how an online audience feels, who it is, what it discusses and how it influences each other.

## Five components (one per section)
- A. Data Collection and Timeline: gather time-stamped posts, comments and interactions into one clean dataset. Essential platforms: X and Telegram. Desirable: Instagram, Facebook. Bonus: Reddit, YouTube comments.
- B. Sentiment Analysis: detect emotions (sarcasm, anxiety, excitement, support, opposition) and show how they change over time.
- C. Demographic Profiling: aggregate and anonymised language, region, age bracket and professional interest estimates from public indicators.
- D. Trend and Topic Detection: find, rank and predict rising keywords, hashtags and topics over time.
- E. Network and Influence Analysis: map who interacts with whom, find key influencers and show how trends spread.

## Team and tools
- The team are beginners in coding and hackathons. Each member uses a different AI assistant.
- The project lead reviews and merges everything into `main`.
- The repository holds a simple static website (GitHub Pages). Analysis is done in Google Colab notebooks.

## Current decisions
- Data: a public dataset (for example Kaggle X or Telegram data) is the main source. The live collection pipeline is presented as an architecture design.
- Models: pre-trained only, no custom model training.
- Final output of the project: NOT yet decided. Each section stores its own results (CSV, charts, HTML, notebooks) in its folder and shows them on its section page. The lead will decide how to combine them later.
- Anything undecided stays open; do not invent decisions. Ask the user or the lead.

## Repository layout
- `index.html`: landing page (lead only)
- `sections/<name>/`: one folder per section (`index.html`, `README.md`, outputs)
- `data/`: shared dataset (`posts.csv`) and data notes
- `docs/`: project documents (lead only)
- `AGENTS.md`: instructions for AI assistants

## Branch and review process
- Each section has its own branch: `section/a-data-collection`, `section/b-sentiment`, `section/c-demographics`, `section/d-trends`, `section/e-network`.
- Members work only on their branch and open a pull request into `main`. The lead approves and merges.
- No one works directly on `main`.

## Judging view
Judges value a clear story and a working demo over technical depth. A modest working version of all five components is better than a polished version of two.
