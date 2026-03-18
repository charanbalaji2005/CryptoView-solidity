// ─────────────────────────────────────────────────────────────
// swapConfig.js — Official Uniswap V2 addresses, all networks
// Router addresses from: docs.uniswap.org/contracts/v2/reference/smart-contracts/v2-deployments
// ─────────────────────────────────────────────────────────────

export const CHAIN_IDS = {
  MAINNET:  1,
  SEPOLIA:  11155111,
  POLYGON:  137,
  BSC:      56,
  ARBITRUM: 42161,
  BASE:     8453,
  AVALANCHE:43114,
  OPTIMISM: 10,
};

// ── Official Uniswap V2 Router addresses ──────────────────────
export const ROUTER_BY_CHAIN = {
  [1]:        "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // Ethereum Mainnet
  [11155111]: "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3", // Sepolia ✓ OFFICIAL
  [137]:      "0xedf6066a2b290C185783862C7F4776A2C8077AD1", // Polygon
  [56]:       "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24", // BNB Chain
  [42161]:    "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24", // Arbitrum
  [8453]:     "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24", // Base
  [43114]:    "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24", // Avalanche
  [10]:       "0x4A7b5Da61326A6379179b40d00F57E5bbDC962c2", // Optimism
};

export const UNISWAP_ROUTER_ADDRESS = ROUTER_BY_CHAIN[1];

// ── Network metadata ──────────────────────────────────────────
export const NETWORK_INFO = {
  [1]: {
    name: "Ethereum Mainnet", shortName: "Mainnet",
    explorer: "https://etherscan.io", badge: "🔵",
    isTestnet: false, nativeSymbol: "ETH",
  },
  [11155111]: {
    name: "Sepolia Testnet", shortName: "Sepolia",
    explorer: "https://sepolia.etherscan.io", badge: "🟣",
    isTestnet: true, nativeSymbol: "ETH",
  },
  [137]: {
    name: "Polygon", shortName: "Polygon",
    explorer: "https://polygonscan.com", badge: "🟪",
    isTestnet: false, nativeSymbol: "MATIC",
  },
  [56]: {
    name: "BNB Chain", shortName: "BSC",
    explorer: "https://bscscan.com", badge: "🟡",
    isTestnet: false, nativeSymbol: "BNB",
  },
  [42161]: {
    name: "Arbitrum One", shortName: "Arbitrum",
    explorer: "https://arbiscan.io", badge: "🔷",
    isTestnet: false, nativeSymbol: "ETH",
  },
  [8453]: {
    name: "Base", shortName: "Base",
    explorer: "https://basescan.org", badge: "🟦",
    isTestnet: false, nativeSymbol: "ETH",
  },
  [43114]: {
    name: "Avalanche", shortName: "AVAX",
    explorer: "https://snowtrace.io", badge: "🔴",
    isTestnet: false, nativeSymbol: "AVAX",
  },
  [10]: {
    name: "Optimism", shortName: "Optimism",
    explorer: "https://optimistic.etherscan.io", badge: "🔴",
    isTestnet: false, nativeSymbol: "ETH",
  },
};

// ── Token lists per chain ─────────────────────────────────────

// NATIVE placeholder address
const NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

const MAINNET_TOKENS = {
  ETH:  { symbol:"ETH",  name:"Ethereum",       decimals:18, address:NATIVE,                                       logo:"Ξ" },
  WETH: { symbol:"WETH", name:"Wrapped ETH",     decimals:18, address:"0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", logo:"Ξ" },
  USDC: { symbol:"USDC", name:"USD Coin",        decimals:6,  address:"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", logo:"$" },
  USDT: { symbol:"USDT", name:"Tether USD",      decimals:6,  address:"0xdAC17F958D2ee523a2206206994597C13D831ec7", logo:"₮" },
  DAI:  { symbol:"DAI",  name:"Dai Stablecoin",  decimals:18, address:"0x6B175474E89094C44Da98b954EedeAC495271d0F", logo:"◈" },
  LINK: { symbol:"LINK", name:"Chainlink",       decimals:18, address:"0x514910771AF9Ca656af840dff83E8264EcF986CA", logo:"⬡" },
  UNI:  { symbol:"UNI",  name:"Uniswap",         decimals:18, address:"0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", logo:"🦄" },
};

