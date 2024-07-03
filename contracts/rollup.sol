// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract OptimisticRollup {
    struct RollupBlock {
        uint256 blockNumber;
        bytes32 previousBlockHash;
        bytes32 stateRoot;
        bytes data;
        uint256 timestamp;
    }

    RollupBlock[] public blocks;
    mapping(uint256 => bool) public isChallenged;

    mapping(address => uint256) public balances;

    uint256 public constant CHALLENGE_PERIOD = 7 days;

    event BlockSubmitted(uint256 blockNumber, bytes32 stateRoot, bytes data, uint256 timestamp);
    event BlockChallenged(uint256 blockNumber, address challenger);

    constructor() {
        // Initial values for the genesis block
        bytes32 genesisStateRoot = 0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef;
        bytes memory genesisData = hex"deadbeef";

        // Create the genesis block with initial values
        blocks.push(RollupBlock({
            blockNumber: 0,
            previousBlockHash: bytes32(0),
            stateRoot: genesisStateRoot,
            data: genesisData,
            timestamp: block.timestamp
        }));
        
        emit BlockSubmitted(0, genesisStateRoot, genesisData, block.timestamp);
    }

    function submitBlock(bytes32 previousBlockHash, bytes32 stateRoot, bytes memory data, address[] memory accounts, uint256[] memory newBalances) public {
        require(accounts.length == newBalances.length, "Accounts and balances length mismatch");
        
        uint256 blockNumber = blocks.length;
        uint256 timestamp = block.timestamp;

        // Update balances
        for (uint256 i = 0; i < accounts.length; i++) {
            balances[accounts[i]] = newBalances[i];
        }

        blocks.push(RollupBlock({
            blockNumber: blockNumber,
            previousBlockHash: previousBlockHash,
            stateRoot: stateRoot,
            data: data,
            timestamp: timestamp
        }));
        
        emit BlockSubmitted(blockNumber, stateRoot, data, timestamp);
    }

    function getBlock(uint256 blockNumber) public view returns (RollupBlock memory) {
        return blocks[blockNumber];
    }

    function getBlockCount() public view returns (uint256) {
        return blocks.length;
    }

    function getBalance(address account) public view returns (uint256) {
        return balances[account];
    }

    // function challengeBlock(uint256 blockNumber, bytes32 correctStateRoot, bytes memory proofData) public {
    //     require(blockNumber < blocks.length, "Invalid block number");
    //     require(!isChallenged[blockNumber], "Block already challenged");

    //     RollupBlock memory blockToChallenge = blocks[blockNumber];
    //     require(block.timestamp <= blockToChallenge.timestamp + CHALLENGE_PERIOD, "Challenge period has ended");

    //     // Add your verification logic here to validate proofData
    //     require(blockToChallenge.stateRoot != correctStateRoot, "Block is correct");

    //     isChallenged[blockNumber] = true;

    //     emit BlockChallenged(blockNumber, msg.sender);
    // }
}