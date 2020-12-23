// SPDX-License-Identifier: None
pragma solidity ^0.7.5;

import "./interfaces/IBPool.sol";
import "./interfaces/ICover.sol";
import "./interfaces/ICoverERC20.sol";
import "./interfaces/ICoverRouter.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IProtocol.sol";
import "./utils/SafeERC20.sol";
import "./utils/SafeMath.sol";

contract CoverSwap {
  using SafeERC20 for IBPool;
  using SafeERC20 for ICoverERC20;
  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  ICoverRouter public coverRouter;

  constructor(ICoverRouter _coverRouter) {
    coverRouter = _coverRouter;
  }

  function swapCoverage(
    ICover _coverInput,
    IERC20 _pairedTokenInput,
    uint256 _claimBptAmountInput,
    uint256 _noclaimBptAmountInput,
    IProtocol _protocolOutput,
    IERC20 _collateralOutput,
    uint48 _timestampOutput,
    IERC20 _pairedTokenOutput,
    uint256 _claimPTAmtOutput,
    uint256 _noclaimPTAmtOutput,
    uint256 _covTokenAmtOutput,
    bool _addBuffer
    ) external {
      // should support support different collaterals within swap? could reduce to one collateral-token argument
      require(_coverInput.collateral() == address(_collateralOutput), "CoverSwap: collaterals do not match");
      // should handle different paired tokens? could reduce to one paired-token argument
      require(address(_pairedTokenInput) == address(_pairedTokenOutput), "CoverSwap: paired tokens do not match");

      // withdraw liquidity from both balancer pools
      IERC20 claimCovTokenInput = _coverInput.claimCovToken();
      IERC20 noclaimCovTokenInput = _coverInput.noclaimCovToken();
      _exitBPool(claimCovTokenInput, _pairedTokenInput, _claimBptAmountInput);
      _exitBPool(noclaimCovTokenInput, _pairedTokenInput, _noclaimBptAmountInput);

      // redeem collateral and swap leftovers
      _redeemCollateral(_coverInput, address(_pairedTokenInput));

      // add cover & liquidity on new swapCoverage
      addCoverAndAddLiquidity(
        _protocolOutput,
        _collateralOutput,
        _timestampOutput,
        _covTokenAmtOutput,
        _pairedTokenOutput,
        _claimPTAmtOutput,
        _noclaimPTAmtOutput,
        _addBuffer,
        false
        );
    }

  function removeLiquidity(IERC20 _covToken, IERC20 _pairedToken, uint256 _bptAmount) external {
    _exitBPool(_covToken, _pairedToken, _bptAmount);

    _covToken.safeTransfer(msg.sender, _covToken.balanceOf(address(this)));
    _pairedToken.safeTransfer(msg.sender, _pairedToken.balanceOf(address(this)));
  }

  function removeAndRedeem(ICover _cover, address _pairedToken, uint256 _bptAmountClaim, uint256 _bptAmountNoclaim) external {
    IERC20 claimCovToken = _cover.claimCovToken();
    IERC20 noclaimCovToken = _cover.noclaimCovToken();
    IERC20 collateral = IERC20(_cover.collateral());
    IERC20 pairedToken = IERC20(_pairedToken);

    _exitBPool(claimCovToken, pairedToken, _bptAmountClaim);
    _exitBPool(noclaimCovToken, pairedToken, _bptAmountNoclaim);
    _redeemCollateral(_cover, _pairedToken);

    collateral.safeTransfer(msg.sender, collateral.balanceOf(address(this)));
    pairedToken.safeTransfer(msg.sender, pairedToken.balanceOf(address(this)));
    _transferRem(msg.sender, claimCovToken);
    _transferRem(msg.sender, noclaimCovToken);
  }

  function _exitBPool(IERC20 _covToken, IERC20 _pairedToken, uint256 _bptAmount) private {
    require(_bptAmount > 0, "CoverSwap: insufficient covToken");
    address poolAddr = coverRouter.poolForPair(address(_covToken), address(_pairedToken));
    IBPool pool = IBPool(poolAddr);
    require(pool.balanceOf(msg.sender) >= _bptAmount, "CoverSwap: insufficient BPT");

    uint256[] memory minAmountsOut = new uint256[](2);
    minAmountsOut[0] = 0;
    minAmountsOut[1] = 0;

    pool.safeTransferFrom(msg.sender, address(this), _bptAmount);
    pool.exitPool(pool.balanceOf(address(this)), minAmountsOut);
  }

  function _redeemCollateral(ICover cover, address pairedTokenAddr) private {
    // redeem collateral
    IERC20 claimCovToken = cover.claimCovToken();
    IERC20 noclaimCovToken = cover.noclaimCovToken();
    uint256 claimCovTokenBal = claimCovToken.balanceOf(address(this));
    uint256 noclaimCovTokenBal = noclaimCovToken.balanceOf(address(this));
    (uint256 amount, IERC20 remainderCovToken) = (claimCovTokenBal > noclaimCovTokenBal) ? (noclaimCovTokenBal, claimCovToken) : (claimCovTokenBal, noclaimCovToken);
    require(amount > 0, "CoverSwap: insufficient covTokens");
    cover.redeemCollateral(amount);

    // swap remaining covToken for collateral
    if(remainderCovToken.balanceOf(address(this)) > 1 ether) {
      address poolAddr = coverRouter.poolForPair(address(remainderCovToken), pairedTokenAddr);
      IBPool pool = IBPool(poolAddr);
      _swapCovForPairedToken(pool, remainderCovToken, remainderCovToken.balanceOf(address(this)), IERC20(cover.collateral()));
    }
    _transferRem(msg.sender, remainderCovToken);
  }

  function addCoverAndAddLiquidity(
    IProtocol _protocol,
    IERC20 _collateral,
    uint48 _timestamp,
    uint256 _amount,
    IERC20 _pairedToken,
    uint256 _claimPTAmt,
    uint256 _noclaimPTAmt,
    bool _addBuffer,
    bool _external
  ) public {
    require(_amount > 0 && _claimPTAmt > 0 && _noclaimPTAmt > 0, "CoverSwap: amount is 0");
    if(_external){
      _collateral.safeTransferFrom(msg.sender, address(this), _amount);
    }
    _addCover(_protocol, address(_collateral), _timestamp, _amount);

    ICover cover = ICover(_protocol.coverMap(address(_collateral), _timestamp));
    _addLiquidityForCover(msg.sender, cover, _pairedToken, _claimPTAmt, _noclaimPTAmt, _addBuffer, _external);
  }

  function _addCover(
    IProtocol _protocol,
    address _collateral,
    uint48 _timestamp,
    uint256 _amount
  ) private {
    _approve(IERC20(_collateral), address(_protocol), _amount);
    _protocol.addCover(_collateral, _timestamp, _amount);
  }

  function _approve(IERC20 _token, address _spender, uint256 _amount) private {
    if (_token.allowance(address(this), _spender) < _amount) {
      _token.approve(_spender, uint256(-1));
    }
  }

  function _addLiquidityForCover(
    address _account,
    ICover _cover,
    IERC20 _pairedToken,
    uint256 _claimPTAmt,
    uint256 _noclaimPTAmt,
    bool _addBuffer,
    bool _external
  ) private {
    IERC20 claimCovToken = _cover.claimCovToken();
    IERC20 noclaimCovToken = _cover.noclaimCovToken();
    (uint256 claimPTAmt, uint256 noclaimPTAmt) =  _receivePairdTokenAmts(_account, _pairedToken, _claimPTAmt, _noclaimPTAmt, _external);

    _joinPool(_account, claimCovToken, _pairedToken, claimPTAmt, _addBuffer);
    _joinPool(_account, noclaimCovToken, _pairedToken, noclaimPTAmt, _addBuffer);
    _transferRem(_account, _pairedToken);
  }

  function _receivePairdTokenAmts(
    address _account,
    IERC20 _pairedToken,
    uint256 _claimPTAmt,
    uint256 _noclaimPTAmt,
    bool _external
  ) private returns (uint256 receivedClaimPTAmt, uint256 receivedNoclaimPTAmt) {
    uint256 total = _claimPTAmt.add(_noclaimPTAmt);
    if(_external) {
      _pairedToken.safeTransferFrom(_account, address(this), total);
    }
    uint256 bal = _pairedToken.balanceOf(address(this));
    receivedClaimPTAmt = bal.mul(_claimPTAmt).div(total);
    receivedNoclaimPTAmt = bal.mul(_noclaimPTAmt).div(total);
  }

  /// @dev add buffer support (1%) as suggested by balancer doc to help get tx through. https://docs.balancer.finance/smart-contracts/core-contracts/api#joinpool
  function _joinPool(
    address _account,
    IERC20 _covToken,
    IERC20 _pairedToken,
    uint256 _pairedTokenAmount,
    bool _addBuffer
  ) internal {
    address poolAddr = coverRouter.poolForPair(address(_covToken), address(_pairedToken));
    require(poolAddr != address(0), "CoverSwap: pool not found");
    IBPool pool = IBPool(poolAddr);
    uint256 covTokenAmount = _covToken.balanceOf(address(this));
    (uint256 bptAmountOut, uint256[] memory maxAmountsIn) = _getBptAmountOut(pool, address(_covToken), covTokenAmount, address(_pairedToken), _pairedTokenAmount, _addBuffer);
    _approve(_covToken, poolAddr, covTokenAmount);
    _approve(_pairedToken, poolAddr, _pairedTokenAmount);
    pool.joinPool(bptAmountOut, maxAmountsIn);

    pool.safeTransfer(_account, pool.balanceOf(address(this)));
    _transferRem(_account, _covToken);
  }

  function _getBptAmountOut(
    IBPool pool,
    address _covToken,
    uint256 _covTokenAmount,
    address _pairedToken,
    uint256 _pairedTokenAmount,
    bool _addBuffer
  ) private view returns (uint256 bptAmountOut, uint256[] memory maxAmountsIn) {
    uint256 poolAmountOutInCov = _covTokenAmount.mul(pool.totalSupply()).div(pool.getBalance(_covToken));
    uint256 poolAmountOutInPaired = _pairedTokenAmount.mul(pool.totalSupply()).div(pool.getBalance(_pairedToken));
    bptAmountOut = poolAmountOutInCov > poolAmountOutInPaired ? poolAmountOutInPaired : poolAmountOutInCov;
    bptAmountOut = _addBuffer ? bptAmountOut.mul(99).div(100) : bptAmountOut;

    address[] memory tokens = pool.getFinalTokens();
    maxAmountsIn = new uint256[](2);
    maxAmountsIn[0] =  _covTokenAmount;
    maxAmountsIn[1] = _pairedTokenAmount;
    if (tokens[1] == _covToken) {
      maxAmountsIn[0] =  _pairedTokenAmount;
      maxAmountsIn[1] = _covTokenAmount;
    }
  }

  function _transferRem(address _account, IERC20 token) private {
    uint256 rem = token.balanceOf(address(this));
    if (rem > 0) {
      token.safeTransfer(_account, rem);
    }
  }

  function _swapCovForPairedToken(
    IBPool _bPool,
    IERC20 _covToken,
    uint256 _sellAmount,
    IERC20 _collateral
    ) private {
    _approve(_covToken, address(_bPool), _sellAmount);
    IBPool(_bPool).swapExactAmountIn(
        address(_covToken),
        _sellAmount,
        address(_collateral),
        0, // minAmountOut, set to 0 -> sell no matter how low the price of CLAIM tokens are
        uint256(-1) // maxPrice, set to max -> accept any swap prices
    );
  }
}
