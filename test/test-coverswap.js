const { assert } = require("chai");

const wethAddr = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const balPoolAddrDaiWeth = "0x9b208194acc0a8ccb2a8dcafeacfbb7dcc093f81";

let dai;
const daiAddr = "0x6b175474e89094c44da98b954eedeac495271d0f";
let yDai;
const yDaiAddr = "0x16de59092dAE5CcF4A1E6439D611fd0653f0Bd01";

// Coverages
const protocolFactory = "0xedfC81Bf63527337cD2193925f9C0cF2D537AccA";
const bFactoryAddr = "0x9424B1412450D0f8Fc2255FAf6046b98213B76Bd";
const claimPools = ["0xdfe5ead7bd050eb74009e7717000eeadcf0f18db", "0xb9efee79155b4bd6d06dd1a4c8babde306960bab", "0xe7f5b65126dd3cfe341313d1e9fa5c6d8865c652", "0xbad3ca7e741f785a05d7b3394db79fcc4b6d85af", "0x6cd4eaae3b61a04002e5543382f2b4b1a364871d", "0x94bcc44db60fca1c6442fa6b0684d54c0a1ada4f"];
const noClaimPools = ["0xd9b92e84b9f96267bf548cfe3a3ae21773872138", "0x0490b8bc5898eac3e41857d560f0a58aa393321e", "0x64dd4573297dd5ce7199a5d31a5be185e8d8c80d", "0xa553c12ab7682efda28c47fdd832247d62788273", "0x4533c2377522c61fc9c6efd3e6a3abe1b2b44022", "0x8e0b1cd5d32477b3d7fb2da9d7f66a2ac7223f0f"];
const coverageNames = ["CURVE", "AAVE", "PICKLE", "BADGER", "MUSHROOMS", "PERP"];
const coverAddr = ["0x5104f23653df6695D9d2B91c952F47F9ffbDE744", "0x8ce9e9c8d6ebb919ca7db573737d7c4acdd904f8", "0xa20604463cb1a618e76ab131517d7cb589b70faa", "0x2078b0d5184c5c0725a5673ebc33b5bbf92269e4", "0x104ef919d365cd02973a745bb00fbad93b305eea", "0xb0e011f5baae39a49280dd4c6487c17c1166f300"];
const pairedTokenAddr = [daiAddr, daiAddr, daiAddr, daiAddr, daiAddr, daiAddr];
const protocolAddr = ["0xc89432064d7cb658be730498dc07f1d850d6a867", "0x1246c212c68e44ededbd802ce43de38745c817c0", "0x345563971c01f6d4aad78b32e39808d894d036a4", "0x268c5809eab85598ed5537d54692e72ddb3598d6", "0x9014aa3d6ea5ae2a449f75913603000f93cf8181", "0x893678cee1089576e15a2cad576a85466d386a15"];

let factory;
let redeemFeeNumerator;
let redeemFeeDenominator;
let coverSwap;
let coverRouter;
let coverages = [];
let cover;
let protocol;
let timestamp;
let collateral;
let coverageMap = new Map();
let claimAddr;
let noClaimAddr;

describe("### Acquire DAI", function() {
  before(async () => {
    this.timeout(40000);
    deployer = ethers.provider.getSigner(0);

    const CoverRouter = await ethers.getContractFactory("CoverRouter");
    coverRouter = await CoverRouter.deploy(protocolFactory, bFactoryAddr);
    await coverRouter.deployed();

    const BalancerSwap = await ethers.getContractFactory("BalancerSwap");
    balancerWethDai = await BalancerSwap.deploy(balPoolAddrDaiWeth,daiAddr,wethAddr);
    await balancerWethDai.deployed();

    const CoverSwap = await ethers.getContractFactory("CoverSwap");
    coverSwap = await CoverSwap.deploy(coverRouter.address);
    await coverSwap.deployed();

    factory = await ethers.getContractAt("IProtocolFactory", protocolFactory);
    redeemFeeNumerator = await factory.redeemFeeNumerator();
    redeemFeeDenominator = await factory.redeemFeeDenominator();

    dai = await ethers.getContractAt("IERC20", daiAddr);
    yDai = await ethers.getContractAt("IERC20", yDaiAddr);
  });

  it("should allow to swap ETH for DAI via Balancer (ETH - WETH - DAI)", async function() {
    this.timeout(40000);

    let daiAmountMint = 10000;
    daiAmountMint = ethers.utils.parseEther(daiAmountMint.toString());

    await balancerWethDai.pay(daiAmountMint, {value: ethers.utils.parseEther("50")});
    let balanceDai = await dai.balanceOf(deployer.getAddress());
    console.log("Minted DAI: " + ethers.utils.formatEther(balanceDai).toString());
  });
});

