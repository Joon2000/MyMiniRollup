import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import axios from "axios";
import "./App.css";
import config from "./config";

const aliceAddress = config.aliceAddress;
const bobAddress = config.bobAddress;
const adminAddress = config.adminAddress;
const tokenAddress = config.tokenAddress;

const tokenABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

function App() {
  const [account, setAccount] = useState("");
  const [message, setMessage] = useState("지갑을 연결하세요");
  const [amount, setAmount] = useState("");
  const [balances, setBalances] = useState({ alice: 0, bob: 0 });
  const [transactions, setTransactions] = useState<
    {
      transaction: { from: string; to: string; amount: string };
      signature: string;
    }[]
  >([]);

  useEffect(() => {
    if (account) {
      if (account === aliceAddress) {
        setMessage("Hello Alice");
      } else if (account === bobAddress) {
        setMessage("Hello Bob");
      } else if (account === adminAddress) {
        setMessage("Hello Admin");
      } else {
        setMessage("Who are you?");
      }
      fetchBalances();
    }
  }, [account]);

  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        const signer = await provider.getSigner();
        const address = await signer.getAddress();
        setAccount(address);
      } catch (error) {
        console.error(error);
      }
    } else {
      alert("메타마스크를 설치해주세요.");
    }
  };

  const fetchBalances = async () => {
    try {
      const response = await axios.get("http://localhost:8080/balances");
      setBalances(response.data);
    } catch (error) {
      console.error("Error fetching balances:", error);
    }
  };

  const fetchTransactions = async () => {
    try {
      const response = await axios.get("http://localhost:8080/transactions");
      setTransactions(response.data);
    } catch (error) {
      console.error("Error fetching transactions:", error);
    }
  };

  const signTransaction = async (recipient: string) => {
    if (window.ethereum && account && amount) {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const tokenContract = new ethers.Contract(
          tokenAddress!,
          tokenABI,
          signer
        );

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

        const signature = await signer.signTypedData(domain, types, value);

        console.log("Signed Transaction:", signature);

        const res = await axios.post(
          "http://localhost:8080/transaction-submit",
          {
            tokenAddress,
            tokenABI,
            account,
            recipient,
            amount,
            signature,
          }
        );

        console.log(res);
        fetchBalances(); // Fetch balances after the transaction
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
      {!account && (
        <button className="connect-button" onClick={connectWallet}>
          메타마스크에 연결
        </button>
      )}
      {account && (
        <div className="balance-container">
          {account === aliceAddress && (
            <>
              <h2>Alice's Balance: {balances.alice}</h2>
              <div className="transaction-container">
                <input
                  type="text"
                  placeholder="보낼 금액"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <button
                  className="send-button"
                  onClick={() => signTransaction(bobAddress!)}
                >
                  Send to Bob
                </button>
              </div>
            </>
          )}
          {account === bobAddress && (
            <>
              <h2>Bob's Balance: {balances.bob}</h2>
              <div className="transaction-container">
                <input
                  type="text"
                  placeholder="보낼 금액"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <button
                  className="send-button"
                  onClick={() => signTransaction(aliceAddress!)}
                >
                  Send to Alice
                </button>
              </div>
            </>
          )}
          {account === adminAddress && (
            <>
              <h2>Alice's Balance: {balances.alice}</h2>
              <h2>Bob's Balance: {balances.bob}</h2>
              <button
                className="transaction-button"
                onClick={fetchTransactions}
              >
                Fetch Transactions
              </button>
              <div className="transaction-list">
                <h3>Transactions:</h3>
                <ul>
                  {transactions.map((tx, index) => (
                    <li key={index}>
                      {tx.transaction.from} sent {tx.transaction.amount} ETH to{" "}
                      {tx.transaction.to}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
