import { NextResponse } from "next/server";
import { exec as execCallback } from "node:child_process";
import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execCallback);

const LYRA_ROOT = "/home/ubuntu/.openclaw/workspace-lyra";
const PORTFOLIO_FILE = `${LYRA_ROOT}/autonomy/capital/portfolio.json`;
const TRADES_FILE = `${LYRA_ROOT}/autonomy/capital/trades.jsonl`;
const REVIEWS_DIR = `${LYRA_ROOT}/autonomy/capital/reviews`;

type Side = "long" | "short";
type TradeStatus = "open" | "closed";

type Position = {
  id: string;
  symbol: string;
  market: "crypto" | "stock";
  side: Side;
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
  status: TradeStatus;
};

type Portfolio = {
  startingBalance: number;
  cash: number;
  totalEquity: number;
  peakEquity: number;
  drawdown: number;
  drawdownPct: number;
  positions: Position[];
  closedTrades: number;
  winRate: number | null;
  totalPnl: number;
  totalPnlPct: number;
  status: "active" | "halted" | "review";
  mode: "paper" | "live";
  strategyPhase: "exploration" | "convergence" | "optimized";
  lastUpdated: string;
  riskParams: {
    maxRiskPerTrade: number;
    maxPositionSizePct: number;
    drawdownHaltPct: number;
    drawdownReducePct: number;
  };
};

type ClosedTradeLog = {
  id: string;
  symbol: string;
  market: "crypto" | "stock";
  side: Side;
  entryPrice: number;
  exitPrice: number;
  size: number;
  realizedPnl: number;
  realizedPnlPct: number;
  thesis: string;
  exitReason: string;
  openedAt: string;
  closedAt: string;
  durationMs: number;
  postTradeNote?: string;
};

async function loadPortfolio(): Promise<Portfolio> {
  try {
    const raw = await readFile(PORTFOLIO_FILE, "utf8");
    return JSON.parse(raw) as Portfolio;
  } catch {
    const fresh: Portfolio = {
      startingBalance: 100000,
      cash: 100000,
      totalEquity: 100000,
      peakEquity: 100000,
      drawdown: 0,
      drawdownPct: 0,
      positions: [],
      closedTrades: 0,
      winRate: null,
      totalPnl: 0,
      totalPnlPct: 0,
      status: "active",
      mode: "paper",
      strategyPhase: "exploration",
      lastUpdated: new Date().toISOString(),
      riskParams: {
        maxRiskPerTrade: 0.01,
        maxPositionSizePct: 0.05,
        drawdownHaltPct: 0.15,
        drawdownReducePct: 0.10,
      },
    };
    await savePortfolio(fresh);
    return fresh;
  }
}

async function savePortfolio(portfolio: Portfolio): Promise<void> {
  await mkdir(dirname(PORTFOLIO_FILE), { recursive: true });
  portfolio.lastUpdated = new Date().toISOString();
  await writeFile(PORTFOLIO_FILE, JSON.stringify(portfolio, null, 2), "utf8");
}

async function fetchPrice(symbol: string, market: "crypto" | "stock"): Promise<number> {
  try {
    if (market === "crypto") {
      const { stdout } = await exec(
        `curl -s "https://api.binance.com/api/v3/ticker/price?symbol=${symbol.toUpperCase()}"`,
        { timeout: 8000 }
      );
      const data = JSON.parse(stdout) as { price?: string };
      return parseFloat(data.price ?? "0");
    } else {
      const ticker = symbol.toUpperCase().replace("USD", "");
      const { stdout } = await exec(
        `python3 -c "import yfinance as yf; t=yf.Ticker('${ticker}'); info=t.fast_info; print(info.last_price)"`,
        { timeout: 12000 }
      );
      return parseFloat(stdout.trim());
    }
  } catch {
    return 0;
  }
}

function detectMarket(symbol: string): "crypto" | "stock" {
  const cryptoSuffixes = ["USDT", "BTC", "ETH", "BNB", "BUSD"];
  const upper = symbol.toUpperCase();
  return cryptoSuffixes.some((s) => upper.endsWith(s)) ? "crypto" : "stock";
}

function generateId(): string {
  return `trade-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function calcDrawdown(portfolio: Portfolio): Portfolio {
  const positionValue = portfolio.positions.reduce((sum, p) => sum + p.notional + p.unrealizedPnl, 0);
  const equity = portfolio.cash + positionValue;
  portfolio.totalEquity = Math.round(equity * 100) / 100;
  if (equity > portfolio.peakEquity) portfolio.peakEquity = equity;
  portfolio.drawdown = Math.round((equity - portfolio.peakEquity) * 100) / 100;
  portfolio.drawdownPct = Math.round((portfolio.drawdown / portfolio.peakEquity) * 10000) / 100;
  portfolio.totalPnl = Math.round((equity - portfolio.startingBalance) * 100) / 100;
  portfolio.totalPnlPct = Math.round((portfolio.totalPnl / portfolio.startingBalance) * 10000) / 100;
  return portfolio;
}

async function runStatus() {
  const portfolio = await loadPortfolio();
  for (const pos of portfolio.positions) {
    const price = await fetchPrice(pos.symbol, pos.market);
    if (price > 0) {
      pos.currentPrice = price;
      const priceDiff = pos.side === "long" ? price - pos.entryPrice : pos.entryPrice - price;
      pos.unrealizedPnl = Math.round(priceDiff * pos.size * 100) / 100;
      pos.unrealizedPnlPct = Math.round((priceDiff / pos.entryPrice) * 10000) / 100;
      pos.notional = Math.round(pos.entryPrice * pos.size * 100) / 100;
    }
  }
  calcDrawdown(portfolio);
  await savePortfolio(portfolio);

  const alerts: string[] = [];
  if (portfolio.drawdownPct <= -portfolio.riskParams.drawdownHaltPct * 100) {
    alerts.push(`HALT: drawdown ${portfolio.drawdownPct}% exceeded limit`);
    portfolio.status = "halted";
    await savePortfolio(portfolio);
  } else if (portfolio.drawdownPct <= -portfolio.riskParams.drawdownReducePct * 100) {
    alerts.push(`WARN: drawdown ${portfolio.drawdownPct}% — reduce position sizes`);
  }

  for (const pos of portfolio.positions) {
    if (pos.side === "long") {
      if (pos.currentPrice <= pos.stopLoss) alerts.push(`STOP: ${pos.symbol} hit stop-loss at ${pos.currentPrice}`);
      if (pos.currentPrice >= pos.takeProfit) alerts.push(`TARGET: ${pos.symbol} hit take-profit at ${pos.currentPrice}`);
    } else {
      if (pos.currentPrice >= pos.stopLoss) alerts.push(`STOP: ${pos.symbol} hit stop-loss at ${pos.currentPrice}`);
      if (pos.currentPrice <= pos.takeProfit) alerts.push(`TARGET: ${pos.symbol} hit take-profit at ${pos.currentPrice}`);
    }
  }

  return { ok: true, action: "status" as const, portfolio, alerts };
}

async function runTrade(body: Record<string, unknown>) {
  const portfolio = await loadPortfolio();
  if (portfolio.status === "halted") {
    return { ok: false, error: "portfolio_halted_due_to_drawdown" };
  }

  const symbol = String(body.symbol ?? "").toUpperCase();
  const side = (String(body.side ?? "long").toLowerCase()) as Side;
  const entryPrice = Number(body.entryPrice ?? 0);
  const size = Number(body.size ?? 0);
  const stopLoss = Number(body.stopLoss ?? 0);
  const takeProfit = Number(body.takeProfit ?? 0);
  const thesis = String(body.thesis ?? "").trim();

  if (!symbol || !entryPrice || !size || !thesis) {
    return { ok: false, error: "symbol, entryPrice, size, and thesis are required" };
  }

  const market = detectMarket(symbol);
  const notional = entryPrice * size;
  const maxNotional = portfolio.totalEquity * portfolio.riskParams.maxPositionSizePct;

  if (notional > maxNotional) {
    return {
      ok: false,
      error: `position_too_large: notional $${notional.toFixed(2)} exceeds ${portfolio.riskParams.maxPositionSizePct * 100}% limit ($${maxNotional.toFixed(2)})`,
    };
  }

  if (portfolio.cash < notional) {
    return { ok: false, error: `insufficient_cash: need $${notional.toFixed(2)}, have $${portfolio.cash.toFixed(2)}` };
  }

  const riskAmount = Math.abs(entryPrice - stopLoss) * size;
  const maxRisk = portfolio.totalEquity * portfolio.riskParams.maxRiskPerTrade;
  if (riskAmount > maxRisk) {
    return {
      ok: false,
      error: `risk_too_high: risk $${riskAmount.toFixed(2)} exceeds 1% limit ($${maxRisk.toFixed(2)})`,
    };
  }

  const position: Position = {
    id: generateId(),
    symbol,
    market,
    side,
    entryPrice,
    currentPrice: entryPrice,
    size,
    notional: Math.round(notional * 100) / 100,
    stopLoss,
    takeProfit,
    unrealizedPnl: 0,
    unrealizedPnlPct: 0,
    thesis,
    openedAt: new Date().toISOString(),
    status: "open",
  };

  portfolio.cash = Math.round((portfolio.cash - notional) * 100) / 100;
  portfolio.positions.push(position);
  calcDrawdown(portfolio);
  await savePortfolio(portfolio);

  return { ok: true, action: "trade" as const, position, portfolio: { cash: portfolio.cash, totalEquity: portfolio.totalEquity } };
}

async function runClose(body: Record<string, unknown>) {
  const portfolio = await loadPortfolio();
  const positionId = String(body.positionId ?? "");
  const exitPrice = Number(body.exitPrice ?? 0);
  const reason = String(body.reason ?? "manual").trim();
  const postTradeNote = String(body.postTradeNote ?? "").trim() || undefined;

  const posIdx = portfolio.positions.findIndex((p) => p.id === positionId);
  if (posIdx === -1) return { ok: false, error: "position_not_found" };

  const pos = portfolio.positions[posIdx];
  const livePrice = exitPrice || (await fetchPrice(pos.symbol, pos.market)) || pos.currentPrice;

  const priceDiff = pos.side === "long" ? livePrice - pos.entryPrice : pos.entryPrice - livePrice;
  const realizedPnl = Math.round(priceDiff * pos.size * 100) / 100;
  const realizedPnlPct = Math.round((priceDiff / pos.entryPrice) * 10000) / 100;

  portfolio.cash = Math.round((portfolio.cash + pos.notional + realizedPnl) * 100) / 100;
  portfolio.positions.splice(posIdx, 1);
  portfolio.closedTrades += 1;

  calcDrawdown(portfolio);

  const tradeLog: ClosedTradeLog = {
    id: pos.id,
    symbol: pos.symbol,
    market: pos.market,
    side: pos.side,
    entryPrice: pos.entryPrice,
    exitPrice: livePrice,
    size: pos.size,
    realizedPnl,
    realizedPnlPct,
    thesis: pos.thesis,
    exitReason: reason,
    openedAt: pos.openedAt,
    closedAt: new Date().toISOString(),
    durationMs: Date.now() - new Date(pos.openedAt).getTime(),
    postTradeNote,
  };

  await mkdir(dirname(TRADES_FILE), { recursive: true });
  await appendFile(TRADES_FILE, `${JSON.stringify(tradeLog)}\n`, "utf8");
  await savePortfolio(portfolio);

  return { ok: true, action: "close" as const, trade: tradeLog, portfolio: { cash: portfolio.cash, totalEquity: portfolio.totalEquity, totalPnl: portfolio.totalPnl } };
}

async function runReview(body: Record<string, unknown>) {
  const portfolio = await loadPortfolio();
  const notes = String(body.notes ?? "").trim();
  const strategyChanges = String(body.strategyChanges ?? "").trim();

  const timestamp = new Date().toISOString();
  const slug = timestamp.slice(0, 10);
  const reviewPath = `${REVIEWS_DIR}/review-${slug}.md`;

  let closedTradesData: ClosedTradeLog[] = [];
  try {
    const raw = await readFile(TRADES_FILE, "utf8");
    closedTradesData = raw.split("\n").filter(Boolean).map((l) => JSON.parse(l) as ClosedTradeLog).slice(-20);
  } catch { /* no trades yet */ }

  const wins = closedTradesData.filter((t) => t.realizedPnl > 0).length;
  const losses = closedTradesData.filter((t) => t.realizedPnl <= 0).length;
  const totalPnlFromHistory = closedTradesData.reduce((s, t) => s + t.realizedPnl, 0);

  const content = [
    `# Strategy Review — ${slug}`,
    "",
    `Generated at: ${timestamp}`,
    "",
    "## Portfolio Snapshot",
    `- Total Equity: $${portfolio.totalEquity.toLocaleString()}`,
    `- Total PnL: $${portfolio.totalPnl.toFixed(2)} (${portfolio.totalPnlPct.toFixed(2)}%)`,
    `- Drawdown: ${portfolio.drawdownPct.toFixed(2)}%`,
    `- Open Positions: ${portfolio.positions.length}`,
    `- Closed Trades: ${portfolio.closedTrades}`,
    "",
    "## Trade History (last 20)",
    `- Wins: ${wins}, Losses: ${losses}`,
    `- Win rate: ${closedTradesData.length > 0 ? ((wins / closedTradesData.length) * 100).toFixed(1) : "n/a"}%`,
    `- Total realized PnL: $${totalPnlFromHistory.toFixed(2)}`,
    "",
    "## Review Notes",
    notes || "(none provided)",
    "",
    "## Strategy Changes",
    strategyChanges || "(none documented)",
    "",
    "## Next Cycle Plan",
    "(Lyra to update after analysis)",
    "",
  ].join("\n");

  await mkdir(REVIEWS_DIR, { recursive: true });
  await writeFile(reviewPath, content, "utf8");

  if (portfolio.status === "halted") {
    portfolio.status = "active";
    await savePortfolio(portfolio);
  }

  return { ok: true, action: "review" as const, reviewPath, snapshot: { totalEquity: portfolio.totalEquity, totalPnl: portfolio.totalPnl, wins, losses } };
}

