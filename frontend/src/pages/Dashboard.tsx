// src/pages/Dashboard.tsx
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import axios from "axios";
import Header from "../components/Header";
import Footer from "../components/Footer";
import MarketIndexCards from "../components/MarketIndexCards";
import FilterToolbar from "../components/FilterToolbar";
import StockTable from "../components/StockTable";
import type { StockTableHandle } from "../components/StockTable";
import OrderBook from "../components/OrderBook";
import OrderModal from "../modals/OrderModal";
import { useToast } from "../utils/useToast";
import ToastContainer from "../utils/ToastContainer";
import socket from "../websocket/client";
import { setCurrentExchange } from "../websocket/client";
import { setCurrentExchanges } from "../websocket/client";
import { DEFAULT_COLUMN_VISIBILITY } from "../types/tableConfig";
import type { UnitSettings, ColumnVisibility } from "../types/tableConfig";
import type { Order, OrderInstrumentInfo, OrderSide, OrderUpdatePayload } from "../types/order";
export type { UnitSettings, ColumnVisibility };
export { DEFAULT_COLUMN_VISIBILITY };

interface Instrument {
  symbol: string;
  reference: number;
  ceiling: number;
  floor: number;
  bidPrice3: number;
  bidVol3: number;
  bidPrice2: number;
  bidVol2: number;
  bidPrice1: number;
  bidVol1: number;
  closePrice: number;
  closeVol: number;
  change: number;
  changePercent: number;
  offerPrice1: number;
  offerVol1: number;
  offerPrice2: number;
  offerVol2: number;
  offerPrice3: number;
  offerVol3: number;
  totalTrading: number;
  high: number;
  low: number;
  averagePrice: number;
  foreignBuy: number;
  foreignSell: number;
  foreignRemain: number;
}

type Props = {
  setToken: (token: string | null) => void;
  token: string | null;
  theme: string;
  onThemeChange: (theme: string) => void;
  onLanguageChange: (lang: string) => void;
  currentLanguage: string;
};

interface SearchSymbolInfo {
  symbol: string;
  FullName?: string;
  exchange: "HOSE" | "HNX" | "UPCOM";
}

interface FavoriteList {
  id: string;
  nameList: string;
  symbols: string[];
}

const FAVORITE_STORAGE_KEY = "favoriteLists";

// Type cho realtime data từ backend (snapshot hoặc delta)
interface RealtimeDataResponse {
  s: string;
  d: Instrument[];
  _type?: "snapshot" | "delta"; // snapshot = toàn bộ data, delta = chỉ instruments đã thay đổi
}
type FlashCellState = { dir: "up" | "down"; seq: number };

const FLASH_FIELDS: (keyof Instrument)[] = [
  "bidPrice1",
  "bidVol1",
  "bidPrice2",
  "bidVol2",
  "bidPrice3",
  "bidVol3",
  "closePrice",
  "closeVol",
  "change",
  "changePercent",
  "offerPrice1",
  "offerVol1",
  "offerPrice2",
  "offerVol2",
  "offerPrice3",
  "offerVol3",
  "totalTrading",
  "high",
  "low",
  "averagePrice",
  "foreignBuy",
  "foreignSell",
  "foreignRemain",
];

const hasDeltaChange = (oldInst: Instrument, delta: Instrument) => {
  for (const key of Object.keys(delta) as (keyof Instrument)[]) {
    if (key === "symbol") continue;
    if (delta[key] !== undefined && oldInst[key] !== delta[key]) {
      return true;
    }
  }
  return false;
};

// Regex chứng quyền: C + [mã cổ phiếu cơ sở 3+ chữ] + [số 2+ chữ số]
const CW_REGEX = /^C[A-Z]{3,}\d{2,}/;
// Regex ETF: bắt đầu bằng E1 hoặc FU
const ETF_REGEX = /^(E1|FU)/;
const VND_FORMATTER = new Intl.NumberFormat("vi-VN");

const Dashboard = ({ setToken, token, theme, onThemeChange, onLanguageChange, currentLanguage }: Props) => {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [pinnedSymbols, setPinnedSymbols] = useState<Set<string>>(new Set());
  const [selectedExchange, setSelectedExchange] = useState<"HOSE" | "30" | "UPCOM" | "HNX" | "HNX30">("HOSE");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [industryMap, setIndustryMap] = useState<Record<string, string[]>>({});
  const [selectedBuyIn, setSelectedBuyIn] = useState<string>("");
  const [favoriteLists, setFavoriteLists] = useState<FavoriteList[]>([]);
  const [selectedFavoriteListId, setSelectedFavoriteListId] = useState<string | null>(null);
  const [isFavoriteMode, setIsFavoriteMode] = useState(false);
  const [hasLoadedFavorites, setHasLoadedFavorites] = useState(false);
  //const [buyInSymbols, setBuyInSymbols] = useState<Set<string>>(new Set());

  // Flash từng ô riêng lẻ: key = "symbol:fieldName", value = "up" | "down"
  const [flashingCells, setFlashingCells] = useState<Map<string, FlashCellState>>(new Map());
  const [presentationMode, setPresentationMode] = useState(false); // Chế độ trình chiếu

  // ====================== HỆ THỐNG ĐẶT LỆNH ======================
  const [orders, setOrders] = useState<Order[]>([]);
  const [availableBalance, setAvailableBalance] = useState<number | null>(null);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [orderModalSymbol, setOrderModalSymbol] = useState("");
  const [orderModalExchange, setOrderModalExchange] = useState<"HOSE" | "HNX" | "UPCOM">("HOSE");
  const [orderModalInitialSide, setOrderModalInitialSide] = useState<OrderSide>("buy");
  const [orderModalInstrument, setOrderModalInstrument] = useState<OrderInstrumentInfo | null>(null);

  // ====================== DANH SÁCH TOÀN BỘ MÃ CHO SEARCH ======================
  const [allSymbols, setAllSymbols] = useState<SearchSymbolInfo[]>([]);
  const pendingScrollSymbolRef = useRef<string | null>(null); // Mã đang chờ scroll đến sau khi chuyển sàn + data load xong
  const allSymbolsExchangeMap = useMemo(() => {
    const map = new Map<string, "HOSE" | "HNX" | "UPCOM">();
    allSymbols.forEach((item) => {
      map.set(item.symbol.toUpperCase(), item.exchange);
    });
    return map;
  }, [allSymbols]);

  const [showWarrants, setShowWarrants] = useState(false); // Lọc chứng quyền (CW)
  const [showETF, setShowETF] = useState(false); // Lọc ETF
  const [loading, setLoading] = useState(true);
  const [unitSettings, setUnitSettings] = useState<UnitSettings>({ volume: 1, price: 1000, value: 1000000 });
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibility>(DEFAULT_COLUMN_VISIBILITY);
  const { toasts, pushToast, removeToast } = useToast();

  // Ref tới StockTable để lấy scroll container cho chế độ trình chiếu
  const stockTableRef = useRef<StockTableHandle>(null);
  const instrumentsRef = useRef<Instrument[]>([]);
  const flashTimeoutsRef = useRef<Map<string, number>>(new Map());
  const orderIdsRef = useRef<Set<string>>(new Set());
  const favoriteSaveTimeoutRef = useRef<number | null>(null);

  // activeOrdersMap: chỉ lệnh pending/partial → dùng để highlight bảng giá
  const activeOrdersMap = useMemo(() => {
    const map = new Map<string, Order>();
    orders.filter((o) => o.status === "pending" || o.status === "partial").forEach((o) => map.set(o.symbol, o));
    return map;
  }, [orders]);

  const fetchAvailableBalance = useCallback(async () => {
    if (!token) {
      setAvailableBalance(null);
      return;
    }

    try {
      const res = await axios.get("/api/orders/balance", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const nextAvailable = typeof res.data?.available === "number" ? res.data.available : 0;
      setAvailableBalance(nextAvailable);
    } catch (err) {
      console.error("Lỗi tải số dư khả dụng:", err);
    }
  }, [token]);

  useEffect(() => {
    instrumentsRef.current = instruments;
  }, [instruments]);

  useEffect(() => {
    orderIdsRef.current = new Set(orders.map((o) => o.id));
  }, [orders]);

  useEffect(() => {
    void fetchAvailableBalance();
  }, [fetchAvailableBalance]);

  useEffect(() => {
    const timers = flashTimeoutsRef.current;
    return () => {
      timers.forEach((timerId) => window.clearTimeout(timerId));
      timers.clear();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (favoriteSaveTimeoutRef.current) {
        window.clearTimeout(favoriteSaveTimeoutRef.current);
      }
    };
  }, []);

  const applyFlashUpdates = useCallback((flashUpdates: Map<string, "up" | "down">) => {
    if (flashUpdates.size === 0) return;

    setFlashingCells((prev) => {
      const next = new Map(prev);
      flashUpdates.forEach((dir, key) => {
        const prevSeq = next.get(key)?.seq ?? 0;
        next.set(key, { dir, seq: prevSeq + 1 });
      });
      return next;
    });

    flashUpdates.forEach((_, key) => {
      const oldTimer = flashTimeoutsRef.current.get(key);
      if (oldTimer) window.clearTimeout(oldTimer);

      const timerId = window.setTimeout(() => {
        setFlashingCells((prev) => {
          if (!prev.has(key)) return prev;
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
        flashTimeoutsRef.current.delete(key);
      }, 420);

      flashTimeoutsRef.current.set(key, timerId);
    });
  }, []);

  // ====================== ORDER SYSTEM EFFECTS ======================
  // Tải danh sách lệnh khi token thay đổi (login/logout)
  useEffect(() => {
    if (!token) {
      setOrders([]);
      return;
    }
    const fetchOrders = async () => {
      try {
        const res = await axios.get("/api/orders", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const apiOrders: Record<string, unknown>[] = Array.isArray(res.data?.orders) ? (res.data.orders as Record<string, unknown>[]) : [];

        const mapped: Order[] = apiOrders.map((o) => ({
          id: String((o.id as string) ?? (o._id as string) ?? ""),
          symbol: o.symbol as string,
          exchange: o.exchange as string,
          side: o.side as OrderSide,
          orderType: o.orderType as Order["orderType"],
          price: (o.price as number) ?? 0,
          quantity: (o.quantity as number) ?? 0,
          filledQuantity: (o.filledQuantity as number) ?? 0,
          status: o.status as Order["status"],
          matchedPrice: (o.matchedPrice as number) ?? null,
          matchedAt: (o.matchedAt as string) ?? null,
          createdAt: (o.createdAt as string) ?? new Date().toISOString(),
        }));
        setOrders(mapped);
      } catch (err) {
        console.error("Lỗi tải danh sách lệnh:", err);
      }
    };
    fetchOrders();
  }, [token]);

  // Lắng nghe 'order_update' từ socket
  useEffect(() => {
    const formatVnd = (val: number) => `${VND_FORMATTER.format(val)} VND`;

    const handleOrderUpdate = (payload: OrderUpdatePayload) => {
      if (!orderIdsRef.current.has(payload.orderId)) return;
      setOrders((prev) => {
        const idx = prev.findIndex((o) => o.id === payload.orderId);
        if (idx === -1) return prev; // không tìm thấy
        const updated: Order = {
          ...prev[idx],
          status: payload.status,
          filledQuantity: payload.filledQuantity,
          matchedPrice: payload.matchedPrice,
          matchedAt: payload.matchedAt,
        };
        const next = [...prev];
        next[idx] = updated;
        return next;
      });

      const cashIn = payload.cashIn ?? 0;
      const cashOut = payload.cashOut ?? 0;
      const fee = payload.fee ?? 0;
      const refund = payload.refund ?? 0;
      const matchedQtyDelta = payload.matchedQtyDelta ?? 0;
      const hasSettlementData = cashIn > 0 || cashOut > 0 || fee > 0 || refund > 0;

      if (hasSettlementData && (payload.status === "matched" || payload.status === "partial")) {
        if (payload.side === "buy") {
          const parts: string[] = [];
          if (cashOut > 0) parts.push(`Trừ -${formatVnd(cashOut)}`);
          if (refund > 0) parts.push(`Hoàn +${formatVnd(refund)}`);
          if (fee > 0) parts.push(`Phí sàn -${formatVnd(fee)}`);
          if (matchedQtyDelta > 0) parts.push(`Nhận +${VND_FORMATTER.format(matchedQtyDelta)} cổ phiếu ${payload.symbol}`);

          pushToast(`Khớp lệnh mua ${payload.symbol}`, parts.join(" | "), "error");
        } else if (payload.side === "sell") {
          const parts: string[] = [];
          if (cashIn > 0) parts.push(`Cộng +${formatVnd(cashIn)}`);
          if (fee > 0) parts.push(`Phí sàn -${formatVnd(fee)}`);
          if (matchedQtyDelta > 0) parts.push(`Bán -${VND_FORMATTER.format(matchedQtyDelta)} cổ phiếu ${payload.symbol}`);

          pushToast(`Khớp lệnh bán ${payload.symbol}`, parts.join(" | "), "success");
        }
      }

      void fetchAvailableBalance();
    };

    socket.on("order_update", handleOrderUpdate);
    return () => {
      socket.off("order_update", handleOrderUpdate);
    };
  }, [fetchAvailableBalance, pushToast]);

  // Handler: mở OrderModal khi click M/B trên bảng giá
  const handleOrderClick = useCallback(
    (symbol: string, instrumentInfo: OrderInstrumentInfo, side: OrderSide) => {
      if (!token) return;
      // Xác định exchange từ selectedExchange
      const exchangeMap: Record<string, "HOSE" | "HNX" | "UPCOM"> = {
        HOSE: "HOSE",
        "30": "HOSE",
        HNX: "HNX",
        HNX30: "HNX",
        UPCOM: "UPCOM",
      };
      setOrderModalSymbol(symbol);
      setOrderModalExchange(exchangeMap[selectedExchange] ?? "HOSE");
      setOrderModalInitialSide(side);
      setOrderModalInstrument(instrumentInfo);
      setOrderModalOpen(true);
    },
    [token, selectedExchange],
  );

  // Handler: sau khi đặt lệnh thành công
  const handleOrderSuccess = useCallback(
    (order: Order) => {
      setOrders((prev) => [order, ...prev]);
      void fetchAvailableBalance();
    },
    [fetchAvailableBalance],
  );

  // Handler: hủy lệnh (OrderBook đã gọi API rồi, chỉ cần update state)
  const handleCancelOrder = useCallback(
    (id: string) => {
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: "cancelled" as const } : o)));
      void fetchAvailableBalance();
    },
    [fetchAvailableBalance],
  );

  // Ref lưu exchange hiện tại để re-subscribe khi reconnect
  const exchangeRef = useRef(selectedExchange);
  exchangeRef.current = selectedExchange;

  // Subscribe vào exchange khi thay đổi sàn
  useEffect(() => {
    if (isFavoriteMode && selectedFavoriteListId) {
      const activeList = favoriteLists.find((list) => list.id === selectedFavoriteListId);
      const exchanges = Array.from(
        new Set(
          (activeList?.symbols ?? [])
            .map((symbol) => allSymbolsExchangeMap.get(symbol.toUpperCase()))
            .filter((exchange): exchange is "HOSE" | "HNX" | "UPCOM" => !!exchange),
        ),
      );

      if (exchanges.length > 0) {
        setCurrentExchanges(exchanges); // Lưu cho re-subscribe khi reconnect
        socket.emit("subscribe_exchanges", exchanges);
        return;
      }
    }

    setCurrentExchange(selectedExchange); // Lưu cho re-subscribe khi reconnect
    socket.emit("subscribe_exchange", selectedExchange);
  }, [allSymbolsExchangeMap, favoriteLists, isFavoriteMode, selectedExchange, selectedFavoriteListId]);

  // Lắng nghe instruments_data từ backend (snapshot hoặc delta)
  useEffect(() => {
    const handleInstrumentsData = (data: RealtimeDataResponse & { _serverEmitTime?: number }) => {
      if (!data || !data.d || !Array.isArray(data.d)) return;

      // Lần đầu nhận data → tắt loading
      setLoading(false);

      if (data._type === "snapshot") {
        // SNAPSHOT: thay thế toàn bộ instruments (khi join room, reconnect)
        const validInstruments = data.d.filter((item: Instrument) => item.symbol && item.reference >= 0);
        instrumentsRef.current = validInstruments;
        setInstruments(validInstruments);
      } else if (data._type === "delta") {
        const flashUpdates = new Map<string, "up" | "down">();
        const prev = instrumentsRef.current;

        // Nếu chưa có data cũ → dùng delta như snapshot
        if (prev.length === 0) {
          const fallback = data.d.filter((item: Instrument) => item.symbol && item.reference >= 0);
          instrumentsRef.current = fallback;
          setInstruments(fallback);
          return;
        }

        // DELTA: chỉ instruments đã thay đổi (từ backend WS relay hoặc REST fallback)
        const map = new Map(prev.map((s) => [s.symbol, s]));
        let changed = false;

        data.d.forEach((newInstrument: Instrument) => {
          if (!newInstrument.symbol) return;
          const old = map.get(newInstrument.symbol);

          if (old) {
            if (!hasDeltaChange(old, newInstrument)) return;

            const merged = { ...old, ...newInstrument };
            map.set(newInstrument.symbol, merged);
            changed = true;

            const direction: "up" | "down" = merged.change > 0 ? "up" : "down";
            for (const field of FLASH_FIELDS) {
              if (old[field] !== merged[field] && merged[field] !== undefined) {
                flashUpdates.set(`${merged.symbol}:${field}`, direction);
              }
            }
          } else {
            map.set(newInstrument.symbol, newInstrument);
            changed = true;
          }
        });

        if (changed) {
          const next = Array.from(map.values());
          instrumentsRef.current = next;
          setInstruments(next);
        }

        applyFlashUpdates(flashUpdates);
      }
    };

    const handleDisconnect = (reason: string) => {
      console.log("[Socket] Mất kết nối:", reason);
    };

    socket.on("instruments_data", handleInstrumentsData);
    socket.on("disconnect", handleDisconnect);

    return () => {
      socket.off("instruments_data", handleInstrumentsData);
      socket.off("disconnect", handleDisconnect);
    };
  }, [applyFlashUpdates]);
  // ====================== HẾT SOCKET BACKEND ======================

  // Tải danh sách CP ngành và mapping ngành
  useEffect(() => {
    const fetchIndustries = async () => {
      try {
        const response = await axios.get("/api/datafeed/industry");
        const data = response.data;

        if (data.s === "ok" && data.d) {
          const map: Record<string, string[]> = {};
          data.d.forEach((industry: { industryName: string; codeList: string }) => {
            map[industry.industryName] = industry.codeList.split(",").map((code) => code.trim());
          });
          setIndustryMap(map);
        }
      } catch (err) {
        console.log("Lỗi:", err);
      }
    };

    fetchIndustries();
  }, []);

  // ====================== TẢI TOÀN BỘ MÃ CHỨNG KHOÁN CHO SEARCH ======================
  useEffect(() => {
    const fetchAllSymbols = async () => {
      try {
        const exchanges: Array<"HOSE" | "HNX" | "UPCOM"> = ["HOSE", "HNX", "UPCOM"];
        const results = await Promise.all(exchanges.map((exchange) => axios.get(`/api/datafeed/instruments?exchange=${exchange}`)));

        const symbolList: SearchSymbolInfo[] = [];
        results.forEach((res, idx) => {
          const data = res.data;
          if (data.s === "ok" && Array.isArray(data.d)) {
            data.d.forEach((item: { symbol?: string; FullName?: string }) => {
              if (item.symbol) {
                symbolList.push({
                  symbol: item.symbol,
                  FullName: item.FullName,
                  exchange: exchanges[idx],
                });
              }
            });
          }
        });

        setAllSymbols(symbolList);
      } catch (err) {
        console.log("Lỗi tải danh sách mã cho search:", err);
      }
    };
    fetchAllSymbols();
  }, []);

  // fetch danh sách chứng khoán theo ngành khi selectedCategory thay đổi
  useEffect(() => {
    if (!selectedCategory || selectedCategory === "all") {
      setLoading(true);
      socket.emit("subscribe_exchange", selectedExchange);
      return;
    }

    const fetchCategoryInstruments = async () => {
      try {
        setLoading(true);
        const codeList = industryMap[selectedCategory];
        if (!codeList || codeList.length === 0) {
          setInstruments([]);
          return;
        }

        // Fetch dữ liệu đầy đủ cho các mã trong ngành
        const symbolsString = codeList.join(",");
        const response = await axios.get(`/api/datafeed/instruments?symbols=${symbolsString}`);
        const data = response.data;

        if (data.s === "ok" && Array.isArray(data.d)) {
          const validInstruments = data.d.filter((item: Instrument) => item.symbol && item.reference >= 0); //Lọc hợp lệ
          setInstruments(validInstruments);
        }
      } catch (err) {
        console.log(err);
        setInstruments([]);
      } finally {
        setLoading(false);
      }
    };
    fetchCategoryInstruments();
  }, [selectedCategory, industryMap, selectedExchange]);

  // Chế độ trình chiếu — scroll riêng phần data của bảng
  useEffect(() => {
    if (!presentationMode) return;
    const scrollEl = stockTableRef.current?.getScrollElement();
    if (!scrollEl) return;
    let animationId: number;
    const scrollStep = () => {
      scrollEl.scrollBy(0, 0.35); // tốc độ cuộn
      if (scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight) {
        scrollEl.scrollTo({ top: 0 }); // quay lại đầu
      }
      animationId = requestAnimationFrame(scrollStep);
    };
    animationId = requestAnimationFrame(scrollStep);
    return () => cancelAnimationFrame(animationId);
  }, [presentationMode]);

  // Filter instruments
  const selectedFavoriteSymbols = useMemo(() => {
    if (!selectedFavoriteListId) return null;
    const active = favoriteLists.find((list) => list.id === selectedFavoriteListId);
    return new Set(active?.symbols ?? []);
  }, [favoriteLists, selectedFavoriteListId]);

  const filteredInstruments = useMemo(() => {
    // Nếu đang ở chế độ Favorite List thì luôn render theo danh sách đã lưu
    if (isFavoriteMode) {
      if (!selectedFavoriteListId || !selectedFavoriteSymbols || selectedFavoriteSymbols.size === 0) {
        return [];
      }

      const instrumentMap = new Map(instruments.map((stock) => [stock.symbol.toUpperCase(), stock]));
      const activeList = favoriteLists.find((list) => list.id === selectedFavoriteListId);
      if (!activeList) return [];

      return activeList.symbols.map((symbolRaw) => instrumentMap.get(symbolRaw.toUpperCase())).filter((stock): stock is Instrument => !!stock);
    }

    // Mode bình thường (sàn / ngành / warrants / etf)
    let result = instruments;
    if (showWarrants) {
      result = result.filter((stock) => CW_REGEX.test(stock.symbol));
    }
    if (showETF) {
      result = result.filter((stock) => ETF_REGEX.test(stock.symbol));
    }
    return result;
  }, [favoriteLists, instruments, isFavoriteMode, selectedFavoriteListId, selectedFavoriteSymbols, showWarrants, showETF]);

  // ====================== TẠO DANH MỤC YÊU THÍCH ======================
  const handleFavoriteCreate = useCallback((name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) return null;

    const newId = `fav_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const nextList: FavoriteList = {
      id: newId,
      nameList: trimmedName,
      symbols: [],
    };
    setFavoriteLists((prev) => [...prev, nextList]);
    setSelectedFavoriteListId(newId);
    setIsFavoriteMode(true);
    return newId;
  }, []);

  // ====================== ĐỔI TÊN DANH MỤC YÊU THÍCH ======================
  const handleFavoriteRename = useCallback((id: string, newName: string) => {
    const trimmedName = newName.trim();
    if (!trimmedName) return false;

    setFavoriteLists((prev) =>
      prev.map((list) => {
        if (list.id !== id) return list;
        return { ...list, nameList: trimmedName };
      }),
    );

    return true;
  }, []);

  // ====================== XÓA DANH MỤC YÊU THÍCH ======================
  const handleFavoriteDelete = useCallback(
    (id: string) => {
      setFavoriteLists((prev) => {
        const next = prev.filter((list) => list.id !== id);
        if (next.length === 0) {
          setSelectedFavoriteListId(null);
          setIsFavoriteMode(false);
        } else if (selectedFavoriteListId === id) {
          setSelectedFavoriteListId(null);
          setIsFavoriteMode(true);
        }
        return next;
      });
    },
    [selectedFavoriteListId],
  );

  // ====================== CHỌN DANH MỤC YÊU THÍCH ======================
  const handleFavoriteSelect = useCallback((id: string | null) => {
    setSelectedFavoriteListId(id);
    setIsFavoriteMode(true);
  }, []);

  // ====================== TOGGLE CHẾ ĐỘ DANH MỤC YÊU THÍCH ======================
  const handleFavoriteModeChange = useCallback((active: boolean) => {
    setIsFavoriteMode(active);
  }, []);

  // ====================== NÚT CHẾ ĐỘ TRÌNH CHIẾU ======================
  const handleTogglePresentation = useCallback(() => {
    setPresentationMode((p) => !p);
  }, []);

  // ====================== XỬ LÝ CHỌN MÃ TỪ SEARCH (CÓ 2 LOẠI) ======================
  const handleSearchSelect = useCallback(
    (symbol: string, exchange: "HOSE" | "HNX" | "UPCOM") => {
      // Reset tất cả filter về mặc định (ngoài favorite)
      setSelectedCategory("all");
      setSelectedBuyIn("");
      setShowWarrants(false);
      setShowETF(false);

      // ====================== MODE DANH MỤC YÊU THÍCH ======================
      if (selectedFavoriteListId) {
        setIsFavoriteMode(true);

        let isDuplicate = false;
        setFavoriteLists((prev) => {
          const updated = prev.map((list) => {
            if (list.id !== selectedFavoriteListId) return list;
            const upperSymbol = symbol.toUpperCase().trim();
            if (list.symbols.some((s) => s.toUpperCase() === upperSymbol)) {
              isDuplicate = true; // Đánh dấu trùng
              return list;
            }
            return {
              ...list,
              symbols: [...list.symbols, upperSymbol],
            };
          });

          return updated;
        });
        // Chỉ hiện toast sau khi state update xong
        setTimeout(() => {
          if (isDuplicate) {
            pushToast("Thêm mã thất bại", `Mã chứng khoán '${symbol.toUpperCase()}' đã có sẵn trong danh mục`, "error");
          } else {
            pushToast("Thêm thành công", `Đã thêm mã chứng khoán '${symbol.toUpperCase()}' vào danh mục`, "success");
          }
        }, 10);
        pendingScrollSymbolRef.current = symbol.toUpperCase();
        return;
      }

      // ====================== MODE SEARCH BÌNH THƯỜNG ======================
      pendingScrollSymbolRef.current = symbol;

      if (exchange === selectedExchange) {
        setTimeout(() => {
          stockTableRef.current?.scrollToSymbol(symbol);
          pendingScrollSymbolRef.current = null;
        }, 0);
      } else {
        setSelectedExchange(exchange as "HOSE" | "30" | "UPCOM" | "HNX" | "HNX30");
      }
    },
    [selectedFavoriteListId, selectedExchange, pushToast],
  );

  // Xoá một mã khỏi danh mục yêu thích hiện tại
  const handleRemoveFromFavorite = useCallback(
    (symbolToRemove: string) => {
      if (!selectedFavoriteListId) return;

      setFavoriteLists((prev) =>
        prev.map((list) => {
          if (list.id !== selectedFavoriteListId) return list;
          return {
            ...list,
            symbols: list.symbols.filter((s) => s.toUpperCase() !== symbolToRemove.toUpperCase()),
          };
        }),
      );

      pushToast("Xoá thành công", `Đã xoá mã chứng khoán '${symbolToRemove}' khỏi danh mục`, "success");
    },
    [selectedFavoriteListId, pushToast],
  );

  // Khi instruments thay đổi (data đã load) → kiểm tra nếu có mã đang chờ scroll thì nhảy đến
  useEffect(() => {
    if (!pendingScrollSymbolRef.current) return;
    const symbol = pendingScrollSymbolRef.current;
    // Kiểm tra mã có trong danh sách instruments hiện tại không
    const found = instruments.some((s) => s.symbol === symbol);
    if (found) {
      setTimeout(() => {
        stockTableRef.current?.scrollToSymbol(symbol);
      }, 100); // chờ load cho chắc
      pendingScrollSymbolRef.current = null; // Xóa pending sau khi đã gọi scroll
    }
  }, [instruments]);

  useEffect(() => {
    const loadFavoriteLists = async () => {
      setHasLoadedFavorites(false);
      if (!token) {
        const raw = localStorage.getItem(FAVORITE_STORAGE_KEY);
        if (!raw) {
          setFavoriteLists([]);
          setSelectedFavoriteListId(null);
          setIsFavoriteMode(false);
          setHasLoadedFavorites(true);
          return;
        }

        try {
          const parsed = JSON.parse(raw) as FavoriteList[];
          if (Array.isArray(parsed)) {
            setFavoriteLists(parsed);
            setSelectedFavoriteListId((prev) => (prev && parsed.some((item) => item.id === prev) ? prev : null));
          } else {
            setFavoriteLists([]);
          }
        } catch {
          setFavoriteLists([]);
        }
        setIsFavoriteMode(false);
        setHasLoadedFavorites(true);
        return;
      }

      try {
        const res = await axios.get("/api/auth/favorites", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const lists: FavoriteList[] = Array.isArray(res.data?.favoriteLists) ? res.data.favoriteLists : [];
        setFavoriteLists(lists);
        setSelectedFavoriteListId((prev) => (prev && lists.some((item) => item.id === prev) ? prev : null));
      } catch (err) {
        console.error("Lỗi tải danh mục yêu thích:", err);
      } finally {
        setIsFavoriteMode(false);
        setHasLoadedFavorites(true);
      }
    };

    void loadFavoriteLists();
  }, [token]);

  useEffect(() => {
    if (!hasLoadedFavorites) return;

    if (!token) {
      localStorage.setItem(FAVORITE_STORAGE_KEY, JSON.stringify(favoriteLists));
      return;
    }

    if (favoriteSaveTimeoutRef.current) {
      window.clearTimeout(favoriteSaveTimeoutRef.current);
    }

    favoriteSaveTimeoutRef.current = window.setTimeout(() => {
      void axios
        .put(
          "/api/auth/favorites",
          { favoriteLists },
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        )
        .catch((err) => {
          console.error("Lỗi lưu danh mục yêu thích:", err);
        });
    }, 350);
  }, [favoriteLists, hasLoadedFavorites, token]);

  // Nút Ghim và Bỏ ghim cho từng mã cổ phiếu
  const togglePin = useCallback((symbol: string) => {
    setPinnedSymbols((prev) => {
      const newPinned = new Set(prev);
      if (newPinned.has(symbol)) {
        newPinned.delete(symbol);
      } else {
        if (newPinned.size >= 10) return prev; // Giới hạn tối đa 10 mã ghim để tránh quá tải giao diện
        newPinned.add(symbol);
      }
      return newPinned;
    });
  }, []);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", background: "#0f172a" }}>
      {/* DIV 1: Phần cố định trên cùng — Header + Cards + Filter */}
      <div style={{ flexShrink: 0 }}>
        <Header
          token={token}
          setToken={setToken}
          availableBalance={availableBalance}
          onDepositSuccess={() => void fetchAvailableBalance()}
          theme={theme}
          onThemeChange={onThemeChange}
          onLanguageChange={onLanguageChange}
          currentLanguage={currentLanguage}
        />

        <MarketIndexCards />

        <FilterToolbar
          allSymbols={allSymbols}
          onSearchSelect={handleSearchSelect}
          selectedExchange={selectedExchange}
          onExchangeChange={setSelectedExchange}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          industryMap={industryMap}
          presentationMode={presentationMode}
          onTogglePresentation={handleTogglePresentation}
          selectedBuyIn={selectedBuyIn}
          onBuyInChange={setSelectedBuyIn}
          favoriteLists={favoriteLists}
          selectedFavoriteListId={selectedFavoriteListId}
          isFavoriteMode={isFavoriteMode}
          onFavoriteModeChange={handleFavoriteModeChange}
          onFavoriteSelect={handleFavoriteSelect}
          onFavoriteCreate={handleFavoriteCreate}
          onFavoriteRename={handleFavoriteRename}
          onFavoriteDelete={handleFavoriteDelete}
          showWarrants={showWarrants}
          onWarrantsChange={setShowWarrants}
          showETF={showETF}
          onETFChange={setShowETF}
          unitSettings={unitSettings}
          onUnitSettingsChange={setUnitSettings}
          columnVisibility={columnVisibility}
          onColumnVisibilityChange={setColumnVisibility}
        />
      </div>

      {/* DIV 2: Phần data scroll — chỉ chứa data bảng, scroll riêng data */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <StockTable
          ref={stockTableRef}
          instruments={filteredInstruments}
          pinnedSymbols={pinnedSymbols}
          flashingCells={flashingCells}
          onTogglePin={togglePin}
          loading={loading}
          unitSettings={unitSettings}
          columnVisibility={columnVisibility}
          selectedExchange={selectedExchange}
          token={token}
          activeOrdersMap={activeOrdersMap}
          onOrderClick={handleOrderClick}
          isFavoriteMode={isFavoriteMode}
          onRemoveFromFavorite={handleRemoveFromFavorite}
        />
      </div>

      {/* DIV 3: Panel sổ lệnh — luôn nằm dưới data bảng và trên footer */}
      <div style={{ flexShrink: 0 }}>
        <OrderBook token={token} orders={orders} onCancelOrder={handleCancelOrder} unitSettings={unitSettings} />
      </div>

      {/* DIV 4: Footer cố định dưới cùng */}
      <div style={{ flexShrink: 0 }}>
        <Footer unitSettings={unitSettings} />
      </div>

      {/* OrderModal — đặt ngoài các div viewport */}
      <OrderModal
        open={orderModalOpen}
        symbol={orderModalSymbol}
        exchange={orderModalExchange}
        initialSide={orderModalInitialSide}
        instrument={orderModalInstrument}
        token={token}
        unitSettings={unitSettings}
        onClose={() => setOrderModalOpen(false)}
        onSuccess={handleOrderSuccess}
      />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default Dashboard;
