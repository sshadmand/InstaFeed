# InstaFeed · Feedback Fab SDK

![InstaFeed brandmark and wordmark](./instafeed-logo.svg)

An open-source feedback widget for web apps. The floating button shows overlapping thumbs. Hover or tap to reveal separate thumbs-up and thumbs-down buttons; choosing one captures the page and offers an optional comment. The report and screenshot are stored together in Postgres for your team to review.

**Product page + live demo:** [instafeed.chat](https://instafeed.chat) · **Review inbox:** [instafeed.chat/review.html](https://instafeed.chat/review.html)

The public homepage explains the product and installation, and runs the real widget. Try it there to submit a screenshot and optional comment to the demo inbox. The SDK package and import name remain `feedback-fab`.

## How it works

1. Add the SDK to the app you want testers to review.
2. The tester hovers over the floating button (or taps it on a touch screen), then chooses thumbs up or thumbs down. InstaFeed captures a JPEG screenshot and immediately saves the report and reaction in Postgres.
3. A compact card appears. The tester can click “Add a comment” to open the text field and attach context to that report.
4. Review submissions and their thumbs-up/down badges at `/review.html` with the review token. Older reports retain their original data and have no reaction badge.

## Quick start

```sh
npm install github:sshadmand/feedback-fab
```

```ts
import { createFeedbackFab } from "feedback-fab";

createFeedbackFab({
  endpoint: "https://your-feedback-project.vercel.app",
  appName: "My app",
});
```

Options include `capture` to choose the element to screenshot, `onSubmitted`, and `onError`. Call the returned instance's `open()` method to open the reaction choices from your own button, or `destroy()` to remove the widget. In React, initialize it in an effect and call `destroy()` during cleanup.

The optional `reaction` field in submission callbacks and review API results is `up` or `down`. Older SDK clients can still submit reports without a reaction. Keyboard users can open the launcher with Enter, choose a reaction with Tab/Enter, and close the choices with Escape.

## Deploy the feedback API

This repository includes a Vercel demo, API, and reviewer inbox. Import the GitHub repository into Vercel, then add a Neon Postgres database through the Vercel Marketplace. Set the resulting `DATABASE_URL` environment variable and add a long random `FEEDBACK_REVIEW_TOKEN`. Optionally set `FEEDBACK_ALLOWED_ORIGINS` to a comma-separated list of tester app origins. Deploy, then visit `/review.html` to review feedback.

The API creates its table on the first request. Screenshot images are stored in the `screenshot_data_url` column to keep each report self-contained. API submissions accept screenshots up to 3 MB. The inbox requires the reviewer token and returns only the latest 200 reports. Use `FEEDBACK_ALLOWED_ORIGINS` to limit the tester apps allowed to submit.

The `/playground.html` sample support dashboard is included in local development and Vercel Preview builds, but excluded from Production builds. Vercel Preview deployments require workspace authentication, so you can test the widget without publishing the playground to the public production site.

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
