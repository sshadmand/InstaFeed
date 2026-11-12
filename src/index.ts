import html2canvas from "html2canvas";

export interface FeedbackFabOptions {
  /** Base URL of the Feedback Fab API, e.g. https://feedback.example.com. */
  endpoint: string;
  /** Public project key from the InstaFeed dashboard. Safe to embed in a browser. */
  projectKey: string;
  /** Optional app label. The project name in the dashboard determines stored ownership. */
  appName?: string;
  /** Element to capture. Defaults to the visible document. */
  capture?: () => HTMLElement;
  /** Called when a feedback record is accepted. */
  onSubmitted?: (feedback: FeedbackReceipt) => void;
  /** Called when capture or submission fails. */
  onError?: (error: Error) => void;
}

export type FeedbackReaction = "up" | "down";
export interface FeedbackReceipt { id: string; createdAt: string; reaction?: FeedbackReaction }

const buttonStyle = `
  :host { all: initial; position: fixed; right: 24px; bottom: 24px; z-index: 2147483000; font: 14px/1.4 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #171a27; }
  * { box-sizing: border-box; }
  button, textarea { font: inherit; }
  button { cursor: pointer; }
  .launcher { position: relative; width: 52px; height: 52px; }
  .launcher.hidden { display: none; }
  .fab, .choice { width: 52px; height: 52px; border: 0; border-radius: 50%; background: #6758ef; color: white; display: grid; place-items: center; box-shadow: 0 8px 24px #39309645; transition: transform .16s, background .16s; }
  .fab { position: relative; z-index: 1; }
  .fab::after { content: "Open"; position: absolute; right: 62px; padding: 5px 9px; border-radius: 7px; background: #24233a; color: white; font-size: 11px; font-weight: 600; opacity: 0; pointer-events: none; transform: translateX(4px); transition: opacity .14s, transform .14s; }
  .launcher.label-visible .fab::after { opacity: 1; transform: translateX(0); }
  .fab:hover { transform: translateY(-2px); background: #5545dc; }
  .fab svg { width: 22px; height: 22px; }
  .choices { position: absolute; right: 0; bottom: 62px; display: flex; flex-direction: column; gap: 10px; opacity: 0; visibility: hidden; transform: translateY(6px); transition: opacity .16s ease, transform .16s ease, visibility 0s linear .16s; }
  .launcher.choosing .choices { opacity: 1; visibility: visible; transform: translateY(0); transition-delay: 0s; }
  .choice svg { width: 22px; height: 22px; }
  .choice:hover { transform: translateY(-2px); background: #5545dc; }
  .choice-down { background: white; color: #6758ef; border: 1px solid #dfdafb; }
  .choice-down:hover { background: #f2efff; }
  button:focus-visible { outline: 3px solid #b6adff; outline-offset: 4px; }
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
const thumbDownIcon = thumbIcon.replace('viewBox="0 0 24 24"', 'viewBox="0 0 24 24" style="transform: rotate(180deg)"');
const combinedThumbIcon = `<svg viewBox="0 0 34 34" fill="none" aria-hidden="true"><g transform="translate(0 0) scale(.8)">${thumbIcon.replace(/<\/?svg[^>]*>/g, "")}</g><g transform="translate(34 34) rotate(180) scale(.8)">${thumbIcon.replace(/<\/?svg[^>]*>/g, "")}</g></svg>`;

export class FeedbackFab {
  private host: HTMLDivElement;
  private root: ShadowRoot;
  private screenshot: Blob | null = null;
  private feedbackId: string | null = null;
  private updateToken: string | null = null;
  private reaction: FeedbackReaction = "up";
  private hoverTimer = 0;
  private capturing = false;
  private readonly onOutsidePointer = (event: PointerEvent) => { if (!event.composedPath().includes(this.host)) this.setChoosing(false); };
  private options: FeedbackFabOptions;

  constructor(options: FeedbackFabOptions) {
    if (!options.endpoint) throw new Error("FeedbackFab requires an endpoint URL.");
    if (!options.projectKey) throw new Error("FeedbackFab requires a public projectKey from the InstaFeed dashboard.");
    this.options = options;
    this.host = document.createElement("div");
    this.host.setAttribute("data-feedback-fab", "");
    this.root = this.host.attachShadow({ mode: "open" });
    document.body.append(this.host);
    this.render();
    document.addEventListener("pointerdown", this.onOutsidePointer);
  }

  destroy() { window.clearTimeout(this.hoverTimer); document.removeEventListener("pointerdown", this.onOutsidePointer); this.host.remove(); }

  private render() {
    this.root.innerHTML = `<style>${buttonStyle}</style>
      <div class="launcher"><button class="fab" aria-label="Give feedback" aria-expanded="false" aria-controls="feedback-reactions">${combinedThumbIcon}</button><div class="choices" id="feedback-reactions" role="group" aria-label="Choose a feedback reaction" aria-hidden="true"><button class="choice choice-up" data-reaction="up" aria-label="Thumbs up" title="Thumbs up">${thumbIcon}</button><button class="choice choice-down" data-reaction="down" aria-label="Thumbs down" title="Thumbs down">${thumbDownIcon}</button></div></div>
      <section class="card" aria-live="polite">
        <div class="top"><span class="icon">${thumbIcon}</span><span class="message">Screenshot captured</span><button class="dismiss" aria-label="Close">×</button></div>
        <button class="note-button" aria-label="Add a comment">${thumbIcon}<span>Add a comment?</span></button>
        <div class="entry"><textarea maxlength="4000" placeholder="Add a comment?" aria-label="Add a comment"></textarea><div class="actions"><span class="privacy">Sent securely to your team</span><button class="send">Add comment</button></div><div class="error"></div></div>
      </section>`;
    const launcher = this.root.querySelector<HTMLDivElement>(".launcher")!;
    const fabButton = this.root.querySelector<HTMLButtonElement>(".fab")!;
    fabButton.addEventListener("click", () => { if (!launcher.classList.contains("choosing")) this.setChoosing(true); });
    launcher.addEventListener("pointerenter", (event) => { if (event.pointerType === "mouse" && !this.capturing) { window.clearTimeout(this.hoverTimer); launcher.classList.add("label-visible"); this.setChoosing(true); } });
    launcher.addEventListener("pointerleave", () => { this.hoverTimer = window.setTimeout(() => { if (!launcher.contains(this.root.activeElement)) { this.setChoosing(false); launcher.classList.remove("label-visible"); } }, 2250); });
    launcher.addEventListener("focusout", () => window.setTimeout(() => { if (!launcher.contains(this.root.activeElement)) this.setChoosing(false); }, 0));
    launcher.addEventListener("keydown", (event) => { if (event.key === "Escape") { this.setChoosing(false); fabButton.focus({ preventScroll: true }); } });
    for (const button of this.root.querySelectorAll<HTMLButtonElement>(".choice")) button.addEventListener("click", () => { this.reaction = button.dataset.reaction as FeedbackReaction; this.setChoosing(false); void this.capture(); });
    this.root.querySelector<HTMLButtonElement>(".note-button")!.addEventListener("click", () => {
      this.root.querySelector(".entry")!.classList.add("open");
      this.root.querySelector<HTMLTextAreaElement>("textarea")!.focus();
    });
    this.root.querySelector<HTMLButtonElement>(".dismiss")!.addEventListener("click", () => this.reset());
    this.root.querySelector<HTMLButtonElement>(".send")!.addEventListener("click", () => void this.submit());
  }

  private async capture() {
    if (this.capturing) return;
    this.capturing = true;
    const fabButton = this.root.querySelector<HTMLButtonElement>(".fab")!;
    const launcher = this.root.querySelector<HTMLDivElement>(".launcher")!;
    const noteButton = this.root.querySelector<HTMLButtonElement>(".note-button")!;
    fabButton.disabled = true;
    noteButton.disabled = true;
    this.root.querySelector(".error")!.classList.remove("visible");
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
      launcher.classList.add("hidden");
    } catch (error) {
      this.options.onError?.(asError(error));
      this.setMessage("Could not send feedback. Try again.");
      this.root.querySelector(".card")!.classList.add("visible");
      launcher.classList.remove("hidden");
    } finally { fabButton.disabled = false; this.capturing = false; }
  }

  private submissionUrl() {
    const url = new URL("/api/feedback", this.options.endpoint);
    url.searchParams.set("projectKey", this.options.projectKey);
    return url;
  }

  private async uploadScreenshot() {
    if (!this.screenshot) return;
    const send = this.root.querySelector<HTMLButtonElement>(".send")!;
    const error = this.root.querySelector<HTMLDivElement>(".error")!;
    send.disabled = true; error.classList.remove("visible");
    const form = new FormData();
    form.append("screenshot", this.screenshot, "feedback.jpg");
    form.append("comment", "");
    form.append("reaction", this.reaction);
    form.append("url", location.href);
    form.append("title", document.title);
    form.append("appName", this.options.appName ?? "");
    form.append("userAgent", navigator.userAgent);
    try {
      const response = await fetch(this.submissionUrl(), { method: "POST", headers: { "X-InstaFeed-Project": this.options.projectKey }, body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Feedback could not be submitted.");
      this.feedbackId = result.id;
      this.updateToken = result.updateToken;
      this.options.onSubmitted?.({ id: result.id, createdAt: result.createdAt, reaction: this.reaction });
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
    if (!this.feedbackId || !this.updateToken) return;
    const send = this.root.querySelector<HTMLButtonElement>(".send")!;
    const error = this.root.querySelector<HTMLDivElement>(".error")!;
    const comment = this.root.querySelector<HTMLTextAreaElement>("textarea")!.value.trim();
    if (!comment) { error.textContent = "Add a comment first."; error.classList.add("visible"); return; }
    send.disabled = true; error.classList.remove("visible");
    try {
      const response = await fetch(this.submissionUrl(), {
        method: "PATCH", headers: { "Content-Type": "application/json", "X-InstaFeed-Project": this.options.projectKey },
        body: JSON.stringify({ id: this.feedbackId, updateToken: this.updateToken, comment }),
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
  private setChoosing(choosing: boolean) {
    const launcher = this.root.querySelector<HTMLDivElement>(".launcher")!;
    launcher.classList.toggle("choosing", choosing);
    this.root.querySelector<HTMLButtonElement>(".fab")!.setAttribute("aria-expanded", String(choosing));
    this.root.querySelector(".choices")!.setAttribute("aria-hidden", String(!choosing));
  }
  private reset() { this.root.querySelector(".card")!.classList.remove("visible"); this.root.querySelector(".entry")!.classList.remove("open"); this.root.querySelector<HTMLDivElement>(".launcher")!.classList.remove("hidden", "label-visible"); this.screenshot = null; this.feedbackId = null; this.updateToken = null; }
}

function asError(error: unknown) { return error instanceof Error ? error : new Error(String(error)); }

export function createFeedbackFab(options: FeedbackFabOptions) { return new FeedbackFab(options); }
