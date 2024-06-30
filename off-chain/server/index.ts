import express, { Request, Response } from "express";
import { ethers } from "ethers";
import Rollup from "../../artifacts/contracts/rollup.sol/OptimisticRollup.json"; // 스마트 계약 ABI 파일
import RollupModule from "../../ignition/deployments/chain-11155111/deployed_addresses.json";
import * as dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const AliceState = {
  address: "0x5065Fd0b55a7eF076306b25Ef4aC7E34efDBBC2C",
  value: 100,
};
const BobState = {
  address: "0x2d0701AA56458BECa4f04F7b6af2325b6A437fb7",
  value: 100,
};

const app = express();
app.use(express.json());

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const privateKey = process.env.PRIVATE_KEY!;
const wallet = new ethers.Wallet(privateKey, provider);
const contractAddress = RollupModule["RollupModule#OptimisticRollup"];
const contract = new ethers.Contract(contractAddress, Rollup.abi, wallet);

// Change transactions to be an array of objects
let transactions: { value: any; signature: any }[] = [];

const corsOptions = {
  origin: "http://localhost:3000",
  credentials: true, // 자격 증명을 허용하도록 설정
};

app.use(cors(corsOptions));

app.post("/submit-transaction", (req: Request, res: Response) => {
  const { transaction } = req.body;
  transactions.push(transaction);
  res.send("Transaction received");
});

// 서명된 트랜잭션 검증 엔드포인트
app.post("/verify-signature", async (req: Request, res: Response) => {
  const { tokenAddress, tokenABI, account, recipient, amount, tx, signature } =
    req.body;
  console.log("===========================================================");
  console.log("Recieved transaction: ", signature);
  try {
    console.log("Verifing Contract!");
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
    console.log("recovered address: ", recoverAddress);
    // 서명자 주소와 주어진 계정 비교
    console.log(
      "Verifying that the recovered address matches the signed address"
    );
    if (recoverAddress.toLowerCase() === account.toLowerCase()) {
      console.log("Signature is valid!!!");
      const sender =
        account.toLowerCase() === AliceState.address.toLowerCase()
          ? "Alice"
          : "Bob";
      const receiver =
        account.toLowerCase() === AliceState.address.toLowerCase()
          ? "Bob"
          : "Alice";

      if (account.toLowerCase() === AliceState.address.toLowerCase()) {
        AliceState.value -= Number(amount);
        BobState.value += Number(amount);
      } else if (account.toLowerCase() === BobState.address.toLowerCase()) {
        BobState.value -= Number(amount);
        AliceState.value += Number(amount);
      }

      console.log(
        `Pushing Transaction: ${sender} to ${receiver} ${amount} ETH`
      );
      transactions.push({ value, signature });

      console.log("Final State: ");
      console.log("Alice Balance: ", AliceState.value);
      console.log("Bob Balance: ", BobState.value);
      console.log(
        "==========================================================="
      );
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
    const data = ethers.hexlify(
      ethers.toUtf8Bytes(JSON.stringify(transactions))
    );

    const tx = await contract.submitBlock(previousBlockHash, stateRoot, data);
    await tx.wait();

    transactions = []; // 트랜잭션 초기화
    res.send("Rollup block submitted");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error submitting rollup block");
  }
});

app.get("/balances", (req: Request, res: Response) => {
  res.json({ alice: AliceState.value, bob: BobState.value });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
