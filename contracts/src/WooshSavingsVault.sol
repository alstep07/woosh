// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title WooshSavingsVault
/// @notice A per-user savings vault, separate from the spendable wallet balance.
///         This contract only HOLDS funds and enforces who may move them; all
///         scheduling/automation lives off-chain (cron + executor) or in
///         WooshStrategyRegistry. Money can only ever leave a vault to its owner.
///
///         Balance model (multi-token from day one, so DCA-into-savings and
///         rebalancing can land here later without a migration):
///         - token address(0) = native USDC, tracked in 18-dec wei (msg.value units)
///         - any other token   = its ERC-20 units (EURC 6-dec, cirBTC 8-dec)
///
///         Funding paths:
///         - deposit(): the owner moves native USDC in directly (PIN tx).
///         - creditFor(): the authorized executor credits a user's vault, e.g. with
///           the output of a scheduled swap. ERC-20 credits are pulled from the
///           executor atomically (transferFrom), so attribution can't be spoofed.
///         - sweepFrom(): "pay yourself first" — the executor pulls the owner's
///           wallet excess via the USDC ERC-20 precompile (one-time allowance from
///           the owner to this contract). The rule (floor, per-run cap, interval)
///           is set by the owner and enforced ON-CHAIN, so the executor can never
///           pull more, more often, or deeper than the owner allowed.
///
///         The executor can only ever ADD to vaults (credit/sweep-in); withdrawals
///         are owner-only, any amount, any time. Native USDC on Arc has 18 decimals;
///         the ERC-20 precompile at 0x3600...0000 exposes the SAME balance with
///         6 decimals, so sweep amounts convert 6 -> 18 (multiply by 1e12).
interface IUSDCPrecompile {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract WooshSavingsVault {
    /// @dev Owner-set auto-sweep rule; enforced on-chain on every sweepFrom.
    struct SweepRule {
        uint256 threshold;       // never pull the owner's wallet below this (18-dec native)
        uint256 capPerRun;       // max pulled per run (18-dec native)
        uint64  intervalSeconds; // min gap between runs
        uint64  nextRunAt;       // unix ts when the next sweep becomes eligible
        bool    enabled;
    }

    address public constant USDC_ERC20 = 0x3600000000000000000000000000000000000000;
    uint256 private constant NATIVE_PER_ERC20 = 1e12; // 18-dec native units per 6-dec ERC-20 unit

    address public admin;     // can set the executor; set to deployer
    address public executor;  // authorized to credit/sweep INTO vaults (Woosh DCW wallet)

    // balances[owner][token]; address(0) = native USDC. See balance model above.
    mapping(address => mapping(address => uint256)) public balances;
    mapping(address => SweepRule) private _sweepRules;

    uint256 private _locked = 1; // simple reentrancy guard

    event Deposited(address indexed owner, uint256 amount, uint256 newBalance);
    event Withdrawn(address indexed owner, address indexed token, uint256 amount, uint256 newBalance);
    event Credited(address indexed owner, address indexed token, uint256 amount, uint256 newBalance);
    event SweepRuleSet(address indexed owner, uint256 threshold, uint256 capPerRun, uint64 intervalSeconds);
    event SweepRuleDisabled(address indexed owner);
    event Swept(address indexed owner, uint256 amount, uint256 newBalance, uint64 nextRunAt);
    event ExecutorChanged(address indexed executor);
    event AdminTransferred(address indexed admin);

    modifier nonReentrant() {
        require(_locked == 1, "WSV: reentrant");
        _locked = 2;
        _;
        _locked = 1;
    }