describe("### Cover-Swap: Setup", () => {
  it("should fetch data for 6 coverages (3 DAI based, 3 yDAI based) and set pools-mapping", async function() {
    this.timeout(100000);

    // create coverage mapping and feed CoverRouter
    for (let i=0; i < coverageNames.length; i++) {
      cover = await ethers.getContractAt("ICover", coverAddr[i]);
      protocol = await ethers.getContractAt("IProtocol", protocolAddr[i]);
      timestamp = await cover.expirationTimestamp();
      collateral = await cover.collateral();
      coverages[i] = {
          protocolAddr: protocolAddr[i],
          coverAddr: coverAddr[i],
          collateralAddr: collateral,
          timestamp: timestamp,
          pairedToken: pairedTokenAddr[i]
        };
      await coverageMap.set(coverageNames[i], coverages[i]);

      // register pools in CoverRouter
      claimAddr = await cover.claimCovToken();
      noClaimAddr = await cover.noclaimCovToken();
      await coverRouter.setPoolForPair(claimAddr, pairedTokenAddr[i], claimPools[i]);
      await coverRouter.setPoolForPair(noClaimAddr, pairedTokenAddr[i], noClaimPools[i]);
    }

    // check mapping
    for (var [key, value] of coverageMap.entries()) {
      console.log(" ### "+key+" ###")
      console.log(value);
      console.log("=======================")
    }
  });
});

