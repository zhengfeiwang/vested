import "./styles.css";
import { initStore } from "./store";
import { initApp } from "./ui/app";

// No backend to report to — surface fatal startup errors on screen.
function fatal(message: string): void {
  const box = document.createElement("pre");
  box.className = "fatal";
  box.textContent = `vested failed to start:\n${message}`;
  document.body.append(box);
}
window.addEventListener("error", (e) => fatal(e.message));
window.addEventListener("unhandledrejection", (e) =>
  fatal(e.reason instanceof Error ? (e.reason.stack ?? e.reason.message) : String(e.reason)),
);

void initStore().then(initApp);
if (import.meta.env.PROD) void import("./pwa").then((m) => m.initPwa());
