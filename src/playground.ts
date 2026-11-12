import "./playground.css";
import { createFeedbackFab } from "./index";

if (import.meta.env.VITE_DEMO_PROJECT_KEY) createFeedbackFab({
  projectKey: import.meta.env.VITE_DEMO_PROJECT_KEY,
  endpoint: window.location.origin,
  appName: "Northstar Support Playground",
  onSubmitted: () => console.info("Playground feedback saved."),
  onError: (error) => console.error("Feedback Fab:", error),
});

else {
  const hint = document.createElement("p");
  hint.className = "demo-setup";
  hint.innerHTML = '<a href="/review.html">Open your workspace</a> to create a project and configure the demo widget.';
  document.querySelector("main")?.append(hint);
}
