import "./style.css";
import { createFeedbackFab } from "./index";

createFeedbackFab({
  endpoint: window.location.origin,
  appName: "InstaFeed demo",
  onError: (error) => console.error("Feedback Fab:", error),
});