describe("### Cover-Swap: swap between DAI-DAI pairs", () => {
  it("it should mint coverage and add liquidity for CURVE", async function() {
    this.timeout(200000);


    let balanceDai = await dai.balanceOf(deployer.getAddress());
    let [mintAmount, claimPairedTokenAmt, noclaimPairedTokenAmt] = await calcAmounts("CURVE", balanceDai);

    let txApprove = await dai.approve(coverSwap.address, balanceDai);
    await txApprove.wait();

    // // check calcs (DAI balance = Mint + TP-Claim + TP-Noclaim)
    // console.log("DAI balance: "+ethers.utils.formatEther(balanceDai));
    // console.log("Mint amount: "+mintAmount);
    // console.log("TP claim amount: "+claimPairedTokenAmt);
    // console.log("TP noclaim amount: "+noclaimPairedTokenAmt);

    await coverSwap.addCoverAndAddLiquidity(
      coverageMap.get("CURVE").protocolAddr,
      coverageMap.get("CURVE").collateralAddr,
      coverageMap.get("CURVE").timestamp,
      ethers.utils.parseEther(mintAmount.toString()),
      coverageMap.get("CURVE").pairedToken,
      ethers.utils.parseEther(claimPairedTokenAmt.toString()),
      ethers.utils.parseEther(noclaimPairedTokenAmt.toString()),
      true,
      true
    );

    // fetch balances
    balanceDai = await dai.balanceOf(deployer.getAddress());
    console.log(" ===================================")
    console.log(">> User balances after CURVE MarketMaking");
    console.log("DAI balance: "+ethers.utils.formatEther(balanceDai));
    await logCoverageBalance("CURVE");
  });

  it("it should swap coverage from CURVE to AAVE", async function() {
    this.timeout(200000);

    // CURVE swap data (from)
    let [balanceClaimBpt, balanceNoclaimBpt, redeemAmt, pairedTokenAmt, claimBpt, noclaimBpt] = await getBptData("CURVE");

    // AAVE swap data (to)
    let [claimPairedTokenAmt, noclaimPairedTokenAmt, mintAmount] = await calcSwapMints("AAVE", redeemAmt, pairedTokenAmt);

    let txApprove = await claimBpt.approve(coverSwap.address, balanceClaimBpt);
    await txApprove.wait();

    txApprove = await noclaimBpt.approve(coverSwap.address, balanceNoclaimBpt);
    await txApprove.wait();

    await coverSwap.swapCoverage(
      coverageMap.get("CURVE").coverAddr,
      coverageMap.get("CURVE").pairedToken,
      balanceClaimBpt,
      balanceNoclaimBpt,
      coverageMap.get("AAVE").protocolAddr,
      coverageMap.get("AAVE").collateralAddr,
      coverageMap.get("AAVE").timestamp,
      coverageMap.get("AAVE").pairedToken,
      ethers.utils.parseEther(claimPairedTokenAmt.toString()),
      ethers.utils.parseEther(noclaimPairedTokenAmt.toString()),
      ethers.utils.parseEther(mintAmount.toString()),
      true
    );

    // fetch balances
    let balanceDai = await dai.balanceOf(deployer.getAddress());
    console.log(" ===================================")
    console.log(">> User balances after CURVE-AAVE swap");
    console.log("DAI balance: "+ethers.utils.formatEther(balanceDai));
    await logCoverageBalance("CURVE");
    await logCoverageBalance("AAVE");
  });

  it("it should swap coverage from AAVE to PICKLE", async function() {
    this.timeout(200000);

    // AAVE swap data (from)
    let [balanceClaimBpt, balanceNoclaimBpt, redeemAmt, pairedTokenAmt, claimBpt, noclaimBpt] = await getBptData("AAVE");

    // PICKLE swap data (to)
    let [claimPairedTokenAmt, noclaimPairedTokenAmt, mintAmount] = await calcSwapMints("PICKLE", redeemAmt, pairedTokenAmt);

    let txApprove = await claimBpt.approve(coverSwap.address, balanceClaimBpt);
    await txApprove.wait();

    txApprove = await noclaimBpt.approve(coverSwap.address, balanceNoclaimBpt);
    await txApprove.wait();

    await coverSwap.swapCoverage(
      coverageMap.get("AAVE").coverAddr,
      coverageMap.get("AAVE").pairedToken,
      balanceClaimBpt,
      balanceNoclaimBpt,
      coverageMap.get("PICKLE").protocolAddr,
      coverageMap.get("PICKLE").collateralAddr,
      coverageMap.get("PICKLE").timestamp,
      coverageMap.get("PICKLE").pairedToken,
      ethers.utils.parseEther(claimPairedTokenAmt.toString()),
      ethers.utils.parseEther(noclaimPairedTokenAmt.toString()),
      ethers.utils.parseEther(mintAmount.toString()),
      true
    );

    // fetch balances
    let balanceDai = await dai.balanceOf(deployer.getAddress());
    console.log(" ===================================")
    console.log(">> User balances after AAVE-PICKLE swap");
    console.log("DAI balance: "+ethers.utils.formatEther(balanceDai));
    await logCoverageBalance("AAVE");
    await logCoverageBalance("PICKLE");
  });
});

