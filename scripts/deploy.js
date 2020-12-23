async function main() {

  // const protocolFactory = "0xedfC81Bf63527337cD2193925f9C0cF2D537AccA";
  //
  // const CoverMarketMakers = await hre.ethers.getContractFactory("CoverMarketMakers");
  // const marketmaker = await CoverMarketMakers.deploy(protocolFactory);
  // await marketmaker.deployed();
  // console.log("CoverMarketMakers deployed to:", marketmaker.address);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
