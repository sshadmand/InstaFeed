import html2canvas from "html2canvas";

export interface FeedbackFabOptions {
  /** Base URL of the Feedback Fab API, e.g. https://feedback.example.com. */
  endpoint: string;
  /** Optional app name shown in the reviewer inbox. */
  appName?: string;
  /** Element to capture. Defaults to the visible document. */
  capture?: () => HTMLElement;
  /** Called when a feedback record is accepted. */
  onSubmitted?: (feedback: FeedbackReceipt) => void;
  /** Called when capture or submission fails. */
  onError?: (error: Error) => void;
}

export interface FeedbackReceipt { id: string; createdAt: string }

const buttonStyle = `
  :host { all: initial; position: fixed; right: 24px; bottom: 24px; z-index: 2147483000; font: 14px/1.4 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #171a27; }
  * { box-sizing: border-box; }
  button, textarea { font: inherit; }
  button { cursor: pointer; }
  .fab { width: 52px; height: 52px; border: 0; border-radius: 50%; background: #6758ef; color: white; display: grid; place-items: center; box-shadow: 0 8px 24px #39309645; transition: transform .16s, background .16s; }
  .fab:hover { transform: translateY(-2px); background: #5545dc; }
  .fab.hidden { display: none; }
  .fab svg { width: 22px; height: 22px; }
  .card { display: none; width: 278px; border: 1px solid #e8e8ef; border-radius: 16px; background: #fff; box-shadow: 0 16px 50px #1c1a3c26; overflow: hidden; }
  .card.visible { display: block; animation: enter .18s ease-out; }
  @keyframes enter { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
  .top { display: flex; align-items: center; gap: 10px; padding: 11px 12px; min-height: 52px; }
  .icon { width: 30px; height: 30px; flex: 0 0 30px; border-radius: 10px; display: grid; place-items: center; color: #6556ec; background: #f0efff; }
  .icon svg { width: 17px; height: 17px; }
  .message { flex: 1; min-width: 0; color: #313247; font-size: 12px; font-weight: 600; }
  .dismiss { border: 0; color: #858598; background: transparent; padding: 4px; font-size: 18px; line-height: 1; }
  .note-button { margin: 0 11px 11px; display: flex; align-items: center; gap: 9px; width: calc(100% - 22px); min-height: 42px; padding: 0 10px; border: 1px solid #e6e5ef; background: #fff; border-radius: 11px; color: #747487; text-align: left; font-size: 12px; }
  .note-button:hover { border-color: #b9b3f7; background: #fbfaff; }
  .note-button svg { width: 15px; height: 15px; color: #6556ec; flex: 0 0 auto; }
  .entry { display: none; padding: 0 11px 11px; }
  .entry.open { display: block; }
  textarea { display: block; width: 100%; min-height: 78px; resize: vertical; padding: 9px 10px; border: 1px solid #e5e4ec; border-radius: 10px; outline: none; color: #202034; font-size: 12px; }
  textarea:focus { border-color: #8277f2; box-shadow: 0 0 0 3px #8277f21b; }
  .actions { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
  .privacy { color: #9292a1; font-size: 10px; }
  .send { border: 0; border-radius: 8px; background: #6758ef; color: #fff; padding: 7px 11px; font-size: 11px; font-weight: 600; }
  .send:disabled { opacity: .55; cursor: wait; }
  .error { display: none; margin-top: 6px; color: #ba3342; font-size: 11px; }
  .error.visible { display: block; }
  @media (max-width: 380px) { :host { right: 14px; bottom: 14px; } }
`;