    modifier onlyExecutor() {
        require(msg.sender == executor, "WSV: not executor");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    /// @notice Set the authorized executor (the Woosh DCW wallet). Admin only.
    function setExecutor(address newExecutor) external {
        require(msg.sender == admin, "WSV: not admin");
        executor = newExecutor;
        emit ExecutorChanged(newExecutor);
    }

    /// @notice Hand admin (executor-rotation rights) to a new key/multisig. Admin only.
    ///         Admin can ONLY rotate the executor; it can never move vault funds.
    function transferAdmin(address newAdmin) external {
        require(msg.sender == admin, "WSV: not admin");
        require(newAdmin != address(0), "WSV: zero admin");
        admin = newAdmin;
        emit AdminTransferred(newAdmin);
    }

    // ── funding ───────────────────────────────────────────────────────────────

    /// @notice Put native USDC into your own vault.
    function deposit() external payable {
        require(msg.value > 0, "WSV: zero");
        uint256 newBalance = balances[msg.sender][address(0)] + msg.value;
        balances[msg.sender][address(0)] = newBalance;
        emit Deposited(msg.sender, msg.value, newBalance);
    }

    /// @notice Credit a user's vault. Executor only — used to land scheduled swap
    ///         output (e.g. cirBTC bought for savings) in the vault instead of the
    ///         spendable wallet. Native: send as msg.value with token = address(0).
    ///         ERC-20: the amount is pulled from the executor in the same call, so a
    ///         credit can never be recorded without the tokens actually arriving.
    function creditFor(address owner, address token, uint256 amount) external payable onlyExecutor nonReentrant {
        require(owner != address(0), "WSV: zero owner");
        require(amount > 0, "WSV: zero");

        if (token == address(0)) {
            require(msg.value == amount, "WSV: value mismatch");
        } else {
            require(msg.value == 0, "WSV: no value for token");
            require(IERC20Minimal(token).transferFrom(msg.sender, address(this), amount), "WSV: pull failed");
        }

        uint256 newBalance = balances[owner][token] + amount;
        balances[owner][token] = newBalance;
        emit Credited(owner, token, amount, newBalance);
    }

    // ── auto-sweep ("pay yourself first") ────────────────────────────────────

    /// @notice Set (or replace) your auto-sweep rule. Requires a separate one-time
    ///         allowance on the USDC precompile: approve(thisVault, max).
    /// @param threshold       your wallet is never pulled below this (18-dec native)
    /// @param capPerRun       max swept per run (18-dec native)
    /// @param intervalSeconds min gap between sweeps (must be > 0)
    function setSweepRule(uint256 threshold, uint256 capPerRun, uint64 intervalSeconds) external {
        require(capPerRun > 0, "WSV: zero cap");
        require(intervalSeconds > 0, "WSV: zero interval");
        _sweepRules[msg.sender] = SweepRule({
            threshold: threshold,
            capPerRun: capPerRun,
            intervalSeconds: intervalSeconds,
            nextRunAt: uint64(block.timestamp), // first sweep eligible immediately
            enabled: true
        });
        emit SweepRuleSet(msg.sender, threshold, capPerRun, intervalSeconds);
    }

    /// @notice Turn your auto-sweep rule off. The vault balance is untouched.
    function disableSweepRule() external {
        require(_sweepRules[msg.sender].enabled, "WSV: no rule");
        _sweepRules[msg.sender].enabled = false;
        emit SweepRuleDisabled(msg.sender);
    }

    /// @notice Pull one run of the owner's wallet excess into their vault, per their
    ///         rule. Executor only. On-chain bounds: rule must be enabled and due, the
    ///         pull can't exceed capPerRun, and the owner's wallet can't go below
    ///         threshold. Funds move owner -> vault; the executor never touches them.
    /// @param amount6 amount to pull, in 6-decimal ERC-20 units
    function sweepFrom(address owner, uint256 amount6) external onlyExecutor nonReentrant {
        SweepRule storage r = _sweepRules[owner];
        require(r.enabled, "WSV: no rule");
        require(block.timestamp >= r.nextRunAt, "WSV: not due");
        require(amount6 > 0, "WSV: zero pull");

        uint256 amount18 = amount6 * NATIVE_PER_ERC20;
        require(amount18 <= r.capPerRun, "WSV: over cap");
        require(owner.balance >= r.threshold + amount18, "WSV: below threshold");

        r.nextRunAt = uint64(block.timestamp) + r.intervalSeconds;
        uint256 newBalance = balances[owner][address(0)] + amount18;
        balances[owner][address(0)] = newBalance;
        emit Swept(owner, amount18, newBalance, r.nextRunAt);

        require(IUSDCPrecompile(USDC_ERC20).transferFrom(owner, address(this), amount6), "WSV: pull failed");
    }

    // ── withdrawals ───────────────────────────────────────────────────────────

    /// @notice Take funds back out of your vault. Any token, any amount, any time.
    function withdraw(address token, uint256 amount) external nonReentrant {
        require(amount > 0, "WSV: zero");
        uint256 bal = balances[msg.sender][token];
        require(bal >= amount, "WSV: insufficient");
        balances[msg.sender][token] = bal - amount;
        emit Withdrawn(msg.sender, token, amount, bal - amount);

        if (token == address(0)) {
            (bool ok, ) = payable(msg.sender).call{value: amount}("");
            require(ok, "WSV: transfer failed");
        } else {
            require(IERC20Minimal(token).transfer(msg.sender, amount), "WSV: transfer failed");
        }
    }

    // ── views ─────────────────────────────────────────────────────────────────

    /// @notice One owner's balances for a list of tokens, in one RPC call.
    function getBalances(address owner, address[] calldata tokens) external view returns (uint256[] memory out) {
        out = new uint256[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            out[i] = balances[owner][tokens[i]];
        }
    }

    /// @notice An owner's sweep rule. enabled == false means none is active.
    function getSweepRule(address owner) external view returns (SweepRule memory) {
        return _sweepRules[owner];
    }

    /// @dev The USDC precompile moves native balance when sweeping into the vault;
    ///      accept value only from it (and from creditFor's payable path, which does
    ///      not hit receive). Stray direct sends are rejected so no funds can sit in
    ///      the contract unattributed to an owner.
    receive() external payable {
        require(msg.sender == USDC_ERC20, "WSV: use deposit");
    }
}
