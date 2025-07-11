# Cross-Chain Vault Unlock (L1 ➝ L2) Test

This project showcases a minimal example of sending a message from Ethereum L1 to zkSync Era L2 using custom contracts: `AccessKey` on L1 and `Vault` on L2.

The test demonstrates how to:
- Deploy contracts to both chains
- Alias L1 address for L2 interaction
- Fetch bridgehub address via `zks_getBridgehubContract`
- Estimate the base cost using `l2TransactionBaseCost`
- Unlock an L2 vault from an L1 transaction

## Setup

Two running RPC endpoints:

- L1: `http://localhost:8012` (`anvil --no-request-size-limit --port 8012`)
- L2: `http://localhost:8011` (`anvil-zksync --evm-interpreter --external-l1=http://127.0.0.1:8012 -vv`)

```bash
npm install
npm run compile
npm run test
````

Ensure `.env` is configured:

```ini
PRIVATE_KEY=0x...
L1_RPC_URL=http://localhost:8012
L2_RPC_URL=http://localhost:8011
L2_GAS_LIMIT=350000
L2_PUBDATA_BYTE_LIMIT=800
```

---

## Structure

* `contracts/` – Solidity contracts for L1 & L2
* `test/` – E2E test for cross-chain vault unlock

---

## Dependencies

* Hardhat
* Ethers
* anvil
* anvil-zksync
* ZKsync contracts: `@matter-labs/zksync-contracts`

---

## License

MIT