describe("### Cover-Swap: Switch from DAI to yDAI", () => {
  it("should remove liquidity from PICKLE", async function() {
    this.timeout(100000);

    const [claimPool, noclaimPool, claimTokenAddr, noclaimTokenAddr] = await getCovPools("PICKLE");

    const claimBpt = await ethers.getContractAt("IERC20", claimPool.address);
    const balanceClaimBpt = await claimBpt.balanceOf(deployer.getAddress());
    const noclaimBpt = await ethers.getContractAt("IERC20", noclaimPool.address);
    const balanceNoclaimBpt = await noclaimBpt.balanceOf(deployer.getAddress());

    let txApprove = await claimBpt.approve(coverSwap.address, balanceClaimBpt);
    await txApprove.wait();

    txApprove = await noclaimBpt.approve(coverSwap.address, balanceNoclaimBpt);
    await txApprove.wait();

    await coverSwap.removeAndRedeem(
      coverageMap.get("PICKLE").coverAddr,
      coverageMap.get("PICKLE").pairedToken,
      balanceClaimBpt,
      balanceNoclaimBpt
    );

    // fetch balances
    let balanceDai = await dai.balanceOf(deployer.getAddress());
    console.log(" ===================================")
    console.log(">> User balances after removing liquidity from PICKLE");
    console.log("DAI balance: "+ethers.utils.formatEther(balanceDai));
    await logCoverageBalance("PICKLE");
  });

  it("should swap all DAI to yDAI", async function() {
    this.timeout(100000);

    let txApprove = await dai.approve(yDaiAddr, dai.balanceOf(deployer.getAddress()));
    await txApprove.wait();

    await yDai.deposit(dai.balanceOf(deployer.getAddress()));

    // fetch balances
    let balanceDai = await dai.balanceOf(deployer.getAddress());
    let balanceYDai = await yDai.balanceOf(deployer.getAddress());
    console.log(" ===================================")
    console.log(">> User balances after DAI - yDAI swap");
    console.log("DAI balance: "+ethers.utils.formatEther(balanceDai));
    console.log("yDAI balance: "+ethers.utils.formatEther(balanceYDai));
  });
});


