import { h } from "./dom";

export function renderLedger(root: HTMLElement): void {
  root.append(h("p", { class: "muted" }, "Ledger — coming in the next commit."));
}
