import { copyFile, mkdir } from 'node:fs/promises';

// A public browser bundle lets hosted and self-hosted customers install without a registry account.
await mkdir('dist/sdk', { recursive: true });
await copyFile('dist-sdk/feedback-fab.es.js', 'dist/sdk/instafeed.es.js');
