// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title WooshSlugRegistry
/// @notice Maps human-readable slugs to wallet addresses on Arc.
///         Each address can hold exactly one slug; slugs are permanent once registered.
contract WooshSlugRegistry {
    mapping(string => address) public slugToAddress;
    mapping(address => string) public addressToSlug;

    /// @notice The address allowed to call registerFor (set to deployer).
    address public immutable registrar;

    event SlugRegistered(string indexed slug, address indexed owner);

    constructor() {
        registrar = msg.sender;
    }

    /// @notice Register a slug directly for msg.sender (self-registration).
    function register(string calldata slug) external {
        _register(slug, msg.sender);
    }

    /// @notice Register a slug on behalf of an owner. Only callable by registrar.
    function registerFor(address owner, string calldata slug) external {
        require(msg.sender == registrar, "Not authorized");
        _register(slug, owner);
    }

    /// @notice Check whether a slug can be registered.
    function isAvailable(string calldata slug) external view returns (bool) {
        if (!_isValid(slug)) return false;
        return slugToAddress[slug] == address(0);
    }

    function _register(string calldata slug, address owner) internal {
        require(_isValid(slug), "Invalid slug");
        require(slugToAddress[slug] == address(0), "Slug already taken");
        require(bytes(addressToSlug[owner]).length == 0, "Address already has a slug");

        slugToAddress[slug] = owner;
        addressToSlug[owner] = slug;

        emit SlugRegistered(slug, owner);
    }

    /// @dev Validates slug format: 3–32 chars, [a-z0-9_] only.
    function _isValid(string calldata slug) internal pure returns (bool) {
        bytes memory b = bytes(slug);
        uint256 len = b.length;
        if (len < 3 || len > 32) return false;
        for (uint256 i = 0; i < len; i++) {
            bytes1 c = b[i];
            bool ok = (c >= 0x61 && c <= 0x7a) // a-z
                   || (c >= 0x30 && c <= 0x39) // 0-9
                   || c == 0x5f;               // _
            if (!ok) return false;
        }
        return true;
    }
}
