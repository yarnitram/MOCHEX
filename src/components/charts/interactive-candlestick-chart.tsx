"use client";
/* eslint-disable react-hooks/refs, react-hooks/set-state-in-effect, @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  createChart,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  IChartApi,
  ISeriesApi,
  Time,
  Logical,
} from "lightweight-charts";
import { toPng } from "html-to-image";
import { CandleData } from "@/app/api/mexc/kline/route";
import { fmtPx, cleanSymbol } from "@/lib/format";
import { ChartScriptEditorModal } from "./chart-script-editor-modal";
import { ScriptPlot, executeChartScript } from "@/lib/chart-script-engine";

export interface TradeSetupOverlay {
  symbol: string;
  side?: "LONG" | "SHORT" | null;
  trigger_price?: number | null;
  entry_price?: number | null;
  stop_loss?: number | null;
  take_profit?: number | null;
  order_type?: string | null;
}

export interface RectangleShape {
  id: string;
  type: "rectangle";
  time1: number;
  price1: number;
  time2: number;
  price2: number;
  color: string;
}

export interface PathShape {
  id: string;
  type: "path";
  points: Array<{ time: number; price: number }>;
  color: string;
}

export interface TrendlineShape {
  id: string;
  type: "trendline";
  time1: number;
  price1: number;
  time2: number;
  price2: number;
  color: string;
}

export interface RayShape {
  id: string;
  type: "ray";
  price: number;
  color: string;
}

export interface FibShape {
  id: string;
  type: "fibonacci";
  time1: number;
  price1: number;
  time2: number;
  price2: number;
  color: string;
}

export interface RiskRewardShape {
  id: string;
  type: "risk_reward";
  side: "LONG" | "SHORT";
  entryPrice: number;
  takeProfit: number;
  stopLoss: number;
  time1: number;
  time2: number;
  color: string;
}

export type ChartDrawing =
  | RectangleShape
  | PathShape
  | TrendlineShape
  | RayShape
  | FibShape
  | RiskRewardShape;

export type DrawingTool =
  | "select"
  | "rectangle"
  | "path"
  | "trendline"
  | "ray"
  | "fibonacci"
  | "risk_reward";

interface Props {
  symbol: string;
  setup?: TradeSetupOverlay | null;
  height?: number;
  initialInterval?: string;
  showOverlayToggle?: boolean;
  maxLeverage?: number | null;
}

const INTERVALS = [
  { label: "1m", value: "1m" },
  { label: "5m", value: "5m" },
  { label: "15m", value: "15m" },
  { label: "1h", value: "1h" },
  { label: "4h", value: "4h" },
  { label: "1d", value: "1d" },
];

const DRAWING_COLORS = [
  { label: "Violet", hex: "#8b5cf6" },
  { label: "Cyan", hex: "#06b6d4" },
  { label: "Emerald", hex: "#10b981" },
  { label: "Rose", hex: "#f43f5e" },
  { label: "Amber", hex: "#f59e0b" },
];

const FIB_LEVELS = [
  { level: 0.0, label: "0.0", color: "#94a3b8" },
  { level: 0.236, label: "0.236", color: "#fb7185" },
  { level: 0.382, label: "0.382", color: "#f59e0b" },
  { level: 0.5, label: "0.5", color: "#34d399" },
  { level: 0.618, label: "0.618 (Golden Pocket)", color: "#facc15" },
  { level: 0.786, label: "0.786", color: "#06b6d4" },
  { level: 1.0, label: "1.0", color: "#8b5cf6" },
];

function getIntervalSeconds(interval: string, candles: CandleData[]): number {
  if (candles.length >= 2) {
    const diff = Number(candles[candles.length - 1].time) - Number(candles[candles.length - 2].time);
    if (diff > 0) return diff;
  }
  switch (interval) {
    case "1m":
      return 60;
    case "5m":
      return 300;
    case "15m":
      return 900;
    case "1h":
      return 3600;
    case "4h":
      return 14400;
    case "1d":
      return 86400;
    default:
      return 900;
  }
}

function calculateEMA(candles: CandleData[], period: number): Array<{ time: Time; value: number }> {
  if (candles.length < period) return [];
  const k = 2 / (period + 1);
  const result: Array<{ time: Time; value: number }> = [];

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += candles[i].close;
  }
  let prevEma = sum / period;
  result.push({ time: candles[period - 1].time as Time, value: prevEma });

  for (let i = period; i < candles.length; i++) {
    const currentEma = candles[i].close * k + prevEma * (1 - k);
    result.push({ time: candles[i].time as Time, value: currentEma });
    prevEma = currentEma;
  }

  return result;
}

export type DragState =
  | {
      mode: "move_shape";
      shapeId: string;
      startPoint: { time: number; price: number };
      initialShape: ChartDrawing;
    }
  | {
      mode: "rect_corner";
      shapeId: string;
      corner: "c1" | "c2" | "c3" | "c4";
      anchorTime: number;
      anchorPrice: number;
      initialShape: RectangleShape;
    }
  | {
      mode: "rect_edge";
      shapeId: string;
      edge: "top" | "bottom" | "left" | "right";
      initialShape: RectangleShape;
    }
  | {
      mode: "path_vertex";
      shapeId: string;
      pointIndex: number;
      initialShape: PathShape;
    }
  | {
      mode: "trendline_endpoint";
      shapeId: string;
      endpoint: "p1" | "p2";
      initialShape: TrendlineShape;
    }
  | {
      mode: "ray_price";
      shapeId: string;
      initialShape: RayShape;
    }
  | {
      mode: "fib_endpoint";
      shapeId: string;
      endpoint: "p1" | "p2";
      initialShape: FibShape;
    }
  | {
      mode: "rr_handle";
      shapeId: string;
      handle: "tp" | "entry" | "sl" | "right";
      initialShape: RiskRewardShape;
    };

export function InteractiveCandlestickChart({
  symbol,
  setup,
  height = 450,
  initialInterval = "15m",
  showOverlayToggle = true,
  maxLeverage: initialMaxLeverage,
}: Props) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const candlesRef = useRef<CandleData[]>([]);
  const isDisposedRef = useRef<boolean>(false);

  // Multi-EMA line series refs (User-specified: 20, 50, 100, 200, white/blue/yellow/orange)
  const ema20SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ema100SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ema200SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  const [activeEmas, setActiveEmas] = useState<{
    ema20: boolean;
    ema50: boolean;
    ema100: boolean;
    ema200: boolean;
  }>({
    ema20: true,
    ema50: true,
    ema100: false,
    ema200: true,
  });

  const [countdownText, setCountdownText] = useState<string>("");
  const [isCapturing, setIsCapturing] = useState<boolean>(false);

  const [klineInterval, setKlineInterval] = useState<string>(initialInterval);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState<boolean>(true);
  const [lastCandle, setLastCandle] = useState<CandleData | null>(null);
  const [hoverData, setHoverData] = useState<CandleData | null>(null);

  // Contract Leverage & High-Precision Price Scale State
  const [contractLeverage, setContractLeverage] = useState<number | null>(initialMaxLeverage ?? null);
  const [decimalPrecisionMode, setDecimalPrecisionMode] = useState<"auto" | 2 | 4 | 6 | 8>("auto");
  const [showPriceLadder, setShowPriceLadder] = useState<boolean>(false);
  const [liveClockTime, setLiveClockTime] = useState<string>("");

  // Real-time clock updating every 1s for the current price timestamp (HH:mm:ss)
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setLiveClockTime(
        now.toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch contract detail / max leverage fallback if not provided via props
  useEffect(() => {
    if (initialMaxLeverage != null) {
      setContractLeverage(initialMaxLeverage);
      return;
    }
    let mounted = true;
    async function fetchContractDetail() {
      try {
        const res = await fetch(`/api/mexc/futures?symbol=${encodeURIComponent(symbol)}`);
        const json = await res.json();
        if (mounted && json.success && json.detail?.maxLeverage) {
          setContractLeverage(json.detail.maxLeverage);
        }
      } catch {}
    }
    fetchContractDetail();
    return () => {
      mounted = false;
    };
  }, [symbol, initialMaxLeverage]);

  // Compute adaptive decimal precision based on token price magnitude
  const computedDecimals = useMemo(() => {
    if (decimalPrecisionMode !== "auto") return decimalPrecisionMode;
    const lastP = lastCandle?.close || 100;
    if (lastP < 0.0001) return 8;
    if (lastP < 0.01) return 6;
    if (lastP < 1) return 4;
    if (lastP < 100) return 3;
    return 2;
  }, [decimalPrecisionMode, lastCandle]);

  // Dynamically update candlestick series price format when precision changes
  useEffect(() => {
    if (isDisposedRef.current || !candlestickSeriesRef.current) return;
    const minMove = Math.pow(10, -computedDecimals);
    try {
      candlestickSeriesRef.current.applyOptions({
        priceFormat: {
          type: "price",
          precision: computedDecimals,
          minMove,
        },
      });
    } catch {}
  }, [computedDecimals]);

  // Drawing tools state
  const [activeTool, setActiveTool] = useState<DrawingTool>("select");
  const [drawingColor, setDrawingColor] = useState<string>("#8b5cf6");
  const [drawings, setDrawings] = useState<ChartDrawing[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Drafting start points
  const [rectStart, setRectStart] = useState<{ time: number; price: number } | null>(null);
  const [trendlineStart, setTrendlineStart] = useState<{ time: number; price: number } | null>(null);
  const [fibStart, setFibStart] = useState<{ time: number; price: number } | null>(null);
  const [pathPoints, setPathPoints] = useState<Array<{ time: number; price: number }>>([]);
  const [mousePos, setMousePos] = useState<{ time: number; price: number } | null>(null);
  const [, setRenderTick] = useState<number>(0);

  const [dragState, setDragState] = useState<DragState | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  dragStateRef.current = dragState;

  const isFirstLoadRef = useRef<boolean>(true);
  const cleanSym = cleanSymbol(symbol);
  const storageKey = `mochex_drawings_${cleanSym}`;

  // Custom Formula / PineScript Indicator Studio State
  const [isScriptModalOpen, setIsScriptModalOpen] = useState<boolean>(false);
  const [customScript, setCustomScript] = useState<string>("");
  const [customPlots, setCustomPlots] = useState<ScriptPlot[]>([]);
  const customSeriesRefs = useRef<Array<ISeriesApi<"Line">>>([]);
  const scriptStorageKey = `mochex_custom_script_${cleanSym}`;

  // Load saved drawings from LocalStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setDrawings(JSON.parse(saved));
      } else {
        setDrawings([]);
      }
    } catch {
      setDrawings([]);
    }
  }, [storageKey]);

  // Load saved custom script from LocalStorage
  useEffect(() => {
    try {
      const savedScript = localStorage.getItem(scriptStorageKey);
      if (savedScript) {
        setCustomScript(savedScript);
        if (candlesRef.current && candlesRef.current.length > 0) {
          const res = executeChartScript(savedScript, candlesRef.current);
          if (res.success) {
            setCustomPlots(res.plots);
          }
        }
      } else {
        setCustomScript("");
        setCustomPlots([]);
      }
    } catch {
      setCustomScript("");
      setCustomPlots([]);
    }
  }, [scriptStorageKey]);

  // Save drawings to LocalStorage
  const saveDrawings = useCallback(
    (newDrawings: ChartDrawing[]) => {
      setDrawings(newDrawings);
      try {
        localStorage.setItem(storageKey, JSON.stringify(newDrawings));
      } catch (err) {
        console.error("Failed to save drawings:", err);
      }
    },
    [storageKey]
  );

  const clearAllDrawings = () => {
    saveDrawings([]);
    setSelectedId(null);
    setRectStart(null);
    setTrendlineStart(null);
    setFibStart(null);
    setPathPoints([]);
  };

  // 1-Click Chart Snapshot (PNG Camera Export)
  const captureSnapshot = async () => {
    if (isDisposedRef.current || !chartContainerRef.current) return;
    try {
      setIsCapturing(true);
      const dataUrl = await toPng(chartContainerRef.current, {
        cacheBust: true,
        backgroundColor: "#0c0a17",
        pixelRatio: 2,
      });
      if (isDisposedRef.current) return;
      const link = document.createElement("a");
      const dateStr = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      link.download = `MOCHEX_${cleanSym}_${klineInterval}_${dateStr}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Failed to capture chart snapshot:", err);
    } finally {
      if (!isDisposedRef.current) {
        setIsCapturing(false);
      }
    }
  };

  // Candle Close Countdown Timer
  useEffect(() => {
    const updateCountdown = () => {
      if (isDisposedRef.current || !lastCandle) return;
      const step = getIntervalSeconds(klineInterval, candlesRef.current);
      const openTime = Number(lastCandle.time);
      const closeTime = openTime + step;
      const now = Math.floor(Date.now() / 1000);
      const diff = Math.max(0, closeTime - now);

      if (diff >= 3600) {
        const h = Math.floor(diff / 3600);
        const m = Math.floor((diff % 3600) / 60);
        const s = diff % 60;
        setCountdownText(`${h}h ${m}m ${s.toString().padStart(2, "0")}s`);
      } else {
        const m = Math.floor(diff / 60).toString().padStart(2, "0");
        const s = (diff % 60).toString().padStart(2, "0");
        setCountdownText(`${m}:${s}`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [lastCandle, klineInterval]);

  // Fetch Kline candles from API proxy
  const fetchCandles = useCallback(
    async (isSilentRefresh = false) => {
      try {
        if (isDisposedRef.current) return;
        if (!isSilentRefresh) {
          setLoading(true);
        }
        setError(null);

        const res = await fetch(
          `/api/mexc/kline?symbol=${encodeURIComponent(symbol)}&interval=${klineInterval}`
        );
        if (isDisposedRef.current) return;
        const json = await res.json();
        if (isDisposedRef.current) return;

        if (!json.success || !Array.isArray(json.candles)) {
          throw new Error(json.error || "Failed to load candlestick chart data");
        }

        const candles: CandleData[] = json.candles;

        if (candles.length === 0) {
          throw new Error(`No chart data available for ${cleanSym}`);
        }

        candlesRef.current = candles;
        if (!isDisposedRef.current) {
          setLastCandle(candles[candles.length - 1]);
        }

        if (candlestickSeriesRef.current && volumeSeriesRef.current && !isDisposedRef.current) {
          // Format candlestick data
          const candleData = candles.map((c) => ({
            time: c.time as Time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }));

          // Format volume histogram data
          const volumeData = candles.map((c) => ({
            time: c.time as Time,
            value: c.volume,
            color:
              c.close >= c.open
                ? "rgba(16, 185, 129, 0.4)" // Green for bullish
                : "rgba(239, 68, 68, 0.4)", // Red for bearish
          }));

          try {
            if (isDisposedRef.current || !candlestickSeriesRef.current || !volumeSeriesRef.current) return;
            candlestickSeriesRef.current.setData(candleData);
            volumeSeriesRef.current.setData(volumeData);

            // Populate EMA series with mathematical calculations
            if (ema20SeriesRef.current && !isDisposedRef.current) ema20SeriesRef.current.setData(calculateEMA(candles, 20));
            if (ema50SeriesRef.current && !isDisposedRef.current) ema50SeriesRef.current.setData(calculateEMA(candles, 50));
            if (ema100SeriesRef.current && !isDisposedRef.current) ema100SeriesRef.current.setData(calculateEMA(candles, 100));
            if (ema200SeriesRef.current && !isDisposedRef.current) ema200SeriesRef.current.setData(calculateEMA(candles, 200));

            // Re-evaluate custom formula script if active
            try {
              if (!isDisposedRef.current) {
                const savedScript = localStorage.getItem(`mochex_custom_script_${cleanSym}`) || customScript;
                if (savedScript && candles.length > 0) {
                  const res = executeChartScript(savedScript, candles);
                  if (res.success && !isDisposedRef.current) {
                    setCustomPlots(res.plots);
                  }
                }
              }
            } catch (err) {
              console.warn("Failed to re-execute custom script on candle update:", err);
            }

            // Only fit content on initial load or timeframe switch, preserving user zoom/scroll
            if (chartRef.current && isFirstLoadRef.current && !isDisposedRef.current) {
              try {
                chartRef.current.timeScale().fitContent();
              } catch {}
              isFirstLoadRef.current = false;
            }
          } catch (e) {
            console.warn("Chart series setData skipped (disposed or unmounted):", e);
          }
        }
      } catch (err) {
        if (!isSilentRefresh && !isDisposedRef.current) {
          setError((err as Error).message);
        }
      } finally {
        if (!isDisposedRef.current) {
          setLoading(false);
        }
      }
    },
    [symbol, klineInterval, cleanSym, customScript]
  );

  // Initialize TradingView chart instance once on mount
  useEffect(() => {
    if (!chartContainerRef.current) return;
    isDisposedRef.current = false;

    // Create lightweight-chart instance with MOCHEX dark aesthetic
    const chart = createChart(chartContainerRef.current, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: "#0c0a17" },
        textColor: "#94a3b8",
        fontSize: 12,
        fontFamily: "Inter, Roboto, sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(139, 92, 246, 0.07)" },
        horzLines: { color: "rgba(139, 92, 246, 0.07)" },
      },
      crosshair: {
        mode: 1, // Magnet mode
        vertLine: {
          color: "#8b5cf6",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#1c1830",
        },
        horzLine: {
          color: "#8b5cf6",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#1c1830",
        },
      },
      rightPriceScale: {
        borderColor: "rgba(139, 92, 246, 0.15)",
        entireTextOnly: false,
        ticksVisible: true,
        autoScale: true,
        minimumWidth: 85,
        scaleMargins: {
          top: 0.06,
          bottom: 0.14, // Leave room for volume bars at bottom
        },
      },
      timeScale: {
        borderColor: "rgba(139, 92, 246, 0.15)",
        timeVisible: true,
        secondsVisible: false,
      },
    });

    // Add Candlestick Series with high-precision decimal configuration
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#34d399",
      downColor: "#fb7185",
      borderVisible: false,
      wickUpColor: "#34d399",
      wickDownColor: "#fb7185",
      priceFormat: {
        type: "price",
        precision: computedDecimals,
        minMove: Math.pow(10, -computedDecimals),
      },
    });

    // Add Volume Histogram Series
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "", // Overlay on main price scale
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.8, // Position volume at the bottom 20%
        bottom: 0,
      },
    });

    // Add Multi-EMA Line Series (User specification: 20 white, 50 blue, 100 yellow, 200 orange, thin to thickest)
    const ema20 = chart.addSeries(LineSeries, {
      color: "#ffffff",
      lineWidth: 1,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
      visible: activeEmas.ema20,
    });
    const ema50 = chart.addSeries(LineSeries, {
      color: "#3b82f6",
      lineWidth: 2,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
      visible: activeEmas.ema50,
    });
    const ema100 = chart.addSeries(LineSeries, {
      color: "#eab308",
      lineWidth: 3,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
      visible: activeEmas.ema100,
    });
    const ema200 = chart.addSeries(LineSeries, {
      color: "#f97316",
      lineWidth: 4,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
      visible: activeEmas.ema200,
    });

    chartRef.current = chart;
    candlestickSeriesRef.current = candlestickSeries;
    volumeSeriesRef.current = volumeSeries;
    ema20SeriesRef.current = ema20;
    ema50SeriesRef.current = ema50;
    ema100SeriesRef.current = ema100;
    ema200SeriesRef.current = ema200;

    // Re-render SVG drawing overlays whenever chart pans or zooms
    chart.timeScale().subscribeVisibleTimeRangeChange(() => {
      if (isDisposedRef.current) return;
      setRenderTick((t) => t + 1);
    });

    // Deselect drawing when clicking empty chart canvas
    chart.subscribeClick(() => {
      if (isDisposedRef.current) return;
      setSelectedId(null);
    });

    // Crosshair move handler for legend tooltip
    chart.subscribeCrosshairMove((param) => {
      if (isDisposedRef.current) return;
      try {
        if (
          param.point === undefined ||
          !param.time ||
          !chartContainerRef.current ||
          param.point.x < 0 ||
          param.point.x > chartContainerRef.current.clientWidth ||
          param.point.y < 0 ||
          param.point.y > chartContainerRef.current.clientHeight
        ) {
          setHoverData(null);
        } else {
          const data = param.seriesData.get(candlestickSeries) as {
            open: number;
            high: number;
            low: number;
            close: number;
          } | undefined;
          const volData = param.seriesData.get(volumeSeries) as { value: number } | undefined;

          if (data && !isDisposedRef.current) {
            setHoverData({
              time: Number(param.time),
              open: data.open,
              high: data.high,
              low: data.low,
              close: data.close,
              volume: volData?.value || 0,
            });
          }
        }
      } catch {
        if (!isDisposedRef.current) {
          setHoverData(null);
        }
      }
    });

    // ResizeObserver dynamically detects modal zoom/maximize and layout adjustments
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && chartContainerRef.current) {
      resizeObserver = new ResizeObserver((entries) => {
        if (isDisposedRef.current || !chartRef.current) return;
        if (!entries || entries.length === 0) return;
        const width = Math.floor(entries[0].contentRect.width);
        if (width > 0 && chartRef.current && !isDisposedRef.current) {
          try {
            chartRef.current.applyOptions({ width });
            setRenderTick((t) => t + 1);
          } catch {
            // Chart or canvas might be disposed
          }
        }
      });
      resizeObserver.observe(chartContainerRef.current);
    }

    // Fallback window resize handler
    const handleResize = () => {
      if (isDisposedRef.current || !chartRef.current || !chartContainerRef.current) return;
      try {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
        setRenderTick((t) => t + 1);
      } catch {
        // Chart might be disposed
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      isDisposedRef.current = true;
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      window.removeEventListener("resize", handleResize);
      const chartInstance = chartRef.current;
      chartRef.current = null;
      candlestickSeriesRef.current = null;
      volumeSeriesRef.current = null;
      ema20SeriesRef.current = null;
      ema50SeriesRef.current = null;
      ema100SeriesRef.current = null;
      ema200SeriesRef.current = null;
      customSeriesRefs.current = [];
      if (chartInstance) {
        try {
          chartInstance.remove();
        } catch {
          // Ignore if already removed or disposed
        }
      }
    };
  }, []);

  // Synchronize dynamic custom formula/indicator script series with chart
  useEffect(() => {
    if (isDisposedRef.current || !chartRef.current) return;

    // Safely remove any previously attached custom script series
    customSeriesRefs.current.forEach((series) => {
      try {
        if (!isDisposedRef.current && chartRef.current) {
          chartRef.current.removeSeries(series);
        }
      } catch {
        // Series might be disposed already
      }
    });
    customSeriesRefs.current = [];

    // Add new series for each custom plot
    if (customPlots && customPlots.length > 0 && !isDisposedRef.current && chartRef.current) {
      customPlots.forEach((plot) => {
        try {
          if (isDisposedRef.current || !chartRef.current) return;
          const series = chartRef.current.addSeries(LineSeries, {
            color: plot.color,
            lineWidth: (plot.lineWidth || 2) as 1 | 2 | 3 | 4,
            title: plot.title,
            priceLineVisible: false,
            crosshairMarkerVisible: true,
          });
          series.setData(plot.data);
          customSeriesRefs.current.push(series);
        } catch (e) {
          console.warn("Failed to add custom script series:", e);
        }
      });
    }
  }, [customPlots]);

  // Dynamically apply height changes without disposing/recreating the chart
  useEffect(() => {
    if (isDisposedRef.current || !chartRef.current || !height) return;
    try {
      chartRef.current.applyOptions({ height });
      setRenderTick((t) => t + 1);
    } catch {}
  }, [height]);

  // Dynamically toggle EMA visibility
  useEffect(() => {
    if (isDisposedRef.current) return;
    try {
      ema20SeriesRef.current?.applyOptions({ visible: activeEmas.ema20 });
      ema50SeriesRef.current?.applyOptions({ visible: activeEmas.ema50 });
      ema100SeriesRef.current?.applyOptions({ visible: activeEmas.ema100 });
      ema200SeriesRef.current?.applyOptions({ visible: activeEmas.ema200 });
    } catch {}
  }, [activeEmas]);

  // Load candle data whenever symbol or interval changes
  useEffect(() => {
    isFirstLoadRef.current = true;
    fetchCandles(false);
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (!isDisposedRef.current) {
        fetchCandles(true);
      }
    }, 10_000); // Silent background auto-refresh
    return () => clearInterval(timer);
  }, [fetchCandles]);

  // Handle drawing trade overlay lines on candlestick series
  useEffect(() => {
    if (isDisposedRef.current) return;
    const series = candlestickSeriesRef.current;
    if (!series) return;

    const lines: Array<{ remove: () => void }> = [];

    try {
      if (showSetup && setup && !isDisposedRef.current) {
        // 1. Trigger Price Line
        if (setup.trigger_price && setup.trigger_price > 0) {
          try {
            const line = series.createPriceLine({
              price: setup.trigger_price,
              color: "#f59e0b", // Amber/Orange
              lineWidth: 2,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: `⚡ TRIGGER: ${fmtPx(setup.trigger_price)}`,
            });
            lines.push({
              remove: () => {
                try {
                  if (!isDisposedRef.current && series) {
                    series.removePriceLine(line);
                  }
                } catch {}
              },
            });
          } catch {}
        }

        // 2. Entry Price Line
        if (setup.entry_price && setup.entry_price > 0) {
          try {
            const line = series.createPriceLine({
              price: setup.entry_price,
              color: "#8b5cf6", // Mochex Violet
              lineWidth: 2,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: `🎯 ENTRY: ${fmtPx(setup.entry_price)}`,
            });
            lines.push({
              remove: () => {
                try {
                  if (!isDisposedRef.current && series) {
                    series.removePriceLine(line);
                  }
                } catch {}
              },
            });
          } catch {}
        }

        // 3. Stop Loss Line
        if (setup.stop_loss && setup.stop_loss > 0) {
          let riskPctStr = "";
          const basePx = setup.entry_price || setup.trigger_price;
          if (basePx && basePx > 0) {
            const diff = Math.abs(setup.stop_loss - basePx);
            const pct = (diff / basePx) * 100;
            riskPctStr = ` (-${pct.toFixed(2)}%)`;
          }

          try {
            const line = series.createPriceLine({
              price: setup.stop_loss,
              color: "#fb7185", // Mochex Rose (Loss)
              lineWidth: 2,
              lineStyle: LineStyle.Solid,
              axisLabelVisible: true,
              title: `🛑 SL: ${fmtPx(setup.stop_loss)}${riskPctStr}`,
            });
            lines.push({
              remove: () => {
                try {
                  if (!isDisposedRef.current && series) {
                    series.removePriceLine(line);
                  }
                } catch {}
              },
            });
          } catch {}
        }

        // 4. Take Profit Line
        if (setup.take_profit && setup.take_profit > 0) {
          let rewardPctStr = "";
          const basePx = setup.entry_price || setup.trigger_price;
          if (basePx && basePx > 0) {
            const diff = Math.abs(setup.take_profit - basePx);
            const pct = (diff / basePx) * 100;
            rewardPctStr = ` (+${pct.toFixed(2)}%)`;
          }

          try {
            const line = series.createPriceLine({
              price: setup.take_profit,
              color: "#34d399", // Mochex Emerald (Gain)
              lineWidth: 2,
              lineStyle: LineStyle.Solid,
              axisLabelVisible: true,
              title: `🏁 TP: ${fmtPx(setup.take_profit)}${rewardPctStr}`,
            });
            lines.push({
              remove: () => {
                try {
                  if (!isDisposedRef.current && series) {
                    series.removePriceLine(line);
                  }
                } catch {}
              },
            });
          } catch {}
        }
      }
    } catch {}

    return () => {
      for (const l of lines) {
        try {
          l.remove();
        } catch {}
      }
    };
  }, [setup, showSetup, loading]);

  // Coordinate conversion helper: Pixel (x, y) -> Chart (time, price) with out-of-bounds extrapolation support
  const getChartPoint = useCallback(
    (e: React.MouseEvent<Element> | MouseEvent) => {
      try {
        if (isDisposedRef.current || !chartRef.current || !candlestickSeriesRef.current || !chartContainerRef.current)
          return null;
        const rect = chartContainerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // 1. Time conversion (with past/future logical extrapolation)
        let time: number | null = null;
        const directTime = chartRef.current.timeScale().coordinateToTime(x);
        if (directTime != null) {
          time = Number(directTime);
        } else if (candlesRef.current.length > 0) {
          const logical = chartRef.current.timeScale().coordinateToLogical(x);
          const lastCandleItem = candlesRef.current[candlesRef.current.length - 1];
          const firstCandle = candlesRef.current[0];
          const step = getIntervalSeconds(klineInterval, candlesRef.current);
          if (logical != null) {
            const lastIndex = candlesRef.current.length - 1;
            const diffIndex = logical - lastIndex;
            time = Number(lastCandleItem.time) + Math.round(diffIndex * step);
          } else {
            // Extrapolate beyond container boundaries
            if (x < 0) {
              const barsBack = Math.round(Math.abs(x) / 8);
              time = Number(firstCandle.time) - barsBack * step;
            } else {
              const barsFwd = Math.round((x - rect.width) / 8);
              time = Number(lastCandleItem.time) + barsFwd * step;
            }
          }
        }

        // 2. Price conversion with linear extrapolation if mouse is above/below canvas
        let price: number | null = candlestickSeriesRef.current.coordinateToPrice(y) as number | null;
        if (price == null && rect.height > 20) {
          const pTop = candlestickSeriesRef.current.coordinateToPrice(10) as number | null;
          const pBottom = candlestickSeriesRef.current.coordinateToPrice(rect.height - 10) as number | null;
          if (pTop != null && pBottom != null) {
            const pricePerPx = (pTop - pBottom) / (rect.height - 20);
            price = pTop - (y - 10) * pricePerPx;
          }
        }

        if (time == null || price == null) return null;
        return { time, price, x, y };
      } catch {
        return null;
      }
    },
    [klineInterval]
  );

  // Convert chart point (time, price) -> screen pixel (x, y) with boundary extrapolation
  const toPixelCoords = useCallback(
    (time: number, price: number): { x: number; y: number } | null => {
      try {
        if (isDisposedRef.current || !chartRef.current || !candlestickSeriesRef.current || !chartContainerRef.current) return null;

        // 1. Convert time to local x coordinate
        let x: number | null = null;
        const directX = chartRef.current.timeScale().timeToCoordinate(time as Time);
        if (directX !== null) {
          x = Number(directX);
        } else if (candlesRef.current.length > 0) {
          const lastCandleItem = candlesRef.current[candlesRef.current.length - 1];
          const step = getIntervalSeconds(klineInterval, candlesRef.current);
          const lastIndex = candlesRef.current.length - 1;
          const diffSec = time - Number(lastCandleItem.time);
          const logicalVal = lastIndex + diffSec / step;
          const logicalX = chartRef.current.timeScale().logicalToCoordinate(logicalVal as Logical);
          if (logicalX !== null) {
            x = Number(logicalX);
          }
        }

        // 2. Convert price to y coordinate with out-of-bounds extrapolation
        let y: number | null = candlestickSeriesRef.current.priceToCoordinate(price) as number | null;
        if (y === null && chartContainerRef.current) {
          const h = chartContainerRef.current.clientHeight;
          const pTop = candlestickSeriesRef.current.coordinateToPrice(10) as number | null;
          const pBottom = candlestickSeriesRef.current.coordinateToPrice(Math.max(h - 10, 20)) as number | null;
          if (pTop != null && pBottom != null && h > 20 && pTop !== pBottom) {
            const pxPerPrice = (h - 20) / (pTop - pBottom);
            y = 10 + (pTop - price) * pxPerPrice;
          }
        }

        if (x === null || y === null) return null;
        return { x: Number(x), y: Number(y) };
      } catch {
        return null;
      }
    },
    [klineInterval]
  );

  // Safe price to coordinate helper for SVG drawings that only need the Y position
  const safePriceToCoordinate = useCallback(
    (price: number): number | null => {
      try {
        if (isDisposedRef.current || !candlestickSeriesRef.current) return null;
        const y = candlestickSeriesRef.current.priceToCoordinate(price);
        return y !== null ? Number(y) : null;
      } catch {
        return null;
      }
    },
    []
  );

  // Interactive dragging of shapes and handles (window listeners ensure smooth tracking)
  useEffect(() => {
    if (!dragState) return;

    const handlePointerMove = (e: MouseEvent) => {
      const pt = getChartPoint(e);
      if (!pt || !dragStateRef.current) return;
      const currentDrag = dragStateRef.current;

      setDrawings((prev) =>
        prev.map((shape) => {
          if (shape.id !== currentDrag.shapeId) return shape;

          if (currentDrag.mode === "move_shape") {
            const dTime = pt.time - currentDrag.startPoint.time;
            const dPrice = pt.price - currentDrag.startPoint.price;
            if (shape.type === "rectangle" && currentDrag.initialShape.type === "rectangle") {
              return {
                ...shape,
                time1: currentDrag.initialShape.time1 + dTime,
                price1: currentDrag.initialShape.price1 + dPrice,
                time2: currentDrag.initialShape.time2 + dTime,
                price2: currentDrag.initialShape.price2 + dPrice,
              };
            } else if (shape.type === "path" && currentDrag.initialShape.type === "path") {
              return {
                ...shape,
                points: currentDrag.initialShape.points.map((p) => ({
                  time: p.time + dTime,
                  price: p.price + dPrice,
                })),
              };
            } else if (shape.type === "trendline" && currentDrag.initialShape.type === "trendline") {
              return {
                ...shape,
                time1: currentDrag.initialShape.time1 + dTime,
                price1: currentDrag.initialShape.price1 + dPrice,
                time2: currentDrag.initialShape.time2 + dTime,
                price2: currentDrag.initialShape.price2 + dPrice,
              };
            } else if (shape.type === "ray" && currentDrag.initialShape.type === "ray") {
              return {
                ...shape,
                price: currentDrag.initialShape.price + dPrice,
              };
            } else if (shape.type === "fibonacci" && currentDrag.initialShape.type === "fibonacci") {
              return {
                ...shape,
                time1: currentDrag.initialShape.time1 + dTime,
                price1: currentDrag.initialShape.price1 + dPrice,
                time2: currentDrag.initialShape.time2 + dTime,
                price2: currentDrag.initialShape.price2 + dPrice,
              };
            } else if (shape.type === "risk_reward" && currentDrag.initialShape.type === "risk_reward") {
              return {
                ...shape,
                time1: currentDrag.initialShape.time1 + dTime,
                time2: currentDrag.initialShape.time2 + dTime,
                entryPrice: currentDrag.initialShape.entryPrice + dPrice,
                takeProfit: currentDrag.initialShape.takeProfit + dPrice,
                stopLoss: currentDrag.initialShape.stopLoss + dPrice,
              };
            }
          } else if (currentDrag.mode === "rect_corner") {
            if (shape.type !== "rectangle") return shape;
            const { anchorTime, anchorPrice } = currentDrag;
            return {
              ...shape,
              time1: Math.min(anchorTime, pt.time),
              time2: Math.max(anchorTime, pt.time),
              price1: Math.max(anchorPrice, pt.price),
              price2: Math.min(anchorPrice, pt.price),
            };
          } else if (currentDrag.mode === "rect_edge") {
            if (shape.type !== "rectangle") return shape;
            const { edge, initialShape } = currentDrag;
            if (edge === "top") {
              return { ...shape, price1: Math.max(pt.price, initialShape.price2) };
            } else if (edge === "bottom") {
              return { ...shape, price2: Math.min(pt.price, initialShape.price1) };
            } else if (edge === "left") {
              return { ...shape, time1: Math.min(pt.time, initialShape.time2) };
            } else if (edge === "right") {
              return { ...shape, time2: Math.max(pt.time, initialShape.time1) };
            }
          } else if (currentDrag.mode === "path_vertex") {
            if (shape.type !== "path") return shape;
            const newPoints = [...shape.points];
            newPoints[currentDrag.pointIndex] = { time: pt.time, price: pt.price };
            return { ...shape, points: newPoints };
          } else if (currentDrag.mode === "trendline_endpoint") {
            if (shape.type !== "trendline") return shape;
            if (currentDrag.endpoint === "p1") {
              return { ...shape, time1: pt.time, price1: pt.price };
            } else {
              return { ...shape, time2: pt.time, price2: pt.price };
            }
          } else if (currentDrag.mode === "ray_price") {
            if (shape.type !== "ray") return shape;
            return { ...shape, price: pt.price };
          } else if (currentDrag.mode === "fib_endpoint") {
            if (shape.type !== "fibonacci") return shape;
            if (currentDrag.endpoint === "p1") {
              return { ...shape, time1: pt.time, price1: pt.price };
            } else {
              return { ...shape, time2: pt.time, price2: pt.price };
            }
          } else if (currentDrag.mode === "rr_handle") {
            if (shape.type !== "risk_reward") return shape;
            if (currentDrag.handle === "tp") {
              return { ...shape, takeProfit: pt.price };
            } else if (currentDrag.handle === "entry") {
              return { ...shape, entryPrice: pt.price };
            } else if (currentDrag.handle === "sl") {
              return { ...shape, stopLoss: pt.price };
            } else if (currentDrag.handle === "right") {
              const step = getIntervalSeconds(klineInterval, candlesRef.current);
              return { ...shape, time2: Math.max(pt.time, shape.time1 + step) };
            }
          }
          return shape;
        })
      );
    };

    const handlePointerUp = () => {
      setDragState(null);
      // Persist latest drawings to localStorage
      setDrawings((latest) => {
        try {
          localStorage.setItem(storageKey, JSON.stringify(latest));
        } catch {}
        return latest;
      });
    };

    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", handlePointerUp);

    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", handlePointerUp);
    };
  }, [dragState, getChartPoint, storageKey]);

  // Keyboard shortcuts: Delete/Backspace to delete selected shape, Escape to deselect
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedId) return;
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        saveDrawings(drawings.filter((d) => d.id !== selectedId));
        setSelectedId(null);
      } else if (e.key === "Escape") {
        setSelectedId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, drawings, saveDrawings]);

  // Quick actions for selected drawing
  const deleteSelectedDrawing = () => {
    if (!selectedId) return;
    saveDrawings(drawings.filter((d) => d.id !== selectedId));
    setSelectedId(null);
  };

  const updateSelectedColor = (newColor: string) => {
    if (!selectedId) return;
    saveDrawings(
      drawings.map((d) => (d.id === selectedId ? { ...d, color: newColor } : d))
    );
  };

  const duplicateSelectedDrawing = () => {
    if (!selectedId) return;
    const item = drawings.find((d) => d.id === selectedId);
    if (!item) return;

    const step = getIntervalSeconds(klineInterval, candlesRef.current);
    const priceOffset =
      (item as any).price1 && (item as any).price2
        ? ((item as any).price1 - (item as any).price2) * 0.05
        : 0;

    let duplicate: ChartDrawing;
    if (item.type === "rectangle") {
      duplicate = {
        ...item,
        id: `rect_${Date.now()}`,
        time1: item.time1 + step * 2,
        time2: item.time2 + step * 2,
        price1: item.price1 + priceOffset,
        price2: item.price2 + priceOffset,
      };
    } else if (item.type === "path") {
      duplicate = {
        ...item,
        id: `path_${Date.now()}`,
        points: item.points.map((p) => ({
          time: p.time + step * 2,
          price: p.price,
        })),
      };
    } else if (item.type === "trendline") {
      duplicate = {
        ...item,
        id: `trend_${Date.now()}`,
        time1: item.time1 + step * 2,
        time2: item.time2 + step * 2,
        price1: item.price1 + priceOffset,
        price2: item.price2 + priceOffset,
      };
    } else if (item.type === "ray") {
      duplicate = {
        ...item,
        id: `ray_${Date.now()}`,
        price: item.price * 1.01,
      };
    } else if (item.type === "fibonacci") {
      duplicate = {
        ...item,
        id: `fib_${Date.now()}`,
        time1: item.time1 + step * 2,
        time2: item.time2 + step * 2,
        price1: item.price1 + priceOffset,
        price2: item.price2 + priceOffset,
      };
    } else if (item.type === "risk_reward") {
      duplicate = {
        ...item,
        id: `rr_${Date.now()}`,
        time1: item.time1 + step * 2,
        time2: item.time2 + step * 2,
        entryPrice: item.entryPrice * 1.01,
        takeProfit: item.takeProfit * 1.01,
        stopLoss: item.stopLoss * 1.01,
      };
    } else {
      return;
    }

    saveDrawings([...drawings, duplicate]);
    setSelectedId(duplicate.id);
  };

  // Mouse interaction handlers for drawing tool SVG canvas
  const handleSVGClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const pt = getChartPoint(e);
    if (!pt) return;

    if (activeTool === "rectangle") {
      if (!rectStart) {
        setRectStart({ time: pt.time, price: pt.price });
      } else {
        const newRect: RectangleShape = {
          id: `rect_${Date.now()}`,
          type: "rectangle",
          time1: rectStart.time,
          price1: rectStart.price,
          time2: pt.time,
          price2: pt.price,
          color: drawingColor,
        };
        saveDrawings([...drawings, newRect]);
        setRectStart(null);
        setActiveTool("select");
        setSelectedId(newRect.id);
      }
    } else if (activeTool === "path") {
      setPathPoints((prev) => [...prev, { time: pt.time, price: pt.price }]);
    } else if (activeTool === "trendline") {
      if (!trendlineStart) {
        setTrendlineStart({ time: pt.time, price: pt.price });
      } else {
        const newTrendline: TrendlineShape = {
          id: `trend_${Date.now()}`,
          type: "trendline",
          time1: trendlineStart.time,
          price1: trendlineStart.price,
          time2: pt.time,
          price2: pt.price,
          color: drawingColor,
        };
        saveDrawings([...drawings, newTrendline]);
        setTrendlineStart(null);
        setActiveTool("select");
        setSelectedId(newTrendline.id);
      }
    } else if (activeTool === "ray") {
      const newRay: RayShape = {
        id: `ray_${Date.now()}`,
        type: "ray",
        price: pt.price,
        color: drawingColor,
      };
      saveDrawings([...drawings, newRay]);
      setActiveTool("select");
      setSelectedId(newRay.id);
    } else if (activeTool === "fibonacci") {
      if (!fibStart) {
        setFibStart({ time: pt.time, price: pt.price });
      } else {
        const newFib: FibShape = {
          id: `fib_${Date.now()}`,
          type: "fibonacci",
          time1: fibStart.time,
          price1: fibStart.price,
          time2: pt.time,
          price2: pt.price,
          color: drawingColor,
        };
        saveDrawings([...drawings, newFib]);
        setFibStart(null);
        setActiveTool("select");
        setSelectedId(newFib.id);
      }
    } else if (activeTool === "risk_reward") {
      const step = getIntervalSeconds(klineInterval, candlesRef.current);
      const isShort = setup?.side === "SHORT";
      const targetPct = 0.05;
      const stopPct = 0.025;

      const newRR: RiskRewardShape = {
        id: `rr_${Date.now()}`,
        type: "risk_reward",
        side: isShort ? "SHORT" : "LONG",
        entryPrice: pt.price,
        takeProfit: isShort ? pt.price * (1 - targetPct) : pt.price * (1 + targetPct),
        stopLoss: isShort ? pt.price * (1 + stopPct) : pt.price * (1 - stopPct),
        time1: pt.time,
        time2: pt.time + step * 25,
        color: drawingColor,
      };
      saveDrawings([...drawings, newRR]);
      setActiveTool("select");
      setSelectedId(newRR.id);
    }
  };

  const handleSVGMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const pt = getChartPoint(e);
    if (pt) {
      setMousePos({ time: pt.time, price: pt.price });
    }
  };

  const finishPath = () => {
    if (pathPoints.length >= 2) {
      const newPath: PathShape = {
        id: `path_${Date.now()}`,
        type: "path",
        points: pathPoints,
        color: drawingColor,
      };
      saveDrawings([...drawings, newPath]);
      setActiveTool("select");
      setSelectedId(newPath.id);
    }
    setPathPoints([]);
  };

  const selectedDrawing = drawings.find((d) => d.id === selectedId) || null;
  const activeCandle = hoverData || lastCandle;

  const getShapeLabel = (shape: ChartDrawing) => {
    switch (shape.type) {
      case "rectangle":
        return "⬛ Rectangle";
      case "path":
        return `✏️ Path (${shape.points.length} pts)`;
      case "trendline":
        return "📏 Trendline";
      case "ray":
        return `⚡ Ray (${fmtPx(shape.price)})`;
      case "fibonacci":
        return "🌀 Fibonacci";
      case "risk_reward": {
        const risk = Math.abs(shape.entryPrice - shape.stopLoss);
        const reward = Math.abs(shape.takeProfit - shape.entryPrice);
        const rr = risk > 0 ? (reward / risk).toFixed(2) : "—";
        return `⚖️ Position (R:R ${rr})`;
      }
      default:
        return "Drawing";
    }
  };

  const priceLadderLevels = useMemo(() => {
    if (!showPriceLadder || !activeCandle) return { asks: [], bids: [] };
    const p = activeCandle.close;
    const step = Math.max(p * 0.0005, Math.pow(10, -computedDecimals));
    const asks: Array<{ price: number; pct: string }> = [];
    const bids: Array<{ price: number; pct: string }> = [];
    for (let i = 5; i >= 1; i--) {
      const askP = p + step * i;
      const diffPct = ((askP - p) / p) * 100;
      asks.push({ price: askP, pct: `+${diffPct.toFixed(2)}%` });
    }
    for (let i = 1; i <= 5; i++) {
      const bidP = Math.max(0, p - step * i);
      const diffPct = ((p - bidP) / p) * 100;
      bids.push({ price: bidP, pct: `-${diffPct.toFixed(2)}%` });
    }
    return { asks, bids };
  }, [showPriceLadder, activeCandle, computedDecimals]);

  return (
    <div className="w-full bg-panel border border-line rounded-2xl overflow-hidden shadow-2xl flex flex-col">
      {/* Header Controls Bar */}
      <div className="px-4 py-2.5 bg-panel-soft/80 border-b border-line flex flex-wrap items-center justify-between gap-3">
        {/* Symbol, Price, & Countdown Timer Display */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-base font-bold text-text tracking-wide">
              {cleanSym}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-md bg-accent/15 text-accent font-semibold border border-accent/30">
              MEXC Futures
            </span>
            {contractLeverage != null && contractLeverage > 0 && (
              <span
                className="font-mono text-xs font-bold text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md flex items-center gap-1 shadow-xs"
                title={`Maximum Leverage: ${contractLeverage}x`}
              >
                <span>⚡</span>
                <span>Max {contractLeverage}x</span>
              </span>
            )}
            {setup?.side && (
              <span
                className={`text-xs px-2 py-0.5 rounded-md font-mono font-bold border ${
                  setup.side === "LONG"
                    ? "bg-gain/15 text-gain border-gain/30"
                    : "bg-loss/15 text-loss border-loss/30"
                }`}
              >
                {setup.side}
              </span>
            )}
            {/* Live Candle Close Countdown Timer */}
            {countdownText && (
              <span
                className="font-mono text-xs text-amber-400 font-semibold bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/25 flex items-center gap-1.5"
                title="Time remaining until active candle closes"
              >
                <span className="animate-pulse text-[10px]">⏱️</span>
                <span>{countdownText}</span>
              </span>
            )}
          </div>

          {/* Current Live Price with Real-Time Clock */}
          {activeCandle && (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-panel border border-line shadow-xs">
              <span className="text-[10px] text-muted font-bold uppercase tracking-wider">Price</span>
              <span
                className={`font-mono text-sm font-extrabold ${
                  activeCandle.close >= activeCandle.open ? "text-gain" : "text-loss"
                }`}
              >
                ${activeCandle.close.toLocaleString("en-US", {
                  minimumFractionDigits: Math.min(computedDecimals, 2),
                  maximumFractionDigits: computedDecimals,
                })}
              </span>
              <span className="flex items-center gap-1 text-[11px] font-mono text-muted border-l border-line/60 pl-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>{liveClockTime}</span>
              </span>
            </div>
          )}

          {activeCandle && (
            <div className="hidden xl:flex items-center gap-3 font-mono text-xs text-muted border-l border-line pl-3">
              {hoverData && (
                <span className="text-accent font-semibold flex items-center gap-1">
                  <span>🕒</span>
                  <span>
                    {new Date(Number(hoverData.time) * 1000).toLocaleTimeString("en-US", {
                      hour12: false,
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                </span>
              )}
              <span>
                O: <strong className="text-text">{activeCandle.open.toLocaleString("en-US", { maximumFractionDigits: computedDecimals })}</strong>
              </span>
              <span>
                H: <strong className="text-gain">{activeCandle.high.toLocaleString("en-US", { maximumFractionDigits: computedDecimals })}</strong>
              </span>
              <span>
                L: <strong className="text-loss">{activeCandle.low.toLocaleString("en-US", { maximumFractionDigits: computedDecimals })}</strong>
              </span>
              <span>
                C:{" "}
                <strong
                  className={
                    activeCandle.close >= activeCandle.open
                      ? "text-gain"
                      : "text-loss"
                  }
                >
                  {activeCandle.close.toLocaleString("en-US", { maximumFractionDigits: computedDecimals })}
                </strong>
              </span>
            </div>
          )}
        </div>

        {/* Toolbar: EMAs, Drawing Tools, Colors, Timeframes, Snapshot */}
        <div className="flex flex-wrap items-center gap-2">
          {/* User Specification: 20, 50, 100, 200 EMAs (thin to thickest, white/blue/yellow/orange) */}
          <div className="flex items-center bg-panel p-1 rounded-lg border border-line gap-1">
            {/* EMA 20 */}
            <button
              onClick={() => setActiveEmas((prev) => ({ ...prev, ema20: !prev.ema20 }))}
              className={`px-2 py-1 text-xs font-mono font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                activeEmas.ema20
                  ? "bg-white/10 text-white border border-white/40 shadow-xs"
                  : "text-muted hover:text-text opacity-60"
              }`}
              title="Toggle EMA 20 (Thin White Line)"
            >
              <span className="w-2 h-2 rounded-full bg-white shadow-xs" />
              <span>20</span>
            </button>

            {/* EMA 50 */}
            <button
              onClick={() => setActiveEmas((prev) => ({ ...prev, ema50: !prev.ema50 }))}
              className={`px-2 py-1 text-xs font-mono font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                activeEmas.ema50
                  ? "bg-blue-500/15 text-blue-400 border border-blue-500/40 shadow-xs"
                  : "text-muted hover:text-text opacity-60"
              }`}
              title="Toggle EMA 50 (Blue Line)"
            >
              <span className="w-2 h-2 rounded-full bg-blue-500 shadow-xs" />
              <span>50</span>
            </button>

            {/* EMA 100 */}
            <button
              onClick={() => setActiveEmas((prev) => ({ ...prev, ema100: !prev.ema100 }))}
              className={`px-2 py-1 text-xs font-mono font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                activeEmas.ema100
                  ? "bg-yellow-500/15 text-yellow-400 border border-yellow-500/40 shadow-xs"
                  : "text-muted hover:text-text opacity-60"
              }`}
              title="Toggle EMA 100 (Thick Yellow Line)"
            >
              <span className="w-2 h-2 rounded-full bg-yellow-500 shadow-xs" />
              <span>100</span>
            </button>

            {/* EMA 200 */}
            <button
              onClick={() => setActiveEmas((prev) => ({ ...prev, ema200: !prev.ema200 }))}
              className={`px-2 py-1 text-xs font-mono font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                activeEmas.ema200
                  ? "bg-orange-500/15 text-orange-400 border border-orange-500/40 shadow-xs"
                  : "text-muted hover:text-text opacity-60"
              }`}
              title="Toggle EMA 200 (Thickest Orange Line)"
            >
              <span className="w-2 h-2 rounded-full bg-orange-500 shadow-xs" />
              <span>200</span>
            </button>
          </div>

          {/* Custom Formula & PineScript Indicator Studio */}
          <button
            onClick={() => setIsScriptModalOpen(true)}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-all flex items-center gap-1.5 ${
              customPlots.length > 0
                ? "bg-accent/20 text-accent font-bold border-accent/40 shadow-xs"
                : "bg-panel border-line text-muted hover:text-text hover:bg-panel-soft"
            }`}
            title="Custom Formula & Indicator Studio (PineScript-equivalent)"
          >
            <span>📜</span>
            <span>Script</span>
            {customPlots.length > 0 && (
              <span className="px-1.5 py-0.2 bg-accent text-white text-[10px] rounded-full font-bold">
                {customPlots.length}
              </span>
            )}
          </button>

          {/* Drawing Tools Selector Bar */}
          <div className="flex items-center bg-panel p-1 rounded-lg border border-line gap-1">
            <button
              onClick={() => {
                setActiveTool("select");
                setRectStart(null);
                setTrendlineStart(null);
                setFibStart(null);
                setPathPoints([]);
              }}
              className={`px-2 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${
                activeTool === "select"
                  ? "bg-accent/20 text-accent font-bold border border-accent/40 shadow-xs"
                  : "text-muted hover:text-text"
              }`}
              title="Select / Pan Mode"
            >
              <span>🖐️ Pan</span>
            </button>

            <button
              onClick={() => {
                setActiveTool("rectangle");
                setPathPoints([]);
                setTrendlineStart(null);
                setFibStart(null);
              }}
              className={`px-2 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${
                activeTool === "rectangle"
                  ? "bg-accent/20 text-accent font-bold border border-accent/40 shadow-xs"
                  : "text-muted hover:text-text"
              }`}
              title="Draw Rectangle Support/Demand Zone"
            >
              <span>⬛ Rect</span>
            </button>

            <button
              onClick={() => {
                setActiveTool("path");
                setRectStart(null);
                setTrendlineStart(null);
                setFibStart(null);
              }}
              className={`px-2 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${
                activeTool === "path"
                  ? "bg-accent/20 text-accent font-bold border border-accent/40 shadow-xs"
                  : "text-muted hover:text-text"
              }`}
              title="Draw Multi-Point Path / Wave Line"
            >
              <span>✏️ Path</span>
            </button>

            <button
              onClick={() => {
                setActiveTool("trendline");
                setRectStart(null);
                setFibStart(null);
                setPathPoints([]);
              }}
              className={`px-2 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${
                activeTool === "trendline"
                  ? "bg-accent/20 text-accent font-bold border border-accent/40 shadow-xs"
                  : "text-muted hover:text-text"
              }`}
              title="Draw Angled Trendline"
            >
              <span>📏 Trend</span>
            </button>

            <button
              onClick={() => {
                setActiveTool("ray");
                setRectStart(null);
                setTrendlineStart(null);
                setFibStart(null);
                setPathPoints([]);
              }}
              className={`px-2 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${
                activeTool === "ray"
                  ? "bg-accent/20 text-accent font-bold border border-accent/40 shadow-xs"
                  : "text-muted hover:text-text"
              }`}
              title="Click to drop Horizontal Support/Resistance Ray"
            >
              <span>⚡ Ray</span>
            </button>

            <button
              onClick={() => {
                setActiveTool("fibonacci");
                setRectStart(null);
                setTrendlineStart(null);
                setPathPoints([]);
              }}
              className={`px-2 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${
                activeTool === "fibonacci"
                  ? "bg-accent/20 text-accent font-bold border border-accent/40 shadow-xs"
                  : "text-muted hover:text-text"
              }`}
              title="Draw Fibonacci Retracement (Golden Pocket 0.618)"
            >
              <span>🌀 Fib</span>
            </button>

            <button
              onClick={() => {
                setActiveTool("risk_reward");
                setRectStart(null);
                setTrendlineStart(null);
                setFibStart(null);
                setPathPoints([]);
              }}
              className={`px-2 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${
                activeTool === "risk_reward"
                  ? "bg-accent/20 text-accent font-bold border border-accent/40 shadow-xs"
                  : "text-muted hover:text-text"
              }`}
              title="Click to place Long/Short Position Box with Risk-to-Reward ratio"
            >
              <span>⚖️ R:R</span>
            </button>
          </div>

          {/* Drawing Colors Swatch */}
          {activeTool !== "select" && (
            <div className="flex items-center gap-1 bg-panel p-1 rounded-lg border border-line">
              {DRAWING_COLORS.map((c) => (
                <button
                  key={c.hex}
                  onClick={() => setDrawingColor(c.hex)}
                  className={`w-4 h-4 rounded-full transition-transform ${
                    drawingColor === c.hex ? "scale-125 ring-2 ring-white" : "opacity-70 hover:opacity-100"
                  }`}
                  style={{ backgroundColor: c.hex }}
                  title={c.label}
                />
              ))}
            </div>
          )}

          {/* Finish Path button when drafting path */}
          {pathPoints.length >= 2 && (
            <button
              onClick={finishPath}
              className="accent-btn px-2.5 py-1 text-xs font-bold"
            >
              Finish Path ({pathPoints.length})
            </button>
          )}

          {/* Clear Drawings Button */}
          {drawings.length > 0 && (
            <button
              onClick={clearAllDrawings}
              className="px-2 py-1 text-xs font-medium bg-panel text-muted hover:text-loss border border-line hover:border-loss/40 rounded-lg transition-colors"
              title="Clear all drawing shapes for this symbol"
            >
              🗑️ Clear ({drawings.length})
            </button>
          )}

          {showOverlayToggle && setup && (
            <label className="flex items-center gap-1.5 text-xs text-text cursor-pointer bg-panel px-2.5 py-1 rounded-lg border border-line hover:bg-panel-soft transition-colors">
              <input
                type="checkbox"
                checked={showSetup}
                onChange={(e) => setShowSetup(e.target.checked)}
                className="rounded border-line text-accent focus:ring-accent bg-panel-soft"
              />
              <span className="font-medium text-text">Setup Overlay</span>
            </label>
          )}

          {/* Timeframe Buttons */}
          <div className="flex items-center bg-panel p-1 rounded-lg border border-line">
            {INTERVALS.map((tf) => (
              <button
                key={tf.value}
                onClick={() => {
                  isFirstLoadRef.current = true;
                  setKlineInterval(tf.value);
                }}
                className={`px-2.5 py-1 text-xs font-mono font-medium rounded-md transition-all ${
                  klineInterval === tf.value
                    ? "bg-accent text-white font-bold shadow-xs"
                    : "text-muted hover:text-text hover:bg-panel-soft"
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>

          {/* Decimal Precision Selector */}
          <div className="flex items-center bg-panel p-1 rounded-lg border border-line text-xs font-mono" title="Set right-side price scale decimal precision">
            <span className="text-[10px] text-muted px-1 uppercase font-sans font-semibold">Dec:</span>
            {(["auto", 2, 4, 6, 8] as const).map((dec) => (
              <button
                key={String(dec)}
                type="button"
                onClick={() => setDecimalPrecisionMode(dec)}
                className={`px-1.5 py-0.5 text-[11px] rounded transition-all ${
                  decimalPrecisionMode === dec
                    ? "bg-accent text-white font-bold shadow-xs"
                    : "text-muted hover:text-text hover:bg-panel-soft"
                }`}
              >
                {dec === "auto" ? "Auto" : `.${dec}`}
              </button>
            ))}
          </div>

          {/* Toggle Right-Side Price Ladder */}
          <button
            type="button"
            onClick={() => setShowPriceLadder((prev) => !prev)}
            className={`px-2 py-1 text-xs font-medium rounded-lg border transition-all flex items-center gap-1 ${
              showPriceLadder
                ? "bg-accent/20 text-accent font-bold border-accent/40 shadow-xs"
                : "bg-panel border-line text-muted hover:text-text hover:bg-panel-soft"
            }`}
            title="Toggle Right-Side High-Precision Price Ladder"
          >
            <span>📊</span>
            <span className="hidden sm:inline">Ladder</span>
          </button>

          {/* Snapshot Camera Export Button */}
          <button
            onClick={captureSnapshot}
            disabled={isCapturing}
            title="Download Chart Snapshot (PNG)"
            className="p-1.5 text-muted hover:text-text bg-panel border border-line hover:bg-panel-soft rounded-lg transition-colors disabled:opacity-50"
          >
            {isCapturing ? (
              <svg className="w-3.5 h-3.5 animate-spin text-accent" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <span className="text-xs">📸</span>
            )}
          </button>

          {/* Refresh Button */}
          <button
            onClick={() => fetchCandles(false)}
            disabled={loading}
            title="Refresh Chart"
            className="p-1.5 text-muted hover:text-text bg-panel border border-line hover:bg-panel-soft rounded-lg transition-colors disabled:opacity-50"
          >
            <svg
              className={`w-3.5 h-3.5 ${loading ? "animate-spin text-accent" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Chart Canvas & Price Ladder Flex Container */}
      <div className="relative w-full flex-1 min-h-[300px] flex">
        <div className="relative flex-1 h-full min-w-0">
        {loading && (
          <div className="absolute inset-0 bg-paper/60 backdrop-blur-xs z-10 flex items-center justify-center">
            <div className="flex items-center gap-3 bg-panel px-4 py-2.5 rounded-xl border border-line shadow-xl">
              <svg
                className="w-5 h-5 animate-spin text-accent"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span className="text-xs font-mono text-muted">
                Loading {cleanSym} Candlesticks...
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 bg-panel/95 z-20 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-loss/15 border border-loss/30 text-loss flex items-center justify-center mb-3 text-xl">
              ⚠️
            </div>
            <h4 className="text-sm font-bold text-text mb-1">Chart Data Unavailable</h4>
            <p className="text-xs text-muted max-w-sm mb-4">{error}</p>
            <button
              onClick={() => fetchCandles(false)}
              className="accent-btn px-4 py-1.5 text-xs font-semibold"
            >
              Retry Connection
            </button>
          </div>
        )}

        {/* Lightweight-charts Canvas Container */}
        <div ref={chartContainerRef} className="w-full h-full" />

        {/* Floating TradingView-style Action Bar for Selected Drawing */}
        {selectedDrawing && activeTool === "select" && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-panel/95 backdrop-blur-md border border-line px-3 py-1.5 rounded-xl shadow-2xl animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="flex items-center gap-1.5 pr-2 text-xs font-bold font-mono text-text border-r border-line">
              <span>{getShapeLabel(selectedDrawing)}</span>
            </div>

            {/* Quick Color Swatch */}
            <div className="flex items-center gap-1.5 px-1">
              {DRAWING_COLORS.map((c) => (
                <button
                  key={c.hex}
                  onClick={(e) => {
                    e.stopPropagation();
                    updateSelectedColor(c.hex);
                  }}
                  className={`w-4 h-4 rounded-full transition-transform ${
                    selectedDrawing.color === c.hex ? "scale-125 ring-2 ring-white" : "opacity-70 hover:opacity-100"
                  }`}
                  style={{ backgroundColor: c.hex }}
                  title={c.label}
                />
              ))}
            </div>

            <div className="h-4 w-px bg-line" />

            {/* Duplicate Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                duplicateSelectedDrawing();
              }}
              className="p-1.5 text-muted hover:text-text hover:bg-panel-soft rounded-lg transition-colors"
              title="Duplicate Shape"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>

            {/* Delete Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteSelectedDrawing();
              }}
              className="p-1.5 text-muted hover:text-loss hover:bg-loss/15 rounded-lg transition-colors"
              title="Delete Shape (Delete or Backspace)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>

            {/* Deselect / Close */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedId(null);
              }}
              className="p-1.5 text-muted hover:text-text hover:bg-panel-soft rounded-lg transition-colors ml-0.5"
              title="Deselect (Escape)"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* SVG Drawing Overlay Layer */}
        <div
          onClick={handleSVGClick}
          onMouseMove={handleSVGMouseMove}
          onDoubleClick={finishPath}
          className={`absolute inset-0 z-10 overflow-hidden ${
            activeTool !== "select" ? "cursor-crosshair pointer-events-auto" : "pointer-events-none"
          }`}
        >
          <svg className="w-full h-full pointer-events-none">
            {drawings.map((shape) => {
              // 1. Rectangle
              if (shape.type === "rectangle") {
                const c1 = toPixelCoords(shape.time1, shape.price1);
                const c2 = toPixelCoords(shape.time2, shape.price1);
                const c3 = toPixelCoords(shape.time2, shape.price2);
                const c4 = toPixelCoords(shape.time1, shape.price2);
                if (!c1 && !c2 && !c3 && !c4) return null;

                const validX = [c1?.x, c2?.x, c3?.x, c4?.x].filter((v): v is number => v != null);
                const validY = [c1?.y, c2?.y, c3?.y, c4?.y].filter((v): v is number => v != null);
                if (validX.length === 0 || validY.length === 0) return null;

                const minX = Math.min(...validX);
                const maxX = Math.max(...validX);
                const minY = Math.min(...validY);
                const maxY = Math.max(...validY);
                const width = Math.max(maxX - minX, 6);
                const height = Math.max(maxY - minY, 6);

                const isSelected = shape.id === selectedId;

                return (
                  <g key={shape.id}>
                    {/* Rectangle Fill & Border */}
                    <rect
                      x={minX}
                      y={minY}
                      width={width}
                      height={height}
                      fill={shape.color}
                      fillOpacity={isSelected ? 0.35 : 0.2}
                      stroke={shape.color}
                      strokeWidth={isSelected ? 2.5 : 1.5}
                      strokeDasharray={isSelected ? undefined : "4 2"}
                      rx={3}
                      className={
                        activeTool === "select"
                          ? isSelected
                            ? "cursor-move pointer-events-auto"
                            : "cursor-pointer pointer-events-auto hover:stroke-white"
                          : "pointer-events-none"
                      }
                      onMouseDown={(e) => {
                        if (activeTool !== "select") return;
                        e.stopPropagation();
                        setSelectedId(shape.id);
                        const pt = getChartPoint(e);
                        if (pt) {
                          setDragState({
                            mode: "move_shape",
                            shapeId: shape.id,
                            startPoint: { time: pt.time, price: pt.price },
                            initialShape: shape,
                          });
                        }
                      }}
                    />

                    {/* 4 Corner Resize Handles when Selected */}
                    {isSelected && activeTool === "select" && (
                      <>
                        {/* c1 (NW) - Anchor is SE (time2, price2) */}
                        <circle
                          cx={minX}
                          cy={minY}
                          r={5.5}
                          fill="#ffffff"
                          stroke={shape.color}
                          strokeWidth={2}
                          className="cursor-nwse-resize pointer-events-auto shadow-md hover:stroke-white hover:fill-amber-300 transition-colors"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDragState({
                              mode: "rect_corner",
                              shapeId: shape.id,
                              corner: "c1",
                              anchorTime: shape.time2,
                              anchorPrice: shape.price2,
                              initialShape: shape,
                            });
                          }}
                        />
                        {/* c2 (NE) - Anchor is SW (time1, price2) */}
                        <circle
                          cx={maxX}
                          cy={minY}
                          r={5.5}
                          fill="#ffffff"
                          stroke={shape.color}
                          strokeWidth={2}
                          className="cursor-nesw-resize pointer-events-auto shadow-md hover:stroke-white hover:fill-amber-300 transition-colors"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDragState({
                              mode: "rect_corner",
                              shapeId: shape.id,
                              corner: "c2",
                              anchorTime: shape.time1,
                              anchorPrice: shape.price2,
                              initialShape: shape,
                            });
                          }}
                        />
                        {/* c3 (SE) - Anchor is NW (time1, price1) */}
                        <circle
                          cx={maxX}
                          cy={maxY}
                          r={5.5}
                          fill="#ffffff"
                          stroke={shape.color}
                          strokeWidth={2}
                          className="cursor-nwse-resize pointer-events-auto shadow-md hover:stroke-white hover:fill-amber-300 transition-colors"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDragState({
                              mode: "rect_corner",
                              shapeId: shape.id,
                              corner: "c3",
                              anchorTime: shape.time1,
                              anchorPrice: shape.price1,
                              initialShape: shape,
                            });
                          }}
                        />
                        {/* c4 (SW) - Anchor is NE (time2, price1) */}
                        <circle
                          cx={minX}
                          cy={maxY}
                          r={5.5}
                          fill="#ffffff"
                          stroke={shape.color}
                          strokeWidth={2}
                          className="cursor-nesw-resize pointer-events-auto shadow-md hover:stroke-white hover:fill-amber-300 transition-colors"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDragState({
                              mode: "rect_corner",
                              shapeId: shape.id,
                              corner: "c4",
                              anchorTime: shape.time2,
                              anchorPrice: shape.price1,
                              initialShape: shape,
                            });
                          }}
                        />

                        {/* 4 Edge Midpoint Handles for Single-Axis Resizing */}
                        {/* Top Edge Handle */}
                        <circle
                          cx={minX + width / 2}
                          cy={minY}
                          r={4.5}
                          fill="#ffffff"
                          stroke={shape.color}
                          strokeWidth={1.5}
                          className="cursor-ns-resize pointer-events-auto shadow-xs hover:stroke-white hover:fill-amber-300 transition-colors"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDragState({
                              mode: "rect_edge",
                              shapeId: shape.id,
                              edge: "top",
                              initialShape: shape,
                            });
                          }}
                        />
                        {/* Bottom Edge Handle */}
                        <circle
                          cx={minX + width / 2}
                          cy={maxY}
                          r={4.5}
                          fill="#ffffff"
                          stroke={shape.color}
                          strokeWidth={1.5}
                          className="cursor-ns-resize pointer-events-auto shadow-xs hover:stroke-white hover:fill-amber-300 transition-colors"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDragState({
                              mode: "rect_edge",
                              shapeId: shape.id,
                              edge: "bottom",
                              initialShape: shape,
                            });
                          }}
                        />
                        {/* Left Edge Handle */}
                        <circle
                          cx={minX}
                          cy={minY + height / 2}
                          r={4.5}
                          fill="#ffffff"
                          stroke={shape.color}
                          strokeWidth={1.5}
                          className="cursor-ew-resize pointer-events-auto shadow-xs hover:stroke-white hover:fill-amber-300 transition-colors"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDragState({
                              mode: "rect_edge",
                              shapeId: shape.id,
                              edge: "left",
                              initialShape: shape,
                            });
                          }}
                        />
                        {/* Right Edge Handle */}
                        <circle
                          cx={maxX}
                          cy={minY + height / 2}
                          r={4.5}
                          fill="#ffffff"
                          stroke={shape.color}
                          strokeWidth={1.5}
                          className="cursor-ew-resize pointer-events-auto shadow-xs hover:stroke-white hover:fill-amber-300 transition-colors"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDragState({
                              mode: "rect_edge",
                              shapeId: shape.id,
                              edge: "right",
                              initialShape: shape,
                            });
                          }}
                        />
                      </>
                    )}
                  </g>
                );
              }

              // 2. Path (Multi-Point)
              if (shape.type === "path") {
                const rawPx = shape.points.map((pt) => toPixelCoords(pt.time, pt.price));
                const pxPoints = rawPx.filter(
                  (p): p is { x: number; y: number } => p !== null
                );

                if (pxPoints.length < 2) return null;

                const pointsStr = pxPoints.map((p) => `${p.x},${p.y}`).join(" ");
                const isSelected = shape.id === selectedId;

                return (
                  <g key={shape.id}>
                    <polyline
                      points={pointsStr}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={16}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={
                        activeTool === "select"
                          ? isSelected
                            ? "cursor-move pointer-events-auto"
                            : "cursor-pointer pointer-events-auto"
                          : "pointer-events-none"
                      }
                      onMouseDown={(e) => {
                        if (activeTool !== "select") return;
                        e.stopPropagation();
                        setSelectedId(shape.id);
                        const pt = getChartPoint(e);
                        if (pt) {
                          setDragState({
                            mode: "move_shape",
                            shapeId: shape.id,
                            startPoint: { time: pt.time, price: pt.price },
                            initialShape: shape,
                          });
                        }
                      }}
                    />
                    <polyline
                      points={pointsStr}
                      fill="none"
                      stroke={shape.color}
                      strokeWidth={isSelected ? 3.5 : 2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="pointer-events-none"
                    />
                    {shape.points.map((pt, origIdx) => {
                      const p = toPixelCoords(pt.time, pt.price);
                      if (!p) return null;
                      return (
                        <circle
                          key={origIdx}
                          cx={p.x}
                          cy={p.y}
                          r={isSelected ? 6 : 3}
                          fill={isSelected ? "#ffffff" : shape.color}
                          stroke={shape.color}
                          strokeWidth={isSelected ? 2.5 : 1}
                          className={
                            isSelected && activeTool === "select"
                              ? "cursor-move pointer-events-auto shadow-md hover:stroke-white hover:fill-amber-300 transition-colors"
                              : "pointer-events-none"
                          }
                          onMouseDown={(e) => {
                            if (!isSelected || activeTool !== "select") return;
                            e.stopPropagation();
                            setDragState({
                              mode: "path_vertex",
                              shapeId: shape.id,
                              pointIndex: origIdx,
                              initialShape: shape,
                            });
                          }}
                        />
                      );
                    })}
                  </g>
                );
              }

              // 3. Trendline
              if (shape.type === "trendline") {
                const p1 = toPixelCoords(shape.time1, shape.price1);
                const p2 = toPixelCoords(shape.time2, shape.price2);
                if (!p1 || !p2) return null;

                const isSelected = shape.id === selectedId;

                return (
                  <g key={shape.id}>
                    <line
                      x1={p1.x}
                      y1={p1.y}
                      x2={p2.x}
                      y2={p2.y}
                      stroke="transparent"
                      strokeWidth={16}
                      strokeLinecap="round"
                      className={
                        activeTool === "select"
                          ? isSelected
                            ? "cursor-move pointer-events-auto"
                            : "cursor-pointer pointer-events-auto"
                          : "pointer-events-none"
                      }
                      onMouseDown={(e) => {
                        if (activeTool !== "select") return;
                        e.stopPropagation();
                        setSelectedId(shape.id);
                        const pt = getChartPoint(e);
                        if (pt) {
                          setDragState({
                            mode: "move_shape",
                            shapeId: shape.id,
                            startPoint: { time: pt.time, price: pt.price },
                            initialShape: shape,
                          });
                        }
                      }}
                    />
                    <line
                      x1={p1.x}
                      y1={p1.y}
                      x2={p2.x}
                      y2={p2.y}
                      stroke={shape.color}
                      strokeWidth={isSelected ? 3 : 2}
                      strokeLinecap="round"
                      className="pointer-events-none"
                    />
                    {isSelected && activeTool === "select" ? (
                      <>
                        <circle
                          cx={p1.x}
                          cy={p1.y}
                          r={5}
                          fill="#ffffff"
                          stroke={shape.color}
                          strokeWidth={2}
                          className="cursor-move pointer-events-auto shadow-md hover:stroke-white hover:fill-amber-300 transition-colors"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDragState({
                              mode: "trendline_endpoint",
                              shapeId: shape.id,
                              endpoint: "p1",
                              initialShape: shape,
                            });
                          }}
                        />
                        <circle
                          cx={p2.x}
                          cy={p2.y}
                          r={5}
                          fill="#ffffff"
                          stroke={shape.color}
                          strokeWidth={2}
                          className="cursor-move pointer-events-auto shadow-md hover:stroke-white hover:fill-amber-300 transition-colors"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDragState({
                              mode: "trendline_endpoint",
                              shapeId: shape.id,
                              endpoint: "p2",
                              initialShape: shape,
                            });
                          }}
                        />
                      </>
                    ) : (
                      <>
                        <circle cx={p1.x} cy={p1.y} r={3} fill={shape.color} />
                        <circle cx={p2.x} cy={p2.y} r={3} fill={shape.color} />
                      </>
                    )}
                  </g>
                );
              }

              // 4. Horizontal Ray
              if (shape.type === "ray") {
                if (!chartContainerRef.current) return null;
                const y = safePriceToCoordinate(shape.price);
                if (y === null) return null;

                const isSelected = shape.id === selectedId;
                const width = chartContainerRef.current.clientWidth;

                return (
                  <g key={shape.id}>
                    <line
                      x1={0}
                      y1={y}
                      x2={width}
                      y2={y}
                      stroke="transparent"
                      strokeWidth={16}
                      className={
                        activeTool === "select"
                          ? "cursor-ns-resize pointer-events-auto"
                          : "pointer-events-none"
                      }
                      onMouseDown={(e) => {
                        if (activeTool !== "select") return;
                        e.stopPropagation();
                        setSelectedId(shape.id);
                        setDragState({
                          mode: "ray_price",
                          shapeId: shape.id,
                          initialShape: shape,
                        });
                      }}
                    />
                    <line
                      x1={0}
                      y1={y}
                      x2={width}
                      y2={y}
                      stroke={shape.color}
                      strokeWidth={isSelected ? 2.5 : 1.5}
                      strokeDasharray={isSelected ? undefined : "6 3"}
                      className="pointer-events-none"
                    />
                    <g transform={`translate(${width - 80}, ${y - 10})`}>
                      <rect
                        width={75}
                        height={20}
                        rx={4}
                        fill={shape.color}
                        className="pointer-events-none shadow-md"
                      />
                      <text
                        x={37.5}
                        y={14}
                        textAnchor="middle"
                        fill="#0c0a17"
                        fontSize={10}
                        fontWeight="bold"
                        fontFamily="monospace"
                        className="pointer-events-none"
                      >
                        {fmtPx(shape.price)}
                      </text>
                    </g>
                  </g>
                );
              }

              // 5. Fibonacci Retracement
              if (shape.type === "fibonacci") {
                const p1 = toPixelCoords(shape.time1, shape.price1);
                const p2 = toPixelCoords(shape.time2, shape.price2);
                if (!p1 || !p2 || !chartContainerRef.current) return null;

                const minX = Math.min(p1.x, p2.x);
                const width = chartContainerRef.current.clientWidth - minX;
                const isSelected = shape.id === selectedId;
                const priceRange = shape.price2 - shape.price1;

                return (
                  <g key={shape.id}>
                    {FIB_LEVELS.map((fib) => {
                      const levelPrice = shape.price1 + priceRange * fib.level;
                      const y = safePriceToCoordinate(levelPrice);
                      if (y === null) return null;

                      return (
                        <g key={fib.level}>
                          <line
                            x1={minX}
                            y1={y}
                            x2={minX + width}
                            y2={y}
                            stroke={fib.color}
                            strokeWidth={fib.level === 0.618 ? 2 : 1}
                            strokeDasharray={fib.level === 0 || fib.level === 1 ? undefined : "3 3"}
                            className="pointer-events-none opacity-80"
                          />
                          <text
                            x={minX + 6}
                            y={y - 4}
                            fill={fib.color}
                            fontSize={10}
                            fontWeight={fib.level === 0.618 ? "bold" : "normal"}
                            fontFamily="monospace"
                            className="pointer-events-none"
                          >
                            {fib.label} ({fmtPx(levelPrice)})
                          </text>
                        </g>
                      );
                    })}

                    <line
                      x1={p1.x}
                      y1={p1.y}
                      x2={p2.x}
                      y2={p2.y}
                      stroke="rgba(255, 255, 255, 0.4)"
                      strokeWidth={1}
                      strokeDasharray="4 4"
                      className="pointer-events-none"
                    />

                    <line
                      x1={p1.x}
                      y1={p1.y}
                      x2={p2.x}
                      y2={p2.y}
                      stroke="transparent"
                      strokeWidth={20}
                      className={
                        activeTool === "select"
                          ? "cursor-move pointer-events-auto"
                          : "pointer-events-none"
                      }
                      onMouseDown={(e) => {
                        if (activeTool !== "select") return;
                        e.stopPropagation();
                        setSelectedId(shape.id);
                        const pt = getChartPoint(e);
                        if (pt) {
                          setDragState({
                            mode: "move_shape",
                            shapeId: shape.id,
                            startPoint: { time: pt.time, price: pt.price },
                            initialShape: shape,
                          });
                        }
                      }}
                    />

                    {isSelected && activeTool === "select" && (
                      <>
                        <circle
                          cx={p1.x}
                          cy={p1.y}
                          r={6}
                          fill="#ffffff"
                          stroke="#f59e0b"
                          strokeWidth={2}
                          className="cursor-move pointer-events-auto shadow-md hover:stroke-white hover:fill-amber-300 transition-colors"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDragState({
                              mode: "fib_endpoint",
                              shapeId: shape.id,
                              endpoint: "p1",
                              initialShape: shape,
                            });
                          }}
                        />
                        <circle
                          cx={p2.x}
                          cy={p2.y}
                          r={6}
                          fill="#ffffff"
                          stroke="#f59e0b"
                          strokeWidth={2}
                          className="cursor-move pointer-events-auto shadow-md hover:stroke-white hover:fill-amber-300 transition-colors"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDragState({
                              mode: "fib_endpoint",
                              shapeId: shape.id,
                              endpoint: "p2",
                              initialShape: shape,
                            });
                          }}
                        />
                      </>
                    )}
                  </g>
                );
              }

              // 6. Risk-Reward Position Box
              if (shape.type === "risk_reward") {
                const pEntry = toPixelCoords(shape.time1, shape.entryPrice);
                const pTP = toPixelCoords(shape.time1, shape.takeProfit);
                const pSL = toPixelCoords(shape.time1, shape.stopLoss);
                const pRight = toPixelCoords(shape.time2, shape.entryPrice);
                if (!pEntry || !pTP || !pSL || !pRight) return null;

                const leftX = pEntry.x;
                const rightX = pRight.x;
                const width = Math.max(rightX - leftX, 24);

                const topTP = Math.min(pEntry.y, pTP.y);
                const heightTP = Math.max(Math.abs(pEntry.y - pTP.y), 4);

                const topSL = Math.min(pEntry.y, pSL.y);
                const heightSL = Math.max(Math.abs(pEntry.y - pSL.y), 4);

                const risk = Math.abs(shape.entryPrice - shape.stopLoss);
                const reward = Math.abs(shape.takeProfit - shape.entryPrice);
                const rr = risk > 0 ? (reward / risk).toFixed(2) : "—";
                const isSelected = shape.id === selectedId;

                return (
                  <g key={shape.id}>
                    {/* Target (Profit) Zone - Green */}
                    <rect
                      x={leftX}
                      y={topTP}
                      width={width}
                      height={heightTP}
                      fill="rgba(52, 211, 153, 0.2)"
                      stroke="#34d399"
                      strokeWidth={1.5}
                      className={
                        activeTool === "select"
                          ? "cursor-move pointer-events-auto"
                          : "pointer-events-none"
                      }
                      onMouseDown={(e) => {
                        if (activeTool !== "select") return;
                        e.stopPropagation();
                        setSelectedId(shape.id);
                        const pt = getChartPoint(e);
                        if (pt) {
                          setDragState({
                            mode: "move_shape",
                            shapeId: shape.id,
                            startPoint: { time: pt.time, price: pt.price },
                            initialShape: shape,
                          });
                        }
                      }}
                    />

                    {/* Stop (Risk) Zone - Red */}
                    <rect
                      x={leftX}
                      y={topSL}
                      width={width}
                      height={heightSL}
                      fill="rgba(251, 113, 133, 0.2)"
                      stroke="#fb7185"
                      strokeWidth={1.5}
                      className={
                        activeTool === "select"
                          ? "cursor-move pointer-events-auto"
                          : "pointer-events-none"
                      }
                      onMouseDown={(e) => {
                        if (activeTool !== "select") return;
                        e.stopPropagation();
                        setSelectedId(shape.id);
                        const pt = getChartPoint(e);
                        if (pt) {
                          setDragState({
                            mode: "move_shape",
                            shapeId: shape.id,
                            startPoint: { time: pt.time, price: pt.price },
                            initialShape: shape,
                          });
                        }
                      }}
                    />

                    {/* Entry Line - Center */}
                    <line
                      x1={leftX}
                      y1={pEntry.y}
                      x2={leftX + width}
                      y2={pEntry.y}
                      stroke="#94a3b8"
                      strokeWidth={2}
                      strokeDasharray="4 2"
                      className="pointer-events-none"
                    />

                    {/* Center R:R Badge */}
                    <g transform={`translate(${leftX + width / 2 - 45}, ${pEntry.y - 12})`}>
                      <rect
                        width={90}
                        height={24}
                        rx={6}
                        fill="#0c0a17"
                        stroke="#94a3b8"
                        strokeWidth={1}
                        className="pointer-events-none shadow-md"
                      />
                      <text
                        x={45}
                        y={16}
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize={11}
                        fontWeight="bold"
                        fontFamily="monospace"
                        className="pointer-events-none"
                      >
                        R:R {rr}
                      </text>
                    </g>

                    {/* Drag Handles when Selected */}
                    {isSelected && activeTool === "select" && (
                      <>
                        <circle
                          cx={leftX + width / 2}
                          cy={pTP.y}
                          r={6}
                          fill="#ffffff"
                          stroke="#34d399"
                          strokeWidth={2}
                          className="cursor-ns-resize pointer-events-auto shadow-md hover:stroke-white hover:fill-amber-300 transition-colors"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDragState({
                              mode: "rr_handle",
                              shapeId: shape.id,
                              handle: "tp",
                              initialShape: shape,
                            });
                          }}
                        />
                        <circle
                          cx={leftX + width / 2}
                          cy={pSL.y}
                          r={6}
                          fill="#ffffff"
                          stroke="#fb7185"
                          strokeWidth={2}
                          className="cursor-ns-resize pointer-events-auto shadow-md hover:stroke-white hover:fill-amber-300 transition-colors"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDragState({
                              mode: "rr_handle",
                              shapeId: shape.id,
                              handle: "sl",
                              initialShape: shape,
                            });
                          }}
                        />
                        <circle
                          cx={rightX}
                          cy={pEntry.y}
                          r={6}
                          fill="#ffffff"
                          stroke="#94a3b8"
                          strokeWidth={2}
                          className="cursor-ew-resize pointer-events-auto shadow-md hover:stroke-white hover:fill-amber-300 transition-colors"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDragState({
                              mode: "rr_handle",
                              shapeId: shape.id,
                              handle: "right",
                              initialShape: shape,
                            });
                          }}
                        />
                      </>
                    )}
                  </g>
                );
              }

              return null;
            })}

            {/* Render Drafting Rectangle Preview */}
            {activeTool === "rectangle" && rectStart && mousePos && (
              (() => {
                const p1 = toPixelCoords(rectStart.time, rectStart.price);
                const p2 = toPixelCoords(mousePos.time, mousePos.price);
                if (!p1 || !p2) return null;

                const minX = Math.min(p1.x, p2.x);
                const maxX = Math.max(p1.x, p2.x);
                const minY = Math.min(p1.y, p2.y);
                const maxY = Math.max(p1.y, p2.y);

                return (
                  <rect
                    x={minX}
                    y={minY}
                    width={Math.max(maxX - minX, 4)}
                    height={Math.max(maxY - minY, 4)}
                    fill={drawingColor}
                    fillOpacity={0.25}
                    stroke={drawingColor}
                    strokeWidth={1.5}
                    strokeDasharray="4 2"
                  />
                );
              })()
            )}

            {/* Render Drafting Path Preview */}
            {activeTool === "path" && pathPoints.length > 0 && (
              (() => {
                const rawPx = pathPoints.map((pt) => toPixelCoords(pt.time, pt.price));
                const pxPoints = rawPx.filter(
                  (p): p is { x: number; y: number } => p !== null
                );

                if (mousePos) {
                  const mPx = toPixelCoords(mousePos.time, mousePos.price);
                  if (mPx) pxPoints.push(mPx);
                }

                if (pxPoints.length < 2) return null;

                const pointsStr = pxPoints.map((p) => `${p.x},${p.y}`).join(" ");

                return (
                  <polyline
                    points={pointsStr}
                    fill="none"
                    stroke={drawingColor}
                    strokeWidth={2}
                    strokeDasharray="3 3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              })()
            )}

            {/* Render Drafting Trendline Preview */}
            {activeTool === "trendline" && trendlineStart && mousePos && (
              (() => {
                const p1 = toPixelCoords(trendlineStart.time, trendlineStart.price);
                const p2 = toPixelCoords(mousePos.time, mousePos.price);
                if (!p1 || !p2) return null;

                return (
                  <line
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    stroke={drawingColor}
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    strokeLinecap="round"
                  />
                );
              })()
            )}

            {/* Render Drafting Fibonacci Preview */}
            {activeTool === "fibonacci" && fibStart && mousePos && (
              (() => {
                const p1 = toPixelCoords(fibStart.time, fibStart.price);
                const p2 = toPixelCoords(mousePos.time, mousePos.price);
                if (!p1 || !p2) return null;

                return (
                  <line
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    stroke="#facc15"
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                  />
                );
              })()
            )}
          </svg>
        </div>
      </div>

        {/* Toggleable Right-Side Price Ladder Panel */}
        {showPriceLadder && activeCandle && (
          <div className="w-36 sm:w-44 border-l border-line bg-panel-soft/70 flex flex-col font-mono text-xs select-none shrink-0 shadow-lg">
            <div className="px-3 py-2 bg-panel border-b border-line flex items-center justify-between text-[11px]">
              <span className="font-bold text-text uppercase tracking-wider">Price Ladder</span>
              <span className="text-[10px] text-muted font-mono">.{computedDecimals}</span>
            </div>

            {/* Asks (Sell Levels) - Red */}
            <div className="flex-1 flex flex-col justify-end p-2 gap-1 overflow-hidden">
              {priceLadderLevels.asks.map((lvl, idx) => (
                <div key={idx} className="flex items-center justify-between text-[11px] px-1.5 py-0.5 rounded bg-loss/5 hover:bg-loss/15 transition-colors">
                  <span className="text-loss font-semibold">
                    {lvl.price.toLocaleString("en-US", { minimumFractionDigits: Math.min(computedDecimals, 2), maximumFractionDigits: computedDecimals })}
                  </span>
                  <span className="text-loss/70 text-[10px]">{lvl.pct}</span>
                </div>
              ))}
            </div>

            {/* Current Market Price in Center with Live Time */}
            <div className="my-1 mx-2 p-2 rounded-xl bg-panel border border-line shadow-xs flex flex-col items-center justify-center">
              <div className="text-[10px] text-muted uppercase font-bold tracking-wider">Market Price</div>
              <div className={`font-mono text-xs sm:text-sm font-extrabold ${activeCandle.close >= activeCandle.open ? "text-gain" : "text-loss"}`}>
                ${activeCandle.close.toLocaleString("en-US", { minimumFractionDigits: Math.min(computedDecimals, 2), maximumFractionDigits: computedDecimals })}
              </div>
              <div className="text-[10px] text-muted font-mono flex items-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>{liveClockTime}</span>
              </div>
            </div>

            {/* Bids (Buy Levels) - Green */}
            <div className="flex-1 flex flex-col justify-start p-2 gap-1 overflow-hidden">
              {priceLadderLevels.bids.map((lvl, idx) => (
                <div key={idx} className="flex items-center justify-between text-[11px] px-1.5 py-0.5 rounded bg-gain/5 hover:bg-gain/15 transition-colors">
                  <span className="text-gain font-semibold">
                    {lvl.price.toLocaleString("en-US", { minimumFractionDigits: Math.min(computedDecimals, 2), maximumFractionDigits: computedDecimals })}
                  </span>
                  <span className="text-gain/70 text-[10px]">{lvl.pct}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Custom Formula / PineScript Indicator Studio Modal */}
      <ChartScriptEditorModal
        isOpen={isScriptModalOpen}
        onClose={() => setIsScriptModalOpen(false)}
        candles={candlesRef.current}
        symbol={symbol}
        currentScript={customScript}
        onApplyScript={(code, plots) => {
          setCustomScript(code);
          setCustomPlots(plots);
        }}
        onClearScript={() => {
          setCustomPlots([]);
          setCustomScript("");
          try {
            localStorage.removeItem(scriptStorageKey);
          } catch {}
        }}
        hasActiveScript={customPlots.length > 0}
      />
    </div>
  );
}
