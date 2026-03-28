const functions = require('firebase-functions');
const admin = require('firebase-admin');
const sgMail = require('@sendgrid/mail');

admin.initializeApp();

// ---------------------------------------------------------------------------
// setEmployerRole
// Called immediately after a new user is created via Firebase Auth.
// Sets the 'employer' Custom Claim on the user's JWT so that Security Rules
// can enforce role-based access without trusting any client-readable field.
//
// Why a Cloud Function and not client-side code:
// Setting Custom Claims requires the Firebase Admin SDK, which uses a service
// account with elevated privileges. The service account credential must never
// be in the client bundle. Only server-side code in a trusted environment
// (Cloud Functions) can set claims.
// ---------------------------------------------------------------------------
exports.setEmployerRole = functions.auth.user().onCreate(async (user) => {
  try {
    await admin.auth().setCustomUserClaims(user.uid, { role: 'employer' });
    functions.logger.info(`Set employer role for user ${user.uid}`);
  } catch (error) {
    functions.logger.error('Failed to set employer role', { uid: user.uid, error });
  }
});

// ---------------------------------------------------------------------------
// setAdminRole
// HTTP callable function — only an existing admin can invoke this to promote
// another user. Protected by verifying the caller's Custom Claim server-side.
// ---------------------------------------------------------------------------
exports.setAdminRole = functions.https.onCall(async (data, context) => {
  // Verify the caller is already an admin. We check the token claim, not a
  // Firestore field, so the caller cannot spoof their own role.
  if (!context.auth || context.auth.token.role !== 'admin') {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only admins can promote other users.'
    );
  }

  const { targetUid } = data;
  if (!targetUid) {
    throw new functions.https.HttpsError('invalid-argument', 'targetUid is required.');
  }

  try {
    await admin.auth().setCustomUserClaims(targetUid, { role: 'admin' });
    functions.logger.info(`Promoted user ${targetUid} to admin by ${context.auth.uid}`);
    return { success: true };
  } catch (error) {
    functions.logger.error('Failed to set admin role', { targetUid, error });
    throw new functions.https.HttpsError('internal', 'Failed to set admin role.');
  }
});

// ---------------------------------------------------------------------------
// onDocumentUploaded
// Triggered when a new document metadata record is written to Firestore.
// Sends a transactional email via SendGrid notifying that a document is ready.
//
// Why this must live in a Cloud Function (not the React frontend):
// 1. The SendGrid API key would be exposed in the client JavaScript bundle,
//    allowing any user who opens DevTools to extract it and send unlimited
//    emails from our verified domain — spam, phishing, reputation damage.
// 2. Client-side code can be bypassed entirely. A Cloud Function trigger fires
//    on every Firestore write regardless of what the client does — it cannot
//    be suppressed by a malicious client modifying or skipping the sendEmail()
//    call in the React code.
//
// Error handling: a failed email logs the error and updates the document's
// emailStatus field, but does NOT throw — a failed notification should never
// corrupt the document record or cause the function to retry infinitely.
// ---------------------------------------------------------------------------
exports.onDocumentUploaded = functions.firestore
  .document('documents/{documentId}')
  .onCreate(async (snap, context) => {
    const docData = snap.data();
    const { employeeId, employerId, fileName } = docData;

    // Read SendGrid config from Firebase environment (never hardcoded).
    const apiKey = functions.config().sendgrid.api_key;
    const fromEmail = functions.config().sendgrid.from_email;
    const toEmail = functions.config().notification.target_email;

    if (!apiKey || !fromEmail || !toEmail) {
      functions.logger.error('SendGrid config missing — check firebase functions:config:set');
      await snap.ref.update({ emailStatus: 'config_error' });
      return null;
    }

    sgMail.setApiKey(apiKey);

    // Fetch the employee record using the Admin SDK (bypasses Security Rules
    // safely — this is trusted server-side code, not a client request).
    let employeeName = 'the employee';
    try {
      const employeeSnap = await admin.firestore()
        .collection('employees')
        .doc(employeeId)
        .get();

      if (employeeSnap.exists) {
        employeeName = employeeSnap.data().fullName || 'the employee';
      }
    } catch (fetchError) {
      // Non-fatal: log but continue with generic name.
      functions.logger.warn('Could not fetch employee name', { employeeId, fetchError });
    }

    const msg = {
      to: toEmail,
      from: fromEmail,
      subject: `New document available for ${employeeName}`,
      text: [
        `A new document has been uploaded for ${employeeName}.`,
        `File: ${fileName}`,
        `You can log in to the HRIS platform to view and download the document.`,
      ].join('\n\n'),
      html: `
        <p>A new document has been uploaded for <strong>${employeeName}</strong>.</p>
        <p><strong>File:</strong> ${fileName}</p>
        <p>Log in to the HRIS platform to view and download the document.</p>
      `,
    };

    try {
      await sgMail.send(msg);
      functions.logger.info('Notification email sent', { employeeId, fileName });
      await snap.ref.update({ emailStatus: 'sent' });
    } catch (emailError) {
      // Log but do not re-throw — the document upload itself succeeded.
      // Re-throwing would mark the function as failed and trigger retries,
      // potentially causing duplicate emails.
      functions.logger.error('SendGrid send failed', {
        employeeId,
        fileName,
        error: emailError.message,
        statusCode: emailError.response?.status,
      });
      await snap.ref.update({ emailStatus: 'failed' });
    }

    return null;
  });