describe("### Cover-Swap: swap between yDAI-yDAI pairs", () => {
  it("it should mint coverage and add liquidity for BADGER", async function() {
    this.timeout(200000);

    let balanceYDai = await yDai.balanceOf(deployer.getAddress());
    const [claimPairedTokenAmt, noclaimPairedTokenAmt] = await getPtAmounts("BADGER", balanceYDai);

    // providing additional DAI for LP
    let ptAmountToProvide = claimPairedTokenAmt + noclaimPairedTokenAmt + 0.1; // mitigate rounding errors
    ptAmountToProvide = ethers.utils.parseEther(ptAmountToProvide.toString());
    await balancerWethDai.pay(ptAmountToProvide, {value: ethers.utils.parseEther("10")});

    let txApprove = await dai.approve(coverSwap.address, ptAmountToProvide);
    await txApprove.wait();

    txApprove = await yDai.approve(coverSwap.address, balanceYDai);
    await txApprove.wait();

    await coverSwap.addCoverAndAddLiquidity(
      coverageMap.get("BADGER").protocolAddr,
      coverageMap.get("BADGER").collateralAddr,
      coverageMap.get("BADGER").timestamp,
      balanceYDai,
      coverageMap.get("BADGER").pairedToken,
      ethers.utils.parseEther(claimPairedTokenAmt.toString()),
      ethers.utils.parseEther(noclaimPairedTokenAmt.toString()),
      true,
      true
    );

    // fetch balances
    balanceYDai = await yDai.balanceOf(deployer.getAddress());
    console.log(" ===================================")
    console.log(">> User balances after BADGER MarketMaking");
    console.log("yDAI balance: "+ethers.utils.formatEther(balanceYDai));
    await logCoverageBalance("BADGER");
  });

  it("it should swap coverage from BADGER to MUSHROOMS", async function() {
    this.timeout(200000);

    // BADGER swap data (from)
    let [balanceClaimBpt, balanceNoclaimBpt, redeemAmt, pairedTokenAmt, claimBpt, noclaimBpt] = await getBptData("BADGER");

    // MUSHROOMS swap data (to)
    let [claimPairedTokenAmt, noclaimPairedTokenAmt, mintAmount] = await calcSwapMints("MUSHROOMS", redeemAmt, pairedTokenAmt);

    let txApprove = await claimBpt.approve(coverSwap.address, balanceClaimBpt);
    await txApprove.wait();

    txApprove = await noclaimBpt.approve(coverSwap.address, balanceNoclaimBpt);
    await txApprove.wait();

    await coverSwap.swapCoverage(
      coverageMap.get("BADGER").coverAddr,
      coverageMap.get("BADGER").pairedToken,
      balanceClaimBpt,
      balanceNoclaimBpt,
      coverageMap.get("MUSHROOMS").protocolAddr,
      coverageMap.get("MUSHROOMS").collateralAddr,
      coverageMap.get("MUSHROOMS").timestamp,
      coverageMap.get("MUSHROOMS").pairedToken,
      ethers.utils.parseEther(claimPairedTokenAmt.toString()),
      ethers.utils.parseEther(noclaimPairedTokenAmt.toString()),
      ethers.utils.parseEther(mintAmount.toString()),
      true
    );

    // fetch balances
    const balanceYDai = await yDai.balanceOf(deployer.getAddress());
    console.log(" ===================================")
    console.log(">> User balances after BADGER-MUSHROOMS swap");
    console.log("yDAI balance: "+ethers.utils.formatEther(balanceYDai));
    await logCoverageBalance("BADGER");
    await logCoverageBalance("MUSHROOMS");
  });

  it("it should swap coverage from MUSHROOMS to PERP", async function() {
    this.timeout(200000);

    // MUSHROOMS swap data (from)
    let [balanceClaimBpt, balanceNoclaimBpt, redeemAmt, pairedTokenAmt, claimBpt, noclaimBpt] = await getBptData("MUSHROOMS");

    // PERP swap data (to)
    let [claimPairedTokenAmt, noclaimPairedTokenAmt, mintAmount] = await calcSwapMints("PERP", redeemAmt, pairedTokenAmt);

    let txApprove = await claimBpt.approve(coverSwap.address, balanceClaimBpt);
    await txApprove.wait();

    txApprove = await noclaimBpt.approve(coverSwap.address, balanceNoclaimBpt);
    await txApprove.wait();

    await coverSwap.swapCoverage(
      coverageMap.get("MUSHROOMS").coverAddr,
      coverageMap.get("MUSHROOMS").pairedToken,
      balanceClaimBpt,
      balanceNoclaimBpt,
      coverageMap.get("PERP").protocolAddr,
      coverageMap.get("PERP").collateralAddr,
      coverageMap.get("PERP").timestamp,
      coverageMap.get("PERP").pairedToken,
      ethers.utils.parseEther(claimPairedTokenAmt.toString()),
      ethers.utils.parseEther(noclaimPairedTokenAmt.toString()),
      ethers.utils.parseEther(mintAmount.toString()),
      true
    );

    // fetch balances
    const balanceYDai = await yDai.balanceOf(deployer.getAddress());
    console.log(" ===================================")
    console.log(">> User balances after MUSHROOMS-PERP swap");
    console.log("yDAI balance: "+ethers.utils.formatEther(balanceYDai));
    await logCoverageBalance("MUSHROOMS");
    await logCoverageBalance("PERP");
  });
});

