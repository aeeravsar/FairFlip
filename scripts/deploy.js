const hre = require("hardhat");

async function main() {
  console.log("Deploying FairFlip to Arbitrum...");

  // Arbitrum USDT address
  const USDT_ADDRESS = "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9";

  // Deploy FairFlip
  const FairFlip = await hre.ethers.getContractFactory("FairFlip");
  const fairFlip = await FairFlip.deploy(USDT_ADDRESS);

  await fairFlip.waitForDeployment();

  const address = await fairFlip.getAddress();
  console.log("FairFlip deployed to:", address);
  console.log("USDT address:", USDT_ADDRESS);

  // Wait for a few block confirmations
  console.log("Waiting for block confirmations...");
  await fairFlip.deploymentTransaction().wait(6);

  // Verify contract on Arbiscan
  if (hre.network.name === "arbitrum" || hre.network.name === "arbitrumSepolia") {
    console.log("Verifying contract on Arbiscan...");
    try {
      await hre.run("verify:verify", {
        address: address,
        constructorArguments: [USDT_ADDRESS],
      });
      console.log("Contract verified!");
    } catch (error) {
      console.log("Verification error:", error.message);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});