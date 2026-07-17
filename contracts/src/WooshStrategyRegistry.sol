// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title WooshStrategyRegistry
/// @notice On-chain automated strategies: recurring USDC payments and DCA swaps.
///         This contract is the source of truth (no off-chain DB). It custodies the
///         strategy's native USDC budget and stores the schedule, so an off-chain
///         executor only has to read due strategies from the chain and trigger them.
///
///         Two kinds:
///         - Payment: the contract itself forwards `amountPerPeriod` to `recipient`
///           every `intervalSeconds`. Fully trustless once funded.
///         - Swap (DCA): the swap rail (Circle StableFX / App Kit) is not callable
///           from a contract, so on each period the contract releases `amountPerPeriod`
///           to the authorized executor, which performs the swap off-chain and forwards
///           the output token to the owner. The executor is a Woosh-controlled DCW
///           wallet; the release is bounded to one period at a time and the schedule is
///           advanced atomically, so a misbehaving executor can never pull more than the
///           schedule allows.
///
///         - Portfolio: a target allocation across tokens (e.g. 50% USDC / 30% cirBTC /
///           20% EURC). Funded either by a custodied budget released one period at a
///           time (Deposit, like Swap) or by pulling the owner's wallet balance above a
///           threshold via the USDC ERC-20 precompile with a one-time allowance (Sweep).
///           In both modes the USDC share never passes through the executor: Deposit
///           sends it straight from the contract to the owner, Sweep simply leaves it
///           in the owner's wallet. The executor only ever receives the share to swap,
///           bounded per period, with the threshold enforced on-chain.
///
///         Native USDC on Arc has 18 decimals and is the gas/value token, so amounts
///         are handled as msg.value (same model as WooshInvoiceRegistry). The ERC-20
///         precompile at 0x3600...0000 exposes the SAME balance with 6 decimals; sweep
///         pulls go through it, so their amounts are converted 18 -> 6 (divide by 1e12).
interface IUSDCPrecompile {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract WooshStrategyRegistry {
    enum Kind { Payment, Swap, Portfolio }
    enum FundingMode { Deposit, Sweep }
    // Active: running. Paused: paused by owner. Completed: reached periodsTotal (terminal).
    // Cancelled: cancelled by owner, funds refunded (terminal). Depleted: auto-paused
    // because the balance can no longer fund a period — revived by fund().
    enum Status { Active, Paused, Completed, Cancelled, Depleted }

    struct Strategy {
        address owner;            // creator; receives swap output and refunds
        Kind    kind;
        address recipient;        // Payment: who gets paid. Swap: unused (output goes to owner)
        address tokenOut;         // Swap: target token (e.g. EURC, cirBTC). Payment: address(0)
        uint256 amountPerPeriod;  // native USDC per execution (wei, 18 decimals)
        uint64  intervalSeconds;  // gap between executions
        uint32  periodsTotal;     // 0 = open-ended (runs until funds run out or cancelled)
        uint32  periodsDone;      // executions completed so far
        uint64  nextRunAt;        // unix ts when the next execution becomes eligible
        uint256 balance;          // remaining custodied native USDC for THIS strategy
        Status  status;
        uint64  createdAt;
    }

    /// @dev Portfolio-only extras, parallel to the Strategy entry with the same id.
    struct PortfolioConfig {
        address[] tokens;       // leg targets; address(0) = the USDC leg (kept, not swapped)
        uint16[]  bps;          // parallel to tokens; sums to 10_000
        FundingMode mode;
        uint256 sweepThreshold; // Sweep only: never pull the owner's balance below this (18-dec)
    }

    /// @dev Payroll-style extras for a batch Payment strategy: parallel arrays, each
    ///      period forwards every leg (all-or-nothing within the period's tx).
    struct BatchPayees {
        address[] recipients;
        uint256[] amounts; // native USDC (wei); amountPerPeriod == sum(amounts)
    }

