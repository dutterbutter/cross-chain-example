import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { expect } from 'chai';
import hre from 'hardhat';
import { Deployer } from '@matterlabs/hardhat-zksync';
import {
  Provider as ZkProvider,
  Wallet as ZkWallet,
  utils as zkUtils,
  Contract as ZkContract,
} from 'zksync-ethers';
import { ContractFactory, JsonRpcProvider, Wallet as EthWallet, Contract } from 'ethers';

const ART_DIR_L1 = path.resolve(__dirname, '../artifacts');

async function loadArtifact(baseDir: string, name: string) {
  const p = path.join(baseDir, 'contracts', `${name}.sol`, `${name}.json`);
  return JSON.parse(await fs.readFile(p, 'utf8'));
}

describe('Cross-chain vault unlock', function () {
  const l1Provider = new JsonRpcProvider(process.env.L1_RPC_URL || 'http://localhost:8012');
  const l2Provider = new ZkProvider(process.env.L2_RPC_URL || 'http://localhost:8011');
  const walletL1    = new EthWallet(process.env.PRIVATE_KEY!, l1Provider);
  const walletL2    = new ZkWallet(process.env.PRIVATE_KEY!, l2Provider, l1Provider);

  it('should deploy AccessKey on L1, Vault on L2, then unlock', async function () {
    // ── Deploy AccessKey on L1
    const AccessKeyArt = await loadArtifact(ART_DIR_L1, 'AccessKey');
    const accessKey = await new ContractFactory(
      AccessKeyArt.abi,
      AccessKeyArt.bytecode,
      walletL1
    ).deploy() as any;
    await accessKey.waitForDeployment();

    // ── Deploy Vault on L2
    const aliased = zkUtils.applyL1ToL2Alias(accessKey.target as string);
    const deployer = new Deployer(hre, walletL2);
    const VaultArt = await deployer.loadArtifact('Vault');
    const vault = await deployer.deploy(VaultArt, [aliased]);
    await vault.waitForDeployment();

    // ── cross-chain fee
    const bridgeHub    = await l2Provider.send('zks_getBridgehubContract', []);
    const gasLimit     = BigInt(process.env.L2_GAS_LIMIT! || '350000');
    const pubdataLimit = BigInt(process.env.L2_PUBDATA_BYTE_LIMIT! || '800');
    const BridgehubArt = await hre.artifacts.readArtifact(
      '@matterlabs/zksync-contracts/contracts/l1-contracts/bridgehub/IBridgehub.sol:IBridgehub'
    );
    const bridge = new Contract(bridgeHub, BridgehubArt.abi, walletL1);
    const feeData = await l1Provider.getFeeData();
    const baseCost = await bridge.l2TransactionBaseCost(
      BigInt(260),
      feeData.gasPrice ?? BigInt(0),
      gasLimit,
      pubdataLimit
    );

    // ── Send unlock transaction
    const payload = vault.interface.encodeFunctionData('unlock');
    await accessKey.unlockVaultOnL2(
      BigInt((await l2Provider.getNetwork()).chainId),
      bridgeHub,
      vault.target,
      payload,
      gasLimit,
      pubdataLimit,
      baseCost,
      { value: baseCost }
    ).then((tx: any) => tx.wait());

    // ── Poll for completion
    for (let i = 0; i < 30; i++) {
      if (await vault.isVaultUnlocked()) break;
      await new Promise((r) => setTimeout(r, 1_000));
    }

    expect(await vault.isVaultUnlocked()).to.be.true;
  });
});
