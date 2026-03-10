const ui = {
  runBtn: document.getElementById("runBtn"),
  stopBtn: document.getElementById("stopBtn"),
  resumeBtn: document.getElementById("resumeBtn"),
  clearRunBtn: document.getElementById("clearRunBtn"),
  runStatus: document.getElementById("runStatus"),
  tpMode: document.getElementById("tpMode"),
  stepDelay: document.getElementById("stepDelay"),
  stepDelayLabel: document.getElementById("stepDelayLabel"),
  watchInput: document.getElementById("watchInput"),
  addWatchBtn: document.getElementById("addWatchBtn"),
  watchList: document.getElementById("watchList"),
  selectedTpLabel: document.getElementById("selectedTpLabel"),
  tpVars: document.getElementById("tpVars"),
  gutter: document.getElementById("gutter"),
  editor: document.getElementById("editor"),
  cursorPos: document.getElementById("cursorPos"),
  outputBox: document.getElementById("outputBox"),
  timeline: document.getElementById("timeline"),
};

const app = {
  explicitTimepoints: new Map(),
  executedTimepoints: [],
  outputEntries: [],
  playbackOutputEntries: null,
  watchVars: ["retries", "status", "orderID"],
  runtimeState: {},
  selectedExecutedId: null,
  mode: "explicit",
  delayMs: 80,
  running: false,
  playbackRunning: false,
  stopRequested: false,
  runStart: 0,
  currentLine: 1,
  runCounter: 0,
};

ui.editor.value = `function processOrder() {
  let orderID = "A-1021";
  let retries = 2;
  let status = "created";

  if (retries > 0) {
    status = "retrying";
  }

  console.log("order", orderID);
  console.log("status", status);
}

processOrder();`;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deepClone(value) {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch (_) {
      // fallback below
    }
  }
  return JSON.parse(JSON.stringify(value ?? null));
}

function shortValue(value) {
  if (value === undefined) return "undefined";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "function") return "[Function]";
  try {
    const raw = JSON.stringify(value);
    if (!raw) return String(value);
    return raw.length > 46 ? `${raw.slice(0, 43)}...` : raw;
  } catch (_) {
    return String(value);
  }
}

function setStatus(text, tone = "idle") {
  ui.runStatus.textContent = text;
  ui.runStatus.style.color = tone === "error" ? "#ff9ca4" : tone === "ok" ? "#71e6b2" : "#8eb0bf";
}

function defaultTpName(line) {
  return `TP-L${line}`;
}

function lineCount() {
  return ui.editor.value.split("\n").length;
}

function updateCursorPos() {
  const index = ui.editor.selectionStart;
  const before = ui.editor.value.slice(0, index);
  const lines = before.split("\n");
  const line = lines.length;
  const col = lines[lines.length - 1].length + 1;
  ui.cursorPos.textContent = `L${line}:C${col}`;
}

function transformLine(line) {
  const varDecl = line.match(/^(\s*)(let|const|var)\s+([A-Za-z_$][\w$]*)\s*(=.*)?;?\s*$/);
  if (varDecl) {
    const indent = varDecl[1] || "";
    const name = varDecl[3];
    const assignExpr = varDecl[4];
    if (assignExpr) return `${indent}state.${name} ${assignExpr};`;
    return `${indent}state.${name} = undefined;`;
  }

  const fnDecl = line.match(/^(\s*)function\s+([A-Za-z_$][\w$]*)\s*\(/);
  if (fnDecl) {
    const indent = fnDecl[1] || "";
    const name = fnDecl[2];
    return line.replace(/^(\s*)function\s+([A-Za-z_$][\w$]*)\s*\(/, `${indent}state.${name} = function ${name}(`);
  }

  return line;
}

function buildInstrumentedCode(source) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const chunks = [];

  lines.forEach((line, idx) => {
    const ln = idx + 1;
    const transformed = transformLine(line);
    if (line.trim() === "") {
      chunks.push("");
      return;
    }
    const trimmed = line.trim();
    const skipHook =
      /^}?\s*(else|catch|finally)\b/.test(trimmed) ||
      /^(case\b|default\b)/.test(trimmed) ||
      /^}\s*(while\b)/.test(trimmed);

    if (!skipHook) {
      chunks.push(`__ctx.__line(${ln});`);
    }
    chunks.push(transformed);
  });

  return {
    lines,
    code: chunks.join("\n"),
  };
}

