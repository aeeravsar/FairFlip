const hre = require("hardhat");

async function main() {
  console.log("Deploying FairFlip to Sepolia Testnet...");

  // Our deployed MockUSDT address
  const USDT_ADDRESS = "0x52e7Dd194b695B4148020862f5DaB38072438d31";

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH");

  // Deploy FairFlip
  const FairFlip = await hre.ethers.getContractFactory("FairFlip");
  const fairFlip = await FairFlip.deploy(USDT_ADDRESS);

  await fairFlip.waitForDeployment();

  const address = await fairFlip.getAddress();
  console.log("FairFlip deployed to:", address);
  console.log("USDT address:", USDT_ADDRESS);

  // Wait for a few block confirmations
  console.log("Waiting for block confirmations...");
  await fairFlip.deploymentTransaction().wait(5);

  // Verify contract on Etherscan
  if (hre.network.name === "sepolia") {
    console.log("Verifying contract on Etherscan...");
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

  console.log("\n=== Deployment Complete ===");
  console.log(`Network: ${hre.network.name}`);
  console.log(`FairFlip: ${address}`);
  console.log(`USDT: ${USDT_ADDRESS}`);
  console.log("\n=== Update Frontend Config ===");
  console.log(`In frontend/src/config/contracts.js, update:`);
  console.log(`FAIRFLIP: { 11155111: '${address}' }`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});