// scripts/deploy-and-unlock.ts
import 'dotenv/config';
import { Provider as ZkProvider, Wallet as ZkWallet, utils as zkUtils, Contract } from 'zksync-ethers';
import { ContractFactory, JsonRpcProvider, Wallet, parseEther } from 'ethers';
import { Deployer } from '@matterlabs/hardhat-zksync';
import hre from 'hardhat';

const IBRIDGEHUB_ABI = [
  'function l2TransactionBaseCost(uint256,uint256,uint256,uint256) view returns (uint256)'
];

const {
  L1_RPC_URL = 'http://127.0.0.1:8012',
  L2_RPC_URL = 'http://127.0.0.1:8011',
  PRIVATE_KEY = "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356",
  L2_GAS_LIMIT = '350000',
  L2_PUBDATA_BYTE_LIMIT = '800',
} = process.env;

if (!PRIVATE_KEY) throw new Error('⚠️  PRIVATE_KEY not set in env');

const l1Provider = new JsonRpcProvider(L1_RPC_URL);
const l2Provider = new ZkProvider(L2_RPC_URL);

const walletL1 = new Wallet(PRIVATE_KEY, l1Provider);
const walletL2 = new ZkWallet(PRIVATE_KEY, l2Provider, l1Provider);

async function main() {
  console.log('\nL1 chainId:', (await l1Provider.getNetwork()).chainId);
  console.log('L2 chainId:', (await l2Provider.getNetwork()).chainId, '\n');

  // Deploy AccessKey on L1
  const AccessKeyArtifact = await hre.artifacts.readArtifact('AccessKey');
  const accessKey = await new ContractFactory(
    AccessKeyArtifact.abi,
    AccessKeyArtifact.bytecode,
    walletL1,
  ).deploy();
  await accessKey.waitForDeployment();
  console.log('AccessKey deployed', accessKey.target);

  // Deploy Vault on L2
  const deployer = new Deployer(hre, walletL2);
  const VaultArtifact = await deployer.loadArtifact('Vault');
  const aliasedAK = zkUtils.applyL1ToL2Alias(accessKey.target as string);
  const vault = await deployer.deploy(VaultArtifact, [aliasedAK]);
  await vault.waitForDeployment();
  console.log('Vault   deployed', vault.target);

  // Get BridgeHub & fee parameters
  const bridgeHub: string = await l2Provider.send('zks_getBridgehubContract', []);
  const gasPrice = (await l1Provider.getFeeData()).gasPrice ?? 0n;
  const gasLimit = BigInt(L2_GAS_LIMIT);
  const bridge = new Contract(bridgeHub, IBRIDGEHUB_ABI, walletL1);
  const baseCost: bigint = await bridge.l2TransactionBaseCost(
    260,
    gasPrice,
    gasLimit,
    800n
  );

  console.log('\nbaseCost      ', baseCost.toString());
  console.log('l1GasPrice    ', gasPrice.toString(), '\n');

  const unlockData = vault.interface.encodeFunctionData('unlock');

  // Send the cross-chain tx on L1
  const tx = await (accessKey.connect(walletL1) as any)
    .unlockVaultOnL2(
      (await l2Provider.getNetwork()).chainId,
      bridgeHub,
      vault.target,
      unlockData,
      gasLimit,
      Number(L2_PUBDATA_BYTE_LIMIT),
      baseCost,
      { value: baseCost, gasPrice },
    );
  console.log('L1 tx sent: ', tx.hash);
  await tx.wait();

  // await walletL2.sendTransaction({ to: walletL2.address, value: 0n });

  // wait until the vault is unlocked
  for (let i = 0; i < 30 && !(await vault.isVaultUnlocked()); i++) {
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(
    '\nVault unlocked?', await vault.isVaultUnlocked(),
    '\n',
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
