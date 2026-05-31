## 1. Signup Page — Auto-trigger OTP modal

- [x] 1.1 In `handleSendOtp` in `app/signup/page.tsx`, call `sdkRef.current.verifyOtp()` immediately after `sdk.updateConfigs(...)` (before or after `setStep("verify")` — both are fine since verifyOtp is non-blocking)
- [x] 1.2 Replace the "verify" step UI: remove the "Enter verification code" primary button; show "Check your inbox — a code entry window opened automatically." message instead
- [x] 1.3 Add a secondary "Re-open code entry" button in the verify step that calls `handleVerifyOtp()` (same as before), styled as a subtle link/secondary button

## 2. Payment Form — Auto-trigger OTP modal

- [x] 2.1 In `handleWooshSendOtp` in `app/pay/[slug]/PaymentForm.tsx`, call `sdkRef.current.verifyOtp()` immediately after `sdk.updateConfigs(...)` (before `setWooshStep("verify")`)
- [x] 2.2 Replace the Woosh "verify" step UI: remove the "Enter verification code" primary button; show "Check your inbox" message instead
- [x] 2.3 Add a "Re-open code entry" secondary button that calls `handleWooshVerifyOtp()`

## 3. QA

- [x] 3.1 Verify Circle OTP modal opens automatically after clicking "Send verification code" on signup page
- [x] 3.2 Verify Circle OTP modal opens automatically after submitting email in Woosh payment flow
- [x] 3.3 Verify "Re-open code entry" button appears and works if the modal is dismissed
