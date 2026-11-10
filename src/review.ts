import "./review.css";

const form = document.querySelector<HTMLFormElement>("#auth")!;
const tokenInput = document.querySelector<HTMLInputElement>("#token")!;
const status = document.querySelector<HTMLDivElement>("#status")!;
const items = document.querySelector<HTMLElement>("#items")!;

form.addEventListener("submit", (event) => { event.preventDefault(); void load(); });
document.querySelector("#refresh")!.addEventListener("click", () => void load());

async function load() {
  status.textContent = "Loading feedback…";
  try {
    const response = await fetch("/api/feedback", { headers: { Authorization: `Bearer ${tokenInput.value}` } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not load feedback.");
    sessionStorage.setItem("feedback-review-token", tokenInput.value);
    render(data.feedback);
    status.textContent = `${data.feedback.length} latest submission${data.feedback.length === 1 ? "" : "s"}`;
  } catch (error) { status.textContent = error instanceof Error ? error.message : "Could not load feedback."; }
}

function render(records: Array<{ id: string; createdAt: string; appName: string; url: string; title: string; comment: string; screenshot_data: string; userAgent: string; reaction?: "up" | "down" | null }>) {
  items.replaceChildren();
  for (const item of records) {
    const card = document.createElement("article");
    card.className = "report";
    const image = document.createElement("img"); image.src = item.screenshot_data; image.alt = `Screenshot of ${item.title || item.url}`; image.loading = "lazy";
    const detail = document.createElement("div"); detail.className = "detail";
    const heading = document.createElement("div"); heading.className = "report-heading";
    const app = document.createElement("strong"); app.textContent = item.appName || "Feedback";
    const date = document.createElement("time"); date.dateTime = item.createdAt; date.textContent = new Date(item.createdAt).toLocaleString();
    heading.append(app, date);
    if (item.reaction === "up" || item.reaction === "down") {
      const badge = document.createElement("span");
      badge.className = `reaction-badge reaction-${item.reaction}`;
      badge.textContent = item.reaction === "up" ? "👍 Thumbs up" : "👎 Thumbs down";
      detail.append(heading, badge);
    } else {
      detail.append(heading);
    }
    const comment = document.createElement("p"); comment.textContent = item.comment || "No comment added.";
    const link = document.createElement("a"); link.href = item.url; link.target = "_blank"; link.rel = "noreferrer"; link.textContent = item.title || item.url;
    const browser = document.createElement("small"); browser.textContent = item.userAgent;
    detail.append(comment, link, browser); card.append(image, detail); items.append(card);
  }
}

tokenInput.value = sessionStorage.getItem("feedback-review-token") ?? "";
if (tokenInput.value) void load();