describe("### Cover-Swap: Switch from yDAI back to DAI", () => {
  it("should remove liquidity from PERP", async function() {
    this.timeout(100000);

    const [claimPool, noclaimPool, claimTokenAddr, noclaimTokenAddr] = await getCovPools("PERP");

    const claimBpt = await ethers.getContractAt("IERC20", claimPool.address);
    const balanceClaimBpt = await claimBpt.balanceOf(deployer.getAddress());
    const noclaimBpt = await ethers.getContractAt("IERC20", noclaimPool.address);
    const balanceNoclaimBpt = await noclaimBpt.balanceOf(deployer.getAddress());

    let txApprove = await claimBpt.approve(coverSwap.address, balanceClaimBpt);
    await txApprove.wait();

    txApprove = await noclaimBpt.approve(coverSwap.address, balanceNoclaimBpt);
    await txApprove.wait();

    await coverSwap.removeAndRedeem(
      coverageMap.get("PERP").coverAddr,
      coverageMap.get("PERP").pairedToken,
      balanceClaimBpt,
      balanceNoclaimBpt
    );

    // fetch balances
    const balanceYDai = await yDai.balanceOf(deployer.getAddress());
    console.log(" ===================================")
    console.log(">> User balances after removing liquidity from PERP");
    console.log("yDAI balance: "+ethers.utils.formatEther(balanceYDai));
    await logCoverageBalance("PERP");
  });

  it("should swap all yDAI back to DAI", async function() {
    this.timeout(100000);

    let txApprove = await yDai.approve(yDaiAddr, yDai.balanceOf(deployer.getAddress()));
    await txApprove.wait();

    await yDai.withdraw(yDai.balanceOf(deployer.getAddress()));

    // fetch balances
    let balanceDai = await dai.balanceOf(deployer.getAddress());
    let balanceYDai = await yDai.balanceOf(deployer.getAddress());
    console.log(" ===================================")
    console.log(">> User balances after yDAI DAI swap");
    console.log("DAI balance: "+ethers.utils.formatEther(balanceDai));
    console.log("yDAI balance: "+ethers.utils.formatEther(balanceYDai));
  });
});
// get withdraw coverage data
async function getBptData(coverage) {
    let [claimPool, noclaimPool, claimTokenAddr, noclaimTokenAddr] = await getCovPools(coverage);

    let claimBpt = await ethers.getContractAt("IERC20", claimPool.address);
    let balanceClaimBpt = await claimBpt.balanceOf(deployer.getAddress());
    let noclaimBpt = await ethers.getContractAt("IERC20", noclaimPool.address);
    let balanceNoclaimBpt = await noclaimBpt.balanceOf(deployer.getAddress());

    // calc max redeem amount
    let claimPoolCovBal = await claimPool.getBalance(claimTokenAddr);
    let claimPoolPTBal = await claimPool.getBalance(coverageMap.get(coverage).pairedToken);
    let claimPoolBptSupply = await claimPool.totalSupply();

    let noclaimPoolCovBal = await noclaimPool.getBalance(noclaimTokenAddr);
    let noclaimPoolPTBal = await noclaimPool.getBalance(coverageMap.get(coverage).pairedToken);
    let noclaimPoolBptSupply = await noclaimPool.totalSupply();

    const claimAmt = ethers.utils.formatEther(claimPoolCovBal) * ethers.utils.formatEther(balanceClaimBpt) / ethers.utils.formatEther(claimPoolBptSupply);
    const noclaimAmt = ethers.utils.formatEther(noclaimPoolCovBal) * ethers.utils.formatEther(balanceNoclaimBpt) / ethers.utils.formatEther(noclaimPoolBptSupply);

    // paired token amount = exit pool + swap remaining cov tokens
    let ptAmt = ethers.utils.formatEther(claimPoolPTBal) * ethers.utils.formatEther(balanceClaimBpt) / ethers.utils.formatEther(claimPoolBptSupply)
    + ethers.utils.formatEther(noclaimPoolPTBal) * ethers.utils.formatEther(balanceNoclaimBpt) / ethers.utils.formatEther(noclaimPoolBptSupply);

    let redeemAmt = claimAmt >= noclaimAmt ? noclaimAmt : claimAmt;

    // swap leftover cov if available and add to PT-amount
    if((claimAmt + 1) < noclaimAmt){
      const amtToSwap = Math.floor(noclaimAmt - claimAmt);
      let poolWeightNoclaim = await noclaimPool.getNormalizedWeight(noclaimTokenAddr);
      let poolWeightPt = await noclaimPool.getNormalizedWeight(coverageMap.get(coverage).pairedToken);
      let swapfee = await noclaimPool.getSwapFee();
      let swapPtAmt = await noclaimPool.calcOutGivenIn(
        noclaimPoolCovBal,
        poolWeightNoclaim,
        noclaimPoolPTBal,
        poolWeightPt,
        ethers.utils.parseEther(amtToSwap.toString()),
        swapfee);
      ptAmt += ethers.formatEther(swapPtAmt);
    } else if ((noclaimAmt + 1) < claimAmt){
      const amtToSwap = Math.floor(claimAmt - noclaimAmt);
      let poolWeightClaim = await claimPool.getNormalizedWeight(claimTokenAddr);
      let poolWeightPt = await claimPool.getNormalizedWeight(coverageMap.get(coverage).pairedToken);
      let swapfee = await claimPool.getSwapFee();
      let swapPtAmt = await claimPool.calcOutGivenIn(
        claimPoolCovBal,
        poolWeightClaim,
        claimPoolPTBal,
        poolWeightPt,
        ethers.utils.parseEther(amtToSwap.toString()),
        swapfee);
      ptAmt += ethers.formatEther(swapPtAmt);
    }
    return [balanceClaimBpt, balanceNoclaimBpt, redeemAmt, ptAmt, claimBpt, noclaimBpt];
}

