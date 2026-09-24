import "./styles.css";
import { initStore } from "./store";
import { initApp } from "./ui/app";

void initStore().then(initApp);
