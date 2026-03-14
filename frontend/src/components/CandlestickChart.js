import React, { useEffect, useRef, useState, useCallback } from "react";
import { createChart, CandlestickSeries } from "lightweight-charts";

// ── Symbol map: token symbol → Binance trading pair ──────────────────────────
const SYMBOL_MAP = {
  ETH:   "ETHUSDT",
  BTC:   "BTCUSDT",
  BNB:   "BNBUSDT",
  MATIC: "MATICUSDT",
  POL:   "POLUSDT",
  AVAX:  "AVAXUSDT",
  FTM:   "FTMUSDT",
  USDT:  "USDCUSDT",
  USDC:  "USDCUSDT",
  DAI:   "DAIUSDT",
  WBTC:  "WBTCUSDT",
  WETH:  "ETHUSDT",
  LINK:  "LINKUSDT",
  UNI:   "UNIUSDT",
  AAVE:  "AAVEUSDT",
  SHIB:  "SHIBUSDT",
  PEPE:  "PEPEUSDT",
  MKR:   "MKRUSDT",
  CRV:   "CRVUSDT",
  LDO:   "LDOUSDT",
  CAKE:  "CAKEUSDT",
  SOL:   "SOLUSDT",
  ATOM:  "ATOMUSDT",
  NEAR:  "NEARUSDT",
  DOT:   "DOTUSDT",
  MNT:   "MNTUSDT",
  ZETA:  "ZETAUSDT",
};

const INTERVALS = [
  { label: "1m",  value: "1m"  },
  { label: "5m",  value: "5m"  },
  { label: "15m", value: "15m" },
  { label: "1H",  value: "1h"  },
  { label: "4H",  value: "4h"  },
  { label: "1D",  value: "1d"  },
  { label: "1W",  value: "1w"  },
];

const INTERVAL_LIMITS = {
  "1m": 500, "5m": 500, "15m": 500,
  "1h": 365, "4h": 365, "1d": 365, "1w": 104,
};

