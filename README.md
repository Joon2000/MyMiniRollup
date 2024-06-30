# Rollup Project

1.  set env file for hardhat and server
    ```
    SEPOLIA_RPC_URL =
    PRIVATE_KEY =
    ALICE_ADDRESS =
    BOB_ADDRESS =
    ADMIN_ADDRESS =
    ADMIN_PRIVATE_KEY =
    ```
2.  set env file for client

    ```
    # Token Address is an arbitrary address
    REACT_APP_SEPOLIA_RPC_URL =
    REACT_APP_TOKEN_ADDRESS =
    REACT_APP_ALICE_ADDRESS =
    REACT_APP_BOB_ADDRESS =
    REACT_APP_ADMIN_ADDRESS =
    ```

3.  Deploy contract

    ```Bash
    npx hardhat ignition deploy ignition/modules/Rollup.ts --network sepolia
    ```

    If there is an error, just compile the contract for abi file and deploy it through remix and manually put the contract address in server's index.ts file

4.  Start client and server

    ```Bash
    npm start
    ```

    in the root  
    Or start them each with

    ```Bash
    npm start
    ```

    in respective root folder (./off-chain/client, ./off-chain/server)

5.  Create blocks

        After every 3 transactions a block is submitted to the sepolia network
