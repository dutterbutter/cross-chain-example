import type { HardhatUserConfig } from "hardhat/config";

import "@matterlabs/hardhat-zksync";

const config: HardhatUserConfig = {
  defaultNetwork: "anvilZKsync",
  networks: {
    anvilZKsync: {
      url: "http://127.0.0.1:8011",
      ethNetwork: 'http://localhost:8012',
      zksync: true,
    },
    hardhat: {
      zksync: true,
    },
  },
  zksolc: {
    version: "1.5.15",
    settings: {
      codegen: 'yul',
    },
  },
  solidity: {
    version: "0.8.30",
  },
};

export default config;
