import { useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";
import { networks, getNetworkByChainId } from "./networks";
import { addNetwork } from "./addNetwork";
import "./App.css";
import CandlestickChart from "./components/CandlestickChart";
import "./components/CandlestickChart.css";
import CryptoNews from "./components/CryptoNews";
import SwapWidget from "./components/SwapWidget";

// ── WalletBalance.sol ABI ─────────────────────────────────────────────────────
const WALLET_BALANCE_ABI = [
  "function getNativeBalance(address wallet) external view returns (uint256)",
  "function getMultipleTokenBalances(address wallet, address[] calldata tokenContracts) external view returns (tuple(address contractAddress, string name, string symbol, uint8 decimals, uint256 balance)[])",
];

let deployedAddresses = {};
try { deployedAddresses = require("./deployedAddresses.json"); } catch (_) {}

// ── Session helpers ───────────────────────────────────────────────────────────
const SESSION_KEY        = "nexus_session";
const ADDED_NETWORKS_KEY = "nexus_added_networks";
const SESSION_TTL        = 24 * 60 * 60 * 1000;

function saveSession(address, chainHex, addedNets) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      address, chainHex, addedNetworks: addedNets,
      expiresAt: Date.now() + SESSION_TTL,
    }));
  } catch (_) {}
}
function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s?.address || !s?.expiresAt) return null;
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
  ETH:"https://assets.coingecko.com/coins/images/279/small/ethereum.png",
  MATIC:"https://assets.coingecko.com/coins/images/4713/small/matic-token-icon.png",
  BNB:"https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png",
  AVAX:"https://assets.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png",
  FTM:"https://assets.coingecko.com/coins/images/4001/small/Fantom_round.png",
  USDT:"https://assets.coingecko.com/coins/images/325/small/Tether.png",
  USDC:"https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png",
  DAI:"https://assets.coingecko.com/coins/images/9956/small/Badge_Dai.png",
  WBTC:"https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png",
  WETH:"https://assets.coingecko.com/coins/images/2518/small/weth.png",
  LINK:"https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png",
  UNI:"https://assets.coingecko.com/coins/images/12504/small/uniswap-uni.png",
  AAVE:"https://assets.coingecko.com/coins/images/12645/small/AAVE.png",
  SHIB:"https://assets.coingecko.com/coins/images/11939/small/shiba.png",
  PEPE:"https://assets.coingecko.com/coins/images/29850/small/pepe-token.jpeg",
  MKR:"https://assets.coingecko.com/coins/images/1364/small/Mark_Maker.png",
  CRV:"https://assets.coingecko.com/coins/images/12124/small/Curve.png",
  LDO:"https://assets.coingecko.com/coins/images/13573/small/Lido_DAO.png",
  CAKE:"https://assets.coingecko.com/coins/images/12632/small/pancakeswap-cake-logo.png",
  SOL:"https://assets.coingecko.com/coins/images/4128/small/solana.png",
  BTC:"https://assets.coingecko.com/coins/images/1/small/bitcoin.png",
  ATOM:"https://assets.coingecko.com/coins/images/1481/small/cosmos_hub.png",
  NEAR:"https://assets.coingecko.com/coins/images/10365/small/near_icon.png",
  DOT:"https://assets.coingecko.com/coins/images/12171/small/polkadot.png",
  MNT:"https://assets.coingecko.com/coins/images/30980/small/token-logo.png",
  ZETA:"https://assets.coingecko.com/coins/images/26718/small/zetachain.jpeg",
  PLS:"https://assets.coingecko.com/coins/images/30479/small/pulsechain.png",
};
const getLogo = (sym) => LOGOS[sym?.toUpperCase()] ?? null;

