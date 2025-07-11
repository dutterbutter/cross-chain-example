import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';

import dotenv from 'dotenv';
dotenv.config();

/* --------------------------------------------------------- *
 *  Toggle ZK plugins with an env var so we                 *
 *  can run two separate compile passes.                    *
 * --------------------------------------------------------- */
if (process.env.ZKSYNC === 'true') {
  require('@matterlabs/hardhat-zksync');
  require('@matterlabs/hardhat-zksync-deploy');
}

const config: HardhatUserConfig = {
  solidity: '0.8.30',
  paths: {
    artifacts: process.env.ZKSYNC === 'true' ? 'artifacts-zk' : 'artifacts',
  },
  networks: {
    /* ---------- plain EVM (L1) ---------- */
    l1: {
      url: process.env.L1_RPC_URL || 'http://127.0.0.1:8012',
      chainId: 31337,
      accounts: [process.env.PRIVATE_KEY!],
    },

    /* ---------- Era VM (L2) -------------- */
    anvilZKsync: {
      url: process.env.L2_RPC_URL || 'http://127.0.0.1:8011',
      ethNetwork: 'l1',   // required by plugin
      zksync: true,
      chainId: 260,
      accounts: [process.env.PRIVATE_KEY!],
    },
  },
  zksolc: {
    version: '1.5.15',
    settings: {
      codegen: 'yul',
    },
  },
};

export default config;
