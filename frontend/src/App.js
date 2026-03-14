import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { networks, getNetworkByChainId } from "./networks";
import { addNetwork } from "./addNetwork";
import "./App.css";
import CandlestickChart from "./components/CandlestickChart";
import "./components/CandlestickChart.css";
// ── CHANGE 1: CryptoNews import ──────────────────────────────────────────────
import CryptoNews from "./components/CryptoNews";

// ── WalletBalance.sol ABI ─────────────────────────────────────────────────────
const WALLET_BALANCE_ABI = [
  "function getNativeBalance(address wallet) external view returns (uint256)",
  "function getMultipleTokenBalances(address wallet, address[] calldata tokenContracts) external view returns (tuple(address contractAddress, string name, string symbol, uint8 decimals, uint256 balance)[])",
];

// ── Deployed contract addresses (auto-filled by deploy.js) ───────────────────
let deployedAddresses = {};
try { deployedAddresses = require("./deployedAddresses.json"); } catch (_) {}

// ── Session helpers (1-day auto-logout) ──────────────────────────────────────
const SESSION_KEY        = "nexus_session";
const ADDED_NETWORKS_KEY = "nexus_added_networks";
const SESSION_TTL        = 24 * 60 * 60 * 1000;

function saveSession(address, chainHex, addedNets) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      address,
      chainHex,
      addedNetworks: addedNets,
      expiresAt: Date.now() + SESSION_TTL,
    }));
  } catch (_) {}
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !s.address || !s.expiresAt) return null;
    if (Date.now() > s.expiresAt) { clearSession(); return null; }
    return s;
  } catch (_) { return null; }
}

function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(ADDED_NETWORKS_KEY);
  } catch (_) {}
}

// ── Token logos ───────────────────────────────────────────────────────────────
const LOGOS = {
  ETH:   "https://assets.coingecko.com/coins/images/279/small/ethereum.png",
  MATIC: "https://assets.coingecko.com/coins/images/4713/small/matic-token-icon.png",
  BNB:   "https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png",
  AVAX:  "https://assets.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png",
  FTM:   "https://assets.coingecko.com/coins/images/4001/small/Fantom_round.png",
  USDT:  "https://assets.coingecko.com/coins/images/325/small/Tether.png",
  USDC:  "https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png",
  DAI:   "https://assets.coingecko.com/coins/images/9956/small/Badge_Dai.png",
  WBTC:  "https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png",
  WETH:  "https://assets.coingecko.com/coins/images/2518/small/weth.png",
  LINK:  "https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png",
  UNI:   "https://assets.coingecko.com/coins/images/12504/small/uniswap-uni.png",
  AAVE:  "https://assets.coingecko.com/coins/images/12645/small/AAVE.png",
  SHIB:  "https://assets.coingecko.com/coins/images/11939/small/shiba.png",
  PEPE:  "https://assets.coingecko.com/coins/images/29850/small/pepe-token.jpeg",
  MKR:   "https://assets.coingecko.com/coins/images/1364/small/Mark_Maker.png",
  CRV:   "https://assets.coingecko.com/coins/images/12124/small/Curve.png",
  LDO:   "https://assets.coingecko.com/coins/images/13573/small/Lido_DAO.png",
  CAKE:  "https://assets.coingecko.com/coins/images/12632/small/pancakeswap-cake-logo.png",
  SOL:   "https://assets.coingecko.com/coins/images/4128/small/solana.png",
  BTC:   "https://assets.coingecko.com/coins/images/1/small/bitcoin.png",
  ATOM:  "https://assets.coingecko.com/coins/images/1481/small/cosmos_hub.png",
  NEAR:  "https://assets.coingecko.com/coins/images/10365/small/near_icon.png",
  DOT:   "https://assets.coingecko.com/coins/images/12171/small/polkadot.png",
  MNT:   "https://assets.coingecko.com/coins/images/30980/small/token-logo.png",
  ZETA:  "https://assets.coingecko.com/coins/images/26718/small/zetachain.jpeg",
  PLS:   "https://assets.coingecko.com/coins/images/30479/small/pulsechain.png",
};
const getLogo = (sym) => LOGOS[sym?.toUpperCase()] ?? null;

