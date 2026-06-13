// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title WooshInvoiceRegistry
/// @notice On-chain payment requests ("invoices"). A request is identified by
///         id = keccak256(abi.encode(payee, amount, nonce)) — derived from its own
///         terms. Paying a different amount yields a different id, so it can never
///         mark the real request paid. The contract custodies nothing: it forwards
///         the exact native amount to the payee and records that the request was
///         settled, emitting a canonical event. Status (`paid[id]`) is the source of
///         truth — no off-chain bookkeeping, no Blockscout amount-matching heuristics.
contract WooshInvoiceRegistry {
    /// @notice True once the request with this id has been paid in full.
    mapping(bytes32 => bool) public paid;

    event InvoicePaid(
        bytes32 indexed id,
        address indexed payee,
        address indexed payer,
        uint256 amount,
        uint256 nonce
    );

    /// @notice Deterministic id for a request. Same terms => same id.
    function invoiceId(address payee, uint256 amount, uint256 nonce)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(payee, amount, nonce));
    }

    /// @notice Pay a request. Reverts unless msg.value exactly equals the requested
    ///         amount, and unless the request hasn't already been settled.
    function pay(address payee, uint256 amount, uint256 nonce) external payable {
        require(amount > 0, "WIR: zero amount");
        require(msg.value == amount, "WIR: wrong amount");

        bytes32 id = invoiceId(payee, amount, nonce);
        require(!paid[id], "WIR: already paid");

        paid[id] = true; // effect before interaction — reentrancy-safe

        (bool ok, ) = payable(payee).call{value: msg.value}("");
        require(ok, "WIR: forward failed");

        emit InvoicePaid(id, payee, msg.sender, amount, nonce);
    }
}
