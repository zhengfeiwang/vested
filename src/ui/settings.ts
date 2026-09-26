import { describeFormula, validateFormula } from "../formula";
import {
  currentFormula,
  markExported,
  mergeEntries,
  mergeFormulas,
  replaceEntries,
  replaceFormulas,
  saveFormula,
  state,
} from "../store";
import {
  SCHEMA_VERSION,
  download,
  parseImport,
  serializeEntries,
  serializeFormulas,
} from "../transfer";
import { addWeeks, currentWeek, listWeeks } from "../weeks";
import { daysSince, fmtWeekLabel } from "../format";
import type { FormulaConfig, WindowFn } from "../types";
import { h, openModal, toast } from "./dom";

export function renderSettings(root: HTMLElement): void {
  root.append(formulaCard(), historyCard(), dataCard(), aboutCard());
}

function formulaCard(): HTMLElement {
  const current = currentFormula();
  const reading = sliderRow("reading weight", current.weights.reading);
  const exercise = sliderRow("exercise weight", current.weights.exercise);
  const weeksInput = numberInput(current.window.weeks, 1, 12, 1);
  const fnSelect = h(
    "select",
    { class: "sheet-date" },
    ...(["mean", "max", "min"] as WindowFn[]).map((fn) => {
      const opt = h("option", { value: fn }, fn);
      opt.selected = fn === current.window.fn;
      return opt;
    }),
  );
  const ceilingInput = numberInput(current.ceilingHours ?? 10, 0, 100, 0.5);
  const noCap = h("input", {
    type: "checkbox",
    checked: current.ceilingHours === null,
  });
  ceilingInput.disabled = current.ceilingHours === null;
  const floorInput = numberInput(current.floorHours, 0, 100, 0.5);
  const weekOptions = listWeeks(currentWeek(), addWeeks(currentWeek(), 8));
  const fromSelect = h(
    "select",
    { class: "sheet-date" },
    ...weekOptions.map((w) =>
      h("option", { value: w }, `${fmtWeekLabel(w)} · ${w}`),
    ),
  );
  const errorList = h("div", { class: "form-errors" });
  const saveBtn = h("button", { class: "btn btn-primary" }, "Save new version");

  const collect = (): Omit<FormulaConfig, "version"> => ({
    weights: {
      reading: Number(reading.input.value),
      exercise: Number(exercise.input.value),
    },
    window: { weeks: Number(weeksInput.value), fn: fnSelect.value as WindowFn },
    ceilingHours: noCap.checked ? null : Number(ceilingInput.value),
    floorHours: Number(floorInput.value),
    effectiveFrom: fromSelect.value,
  });

  const refresh = () => {
    ceilingInput.disabled = noCap.checked;
    const errors = validateFormula({ ...collect(), version: 1 });
    errorList.replaceChildren(
      ...errors.map((e) => h("div", { class: "form-error" }, e)),
    );
    saveBtn.disabled = errors.length > 0;
  };
  for (const el of [
    reading.input,
    exercise.input,
    weeksInput,
    fnSelect,
    ceilingInput,
    noCap,
    floorInput,
    fromSelect,
  ]) {
    el.addEventListener("input", refresh);
    el.addEventListener("change", refresh);
  }
  saveBtn.addEventListener("click", () => {
    void saveFormula(collect()).then(({ formula }) => {
      if (formula)
        toast(
          `formula v${formula.version} saved — applies from ${formula.effectiveFrom}`,
        );
    });
  });
  refresh();

  return h(
    "section",
    { class: "card" },
    h("div", { class: "settings-title" }, "formula"),
    h("div", { class: "formula-desc muted" }, describeFormula(current)),
    reading.row,
    exercise.row,
    fieldRow("window (weeks)", weeksInput),
    fieldRow("window aggregation", fnSelect),
    fieldRow("ceiling (h)", ceilingInput, h("span", { class: "muted" }, "no cap"), noCap),
    fieldRow("floor (h)", floorInput),
    fieldRow("apply from week", fromSelect),
    errorList,
    h("div", { class: "form-actions" }, saveBtn),
    h(
      "div",
      { class: "muted settings-hint" },
      "saving bumps the version and applies from the chosen week; historical weeks keep the formula they were computed under.",
    ),
  );
}

