// contracts/scripts/deploy.js
const fs  = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const networkName = hre.network.name;
  const chainId     = hre.network.config.chainId;

  console.log(`\n🚀 Deploying WalletBalance to [${networkName}] (chainId: ${chainId})`);

  const [deployer] = await hre.ethers.getSigners();
  console.log(`📬 Deployer: ${deployer.address}`);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`💰 Deployer balance: ${hre.ethers.formatEther(balance)} ETH\n`);

  // Deploy
  const WalletBalance = await hre.ethers.getContractFactory("WalletBalance");
  const contract      = await WalletBalance.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`✅ WalletBalance deployed at: ${address}`);

  // ── Save address to frontend so App.js can pick it up ──────────────────
  const deployedAddresses = loadExisting();
  deployedAddresses[chainId] = {
    network:         networkName,
    chainId,
    contractAddress: address,
    deployedAt:      new Date().toISOString(),
  };
  saveAddresses(deployedAddresses);

  console.log(`\n📄 Contract address saved to frontend/src/deployedAddresses.json`);
  console.log(`\n🎉 Done! You can now use this contract in the frontend.\n`);
}

function loadExisting() {
  const filePath = path.join(__dirname, "../../frontend/src/deployedAddresses.json");
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  }
  return {};
}

function saveAddresses(data) {
  const filePath = path.join(__dirname, "../../frontend/src/deployedAddresses.json");
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error("❌ Deployment failed:", err);
  process.exitCode = 1;
});cd 