import React, { useState, useEffect } from "react";
import {
  Cloud,
  FileSpreadsheet,
  FolderOpen,
  Image as ImageIcon,
  ExternalLink,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  HelpCircle,
  Key,
  LogOut,
  UploadCloud,
  FileDown,
  FileUp,
  Sparkles,
  ShieldCheck,
  Zap,
  Info
} from "lucide-react";
import { exportIndexedDB, importIndexedDB, getAllItems } from "../config/db";
import {
  getStoredClientId,
  setStoredClientId,
  getStoredToken,
  getStoredUser,
  getLastSyncTime,
  getSpreadsheetId,
  getDriveFolderId,
  connectGoogleAccount,
  disconnectGoogleAccount,
  ensureDriveStructure,
  syncTwoWayWithGoogle,
  migrateLocalDataToGoogle,
  subscribeSyncStatus,
  DEFAULT_CLIENT_ID,
  APP_FOLDER_NAME,
  SPREADSHEET_NAME
} from "../services/googleSyncService";

export const SyncPage = ({ activeProfile, showToast, onRefresh }) => {
  const [clientId, setClientId] = useState(getStoredClientId);
  const [customClientIdInput, setCustomClientIdInput] = useState(getStoredClientId);
  const [accessToken, setAccessToken] = useState(getStoredToken);
  const [userInfo, setUserInfo] = useState(getStoredUser);
  const [spreadsheetId, setSpreadsheetId] = useState(getSpreadsheetId);
  const [driveFolderId, setDriveFolderId] = useState(getDriveFolderId);
  const [lastSyncTime, setLastSyncTime] = useState(getLastSyncTime);
  const [syncStatus, setSyncStatus] = useState("idle");
  const [syncStatusDetails, setSyncStatusDetails] = useState("");

  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState(null);
  const [localItemCounts, setLocalItemCounts] = useState({ trades: 0, images: 0 });
  const [showConfigHelp, setShowConfigHelp] = useState(false);

  // Subscribe to sync service events
  useEffect(() => {
    const unsubscribe = subscribeSyncStatus((status, details) => {
      setSyncStatus(status);
      setSyncStatusDetails(typeof details === "string" ? details : "");
      if (status === "synced" && details?.lastSyncTime) {
        setLastSyncTime(details.lastSyncTime);
      }
    });
    return unsubscribe;
  }, []);

  // Check local item counts for migration recommendation
  useEffect(() => {
    const checkLocal = async () => {
      try {
        const trades = await getAllItems("trades");
        const images = await getAllItems("trade_images");
        setLocalItemCounts({ trades: trades.length, images: images.length });
      } catch (e) {
        console.error(e);
      }
    };
    checkLocal();
  }, []);

  // Fetch drive & sheets info on login
  useEffect(() => {
    if (accessToken) {
      ensureDriveStructure()
        .then(({ rootFolderId, spreadsheetId }) => {
          setDriveFolderId(rootFolderId);
          setSpreadsheetId(spreadsheetId);
        })
        .catch((err) => {
          console.warn("Could not ensure drive structure:", err);
        });
    }
  }, [accessToken]);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const { token, user } = await connectGoogleAccount(clientId);
      setAccessToken(token);
      setUserInfo(user);
      showToast("Berhasil terhubung ke akun Google!", "success");

      // Setup drive folders & spreadsheet
      showToast("Menyiapkan Google Sheets & Drive...", "info");
      const { rootFolderId, spreadsheetId: newSheetId } = await ensureDriveStructure();
      setDriveFolderId(rootFolderId);
      setSpreadsheetId(newSheetId);

      // Perform initial sync
      await handleSyncNow();
    } catch (err) {
      console.error(err);
      showToast(err.message || "Gagal menghubungkan akun Google.", "error");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    if (window.confirm("Apakah Anda yakin ingin memutuskan tautan akun Google? Data lokal tetap tersimpan di browser ini.")) {
      disconnectGoogleAccount();
      setAccessToken("");
      setUserInfo(null);
      setSpreadsheetId(null);
      setDriveFolderId(null);
      showToast("Tautan akun Google diputuskan.", "info");
    }
  };

  const handleSyncNow = async () => {
    if (!accessToken) {
      showToast("Silakan hubungkan akun Google terlebih dahulu.", "error");
      return;
    }

    setIsSyncing(true);
    try {
      const result = await syncTwoWayWithGoogle();
      if (result.success) {
        setLastSyncTime(result.timestamp);
        showToast("Sinkronisasi 2 arah dengan Google Sheets berhasil!", "success");
        if (onRefresh) onRefresh();
      } else {
        showToast(result.error || "Gagal melakukan sinkronisasi.", "error");
      }
    } catch (e) {
      console.error(e);
      showToast("Terjadi kesalahan saat sinkronisasi.", "error");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleStartMigration = async () => {
    if (!accessToken) return;
    const confirmMigrate = window.confirm(
      `Sistem akan mengunggah ${localItemCounts.trades} data trade dan ${localItemCounts.images} screenshot gambar ke Google Drive dan Google Sheets Anda.\n\nLanjutkan migrasi?`
    );
    if (!confirmMigrate) return;

    setIsMigrating(true);
    setMigrationProgress({ message: "Mempersiapkan migrasi...", progress: 5 });

    try {
      const result = await migrateLocalDataToGoogle((prog) => {
        setMigrationProgress(prog);
      });
      showToast(`Migrasi berhasil! ${result.uploadedImages} gambar dan ${result.totalTrades} trade tersimpan di Google Cloud.`, "success");
      setMigrationProgress(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error("Migration error:", err);
      showToast(err.message || "Gagal melakukan migrasi data.", "error");
      setMigrationProgress(null);
    } finally {
      setIsMigrating(false);
    }
  };

  const handleSaveCustomClientId = (e) => {
    e.preventDefault();
    setStoredClientId(customClientIdInput);
    setClientId(customClientIdInput);
    showToast("Google Client ID berhasil diperbarui!", "success");
  };

  const handleResetClientId = () => {
    setStoredClientId(DEFAULT_CLIENT_ID);
    setClientId(DEFAULT_CLIENT_ID);
    setCustomClientIdInput(DEFAULT_CLIENT_ID);
    showToast("Client ID dikembalikan ke default bawaan.", "info");
  };

  // Local File Export / Import handlers
  const handleExportJSON = async () => {
    try {
      showToast("Mengekspor cadangan lokal...", "info");
      const backupData = await exportIndexedDB();
      const blob = new Blob([JSON.stringify(backupData, null, 2)], {
        type: "application/json"
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `trading_journal_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("File cadangan berhasil diunduh!", "success");
    } catch (err) {
      console.error(err);
      showToast("Gagal mengekspor data lokal.", "error");
    }
  };

  const handleImportJSON = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const json = JSON.parse(evt.target.result);
        if (window.confirm("PERINGATAN: Mengimpor file akan menimpa data lokal saat ini. Lanjutkan?")) {
          await importIndexedDB(json);
          showToast("Data lokal berhasil dipulihkan! Memuat ulang...", "success");
          setTimeout(() => window.location.reload(), 1200);
        }
      } catch (err) {
        console.error(err);
        showToast("Format file JSON tidak valid.", "error");
      }
    };
    reader.readAsText(file);
  };

  const formatLastSync = (isoString) => {
    if (!isoString) return "Belum pernah";
    try {
      const d = new Date(isoString);
      return d.toLocaleString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
    } catch {
      return isoString;
    }
  };

  const sheetsUrl = spreadsheetId
    ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
    : null;
  const driveUrl = driveFolderId
    ? `https://drive.google.com/drive/folders/${driveFolderId}`
    : null;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Top Banner: Overview */}
      <div className="relative overflow-hidden bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 dark:from-emerald-950/60 dark:via-teal-950/60 dark:to-indigo-950/60 p-6 sm:p-8 rounded-2xl text-white shadow-xl">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-semibold uppercase tracking-wider mb-3">
            <Sparkles size={14} className="text-yellow-300" /> Cloud Backend Terintegrasi
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Google Sheets & Drive Backend
          </h1>
          <p className="mt-2 text-white/90 text-sm sm:text-base leading-relaxed">
            Data jurnal trading Anda otomatis tersinkronisasi 2 arah ke <strong>Google Sheets</strong> pribadi Anda, dan seluruh screenshot chart tersimpan aman di <strong>Google Drive</strong>. Cepat, transparan, dan gratis tanpa sewa database server.
          </p>
        </div>
        <div className="absolute -right-8 -bottom-10 opacity-15 pointer-events-none">
          <FileSpreadsheet size={240} />
        </div>
      </div>

      {/* Main Grid: Google Account & Cloud Hub */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Account Connection */}
        <div className="lg:col-span-1 bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700/60 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Cloud className="text-emerald-500" size={20} /> Akun Google
              </h3>
              {accessToken ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Terhubung
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                  Belum Terhubung
                </span>
              )}
            </div>

            {accessToken && userInfo ? (
              <div className="p-4 bg-gray-50 dark:bg-gray-750/50 rounded-xl border border-gray-100 dark:border-gray-700 mb-4">
                <div className="flex items-center gap-3">
                  {userInfo.picture ? (
                    <img
                      src={userInfo.picture}
                      alt={userInfo.name}
                      className="w-12 h-12 rounded-full ring-2 ring-emerald-500/30"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-lg">
                      {userInfo.name?.charAt(0) || "U"}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                      {userInfo.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {userInfo.email}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
                Tautkan akun Google Anda untuk mengaktifkan sinkronisasi otomatis ke Google Sheets dan Google Drive Anda secara instan.
              </div>
            )}

            <div className="space-y-2 text-xs text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-2">
                <ShieldCheck size={14} className="text-emerald-500 flex-shrink-0" />
                <span>Hanya mengakses file yang dibuat oleh aplikasi ini</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-emerald-500 flex-shrink-0" />
                <span>Penyimpanan hybrid (tetap lancar saat offline)</span>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-gray-100 dark:border-gray-700/60 mt-6">
            {accessToken ? (
              <button
                onClick={handleDisconnect}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 font-medium text-sm transition-colors cursor-pointer"
              >
                <LogOut size={16} /> Putuskan Akun Google
              </button>
            ) : (
              <button
                onClick={handleConnect}
                disabled={isConnecting}
                className="w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                {isConnecting ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" />
                    Menghubungkan...
                  </>
                ) : (
                  <>
                    <Cloud size={18} />
                    Hubungkan Akun Google
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Right Column: Google Sheets & Drive Hub */}
        <div className="lg:col-span-2 space-y-6">
          {/* Cloud Storage Hub Card */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700/60 shadow-sm">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <FileSpreadsheet className="text-emerald-600 dark:text-emerald-400" size={20} />
              Sumber Daya Cloud di Google Drive Anda
            </h3>

            {accessToken ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Google Sheet Card */}
                <div className="p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-sm">
                        <FileSpreadsheet size={18} />
                        Google Sheets Database
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-200/60 dark:bg-emerald-800/60 text-emerald-900 dark:text-emerald-200 font-semibold">
                        Multi-Tab
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-300 mb-3">
                      File: <strong>{SPREADSHEET_NAME}</strong>
                      <br />
                      Tab: <em>Trades, Profiles, Strategies, Transactions, Pairs</em>
                    </p>
                  </div>
                  {sheetsUrl ? (
                    <a
                      href={sheetsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors cursor-pointer"
                    >
                      Buka di Google Sheets <ExternalLink size={14} />
                    </a>
                  ) : (
                    <span className="text-xs text-gray-400 italic">Sedang disiapkan...</span>
                  )}
                </div>

                {/* Google Drive Folder Card */}
                <div className="p-4 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-800/40 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 text-blue-800 dark:text-blue-300 font-bold text-sm">
                        <FolderOpen size={18} />
                        Folder Google Drive
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-blue-200/60 dark:bg-blue-800/60 text-blue-900 dark:text-blue-200 font-semibold">
                        Screenshots
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-300 mb-3">
                      Folder: <strong>{APP_FOLDER_NAME}</strong>
                      <br />
                      Sub-folder: <em>Screenshots/ (Foto Chart Before/After)</em>
                    </p>
                  </div>
                  {driveUrl ? (
                    <a
                      href={driveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors cursor-pointer"
                    >
                      Buka Folder Drive <ExternalLink size={14} />
                    </a>
                  ) : (
                    <span className="text-xs text-gray-400 italic">Sedang disiapkan...</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-6 text-center rounded-xl bg-gray-50 dark:bg-gray-750 border border-dashed border-gray-300 dark:border-gray-700 text-gray-500 text-sm">
                Hubungkan akun Google di samping untuk membuat folder Drive dan file Google Sheets secara otomatis.
              </div>
            )}

            {/* Sync Controls & Status */}
            <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    Status Sinkronisasi:
                  </span>
                  {syncStatus === "syncing" ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                      <RefreshCw size={14} className="animate-spin" /> Menyinkronkan...
                    </span>
                  ) : syncStatus === "synced" ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle size={14} /> Tersinkron
                    </span>
                  ) : syncStatus === "error" ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400">
                      <AlertTriangle size={14} /> Gagal Sinkron
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500">Siap</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Terakhir sinkron: <strong>{formatLastSync(lastSyncTime)}</strong>
                </p>
                {syncStatusDetails && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                    {syncStatusDetails}
                  </p>
                )}
              </div>

              <button
                onClick={handleSyncNow}
                disabled={!accessToken || isSyncing}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-sm hover:shadow transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <RefreshCw size={16} className={isSyncing ? "animate-spin" : ""} />
                Sinkronkan Sekarang
              </button>
            </div>
          </div>

          {/* Migration Banner (If Local Data Exists) */}
          {accessToken && (localItemCounts.trades > 0 || localItemCounts.images > 0) && (
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 rounded-2xl p-6 border border-amber-200 dark:border-amber-800/40">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h4 className="text-base font-bold text-amber-900 dark:text-amber-200 flex items-center gap-2">
                    <UploadCloud size={18} /> Migrasikan Data Lokal ke Google Cloud
                  </h4>
                  <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-1">
                    Terdeteksi <strong>{localItemCounts.trades} trade</strong> dan <strong>{localItemCounts.images} gambar</strong> di browser ini. Unggah seluruh data ini ke Google Sheets dan Google Drive Anda agar aman dan dapat dibuka dari perangkat lain.
                  </p>
                </div>
                <button
                  onClick={handleStartMigration}
                  disabled={isMigrating}
                  className="w-full sm:w-auto flex-shrink-0 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-sm transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {isMigrating ? "Memproses Migrasi..." : "Mulai Migrasi Sekarang"}
                </button>
              </div>

              {/* Migration Progress Bar */}
              {isMigrating && migrationProgress && (
                <div className="mt-4 pt-4 border-t border-amber-200/60 dark:border-amber-800/60">
                  <div className="flex justify-between text-xs text-amber-900 dark:text-amber-200 mb-1 font-medium">
                    <span>{migrationProgress.message}</span>
                    <span>{migrationProgress.progress || 0}%</span>
                  </div>
                  <div className="w-full bg-amber-200/60 dark:bg-amber-900/60 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-amber-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${migrationProgress.progress || 0}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Advanced Settings Accordion: Google Cloud Client ID */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700/60 overflow-hidden shadow-sm">
        <button
          onClick={() => setShowConfigHelp(!showConfigHelp)}
          className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <Key size={18} className="text-indigo-500" />
            <span className="text-sm font-bold text-gray-900 dark:text-white">
              Konfigurasi Google OAuth Client ID (Opsional)
            </span>
          </div>
          <span className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold">
            {showConfigHelp ? "Sembunyikan" : "Tampilkan"}
          </span>
        </button>

        {showConfigHelp && (
          <div className="p-6 border-t border-gray-100 dark:border-gray-700/60 space-y-4 bg-gray-50/50 dark:bg-gray-850/50 text-xs text-gray-600 dark:text-gray-300">
            <p>
              Aplikasi sudah dilengkapi dengan <strong>Client ID bawaan</strong> agar Anda dapat langsung menautkan Google Drive & Sheets. Namun jika Anda ingin menggunakan project Google Cloud Console Anda sendiri, Anda dapat memasukkannya di bawah:
            </p>

            <form onSubmit={handleSaveCustomClientId} className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={customClientIdInput}
                onChange={(e) => setCustomClientIdInput(e.target.value)}
                placeholder="Masukkan Client ID Google Cloud Anda"
                className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs transition-colors"
              >
                Simpan
              </button>
              <button
                type="button"
                onClick={handleResetClientId}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-semibold rounded-lg text-xs transition-colors"
              >
                Reset Default
              </button>
            </form>

            <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 text-[11px] space-y-2 text-blue-900 dark:text-blue-200">
              <div className="font-bold flex items-center gap-1.5">
                <Info size={14} /> Panduan Menyiapkan Google Cloud Console Sendiri:
              </div>
              <ol className="list-decimal pl-4 space-y-1">
                <li>Buka <strong>Google Cloud Console</strong> & buat Project baru.</li>
                <li>Aktifkan <strong>Google Drive API</strong> dan <strong>Google Sheets API</strong> pada menu <em>Enabled APIs & Services</em>.</li>
                <li>Pada menu <strong>OAuth consent screen</strong>, pilih <em>External</em> dan tambahkan email penguji jika statusnya testing.</li>
                <li>Pada menu <strong>Credentials</strong>, buat <em>OAuth client ID</em> tipe <strong>Web application</strong>.</li>
                <li>Tambahkan domain ini ke <strong>Authorized JavaScript origins</strong>: <code className="bg-blue-100 dark:bg-blue-900/60 px-1 py-0.5 rounded">{window.location.origin}</code></li>
                <li>Salin <strong>Client ID</strong> yang dihasilkan dan tempelkan ke kolom input di atas.</li>
              </ol>
            </div>
          </div>
        )}
      </div>

      {/* Offline Backup & Restore Section (Local File JSON Fallback) */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700/60 shadow-sm">
        <h3 className="text-base font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
          <FileDown size={18} className="text-gray-500" /> Cadangan Berkas Offline (.JSON)
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Anda juga dapat mengekspor atau mengimpor data jurnal secara manual dalam bentuk berkas JSON untuk disimpan langsung di komputer Anda tanpa internet.
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleExportJSON}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-semibold text-xs transition-colors cursor-pointer"
          >
            <FileDown size={15} /> Ekspor Data ke File .JSON
          </button>

          <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-semibold text-xs transition-colors cursor-pointer">
            <FileUp size={15} /> Impor dari File .JSON
            <input
              type="file"
              accept=".json"
              onChange={handleImportJSON}
              className="hidden"
            />
          </label>
        </div>
      </div>
    </div>
  );
};