function formatBal(raw, decimals) {
  const val = parseFloat(ethers.formatUnits(raw, decimals));
  if (val === 0) return null;
  return val < 0.0001
    ? val.toExponential(2)
    : val.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

// ── Coin Converter ────────────────────────────────────────────────────────────
const CONVERTER_COINS = [
  { id:"ethereum",      symbol:"ETH",   name:"Ethereum",   logo:"Ξ" },
  { id:"bitcoin",       symbol:"BTC",   name:"Bitcoin",    logo:"₿" },
  { id:"tether",        symbol:"USDT",  name:"Tether",     logo:"₮" },
  { id:"usd-coin",      symbol:"USDC",  name:"USD Coin",   logo:"$" },
  { id:"binancecoin",   symbol:"BNB",   name:"BNB",        logo:"B" },
  { id:"matic-network", symbol:"MATIC", name:"Polygon",    logo:"⬡" },
  { id:"dai",           symbol:"DAI",   name:"Dai",        logo:"◈" },
  { id:"chainlink",     symbol:"LINK",  name:"Chainlink",  logo:"⬡" },
  { id:"uniswap",       symbol:"UNI",   name:"Uniswap",    logo:"🦄" },
  { id:"solana",        symbol:"SOL",   name:"Solana",     logo:"◎" },
];
const FIAT_CURRENCIES = [
  { code:"usd", symbol:"$",  name:"US Dollar" },
  { code:"eur", symbol:"€",  name:"Euro" },
  { code:"gbp", symbol:"£",  name:"British Pound" },
  { code:"inr", symbol:"₹",  name:"Indian Rupee" },
  { code:"jpy", symbol:"¥",  name:"Japanese Yen" },
  { code:"aud", symbol:"A$", name:"Australian Dollar" },
];

function CoinConverter() {
  const [prices,      setPrices]      = useState({});
  const [fromCoin,    setFromCoin]    = useState("ethereum");
  const [toCurrency,  setToCurrency]  = useState("usd");
  const [amount,      setAmount]      = useState("1");
  const [result,      setResult]      = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [convError,   setConvError]   = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchPrices = useCallback(async () => {
    setLoading(true); setConvError("");
    try {
      const ids  = CONVERTER_COINS.map((c) => c.id).join(",");
      const curr = FIAT_CURRENCIES.map((f) => f.code).join(",");
      const res  = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=${curr}`);
      if (!res.ok) throw new Error("Price fetch failed");
      const data = await res.json();
      setPrices(data);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      setConvError("Could not fetch prices. Try again.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchPrices(); }, [fetchPrices]);
  useEffect(() => {
    const t = setInterval(fetchPrices, 60000);
    return () => clearInterval(t);
  }, [fetchPrices]);

  useEffect(() => {
    if (!prices[fromCoin] || !amount || isNaN(amount)) { setResult(null); return; }
    const price = prices[fromCoin][toCurrency];
    if (!price) { setResult(null); return; }
    setResult(parseFloat(amount) * price);
  }, [prices, fromCoin, toCurrency, amount]);

  const selectedCoin = CONVERTER_COINS.find((c) => c.id === fromCoin);
  const selectedFiat = FIAT_CURRENCIES.find((f) => f.code === toCurrency);
  const fmt = (v) => {
    if (v === null) return "—";
    if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (v >= 1)    return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
    return v.toLocaleString(undefined, { maximumFractionDigits: 8 });
  };

  return (
    <div className="converter-wrapper">
      <div className="converter-header">
        <h3 className="converter-title">💱 Coin Converter</h3>
        <div className="converter-meta">
          {lastUpdated && <span className="converter-updated">Updated {lastUpdated}</span>}
          <button className="converter-refresh" onClick={fetchPrices} disabled={loading}>
            {loading ? "⟳" : "↻ Refresh"}
          </button>
        </div>
      </div>
      {convError && <div className="converter-error">{convError}</div>}
      <div className="converter-body">
        <div className="converter-row">
          <div className="converter-field">
            <label className="converter-label">Amount</label>
            <input className="converter-input" type="number" min="0" step="any"
              value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1" />
          </div>
          <div className="converter-field">
            <label className="converter-label">From</label>
            <select className="converter-select" value={fromCoin} onChange={(e) => setFromCoin(e.target.value)}>
              {CONVERTER_COINS.map((c) => (
                <option key={c.id} value={c.id}>{c.logo} {c.symbol} — {c.name}</option>
              ))}
            </select>
          </div>
          <div className="converter-arrow">→</div>
          <div className="converter-field">
            <label className="converter-label">To currency</label>
            <select className="converter-select" value={toCurrency} onChange={(e) => setToCurrency(e.target.value)}>
              {FIAT_CURRENCIES.map((f) => (
                <option key={f.code} value={f.code}>{f.symbol} {f.code.toUpperCase()} — {f.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="converter-result">
          <span className="converter-result-from">{amount || "0"} {selectedCoin?.symbol}</span>
          <span className="converter-result-eq">=</span>
          <span className="converter-result-to">
            {loading ? <span className="converter-loading">···</span> : `${selectedFiat?.symbol}${fmt(result)}`}
            {" "}<span className="converter-result-currency">{toCurrency.toUpperCase()}</span>
          </span>
        </div>
        <div className="converter-grid-label">Live prices in {toCurrency.toUpperCase()}</div>
        <div className="converter-price-grid">
          {CONVERTER_COINS.map((coin) => {
            const price = prices[coin.id]?.[toCurrency];
            return (
              <button key={coin.id}
                className={`converter-price-card ${fromCoin === coin.id ? "active" : ""}`}
                onClick={() => setFromCoin(coin.id)}>
                <span className="converter-price-logo">{coin.logo}</span>
                <span className="converter-price-sym">{coin.symbol}</span>
                <span className="converter-price-val">
                  {price ? `${selectedFiat?.symbol}${price >= 1000
                    ? price.toLocaleString(undefined, { maximumFractionDigits: 0 })
                    : price.toLocaleString(undefined, { maximumFractionDigits: 4 })}`
                    : loading ? "···" : "—"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [account,          setAccount]          = useState("");
  const [tokens,           setTokens]           = useState([]);
  const [currentNetwork,   setCurrentNetwork]   = useState(null);
  const [chainIdHex,       setChainIdHex]       = useState("");

  // ── Swap provider — always rebuilt fresh on chain change ─────
  const [swapProvider,     setSwapProvider]     = useState(null);
  const [swapSigner,       setSwapSigner]       = useState(null);
  const rebuildingRef = useRef(false);

  const rebuildProvider = useCallback(async () => {
    if (!window.ethereum || rebuildingRef.current) return null;
    rebuildingRef.current = true;
    try {
      await new Promise((r) => setTimeout(r, 300)); // let MetaMask settle
      const p = new ethers.BrowserProvider(window.ethereum);
      const s = await p.getSigner();
      setSwapProvider(p);
      setSwapSigner(s);
      return { provider: p, signer: s };
    } catch (_) {
      setSwapProvider(null);
      setSwapSigner(null);
      return null;
    } finally {
      rebuildingRef.current = false;
    }
  }, []);

  const [addedNetworks,    setAddedNetworks]    = useState([]);
  const [allNetworkTokens, setAllNetworkTokens] = useState({});
  const [loadingNetworks,  setLoadingNetworks]  = useState(new Set());
  const [permissionStep,   setPermissionStep]   = useState("idle");
  const [scrolled,         setScrolled]         = useState(false);
  const [copied,           setCopied]           = useState(false);
  const [addingNetwork,    setAddingNetwork]    = useState(null);
  const [activeTab,        setActiveTab]        = useState("overview");
  const [error,            setError]            = useState("");
  const [sessionExpiry,    setSessionExpiry]    = useState(null);
  const [showTestnets,     setShowTestnets]     = useState(true);
  const [chartToken,       setChartToken]       = useState(null);

  // ── Restore session ───────────────────────────────────────────
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
            await rebuildProvider();
            await fetchAllNetworkBalances(session.address, savedNets);
          } else { clearSession(); }
        } catch (_) { clearSession(); }
      })();
    }
  // eslint-disable-next-line
  }, []);

  // ── Auto-logout ───────────────────────────────────────────────
  useEffect(() => {
    if (!sessionExpiry) return;
    const remaining = sessionExpiry - Date.now();
    if (remaining <= 0) { disconnect(); return; }
    const timer = setTimeout(() => disconnect(), remaining);
    return () => clearTimeout(timer);
  // eslint-disable-next-line
  }, [sessionExpiry]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ── MetaMask listeners ────────────────────────────────────────
  useEffect(() => {
    if (!window.ethereum) return;

    const onChainChange = async (newChain) => {
      // ← CRITICAL: rebuild provider BEFORE updating any state
      await rebuildProvider();
      setChainIdHex(newChain);
      setCurrentNetwork(getNetworkByChainId(newChain));
      if (account) {
        saveSession(account, newChain, addedNetworks);
        fetchAllNetworkBalances(account, addedNetworks);
      }
    };

    const onAccountsChange = (accounts) => {
      if (accounts.length === 0) {
        setAccount(""); setTokens([]); setAllNetworkTokens({});
        setAddedNetworks([]); setPermissionStep("idle");
        setSwapProvider(null); setSwapSigner(null);
        clearSession(); setSessionExpiry(null);
      } else {
        setAccount(accounts[0]);
        rebuildProvider();
        if (addedNetworks.length > 0) fetchAllNetworkBalances(accounts[0], addedNetworks);
      }
    };

    window.ethereum.on("chainChanged",    onChainChange);
    window.ethereum.on("accountsChanged", onAccountsChange);
    return () => {
      window.ethereum.removeListener("chainChanged",    onChainChange);
      window.ethereum.removeListener("accountsChanged", onAccountsChange);
    };
  // eslint-disable-next-line
  }, [account, addedNetworks, rebuildProvider]);

  // ── Connect ───────────────────────────────────────────────────
  async function requestPermission() {
    if (!window.ethereum) { alert("MetaMask is not installed."); return; }
    setPermissionStep("requesting"); setError("");
    try {
      const permissions = await window.ethereum.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }],
      });
      const granted = permissions?.some((p) => p.parentCapability === "eth_accounts");
      if (granted) { setPermissionStep("granted"); await connectAfterPermission(); }
      else { setPermissionStep("denied"); setError("Permission was not granted."); }
    } catch (err) {
      if (err.code === 4001) { setPermissionStep("denied"); setError("You rejected the connection."); }
      else { setPermissionStep("idle"); setError("Something went wrong: " + (err.message ?? err)); }
    }
  }

  async function connectAfterPermission() {
    setPermissionStep("loading");
    try {
      const accounts = await window.ethereum.request({ method: "eth_accounts" });
      if (!accounts || accounts.length === 0) {
        setError("No accounts returned."); setPermissionStep("idle"); return;
      }
      const address = accounts[0];
      setAccount(address);

      const ps = await rebuildProvider();
      const provider = ps?.provider ?? new ethers.BrowserProvider(window.ethereum);

      const { chainId } = await provider.getNetwork();
      const hexChain    = "0x" + chainId.toString(16);
      setChainIdHex(hexChain);
      setCurrentNetwork(getNetworkByChainId(hexChain));

      const currentAdded = addedNetworks.includes(hexChain)
        ? addedNetworks : [hexChain, ...addedNetworks];
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

  // ── Fetch balances ────────────────────────────────────────────
  const fetchAllNetworkBalances = useCallback(async (walletAddress, networksToFetch) => {
    if (!networksToFetch || networksToFetch.length === 0) return;
    setLoadingNetworks(new Set(networksToFetch));
    const tokensByNetwork = {};

    await Promise.all(networksToFetch.map(async (chainHex) => {
      try {
        tokensByNetwork[chainHex] = await fetchBalancesForNetwork(walletAddress, chainHex);
      } catch (err) {
        console.error(`Failed for ${chainHex}:`, err);
        tokensByNetwork[chainHex] = [];
      }
    }));

    setAllNetworkTokens((prev) => ({ ...prev, ...tokensByNetwork }));
    setTokens((prev) => {
      const currentHex = window.ethereum?.chainId;
      return currentHex && tokensByNetwork[currentHex]
        ? tokensByNetwork[currentHex]
        : prev;
    });
    setLoadingNetworks(new Set());
  }, []);


  // ── Try each RPC URL with a 8-second timeout ─────────────────
  // Returns the first provider that successfully responds
  async function createProviderWithFallback(rpcUrls) {
    const timeout = (ms) => new Promise((_, reject) =>
      setTimeout(() => reject(new Error("RPC timeout")), ms)
    );
    for (const url of rpcUrls) {
      try {
        const p = new ethers.JsonRpcProvider(url);
        // Quick liveness check with timeout
        await Promise.race([
          p.getBlockNumber(),
          timeout(8000),
        ]);
        return p;
      } catch (_) {
        // Try next RPC
      }
    }
    throw new Error("All RPC endpoints failed");
  }

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
      const provider  = await createProviderWithFallback(netConfig.rpcUrls);
      const rawNative = await provider.getBalance(walletAddress);
      const nativeSym = netConfig.nativeCurrency.symbol;

      // ── Always show native balance row even if no tokens ──
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

      const tokenAddresses = (netConfig.tokens ?? []).map((t) => t.address);
      if (tokenAddresses.length === 0) return [nativeRow];

      const deployInfo  = deployedAddresses[netConfig.chainIdDec];
      const contractAddr = deployInfo?.contractAddress ?? "";
      let tokenResults  = [];

      if (contractAddr) {
        try {
          const contract = new ethers.Contract(contractAddr, WALLET_BALANCE_ABI, provider);
          const raw = await contract.getMultipleTokenBalances(walletAddress, tokenAddresses);
          tokenResults = raw.map((t) => {
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
          }).filter(Boolean);
        } catch {
          tokenResults = await fallbackRpcFetch(walletAddress, netConfig, provider, chainHex);
        }
      } else {
        // ← KEY FIX: no contract deployed → always use RPC fallback
        tokenResults = await fallbackRpcFetch(walletAddress, netConfig, provider, chainHex);
      }

      return [nativeRow, ...tokenResults];
    } catch (err) {
      console.error(`Error fetching ${netConfig.chainName}:`, err);
      // RPC failed — show native row with a clear unavailable state
      return [{
        contractAddress: "native",
        name:        netConfig.nativeCurrency.name,
        symbol:      netConfig.nativeCurrency.symbol,
        decimals:    18,
        balance:     "RPC unavailable",
        logo:        getLogo(netConfig.nativeCurrency.symbol),
        isNative:    true,
        networkName: netConfig.chainName,
        chainId:     chainHex,
        rpcError:    true,
      }];
    }
  }

  async function fallbackRpcFetch(walletAddress, netConfig, provider, chainHex) {
    const ERC20_ABI = [
      "function balanceOf(address) view returns (uint256)",
      "function decimals() view returns (uint8)",
      "function name() view returns (string)",
      "function symbol() view returns (string)",
    ];
    const results = [];
    // Fetch all tokens in parallel for speed
    await Promise.all((netConfig.tokens ?? []).map(async (tokenDef) => {
      try {
        const c   = new ethers.Contract(tokenDef.address, ERC20_ABI, provider);
        const [bal, dec] = await Promise.all([
          c.balanceOf(walletAddress),
          c.decimals().catch(() => 18n),
        ]);
        const formatted = formatBal(bal, Number(dec));
        if (!formatted) return;
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
    }));
    return results;
  }

  // ── Actions ───────────────────────────────────────────────────
  function disconnect() {
    setAccount(""); setTokens([]); setAllNetworkTokens({});
    setCurrentNetwork(null); setChainIdHex(""); setAddedNetworks([]);
    setPermissionStep("idle"); setError(""); setChartToken(null);
    setSwapProvider(null); setSwapSigner(null);
    clearSession(); setSessionExpiry(null);
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
        // ← Fetch balances for the newly added network immediately
        setLoadingNetworks(new Set([net.chainId]));
        const result = await fetchBalancesForNetwork(account, net.chainId).catch(() => []);
        setAllNetworkTokens((prev) => ({ ...prev, [net.chainId]: result }));
        setLoadingNetworks(new Set());
      }
    } catch (err) { console.error(err); }
    setAddingNetwork(null);
  }

  async function handleRemoveNetwork(chainId) {
    const newAdded = addedNetworks.filter((id) => id !== chainId);
    setAddedNetworks(newAdded);
    setAllNetworkTokens((prev) => { const n = { ...prev }; delete n[chainId]; return n; });
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

  // ── Derived ───────────────────────────────────────────────────
  const allTokens      = Object.values(allNetworkTokens).flat();
  const filteredTokens = showTestnets
    ? allTokens
    : allTokens.filter((t) => !getNetworkByChainId(t.chainId)?.isTestnet);

  const isConnected = permissionStep === "done" && !!account;
  const isLoading   = permissionStep === "loading" || permissionStep === "granted";
  const evmNetworks    = networks.filter((n) => !n.nonEvm);
  const nonEvmNetworks = networks.filter((n) => n.nonEvm);

  const currentNativeBalance =
    currentNetwork && allNetworkTokens[chainIdHex]
      ? allNetworkTokens[chainIdHex].find((t) => t.isNative)?.balance || "—"
      : "—";

  // ══════════════════════════════════════════════════════════════
  return (
    <div className="app-root">
      <div className="bg-grid" aria-hidden="true" />
      <div className="bg-glow bg-glow--blue"   aria-hidden="true" />
      <div className="bg-glow bg-glow--purple" aria-hidden="true" />

      {chartToken && (
        <CandlestickChart symbol={chartToken.symbol} tokenName={chartToken.name}
          onClose={() => setChartToken(null)} />
      )}

      {(permissionStep === "requesting" || permissionStep === "denied") && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal__icon">{permissionStep === "requesting" ? "🦊" : "🚫"}</div>
            {permissionStep === "requesting" && (
              <>
                <h2 className="modal__title">Waiting for MetaMask…</h2>
                <p className="modal__desc">
                  MetaMask is asking which account you'd like to connect.<br />
                  <strong>Select your account</strong> and click <em>"Connect"</em>.
                </p>
                <div className="modal__steps">
                  <div className="modal__step modal__step--active"><span className="step-num">1</span>MetaMask popup opens</div>
                  <div className="modal__step"><span className="step-num">2</span>Select your account</div>
                  <div className="modal__step"><span className="step-num">3</span>Click "Connect"</div>
                  <div className="modal__step"><span className="step-num">4</span>Balances load automatically</div>
                </div>
                <div className="modal__spinner"><div className="big-spinner" /><span>Waiting…</span></div>
              </>
            )}
            {permissionStep === "denied" && (
              <>
                <h2 className="modal__title">Access Denied</h2>
                <p className="modal__desc">You rejected the MetaMask connection request.</p>
                {error && <div className="modal__error">{error}</div>}
                <div className="modal__actions">
                  <button className="btn btn--primary btn--md" onClick={requestPermission}>🦊 Try Again</button>
                  <button className="btn btn--ghost btn--md" onClick={() => setPermissionStep("idle")}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Navbar */}
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
            <a href="#dashboard" className="nav-link" onClick={() => setActiveTab("swap")}>Swap</a>
            <a href="#dashboard" className="nav-link" onClick={() => setActiveTab("convert")}>Convert</a>
          </nav>
          <div className="navbar__cta">
            {isConnected ? (
              <div className="nav-address">
                <span className="status-dot" />
                {short(account)}
                {currentNetwork && <span className="nav-network-pill">{currentNetwork.nativeCurrency.symbol}</span>}
                {sessionTimeLeft() && <span className="nav-session-pill" title="Session auto-expires">⏱ {sessionTimeLeft()}</span>}
                <button className="nav-disconnect" onClick={disconnect} title="Disconnect">✕</button>
              </div>
            ) : (
              <button className="btn btn--outline btn--sm" onClick={requestPermission} disabled={isLoading}>
                {isLoading ? <><span className="spinner" /> Connecting…</> : "Connect"}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="hero" id="hero">
        <div className="hero__content">
          <div className="hero__badge"><span className="badge-dot" />Smart Contract · Multi-Network Balance Reader</div>
          <h1 className="hero__title">
            Your Gateway to<br /><span className="gradient-text">Multi-Chain</span><br />Finance
          </h1>
          <p className="hero__sub">
            Connect once, track everywhere. Add multiple networks and view all your
            token balances across chains. Session active for <strong>24 hours</strong>.
          </p>
          <div className="hero__actions">
            {!isConnected ? (
              <button className="btn btn--primary btn--lg" onClick={requestPermission} disabled={isLoading}>
                {isLoading ? <><span className="spinner" /> Waiting…</> : <>🦊 Connect MetaMask</>}
              </button>
            ) : (
              <button className="btn btn--primary btn--lg"
                onClick={() => fetchAllNetworkBalances(account, addedNetworks)}>
                🔄 Refresh All Networks
              </button>
            )}
            <a href="#dashboard" className="btn btn--ghost btn--lg">View Dashboard ↓</a>
          </div>
          {permissionStep !== "idle" && permissionStep !== "requesting" && (
            <div className={`permission-status permission-status--${permissionStep}`}>
              {permissionStep === "granted" && "✓ Permission granted — loading balances…"}
              {permissionStep === "loading" && "⏳ Reading balances from blockchains…"}
              {permissionStep === "done"    && `✓ Connected: ${short(account)} · ${sessionTimeLeft() ?? "expiring"}`}
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
              <span className="card-3d__label">{currentNetwork?.nativeCurrency?.symbol ?? "ETH"} Balance</span>
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

      {/* Dashboard */}
      <section className="dashboard" id="dashboard">
        <div className="section-label">
          Live Dashboard · {addedNetworks.length} Network{addedNetworks.length !== 1 ? "s" : ""} Connected
        </div>
        <h2 className="section-title">Multi-Chain Wallet Overview</h2>
        <p className="section-sub">
          Balances read on-chain from <code>WalletBalance.sol</code> across all added networks.
        </p>
        {error && <div className="error-banner">⚠ {error}</div>}

        {/* Tabs */}
        <div className="tab-bar">
          {[
            { id:"overview",  label:"◎ Overview" },
            { id:"tokens",    label:"🪙 Tokens",   badge: allTokens.length || null },
            { id:"networks",  label:"⬡ Networks",  badge: addedNetworks.length || null },
            { id:"swap",      label:"🔄 Swap" },
            { id:"convert",   label:"💱 Convert" },
            { id:"news",      label:"📰 News" },
          ].map(({ id, label, badge }) => (
            <button key={id}
              className={`tab-btn${activeTab === id ? " tab-btn--active" : ""}`}
              onClick={() => setActiveTab(id)}>
              {label}
              {badge ? <span className="tab-badge">{badge}</span> : null}
            </button>
          ))}
        </div>

        {/* Overview */}
        {activeTab === "overview" && (
          <>
            <div className="dashboard__grid">
              <div className={`dash-card${account ? " dash-card--active" : ""}`}>
                <div className="dash-card__icon">◈</div>
                <div className="dash-card__label">Wallet Address</div>
                <div className="dash-card__value dash-card__value--mono">{account || "Not connected"}</div>
                {account && <button className="copy-btn" onClick={copyAddress}>{copied ? "✓ Copied" : "⎘ Copy"}</button>}
              </div>
              <div className={`dash-card${currentNativeBalance !== "—" ? " dash-card--active" : ""}`}>
                <div className="dash-card__icon">◎</div>
                <div className="dash-card__label">{currentNetwork?.nativeCurrency?.symbol ?? "Native"} Balance</div>
                <div className="dash-card__value dash-card__value--large">
                  {currentNativeBalance !== "—"
                    ? <><span className="eth-num">{currentNativeBalance}</span> <span className="eth-unit">{currentNetwork?.nativeCurrency?.symbol}</span></>
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
                {allTokens.length > 0 && <button className="copy-btn" onClick={() => setActiveTab("tokens")}>View All →</button>}
              </div>
              <div className={`dash-card${addedNetworks.length > 0 ? " dash-card--active" : ""}`}>
                <div className="dash-card__icon">🌐</div>
                <div className="dash-card__label">Networks Added</div>
                <div className="dash-card__value dash-card__value--large">
                  <span className="eth-num">{addedNetworks.length || "—"}</span>
                  {addedNetworks.length > 0 && <span className="eth-unit"> chains</span>}
                </div>
                {addedNetworks.length > 0 && <button className="copy-btn" onClick={() => setActiveTab("networks")}>Manage →</button>}
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
                <p>Connect your wallet — session stays active for 24 hours.</p>
                <button className="btn btn--primary btn--md" onClick={requestPermission}>🦊 Grant Wallet Access</button>
              </div>
            )}
          </>
        )}

        {/* Tokens */}
        {activeTab === "tokens" && (
          <div className="tokens-section">
            <div className="tokens-header" style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"1rem" }}>
              <h3 style={{ margin:0, color:"#fff" }}>
                All Tokens
                {loadingNetworks.size > 0 && (
                  <span style={{ fontSize:"12px", color:"rgba(255,255,255,0.4)", marginLeft:"10px", fontWeight:"normal" }}>
                    Loading {loadingNetworks.size} network{loadingNetworks.size > 1 ? "s" : ""}…
                  </span>
                )}
              </h3>
              <button className="filter-btn"
                style={{ background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)", color:"#fff", padding:"6px 12px", borderRadius:"6px", cursor:"pointer", fontSize:"12px" }}
                onClick={() => setShowTestnets(!showTestnets)}>
                {showTestnets ? "Hide Testnets" : "Show Testnets"}
              </button>
            </div>

            {(isLoading || loadingNetworks.size > 0) && filteredTokens.length === 0 && (
              <div className="tokens-loading">
                <div className="tokens-loading__spinner" />
                <p>Reading balances across {addedNetworks.length} network{addedNetworks.length !== 1 ? "s" : ""}…</p>
              </div>
            )}

            {/* ← Show tokens even while some networks are still loading */}
            {filteredTokens.length > 0 && filteredTokens.map((token, i) => {
              const network   = getNetworkByChainId(token.chainId);
              const isTestnet = network?.isTestnet || false;
              return (
                <div className={`token-row${token.isNative ? " token-row--native" : ""}${isTestnet ? " token-row--testnet" : ""}`}
                  key={`${token.chainId}-${token.contractAddress}-${i}`}>
                  <div className="token-row__logo">
                    {token.logo && <img src={token.logo} alt={token.symbol}
                      onError={(e) => { e.target.style.display="none"; e.target.nextSibling.style.display="flex"; }} />}
                    <div className="token-row__fallback" style={{ display: token.logo ? "none" : "flex" }}>
                      {token.symbol?.slice(0,2).toUpperCase()}
                    </div>
                  </div>
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
                        <a href={`${network.blockExplorerUrls[0]}/token/${token.contractAddress}`}
                          target="_blank" rel="noreferrer" className="token-row__explorer">↗</a>
                      )}
                    </span>
                  </div>
                  <div className="token-row__balance">
                    <span className="token-row__amount">{token.balance}</span>
                    <span className="token-row__symbol-right">{token.symbol}</span>
                  </div>
                  <button className="token-chart-btn"
                    onClick={() => setChartToken({ symbol: token.symbol, name: token.name })}>
                    📊 Chart
                  </button>
                </div>
              );
            })}

            {!isLoading && loadingNetworks.size === 0 && filteredTokens.length === 0 && isConnected && (
              <div className="dashboard__empty">
                <div className="empty-icon">🔍</div>
                <p>No token balances found across your added networks.<br />
                  <span style={{ fontSize:"13px", opacity:0.6 }}>Add more networks or fund your wallet.</span>
                </p>
              </div>
            )}
            {!isConnected && (
              <div className="dashboard__empty">
                <div className="empty-icon">🔐</div>
                <p>Connect wallet to see token balances.</p>
                <button className="btn btn--primary btn--md" onClick={requestPermission}>🦊 Grant Wallet Access</button>
              </div>
            )}
          </div>
        )}

        {/* Networks */}
        {activeTab === "networks" && (
          <div className="networks-section">
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
                      <div className={`network-card network-card--added${isActive ? " network-card--active" : ""}`} key={i}>
                        <div className="network-card__avatar">{net.chainName?.charAt(0)?.toUpperCase()}</div>
                        <div className="network-card__info">
                          <div className="network-card__name">
                            {net.chainName}
                            {isActive && <span className="active-pill">Active</span>}
                          </div>
                          <div className="network-card__meta">
                            <span className="network-card__chain-id">ID: {net.chainIdDec}</span>
                            <span className="network-card__symbol">· {net.nativeCurrency.symbol}</span>
                            {tokenCount > 0 && <span className="network-card__deployed">· {tokenCount} tokens</span>}
                            {isLoad && <span className="network-card__loading">· Loading…</span>}
                          </div>
                        </div>
                        <button className="remove-btn" onClick={() => handleRemoveNetwork(chainId)}
                          disabled={isActive} title={isActive ? "Cannot remove active network" : "Remove"}>✕</button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
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
                    <div className="network-card__avatar">{net.chainName?.charAt(0)?.toUpperCase()}</div>
                    <div className="network-card__info">
                      <div className="network-card__name">{net.chainName}{isActive && <span className="active-pill">Connected</span>}</div>
                      <div className="network-card__meta">
                        <span className="network-card__chain-id">ID: {net.chainIdDec}</span>
                        <span className="network-card__symbol">· {net.nativeCurrency.symbol}</span>
                        {deployed && <span className="network-card__deployed">· ✓ Contract</span>}
                      </div>
                    </div>
                    <button className="add-btn" onClick={() => handleAddNetwork(net)}
                      disabled={isAdding || !isConnected}>
                      {isAdding ? <span className="spinner spinner--sm" /> : "+ Add"}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="networks-group-label networks-group-label--alt">🌐 Non-EVM Networks</div>
            <div className="networks-grid">
              {nonEvmNetworks.map((net, i) => {
                const logo = getLogo(net.nativeCurrency.symbol);
                return (
                  <div className="network-card network-card--nonevm" key={i}>
                    <div className="network-card__avatar network-card__avatar--nonevm">
                      {logo
                        ? <img src={logo} alt={net.nativeCurrency.symbol} style={{ width:"28px", height:"28px", borderRadius:"50%" }} />
                        : net.chainName?.charAt(0)?.toUpperCase()}
                    </div>
                    <div className="network-card__info">
                      <div className="network-card__name">{net.chainName}<span className="snap-pill">Snap</span></div>
                      <div className="network-card__meta">
                        <span className="network-card__symbol">{net.nativeCurrency.symbol}</span>
                        <span className="network-card__chain-id">· Non-EVM</span>
                      </div>
                    </div>
                    <button className="add-btn add-btn--snap" onClick={() => handleAddNetwork(net)}>↗ View</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Swap */}
        {activeTab === "swap" && (
          <div className="swap-tab-wrapper">
            {isConnected ? (
              <SwapWidget provider={swapProvider} signer={swapSigner} userAddress={account} />
            ) : (
              <div className="dashboard__empty">
                <div className="empty-icon">🔄</div>
                <p>Connect your wallet to swap tokens via <strong>Uniswap V2</strong>.</p>
                <button className="btn btn--primary btn--md" onClick={requestPermission}>🦊 Connect to Swap</button>
              </div>
            )}
          </div>
        )}

        {/* Convert */}
        {activeTab === "convert" && <CoinConverter />}

        {/* News */}
        {activeTab === "news" && <CryptoNews />}
      </section>

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