function shouldHitTimepoint(line) {
  if (app.mode === "implicit") return true;
  const tp = app.explicitTimepoints.get(line);
  return Boolean(tp && tp.enabled !== false);
}

function registerHit(line, elapsedMs) {
  const explicit = app.explicitTimepoints.get(line);
  const name = explicit?.name || `Implicit-L${line}`;
  const snapshot = deepClone(app.runtimeState);
  const id = `run${app.runCounter}-tp${app.executedTimepoints.length + 1}`;

  const entry = {
    id,
    run: app.runCounter,
    line,
    time: elapsedMs,
    mode: explicit ? "explicit" : "implicit",
    name,
    snapshot,
  };

  app.executedTimepoints.push(entry);
  app.selectedExecutedId = entry.id;
}

function pushOutput(kind, parts, elapsedMs, line) {
  const text = parts.map((p) => (typeof p === "string" ? p : shortValue(p))).join(" ");
  app.outputEntries.push({
    id: `${kind}-${app.outputEntries.length + 1}`,
    kind,
    text,
    line,
    time: elapsedMs,
  });
}

function visibleState() {
  const selected = app.executedTimepoints.find((tp) => tp.id === app.selectedExecutedId);
  if (selected) return selected.snapshot || {};
  return app.runtimeState || {};
}

function renderGutter() {
  const total = lineCount();
  const hitLines = new Set(app.executedTimepoints.map((tp) => tp.line));
  const frag = document.createDocumentFragment();

  for (let line = 1; line <= total; line += 1) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "line-btn";
    btn.textContent = String(line);

    if (app.explicitTimepoints.has(line)) btn.classList.add("tp-explicit");
    if (hitLines.has(line)) btn.classList.add("tp-hit");
    if (line === app.currentLine) btn.classList.add("current");

    btn.addEventListener("click", () => {
      if (app.running || app.playbackRunning) return;
      if (app.explicitTimepoints.has(line)) {
        app.explicitTimepoints.delete(line);
      } else {
        const suggested = defaultTpName(line);
        const userName = window.prompt(`Nombre del timepoint en linea ${line}:`, suggested);
        if (userName === null) return;
        app.explicitTimepoints.set(line, {
          line,
          enabled: true,
          name: (userName || suggested).trim() || suggested,
        });
      }
      renderAll();
    });

    frag.appendChild(btn);
  }

  ui.gutter.replaceChildren(frag);
  ui.gutter.scrollTop = ui.editor.scrollTop;
}

function renderOutput() {
  const source = app.playbackOutputEntries || app.outputEntries;
  if (!source.length) {
    ui.outputBox.innerHTML = '<p class="empty">Sin salida todavia.</p>';
    return;
  }

  const frag = document.createDocumentFragment();
  source.forEach((entry) => {
    const row = document.createElement("div");
    row.className = `output-line ${entry.kind === "error" ? "error" : ""}`;

    const ts = document.createElement("span");
    ts.className = "ts";
    ts.textContent = `${Math.round(entry.time)}ms L${entry.line}`;

    const text = document.createElement("span");
    text.textContent = entry.text;

    row.append(ts, text);
    frag.appendChild(row);
  });

  ui.outputBox.replaceChildren(frag);
  ui.outputBox.scrollTop = ui.outputBox.scrollHeight;
}

