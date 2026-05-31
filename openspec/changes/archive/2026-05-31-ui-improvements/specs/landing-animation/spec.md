## ADDED Requirements

### Requirement: Animated hero background
The landing page hero section SHALL display a subtle animated background layer behind the headline and CTA — implemented with pure CSS (no JS animation library).

#### Scenario: Animation renders on load
- **WHEN** user opens the landing page
- **THEN** a grid of small dots or a mesh pattern is visible behind the hero text, slowly fading or pulsing

#### Scenario: Animation does not obscure content
- **WHEN** animation is active
- **THEN** all hero text, headline, and CTA button remain fully legible (animation layer has lower z-index and reduced opacity ≤ 0.3)

### Requirement: Reduced motion compliance
The animation SHALL be disabled when `prefers-reduced-motion: reduce` is detected.

#### Scenario: Reduced motion enabled
- **WHEN** user's OS has reduced motion preference set
- **THEN** background is static — no animation plays

### Requirement: No external animation dependency
The animation SHALL use only CSS `@keyframes` and Tailwind utilities — no Framer Motion, GSAP, or canvas.

#### Scenario: Build output
- **WHEN** project is built
- **THEN** no new animation npm package is added to `package.json`
