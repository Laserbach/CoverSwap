// SPDX-License-Identifier: None
pragma solidity ^0.7.5;

import "./interfaces/IBFactory.sol";
import "./interfaces/IBPool.sol";
import "./interfaces/ICover.sol";
import "./interfaces/ICoverERC20.sol";
import "./interfaces/ICoverRouter.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IProtocol.sol";
import "./utils/Ownable.sol";
import "./utils/SafeERC20.sol";
import "./utils/SafeMath.sol";

/**
 * @title CoverRouter for Cover Protocol, handles balancer activities
 * @author crypto-pumpkin@github
 */
contract CoverRouter is Ownable {
  using SafeERC20 for IBPool;
  using SafeERC20 for ICoverERC20;
  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  address public protocolFactory;
  IBFactory public bFactory;
  uint256 public constant TOTAL_WEIGHT = 50 ether;
  uint256 public claimCovTokenWeight = 40 ether;
  uint256 public noclaimCovTokenWeight = 49 ether;
  uint256 public claimSwapFee = 0.02 ether;
  uint256 public noclaimSwapFee = 0.01 ether;
  mapping(bytes32 => address) private pools;

  constructor(address _protocolFactory, IBFactory _bFactory) {
    protocolFactory = _protocolFactory;
    bFactory = _bFactory;
  }

  function poolForPair(address _covToken, address _pairedToken) external view returns (address) {
    bytes32 pairKey = _pairKeyForPair(_covToken, _pairedToken);
    return pools[pairKey];
  }

  function setPoolForPair(address _covToken, address _pairedToken, address _newPool) public {
    _validCovToken(_covToken);
    _validBalPoolTokens(_covToken, _pairedToken, IBPool(_newPool));

    bytes32 pairKey = _pairKeyForPair(_covToken, _pairedToken);
    pools[pairKey] = _newPool;
  }

  function setPoolsForPairs(address[] memory _covTokens, address[] memory _pairedTokens, address[] memory _newPools) external {
    require(_covTokens.length == _pairedTokens.length, "CoverRouter: Paired tokens length not equal");
    require(_covTokens.length == _newPools.length, "CoverRouter: Pools length not equal");

    for (uint256 i = 0; i < _covTokens.length; i++) {
      setPoolForPair(_covTokens[i], _pairedTokens[i], _newPools[i]);
    }
  }

  function _pairKeyForPair(address _covToken, address _pairedToken) internal view returns (bytes32 pairKey) {
    (address token0, address token1) = _covToken < _pairedToken ? (_covToken, _pairedToken) : (_pairedToken, _covToken);
    pairKey = keccak256(abi.encodePacked(
      protocolFactory,
      token0,
      token1
    ));
  }

  /// @notice make covToken is from Cover Protocol Factory
  function _validCovToken(address _covToken) private view {
    require(_covToken != address(0), "CoverRouter: covToken is 0 address");

    ICover cover = ICover(ICoverERC20(_covToken).owner());
    address tokenProtocolFactory = IProtocol(cover.owner()).owner();
    require(tokenProtocolFactory == protocolFactory, "CoverRouter: wrong factory");
  }

  function _validBalPoolTokens(address _covToken, address _pairedToken, IBPool _pool) private view {
    require(_pairedToken != _covToken, "CoverRouter: same token");
    address[] memory tokens = _pool.getFinalTokens();
    require(tokens.length == 2, "CoverRouter: Too many tokens in pool");
    require((_covToken == tokens[0] && _pairedToken == tokens[1]) || (_pairedToken == tokens[0] && _covToken == tokens[1]), "CoverRouter: tokens don't match");
  }
}
