// ─────────────────────────────────────────────────────────────
// swap-engine.js  —  Price quotes, approvals, swap execution
//                    Now chain-aware (Mainnet + Sepolia)
// ─────────────────────────────────────────────────────────────
import { ethers } from "ethers";
import {
  UNISWAP_ROUTER_ABI,
  ERC20_ABI,
  parseAmount,
  formatAmount,
  applySlippage,
  buildPath,
  getDeadline,
  getRouterForChain,
  getWETHForChain,
  getTokensForChain,
  isNativeETH,
} from "./swapConfig";

// ── Detect chain from provider ────────────────────────────────
async function getChainId(provider) {
  const net = await provider.getNetwork();
  return Number(net.chainId);
}

// ── 1. Get a price quote ──────────────────────────────────────
export async function getQuote(provider, tokenIn, tokenOut, amountIn) {
  if (!amountIn || parseFloat(amountIn) === 0) {
    return { amountOut: "", amountOutRaw: 0n, path: [] };
  }

  const chainId     = await getChainId(provider);
  const chainTokens = getTokensForChain(chainId);
  const WETH        = chainTokens.WETH;
  const routerAddr  = getRouterForChain(chainId);

  // Map native ETH → WETH for routing
  const effectiveIn  = isNativeETH(tokenIn)  ? WETH : tokenIn;
  const effectiveOut = isNativeETH(tokenOut) ? WETH : tokenOut;

  const path      = buildPath(effectiveIn, effectiveOut, chainId);
  const amountRaw = parseAmount(amountIn, effectiveIn.decimals);
  if (amountRaw === 0n) return { amountOut: "", amountOutRaw: 0n, path };

  const router  = new ethers.Contract(routerAddr, UNISWAP_ROUTER_ABI, provider);
  const amounts = await router.getAmountsOut(amountRaw, path);
  const outRaw  = amounts[amounts.length - 1];

  return {
    amountOut:    formatAmount(outRaw, effectiveOut.decimals, 6),
    amountOutRaw: outRaw,
    path,
    chainId,
  };
}

// ── 2. Check allowance ────────────────────────────────────────
export async function checkAllowance(provider, tokenIn, userAddress, amountInRaw) {
  if (isNativeETH(tokenIn)) return true;

  const chainId    = await getChainId(provider);
  const routerAddr = getRouterForChain(chainId);
  const token      = new ethers.Contract(tokenIn.address, ERC20_ABI, provider);
  const allowance  = await token.allowance(userAddress, routerAddr);
  return allowance >= amountInRaw;
}

// ── 3. Approve token spend ────────────────────────────────────
export async function approveToken(signer, tokenIn, onStatus) {
  onStatus("Requesting approval in MetaMask…");

  const chainId    = await getChainId(signer.provider);
  const routerAddr = getRouterForChain(chainId);
  const token      = new ethers.Contract(tokenIn.address, ERC20_ABI, signer);
  const tx         = await token.approve(routerAddr, ethers.MaxUint256);

  onStatus("Waiting for approval confirmation…");
  await tx.wait();
  onStatus("Approval confirmed ✓");
  return tx.hash;
}

// ── 4. Execute swap ───────────────────────────────────────────
export async function executeSwap({
  signer, tokenIn, tokenOut,
  amountIn, amountOutRaw, path,
  slippageBps, userAddress, onStatus,
}) {
  const chainId    = await getChainId(signer.provider);
  const routerAddr = getRouterForChain(chainId);
  const chainTokens = getTokensForChain(chainId);
  const WETH        = chainTokens.WETH;

  const router    = new ethers.Contract(routerAddr, UNISWAP_ROUTER_ABI, signer);
  const deadline  = getDeadline(20);
  const amountMin = applySlippage(amountOutRaw, slippageBps);

  const effectiveIn  = isNativeETH(tokenIn)  ? WETH : tokenIn;
  const effectiveOut = isNativeETH(tokenOut) ? WETH : tokenOut;
  const amountInRaw  = parseAmount(amountIn, effectiveIn.decimals);

  onStatus("Confirm the swap in MetaMask…");

  let tx;

  if (isNativeETH(tokenIn)) {
    // ETH → Token
    tx = await router.swapExactETHForTokens(
      amountMin, path, userAddress, deadline,
      { value: amountInRaw }
    );
  } else if (isNativeETH(tokenOut)) {
    // Token → ETH
    tx = await router.swapExactTokensForETH(
      amountInRaw, amountMin, path, userAddress, deadline
    );
  } else {
    // Token → Token
    tx = await router.swapExactTokensForTokens(
      amountInRaw, amountMin, path, userAddress, deadline
    );
  }

  onStatus("Swap submitted — waiting for confirmation…");
  const receipt = await tx.wait();
  const finalOut = formatAmount(amountOutRaw, effectiveOut.decimals, 6);

  return {
    txHash:      tx.hash,
    amountOut:   finalOut,
    blockNumber: receipt.blockNumber,
    chainId,
  };
}

// ── 5. Get token balance ──────────────────────────────────────
export async function getTokenBalance(provider, token, userAddress) {
  if (!userAddress) return "0";

  if (isNativeETH(token)) {
    const raw = await provider.getBalance(userAddress);
    return formatAmount(raw, 18, 4);
  }

  const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
  const raw      = await contract.balanceOf(userAddress);
  return formatAmount(raw, token.decimals, 4);
}