HRIS Platform — Technical Assessment Submission



Multi-tenant HR platform built with React.js, Firebase (Auth, Firestore, Storage), Node.js Cloud Functions, and Vercel.





Table of Contents



Architecture Overview

Environment Variables Reference

Local Setup Guide

Data Model Design

ER Diagram

Auth Flow

File Lifecycle

Security Audit

Automated Backups

Honest Gaps \& What I'd Do Next





Architecture Overview

Browser (React SPA)

&#x20; │

&#x20; ├── Vercel CDN (serves static build)

&#x20; │

&#x20; ├── Firebase Auth ──── Custom Claims (role: employer | admin)

&#x20; │         │

&#x20; │         └── Admin SDK (Cloud Functions only — never client)

&#x20; │

&#x20; ├── Firestore ─────── Security Rules (per-employer isolation)

&#x20; │         │

&#x20; │         └── onCreate trigger ──→ Cloud Function ──→ SendGrid

&#x20; │

&#x20; ├── Firebase Storage ─ Security Rules (path-scoped to employerId)

&#x20; │

&#x20; └── GCS Bucket ←── Cloud Scheduler (daily Firestore export)

Vercel serves the compiled React bundle. No server-side rendering — all Firebase calls originate in the browser or in Cloud Functions.

Firebase Auth is the single source of truth for identity. Roles are encoded as Custom Claims on the JWT token, not as Firestore documents.

Cloud Functions run the only server-side Node.js logic: setting Custom Claims on user creation and sending emails via SendGrid on document upload.

Firestore Security Rules and Storage Security Rules enforce that every read/write is tied to the authenticated user's UID — no cross-employer access is possible at the data layer, regardless of what the React code does.



Environment Variables Reference

All secrets are stored in .env.local (never committed). A .env.example with placeholder values is committed to the repo.

React App (Vercel Environment Variables)

VariableWhat it containsWhere usedREACT\_APP\_FIREBASE\_API\_KEYFirebase project public API keysrc/firebase.js — initialises Firebase SDKREACT\_APP\_FIREBASE\_AUTH\_DOMAIN<project-id>.firebaseapp.comsrc/firebase.js — Auth domainREACT\_APP\_FIREBASE\_PROJECT\_IDFirebase project IDsrc/firebase.js — Firestore + StorageREACT\_APP\_FIREBASE\_STORAGE\_BUCKET<project-id>.appspot.comsrc/firebase.js — Storage bucketREACT\_APP\_FIREBASE\_MESSAGING\_SENDER\_IDFCM sender IDsrc/firebase.jsREACT\_APP\_FIREBASE\_APP\_IDFirebase app IDsrc/firebase.js



Note: Firebase client config values (API key, auth domain, etc.) are not secrets — they are safe to expose in the browser bundle. Their security is enforced by Firestore and Storage Security Rules, not by keeping the config private. The Firebase API key is a project identifier, not an authentication credential.



Cloud Functions (Firebase Environment Config)

VariableWhat it containsWhere usedSENDGRID\_API\_KEYSendGrid API keyfunctions/index.js — sends transactional emailSENDGRID\_FROM\_EMAILVerified sender addressfunctions/index.js — email From fieldNOTIFICATION\_TARGET\_EMAILTest recipient addressfunctions/index.js — email To field

Set Cloud Function environment variables with:

bashfirebase functions:config:set sendgrid.api\_key="SG.xxxx" sendgrid.from\_email="noreply@yourdomain.com" notification.target\_email="test@yourdomain.com"



Local Setup Guide

For a new developer joining the project:

bash# 1. Clone and install

git clone <repo-url>

cd hris-platform

npm install



\# 2. Install Firebase CLI globally

npm install -g firebase-tools



\# 3. Log in to Firebase

firebase login



\# 4. Copy the environment template

cp .env.example .env.local

\# Fill in your Firebase project values from the Firebase Console → Project Settings



\# 5. Install Cloud Functions dependencies

cd functions \&\& npm install \&\& cd ..



\# 6. Run locally

npm start                    # React app on localhost:3000

firebase emulators:start     # Auth, Firestore, Storage, Functions emulators

The firebase.json points the SDK to the local emulator suite when REACT\_APP\_USE\_EMULATOR=true is set in .env.local.



