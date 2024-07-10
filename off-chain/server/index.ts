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
const contractAddress = "0x0488fa84Bb598A2B645ce4bfa76690248161965B";
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

app.post("/challenge-block", async (req: Request, res: Response) => {
  const { blockNumber } = req.body;
  console.log("************************************************************");
  console.log(`Received challenge request for block number: ${blockNumber}`);

  try {
    // 최신 상태를 가져옴
    const latestBlockNumber = Number(await contract.getBlockCount()) - 1;
    let currentAliceBalance = Number(await contract.getBalance(aliceAddress));
    let currentBobBalance = Number(await contract.getBalance(bobAddress));

    console.log(`Latest block number: ${latestBlockNumber}`);
    console.log(
      `Current balances - Alice: ${currentAliceBalance}, Bob: ${currentBobBalance}`
    );

    // 최신 상태에서부터 역순으로 상태를 재구성
    console.log("Recalculating the State Root...");
    for (let i = latestBlockNumber; i >= blockNumber; i--) {
      const block = await contract.getBlock(i);
      const transactions = JSON.parse(ethers.toUtf8String(block.data));
      for (const tx of transactions) {
        if (tx.transaction.from === "Alice") {
          currentAliceBalance += parseInt(tx.transaction.amount);
          currentBobBalance -= parseInt(tx.transaction.amount);
        } else {
          currentBobBalance += parseInt(tx.transaction.amount);
          currentAliceBalance -= parseInt(tx.transaction.amount);
        }
      }
    }

    console.log("Recalculated Alice balance: ", currentAliceBalance);
    console.log("Recalculated Bob balance: ", currentBobBalance);

    // 최종 상태 루트 계산
    const recalculatedStateRoot = computeStateRoot(
      currentAliceBalance,
      currentBobBalance
    );

    console.log(
      `Recalculated State Root for the block preceding the challenged block: ${recalculatedStateRoot}`
    );
    console.log("Comparing the State Root...");

    // 온체인 검증을 위해 데이터 제출
    let tx = await contract.challengeBlock(blockNumber, recalculatedStateRoot);
    await tx.wait();

    console.log("Challenge successful. Rolling back state...");

    // 초기 상태 설정
    let aliceBalance = 100; // 초기 상태를 기준으로 설정
    let bobBalance = 100; // 초기 상태를 기준으로 설정

    // 이전 블록부터 현재 챌린지된 블록까지의 상태를 재구성
    for (let i = 0; i < blockNumber; i++) {
      const block = await contract.getBlock(i);
      const transactions = JSON.parse(ethers.toUtf8String(block.data));
      for (const tx of transactions) {
        if (tx.transaction.from === "Alice") {
          aliceBalance -= parseInt(tx.transaction.amount);
          bobBalance += parseInt(tx.transaction.amount);
        } else {
          bobBalance -= parseInt(tx.transaction.amount);
          aliceBalance += parseInt(tx.transaction.amount);
        }
      }
    }

    console.log(
      `Reconstructed balances - Alice: ${aliceBalance}, Bob: ${bobBalance}`
    );

    tx = await contract.updateBalances(
      [aliceAddress, bobAddress],
      [aliceBalance, bobBalance]
    );
    await tx.wait();

    AliceState.value = aliceBalance;
    BobState.value = bobBalance;

    console.log("State successfully rolled back.");
    console.log("************************************************************");

    res.send("Block challenged successfully");
  } catch (error) {
    if (typeof error === "object" && error !== null && "reason" in error) {
      console.error("Error challenging block:", (error as any).reason);
      res.status(500).send(`Error challenging block: ${(error as any).reason}`);
    } else if (error instanceof Error) {
      console.error("Error challenging block:", error.message);
      res.status(500).send(`Error challenging block: ${error.message}`);
    } else {
      console.error("Error challenging block:", error);
      res.status(500).send("Error challenging block");
    }
    console.log("************************************************************");
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, async () => {
  await initializeBalances(); // Initialize balances when the server starts
  console.log(`Server running on port ${PORT}`);
});
