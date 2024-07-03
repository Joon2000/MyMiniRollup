import express, { Request, Response } from "express";
import { ethers } from "ethers";
import Rollup from "../../artifacts/contracts/rollup.sol/OptimisticRollup.json"; // 스마트 계약 ABI 파일
// import RollupModule from "../../ignition/deployments/chain-11155111/deployed_addresses.json";
import * as dotenv from "dotenv";
dotenv.config({ path: "../../.env" });
import cors from "cors";

dotenv.config();

const aliceAddress = process.env.ALICE_ADDRESS!;
const bobAddress = process.env.BOB_ADDRESS!;

const AliceState = {
  address: aliceAddress,
  value: 0,
};

const BobState = {
  address: bobAddress,
  value: 0,
};

const app = express();
app.use(express.json());

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const privateKey = process.env.ADMIN_PRIVATE_KEY!;
const wallet = new ethers.Wallet(privateKey, provider);
// const contractAddress = RollupModule["RollupModule#OptimisticRollup"];
const contractAddress = "0xcf55A6F17F338b811987bfFC74fb039AF74Dc597";
const contract = new ethers.Contract(contractAddress, Rollup.abi, wallet);

let transactions: {
  transaction: { from: string; to: string; amount: string };
  signature: any;
}[] = [];

const initializeBalances = async () => {
  try {
    // Call the contract's initializeBalances function
    console.log(
      "Fetching balances from Layer 1: If new address, 100 token is filled"
    );
    const tx = await contract.initializeBalances([aliceAddress, bobAddress]);
    await tx.wait();

    // Fetch the initialized balances
    AliceState.value = Number(await contract.getBalance(aliceAddress));
    BobState.value = Number(await contract.getBalance(bobAddress));

    console.log("Balance checked!!");
    console.log(`${AliceState.address} balance: ${AliceState.value}`);
    console.log(`${BobState.address} balance: ${BobState.value}`);
  } catch (error) {
    console.error("Error initializing balances:", error);
  }
};
const corsOptions = {
  origin: "http://localhost:3000",
  credentials: true, // 자격 증명을 허용하도록 설정
};

app.use(cors(corsOptions));

app.get("/init-status", (req: Request, res: Response) => {
  res.json({ status: "initialized" });
});

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

      if (account.toLowerCase() === aliceAddress!.toLowerCase()) {
        updateBalances(AliceState, BobState, amount);
      } else if (account.toLowerCase() === bobAddress!.toLowerCase()) {
        updateBalances(BobState, AliceState, amount);
      } else {
        throw new Error("Invalid account");
      }

      const sender =
        account.toLowerCase() === AliceState.address!.toLowerCase()
          ? "Alice"
          : "Bob";
      const receiver =
        account.toLowerCase() === AliceState.address!.toLowerCase()
          ? "Bob"
          : "Alice";

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

const updateBalances = (
  fromState: { address: string; value: number },
  toState: { address: string; value: number },
  amount: string
) => {
  const amountInt = parseInt(amount);
  fromState.value -= amountInt;
  toState.value += amountInt;
};

const computeStateRoot = (aliceBalance: number, bobBalance: number) => {
  const aliceBalanceHash = ethers.keccak256(
    ethers.solidityPacked(["uint256"], [aliceBalance])
  );
  const bobBalanceHash = ethers.keccak256(
    ethers.solidityPacked(["uint256"], [bobBalance])
  );
  return ethers.keccak256(
    ethers.solidityPacked(
      ["bytes32", "bytes32"],
      [aliceBalanceHash, bobBalanceHash]
    )
  );
};

const submitRollupBlock = async () => {
  try {
    // Fetch the last block to get the previous block hash
    const lastBlockIndex = Number(await contract.getBlockCount()) - 1;
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
    const aliceBalance = AliceState.value;
    const bobBalance = BobState.value;
    const stateRoot = computeStateRoot(aliceBalance, bobBalance);

    // Serialize transactions
    const data = ethers.hexlify(
      ethers.toUtf8Bytes(JSON.stringify(transactions))
    );

    // Submit the block to the smart contract
    console.log("Submitting rollup block with the following details:");
    console.log("Previous Block Hash:", previousBlockHash);
    console.log("State Root:", stateRoot);
    console.log("Transactions:", transactions);

    const tx = await contract.submitBlock(
      previousBlockHash,
      stateRoot,
      data,
      [aliceAddress, bobAddress],
      [aliceBalance, bobBalance]
    );
    const result = await tx.wait();

    // Clear the transactions array
    transactions = [];
    console.log("Rollup block submitted successfully");
    console.log("Transaction hash: ", result.hash);
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
app.listen(PORT, async () => {
  await initializeBalances(); // Initialize balances when the server starts
  console.log(`Server running on port ${PORT}`);
});
