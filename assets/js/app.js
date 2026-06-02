"use strict";

// -- helpers -------------------------------------------------------------------
const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
const trunc = (s, n = 120) => {
  s = String(s);
  return s.length > n ? s.slice(0, n) + "..." : s;
};

let _rawJson = "";
let _generatedBlocks = [];
let _outRefsText = "";
let _usedRefsText = "";

function toast(msg = "Copied!") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 1800);
}

function copy(text) {
  navigator.clipboard.writeText(text).then(() => toast());
}
function copyRaw() {
  copy(_rawJson);
}

// -- UI references -------------------------------------------------------------
const dz = document.getElementById("drop-zone"),
  fi = document.getElementById("file-input");
const pasteEl = document.getElementById("paste"),
  runBtn = document.getElementById("run-btn");
const resetBtn = document.getElementById("reset-btn"),
  rawCopyBtn = document.getElementById("raw-copy-btn");
const summaryEl = document.getElementById("summary");
const metaEl = document.getElementById("meta"),
  listEl = document.getElementById("findings");
const blockCardsEl = document.getElementById("block-cards"),
  refsGridEl = document.getElementById("refs-grid");

// -- Panel refs ----------------------------------------------------------------
const contextPanel   = document.getElementById("context-panel");
const mainTabBar     = document.getElementById("main-tab-bar");
const explorerEmpty  = document.getElementById("explorer-empty");
const mainFindings   = document.getElementById("main-findings");
const mainExplorer   = document.getElementById("main-explorer");
const mtabCount      = document.getElementById("mtab-count");

// -- Event listeners -----------------------------------------------------------
dz.addEventListener("click", () => fi.click());
dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("over"); });
dz.addEventListener("dragleave", () => dz.classList.remove("over"));
dz.addEventListener("drop", (e) => {
  e.preventDefault();
  dz.classList.remove("over");
  if (e.dataTransfer.files[0]) read(e.dataTransfer.files[0]);
});
fi.addEventListener("change", () => fi.files[0] && read(fi.files[0]));
resetBtn.addEventListener("click", reset);
rawCopyBtn.addEventListener("click", copyRaw);

// Main tabs: Findings / Explorer
document.querySelectorAll(".main-tab").forEach((tab) => {
  tab.addEventListener("click", () => switchMainTab(tab.dataset.main));
});

// Explorer sub-tabs
document.querySelectorAll("#explorer-tabs .tab").forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

listEl.addEventListener("click", (e) => {
  const trigger = e.target.closest("[data-action='toggle-finding']");
  if (!trigger) return;
  tog(Number(trigger.dataset.index));
});
blockCardsEl.addEventListener("click", (e) => {
  const trigger = e.target.closest("[data-action]");
  if (!trigger) return;
  const idx = Number(trigger.dataset.index);
  const action = trigger.dataset.action;
  if (action === "toggle-block") togBlock(idx);
  if (action === "toggle-preview") togPreview(idx, trigger);
  if (action === "copy-html") copy(_generatedBlocks[idx] || "");
});
refsGridEl.addEventListener("click", (e) => {
  const trigger = e.target.closest("[data-action='copy-refs']");
  if (!trigger) return;
  if (trigger.dataset.kind === "output") copy(_outRefsText);
  if (trigger.dataset.kind === "used") copy(_usedRefsText);
});
runBtn.addEventListener("click", () => {
  const t = pasteEl.value.trim();
  if (!t) return;
  try {
    validate(JSON.parse(t));
  } catch (e) {
    alert("Invalid JSON: " + e.message);
  }
});

// -- File reading --------------------------------------------------------------
function read(file) {
  const r = new FileReader();
  r.onload = (e) => {
    try {
      validate(JSON.parse(e.target.result));
    } catch (ex) {
      alert("Invalid JSON: " + ex.message);
    }
  };
  r.readAsText(file);
}

// -- Reset ---------------------------------------------------------------------
function reset() {
  pasteEl.value = "";
  fi.value = "";

  // Hide results
  contextPanel.style.display  = "none";
  mainTabBar.style.display    = "none";
  mainFindings.style.display  = "none";
  mainExplorer.style.display  = "none";
  explorerEmpty.style.display = "";
  resetBtn.style.display      = "none";

  // Restore default tab for next run
  document.querySelectorAll(".main-tab").forEach((t) => t.classList.remove("active"));
  document.querySelector(".main-tab[data-main='findings']").classList.add("active");
}

