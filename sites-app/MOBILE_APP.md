# MediBill installable mobile app

Uses the existing Cloudflare application and Google sign-in. No separate Android backend or patient/HMS workflows.

## Installation
- Android Chrome: open the production URL, sign in, and select Install MediBill when offered. Browser menu → Install app / Add to Home screen is the fallback.
- iPhone/iPad Safari: Share → Add to Home Screen → Add.
- Desktop Chrome/Edge may offer the same installation action.

## Mobile changes
Bottom shortcuts for Home, Sales, Stock, Reports, and More. More opens the existing complete navigation. The drawer closes with Escape or the backdrop, traps keyboard focus, and disables background controls while open. Forms use touch-sized controls and 16px inputs; tables scroll horizontally; dialogs fit the visible viewport and safe areas.

## Connectivity and data
Server saves require a connection. Existing tenant/user-scoped browser invoice drafts remain local. The service worker only stores the public offline notice; authenticated pages, API responses, invoice details and reports are not cached. Offline launch shows the notice rather than a working offline billing system. Installation does not add cross-device draft sync or fix the separately observed session expiry issue.

## Checks
`npm run test:mobile` validates manifest icons, API bypass, offline navigation and no private response caching. `npm run test:billing`, `npm run test:reports`, and `npm run build` cover existing workflows. Real Android/iOS installation, print dialog behavior and device-specific keyboard layouts still require physical-device verification.
