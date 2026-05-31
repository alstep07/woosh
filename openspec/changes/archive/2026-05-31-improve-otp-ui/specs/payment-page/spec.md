## MODIFIED Requirements

### Requirement: Woosh payment OTP modal opens automatically
After a successful OTP request in the Woosh payment flow, the Circle OTP modal SHALL open automatically without an extra button click.

#### Scenario: Woosh payment OTP sent
- **WHEN** user submits their email in the Woosh payment flow and the OTP API call succeeds
- **THEN** Circle's OTP modal opens immediately

#### Scenario: Modal dismissed during payment flow
- **WHEN** Circle's OTP modal is closed before code entry
- **THEN** a "Re-open code entry" button is shown so the user can retry without re-sending the email
