# Agency billing and Save & Print fix

## Reported problem and cause

Agency users selected scheduled medicines and saw a disabled Save & Print button even when all four rows had sufficient stock. The form imposed retail dispensing requirements (doctor name, RMP registration and warning acknowledgement) on every invoice. `enforcePrescriptionCompliance` also rejected these wholesale invoices on the server. The footer said rows were ready while omitting the prescription blocker.

After saving, `window.open` ran after the asynchronous request, allowing browsers to block the print tab.

## Resulting behavior

- Deployment-owned `BILLING_MODE=wholesale` is the agency/distributor default. Prescription prompts and acknowledgement gates do not block wholesale creation or editing.
- `BILLING_MODE=retail` retains the existing scheduled/Rx/high-caution doctor-details and acknowledgement checks in both the form and server. Request-supplied mode cannot override this policy. Unknown configured modes fail rather than silently disabling checks.
- New and edit forms receive the same server-selected mode from the workspace API.
- The disabled-button footer identifies missing customer, incomplete rows, stock shortage or retail prescription requirements.
- After a successful save, the same tab navigates to the saved invoice print page, avoiding popup blockers. The print page requests the dialog after its fonts and images are ready and retains a manual Print / Download PDF control. Back to billing returns to the workspace. Refreshing the print page does not resubmit the invoice.
- Existing doctor details on historical invoices are preserved when edited in wholesale mode.
- Product schedule flags and company/customer licence information remain available. This change scopes patient-prescription data collection; it does not establish a legal exemption or replace wholesale licence/record requirements.

## Validation

- `node scripts/test-billing-form.mjs`: actual form markup enables wholesale scheduled-drug billing; retail, busy and insufficient-stock gates still disable saving.
- `node scripts/test-billing-mode.mjs`: real D1 service create/edit coverage, retail enforcement, rejected request-level bypass, workspace mode and invalid configuration checks.
- `node scripts/test-document-safety.mjs`: real numbering, duplicate-save protection and rollback regressions.
- `node scripts/test-stock-concurrency.mjs`: stock/balance and competing-save regressions.
- `npm run build`: production build.

The first form-test attempt incorrectly searched the word `disabled` inside CSS class names. The assertion was corrected to inspect the actual HTML disabled attribute; application logic did not change for that test correction.

## Release and acceptance

Build and deploy the Cloudflare app from `sites-app`, not the root FastAPI containers. No schema migration is required by this fix; the existing document-safety migration is still required by the base application. The deployment preparation script explicitly selects wholesale mode. For a retail-only deployment, configure retail mode in its generated Worker variables before deploying.

A GitHub commit or PR does not deploy the manually managed Worker. After deploying, refresh all open clients. Verify on desktop and Android: select the affected four medicines, save once without doctor prompts in wholesale mode, confirm one invoice/one stock deduction, verify the print page and dialog, cancel/reprint without another sale, and confirm existing invoices remain accessible. Browser/OS printing availability and physical printer output require live acceptance; repository tests do not certify them.
