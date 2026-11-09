# Feedback Fab

An open-source feedback widget for web apps. A tester clicks the floating down-thumb, the widget captures the page, then offers an optional comment. The report and screenshot are stored together in Postgres for your team to review.

## How it works

1. Add the SDK to the app you want testers to review.
2. The tester clicks the floating button. Feedback Fab captures a JPEG screenshot and immediately saves a report in Postgres.
3. A compact card appears. The tester can click “Add a comment” to open the text field and attach context to that report.
4. Review submissions at `/review.html` with the review token.

## Quick start

```sh
npm install feedback-fab
```

```ts
import { createFeedbackFab } from "feedback-fab";

createFeedbackFab({
  endpoint: "https://your-feedback-project.vercel.app",
  appName: "My app",
});
```

Options include `capture` to choose the element to screenshot, `onSubmitted`, and `onError`. Call the returned instance's `destroy()` method to remove the widget.

## Deploy the feedback API

This repository includes a Vercel demo, API, and reviewer inbox. Import the GitHub repository into Vercel, then add a Neon Postgres database through the Vercel Marketplace. Set the resulting `DATABASE_URL` environment variable and add a long random `FEEDBACK_REVIEW_TOKEN`. Optionally set `FEEDBACK_ALLOWED_ORIGINS` to a comma-separated list of tester app origins. Deploy, then visit `/review.html` to review feedback.

The API creates its table on the first request. Screenshot images are stored in the `screenshot_data_url` column to keep each report self-contained. API submissions accept screenshots up to 3 MB. The inbox requires the reviewer token and returns only the latest 200 reports. Use `FEEDBACK_ALLOWED_ORIGINS` to limit the tester apps allowed to submit.

## Development

```sh
npm install
npm run dev
```

The Vite demo uses the same origin for its API. To receive submissions locally, run the app through Vercel's local dev server with a configured Neon `DATABASE_URL` and `FEEDBACK_REVIEW_TOKEN`.

## Privacy and capture limits

Page capture uses `html2canvas`, which reconstructs the visible page from DOM and CSS. Cross-origin iframes and some protected media cannot be captured. A screenshot may contain sensitive page content; deploy the API only for trusted testers and restrict origins when appropriate. Feedback submission does not require a user account.

## License

MIT. See [LICENSE](LICENSE).