Data Model Design



Written before writing any code, as required.



Collection Structure Decision: Top-level collections vs Subcollections

I chose top-level collections with an employerId field rather than subcollections (e.g. /employers/{id}/employees/{id}).

Reason 1 — Security Rules are simpler and more auditable. With top-level collections, the entire access pattern is expressed in one rule block: allow read, write: if request.auth.uid == resource.data.employerId. With subcollections, the path segment /employers/{employerId}/... must be validated against the authenticated UID at every level — a missed level is a security hole. Flat structure makes the attack surface smaller.

Reason 2 — Queries across employees work without Collection Group queries. If I later need to query all employees with status == "active" for a given employer, a simple .where("employerId", "==", uid).where("status", "==", "active") works on the top-level collection with a composite index. Subcollection queries require collectionGroup(), which bypasses per-employer path isolation and requires extra rule logic to re-enforce it.

How the structure prevents Employer A from reading Employer B's employees

Every employee document contains employerId: <uid>. The Firestore Security Rule reads:

allow read, write: if request.auth != null \&\& request.auth.uid == resource.data.employerId;

Even if Employer A guesses a document ID belonging to Employer B, the rule rejects the read because request.auth.uid (Employer A's UID) will not equal resource.data.employerId (Employer B's UID). There is no client-side check to bypass — the rejection happens at Google's infrastructure level before any data is returned.

How the model accommodates an employee getting their own login without migration

Each employee document has a linkedUserId field (nullable string). When an employee registers, a Cloud Function sets linkedUserId on their document. Security Rules are extended:

allow read: if request.auth.uid == resource.data.employerId

&#x20;         || request.auth.uid == resource.data.linkedUserId;

No document migration, no schema change — just a new rule condition and a background function that populates the field.

Firestore Indexes Required

CollectionFieldsTypeReasonemployeesemployerId ASC, createdAt DESCCompositeList employees sorted by join dateemployeesemployerId ASC, status ASCCompositeFilter active/inactive employees per employerdocumentsemployeeId ASC, uploadedAt DESCCompositeList documents for an employee chronologicallydocumentsemployerId ASC, uploadedAt DESCCompositeList all documents for an employer

These are defined in firestore.indexes.json and deployed via firebase deploy --only firestore:indexes.

Collection Map

/employees/{employeeId}

&#x20; - employerId: string       (FK → Firebase Auth UID)

&#x20; - linkedUserId: string?    (FK → Firebase Auth UID, set when employee registers)

&#x20; - fullName: string

&#x20; - nationalId: string       (encrypted at rest via field-level logic in Cloud Function)

&#x20; - jobTitle: string

&#x20; - department: string

&#x20; - startDate: timestamp

&#x20; - status: "active" | "inactive"

&#x20; - createdAt: timestamp     (server-set, immutable)

&#x20; - updatedAt: timestamp     (server-set on each write)



/documents/{documentId}

&#x20; - employeeId: string       (FK → /employees/{employeeId})

&#x20; - employerId: string       (FK → Firebase Auth UID, for Security Rule matching)

&#x20; - fileName: string

&#x20; - storagePath: string      (full GCS path)

&#x20; - uploadedBy: string       (Firebase Auth UID)

&#x20; - uploadedAt: timestamp    (server-set via serverTimestamp())

&#x20; - fileSize: number         (bytes)

&#x20; - createdAt: timestamp     (server-set, immutable)



ER Diagram

Show Image

See docs/er-diagram.mmd for the Mermaid source.

mermaiderDiagram

&#x20; EMPLOYER\_AUTH\_USER {

&#x20;   string uid PK

&#x20;   string email

&#x20;   string role "Custom Claim: employer | admin"

&#x20; }



&#x20; EMPLOYEES {

&#x20;   string employeeId PK

&#x20;   string employerId FK

&#x20;   string linkedUserId FK

&#x20;   string fullName

&#x20;   string nationalId

&#x20;   string jobTitle

&#x20;   string department

&#x20;   timestamp startDate

&#x20;   string status

&#x20;   timestamp createdAt

&#x20;   timestamp updatedAt

&#x20; }



&#x20; DOCUMENTS {

