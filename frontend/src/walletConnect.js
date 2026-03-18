// frontend/src/walletConnect.js
import { EthereumProvider } from "@walletconnect/ethereum-provider";

// 👇 Get your free Project ID from https://cloud.walletconnect.com
const WC_PROJECT_ID = "com.crypto.walletapp";

export async function connectWallet() {
  // ── Desktop: MetaMask extension ──────────────────────────────
  if (window.ethereum && window.ethereum.isMetaMask) {
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    });
    return {
      provider: window.ethereum,
      accounts,
      type: "extension",
    };
  }

  // ── Mobile: No extension → use WalletConnect ─────────────────
  const wcProvider = await EthereumProvider.init({
    projectId: WC_PROJECT_ID,
    chains: [1],                  // mainnet — add more as needed e.g. [1, 11155111]
    optionalChains: [11155111],   // Sepolia testnet
    showQrModal: true,            // shows QR + deep-link modal automatically
    metadata: {
      name: "Web3 Wallet Project",
      description: "My DApp",
      url: window.location.origin,
      icons: [`${window.location.origin}/favicon.ico`],
    },
  });

  await wcProvider.connect();

  const accounts = wcProvider.accounts;
  return {
    provider: wcProvider,
    accounts,
    type: "walletconnect",
  };
}

export async function disconnectWallet(provider) {
  if (provider?.disconnect) {
    await provider.disconnect();
  }
}

export function isMobile() {
  return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(
    navigator.userAgent
  );
}