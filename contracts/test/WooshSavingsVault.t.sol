// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/WooshSavingsVault.sol";

/// @dev Stand-in for the Arc USDC precompile at 0x3600...0000 (see the registry tests).
///      Only allowance semantics + a fail switch; the native move is precompile-side.
contract MockUSDCPrecompile {
    mapping(address => mapping(address => uint256)) public allowance;
    bool public failTransfers;
    uint256 public lastAmount;
    address public lastFrom;
    address public lastTo;

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function setFailTransfers(bool v) external { failTransfers = v; }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (failTransfers) return false;
        uint256 a = allowance[from][msg.sender];
        require(a >= amount, "mock: allowance");
        allowance[from][msg.sender] = a - amount;
        lastFrom = from; lastTo = to; lastAmount = amount;
        return true;
    }
}

/// @dev Minimal ERC-20 for the creditFor / withdraw token paths (plays cirBTC).
contract MockToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
    function transfer(address to, uint256 amount) external returns (bool) {
        if (balanceOf[msg.sender] < amount) return false;
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (allowance[from][msg.sender] < amount || balanceOf[from] < amount) return false;
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// @dev Tries to re-enter withdraw from its receive hook.
contract ReentrantWithdrawer {
    WooshSavingsVault vault;
    bool attacked;

    constructor(WooshSavingsVault v) { vault = v; }
    function deposit() external payable { vault.deposit{value: msg.value}(); }
    function attack(uint256 amount) external { vault.withdraw(address(0), amount); }

    receive() external payable {
        if (!attacked) {
            attacked = true;
            vault.withdraw(address(0), 1); // must hit the reentrancy guard
        }
    }
}

contract WooshSavingsVaultTest is Test {
    WooshSavingsVault vault;
    MockUSDCPrecompile usdc;
    MockToken cirbtc;

    address owner = makeAddr("owner");
    address executor = makeAddr("executor");

    uint256 constant ONE = 1e18;   // 1 USDC native (18-dec)
    uint256 constant ONE6 = 1e6;   // 1 USDC on the ERC-20 precompile (6-dec)

    function setUp() public {
        vault = new WooshSavingsVault();
        vault.setExecutor(executor);

        MockUSDCPrecompile impl = new MockUSDCPrecompile();
        vm.etch(vault.USDC_ERC20(), address(impl).code);
        usdc = MockUSDCPrecompile(vault.USDC_ERC20());
        usdc.setFailTransfers(false);

        cirbtc = new MockToken();

        vm.deal(owner, 1000 * ONE);
    }

    // ── deposit / withdraw ───────────────────────────────────────────────────

    function test_depositCreditsLedger() public {
        vm.prank(owner);
        vault.deposit{value: 5 * ONE}();
        assertEq(vault.balances(owner, address(0)), 5 * ONE);
        assertEq(address(vault).balance, 5 * ONE);
    }

    function test_depositZeroReverts() public {
        vm.prank(owner);
        vm.expectRevert(bytes("WSV: zero"));
        vault.deposit{value: 0}();
    }

    function test_withdrawNativePartialAndFull() public {
        vm.startPrank(owner);
        vault.deposit{value: 5 * ONE}();

        uint256 before = owner.balance;
        vault.withdraw(address(0), 2 * ONE);
        assertEq(owner.balance, before + 2 * ONE);
        assertEq(vault.balances(owner, address(0)), 3 * ONE);

        vault.withdraw(address(0), 3 * ONE);
        assertEq(vault.balances(owner, address(0)), 0);
        vm.stopPrank();
    }

    function test_withdrawMoreThanBalanceReverts() public {
        vm.startPrank(owner);
        vault.deposit{value: ONE}();
        vm.expectRevert(bytes("WSV: insufficient"));
        vault.withdraw(address(0), 2 * ONE);
        vm.stopPrank();
    }

    function test_withdrawOthersFundsImpossible() public {
        vm.prank(owner);
        vault.deposit{value: ONE}();
        address thief = makeAddr("thief");
        vm.prank(thief);
        vm.expectRevert(bytes("WSV: insufficient"));
        vault.withdraw(address(0), ONE);
    }

    function test_withdrawReentrancyBlocked() public {
        ReentrantWithdrawer attacker = new ReentrantWithdrawer(vault);
        vm.deal(address(this), 10 * ONE);
        attacker.deposit{value: 5 * ONE}();
        // Inner withdraw reverts on the guard -> receive reverts -> outer transfer
        // fails -> whole withdraw reverts. Ledger must be intact.
        vm.expectRevert(bytes("WSV: transfer failed"));
        attacker.attack(2 * ONE);
        assertEq(vault.balances(address(attacker), address(0)), 5 * ONE);
    }

    function test_withdrawToken() public {
        // Credit some cirBTC into the owner's vault via the executor path first.
        cirbtc.mint(executor, 100);
        vm.startPrank(executor);
        cirbtc.approve(address(vault), 100);
        vault.creditFor(owner, address(cirbtc), 100);
        vm.stopPrank();

        vm.prank(owner);
        vault.withdraw(address(cirbtc), 40);
        assertEq(cirbtc.balanceOf(owner), 40);
        assertEq(vault.balances(owner, address(cirbtc)), 60);
    }

    // ── creditFor ────────────────────────────────────────────────────────────

    function test_creditForNative() public {
        vm.deal(executor, 10 * ONE);
        vm.prank(executor);
        vault.creditFor{value: 3 * ONE}(owner, address(0), 3 * ONE);
        assertEq(vault.balances(owner, address(0)), 3 * ONE);
    }

    function test_creditForNativeValueMismatchReverts() public {
        vm.deal(executor, 10 * ONE);
        vm.prank(executor);
        vm.expectRevert(bytes("WSV: value mismatch"));
        vault.creditFor{value: ONE}(owner, address(0), 2 * ONE);
    }

    function test_creditForTokenPullsFromExecutor() public {
        cirbtc.mint(executor, 500);
        vm.startPrank(executor);
        cirbtc.approve(address(vault), 500);
        vault.creditFor(owner, address(cirbtc), 500);
        vm.stopPrank();
        assertEq(vault.balances(owner, address(cirbtc)), 500);
        assertEq(cirbtc.balanceOf(address(vault)), 500);
        assertEq(cirbtc.balanceOf(executor), 0);
    }

    function test_creditForTokenWithoutApprovalReverts() public {
        cirbtc.mint(executor, 500);
        vm.prank(executor);
        vm.expectRevert(bytes("WSV: pull failed"));
        vault.creditFor(owner, address(cirbtc), 500);
    }

    function test_creditForTokenRejectsValue() public {
        cirbtc.mint(executor, 500);
        vm.deal(executor, ONE);
        vm.startPrank(executor);
        cirbtc.approve(address(vault), 500);
        vm.expectRevert(bytes("WSV: no value for token"));
        vault.creditFor{value: 1}(owner, address(cirbtc), 500);
        vm.stopPrank();
    }

    function test_creditForOnlyExecutor() public {
        vm.deal(owner, 10 * ONE);
        vm.prank(owner);
        vm.expectRevert(bytes("WSV: not executor"));
        vault.creditFor{value: ONE}(owner, address(0), ONE);
    }

    // ── sweep rule ───────────────────────────────────────────────────────────

    function _setRule(uint256 threshold, uint256 cap, uint64 interval) internal {
        vm.prank(owner);
        vault.setSweepRule(threshold, cap, interval);
        vm.prank(owner);
        usdc.approve(address(vault), type(uint256).max);
    }

    function test_setSweepRuleValidation() public {
        vm.startPrank(owner);
        vm.expectRevert(bytes("WSV: zero cap"));
        vault.setSweepRule(0, 0, 1 days);
        vm.expectRevert(bytes("WSV: zero interval"));
        vault.setSweepRule(0, ONE, 0);
        vm.stopPrank();
    }

    function test_sweepHappyPath() public {
        _setRule(100 * ONE, 50 * ONE, 1 days);
        vm.deal(owner, 130 * ONE);

        vm.prank(executor);
        vault.sweepFrom(owner, 30 * ONE6);

        assertEq(vault.balances(owner, address(0)), 30 * ONE);
        assertEq(usdc.lastFrom(), owner);
        assertEq(usdc.lastTo(), address(vault));
        assertEq(usdc.lastAmount(), 30 * ONE6);

        WooshSavingsVault.SweepRule memory r = vault.getSweepRule(owner);
        assertEq(r.nextRunAt, uint64(block.timestamp) + 1 days);
    }

    function test_sweepNotDueReverts() public {
        _setRule(0, 50 * ONE, 1 days);
        vm.deal(owner, 100 * ONE);

        vm.prank(executor);
        vault.sweepFrom(owner, ONE6);

        vm.prank(executor);
        vm.expectRevert(bytes("WSV: not due"));
        vault.sweepFrom(owner, ONE6);

        vm.warp(block.timestamp + 1 days);
        vm.prank(executor);
        vault.sweepFrom(owner, ONE6); // due again
    }

    function test_sweepOverCapReverts() public {
        _setRule(0, 10 * ONE, 1 days);
        vm.deal(owner, 100 * ONE);
        vm.prank(executor);
        vm.expectRevert(bytes("WSV: over cap"));
        vault.sweepFrom(owner, 11 * ONE6);
    }

    function test_sweepBelowThresholdReverts() public {
        _setRule(100 * ONE, 50 * ONE, 1 days);
        vm.deal(owner, 110 * ONE);
        vm.prank(executor);
        vm.expectRevert(bytes("WSV: below threshold"));
        vault.sweepFrom(owner, 20 * ONE6); // 110 - 20 < 100
    }

    function test_sweepDisabledReverts() public {
        _setRule(0, 50 * ONE, 1 days);
        vm.prank(owner);
        vault.disableSweepRule();
        vm.prank(executor);
        vm.expectRevert(bytes("WSV: no rule"));
        vault.sweepFrom(owner, ONE6);
    }

    function test_sweepPullFailureRevertsWholeTx() public {
        _setRule(0, 50 * ONE, 1 days);
        vm.deal(owner, 100 * ONE);
        usdc.setFailTransfers(true);
        vm.prank(executor);
        vm.expectRevert(bytes("WSV: pull failed"));
        vault.sweepFrom(owner, ONE6);
        // No phantom credit and the schedule didn't advance.
        assertEq(vault.balances(owner, address(0)), 0);
        assertEq(vault.getSweepRule(owner).nextRunAt, uint64(block.timestamp));
    }

    function test_sweepOnlyExecutor() public {
        _setRule(0, 50 * ONE, 1 days);
        vm.prank(owner);
        vm.expectRevert(bytes("WSV: not executor"));
        vault.sweepFrom(owner, ONE6);
    }

    // ── admin / misc ─────────────────────────────────────────────────────────

    function test_setExecutorOnlyAdmin() public {
        vm.prank(owner);
        vm.expectRevert(bytes("WSV: not admin"));
        vault.setExecutor(owner);
    }

    function test_strayNativeSendRejected() public {
        vm.deal(owner, ONE);
        vm.prank(owner);
        (bool ok, ) = address(vault).call{value: ONE}("");
        assertFalse(ok);
    }

    function test_getBalancesBatch() public {
        vm.prank(owner);
        vault.deposit{value: 7 * ONE}();
        cirbtc.mint(executor, 42);
        vm.startPrank(executor);
        cirbtc.approve(address(vault), 42);
        vault.creditFor(owner, address(cirbtc), 42);
        vm.stopPrank();

        address[] memory tokens = new address[](2);
        tokens[0] = address(0);
        tokens[1] = address(cirbtc);
        uint256[] memory out = vault.getBalances(owner, tokens);
        assertEq(out[0], 7 * ONE);
        assertEq(out[1], 42);
    }
}