function formatBal(raw, decimals) {
  const val = parseFloat(ethers.formatUnits(raw, decimals));
  if (val === 0) return null;
  return val < 0.0001
    ? val.toExponential(2)
    : val.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  // ── Wallet state ──
  const [account,          setAccount]          = useState("");
  const [tokens,           setTokens]           = useState([]);
  const [currentNetwork,   setCurrentNetwork]   = useState(null);
  const [chainIdHex,       setChainIdHex]       = useState("");

  // ── Multi-network state ──
  const [addedNetworks,    setAddedNetworks]    = useState([]);
  const [allNetworkTokens, setAllNetworkTokens] = useState({});
  const [loadingNetworks,  setLoadingNetworks]  = useState(new Set());

  // ── Permission / connection state ──
  const [permissionStep,   setPermissionStep]   = useState("idle");

  // ── UI state ──
  const [scrolled,         setScrolled]         = useState(false);
  const [copied,           setCopied]           = useState(false);
  const [addingNetwork,    setAddingNetwork]    = useState(null);
  const [activeTab,        setActiveTab]        = useState("overview");
  const [error,            setError]            = useState("");
  const [sessionExpiry,    setSessionExpiry]    = useState(null);
  const [showTestnets,     setShowTestnets]     = useState(true);

  // ── Chart state ──
  const [chartToken,       setChartToken]       = useState(null);
  // chartToken = { symbol: "ETH", name: "Ethereum" } | null

  // ── Restore session on mount ──────────────────────────────────────────────
  useEffect(() => {
    const session = loadSession();
    if (session && window.ethereum) {
      (async () => {
        try {
          const accounts = await window.ethereum.request({ method: "eth_accounts" });
          if (accounts && accounts[0]?.toLowerCase() === session.address.toLowerCase()) {
            setAccount(session.address);
            setChainIdHex(session.chainHex);
            setCurrentNetwork(getNetworkByChainId(session.chainHex));
            setPermissionStep("done");
            setSessionExpiry(session.expiresAt);
            const savedNets = session.addedNetworks || [];
            setAddedNetworks(savedNets);
            await fetchAllNetworkBalances(session.address, savedNets);
          } else {
            clearSession();
          }
        } catch (_) { clearSession(); }
      })();
    }
  // eslint-disable-next-line
  }, []);

  // ── Auto-logout when session expires ─────────────────────────────────────
  useEffect(() => {
    if (!sessionExpiry) return;
    const remaining = sessionExpiry - Date.now();
    if (remaining <= 0) { disconnect(); return; }
    const timer = setTimeout(() => { disconnect(); }, remaining);
    return () => clearTimeout(timer);
  // eslint-disable-next-line
  }, [sessionExpiry]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ── Listen for network / account changes from MetaMask ───────────────────
  useEffect(() => {
    if (!window.ethereum) return;

    const onChainChange = (newChain) => {
      setChainIdHex(newChain);
      setCurrentNetwork(getNetworkByChainId(newChain));
      if (account) {
        saveSession(account, newChain, addedNetworks);
        fetchAllNetworkBalances(account, addedNetworks);
      }
    };

    const onAccountsChange = (accounts) => {
      if (accounts.length === 0) {
        setAccount("");
        setTokens([]);
        setAllNetworkTokens({});
        setAddedNetworks([]);
        setPermissionStep("idle");
        clearSession();
        setSessionExpiry(null);
      } else {
        const newAccount = accounts[0];
        setAccount(newAccount);
        if (addedNetworks.length > 0) {
          fetchAllNetworkBalances(newAccount, addedNetworks);
        }
      }
    };

    window.ethereum.on("chainChanged",    onChainChange);
    window.ethereum.on("accountsChanged", onAccountsChange);
    return () => {
      window.ethereum.removeListener("chainChanged",    onChainChange);
      window.ethereum.removeListener("accountsChanged", onAccountsChange);
    };
  // eslint-disable-next-line
  }, [account, addedNetworks]);

  // ─────────────────────────────────────────────────────────────────────
  // STEP 1 — Request wallet_requestPermissions
  // ─────────────────────────────────────────────────────────────────────
  async function requestPermission() {
    if (!window.ethereum) {
      alert("MetaMask is not installed. Please install it from https://metamask.io");
      return;
    }
    setPermissionStep("requesting");
    setError("");
    try {
      const permissions = await window.ethereum.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }],
      });
      const granted = permissions?.some((p) => p.parentCapability === "eth_accounts");
      if (granted) {
        setPermissionStep("granted");
        await connectAfterPermission();
      } else {
        setPermissionStep("denied");
        setError("Permission was not granted.");
      }
    } catch (err) {
      if (err.code === 4001) {
        setPermissionStep("denied");
        setError("You rejected the connection request in MetaMask.");
      } else {
        setPermissionStep("idle");
        setError("Something went wrong: " + (err.message ?? err));
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // STEP 2 — After permission granted, get accounts + balances
  // ─────────────────────────────────────────────────────────────────────
  async function connectAfterPermission() {
    setPermissionStep("loading");
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await window.ethereum.request({ method: "eth_accounts" });
      if (!accounts || accounts.length === 0) {
        setError("No accounts returned. Please try again.");
        setPermissionStep("idle");
        return;
      }
      const address = accounts[0];
      setAccount(address);

      const { chainId } = await provider.getNetwork();
      const hexChain = "0x" + chainId.toString(16);
      setChainIdHex(hexChain);
      setCurrentNetwork(getNetworkByChainId(hexChain));

      const currentAdded = addedNetworks.includes(hexChain)
        ? addedNetworks
        : [hexChain, ...addedNetworks];
      setAddedNetworks(currentAdded);

      await fetchAllNetworkBalances(address, currentAdded);

      saveSession(address, hexChain, currentAdded);
      setSessionExpiry(Date.now() + SESSION_TTL);

      await fetch("http://localhost:5000/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, chainId: hexChain }),
      }).catch(() => {});

      setPermissionStep("done");
    } catch (err) {
      console.error(err);
      setError("Failed to load wallet data: " + (err.message ?? err));
      setPermissionStep("granted");
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // FETCH BALANCES — ALL NETWORKS
  // ─────────────────────────────────────────────────────────────────────
  const fetchAllNetworkBalances = useCallback(async (walletAddress, networksToFetch) => {
    if (!networksToFetch || networksToFetch.length === 0) return;

    setLoadingNetworks(new Set(networksToFetch));
    const tokensByNetwork = {};

    for (const chainHex of networksToFetch) {
      try {
        tokensByNetwork[chainHex] = await fetchBalancesForNetwork(walletAddress, chainHex);
      } catch (err) {
        console.error(`Failed to fetch balances for ${chainHex}:`, err);
        tokensByNetwork[chainHex] = [];
      }
    }

    setAllNetworkTokens(tokensByNetwork);
    if (chainIdHex && tokensByNetwork[chainIdHex]) {
      setTokens(tokensByNetwork[chainIdHex]);
    }
    setLoadingNetworks(new Set());
  }, [chainIdHex]);

  // ─────────────────────────────────────────────────────────────────────
  // FETCH BALANCES — SINGLE NETWORK
  // ─────────────────────────────────────────────────────────────────────
  async function fetchBalancesForNetwork(walletAddress, chainHex) {
    const netConfig = getNetworkByChainId(chainHex);
    if (!netConfig) return [];

    if (netConfig.nonEvm) {
      return [{
        contractAddress: "native",
        name:        netConfig.nativeCurrency.name,
        symbol:      netConfig.nativeCurrency.symbol,
        decimals:    netConfig.nativeCurrency.decimals,
        balance:     "N/A",
        logo:        getLogo(netConfig.nativeCurrency.symbol),
        isNative:    true,
        networkName: netConfig.chainName,
        chainId:     chainHex,
      }];
    }

    try {
      const provider    = new ethers.JsonRpcProvider(netConfig.rpcUrls[0]);
      const rawNative   = await provider.getBalance(walletAddress);
      const nativeSym   = netConfig.nativeCurrency.symbol;
      const tokenAddresses = (netConfig.tokens ?? []).map((t) => t.address);
      const deployInfo  = deployedAddresses[netConfig.chainIdDec];
      const contractAddress = deployInfo?.contractAddress ?? "";

      let tokenResults = [];

      if (contractAddress && tokenAddresses.length > 0) {
        try {
          const contract = new ethers.Contract(contractAddress, WALLET_BALANCE_ABI, provider);
          const raw = await contract.getMultipleTokenBalances(walletAddress, tokenAddresses);
          tokenResults = raw
            .map((t) => {
              const formatted = formatBal(t.balance, t.decimals);
              if (!formatted) return null;
              return {
                contractAddress: t.contractAddress,
                name:        t.name,
                symbol:      t.symbol,
                decimals:    Number(t.decimals),
                balance:     formatted,
                logo:        getLogo(t.symbol),
                networkName: netConfig.chainName,
                chainId:     chainHex,
              };
            })
            .filter(Boolean);
        } catch (contractErr) {
          console.warn("Contract call failed, using RPC fallback:", contractErr);
          tokenResults = await fallbackRpcFetch(walletAddress, netConfig, provider, chainHex);
        }
      } else {
        tokenResults = await fallbackRpcFetch(walletAddress, netConfig, provider, chainHex);
      }

      const nativeRow = {
        contractAddress: "native",
        name:        netConfig.nativeCurrency.name,
        symbol:      nativeSym,
        decimals:    18,
        balance:     parseFloat(ethers.formatEther(rawNative)).toFixed(6),
        logo:        getLogo(nativeSym),
        isNative:    true,
        networkName: netConfig.chainName,
        chainId:     chainHex,
      };

      return [nativeRow, ...tokenResults];
    } catch (err) {
      console.error(`Error fetching balances for ${netConfig.chainName}:`, err);
      return [];
    }
  }

  async function fallbackRpcFetch(walletAddress, netConfig, provider, chainHex) {
    const ERC20_ABI = [
      "function balanceOf(address) view returns (uint256)",
      "function decimals() view returns (uint8)",
    ];
    const results = [];
    for (const tokenDef of netConfig.tokens ?? []) {
      try {
        const c = new ethers.Contract(tokenDef.address, ERC20_ABI, provider);
        const [bal, dec] = await Promise.all([
          c.balanceOf(walletAddress),
          c.decimals().catch(() => 18),
        ]);
        const formatted = formatBal(bal, dec);
        if (!formatted) continue;
        results.push({
          contractAddress: tokenDef.address,
          name:        tokenDef.name,
          symbol:      tokenDef.symbol,
          decimals:    Number(dec),
          balance:     formatted,
          logo:        getLogo(tokenDef.symbol),
          networkName: netConfig.chainName,
          chainId:     chainHex,
        });
      } catch (_) {}
    }
    return results;
  }

  // ─────────────────────────────────────────────────────────────────────
  // ACTIONS
  // ─────────────────────────────────────────────────────────────────────
  function disconnect() {
    setAccount("");
    setTokens([]);
    setAllNetworkTokens({});
    setCurrentNetwork(null);
    setChainIdHex("");
    setAddedNetworks([]);
    setPermissionStep("idle");
    setError("");
    setChartToken(null);
    clearSession();
    setSessionExpiry(null);
  }

  async function handleAddNetwork(net) {
    if (net.nonEvm) { window.open(net.blockExplorerUrls[0], "_blank"); return; }
    if (addedNetworks.includes(net.chainId)) return;

    setAddingNetwork(net.chainId);
    try {
      await addNetwork(net);
      const newAdded = [...addedNetworks, net.chainId];
      setAddedNetworks(newAdded);
      if (account) {
        saveSession(account, chainIdHex, newAdded);
        await fetchAllNetworkBalances(account, newAdded);
      }
    } catch (err) { console.error(err); }
    setAddingNetwork(null);
  }

  async function handleRemoveNetwork(chainId) {
    const newAdded = addedNetworks.filter((id) => id !== chainId);
    setAddedNetworks(newAdded);
    const newAllTokens = { ...allNetworkTokens };
    delete newAllTokens[chainId];
    setAllNetworkTokens(newAllTokens);
    if (account) saveSession(account, chainIdHex, newAdded);
  }

  function copyAddress() {
    navigator.clipboard.writeText(account);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function sessionTimeLeft() {
    if (!sessionExpiry) return null;
    const ms = sessionExpiry - Date.now();
    if (ms <= 0) return null;
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  }

  const short = (a) => (a ? `${a.slice(0, 6)}...${a.slice(-4)}` : "");

  // ── Derived values ────────────────────────────────────────────────────────
  const allTokens      = Object.values(allNetworkTokens).flat();
  const filteredTokens = showTestnets
    ? allTokens
    : allTokens.filter((token) => {
        const network = getNetworkByChainId(token.chainId);
        return !network?.isTestnet;
      });

  const isConnected = permissionStep === "done" && !!account;
  const isLoading   = permissionStep === "loading" || permissionStep === "granted";

  const evmNetworks    = networks.filter((n) => !n.nonEvm);
  const nonEvmNetworks = networks.filter((n) => n.nonEvm);

  const currentNativeBalance =
    currentNetwork && allNetworkTokens[chainIdHex]
      ? allNetworkTokens[chainIdHex].find((t) => t.isNative)?.balance || "—"
      : "—";

  // ══════════════════════════════════════════════════════════════════════
  return (
    <div className="app-root">
      <div className="bg-grid"              aria-hidden="true" />
      <div className="bg-glow bg-glow--blue"   aria-hidden="true" />
      <div className="bg-glow bg-glow--purple" aria-hidden="true" />

      {/* ════ CANDLESTICK CHART MODAL ════ */}
      {chartToken && (
        <CandlestickChart
          symbol={chartToken.symbol}
          tokenName={chartToken.name}
          onClose={() => setChartToken(null)}
        />
      )}

      {/* ════ PERMISSION MODAL ════ */}
      {(permissionStep === "requesting" || permissionStep === "denied") && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal__icon">
              {permissionStep === "requesting" ? "🦊" : "🚫"}
            </div>

            {permissionStep === "requesting" && (
              <>
                <h2 className="modal__title">Waiting for MetaMask…</h2>
                <p className="modal__desc">
                  MetaMask is asking which account you'd like to connect.<br />
                  <strong>Select your account</strong> and click <em>"Connect"</em> in the popup.
                </p>
                <div className="modal__steps">
                  <div className="modal__step modal__step--active">
                    <span className="step-num">1</span>MetaMask popup opens
                  </div>
                  <div className="modal__step">
                    <span className="step-num">2</span>Select your account
                  </div>
                  <div className="modal__step">
                    <span className="step-num">3</span>Click "Connect"
                  </div>
                  <div className="modal__step">
                    <span className="step-num">4</span>Balances load automatically
                  </div>
                </div>
                <div className="modal__spinner">
                  <div className="big-spinner" />
                  <span>Waiting for your approval…</span>
                </div>
              </>
            )}

            {permissionStep === "denied" && (
              <>
                <h2 className="modal__title">Access Denied</h2>
                <p className="modal__desc">
                  You rejected the MetaMask connection request.<br />
                  No wallet data was accessed.
                </p>
                {error && <div className="modal__error">{error}</div>}
                <div className="modal__actions">
                  <button className="btn btn--primary btn--md" onClick={requestPermission}>
                    🦊 Try Again
                  </button>
                  <button className="btn btn--ghost btn--md" onClick={() => setPermissionStep("idle")}>
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ════ NAVBAR ════ */}
      <header className={`navbar${scrolled ? " navbar--scrolled" : ""}`}>
        <div className="navbar__inner">
          <div className="navbar__logo">
            <span className="logo-icon">⬡</span>
            <span className="logo-text">NexusWallet</span>
          </div>
          <nav className="navbar__links">
            <a href="#hero"      className="nav-link">Home</a>
            <a href="#dashboard" className="nav-link">Dashboard</a>
            <a href="#dashboard" className="nav-link" onClick={() => setActiveTab("tokens")}>Tokens</a>
            <a href="#dashboard" className="nav-link" onClick={() => setActiveTab("networks")}>Networks</a>
          </nav>
          <div className="navbar__cta">
            {isConnected ? (
              <div className="nav-address">
                <span className="status-dot" />
                {short(account)}
                {currentNetwork && (
                  <span className="nav-network-pill">{currentNetwork.nativeCurrency.symbol}</span>
                )}
                {sessionTimeLeft() && (
                  <span className="nav-session-pill" title="Session auto-expires">
                    ⏱ {sessionTimeLeft()}
                  </span>
                )}
                <button className="nav-disconnect" onClick={disconnect} title="Disconnect">✕</button>
              </div>
            ) : (
              <button
                className="btn btn--outline btn--sm"
                onClick={requestPermission}
                disabled={isLoading}
              >
                {isLoading ? <><span className="spinner" /> Connecting…</> : "Connect"}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ════ HERO ════ */}
      <section className="hero" id="hero">
        <div className="hero__content">
          <div className="hero__badge">
            <span className="badge-dot" />
            Smart Contract · Multi-Network Balance Reader
          </div>
          <h1 className="hero__title">
            Your Gateway to<br />
            <span className="gradient-text">Multi-Chain</span><br />
            Finance
          </h1>
          <p className="hero__sub">
            Connect once, track everywhere. Add multiple networks and view all your
            token balances across chains in one dashboard. Your session stays active
            for <strong>24 hours</strong>.
          </p>

          <div className="hero__actions">
            {!isConnected ? (
              <button
                className="btn btn--primary btn--lg"
                onClick={requestPermission}
                disabled={isLoading}
              >
                {isLoading
                  ? <><span className="spinner" /> Waiting for MetaMask…</>
                  : <>🦊 Connect MetaMask</>}
              </button>
            ) : (
              <button
                className="btn btn--primary btn--lg"
                onClick={() => fetchAllNetworkBalances(account, addedNetworks)}
              >
                🔄 Refresh All Networks
              </button>
            )}
            <a href="#dashboard" className="btn btn--ghost btn--lg">View Dashboard ↓</a>
          </div>

          {permissionStep !== "idle" && permissionStep !== "requesting" && (
            <div className={`permission-status permission-status--${permissionStep}`}>
              {permissionStep === "granted" && "✓ Permission granted — loading balances…"}
              {permissionStep === "loading" && "⏳ Reading balances from blockchains…"}
              {permissionStep === "done"    && `✓ Connected: ${short(account)} · Session: ${sessionTimeLeft() ?? "expiring"}`}
              {permissionStep === "denied"  && "✗ Permission denied by user"}
            </div>
          )}

          <div className="hero__stats">
            <div className="stat">
              <span className="stat__num">{currentNativeBalance}</span>
              <span className="stat__label">{currentNetwork?.nativeCurrency?.symbol ?? "Native Balance"}</span>
            </div>
            <div className="stat-divider" />
            <div className="stat">
              <span className="stat__num">{allTokens.length > 0 ? allTokens.length : "—"}</span>
              <span className="stat__label">Total Tokens</span>
            </div>
            <div className="stat-divider" />
            <div className="stat">
              <span className="stat__num">{addedNetworks.length || "—"}</span>
              <span className="stat__label">Networks Added</span>
            </div>
          </div>
        </div>

        <div className="hero__visual" aria-hidden="true">
          <div className="card-3d">
            <div className="card-3d__chip" />
            <div className="card-3d__lines">
              <div className="card-3d__line" />
              <div className="card-3d__line card-3d__line--short" />
            </div>
            <div className="card-3d__bottom">
              <span className="card-3d__label">
                {currentNetwork?.nativeCurrency?.symbol ?? "ETH"} Balance
              </span>
              <span className="card-3d__value">
                {currentNativeBalance !== "—"
                  ? `${parseFloat(currentNativeBalance).toFixed(4)} ${currentNetwork?.nativeCurrency?.symbol ?? ""}`
                  : "Connect wallet"}
              </span>
            </div>
          </div>
          <div className="orbit orbit--1" />
          <div className="orbit orbit--2" />
        </div>
      </section>

      {/* ════ DASHBOARD ════ */}
      <section className="dashboard" id="dashboard">
        <div className="section-label">
          Live Dashboard · {addedNetworks.length} Network{addedNetworks.length !== 1 ? "s" : ""} Connected
        </div>
        <h2 className="section-title">Multi-Chain Wallet Overview</h2>
        <p className="section-sub">
          Balances are read on-chain from <code>WalletBalance.sol</code> across all your added networks.
        </p>

        {error && <div className="error-banner">⚠ {error}</div>}

        {/* ── CHANGE 2: Tab Bar (with News tab added) ── */}
        <div className="tab-bar">
          <button
            className={`tab-btn${activeTab === "overview" ? " tab-btn--active" : ""}`}
            onClick={() => setActiveTab("overview")}
          >◎ Overview</button>
          <button
            className={`tab-btn${activeTab === "tokens" ? " tab-btn--active" : ""}`}
            onClick={() => setActiveTab("tokens")}
          >
            🪙 Tokens {allTokens.length > 0 && <span className="tab-badge">{allTokens.length}</span>}
          </button>
          <button
            className={`tab-btn${activeTab === "networks" ? " tab-btn--active" : ""}`}
            onClick={() => setActiveTab("networks")}
          >
            ⬡ Networks {addedNetworks.length > 0 && <span className="tab-badge">{addedNetworks.length}</span>}
          </button>
          <button
            className={`tab-btn${activeTab === "news" ? " tab-btn--active" : ""}`}
            onClick={() => setActiveTab("news")}
          >
            📰 News
          </button>
        </div>

        {/* ── Overview Tab ── */}
        {activeTab === "overview" && (
          <>
            <div className="dashboard__grid">
              <div className={`dash-card${account ? " dash-card--active" : ""}`}>
                <div className="dash-card__icon">◈</div>
                <div className="dash-card__label">Wallet Address</div>
                <div className="dash-card__value dash-card__value--mono">
                  {account || "Not connected"}
                </div>
                {account && (
                  <button className="copy-btn" onClick={copyAddress}>
                    {copied ? "✓ Copied" : "⎘ Copy"}
                  </button>
                )}
              </div>

              <div className={`dash-card${currentNativeBalance !== "—" ? " dash-card--active" : ""}`}>
                <div className="dash-card__icon">◎</div>
                <div className="dash-card__label">
                  {currentNetwork?.nativeCurrency?.symbol ?? "Native"} Balance
                </div>
                <div className="dash-card__value dash-card__value--large">
                  {currentNativeBalance !== "—"
                    ? <><span className="eth-num">{currentNativeBalance}</span>{" "}<span className="eth-unit">{currentNetwork?.nativeCurrency?.symbol}</span></>
                    : "—"}
                </div>
              </div>

              <div className={`dash-card${currentNetwork ? " dash-card--active" : ""}`}>
                <div className="dash-card__icon">⬡</div>
                <div className="dash-card__label">Current Network</div>
                <div className="dash-card__value">
                  {currentNetwork
                    ? <span className="network-badge"><span className="network-dot" />{currentNetwork.chainName}</span>
                    : "—"}
                </div>
              </div>

              <div className={`dash-card${allTokens.length > 0 ? " dash-card--active" : ""}`}>
                <div className="dash-card__icon">🪙</div>
                <div className="dash-card__label">All Tokens (Multi-Chain)</div>
                <div className="dash-card__value dash-card__value--large">
                  {isLoading || loadingNetworks.size > 0
                    ? <span className="loading-dots">Scanning…</span>
                    : allTokens.length > 0
                      ? <><span className="eth-num">{allTokens.length}</span><span className="eth-unit"> tokens</span></>
                      : account ? "None found" : "—"}
                </div>
                {allTokens.length > 0 && (
                  <button className="copy-btn" onClick={() => setActiveTab("tokens")}>View All →</button>
                )}
              </div>

              <div className={`dash-card${addedNetworks.length > 0 ? " dash-card--active" : ""}`}>
                <div className="dash-card__icon">🌐</div>
                <div className="dash-card__label">Networks Added</div>
                <div className="dash-card__value dash-card__value--large">
                  <span className="eth-num">{addedNetworks.length || "—"}</span>
                  {addedNetworks.length > 0 && <span className="eth-unit"> chains</span>}
                </div>
                {addedNetworks.length > 0 && (
                  <button className="copy-btn" onClick={() => setActiveTab("networks")}>Manage →</button>
                )}
              </div>

              {isConnected && (
                <div className="dash-card dash-card--active">
                  <div className="dash-card__icon">⏱</div>
                  <div className="dash-card__label">Session Expires In</div>
                  <div className="dash-card__value dash-card__value--large">
                    <span className="eth-num">{sessionTimeLeft() ?? "—"}</span>
                  </div>
                  <button className="copy-btn" onClick={disconnect}>Logout Now</button>
                </div>
              )}
            </div>

            {!isConnected && (
              <div className="dashboard__empty">
                <div className="empty-icon">🔐</div>
                <p>
                  Click below — MetaMask will open and ask you to<br />
                  <strong>select which account to share</strong> with this app.
                  <br />
                  <span style={{ fontSize: "13px", marginTop: "6px", display: "block" }}>
                    Your session will stay active for 24 hours.
                  </span>
                </p>
                <button className="btn btn--primary btn--md" onClick={requestPermission}>
                  🦊 Grant Wallet Access
                </button>
              </div>
            )}
          </>
        )}

        {/* ── Tokens Tab ── */}
        {activeTab === "tokens" && (
          <div className="tokens-section">

            {/* Header row */}
            <div className="tokens-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ margin: 0, color: "#fff" }}>All Tokens</h3>
              <button
                className="filter-btn"
                style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", padding: "6px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "12px" }}
                onClick={() => setShowTestnets(!showTestnets)}
              >
                {showTestnets ? "Hide Testnets" : "Show Testnets"}
              </button>
            </div>

            {/* Loading */}
            {(isLoading || loadingNetworks.size > 0) && (
              <div className="tokens-loading">
                <div className="tokens-loading__spinner" />
                <p>Reading from <strong>WalletBalance.sol</strong> across {addedNetworks.length} network{addedNetworks.length !== 1 ? "s" : ""}…</p>
              </div>
            )}

            {/* Empty */}
            {!isLoading && loadingNetworks.size === 0 && filteredTokens.length === 0 && isConnected && (
              <div className="dashboard__empty">
                <div className="empty-icon">🔍</div>
                <p>No balances found across your added networks.</p>
              </div>
            )}

            {/* ── Token rows with 📊 Chart button ── */}
            {!isLoading && loadingNetworks.size === 0 && filteredTokens.map((token, i) => {
              const network   = getNetworkByChainId(token.chainId);
              const isTestnet = network?.isTestnet || false;

              return (
                <div
                  className={`token-row${token.isNative ? " token-row--native" : ""}${isTestnet ? " token-row--testnet" : ""}`}
                  key={`${token.chainId}-${token.contractAddress}-${i}`}
                >
                  {/* Logo */}
                  <div className="token-row__logo">
                    {token.logo && (
                      <img
                        src={token.logo}
                        alt={token.symbol}
                        onError={(e) => {
                          e.target.style.display = "none";
                          e.target.nextSibling.style.display = "flex";
                        }}
                      />
                    )}
                    <div className="token-row__fallback" style={{ display: token.logo ? "none" : "flex" }}>
                      {token.symbol?.slice(0, 2).toUpperCase()}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="token-row__info">
                    <span className="token-row__name">
                      {token.name}
                      {token.isNative && <span className="native-pill">Native</span>}
                      {isTestnet      && <span className="testnet-pill">Testnet</span>}
                      <span className="network-pill-small">{token.networkName}</span>
                    </span>
                    <span className="token-row__symbol">
                      {token.symbol}
                      {!token.isNative && network?.blockExplorerUrls?.[0] && (
                        <a
                          href={`${network.blockExplorerUrls[0]}/token/${token.contractAddress}`}
                          target="_blank"
                          rel="noreferrer"
                          className="token-row__explorer"
                        >↗</a>
                      )}
                    </span>
                  </div>

                  {/* Balance */}
                  <div className="token-row__balance">
                    <span className="token-row__amount">{token.balance}</span>
                    <span className="token-row__symbol-right">{token.symbol}</span>
                  </div>

                  {/* 📊 Chart button */}
                  <button
                    className="token-chart-btn"
                    onClick={() => setChartToken({ symbol: token.symbol, name: token.name })}
                    title={`View ${token.symbol} chart`}
                  >
                    📊 Chart
                  </button>
                </div>
              );
            })}

            {/* Not connected */}
            {!isConnected && (
              <div className="dashboard__empty">
                <div className="empty-icon">🔐</div>
                <p>Grant wallet access to see your token balances across all networks.</p>
                <button className="btn btn--primary btn--md" onClick={requestPermission}>
                  🦊 Grant Wallet Access
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Networks Tab ── */}
        {activeTab === "networks" && (
          <div className="networks-section">

            {/* Added Networks */}
            {addedNetworks.length > 0 && (
              <>
                <div className="networks-group-label">✓ Your Added Networks ({addedNetworks.length})</div>
                <div className="networks-grid">
                  {addedNetworks.map((chainId, i) => {
                    const net        = getNetworkByChainId(chainId);
                    if (!net) return null;
                    const isActive   = net.chainId === chainIdHex;
                    const isLoad     = loadingNetworks.has(chainId);
                    const tokenCount = allNetworkTokens[chainId]?.length || 0;
                    return (
                      <div
                        className={`network-card network-card--added${isActive ? " network-card--active" : ""}`}
                        key={i}
                      >
                        <div className="network-card__avatar">
                          {net.chainName?.charAt(0)?.toUpperCase()}
                        </div>
                        <div className="network-card__info">
                          <div className="network-card__name">
                            {net.chainName}
                            {isActive && <span className="active-pill">Active</span>}
                          </div>
                          <div className="network-card__meta">
                            <span className="network-card__chain-id">ID: {net.chainIdDec}</span>
                            <span className="network-card__symbol">· {net.nativeCurrency.symbol}</span>
                            {tokenCount > 0 && <span className="network-card__deployed">· {tokenCount} tokens</span>}
                            {isLoad && <span className="network-card__loading">· Loading...</span>}
                          </div>
                        </div>
                        <button
                          className="remove-btn"
                          onClick={() => handleRemoveNetwork(chainId)}
                          disabled={isActive}
                          title={isActive ? "Cannot remove active network" : "Remove network"}
                        >✕</button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Available EVM Networks */}
            <div className="networks-group-label" style={{ marginTop: addedNetworks.length > 0 ? "36px" : "0" }}>
              ⬡ Available EVM Networks
            </div>
            <div className="networks-grid">
              {evmNetworks.map((net, i) => {
                const isAdded  = addedNetworks.includes(net.chainId);
                const isActive = net.chainId === chainIdHex;
                const isAdding = addingNetwork === net.chainId;
                const deployed = deployedAddresses[net.chainIdDec];
                if (isAdded) return null;
                return (
                  <div className={`network-card${isActive ? " network-card--active" : ""}`} key={i}>
                    <div className="network-card__avatar">
                      {net.chainName?.charAt(0)?.toUpperCase()}
                    </div>
                    <div className="network-card__info">
                      <div className="network-card__name">
                        {net.chainName}
                        {isActive && <span className="active-pill">Connected</span>}
                      </div>
                      <div className="network-card__meta">
                        <span className="network-card__chain-id">ID: {net.chainIdDec}</span>
                        <span className="network-card__symbol">· {net.nativeCurrency.symbol}</span>
                        {deployed && <span className="network-card__deployed">· ✓ Contract</span>}
                      </div>
                    </div>
                    <button
                      className="add-btn"
                      onClick={() => handleAddNetwork(net)}
                      disabled={isAdding || !isConnected}
                      title={!isConnected ? "Connect wallet first" : "Add network"}
                    >
                      {isAdding ? <span className="spinner spinner--sm" /> : "+ Add"}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Non-EVM Networks */}
            <div className="networks-group-label networks-group-label--alt">
              🌐 Non-EVM Networks (via Snaps / external wallets)
            </div>
            <div className="networks-grid">
              {nonEvmNetworks.map((net, i) => {
                const logo = getLogo(net.nativeCurrency.symbol);
                return (
                  <div className="network-card network-card--nonevm" key={i}>
                    <div className="network-card__avatar network-card__avatar--nonevm">
                      {logo
                        ? <img src={logo} alt={net.nativeCurrency.symbol} style={{ width: "28px", height: "28px", borderRadius: "50%" }} />
                        : net.chainName?.charAt(0)?.toUpperCase()}
                    </div>
                    <div className="network-card__info">
                      <div className="network-card__name">
                        {net.chainName}
                        <span className="snap-pill">Snap</span>
                      </div>
                      <div className="network-card__meta">
                        <span className="network-card__symbol">{net.nativeCurrency.symbol}</span>
                        <span className="network-card__chain-id">· Non-EVM</span>
                      </div>
                    </div>
                    <button
                      className="add-btn add-btn--snap"
                      onClick={() => handleAddNetwork(net)}
                      title="Open block explorer"
                    >↗ View</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── CHANGE 3: News Tab ── */}
        {activeTab === "news" && (
          <CryptoNews />
        )}

      </section>

      {/* ════ FOOTER ════ */}
      <footer className="footer">
        <div className="footer__logo">
          <span className="logo-icon">⬡</span>
          <span className="logo-text">NexusWallet</span>
        </div>
        <p className="footer__copy">© 2026 NexusWallet · Powered by WalletBalance.sol · Multi-Chain Support</p>
      </footer>
    </div>
  );
}