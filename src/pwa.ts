import { registerSW } from "virtual:pwa-register";
import { toast } from "./ui/dom";

// Prompt-before-reload updates: the new service worker waits until the user
// confirms, so an update can never disrupt a session (or touch stored data).
export function initPwa(): void {
  const updateSW = registerSW({
    onNeedRefresh() {
      toast("update available", {
        label: "Reload",
        onClick: () => void updateSW(true),
      });
    },
  });
}