    address public constant USDC_ERC20 = 0x3600000000000000000000000000000000000000;
    uint256 private constant NATIVE_PER_ERC20 = 1e12; // 18-dec native units per 6-dec ERC-20 unit
    uint256 private constant BPS_DENOM = 10_000;
    uint256 private constant MAX_LEGS = 5;
    uint256 private constant MAX_BATCH_RECIPIENTS = 10;

    address public admin;     // can set the executor; set to deployer
    address public executor;  // authorized to trigger executions (Woosh DCW wallet)

    mapping(bytes32 => PortfolioConfig) private _portfolios;
    mapping(bytes32 => Strategy) private _strategies;
    mapping(address => bytes32[]) private _byOwner;
    bytes32[] private _allIds; // global list so the executor can scan for due strategies
    mapping(bytes32 => string) private _memos;       // user-facing note per strategy ("rent", "payroll")
    mapping(bytes32 => BatchPayees) private _batches; // Payment only; empty = single recipient
    /// @notice Swap (DCA) only: executor delivers the swap output into the owner's
    ///         savings vault instead of their spendable wallet. Coordination flag for
    ///         the off-chain executor; stored onchain so it is user-auditable.
    mapping(bytes32 => bool) public deliverToVault;

    uint256 private _locked = 1; // simple reentrancy guard

    event StrategyCreated(
        bytes32 indexed id,
        address indexed owner,
        Kind kind,
        address recipient,
        address tokenOut,
        uint256 amountPerPeriod,
        uint64 intervalSeconds,
        uint32 periodsTotal,
        uint256 funded
    );
    event StrategyFunded(bytes32 indexed id, address indexed from, uint256 amount, uint256 newBalance);
    event PaymentExecuted(bytes32 indexed id, address indexed recipient, uint256 amount, uint32 periodsDone, uint64 nextRunAt);
    event SwapReleased(bytes32 indexed id, address indexed owner, address tokenOut, uint256 amountIn, uint32 periodsDone, uint64 nextRunAt);
    event PortfolioCreated(bytes32 indexed id, address indexed owner, address[] tokens, uint16[] bps, FundingMode mode, uint256 sweepThreshold);
    event PortfolioReleased(bytes32 indexed id, address indexed owner, uint256 swapShare, uint256 usdcShare, uint32 periodsDone, uint64 nextRunAt);
    event PortfolioSwept(bytes32 indexed id, address indexed owner, uint256 pulled, uint32 periodsDone, uint64 nextRunAt);
    event StrategyStatusChanged(bytes32 indexed id, Status status);
    event StrategyCancelled(bytes32 indexed id, address indexed owner, uint256 refunded);
    event ExecutorChanged(address indexed executor);
    event AdminTransferred(address indexed admin);
    event StrategyMemoSet(bytes32 indexed id, string memo);
    event BatchCreated(bytes32 indexed id, address indexed owner, address[] recipients, uint256[] amounts);
    event BatchLegPaid(bytes32 indexed id, address indexed recipient, uint256 amount);

    modifier nonReentrant() {
        require(_locked == 1, "WSR: reentrant");
        _locked = 2;
        _;
        _locked = 1;
    }

