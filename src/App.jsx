import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "./config/firebase";
import {
  initDB,
  addItem,
  updateItem,
  deleteItem,
  getItem,
  getAllItems,
  getItemsByProfileId,
  exportIndexedDB,
  importIndexedDB,
} from "./config/db";
import {
  formatDate,
  formatDateTime,
  toDateTimeLocalInput,
  formatCurrency,
  formatLotSize,
  formatDurationMs,
} from "./utils/formatters";
import { generateDeviceFingerprint, classNames } from "./utils/helpers";
import { useLocalImage } from "./hooks/useLocalImage";

// lucide-react icons
import {
  LayoutDashboard,
  BookOpen,
  CalendarDays,
  Image as ImageIcon,
  TrendingUp,
  Calculator,
  Target,
  Zap,
  ListPlus,
  Wallet,
  PlusCircle,
  Menu,
  LogOut,
  Share2,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Ratio,
  Divide,
  BarChartHorizontal,
  Hash,
  Cloud,
  CloudUpload,
  CloudDownload,
  Clock,
  PanelLeftClose,
  PanelLeftOpen,
  LineChart,
  FileSpreadsheet,
  RefreshCw,
  ExternalLink,
} from "lucide-react";

import {
  scheduleDebouncedSync,
  syncTwoWayWithGoogle,
  uploadImageToDrive,
  getStoredToken,
  subscribeSyncStatus,
  getSpreadsheetId,
} from "./services/googleSyncService";

// modular components
import { Toast } from "./components/common/Toast";
import { SidebarLink } from "./components/common/SidebarLink";
import { TradeList } from "./components/common/TradeList";
import { YearlySummary } from "./components/common/YearlySummary";
import { SplashScreen } from "./components/common/SplashScreen";

import { ConfirmationModal } from "./components/modals/ConfirmationModal";
import { FullscreenImageModal } from "./components/modals/FullscreenImageModal";
import { TradeDetailModal } from "./components/modals/TradeDetailModal";
import { LotSizeCalculatorModal } from "./components/modals/LotSizeCalculatorModal";
import { GoalSettingModal } from "./components/modals/GoalSettingModal";
import { ProfileManagementModal } from "./components/modals/ProfileManagementModal";
import { CustomFieldManagementModal } from "./components/modals/CustomFieldManagementModal";
import { TemplateManagementModal } from "./components/modals/TemplateManagementModal";
import { PairManagementModal } from "./components/modals/PairManagementModal";
import { ShareCardModal } from "./components/modals/ShareCardModal";
import { BalanceTransactionModal } from "./components/modals/BalanceTransactionModal";
import { TradeForm } from "./components/modals/TradeForm";

import { GoalProgress } from "./components/dashboard/GoalProgress";
import { DailyGoalProgress } from "./components/dashboard/DailyGoalProgress";
import { StatisticsDashboard } from "./components/dashboard/StatisticsDashboard";
import { AccountBalanceChart } from "./components/dashboard/AccountBalanceChart";
import { DateRangePicker } from "./components/dashboard/DateRangePicker";
import { YearSelector } from "./components/dashboard/YearSelector";
import { MonthYearSelector } from "./components/dashboard/MonthYearSelector";
import { FieldPerformanceTable } from "./components/dashboard/FieldPerformanceTable";
import { ProfileSelector } from "./components/dashboard/ProfileSelector";
import { StatCard } from "./components/dashboard/StatCard";
import { GaugeChart } from "./components/dashboard/GaugeChart";
import { RatioBar } from "./components/dashboard/RatioBar";
import { RealtimePricesWidget } from "./components/dashboard/RealtimePricesWidget";

import { LoginPage } from "./pages/LoginPage";
import { StrategyPage } from "./pages/StrategyPage";
import { CalendarView } from "./pages/CalendarView";
import { GalleryView } from "./pages/GalleryView";
import { SyncPage } from "./pages/SyncPage";
import { TradingViewPage } from "./pages/TradingViewPage";

