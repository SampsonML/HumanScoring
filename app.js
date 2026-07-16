/* ============================================================================
 * Human Explanation Scoring — static app for GitHub Pages.
 *
 * CONFIG.SHEETS_URL is the only thing you must set:
 *   1. Create a Google Sheet.
 *   2. Extensions → Apps Script, paste apps_script/Code.gs, set SHEET_ID.
 *   3. Deploy → New deployment → Web app → Execute as: Me,
 *      Who has access: Anyone → copy the /exec URL below.
 * If left blank, Submit is disabled and you can still Export JSON.
 * ==========================================================================*/
const CONFIG = {
  SHEETS_URL: "https://script.google.com/macros/s/AKfycbzf74xGytoanarLaYkCysDsyw0cKmxBHNwtFobmDgWMcWohsphNkbNnKK2jvl4a8b9Z/exec",
  STORAGE_KEY: "humanScoring:v1",
  MAX_SCORE: 10,
};

const state = {
  data: null,
  model: null,
  world: null,
  reveal: false,
  store: { annotator: "", scores: {}, sent: {} },
};

/* ----------------------------- persistence ------------------------------- */
function loadStore() {
  try {
    const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (raw) state.store = Object.assign(state.store, JSON.parse(raw));
  } catch (e) { /* ignore corrupt store */ }
}
function saveStore() {
  localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(state.store));
  flashSaved();
}
let saveFlashTimer = null;
function flashSaved() {
  const el = document.getElementById("save-indicator");
  el.classList.add("flash");
  el.textContent = "saved ✓";
  clearTimeout(saveFlashTimer);
  saveFlashTimer = setTimeout(() => {
    el.classList.remove("flash");
    el.textContent = "drafts saved locally";
  }, 1200);
}
const keyOf = (model, world, seed) => `${model}|||${world}|||${seed}`;

/* ------------------------------- helpers --------------------------------- */
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) node.appendChild(c);
  return node;
}
function typesetMath(root) {
  if (window.MathJax && window.MathJax.typesetPromise) {
    window.MathJax.typesetPromise([root]).catch(() => {});
  }
}

/* ------------------------------- init ------------------------------------ */
async function init() {
  loadStore();
  const res = await fetch("data.json", { cache: "no-cache" });
  state.data = await res.json();

  // annotator
  const ann = document.getElementById("annotator");
  ann.value = state.store.annotator || "";
  ann.addEventListener("input", () => {
    state.store.annotator = ann.value.trim();
    saveStore();
  });

  // model select
  const modelSel = document.getElementById("model-select");
  for (const m of state.data.models) {
    modelSel.appendChild(el("option", { value: m.id, text: m.name }));
  }
  // world select
  const worldSel = document.getElementById("world-select");
  for (const w of state.data.worlds) {
    worldSel.appendChild(el("option", { value: w, text: w }));
  }

  state.model = state.data.models[0].id;
  state.world = state.data.worlds[0];
  modelSel.value = state.model;
  worldSel.value = state.world;

  modelSel.addEventListener("change", () => { state.model = modelSel.value; render(); });
  worldSel.addEventListener("change", () => { state.world = worldSel.value; render(); });

  document.getElementById("prev-world").addEventListener("click", () => stepWorld(-1));
  document.getElementById("next-world").addEventListener("click", () => stepWorld(1));

  const reveal = document.getElementById("reveal-toggle");
  reveal.addEventListener("change", () => { state.reveal = reveal.checked; render(); });

  document.getElementById("submit-world").addEventListener("click", submitWorld);
  document.getElementById("export-json").addEventListener("click", exportJson);

  // config gate
  if (!CONFIG.SHEETS_URL) {
    document.getElementById("config-warning").hidden = false;
    document.getElementById("submit-world").disabled = true;
  }

  render();
}

function stepWorld(dir) {
  const worlds = state.data.worlds;
  let i = worlds.indexOf(state.world) + dir;
  i = (i + worlds.length) % worlds.length;
  state.world = worlds[i];
  document.getElementById("world-select").value = state.world;
  render();
}

