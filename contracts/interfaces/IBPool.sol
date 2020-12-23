// SPDX-License-Identifier: None

pragma solidity ^0.7.5;

import "./IERC20.sol";

interface IBPool is IERC20 {
    function getFinalTokens() external view returns(address[] memory);
    function getDenormalizedWeight(address token) external view returns (uint256);
    function setSwapFee(uint256 swapFee) external;
    function setController(address controller) external;
    function finalize() external;
    function bind(address token, uint256 balance, uint256 denorm) external;
    function getBalance(address token) external view returns (uint);
    function joinPool(uint256 poolAmountOut, uint256[] calldata maxAmountsIn) external;
    function exitPool(uint256 poolAmountIn, uint256[] calldata minAmountsOut) external;
    function exitswapPoolAmountIn(address tokenOut, uint256 poolAmountIn, uint256 minAmountOut) external returns (uint256 tokenAmountOut);
    function swapExactAmountIn(address tokenIn, uint256 tokenAmountIn, address tokenOut, uint256 minAmountOut, uint256 maxPrice) external returns (uint256 tokenAmountOut, uint256 spotPriceAfter);
    function getTotalDenormalizedWeight() external view returns (uint256);
    function getSwapFee() external view returns (uint256);
    function totalSupply() external override view returns (uint256);
    function calcOutGivenIn(uint256 tokenBalanceIn, uint256 tokenWeightIn, uint256 tokenBalanceOut, uint256 tokenWeightOut, uint256 tokenAmountIn, uint256 swapFee) external pure returns (uint256 tokenAmountOut);
    function getNormalizedWeight(address token) external view returns (uint256);
}
