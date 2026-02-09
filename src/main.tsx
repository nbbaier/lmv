import { createRoot } from "react-dom/client";
import { App } from "./app";

// biome-ignore lint/style/noNonNullAssertion: <root is guaranteed to be in the document>
const root = createRoot(document.getElementById("root")!);
root.render(<App />);
