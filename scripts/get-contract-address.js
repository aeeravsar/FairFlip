const hre = require("hardhat");

async function main() {
  const txHash = "0xf5f811f7da16e7c59b1dda3993288defc3d1083b9761474b8b60030f093e7ed6";
  
  console.log("Getting contract address from transaction:", txHash);
  
  const receipt = await hre.ethers.provider.getTransactionReceipt(txHash);
  
  if (receipt) {
    console.log("Contract deployed to:", receipt.contractAddress);
    console.log("Gas used:", receipt.gasUsed.toString());
    console.log("Status:", receipt.status === 1 ? "SUCCESS" : "FAILED");
    console.log("Block number:", receipt.blockNumber);
    
    console.log("\n=== Update Frontend Config ===");
    console.log("In frontend/src/config/contracts.js, update:");
    console.log(`FAIRFLIP: { 11155111: '${receipt.contractAddress}' }`);
  } else {
    console.log("Transaction receipt not found");
  }
}

main().catch(console.error);