const thumbIcon = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 10v10H4.5A1.5 1.5 0 0 1 3 18.5v-7A1.5 1.5 0 0 1 4.5 10H7Zm0 0 4.2-6.1a1.7 1.7 0 0 1 2.9 1.6L13 10h5.2a2 2 0 0 1 1.9 2.6l-1.8 6a2 2 0 0 1-1.9 1.4H7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export class FeedbackFab {
  private host: HTMLDivElement;
  private root: ShadowRoot;
  private screenshot: Blob | null = null;
  private feedbackId: string | null = null;
  private options: FeedbackFabOptions;

  constructor(options: FeedbackFabOptions) {
    if (!options.endpoint) throw new Error("FeedbackFab requires an endpoint URL.");
    this.options = options;
    this.host = document.createElement("div");
    this.host.setAttribute("data-feedback-fab", "");
    this.root = this.host.attachShadow({ mode: "open" });
    document.body.append(this.host);
    this.render();
  }

  destroy() { this.host.remove(); }

  private render() {
    this.root.innerHTML = `<style>${buttonStyle}</style>
      <button class="fab" aria-label="Send page feedback" title="Send page feedback">${thumbIcon}</button>
      <section class="card" aria-live="polite">
        <div class="top"><span class="icon">${thumbIcon}</span><span class="message">Screenshot captured</span><button class="dismiss" aria-label="Close">×</button></div>
        <button class="note-button" aria-label="Add a comment">${thumbIcon}<span>Add a comment?</span></button>
        <div class="entry"><textarea maxlength="4000" placeholder="Add a comment?" aria-label="Add a comment"></textarea><div class="actions"><span class="privacy">Sent securely to your team</span><button class="send">Add comment</button></div><div class="error"></div></div>
      </section>`;
    this.root.querySelector<HTMLButtonElement>(".fab")!.addEventListener("click", () => void this.capture());
    this.root.querySelector<HTMLButtonElement>(".note-button")!.addEventListener("click", () => {
      this.root.querySelector(".entry")!.classList.add("open");
      this.root.querySelector<HTMLTextAreaElement>("textarea")!.focus();
    });
    this.root.querySelector<HTMLButtonElement>(".dismiss")!.addEventListener("click", () => this.reset());
    this.root.querySelector<HTMLButtonElement>(".send")!.addEventListener("click", () => void this.submit());
  }

  private async capture() {
    const fabButton = this.root.querySelector<HTMLButtonElement>(".fab")!;
    const noteButton = this.root.querySelector<HTMLButtonElement>(".note-button")!;
    fabButton.disabled = true;
    noteButton.disabled = true;
    try {
      const canvas = await html2canvas(this.options.capture?.() ?? document.documentElement, {
        useCORS: true, allowTaint: false, scale: Math.min(window.devicePixelRatio || 1, 1.5),
        ignoreElements: (element) => element.hasAttribute("data-feedback-fab"),
      });
      this.screenshot = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not encode screenshot.")), "image/jpeg", 0.72));
      this.root.querySelector(".card")!.classList.add("visible");
      this.root.querySelector(".entry")!.classList.remove("open");
      this.setMessage("Sending screenshot…");
      await this.uploadScreenshot();
      this.setMessage("Screenshot sent. Add a comment?");
      noteButton.disabled = false;
      fabButton.classList.add("hidden");
    } catch (error) {
      this.options.onError?.(asError(error));
      this.setMessage("Could not send feedback. Try again.");
      this.root.querySelector(".card")!.classList.add("visible");
    } finally { fabButton.disabled = false; }
  }

  private async uploadScreenshot() {
    if (!this.screenshot) return;
    const send = this.root.querySelector<HTMLButtonElement>(".send")!;
    const error = this.root.querySelector<HTMLDivElement>(".error")!;
    send.disabled = true; error.classList.remove("visible");
    const form = new FormData();
    form.append("screenshot", this.screenshot, "feedback.jpg");
    form.append("comment", "");
    form.append("url", location.href);
    form.append("title", document.title);
    form.append("appName", this.options.appName ?? "");
    form.append("userAgent", navigator.userAgent);
    try {
      const response = await fetch(new URL("/api/feedback", this.options.endpoint), { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Feedback could not be submitted.");
      this.feedbackId = result.id;
      this.options.onSubmitted?.(result as FeedbackReceipt);
      this.screenshot = null;
    } catch (cause) {
      const exception = asError(cause);
      this.options.onError?.(exception);
      error.textContent = exception.message;
      error.classList.add("visible");
      throw exception;
    } finally { send.disabled = false; }
  }

  private async submit() {
    if (!this.feedbackId) return;
    const send = this.root.querySelector<HTMLButtonElement>(".send")!;
    const error = this.root.querySelector<HTMLDivElement>(".error")!;
    const comment = this.root.querySelector<HTMLTextAreaElement>("textarea")!.value.trim();
    if (!comment) { error.textContent = "Add a comment first."; error.classList.add("visible"); return; }
    send.disabled = true; error.classList.remove("visible");
    try {
      const response = await fetch(new URL("/api/feedback", this.options.endpoint), {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: this.feedbackId, comment }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Comment could not be saved.");
      this.root.querySelector<HTMLTextAreaElement>("textarea")!.value = "";
      this.setMessage("Thanks — your comment was added");
      window.setTimeout(() => this.reset(), 2200);
    } catch (cause) {
      const exception = asError(cause);
      this.options.onError?.(exception);
      error.textContent = exception.message;
      error.classList.add("visible");
    } finally { send.disabled = false; }
  }

  private setMessage(message: string) { this.root.querySelector(".message")!.textContent = message; }
  private reset() { this.root.querySelector(".card")!.classList.remove("visible"); this.root.querySelector(".entry")!.classList.remove("open"); this.root.querySelector<HTMLButtonElement>(".fab")!.classList.remove("hidden"); this.screenshot = null; this.feedbackId = null; }
}

function asError(error: unknown) { return error instanceof Error ? error : new Error(String(error)); }

export function createFeedbackFab(options: FeedbackFabOptions) { return new FeedbackFab(options); }
