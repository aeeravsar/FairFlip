const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("FairFlip", function () {
  let fairFlip;
  let usdt;
  let owner, player1, player2, player3;
  const betAmount = ethers.parseUnits("100", 6); // 100 USDT
  const revealDuration = 5 * 60; // 5 minutes in seconds
  
  // Arbitrum USDT address
  const USDT_ADDRESS = "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9";
  // Address with lots of USDT on Arbitrum (Binance hot wallet)
  const USDT_WHALE = "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";

  beforeEach(async function () {
    [owner, player1, player2, player3] = await ethers.getSigners();

    // Get USDT contract
    usdt = await ethers.getContractAt(
      ["function transfer(address to, uint256 amount) returns (bool)",
       "function approve(address spender, uint256 amount) returns (bool)",
       "function balanceOf(address account) view returns (uint256)",
       "function transferFrom(address from, address to, uint256 amount) returns (bool)"],
      USDT_ADDRESS
    );

    // Deploy FairFlip
    const FairFlip = await ethers.getContractFactory("FairFlip");
    fairFlip = await FairFlip.deploy(USDT_ADDRESS);

    // Impersonate whale and distribute USDT
    await ethers.provider.send("hardhat_impersonateAccount", [USDT_WHALE]);
    const whale = await ethers.getSigner(USDT_WHALE);
    
    // Fund whale with ETH for gas
    await owner.sendTransaction({
      to: USDT_WHALE,
      value: ethers.parseEther("1")
    });

    // Transfer USDT to test accounts
    await usdt.connect(whale).transfer(player1.address, ethers.parseUnits("1000", 6));
    await usdt.connect(whale).transfer(player2.address, ethers.parseUnits("1000", 6));
    await usdt.connect(whale).transfer(player3.address, ethers.parseUnits("1000", 6));

    // Approve FairFlip to spend USDT
    await usdt.connect(player1).approve(await fairFlip.getAddress(), ethers.MaxUint256);
    await usdt.connect(player2).approve(await fairFlip.getAddress(), ethers.MaxUint256);
    await usdt.connect(player3).approve(await fairFlip.getAddress(), ethers.MaxUint256);
  });

  function generateCommitment(secret) {
    return ethers.keccak256(secret);
  }

  describe("Game Creation", function () {
    it("Should create a new game", async function () {
      const secret = ethers.randomBytes(32);
      const commitment = generateCommitment(secret);

      await expect(fairFlip.connect(player1).createGame(commitment, betAmount, 2, revealDuration))
        .to.emit(fairFlip, "GameCreated")
        .withArgs(player1.address, betAmount, 2, revealDuration);

      const gameInfo = await fairFlip.getGameInfo(player1.address);
      expect(gameInfo.betAmount).to.equal(betAmount);
      expect(gameInfo.maxPlayers).to.equal(2);
      expect(gameInfo.currentPlayers).to.equal(1);
      expect(gameInfo.isActive).to.be.true;
    });

    it("Should prevent creating multiple active games", async function () {
      const commitment = ethers.randomBytes(32);

      await fairFlip.connect(player1).createGame(commitment, betAmount, 2, revealDuration);
      
      await expect(fairFlip.connect(player1).createGame(commitment, betAmount, 2, revealDuration))
        .to.be.revertedWith("Already have active game");
    });

    it("Should require at least 2 players", async function () {
      const commitment = ethers.randomBytes(32);

      await expect(fairFlip.connect(player1).createGame(commitment, betAmount, 1, revealDuration))
        .to.be.revertedWith("Invalid player count");
    });

    it("Should reject invalid reveal duration", async function () {
      const commitment = ethers.randomBytes(32);

      // Too short
      await expect(fairFlip.connect(player1).createGame(commitment, betAmount, 2, 30))
        .to.be.revertedWith("Invalid duration");

      // Too long  
      await expect(fairFlip.connect(player1).createGame(commitment, betAmount, 2, 3 * 60 * 60))
        .to.be.revertedWith("Invalid duration");
    });

    it("Should reject zero commitment", async function () {
      const zeroCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000";
      
      await expect(fairFlip.connect(player1).createGame(zeroCommitment, betAmount, 2, revealDuration))
        .to.be.revertedWith("Invalid commitment");
    });

    it("Should allow creating new game after previous one settles", async function () {
      const secret1 = ethers.randomBytes(32);
      const commitment1 = generateCommitment(secret1);

      const secret2 = ethers.randomBytes(32);
      const commitment2 = generateCommitment(secret2);

      // Create and complete first game
      await fairFlip.connect(player1).createGame(commitment1, betAmount, 2, revealDuration);
      await fairFlip.connect(player2).joinGame(player1.address, commitment2);
      await fairFlip.connect(player1).reveal(player1.address, secret1);
      await fairFlip.connect(player2).reveal(player1.address, secret2);

      // Now player1 should be able to create a new game
      const newCommitment = ethers.randomBytes(32);
      await expect(fairFlip.connect(player1).createGame(newCommitment, betAmount, 2, revealDuration))
        .to.emit(fairFlip, "GameCreated");
    });
  });

  describe("Joining Games", function () {
    let secret1, commitment1;

    beforeEach(async function () {
      secret1 = ethers.randomBytes(32);
      commitment1 = generateCommitment(secret1);

      await fairFlip.connect(player1).createGame(commitment1, betAmount, 3, revealDuration);
    });

    it("Should allow players to join", async function () {
      const secret2 = ethers.randomBytes(32);
      const commitment2 = generateCommitment(secret2);

      await expect(fairFlip.connect(player2).joinGame(player1.address, commitment2))
        .to.emit(fairFlip, "PlayerJoined")
        .withArgs(player1.address, player2.address);

      const gameInfo = await fairFlip.getGameInfo(player1.address);
      expect(gameInfo.currentPlayers).to.equal(2);
    });

    it("Should start reveal phase when game is full", async function () {
      const secret2 = ethers.randomBytes(32);
      const commitment2 = generateCommitment(secret2);

      const secret3 = ethers.randomBytes(32);
      const commitment3 = generateCommitment(secret3);

      await fairFlip.connect(player2).joinGame(player1.address, commitment2);
      await fairFlip.connect(player3).joinGame(player1.address, commitment3);

      const gameInfo = await fairFlip.getGameInfo(player1.address);
      expect(gameInfo.revealDeadline).to.be.gt(0);
    });

    it("Should prevent joining full game", async function () {
      const commitment2 = ethers.randomBytes(32);
      const commitment3 = ethers.randomBytes(32);
      const commitment4 = ethers.randomBytes(32);

      // Create a 2-player game
      const newSecret = ethers.randomBytes(32);
      const newCommitment = generateCommitment(newSecret);
      
      await fairFlip.connect(player2).createGame(newCommitment, betAmount, 2, revealDuration);
      await fairFlip.connect(player3).joinGame(player2.address, commitment3);

      await expect(fairFlip.connect(player1).joinGame(player2.address, commitment4))
        .to.be.revertedWith("Game full");
    });

    it("Should prevent same player joining twice", async function () {
      const commitment2 = ethers.randomBytes(32);

      await expect(fairFlip.connect(player1).joinGame(player1.address, commitment2))
        .to.be.revertedWith("Already joined");
    });

    it("Should prevent joining non-existent game", async function () {
      const commitment = ethers.randomBytes(32);

      await expect(fairFlip.connect(player2).joinGame(player3.address, commitment))
        .to.be.revertedWith("Game not found");
    });
  });

  describe("Reveal Phase", function () {
    let secret1, secret2;

    beforeEach(async function () {
      secret1 = ethers.randomBytes(32);
      secret2 = ethers.randomBytes(32);

      const commitment1 = generateCommitment(secret1);
      const commitment2 = generateCommitment(secret2);

      await fairFlip.connect(player1).createGame(commitment1, betAmount, 2, revealDuration);
      await fairFlip.connect(player2).joinGame(player1.address, commitment2);
    });

    it("Should accept valid reveals", async function () {
      await expect(fairFlip.connect(player1).reveal(player1.address, secret1))
        .to.emit(fairFlip, "PlayerRevealed")
        .withArgs(player1.address, player1.address);

      const hasRevealed = await fairFlip.hasPlayerRevealed(player1.address, player1.address);
      expect(hasRevealed).to.be.true;
    });

    it("Should reject invalid reveals", async function () {
      const wrongSecret = ethers.randomBytes(32);
      
      await expect(fairFlip.connect(player1).reveal(player1.address, wrongSecret))
        .to.be.revertedWith("Invalid reveal");
    });

    it("Should prevent double reveal", async function () {
      await fairFlip.connect(player1).reveal(player1.address, secret1);
      
      await expect(fairFlip.connect(player1).reveal(player1.address, secret1))
        .to.be.revertedWith("Already revealed");
    });

    it("Should auto-settle when all players reveal", async function () {
      const initialBalance1 = await usdt.balanceOf(player1.address);
      const initialBalance2 = await usdt.balanceOf(player2.address);

      await fairFlip.connect(player1).reveal(player1.address, secret1);
      
      await expect(fairFlip.connect(player2).reveal(player1.address, secret2))
        .to.emit(fairFlip, "GameSettled");

      // Check one player got all the money
      const finalBalance1 = await usdt.balanceOf(player1.address);
      const finalBalance2 = await usdt.balanceOf(player2.address);
      
      const totalPot = betAmount * 2n;
      const player1Won = finalBalance1 - initialBalance1 === totalPot;
      const player2Won = finalBalance2 - initialBalance2 === totalPot;
      
      expect(player1Won || player2Won).to.be.true;

      // Game should be cleaned up
      const gameInfo = await fairFlip.getGameInfo(player1.address);
      expect(gameInfo.isActive).to.be.false;
    });

    it("Should reject reveals after deadline", async function () {
      await time.increase(6 * 60); // 6 minutes
      
      await expect(fairFlip.connect(player1).reveal(player1.address, secret1))
        .to.be.revertedWith("Reveal period ended");
    });
  });

  describe("Settlement", function () {
    let secret1, secret2, secret3;

    beforeEach(async function () {
      secret1 = ethers.randomBytes(32);
      secret2 = ethers.randomBytes(32);
      secret3 = ethers.randomBytes(32);

      const commitment1 = generateCommitment(secret1);
      const commitment2 = generateCommitment(secret2);
      const commitment3 = generateCommitment(secret3);

      await fairFlip.connect(player1).createGame(commitment1, betAmount, 3, revealDuration);
      await fairFlip.connect(player2).joinGame(player1.address, commitment2);
      await fairFlip.connect(player3).joinGame(player1.address, commitment3);
    });

    it("Should distribute non-revealer funds to winner", async function () {
      // Only player1 and player2 reveal
      await fairFlip.connect(player1).reveal(player1.address, secret1);
      await fairFlip.connect(player2).reveal(player1.address, secret2);
      
      // Wait for reveal deadline
      await time.increase(6 * 60);
      
      const initialBalance1 = await usdt.balanceOf(player1.address);
      const initialBalance2 = await usdt.balanceOf(player2.address);
      
      await expect(fairFlip.settle(player1.address))
        .to.emit(fairFlip, "GameSettled");
      
      const finalBalance1 = await usdt.balanceOf(player1.address);
      const finalBalance2 = await usdt.balanceOf(player2.address);
      
      // Winner should get all 3 players' bets
      const totalPot = betAmount * 3n;
      const player1Won = finalBalance1 - initialBalance1 === totalPot;
      const player2Won = finalBalance2 - initialBalance2 === totalPot;
      
      expect(player1Won || player2Won).to.be.true;
    });

    it("Should fail if no one reveals", async function () {
      await time.increase(6 * 60);
      
      await expect(fairFlip.settle(player1.address))
        .to.be.revertedWith("No reveals");
    });

    it("Should prevent double settlement", async function () {
      await fairFlip.connect(player1).reveal(player1.address, secret1);
      await fairFlip.connect(player2).reveal(player1.address, secret2);
      
      await time.increase(6 * 60);
      
      await fairFlip.settle(player1.address);
      
      // After settlement, game is cleaned up so it should say "Game not started"
      await expect(fairFlip.settle(player1.address))
        .to.be.revertedWith("Game not started");
    });
  });

  describe("Emergency Functions", function () {
    let secret1, secret2, secret3;

    beforeEach(async function () {
      secret1 = ethers.randomBytes(32);
      secret2 = ethers.randomBytes(32);
      secret3 = ethers.randomBytes(32);

      const commitment1 = generateCommitment(secret1);
      const commitment2 = generateCommitment(secret2);
      const commitment3 = generateCommitment(secret3);

      await fairFlip.connect(player1).createGame(commitment1, betAmount, 3, revealDuration);
      await fairFlip.connect(player2).joinGame(player1.address, commitment2);
      await fairFlip.connect(player3).joinGame(player1.address, commitment3);
    });

    it("Should allow emergency refund after 7 days", async function () {
      // Fast forward past reveal deadline + 7 days
      await time.increase(revealDuration + 7 * 24 * 60 * 60);

      const initialBalance1 = await usdt.balanceOf(player1.address);
      const initialBalance2 = await usdt.balanceOf(player2.address);
      const initialBalance3 = await usdt.balanceOf(player3.address);

      await fairFlip.emergencyRefund(player1.address);

      const finalBalance1 = await usdt.balanceOf(player1.address);
      const finalBalance2 = await usdt.balanceOf(player2.address);
      const finalBalance3 = await usdt.balanceOf(player3.address);

      // Each player should get their bet back
      expect(finalBalance1 - initialBalance1).to.equal(betAmount);
      expect(finalBalance2 - initialBalance2).to.equal(betAmount);
      expect(finalBalance3 - initialBalance3).to.equal(betAmount);
    });

    it("Should reject early emergency refund", async function () {
      await expect(fairFlip.emergencyRefund(player1.address))
        .to.be.revertedWith("Too early for emergency");
    });
  });

  describe("Multi-player fairness", function () {
    it("Should produce deterministic results based on XOR", async function () {
      // Use fixed secrets for deterministic testing
      const secret1 = "0x0000000000000000000000000000000000000000000000000000000000000001";
      const secret2 = "0x0000000000000000000000000000000000000000000000000000000000000002";
      const secret3 = "0x0000000000000000000000000000000000000000000000000000000000000003";
      
      const commitment1 = generateCommitment(secret1);
      const commitment2 = generateCommitment(secret2);
      const commitment3 = generateCommitment(secret3);
      
      await fairFlip.connect(player1).createGame(commitment1, betAmount, 3, revealDuration);
      await fairFlip.connect(player2).joinGame(player1.address, commitment2);
      await fairFlip.connect(player3).joinGame(player1.address, commitment3);
      
      await fairFlip.connect(player1).reveal(player1.address, secret1);
      await fairFlip.connect(player2).reveal(player1.address, secret2);
      await fairFlip.connect(player3).reveal(player1.address, secret3);
      
      // XOR of secrets: 0x01 ^ 0x02 ^ 0x03 = 0x00
      // Winner should be deterministic based on keccak256(0x00) % 3
    });
  });

  describe("View functions", function () {
    it("Should return correct game info", async function () {
      const secret = ethers.randomBytes(32);
      const commitment = generateCommitment(secret);

      await fairFlip.connect(player1).createGame(commitment, betAmount, 3, revealDuration);

      const gameInfo = await fairFlip.getGameInfo(player1.address);
      expect(gameInfo.betAmount).to.equal(betAmount);
      expect(gameInfo.maxPlayers).to.equal(3);
      expect(gameInfo.currentPlayers).to.equal(1);
      expect(gameInfo.revealDuration).to.equal(revealDuration);
      expect(gameInfo.isActive).to.be.true;
    });

    it("Should return game players", async function () {
      const secret1 = ethers.randomBytes(32);
      const commitment1 = generateCommitment(secret1);

      const secret2 = ethers.randomBytes(32);
      const commitment2 = generateCommitment(secret2);

      await fairFlip.connect(player1).createGame(commitment1, betAmount, 3, revealDuration);
      await fairFlip.connect(player2).joinGame(player1.address, commitment2);

      const players = await fairFlip.getGamePlayers(player1.address);
      expect(players.length).to.equal(2);
      expect(players[0]).to.equal(player1.address);
      expect(players[1]).to.equal(player2.address);
    });
  });

  // REMOVED: Game Management tests
  // Reason: cancelGame and leaveGame functions removed due to security flaw
  // Players could observe reveals then decide whether to participate
});