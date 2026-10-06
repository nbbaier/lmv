import { createRoot } from "react-dom/client";
import { App } from "./app";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing root element");
const root = createRoot(rootElement);
root.render(<App />);