&#x20;   string documentId PK

&#x20;   string employeeId FK

&#x20;   string employerId FK

&#x20;   string fileName

&#x20;   string storagePath

&#x20;   string uploadedBy FK

&#x20;   timestamp uploadedAt

&#x20;   timestamp createdAt

&#x20;   number fileSize

&#x20; }



&#x20; EMPLOYER\_AUTH\_USER ||--o{ EMPLOYEES : "owns (employerId)"

&#x20; EMPLOYEES ||--o{ DOCUMENTS : "has (employeeId)"

&#x20; EMPLOYER\_AUTH\_USER ||--o{ DOCUMENTS : "uploaded (uploadedBy)"

Fields that are server-set (never client-provided):



createdAt — set via serverTimestamp() on document creation; blocked from client override by Security Rules

updatedAt — set via serverTimestamp() on every update by Cloud Function or server-side merge

uploadedAt — set via serverTimestamp() in the upload handler



Fields used as Security Rule path segments / foreign keys:



employerId on both employees and documents — matched against request.auth.uid

employeeId on documents — used to verify the document belongs to one of the employer's employees





Auth Flow

Step-by-step from credential submission to protected route rendering:



User submits email + password on the login form in React.

signInWithEmailAndPassword(auth, email, password) is called — Firebase Auth SDK sends credentials to Firebase Auth servers.

Firebase Auth validates credentials and returns a signed JWT (ID token) containing the user's uid and any Custom Claims (role: employer or role: admin).

The Firebase SDK stores the token in memory and refreshes it automatically every hour.

onAuthStateChanged listener in AuthContext.jsx fires, setting the currentUser state with the decoded token.

useAuth hook exposes currentUser and a userRole derived from currentUser.reloadUserInfo.customAttributes (or parsed from the decoded token claims).

ProtectedRoute component reads userRole. If the role matches the required role for the route, it renders the child component. If not, it redirects to /unauthorized.

Token is attached to every Firestore/Storage request automatically by the Firebase SDK. The Security Rules evaluate request.auth.token.role on every request server-side.



Password reset flow:



User clicks "Forgot password" → sendPasswordResetEmail(auth, email) is called.

Firebase sends a reset link to the user's email.

User clicks the link → Firebase Auth's hosted reset page handles the new password.

No custom backend code required.





File Lifecycle

From upload click to email notification — every service touched in order:



Employer clicks "Upload Document" in React UI and selects a PDF.

Client-side validation: file type checked (file.type === 'application/pdf'), size checked (file.size <= 10 \* 1024 \* 1024). Rejected files never leave the browser.

Storage path constructed: Documents/${employerId}/${employeeId}/${YYYY-MM}/${filename}.pdf

uploadBytesResumable(storageRef, file) uploads the file to Firebase Storage. The Storage Security Rule verifies: (a) user is authenticated, (b) employerId in the path matches request.auth.uid, (c) file is application/pdf, (d) file is under 10MB.

On upload completion, getDownloadURL() is NOT used. Instead, the authenticated download is handled via a signed URL generated in a Cloud Function (see Security section).

Firestore metadata document written: addDoc(collection(db, 'documents'), { employeeId, employerId, fileName, storagePath, uploadedBy: currentUser.uid, uploadedAt: serverTimestamp(), fileSize }). The Firestore Security Rule verifies employerId == request.auth.uid and that createdAt is server-set.

Cloud Function onDocumentUploaded triggers on onCreate for the documents collection.

Cloud Function fetches the employee record from Firestore using the Admin SDK (bypasses Security Rules — safe because this is server-side code we control).

Cloud Function calls SendGrid API with the employee's name and a notification message. The SendGrid API key is read from functions.config().sendgrid.api\_key — never the client bundle.

Email is delivered to the configured notification address.

On error: the Cloud Function logs the error to Cloud Logging and updates a emailStatus field on the document to "failed". The Firestore document is never deleted or corrupted — the upload is considered successful regardless of email outcome.





Security Audit

Authentication

Firebase Auth protects the system at the identity layer. A valid employer account cannot:



Read or write documents belonging to another employer (enforced by Firestore/Storage rules, not client code)