async function fetchOHLC(symbol, interval) {
  const limit = INTERVAL_LIMITS[interval] ?? 200;
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance API error: ${res.status}`);
  const raw = await res.json();
  return raw.map((k) => ({
    time:  Math.floor(k[0] / 1000),
    open:  parseFloat(k[1]),
    high:  parseFloat(k[2]),
    low:   parseFloat(k[3]),
    close: parseFloat(k[4]),
  }));
}

export default function CandlestickChart({ symbol, tokenName, onClose }) {
  const containerRef    = useRef(null);
  const chartRef        = useRef(null);
  const seriesRef       = useRef(null);

  const [interval,     setIntervalVal] = useState("1h");
  const [loading,      setLoading]     = useState(true);
  const [error,        setError]       = useState("");
  const [lastPrice,    setLastPrice]   = useState(null);
  const [priceChange,  setPriceChange] = useState(null);

  const binanceSymbol = SYMBOL_MAP[symbol?.toUpperCase()];

  // ── Load OHLC data ─────────────────────────────────────────────────────────
  const loadData = useCallback(async (iv) => {
    if (!binanceSymbol) {
      setError(`No trading pair found for ${symbol}`);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await fetchOHLC(binanceSymbol, iv);
      if (seriesRef.current) {
        seriesRef.current.setData(data);
        chartRef.current?.timeScale().fitContent();
      }
      if (data.length > 0) {
        const last  = data[data.length - 1];
        const first = data[0];
        setLastPrice(last.close);
        setPriceChange(((last.close - first.open) / first.open) * 100);
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [binanceSymbol, symbol]);

  // ── Init chart once ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    // ── v5 API: createChart + addSeries(CandlestickSeries) ──
    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "transparent" },
        textColor:  "#64748b",
      },
      grid: {
        vertLines: { color: "rgba(99,160,255,0.06)" },
        horzLines: { color: "rgba(99,160,255,0.06)" },
      },
      crosshair: {
        vertLine: {
          color: "rgba(99,160,255,0.4)",
          labelBackgroundColor: "#1a2744",
        },
        horzLine: {
          color: "rgba(99,160,255,0.4)",
          labelBackgroundColor: "#1a2744",
        },
      },
      rightPriceScale: { borderColor: "rgba(99,160,255,0.1)" },
      timeScale: {
        borderColor:    "rgba(99,160,255,0.1)",
        timeVisible:    true,
        secondsVisible: false,
      },
      width:  containerRef.current.clientWidth,
      height: containerRef.current.clientHeight || 340,
    });

    // ── KEY FIX: v5 uses addSeries(CandlestickSeries, options) ──
    const series = chart.addSeries(CandlestickSeries, {
      upColor:         "#22c55e",
      downColor:       "#ef4444",
      borderUpColor:   "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor:     "#22c55e",
      wickDownColor:   "#ef4444",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    // Resize observer
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        chart.applyOptions({ width, height: height || 340 });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current  = null;
      seriesRef.current = null;
    };
  }, []); // only once

  // ── Reload when interval changes ───────────────────────────────────────────
  useEffect(() => {
    loadData(interval);
  }, [interval, loadData]);

  const isUp = priceChange !== null && priceChange >= 0;

  return (
    <div className="chart-modal-overlay" onClick={onClose}>
      <div className="chart-modal" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="chart-modal__header">
          <div className="chart-modal__title-group">
            <span className="chart-modal__symbol">{symbol}</span>
            <span className="chart-modal__name">{tokenName}</span>
            {lastPrice !== null && (
              <span className="chart-modal__price">
                ${lastPrice.toLocaleString(undefined, { maximumFractionDigits: 6 })}
              </span>
            )}
            {priceChange !== null && (
              <span className={`chart-modal__change chart-modal__change--${isUp ? "up" : "down"}`}>
                {isUp ? "▲" : "▼"} {Math.abs(priceChange).toFixed(2)}%
              </span>
            )}
          </div>

          <div className="chart-modal__controls">
            <div className="chart-interval-bar">
              {INTERVALS.map((iv) => (
                <button
                  key={iv.value}
                  className={`chart-interval-btn${interval === iv.value ? " chart-interval-btn--active" : ""}`}
                  onClick={() => setIntervalVal(iv.value)}
                >
                  {iv.label}
                </button>
              ))}
            </div>
            <button className="chart-modal__close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Pair label */}
        {binanceSymbol && (
          <div className="chart-modal__pair">
            <span className="chart-pair-pill">⬡ {binanceSymbol}</span>
            <span className="chart-pair-source">via Binance</span>
          </div>
        )}

        {/* Chart body */}
        <div className="chart-modal__body">
          {loading && (
            <div className="chart-loading">
              <div className="chart-loading__spinner" />
              <span>Loading {symbol} candlestick data…</span>
            </div>
          )}
          {error && !loading && (
            <div className="chart-error">
              <span className="chart-error__icon">⚠</span>
              <span>{error}</span>
              <button className="chart-retry-btn" onClick={() => loadData(interval)}>Retry</button>
            </div>
          )}
          {!binanceSymbol && !loading && (
            <div className="chart-error">
              <span className="chart-error__icon">📊</span>
              <span>No chart data available for <strong>{symbol}</strong></span>
            </div>
          )}
          <div
            ref={containerRef}
            className="chart-canvas"
            style={{ opacity: loading ? 0 : 1, transition: "opacity 0.3s ease" }}
          />
        </div>

        {/* Footer */}
        <div className="chart-modal__footer">
          <span className="chart-footer-note">
            Binance · {INTERVAL_LIMITS[interval]} candles · Scroll to zoom · Drag to pan
          </span>
          <a
            href={`https://www.binance.com/en/trade/${binanceSymbol ?? ""}`}
            target="_blank"
            rel="noreferrer"
            className="chart-binance-link"
          >
            View on Binance ↗
          </a>
        </div>
      </div>
    </div>
  );
}