async function runMetrics() {
  const portfolio = await loadPortfolio();
  let closedTradesData: ClosedTradeLog[] = [];
  try {
    const raw = await readFile(TRADES_FILE, "utf8");
    closedTradesData = raw.split("\n").filter(Boolean).map((l) => JSON.parse(l) as ClosedTradeLog);
  } catch { /* no trades yet */ }

  const wins = closedTradesData.filter((t) => t.realizedPnl > 0).length;
  const losses = closedTradesData.filter((t) => t.realizedPnl <= 0).length;
  const winRate = closedTradesData.length > 0 ? wins / closedTradesData.length : null;
  const avgWin = wins > 0 ? closedTradesData.filter((t) => t.realizedPnl > 0).reduce((s, t) => s + t.realizedPnl, 0) / wins : 0;
  const avgLoss = losses > 0 ? closedTradesData.filter((t) => t.realizedPnl <= 0).reduce((s, t) => s + t.realizedPnl, 0) / losses : 0;
  const expectancy = winRate !== null ? winRate * avgWin + (1 - winRate) * avgLoss : null;

  const bySymbol: Record<string, { trades: number; pnl: number }> = {};
  for (const t of closedTradesData) {
    bySymbol[t.symbol] = bySymbol[t.symbol] ?? { trades: 0, pnl: 0 };
    bySymbol[t.symbol].trades += 1;
    bySymbol[t.symbol].pnl += t.realizedPnl;
  }

  return {
    ok: true,
    action: "metrics" as const,
    portfolio: {
      totalEquity: portfolio.totalEquity,
      totalPnl: portfolio.totalPnl,
      totalPnlPct: portfolio.totalPnlPct,
      drawdownPct: portfolio.drawdownPct,
      status: portfolio.status,
      mode: portfolio.mode,
      strategyPhase: portfolio.strategyPhase,
      openPositions: portfolio.positions.length,
      closedTrades: portfolio.closedTrades,
    },
    stats: { wins, losses, winRate, avgWin: Math.round(avgWin * 100) / 100, avgLoss: Math.round(avgLoss * 100) / 100, expectancy: expectancy !== null ? Math.round(expectancy * 100) / 100 : null },
    bySymbol,
    recentTrades: closedTradesData.slice(-10),
  };
}

export async function GET() {
  return runMetrics().then((result) => NextResponse.json(result));
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "status");

    if (action === "status") return NextResponse.json(await runStatus());
    if (action === "trade") return NextResponse.json(await runTrade(body));
    if (action === "close") return NextResponse.json(await runClose(body));
    if (action === "review") return NextResponse.json(await runReview(body));
    if (action === "metrics") return NextResponse.json(await runMetrics());

    return NextResponse.json({ ok: false, error: "unsupported action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
