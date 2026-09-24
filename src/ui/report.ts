import { computeGrant } from "../formula";
import { computeLedgers, totalsByWeek } from "../ledger";
import { currentFormula, state } from "../store";
import { download } from "../transfer";
import { currentWeek } from "../weeks";
import { fmtHours, fmtPct, fmtWeekLabel } from "../format";
import type { WeeklyLedger } from "../types";
import { barChart, lineChart, type LineSeries } from "./charts";
import { h } from "./dom";

const RANGES = [
  { weeks: 4, label: "4w" },
  { weeks: 8, label: "8w" },
  { weeks: 12, label: "12w" },
  { weeks: 0, label: "all" },
] as const;

let rangeWeeks: number = 8;
let showOverlay = true;
let whatIf = false;

export function renderReport(root: HTMLElement): void {
  const now = currentWeek();
  const all = computeLedgers(state.entries, state.formulas, now);
  const ledgers = rangeWeeks === 0 ? all : all.slice(-rangeWeeks);
  const rerender = () => {
    root.replaceChildren();
    renderReport(root);
  };

  root.append(
    rangeChips(rerender),
    statsCard(ledgers),
    trendCard(ledgers, rerender),
    grantsCard(ledgers, all, rerender),
    exportRow(ledgers),
  );
}

function rangeChips(rerender: () => void): HTMLElement {
  return h(
    "section",
    { class: "chip-row" },
    ...RANGES.map((r) =>
      h(
        "button",
        {
          class: `chip${rangeWeeks === r.weeks ? " active" : ""}`,
          onclick: () => {
            rangeWeeks = r.weeks;
            rerender();
          },
        },
        r.label,
      ),
    ),
  );
}

function statsCard(ledgers: WeeklyLedger[]): HTMLElement {
  const sum = (f: (l: WeeklyLedger) => number) =>
    ledgers.reduce((a, l) => a + f(l), 0);
  const totals = {
    reading: sum((l) => l.hours.reading),
    exercise: sum((l) => l.hours.exercise),
    game: sum((l) => l.consumed),
  };
  const n = Math.max(1, ledgers.length);
  const capped = ledgers.filter((l) => l.grant !== null && l.grant > 0);
  const adherence =
    capped.length > 0
      ? capped.reduce((a, l) => a + l.consumed / (l.grant as number), 0) /
        capped.length
      : null;
  const zeroGrant = ledgers.filter((l) => l.grant === 0).length;
  const uncapped = ledgers.filter((l) => l.grant === null).length;

  const row = (label: string, ...values: (string | HTMLElement)[]) =>
    h(
      "div",
      { class: "stat-row" },
      h("span", { class: "stat-label muted" }, label),
      h("span", { class: "stat-value" }, ...values),
    );
  const cat = (cls: string, text: string) => h("span", { class: cls }, text);

  return h(
    "section",
    { class: "card" },
    row(
      "totals",
      cat("cat-reading", `R ${fmtHours(totals.reading)}`),
      cat("cat-exercise", `E ${fmtHours(totals.exercise)}`),
      cat("cat-game", `G ${fmtHours(totals.game)}`),
    ),
    row(
      "weekly avg",
      cat("cat-reading", fmtHours(totals.reading / n)),
      cat("cat-exercise", fmtHours(totals.exercise / n)),
      cat("cat-game", fmtHours(totals.game / n)),
    ),
    row(
      "adherence",
      adherence === null ? "—" : fmtPct(adherence),
      h(
        "span",
        { class: "muted stat-note" },
        `used of granted · zero-grant weeks ${zeroGrant} · uncapped ${uncapped}`,
      ),
    ),
  );
}

function trendCard(ledgers: WeeklyLedger[], rerender: () => void): HTMLElement {
  const labels = ledgers.map((l) => fmtWeekLabel(l.week));
  const effort = ledgers.map((l) => l.hours.reading + l.hours.exercise);
  const series: LineSeries[] = [
    { color: "#34d399", values: effort as (number | null)[] },
  ];
  if (showOverlay) {
    const { weeks, fn } = currentFormula().window;
    const overlay = effort.map((_, i) => {
      const slice = effort.slice(Math.max(0, i - weeks + 1), i + 1);
      if (fn === "max") return Math.max(...slice);
      if (fn === "min") return Math.min(...slice);
      return slice.reduce((a, b) => a + b, 0) / slice.length;
    });
    series.push({ color: "#94a3b8", dashed: true, values: overlay });
  }
  return h(
    "section",
    { class: "card" },
    h(
      "div",
      { class: "chart-title" },
      h("span", {}, "reading + exercise per week"),
      h(
        "label",
        { class: "chart-toggle muted" },
        h("input", {
          type: "checkbox",
          checked: showOverlay,
          onchange: (e: Event) => {
            showOverlay = (e.target as HTMLInputElement).checked;
            rerender();
          },
        }),
        ` ${currentFormula().window.fn} over ${currentFormula().window.weeks}w`,
      ),
    ),
    lineChart(labels, series),
  );
}

function grantsCard(
  ledgers: WeeklyLedger[],
  all: WeeklyLedger[],
  rerender: () => void,
): HTMLElement {
  const labels = ledgers.map((l) => fmtWeekLabel(l.week));
  let grants: (number | null)[];
  if (whatIf) {
    const formula = currentFormula();
    const totals = totalsByWeek(state.entries);
    const bootstrapWeeks = new Set(
      all.filter((l) => l.bootstrap).map((l) => l.week),
    );
    grants = ledgers.map((l) =>
      computeGrant(
        l.week,
        formula,
        (w) => totals.get(w) ?? { reading: 0, exercise: 0 },
        bootstrapWeeks.has(l.week),
      ),
    );
  } else {
    grants = ledgers.map((l) => l.grant);
  }
  return h(
    "section",
    { class: "card" },
    h(
      "div",
      { class: "chart-title" },
      h("span", {}, "grant vs consumed"),
      h(
        "label",
        { class: "chart-toggle muted" },
        h("input", {
          type: "checkbox",
          checked: whatIf,
          onchange: (e: Event) => {
            whatIf = (e.target as HTMLInputElement).checked;
            rerender();
          },
        }),
        " what-if: current formula",
      ),
    ),
    barChart(
      labels,
      ledgers.map((l, i) => [grants[i] ?? null, l.consumed]),
      ["#475569", "#a78bfa"],
    ),
    h(
      "div",
      { class: "chart-legend muted" },
      h("span", { class: "legend-grant" }, "■ grant"),
      h("span", { class: "cat-game" }, "■ consumed"),
    ),
  );
}

function exportRow(ledgers: WeeklyLedger[]): HTMLElement {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return h(
    "section",
    { class: "export-row" },
    h(
      "button",
      {
        class: "btn btn-ghost",
        onclick: () => {
          const csv =
            [
              "week,reading,exercise,game,grant,consumed,balance,formula_version",
              ...ledgers.map((l) =>
                [
                  l.week,
                  round2(l.hours.reading),
                  round2(l.hours.exercise),
                  round2(l.hours.game),
                  l.grant === null ? "" : round2(l.grant),
                  round2(l.consumed),
                  l.balance === null ? "" : round2(l.balance),
                  l.formulaVersion,
                ].join(","),
              ),
            ].join("\n") + "\n";
          download("vested-report.csv", csv);
        },
      },
      "Export CSV",
    ),
    h(
      "button",
      {
        class: "btn btn-ghost",
        onclick: () =>
          download("vested-report.json", JSON.stringify(ledgers, null, 2)),
      },
      "Export JSON",
    ),
  );
}
