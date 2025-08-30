const { ethers } = require('hardhat');
require('dotenv').config();

async function main() {
  const MOCK_USDT = '0x52e7Dd194b695B4148020862f5DaB38072438d31';
  
  const [signer] = await ethers.getSigners();
  console.log('Getting USDT for:', signer.address);
  
  const mockUSDT = await ethers.getContractAt('MockUSDT', MOCK_USDT);
  
  // Check current balance
  const currentBalance = await mockUSDT.balanceOf(signer.address);
  const decimals = await mockUSDT.decimals();
  console.log(`Current USDT balance: ${ethers.formatUnits(currentBalance, decimals)}`);
  
  // Use faucet to get 10,000 USDT
  console.log('\nUsing faucet to get 10,000 USDT...');
  const tx = await mockUSDT.faucet();
  await tx.wait();
  
  // Check new balance
  const newBalance = await mockUSDT.balanceOf(signer.address);
  console.log(`New USDT balance: ${ethers.formatUnits(newBalance, decimals)}`);
  console.log(`Received: ${ethers.formatUnits(newBalance - currentBalance, decimals)} USDT`);
  
  console.log('\n✅ You now have USDT for testing the FairFlip dApp!');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });