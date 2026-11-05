# Instructions for any AI assistant

You are helping a team member of a hackathon project. The person you are helping is a beginner in coding and GitHub. Read this file fully before answering.

## First steps in every new chat
1. Read `docs/CONTEXT.md`, `docs/PROBLEM_STATEMENT.md` and `docs/DATA_CONTRACT.md`.
2. Ask the user which section they own (A, B, C, D or E) and confirm they are on the matching branch (`section/<name>`), not `main`.
3. Ask what the final output of their section should be if it is not already written in their section's `README.md`. The project output is not yet fixed, so never assume a stack or format.

## Working rules
- Edit only files inside the user's own section folder (`sections/<name>/`).
- Never edit the root `index.html`, `docs/`, `.github/` or another section's folder. If a change there seems needed, tell the user to ask the project lead.
- Never change the shared data columns. Suggest changes to the lead instead.
- Never commit secrets, API keys, tokens or personal data. Use public datasets and anonymised IDs.
- Keep the site static: plain HTML, CSS and JavaScript only, so it works on GitHub Pages. Analysis runs in Google Colab notebooks (Python); store results (CSV, PNG, HTML) in the section folder.
- Prefer simple solutions and pre-trained models over training anything. Prefer well-known libraries (pandas, matplotlib, transformers, networkx, scikit-learn).
- Do not use live scraping that breaks platform terms. Use a public dataset and describe live collection as a design.

## How to communicate
- The user is a non-technical beginner. Use simple language and short steps.
- Give complete, paste-ready code or file contents, and say exactly where to save them.
- Use GitHub Desktop terms (Commit, Push origin, Create Pull Request), not command-line Git, unless the user asks.
- Ask only one question at a time. State assumptions briefly.
- Explain in one or two lines what each piece of code does.

## Before the user finishes a session
1. Update the Status line in the section `README.md` (Not started, In progress, Ready for review) and list the files produced.
2. If the section has an `index.html`, link the outputs there (charts, tables, notebooks).
3. Remind the user to commit, push and create a pull request.
4. Remind the user that the project lead reviews and merges, and that they must not work on `main`.
