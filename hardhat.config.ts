import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';

import dotenv from 'dotenv';
dotenv.config();

const config: HardhatUserConfig = {
  solidity: '0.8.30',
  networks: {
    l1: {
      url: process.env.L1_RPC_URL || 'http://127.0.0.1:8012',
      chainId: 31337,
      accounts: [process.env.PRIVATE_KEY!],
    },    
    anvilZKsync: {
      url: process.env.L2_RPC_URL || 'http://127.0.0.1:8011',
      ethNetwork: 'l1',
      zksync: true,
      chainId: 260,
      accounts: [process.env.PRIVATE_KEY!],
    },
  },
};

export default config;
