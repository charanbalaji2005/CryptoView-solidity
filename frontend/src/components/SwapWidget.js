// ─────────────────────────────────────────────────────────────
// SwapWidget.js — Multi-network swap UI (Mainnet, Sepolia,
//                 Polygon, BSC, Arbitrum, Base + more)
//                 Uses official Uniswap V2 router addresses
// ─────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef, useCallback } from "react";
import { getQuote, approveToken, executeSwap, checkAllowance, getTokenBalance } from "../swap-engine";
import {
  parseAmount, isNativeETH,
  getTokenListForChain, getTokensForChain,
  getNetworkInfo, isSupportedChain,
} from "../swapConfig";
import "./swap-widget.css";

// ── Token modal ────────────────────────────────────────────────
function TokenModal({ onSelect, onClose, exclude, chainId }) {
  const [search, setSearch] = useState("");
  const list = getTokenListForChain(chainId).filter(
    (t) => t.address !== exclude?.address &&
      (t.symbol.toLowerCase().includes(search.toLowerCase()) ||
       t.name.toLowerCase().includes(search.toLowerCase()))
  );
  return (
    <div className="sw-modal-overlay" onClick={onClose}>
      <div className="sw-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sw-modal-header">
          <span>Select token</span>
          <button className="sw-close" onClick={onClose}>✕</button>
        </div>
        <input className="sw-modal-search" placeholder="Search…"
          value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
        <div className="sw-token-list">
          {list.map((token) => (
            <button key={token.address} className="sw-token-row"
              onClick={() => { onSelect(token); onClose(); }}>
              <span className="sw-token-logo">{token.logo}</span>
              <span className="sw-token-info">
                <span className="sw-token-symbol">{token.symbol}</span>
                <span className="sw-token-name">{token.name}</span>
              </span>
              {token.testnet && <span className="sw-testnet-pill">Testnet</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Settings ────────────────────────────────────────────────────
function Settings({ slippage, setSlippage, deadline, setDeadline, onClose }) {
  return (
    <div className="sw-settings">
      <div className="sw-settings-header">
        <span>Swap settings</span>
        <button className="sw-close" onClick={onClose}>✕</button>
      </div>
      <label className="sw-label">Slippage tolerance</label>
      <div className="sw-slippage-row">
        {[10, 50, 100].map((bps) => (
          <button key={bps} className={`sw-preset ${slippage === bps ? "active" : ""}`}
            onClick={() => setSlippage(bps)}>{bps / 100}%</button>
        ))}
        <div className="sw-custom-slip">
          <input type="number" value={slippage / 100} min="0.01" max="50" step="0.1"
            onChange={(e) => setSlippage(Math.round(parseFloat(e.target.value) * 100))} />
          <span>%</span>
        </div>
      </div>
      <label className="sw-label">Transaction deadline</label>
      <div className="sw-deadline-row">
        <input type="number" value={deadline} min="1" max="60"
          onChange={(e) => setDeadline(parseInt(e.target.value))} />
        <span>minutes</span>
      </div>
      {slippage > 100 && <p className="sw-warning">⚠ High slippage — you may receive much less</p>}
    </div>
  );
}

// ── Friendly error messages ────────────────────────────────────
function friendlyError(e) {
  const msg = e?.reason || e?.data?.message || e?.message || String(e);
  if (msg.includes("INVALID_PATH"))
    return "No liquidity pool for this pair. Try a different token.";
  if (msg.includes("INSUFFICIENT_OUTPUT_AMOUNT"))
    return "Price moved too much. Increase slippage in ⚙ settings.";
  if (msg.includes("INSUFFICIENT_LIQUIDITY"))
    return "Not enough liquidity. Try a smaller amount.";
  if (msg.includes("EXPIRED"))
    return "Transaction expired. Please try again.";
  if (msg.includes("user rejected") || msg.includes("ACTION_REJECTED"))
    return "Transaction rejected in MetaMask.";
  if (msg.includes("insufficient funds"))
    return "Insufficient ETH for gas fees.";
  return msg.length > 90 ? msg.slice(0, 90) + "…" : msg;
}

// ── Sepolia info text ──────────────────────────────────────────
const SEPOLIA_INFO = (
  <>
    🧪 <strong>Sepolia testnet</strong> — test tokens only.{" "}
    Valid pairs: <strong>ETH ↔ USDC · ETH ↔ UNI · ETH ↔ LINK</strong>.{" "}
    Get free ETH at{" "}
    <a href="https://sepoliafaucet.com" target="_blank" rel="noreferrer">sepoliafaucet.com</a>
    {" "}and test tokens at{" "}
    <a href="https://app.uniswap.org/swap?chain=sepolia" target="_blank" rel="noreferrer">app.uniswap.org</a>
  </>
);

// ── Main SwapWidget ─────────────────────────────────────────────
export default function SwapWidget({ provider, signer, userAddress }) {

  // ── Read chainId from window.ethereum directly (never from provider.getNetwork()
  //    on a chainChanged event — the provider object may still reference old chain)
  const [chainId, setChainId] = useState(() =>
    window.ethereum?.chainId ? parseInt(window.ethereum.chainId, 16) : 1
  );

  useEffect(() => {
    if (!provider) return;
    // On initial mount, ask provider for chain (it's fresh here)
    provider.getNetwork()
      .then((net) => setChainId(Number(net.chainId)))
      .catch(() => {
        if (window.ethereum?.chainId) setChainId(parseInt(window.ethereum.chainId, 16));
      });
  }, [provider]);

  useEffect(() => {
    if (!window.ethereum) return;
    // chainChanged passes the new chainId as hex — use it directly
    const onChainChange = (hexChain) => setChainId(parseInt(hexChain, 16));
    window.ethereum.on("chainChanged", onChainChange);
    return () => window.ethereum.removeListener("chainChanged", onChainChange);
  }, []);

  const networkInfo   = getNetworkInfo(chainId);
  const supported     = isSupportedChain(chainId);

  // ── Default tokens per chain ──────────────────────────────────
  const getDefaults = useCallback((cid) => {
    const t = getTokensForChain(cid);
    return { tokenIn: t.ETH || Object.values(t)[0], tokenOut: t.USDC || Object.values(t)[2] };
  }, []);

  const [tokenIn,  setTokenIn]  = useState(() => getDefaults(chainId).tokenIn);
  const [tokenOut, setTokenOut] = useState(() => getDefaults(chainId).tokenOut);

  // ── Reset state when chain changes ───────────────────────────
  useEffect(() => {
    const { tokenIn: newIn, tokenOut: newOut } = getDefaults(chainId);
    setTokenIn(newIn);
    setTokenOut(newOut);
    setAmountIn("");
    setAmountOut("");
    setAmountOutRaw(0n);
    setPath([]);
    setError("");
    setStatus("");
    setTxHash("");
  }, [chainId, getDefaults]);

  // ── Swap state ────────────────────────────────────────────────
  const [amountIn,      setAmountIn]      = useState("");
  const [amountOut,     setAmountOut]     = useState("");
  const [amountOutRaw,  setAmountOutRaw]  = useState(0n);
  const [path,          setPath]          = useState([]);
  const [quoteLoading,  setQuoteLoading]  = useState(false);
  const [balanceIn,     setBalanceIn]     = useState("0");
  const [balanceOut,    setBalanceOut]    = useState("0");
  const [needsApproval, setNeedsApproval] = useState(false);
  const [status,        setStatus]        = useState("");
  const [txHash,        setTxHash]        = useState("");
  const [error,         setError]         = useState("");
  const [loading,       setLoading]       = useState(false);
  const [showTokenInModal,  setShowTokenInModal]  = useState(false);
  const [showTokenOutModal, setShowTokenOutModal] = useState(false);
  const [showSettings,      setShowSettings]      = useState(false);
  const [slippage,  setSlippage]  = useState(50);
  const [deadline,  setDeadline]  = useState(20);

  const quoteDebounce = useRef(null);

  // ── Clear error immediately when token pair changes ───────────
  const prevInRef  = useRef(tokenIn?.address);
  const prevOutRef = useRef(tokenOut?.address);
  useEffect(() => {
    if (tokenIn?.address !== prevInRef.current || tokenOut?.address !== prevOutRef.current) {
      setError("");
      setAmountOut("");
      setAmountOutRaw(0n);
      prevInRef.current  = tokenIn?.address;
      prevOutRef.current = tokenOut?.address;
    }
  }, [tokenIn?.address, tokenOut?.address]);

  // ── Balances ──────────────────────────────────────────────────
  useEffect(() => {
    if (!provider || !userAddress) return;
    getTokenBalance(provider, tokenIn,  userAddress).then(setBalanceIn).catch(() => setBalanceIn("—"));
    getTokenBalance(provider, tokenOut, userAddress).then(setBalanceOut).catch(() => setBalanceOut("—"));
  }, [provider, userAddress, tokenIn, tokenOut, txHash, chainId]);

  // ── Quote (debounced 600ms) ───────────────────────────────────
  useEffect(() => {
    if (quoteDebounce.current) clearTimeout(quoteDebounce.current);
    if (!amountIn || !provider || !supported) {
      setAmountOut(""); setError(""); return;
    }
    setQuoteLoading(true);
    quoteDebounce.current = setTimeout(async () => {
      try {
        const { amountOut: out, amountOutRaw: outRaw, path: p } =
          await getQuote(provider, tokenIn, tokenOut, amountIn);
        setAmountOut(out); setAmountOutRaw(outRaw); setPath(p); setError("");
      } catch (e) {
        setAmountOut(""); setAmountOutRaw(0n); setError(friendlyError(e));
      } finally { setQuoteLoading(false); }
    }, 600);
  }, [amountIn, tokenIn, tokenOut, provider, chainId, supported]);

  // ── Approval check ────────────────────────────────────────────
  useEffect(() => {
    if (!provider || !userAddress || !amountIn || isNativeETH(tokenIn)) {
      setNeedsApproval(false); return;
    }
    const raw = parseAmount(amountIn, tokenIn.decimals);
    checkAllowance(provider, tokenIn, userAddress, raw)
      .then((ok) => setNeedsApproval(!ok))
      .catch(() => setNeedsApproval(false));
  }, [provider, userAddress, tokenIn, amountIn, chainId]);

  function flipTokens() {
    setTokenIn(tokenOut); setTokenOut(tokenIn);
    setAmountIn(amountOut); setAmountOut(amountIn);
  }

  async function handleApprove() {
    setLoading(true); setError(""); setTxHash("");
    try {
      await approveToken(signer, tokenIn, setStatus);
      setNeedsApproval(false);
    } catch (e) { setError(friendlyError(e)); }
    finally { setLoading(false); }
  }

  async function handleSwap() {
    if (!signer || !userAddress) { setError("Connect your wallet first"); return; }
    setLoading(true); setError(""); setTxHash("");
    try {
      const result = await executeSwap({
        signer, tokenIn, tokenOut, amountIn,
        amountOutRaw, path, slippageBps: slippage,
        userAddress, onStatus: setStatus,
      });
      setTxHash(result.txHash);
      setAmountIn(""); setAmountOut(""); setAmountOutRaw(0n);
      setStatus("✓ Swap complete!");
    } catch (e) { setError(friendlyError(e)); setStatus(""); }
    finally { setLoading(false); }
  }

  const hasValidQuote = !!amountOut && amountOutRaw > 0n;
  const canSwap = !loading && !quoteLoading && amountIn && hasValidQuote && signer && userAddress && !error;

  const priceImpact = hasValidQuote && amountIn
    ? `~${((parseFloat(amountIn) / parseFloat(amountOut)) * 0.3).toFixed(2)}%`
    : null;

  const explorerTxUrl = txHash ? `${networkInfo.explorer}/tx/${txHash}` : null;

  return (
    <div className="sw-wrapper">

      {/* Header */}
      <div className="sw-header">
        <span className="sw-title">Swap</span>
        <div className="sw-header-actions">
          <span className={`sw-network-badge ${networkInfo.isTestnet ? "sw-network-badge--testnet" : ""}`}>
            {networkInfo.badge} {networkInfo.shortName}
          </span>
          <button className={`sw-icon-btn ${showSettings ? "active" : ""}`}
            onClick={() => setShowSettings(!showSettings)} title="Settings">⚙</button>
        </div>
      </div>

      {/* Unsupported network */}
      {!supported && (
        <div className="sw-network-warning">
          ⚠ <strong>{networkInfo.name}</strong> is not supported. Switch to Mainnet, Sepolia,
          Polygon, BSC, Arbitrum, Base, or Avalanche in MetaMask.
        </div>
      )}

      {/* Sepolia info */}
      {networkInfo.isTestnet && supported && (
        <div className="sw-testnet-banner">{SEPOLIA_INFO}</div>
      )}

      {/* Settings */}
      {showSettings && (
        <Settings slippage={slippage} setSlippage={setSlippage}
          deadline={deadline} setDeadline={setDeadline}
          onClose={() => setShowSettings(false)} />
      )}

      {/* Token In */}
      <div className="sw-panel">
        <div className="sw-panel-row">
          <div className="sw-amount-wrap">
            <label className="sw-panel-label">You pay</label>
            <input className="sw-amount-input" type="number" placeholder="0.0"
              value={amountIn} onChange={(e) => setAmountIn(e.target.value)}
              min="0" disabled={!supported} />
          </div>
          <div className="sw-token-side">
            <button className="sw-token-btn" onClick={() => setShowTokenInModal(true)}>
              <span className="sw-btn-logo">{tokenIn?.logo}</span>
              <span className="sw-btn-symbol">{tokenIn?.symbol}</span>
              <span className="sw-chevron">▾</span>
            </button>
            {userAddress && (
              <div className="sw-balance">
                Balance: {balanceIn}
                <button className="sw-max-btn" onClick={() => setAmountIn(balanceIn)}>MAX</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Flip */}
      <div className="sw-flip-row">
        <button className="sw-flip-btn" onClick={flipTokens}>⇅</button>
      </div>

      {/* Token Out */}
      <div className="sw-panel">
        <div className="sw-panel-row">
          <div className="sw-amount-wrap">
            <label className="sw-panel-label">You receive</label>
            <div className="sw-amount-display">
              {quoteLoading
                ? <span className="sw-loading-dots">···</span>
                : amountOut || "0.0"}
            </div>
          </div>
          <div className="sw-token-side">
            <button className="sw-token-btn" onClick={() => setShowTokenOutModal(true)}>
              <span className="sw-btn-logo">{tokenOut?.logo}</span>
              <span className="sw-btn-symbol">{tokenOut?.symbol}</span>
              <span className="sw-chevron">▾</span>
            </button>
            {userAddress && <div className="sw-balance">Balance: {balanceOut}</div>}
          </div>
        </div>
      </div>

      {/* Details */}
      {hasValidQuote && !error && (
        <div className="sw-details">
          <div className="sw-detail-row">
            <span>Min. received</span>
            <span>{(parseFloat(amountOut) * (1 - slippage/10000)).toFixed(6)} {tokenOut?.symbol}</span>
          </div>
          <div className="sw-detail-row">
            <span>Slippage</span>
            <span>{slippage / 100}%</span>
          </div>
          <div className="sw-detail-row">
            <span>Route</span>
            <span className="sw-route">
              {tokenIn?.symbol}{path.length > 2 && " → W" + networkInfo.nativeSymbol}{" → "}{tokenOut?.symbol}
            </span>
          </div>
          {priceImpact && (
            <div className="sw-detail-row">
              <span>Price impact</span>
              <span className={parseFloat(priceImpact) > 3 ? "sw-danger" : ""}>{priceImpact}</span>
            </div>
          )}
        </div>
      )}

      {error  && <div className="sw-error">{error}</div>}
      {status && !error && <div className="sw-status">{status}</div>}

      {explorerTxUrl && (
        <a className="sw-tx-link" href={explorerTxUrl} target="_blank" rel="noopener noreferrer">
          View on {networkInfo.shortName} Explorer ↗
        </a>
      )}

      {/* Action buttons */}
      {!userAddress ? (
        <button className="sw-btn sw-btn-connect" disabled>Connect wallet to swap</button>
      ) : !supported ? (
        <button className="sw-btn sw-btn-connect" disabled>Unsupported network</button>
      ) : needsApproval ? (
        <button className="sw-btn sw-btn-approve" onClick={handleApprove} disabled={loading}>
          {loading ? "Approving…" : `Approve ${tokenIn?.symbol}`}
        </button>
      ) : (
        <button className="sw-btn sw-btn-swap" onClick={handleSwap} disabled={!canSwap}>
          {loading ? "Swapping…"
            : !amountIn        ? "Enter an amount"
            : quoteLoading     ? "Getting quote…"
            : error            ? "Cannot swap"
            : "Swap"}
        </button>
      )}

      <div className="sw-footer">
        Uniswap V2 · {networkInfo.name}
      </div>

      {showTokenInModal && (
        <TokenModal onSelect={(t) => { setTokenIn(t); setError(""); }}
          onClose={() => setShowTokenInModal(false)} exclude={tokenOut} chainId={chainId} />
      )}
      {showTokenOutModal && (
        <TokenModal onSelect={(t) => { setTokenOut(t); setError(""); }}
          onClose={() => setShowTokenOutModal(false)} exclude={tokenIn} chainId={chainId} />
      )}
    </div>
  );
}