function renderWatchList() {
  const state = visibleState();
  const frag = document.createDocumentFragment();

  app.watchVars.forEach((name) => {
    const item = document.createElement("li");
    item.className = "watch-item";

    const left = document.createElement("span");
    left.className = "watch-name";
    left.textContent = name;

    const value = document.createElement("span");
    value.className = "watch-val";
    value.textContent = shortValue(state[name]);

    const remove = document.createElement("button");
    remove.className = "btn";
    remove.type = "button";
    remove.textContent = "x";
    remove.addEventListener("click", () => {
      app.watchVars = app.watchVars.filter((v) => v !== name);
      renderWatchList();
    });

    item.append(left, value, remove);
    frag.appendChild(item);
  });

  if (!app.watchVars.length) {
    const empty = document.createElement("li");
    empty.className = "watch-item";
    empty.textContent = "No hay variables en watch.";
    frag.appendChild(empty);
  }

  ui.watchList.replaceChildren(frag);
}

function renderTimepointVars() {
  const selected = app.executedTimepoints.find((tp) => tp.id === app.selectedExecutedId);
  if (!selected) {
    ui.selectedTpLabel.textContent = "Selecciona un timepoint del timeline.";
    ui.tpVars.textContent = "";
    return;
  }

  ui.selectedTpLabel.textContent = `${selected.name} · linea ${selected.line} · ${Math.round(selected.time)}ms`;

  const entries = Object.entries(selected.snapshot || {});
  if (!entries.length) {
    ui.tpVars.textContent = "Snapshot vacio.";
    return;
  }

  ui.tpVars.textContent = entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}: ${shortValue(v)}`)
    .join("\n");
}

function renderTimeline() {
  ui.timeline.innerHTML = "";

  if (!app.executedTimepoints.length) {
    ui.timeline.innerHTML = '<p class="empty">Sin ejecucion todavia. Crea timepoints y pulsa Ejecutar.</p>';
    return;
  }

  const track = document.createElement("div");
  track.className = "timeline-track";

  app.executedTimepoints.forEach((tp, idx) => {
    const node = document.createElement("button");
    node.type = "button";
    node.className = `timeline-node ${tp.mode === "explicit" ? "explicit" : ""} ${tp.id === app.selectedExecutedId ? "selected" : ""}`;
    node.textContent = String(idx + 1);
    node.title = `${tp.name} (L${tp.line})`;

    const time = document.createElement("span");
    time.className = "timeline-time";
    time.textContent = `${Math.round(tp.time)}ms`;

    const label = document.createElement("span");
    label.className = "timeline-label";
    label.textContent = `${tp.name} · L${tp.line}`;

    node.append(time, label);

    node.addEventListener("click", () => {
      app.selectedExecutedId = tp.id;
      app.currentLine = tp.line;
      app.playbackOutputEntries = null;
      renderAll();
    });

    track.appendChild(node);
  });

  ui.timeline.appendChild(track);
}

function renderAll() {
  renderGutter();
  renderOutput();
  renderWatchList();
  renderTimepointVars();
  renderTimeline();
  updateCursorPos();
  ui.stepDelayLabel.textContent = `${app.delayMs} ms`;
}

async function executeCode() {
  if (app.running || app.playbackRunning) return;

  app.running = true;
  app.stopRequested = false;
  app.playbackOutputEntries = null;
  app.executedTimepoints = [];
  app.outputEntries = [];
  app.selectedExecutedId = null;
  app.runtimeState = {};
  app.currentLine = 1;
  app.runCounter += 1;
  app.runStart = performance.now();

  setStatus("Ejecutando...", "idle");
  renderAll();

  const { code } = buildInstrumentedCode(ui.editor.value);

  const ctx = {
    state: app.runtimeState,
    console: {
      log: (...parts) => pushOutput("log", parts, performance.now() - app.runStart, app.currentLine),
      warn: (...parts) => pushOutput("warn", parts, performance.now() - app.runStart, app.currentLine),
      error: (...parts) => pushOutput("error", parts, performance.now() - app.runStart, app.currentLine),
    },
    __line: (line) => {
      if (app.stopRequested) {
        const stopErr = new Error("STOPPED");
        stopErr.__stop = true;
        throw stopErr;
      }

      app.currentLine = line;
      const elapsed = performance.now() - app.runStart;
      if (shouldHitTimepoint(line)) {
        registerHit(line, elapsed);
      }

      renderAll();
    },
  };

  try {
    const run = new Function(
      "__ctx",
      `
      return (async function () {
        const state = __ctx.state;
        const console = __ctx.console;
        with (state) {
          ${code}
        }
      })();
    `,
    );

    await run(ctx);
    setStatus("Ejecucion finalizada", "ok");
  } catch (err) {
    if (err && err.__stop) {
      pushOutput("warn", ["Ejecucion detenida por usuario"], performance.now() - app.runStart, app.currentLine);
      setStatus("Detenido", "error");
    } else {
      pushOutput("error", [err?.message || String(err)], performance.now() - app.runStart, app.currentLine);
      setStatus("Error en ejecucion", "error");
    }
  } finally {
    app.running = false;
    renderAll();
  }
}

async function resumeFromSelectedTimepoint() {
  if (app.running || app.playbackRunning) return;
  if (!app.executedTimepoints.length) {
    setStatus("No hay una ejecucion para resumir", "error");
    return;
  }

  app.stopRequested = false;
  const startIdx = app.executedTimepoints.findIndex((tp) => tp.id === app.selectedExecutedId);
  if (startIdx < 0) {
    setStatus("Selecciona un timepoint en el timeline", "error");
    return;
  }

  app.playbackRunning = true;
  app.playbackOutputEntries = [];
  const startTime = app.executedTimepoints[startIdx].time;
  setStatus("Reanudando desde timepoint seleccionado...", "idle");

  for (let i = startIdx; i < app.executedTimepoints.length; i += 1) {
    if (app.stopRequested) break;

    const tp = app.executedTimepoints[i];
    app.selectedExecutedId = tp.id;
    app.currentLine = tp.line;
    app.playbackOutputEntries = app.outputEntries.filter((entry) => entry.time >= startTime && entry.time <= tp.time);
    renderAll();

    await wait(Math.max(40, app.delayMs));
  }

  app.playbackRunning = false;
  if (app.stopRequested) {
    setStatus("Reanudacion detenida", "error");
  } else {
    setStatus("Reanudacion finalizada", "ok");
  }
}

function stopExecution() {
  if (!app.running && !app.playbackRunning) return;
  app.stopRequested = true;
  setStatus("Deteniendo...", "error");
}

function clearRun() {
  if (app.running || app.playbackRunning) return;
  app.executedTimepoints = [];
  app.outputEntries = [];
  app.playbackOutputEntries = null;
  app.selectedExecutedId = null;
  app.currentLine = 1;
  app.stopRequested = false;
  setStatus("Listo", "idle");
  renderAll();
}

function addWatchVariable() {
  const name = (ui.watchInput.value || "").trim();
  if (!name) return;
  if (!app.watchVars.includes(name)) {
    app.watchVars.push(name);
  }
  ui.watchInput.value = "";
  renderWatchList();
}

ui.editor.addEventListener("input", () => {
  if (app.running) return;
  app.currentLine = 1;
  renderAll();
});
ui.editor.addEventListener("scroll", () => {
  ui.gutter.scrollTop = ui.editor.scrollTop;
});
ui.editor.addEventListener("keyup", updateCursorPos);
ui.editor.addEventListener("click", updateCursorPos);
ui.tpMode.addEventListener("change", () => {
  app.mode = ui.tpMode.value;
  renderAll();
});
ui.stepDelay.addEventListener("input", () => {
  app.delayMs = Number(ui.stepDelay.value);
  ui.stepDelayLabel.textContent = `${app.delayMs} ms`;
});
ui.addWatchBtn.addEventListener("click", addWatchVariable);
ui.watchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") addWatchVariable();
});
ui.runBtn.addEventListener("click", executeCode);
ui.stopBtn.addEventListener("click", stopExecution);
ui.resumeBtn.addEventListener("click", resumeFromSelectedTimepoint);
ui.clearRunBtn.addEventListener("click", clearRun);

renderAll();
