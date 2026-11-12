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
export interface FeedbackReceipt {
    id: string;
    createdAt: string;
    reaction?: FeedbackReaction;
}
export declare class FeedbackFab {
    private host;
    private root;
    private screenshot;
    private feedbackId;
    private updateToken;
    private reaction;
    private hoverTimer;
    private capturing;
    private recognition;
    private voiceBase;
    private voiceTranscript;
    private pointerRecording;
    private readonly onOutsidePointer;
    private options;
    constructor(options: FeedbackFabOptions);
    destroy(): void;
    private render;
    private capture;
    private submissionUrl;
    private uploadScreenshot;
    private submit;
    private startVoiceRecording;
    private stopVoiceRecording;
    private setMessage;
    private setChoosing;
    private reset;
}
export declare function createFeedbackFab(options: FeedbackFabOptions): FeedbackFab;
