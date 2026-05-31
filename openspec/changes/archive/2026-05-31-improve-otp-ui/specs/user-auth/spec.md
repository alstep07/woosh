## MODIFIED Requirements

### Requirement: OTP modal opens automatically after code is sent
After a successful OTP request, the Circle OTP modal SHALL open automatically without requiring an additional button click.

#### Scenario: Code sent successfully
- **WHEN** user submits their email and the OTP API call succeeds
- **THEN** Circle's OTP code-entry modal opens immediately, with no intermediate screen requiring a button click

#### Scenario: User dismisses the modal
- **WHEN** Circle's OTP modal is closed by the user before entering a code
- **THEN** a "Re-open code entry" button is visible so the user can reopen the modal without re-sending the email

#### Scenario: Verify step is a waiting state
- **WHEN** the OTP has been sent and the modal has not yet resolved
- **THEN** the verify step shows a message like "Check your inbox" and the re-open button, not a primary CTA button
