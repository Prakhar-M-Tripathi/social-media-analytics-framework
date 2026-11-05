# Shared Data Contract

The shared dataset is `data/posts.csv`. Section A creates it. Sections B to E only read it.

## Required columns
| Column | Meaning |
|---|---|
| post_id | Unique ID of the post or comment |
| platform | Source platform (X, Telegram, Reddit and so on) |
| user_id | Anonymised ID of the author |
| timestamp | Date and time of the post (YYYY-MM-DD HH:MM:SS) |
| text | Text of the post or comment |
| parent_id | post_id of the post being replied to, empty if none |

## Optional columns (add where the dataset has them)
| Column | Used by |
|---|---|
| language | Section C |
| user_bio | Section C |
| user_location | Section C |

## Rules
- Do not rename or remove columns. Only the project lead changes this contract.
- Use anonymised user IDs. Never publish real names, phone numbers or handles in outputs.
- Each section saves its outputs (CSV, PNG, HTML, notebooks) inside its own section folder.
