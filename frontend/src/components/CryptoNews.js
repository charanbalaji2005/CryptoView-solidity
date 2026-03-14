import { useState, useEffect, useCallback } from "react";
import "./CryptoNews.css";

const CATEGORIES = ["All", "Bitcoin", "Ethereum", "DeFi", "NFT", "Altcoins", "Regulation"];

// ─── Helper utils ─────────────────────────────────────────────────────────────
function guessCategory(text = "") {
  const t = text.toLowerCase();
  if (/nft|non.fungible/.test(t))                                return "NFT";
  if (/defi|uniswap|aave|compound|yield|liquidity|dex/.test(t)) return "DeFi";
  if (/\bbitcoin\b|\bbtc\b/.test(t))                             return "Bitcoin";
  if (/\bethereum\b|\beth\b/.test(t))                            return "Ethereum";
  if (/regulat|sec |cftc|congress|law|ban|legal|court/.test(t))  return "Regulation";
  if (/solana|bnb|xrp|cardano|avax|altcoin|polkadot/.test(t))   return "Altcoins";
  return "General";
}
function guessSentiment(text = "") {
  const t = text.toLowerCase();
  const bull = (t.match(/bull|surge|soar|rally|gain|rise|pump|record|high|boost|jump/g)||[]).length;
  const bear = (t.match(/bear|crash|drop|fall|dump|loss|decline|plunge|slump|hack|exploit/g)||[]).length;
  return bull > bear ? "bullish" : bear > bull ? "bearish" : "neutral";
}
function timeAgo(dateStr) {
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff/60000);
    if (m < 1)  return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m/60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h/24)}d ago`;
  } catch { return "recently"; }
}
function strip(html=""){
  return html.replace(/<[^>]*>/g," ").replace(/&[a-z]+;/gi," ").replace(/\s+/g," ").trim().slice(0,200);
}

// ─── SOURCE 1 : CoinGecko /news (free, no key) ────────────────────────────────
async function fromCoinGecko() {
  const r = await fetch(
    "https://api.coingecko.com/api/v3/news?per_page=20",
    { headers:{ accept:"application/json" } }
  );
  if (!r.ok) throw new Error("CoinGecko "+r.status);
  const d = await r.json();
  const list = d?.data ?? d ?? [];
  if (!list.length) throw new Error("CoinGecko empty");
  return list.map(item => {
    const combo = `${item.title} ${item.description||""}`;
    return {
      title:       item.title        || "Untitled",
      summary:     strip(item.description || item.text || "Click to read more."),
      source:      item.author       || item.news_site || "CoinGecko",
      url:         item.url          || item.link || "#",
      thumbnail:   item.thumb_2x     || item.image_url || null,
      category:    guessCategory(combo),
      publishedAt: timeAgo(item.updated_at ? item.updated_at*1000 : item.created_at),
      sentiment:   guessSentiment(combo),
    };
  });
}

// ─── SOURCE 2 : CryptoPanic public posts (free, no key needed for public) ─────
async function fromCryptoPanic() {
  const r = await fetch(
    "https://cryptopanic.com/api/v1/posts/?auth_token=free&public=true&kind=news",
    { headers:{ accept:"application/json" } }
  );
  if (!r.ok) throw new Error("CryptoPanic "+r.status);
  const d = await r.json();
  const list = d?.results ?? [];
  if (!list.length) throw new Error("CryptoPanic empty");
  return list.map(item => {
    const combo = `${item.title} ${item.domain||""}`;
    return {
      title:       item.title        || "Untitled",
      summary:     `Published on ${item.domain||"CryptoPanic"}. Click to read the full story.`,
      source:      item.domain       || "CryptoPanic",
      url:         item.url          || "#",
      thumbnail:   null,
      category:    guessCategory(combo),
      publishedAt: timeAgo(item.published_at),
      sentiment:   item.votes
        ? (item.votes.positive > item.votes.negative ? "bullish"
          : item.votes.negative > item.votes.positive ? "bearish" : "neutral")
        : guessSentiment(combo),
    };
  });
}

// ─── SOURCE 3 : Messari RSS via allorigins proxy (avoids CORS) ────────────────
async function fromMessariRSS() {
  const feed = "https://messari.io/rss/news.xml";
  const r = await fetch(
    `https://api.allorigins.win/get?url=${encodeURIComponent(feed)}`
  );
  if (!r.ok) throw new Error("Messari proxy "+r.status);
  const { contents } = await r.json();
  const parser = new DOMParser();
  const xml    = parser.parseFromString(contents, "text/xml");
  const items  = [...xml.querySelectorAll("item")];
  if (!items.length) throw new Error("Messari empty");
  return items.slice(0,15).map(el => {
    const title   = el.querySelector("title")?.textContent   || "Untitled";
    const desc    = el.querySelector("description")?.textContent || "";
    const link    = el.querySelector("link")?.textContent    || "#";
    const pubDate = el.querySelector("pubDate")?.textContent || "";
    const combo   = `${title} ${desc}`;
    return {
      title,
      summary:     strip(desc) || "Click to read more.",
      source:      "Messari",
      url:         link,
      thumbnail:   null,
      category:    guessCategory(combo),
      publishedAt: timeAgo(pubDate),
      sentiment:   guessSentiment(combo),
    };
  });
}

