"use strict";

(() => {
  const esc = (s) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const trunc = (s, n = 120) => {
    s = String(s);
    return s.length > n ? s.slice(0, n) + "..." : s;
  };

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

  function needsCitation(meta) {
    const subtype = (meta.subtype || "").toLowerCase();
    const type = (meta.type || "").toLowerCase();
    if (NO_SUB.has(subtype) || NO_TYPE.has(type)) return false;
    const instruction = (meta.instruction_ariya || "").toLowerCase();
    return TRIG.some(
      (token) =>
        instruction.includes(token) ||
        type.includes(token) ||
        subtype.includes(token),
    );
  }

  class TemplateValidator {
    constructor(data) {
      this.data = data;
      this.results = [];
      this.root = data.root || {};
      this.meta = this.root.metadata || {};
      this.instructions = this.meta.instructions || {};
      this.nodes = Object.fromEntries(
        Object.entries(data).filter(([key]) => key !== "root"),
      );
    }

    ok(name, detail) {
      this.results.push({ name, status: "pass", detail, items: [] });
    }

    warn(name, detail, items = []) {
      this.results.push({ name, status: "warn", detail, items });
    }

    fail(name, detail, items = []) {
      this.results.push({ name, status: "fail", detail, items });
    }

    info(name, detail, items = []) {
      this.results.push({ name, status: "info", detail, items });
    }

    effectiveConstraints(meta) {
      const constraints =
        meta.constraints && typeof meta.constraints === "object"
          ? meta.constraints
          : {};
      const linked =
        meta.linkedTextBlockId && typeof meta.linkedTextBlockId === "object"
          ? meta.linkedTextBlockId
          : {};

      return {
        min: constraints.minLength ?? linked.minLength ?? null,
        max: constraints.maxLength ?? linked.maxLength ?? null,
      };
    }

    run() {
      this.checkOrphanInstructions();
      this.checkContainerInstructions();
      this.checkMissingChildren();
      this.checkMissingConstraints();
      this.checkNonNumericConstraints();
      this.checkInvertedConstraints();
      this.checkConstraintsFalse();
      this.checkOrphanNodes();
      this.checkEmptySubtype();
      this.checkVisualContentInstruction();
      this.checkStaleMetadata();
      this.checkEmptyInstructions();
      this.checkPlaceholderUrls();
      this.checkReferenceBlock();
      this.checkDuplicateChildren();
      this.checkElementIdMismatch();
      this.checkEnabledStats();
      return this.results;
    }

    checkOrphanInstructions() {
      const orphans = Object.keys(this.instructions).filter(
        (id) => !(id in this.nodes),
      );

      if (!orphans.length) {
        this.ok(
          "Orphan Instructions",
          "All instruction block IDs map to an existing node",
        );
        return;
      }

      this.fail(
        "Orphan Instructions",
        `${orphans.length} instruction block(s) have no matching node in the template`,
        orphans.map(
          (id) => `<b>${esc(id)}</b> - instruction exists but node does not`,
        ),
      );
    }

    checkContainerInstructions() {
      const bad = [];
      for (const [id, meta] of Object.entries(this.instructions)) {
        if (!meta.enable) continue;
        if (this.nodes[id]?.type === "Container") {
          bad.push(
            `<b>${esc(id)}</b> - maps to a <b>Container</b> node; generated text will be discarded`,
          );
        }
      }

      if (!bad.length) {
        this.ok(
          "Container Instructions",
          "No enabled instructions target Container nodes",
        );
        return;
      }

      this.warn(
        "Container Instructions",
        `${bad.length} enabled instruction(s) target Container nodes`,
        bad,
      );
    }

    checkMissingChildren() {
      const rootIds = this.root?.data?.childrenIds || [];
      const allIds = [...rootIds];

      for (const node of Object.values(this.nodes)) {
        (node?.data?.props?.childrenIds || []).forEach((id) => allIds.push(id));
        (node?.data?.props?.columns || []).forEach((column) =>
          (column.childrenIds || []).forEach((id) => allIds.push(id)),
        );
      }

      const missing = [...new Set(allIds)].filter(
        (id) => id && !(id in this.nodes) && id !== "root",
      );

      if (!missing.length) {
        this.ok("Missing Nodes", "All childrenIds reference existing nodes");
        return;
      }

      this.fail(
        "Missing Nodes",
        `${missing.length} block ID(s) referenced in childrenIds do not exist as nodes`,
        missing.map((id) => `<code>${esc(id)}</code>`),
      );
    }

    checkMissingConstraints() {
      const skipSub = new Set(["references", "reference", "visual content"]);
      const skipType = new Set(["email metadata"]);
      const bad = [];

      for (const [id, meta] of Object.entries(this.instructions)) {
        if (!meta.enable) continue;
        const subtype = (meta.subtype || "").toLowerCase();
        const type = (meta.type || "").toLowerCase();
        if (skipSub.has(subtype) || skipType.has(type)) continue;

        const { min, max } = this.effectiveConstraints(meta);
        const missing = [];
        if (min == null) missing.push("minLength");
        if (max == null) missing.push("maxLength");

        if (missing.length) {
          bad.push(
            `<b>${esc(id)}</b> - missing <code>${missing.join(", ")}</code> <span style="color:var(--text-muted)">${esc(meta.type || "?")} / ${esc(meta.subtype || "?")}</span>`,
          );
        }
      }

      if (!bad.length) {
        this.ok(
          "Missing Constraints",
          "All enabled content blocks have minLength and maxLength defined",
        );
        return;
      }

      this.warn(
        "Missing Constraints",
        `${bad.length} enabled content block(s) have missing effective length constraints`,
        bad,
      );
    }

    checkInvertedConstraints() {
      const bad = [];

      for (const [id, meta] of Object.entries(this.instructions)) {
        if (!meta.enable) continue;
        const { min, max } = this.effectiveConstraints(meta);
        if (max != null && min != null && max < min) {
          bad.push(
            `<b>${esc(id)}</b> - maxLength <code>${max}</code> < minLength <code>${min}</code>`,
          );
        }
      }

      if (!bad.length) {
        this.ok(
          "Inverted Constraints",
          "All min/max word-count constraints are consistent",
        );
        return;
      }

      this.warn(
        "Inverted Constraints",
        `${bad.length} block(s) have maxLength < minLength`,
        bad,
      );
    }

    checkConstraintsFalse() {
      const bad = Object.entries(this.instructions)
        .filter(([, meta]) => meta.enable && meta.constraints === false)
        .map(([id, meta]) => {
          const { min, max } = this.effectiveConstraints(meta);
          const hasFallback = min != null || max != null;
          return hasFallback
            ? `<b>${esc(id)}</b> - constraints: false but linkedTextBlockId provides ${min ?? "-"}-${max ?? "-"}`
            : `<b>${esc(id)}</b> - constraints: false with no fallback`;
        });

      if (!bad.length) {
        this.ok("Constraints: false", "No enabled blocks use constraints: false");
        return;
      }

      this.warn(
        "Constraints: false",
        `${bad.length} enabled block(s) have constraints: false`,
        bad,
      );
    }

    checkNonNumericConstraints() {
      const nonNumeric = (value) =>
        value != null && value !== "" && typeof value !== "number";
      const bad = [];

      for (const [id, meta] of Object.entries(this.instructions)) {
        if (!meta.enable) continue;
        const constraints =
          meta.constraints && typeof meta.constraints === "object"
            ? meta.constraints
            : {};
        const linked =
          meta.linkedTextBlockId && typeof meta.linkedTextBlockId === "object"
            ? meta.linkedTextBlockId
            : {};

        const issues = [];
        if (nonNumeric(constraints.maxLength)) {
          issues.push(
            `constraints.maxLength: <code>${esc(String(constraints.maxLength))}</code>`,
          );
        }
        if (constraints.maxLength === "") {
          issues.push("constraints.maxLength is empty string");
        }
        if (nonNumeric(constraints.minLength)) {
          issues.push(
            `constraints.minLength: <code>${esc(String(constraints.minLength))}</code>`,
          );
        }
        if (constraints.minLength === "") {
          issues.push("constraints.minLength is empty string");
        }
        if (nonNumeric(linked.maxLength)) {
          issues.push(
            `linkedTextBlockId.maxLength: <code>${esc(String(linked.maxLength))}</code>`,
          );
        }
        if (nonNumeric(linked.minLength)) {
          issues.push(
            `linkedTextBlockId.minLength: <code>${esc(String(linked.minLength))}</code>`,
          );
        }

        if (issues.length) {
          bad.push(`<b>${esc(id)}</b> - ${issues.join("; ")}`);
        }
      }

      if (!bad.length) {
        this.ok("Non-Numeric Constraints", "All constraint values are valid numbers");
        return;
      }

      this.warn(
        "Non-Numeric Constraints",
        `${bad.length} block(s) have non-numeric constraint values`,
        bad,
      );
    }

    checkOrphanNodes() {
      const referenced = new Set();
      const collect = (ids) => (ids || []).forEach((id) => referenced.add(id));

      collect(this.root?.data?.childrenIds);
      for (const node of Object.values(this.nodes)) {
        collect(node?.data?.props?.childrenIds);
        (node?.data?.props?.columns || []).forEach((column) =>
          collect(column.childrenIds),
        );
      }

      const orphans = Object.keys(this.nodes).filter((id) => !referenced.has(id));

      if (!orphans.length) {
        this.ok("Orphan Nodes", "All nodes are reachable from the root");
        return;
      }

      this.warn(
        "Orphan Nodes",
        `${orphans.length} node(s) are not referenced in any childrenIds`,
        orphans.map((id) => {
          const type = this.nodes[id]?.type || "Unknown";
          const url = this.nodes[id]?.data?.props?.url || "";
          const hint = url
            ? ` - <code>${esc(url.split("/").slice(-1)[0])}</code>`
            : "";
          return `<b>${esc(id)}</b> <span class="node-type nt-${type.replace(/\s+/g, "")}">${esc(type)}</span>${hint}`;
        }),
      );
    }

    checkEmptySubtype() {
      const requiresSubtype = new Set(["content section", "approved messages block"]);
      const bad = [];

      for (const [id, meta] of Object.entries(this.instructions)) {
        if (!meta.enable) continue;
        const type = (meta.type || "").toLowerCase();
        if (requiresSubtype.has(type) && !(meta.subtype || "").trim()) {
          bad.push(
            `<b>${esc(id)}</b> - type <span class="chip">${esc(meta.type)}</span> has empty subtype`,
          );
        }
      }

      if (!bad.length) {
        this.ok(
          "Empty Subtype",
          "All enabled content blocks have a subtype defined",
        );
        return;
      }

      this.warn(
        "Empty Subtype",
        `${bad.length} enabled block(s) have an empty subtype`,
        bad,
      );
    }

    checkVisualContentInstruction() {
      const imageNodes = Object.entries(this.nodes).filter(
        ([, node]) => node?.type === "Image",
      );

      if (!imageNodes.length) {
        this.ok("Visual Content Instruction", "No Image nodes in template");
        return;
      }

      const hasEnabledVisual = Object.entries(this.instructions).some(
        ([id, meta]) => {
          if (!meta.enable) return false;
          const subtype = (meta.subtype || "").toLowerCase();
          if (subtype === "visual content") return true;
          return this.nodes[id]?.type === "Image";
        },
      );

      if (hasEnabledVisual) {
        this.ok(
          "Visual Content Instruction",
          "Image nodes are covered by at least one enabled instruction",
        );
        return;
      }

      this.warn(
        "Visual Content Instruction",
        `${imageNodes.length} Image node(s) exist but none have an enabled instruction`,
        imageNodes.map(([id, node]) => {
          const url = node?.data?.props?.url || "";
          return `<b>${esc(id)}</b>${url ? ` - static URL: <code>${esc(url.split("/").pop())}</code>` : " - no URL"}`;
        }),
      );
    }

    checkStaleMetadata() {
      const pipelineKeys = [
        "approved_references",
        "usage",
        "email_subject_line",
        "preheader",
      ];

      const found = pipelineKeys.filter((key) => key in (this.meta || {}));

      if (!found.length) {
        this.ok(
          "Stale Pipeline Metadata",
          "root.metadata contains only template configuration",
        );
        return;
      }

      this.warn(
        "Stale Pipeline Metadata",
        `${found.length} pipeline-output field(s) found in root.metadata`,
        found.map((key) => `<code>${esc(key)}</code>`),
      );
    }

    checkEmptyInstructions() {
      const bad = Object.entries(this.instructions)
        .filter(
          ([, meta]) => meta.enable && !(meta.instruction_ariya || "").trim(),
        )
        .map(
          ([id]) => `<b>${esc(id)}</b> - enabled but instruction_ariya is empty`,
        );

      if (!bad.length) {
        this.ok("Empty Instructions", "All enabled blocks have instruction text");
        return;
      }

      this.fail(
        "Empty Instructions",
        `${bad.length} enabled block(s) have no instruction text`,
        bad,
      );
    }

    checkPlaceholderUrls() {
      const placeholderPattern = /example\.com|placeholder|lorem|dummy/i;
      const bad = [];

      for (const [id, node] of Object.entries(this.nodes)) {
        const url = node?.data?.props?.url || "";
        if (!url && node.type === "Image") {
          bad.push(`<b>${esc(id)}</b> (Image) - url is empty`);
        } else if (url && placeholderPattern.test(url)) {
          bad.push(`<b>${esc(id)}</b> (${esc(node.type)}) - <code>${esc(url)}</code>`);
        }
      }

      if (!bad.length) {
        this.ok(
          "Placeholder / Empty URLs",
          "No missing or placeholder URLs detected",
        );
        return;
      }

      this.warn(
        "Placeholder / Empty URLs",
        `${bad.length} node(s) with missing or placeholder URLs`,
        bad,
      );
    }

    checkReferenceBlock() {
      const refs = Object.values(this.instructions).filter(
        (meta) =>
          meta.enable && (meta.subtype || "").toLowerCase().includes("reference"),
      );

      if (refs.length) {
        this.ok("Reference Block", `${refs.length} enabled reference block(s) found`);
        return;
      }

      this.fail("Reference Block", 'No enabled block with subtype "References" found');
    }

    checkDuplicateChildren() {
      const seen = {};
      const collect = (ids) =>
        (ids || []).forEach((id) => {
          seen[id] = (seen[id] || 0) + 1;
        });

      collect(this.root?.data?.childrenIds);
      for (const node of Object.values(this.nodes)) {
        collect(node?.data?.props?.childrenIds);
        (node?.data?.props?.columns || []).forEach((column) =>
          collect(column.childrenIds),
        );
      }

      const duplicates = Object.entries(seen).filter(([, count]) => count > 1);

      if (!duplicates.length) {
        this.ok("Duplicate References", "No block ID is referenced more than once");
        return;
      }

      this.warn(
        "Duplicate References",
        `${duplicates.length} block ID(s) appear in multiple childrenIds lists`,
        duplicates.map(
          ([id, count]) => `<b>${esc(id)}</b> - referenced ${count} times`,
        ),
      );
    }

    checkElementIdMismatch() {
      const bad = [];

      for (const [id, meta] of Object.entries(this.instructions)) {
        if (meta.elementId && meta.elementId !== id) {
          bad.push(
            `<b>${esc(id)}</b> - elementId is <code>${esc(meta.elementId)}</code>`,
          );
        }
      }

      if (!bad.length) {
        this.ok(
          "elementId Mismatch",
          "All elementId values match their instruction key",
        );
        return;
      }

      this.warn(
        "elementId Mismatch",
        `${bad.length} instruction(s) have elementId mismatch`,
        bad,
      );
    }

    checkEnabledStats() {
      const total = Object.keys(this.instructions).length;
      const enabled = Object.values(this.instructions).filter((meta) => meta.enable)
        .length;
      const nodes = Object.keys(this.nodes).length;

      this.info(
        "Template Stats",
        `${enabled} / ${total} instruction(s) enabled | ${nodes} total nodes`,
      );
    }
  }

  window.TemplateValidatorCore = {
    esc,
    trunc,
    needsCitation,
    TemplateValidator,
  };
})();
