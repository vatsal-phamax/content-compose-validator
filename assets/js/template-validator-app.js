"use strict";

(() => {
  const { esc, trunc, needsCitation, TemplateValidator } =
    window.TemplateValidatorCore;

  let rawJson = "";
  let treeData = {};
  let treeInstrs = {};
  let jsonEditor = null;

  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("file-input");
  const pasteEl = document.getElementById("paste");
  const runBtn = document.getElementById("run-btn");
  const resetBtn = document.getElementById("reset-btn");
  const toggleInputBtn = document.getElementById("toggle-input-btn");
  const rawCopyBtn = document.getElementById("raw-copy-btn");
  const appShell = document.querySelector(".app-shell");
  const rawNavEl = document.getElementById("raw-nav");
  const summaryEl = document.getElementById("summary");
  const metaEl = document.getElementById("meta");
  const findingsEl = document.getElementById("findings");
  const instrTableEl = document.getElementById("instr-table");
  const blockTreeEl = document.getElementById("block-tree");
  const rawPreEl = document.getElementById("raw-pre");
  const contextPanel = document.getElementById("context-panel");
  const mainTabBar = document.getElementById("main-tab-bar");
  const explorerEmpty = document.getElementById("explorer-empty");
  const mainFindings = document.getElementById("main-findings");
  const mainExplorer = document.getElementById("main-explorer");
  const mtabCount = document.getElementById("mtab-count");

  function setCompactMode(isCompact) {
    appShell.classList.toggle("compact", isCompact);
    toggleInputBtn.textContent = isCompact ? "Show Input" : "Hide Input";
  }

  function toast(message = "Copied!") {
    const toastEl = document.getElementById("toast");
    toastEl.textContent = message;
    toastEl.classList.add("show");
    setTimeout(() => toastEl.classList.remove("show"), 1800);
  }

  function copy(text) {
    navigator.clipboard.writeText(text).then(() => toast());
  }

  function reset() {
    pasteEl.value = "";
    fileInput.value = "";
    summaryEl.innerHTML = "";
    metaEl.innerHTML = "";
    findingsEl.innerHTML = "";
    instrTableEl.innerHTML = "";
    blockTreeEl.innerHTML = "";
    rawPreEl.innerHTML = "";
    rawNavEl.innerHTML = "";

    if (jsonEditor) {
      jsonEditor.destroy();
      jsonEditor = null;
    }

    contextPanel.style.display = "none";
    mainTabBar.style.display = "none";
    explorerEmpty.style.display = "";
    mainFindings.style.display = "none";
    mainExplorer.style.display = "none";
    resetBtn.style.display = "none";

    document.querySelectorAll(".main-tab").forEach((tab) => {
      tab.classList.remove("active");
    });
    document
      .querySelector('.main-tab[data-main="findings"]')
      .classList.add("active");

    switchExplorerTab("instructions");
  }

  function switchMainTab(name) {
    document.querySelectorAll(".main-tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.main === name);
    });

    mainFindings.style.display = name === "findings" ? "flex" : "none";
    mainExplorer.style.display = name === "explorer" ? "flex" : "none";
  }

  function switchExplorerTab(name) {
    document.querySelectorAll("#explorer-tabs .tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.tab === name);
    });

    document.querySelectorAll(".exp-panel").forEach((panel) => {
      panel.classList.remove("active");
    });
    document.getElementById(`exp-${name}`).classList.add("active");
  }

  function readFile(file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        validate(JSON.parse(event.target.result));
      } catch (error) {
        alert("Invalid JSON: " + error.message);
      }
    };
    reader.readAsText(file);
  }

  function nodePreview(node) {
    if (!node) return "";

    const text = node?.data?.props?.text || "";
    if (text) {
      return trunc(
        text
          .replace(/<[^>]+>/g, "")
          .replace(/\s+/g, " ")
          .trim(),
        60,
      );
    }

    const url = node?.data?.props?.url || "";
    if (url) return trunc(url.split("/").pop(), 60);

    return "";
  }

  function renderTree(ids, depth = 0) {
    if (!ids?.length) return "";

    return ids
      .map((id) => {
        const node = treeData[id];
        if (!node) {
          return `<div class="tree-node" style="padding-left:${depth * 20}px"><div class="tree-row"><span class="tree-id" style="color:var(--red)">${esc(id)} (missing)</span></div></div>`;
        }

        const type = node.type || "Unknown";
        const nodeTypeClass = `node-type nt-${type.replace(/\s+/g, "")}`;
        const hasInstruction = id in treeInstrs;
        const preview = nodePreview(node);
        const childIds = [
          ...(node.data?.props?.childrenIds || []),
          ...(node.data?.props?.columns || []).flatMap(
            (column) => column.childrenIds || [],
          ),
        ];

        const hasChildren = childIds.length > 0;
        const uid = `tr-${id.replace(/[^a-z0-9]/gi, "-")}`;

        return `<div class="tree-node">
  <div class="tree-row ${hasInstruction ? "has-instr" : ""}" ${hasChildren ? `data-toggle-tree="${uid}"` : ""} style="padding-left:${depth * 20}px">
    ${hasChildren ? `<span class="tree-chevron" id="${uid}-chev">▶</span>` : '<span style="width:14px;display:inline-block"></span>'}
    <span class="${nodeTypeClass}">${esc(type)}</span>
    <span class="tree-id">${esc(id)}</span>
    ${hasInstruction ? '<span style="font-size:10px;color:var(--accent);margin-left:4px">instruction</span>' : ""}
    ${preview ? `<span class="tree-content">${esc(preview)}</span>` : ""}
  </div>
  ${hasChildren ? `<div id="${uid}-children" style="display:none">${renderTree(childIds, depth + 1)}</div>` : ""}
</div>`;
      })
      .join("");
  }

  function renderInstructionCell(id, text) {
    const uid = id.replace(/[^a-z0-9]/gi, "-");
    const preview = esc(trunc(text, 100));
    const full = esc(text).replace(/\n/g, "<br>");
    const hasMore = text.length > 100;

    if (!hasMore) {
      return `<div class="instr-preview">${preview}</div>`;
    }

    return `<div>
      <div id="ip-${uid}" class="instr-preview">${preview}</div>
      <div id="if-${uid}" class="instr-full">${full}</div>
      <button
        class="btn-sm btn-copy"
        style="margin-top:6px"
        data-action="toggle-instr"
        data-id="${uid}"
      >Show all</button>
    </div>`;
  }

  function renderRawJson(data) {
    rawNavEl.innerHTML = "";

    if (!jsonEditor) {
      jsonEditor = new JSONEditor(rawPreEl, {
        mode: "view",
        navigationBar: false,
        statusBar: false,
        search: true,
      });
    }

    jsonEditor.set(data);

    if (typeof data === "object" && data !== null && !Array.isArray(data)) {
      Object.keys(data).forEach((key) => {
        const chip = document.createElement("button");
        chip.className = "jt-chip";
        chip.textContent = key;
        chip.addEventListener("click", () => {
          try {
            jsonEditor.scrollTo([key]);
          } catch (_) {
            // ignore navigation failures for unsupported paths
          }
        });
        rawNavEl.appendChild(chip);
      });
    }
  }

  function validate(data) {
    rawJson = JSON.stringify(data, null, 2);

    const validator = new TemplateValidator(data);
    const results = validator.run();

    const counts = { fail: 0, warn: 0, pass: 0, info: 0 };
    results.forEach((result) => counts[result.status]++);

    summaryEl.innerHTML = [
      ["fail", "Critical"],
      ["warn", "Warnings"],
      ["pass", "Passed"],
      ["info", "Info"],
    ]
      .map(
        ([status, label]) =>
          `<div class="s-card ${status}"><div class="n">${counts[status]}</div><div class="l">${label}</div></div>`,
      )
      .join("");

    const instructions = data.root?.metadata?.instructions || {};
    const nodes = Object.keys(data).filter((key) => key !== "root");
    const enabled = Object.values(instructions).filter((meta) => meta.enable).length;
    const rootType = data.root?.data?.contentWidth
      ? `EmailLayout (${data.root.data.contentWidth}px)`
      : "EmailLayout";

    metaEl.innerHTML = [
      ["Layout", rootType],
      ["Instructions", `${Object.keys(instructions).length} total`],
      ["Enabled", `${enabled} / ${Object.keys(instructions).length}`],
      ["Nodes", nodes.length],
      ["Font", data.root?.data?.fontFamily || "-"],
    ]
      .map(
        ([key, value]) =>
          `<div class="mi"><span class="k">${key}</span><span class="v">${esc(String(value))}</span></div>`,
      )
      .join("");

    const order = { fail: 0, warn: 1, info: 2, pass: 3 };
    const sorted = [...results].sort((a, b) => order[a.status] - order[b.status]);

    findingsEl.innerHTML = sorted
      .map(
        (result, index) => `
<div class="finding">
  <div class="fh" data-action="toggle-finding" data-index="${index}">
    <div class="dot ${result.status}"></div>
    <span class="badge ${result.status}">${result.status}</span>
    <span class="fname">${esc(result.name)}</span>
    <span class="fdetail">${result.detail}</span>
    ${result.items.length ? '<span class="chev">▶</span>' : ""}
  </div>
  ${result.items.length ? `<div class="fbody" id="fb${index}"><ul class="items">${result.items.map((item) => `<li>${item}</li>`).join("")}</ul></div>` : ""}
</div>`,
      )
      .join("");

    const allNodes = Object.fromEntries(
      Object.entries(data).filter(([key]) => key !== "root"),
    );

    const rows = Object.entries(instructions).map(([id, meta]) => {
      const citation = needsCitation(meta);
      const nodeType = allNodes[id]?.type || "Unknown";
      const nodeTypeClass = `node-type nt-${nodeType.replace(/\s+/g, "")}`;

      const constraintsObj =
        meta.constraints && typeof meta.constraints === "object"
          ? meta.constraints
          : {};
      const linkedObj =
        meta.linkedTextBlockId && typeof meta.linkedTextBlockId === "object"
          ? meta.linkedTextBlockId
          : {};

      const min = constraintsObj.minLength ?? linkedObj.minLength ?? null;
      const max = constraintsObj.maxLength ?? linkedObj.maxLength ?? null;

      const skipSub = new Set(["references", "reference", "visual content"]);
      const skipType = new Set(["email metadata"]);
      const skipConstraint =
        skipSub.has((meta.subtype || "").toLowerCase()) ||
        skipType.has((meta.type || "").toLowerCase());

      let constraintText = "";
      if (meta.constraints === false && (min == null || max == null)) {
        constraintText = '<span class="chip warn">false</span>';
      } else if (max != null && min != null && max < min) {
        constraintText = `<span class="chip warn">inverted ${min}-${max}</span>`;
      } else if (min == null || max == null) {
        constraintText = skipConstraint
          ? '<span class="chip">n/a</span>'
          : `<span class="chip warn">missing (${min ?? "?"}-${max ?? "?"})</span>`;
      } else {
        constraintText = `<span class="chip pass">${min}-${max} words</span>`;
      }

      return `<tr>
  <td class="mono-cell">${esc(id)}</td>
  <td>${meta.enable ? '<span class="chip pass">Yes</span>' : '<span class="chip">No</span>'}</td>
  <td><span class="${nodeTypeClass}">${esc(nodeType)}</span></td>
  <td><span class="chip">${esc(meta.type || "-")}</span></td>
  <td><span class="chip">${esc(meta.subtype || "-")}</span></td>
  <td>${citation ? '<span class="chip pass">YES</span>' : '<span class="chip">NO</span>'}</td>
  <td>${constraintText}</td>
  <td style="min-width:240px;max-width:420px">${renderInstructionCell(id, meta.instruction_ariya || "")}</td>
</tr>`;
    });

    instrTableEl.innerHTML = `
<thead><tr>
  <th>Block ID</th><th>Enabled</th><th>Node Type</th>
  <th>Type</th><th>Subtype</th><th>needs_citation</th><th>Constraints</th><th>Instruction</th>
</tr></thead>
<tbody>${rows.join("")}</tbody>`;

    treeData = allNodes;
    treeInstrs = instructions;

    const rootIds = data.root?.data?.childrenIds || [];
    blockTreeEl.innerHTML = `<div class="tree-node">
   <div class="tree-row" data-toggle-tree="tr-root">
     <span class="tree-chevron open" id="tr-root-chev">▶</span>
     <span class="node-type nt-EmailLayout">EmailLayout</span>
     <span class="tree-id">root</span>
     <span class="tree-content">${esc(rootType)}</span>
   </div>
   <div id="tr-root-children">${renderTree(rootIds, 1)}</div>
 </div>`;

    renderRawJson(data);

    contextPanel.style.display = "block";
    mainTabBar.style.display = "flex";
    explorerEmpty.style.display = "none";
    mainFindings.style.display = "flex";
    mainExplorer.style.display = "none";
    resetBtn.style.display = "";
    mtabCount.textContent = results.length;
  }

  function attachListeners() {
    dropZone.addEventListener("click", () => fileInput.click());
    dropZone.addEventListener("dragover", (event) => {
      event.preventDefault();
      dropZone.classList.add("over");
    });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("over"));
    dropZone.addEventListener("drop", (event) => {
      event.preventDefault();
      dropZone.classList.remove("over");
      if (event.dataTransfer.files[0]) readFile(event.dataTransfer.files[0]);
    });

    fileInput.addEventListener("change", () => {
      if (fileInput.files[0]) readFile(fileInput.files[0]);
    });

    runBtn.addEventListener("click", () => {
      const text = pasteEl.value.trim();
      if (!text) return;
      try {
        validate(JSON.parse(text));
      } catch (error) {
        alert("Invalid JSON: " + error.message);
      }
    });

    resetBtn.addEventListener("click", reset);
    toggleInputBtn.addEventListener("click", () => {
      setCompactMode(!appShell.classList.contains("compact"));
    });
    rawCopyBtn.addEventListener("click", () => copy(rawJson));

    document.querySelectorAll(".main-tab").forEach((tab) => {
      tab.addEventListener("click", () => switchMainTab(tab.dataset.main));
    });

    document.querySelectorAll("#explorer-tabs .tab").forEach((tab) => {
      tab.addEventListener("click", () => switchExplorerTab(tab.dataset.tab));
    });

    findingsEl.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-action='toggle-finding']");
      if (!trigger) return;

      const index = Number(trigger.dataset.index);
      const body = document.getElementById(`fb${index}`);
      if (!body) return;

      body.classList.toggle("open");
      trigger.classList.toggle("open");
    });

    instrTableEl.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-action='toggle-instr']");
      if (!trigger) return;

      const id = trigger.dataset.id;
      const preview = document.getElementById(`ip-${id}`);
      const full = document.getElementById(`if-${id}`);
      if (!preview || !full) return;

      const isOpen = full.classList.contains("open");
      full.classList.toggle("open", !isOpen);
      preview.style.display = isOpen ? "block" : "none";
      trigger.textContent = isOpen ? "Show all" : "Collapse";
    });

    blockTreeEl.addEventListener("click", (event) => {
      const row = event.target.closest("[data-toggle-tree]");
      if (!row) return;

      const uid = row.dataset.toggleTree;
      const childEl = document.getElementById(`${uid}-children`);
      const chevron = document.getElementById(`${uid}-chev`);
      if (!childEl) return;

      const shouldOpen = childEl.style.display === "none" || !childEl.style.display;
      childEl.style.display = shouldOpen ? "block" : "none";
      if (chevron) chevron.classList.toggle("open", shouldOpen);
    });
  }

  setCompactMode(false);
  attachListeners();
})();
