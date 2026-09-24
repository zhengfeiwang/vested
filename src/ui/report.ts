import { h } from "./dom";

export function renderReport(root: HTMLElement): void {
  root.append(h("p", { class: "muted" }, "Report — coming in a later commit."));
}
