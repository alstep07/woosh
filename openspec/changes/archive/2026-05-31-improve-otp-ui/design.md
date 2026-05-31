## Context

`sdk.verifyOtp()` opens Circle's hosted OTP iframe synchronously. It requires the SDK to have been configured with `updateConfigs` first (tokens must be set). Both `handleSendOtp` (signup) and `handleWooshSendOtp` (payment form) already call `updateConfigs` before setting the step — so calling `verifyOtp()` right after is safe.

The "verify" step UI previously existed only to hold the button that triggered `verifyOtp()`. With auto-trigger, that step becomes a passive waiting state the user sees for a fraction of a second while the Circle modal loads.

## Goals / Non-Goals

**Goals:**
- Zero extra clicks between "send code" and the OTP input appearing
- If the modal closes without success (user dismisses or times out), user can re-open it with a single button
- Consistent fix in both signup and Woosh payment flows

**Non-Goals:**
- Custom OTP input field (Circle controls that UI)
- Changing the email step or wallet creation step
- Any backend changes

## Decisions

### Auto-trigger placement

Call `sdkRef.current.verifyOtp()` at the end of `handleSendOtp` / `handleWooshSendOtp`, after `updateConfigs` and `setStep("verify")`. Using `setTimeout(..., 0)` is not needed — `verifyOtp()` is non-blocking and opens the iframe asynchronously.

### Verify step UI after auto-trigger

Replace the "Enter verification code" button with:
- A spinner or static message: "Check your inbox — a code entry window should open automatically."
- A secondary "Re-open code entry" button (calls `verifyOtp()` again) for users who dismissed the modal

### Error recovery

If `verifyOtp()` fails (SDK fires the login callback with an error), existing error handling already sets `wooshError` / `error` and returns to the verify step. The "Re-open" button lets them retry without re-sending the email.
