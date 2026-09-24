import { computeLedgers } from "../ledger";
import { state } from "../store";
import { currentWeek, weekDates } from "../weeks";
import {
  fmtHours,
  fmtSignedHours,
  fmtWeekLabel,
  fmtWeekRange,
} from "../format";
import type { WeeklyLedger } from "../types";
import { h } from "./dom";
import { entryRow } from "./week";

let expandedWeek: string | null = null;

export function renderLedger(root: HTMLElement): void {
  const ledgers = computeLedgers(
    state.entries,
    state.formulas,
    currentWeek(),
  ).reverse();
  root.append(
    h(
      "section",
      { class: "ledger" },
      h(
        "div",
        { class: "entries-title muted" },
        "weekly ledger · tap a week for its entries",
      ),
      ...ledgers.map(ledgerRow),
    ),
  );
}

function ledgerRow(ledger: WeeklyLedger): HTMLElement {
  const open = expandedWeek === ledger.week;
  const dates = new Set(weekDates(ledger.week));
  const entries = state.entries.filter((e) => dates.has(e.date)).reverse();
  const detail = h(
    "div",
    { class: "ledger-detail", hidden: !open },
    ...(entries.length > 0
      ? entries.map(entryRow)
      : [h("div", { class: "muted ledger-empty" }, "no entries")]),
  );
  const head = h(
    "div",
    {
      class: "ledger-head",
      onclick: () => {
        detail.hidden = !detail.hidden;
        expandedWeek = detail.hidden ? null : ledger.week;
        head.querySelector(".chevron")!.textContent = detail.hidden ? "▸" : "▾";
      },
    },
    h(
      "div",
      { class: "ledger-top" },
      h("span", { class: "chevron muted" }, open ? "▾" : "▸"),
      h("span", { class: "ledger-week" }, fmtWeekLabel(ledger.week)),
      h("span", { class: "muted ledger-range" }, fmtWeekRange(ledger.week)),
      ledger.bootstrap ? h("span", { class: "ledger-tag" }, "grace") : null,
    ),
    h(
      "div",
      { class: "ledger-stats muted" },
      h("span", { class: "cat-reading" }, `R ${fmtHours(ledger.hours.reading)}`),
      h("span", { class: "cat-exercise" }, `E ${fmtHours(ledger.hours.exercise)}`),
      h("span", { class: "cat-game" }, `G ${fmtHours(ledger.consumed)}`),
      h("span", {}, `grant ${fmtHours(ledger.grant)}`),
      h(
        "span",
        {
          class:
            ledger.balance === null
              ? ""
              : ledger.balance < 0
                ? "balance-debt"
                : "balance-ok",
        },
        `bal ${fmtSignedHours(ledger.balance)}`,
      ),
      h("span", { class: "ledger-fv" }, `f${ledger.formulaVersion}`),
    ),
  );
  return h("div", { class: "ledger-row card" }, head, detail);
}