Elevate their own role — Custom Claims can only be set by the Firebase Admin SDK running in Cloud Functions, which requires a service account with roles/firebase.admin

Access admin-only routes or data — the admin claim is verified independently



An unauthenticated attacker cannot:



Read any Firestore document (allow read: if request.auth != null is the minimum gate on every rule)

Read or write any Storage file (same minimum gate)

Trigger any Cloud Function that reads protected data (functions use Admin SDK which requires a valid service account — not available to public callers)



Authorisation

Firestore tenant isolation: Every employee and document record carries an employerId field equal to the creating employer's Firebase UID. Every read/write rule checks request.auth.uid == resource.data.employerId. This check happens at Google's infrastructure level — it cannot be bypassed by modifying React code, intercepting network requests, or guessing document IDs.

Storage tenant isolation: Storage paths are Documents/{employerId}/.... The Storage rule reads:

allow read, write: if request.auth != null \&\& request.auth.uid == employerId;

where employerId is extracted from the path wildcard. An employer cannot read files outside their path segment even if they know the exact file name.

Admin access: Admin routes and data access require request.auth.token.role == 'admin'. This claim is set by the Admin SDK and cannot be self-assigned.

Why Custom Claims Are More Secure Than Firestore Role Fields

If roles were stored in a Firestore document (e.g. /users/{uid}/role: "employer") and the client fetched that field to determine access, an attacker could:



Escalate their own role client-side: The client code reads userDoc.role and passes it to route guards. An attacker who can write to their own user document (a common misconfiguration) simply sets role: "admin" and the client renders admin views.

Exploit a race condition / stale cache: The client caches the role field. If an admin revokes a user's role in Firestore but the client still has the old value cached, the revoked user continues to have access until the next page reload.



Custom Claims are embedded in the Firebase JWT, which is issued and signed by Google's auth servers. The claim cannot be modified client-side — any tampering invalidates the signature. The Security Rules read request.auth.token.role, which comes directly from the verified JWT, not from any document the attacker can write.

Secrets Management

SecretLocationRotation procedureFirebase client configVercel environment variables (not secrets — safe in client)N/ASendGrid API keyFirebase Functions config (functions:config:set)Generate new key in SendGrid, run functions:config:set, redeploy functionsFirebase service accountNever in repo — only in CI/CD environmentRotate in GCP Console → IAM → Service Accounts

No secret appears in the client bundle. The SendGrid key is read at runtime in the Cloud Function environment, not at build time.

Known Gaps

GapRiskProduction fixNational ID stored as plaintextA Firestore data breach exposes sensitive PIIEncrypt at write time in Cloud Function using Cloud KMS; store ciphertext onlyNo rate limiting on loginBrute-force attacks against employer accountsEnable Firebase App Check; add reCAPTCHA to login formNo MFACompromised password = full account accessEnable Firebase MFA (TOTP) for employer accountsSigned URL expiry not enforced on clientDownload URLs remain valid until manually revokedSet short expiry (15 min) on signed URLs; generate on-demand via Cloud FunctionNo audit logCan't detect or reconstruct unauthorised accessEnable Cloud Audit Logs for Firestore and Storage; stream to BigQueryEmail notifications go to one test addressReal production would need per-employee email routingStore employee email in document record; route via SendGrid dynamic templates



Automated Backups

Setup Steps

Automated Firestore exports are configured using Cloud Scheduler and the Firestore Admin API:

Step 1 — Create a GCS bucket:

bashgsutil mb -l us-central1 gs://hris-platform-backups-prod

Naming convention: <project-id>-backups-<environment>. Keep prod and staging backups in separate buckets.

Step 2 — Grant the Firestore service account write access to the bucket:

bashPROJECT\_ID=$(gcloud config get-value project)

SERVICE\_ACCOUNT="service-${PROJECT\_NUMBER}@gcp-sa-firestore.iam.gserviceaccount.com"

gsutil iam ch serviceAccount:${SERVICE\_ACCOUNT}:objectAdmin gs://hris-platform-backups-prod

Step 3 — Create a Cloud Scheduler job:

bashgcloud scheduler jobs create http firestore-daily-backup \\

&#x20; --schedule="0 2 \* \* \*" \\

