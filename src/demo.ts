import "./style.css";
import { createFeedbackFab } from "./index";

const demoProjectKey = import.meta.env.VITE_DEMO_PROJECT_KEY;
const widget = demoProjectKey ? createFeedbackFab({
  projectKey: demoProjectKey,
  endpoint: window.location.origin,
  appName: "InstaFeed demo",
  onError: (error) => console.error("InstaFeed:", error),
}) : null;

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-try-demo]")) {
  button.addEventListener("click", () => {
    if (widget) widget.open();
    else window.location.assign("/review.html");
  });
}

if (!widget) {
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-try-demo]")) {
    button.textContent = "Open workspace →";
  }
  const hint = document.createElement("p");
  hint.className = "demo-setup";
  hint.innerHTML = '<a href="/review.html">Open your workspace</a> to create a project and configure the live demo.';
  document.querySelector("main")?.append(hint);
  const demoCopy = document.querySelector<HTMLElement>(".live-demo-strip > div > span:last-child");
  if (demoCopy) demoCopy.textContent = "Create a project in your workspace to enable the live widget on this page.";
}

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-copy]")) {
  button.addEventListener("click", async () => {
    const code = document.getElementById(button.dataset.copy ?? "");
    const status = button.closest(".code-card")?.querySelector<HTMLElement>(".copy-status");
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code.textContent ?? "");
      button.textContent = "Copied ✓";
      if (status) status.textContent = "Code copied to clipboard.";
      window.setTimeout(() => { button.textContent = "Copy"; }, 2200);
    } catch {
      if (status) status.textContent = "Select the code and copy it manually.";
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(code);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  });
}