    modifier onlyExecutor() {
        require(msg.sender == executor, "WSR: not executor");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    /// @notice Set the authorized executor (the Woosh DCW wallet). Admin only.
    function setExecutor(address newExecutor) external {
        require(msg.sender == admin, "WSR: not admin");
        executor = newExecutor;
        emit ExecutorChanged(newExecutor);
    }

    /// @notice Hand admin (executor-rotation rights) to a new key/multisig. Admin only.
    ///         Admin can ONLY rotate the executor; it can never move strategy funds.
    function transferAdmin(address newAdmin) external {
        require(msg.sender == admin, "WSR: not admin");
        require(newAdmin != address(0), "WSR: zero admin");
        admin = newAdmin;
        emit AdminTransferred(newAdmin);
    }

    /// @notice Deterministic id for an owner's strategy. Same (owner, salt) => same id.
    function strategyId(address owner, uint256 salt) public pure returns (bytes32) {
        return keccak256(abi.encode(owner, salt));
    }

    /// @notice Create and fund a strategy. msg.value is the initial budget.
    /// @param salt            caller-chosen nonce for a unique id
    /// @param kind            Payment (recurring transfer) or Swap (DCA)
    /// @param recipient       Payment only: who receives each payment
    /// @param tokenOut        Swap only: the target token address
    /// @param amountPerPeriod native USDC released/sent each execution
    /// @param intervalSeconds gap between executions (must be > 0)
    /// @param periodsTotal    number of executions, or 0 for open-ended
    function create(
        uint256 salt,
        Kind kind,
        address recipient,
        address tokenOut,
        uint256 amountPerPeriod,
        uint64 intervalSeconds,
        uint32 periodsTotal
    ) external payable returns (bytes32 id) {
        return _createCore(salt, kind, recipient, tokenOut, amountPerPeriod, intervalSeconds, periodsTotal);
    }

    /// @notice create() plus v2 extras: a user-facing memo ("rent", "netflix") and,
    ///         for DCA, delivery of the swap output into the owner's savings vault
    ///         instead of the spendable wallet.
    function createV2(
        uint256 salt,
        Kind kind,
        address recipient,
        address tokenOut,
        uint256 amountPerPeriod,
        uint64 intervalSeconds,
        uint32 periodsTotal,
        string calldata memo,
        bool toVault
    ) external payable returns (bytes32 id) {
        id = _createCore(salt, kind, recipient, tokenOut, amountPerPeriod, intervalSeconds, periodsTotal);
        if (bytes(memo).length != 0) {
            _memos[id] = memo;
            emit StrategyMemoSet(id, memo);
        }
        if (toVault) {
            require(kind == Kind.Swap, "WSR: vault delivery is DCA-only");
            deliverToVault[id] = true;
        }
    }

    /// @notice Recurring BATCH payment (payroll): every period the contract forwards
    ///         each leg to its recipient, all-or-nothing within the period.
    ///         amountPerPeriod is the sum of all legs. msg.value is the budget.
    function createBatchPayment(
        uint256 salt,
        address[] calldata recipients,
        uint256[] calldata amounts,
        string calldata memo,
        uint64 intervalSeconds,
        uint32 periodsTotal
    ) external payable returns (bytes32 id) {
        require(recipients.length > 1 && recipients.length <= MAX_BATCH_RECIPIENTS, "WSR: bad batch size");
        require(recipients.length == amounts.length, "WSR: length mismatch");
        uint256 total;
        for (uint256 i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0), "WSR: zero recipient");
            require(amounts[i] > 0, "WSR: zero leg");
            total += amounts[i];
        }

        // recipient stays address(0): the batch config below is the payee list.
        id = _createCore(salt, Kind.Payment, address(0), address(0), total, intervalSeconds, periodsTotal);
        _batches[id] = BatchPayees({recipients: recipients, amounts: amounts});
        if (bytes(memo).length != 0) {
            _memos[id] = memo;
            emit StrategyMemoSet(id, memo);
        }
        emit BatchCreated(id, msg.sender, recipients, amounts);
    }

