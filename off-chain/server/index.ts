import express, { Request, Response } from "express";
import { ethers } from "ethers";
import Rollup from "../../artifacts/contracts/rollup.sol/OptimisticRollup.json"; // 스마트 계약 ABI 파일
// import RollupModule from "../../ignition/deployments/chain-11155111/deployed_addresses.json";
import * as dotenv from "dotenv";
dotenv.config({ path: "../../.env" });
import cors from "cors";

dotenv.config();

const AliceState = {
  address: process.env.ALICE_ADDRESS,
  value: 100,
};
const BobState = {
  address: process.env.BOB_ADDRESS,
  value: 100,
};

const app = express();
app.use(express.json());

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const privateKey = process.env.ADMIN_PRIVATE_KEY!;
const wallet = new ethers.Wallet(privateKey, provider);
// const contractAddress = RollupModule["RollupModule#OptimisticRollup"];
const contractAddress = "0x6EAD8D93Dd09e6E68672d8Fb0d8FCaBB1c8e816F";
const contract = new ethers.Contract(contractAddress, Rollup.abi, wallet);

let transactions: {
  transaction: { from: string; to: string; amount: string };
  signature: any;
}[] = [];

const corsOptions = {
  origin: "http://localhost:3000",
  credentials: true, // 자격 증명을 허용하도록 설정
};

app.use(cors(corsOptions));

app.post("/transaction-submit", async (req: Request, res: Response) => {
  const { tokenAddress, tokenABI, account, recipient, amount, signature } =
    req.body;
  console.log("============================================================");
  console.log("Received transaction: ", signature);
  try {
    console.log("Verifying Contract!");
    const tokenContract = new ethers.Contract(tokenAddress, tokenABI, wallet);

    const tx = {
      to: tokenAddress,
      data: tokenContract.interface.encodeFunctionData("transfer", [
        recipient,
        amount,
      ]),
    };

    const domain = {
      name: "Token",
      version: "1",
      chainId: 11155111,
      verifyingContract: tokenAddress,
    };

    const types = {
      Transaction: [
        { name: "to", type: "address" },
        { name: "data", type: "bytes" },
      ],
    };

    const value = {
      to: tx.to,
      data: tx.data,
    };

    const recoverAddress = ethers.verifyTypedData(
      domain,
      types,
      value,
      signature
    );
    console.log("Recovered address: ", recoverAddress);
    console.log(
      "Verifying that the recovered address matches the signed address"
    );
    if (recoverAddress.toLowerCase() === account.toLowerCase()) {
      console.log("Signature is valid!!!");
      const sender =
        account.toLowerCase() === AliceState.address!.toLowerCase()
          ? "Alice"
          : "Bob";
      const receiver =
        account.toLowerCase() === AliceState.address!.toLowerCase()
          ? "Bob"
          : "Alice";

      if (account.toLowerCase() === AliceState.address!.toLowerCase()) {
        AliceState.value -= Number(amount);
        BobState.value += Number(amount);
      } else if (account.toLowerCase() === BobState.address!.toLowerCase()) {
        BobState.value -= Number(amount);
        AliceState.value += Number(amount);
      }

      console.log(
        `Pushing Transaction: ${sender} to ${receiver} ${amount} ETH`
      );
      transactions.push({
        transaction: { from: sender, to: receiver, amount },
        signature,
      });

      console.log("Final State: ");
      console.log("Alice Balance: ", AliceState.value);
      console.log("Bob Balance: ", BobState.value);
      console.log(
        "============================================================"
      );

      res.send("Signature is valid");

      // Check if there are at least 3 transactions and submit the block if true
      if (transactions.length >= 3) {
        try {
          console.log(
            "************************************************************"
          );
          console.log("3 transactions accumulated. Starting block submission.");
          await submitRollupBlock();
          console.log(
            "************************************************************"
          );
        } catch (error) {
          console.error(
            "Failed to submit rollup block after verifying signature:",
            error
          );
        }
      }
    } else {
      res.status(400).send("Invalid signature");
    }
  } catch (error) {
    console.error(error);
    res.status(500).send("Error verifying signature");
  }
});

const submitRollupBlock = async () => {
  try {
    // Fetch the last block to get the previous block hash
    const lastBlockIndex = contract.blocks.length;
    const lastBlock = await contract.blocks(lastBlockIndex);
    const previousBlockHash = ethers.keccak256(
      ethers.solidityPacked(
        ["uint256", "bytes32", "bytes32", "bytes", "uint256"],
        [
          lastBlock.blockNumber,
          lastBlock.previousBlockHash,
          lastBlock.stateRoot,
          lastBlock.data,
          lastBlock.timestamp,
        ]
      )
    );

    // Compute the current state root
    const aliceBalanceHash = ethers.keccak256(
      ethers.solidityPacked(["uint256"], [AliceState.value])
    );
    const bobBalanceHash = ethers.keccak256(
      ethers.solidityPacked(["uint256"], [BobState.value])
    );
    const stateRoot = ethers.keccak256(
      ethers.solidityPacked(
        ["bytes32", "bytes32"],
        [aliceBalanceHash, bobBalanceHash]
      )
    );

    // Serialize transactions
    const data = ethers.hexlify(
      ethers.toUtf8Bytes(JSON.stringify(transactions))
    );

    // Submit the block to the smart contract
    console.log("Submitting rollup block with the following details:");
    console.log("Previous Block Hash:", previousBlockHash);
    console.log("State Root:", stateRoot);
    console.log("Transactions:", transactions);

    const tx = await contract.submitBlock(previousBlockHash, stateRoot, data);
    await tx.wait();

    // Clear the transactions array
    transactions = [];
    console.log("Rollup block submitted successfully");
  } catch (error) {
    console.error("Error submitting rollup block:", error);
    throw error;
  }
};

app.get("/balances", (req: Request, res: Response) => {
  res.json({ alice: AliceState.value, bob: BobState.value });
});

app.get("/transactions", (req: Request, res: Response) => {
  res.json(transactions);
});

app.get("/current-block-number", async (req: Request, res: Response) => {
  try {
    const blockNumber = await contract.getBlockCount();
    res.json({ blockNumber: blockNumber.toString() });
  } catch (error) {
    console.error("Error fetching block number:", error);
    res.status(500).send("Error fetching block number");
  }
});

app.get("/block/:blockNumber", async (req: Request, res: Response) => {
  const { blockNumber } = req.params;
  try {
    const block = await contract.getBlock(blockNumber);
    const data = ethers.toUtf8String(block.data);
    const transactions = JSON.parse(data);
    res.json({
      blockNumber: block.blockNumber.toString(),
      previousBlockHash: block.previousBlockHash,
      stateRoot: block.stateRoot,
      data: transactions,
      timestamp: block.timestamp.toString(),
    });
  } catch (error) {
    console.error("Error fetching block data:", error);
    res.status(500).send("Error fetching block data");
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