// calculates the mint amount and paired token amounts for the target Coverages
// checks if pairedToken amount is enough to LP in the new coverage, adjusts minting amount if more pairedTokens are needed
async function calcSwapMints(coverage, mintAmount, ptAmtIn) {

  // redeem-amount * redeem-fee = max new mint-amount
  const fee = mintAmount * ethers.utils.formatEther(redeemFeeNumerator) / ethers.utils.formatEther(redeemFeeDenominator);
  mintAmount = Math.floor(mintAmount - fee);

  // get bpools
  let [claimPool, noclaimPool, claimTokenAddr, noclaimTokenAddr] = await getCovPools(coverage);

  // calc required pairedToken amounts to LP for given mintAmount
  let claimPoolCovBal = await claimPool.getBalance(claimTokenAddr);
  let claimPoolPTBal = await claimPool.getBalance(coverageMap.get(coverage).pairedToken);

  let noclaimPoolCovBal = await noclaimPool.getBalance(noclaimTokenAddr);
  let noclaimPoolPTBal = await noclaimPool.getBalance(coverageMap.get(coverage).pairedToken);

  const claimPairedTokenAmt = ethers.utils.formatEther(claimPoolPTBal) * mintAmount / ethers.utils.formatEther(claimPoolCovBal);
  const noclaimPairedTokenAmt = ethers.utils.formatEther(noclaimPoolPTBal) * mintAmount / ethers.utils.formatEther(noclaimPoolCovBal);
  const requiredPTAmt = claimPairedTokenAmt + noclaimPairedTokenAmt;

  // console.log("Available PT amount: "+ptAmtIn);
  // console.log("Required PT amount: "+requiredPTAmt);

  // reduce mintAmount in case required PT amount is too large
  if(requiredPTAmt > ptAmtIn) {
    mintAmount = mintAmount * ptAmtIn / requiredPTAmt;
  }

  return [claimPairedTokenAmt, noclaimPairedTokenAmt, mintAmount];
}

// simplified calculation that only works if Collateral == Paired Token (as example CURVE)
async function calcAmounts(coverage, collateralAmt) {
  // get bpools
  let [claimPool, noclaimPool, claimTokenAddr, noclaimTokenAddr] = await getCovPools(coverage);

  // calc mint amount and tokenPair amounts given certain dai balance
  let claimPoolCovBal = await claimPool.getBalance(claimTokenAddr);
  let claimPoolPTBal = await claimPool.getBalance(coverageMap.get(coverage).pairedToken);

  let noclaimPoolCovBal = await noclaimPool.getBalance(noclaimTokenAddr);
  let noclaimPoolPTBal = await noclaimPool.getBalance(coverageMap.get(coverage).pairedToken);

  const mintAmount = Math.floor(ethers.utils.formatEther(collateralAmt) / ((ethers.utils.formatEther(claimPoolPTBal) / ethers.utils.formatEther(claimPoolCovBal)) + (ethers.utils.formatEther(noclaimPoolPTBal) / ethers.utils.formatEther(noclaimPoolCovBal)) + 1));
  const claimPairedTokenAmt = ethers.utils.formatEther(claimPoolPTBal) * mintAmount / ethers.utils.formatEther(claimPoolCovBal);
  const noclaimPairedTokenAmt = ethers.utils.formatEther(noclaimPoolPTBal) * mintAmount / ethers.utils.formatEther(noclaimPoolCovBal);

  return [mintAmount, claimPairedTokenAmt, noclaimPairedTokenAmt];
}

