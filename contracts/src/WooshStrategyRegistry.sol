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
///         Native USDC on Arc has 18 decimals and is the gas/value token, so amounts
///         are handled as msg.value (same model as WooshInvoiceRegistry).
contract WooshStrategyRegistry {
    enum Kind { Payment, Swap }
    enum Status { Active, Paused, Completed, Cancelled }

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

    address public admin;     // can set the executor; set to deployer
    address public executor;  // authorized to trigger executions (Woosh DCW wallet)

    mapping(bytes32 => Strategy) private _strategies;
    mapping(address => bytes32[]) private _byOwner;
    bytes32[] private _allIds; // global list so the executor can scan for due strategies

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
    event StrategyStatusChanged(bytes32 indexed id, Status status);
    event StrategyCancelled(bytes32 indexed id, address indexed owner, uint256 refunded);
    event ExecutorChanged(address indexed executor);

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
        require(amountPerPeriod > 0, "WSR: zero amount");
        require(intervalSeconds > 0, "WSR: zero interval");
        require(msg.value >= amountPerPeriod, "WSR: underfunded");
        if (kind == Kind.Payment) {
            require(recipient != address(0), "WSR: no recipient");
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

    /// @notice Top up a strategy's budget. Owner only.
    function fund(bytes32 id) external payable {
        Strategy storage s = _strategies[id];
        require(s.owner == msg.sender, "WSR: not owner");
        require(s.status == Status.Active || s.status == Status.Paused, "WSR: closed");
        require(msg.value > 0, "WSR: zero");
        s.balance += msg.value;
        emit StrategyFunded(id, msg.sender, msg.value, s.balance);
    }

    /// @notice Execute one period of a Payment strategy. Executor only.
    ///         Advances the schedule and forwards `amountPerPeriod` to the recipient.
    function executePayment(bytes32 id) external onlyExecutor nonReentrant {
        Strategy storage s = _strategies[id];
        _advance(id, s, Kind.Payment);

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

    /// @dev Shared guard + schedule advance for both execution paths. Effects only;
    ///      the caller performs the value transfer after this returns.
    function _advance(bytes32 id, Strategy storage s, Kind expected) private {
        require(s.owner != address(0), "WSR: no strategy");
        require(s.kind == expected, "WSR: wrong kind");
        require(s.status == Status.Active, "WSR: not active");
        require(block.timestamp >= s.nextRunAt, "WSR: not due");
        require(s.balance >= s.amountPerPeriod, "WSR: insufficient balance");

        s.balance -= s.amountPerPeriod;
        s.periodsDone += 1;
        s.nextRunAt = uint64(block.timestamp) + s.intervalSeconds;

        bool reachedCap = s.periodsTotal != 0 && s.periodsDone >= s.periodsTotal;
        bool outOfFunds = s.balance < s.amountPerPeriod;
        if (reachedCap || outOfFunds) {
            s.status = Status.Completed;
            emit StrategyStatusChanged(id, Status.Completed);
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
        require(s.balance >= s.amountPerPeriod, "WSR: insufficient balance");
        s.status = Status.Active;
        if (s.nextRunAt < block.timestamp) s.nextRunAt = uint64(block.timestamp);
        emit StrategyStatusChanged(id, Status.Active);
    }

    /// @notice Cancel a strategy and refund its remaining balance to the owner. Owner only.
    function cancel(bytes32 id) external nonReentrant {
        Strategy storage s = _strategies[id];
        require(s.owner == msg.sender, "WSR: not owner");
        require(s.status == Status.Active || s.status == Status.Paused, "WSR: closed");

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

    /// @notice All strategy ids created by `owner`, newest last.
    function getStrategyIds(address owner) external view returns (bytes32[] memory) {
        return _byOwner[owner];
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
