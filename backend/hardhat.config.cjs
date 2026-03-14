require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: "0.8.20",
  networks: {
    sepolia: {
      url: "https://sepolia.infura.io/v3/2b124268f47f4249ab6fab19d16900f0",
      accounts: [
        "0x786550616bd42449f8c9f51b38a1febf82f46c89792661f5ee265479565dd4cf"
      ],
      chainId: 11155111
    }
  }
};