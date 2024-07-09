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

interface Transaction {
  transaction: { from: string; to: string; amount: string };
  signature: string;
}

interface BlockData {
  blockNumber: string;
  previousBlockHash: string;
  stateRoot: string;
  data: Transaction[];
  timestamp: string;
}

function App() {
  const [account, setAccount] = useState("");
  const [message, setMessage] = useState("Initializing Balances from L1...");
  const [amount, setAmount] = useState("");
  const [balances, setBalances] = useState({ alice: 0, bob: 0 });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [blockNumber, setBlockNumber] = useState("");
  const [searchBlockNumber, setSearchBlockNumber] = useState("1");
  const [blockData, setBlockData] = useState<BlockData | null>(null);
  const [expandedTransaction, setExpandedTransaction] = useState<number | null>(
    null
  );
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const checkInitialization = async () => {
      try {
        const response = await axios.get("http://localhost:8080/init-status");
        if (response.data.status === "initialized") {
          setIsInitialized(true);
          setMessage("지갑을 연결하세요");
        } else {
          setIsInitialized(false);
          setTimeout(checkInitialization, 3000); // Poll every 3 seconds
        }
      } catch (error) {
        console.error("Error checking initialization status:", error);
        setTimeout(checkInitialization, 3000); // Poll every 3 seconds
      }
    };
    checkInitialization();
  }, []);

  useEffect(() => {
    if (account) {
      if (account === aliceAddress) {
        setMessage("Hello Alice");
      } else if (account === bobAddress) {
        setMessage("Hello Bob");
      } else if (account === adminAddress) {
        setMessage("Hello Admin");
        fetchCurrentBlockNumber();
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
        const { chainId } = await provider.getNetwork();
        // Check if the user is connected to Sepolia (chainId: 11155111)
        if (chainId !== BigInt(11155111)) {
          try {
            await window.ethereum.request({
              method: "wallet_switchEthereumChain",
              params: [
                {
                  chainId: "0xaa36a7",
                },
              ],
            });
          } catch (switchError) {
            if (
              switchError instanceof Error &&
              switchError.hasOwnProperty("code")
            ) {
              const error = switchError as unknown as { code: number };
              if (error.code === 4902) {
                // This error code indicates that the chain has not been added to MetaMask
                alert(
                  "Please manually add the Sepolia network to your MetaMask. Chain ID: 11155111"
                );
                return;
              }
            } else {
              console.error(switchError);
            }
          }
        }

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

  const fetchCurrentBlockNumber = async () => {
    try {
      const response = await axios.get(
        "http://localhost:8080/current-block-number"
      );
      setBlockNumber(response.data.blockNumber);
    } catch (error) {
      console.error("Error fetching current block number:", error);
    }
  };

  const fetchBlockData = async () => {
    try {
      const response = await axios.get(
        `http://localhost:8080/block/${searchBlockNumber}`
      );
      setBlockData(response.data);
    } catch (error) {
      console.error("Error fetching block data:", error);
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
      alert("Connect Wallet");
    }
  };

  const handleBlockNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (value >= 1) {
      setSearchBlockNumber(e.target.value);
    }
  };

  return (
    <div className="app">
      <h1>{message}</h1>
      {!account && isInitialized && (
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
              <div className="block-info">
                <div className="transaction-list">
                  <h3>Current Block Number: {Number(blockNumber)}</h3>
                  <h3>Transactions:</h3>
                  <ul>
                    {transactions.map((tx, index) => (
                      <li
                        key={index}
                        className="transaction-item"
                        onClick={() =>
                          setExpandedTransaction(
                            expandedTransaction === index ? null : index
                          )
                        }
                      >
                        {expandedTransaction === index ? (
                          <>
                            <div>
                              <strong>From:</strong> {tx.transaction.from}
                            </div>
                            <div>
                              <strong>To:</strong> {tx.transaction.to}
                            </div>
                            <div>
                              <strong>Amount:</strong> {tx.transaction.amount}{" "}
                              ETH
                            </div>
                            <div>
                              <strong>Signature:</strong> {tx.signature}
                            </div>
                          </>
                        ) : (
                          `${tx.transaction.from} sent ${tx.transaction.amount} ETH to ${tx.transaction.to}`
                        )}
                      </li>
                    ))}
                  </ul>
                  <button
                    className="transaction-button"
                    onClick={fetchTransactions}
                  >
                    Fetch Transactions
                  </button>
                </div>
              </div>
              <div className="block-info">
                <h3>
                  Latest Submitted Block Number: {Number(blockNumber) - 1}
                </h3>
                <input
                  type="number"
                  placeholder="Enter block number"
                  value={searchBlockNumber}
                  onChange={handleBlockNumberChange}
                  min="1"
                  max={Number(blockNumber) - 1}
                />
                <button className="fetch-button" onClick={fetchBlockData}>
                  Fetch Block Data
                </button>
                {blockData && (
                  <div>
                    <h4>Block {blockData.blockNumber}</h4>
                    <p>Previous Block Hash: {blockData.previousBlockHash}</p>
                    <p>State Root: {blockData.stateRoot}</p>
                    <p>Timestamp: {blockData.timestamp}</p>
                    <h4>Transactions:</h4>
                    <ul>
                      {blockData.data.map((tx: Transaction, index: number) => (
                        <li key={index} className="block-transaction-item">
                          <div>
                            <strong>From:</strong> {tx.transaction.from}
                          </div>
                          <div>
                            <strong>To:</strong> {tx.transaction.to}
                          </div>
                          <div>
                            <strong>Amount:</strong> {tx.transaction.amount} ETH
                          </div>
                          <div>
                            <strong>Signature:</strong> {tx.signature}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