function fieldRow(label: string, ...controls: HTMLElement[]): HTMLElement {
  return h(
    "label",
    { class: "form-row" },
    h("span", { class: "form-label" }, label),
    ...controls,
  );
}

function sliderRow(
  label: string,
  value: number,
): { row: HTMLElement; input: HTMLInputElement } {
  const val = h("span", { class: "slider-val" }, value.toFixed(1));
  const input = h("input", {
    type: "range",
    class: "slider",
    min: "0",
    max: "5",
    step: "0.1",
    value: String(value),
  });
  input.addEventListener("input", () => {
    val.textContent = Number(input.value).toFixed(1);
  });
  return { row: fieldRow(label, input, val), input };
}

function numberInput(
  value: number,
  min: number,
  max: number,
  step: number,
): HTMLInputElement {
  return h("input", {
    type: "number",
    class: "num-input",
    value: String(value),
    min: String(min),
    max: String(max),
    step: String(step),
  });
}

function historyCard(): HTMLElement {
  const current = currentFormula();
  const rows = [...state.formulas].reverse().map((f) => {
    const isCurrent = f.version === current.version;
    const detail = h(
      "div",
      { class: "ledger-detail", hidden: true },
      ...diffRows(f, current),
    );
    const head = h(
      "div",
      {
        class: "ledger-head",
        onclick: () => {
          if (isCurrent) return;
          detail.hidden = !detail.hidden;
          head.querySelector(".chevron")!.textContent = detail.hidden
            ? "▸"
            : "▾";
        },
      },
      h(
        "div",
        { class: "ledger-top" },
        h("span", { class: "chevron muted" }, isCurrent ? "" : "▸"),
        h("span", { class: "ledger-week" }, `v${f.version}`),
        h("span", { class: "muted ledger-range" }, `from ${f.effectiveFrom}`),
        isCurrent ? h("span", { class: "ledger-tag" }, "current") : null,
      ),
      h(
        "div",
        { class: "ledger-stats muted formula-desc" },
        describeFormula(f),
      ),
    );
    return h("div", { class: "card-2" }, head, detail);
  });
  return h(
    "section",
    { class: "card" },
    h("div", { class: "settings-title" }, "history"),
    ...rows,
  );
}

function diffRows(f: FormulaConfig, current: FormulaConfig): HTMLElement[] {
  const rows: HTMLElement[] = [
    h("div", { class: "muted diff-head" }, "this version → current"),
  ];
  const cmp = (
    label: string,
    a: string | number | null,
    b: string | number | null,
  ) => {
    if (String(a) !== String(b))
      rows.push(
        h(
          "div",
          { class: "diff-row" },
          `${label}: ${a ?? "no cap"} → ${b ?? "no cap"}`,
        ),
      );
  };
  cmp("reading weight", f.weights.reading, current.weights.reading);
  cmp("exercise weight", f.weights.exercise, current.weights.exercise);
  cmp("window weeks", f.window.weeks, current.window.weeks);
  cmp("window fn", f.window.fn, current.window.fn);
  cmp("ceiling", f.ceilingHours, current.ceilingHours);
  cmp("floor", f.floorHours, current.floorHours);
  cmp("effective from", f.effectiveFrom, current.effectiveFrom);
  if (rows.length === 1)
    rows.push(h("div", { class: "muted diff-row" }, "identical to current"));
  return rows;
}