// Sepolia — ONLY tokens that have verified liquidity pools on
// the official router 0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3
// Factory: 0xF62c03E08ada871A0bEb309762E260a7a6a880E6
// Verified pairs: WETH/UNI, WETH/USDC  (use app.uniswap.org to get test tokens)
const SEPOLIA_TOKENS = {
  ETH:  { symbol:"ETH",  name:"Sepolia ETH",     decimals:18, address:NATIVE,                                       logo:"Ξ", testnet:true },
  WETH: { symbol:"WETH", name:"Wrapped ETH",      decimals:18, address:"0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", logo:"Ξ", testnet:true },
  USDC: { symbol:"USDC", name:"USDC (Sepolia)",   decimals:6,  address:"0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", logo:"$", testnet:true },
  UNI:  { symbol:"UNI",  name:"UNI (Sepolia)",    decimals:18, address:"0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", logo:"🦄",testnet:true },
  LINK: { symbol:"LINK", name:"LINK (Sepolia)",   decimals:18, address:"0x779877A7B0D9E8603169DdbD7836e478b4624789", logo:"⬡", testnet:true },
};

const POLYGON_TOKENS = {
  MATIC:{ symbol:"MATIC",name:"Polygon",          decimals:18, address:NATIVE,                                       logo:"⬡" },
  WMATIC:{symbol:"WMATIC",name:"Wrapped MATIC",   decimals:18, address:"0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", logo:"⬡" },
  USDC: { symbol:"USDC", name:"USD Coin",         decimals:6,  address:"0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", logo:"$" },
  USDT: { symbol:"USDT", name:"Tether",           decimals:6,  address:"0xc2132D05D31c914a87C6611C10748AEb04B58e8F", logo:"₮" },
  DAI:  { symbol:"DAI",  name:"Dai",              decimals:18, address:"0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", logo:"◈" },
  WETH: { symbol:"WETH", name:"Wrapped ETH",      decimals:18, address:"0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", logo:"Ξ" },
};

const BSC_TOKENS = {
  BNB:  { symbol:"BNB",  name:"BNB",              decimals:18, address:NATIVE,                                       logo:"B" },
  WBNB: { symbol:"WBNB", name:"Wrapped BNB",      decimals:18, address:"0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", logo:"B" },
  USDT: { symbol:"USDT", name:"Tether",           decimals:18, address:"0x55d398326f99059fF775485246999027B3197955", logo:"₮" },
  USDC: { symbol:"USDC", name:"USD Coin",         decimals:18, address:"0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", logo:"$" },
  ETH:  { symbol:"ETH",  name:"Ethereum",         decimals:18, address:"0x2170Ed0880ac9A755fd29B2688956BD959F933F8", logo:"Ξ" },
  CAKE: { symbol:"CAKE", name:"PancakeSwap",       decimals:18, address:"0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", logo:"🥞" },
};

const ARBITRUM_TOKENS = {
  ETH:  { symbol:"ETH",  name:"Ethereum",         decimals:18, address:NATIVE,                                       logo:"Ξ" },
  WETH: { symbol:"WETH", name:"Wrapped ETH",      decimals:18, address:"0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", logo:"Ξ" },
  USDC: { symbol:"USDC", name:"USD Coin",         decimals:6,  address:"0xaf88d065e77c8cC2239327C5EDb3A432268e5831", logo:"$" },
  USDT: { symbol:"USDT", name:"Tether",           decimals:6,  address:"0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", logo:"₮" },
  ARB:  { symbol:"ARB",  name:"Arbitrum",         decimals:18, address:"0x912CE59144191C1204E64559FE8253a0e49E6548", logo:"🔷" },
};

