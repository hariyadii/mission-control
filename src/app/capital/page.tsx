"use client";

import { useEffect, useState } from "react";

// Visual consistency components (matching homepage)
function FreshnessIndicator({ lastUpdate }: { lastUpdate: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(id);
  }, []);
  const diff = now - lastUpdate;
  const isStale = diff > 60000;
  return (
    <span className={`text-[10px] ${isStale ? "text-amber-400" : "text-emerald-400"}`}>
      {isStale ? "⚠" : "●"} {diff > 3600000 ? `${Math.floor(diff/3600000)}h` : diff > 60000 ? `${Math.floor(diff/60000)}m` : "now"}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string; bg: string }> = {
    ok: { label: "OK", color: "text-emerald-300", bg: "bg-emerald-500/20" },
    paper: { label: "PAPER", color: "text-violet-300", bg: "bg-violet-500/20" },
    live: { label: "LIVE", color: "text-rose-300", bg: "bg-rose-500/20" },
  };
  const c = config[status?.toLowerCase()] || { label: status?.slice(0, 6).toUpperCase() || "—", color: "text-slate-300", bg: "bg-slate-500/20" };
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold ${c.color} ${c.bg}`}>{c.label}</span>;
}

type CapitalMetrics = {
  ok: boolean;
  portfolio: {
    totalEquity: number;
    totalPnl: number;
    totalPnlPct: number;
    drawdownPct: number;
    status: string;
    mode: string;
    strategyPhase: string;
    openPositions: number;
    closedTrades: number;
  };
  stats: {
    wins: number;
    losses: number;
    winRate: number | null;
    avgWin: number;
    avgLoss: number;
    expectancy: number | null;
  };
  bySymbol: Record<string, { trades: number; pnl: number }>;
  recentTrades: Array<{
    id: string;
    symbol: string;
    side: "long" | "short";
    realizedPnl: number;
    realizedPnlPct: number;
    closedAt: string;
    exitReason: string;
  }>;
};

type OpenPosition = {
  id: string;
  symbol: string;
  side: "long" | "short";
  entryPrice: number;
  currentPrice: number;
  size: number;
  notional: number;
  stopLoss: number;
  takeProfit: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  thesis: string;
  openedAt: string;
};

type StatusPayload = {
  ok: boolean;
  portfolio: {
    totalEquity: number;
    totalPnl: number;
    totalPnlPct: number;
    drawdownPct: number;
    status: string;
    mode: string;
    cash: number;
    positions: OpenPosition[];
  };
  alerts: string[];
};

export default function CapitalPage() {
  const [metrics, setMetrics] = useState<CapitalMetrics | null>(null);
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  const refresh = async () => {
    const [metricsRes, statusRes] = await Promise.all([
      fetch("/api/capital"),
      fetch("/api/capital", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "status" }),
      }),
    ]);
    if (metricsRes.ok) setMetrics((await metricsRes.json()) as CapitalMetrics);
    if (statusRes.ok) setStatus((await statusRes.json()) as StatusPayload);
    setLastUpdate(Date.now());
  };

  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, 20000);
    return () => clearInterval(id);
  }, []);

  const p = metrics?.portfolio;

  return (
    <div className="space-y-3">
      {/* HEADER - Consistent with homepage */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Capital</h1>
          <p className="text-xs text-slate-400">Lyra portfolio & trades</p>
        </div>
        <div className="flex items-center gap-3">
          <FreshnessIndicator lastUpdate={lastUpdate} />
          <StatusBadge status={p?.mode || "paper"} />
        </div>
      </header>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="panel-glass p-3">
          <p className="text-[9px] uppercase tracking-wider text-slate-500">Equity</p>
          <p className="text-lg font-semibold text-slate-100 mt-1">
            {p ? `$${(p.totalEquity/1000).toFixed(1)}k` : "—"}
          </p>
        </div>
        <div className="panel-glass p-3">
          <p className="text-[9px] uppercase tracking-wider text-slate-500">PnL</p>
          <p className={`text-lg font-semibold mt-1 ${p?.totalPnl && p.totalPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {p ? `${p.totalPnl >= 0 ? "+" : ""}${p.totalPnlPct.toFixed(1)}%` : "—"}
          </p>
        </div>
        <div className="panel-glass p-3">
          <p className="text-[9px] uppercase tracking-wider text-slate-500">Drawdown</p>
          <p className="text-lg font-semibold text-slate-100 mt-1">
            {p ? `${p.drawdownPct.toFixed(1)}%` : "—"}
          </p>
        </div>
        <div className="panel-glass p-3">
          <p className="text-[9px] uppercase tracking-wider text-slate-500">Positions</p>
          <p className="text-lg font-semibold text-slate-100 mt-1">
            {status?.portfolio?.positions?.length ?? "—"}
          </p>
        </div>
      </div>

      {/* Strategy Stats */}
      <section className="panel-glass p-3">
        <h2 className="text-xs font-semibold text-slate-300 mb-2">Strategy Stats</h2>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-xs">
          <div>
            <p className="text-slate-500">Wins</p>
            <p className="text-slate-200">{metrics?.stats.wins ?? "—"}</p>
          </div>
          <div>
            <p className="text-slate-500">Losses</p>
            <p className="text-slate-200">{metrics?.stats.losses ?? "—"}</p>
          </div>
          <div>
            <p className="text-slate-500">Win Rate</p>
            <p className="text-emerald-400">{metrics?.stats.winRate != null ? `${(metrics.stats.winRate * 100).toFixed(0)}%` : "—"}</p>
          </div>
          <div>
            <p className="text-slate-500">Avg Win</p>
            <p className="text-slate-200">${metrics?.stats.avgWin?.toFixed(0) ?? "—"}</p>
          </div>
          <div>
            <p className="text-slate-500">Avg Loss</p>
            <p className="text-slate-200">${metrics?.stats.avgLoss?.toFixed(0) ?? "—"}</p>
          </div>
          <div>
            <p className="text-slate-500">Expectancy</p>
            <p className="text-cyan-400">{metrics?.stats.expectancy != null ? `$${metrics.stats.expectancy.toFixed(0)}` : "—"}</p>
          </div>
        </div>
      </section>

      {/* Open Positions */}
      <section className="panel-glass p-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold text-slate-300">Positions</h2>
          <span className="text-[9px] text-slate-500">{status?.portfolio?.positions?.length ?? 0} open</span>
        </div>
        <div className="space-y-1 max-h-[200px] overflow-y-auto">
          {status?.portfolio?.positions?.length ? (
            status.portfolio.positions.map((pos) => (
              <div key={pos.id} className="panel-soft px-2 py-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-200 font-medium">{pos.symbol} <span className="text-slate-500">{pos.side}</span></span>
                  <span className={pos.unrealizedPnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
                    {pos.unrealizedPnl >= 0 ? "+" : ""}{pos.unrealizedPnlPct.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between mt-0.5 text-[9px] text-slate-500">
                  <span>${pos.entryPrice.toFixed(2)} → ${pos.currentPrice.toFixed(2)}</span>
                  <span>SL ${pos.stopLoss} TP {pos.takeProfit}</span>
                </div>
              </div>
            ))
          ) : (
            <p className="text-xs text-slate-500 text-center py-3">No open positions</p>
          )}
        </div>
      </section>

      {/* Recent Trades */}
      <section className="panel-glass p-3">
        <h2 className="text-xs font-semibold text-slate-300 mb-2">Recent Trades</h2>
        <div className="space-y-1 max-h-[150px] overflow-y-auto">
          {metrics?.recentTrades?.length ? (
            metrics.recentTrades.slice(0, 8).map((t) => (
              <div key={t.id} className="flex items-center justify-between px-2 py-1 text-xs">
                <span className="text-slate-300">{t.symbol} <span className="text-slate-500">{t.side}</span></span>
                <span className={t.realizedPnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
                  {t.realizedPnl >= 0 ? "+" : ""}${t.realizedPnl.toFixed(0)}
                </span>
              </div>
            ))
          ) : (
            <p className="text-xs text-slate-500 text-center py-3">No closed trades</p>
          )}
        </div>
      </section>
    </div>
  );
}
