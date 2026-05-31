## ADDED Requirements

### Requirement: Sign-in shortcut on landing page
The landing page SHALL display a "Sign in" link for users who already have a `woosh_session` in localStorage.

#### Scenario: Returning user visits landing page
- **WHEN** user visits `/` and `woosh_session` exists in localStorage
- **THEN** a "Go to dashboard →" link is visible in the nav or hero area

#### Scenario: New user visits landing page
- **WHEN** user visits `/` and no `woosh_session` exists
- **THEN** only the "Sign up" CTA is shown; no sign-in prompt is displayed

### Requirement: Sign-in shortcut on signup page
The signup page SHALL display an "Already have an account?" link that navigates to `/dashboard` when a session exists, or explains there is no separate login flow.

#### Scenario: Returning user visits /signup
- **WHEN** user with existing `woosh_session` visits `/signup`
- **THEN** page shows a "You're already signed in — go to your dashboard" prompt with a link to `/dashboard`

#### Scenario: User without session visits /signup
- **WHEN** no `woosh_session` exists
- **THEN** standard signup form is shown; no "already signed in" prompt appears

### Requirement: No separate login page required
V1 SHALL NOT add a dedicated `/login` route. Returning users are identified by `woosh_session` in localStorage. The OTP signup flow doubles as login for new devices.

#### Scenario: User on new device
- **WHEN** user visits `/signup` on a new device without localStorage session
- **THEN** they complete the standard OTP flow which recreates their session
