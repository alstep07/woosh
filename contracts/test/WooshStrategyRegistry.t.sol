// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/WooshStrategyRegistry.sol";

/// @dev Stand-in for the Arc USDC precompile at 0x3600...0000. The real one mirrors the
///      NATIVE balance at 6 decimals; for unit tests we only need ERC-20 allowance
///      semantics plus a switch to simulate a failed pull.
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

contract WooshStrategyRegistryTest is Test {
    WooshStrategyRegistry reg;
    MockUSDCPrecompile usdc;

    address owner = makeAddr("owner");
    address executor = makeAddr("executor");
    address eurc = makeAddr("eurc");
    address cirbtc = makeAddr("cirbtc");

    uint256 constant ONE = 1e18; // 1 USDC native (18-dec)

    function setUp() public {
        reg = new WooshStrategyRegistry();
        reg.setExecutor(executor);

        MockUSDCPrecompile impl = new MockUSDCPrecompile();
        vm.etch(reg.USDC_ERC20(), address(impl).code);
        usdc = MockUSDCPrecompile(reg.USDC_ERC20());
        // When running against a fork, the real proxy's storage sits under the etched
        // mock; make sure the mock's failTransfers byte starts clean.
        usdc.setFailTransfers(false);

        vm.deal(owner, 1000 * ONE);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    function legs5050() internal view returns (address[] memory t, uint16[] memory b) {
        t = new address[](2);
        b = new uint16[](2);
        t[0] = address(0); b[0] = 5000; // USDC leg
        t[1] = cirbtc;     b[1] = 5000;
    }

    function legs302050() internal view returns (address[] memory t, uint16[] memory b) {
        t = new address[](3);
        b = new uint16[](3);
        t[0] = address(0); b[0] = 5000;
        t[1] = cirbtc;     b[1] = 3000;
        t[2] = eurc;       b[2] = 2000;
    }

    function createDeposit(uint256 salt, uint256 perPeriod, uint256 funding, uint32 periods)
        internal returns (bytes32)
    {
        (address[] memory t, uint16[] memory b) = legs302050();
        vm.prank(owner);
        return reg.createPortfolio{value: funding}(
            salt, t, b, WooshStrategyRegistry.FundingMode.Deposit, perPeriod, 0, 1 days, periods
        );
    }

    function createSweep(uint256 salt, uint256 cap, uint256 threshold) internal returns (bytes32) {
        (address[] memory t, uint16[] memory b) = legs5050();
        vm.prank(owner);
        return reg.createPortfolio(
            salt, t, b, WooshStrategyRegistry.FundingMode.Sweep, cap, threshold, 1 days, 0
        );
    }

    // ── createPortfolio validation ───────────────────────────────────────────

    function test_create_deposit_storesConfig() public {
        bytes32 id = createDeposit(1, 10 * ONE, 30 * ONE, 3);
        (address[] memory t, uint16[] memory b, WooshStrategyRegistry.FundingMode m, uint256 thr) = reg.getPortfolio(id);
        assertEq(t.length, 3);
        assertEq(b[1], 3000);
        assertEq(uint8(m), uint8(WooshStrategyRegistry.FundingMode.Deposit));
        assertEq(thr, 0);
        WooshStrategyRegistry.Strategy memory s = reg.getStrategy(id);
        assertEq(s.balance, 30 * ONE);
        assertEq(uint8(s.kind), uint8(WooshStrategyRegistry.Kind.Portfolio));
    }

    function test_create_rejectsBadWeights() public {
        (address[] memory t, uint16[] memory b) = legs5050();
        b[1] = 4000; // sums to 9000
        vm.prank(owner);
        vm.expectRevert(bytes("WSR: weights != 100%"));
        reg.createPortfolio{value: ONE}(2, t, b, WooshStrategyRegistry.FundingMode.Deposit, ONE, 0, 1 days, 0);
    }

    function test_create_rejectsDuplicateLegs() public {
        (address[] memory t, uint16[] memory b) = legs5050();
        t[0] = cirbtc; // duplicate with t[1]
        vm.prank(owner);
        vm.expectRevert(bytes("WSR: duplicate leg"));
        reg.createPortfolio{value: ONE}(3, t, b, WooshStrategyRegistry.FundingMode.Deposit, ONE, 0, 1 days, 0);
    }

    function test_create_rejectsAllUsdc() public {
        address[] memory t = new address[](1);
        uint16[] memory b = new uint16[](1);
        t[0] = address(0); b[0] = 10000;
        vm.prank(owner);
        vm.expectRevert(bytes("WSR: all-USDC portfolio"));
        reg.createPortfolio{value: ONE}(4, t, b, WooshStrategyRegistry.FundingMode.Deposit, ONE, 0, 1 days, 0);
    }

    function test_create_depositRequiresFunding() public {
        (address[] memory t, uint16[] memory b) = legs5050();
        vm.prank(owner);
        vm.expectRevert(bytes("WSR: underfunded"));
        reg.createPortfolio{value: ONE / 2}(5, t, b, WooshStrategyRegistry.FundingMode.Deposit, ONE, 0, 1 days, 0);
    }

    function test_create_sweepRejectsValue() public {
        (address[] memory t, uint16[] memory b) = legs5050();
        vm.prank(owner);
        vm.expectRevert(bytes("WSR: sweep takes no funds"));
        reg.createPortfolio{value: ONE}(6, t, b, WooshStrategyRegistry.FundingMode.Sweep, ONE, 0, 1 days, 0);
    }

    // ── releaseForPortfolio (Deposit) ────────────────────────────────────────

    function test_release_splitsUsdcLegToOwner() public {
        bytes32 id = createDeposit(10, 10 * ONE, 30 * ONE, 0);
        uint256 ownerBefore = owner.balance;

        vm.prank(executor);
        reg.releaseForPortfolio(id);

        // 50% USDC leg straight to owner, 50% swap share to executor
        assertEq(owner.balance - ownerBefore, 5 * ONE);
        assertEq(executor.balance, 5 * ONE);
        WooshStrategyRegistry.Strategy memory s = reg.getStrategy(id);
        assertEq(s.balance, 20 * ONE);
        assertEq(s.periodsDone, 1);
    }

    function test_release_onlyExecutor() public {
        bytes32 id = createDeposit(11, ONE, ONE, 0);
        vm.prank(owner);
        vm.expectRevert(bytes("WSR: not executor"));
        reg.releaseForPortfolio(id);
    }

    function test_release_notDueTwice() public {
        bytes32 id = createDeposit(12, ONE, 10 * ONE, 0);
        vm.startPrank(executor);
        reg.releaseForPortfolio(id);
        vm.expectRevert(bytes("WSR: not due"));
        reg.releaseForPortfolio(id);
        vm.stopPrank();
    }

    function test_release_rejectsSweepMode() public {
        bytes32 id = createSweep(13, ONE, 0);
        vm.prank(executor);
        vm.expectRevert(bytes("WSR: not deposit"));
        reg.releaseForPortfolio(id);
    }

    function test_release_completesAtCap_andDepletes() public {
        bytes32 id = createDeposit(14, 10 * ONE, 25 * ONE, 0); // funds for 2.5 periods
        vm.prank(executor);
        reg.releaseForPortfolio(id);
        skip(1 days);
        vm.prank(executor);
        reg.releaseForPortfolio(id);
        // 5 left < 10 → Depleted
        assertEq(uint8(reg.getStrategy(id).status), uint8(WooshStrategyRegistry.Status.Depleted));

        // fund back up and finish a capped strategy
        bytes32 id2 = createDeposit(15, 10 * ONE, 10 * ONE, 1);
        vm.prank(executor);
        reg.releaseForPortfolio(id2);
        assertEq(uint8(reg.getStrategy(id2).status), uint8(WooshStrategyRegistry.Status.Completed));
    }

    // ── sweepForPortfolio ────────────────────────────────────────────────────

    function test_sweep_pullsWithinCapAndThreshold() public {
        bytes32 id = createSweep(20, 10 * ONE, 100 * ONE); // cap 10, threshold 100
        vm.prank(owner);
        usdc.approve(address(reg), type(uint256).max);
        vm.deal(owner, 108 * ONE); // 8 above threshold

        vm.prank(executor);
        reg.sweepForPortfolio(id, 8_000_000); // 8 USDC in 6-dec

        assertEq(usdc.lastFrom(), owner);
        assertEq(usdc.lastTo(), executor);
        assertEq(usdc.lastAmount(), 8_000_000);
        assertEq(reg.getStrategy(id).periodsDone, 1);
    }

    function test_sweep_rejectsOverCap() public {
        bytes32 id = createSweep(21, 10 * ONE, 0);
        vm.prank(executor);
        vm.expectRevert(bytes("WSR: over cap"));
        reg.sweepForPortfolio(id, 11_000_000);
    }

    function test_sweep_rejectsBelowThreshold() public {
        bytes32 id = createSweep(22, 10 * ONE, 100 * ONE);
        vm.deal(owner, 105 * ONE); // only 5 above threshold
        vm.prank(executor);
        vm.expectRevert(bytes("WSR: below threshold"));
        reg.sweepForPortfolio(id, 8_000_000);
    }

    function test_sweep_rejectsNotDueTwice() public {
        bytes32 id = createSweep(23, 10 * ONE, 0);
        vm.prank(owner);
        usdc.approve(address(reg), type(uint256).max);
        vm.startPrank(executor);
        reg.sweepForPortfolio(id, 1_000_000);
        vm.expectRevert(bytes("WSR: not due"));
        reg.sweepForPortfolio(id, 1_000_000);
        vm.stopPrank();
    }

    function test_sweep_revertsWhenPullFails() public {
        bytes32 id = createSweep(24, 10 * ONE, 0);
        vm.prank(owner);
        usdc.approve(address(reg), type(uint256).max);
        usdc.setFailTransfers(true);
        vm.prank(executor);
        vm.expectRevert(bytes("WSR: pull failed"));
        reg.sweepForPortfolio(id, 1_000_000);
    }

    function test_sweep_onlyExecutor() public {
        bytes32 id = createSweep(25, ONE, 0);
        vm.expectRevert(bytes("WSR: not executor"));
        reg.sweepForPortfolio(id, 1);
    }

    // ── lifecycle interactions ───────────────────────────────────────────────

    function test_fund_rejectsSweep() public {
        bytes32 id = createSweep(30, ONE, 0);
        vm.prank(owner);
        vm.expectRevert(bytes("WSR: sweep holds no funds"));
        reg.fund{value: ONE}(id);
    }

    function test_pauseResume_sweepWorksWithZeroBalance() public {
        bytes32 id = createSweep(31, ONE, 0);
        vm.startPrank(owner);
        reg.pause(id);
        reg.resume(id); // must not revert on the balance check
        vm.stopPrank();
        assertEq(uint8(reg.getStrategy(id).status), uint8(WooshStrategyRegistry.Status.Active));
    }

    function test_cancel_refundsDepositBalance() public {
        bytes32 id = createDeposit(32, 10 * ONE, 30 * ONE, 0);
        uint256 before = owner.balance;
        vm.prank(owner);
        reg.cancel(id);
        assertEq(owner.balance - before, 30 * ONE);
    }

    // ── regression: existing kinds still behave ──────────────────────────────

    function test_payment_stillWorks() public {
        address recipient = makeAddr("recipient");
        vm.prank(owner);
        bytes32 id = reg.create{value: 2 * ONE}(
            40, WooshStrategyRegistry.Kind.Payment, recipient, address(0), ONE, 1 days, 0
        );
        vm.prank(executor);
        reg.executePayment(id);
        assertEq(recipient.balance, ONE);
    }

    function test_swap_stillWorks() public {
        vm.prank(owner);
        bytes32 id = reg.create{value: 2 * ONE}(
            41, WooshStrategyRegistry.Kind.Swap, address(0), cirbtc, ONE, 1 days, 0
        );
        vm.prank(executor);
        reg.releaseForSwap(id);
        assertEq(executor.balance, ONE);
    }
}

/// @dev Fork test against Arc testnet: proves the REAL precompile honors
///      approve/transferFrom when the caller is a CONTRACT (the registry), which the
///      eth_simulateV1 spike only proved for EOA callers.
///      Run: forge test --match-contract Fork --fork-url https://rpc.testnet.arc.network
contract WooshStrategyRegistryForkTest is Test {
    address constant FUNDED = 0x4470D145C86773BbeEAAfE79343b6bc3eD6c7Dbd; // Woosh executor (funded)

    function test_fork_sweepPullsNativeViaPrecompile() public {
        if (block.chainid != 5042002) {
            vm.skip(true); // only meaningful on an Arc testnet fork
        }
        // The real transferFrom runs REAL token bytecode (0x3600 proxy -> impl) but leans
        // on two NATIVE precompiles a local fork EVM cannot execute: the blocklist check
        // at 0x1800...01 and the native-balance mover at 0x1800...00. Mock both (return
        // false / success) so the token's own guards — allowance bookkeeping, blocklist
        // consultation, 6->18 decimal scaling — still run for a CONTRACT caller. The
        // actual native balance move was proven live via eth_simulateV1.
        vm.etch(0x1800000000000000000000000000000000000001, hex"60206000f3");
        vm.etch(0x1800000000000000000000000000000000000000, hex"600160005260206000f3");
        WooshStrategyRegistry reg = new WooshStrategyRegistry();
        address executor = makeAddr("fork-executor");
        reg.setExecutor(executor);

        address ownerAddr = FUNDED;
        address cirbtc = makeAddr("cirbtc-target");
        address[] memory t = new address[](2);
        uint16[] memory b = new uint16[](2);
        t[0] = address(0); b[0] = 5000;
        t[1] = cirbtc;     b[1] = 5000;

        vm.prank(ownerAddr);
        bytes32 id = reg.createPortfolio(1, t, b, WooshStrategyRegistry.FundingMode.Sweep, 1e18, 0, 1 days, 0);

        address usdc = reg.USDC_ERC20();
        vm.prank(ownerAddr);
        (bool ok, ) = usdc.call(
            abi.encodeWithSignature("approve(address,uint256)", address(reg), uint256(100000))
        );
        assertTrue(ok, "approve failed");

        vm.prank(executor);
        reg.sweepForPortfolio(id, 50000); // 0.05 USDC in 6-dec: must not revert

        // The native move itself is precompile-side (not assertable in a fork); what IS
        // assertable is that the real token accepted a contract caller and consumed
        // exactly the pulled amount from the allowance.
        (, bytes memory ret) = usdc.staticcall(
            abi.encodeWithSignature("allowance(address,address)", ownerAddr, address(reg))
        );
        assertEq(abi.decode(ret, (uint256)), 50000, "allowance not consumed by 50000");
    }
}
