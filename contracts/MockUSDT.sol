// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDT is ERC20 {
    uint8 private _decimals;

    constructor() ERC20("Mock USDT", "USDT") {
        _decimals = 6; // USDT has 6 decimals
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    // Public faucet - anyone can get 10,000 USDT for testing
    function faucet() external {
        _mint(msg.sender, 10000 * 10**_decimals);
    }

    // Public mint function - anyone can mint any amount for testing
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
    
    // Mint to caller
    function mint(uint256 amount) external {
        _mint(msg.sender, amount);
    }
}