/* ------------------------------- render ---------------------------------- */
function render() {
  renderCriteria();
  renderCards();
  renderProgress();
}

function renderCriteria() {
  const c = state.data.criteria[state.world] || {};
  const gt = document.getElementById("ground-truth");
  gt.textContent = c.ground_truth || "(no ground truth provided)";
  const rub = document.getElementById("rubric");
  rub.textContent = c.rubric || c.generic_guide || "(no rubric provided)";
  document.getElementById("full-criteria-text").textContent = c.full || "";
  typesetMath(document.getElementById("criteria-panel"));
}

function renderCards() {
  const wrap = document.getElementById("cards");
  wrap.innerHTML = "";
  const empty = document.getElementById("empty");

  const entry = (state.data.explanations[state.model] || {})[state.world];
  if (!entry || !entry.seeds || entry.seeds.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  for (const seed of entry.seeds) {
    wrap.appendChild(makeCard(seed, entry.judge));
  }
  typesetMath(wrap);
}

function makeCard(seed, judge) {
  const k = keyOf(state.model, state.world, seed.seed);
  const saved = state.store.scores[k];

  const head = el("div", { class: "card-head" }, [
    el("span", { class: "seed-label", text: `Science Agent · Attempt ${seed.seed + 1}` }),
    judgeBadge(seed),
  ]);

  if (seed.missing) {
    return el("div", { class: "card missing" }, [
      head,
      el("div", { class: "missing-note", text: "[no trial file] — nothing to score for this seed." }),
    ]);
  }

  const prose = el("div", { class: "prose" });
  prose.textContent = seed.text || "(empty explanation)";

  const card = el("div", { class: "card" + (saved && saved.score != null ? " scored" : "") });
  card.dataset.key = k;
  card.appendChild(head);
  card.appendChild(prose);
  card.appendChild(scoreRow(k, card));
  card.appendChild(notesRow(k));
  return card;
}

function judgeBadge(seed) {
  if (seed.missing) return el("span", {});
  if (!state.reveal) {
    return el("span", { class: "judge-badge hidden-score", text: "judge hidden" });
  }
  if (seed.raw == null) return el("span", { class: "judge-badge", text: "judge: n/a" });
  return el("span", { class: "judge-badge", text: `judge ${seed.raw}/${seed.max}` });
}

function scoreRow(k, card) {
  const saved = state.store.scores[k] || {};
  const btns = el("div", { class: "score-btns" });
  for (let v = 0; v <= CONFIG.MAX_SCORE; v++) {
    const b = el("button", { type: "button", text: String(v) });
    if (saved.score === v) b.classList.add("selected");
    b.addEventListener("click", () => {
      setScore(k, v);
      [...btns.children].forEach((c, idx) => c.classList.toggle("selected", idx === v));
      card.classList.add("scored");
    });
    btns.appendChild(b);
  }
  const clear = el("button", { class: "clear-score", type: "button", text: "clear" });
  clear.addEventListener("click", () => {
    setScore(k, null);
    [...btns.children].forEach((c) => c.classList.remove("selected"));
    card.classList.remove("scored");
  });
  return el("div", { class: "scorerow" }, [
    el("span", { class: "label", text: "Your score (0–10)" }),
    btns,
    clear,
  ]);
}

function notesRow(k) {
  const saved = state.store.scores[k] || {};
  const ta = el("textarea", { placeholder: "notes / justification (optional)", rows: "1" });
  ta.value = saved.notes || "";
  ta.addEventListener("input", () => setNotes(k, ta.value));
  return el("div", { class: "notes" }, [ta]);
}

/* --------------------------- score mutations ----------------------------- */
function ensure(k) {
  if (!state.store.scores[k]) state.store.scores[k] = { score: null, notes: "" };
  return state.store.scores[k];
}
function setScore(k, v) {
  const s = ensure(k);
  s.score = v;
  s.ts = new Date().toISOString();
  if (v == null && !s.notes) delete state.store.scores[k];
  saveStore();
  renderProgress();
}
function setNotes(k, text) {
  const s = ensure(k);
  s.notes = text;
  s.ts = new Date().toISOString();
  if (!text && s.score == null) delete state.store.scores[k];
  saveStore();
}

/* ------------------------------ progress --------------------------------- */
function scoreableSeeds(model, world) {
  const entry = (state.data.explanations[model] || {})[world];
  if (!entry) return [];
  return entry.seeds.filter((s) => !s.missing);
}
function renderProgress() {
  const wSeeds = scoreableSeeds(state.model, state.world);
  const wDone = wSeeds.filter((s) => {
    const v = state.store.scores[keyOf(state.model, state.world, s.seed)];
    return v && v.score != null;
  }).length;
  document.getElementById("progress-world").textContent = `world ${wDone}/${wSeeds.length}`;

  let total = 0;
  for (const k of Object.keys(state.store.scores)) {
    if (state.store.scores[k].score != null) total++;
  }
  document.getElementById("progress-total").textContent = `total ${total}`;
}

/* ------------------------------- submit ---------------------------------- */
function collectWorldRecords() {
  const entry = (state.data.explanations[state.model] || {})[state.world];
  if (!entry) return [];
  const recs = [];
  for (const seed of entry.seeds) {
    if (seed.missing) continue;
    const k = keyOf(state.model, state.world, seed.seed);
    const s = state.store.scores[k];
    if (!s || s.score == null) continue;
    recs.push({
      annotator: state.store.annotator || "anonymous",
      model: state.model,
      world: state.world,
      seed: seed.seed,
      humanScore: s.score,
      notes: s.notes || "",
      judgeScore: seed.score,
      judgeRaw: seed.raw,
      judgeMax: seed.max,
      timestamp: new Date().toISOString(),
    });
  }
  return recs;
}

async function submitWorld() {
  const status = document.getElementById("submit-status");
  if (!state.store.annotator) {
    status.className = "submit-status err";
    status.textContent = "enter your annotator name first";
    return;
  }
  const records = collectWorldRecords();
  if (records.length === 0) {
    status.className = "submit-status err";
    status.textContent = "no scored seeds in this world yet";
    return;
  }
  status.className = "submit-status busy";
  status.textContent = `submitting ${records.length}…`;
  const btn = document.getElementById("submit-world");
  btn.disabled = true;

  try {
    // text/plain body => CORS-simple request => no preflight against Apps Script.
    const res = await fetch(CONFIG.SHEETS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ type: "scores", records }),
    });
    let ok = res.ok;
    try {
      const json = await res.json();
      ok = ok && json && json.ok !== false;
    } catch (e) { /* response may be opaque; rely on res.ok */ }
    if (!ok) throw new Error("server rejected");

    for (const r of records) state.store.sent[keyOf(r.model, r.world, r.seed)] = r.timestamp;
    saveStore();
    status.className = "submit-status ok";
    status.textContent = `submitted ${records.length} ✓`;
  } catch (err) {
    status.className = "submit-status err";
    status.textContent = "submit failed — your drafts are safe locally. Retry or Export JSON.";
  } finally {
    btn.disabled = !CONFIG.SHEETS_URL;
  }
}

function exportJson() {
  const records = [];
  for (const [k, s] of Object.entries(state.store.scores)) {
    if (s.score == null) continue;
    const [model, world, seed] = k.split("|||");
    const entry = (state.data.explanations[model] || {})[world];
    const sd = entry ? entry.seeds.find((x) => x.seed === Number(seed)) : null;
    records.push({
      annotator: state.store.annotator || "anonymous",
      model, world, seed: Number(seed),
      humanScore: s.score, notes: s.notes || "",
      judgeScore: sd ? sd.score : null,
      judgeRaw: sd ? sd.raw : null,
      judgeMax: sd ? sd.max : null,
      timestamp: s.ts || null,
    });
  }
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), records }, null, 2)],
    { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const who = (state.store.annotator || "anon").replace(/[^a-z0-9_-]+/gi, "_");
  a.download = `human-scores-${who}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

init();
