const { ethers } = require('hardhat');
require('dotenv').config();

async function main() {
  console.log('Deploying MockUSDT to Sepolia...');
  
  const [deployer] = await ethers.getSigners();
  console.log('Deploying with account:', deployer.address);
  
  // Get balance
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log('Account balance:', ethers.formatEther(balance), 'ETH');
  
  // Deploy MockUSDT
  const MockUSDT = await ethers.getContractFactory('MockUSDT');
  console.log('Deploying MockUSDT...');
  
  const mockUSDT = await MockUSDT.deploy();
  await mockUSDT.waitForDeployment();
  
  const mockUSDTAddress = await mockUSDT.getAddress();
  console.log('MockUSDT deployed to:', mockUSDTAddress);
  
  // Test the faucet function
  console.log('\nTesting faucet function...');
  const tx = await mockUSDT.faucet();
  await tx.wait();
  
  const balance_usdt = await mockUSDT.balanceOf(deployer.address);
  const decimals = await mockUSDT.decimals();
  console.log('Minted:', ethers.formatUnits(balance_usdt, decimals), 'USDT');
  
  console.log('\n=== Deployment Summary ===');
  console.log('MockUSDT Address:', mockUSDTAddress);
  console.log('Deployer:', deployer.address);
  console.log('Network: Sepolia');
  console.log('\n=== Update your config ===');
  console.log(`USDT: {`);
  console.log(`  42161: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', // Arbitrum One`);
  console.log(`  11155111: '${mockUSDTAddress}' // Sepolia MockUSDT`);
  console.log(`},`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });