// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title WooshInvoiceRegistry
/// @notice On-chain payment requests ("invoices"). The creator registers the invoice
///         on-chain — amount, memo and payee are STORED here, set by the creator and
///         immutable. The shared link carries only the invoice id; the payer reads the
///         authoritative amount/memo from this contract, so nothing in the URL can be
///         tampered with. pay() enforces the exact stored amount and forwards it to the
///         payee. The contract custodies nothing between create and pay.
contract WooshInvoiceRegistry {
    struct Invoice {
        address payee;     // who gets paid (the creator)
        uint256 amount;    // exact native amount required (wei, 18 decimals on Arc)
        bool    paid;
        address payer;     // who paid (0x0 until paid)
        string  memo;      // what it's for, set by creator, shown to payer
        uint64  createdAt; // block timestamp at creation
    }

    // id => invoice. id = keccak256(abi.encode(creator, salt)) so a creator's ids
    // can't be squatted by anyone else.
    mapping(bytes32 => Invoice) private _invoices;

    // creator => their invoice ids, so the client can list "my requests" straight
    // from the chain (by payee) instead of any off-chain bookkeeping.
    mapping(address => bytes32[]) private _byCreator;

    event InvoiceCreated(bytes32 indexed id, address indexed payee, uint256 amount, string memo);
    event InvoicePaid(bytes32 indexed id, address indexed payee, address indexed payer, uint256 amount);

    /// @notice Deterministic id for a creator's request. Same (creator, salt) => same id.
    function invoiceId(address creator, uint256 salt) public pure returns (bytes32) {
        return keccak256(abi.encode(creator, salt));
    }

    /// @notice Register a payment request. Stores amount + memo under the caller's id.
    function create(uint256 salt, uint256 amount, string calldata memo) external returns (bytes32 id) {
        require(amount > 0, "WIR: zero amount");
        id = invoiceId(msg.sender, salt);
        require(_invoices[id].payee == address(0), "WIR: id exists");
        _invoices[id] = Invoice({ payee: msg.sender, amount: amount, paid: false, payer: address(0), memo: memo, createdAt: uint64(block.timestamp) });
        _byCreator[msg.sender].push(id);
        emit InvoiceCreated(id, msg.sender, amount, memo);
    }

    /// @notice Pay a registered request. msg.value must equal the stored amount.
    function pay(bytes32 id) external payable {
        Invoice storage inv = _invoices[id];
        require(inv.payee != address(0), "WIR: no invoice");
        require(!inv.paid, "WIR: already paid");
        require(msg.value == inv.amount, "WIR: wrong amount");

        inv.paid = true;          // effect before interaction — reentrancy-safe
        inv.payer = msg.sender;

        (bool ok, ) = payable(inv.payee).call{value: msg.value}("");
        require(ok, "WIR: forward failed");

        emit InvoicePaid(id, inv.payee, msg.sender, inv.amount);
    }

    /// @notice Read an invoice. payee == 0x0 means it doesn't exist.
    function getInvoice(bytes32 id)
        external
        view
        returns (address payee, uint256 amount, bool paid, address payer, string memory memo, uint64 createdAt)
    {
        Invoice storage inv = _invoices[id];
        return (inv.payee, inv.amount, inv.paid, inv.payer, inv.memo, inv.createdAt);
    }

    /// @notice All invoice ids created by `creator`, newest last. For the client's
    ///         "my requests" list — read straight from chain, no off-chain store.
    function getInvoiceIds(address creator) external view returns (bytes32[] memory) {
        return _byCreator[creator];
    }
}