// --- MAIN APP COMPONENT ---
function App() {
  const [trades, setTrades] = useState([]);
  const [pairs, setPairs] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [customFields, setCustomFields] = useState([]);
  const [balanceTransactions, setBalanceTransactions] = useState([]);
  const [strategies, setStrategies] = useState([]); // State untuk Strategi
  const [initialBalance, setInitialBalance] = useState(0);
  const [goalSettings, setGoalSettings] = useState(null);

  const [user, setUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [tradingProfiles, setTradingProfiles] = useState([]);
  const [activeProfile, setActiveProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loginError, setLoginError] = useState("");

  // Splash Screen States
  const [isMinDurationPassed, setIsMinDurationPassed] = useState(false);
  const [splashFadeOut, setSplashFadeOut] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  // Gallery Active Sync State
  const [activeGalleryTrades, setActiveGalleryTrades] = useState([]);

  const [toast, setToast] = useState({ message: "", type: "" });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDesktopSidebarVisible, setIsDesktopSidebarVisible] = useState(true);
  const [isTradeFormVisible, setIsTradeFormVisible] = useState(false);
  const [editingTrade, setEditingTrade] = useState(null);
  const [viewingTrade, setViewingTrade] = useState(null);
  const [showDashboardShareModal, setShowDashboardShareModal] = useState(false);
  const [isTransactionModalVisible, setIsTransactionModalVisible] =
    useState(false);
  const [isPairModalVisible, setIsPairModalVisible] = useState(false);
  const [isTemplateModalVisible, setIsTemplateModalVisible] = useState(false);
  const [isCustomFieldModalVisible, setIsCustomFieldModalVisible] =
    useState(false);
  const [isCalculatorVisible, setIsCalculatorVisible] = useState(false);
  const [isGoalModalVisible, setIsGoalModalVisible] = useState(false);
  const [isProfileModalVisible, setIsProfileModalVisible] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [activeView, setActiveView] = useState("dashboard");
  const [activePeriod, setActivePeriod] = useState("all");
  const [sortConfig, setSortConfig] = useState({
    key: "tradeDate",
    direction: "descending",
  });
  const [chartType, setChartType] = useState("balance");
  const [customStartDate, setCustomStartDate] = useState(
    new Date().toLocaleDateString("en-CA"),
  );
  const [customEndDate, setCustomEndDate] = useState(
    new Date().toLocaleDateString("en-CA"),
  );
  const [selectedYear, setSelectedYear] = useState(
    String(new Date().getFullYear()),
  );
  const [selectedMonth, setSelectedMonth] = useState(
    String(new Date().getMonth()),
  );
  const [isDashboardSyncing, setIsDashboardSyncing] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState("idle");

  // Subscribe to Google Sheets & Drive sync status
  useEffect(() => {
    const unsub = subscribeSyncStatus((status) => {
      setCloudSyncStatus(status);
      setIsDashboardSyncing(status === "syncing");
    });
    return unsub;
  }, []);

  // Initial startup sync if Google account is connected
  useEffect(() => {
    if (getStoredToken()) {
      syncTwoWayWithGoogle()
        .then((res) => {
          if (res?.success && activeProfile) {
            refreshAllData(activeProfile.id, false);
          }
        })
        .catch((err) => console.warn("Startup Google sync error:", err));
    }
  }, [activeProfile?.id]);

  // Splash Screen timer control
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsMinDurationPassed(true);
    }, 2500); // Minimum 2.5 seconds splash display
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Fade out splash screen ONLY after minimum duration passes AND authentication loading check is complete
    if (isMinDurationPassed && isAuthReady && !isLoading) {
      setSplashFadeOut(true);
      const removeTimer = setTimeout(() => {
        setShowSplash(false);
      }, 900); // Matches transition duration in SplashScreen.jsx (850ms + 50ms buffer)
      return () => clearTimeout(removeTimer);
    }
  }, [isMinDurationPassed, isAuthReady, isLoading]);

  // --- STATES & REFS FOR NOTES WIDGET ---
  const [notesText, setNotesText] = useState("");
  const [notesImageId, setNotesImageId] = useState("");
  const [notesImageUrl, setNotesImageUrl] = useState("");
  const [isEditingNotes, setIsEditingNotes] = useState(false);

  // Load notes configuration and blob from IndexedDB per profile
  useEffect(() => {
    if (activeProfile) {
      const savedText = localStorage.getItem(`dashboard_notes_text_${activeProfile.id}`) || "";
      const savedImgId = localStorage.getItem(`dashboard_notes_img_id_${activeProfile.id}`) || "";
      setNotesText(savedText);
      setNotesImageId(savedImgId);
      setIsEditingNotes(false);

      if (savedImgId) {
        getItem("trade_images", savedImgId).then((imgData) => {
          if (imgData && imgData.file) {
            const url = URL.createObjectURL(imgData.file);
            setNotesImageUrl(url);
          } else {
            setNotesImageUrl("");
          }
        }).catch(() => setNotesImageUrl(""));
      } else {
        setNotesImageUrl("");
      }
    } else {
      setNotesText("");
      setNotesImageId("");
      setNotesImageUrl("");
      setIsEditingNotes(false);
    }
  }, [activeProfile]);

  const handleSaveNotes = async (newText, imageFile, removeImage) => {
    if (!activeProfile) return;

    let finalImgId = notesImageId;

    try {
      if (removeImage) {
        if (notesImageId) {
          await deleteItem("trade_images", notesImageId);
        }
        finalImgId = "";
        setNotesImageUrl("");
      } else if (imageFile) {
        if (notesImageId) {
          await deleteItem("trade_images", notesImageId);
        }
        const newImgId = crypto.randomUUID();
        await addItem("trade_images", { id: newImgId, file: imageFile });
        finalImgId = newImgId;

        const url = URL.createObjectURL(imageFile);
        setNotesImageUrl(url);
      }

      localStorage.setItem(`dashboard_notes_text_${activeProfile.id}`, newText);
      localStorage.setItem(`dashboard_notes_img_id_${activeProfile.id}`, finalImgId);

      setNotesText(newText);
      setNotesImageId(finalImgId);
      setIsEditingNotes(false);
      showToast("Catatan berhasil disimpan!", "success");
      triggerAutoBackup();
    } catch (e) {
      console.error(e);
      showToast("Gagal menyimpan catatan.", "error");
    }
  };

  // --- STATES & REFS FOR CUSTOMIZABLE LAYOUT ---
  const [isLayoutEditMode, setIsLayoutEditMode] = useState(false);
  const [layoutOrder, setLayoutOrder] = useState([
    { id: "widget_goal", w: 4, h: 1 },
    { id: "widget_dailyGoal", w: 4, h: 1 },
    { id: "stat_netPnl", w: 1, h: 1 },
    { id: "stat_growth", w: 1, h: 1 },
    { id: "stat_winRate", w: 1, h: 1 },
    { id: "stat_bestTrade", w: 1, h: 1 },
    { id: "stat_worstTrade", w: 1, h: 1 },
    { id: "stat_avgRR", w: 1, h: 1 },
    { id: "stat_streak", w: 1, h: 1 },
    { id: "stat_profitFactor", w: 1, h: 1 },
    { id: "stat_dayWinRate", w: 1, h: 1 },
    { id: "stat_avgWinLoss", w: 1, h: 1 },
    { id: "stat_totalLot", w: 1, h: 1 },
    { id: "stat_duration", w: 1, h: 1 },
    { id: "widget_realtime_prices", w: 2, h: 1 },
    { id: "widget_notes", w: 2, h: 2 },
    { id: "widget_chart", w: 4, h: 2 },
    { id: "widget_fields", w: 4, h: 2 },
    { id: "widget_trades", w: 4, h: 2 }
  ]);
  const longPressTimeout = useRef(null);
  const isPressing = useRef(false);

  // Load layout configuration per profile (with legacy conversion)
  useEffect(() => {
    if (activeProfile) {
      const savedLayout = localStorage.getItem(`dashboard_layout_${activeProfile.id}`);
      const DEFAULT_LAYOUT = [
        { id: "widget_goal", w: 4, h: 1 },
        { id: "widget_dailyGoal", w: 4, h: 1 },
        { id: "stat_netPnl", w: 1, h: 1 },
        { id: "stat_growth", w: 1, h: 1 },
        { id: "stat_winRate", w: 1, h: 1 },
        { id: "stat_bestTrade", w: 1, h: 1 },
        { id: "stat_worstTrade", w: 1, h: 1 },
        { id: "stat_avgRR", w: 1, h: 1 },
        { id: "stat_streak", w: 1, h: 1 },
        { id: "stat_profitFactor", w: 1, h: 1 },
        { id: "stat_dayWinRate", w: 1, h: 1 },
        { id: "stat_avgWinLoss", w: 1, h: 1 },
        { id: "stat_totalLot", w: 1, h: 1 },
        { id: "stat_duration", w: 1, h: 1 },
        { id: "widget_realtime_prices", w: 2, h: 1 },
        { id: "widget_notes", w: 2, h: 2 },
        { id: "widget_chart", w: 4, h: 2 },
        { id: "widget_fields", w: 4, h: 2 },
        { id: "widget_trades", w: 4, h: 2 }
      ];

      if (savedLayout) {
        try {
          let parsed = JSON.parse(savedLayout);

          // Defensive check: if parsed layout is a flat array of strings from the previous simple layout system
          if (parsed.length > 0 && typeof parsed[0] === "string") {
            const mapped = [];
            parsed.forEach(strId => {
              if (strId === "goal") {
                mapped.push({ id: "widget_goal", w: 4, h: 1 });
                mapped.push({ id: "widget_dailyGoal", w: 4, h: 1 });
              } else if (strId === "stats") {
                mapped.push({ id: "stat_netPnl", w: 1, h: 1 });
                mapped.push({ id: "stat_growth", w: 1, h: 1 });
                mapped.push({ id: "stat_winRate", w: 1, h: 1 });
                mapped.push({ id: "stat_bestTrade", w: 1, h: 1 });
                mapped.push({ id: "stat_worstTrade", w: 1, h: 1 });
                mapped.push({ id: "stat_avgRR", w: 1, h: 1 });
                mapped.push({ id: "stat_streak", w: 1, h: 1 });
                mapped.push({ id: "stat_profitFactor", w: 1, h: 1 });
                mapped.push({ id: "stat_dayWinRate", w: 1, h: 1 });
                mapped.push({ id: "stat_avgWinLoss", w: 1, h: 1 });
                mapped.push({ id: "stat_totalLot", w: 1, h: 1 });
                mapped.push({ id: "stat_duration", w: 1, h: 1 });
                mapped.push({ id: "widget_notes", w: 2, h: 2 });
              } else if (strId === "chart") {
                mapped.push({ id: "widget_chart", w: 4, h: 2 });
              } else if (strId === "fields") {
                mapped.push({ id: "widget_fields", w: 4, h: 2 });
              } else if (strId === "trades") {
                mapped.push({ id: "widget_trades", w: 4, h: 2 });
              }
            });
            parsed = mapped;
          }

          const parsedIds = parsed.map(item => item.id);
          const filtered = parsed.filter(item => DEFAULT_LAYOUT.some(d => d.id === item.id));
          const missing = DEFAULT_LAYOUT.filter(d => !parsedIds.includes(d.id));
          setLayoutOrder([...filtered, ...missing]);
        } catch (e) {
          setLayoutOrder(DEFAULT_LAYOUT);
        }
      } else {
        setLayoutOrder(DEFAULT_LAYOUT);
      }
    } else {
      setLayoutOrder([
        { id: "widget_goal", w: 4, h: 1 },
        { id: "widget_dailyGoal", w: 4, h: 1 },
        { id: "stat_netPnl", w: 1, h: 1 },
        { id: "stat_growth", w: 1, h: 1 },
        { id: "stat_winRate", w: 1, h: 1 },
        { id: "stat_bestTrade", w: 1, h: 1 },
        { id: "stat_worstTrade", w: 1, h: 1 },
        { id: "stat_avgRR", w: 1, h: 1 },
        { id: "stat_streak", w: 1, h: 1 },
        { id: "stat_profitFactor", w: 1, h: 1 },
        { id: "stat_dayWinRate", w: 1, h: 1 },
        { id: "stat_avgWinLoss", w: 1, h: 1 },
        { id: "stat_totalLot", w: 1, h: 1 },
        { id: "stat_duration", w: 1, h: 1 },
        { id: "widget_realtime_prices", w: 2, h: 1 },
        { id: "widget_notes", w: 2, h: 2 },
        { id: "widget_chart", w: 4, h: 2 },
        { id: "widget_fields", w: 4, h: 2 },
        { id: "widget_trades", w: 4, h: 2 }
      ]);
    }
  }, [activeProfile]);

  // Reordering handler
  const moveLayoutSection = (widgetId, direction) => {
    const currentIndex = layoutOrder.findIndex(item => item.id === widgetId);
    if (currentIndex === -1) return;

    const newIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= layoutOrder.length) return;

    const newLayoutOrder = [...layoutOrder];
    const temp = newLayoutOrder[currentIndex];
    newLayoutOrder[currentIndex] = newLayoutOrder[newIndex];
    newLayoutOrder[newIndex] = temp;

    setLayoutOrder(newLayoutOrder);

    if (activeProfile) {
      localStorage.setItem(
        `dashboard_layout_${activeProfile.id}`,
        JSON.stringify(newLayoutOrder),
      );
      triggerAutoBackup();
    }
  };

  // Dimensional resize handler
  const resizeWidget = (widgetId, dim, amount) => {
    const newLayoutOrder = layoutOrder.map(item => {
      if (item.id === widgetId) {
        const val = item[dim] || 1;
        const newVal = Math.max(1, Math.min(4, val + amount));
        return { ...item, [dim]: newVal };
      }
      return item;
    });

    setLayoutOrder(newLayoutOrder);

    if (activeProfile) {
      localStorage.setItem(
        `dashboard_layout_${activeProfile.id}`,
        JSON.stringify(newLayoutOrder),
      );
      triggerAutoBackup();
    }
  };

  // Long press event handlers
  const handleLongPressStart = (e) => {
    if (isLayoutEditMode) return;

    const targetTag = e.target.tagName.toLowerCase();
    if (
      targetTag === "button" ||
      targetTag === "input" ||
      targetTag === "select" ||
      targetTag === "a" ||
      targetTag === "textarea" ||
      e.target.closest("button") ||
      e.target.closest("a") ||
      e.target.closest(".interactive-element")
    ) {
      return;
    }

    isPressing.current = true;
    longPressTimeout.current = setTimeout(() => {
      if (isPressing.current) {
        setIsLayoutEditMode(true);
        showToast("Mode Edit Tata Letak Aktif! Gunakan overlay untuk menyesuaikan.", "info");
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }
      }
    }, 800);
  };

  const handleLongPressEnd = () => {
    isPressing.current = false;
    if (longPressTimeout.current) {
      clearTimeout(longPressTimeout.current);
    }
  };

  const handleLongPressMove = () => {
    isPressing.current = false;
    if (longPressTimeout.current) {
      clearTimeout(longPressTimeout.current);
    }
  };

  // Widget label mapping
  const getWidgetTitle = (id) => {
    switch (id) {
      case "widget_goal": return "Goal Progress";
      case "widget_dailyGoal": return "Daily Goal Progress";
      case "stat_netPnl": return "Net P&L";
      case "stat_growth": return "Account Growth";
      case "stat_winRate": return "Trade Win %";
      case "stat_bestTrade": return "Best Trade";
      case "stat_worstTrade": return "Worst Trade";
      case "stat_avgRR": return "Avg R:R Ratio";
      case "stat_streak": return "Streak W/L";
      case "stat_profitFactor": return "Profit Factor";
      case "stat_dayWinRate": return "Day Win %";
      case "stat_avgWinLoss": return "Avg Win/Loss";
      case "stat_totalLot": return "Total Lot";
      case "stat_duration": return "Durasi Trading";
      case "widget_realtime_prices": return "Pantauan Harga Live";
      case "widget_notes": return "Catatan & Quotes";
      case "widget_chart": return "Grafik Performa";
      case "widget_fields": return "Tabel Performa Field";
      case "widget_trades": return "Riwayat Trade";
      default: return "Widget";
    }
  };

  const getColSpanClass = (w) => {
    switch (w) {
      case 1: return "md:col-span-1 col-span-1";
      case 2: return "md:col-span-2 col-span-1";
      case 3: return "md:col-span-3 col-span-1";
      case 4: return "md:col-span-4 col-span-1";
      default: return "md:col-span-1 col-span-1";
    }
  };

  const getRowSpanClass = (h) => {
    switch (h) {
      case 1: return "row-span-1";
      case 2: return "row-span-2";
      case 3: return "row-span-3";
      case 4: return "row-span-4";
      default: return "row-span-1";
    }
  };

  const getChartHeightClass = (h) => {
    switch (h) {
      case 1: return "h-40";
      case 2: return "h-80";
      case 3: return "h-[500px]";
      case 4: return "h-[700px]";
      default: return "h-80";
    }
  };


  // Visual layout controller overlay
  const renderLayoutControls = (widget) => {
    const currentIndex = layoutOrder.findIndex((item) => item.id === widget.id);
    const isFirst = currentIndex === 0;
    const isLast = currentIndex === layoutOrder.length - 1;

    return (
      <div className="absolute inset-0 bg-blue-600/10 backdrop-blur-[1.5px] border-2 border-blue-500 rounded-xl z-20 flex items-center justify-center transition-all duration-200 animate-fadeIn">
        <div className="bg-gray-950/95 border border-gray-800 px-4 py-3 rounded-2xl flex flex-col items-center gap-2.5 shadow-[0_10px_35px_rgba(59,130,246,0.45)] w-[85%] max-w-[200px] text-center select-none">
          <div className="text-[10px] font-bold text-blue-400 uppercase tracking-widest truncate max-w-full">
            {getWidgetTitle(widget.id)}
          </div>

          <div className="h-[1px] w-full bg-gray-800"></div>

          {/* Reordering Row */}
          <div className="flex items-center justify-between w-full">
            <button
              onClick={(e) => {
                e.stopPropagation();
                moveLayoutSection(widget.id, "up");
              }}
              disabled={isFirst}
              className={`p-1.5 rounded-lg border flex items-center justify-center transition-all ${isFirst
                ? "bg-gray-900 text-gray-700 border-gray-800 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-500 text-white border-blue-400/30 hover:scale-105 active:scale-95 shadow-[0_0_8px_rgba(59,130,246,0.4)]"
                }`}
              title="Pindahkan ke Depan"
            >
              <ArrowLeft size={14} />
            </button>
            <span className="text-[10px] font-bold text-gray-300 uppercase">Urutan</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                moveLayoutSection(widget.id, "down");
              }}
              disabled={isLast}
              className={`p-1.5 rounded-lg border flex items-center justify-center transition-all ${isLast
                ? "bg-gray-900 text-gray-700 border-gray-800 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-500 text-white border-blue-400/30 hover:scale-105 active:scale-95 shadow-[0_0_8px_rgba(59,130,246,0.4)]"
                }`}
              title="Pindahkan ke Belakang"
            >
              <ArrowRight size={14} />
            </button>
          </div>

          <div className="h-[1px] w-full bg-gray-800"></div>

          {/* Dimension Controls */}
          <div className="flex flex-col gap-2 w-full text-[9px] font-semibold text-gray-400 uppercase">
            {/* Width Selector */}
            <div className="flex items-center justify-between w-full">
              <span>Lebar</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    resizeWidget(widget.id, "w", -1);
                  }}
                  disabled={widget.w <= 1}
                  className={`w-5 h-5 rounded flex items-center justify-center text-xs font-bold transition-all ${widget.w <= 1
                    ? "bg-gray-900 text-gray-700 cursor-not-allowed"
                    : "bg-gray-800 hover:bg-gray-700 text-white hover:scale-105"
                    }`}
                >
                  -
                </button>
                <span className="text-xs font-bold text-blue-400 w-4 text-center">{widget.w}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    resizeWidget(widget.id, "w", 1);
                  }}
                  disabled={widget.w >= 4}
                  className={`w-5 h-5 rounded flex items-center justify-center text-xs font-bold transition-all ${widget.w >= 4
                    ? "bg-gray-900 text-gray-700 cursor-not-allowed"
                    : "bg-gray-800 hover:bg-gray-700 text-white hover:scale-105"
                    }`}
                >
                  +
                </button>
              </div>
            </div>

            {/* Height Selector */}
            <div className="flex items-center justify-between w-full">
              <span>Tinggi</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    resizeWidget(widget.id, "h", -1);
                  }}
                  disabled={widget.h <= 1}
                  className={`w-5 h-5 rounded flex items-center justify-center text-xs font-bold transition-all ${widget.h <= 1
                    ? "bg-gray-900 text-gray-700 cursor-not-allowed"
                    : "bg-gray-800 hover:bg-gray-700 text-white hover:scale-105"
                    }`}
                >
                  -
                </button>
                <span className="text-xs font-bold text-blue-400 w-4 text-center">{widget.h}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    resizeWidget(widget.id, "h", 1);
                  }}
                  disabled={widget.h >= 4}
                  className={`w-5 h-5 rounded flex items-center justify-center text-xs font-bold transition-all ${widget.h >= 4
                    ? "bg-gray-900 text-gray-700 cursor-not-allowed"
                    : "bg-gray-800 hover:bg-gray-700 text-white hover:scale-105"
                    }`}
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const periods = useMemo(
    () => [
      { key: "all", label: "Semua" },
      { key: "daily", label: "Harian" },
      { key: "weekly", label: "Mingguan" },
      { key: "monthly", label: "Bulanan" },
      { key: "yearly", label: "Tahunan" },
      { key: "custom", label: "Kustom" },
    ],
    [],
  );

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  const refreshProfiles = useCallback(async () => {
    const profilesData = await getAllItems("profiles");
    const sortedProfiles = profilesData.sort(
      (a, b) => a.createdAt - b.createdAt,
    );
    setTradingProfiles(sortedProfiles);

    setActiveProfile((prevActive) => {
      if (prevActive) {
        if (prevActive.id === "all") return prevActive;
        const updatedActive = sortedProfiles.find((p) => p.id === prevActive.id);
        if (updatedActive) {
          // Compare properties to avoid redundant state updates
          if (
            updatedActive.name !== prevActive.name ||
            updatedActive.description !== prevActive.description ||
            updatedActive.avatar !== prevActive.avatar ||
            updatedActive.currency !== prevActive.currency
          ) {
            return updatedActive;
          }
          return prevActive;
        } else {
          const newActiveProfile = sortedProfiles.length > 0 ? sortedProfiles[0] : null;
          if (newActiveProfile) {
            localStorage.setItem("activeProfileId", newActiveProfile.id);
          } else {
            localStorage.removeItem("activeProfileId");
          }
          return newActiveProfile;
        }
      } else if (sortedProfiles.length > 0) {
        const lastProfileId = localStorage.getItem("activeProfileId");
        if (lastProfileId === "all") {
          return { id: "all", name: "Semua Akun", currency: "MIX", description: "Gabungan seluruh akun" };
        }
        const lastProfile = sortedProfiles.find((p) => p.id === lastProfileId);
        const nextActive = lastProfile || sortedProfiles[0];
        localStorage.setItem("activeProfileId", nextActive.id);
        return nextActive;
      }
      return null;
    });
  }, []);

  const triggerAutoBackup = useCallback(async () => {
    const token = localStorage.getItem("gdrive_sync_token");
    if (!token) return;
    try {
      console.log("Memulai pencadangan latar belakang...");
      const backupData = await exportIndexedDB();
      const scanRes = await fetch(
        "https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name)",
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      let fileId = null;
      if (scanRes.ok) {
        const data = await scanRes.json();
        const backupFile = data.files.find(f => f.name === "trading_journal_backup.json");
        fileId = backupFile?.id;
      }
      const fileMetadata = {
        name: "trading_journal_backup.json",
        parents: ["appDataFolder"]
      };
      const fileBlob = new Blob([JSON.stringify(backupData)], { type: "application/json" });
      let uploadRes;
      if (fileId) {
        uploadRes = await fetch(
          `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: fileBlob
          }
        );
      } else {
        const form = new FormData();
        form.append("metadata", new Blob([JSON.stringify(fileMetadata)], { type: "application/json" }));
        form.append("file", fileBlob);
        uploadRes = await fetch(
          "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: form
          }
        );
      }
      if (uploadRes.ok) {
        console.log("Pencadangan latar belakang berhasil!");
        const now = new Date().toLocaleString("id-ID", {
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        });
        if (activeProfile) {
          localStorage.setItem(`gdrive_last_sync_${activeProfile.id}`, now);
        }
      } else {
        console.warn("Pencadangan latar belakang gagal: Google Drive API Error");
      }
    } catch (e) {
      console.error("Gagal melakukan pencadangan latar belakang:", e);
    }
  }, [activeProfile]);

  const handleDashboardBackup = async () => {
    const token = getStoredToken();
    if (!token) {
      showToast("Silakan hubungkan akun Google terlebih dahulu di menu Sinkronisasi Cloud.", "error");
      setActiveView("sync");
      return;
    }
    setIsDashboardSyncing(true);
    showToast("Sedang menyinkronkan data dengan Google Sheets & Drive...", "info");
    try {
      const res = await syncTwoWayWithGoogle();
      if (res.success) {
        showToast("Sinkronisasi 2 arah berhasil!", "success");
        if (activeProfile) {
          refreshAllData(activeProfile.id, false);
        }
      } else {
        showToast(res.error || "Gagal melakukan sinkronisasi.", "error");
      }
    } catch {
      showToast("Gagal melakukan sinkronisasi dengan Google.", "error");
    } finally {
      setIsDashboardSyncing(false);
    }
  };

  const handleDashboardRestore = async () => {
    await handleDashboardBackup();
  };

  const refreshAllData = useCallback(async (profileId, shouldBackup = false) => {
    if (!profileId) {
      setTrades([]);
      setPairs([]);
      setTemplates([]);
      setCustomFields([]);
      setBalanceTransactions([]);
      setStrategies([]);
      setGoalSettings(null);
      setInitialBalance(0);
      return;
    }

    let tradesData, pairsData, templatesData, customFieldsData, balanceData, goalData, strategiesData;

    if (profileId === "all") {
      const profilesData = await getAllItems("profiles");
      const validProfileIds = profilesData.map(p => p.id);

      const [allTrades, allPairs, allTemplates, allCustomFields, allBalance, allStrategies] = await Promise.all([
        getAllItems("trades"),
        getAllItems("pairs"),
        getAllItems("templates"),
        getAllItems("custom_fields"),
        getAllItems("balance_transactions"),
        getAllItems("strategies"),
      ]);

      tradesData = allTrades.filter(t => validProfileIds.includes(t.profileId));
      pairsData = allPairs.filter(t => validProfileIds.includes(t.profileId));
      templatesData = allTemplates.filter(t => validProfileIds.includes(t.profileId));
      
      const rawCustomFields = allCustomFields.filter(t => validProfileIds.includes(t.profileId));
      const uniqueCFMap = new Map();
      rawCustomFields.forEach(cf => {
        if (!uniqueCFMap.has(cf.name)) uniqueCFMap.set(cf.name, cf);
      });
      customFieldsData = Array.from(uniqueCFMap.values());

      balanceData = allBalance.filter(t => validProfileIds.includes(t.profileId));
      strategiesData = allStrategies.filter(t => validProfileIds.includes(t.profileId));
      goalData = null;
    } else {
      [
        tradesData,
        pairsData,
        templatesData,
        customFieldsData,
        balanceData,
        goalData,
        strategiesData,
      ] = await Promise.all([
        getItemsByProfileId("trades", profileId),
        getItemsByProfileId("pairs", profileId),
        getItemsByProfileId("templates", profileId),
        getItemsByProfileId("custom_fields", profileId),
        getItemsByProfileId("balance_transactions", profileId),
        getItem("goals", profileId),
        getItemsByProfileId("strategies", profileId),
      ]);
    }

    setTrades(tradesData);
    setPairs(pairsData.sort((a, b) => a.createdAt - b.createdAt));
    setTemplates(templatesData.sort((a, b) => a.name.localeCompare(b.name)));
    setCustomFields(
      customFieldsData.sort((a, b) => {
        const aOrder = a.order !== undefined ? a.order : new Date(a.createdAt).getTime();
        const bOrder = b.order !== undefined ? b.order : new Date(b.createdAt).getTime();
        return aOrder - bOrder;
      })
    );
    setBalanceTransactions(balanceData.sort((a, b) => new Date(b.date) - new Date(a.date)));
    setStrategies(strategiesData.sort((a, b) => b.createdAt - a.createdAt));
    setGoalSettings(goalData);

    const totalDeposits = balanceData
      .filter((t) => t.type === "deposit")
      .reduce((sum, t) => sum + t.amount, 0);
    const totalWithdrawals = balanceData
      .filter((t) => t.type === "withdrawal")
      .reduce((sum, t) => sum + t.amount, 0);
    setInitialBalance(totalDeposits - totalWithdrawals);

    if (shouldBackup) {
      triggerAutoBackup();
    }
  }, []);

  useEffect(() => {
    initDB().then(() => {
      console.log("Database initialized");
    });

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
      if (currentUser) {
        refreshProfiles().then(() => setIsLoading(false));
      } else {
        setActiveProfile(null);
        setTradingProfiles([]);
        refreshAllData(null);
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, [refreshProfiles, refreshAllData]);

  useEffect(() => {
    if (activeProfile) {
      refreshAllData(activeProfile.id);
    } else if (!isLoading && user) {
      refreshAllData(null);
    }
  }, [activeProfile, isLoading, user, refreshAllData]);

  const handleSelectProfile = (profile) => {
    setActiveProfile(profile);
    localStorage.setItem("activeProfileId", profile.id);
  };

  const handleLogin = async (email, password) => {
    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password,
      );
      const user = userCredential.user;

      const currentFingerprint = await generateDeviceFingerprint();
      const deviceDocRef = doc(db, "device_auths", user.uid);
      const docSnap = await getDoc(deviceDocRef);

      if (docSnap.exists()) {
        const storedFingerprint = docSnap.data().fingerprint;
        if (storedFingerprint !== currentFingerprint) {
          setLoginError(
            "Akun ini sudah terdaftar di perangkat lain. Silakan login di perangkat pertama Anda.",
          );
          await signOut(auth);
          return;
        }
      } else {
        await setDoc(deviceDocRef, {
          fingerprint: currentFingerprint,
          createdAt: new Date(),
          email: user.email,
          userAgent: navigator.userAgent,
        });
      }

      setLoginError("");
    } catch (error) {
      console.error("Login failed:", error);
      if (
        error.code === "auth/invalid-credential" ||
        error.code === "auth/wrong-password" ||
        error.code === "auth/user-not-found"
      ) {
        setLoginError("Email atau kata sandi yang Anda masukkan salah.");
      } else {
        setLoginError("Terjadi kesalahan. Silakan coba lagi.");
      }
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      showToast("Anda telah berhasil keluar.", "success");
    } catch (error) {
      console.error("Logout failed:", error);
      showToast("Gagal keluar.", "error");
    }
  };

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast({ message: "", type: "" }), 3000);
  };

  const handleShowTradeDetail = (trade) => {
    setViewingTrade(trade);
  };

  const handleNavigateDetail = (direction) => {
    if (!viewingTrade) return;

    let activeList = [];
    if (activeView === "gallery") {
      activeList = activeGalleryTrades || [];
    } else if (activeView === "dashboard") {
      activeList = sortedTrades || [];
    } else {
      activeList = [...trades].sort((a, b) => new Date(b.tradeDate).getTime() - new Date(a.tradeDate).getTime());
    }

    if (activeList.length <= 1) return;

    const currentIndex = activeList.findIndex((t) => t.id === viewingTrade.id);
    if (currentIndex === -1) return;

    let nextIndex = currentIndex;
    if (direction === "next") {
      nextIndex = (currentIndex + 1) % activeList.length;
    } else if (direction === "prev") {
      nextIndex = (currentIndex - 1 + activeList.length) % activeList.length;
    }

    setViewingTrade(activeList[nextIndex]);
  };

  const handleSaveTrade = async (tradeData, beforeFile, afterFile) => {
    if (!activeProfile) return;

    const isEditing = !!editingTrade?.id;
    const finalTradeData = { ...tradeData };

    try {
      if (isEditing) {
        if (beforeFile && editingTrade.screenshotBeforeId)
          await deleteItem("trade_images", editingTrade.screenshotBeforeId);
        if (afterFile && editingTrade.screenshotAfterId)
          await deleteItem("trade_images", editingTrade.screenshotAfterId);
      }

      if (beforeFile) {
        const newId = crypto.randomUUID();
        await addItem("trade_images", { id: newId, file: beforeFile });
        finalTradeData.screenshotBeforeId = newId;

        // If Google Drive connected, upload in background and update URL
        if (getStoredToken()) {
          uploadImageToDrive(beforeFile, `before_${newId}.png`)
            .then(async (uploaded) => {
              finalTradeData.screenshotBeforeId = uploaded.directUrl;
              await updateItem("trades", finalTradeData);
              scheduleDebouncedSync(2000);
            })
            .catch((err) => console.warn("Drive image upload error:", err));
        }
      }
      if (afterFile) {
        const newId = crypto.randomUUID();
        await addItem("trade_images", { id: newId, file: afterFile });
        finalTradeData.screenshotAfterId = newId;

        // If Google Drive connected, upload in background and update URL
        if (getStoredToken()) {
          uploadImageToDrive(afterFile, `after_${newId}.png`)
            .then(async (uploaded) => {
              finalTradeData.screenshotAfterId = uploaded.directUrl;
              await updateItem("trades", finalTradeData);
              scheduleDebouncedSync(2000);
            })
            .catch((err) => console.warn("Drive image upload error:", err));
        }
      }

      if (isEditing) {
        await updateItem("trades", {
          ...finalTradeData,
          updatedAt: new Date(),
        });
      } else {
        await addItem("trades", {
          ...finalTradeData,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      showToast(
        isEditing ? "Trade berhasil diupdate!" : "Trade berhasil ditambah!",
        "success",
      );
      setEditingTrade(null);
      setIsTradeFormVisible(false);
      refreshAllData(activeProfile.id, false);

      // Trigger auto-sync to Google Sheets & Drive
      scheduleDebouncedSync(3000);
    } catch (e) {
      console.error(e);
      showToast("Gagal menyimpan trade.", "error");
    }
  };

  const handleCloseTrade = async (trade) => {
    if (!activeProfile || !trade) return;
    try {
      const now = new Date();
      await updateItem("trades", {
        ...trade,
        exitDate: now,
        updatedAt: now,
      });
      showToast("Trade berhasil ditutup!", "success");
      refreshAllData(activeProfile.id, false);
      scheduleDebouncedSync(2000);
    } catch (e) {
      console.error(e);
      showToast("Gagal menutup trade.", "error");
    }
  };

  const openDeleteModal = (type, data) => {
    setItemToDelete({ type, data });
    setIsDeleteModalOpen(true);
  };

  const handleDeleteItem = async () => {
    if (!itemToDelete) return;
    const { type, data } = itemToDelete;

    try {
      if (type === "profile") {
        await handleDeleteProfile(data);
        return;
      }

      if (type === "trade") {
        if (data.screenshotBeforeId)
          await deleteItem("trade_images", data.screenshotBeforeId);
        if (data.screenshotAfterId)
          await deleteItem("trade_images", data.screenshotAfterId);
      }

      if (!activeProfile) return;

      if (type === "custom_field") {
        try {
          const templatesToClean = templates.filter(
            (t) => t.customData && t.customData.hasOwnProperty(data.name)
          );
          for (const t of templatesToClean) {
            const updatedCustomData = { ...t.customData };
            delete updatedCustomData[data.name];
            await updateItem("templates", {
              ...t,
              customData: updatedCustomData,
              updatedAt: new Date(),
            });
          }
        } catch (err) {
          console.error("Gagal membersihkan template dari field tambahan:", err);
        }
      }

      let storeName = "";
      let itemName = "";
      switch (type) {
        case "trade":
          storeName = "trades";
          itemName = "Trade";
          break;
        case "transaction":
          storeName = "balance_transactions";
          itemName = "Transaksi";
          break;
        case "pair":
          storeName = "pairs";
          itemName = "Pair";
          break;
        case "template":
          storeName = "templates";
          itemName = "Template";
          break;
        case "custom_field":
          storeName = "custom_fields";
          itemName = "Field";
          break;
        case "strategy":
          storeName = "strategies";
          itemName = "Strategi";
          if (data.imageIds && data.imageIds.length > 0) {
            for (const imgId of data.imageIds) {
              try {
                await deleteItem("trade_images", imgId);
              } catch (err) {
                console.error("Gagal menghapus gambar strategi dari DB:", err);
              }
            }
          }
          break;
        default:
          return;
      }

      await deleteItem(storeName, data.id);
      showToast(`${itemName} berhasil dihapus.`, "success");
      refreshAllData(activeProfile.id, false);
      scheduleDebouncedSync(2000);
    } catch (e) {
      console.error(`Error deleting ${type}:`, e);
      showToast(`Gagal menghapus item.`, "error");
    } finally {
      setItemToDelete(null);
      setIsDeleteModalOpen(false);
    }
  };

  const handleDeleteProfile = async (profileToDelete) => {
    if (!profileToDelete) return;

    showToast(`Menghapus profil '${profileToDelete.name}'...`, "info");

    try {
      const storesToClear = [
        "trades",
        "balance_transactions",
        "pairs",
        "templates",
        "custom_fields",
        "goals",
        "strategies",
      ];

      const tradesToDelete = await getItemsByProfileId(
        "trades",
        profileToDelete.id,
      );
      for (const trade of tradesToDelete) {
        if (trade.screenshotBeforeId)
          await deleteItem("trade_images", trade.screenshotBeforeId);
        if (trade.screenshotAfterId)
          await deleteItem("trade_images", trade.screenshotAfterId);
      }

      for (const storeName of storesToClear) {
        const items = await getItemsByProfileId(storeName, profileToDelete.id);
        for (const item of items) {
          await deleteItem(storeName, item.id);
        }
      }

      await deleteItem("profiles", profileToDelete.id);
      showToast(
        `Profil '${profileToDelete.name}' dan semua datanya berhasil dihapus.`,
        "success",
      );

      refreshProfiles();
    } catch (error) {
      console.error("Error deleting profile and its data:", error);
      showToast("Gagal menghapus profil secara lengkap.", "error");
    } finally {
      setItemToDelete(null);
      setIsDeleteModalOpen(false);
    }
  };

  const filteredTrades = useMemo(() => {
    if (!activeProfile) return [];

    if (activePeriod === "yearly") {
      const yearNumber = parseInt(selectedYear, 10);
      if (!yearNumber || String(yearNumber).length < 4) return [];
      return trades.filter(
        (t) =>
          t.tradeDate && new Date(t.tradeDate).getFullYear() === yearNumber,
      );
    }

    if (activePeriod === "monthly") {
      const yearNumber = parseInt(selectedYear, 10);
      const monthNumber = parseInt(selectedMonth, 10);
      if (!yearNumber || String(yearNumber).length < 4 || isNaN(monthNumber)) return [];
      return trades.filter((t) => {
        if (!t.tradeDate) return false;
        const d = new Date(t.tradeDate);
        return d.getFullYear() === yearNumber && d.getMonth() === monthNumber;
      });
    }

    const getStartOfDate = (dateString) => {
      const date = new Date(dateString);
      date.setHours(0, 0, 0, 0);
      return date;
    };

    const getEndOfDate = (dateString) => {
      const date = new Date(dateString);
      date.setHours(23, 59, 59, 999);
      return date;
    };

    const filterFn = (allTrades, period) => {
      if (period === "all") return allTrades;

      if (period === "custom") {
        if (!customStartDate || !customEndDate) return [];
        const start = getStartOfDate(customStartDate);
        const end = getEndOfDate(customEndDate);
        return allTrades.filter((t) => {
          const tradeDate = t.tradeDate ? new Date(t.tradeDate) : new Date(0);
          return tradeDate >= start && tradeDate <= end;
        });
      }

      const now = new Date();
      const startOfPeriod = new Date(now);
      switch (period) {
        case "daily":
          startOfPeriod.setHours(0, 0, 0, 0);
          break;
        case "weekly":
          const d = now.getDay();
          startOfPeriod.setDate(now.getDate() - d + (d === 0 ? -6 : 1));
          startOfPeriod.setHours(0, 0, 0, 0);
          break;
        case "monthly":
          startOfPeriod.setDate(1);
          startOfPeriod.setHours(0, 0, 0, 0);
          break;
        case "yearly":
          startOfPeriod.setMonth(0, 1);
          startOfPeriod.setHours(0, 0, 0, 0);
          break;
        default:
          break;
      }
      return allTrades.filter(
        (t) => (t.tradeDate ? new Date(t.tradeDate) : new Date(0)) >= startOfPeriod,
      );
    };
    return filterFn(trades, activePeriod);
  }, [
    trades,
    activePeriod,
    activeProfile,
    customStartDate,
    customEndDate,
    selectedYear,
    selectedMonth,
  ]);

  const requestSort = (key) => {
    let direction = "ascending";
    if (sortConfig.key === key && sortConfig.direction === "ascending") {
      direction = "descending";
    }
    setSortConfig({ key, direction });
  };

  const sortedTrades = useMemo(() => {
    let sortableTrades = [...filteredTrades];
    if (sortConfig.key !== null) {
      sortableTrades.sort((a, b) => {
        const isCustom = customFields.some((f) => f.name === sortConfig.key);

        const aValue = isCustom
          ? (a.customData?.[sortConfig.key] ?? "")
          : (a[sortConfig.key] ?? "");
        const bValue = isCustom
          ? (b.customData?.[sortConfig.key] ?? "")
          : (b[sortConfig.key] ?? "");

        let comparison = 0;

        if (aValue instanceof Date && bValue instanceof Date) {
          comparison = aValue.getTime() - bValue.getTime();
        } else if (typeof aValue === "number" && typeof bValue === "number") {
          comparison = aValue - bValue;
        } else {
          comparison = String(aValue).localeCompare(String(bValue), undefined, {
            numeric: true,
            sensitivity: "base",
          });
        }

        if (comparison === 0) {
          const aDate = a.tradeDate ? new Date(a.tradeDate).getTime() : 0;
          const bDate = b.tradeDate ? new Date(b.tradeDate).getTime() : 0;
          return bDate - aDate;
        }

        return sortConfig.direction === "ascending" ? comparison : -comparison;
      });
    }
    return sortableTrades;
  }, [filteredTrades, sortConfig, customFields]);

  const performanceStats = useMemo(() => {
    const defaultStats = {
      netPnl: 0,
      tradeWinRate: 0,
      wins: 0,
      losses: 0,
      profitFactor: 0,
      dayWinRate: 0,
      profitableDays: 0,
      losingDays: 0,
      avgWinLossRatio: 0,
      avgWin: 0,
      avgLoss: 0,
      grossProfit: 0,
      grossLoss: 0,
      avgRiskReward: 0,
      totalLotUsed: 0,
      consecutiveWins: 0,
      consecutiveLosses: 0,
      growthPercentage: 0,
      bestTrade: 0,
      worstTrade: 0,
      bestRR: 0,
      avgDuration: "-",
      maxDuration: "-",
      minDuration: "-",
    };
    if (!activeProfile) return defaultStats;

    const statsTrades = [...filteredTrades].sort(
      (a, b) => new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime(),
    );
    if (statsTrades.length === 0) return defaultStats;

    const winningTrades = statsTrades.filter((t) => parseFloat(t.pnl) > 0);
    const losingTrades = statsTrades.filter((t) => parseFloat(t.pnl) < 0);
    const wins = winningTrades.length;
    const losses = losingTrades.length;
    const totalTrades = statsTrades.length;
    const grossProfit = winningTrades.reduce(
      (s, t) => s + parseFloat(t.pnl),
      0,
    );
    const grossLoss = Math.abs(
      losingTrades.reduce((s, t) => s + parseFloat(t.pnl), 0),
    );
    const netPnl = grossProfit - grossLoss;
    const tradeWinRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : Infinity;
    const avgWin = wins > 0 ? grossProfit / wins : 0;
    const avgLoss = losses > 0 ? -grossLoss / losses : 0;
    const avgWinLossRatio =
      avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : Infinity;
    const dailyPnl = new Map();
    statsTrades.forEach((t) => {
      const d = formatDate(t.tradeDate);
      if (d && d !== "N/A")
        dailyPnl.set(d, (dailyPnl.get(d) || 0) + (parseFloat(t.pnl) || 0));
    });
    let pDays = 0,
      lDays = 0;
    dailyPnl.forEach((pnl) => {
      if (pnl > 0) pDays++;
      else if (pnl < 0) lDays++;
    });
    const totalTradingDays = pDays + lDays;
    const dayWinRate =
      totalTradingDays > 0 ? (pDays / totalTradingDays) * 100 : 0;
    const tradesWithRR = statsTrades
      .map((t) => parseFloat(t.riskRewardRatio) || 0)
      .filter((rr) => rr > 0);
    const totalRR = tradesWithRR.reduce((s, rr) => s + rr, 0);
    const avgRiskReward =
      tradesWithRR.length > 0 ? totalRR / tradesWithRR.length : 0;
    const totalLotUsed = statsTrades.reduce(
      (s, t) => s + (parseFloat(t.lotSize) || 0),
      0,
    );

    let maxWins = 0;
    let currentWins = 0;
    let maxLosses = 0;
    let currentLosses = 0;
    for (const trade of statsTrades) {
      const pnl = parseFloat(trade.pnl) || 0;
      if (pnl > 0) {
        currentWins++;
        currentLosses = 0;
        if (currentWins > maxWins) {
          maxWins = currentWins;
        }
      } else if (pnl < 0) {
        currentLosses++;
        currentWins = 0;
        if (currentLosses > maxLosses) {
          maxLosses = currentLosses;
        }
      } else {
        currentWins = 0;
        currentLosses = 0;
      }
    }

    // Logic untuk Best Trade, Worst Trade, & Best RR
    const allPnls = statsTrades.map((t) => parseFloat(t.pnl) || 0);
    const bestTrade = allPnls.length > 0 ? Math.max(...allPnls) : 0;
    const worstTrade = allPnls.length > 0 ? Math.min(...allPnls) : 0;

    const allRRs = statsTrades.map((t) => parseFloat(t.riskRewardRatio) || 0);
    const bestRR = allRRs.length > 0 ? Math.max(...allRRs) : 0;

    // Calculate durations for closed trades
    const closedTrades = statsTrades.filter(t => t.tradeDate && t.exitDate);
    const durations = closedTrades
      .map(t => {
        const entry = t.tradeDate instanceof Date ? t.tradeDate : new Date(t.tradeDate);
        const exit = t.exitDate instanceof Date ? t.exitDate : new Date(t.exitDate);
        return exit.getTime() - entry.getTime();
      })
      .filter(d => d >= 0); // ignore anomalous values

    const avgDuration = durations.length > 0
      ? formatDurationMs(durations.reduce((sum, d) => sum + d, 0) / durations.length)
      : "-";
    const maxDuration = durations.length > 0
      ? formatDurationMs(Math.max(...durations))
      : "-";
    const minDuration = durations.length > 0
      ? formatDurationMs(Math.min(...durations))
      : "-";

    // Calculate starting balance of the active period
    let startOfPeriod;
    if (activePeriod === "custom") {
      startOfPeriod = customStartDate ? new Date(customStartDate) : new Date(0);
      startOfPeriod.setHours(0, 0, 0, 0);
    } else {
      const now = new Date();
      startOfPeriod = new Date(now);
      switch (activePeriod) {
        case "daily":
          startOfPeriod.setHours(0, 0, 0, 0);
          break;
        case "weekly":
          const d = now.getDay();
          startOfPeriod.setDate(now.getDate() - d + (d === 0 ? -6 : 1));
          startOfPeriod.setHours(0, 0, 0, 0);
          break;
        case "monthly":
          startOfPeriod = new Date(parseInt(selectedYear, 10), parseInt(selectedMonth, 10), 1);
          startOfPeriod.setHours(0, 0, 0, 0);
          break;
        case "yearly":
          startOfPeriod = new Date(parseInt(selectedYear, 10), 0, 1);
          startOfPeriod.setHours(0, 0, 0, 0);
          break;
        default:
          startOfPeriod = new Date(0);
          break;
      }
    }

    const depositsBefore = balanceTransactions
      .filter((t) => new Date(t.date).getTime() < startOfPeriod.getTime())
      .reduce(
        (sum, t) => sum + (t.type === "deposit" ? t.amount : -t.amount),
        0,
      );

    const tradesBefore = trades
      .filter((t) => new Date(t.tradeDate).getTime() < startOfPeriod.getTime())
      .reduce((sum, t) => sum + (parseFloat(t.pnl) || 0), 0);

    const startingBalance = depositsBefore + tradesBefore;

    const totalDeposits = balanceTransactions
      .filter((t) => t.type === "deposit")
      .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);

    let growthPercentage = 0;
    if (activePeriod === "all" || startingBalance <= 0) {
      growthPercentage = totalDeposits > 0 ? (netPnl / totalDeposits) * 100 : 0;
    } else {
      growthPercentage = (netPnl / startingBalance) * 100;
    }
    let profileBreakdown = null;
    if (activeProfile?.id === "all" && tradingProfiles.length > 0) {
      profileBreakdown = tradingProfiles.map(p => {
        const pTrades = statsTrades.filter(t => t.profileId === p.id);
        const pNetPnl = pTrades.reduce((s, t) => s + (parseFloat(t.pnl) || 0), 0);
        
        const pDepositsBefore = balanceTransactions
          .filter(t => t.profileId === p.id && new Date(t.date).getTime() < startOfPeriod.getTime())
          .reduce((sum, t) => sum + (t.type === "deposit" ? t.amount : -t.amount), 0);
        const pTradesBefore = trades
          .filter(t => t.profileId === p.id && new Date(t.tradeDate).getTime() < startOfPeriod.getTime())
          .reduce((sum, t) => sum + (parseFloat(t.pnl) || 0), 0);
        const pStartingBalance = pDepositsBefore + pTradesBefore;
        
        const pTotalDeposits = balanceTransactions
          .filter(t => t.profileId === p.id && t.type === "deposit")
          .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);

        let pGrowthPercentage = 0;
        if (activePeriod === "all" || pStartingBalance <= 0) {
          pGrowthPercentage = pTotalDeposits > 0 ? (pNetPnl / pTotalDeposits) * 100 : 0;
        } else {
          pGrowthPercentage = (pNetPnl / pStartingBalance) * 100;
        }
        
        const pWins = pTrades.filter(t => (parseFloat(t.pnl) || 0) > 0).length;
        const pLosses = pTrades.filter(t => (parseFloat(t.pnl) || 0) <= 0).length;
        
        const pBestTrade = pTrades.length > 0 ? Math.max(...pTrades.map(t => parseFloat(t.pnl) || 0)) : 0;
        const pWorstTrade = pTrades.length > 0 ? Math.min(...pTrades.map(t => parseFloat(t.pnl) || 0)) : 0;

        return {
          id: p.id,
          name: p.name,
          currency: p.currency,
          netPnl: pNetPnl,
          growthPercentage: pGrowthPercentage,
          wins: pWins,
          losses: pLosses,
          bestTrade: pBestTrade,
          worstTrade: pWorstTrade,
        };
      });
    }

    return {
      profileBreakdown,
      netPnl,
      tradeWinRate,
      wins,
      losses,
      profitFactor,
      dayWinRate,
      profitableDays: pDays,
      losingDays: lDays,
      avgWinLossRatio,
      avgWin,
      avgLoss,
      grossProfit,
      grossLoss,
      avgRiskReward,
      totalLotUsed,
      consecutiveWins: maxWins,
      consecutiveLosses: maxLosses,
      growthPercentage,
      bestTrade,
      worstTrade,
      bestRR,
      avgDuration,
      maxDuration,
      minDuration,
    };
  }, [
    filteredTrades,
    activeProfile,
    activePeriod,
    customStartDate,
    balanceTransactions,
    trades,
    selectedYear,
    selectedMonth,
  ]);

  const accountStats = useMemo(() => {
    if (!activeProfile) return { chartData: [] };

    const allTradesForProfile = trades;
    const allTransactionsForProfile = balanceTransactions;

    const combinedEvents = [
      ...allTradesForProfile.map((t) => ({
        type: "trade",
        date: t.tradeDate,
        pnl: t.pnl,
      })),
      ...allTransactionsForProfile.map((t) => ({
        type: t.type,
        date: t.date,
        amount: t.amount,
      })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let cumulativeBalance = 0;
    const balanceHistory = [];
    combinedEvents.forEach((e) => {
      if (e.type === "trade") {
        cumulativeBalance += parseFloat(e.pnl) || 0;
      } else if (e.type === "deposit") {
        cumulativeBalance += parseFloat(e.amount) || 0;
      } else if (e.type === "withdrawal") {
        cumulativeBalance -= parseFloat(e.amount) || 0;
      }
      balanceHistory.push({
        name: formatDate(e.date),
        value: cumulativeBalance,
      });
    });

    let cumulativePnl = 0;
    const pnlHistory = [];
    allTradesForProfile
      .sort(
        (a, b) => new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime(),
      )
      .forEach((t) => {
        cumulativePnl += parseFloat(t.pnl) || 0;
        pnlHistory.push({
          name: formatDate(t.tradeDate),
          value: cumulativePnl,
        });
      });

    const periodFilteredData = () => {
      const sourceData = chartType === "balance" ? balanceHistory : pnlHistory;
      if (sourceData.length === 0) return [];
      if (activePeriod === "all") return sourceData;

      let startOfPeriod;
      let endOfPeriod = new Date();

      if (activePeriod === "yearly") {
        const yr = parseInt(selectedYear, 10);
        startOfPeriod = new Date(yr, 0, 1);
        startOfPeriod.setHours(0, 0, 0, 0);
        endOfPeriod = new Date(yr, 11, 31, 23, 59, 59, 999);
      } else if (activePeriod === "monthly") {
        const yr = parseInt(selectedYear, 10);
        const mn = parseInt(selectedMonth, 10);
        startOfPeriod = new Date(yr, mn, 1);
        startOfPeriod.setHours(0, 0, 0, 0);
        endOfPeriod = new Date(yr, mn + 1, 0, 23, 59, 59, 999);
      } else if (activePeriod === "custom") {
        if (!customStartDate || !customEndDate) return [];
        startOfPeriod = new Date(customStartDate);
        startOfPeriod.setHours(0, 0, 0, 0);
        endOfPeriod = new Date(customEndDate);
        endOfPeriod.setHours(23, 59, 59, 999);
      } else {
        const now = new Date();
        startOfPeriod = new Date(now);
        switch (activePeriod) {
          case "daily":
            startOfPeriod.setHours(0, 0, 0, 0);
            break;
          case "weekly":
            const d = now.getDay();
            startOfPeriod.setDate(now.getDate() - d + (d === 0 ? -6 : 1));
            startOfPeriod.setHours(0, 0, 0, 0);
            break;
          default:
            break;
        }
      }

      const lastDataBeforePeriod = [...sourceData]
        .reverse()
        .find((d) => new Date(d.name).getTime() < startOfPeriod.getTime());
      const baselineValue = lastDataBeforePeriod
        ? lastDataBeforePeriod.value
        : 0;

      const filteredData = sourceData.filter((d) => {
        const eventDate = new Date(d.name).getTime();
        if (activePeriod === "custom" || activePeriod === "monthly" || activePeriod === "yearly") {
          return (
            eventDate >= startOfPeriod.getTime() &&
            eventDate <= endOfPeriod.getTime()
          );
        }
        return eventDate >= startOfPeriod.getTime();
      });

      if (filteredData.length > 0) {
        if (
          new Date(filteredData[0].name).getTime() > startOfPeriod.getTime()
        ) {
          return [{ name: "Start", value: baselineValue }, ...filteredData];
        }
        return filteredData;
      }

      return [{ name: "Start", value: baselineValue }];
    };

    return { chartData: periodFilteredData() };
  }, [
    trades,
    balanceTransactions,
    activeProfile,
    activePeriod,
    chartType,
    customStartDate,
    customEndDate,
    selectedYear,
    selectedMonth,
  ]);

  const currentBalance = useMemo(() => {
    if (!activeProfile) return 0;
    const cumulativePnl = trades.reduce(
      (sum, t) => sum + (parseFloat(t.pnl) || 0),
      0,
    );
    const cumulativeTransactions = balanceTransactions.reduce((sum, t) => {
      const amount = parseFloat(t.amount) || 0;
      return sum + (t.type === "deposit" ? amount : -amount);
    }, 0);
    return cumulativeTransactions + cumulativePnl;
  }, [trades, balanceTransactions, activeProfile]);

  const getPeriodLabel = () => {
    if (activePeriod === "custom") {
      const formattedStart = new Date(customStartDate).toLocaleDateString(
        "id-ID",
        { day: "numeric", month: "short" },
      );
      const formattedEnd = new Date(customEndDate).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      return `${formattedStart} - ${formattedEnd}`;
    }
    return periods.find((p) => p.key === activePeriod)?.label;
  };



  if (!isAuthReady || isLoading) {
    return (
      <>
        {showSplash && <SplashScreen fadeOut={splashFadeOut} />}
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center text-gray-900 dark:text-white">
          Memuat Autentikasi...
        </div>
      </>
    );
  }

  if (!user) {
    return (
      <>
        {showSplash && <SplashScreen fadeOut={splashFadeOut} />}
        <LoginPage onLogin={handleLogin} error={loginError} />
      </>
    );
  }

  if (isAuthReady && !isLoading && tradingProfiles.length === 0) {
    return (
      <>
        {showSplash && <SplashScreen fadeOut={splashFadeOut} />}
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col items-center justify-center text-gray-900 dark:text-white">
          {isProfileModalVisible && (
            <ProfileManagementModal
              showToast={showToast}
              onClose={() => {
                setIsProfileModalVisible(false);
                refreshProfiles();
              }}
              profiles={tradingProfiles}
              openDeleteModal={openDeleteModal}
            />
          )}
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast({ message: "", type: "" })}
          />
          <h2 className="text-2xl font-bold mb-4">
            Selamat Datang, {user.email}!
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            Untuk memulai, silakan buat profil trading pertama Anda.
          </p>
          <button
            onClick={() => setIsProfileModalVisible(true)}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
          >
            <PlusCircle size={20} className="mr-2" /> Buat Profil Trading
          </button>
        </div>
      </>
    );
  }

  const SidebarContent = () => (
    <>
      <a
        href="https://www.instagram.com/deolukow_"
        target="_blank"
        rel="noopener noreferrer"
        className="block mb-6 hover:opacity-90 transition-opacity select-none group"
      >
        <div className="flex items-center">
          {/* Left portion: WzGold in elegant bold italic */}
          <span className="text-2xl font-black italic tracking-tighter text-gray-900 dark:text-white">
            Wz<span className="text-amber-500 dark:text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.2)]">Gold</span>
          </span>

          {/* Thin vertical divider line */}
          <div className="w-[1.5px] h-8 bg-gray-300 dark:bg-gray-700/80 mx-3"></div>

          {/* Right portion: Trading Jurnal stacked vertically */}
          <div className="flex flex-col justify-center leading-none text-left">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-700 dark:text-gray-300">
              Trading
            </span>
            <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 dark:text-blue-400 mt-0.5">
              Jurnal
            </span>
          </div>
        </div>

        {/* Subtle developer credit subtext */}
        <p className="text-[9px] text-gray-400 dark:text-gray-600 mt-2 font-medium tracking-wide uppercase group-hover:text-gray-500 dark:group-hover:text-gray-500 transition-colors pl-0.5">
          created by Deo Lukow (2025)
        </p>
      </a>
      <div className="mb-4">
        <ProfileSelector
          profiles={tradingProfiles}
          activeProfile={activeProfile}
          onSelectProfile={handleSelectProfile}
          onManageProfiles={() => {
            setIsProfileModalVisible(true);
            setIsSidebarOpen(false);
          }}
        />
      </div>
      <button
        onClick={() => {
          setEditingTrade(null);
          setIsTradeFormVisible(true);
          setIsSidebarOpen(false);
        }}
        className="w-full px-4 py-3 mb-6 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-lg flex items-center justify-center text-sm font-semibold"
      >
        <PlusCircle size={18} className="mr-2" /> Tambah Trade
      </button>
      <nav className="flex-grow">
        <ul>
          <SidebarLink
            icon={<LayoutDashboard size={20} />}
            text="Dashboard"
            active={activeView === "dashboard"}
            onClick={() => {
              setActiveView("dashboard");
              setIsSidebarOpen(false);
            }}
          />
          <SidebarLink
            icon={<BookOpen size={20} />}
            text="Strategi"
            active={activeView === "strategy"}
            onClick={() => {
              setActiveView("strategy");
              setIsSidebarOpen(false);
            }}
          />
          <SidebarLink
            icon={<CalendarDays size={20} />}
            text="Kalender"
            active={activeView === "calendar"}
            onClick={() => {
              setActiveView("calendar");
              setIsSidebarOpen(false);
            }}
          />
          <SidebarLink
            icon={<ImageIcon size={20} />}
            text="Galeri Trade"
            active={activeView === "gallery"}
            onClick={() => {
              setActiveView("gallery");
              setActivePeriod("all");
              setIsSidebarOpen(false);
            }}
          />
          <SidebarLink
            icon={<LineChart size={20} />}
            text="Analisis Chart"
            active={activeView === "tradingview"}
            onClick={() => {
              setActiveView("tradingview");
              setIsSidebarOpen(false);
            }}
          />
          <SidebarLink
            icon={<Cloud size={20} className={cloudSyncStatus === "synced" ? "text-emerald-500" : "text-violet-500"} />}
            text="Google Sheets & Drive"
            active={activeView === "sync"}
            onClick={() => {
              setActiveView("sync");
              setIsSidebarOpen(false);
            }}
          />
        </ul>
        <ul className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
          <li className="px-3 pb-2 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            Alat Bantu
          </li>
          <li className="mb-2">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setIsGoalModalVisible(true);
                setIsSidebarOpen(false);
              }}
              className="flex items-center p-3 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white"
            >
              <TrendingUp
                size={20}
                className="text-yellow-500 dark:text-yellow-400"
              />
              <span className="ml-3">Tetapkan Target</span>
            </a>
          </li>
          <li className="mb-2">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setIsCalculatorVisible(true);
                setIsSidebarOpen(false);
              }}
              className="flex items-center p-3 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white"
            >
              <Calculator
                size={20}
                className="text-green-500 dark:text-green-400"
              />
              <span className="ml-3">Kalkulator Lot Size</span>
            </a>
          </li>
          <li className="mb-2">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setIsPairModalVisible(true);
                setIsSidebarOpen(false);
              }}
              className="flex items-center p-3 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white"
            >
              <Target
                size={20}
                className="text-yellow-500 dark:text-yellow-400"
              />
              <span className="ml-3">Kelola Pair</span>
            </a>
          </li>
          <li className="mb-2">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setIsTemplateModalVisible(true);
                setIsSidebarOpen(false);
              }}
              className="flex items-center p-3 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white"
            >
              <Zap size={20} className="text-blue-500 dark:text-blue-400" />
              <span className="ml-3">Kelola Template</span>
            </a>
          </li>
          <li className="mb-2">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setIsCustomFieldModalVisible(true);
                setIsSidebarOpen(false);
              }}
              className="flex items-center p-3 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white"
            >
              <ListPlus
                size={20}
                className="text-indigo-500 dark:text-indigo-400"
              />
              <span className="ml-3">Kelola Field Tambahan</span>
            </a>
          </li>
        </ul>
      </nav>
      <div className="mt-auto pt-4 border-t border-gray-200 dark:border-gray-700">
        <div
          className="text-xs text-gray-400 dark:text-gray-500 mb-2 truncate"
          title={user.email}
        >
          Masuk sebagai: {user.email}
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center p-3 rounded-lg text-red-500 dark:text-red-400 hover:bg-red-500/10 dark:hover:bg-red-500/20"
        >
          <LogOut size={20} />
          <span className="ml-3">Keluar</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      {showSplash && <SplashScreen fadeOut={splashFadeOut} />}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
        .animate-slideIn {
          animation: slideIn 0.3s ease-out forwards;
        }
      `}</style>
      <div className="flex min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-300 font-sans">
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast({ message: "", type: "" })}
        />
        <ConfirmationModal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          onConfirm={handleDeleteItem}
          title="Konfirmasi Hapus"
          message={`Yakin ingin menghapus ${itemToDelete?.type} ini? Aksi ini tidak dapat dibatalkan.`}
        />

        {activeProfile && isTradeFormVisible && (
          <TradeForm
            onSaveTrade={handleSaveTrade}
            editingTrade={editingTrade}
            onCancelEdit={() => {
              setEditingTrade(null);
              setIsTradeFormVisible(false);
            }}
            pairs={pairs}
            templates={templates}
            customFields={customFields}
            activeProfileId={activeProfile.id}
            strategies={strategies}
            tradingProfiles={tradingProfiles}
          />
        )}
        {viewingTrade && (() => {
          let activeList = [];
          if (activeView === "gallery") {
            activeList = activeGalleryTrades || [];
          } else if (activeView === "dashboard") {
            activeList = sortedTrades || [];
          } else {
            activeList = [...trades].sort((a, b) => new Date(b.tradeDate).getTime() - new Date(a.tradeDate).getTime());
          }
          const hasNav = activeList.length > 1;

          return (
            <TradeDetailModal
              trade={viewingTrade}
              onClose={() => setViewingTrade(null)}
              customFields={customFields}
              currency={activeProfile?.currency}
              activeProfileName={activeProfile?.name}
              strategies={strategies}
              onNext={() => handleNavigateDetail("next")}
              onPrev={() => handleNavigateDetail("prev")}
              hasNext={hasNav}
              hasPrev={hasNav}
              tradingProfiles={tradingProfiles}
              initialBalance={initialBalance}
            />
          );
        })()}
        {showDashboardShareModal && (() => {
          const getPeriodDates = () => {
            let start = new Date();
            let end = new Date();

            const formatDateStr = (date) => {
              return date.toLocaleDateString("id-ID", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric"
              });
            };

            const parseDateLocal = (dateStr) => {
              if (!dateStr) return new Date();
              const parts = dateStr.split("-");
              if (parts.length === 3) {
                // Year, Month (0-indexed), Day
                return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
              }
              return new Date(dateStr);
            };

            if (activePeriod === "daily") {
              return { start: formatDateStr(start), end: formatDateStr(end) };
            } else if (activePeriod === "weekly") {
              const day = start.getDay();
              const diff = start.getDate() - day + (day === 0 ? -6 : 1);
              const monday = new Date(start.setDate(diff));
              const sunday = new Date(monday);
              sunday.setDate(monday.getDate() + 6);
              return { start: formatDateStr(monday), end: formatDateStr(sunday) };
            } else if (activePeriod === "monthly") {
              const firstDay = new Date(start.getFullYear(), start.getMonth(), 1);
              const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0);
              return { start: formatDateStr(firstDay), end: formatDateStr(lastDay) };
            } else if (activePeriod === "yearly") {
              const firstDay = new Date(selectedYear, 0, 1);
              const lastDay = new Date(selectedYear, 11, 31);
              return { start: formatDateStr(firstDay), end: formatDateStr(lastDay) };
            } else if (activePeriod === "custom") {
              const startD = parseDateLocal(customStartDate);
              const endD = parseDateLocal(customEndDate);
              return { start: formatDateStr(startD), end: formatDateStr(endD) };
            } else {
              if (trades.length > 0) {
                const sortedTrades = [...trades].sort((a, b) => new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime());
                const first = new Date(sortedTrades[0].tradeDate);
                const last = new Date(sortedTrades[sortedTrades.length - 1].tradeDate);
                return { start: formatDateStr(first), end: formatDateStr(last) };
              }
              return { start: formatDateStr(start), end: formatDateStr(end) };
            }
          };

          const pDates = getPeriodDates();

          return (
            <ShareCardModal
              trade={{
                isDashboard: true,
                pair: activeProfile?.name || "ALL PAIRS",
                type: (initialBalance > 0
                  ? (performanceStats.netPnl / initialBalance) * 100
                  : 0).toFixed(1) + "%",
                pnl: performanceStats.netPnl,
                startDate: pDates.start,
                endDate: pDates.end,
                tradeDate: new Date(),
              }}
              onClose={() => setShowDashboardShareModal(false)}
              currency={activeProfile?.currency}
              activeProfileName={activeProfile?.name}
            />
          );
        })()}
        {activeProfile && isCalculatorVisible && (
          <LotSizeCalculatorModal
            isOpen={isCalculatorVisible}
            onClose={() => setIsCalculatorVisible(false)}
            currentBalance={currentBalance}
            currency={activeProfile?.currency}
          />
        )}
        {activeProfile && isGoalModalVisible && (
          <GoalSettingModal
            activeProfileId={activeProfile.id}
            showToast={showToast}
            onClose={() => {
              setIsGoalModalVisible(false);
              refreshAllData(activeProfile.id, true);
            }}
            onRefresh={() => refreshAllData(activeProfile.id, true)}
            currentGoal={goalSettings}
            currency={activeProfile?.currency}
          />
        )}
        {activeProfile && isTransactionModalVisible && (
          <BalanceTransactionModal
            activeProfileId={activeProfile.id}
            showToast={showToast}
            onClose={() => {
              setIsTransactionModalVisible(false);
              refreshAllData(activeProfile.id, true);
            }}
            onRefresh={() => refreshAllData(activeProfile.id, true)}
            openDeleteModal={openDeleteModal}
            currency={activeProfile?.currency}
          />
        )}
        {activeProfile && isPairModalVisible && (
          <PairManagementModal
            activeProfileId={activeProfile.id}
            showToast={showToast}
            onClose={() => {
              setIsPairModalVisible(false);
              refreshAllData(activeProfile.id, true);
            }}
            onRefresh={() => refreshAllData(activeProfile.id, true)}
            pairs={pairs}
            openDeleteModal={openDeleteModal}
          />
        )}
        {activeProfile && isTemplateModalVisible && (
          <TemplateManagementModal
            activeProfileId={activeProfile.id}
            showToast={showToast}
            onClose={() => {
              setIsTemplateModalVisible(false);
              refreshAllData(activeProfile.id, true);
            }}
            onRefresh={() => refreshAllData(activeProfile.id, true)}
            templates={templates}
            customFields={customFields}
            strategies={strategies}
            openDeleteModal={openDeleteModal}
          />
        )}
        {activeProfile && isCustomFieldModalVisible && (
          <CustomFieldManagementModal
            activeProfileId={activeProfile.id}
            showToast={showToast}
            onClose={() => {
              setIsCustomFieldModalVisible(false);
              refreshAllData(activeProfile.id, true);
            }}
            onRefresh={() => refreshAllData(activeProfile.id, true)}
            customFields={customFields}
            openDeleteModal={openDeleteModal}
          />
        )}
        {isProfileModalVisible && (
          <ProfileManagementModal
            showToast={showToast}
            onClose={() => {
              setIsProfileModalVisible(false);
              refreshProfiles();
            }}
            profiles={tradingProfiles}
            openDeleteModal={openDeleteModal}
          />
        )}

        {isSidebarOpen && (
          <>
            <div
              className="fixed inset-0 bg-black bg-opacity-75 z-40 md:hidden"
              onClick={() => setIsSidebarOpen(false)}
            ></div>
            <aside className="fixed inset-y-0 left-0 w-64 bg-white dark:bg-gray-800 p-4 z-50 flex flex-col md:hidden animate-slideIn overflow-y-auto">
              <SidebarContent />
            </aside>
          </>
        )}

        {isDesktopSidebarVisible && (
          <aside className="w-64 bg-white dark:bg-gray-800 p-4 flex-shrink-0 flex-col hidden md:flex overflow-y-auto border-r border-gray-100 dark:border-gray-700/30">
            <SidebarContent />
          </aside>
        )}

        <main className="flex-1 flex flex-col p-4 md:p-6 lg:p-8 overflow-y-auto">
          <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
            <div className="flex items-center gap-3">
              {/* Mobile Sidebar Toggle */}
              <button
                className="md:hidden text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                onClick={() => setIsSidebarOpen(true)}
              >
                <Menu size={26} />
              </button>

              {/* Desktop Sidebar Toggle Button */}
              <button
                onClick={() => setIsDesktopSidebarVisible(!isDesktopSidebarVisible)}
                className="hidden md:flex items-center justify-center p-2 text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400 bg-white dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 border border-gray-200 dark:border-gray-700/60 rounded-xl transition-all duration-200 cursor-pointer shadow-sm active:scale-95"
                title={isDesktopSidebarVisible ? "Sembunyikan Sidebar" : "Tampilkan Sidebar"}
              >
                {isDesktopSidebarVisible ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
              </button>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate">
                {activeView === "dashboard"
                  ? "Dashboard"
                  : activeView === "strategy"
                    ? "Strategi"
                    : activeView === "calendar"
                      ? "Kalender Trade"
                      : activeView === "gallery"
                        ? "Galeri Trade"
                        : activeView === "tradingview"
                          ? "Analisis Chart"
                          : "Sinkronisasi Cloud"}
              </h2>
            </div>
            <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
              {activeView === "dashboard" && (
                <>
                  {/* Google Drive Upload Shortcut */}
                  {/* Google Sheets & Drive Two-Way Sync Shortcut */}
                  <button
                    onClick={handleDashboardBackup}
                    disabled={isDashboardSyncing}
                    className={`p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                      cloudSyncStatus === "synced"
                        ? "text-emerald-500 hover:text-white hover:bg-emerald-600 dark:hover:bg-emerald-600 hover:shadow-[0_0_12px_rgba(16,185,129,0.35)]"
                        : "text-indigo-500 hover:text-white hover:bg-indigo-600 dark:hover:bg-indigo-600 hover:shadow-[0_0_12px_rgba(99,102,241,0.35)]"
                    }`}
                    title={
                      cloudSyncStatus === "synced"
                        ? "Tersinkron dengan Google Sheets (Klik untuk sinkron ulang)"
                        : "Sinkronkan dengan Google Sheets & Drive (Two-Way Sync)"
                    }
                  >
                    <RefreshCw size={18} className={isDashboardSyncing ? "animate-spin text-amber-500" : ""} />
                  </button>

                  {/* Open Google Sheets Direct Shortcut */}
                  {getSpreadsheetId() && (
                    <a
                      href={`https://docs.google.com/spreadsheets/d/${getSpreadsheetId()}/edit`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-3 bg-white dark:bg-gray-800 text-emerald-600 hover:text-white hover:bg-emerald-600 dark:hover:bg-emerald-600 border border-gray-200 dark:border-gray-700 rounded-lg flex items-center justify-center transition-all cursor-pointer shadow-sm hover:shadow-[0_0_12px_rgba(16,185,129,0.35)] active:scale-95"
                      title="Buka Spreadsheet di Google Sheets"
                    >
                      <FileSpreadsheet size={18} />
                    </a>
                  )}

                  <button
                    onClick={() => setShowDashboardShareModal(true)}
                    className="p-3 bg-white dark:bg-gray-800 text-violet-500 hover:text-white hover:bg-violet-600 dark:hover:bg-violet-600 border border-gray-200 dark:border-gray-700 rounded-lg flex items-center justify-center transition-all cursor-pointer shadow-sm hover:shadow-[0_0_12px_rgba(139,92,246,0.35)] active:scale-95"
                    title="Bagikan Performa Dashboard"
                  >
                    <Share2 size={18} />
                  </button>
                </>
              )}
              {activeProfile?.id !== "all" && (
                <>
                  <div className="bg-white dark:bg-gray-800 p-3 rounded-lg text-center border border-gray-200 dark:border-gray-700">
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Saldo Saat Ini
                    </div>
                    <div className="text-lg font-bold text-gray-900 dark:text-white">
                      {formatCurrency(currentBalance, activeProfile?.currency)}
                    </div>
                  </div>
                  <button
                    onClick={() => setIsTransactionModalVisible(true)}
                    className="px-3 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white rounded-lg flex items-center text-sm font-semibold"
                  >
                    <Wallet size={16} className="mr-2" /> Kelola Saldo
                  </button>
                </>
              )}
            </div>
          </header>

          <div className="flex-grow">
            {activeView === "dashboard" && (
              <>
                <div className="flex space-x-1 sm:space-x-2 p-1 bg-gray-200 dark:bg-gray-800 rounded-xl mb-6">
                  {periods.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => setActivePeriod(p.key)}
                      className={classNames(
                        "px-2 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors flex-grow",
                        activePeriod === p.key
                          ? "bg-blue-600 text-white shadow-lg"
                          : "text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-700",
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                {activePeriod === "custom" && (
                  <DateRangePicker
                    startDate={customStartDate}
                    endDate={customEndDate}
                    onStartDateChange={setCustomStartDate}
                    onEndDateChange={setCustomEndDate}
                  />
                )}
                {activePeriod === "yearly" && (
                  <YearSelector
                    selectedYear={selectedYear}
                    setSelectedYear={setSelectedYear}
                  />
                )}
                {activePeriod === "monthly" && (
                  <MonthYearSelector
                    selectedMonth={selectedMonth}
                    setSelectedMonth={setSelectedMonth}
                    selectedYear={selectedYear}
                    setSelectedYear={setSelectedYear}
                  />
                )}

                {(() => {
                  const displayProfitFactor = performanceStats && isFinite(performanceStats.profitFactor)
                    ? performanceStats.profitFactor.toFixed(2)
                    : "∞";
                  const displayAvgWinLossRatio = performanceStats && isFinite(performanceStats.avgWinLossRatio)
                    ? performanceStats.avgWinLossRatio.toFixed(2)
                    : "∞";

                  return (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 auto-rows-auto animate-fadeIn">
                      {layoutOrder.map((widget) => {
                        const colSpan = getColSpanClass(widget.w);
                        const rowSpan = getRowSpanClass(widget.h);
                        const editClasses = isLayoutEditMode
                          ? "animate-wiggle cursor-grab active:cursor-grabbing animate-pulse-subtle"
                          : "";

                        // Widget Goal Progress
                        if (widget.id === "widget_goal") {
                          return (
                            <div
                              key="widget_goal"
                              className={`relative transition-all duration-300 ${colSpan} ${rowSpan} ${editClasses}`}
                              onMouseDown={handleLongPressStart}
                              onMouseUp={handleLongPressEnd}
                              onMouseLeave={handleLongPressEnd}
                              onTouchStart={handleLongPressStart}
                              onTouchEnd={handleLongPressEnd}
                              onTouchMove={handleLongPressMove}
                            >
                              {isLayoutEditMode && renderLayoutControls(widget)}
                              <GoalProgress
                                goal={goalSettings}
                                currentPnl={performanceStats.netPnl}
                                period={activePeriod}
                                currency={activeProfile?.currency}
                              />
                            </div>
                          );
                        }

                        // Widget Real-Time Prices
                        if (widget.id === "widget_realtime_prices") {
                          return (
                            <div
                              key="widget_realtime_prices"
                              className={`relative transition-all duration-300 ${colSpan} ${rowSpan} ${editClasses}`}
                              onMouseDown={handleLongPressStart}
                              onMouseUp={handleLongPressEnd}
                              onMouseLeave={handleLongPressEnd}
                              onTouchStart={handleLongPressStart}
                              onTouchEnd={handleLongPressEnd}
                              onTouchMove={handleLongPressMove}
                            >
                              {isLayoutEditMode && renderLayoutControls(widget)}
                              <RealtimePricesWidget />
                            </div>
                          );
                        }

                        // Widget Daily Goal Progress
                        if (widget.id === "widget_dailyGoal") {
                          const isDailyGoalActive = activePeriod === "daily";
                          if (!isDailyGoalActive && !isLayoutEditMode) return null;
                          return (
                            <div
                              key="widget_dailyGoal"
                              className={`relative transition-all duration-300 ${colSpan} ${rowSpan} ${editClasses}`}
                              onMouseDown={handleLongPressStart}
                              onMouseUp={handleLongPressEnd}
                              onMouseLeave={handleLongPressEnd}
                              onTouchStart={handleLongPressStart}
                              onTouchEnd={handleLongPressEnd}
                              onTouchMove={handleLongPressMove}
                            >
                              {isLayoutEditMode && renderLayoutControls(widget)}
                              {isDailyGoalActive ? (
                                <DailyGoalProgress
                                  goal={goalSettings}
                                  currentPnl={performanceStats.netPnl}
                                  currency={activeProfile?.currency}
                                />
                              ) : (
                                <div className="bg-gray-800/40 border border-gray-700/50 p-4 rounded-xl flex items-center justify-center min-h-[80px] h-full">
                                  <span className="text-xs text-gray-500 font-semibold italic">
                                    Target Harian (Hanya Tampil pada Periode Harian)
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        }

                        // Widget Chart
                        if (widget.id === "widget_chart") {
                          const chartHeight = getChartHeightClass(widget.h);
                          return (
                            <div
                              key="widget_chart"
                              className={`relative transition-all duration-300 ${colSpan} ${rowSpan} ${editClasses}`}
                              onMouseDown={handleLongPressStart}
                              onMouseUp={handleLongPressEnd}
                              onMouseLeave={handleLongPressEnd}
                              onTouchStart={handleLongPressStart}
                              onTouchEnd={handleLongPressEnd}
                              onTouchMove={handleLongPressMove}
                            >
                              {isLayoutEditMode && renderLayoutControls(widget)}
                              <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-lg animate-fadeIn h-full flex flex-col justify-between">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
                                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 sm:mb-0">
                                    {chartType === "balance"
                                      ? "Grafik Saldo Akun"
                                      : "Grafik P&L Kumulatif"}
                                  </h3>
                                  <div className="flex space-x-1 p-1 bg-gray-200 dark:bg-gray-700/50 rounded-lg">
                                    <button
                                      onClick={() => setChartType("balance")}
                                      className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${chartType === "balance"
                                        ? "bg-blue-600 text-white shadow font-semibold"
                                        : "text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600"
                                        }`}
                                    >
                                      Grafik Saldo
                                    </button>
                                    <button
                                      onClick={() => setChartType("pnl")}
                                      className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${chartType === "pnl"
                                        ? "bg-blue-600 text-white shadow font-semibold"
                                        : "text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600"
                                        }`}
                                    >
                                      Grafik P&L
                                    </button>
                                  </div>
                                </div>
                                <div className={`flex-grow ${chartHeight}`}>
                                  <AccountBalanceChart
                                    data={accountStats.chartData}
                                    period={activePeriod}
                                    currency={activeProfile?.currency}
                                    chartType={chartType}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        }

                        // Widget Fields Table
                        if (widget.id === "widget_fields") {
                          return (
                            <div
                              key="widget_fields"
                              className={`relative transition-all duration-300 ${colSpan} ${rowSpan} ${editClasses}`}
                              onMouseDown={handleLongPressStart}
                              onMouseUp={handleLongPressEnd}
                              onMouseLeave={handleLongPressEnd}
                              onTouchStart={handleLongPressStart}
                              onTouchEnd={handleLongPressEnd}
                              onTouchMove={handleLongPressMove}
                            >
                              {isLayoutEditMode && renderLayoutControls(widget)}
                              <div className="h-full">
                                <FieldPerformanceTable
                                  trades={filteredTrades}
                                  customFields={customFields}
                                  currency={activeProfile?.currency}
                                  activeProfileId={activeProfile?.id}
                                  tradingProfiles={tradingProfiles}
                                />
                              </div>
                            </div>
                          );
                        }

                        // Widget Trades List
                        if (widget.id === "widget_trades") {
                          return (
                            <div
                              key="widget_trades"
                              className={`relative transition-all duration-300 ${colSpan} ${rowSpan} ${editClasses}`}
                              onMouseDown={handleLongPressStart}
                              onMouseUp={handleLongPressEnd}
                              onMouseLeave={handleLongPressEnd}
                              onTouchStart={handleLongPressStart}
                              onTouchEnd={handleLongPressEnd}
                              onTouchMove={handleLongPressMove}
                            >
                              {isLayoutEditMode && renderLayoutControls(widget)}
                              <div className="h-full">
                                {activePeriod === "yearly" ? (
                                  <YearlySummary
                                    trades={filteredTrades}
                                    currency={activeProfile?.currency}
                                    year={selectedYear}
                                  />
                                ) : (
                                  <TradeList
                                    trades={sortedTrades}
                                    onView={handleShowTradeDetail}
                                    onEdit={(t) => {
                                      setEditingTrade(t);
                                      setIsTradeFormVisible(true);
                                    }}
                                    onDelete={(type, data) => openDeleteModal(type, data)}
                                    onAddTrade={() => {
                                      setEditingTrade(null);
                                      setIsTradeFormVisible(true);
                                    }}
                                    onCloseTrade={handleCloseTrade}
                                    title={`Riwayat Trade (${getPeriodLabel()})`}
                                    requestSort={requestSort}
                                    sortConfig={sortConfig}
                                    customFields={customFields}
                                    currency={activeProfile?.currency}
                                    activeProfileId={activeProfile?.id}
                                    tradingProfiles={tradingProfiles}
                                  />
                                )}
                              </div>
                            </div>
                          );
                        }

                        // Widget Notes
                        if (widget.id === "widget_notes") {
                          return (
                            <div
                              key="widget_notes"
                              className={`relative transition-all duration-300 ${colSpan} ${rowSpan} ${editClasses}`}
                              onMouseDown={handleLongPressStart}
                              onMouseUp={handleLongPressEnd}
                              onMouseLeave={handleLongPressEnd}
                              onTouchStart={handleLongPressStart}
                              onTouchEnd={handleLongPressEnd}
                              onTouchMove={handleLongPressMove}
                            >
                              {isLayoutEditMode && renderLayoutControls(widget)}
                              <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-lg h-full flex flex-col justify-between select-text min-h-[160px]">
                                <div className="flex justify-between items-center mb-3 flex-shrink-0 select-none">
                                  <div className="flex items-center text-gray-700 dark:text-gray-200 font-bold text-sm">
                                    <BookOpen size={16} className="text-violet-500 mr-2" />
                                    <span>Catatan & Quotes</span>
                                  </div>
                                  {!isLayoutEditMode && (
                                    <button
                                      onClick={() => setIsEditingNotes(!isEditingNotes)}
                                      className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-violet-600 dark:hover:bg-violet-600 text-gray-600 dark:text-gray-300 hover:text-white rounded-lg transition-all font-semibold cursor-pointer"
                                    >
                                      {isEditingNotes ? "Batal" : "Edit"}
                                    </button>
                                  )}
                                </div>

                                {isEditingNotes ? (
                                  <form
                                    onSubmit={async (e) => {
                                      e.preventDefault();
                                      const text = e.target.elements.notesText.value;
                                      const fileInput = e.target.elements.notesImage;
                                      const file = fileInput.files[0];
                                      const removeImg = e.target.elements.removeImg?.checked;
                                      await handleSaveNotes(text, file, removeImg);
                                    }}
                                    className="flex-grow flex flex-col gap-3 h-full overflow-y-auto"
                                  >
                                    <textarea
                                      name="notesText"
                                      defaultValue={notesText}
                                      placeholder="Tulis quotes motivasi, reminder trading plan, atau kata penyemangat Anda di sini..."
                                      className="w-full flex-grow p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-800 dark:text-gray-200 focus:outline-none resize-none min-h-[100px]"
                                    />

                                    <div className="flex flex-col gap-2 bg-gray-50 dark:bg-gray-900/50 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700/50">
                                      <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 block">
                                        Pilih Gambar Penyemangat:
                                      </label>
                                      <input
                                        type="file"
                                        name="notesImage"
                                        accept="image/*"
                                        className="text-xs text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100 cursor-pointer"
                                      />
                                      {notesImageUrl && (
                                        <div className="flex items-center gap-2 mt-1">
                                          <input type="checkbox" name="removeImg" id="removeImgCheckbox" className="w-3.5 h-3.5 cursor-pointer" />
                                          <label htmlFor="removeImgCheckbox" className="text-xs text-red-500 hover:text-red-400 font-semibold cursor-pointer">
                                            Hapus Gambar Saat Ini
                                          </label>
                                        </div>
                                      )}
                                    </div>

                                    <button
                                      type="submit"
                                      className="w-full py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-bold shadow-md active:scale-98 transition-all cursor-pointer"
                                    >
                                      Simpan Catatan
                                    </button>
                                  </form>
                                ) : (
                                  <div className="flex-grow overflow-y-auto pr-1 flex flex-col gap-3 max-h-full scrollbar-thin">
                                    {notesImageUrl && (
                                      <div className="relative group rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
                                        <img
                                          src={notesImageUrl}
                                          alt="Penyemangat"
                                          className="w-full object-cover max-h-[160px] md:max-h-[220px]"
                                        />
                                      </div>
                                    )}
                                    {notesText ? (
                                      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed italic">
                                        "{notesText}"
                                      </p>
                                    ) : (
                                      <div className="flex-grow flex flex-col items-center justify-center text-center p-4 min-h-[120px]">
                                        <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                                          Belum ada catatan penyemangat. Klik "Edit" di kanan atas untuk menulis quotes atau mengunggah gambar penyemangat Anda!
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        }

                        // --- INDIVIDUAL STATISTIC CARDS ---
                        if (!performanceStats) return null;

                        if (widget.id === "stat_netPnl") {
                          return (
                            <div
                              key="stat_netPnl"
                              className={`relative transition-all duration-300 ${colSpan} ${rowSpan} ${editClasses}`}
                              onMouseDown={handleLongPressStart}
                              onMouseUp={handleLongPressEnd}
                              onMouseLeave={handleLongPressEnd}
                              onTouchStart={handleLongPressStart}
                              onTouchEnd={handleLongPressEnd}
                              onTouchMove={handleLongPressMove}
                            >
                              {isLayoutEditMode && renderLayoutControls(widget)}
                              <StatCard
                                title="Net P&L"
                                value={activeProfile?.id === "all" ? null : formatCurrency(performanceStats.netPnl, activeProfile?.currency)}
                                icon={<DollarSign size={16} />}
                                footer={
                                  performanceStats.profileBreakdown ? (
                                    <div className="flex flex-col space-y-1.5 w-full mt-2">
                                      {performanceStats.profileBreakdown.map(p => (
                                        <div key={p.id} className="flex justify-between items-center text-sm w-full">
                                          <span className="text-gray-600 dark:text-gray-300 font-medium truncate pr-2 max-w-[100px]">{p.name}</span>
                                          <span className={`font-bold ${p.netPnl >= 0 ? "text-green-500 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                                            {formatCurrency(p.netPnl, p.currency)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className={performanceStats.netPnl >= 0 ? "text-green-500 dark:text-green-400" : "text-red-500 dark:text-red-400"}>
                                      {performanceStats.netPnl >= 0 ? "Profit" : "Loss"}
                                    </span>
                                  )
                                }
                              />
                            </div>
                          );
                        }

                        if (widget.id === "stat_growth") {
                          return (
                            <div
                              key="stat_growth"
                              className={`relative transition-all duration-300 ${colSpan} ${rowSpan} ${editClasses}`}
                              onMouseDown={handleLongPressStart}
                              onMouseUp={handleLongPressEnd}
                              onMouseLeave={handleLongPressEnd}
                              onTouchStart={handleLongPressStart}
                              onTouchEnd={handleLongPressEnd}
                              onTouchMove={handleLongPressMove}
                            >
                              {isLayoutEditMode && renderLayoutControls(widget)}
                              <StatCard
                                title="Account Growth"
                                value={activeProfile?.id === "all" ? null : `${performanceStats.growthPercentage >= 0 ? "+" : ""}${performanceStats.growthPercentage.toFixed(2)}%`}
                                icon={<TrendingUp size={16} className={performanceStats.growthPercentage >= 0 ? "text-green-400" : "text-red-400"} />}
                                footer={
                                  performanceStats.profileBreakdown ? (
                                    <div className="flex flex-col space-y-1.5 w-full mt-2">
                                      {performanceStats.profileBreakdown.map(p => (
                                        <div key={p.id} className="flex justify-between items-center text-sm w-full">
                                          <span className="text-gray-600 dark:text-gray-300 font-medium truncate pr-2 max-w-[100px]">{p.name}</span>
                                          <span className={`font-bold ${p.growthPercentage >= 0 ? "text-green-500 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                                            {p.growthPercentage >= 0 ? "+" : ""}{p.growthPercentage.toFixed(2)}%
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className={performanceStats.growthPercentage >= 0 ? "text-green-500 dark:text-green-400" : "text-red-500 dark:text-red-400"}>
                                      {performanceStats.growthPercentage >= 0 ? "Pertumbuhan Positif" : "Pertumbuhan Negatif"}
                                    </span>
                                  )
                                }
                              />
                            </div>
                          );
                        }

                        if (widget.id === "stat_winRate") {
                          return (
                            <div
                              key="stat_winRate"
                              className={`relative transition-all duration-300 ${colSpan} ${rowSpan} ${editClasses}`}
                              onMouseDown={handleLongPressStart}
                              onMouseUp={handleLongPressEnd}
                              onMouseLeave={handleLongPressEnd}
                              onTouchStart={handleLongPressStart}
                              onTouchEnd={handleLongPressEnd}
                              onTouchMove={handleLongPressMove}
                            >
                              {isLayoutEditMode && renderLayoutControls(widget)}
                              <StatCard
                                title="Trade Win %"
                                icon={<Target size={16} />}
                                footer={
                                  performanceStats.profileBreakdown ? (
                                    <div className="flex flex-col space-y-1.5 w-full mt-2">
                                      {performanceStats.profileBreakdown.map(p => (
                                        <div key={p.id} className="flex justify-between items-center text-sm w-full">
                                          <span className="text-gray-600 dark:text-gray-300 font-medium truncate pr-2 max-w-[100px]">{p.name}</span>
                                          <span className="font-bold text-gray-700 dark:text-gray-300">
                                            <span className="text-green-500">{p.wins}W</span> / <span className="text-red-500">{p.losses}L</span>
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <span>
                                      <span className="text-green-500 dark:text-green-400">{performanceStats.wins} menang</span>{" "}
                                      /{" "}
                                      <span className="text-red-500 dark:text-red-400">{performanceStats.losses} kalah</span>
                                    </span>
                                  )
                                }
                              >
                                <GaugeChart value={performanceStats.tradeWinRate} />
                              </StatCard>
                            </div>
                          );
                        }

                        if (widget.id === "stat_bestTrade") {
                          return (
                            <div
                              key="stat_bestTrade"
                              className={`relative transition-all duration-300 ${colSpan} ${rowSpan} ${editClasses}`}
                              onMouseDown={handleLongPressStart}
                              onMouseUp={handleLongPressEnd}
                              onMouseLeave={handleLongPressEnd}
                              onTouchStart={handleLongPressStart}
                              onTouchEnd={handleLongPressEnd}
                              onTouchMove={handleLongPressMove}
                            >
                              {isLayoutEditMode && renderLayoutControls(widget)}
                              <StatCard
                                title="Best Trade"
                                value={activeProfile?.id === "all" ? null : formatCurrency(performanceStats.bestTrade, activeProfile?.currency)}
                                icon={<ArrowUpRight size={16} className="text-green-500" />}
                                footer={
                                  performanceStats.profileBreakdown ? (
                                    <div className="flex flex-col space-y-1.5 w-full mt-2">
                                      {performanceStats.profileBreakdown.map(p => (
                                        <div key={p.id} className="flex justify-between items-center text-sm w-full">
                                          <span className="text-gray-600 dark:text-gray-300 font-medium truncate pr-2 max-w-[100px]">{p.name}</span>
                                          <span className="font-bold text-green-500 dark:text-green-400">
                                            {formatCurrency(p.bestTrade, p.currency)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-gray-500">Profit Terbesar Periode Ini</span>
                                  )
                                }
                              />
                            </div>
                          );
                        }

                        if (widget.id === "stat_worstTrade") {
                          return (
                            <div
                              key="stat_worstTrade"
                              className={`relative transition-all duration-300 ${colSpan} ${rowSpan} ${editClasses}`}
                              onMouseDown={handleLongPressStart}
                              onMouseUp={handleLongPressEnd}
                              onMouseLeave={handleLongPressEnd}
                              onTouchStart={handleLongPressStart}
                              onTouchEnd={handleLongPressEnd}
                              onTouchMove={handleLongPressMove}
                            >
                              {isLayoutEditMode && renderLayoutControls(widget)}
                              <StatCard
                                title="Worst Trade"
                                value={activeProfile?.id === "all" ? null : formatCurrency(performanceStats.worstTrade, activeProfile?.currency)}
                                icon={<ArrowDownRight size={16} className="text-red-500" />}
                                footer={
                                  performanceStats.profileBreakdown ? (
                                    <div className="flex flex-col space-y-1.5 w-full mt-2">
                                      {performanceStats.profileBreakdown.map(p => (
                                        <div key={p.id} className="flex justify-between items-center text-sm w-full">
                                          <span className="text-gray-600 dark:text-gray-300 font-medium truncate pr-2 max-w-[100px]">{p.name}</span>
                                          <span className="font-bold text-red-500 dark:text-red-400">
                                            {formatCurrency(p.worstTrade, p.currency)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-gray-500">Loss Terbesar Periode Ini</span>
                                  )
                                }
                              />
                            </div>
                          );
                        }

                        if (widget.id === "stat_avgRR") {
                          return (
                            <div
                              key="stat_avgRR"
                              className={`relative transition-all duration-300 ${colSpan} ${rowSpan} ${editClasses}`}
                              onMouseDown={handleLongPressStart}
                              onMouseUp={handleLongPressEnd}
                              onMouseLeave={handleLongPressEnd}
                              onTouchStart={handleLongPressStart}
                              onTouchEnd={handleLongPressEnd}
                              onTouchMove={handleLongPressMove}
                            >
                              {isLayoutEditMode && renderLayoutControls(widget)}
                              <StatCard
                                title="Avg R:R Ratio"
                                value={`${performanceStats.avgRiskReward.toFixed(2)}R`}
                                icon={<Ratio size={16} />}
                                footer={<span>Rata-rata Risk to Reward</span>}
                              />
                            </div>
                          );
                        }

                        if (widget.id === "stat_streak") {
                          return (
                            <div
                              key="stat_streak"
                              className={`relative transition-all duration-300 ${colSpan} ${rowSpan} ${editClasses}`}
                              onMouseDown={handleLongPressStart}
                              onMouseUp={handleLongPressEnd}
                              onMouseLeave={handleLongPressEnd}
                              onTouchStart={handleLongPressStart}
                              onTouchEnd={handleLongPressEnd}
                              onTouchMove={handleLongPressMove}
                            >
                              {isLayoutEditMode && renderLayoutControls(widget)}
                              <StatCard
                                title="Streak W/L"
                                icon={<Zap size={16} />}
                                footer={<span>Kemenangan / Kekalahan beruntun</span>}
                              >
                                <div className="flex items-center justify-center space-x-6 text-center w-full">
                                  <div>
                                    <p className="text-3xl font-bold text-green-500 dark:text-green-400">{performanceStats.consecutiveWins}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">Menang</p>
                                  </div>
                                  <div className="h-10 w-px bg-gray-200 dark:bg-gray-700"></div>
                                  <div>
                                    <p className="text-3xl font-bold text-red-500 dark:text-red-400">{performanceStats.consecutiveLosses}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">Kalah</p>
                                  </div>
                                </div>
                              </StatCard>
                            </div>
                          );
                        }

                        if (widget.id === "stat_profitFactor") {
                          return (
                            <div
                              key="stat_profitFactor"
                              className={`relative transition-all duration-300 ${colSpan} ${rowSpan} ${editClasses}`}
                              onMouseDown={handleLongPressStart}
                              onMouseUp={handleLongPressEnd}
                              onMouseLeave={handleLongPressEnd}
                              onTouchStart={handleLongPressStart}
                              onTouchEnd={handleLongPressEnd}
                              onTouchMove={handleLongPressMove}
                            >
                              {isLayoutEditMode && renderLayoutControls(widget)}
                              <StatCard
                                title="Profit Factor"
                                value={displayProfitFactor}
                                icon={<Divide size={16} />}
                                footer={
                                  <div className="w-full flex flex-col items-center">
                                    <div className="flex items-center justify-center gap-1">
                                      <span className="text-green-500 font-semibold">{formatCurrency(performanceStats.grossProfit, activeProfile?.currency)}</span>
                                      <span className="text-gray-500">/</span>
                                      <span className="text-red-500 font-semibold">{formatCurrency(performanceStats.grossLoss, activeProfile?.currency)}</span>
                                    </div>
                                  </div>
                                }
                              />
                            </div>
                          );
                        }

                        if (widget.id === "stat_dayWinRate") {
                          return (
                            <div
                              key="stat_dayWinRate"
                              className={`relative transition-all duration-300 ${colSpan} ${rowSpan} ${editClasses}`}
                              onMouseDown={handleLongPressStart}
                              onMouseUp={handleLongPressEnd}
                              onMouseLeave={handleLongPressEnd}
                              onTouchStart={handleLongPressStart}
                              onTouchEnd={handleLongPressEnd}
                              onTouchMove={handleLongPressMove}
                            >
                              {isLayoutEditMode && renderLayoutControls(widget)}
                              <StatCard
                                title="Day Win %"
                                icon={<CalendarDays size={16} />}
                                footer={
                                  <span>
                                    <span className="text-green-500 dark:text-green-400">{performanceStats.profitableDays} hari</span>{" "}
                                    /{" "}
                                    <span className="text-red-500 dark:text-red-400">{performanceStats.losingDays} hari</span>
                                  </span>
                                }
                              >
                                <GaugeChart value={performanceStats.dayWinRate} />
                              </StatCard>
                            </div>
                          );
                        }

                        if (widget.id === "stat_avgWinLoss") {
                          return (
                            <div
                              key="stat_avgWinLoss"
                              className={`relative transition-all duration-300 ${colSpan} ${rowSpan} ${editClasses}`}
                              onMouseDown={handleLongPressStart}
                              onMouseUp={handleLongPressEnd}
                              onMouseLeave={handleLongPressEnd}
                              onTouchStart={handleLongPressStart}
                              onTouchEnd={handleLongPressEnd}
                              onTouchMove={handleLongPressMove}
                            >
                              {isLayoutEditMode && renderLayoutControls(widget)}
                              <StatCard
                                title="Avg Win/Loss"
                                icon={<BarChartHorizontal size={16} />}
                                footer={
                                  <div className="w-full flex flex-col items-center">
                                    <RatioBar winValue={performanceStats.avgWin} lossValue={Math.abs(performanceStats.avgLoss)} />
                                    <div className="w-full flex justify-between mt-1">
                                      <span className="text-green-500 dark:text-green-400">{formatCurrency(performanceStats.avgWin, activeProfile?.currency)}</span>
                                      <span className="text-red-500 dark:text-red-400">{formatCurrency(performanceStats.avgLoss, activeProfile?.currency)}</span>
                                    </div>
                                  </div>
                                }
                                value={displayAvgWinLossRatio}
                              />
                            </div>
                          );
                        }

                        if (widget.id === "stat_totalLot") {
                          return (
                            <div
                              key="stat_totalLot"
                              className={`relative transition-all duration-300 ${colSpan} ${rowSpan} ${editClasses}`}
                              onMouseDown={handleLongPressStart}
                              onMouseUp={handleLongPressEnd}
                              onMouseLeave={handleLongPressEnd}
                              onTouchStart={handleLongPressStart}
                              onTouchEnd={handleLongPressEnd}
                              onTouchMove={handleLongPressMove}
                            >
                              {isLayoutEditMode && renderLayoutControls(widget)}
                              <StatCard
                                title="Total Lot Digunakan"
                                value={formatLotSize(performanceStats.totalLotUsed)}
                                icon={<Hash size={16} />}
                                footer={<span>Volum Trading Akumulatif</span>}
                              />
                            </div>
                          );
                        }

                        if (widget.id === "stat_duration") {
                          return (
                            <div
                              key="stat_duration"
                              className={`relative transition-all duration-300 ${colSpan} ${rowSpan} ${editClasses}`}
                              onMouseDown={handleLongPressStart}
                              onMouseUp={handleLongPressEnd}
                              onMouseLeave={handleLongPressEnd}
                              onTouchStart={handleLongPressStart}
                              onTouchEnd={handleLongPressEnd}
                              onTouchMove={handleLongPressMove}
                            >
                              {isLayoutEditMode && renderLayoutControls(widget)}
                              <StatCard
                                title="Durasi Trading"
                                icon={<Clock size={16} />}
                                footer={<span>Statistik durasi trading tertutup</span>}
                              >
                                <div className="flex flex-col items-center justify-center w-full my-1">
                                  <div className="text-center">
                                    <p className="text-2xl font-black text-gray-900 dark:text-white bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
                                      {performanceStats.avgDuration}
                                    </p>
                                    <p className="text-[10px] uppercase font-extrabold text-gray-400 dark:text-gray-500 tracking-wider mt-0.5">
                                      Rata-Rata
                                    </p>
                                  </div>

                                  <div className="flex items-center justify-between w-full mt-4 pt-3 border-t border-gray-150 dark:border-gray-700/50">
                                    <div className="text-center flex-1">
                                      <p className="text-xs font-bold text-green-600 dark:text-green-400">
                                        {performanceStats.minDuration}
                                      </p>
                                      <p className="text-[9px] text-gray-400 dark:text-gray-500">Terpendek</p>
                                    </div>
                                    <div className="h-6 w-px bg-gray-200 dark:bg-gray-700"></div>
                                    <div className="text-center flex-1">
                                      <p className="text-xs font-bold text-red-600 dark:text-red-400">
                                        {performanceStats.maxDuration}
                                      </p>
                                      <p className="text-[9px] text-gray-400 dark:text-gray-500">Terlama</p>
                                    </div>
                                  </div>
                                </div>
                              </StatCard>
                            </div>
                          );
                        }

                        return null;
                      })}
                    </div>
                  );
                })()}

                {/* Floating Bottom Confirmation Panel */}
                {isLayoutEditMode && (
                  <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 animate-slideUp">
                    <div className="bg-gray-900/95 border border-blue-500/30 backdrop-blur-md px-6 py-3.5 rounded-full flex items-center gap-4 shadow-[0_10px_30px_rgba(59,130,246,0.3)]">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-ping"></span>
                        <span className="text-sm font-semibold text-gray-200">
                          Mode Edit Tata Letak Aktif
                        </span>
                      </div>
                      <div className="h-4 w-px bg-gray-700"></div>
                      <button
                        onClick={() => {
                          setIsLayoutEditMode(false);
                          showToast("Tata letak berhasil disimpan!", "success");
                        }}
                        className="px-5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-full text-sm font-bold shadow-md hover:scale-105 active:scale-95 transition-all"
                      >
                        Selesai
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {activeView === "strategy" && activeProfile && (
              <StrategyPage
                activeProfileId={activeProfile.id}
                showToast={showToast}
                openDeleteModal={openDeleteModal}
                strategies={strategies}
                onRefresh={() => refreshAllData(activeProfile.id)}
                tradingProfiles={tradingProfiles}
              />
            )}

            {activeView === "calendar" && (
              <CalendarView
                trades={trades}
                onView={handleShowTradeDetail}
                onEdit={(t) => {
                  setEditingTrade(t);
                  setIsTradeFormVisible(true);
                }}
                onDelete={(type, data) => openDeleteModal(type, data)}
                onCloseTrade={handleCloseTrade}
                customFields={customFields}
                currency={activeProfile?.currency}
                activeProfileId={activeProfile?.id}
                tradingProfiles={tradingProfiles}
              />
            )}
            {activeView === "gallery" && (
              <GalleryView
                trades={filteredTrades}
                activePeriod={activePeriod}
                setActivePeriod={setActivePeriod}
                periods={periods}
                onShowTradeDetail={handleShowTradeDetail}
                currency={activeProfile?.currency}
                customStartDate={customStartDate}
                customEndDate={customEndDate}
                setCustomStartDate={setCustomStartDate}
                setCustomEndDate={setCustomEndDate}
                customFields={customFields}
                onFilteredTradesChange={setActiveGalleryTrades}
                activeProfileId={activeProfile?.id}
                tradingProfiles={tradingProfiles}
              />
            )}
            <div className={activeView === "tradingview" ? "block" : "hidden"}>
              <TradingViewPage
                activeProfile={activeProfile}
                trades={trades}
                pairs={pairs}
              />
            </div>
            {activeView === "sync" && activeProfile && (
              <SyncPage
                activeProfile={activeProfile}
                showToast={showToast}
                onRefresh={() => refreshAllData(activeProfile.id)}
              />
            )}
          </div>
        </main>
      </div>
    </>
  );
}

export default App;
