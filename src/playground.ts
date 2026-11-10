import "./playground.css";
import { createFeedbackFab } from "./index";

createFeedbackFab({
  endpoint: window.location.origin,
  appName: "Northstar Support Playground",
  onSubmitted: () => console.info("Playground feedback saved."),
  onError: (error) => console.error("Feedback Fab:", error),
});
