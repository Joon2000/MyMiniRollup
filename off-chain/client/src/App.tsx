import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import "./App.css";

const tokenAddress = "0xbaFce01f990E75Cb6Bad127aD9dafF3Ea3901430"; // ERC-20 토큰 계약 주소를 여기에 입력하세요.
const tokenABI = [
  // ERC-20 토큰의 기본 ABI
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

const aliceAddress = "0x5065Fd0b55a7eF076306b25Ef4aC7E34efDBBC2C";
const bobAddress = "0x2d0701AA56458BECa4f04F7b6af2325b6A437fb7";

function App() {
  const [account, setAccount] = useState("");
  const [message, setMessage] = useState("지갑을 연결하세요");
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (account) {
      if (account === aliceAddress) {
        setMessage("Hello Alice");
      } else if (account === bobAddress) {
        setMessage("Hello Bob");
      } else {
        setMessage("Who are you?");
      }
    }
  }, [account]);

  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        const signer = provider.getSigner();
        const address = await (await signer).getAddress();
        setAccount(address);
      } catch (error) {
        console.error(error);
      }
    } else {
      alert("메타마스크를 설치해주세요.");
    }
  };

  const signTransaction = async (recipient: string) => {
    if (window.ethereum && account && amount) {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = provider.getSigner();
        const tokenContract = new ethers.Contract(
          tokenAddress,
          tokenABI,
          await signer
        );

        const chainId = await provider
          .getNetwork()
          .then((network) => network.chainId);

        const tx = {
          to: tokenAddress,
          data: tokenContract.interface.encodeFunctionData("transfer", [
            recipient,
            ethers.parseUnits(amount, 18).toString(), // Assuming 18 decimals
          ]),
        };

        const domain = {
          name: "Token",
          version: "1",
          chainId: chainId.toString(), // Convert BigInt to string
          verifyingContract: tokenAddress,
        };

        const types = {
          EIP712Domain: [
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
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

        const signedTx = await window.ethereum.request({
          method: "eth_signTypedData_v4",
          params: [account, msgParams],
        });

        console.log("Signed Transaction:", signedTx);
      } catch (error) {
        console.error(error);
      }
    } else {
      alert("지갑을 연결하고 금액을 입력하세요.");
    }
  };

  return (
    <div className="app">
      <h1>{message}</h1>
      {!account && <button onClick={connectWallet}>메타마스크에 연결</button>}
      {account && (
        <div>
          <input
            type="text"
            placeholder="보낼 금액"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          {account === aliceAddress && (
            <button onClick={() => signTransaction(bobAddress)}>
              Send to Bob
            </button>
          )}
          {account === bobAddress && (
            <button onClick={() => signTransaction(aliceAddress)}>
              Send to Alice
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