function dataCard(): HTMLElement {
  const fileInput = h("input", {
    type: "file",
    class: "file-hidden",
    accept: ".jsonl,.ndjson,.txt",
  });
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) void file.text().then(handleImport);
    fileInput.value = "";
  });
  return h(
    "section",
    { class: "card" },
    h("div", { class: "settings-title" }, "data"),
    h(
      "div",
      { class: "muted settings-hint" },
      state.lastExportAt
        ? `last export: ${daysSince(state.lastExportAt)} days ago`
        : "never exported",
    ),
    h(
      "div",
      { class: "form-actions" },
      h(
        "button",
        {
          class: "btn btn-ghost",
          onclick: () => {
            download("entries.jsonl", serializeEntries(state.entries));
            void markExported();
          },
        },
        "Export entries.jsonl",
      ),
      h(
        "button",
        {
          class: "btn btn-ghost",
          onclick: () => {
            download("formulas.jsonl", serializeFormulas(state.formulas));
            void markExported();
          },
        },
        "Export formulas.jsonl",
      ),
      h(
        "button",
        {
          class: "btn btn-ghost",
          onclick: () => fileInput.click(),
        },
        "Import…",
      ),
    ),
    fileInput,
    h(
      "div",
      { class: "muted settings-hint" },
      "import validates the file, then you choose: merge into this device's data or replace it entirely. keep exports in git — that is the backup.",
    ),
  );
}

function handleImport(text: string): void {
  const { data, errors } = parseImport(text);
  if (!data) {
    openModal(
      "Import failed",
      h(
        "div",
        { class: "form-errors" },
        ...errors.map((e) => h("div", { class: "form-error" }, e)),
      ),
      [{ label: "OK", kind: "ghost", onClick: (close) => close() }],
    );
    return;
  }
  const summary =
    data.kind === "entries"
      ? (() => {
          const dates = data.entries.map((e) => e.date).sort();
          return `${data.entries.length} entries (${dates[0]} → ${dates[dates.length - 1]})`;
        })()
      : `${data.formulas.length} formula versions (v${Math.min(...data.formulas.map((f) => f.version))}–v${Math.max(...data.formulas.map((f) => f.version))})`;
  const current =
    data.kind === "entries"
      ? `${state.entries.length} entries`
      : `${state.formulas.length} formula versions`;
  const count = data.kind === "entries" ? data.entries.length : data.formulas.length;
  const toAdd =
    data.kind === "entries"
      ? data.entries.filter((e) => !state.entries.some((s) => s.id === e.id))
          .length
      : data.formulas.filter(
          (f) => !state.formulas.some((s) => s.version === f.version),
        ).length;
  const runMerge = () =>
    data.kind === "entries"
      ? mergeEntries(data.entries)
      : mergeFormulas(data.formulas);
  const runReplace = () =>
    data.kind === "entries"
      ? replaceEntries(data.entries)
      : replaceFormulas(data.formulas);
  openModal(
    `Import ${data.kind}`,
    h(
      "div",
      {},
      h(
        "p",
        { class: "modal-message" },
        `File holds ${summary}. This device holds ${current}.`,
      ),
      h(
        "p",
        { class: "modal-message" },
        `Merge adds ${toAdd} new and skips ${count - toAdd} already present — existing data is untouched. Replace wipes all ${data.kind} on this device first.`,
      ),
    ),
    [
      { label: "Cancel", kind: "ghost", onClick: (close) => close() },
      {
        label: "Replace all",
        kind: "danger",
        onClick: (close) => {
          close();
          void runReplace().then(() => toast(`${data.kind} replaced`));
        },
      },
      {
        label: "Merge",
        kind: "primary",
        onClick: (close) => {
          close();
          void runMerge().then((r) =>
            toast(`merged: ${r.added} added, ${r.skipped} already present`),
          );
        },
      },
    ],
  );
}

function aboutCard(): HTMLElement {
  return h(
    "section",
    { class: "muted settings-about" },
    `vested · schema v${SCHEMA_VERSION} · all data stays in this browser`,
  );
}