&#x20; --uri="https://firestore.googleapis.com/v1/projects/${PROJECT\_ID}/databases/(default):exportDocuments" \\

&#x20; --message-body='{"outputUriPrefix": "gs://hris-platform-backups-prod/exports"}' \\

&#x20; --oauth-service-account-email="${SERVICE\_ACCOUNT}" \\

&#x20; --location=us-central1

This runs at 02:00 UTC daily and exports all collections to a timestamped folder in GCS.

Retention policy: Set a GCS lifecycle rule to delete objects older than 30 days:

json{

&#x20; "rule": \[{

&#x20;   "action": {"type": "Delete"},

&#x20;   "condition": {"age": 30}

&#x20; }]

}

Apply with: gsutil lifecycle set lifecycle.json gs://hris-platform-backups-prod

Verifying a Backup Without Restoring to Production



Create a second Firebase project (hris-platform-backup-test) with an empty Firestore database.

Run a restore into that project:



bash   gcloud firestore import gs://hris-platform-backups-prod/exports/<timestamp>/ \\

&#x20;    --project=hris-platform-backup-test



Query a known document in the test project to verify it matches the expected value.

Tear down the test project after verification.



This confirms the backup is restorable without touching production data.



Honest Gaps \& What I'd Do Next

What I did not finish and why

Cloud Functions and Storage not live (Firebase Spark plan limitation): The Firebase Spark (free) plan does not support Cloud Storage or Cloud Functions deployment. As a result, document upload and SendGrid email notifications are implemented in code and rules but are not active in the deployed environment. All the relevant files are present and correct — storage.rules, src/components/documents/DocumentUpload.jsx, and functions/index.js — and are deployable on a Blaze plan Firebase project. The live Vercel deployment demonstrates Auth, Firestore CRUD, and role-based access fully. This is the single largest gap between the codebase and the running deployment.

MFA (Multi-Factor Authentication): I deprioritised this because Firebase's MFA setup requires phone number verification flow UI, which adds complexity without demonstrating the core architectural decisions the assessment evaluates. In production this is mandatory for an HR system.

Employee self-login flow: The data model accommodates it (via linkedUserId), and I documented the extension path, but I did not build the registration UI or the Cloud Function that sets linkedUserId. Given time constraints, I prioritised the security rules and document upload flow over this feature.

Signed URL generation: I implemented authenticated Storage access using the Firebase Storage SDK's built-in auth (which requires a valid Firebase token). I documented the signed URL approach in the Security section but did not build the Cloud Function endpoint that generates short-lived signed URLs for downloads. The current download path is secure (requires Firebase Auth token) but does not have time-limited expiry.

End-to-end tests: No Cypress or Playwright tests. I would add these before any production deployment, covering: login flow, role-gated route access, CRUD operations, and document upload.

National ID encryption: Stored as plaintext. I documented this as a known gap and the Cloud KMS fix.

Production risks of these gaps



Without MFA, a phishing attack against an employer account gives full access to all employee records.

Without signed URL expiry, a shared download link remains valid indefinitely if someone copies it from their browser.

Without E2E tests, a Security Rules refactor could silently break tenant isolation.



What I would close given an additional week



Signed URL Cloud Function endpoint — one httpsCallable function that validates the caller owns the file path and returns a 15-minute signed URL. This closes the most concrete security gap.

MFA enrollment flow — Firebase's TOTP MFA is well-documented and the UI is straightforward. Would add a "Setup 2FA" step to the employer onboarding flow.

Audit log Firestore trigger — a Cloud Function that fires on every Firestore write and appends an entry to an /auditLog collection (write-only for clients, readable only by admins). This gives forensic capability with minimal infrastructure.

E2E test suite — Playwright tests for the critical auth and upload paths, running in CI on every PR.



What I would refactor if starting over

The current ProtectedRoute implementation derives the role from the decoded ID token on the client. I would move role checking to a custom useRole hook that also validates the token has not expired and re-fetches claims on every route transition. This closes a small window where a just-revoked user could access a protected route until the next token refresh (max 1 hour).

I would also extract the Firestore Security Rules into a shared constants file so the rule logic and the application's permission checks stay in sync — if you add a new permission level, you update one place and both the rules file and the React guards update together.