// ─── SOURCE 4 : CoinDesk RSS via allorigins proxy ─────────────────────────────
async function fromCoinDeskRSS() {
  const feed = "https://www.coindesk.com/arc/outboundfeeds/rss/";
  const r = await fetch(
    `https://api.allorigins.win/get?url=${encodeURIComponent(feed)}`
  );
  if (!r.ok) throw new Error("CoinDesk proxy "+r.status);
  const { contents } = await r.json();
  const xml   = new DOMParser().parseFromString(contents, "text/xml");
  const items = [...xml.querySelectorAll("item")];
  if (!items.length) throw new Error("CoinDesk empty");
  return items.slice(0,15).map(el => {
    const title   = el.querySelector("title")?.textContent       || "Untitled";
    const desc    = el.querySelector("description")?.textContent || "";
    const link    = el.querySelector("link")?.textContent        || "#";
    const pubDate = el.querySelector("pubDate")?.textContent     || "";
    const encImg  = el.querySelector("enclosure")?.getAttribute("url") || null;
    const combo   = `${title} ${desc}`;
    return {
      title,
      summary:     strip(desc) || "Click to read more.",
      source:      "CoinDesk",
      url:         link,
      thumbnail:   encImg,
      category:    guessCategory(combo),
      publishedAt: timeAgo(pubDate),
      sentiment:   guessSentiment(combo),
    };
  });
}

