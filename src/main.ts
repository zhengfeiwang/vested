import "./styles.css";
import { initStore } from "./store";
import { initApp } from "./ui/app";

void initStore().then(initApp);
if (import.meta.env.PROD) void import("./pwa").then((m) => m.initPwa());
