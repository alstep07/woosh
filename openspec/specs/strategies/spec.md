# strategies Specification

## Purpose
`WooshStrategyRegistry`-backed recurring USDC payments (`Kind.Payment`) and
dollar-cost-averaging auto-buys (`Kind.DCA`), executed by the shared DCW executor on a
cron schedule.
## Requirements
### Requirement: Trustless recurring payment execution
For Kind.Payment strategies, the contract SHALL forward `amountPerPeriod` directly from
its own balance to `recipient` when due; the executor SHALL only pay gas to trigger the
transfer and SHALL never custody the funds.

#### Scenario: Due payment executes
- **WHEN** a Payment strategy is Active, `block.timestamp >= nextRunAt`, and
  `balance >= amountPerPeriod`
- **THEN** the executor's `executePayment(id)` call advances `periodsDone`/`nextRunAt`
  and transfers `amountPerPeriod` directly from contract balance to `recipient`

### Requirement: DCA release is bounded to exactly one period
`releaseForSwap` SHALL send exactly one period's USDC to the executor and advance the
schedule (`periodsDone`, `nextRunAt`) atomically in the same call, so a misbehaving
executor can never draw more than the schedule allows.

#### Scenario: Release before swap
- **WHEN** a DCA strategy is due
- **THEN** `releaseForSwap(id)` decrements `balance` by `amountPerPeriod`, advances the
  schedule, and pays `amountPerPeriod` to the executor before any swap occurs

### Requirement: DCA output delivered straight to the owner
After release, the executor SHALL swap the released USDC via Synthra SynRoute with the
strategy owner as the swap recipient, never holding the output token itself.

#### Scenario: Successful DCA swap
- **WHEN** `releaseForSwap` succeeds and the SynRoute quote is valid
- **THEN** the swap executes with the strategy owner as the output recipient, and the
  executor never custodies the purchased token

### Requirement: Refund on failed DCA swap
If the swap fails after funds were released, the executor SHALL refund the released
amount back to the owner, converting the 18-decimal native amount to 6-decimal ERC-20
units for the transfer.

#### Scenario: Swap throws after release
- **WHEN** the swap step throws after a successful `releaseForSwap`
- **THEN** the executor sends `amountPerPeriod / 1e12` USDC (6-decimal ERC-20) back to
  the owner via the precompile

### Requirement: USDC dual decimal representation
Native Arc USDC SHALL be treated as 18 decimals; any transfer through the ERC-20
precompile SHALL divide the native amount by `1e12` first.

#### Scenario: Zero after truncation aborts
- **WHEN** a released amount truncates to zero ERC-20 units after the `1e12` division
- **THEN** the refund is aborted rather than attempting a zero-value transfer

### Requirement: Cron authorization and idempotent, time-boxed execution
The cron endpoint SHALL require a bearer token matching `CRON_SECRET`, SHALL page
through strategies, and SHALL stop scanning once a time budget is reached, leaving
remaining due strategies for the next invocation without risk of double-execution.

#### Scenario: Missing or wrong secret
- **WHEN** a request lacks a matching bearer token
- **THEN** the endpoint returns HTTP 401

#### Scenario: Time budget exceeded mid-scan
- **WHEN** the elapsed time in a cron run reaches the time budget while strategies
  remain due
- **THEN** the loop stops and reports `timedOut: true`, and on-chain `nextRunAt` state
  ensures no strategy is executed twice

### Requirement: Executor is a single shared DCW, authorized onchain
The executor SHALL be a Circle Developer-Controlled Wallet requiring no PIN, and the
contract SHALL enforce that only the admin-registered executor address can call
`executePayment` or `releaseForSwap`.

#### Scenario: Non-executor call rejected
- **WHEN** an address other than the registered executor calls `executePayment` or
  `releaseForSwap`
- **THEN** the transaction reverts

### Requirement: Depleted strategies auto-recover on funding
Running out of balance (without reaching `periodsTotal`) SHALL set status to
`Depleted`, a recoverable state; `fund()` SHALL flip it back to `Active` once balance
covers another period.

#### Scenario: Fund recovers a depleted strategy
- **WHEN** a Depleted strategy's owner calls `fund(id)` with enough value that
  `balance >= amountPerPeriod`
- **THEN** status becomes `Active`, and if `nextRunAt` was in the past it resets to now

### Requirement: Owner-gated pause, resume, and cancel
`pause`, `resume`, and `cancel` SHALL be restricted to the strategy owner. `cancel`
SHALL refund the full remaining balance to the owner and mark the strategy terminally
`Cancelled`.

#### Scenario: Cancel refunds remaining balance
- **WHEN** the owner calls `cancel(id)` on an Active, Paused, or Depleted strategy
- **THEN** the remaining balance is zeroed and sent back to the owner in the same
  transaction, and status becomes `Cancelled`

