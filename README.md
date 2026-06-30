# Human Explanation Scoring

A static web app for collecting **human 0–10 scores** of model "explanation" prose,
to compare against the LLM judge. Pick a model and a world, read each seed's
explanation alongside that world's ground-truth + rubric, and assign a score.
Scores are submitted to a Google Sheet. Hosts on GitHub Pages with no backend
server of your own.

```
.
├── data/                  raw source files (criteria + explanations)
├── build_data.py          parses data/ -> data.json   (run locally, commit output)
├── data.json              generated; loaded by the app
├── index.html             the app
├── app.js                 app logic  (set CONFIG.SHEETS_URL here)
├── style.css
├── apps_script/Code.gs    Google Apps Script backend (paste into Apps Script)
└── README.md
```

## 1. Build the data

Whenever the files in `data/` change, regenerate `data.json`:

```bash
python3 build_data.py
```

This parses:

- `data/criteria/<world>.txt` → ground truth, 0–10 rubric, full judge prompt
- `data/explanations/<model>/<world>.txt` → per-seed explanations + the judge's score

and writes `data.json`. Commit `data.json` alongside the source.

## 2. Set up the Google Sheet backend

1. Create a Google Sheet. Copy its ID from the URL
   (`.../spreadsheets/d/<ID>/edit`).
2. In the Sheet: **Extensions → Apps Script**. Replace the default file with
   `apps_script/Code.gs` and set `SHEET_ID`.
3. **Deploy → New deployment → Web app**
   - *Execute as:* **Me**
   - *Who has access:* **Anyone**
4. Copy the resulting `/exec` URL.
5. Paste it into `app.js`:

   ```js
   const CONFIG = {
     SHEETS_URL: "https://script.google.com/macros/s/AKfy.../exec",
     ...
   };
   ```

> Re-deploy a **new version** (Manage deployments → edit) each time you change
> `Code.gs`. You can open the `/exec` URL in a browser for a health check.

Each submitted score becomes one row: `received_at, annotator, model, world,
seed, human_score, notes, judge_score, judge_raw, judge_max, client_timestamp`.

If `SHEETS_URL` is left blank, the app still runs — Submit is disabled and you
use **Export JSON backup** instead.

## 3. Deploy to GitHub Pages

Commit everything to your repo, then enable Pages:

- **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
  branch `main`, folder `/ (root)`.

The site will be at `https://<user>.github.io/<repo>/`. (Same setup as your
DiscoverPhysicsLeaderboard.)

### Local preview

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

(A local server is required — opening `index.html` via `file://` blocks
`fetch("data.json")`.)

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
name/id.