// -- Tab switching -------------------------------------------------------------
function switchMainTab(name) {
  document.querySelectorAll(".main-tab").forEach((t) => t.classList.remove("active"));
  document.querySelector(`.main-tab[data-main="${name}"]`).classList.add("active");
  mainFindings.style.display = name === "findings" ? "flex" : "none";
  mainExplorer.style.display = name === "explorer" ? "flex" : "none";
}

function switchTab(name) {
  document.querySelectorAll(".exp-panel").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll("#explorer-tabs .tab").forEach((t) => t.classList.remove("active"));
  document.getElementById("exp-" + name).classList.add("active");
  document.querySelectorAll("#explorer-tabs .tab").forEach((t) => {
    if (t.dataset.tab === name) t.classList.add("active");
  });
}

function togBlock(i) {
  const b = document.getElementById("bc" + i);
  if (!b) return;
  b.classList.toggle("open");
  b.previousElementSibling?.classList.toggle("open");
}

function togPreview(i, triggerEl) {
  const p = document.getElementById("bp" + i);
  if (!p) return;
  p.classList.toggle("open");
  if (triggerEl)
    triggerEl.textContent = p.classList.contains("open") ? "Hide Preview" : "Preview HTML";
}

// -- Validate ------------------------------------------------------------------
function validate(data) {
  _rawJson = JSON.stringify(data, null, 2);
  const v = new Validator(data),
    rs = v.run();
  const cnt = { fail: 0, warn: 0, pass: 0, info: 0 };
  rs.forEach((r) => cnt[r.status]++);

  // -- Summary --
  summaryEl.innerHTML = [
    ["fail", "Critical"],
    ["warn", "Warnings"],
    ["pass", "Passed"],
    ["info", "Info"],
  ]
    .map(
      ([s, l]) =>
        `<div class="s-card ${s}"><div class="n">${cnt[s]}</div><div class="l">${l}</div></div>`,
    )
    .join("");

  // -- Meta --
  const sym = data.symptom || "-",
    brand = data.input_payload?.brand || "-";
  const ts = data.generated_at
    ? new Date(data.generated_at).toLocaleString()
    : "-";
  const oRefs = (data.approved_references || []).length,
    uRefs = (
      data.final_email_template?.root?.metadata?.approved_references || []
    ).length;
  metaEl.innerHTML = [
    ["Brand", brand],
    ["Symptom", sym],
    ["Language", data.language || "-"],
    ["Generated", ts],
    ["Blocks", data.blocks_generated ?? "-"],
    ["Refs output/used", `${oRefs} / ${uRefs}`],
  ]
    .map(
      ([k, v]) =>
        `<div class="mi"><span class="k">${k}</span><span class="v">${esc(String(v))}</span></div>`,
    )
    .join("");

  // -- Findings --
  const ord = { fail: 0, warn: 1, info: 2, pass: 3 };
  const sorted = [...rs].sort((a, b) => ord[a.status] - ord[b.status]);
  listEl.innerHTML = sorted
    .map(
      (r, i) => `
    <div class="finding">
      <div class="fh" data-action="toggle-finding" data-index="${i}">
        <div class="dot ${r.status}"></div>
        <span class="badge ${r.status}">${r.status}</span>
        <span class="fname">${esc(r.name)}</span>
        <span class="fdetail">${r.detail}</span>
        ${r.items.length ? '<span class="chev">▶</span>' : ""}
      </div>
      ${r.items.length ? `<div class="fbody" id="fb${i}"><ul class="items">${r.items.map((it) => `<li>${it}</li>`).join("")}</ul></div>` : ""}
    </div>`,
    )
    .join("");

  // -- Explorer: Generated Blocks --
  const instrs =
    data.final_email_template?.root?.metadata?.instructions || {};
  _generatedBlocks = (data.generated_blocks_detail || []).map(
    (b) => b.html || "",
  );
  blockCardsEl.innerHTML = (data.generated_blocks_detail || [])
    .map((b, i) => {
      const m = instrs[b.block_id] || {};
      const typeLabel =
        [m.type, m.subtype].filter(Boolean).join(" / ") || "-";
      const instr = (m.instruction_ariya || "").trim();
      const html = b.html || "";
      return `<div class="bcard">
      <div class="bcard-head" data-action="toggle-block" data-index="${i}">
        <span class="bcard-id">${esc(b.block_id)}</span>
        <span class="bcard-type">${esc(typeLabel)}</span>
        <span class="chev" style="margin-left:8px">▶</span>
      </div>
      <div class="bcard-body" id="bc${i}">
        ${instr ? `<div class="bcard-instr">${esc(trunc(instr, 200))}</div>` : ""}
        <div class="bcard-actions">
          <button class="btn-sm btn-copy" data-action="copy-html" data-index="${i}">Copy HTML</button>
          <button class="btn-sm btn-copy" data-action="toggle-preview" data-index="${i}">Preview HTML</button>
        </div>
        <div class="bcard-preview" id="bp${i}">${html}</div>
        <pre class="bcard-html">${esc(html)}</pre>
      </div>
    </div>`;
    })
    .join("");

  // -- Explorer: References --
  const outRefs = data.approved_references || [];
  const usedRefs =
    data.final_email_template?.root?.metadata?.approved_references || [];
  _outRefsText = outRefs.join("\n");
  _usedRefsText = usedRefs.join("\n");
  refsGridEl.innerHTML = `
    <div class="ref-section">
      <h3>Output refs <span style="color:var(--blue);font-weight:400;margin-left:4px">${outRefs.length}</span>
        <button class="btn-sm btn-copy" style="margin-left:auto" data-action="copy-refs" data-kind="output">Copy all</button>
      </h3>
      <ul class="ref-list">${outRefs.map((r, i) => `<li><span class="ref-num">${i + 1}.</span><span class="ref-text">${esc(r)}</span></li>`).join("")}</ul>
    </div>
    <div class="ref-section">
      <h3>Used refs (in template) <span style="color:var(--green);font-weight:400;margin-left:4px">${usedRefs.length}</span>
        <button class="btn-sm btn-copy" style="margin-left:auto" data-action="copy-refs" data-kind="used">Copy all</button>
      </h3>
      <ul class="ref-list">${usedRefs.map((r, i) => `<li><span class="ref-num">${i + 1}.</span><span class="ref-text">${esc(r)}</span></li>`).join("")}</ul>
    </div>`;

  // -- Explorer: Selection --
  const sel = data.content_selection || {};
  let pillarHs = {};
  try {
    const uc = data.llm_calls?.selection_pass?.messages?.find(
      (m) => m.role === "user",
    )?.content;
    if (uc) {
      const parsed = JSON.parse(uc);
      (parsed.available_content?.pillars || []).forEach((p) => {
        pillarHs[p.id] = p.has_symptom;
      });
    }
  } catch (e) {}

  const pillarMap = Object.fromEntries(
    (sel.pillar_ids || []).map((p) => [p.id, p.relevance]),
  );

  let selHtml = `<div style="overflow-x:auto;margin-bottom:20px">
    <table class="sel-table">
      <thead><tr><th>Pillar ID</th><th>Has Symptom</th><th>Relevance</th></tr></thead>
      <tbody>${Object.entries(pillarMap)
        .map(
          ([id, rel]) => `
        <tr><td>${esc(id)}</td>
            <td><span class="sym-dot ${pillarHs[id] ? "t" : "f"}"></span>${pillarHs[id] ? "yes" : "no"}</td>
            <td><span class="rel ${rel}">${rel}</span></td></tr>`,
        )
        .join("")}
      </tbody></table></div>
    <div style="overflow-x:auto">
    <table class="sel-table">
      <thead><tr><th>Message ID</th><th>Relevance</th><th>Image Relevance</th></tr></thead>
      <tbody>${(sel.message_ids || [])
        .map((m) => {
          const ir =
            (sel.image_ids || []).find((x) => x.id === m.id)?.relevance || "-";
          return `<tr><td>${esc(m.id)}</td><td><span class="rel ${m.relevance}">${m.relevance}</span></td><td><span class="rel ${ir}">${ir}</span></td></tr>`;
        })
        .join("")}</tbody></table></div>`;
  document.getElementById("sel-content").innerHTML = selHtml;

  // -- Explorer: Raw JSON --
  renderRawJson(data);

  // -- Show results --
  contextPanel.style.display  = "block";
  mainTabBar.style.display    = "flex";
  explorerEmpty.style.display = "none";
  mainFindings.style.display  = "flex";
  resetBtn.style.display      = "";
  mtabCount.textContent       = rs.length;
}

