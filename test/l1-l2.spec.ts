import 'dotenv/config';
import { expect } from 'chai';
import hre from 'hardhat';
import { ContractFactory, JsonRpcProvider, Wallet, Contract } from 'ethers';

// equivalent to AddressAliasHelper.applyL1ToL2Alias
function applyL1ToL2Alias(address: string): string {
  return `0x${(BigInt(address) + BigInt('0x1111000000000000000000000000000000001111')).toString(16).padStart(40, '0')}`;
}

describe('Cross-chain vault unlock', function () {
  const l1Provider = new JsonRpcProvider(process.env.L1_RPC_URL || 'http://localhost:8012');
  const l2Provider = new JsonRpcProvider(process.env.L2_RPC_URL || 'http://localhost:8011');
  const walletL1 = new Wallet(process.env.PRIVATE_KEY!, l1Provider);
  const walletL2 = new Wallet(process.env.PRIVATE_KEY!, l2Provider);

  it('should deploy AccessKey on L1, Vault on L2, then unlock', async function () {
    // ── Load AccessKey artifact and deploy on L1
    const AccessKeyArt = await hre.artifacts.readArtifact('AccessKey');
    const accessKey: any = await new ContractFactory(
      AccessKeyArt.abi,
      AccessKeyArt.bytecode,
      walletL1
    ).deploy();
    await accessKey.waitForDeployment();

    // ── Load Vault artifact and deploy on L2 using aliased AccessKey address
    const aliased = applyL1ToL2Alias(await accessKey.getAddress());
    const VaultArt = await hre.artifacts.readArtifact('Vault');
    const vault = await new ContractFactory(
      VaultArt.abi,
      VaultArt.bytecode,
      walletL2
    ).deploy(aliased);
    await vault.waitForDeployment();

    // ── Get base cost from BridgeHub
    const bridgeHubAddr = await l2Provider.send('zks_getBridgehubContract', []);
    const BridgehubArt = await hre.artifacts.readArtifact('@matterlabs/zksync-contracts/contracts/l1-contracts/bridgehub/IBridgehub.sol:IBridgehub');
    const bridge = new Contract(bridgeHubAddr, BridgehubArt.abi, walletL1);

    const gasLimit = BigInt(process.env.L2_GAS_LIMIT || '350000');
    const pubdataLimit = BigInt(process.env.L2_PUBDATA_BYTE_LIMIT || '800');
    const gasPrice = (await l1Provider.getFeeData()).gasPrice ?? BigInt(0);

    const baseCost = await bridge.l2TransactionBaseCost(
      BigInt(260),
      gasPrice,
      gasLimit,
      pubdataLimit
    );

    // ── Encode unlock call and send from L1
    const payload = new Contract(await vault.getAddress(), VaultArt.abi, l2Provider)
      .interface.encodeFunctionData('unlock');

    const tx = await accessKey.unlockVaultOnL2(
      BigInt((await l2Provider.getNetwork()).chainId),
      bridgeHubAddr,
      await vault.getAddress(),
      payload,
      gasLimit,
      pubdataLimit,
      baseCost,
      { value: baseCost }
    );
    await tx.wait();

    // ── Poll for unlock completion on L2
    const vaultReader = new Contract(await vault.getAddress(), VaultArt.abi, l2Provider);
    for (let i = 0; i < 30; i++) {
      if (await vaultReader.isVaultUnlocked()) break;
      await new Promise(r => setTimeout(r, 1000));
    }

    expect(await vaultReader.isVaultUnlocked()).to.be.true;
  });
});