    function _createCore(
        uint256 salt,
        Kind kind,
        address recipient,
        address tokenOut,
        uint256 amountPerPeriod,
        uint64 intervalSeconds,
        uint32 periodsTotal
    ) private returns (bytes32 id) {
        require(amountPerPeriod > 0, "WSR: zero amount");
        require(intervalSeconds > 0, "WSR: zero interval");
        require(msg.value >= amountPerPeriod, "WSR: underfunded");
        if (kind == Kind.Payment) {
            // recipient == 0 is allowed only for batch payments, whose payees are
            // stored separately; createBatchPayment is the only zero-recipient caller.
            require(recipient != address(0) || msg.sig == this.createBatchPayment.selector, "WSR: no recipient");
        } else {
            require(tokenOut != address(0), "WSR: no tokenOut");
        }

        id = strategyId(msg.sender, salt);
        require(_strategies[id].owner == address(0), "WSR: id exists");

        _strategies[id] = Strategy({
            owner: msg.sender,
            kind: kind,
            recipient: recipient,
            tokenOut: tokenOut,
            amountPerPeriod: amountPerPeriod,
            intervalSeconds: intervalSeconds,
            periodsTotal: periodsTotal,
            periodsDone: 0,
            nextRunAt: uint64(block.timestamp), // first run eligible immediately
            balance: msg.value,
            status: Status.Active,
            createdAt: uint64(block.timestamp)
        });
        _byOwner[msg.sender].push(id);
        _allIds.push(id);

        emit StrategyCreated(id, msg.sender, kind, recipient, tokenOut, amountPerPeriod, intervalSeconds, periodsTotal, msg.value);
    }

    /// @notice Create a Portfolio strategy: a target allocation across tokens.
    /// @param salt            caller-chosen nonce for a unique id
    /// @param tokens          leg targets; address(0) = the USDC leg (kept, never swapped)
    /// @param bps             per-leg weight in basis points; must sum to 10_000
    /// @param mode            Deposit (custodied budget, msg.value funds it) or Sweep
    ///                        (no deposit; pulls wallet excess via one-time allowance)
    /// @param amountPerPeriod Deposit: native USDC allocated per period.
    ///                        Sweep: the per-period pull CAP (18-dec native units).
    /// @param sweepThreshold  Sweep only: the owner's balance is never pulled below this
    /// @param intervalSeconds gap between executions (must be > 0)
    /// @param periodsTotal    number of executions, or 0 for open-ended
    function createPortfolio(
        uint256 salt,
        address[] calldata tokens,
        uint16[] calldata bps,
        FundingMode mode,
        uint256 amountPerPeriod,
        uint256 sweepThreshold,
        uint64 intervalSeconds,
        uint32 periodsTotal
    ) external payable returns (bytes32 id) {
        require(amountPerPeriod > 0, "WSR: zero amount");
        require(intervalSeconds > 0, "WSR: zero interval");
        require(tokens.length > 0 && tokens.length <= MAX_LEGS, "WSR: bad legs");
        require(tokens.length == bps.length, "WSR: length mismatch");
        if (mode == FundingMode.Deposit) {
            require(msg.value >= amountPerPeriod, "WSR: underfunded");
        } else {
            require(msg.value == 0, "WSR: sweep takes no funds");
        }

        uint256 sum;
        bool hasSwapLeg;
        for (uint256 i = 0; i < tokens.length; i++) {
            require(bps[i] > 0, "WSR: zero weight");
            for (uint256 j = i + 1; j < tokens.length; j++) {
                require(tokens[i] != tokens[j], "WSR: duplicate leg");
            }
            if (tokens[i] != address(0)) hasSwapLeg = true;
            sum += bps[i];
        }
        require(sum == BPS_DENOM, "WSR: weights != 100%");
        require(hasSwapLeg, "WSR: all-USDC portfolio");

        id = strategyId(msg.sender, salt);
        require(_strategies[id].owner == address(0), "WSR: id exists");

        _strategies[id] = Strategy({
            owner: msg.sender,
            kind: Kind.Portfolio,
            recipient: address(0),
            tokenOut: address(0),
            amountPerPeriod: amountPerPeriod,
            intervalSeconds: intervalSeconds,
            periodsTotal: periodsTotal,
            periodsDone: 0,
            nextRunAt: uint64(block.timestamp),
            balance: msg.value,
            status: Status.Active,
            createdAt: uint64(block.timestamp)
        });
        _portfolios[id] = PortfolioConfig({
            tokens: tokens,
            bps: bps,
            mode: mode,
            sweepThreshold: sweepThreshold
        });
        _byOwner[msg.sender].push(id);
        _allIds.push(id);

        emit StrategyCreated(id, msg.sender, Kind.Portfolio, address(0), address(0), amountPerPeriod, intervalSeconds, periodsTotal, msg.value);
        emit PortfolioCreated(id, msg.sender, tokens, bps, mode, sweepThreshold);
    }

    /// @notice Top up a strategy's budget. Owner only. A Depleted strategy (auto-paused
    ///         for low funds) auto-resumes once it can afford a period again.
    function fund(bytes32 id) external payable {
        Strategy storage s = _strategies[id];
        require(s.owner == msg.sender, "WSR: not owner");
        require(
            s.status == Status.Active || s.status == Status.Paused || s.status == Status.Depleted,
            "WSR: closed"
        );
        require(!_isSweep(id, s), "WSR: sweep holds no funds");
        require(msg.value > 0, "WSR: zero");
        s.balance += msg.value;
        emit StrategyFunded(id, msg.sender, msg.value, s.balance);

        if (s.status == Status.Depleted && s.balance >= s.amountPerPeriod) {
            s.status = Status.Active;
            if (s.nextRunAt < block.timestamp) s.nextRunAt = uint64(block.timestamp);
            emit StrategyStatusChanged(id, Status.Active);
        }
    }

    /// @notice Execute one period of a Payment strategy. Executor only.
    ///         Advances the schedule and forwards `amountPerPeriod` to the recipient.
    function executePayment(bytes32 id) external onlyExecutor nonReentrant {
        Strategy storage s = _strategies[id];
        _advance(id, s, Kind.Payment);

        BatchPayees storage batch = _batches[id];
        if (batch.recipients.length > 0) {
            // Payroll: forward every leg, all-or-nothing within this period's tx.
            emit PaymentExecuted(id, address(0), s.amountPerPeriod, s.periodsDone, s.nextRunAt);
            for (uint256 i = 0; i < batch.recipients.length; i++) {
                emit BatchLegPaid(id, batch.recipients[i], batch.amounts[i]);
                (bool legOk, ) = payable(batch.recipients[i]).call{value: batch.amounts[i]}("");
                require(legOk, "WSR: leg transfer failed");
            }
            return;
        }

        address to = s.recipient;
        uint256 amount = s.amountPerPeriod;
        emit PaymentExecuted(id, to, amount, s.periodsDone, s.nextRunAt);

        (bool ok, ) = payable(to).call{value: amount}("");
        require(ok, "WSR: transfer failed");
    }