function tog(i) {
  const b = document.getElementById("fb" + i);
  if (!b) return;
  b.classList.toggle("open");
  b.previousElementSibling?.classList.toggle("open");
}

// ── JSON tree renderer ────────────────────────────────────────────────────────

function buildJsonNode(key, val, depth) {
  const isArr = Array.isArray(val);
  const type = val === null ? "null" : isArr ? "array" : typeof val;
  const isComplex = type === "object" || type === "array";

  function makeKeyEl() {
    const k = document.createElement("span");
    k.className = "jt-k";
    k.textContent = `"${key}"`;
    if (depth === 1) k.dataset.jtKey = String(key);
    const colon = document.createElement("span");
    colon.className = "jt-punc";
    colon.textContent = ": ";
    return [k, colon];
  }

  if (!isComplex) {
    const line = document.createElement("div");
    line.className = "jt-line";
    if (key !== null) line.append(...makeKeyEl());
    const span = document.createElement("span");
    if (type === "string") {
      span.className = "jt-s";
      span.textContent = val.length > 140 ? `"${val.slice(0, 140)}…"` : `"${val}"`;
      if (val.length > 140) span.title = `String — ${val.length} chars`;
    } else if (type === "number") {
      span.className = "jt-n";
      span.textContent = String(val);
    } else if (type === "boolean") {
      span.className = "jt-bool";
      span.textContent = String(val);
    } else {
      span.className = "jt-null";
      span.textContent = "null";
    }
    line.appendChild(span);
    return line;
  }

  const entries = isArr ? [...val].map((v, i) => [i, v]) : Object.entries(val);
  const count = entries.length;
  const [ob, cb] = isArr ? ["[", "]"] : ["{", "}"];
  const hint = `${count} ${isArr ? "item" : "key"}${count !== 1 ? "s" : ""}`;

  const node = document.createElement("div");
  node.className = "jt-node" + (depth <= 1 ? " open" : "");

  const head = document.createElement("div");
  head.className = "jt-head";
  if (key !== null) head.append(...makeKeyEl());

  const caret = document.createElement("span");
  caret.className = "jt-caret";
  caret.textContent = "▶";

  const obEl = document.createElement("span");
  obEl.className = "jt-bracket";
  obEl.textContent = ob;

  const hintEl = document.createElement("span");
  hintEl.className = "jt-hint";
  hintEl.textContent = ` ${hint} `;

  const cbHint = document.createElement("span");
  cbHint.className = "jt-bracket jt-hint-cb";
  cbHint.textContent = cb;

  hintEl.appendChild(cbHint);
  head.append(caret, obEl, hintEl);
  head.addEventListener("click", () => node.classList.toggle("open"));

  const body = document.createElement("div");
  body.className = "jt-body";
  entries.forEach(([k, v]) => body.appendChild(buildJsonNode(isArr ? null : k, v, depth + 1)));

  const end = document.createElement("div");
  end.className = "jt-end";
  const cbEl = document.createElement("span");
  cbEl.className = "jt-bracket";
  cbEl.textContent = cb;
  end.appendChild(cbEl);

  node.append(head, body, end);
  return node;
}

function renderRawJson(data) {
  const pre = document.getElementById("raw-pre");
  const nav = document.getElementById("raw-nav");
  pre.innerHTML = "";
  nav.innerHTML = "";

  if (typeof data === "object" && data !== null && !Array.isArray(data)) {
    Object.keys(data).forEach((k) => {
      const chip = document.createElement("button");
      chip.className = "jt-chip";
      chip.textContent = k;
      chip.addEventListener("click", () => {
        const target = Array.from(pre.querySelectorAll("[data-jt-key]")).find(
          (el) => el.dataset.jtKey === k,
        );
        if (!target) return;
        pre.querySelector(".jt-node")?.classList.add("open");
        target.scrollIntoView({ block: "nearest", behavior: "smooth" });
        target.classList.add("jt-flash");
        setTimeout(() => target.classList.remove("jt-flash"), 1200);
      });
      nav.appendChild(chip);
    });
  }

  pre.appendChild(buildJsonNode(null, data, 0));
}
