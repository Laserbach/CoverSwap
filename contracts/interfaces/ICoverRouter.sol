// SPDX-License-Identifier: None
pragma solidity ^0.7.5;

import "./ICover.sol";
import "./ICoverERC20.sol";
import "./IERC20.sol";
import "./IProtocol.sol";

/**
 * @title CoverRouter interface
 * @author crypto-pumpkin@github
 */
interface ICoverRouter {
  function poolForPair(address _covToken, address _pairedToken) external view returns (address);

  // owner only
  function setPoolForPair(address _covToken, address _pairedToken, address _newPool) external;
  function setPoolsForPairs(address[] memory _covTokens, address[] memory _pairedTokens, address[] memory _newPools) external;
}
