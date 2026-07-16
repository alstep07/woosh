// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/WooshBatchPay.sol";

/// @dev Rejects incoming native transfers to prove a failed leg reverts the whole batch.
contract RejectingRecipient {
    receive() external payable {
        revert("nope");
    }
}

contract WooshBatchPayTest is Test {
    WooshBatchPay bp;
    address sender = makeAddr("sender");

    uint256 constant ONE = 1e18;

    function setUp() public {
        bp = new WooshBatchPay();
        vm.deal(sender, 1000 * ONE);
    }

    function legs() internal returns (address[] memory r, uint256[] memory a) {
        r = new address[](3);
        a = new uint256[](3);
        r[0] = makeAddr("alice"); a[0] = 2 * ONE;
        r[1] = makeAddr("bob");   a[1] = 3 * ONE;
        r[2] = makeAddr("carol"); a[2] = 5 * ONE;
    }

    function test_pay_distributesToAllRecipients() public {
        (address[] memory r, uint256[] memory a) = legs();
        vm.prank(sender);
        bp.pay{value: 10 * ONE}(r, a, "team lunch");

        assertEq(r[0].balance, 2 * ONE);
        assertEq(r[1].balance, 3 * ONE);
        assertEq(r[2].balance, 5 * ONE);
    }

    function test_pay_emitsEvent() public {
        (address[] memory r, uint256[] memory a) = legs();
        vm.expectEmit(true, false, false, true);
        emit WooshBatchPay.BatchPaid(sender, r, a, "payroll", 10 * ONE);
        vm.prank(sender);
        bp.pay{value: 10 * ONE}(r, a, "payroll");
    }

    function test_pay_rejectsValueMismatchUnder() public {
        (address[] memory r, uint256[] memory a) = legs();
        vm.prank(sender);
        vm.expectRevert(bytes("WBP: value mismatch"));
        bp.pay{value: 9 * ONE}(r, a, "");
    }

    function test_pay_rejectsValueMismatchOver() public {
        (address[] memory r, uint256[] memory a) = legs();
        vm.prank(sender);
        vm.expectRevert(bytes("WBP: value mismatch"));
        bp.pay{value: 11 * ONE}(r, a, "");
    }

    function test_pay_rejectsLengthMismatch() public {
        address[] memory r = new address[](2);
        uint256[] memory a = new uint256[](3);
        r[0] = makeAddr("a"); r[1] = makeAddr("b");
        a[0] = ONE; a[1] = ONE; a[2] = ONE;
        vm.prank(sender);
        vm.expectRevert(bytes("WBP: length mismatch"));
        bp.pay{value: 3 * ONE}(r, a, "");
    }

    function test_pay_rejectsEmptyBatch() public {
        address[] memory r = new address[](0);
        uint256[] memory a = new uint256[](0);
        vm.prank(sender);
        vm.expectRevert(bytes("WBP: bad batch size"));
        bp.pay{value: 0}(r, a, "");
    }

    function test_pay_rejectsTooManyRecipients() public {
        address[] memory r = new address[](21);
        uint256[] memory a = new uint256[](21);
        uint256 total;
        for (uint256 i = 0; i < 21; i++) {
            r[i] = makeAddr(string(abi.encodePacked("p", i)));
            a[i] = ONE;
            total += ONE;
        }
        vm.prank(sender);
        vm.expectRevert(bytes("WBP: bad batch size"));
        bp.pay{value: total}(r, a, "");
    }

    function test_pay_rejectsZeroRecipient() public {
        address[] memory r = new address[](2);
        uint256[] memory a = new uint256[](2);
        r[0] = address(0); r[1] = makeAddr("b");
        a[0] = ONE; a[1] = ONE;
        vm.prank(sender);
        vm.expectRevert(bytes("WBP: zero recipient"));
        bp.pay{value: 2 * ONE}(r, a, "");
    }

    function test_pay_rejectsZeroAmount() public {
        address[] memory r = new address[](2);
        uint256[] memory a = new uint256[](2);
        r[0] = makeAddr("a"); r[1] = makeAddr("b");
        a[0] = ONE; a[1] = 0;
        vm.prank(sender);
        vm.expectRevert(bytes("WBP: zero amount"));
        bp.pay{value: ONE}(r, a, "");
    }

    function test_pay_revertsEntireBatchOnOneFailingLeg() public {
        RejectingRecipient bad = new RejectingRecipient();
        address[] memory r = new address[](2);
        uint256[] memory a = new uint256[](2);
        r[0] = makeAddr("good"); a[0] = ONE;
        r[1] = address(bad);     a[1] = ONE;

        uint256 senderBalanceBefore = sender.balance;
        vm.prank(sender);
        vm.expectRevert(bytes("WBP: leg failed"));
        bp.pay{value: 2 * ONE}(r, a, "");

        // Nothing moved: the good leg's transfer was rolled back with the revert.
        assertEq(r[0].balance, 0);
        assertEq(sender.balance, senderBalanceBefore);
    }

    function test_pay_noStateLeftBetweenCalls() public {
        // Stateless: the contract's own balance is always zero before and after.
        (address[] memory r, uint256[] memory a) = legs();
        vm.prank(sender);
        bp.pay{value: 10 * ONE}(r, a, "");
        assertEq(address(bp).balance, 0);
    }
}
