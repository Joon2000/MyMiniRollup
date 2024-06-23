import express, { Request, Response } from "express";
import { ethers } from "ethers";
import Rollup from "../../artifacts/contracts/rollup.sol/OptimisticRollup.json"; // 스마트 계약 ABI 파일
import RollupModule from "../../ignition/deployments/chain-11155111/deployed_addresses.json";
import * as dotenv from "dotenv";

dotenv.config();

// bob과 alice를 위한 롤업 -> bob과 alice의 state를 추적해야 함!

const app = express();
app.use(express.json());

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const privateKey = process.env.PRIVATE_KEY!;
const wallet = new ethers.Wallet(privateKey, provider);
const contractAddress = RollupModule["RollupModule#OptimisticRollup"];
const contract = new ethers.Contract(contractAddress, Rollup.abi, wallet);

let transactions: string[] = [];

// 트랜잭션 수집 엔드포인트
app.post("/submit-transaction", (req: Request, res: Response) => {
  const { transaction } = req.body;
  transactions.push(transaction);
  res.send("Transaction received");
});

app.post("/submit-rollup-block", async (req: Request, res: Response) => {
  if (transactions.length === 0) {
    return res.status(400).send("No transactions to rollup");
  }

  try {
    const previousBlockHash = ethers.keccak256("0x");
    const stateRoot = ethers.keccak256("0x");
    const data = ethers.hexlify(String(transactions));

    const tx = await contract.submitBlock(previousBlockHash, stateRoot, data);
    await tx.wait();

    transactions = []; // 트랜잭션 초기화
    res.send("Rollup block submitted");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error submitting rollup block");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
