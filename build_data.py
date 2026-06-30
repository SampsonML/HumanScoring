#!/usr/bin/env python3
"""
Build data.json for the human-scoring web app.

Parses:
  data/criteria/<world>.txt
  data/explanations/<model>/<world>.txt

Emits:
  data.json  (consumed by app.js)

Run from the repo root:
  python3 build_data.py
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
CRITERIA_DIR = DATA / "criteria"
EXPL_DIR = DATA / "explanations"
OUT = ROOT / "data.json"

# --- regexes -----------------------------------------------------------------
SEED_RE = re.compile(r"^---\s*seed\s+(\d+)\s*---\s*(.*)$")
SCORE_RE = re.compile(r"score:\s*([0-9.]+)\s*\((\d+)\s*/\s*(\d+)\)")
NO_TRIAL_RE = re.compile(r"\[no trial file\]", re.IGNORECASE)
HEADER_KV_RE = re.compile(r"^(Model|World|Judge|Seeds)\s*:\s*(.*)$")


def _between(text, start_tag, end_tag):
    """Return the text between two tags (exclusive), stripped, or '' if absent."""
    i = text.find(start_tag)
    if i == -1:
        return ""
    i += len(start_tag)
    j = text.find(end_tag, i)
    if j == -1:
        return ""
    return text[i:j].strip()


def _section(text, header):
    """Return the block under a '---' delimited section header, stripped."""
    # Sections look like:
    #   ----------------------------------------------------------------------
    #   HEADER
    #   ----------------------------------------------------------------------
    #   <body...>
    pat = re.compile(
        r"-{10,}\s*\n\s*" + re.escape(header) + r"\s*\n-{10,}\s*\n(.*?)(?=\n-{10,}|\Z)",
        re.DOTALL,
    )
    m = pat.search(text)
    return m.group(1).strip() if m else ""


def parse_criteria(path):
    text = path.read_text(encoding="utf-8", errors="replace")
    return {
        "full": text,
        "ground_truth": _between(text, "<ground_truth>", "</ground_truth>"),
        "rubric": _between(text, "<scoring_rubric>", "</scoring_rubric>"),
        "judge_system": _section(text, "JUDGE SYSTEM PROMPT"),
        "generic_guide": _section(text, "GENERIC BAND GUIDE (the fallback used when no world rubric exists)"),
    }


def parse_explanation(path):
    """Parse a single <model>/<world>.txt explanation file."""
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()

    meta = {}
    i = 0
    # Header lines before the first seed.
    while i < len(lines):
        line = lines[i]
        if SEED_RE.match(line):
            break
        m = HEADER_KV_RE.match(line.strip())
        if m:
            meta[m.group(1).lower()] = m.group(2).strip()
        i += 1

    seeds = []
    current = None
    body = []

    def flush():
        if current is not None:
            current["text"] = "\n".join(body).strip()
            seeds.append(current)

    while i < len(lines):
        line = lines[i]
        m = SEED_RE.match(line)
        if m:
            flush()
            body = []
            tail = m.group(2)
            seed_num = int(m.group(1))
            if NO_TRIAL_RE.search(tail):
                current = {"seed": seed_num, "missing": True, "score": None,
                           "raw": None, "max": None}
            else:
                sm = SCORE_RE.search(tail)
                if sm:
                    current = {
                        "seed": seed_num,
                        "missing": False,
                        "score": float(sm.group(1)),
                        "raw": int(sm.group(2)),
                        "max": int(sm.group(3)),
                    }
                else:
                    current = {"seed": seed_num, "missing": False, "score": None,
                               "raw": None, "max": None}
        else:
            if current is not None:
                body.append(line)
        i += 1
    flush()

    return {
        "model_display": meta.get("model", path.parent.name),
        "judge": meta.get("judge", ""),
        "seeds": seeds,
    }


def main():
    if not DATA.is_dir():
        sys.exit(f"ERROR: {DATA} not found. Run from the repo root.")

    # Worlds = criteria file stems, sorted.
    worlds = sorted(p.stem for p in CRITERIA_DIR.glob("*.txt"))
    criteria = {w: parse_criteria(CRITERIA_DIR / f"{w}.txt") for w in worlds}

    model_dirs = sorted(p for p in EXPL_DIR.iterdir() if p.is_dir())
    models = []
    explanations = {}

    for mdir in model_dirs:
        mid = mdir.name
        world_map = {}
        display_name = mid
        for wfile in sorted(mdir.glob("*.txt")):
            world = wfile.stem
            parsed = parse_explanation(wfile)
            display_name = parsed["model_display"] or display_name
            world_map[world] = {"judge": parsed["judge"], "seeds": parsed["seeds"]}
        if world_map:
            models.append({"id": mid, "name": display_name})
            explanations[mid] = world_map

    out = {
        "generated_from": "data/",
        "models": models,
        "worlds": worlds,
        "criteria": criteria,
        "explanations": explanations,
    }

    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=0), encoding="utf-8")

    # --- summary -------------------------------------------------------------
    n_pairs = sum(len(v) for v in explanations.values())
    n_seeds = sum(len(s["seeds"]) for v in explanations.values() for s in v.values())
    n_missing = sum(
        1 for v in explanations.values() for s in v.values()
        for seed in s["seeds"] if seed.get("missing")
    )
    size_kb = OUT.stat().st_size / 1024
    print(f"Wrote {OUT.relative_to(ROOT)} ({size_kb:.0f} KB)")
    print(f"  models : {len(models)}")
    print(f"  worlds : {len(worlds)}")
    print(f"  model x world files : {n_pairs}")
    print(f"  seed entries        : {n_seeds}  ({n_missing} missing/no-trial)")


if __name__ == "__main__":
    main()
