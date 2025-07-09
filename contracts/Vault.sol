// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract Vault {
    address public accessKey;
    bool public isUnlocked;

    constructor(address _accessKey) {
        accessKey = _accessKey;
        isUnlocked = false;
    }

    function unlock() public {
        isUnlocked = true;
    }

    function isVaultUnlocked() public view returns (bool) {
        return isUnlocked;
    }
}