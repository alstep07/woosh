## Why

After sending the OTP email, the user sees an intermediate "Check your email" screen with a button labeled "Enter verification code." Clicking it opens Circle's OTP modal — but there is no reason for that extra click. The modal should open automatically the moment the code is sent, matching what every OTP flow the user has ever seen does.

## What Changes

- **Fix**: In `app/signup/page.tsx`, call `sdk.verifyOtp()` immediately after `sdk.updateConfigs()` instead of waiting for a button click; replace the "verify" step UI with a minimal waiting state
- **Fix**: Same pattern in `app/pay/[slug]/PaymentForm.tsx` Woosh payment flow — auto-open Circle's modal after OTP is sent
- **Fix**: If the modal is dismissed or errors, show a "Re-open code entry" button so the user isn't stuck

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `user-auth`: OTP verify step auto-triggers; intermediate button removed
- `payment-page`: Woosh OTP verify step auto-triggers; intermediate button removed

## Impact

- `app/signup/page.tsx` — auto-call `verifyOtp()` in `handleSendOtp`; replace verify step UI
- `app/pay/[slug]/PaymentForm.tsx` — same in `handleWooshSendOtp`
- No API, dependency, or config changes
