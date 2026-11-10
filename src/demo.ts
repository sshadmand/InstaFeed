import "./style.css";
import { createFeedbackFab } from "./index";

const widget = createFeedbackFab({
  endpoint: window.location.origin,
  appName: "InstaFeed public demo",
  onError: (error) => console.error("InstaFeed:", error),
});

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-try-demo]")) {
  button.addEventListener("click", () => widget.open());
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
