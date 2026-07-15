# portfolio-strategies Specification

## Purpose
`Kind.Portfolio` target-allocation strategies across USDC/EURC/cirBTC, funded either by
a custodied per-period deposit or by sweeping the wallet balance above a threshold.
## Requirements
### Requirement: Weighted leg allocation summing to 100%
A portfolio SHALL have up to 5 legs, each `(token, bps)` with `bps > 0`, summing to
exactly 10000. `token == address(0)` SHALL denote the USDC leg (kept, never swapped);
duplicate tokens SHALL be rejected, and at least one non-USDC leg SHALL be required.

#### Scenario: Weights don't sum to 100%
- **WHEN** `createPortfolio` is called with leg bps summing to 9999 or 10001
- **THEN** the transaction reverts `"WSR: weights != 100%"`

#### Scenario: All-USDC portfolio rejected
- **WHEN** every leg is the USDC leg (`address(0)`)
- **THEN** the transaction reverts `"WSR: all-USDC portfolio"`

### Requirement: Deposit mode splits release between owner and executor
In Deposit mode, `releaseForPortfolio` SHALL advance the schedule, then send the
USDC-leg share directly to the owner and only the swap-leg share to the executor.

#### Scenario: Partial USDC allocation release
- **WHEN** a Deposit portfolio with a 30% USDC leg and `amountPerPeriod=100` is due
- **THEN** the owner receives 30 USDC directly in the release transaction, and the
  executor receives 70 USDC to swap into the remaining legs

### Requirement: Sweep mode pulls funds under onchain threshold and cap enforcement
In Sweep mode, `sweepForPortfolio(id, amount6)` SHALL enforce that the pulled amount
does not exceed `amountPerPeriod` (the per-period cap) and that the owner's remaining
balance after the pull stays at or above `sweepThreshold`, before calling `transferFrom`
on the USDC precompile.

#### Scenario: Pull exceeds per-period cap
- **WHEN** the requested sweep amount converts to more than `amountPerPeriod`
- **THEN** the transaction reverts `"WSR: over cap"`

#### Scenario: Pull would breach the threshold
- **WHEN** pulling the requested amount would leave the owner's balance below
  `sweepThreshold`
- **THEN** the transaction reverts `"WSR: below threshold"`

### Requirement: One-time sweep allowance required before sweep strategies run
Before a Sweep-mode portfolio can execute, the owner SHALL grant a one-time max
allowance to the registry on the USDC ERC-20 precompile via a PIN-confirmed approve
transaction.

#### Scenario: Insufficient existing allowance at setup
- **WHEN** a user creates a Sweep portfolio and their existing registry allowance is
  below the sweep allowance floor
- **THEN** the create flow runs an approve-sweep PIN step before the create-strategy PIN
  step

### Requirement: Cron quotes every leg before moving any funds
The cron executor SHALL quote all legs of a due portfolio before releasing or pulling
any funds; if any leg has no viable swap route, the entire period SHALL be skipped with
no funds moved.

#### Scenario: One leg has no liquidity
- **WHEN** one of a portfolio's non-USDC legs has no swap route available
- **THEN** neither `releaseForPortfolio` nor `sweepForPortfolio` is called for that
  period, and the strategy is retried on the next cron tick

### Requirement: Failed leg swaps are refunded by exact amount
If a leg's swap fails after funds were released or pulled, the executor SHALL refund
exactly that leg's amount back to the owner, never inferring the refund from a wallet
balance scan.

#### Scenario: One of two legs fails to swap
- **WHEN** a EURC leg's swap throws but a cirBTC leg in the same portfolio succeeds
- **THEN** only the EURC leg's exact pulled or released amount is refunded to the
  owner, while the cirBTC leg's swap result stands

### Requirement: Sweep strategies hold no contract balance
Sweep-mode portfolios SHALL be excluded from balance-based operations: `fund()` SHALL
reject them, `resume()` SHALL skip the balance requirement for them, and the UI SHALL
hide the Fund action and balance display in favor of showing the per-period cap.

#### Scenario: Fund attempted on a sweep strategy
- **WHEN** a user attempts to call `fund()` on a Sweep-mode portfolio
- **THEN** the transaction reverts, since sweep strategies never hold contract balance