    /// @notice Release one period of a Swap strategy to the executor. Executor only.
    ///         The executor swaps `amountPerPeriod` off-chain (StableFX / App Kit) and
    ///         forwards the output token to the strategy owner.
    function releaseForSwap(bytes32 id) external onlyExecutor nonReentrant {
        Strategy storage s = _strategies[id];
        _advance(id, s, Kind.Swap);

        uint256 amount = s.amountPerPeriod;
        emit SwapReleased(id, s.owner, s.tokenOut, amount, s.periodsDone, s.nextRunAt);

        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "WSR: release failed");
    }

    /// @notice Release one period of a Deposit-mode Portfolio strategy. Executor only.
    ///         The USDC leg goes STRAIGHT to the owner (never via the executor); only
    ///         the share to be swapped is sent to the executor, which swaps off-chain
    ///         per the stored weights and forwards each output token to the owner.
    function releaseForPortfolio(bytes32 id) external onlyExecutor nonReentrant {
        Strategy storage s = _strategies[id];
        PortfolioConfig storage p = _portfolios[id];
        require(s.kind != Kind.Portfolio || p.mode == FundingMode.Deposit, "WSR: not deposit");
        _advance(id, s, Kind.Portfolio);

        uint256 amount = s.amountPerPeriod;
        uint256 usdcShare = (amount * _usdcBps(p)) / BPS_DENOM;
        uint256 swapShare = amount - usdcShare;
        emit PortfolioReleased(id, s.owner, swapShare, usdcShare, s.periodsDone, s.nextRunAt);

        if (usdcShare > 0) {
            (bool okOwner, ) = payable(s.owner).call{value: usdcShare}("");
            require(okOwner, "WSR: usdc leg failed");
        }
        (bool ok, ) = payable(msg.sender).call{value: swapShare}("");
        require(ok, "WSR: release failed");
    }

    /// @notice Pull one period of a Sweep-mode Portfolio from the owner's wallet via the
    ///         USDC ERC-20 precompile (needs a one-time allowance from the owner to this
    ///         contract). Executor only. Only the share to be swapped is pulled — the
    ///         USDC leg simply stays in the owner's wallet. On-chain bounds:
    ///         never below `sweepThreshold`, never more than `amountPerPeriod` per period.
    /// @param amount6 amount to pull, in 6-decimal ERC-20 units
    function sweepForPortfolio(bytes32 id, uint256 amount6) external onlyExecutor nonReentrant {
        Strategy storage s = _strategies[id];
        PortfolioConfig storage p = _portfolios[id];
        require(s.owner != address(0), "WSR: no strategy");
        require(s.kind == Kind.Portfolio && p.mode == FundingMode.Sweep, "WSR: not sweep");
        require(s.status == Status.Active, "WSR: not active");
        require(block.timestamp >= s.nextRunAt, "WSR: not due");
        require(amount6 > 0, "WSR: zero pull");

        uint256 amount18 = amount6 * NATIVE_PER_ERC20;
        require(amount18 <= s.amountPerPeriod, "WSR: over cap");
        require(s.owner.balance >= p.sweepThreshold + amount18, "WSR: below threshold");

        s.periodsDone += 1;
        s.nextRunAt = uint64(block.timestamp) + s.intervalSeconds;
        if (s.periodsTotal != 0 && s.periodsDone >= s.periodsTotal) {
            s.status = Status.Completed;
            emit StrategyStatusChanged(id, Status.Completed);
        }
        emit PortfolioSwept(id, s.owner, amount18, s.periodsDone, s.nextRunAt);

        require(IUSDCPrecompile(USDC_ERC20).transferFrom(s.owner, msg.sender, amount6), "WSR: pull failed");
    }

    /// @dev Weight of the USDC leg (token == address(0)), in bps. 0 if there is none.
    function _usdcBps(PortfolioConfig storage p) private view returns (uint256) {
        for (uint256 i = 0; i < p.tokens.length; i++) {
            if (p.tokens[i] == address(0)) return p.bps[i];
        }
        return 0;
    }

    /// @dev True if `id` is a Sweep-mode Portfolio (holds no custodied balance).
    function _isSweep(bytes32 id, Strategy storage s) private view returns (bool) {
        return s.kind == Kind.Portfolio && _portfolios[id].mode == FundingMode.Sweep;
    }

    /// @dev Shared guard + schedule advance for the custodied-balance execution paths.
    ///      Effects only; the caller performs the value transfer after this returns.
    function _advance(bytes32 id, Strategy storage s, Kind expected) private {
        require(s.owner != address(0), "WSR: no strategy");
        require(s.kind == expected, "WSR: wrong kind");
        require(s.status == Status.Active, "WSR: not active");
        require(block.timestamp >= s.nextRunAt, "WSR: not due");
        require(s.balance >= s.amountPerPeriod, "WSR: insufficient balance");

        s.balance -= s.amountPerPeriod;
        s.periodsDone += 1;
        s.nextRunAt = uint64(block.timestamp) + s.intervalSeconds;

        // Reaching the period cap is terminal (Completed). Merely running out of funds
        // is recoverable (Depleted) — the owner can fund() to revive it.
        if (s.periodsTotal != 0 && s.periodsDone >= s.periodsTotal) {
            s.status = Status.Completed;
            emit StrategyStatusChanged(id, Status.Completed);
        } else if (s.balance < s.amountPerPeriod) {
            s.status = Status.Depleted;
            emit StrategyStatusChanged(id, Status.Depleted);
        }
    }

    /// @notice Pause an active strategy. Owner only.
    function pause(bytes32 id) external {
        Strategy storage s = _strategies[id];
        require(s.owner == msg.sender, "WSR: not owner");
        require(s.status == Status.Active, "WSR: not active");
        s.status = Status.Paused;
        emit StrategyStatusChanged(id, Status.Paused);
    }

    /// @notice Resume a paused strategy. Owner only. Next run is eligible immediately.
    function resume(bytes32 id) external {
        Strategy storage s = _strategies[id];
        require(s.owner == msg.sender, "WSR: not owner");
        require(s.status == Status.Paused, "WSR: not paused");
        // Sweep portfolios custody nothing, so there is no balance to require.
        require(_isSweep(id, s) || s.balance >= s.amountPerPeriod, "WSR: insufficient balance");
        s.status = Status.Active;
        if (s.nextRunAt < block.timestamp) s.nextRunAt = uint64(block.timestamp);
        emit StrategyStatusChanged(id, Status.Active);
    }

    /// @notice Cancel a strategy and refund its remaining balance to the owner. Owner only.
    function cancel(bytes32 id) external nonReentrant {
        Strategy storage s = _strategies[id];
        require(s.owner == msg.sender, "WSR: not owner");
        require(
            s.status == Status.Active || s.status == Status.Paused || s.status == Status.Depleted,
            "WSR: closed"
        );

        uint256 refund = s.balance;
        s.balance = 0;
        s.status = Status.Cancelled;
        emit StrategyCancelled(id, s.owner, refund);

        if (refund > 0) {
            (bool ok, ) = payable(s.owner).call{value: refund}("");
            require(ok, "WSR: refund failed");
        }
    }

    /// @notice Read a strategy. owner == 0x0 means it doesn't exist.
    function getStrategy(bytes32 id) external view returns (Strategy memory) {
        return _strategies[id];
    }

    /// @notice Portfolio extras for a Portfolio strategy (empty arrays for other kinds).
    function getPortfolio(bytes32 id)
        external
        view
        returns (address[] memory tokens, uint16[] memory bps, FundingMode mode, uint256 sweepThreshold)
    {
        PortfolioConfig storage p = _portfolios[id];
        return (p.tokens, p.bps, p.mode, p.sweepThreshold);
    }

    /// @notice All strategy ids created by `owner`, newest last.
    function getStrategyIds(address owner) external view returns (bytes32[] memory) {
        return _byOwner[owner];
    }

    /// @notice A strategy's user-facing memo ("rent", "payroll"). Empty string if none.
    function getMemo(bytes32 id) external view returns (string memory) {
        return _memos[id];
    }

    /// @notice Batch payees for a payroll-style Payment strategy. Empty arrays for
    ///         single-recipient strategies (check recipients.length before use).
    function getBatch(bytes32 id) external view returns (address[] memory recipients, uint256[] memory amounts) {
        BatchPayees storage b = _batches[id];
        return (b.recipients, b.amounts);
    }

    /// @notice Read many strategies at once. Lets the executor pull a whole page in one
    ///         RPC call (pair with allIds) instead of one round-trip per id.
    function getStrategiesBatch(bytes32[] calldata ids) external view returns (Strategy[] memory out) {
        out = new Strategy[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            out[i] = _strategies[ids[i]];
        }
    }

    /// @notice Total number of strategies ever created (for executor pagination).
    function totalStrategies() external view returns (uint256) {
        return _allIds.length;
    }

    /// @notice A page of all strategy ids. The executor scans these and filters by
    ///         status/nextRunAt off-chain to find due strategies.
    function allIds(uint256 start, uint256 count) external view returns (bytes32[] memory page) {
        uint256 len = _allIds.length;
        if (start >= len) return new bytes32[](0);
        uint256 end = start + count;
        if (end > len) end = len;
        page = new bytes32[](end - start);
        for (uint256 i = start; i < end; i++) {
            page[i - start] = _allIds[i];
        }
    }
}
