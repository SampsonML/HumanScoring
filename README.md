# Human Explanation Scoring

A static web app for collecting **human 0–10 scores** of model "explanation" prose,
to compare against the LLM judge. Pick a model and a world, read each seed's
explanation alongside that world's ground-truth + rubric, and assign a score.
Scores are submitted to a Google Sheet.

```
.
├── data/                  raw source files (criteria + explanations)
├── build_data.py          parses data/ -> data.json
├── data.json              generated; loaded by the app
├── index.html             the app
├── app.js                 app logic
├── style.css
├── apps_script/Code.gs    Google Apps Script backend
└── README.md
```

## How scoring works

- **Per seed.** Each model×world has up to 5 seeds; you score each one 0–10,
  matching how the judge scores each seed. `[no trial file]` seeds are shown but
  not scoreable.
- **Blind by default.** The judge's score is hidden while you score; flip
  **Reveal judge scores** to compare afterward.
- **Autosave.** Every score/note is saved to this browser's `localStorage`
  immediately, so a refresh or crash won't lose work. **Submit this world**
  pushes the current world's scored seeds to the Sheet. **Export JSON backup**
  downloads everything as a file (a safety net independent of the Sheet).

The `annotator` field tags every row — each grader should enter a consistent
name/id. Each submitted score becomes one Sheet row: `received_at, annotator,
model, world, seed, human_score, notes, judge_score, judge_raw, judge_max,
client_timestamp`.

## Updating the data

When the files in `data/` change, regenerate `data.json` and commit it:

```bash
python3 build_data.py
```
