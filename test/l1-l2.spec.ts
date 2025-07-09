import { expect } from 'chai';
import { Provider, Wallet as ZKWallet, utils, Contract } from 'zksync-ethers';
import { JsonRpcProvider, Wallet, ContractFactory, parseEther } from 'ethers';
import { Deployer } from '@matterlabs/hardhat-zksync';
import * as hre from 'hardhat';
import AccessKeyArtifact from '../artifacts-zk/contracts/AccessKey.sol/AccessKey.json';

const IBRIDGEHUB_ABI = [
  'function l2TransactionBaseCost(uint256,uint256,uint256,uint256) view returns (uint256)'
];

const RICH_WALLET_PK =
  '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356';

describe('AccessKey Vault end-to-end', () => {
  const l1Provider = new JsonRpcProvider('http://127.0.0.1:8012');
  const l2Provider = new Provider('http://127.0.0.1:8011');

  const walletL1 = new Wallet(RICH_WALLET_PK, l1Provider);
  const walletL2 = new ZKWallet(RICH_WALLET_PK, l2Provider, l1Provider);

  let accessKey: Contract;
  let vault: Contract;
  let bridgeHub: string;

  before(async () => {
    // ───── Deploy AccessKey (L1) ─────
    const accessKeyFactory = new ContractFactory(
      AccessKeyArtifact.abi,
      AccessKeyArtifact.bytecode,
      walletL1,
    );
    accessKey = (await accessKeyFactory.deploy()) as unknown as Contract;
    await accessKey.waitForDeployment();

    // ───── Deploy Vault (L2) ─────
    const deployerL2 = new Deployer(hre, walletL2);
    const Vault = await deployerL2.loadArtifact('Vault');
    vault = await deployerL2.deploy(Vault, [
      utils.applyL1ToL2Alias(accessKey.target as string),
    ]);
    await vault.waitForDeployment();

    bridgeHub = await l2Provider.send('zks_getBridgehubContract', []);
  });

  it('unlocks the vault via L1→L2 message', async () => {
    const l2GasLimit = BigInt(10000000);
    const l1GasPrice = (await l1Provider.getFeeData()).gasPrice ?? BigInt(0);
    const bridge = new Contract(bridgeHub, IBRIDGEHUB_ABI, walletL1);
    const baseCost: bigint = await bridge.l2TransactionBaseCost(
      260,
      l1GasPrice,
      l2GasLimit,
      800n
    );
    // const baseCost = await walletL2.getBaseCost({
    //   gasLimit: l2GasLimit,
    //   gasPrice: l1GasPrice,
    // });

    // ---- Send the cross-chain tx on L1 ----
    const unlockData = vault.interface.encodeFunctionData('unlock');
    let receipt = await (accessKey as any)
      .connect(walletL1)
      .unlockVaultOnL2(
        (await l2Provider.getNetwork()).chainId,
        bridgeHub,
        vault.target,
        unlockData,
        l2GasLimit,
        800,
        baseCost,
        { value: baseCost, gasPrice: l1GasPrice },
      )
      .then((tx: { wait: () => any; }) => tx.wait());
    
    console.log('L1 tx hash:', receipt.hash);  
    expect(receipt.status).to.equal(1);

    await walletL2.sendTransaction({
      to: '0x976EA74026E726554dB657fA54763abd0C3a0aa9',
      value: parseEther('0.01'),
    });

    // ---- Wait (≤30 s) for the vault to unlock ----
    for (let i = 0; i < 30 && !(await vault.isVaultUnlocked()); i++) {
      await new Promise(r => setTimeout(r, 1000));
    }

    expect(await vault.isVaultUnlocked()).to.equal(true);
  });
});
