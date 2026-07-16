// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title WooshBatchPay
/// @notice One-off batch payment: pay several recipients native USDC in a single
///         transaction (one PIN). Stateless and non-custodial by design: it never
///         holds funds outside a single call, so a failed leg reverts the whole
///         payment rather than leaving anything stuck.
///         Native USDC on Arc has 18 decimals and is the gas/value token (same model
///         as WooshInvoiceRegistry / WooshStrategyRegistry).
contract WooshBatchPay {
    uint256 private constant MAX_RECIPIENTS = 20;

    event BatchPaid(address indexed from, address[] recipients, uint256[] amounts, string memo, uint256 total);

    /// @notice Pay every (recipients[i], amounts[i]) pair. msg.value must equal the
    ///         exact sum of amounts (no dust left behind, no underfunding). Reverts
    ///         the entire batch if any single leg fails.
    /// @param memo optional user-facing note ("payroll", "team lunch"), emitted only
    function pay(
        address[] calldata recipients,
        uint256[] calldata amounts,
        string calldata memo
    ) external payable {
        require(recipients.length > 0 && recipients.length <= MAX_RECIPIENTS, "WBP: bad batch size");
        require(recipients.length == amounts.length, "WBP: length mismatch");

        uint256 total;
        for (uint256 i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0), "WBP: zero recipient");
            require(amounts[i] > 0, "WBP: zero amount");
            total += amounts[i];
        }
        require(msg.value == total, "WBP: value mismatch");

        emit BatchPaid(msg.sender, recipients, amounts, memo, total);

        for (uint256 i = 0; i < recipients.length; i++) {
            (bool ok, ) = payable(recipients[i]).call{value: amounts[i]}("");
            require(ok, "WBP: leg failed");
        }
    }
}
