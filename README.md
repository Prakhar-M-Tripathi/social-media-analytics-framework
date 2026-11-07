# AI Social Media Analytics Framework

A hackathon project that studies a social media audience through five lenses: data collection, sentiment, demographics, trends and network influence. Each team member owns one section.

Live site: https://prakhar-m-tripathi.github.io/social-media-analytics-framework/
Repository: https://github.com/Prakhar-M-Tripathi/social-media-analytics-framework
Project lead: Prakhar Mani Tripathi (reviews and approves every change to `main`)

## Sections and owners

| Section | Folder | Branch | Owner |
|---|---|---|---|
| A. Data Collection and Timeline | sections/a-data-collection | section/a-data-collection | (name) |
| B. Sentiment Analysis | sections/b-sentiment | section/b-sentiment | (name) |
| C. Demographic Profiling | sections/c-demographics | section/c-demographics | (name) |
| D. Trend and Topic Detection | sections/d-trends | section/d-trends | (name) |
| E. Network and Influence Analysis | sections/e-network | section/e-network | (name) |

## What you need (one time)

- A free GitHub account (github.com)
- GitHub Desktop (desktop.github.com)
- An AI assistant of your choice (ChatGPT, Gemini, Claude, Codex or any other)
- Optional: VS Code (code.visualstudio.com) to open and read files
- You do NOT need to install Python. Code runs in Google Colab (colab.research.google.com).

## Setup on your computer (one time)

1. Send the project lead your GitHub username. Accept the invitation emailed to you.
2. Open GitHub Desktop and sign in with your GitHub account.
3. Click **File > Clone repository**, choose `social-media-analytics-framework`, pick a folder, and click **Clone**.
4. Click **Current Branch** (top bar) and choose your section branch, for example `section/b-sentiment`.
5. Confirm that the top bar shows YOUR branch. Never work while it shows `main`.
6. Click **Repository > Show in Explorer** (Finder on Mac) to open the project folder.

## Start your AI assistant (important)

Your AI tool does not know this project. Give it the context:

1. Open the file `docs/FIRST_PROMPT.md` and copy the text inside.
2. Paste it as the first message in your AI assistant.
3. Attach or paste the files `AGENTS.md` and `docs/CONTEXT.md` when it asks, or if your tool can open the project folder directly, point it to the folder.

## Daily workflow

1. Open GitHub Desktop, check that your section branch is selected.
2. Click **Fetch origin**, then **Pull origin** if offered. This brings the latest files.
3. Work with your AI assistant. Save files only inside your own section folder.
4. In GitHub Desktop, review the changed files on the left. Only files from your folder should appear.
5. Type a short summary (for example "Add sentiment chart"), click **Commit to section/...**, then **Push origin**.
6. Click **Create Pull Request**. A browser page opens. Confirm the base is `main`, and click **Create pull request**.
7. Tell the project lead. The lead reviews and merges it.

## Rules

- Edit only inside your own section folder.
- Never edit the root `index.html`, the `docs` folder or another section's folder.
- Never change the shared data columns without asking the lead (see `docs/DATA_CONTRACT.md`).
- Never upload passwords, API keys or tokens.
- Show only aggregate, anonymised insights about users.
- If a screen looks different from these steps, send a screenshot to the lead before clicking anything.

## Where to find things

- `docs/PROBLEM_STATEMENT.md`: the hackathon problem
- `docs/CONTEXT.md`: project background and current decisions
- `docs/DATA_CONTRACT.md`: the shared data format
- `docs/COLAB_STARTERS.md`: starter code for each section (if added by the lead)
- `AGENTS.md`: rules your AI assistant must follow
- `assets/css/site-theme.css`: shared monochrome design system used by the project landing page and section pages