// ─── FALLBACK : Fresh static articles (always works offline too) ──────────────
function getMockArticles() {
  const now = Date.now();
  return [
    { title:"Bitcoin Holds Above $60K as Institutional Demand Grows", summary:"Bitcoin continues to trade above the $60,000 mark with strong buying pressure from institutional investors. ETF inflows have surged to multi-week highs, signaling renewed confidence.", source:"CoinDesk", url:"https://coindesk.com", thumbnail:null, category:"Bitcoin", publishedAt:"2h ago", sentiment:"bullish" },
    { title:"Ethereum Devs Confirm Next Upgrade Timeline", summary:"The Ethereum core developer team has announced the timeline for the next major network upgrade. The update will bring further improvements to transaction throughput and gas efficiency.", source:"Cointelegraph", url:"https://cointelegraph.com", thumbnail:null, category:"Ethereum", publishedAt:"4h ago", sentiment:"bullish" },
    { title:"SEC Reviews New Crypto Broker Regulations", summary:"The U.S. Securities and Exchange Commission is reviewing proposed rules that would affect how crypto brokers handle customer assets, potentially reshaping the industry landscape.", source:"The Block", url:"https://theblock.co", thumbnail:null, category:"Regulation", publishedAt:"5h ago", sentiment:"bearish" },
    { title:"DeFi Protocol Surpasses $5B in Total Value Locked", summary:"A leading decentralized finance protocol has crossed $5 billion in total value locked, marking a significant milestone and attracting attention from investors across the space.", source:"Decrypt", url:"https://decrypt.co", thumbnail:null, category:"DeFi", publishedAt:"6h ago", sentiment:"bullish" },
    { title:"Solana NFT Market Sees Record Weekly Volume", summary:"The Solana blockchain's NFT marketplace recorded its highest weekly trading volume in over six months, driven by a new collection launch and renewed interest from collectors.", source:"CoinDesk", url:"https://coindesk.com", thumbnail:null, category:"NFT", publishedAt:"8h ago", sentiment:"bullish" },
    { title:"Altcoin Season Signals Emerge as BTC Dominance Drops", summary:"Bitcoin's market dominance has slipped below 52%, a level that historically signals the beginning of an altcoin season. Traders are rotating profits into mid-cap tokens.", source:"Cointelegraph", url:"https://cointelegraph.com", thumbnail:null, category:"Altcoins", publishedAt:"10h ago", sentiment:"bullish" },
    { title:"Crypto Exchange Volumes Hit 3-Month High", summary:"Spot trading volumes across major cryptocurrency exchanges reached a three-month high this week, with analysts attributing the surge to improving macro conditions and rising retail interest.", source:"Messari", url:"https://messari.io", thumbnail:null, category:"General", publishedAt:"12h ago", sentiment:"bullish" },
    { title:"Bitcoin Mining Difficulty Reaches All-Time High", summary:"The Bitcoin network difficulty has adjusted upward to a new record, reflecting the growing hash rate and increasing competition among miners worldwide.", source:"The Block", url:"https://theblock.co", thumbnail:null, category:"Bitcoin", publishedAt:"14h ago", sentiment:"neutral" },
    { title:"Ethereum Layer-2 Adoption Accelerates in Q1", summary:"Layer-2 networks built on Ethereum saw a sharp rise in user activity during the first quarter, with transaction counts and unique wallets reaching all-time highs on several platforms.", source:"Decrypt", url:"https://decrypt.co", thumbnail:null, category:"Ethereum", publishedAt:"1d ago", sentiment:"bullish" },
    { title:"G20 Nations Draft Joint Crypto Oversight Framework", summary:"Representatives from G20 nations have released a draft framework for coordinated cryptocurrency regulation, aiming to prevent regulatory arbitrage while fostering innovation.", source:"Reuters Crypto", url:"https://reuters.com", thumbnail:null, category:"Regulation", publishedAt:"1d ago", sentiment:"neutral" },
    { title:"Uniswap Governance Votes on Fee Switch Proposal", summary:"The Uniswap DAO is voting on a long-debated fee switch proposal that would direct a portion of protocol revenues to UNI token holders, potentially transforming the token's value proposition.", source:"DeFi Pulse", url:"https://defipulse.com", thumbnail:null, category:"DeFi", publishedAt:"1d ago", sentiment:"bullish" },
    { title:"XRP Gains Ground After Legal Clarity Update", summary:"XRP has seen notable price gains following an update in its ongoing legal situation, with traders expressing optimism about the long-term regulatory outlook for the token.", source:"Cointelegraph", url:"https://cointelegraph.com", thumbnail:null, category:"Altcoins", publishedAt:"2d ago", sentiment:"bullish" },
  ].map((a,i) => ({ ...a, id: i }));
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function CryptoNews() {
  const [articles,    setArticles]    = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [source,      setSource]      = useState("");   // which source succeeded
  const [category,    setCategory]    = useState("All");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const loadNews = useCallback(async () => {
    setLoading(true);
    setSource("");

    // Try each source in order, use first one that works
    const sources = [
      { name: "CoinGecko",   fn: fromCoinGecko   },
      { name: "CryptoPanic", fn: fromCryptoPanic },
      { name: "Messari RSS", fn: fromMessariRSS  },
      { name: "CoinDesk RSS",fn: fromCoinDeskRSS },
    ];

    for (const s of sources) {
      try {
        const data = await s.fn();
        if (data?.length) {
          setArticles(data);
          setSource(s.name);
          setLoading(false);
          return;
        }
      } catch (e) {
        console.warn(`[CryptoNews] ${s.name} failed:`, e.message);
      }
    }

    // All live sources failed — use mock data so tab is never broken
    console.warn("[CryptoNews] All live sources failed, using fallback data.");
    setArticles(getMockArticles());
    setSource("Cached");
    setLoading(false);
  }, []);

  useEffect(() => { loadNews(); }, [loadNews]);

  const visible = articles.filter(a => {
    const catOk    = category === "All" || a.category === category;
    const searchOk = !searchQuery
      || a.title.toLowerCase().includes(searchQuery.toLowerCase())
      || a.summary.toLowerCase().includes(searchQuery.toLowerCase());
    return catOk && searchOk;
  });

  const sentimentColor = s => s==="bullish"?"#22c55e":s==="bearish"?"#ef4444":"#94a3b8";
  const sentimentIcon  = s => s==="bullish"?"▲":s==="bearish"?"▼":"●";

  return (
    <div className="crypto-news">

      {/* Header */}
      <div className="cn-header">
        <div className="cn-title">
          <span className="cn-title__icon">📰</span>
          <h2>Crypto News</h2>
          {loading && <span className="cn-badge cn-badge--loading">Loading…</span>}
          {!loading && articles.length > 0 && (
            <span className={`cn-badge ${source==="Cached"?"cn-badge--cached":"cn-badge--live"}`}>
              {source==="Cached" ? "📦 Cached" : `● ${source}`}
            </span>
          )}
        </div>
        <button className="cn-refresh-btn" onClick={loadNews} disabled={loading} title="Refresh">
          <span className={loading?"cn-spin":""}>↻</span>
        </button>
      </div>

      {/* Search */}
      <form className="cn-search" onSubmit={e=>{e.preventDefault();setSearchQuery(searchInput.trim());}}>
        <span className="cn-search__icon">🔍</span>
        <input
          className="cn-search__input"
          placeholder="Search news…"
          value={searchInput}
          onChange={e=>setSearchInput(e.target.value)}
        />
        {searchInput && (
          <button type="button" className="cn-search__clear"
            onClick={()=>{setSearchInput("");setSearchQuery("");}}>✕</button>
        )}
      </form>

      {/* Category pills */}
      <div className="cn-cats">
        {CATEGORIES.map(cat=>(
          <button
            key={cat}
            className={`cn-cat${category===cat?" cn-cat--active":""}`}
            onClick={()=>setCategory(cat)}
            disabled={loading}
          >{cat}</button>
        ))}
      </div>

      {/* Stats bar */}
      {!loading && articles.length > 0 && (
        <div className="cn-sources-bar">
          <span>
            {source==="Cached"
              ? "📦 Showing cached articles — live feeds unavailable"
              : `📡 Live from ${source}`}
          </span>
          <span className="cn-count">{visible.length} articles</span>
        </div>
      )}

      {/* Skeleton */}
      {loading && (
        <div className="cn-grid">
          {[...Array(8)].map((_,i)=>(
            <div className="cn-card cn-card--skeleton" key={i}>
              <div className="cn-skeleton cn-skeleton--img"   />
              <div className="cn-skeleton cn-skeleton--tag"   />
              <div className="cn-skeleton cn-skeleton--title" />
              <div className="cn-skeleton cn-skeleton--title cn-skeleton--short"/>
              <div className="cn-skeleton cn-skeleton--line"  />
              <div className="cn-skeleton cn-skeleton--line cn-skeleton--short"/>
              <div className="cn-skeleton cn-skeleton--meta"  />
            </div>
          ))}
        </div>
      )}

      {/* Articles */}
      {!loading && visible.length > 0 && (
        <div className="cn-grid">
          {visible.map((a,i)=>(
            <a key={i} className="cn-card" href={a.url} target="_blank" rel="noreferrer">
              {a.thumbnail && (
                <div className="cn-card__img-wrap">
                  <img src={a.thumbnail} alt="" className="cn-card__img"
                    onError={e=>{e.target.parentElement.style.display="none";}}/>
                </div>
              )}
              <div className="cn-card__top">
                <span className="cn-card__cat">{a.category}</span>
                <span className="cn-card__sentiment" style={{color:sentimentColor(a.sentiment)}}>
                  {sentimentIcon(a.sentiment)} {a.sentiment}
                </span>
              </div>
              <h3 className="cn-card__title">{a.title}</h3>
              <p  className="cn-card__summary">{a.summary}</p>
              <div className="cn-card__footer">
                <span className="cn-card__source">{a.source}</span>
                <span className="cn-card__time">{a.publishedAt}</span>
                <span className="cn-card__arrow">↗</span>
              </div>
            </a>
          ))}
        </div>
      )}

      {/* No match */}
      {!loading && visible.length===0 && articles.length>0 && (
        <div className="cn-empty">
          <div className="cn-empty__icon">🔍</div>
          <p>No articles match your filter.</p>
          <button className="cn-retry-btn" style={{marginTop:"12px"}}
            onClick={()=>{setCategory("All");setSearchInput("");setSearchQuery("");}}>
            Clear Filters
          </button>
        </div>
      )}
    </div>
  );
}