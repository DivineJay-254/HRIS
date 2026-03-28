# HRIS Platform — Feature Implementation

## What was built

This PR implements the full HRIS platform as specified in the technical assessment:

### Part 1 — Foundation
- React SPA scaffolded with Create React App, deployed to Vercel
- Firebase project configured with Auth, Firestore, and Storage
- Firebase Auth with Custom Claims-based RBAC (`employer` and `admin` roles)
- Custom Claims set exclusively via Firebase Admin SDK in Cloud Functions — never stored in Firestore
- Protected routes in React gated by role from decoded JWT token
- Password reset via Firebase Auth's built-in `sendPasswordResetEmail`
- Production-grade Firestore Security Rules (`firestore.rules`) — each rule block annotated with the attack it prevents
- Storage Security Rules (`storage.rules`) — same annotation style
- All Firebase config stored in Vercel environment variables, never hardcoded

### Part 2 — Features
- Full employee CRUD with Firestore real-time listeners
- Document upload with client-side PDF/size validation, Storage path convention enforced
- Firestore metadata written after successful upload; Cloud Function triggers on that write
- SendGrid email notification via Cloud Function — API key in Firebase Functions config only, never in client bundle
- Automated Firestore backup setup documented in README (Cloud Scheduler + Firestore export API)

### Part 3 — Docs & Security
- README written design-first: data model documented before any code
- Architecture diagram, ER diagram source (Mermaid), auth flow, file lifecycle all documented
- Security audit section covering auth, authorisation, secrets, and known gaps
- Honest gaps section: MFA, signed URL expiry, National ID encryption, E2E tests

## Key architectural decisions

**Custom Claims over Firestore roles:** Role is embedded in the Firebase JWT, signed by Google. Cannot be self-assigned by modifying a Firestore document. Verified server-side by Security Rules on every request.

**Top-level collections over subcollections:** Simpler Security Rules surface, standard query patterns, no Collection Group query needed for cross-employee lookups per employer. Full justification in README § Data Model Design.

**No public download URLs stored:** `getDownloadURL()` is called at download time with the user's auth token attached. The Firebase Storage URL returned is authenticated, not a permanent public link. Storage Security Rules verify ownership before issuing it.

**Cloud Function for email:** SendGrid API key lives only in Firebase Functions config — never in the React bundle. The trigger fires on Firestore `onCreate`, so it cannot be bypassed by client code.

## What is incomplete

- MFA enrollment UI (data model and auth foundation support it — just no UI flow)
- Signed URL Cloud Function endpoint (documented; Storage access is still auth-gated via SDK token)
- National ID field-level encryption (documented as known gap with Cloud KMS fix)
- E2E test suite (no Playwright/Cypress tests)

See README § Honest Gaps for production risk assessment and remediation steps.

## Testing

- Firebase Emulator Suite runs locally: `firebase emulators:start`
- Set `REACT_APP_USE_EMULATOR=true` in `.env.local` to point the SDK at local emulators
- Auth, Firestore, Storage, and Functions all emulated locally

## Checklist

- [ ] No secrets in codebase or commit history
- [ ] `.env.example` committed with placeholder values
- [ ] `.env.local` is gitignored
- [ ] `firestore.rules` committed and deployable via Firebase CLI
- [ ] `storage.rules` committed and deployable via Firebase CLI
- [ ] `firestore.indexes.json` committed
- [ ] PR is not merged
- [ ] Vercel deployment URL is live

---

Do not merge this PR. Review against the open branch.