const BASE_TOKENS = {
  ETH:  { symbol:"ETH",  name:"Ethereum",         decimals:18, address:NATIVE,                                       logo:"Ξ" },
  WETH: { symbol:"WETH", name:"Wrapped ETH",      decimals:18, address:"0x4200000000000000000000000000000000000006", logo:"Ξ" },
  USDC: { symbol:"USDC", name:"USD Coin",         decimals:6,  address:"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", logo:"$" },
  DAI:  { symbol:"DAI",  name:"Dai",              decimals:18, address:"0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", logo:"◈" },
};

const TOKENS_BY_CHAIN = {
  [1]:        MAINNET_TOKENS,
  [11155111]: SEPOLIA_TOKENS,
  [137]:      POLYGON_TOKENS,
  [56]:       BSC_TOKENS,
  [42161]:    ARBITRUM_TOKENS,
  [8453]:     BASE_TOKENS,
};

// Fallback to mainnet for unsupported chains
export function getTokensForChain(chainId) {
  return TOKENS_BY_CHAIN[Number(chainId)] ?? MAINNET_TOKENS;
}

export function getTokenListForChain(chainId) {
  return Object.values(getTokensForChain(chainId));
}

export function getWETHForChain(chainId) {
  const tokens = getTokensForChain(chainId);
  // Return the WETH address (or WMATIC/WBNB for those chains)
  return (
    tokens.WETH?.address ||
    tokens.WMATIC?.address ||
    tokens.WBNB?.address ||
    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
  );
}

export function getRouterForChain(chainId) {
  return ROUTER_BY_CHAIN[Number(chainId)] ?? ROUTER_BY_CHAIN[1];
}

export function getNetworkInfo(chainId) {
  return NETWORK_INFO[Number(chainId)] ?? {
    name:"Unknown Network", shortName:"Unknown",
    explorer:"https://etherscan.io", badge:"⚪",
    isTestnet:false, nativeSymbol:"ETH",
  };
}

export function isSupportedChain(chainId) {
  return !!ROUTER_BY_CHAIN[Number(chainId)];
}

// Backward compat
export const TOKENS    = MAINNET_TOKENS;
export const TOKEN_LIST = Object.values(MAINNET_TOKENS);

// ── ABIs ──────────────────────────────────────────────────────
export const UNISWAP_ROUTER_ABI = [
  "function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)",
  "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
  "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
  "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
  "function WETH() external pure returns (address)",
];

export const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
];

// ── Math helpers ──────────────────────────────────────────────
export function parseAmount(amount, decimals) {
  if (!amount || isNaN(amount)) return 0n;
  const [whole, frac = ""] = String(amount).split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole) * BigInt(10 ** decimals) + BigInt(fracPadded || "0");
}

export function formatAmount(raw, decimals, displayDecimals = 6) {
  if (!raw) return "0";
  const divisor = BigInt(10 ** decimals);
  const whole   = raw / divisor;
  const frac    = raw % divisor;
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, displayDecimals);
  return `${whole}.${fracStr}`;
}

export function applySlippage(amountOut, slippageBps) {
  return (amountOut * BigInt(10000 - slippageBps)) / 10000n;
}

export function buildPath(tokenIn, tokenOut, chainId) {
  const WETH_ADDR = getWETHForChain(chainId);
  if (tokenIn.address  === WETH_ADDR || tokenOut.address === WETH_ADDR) {
    return [tokenIn.address, tokenOut.address];
  }
  return [tokenIn.address, WETH_ADDR, tokenOut.address];
}

export function getDeadline(minutesFromNow = 20) {
  return Math.floor(Date.now() / 1000) + minutesFromNow * 60;
}

export function isNativeETH(token) {
  return token.address === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
}