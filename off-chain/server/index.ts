import express, { Request, Response } from "express";
import { ethers } from "ethers";
import Rollup from "../../artifacts/contracts/rollup.sol/OptimisticRollup.json"; // 스마트 계약 ABI 파일
import RollupModule from "../../ignition/deployments/chain-11155111/deployed_addresses.json";
import * as dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const AliceState = {
  address: "0x5065Fd0b55a7eF076306b25Ef4aC7E34efDBBC2C",
  value: 0,
};
const BobAddress = {
  address: "0x2d0701AA56458BECa4f04F7b6af2325b6A437fb7",
  value: 0,
};

const app = express();
app.use(express.json());

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const privateKey = process.env.PRIVATE_KEY!;
const wallet = new ethers.Wallet(privateKey, provider);
const contractAddress = RollupModule["RollupModule#OptimisticRollup"];
const contract = new ethers.Contract(contractAddress, Rollup.abi, wallet);

let transactions: string[] = [];

const corsOptions = {
  origin: "http://localhost:3000",
  credentials: true, // 자격 증명을 허용하도록 설정
};

app.use(cors(corsOptions));

// 트랜잭션 수집 엔드포인트
app.post("/submit-transaction", (req: Request, res: Response) => {
  const { transaction } = req.body;
  transactions.push(transaction);
  res.send("Transaction received");
});

// 서명된 트랜잭션 검증 엔드포인트
app.post("/verify-signature", async (req: Request, res: Response) => {
  const { tx, account, recipient, amount, signature } = req.body;

  try {
    const domain = {
      name: "Token",
      version: "1",
      chainId: (await provider.getNetwork()).chainId.toString(), // Convert BigInt to string
      verifyingContract: tx.to,
    };

    const types = {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "string" },
        { name: "verifyingContract", type: "address" },
      ],
      Transaction: [
        { name: "to", type: "address" },
        { name: "data", type: "bytes" },
      ],
    };

    const value = {
      to: tx.to,
      data: tx.data,
    };

    const msgParams = JSON.stringify({
      domain,
      message: value,
      primaryType: "Transaction",
      types,
    });

    // 메시지 해시
    const msgHash = ethers.hashMessage(msgParams);

    // 서명에서 공개키 추출
    const signerAddress = ethers.recoverAddress(msgHash, signature);
    console.log(signerAddress);
    console.log(account);

    // 서명자 주소와 주어진 계정 비교
    if (signerAddress.toLowerCase() === account.toLowerCase()) {
      res.send("Signature is valid");
    } else {
      res.status(400).send("Invalid signature");
    }
  } catch (error) {
    console.error(error);
    res.status(500).send("Error verifying signature");
  }
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

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
