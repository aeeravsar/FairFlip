const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Checking deployment status for account:", deployer.address);
  console.log("Network:", hre.network.name);

  // Get recent transactions from the deployer account
  const latestBlock = await hre.ethers.provider.getBlockNumber();
  console.log("Latest block:", latestBlock);
  
  // Check last few blocks for contract deployments
  console.log("Checking recent blocks for contract deployments...");
  
  for (let i = 0; i < 10; i++) {
    const blockNumber = latestBlock - i;
    try {
      const block = await hre.ethers.provider.getBlock(blockNumber, true);
      if (block && block.transactions) {
        for (const tx of block.transactions) {
          if (tx.from && tx.from.toLowerCase() === deployer.address.toLowerCase() && tx.to === null) {
            console.log(`\nFound contract deployment in block ${blockNumber}:`);
            console.log("Transaction hash:", tx.hash);
            
            const receipt = await hre.ethers.provider.getTransactionReceipt(tx.hash);
            if (receipt && receipt.contractAddress) {
              console.log("Contract deployed to:", receipt.contractAddress);
              console.log("Gas used:", receipt.gasUsed.toString());
              console.log("Status:", receipt.status === 1 ? "SUCCESS" : "FAILED");
              
              // Try to verify it's a FairFlip contract
              try {
                const code = await hre.ethers.provider.getCode(receipt.contractAddress);
                if (code !== "0x") {
                  console.log("Contract has code - deployment successful!");
                  console.log("\nTo update frontend config:");
                  if (hre.network.name === 'sepolia') {
                    console.log(`FAIRFLIP: { 11155111: '${receipt.contractAddress}' }`);
                  }
                  return receipt.contractAddress;
                }
              } catch (error) {
                console.log("Could not verify contract code");
              }
            }
          }
        }
      }
    } catch (error) {
      console.log(`Error checking block ${blockNumber}:`, error.message);
    }
  }
  
  console.log("No recent contract deployments found");
  return null;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});