// simplified calculation that only works if Collateral == Paired Token (as example CURVE)
async function getPtAmounts(coverage, collateralAmt) {
  // get bpools
  let [claimPool, noclaimPool, claimTokenAddr, noclaimTokenAddr] = await getCovPools(coverage);

  // calc mint amount and tokenPair amounts given certain dai balance
  let claimPoolCovBal = await claimPool.getBalance(claimTokenAddr);
  let claimPoolPTBal = await claimPool.getBalance(coverageMap.get(coverage).pairedToken);

  let noclaimPoolCovBal = await noclaimPool.getBalance(noclaimTokenAddr);
  let noclaimPoolPTBal = await noclaimPool.getBalance(coverageMap.get(coverage).pairedToken);

  const claimPairedTokenAmt = ethers.utils.formatEther(claimPoolPTBal) * ethers.utils.formatEther(collateralAmt) / ethers.utils.formatEther(claimPoolCovBal);
  const noclaimPairedTokenAmt = ethers.utils.formatEther(noclaimPoolPTBal) * ethers.utils.formatEther(collateralAmt) / ethers.utils.formatEther(noclaimPoolCovBal);

  return [claimPairedTokenAmt, noclaimPairedTokenAmt];
}

async function logCoverageBalance(coverage){
  let cover = await ethers.getContractAt("ICover", coverageMap.get(coverage).coverAddr);
  let claimTokenAddr = await cover.claimCovToken();
  let claimPoolAddr = await coverRouter.poolForPair(claimTokenAddr, coverageMap.get(coverage).pairedToken);
  let noclaimTokenAddr = await cover.noclaimCovToken();
  let noclaimPoolAddr = await coverRouter.poolForPair(noclaimTokenAddr, coverageMap.get(coverage).pairedToken);

  let claimToken = await ethers.getContractAt("IERC20", claimTokenAddr);
  let claimBpt = await ethers.getContractAt("IERC20", claimPoolAddr);
  let noclaimToken = await ethers.getContractAt("IERC20", noclaimTokenAddr);
  let noclaimBpt = await ethers.getContractAt("IERC20", noclaimPoolAddr);

  let balanceClaim = await claimToken.balanceOf(deployer.getAddress());
  let balanceClaimBpt = await claimBpt.balanceOf(deployer.getAddress());
  let balanceNoclaim = await noclaimToken.balanceOf(deployer.getAddress());
  let balanceNoclaimBpt = await noclaimBpt.balanceOf(deployer.getAddress());

  console.log(coverage+" CLAIM balance: "+ethers.utils.formatEther(balanceClaim));
  console.log(coverage+" NOCLAIM balance: "+ethers.utils.formatEther(balanceNoclaim));
  console.log(coverage+" CLAIM-BPT balance: "+ethers.utils.formatEther(balanceClaimBpt));
  console.log(coverage+" NOCLAIM-BPT balance: "+ethers.utils.formatEther(balanceNoclaimBpt));
}

async function getCovPools(coverage){
  let cover = await ethers.getContractAt("ICover", coverageMap.get(coverage).coverAddr);
  let claimTokenAddr = await cover.claimCovToken();
  let claimPoolAddr = await coverRouter.poolForPair(claimTokenAddr, coverageMap.get(coverage).pairedToken);
  let claimPool = await ethers.getContractAt("IBPool", claimPoolAddr);

  let noclaimTokenAddr = await cover.noclaimCovToken();
  let noclaimPoolAddr = await coverRouter.poolForPair(noclaimTokenAddr, coverageMap.get(coverage).pairedToken);
  let noclaimPool = await ethers.getContractAt("IBPool", noclaimPoolAddr);

  return [claimPool, noclaimPool, claimTokenAddr, noclaimTokenAddr];
}
