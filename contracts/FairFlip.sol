// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
}

contract FairFlip is ReentrancyGuard {
    struct Game {
        uint256 betAmount;
        uint256 maxPlayers;
        uint256 revealDuration;
        uint256 revealDeadline;
        address[] players;
        mapping(address => bytes32) commits;
        mapping(address => bytes32) secrets;
    }

    mapping(address => Game) public games;
    IERC20 public immutable usdt;
    
    // Security constraints
    uint256 public constant MIN_REVEAL_DURATION = 1 minutes;
    uint256 public constant MAX_REVEAL_DURATION = 2 hours;
    uint256 public constant MIN_PLAYERS = 2;
    uint256 public constant MAX_PLAYERS = 16;

    event GameCreated(address indexed creator, uint256 betAmount, uint256 maxPlayers, uint256 revealDuration);
    event PlayerJoined(address indexed creator, address indexed player);
    event PlayerRevealed(address indexed creator, address indexed player);
    event GameSettled(address indexed creator, address indexed winner, uint256 payout);

    constructor(address _usdt) {
        require(_usdt != address(0), "Invalid USDT address");
        usdt = IERC20(_usdt);
    }

    function createGame(
        bytes32 commitHash,
        uint256 betAmount,
        uint256 maxPlayers,
        uint256 revealDuration
    ) external nonReentrant {
        require(games[msg.sender].betAmount == 0, "Already have active game");
        require(maxPlayers >= MIN_PLAYERS && maxPlayers <= MAX_PLAYERS, "Invalid player count");
        require(betAmount > 0, "Invalid bet");
        require(revealDuration >= MIN_REVEAL_DURATION && revealDuration <= MAX_REVEAL_DURATION, "Invalid duration");
        require(commitHash != bytes32(0), "Invalid commitment");
        
        require(usdt.transferFrom(msg.sender, address(this), betAmount), "Transfer failed");
        
        Game storage game = games[msg.sender];
        game.betAmount = betAmount;
        game.maxPlayers = maxPlayers;
        game.revealDuration = revealDuration;
        game.players.push(msg.sender);
        game.commits[msg.sender] = commitHash;
        
        emit GameCreated(msg.sender, betAmount, maxPlayers, revealDuration);
    }

    function joinGame(address creator, bytes32 commitHash) external nonReentrant {
        require(creator != address(0), "Invalid creator");
        require(commitHash != bytes32(0), "Invalid commitment");
        
        Game storage game = games[creator];
        require(game.betAmount > 0, "Game not found");
        require(game.players.length < game.maxPlayers, "Game full");
        require(game.commits[msg.sender] == bytes32(0), "Already joined");
        require(game.revealDeadline == 0, "Game already started");
        
        require(usdt.transferFrom(msg.sender, address(this), game.betAmount), "Transfer failed");
        
        game.players.push(msg.sender);
        game.commits[msg.sender] = commitHash;
        
        if (game.players.length == game.maxPlayers) {
            game.revealDeadline = block.timestamp + game.revealDuration;
        }
        
        emit PlayerJoined(creator, msg.sender);
    }

    // REMOVED: cancelGame and leaveGame functions
    // Reason: Major security flaw - players could observe reveals then decide to leave
    // Once committed, players must reveal or forfeit their funds

    function reveal(address creator, bytes32 secret) external nonReentrant {
        require(creator != address(0), "Invalid creator");
        require(secret != bytes32(0), "Invalid secret");
        
        Game storage game = games[creator];
        require(game.commits[msg.sender] != bytes32(0), "Not a player");
        require(game.secrets[msg.sender] == bytes32(0), "Already revealed");
        require(game.revealDeadline > 0, "Game not started");
        require(block.timestamp <= game.revealDeadline, "Reveal period ended");
        
        bytes32 commitment = keccak256(abi.encodePacked(secret));
        require(commitment == game.commits[msg.sender], "Invalid reveal");
        
        game.secrets[msg.sender] = secret;
        
        emit PlayerRevealed(creator, msg.sender);
        
        if (_allRevealed(game)) {
            _settle(creator);
        }
    }

    function settle(address creator) external nonReentrant {
        require(creator != address(0), "Invalid creator");
        
        Game storage game = games[creator];
        require(game.revealDeadline > 0, "Game not started");
        require(block.timestamp > game.revealDeadline, "Reveal period not ended");
        require(game.betAmount > 0, "Already settled");
        
        _settle(creator);
    }

    function _settle(address creator) private {
        Game storage game = games[creator];
        
        address[] memory revealers = new address[](game.players.length);
        uint256 revealerCount = 0;
        bytes32 combinedSecret = bytes32(0);
        
        for (uint256 i = 0; i < game.players.length; i++) {
            address player = game.players[i];
            if (game.secrets[player] != bytes32(0)) {
                revealers[revealerCount] = player;
                revealerCount++;
                combinedSecret = bytes32(uint256(combinedSecret) ^ uint256(game.secrets[player]));
            }
        }
        
        require(revealerCount > 0, "No reveals");
        
        uint256 winnerIndex = uint256(keccak256(abi.encode(combinedSecret))) % revealerCount;
        address winner = revealers[winnerIndex];
        
        uint256 totalPot = game.betAmount * game.players.length;
        
        // Clean up game state before transfer (CEI pattern)
        _cleanupGame(creator);
        
        require(usdt.transfer(winner, totalPot), "Payout failed");
        
        emit GameSettled(creator, winner, totalPot);
    }

    function _cleanupGame(address creator) private {
        Game storage game = games[creator];
        
        // Clear mappings for all players
        for (uint256 i = 0; i < game.players.length; i++) {
            address player = game.players[i];
            delete game.commits[player];
            delete game.secrets[player];
        }
        delete game.players;
        
        // Reset game struct
        game.betAmount = 0;
        game.maxPlayers = 0;
        game.revealDuration = 0;
        game.revealDeadline = 0;
    }

    function _allRevealed(Game storage game) private view returns (bool) {
        for (uint256 i = 0; i < game.players.length; i++) {
            if (game.secrets[game.players[i]] == bytes32(0)) {
                return false;
            }
        }
        return true;
    }

    // Emergency function - only callable if game is stuck
    function emergencyRefund(address creator) external nonReentrant {
        Game storage game = games[creator];
        require(game.betAmount > 0, "No active game");
        require(game.revealDeadline > 0, "Game not started");
        require(block.timestamp > game.revealDeadline + 7 days, "Too early for emergency");
        
        // Refund all players proportionally
        uint256 refundAmount = game.betAmount;
        address[] memory players = game.players;
        
        _cleanupGame(creator);
        
        for (uint256 i = 0; i < players.length; i++) {
            require(usdt.transfer(players[i], refundAmount), "Refund failed");
        }
    }

    // View functions for frontend
    function getGamePlayers(address creator) external view returns (address[] memory) {
        return games[creator].players;
    }

    function getGameInfo(address creator) external view returns (
        uint256 betAmount,
        uint256 maxPlayers,
        uint256 currentPlayers,
        uint256 revealDuration,
        uint256 revealDeadline,
        bool isActive,
        bool isRevealing
    ) {
        Game storage game = games[creator];
        return (
            game.betAmount,
            game.maxPlayers,
            game.players.length,
            game.revealDuration,
            game.revealDeadline,
            game.betAmount > 0,
            game.revealDeadline > 0 && block.timestamp <= game.revealDeadline
        );
    }

    function hasPlayerRevealed(address creator, address player) external view returns (bool) {
        return games[creator].secrets[player] != bytes32(0);
    }

    function getRevealerCount(address creator) external view returns (uint256) {
        Game storage game = games[creator];
        uint256 count = 0;
        for (uint256 i = 0; i < game.players.length; i++) {
            if (game.secrets[game.players[i]] != bytes32(0)) {
                count++;
            }
        }
        return count;
    }
}