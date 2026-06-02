"use strict";

window.Validator = class Validator {
  constructor(d) {
    this.d = d;
    this.rs = [];
    this.symptom = d.symptom || "";
    this.blocks = d.generated_blocks_detail || [];
    this.outRefs = d.approved_references || [];
    this.tmpl = d.final_email_template || {};
    this.tmplMeta = this.tmpl?.root?.metadata || {};
    this.usedRefs = this.tmplMeta.approved_references || [];
    this.instrs = this.tmplMeta.instructions || {};
    this.timings = d.timings_ms || {};
    this.usage = d.usage || {};
  }
  ok(n, d) {
    this.rs.push({ name: n, status: "pass", detail: d, items: [] });
  }
  warn(n, d, i = []) {
    this.rs.push({ name: n, status: "warn", detail: d, items: i });
  }
  fail(n, d, i = []) {
    this.rs.push({ name: n, status: "fail", detail: d, items: i });
  }
  info(n, d, i = []) {
    this.rs.push({ name: n, status: "info", detail: d, items: i });
  }

  run() {
    this.chkReferenceBlock();
    this.chkTemplateRefs();
    this.chkMissingBlocks();
    this.chkSubjectPreheader();
    this.chkCitationPlacement();
    this.chkCitationColors();
    this.chkAbbreviatedRefs();
    this.chkContainerInstructions();
    this.chkPlaceholderUrls();
    this.chkUnsortedCitations();
    this.chkSearchSymptomMatch();
    this.chkConstraintsFalse();
    this.chkNeedsCitationViolations();
    this.chkGenerationTime();
    this.chkTokenUsage();
    return this.rs;
  }

  chkReferenceBlock() {
    const rb = this.blocks.find((b) => {
      const m = this.instrs[b.block_id];
      return m && (m.subtype || "").toLowerCase().includes("reference");
    });
    if (!rb) {
      this.warn(
        "Reference Block",
        "No reference block found in generated output",
      );
      return;
    }
    const html = (rb.html || "").trim();
    if (html === "" || /^<div>\s*<\/div>$/.test(html))
      this.fail(
        "Reference Block",
        "Empty - citation normalisation produced no used_refs",
        [
          `Block: <b>${esc(rb.block_id)}</b>`,
          "Check <code>_CITATION_RE</code> matches LLM-generated styled <code>&lt;sup&gt;</code> tags",
        ],
      );
    else
      this.ok(
        "Reference Block",
        `Populated with ${(html.match(/\d+\.\s/g) || []).length} citation(s)`,
      );
  }

  chkTemplateRefs() {
    if (!this.usedRefs.length)
      this.fail(
        "Template Metadata Refs",
        "root.metadata.approved_references is [] - used_refs empty after normalisation",
        [
          "Check <code>_CITATION_RE</code> can match <code>&lt;sup style=...&gt;</code> tags",
        ],
      );
    else
      this.ok(
        "Template Metadata Refs",
        `${this.usedRefs.length} used ref(s) recorded`,
      );
  }

  chkMissingBlocks() {
    const enabled = Object.entries(this.instrs)
      .filter(([, m]) => m.enable)
      .map(([id]) => id);
    const gen = new Set(this.blocks.map((b) => b.block_id));
    const miss = enabled.filter((id) => !gen.has(id));
    if (miss.length)
      this.fail(
        "Missing Generated Blocks",
        `${miss.length} enabled block(s) not generated`,
        miss.map(
          (id) =>
            `<b>${esc(id)}</b> - ${esc(trunc(this.instrs[id]?.instruction_ariya || "", 60))}`,
        ),
      );
    else
      this.ok(
        "Missing Generated Blocks",
        `All ${enabled.length} enabled blocks generated`,
      );
  }

  chkSubjectPreheader() {
    const s = (this.d.email_subject_line || "").trim(),
      p = (this.d.preheader || "").trim();
    const bad = [];
    if (!s) bad.push("email_subject_line is empty");
    if (!p) bad.push("preheader is empty");
    if (bad.length)
      this.fail("Subject / Preheader", "Missing email metadata", bad);
    else
      this.ok(
        "Subject / Preheader",
        `"${trunc(s, 55)}" | "${trunc(p, 55)}"`,
      );
  }

  chkCitationPlacement() {
    const RE = /<\/(?:div|p|li)>\s*<sup\s+label=["']ariya-reference["']/i;
    const bad = [];
    for (const b of this.blocks) {
      if (RE.test(b.html || "")) {
        const m = (b.html || "").match(/<\/(?:div|p|li)>\s*<sup[^>]*>/i);
        bad.push(
          `<b>${esc(b.block_id)}</b> - <code>${esc(trunc(m ? m[0] : "", 70))}</code>`,
        );
      }
    }
    if (bad.length)
      this.fail(
        "Citation Placement",
        `${bad.length} block(s) have <sup> after a closing block element`,
        bad,
      );
    else
      this.ok(
        "Citation Placement",
        "All <sup> tags are inside their block elements",
      );
  }

  chkCitationColors() {
    const bad = [];
    for (const b of this.blocks) {
      const unstyled = [
        ...(b.html || "").matchAll(/<sup\s+label=["']ariya-reference["'][^>]*>/gi),
      ].filter((m) => !m[0].includes("style="));
      if (unstyled.length)
        bad.push(
          `<b>${esc(b.block_id)}</b> - ${unstyled.length} unstyled citation(s)`,
        );
    }
    if (bad.length)
      this.warn(
        "Citation Color",
        `${bad.length} block(s) have <sup> without inline color style`,
        bad,
      );
    else
      this.ok(
        "Citation Color",
        "All <sup> tags carry an explicit color style",
      );
  }

  chkAbbreviatedRefs() {
    const ABBREV = /^[A-Z][a-z]+ [A-Z][\w.]* et al\. [\w\s]+ \d{4}[.,]?$/;
    const bad = this.outRefs.filter((r) => ABBREV.test(r.trim()));
    if (bad.length)
      this.warn(
        "Abbreviated Refs",
        `${bad.length} short-form duplicate ref(s) - waste slots`,
        bad.map((r) => `<code>${esc(r)}</code>`),
      );
    else
      this.ok("Abbreviated Refs", "No short-form duplicate refs detected");
  }

  chkContainerInstructions() {
    const bad = [];
    for (const [id, m] of Object.entries(this.instrs)) {
      if (!m.enable) continue;
      if (this.tmpl[id]?.type === "Container")
        bad.push(
          `<b>${esc(id)}</b> - "${esc(trunc(m.instruction_ariya || "", 80))}"`,
        );
    }
    if (bad.length)
      this.warn(
        "Container Instructions",
        `${bad.length} enabled instruction(s) target Container nodes - output discarded (wasted tokens)`,
        bad,
      );
    else
      this.ok(
        "Container Instructions",
        "No enabled instructions target un-injectable Container nodes",
      );
  }

  chkPlaceholderUrls() {
    const PH = /example\.com|placeholder|lorem|dummy/i;
    const bad = [];
    for (const [id, node] of Object.entries(this.tmpl)) {
      if (id === "root") continue;
      const url = node?.data?.props?.url || "";
      if (url && PH.test(url))
        bad.push(
          `<b>${esc(id)}</b> (${esc(node.type)}) - <code>${esc(url)}</code>`,
        );
    }
    if (bad.length)
      this.warn("Placeholder URLs", `${bad.length} node(s) have placeholder URLs`, bad);
    else this.ok("Placeholder URLs", "No placeholder URLs detected");
  }

  chkUnsortedCitations() {
    const GROUP = /(?:<sup\s+label=["']ariya-reference["'][^>]*>\d+<\/sup>,?){2,}/gi;
    const NUM = /<sup\s+label=["']ariya-reference["'][^>]*>(\d+)<\/sup>/gi;
    const bad = [];
    for (const b of this.blocks) {
      GROUP.lastIndex = 0;
      for (const gm of (b.html || "").matchAll(GROUP)) {
        NUM.lastIndex = 0;
        const nums = [...gm[0].matchAll(NUM)].map((m) => +m[1]);
        for (let i = 1; i < nums.length; i++) {
          if (nums[i] < nums[i - 1]) {
            bad.push(`<b>${esc(b.block_id)}</b> - [${nums.join(",")}] not ascending`);
            break;
          }
        }
      }
    }
    if (bad.length)
      this.warn(
        "Citation Ordering",
        `${bad.length} block(s) have adjacent citations out of ascending order`,
        bad,
      );
    else
      this.ok("Citation Ordering", "All adjacent citations in ascending order");
  }

  chkSearchSymptomMatch() {
    const chunks = this.d.search_chunks || [];
    if (!chunks.length) {
      this.info("Search Chunks", "No search chunks in output");
      return;
    }
    const s = this.symptom.toLowerCase();
    const MAP = {
      colic: ["colic", "coliche", "infantil"],
      fap: ["fap", "funzionale", "abdominal", "dolore"],
      aad: ["aad", "antibiotic", "diarrhea", "diarrea"],
    };
    const kws = MAP[s] ||
      (s.includes("aad") || s.includes("antibiotic")
        ? MAP.aad
        : null) ||
      (s.includes("fap") || s.includes("abdominal")
        ? MAP.fap
        : null) ||
      (s.includes("colic") ? MAP.colic : null) || [s.split(/[\s(]/)[0]];

    const bad = chunks.filter((c) => {
      const txt = (
        (c.title || "") +
        (c.document_name || "") +
        (c.sourcefile || "") +
        (c.keywords || []).join(" ")
      ).toLowerCase();
      return !kws.some((k) => txt.includes(k));
    });

    const names = [
      ...new Set(
        bad.map((c) => c.document_name || c.sourcefile || c.title || "Unknown"),
      ),
    ];

    if (bad.length === chunks.length)
      this.warn(
        "Search Relevance",
        `All ${chunks.length} chunk(s) may be from wrong indication documents`,
        names.map((n) => `<code>${esc(n)}</code>`),
      );
    else if (bad.length > 0)
      this.warn(
        "Search Relevance",
        `${bad.length}/${chunks.length} chunk(s) may be unrelated to "${this.symptom}"`,
        names.map((n) => `<code>${esc(n)}</code>`),
      );
    else
      this.ok(
        "Search Relevance",
        `All ${chunks.length} chunk(s) match symptom "${this.symptom}"`,
      );
  }

  chkConstraintsFalse() {
    const bad = Object.entries(this.instrs)
      .filter(([, m]) => m.enable && m.constraints === false)
      .map(([id]) => `<b>${esc(id)}</b>`);
    if (bad.length)
      this.warn(
        "Constraint Field",
        `${bad.length} block(s) have "constraints: false" - word-count disabled`,
        bad,
      );
    else
      this.ok(
        "Constraint Field",
        "All active constraint fields are properly defined",
      );
  }

  chkNeedsCitationViolations() {
    const NO_SUB = new Set([
      "opening note",
      "banner message",
      "visual content",
      "cta button or link",
      "cta button",
      "cta link",
    ]);
    const NO_TYPE = new Set([
      "email metadata",
      "header section",
      "call-to-action (cta) block",
      "call-to-action block",
      "cta block",
    ]);
    const TRIG = [
      "reference",
      "evidence",
      "proof",
      "citation",
      "clinical",
      "findings",
      "scientific",
      "study",
    ];
    const hasSup = (h) => /<sup\s+label=["']ariya-reference["']/i.test(h || "");
    const genMap = Object.fromEntries(this.blocks.map((b) => [b.block_id, b.html]));
    const bad = [];

    for (const [id, m] of Object.entries(this.instrs)) {
      if (!m.enable) continue;
      const sub = (m.subtype || "").toLowerCase();
      const type = (m.type || "").toLowerCase();
      if (NO_SUB.has(sub) || NO_TYPE.has(type)) continue;
      const instr = (m.instruction_ariya || "").toLowerCase();
      if (
        TRIG.some((t) => instr.includes(t) || type.includes(t) || sub.includes(t)) &&
        id in genMap &&
        !hasSup(genMap[id])
      ) {
        bad.push(`<b>${esc(id)}</b> - ${esc(m.type)}`);
      }
    }

    if (bad.length)
      this.warn(
        "Citation Requirement",
        `${bad.length} block(s) need citations but none generated`,
        bad,
      );
    else
      this.ok(
        "Citation Requirement",
        "All citation-required blocks have at least one <sup>",
      );
  }

  chkGenerationTime() {
    const gen = this.timings.generation_pass || 0;
    const tot = this.timings.pipeline_total || 0;
    if (gen > 30000)
      this.warn(
        "Generation Time",
        `Slow: ${(gen / 1000).toFixed(1)}s - likely a Container block with large instruction`,
      );
    else
      this.info(
        "Generation Time",
        `Generation: ${(gen / 1000).toFixed(1)}s | Total: ${(tot / 1000).toFixed(1)}s`,
      );
  }

  chkTokenUsage() {
    const tot = this.usage.total_tokens || 0;
    const cost = this.usage.total_estimated_cost_usd || 0;
    const sel = this.usage.selection_pass?.total_tokens || 0;
    const gen = this.usage.generation_pass?.total_tokens || 0;
    this.info(
      "Token Usage",
      `Total: ${tot.toLocaleString()} | Cost: $${cost.toFixed(4)} | Selection: ${sel.toLocaleString()} | Generation: ${gen.toLocaleString()}`,
    );
  }
};
