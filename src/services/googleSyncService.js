// --- Google Sheets & Google Drive Sync Service ---
import {
  getAllItems,
  addItem,
  updateItem,
  getItem,
  initDB
} from "../config/db";

export const DEFAULT_CLIENT_ID = "713176227043-71hterdm3emrl9jrcsm25ptu18510umk.apps.googleusercontent.com";
export const APP_FOLDER_NAME = "Trading Journal App";
export const SCREENSHOTS_FOLDER_NAME = "Screenshots";
export const SPREADSHEET_NAME = "Trading_Journal_Data";

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/userinfo.email"
].join(" ");

// Listeners for sync state
let syncListeners = [];
let currentSyncStatus = "idle"; // "idle" | "syncing" | "synced" | "error"
let debouncedTimer = null;

export const subscribeSyncStatus = (callback) => {
  syncListeners.push(callback);
  callback(currentSyncStatus);
  return () => {
    syncListeners = syncListeners.filter((cb) => cb !== callback);
  };
};

export const setSyncStatus = (status, details = null) => {
  currentSyncStatus = status;
  syncListeners.forEach((cb) => cb(status, details));
  window.dispatchEvent(
    new CustomEvent("trading-journal-sync-status", {
      detail: { status, details, timestamp: new Date().toISOString() }
    })
  );
};

export const getStoredClientId = () => {
  return localStorage.getItem("gdrive_sync_client_id") || DEFAULT_CLIENT_ID;
};

export const setStoredClientId = (id) => {
  if (id) {
    localStorage.setItem("gdrive_sync_client_id", id.trim());
  } else {
    localStorage.removeItem("gdrive_sync_client_id");
  }
};

export const getStoredToken = () => {
  return localStorage.getItem("gdrive_sync_token") || "";
};

export const getStoredUser = () => {
  try {
    const raw = localStorage.getItem("gdrive_connected_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const getLastSyncTime = () => {
  return localStorage.getItem("gdrive_last_sync_time") || null;
};

export const getSpreadsheetId = () => {
  return localStorage.getItem("gdrive_spreadsheet_id") || null;
};

export const getDriveFolderId = () => {
  return localStorage.getItem("gdrive_app_folder_id") || null;
};

// --- Google Identity Services Login Flow ---
export const connectGoogleAccount = (customClientId = null) => {
  return new Promise((resolve, reject) => {
    const clientId = customClientId || getStoredClientId();
    if (!clientId) {
      return reject(new Error("Google OAuth Client ID belum dikonfigurasi."));
    }

    if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
      return reject(
        new Error(
          "Script Google Identity Services belum siap. Periksa koneksi internet Anda."
        )
      );
    }

    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: async (tokenResponse) => {
          if (tokenResponse && tokenResponse.access_token) {
            localStorage.setItem("gdrive_sync_token", tokenResponse.access_token);
            try {
              const userInfo = await fetchGoogleUserInfo(tokenResponse.access_token);
              localStorage.setItem("gdrive_connected_user", JSON.stringify(userInfo));
              resolve({ token: tokenResponse.access_token, user: userInfo });
            } catch (userErr) {
              resolve({ token: tokenResponse.access_token, user: null });
            }
          } else {
            reject(new Error("Otentikasi dibatalkan atau izin tidak diberikan."));
          }
        },
        error_callback: (err) => {
          console.error("GIS Error:", err);
          reject(new Error(err.message || "Gagal melakukan otentikasi Google."));
        }
      });

      client.requestAccessToken();
    } catch (err) {
      reject(err);
    }
  });
};

export const disconnectGoogleAccount = () => {
  const token = getStoredToken();
  if (token && window.google?.accounts?.oauth2?.revoke) {
    try {
      window.google.accounts.oauth2.revoke(token, () => {});
    } catch (e) {
      console.warn("Error revoking token:", e);
    }
  }
  localStorage.removeItem("gdrive_sync_token");
  localStorage.removeItem("gdrive_connected_user");
  localStorage.removeItem("gdrive_app_folder_id");
  localStorage.removeItem("gdrive_screenshots_folder_id");
  localStorage.removeItem("gdrive_spreadsheet_id");
  localStorage.removeItem("gdrive_last_sync_time");
  setSyncStatus("idle");
};

export const fetchGoogleUserInfo = async (token = null) => {
  const authToken = token || getStoredToken();
  if (!authToken) throw new Error("Tidak ada token otentikasi.");

  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${authToken}` }
  });
  if (!res.ok) {
    if (res.status === 401) {
      disconnectGoogleAccount();
      throw new Error("Sesi Google telah berakhir. Silakan login kembali.");
    }
    throw new Error("Gagal mengambil profil akun Google.");
  }
  return await res.json();
};

// --- Google Drive Folder & File Management ---
const driveFetch = async (url, options = {}) => {
  const token = getStoredToken();
  if (!token) throw new Error("Akun Google belum terhubung.");

  const headers = {
    Authorization: `Bearer ${token}`,
    ...(options.headers || {})
  };

  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    disconnectGoogleAccount();
    setSyncStatus("error", "Sesi Google telah kedaluwarsa. Silakan login kembali.");
    throw new Error("Sesi Google telah kedaluwarsa.");
  }
  return res;
};

export const findOrCreateFolder = async (folderName, parentFolderId = null) => {
  let query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  if (parentFolderId) {
    query += ` and '${parentFolderId}' in parents`;
  }

  const searchRes = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      query
    )}&fields=files(id,name)`
  );
  if (!searchRes.ok) throw new Error(`Gagal mencari folder: ${folderName}`);
  const searchData = await searchRes.json();

  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Create folder
  const meta = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder",
    parents: parentFolderId ? [parentFolderId] : []
  };

  const createRes = await driveFetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(meta)
  });

  if (!createRes.ok) throw new Error(`Gagal membuat folder: ${folderName}`);
  const newFolder = await createRes.json();
  return newFolder.id;
};

export const ensureDriveStructure = async () => {
  let rootFolderId = getDriveFolderId();
  if (!rootFolderId) {
    rootFolderId = await findOrCreateFolder(APP_FOLDER_NAME);
    localStorage.setItem("gdrive_app_folder_id", rootFolderId);
  }

  let screenshotsFolderId = localStorage.getItem("gdrive_screenshots_folder_id");
  if (!screenshotsFolderId) {
    screenshotsFolderId = await findOrCreateFolder(SCREENSHOTS_FOLDER_NAME, rootFolderId);
    localStorage.setItem("gdrive_screenshots_folder_id", screenshotsFolderId);
  }

  let spreadsheetId = getSpreadsheetId();
  if (!spreadsheetId) {
    spreadsheetId = await findOrCreateSpreadsheet(rootFolderId);
    localStorage.setItem("gdrive_spreadsheet_id", spreadsheetId);
  }

  return { rootFolderId, screenshotsFolderId, spreadsheetId };
};

// --- Google Sheets Schema & Creation ---
const SHEET_HEADERS = {
  Trades: [
    "id",
    "profileId",
    "tradeDate",
    "pair",
    "direction",
    "entryPrice",
    "stopLoss",
    "takeProfit",
    "exitPrice",
    "pnl",
    "riskReward",
    "status",
    "strategy",
    "notes",
    "screenshotBeforeId",
    "screenshotAfterId",
    "customFields",
    "createdAt",
    "updatedAt"
  ],
  Profiles: ["id", "name", "initialBalance", "currency", "createdAt", "updatedAt"],
  Strategies: [
    "id",
    "profileId",
    "name",
    "description",
    "rules",
    "sampleImageId",
    "createdAt",
    "updatedAt"
  ],
  Transactions: ["id", "profileId", "date", "type", "amount", "notes", "createdAt"],
  Pairs: ["id", "profileId", "symbol", "name"]
};

export const findOrCreateSpreadsheet = async (parentFolderId) => {
  // Check if file exists in parentFolder
  const query = `name = '${SPREADSHEET_NAME}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false and '${parentFolderId}' in parents`;
  const searchRes = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      query
    )}&fields=files(id,name)`
  );

  if (searchRes.ok) {
    const data = await searchRes.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
  }

  // Create spreadsheet using Google Sheets API
  const sheetPayload = {
    properties: { title: SPREADSHEET_NAME },
    sheets: Object.keys(SHEET_HEADERS).map((title) => ({
      properties: { title }
    }))
  };

  const createRes = await driveFetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sheetPayload)
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    console.error("Failed to create spreadsheet:", errText);
    throw new Error("Gagal membuat Google Spreadsheet di akun Anda.");
  }

  const sheetData = await createRes.json();
  const spreadsheetId = sheetData.spreadsheetId;

  // Move spreadsheet into Trading Journal App folder
  try {
    await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${spreadsheetId}?addParents=${parentFolderId}&fields=id,parents`,
      { method: "PATCH" }
    );
  } catch (moveErr) {
    console.warn("Could not move spreadsheet to subfolder:", moveErr);
  }

  // Write headers for each sheet
  const headerData = Object.entries(SHEET_HEADERS).map(([sheetTitle, headers]) => ({
    range: `${sheetTitle}!A1:${String.fromCharCode(64 + headers.length)}1`,
    values: [headers]
  }));

  await driveFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        valueInputOption: "USER_ENTERED",
        data: headerData
      })
    }
  );

  return spreadsheetId;
};

// --- Google Drive Image Upload ---
export const uploadImageToDrive = async (fileOrBlob, filename = "screenshot.png") => {
  const { screenshotsFolderId } = await ensureDriveStructure();
  const token = getStoredToken();
  if (!token) throw new Error("Google account not connected");

  const metadata = {
    name: filename,
    parents: [screenshotsFolderId]
  };

  // Convert blob/file to ArrayBuffer
  let blob = fileOrBlob;
  if (typeof fileOrBlob === "string" && fileOrBlob.startsWith("data:")) {
    // base64 data url
    const parts = fileOrBlob.split(",");
    const mime = parts[0].match(/:(.*?);/)[1];
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    blob = new Blob([u8arr], { type: mime });
  }

  const boundary = "-------trading_journal_boundary_" + Math.random().toString(36).substring(2);
  const delimiter = "\r\n--" + boundary + "\r\n";
  const closeDelimiter = "\r\n--" + boundary + "--";

  const metadataContentType = "application/json; charset=UTF-8";
  const fileContentType = blob.type || "image/png";

  const metaPart =
    delimiter +
    "Content-Type: " +
    metadataContentType +
    "\r\n\r\n" +
    JSON.stringify(metadata) +
    delimiter +
    "Content-Type: " +
    fileContentType +
    "\r\n" +
    "Content-Transfer-Encoding: base64\r\n\r\n";

  // Read blob as base64 string
  const base64Content = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64 = dataUrl.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  const multipartBody = metaPart + base64Content + closeDelimiter;

  const uploadRes = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "multipart/related; boundary=" + boundary
      },
      body: multipartBody
    }
  );

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    console.error("Upload failed:", errText);
    throw new Error("Gagal mengunggah gambar ke Google Drive.");
  }

  const uploadedFile = await uploadRes.json();
  const fileId = uploadedFile.id;

  // Set file permission to 'anyone with the link can view'
  try {
    await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role: "reader",
        type: "anyone"
      })
    });
  } catch (permErr) {
    console.warn("Failed to set public permission:", permErr);
  }

  // Google direct thumbnail link (fast & reliable)
  const directUrl = `https://lh3.googleusercontent.com/d/${fileId}`;

  return {
    fileId,
    directUrl,
    webViewLink: uploadedFile.webViewLink || directUrl
  };
};

// --- Two-Way Synchronization Engine ---
const serializeValue = (val) => {
  if (val === null || val === undefined) return "";
  if (typeof val === "object") {
    if (val instanceof Date) return val.toISOString();
    return JSON.stringify(val);
  }
  return String(val);
};

const deserializeValue = (val, key) => {
  if (val === "" || val === null || val === undefined) return null;
  if (key === "customFields" || key === "rules") {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }
  if (key.toLowerCase().endsWith("date") || key === "createdAt" || key === "updatedAt") {
    return new Date(val);
  }
  if (["entryPrice", "stopLoss", "takeProfit", "exitPrice", "pnl", "riskReward", "initialBalance", "amount"].includes(key)) {
    const num = Number(val);
    return isNaN(num) ? val : num;
  }
  return val;
};

export const syncTwoWayWithGoogle = async () => {
  const token = getStoredToken();
  if (!token) return { success: false, reason: "not_connected" };

  setSyncStatus("syncing");

  try {
    const { spreadsheetId } = await ensureDriveStructure();

    // 1. Fetch all sheet values via batchGet
    const ranges = Object.keys(SHEET_HEADERS)
      .map((sheetTitle) => `ranges=${sheetTitle}!A1:Z`)
      .join("&");

    const batchRes = await driveFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${ranges}`
    );

    if (!batchRes.ok) {
      throw new Error("Gagal mengambil data dari Google Sheets.");
    }

    const batchData = await batchRes.json();
    const sheetValuesMap = {};
    (batchData.valueRanges || []).forEach((vr) => {
      const sheetName = vr.range.split("!")[0].replace(/['"]/g, "");
      sheetValuesMap[sheetName] = vr.values || [];
    });

    await initDB();

    // Store mappings
    const storeMapping = {
      Trades: "trades",
      Profiles: "profiles",
      Strategies: "strategies",
      Transactions: "balance_transactions",
      Pairs: "pairs"
    };

    const updatePayloads = [];

    for (const [sheetTitle, storeName] of Object.entries(storeMapping)) {
      const headers = SHEET_HEADERS[sheetTitle];
      const rows = sheetValuesMap[sheetTitle] || [];
      const dataRows = rows.slice(1); // skip header row

      // Parse remote records
      const remoteMap = new Map();
      dataRows.forEach((row) => {
        const item = {};
        headers.forEach((h, idx) => {
          item[h] = deserializeValue(row[idx], h);
        });
        if (item.id) {
          remoteMap.set(String(item.id), item);
        }
      });

      // Get local records from IndexedDB
      const localItems = await getAllItems(storeName);
      const localMap = new Map();
      localItems.forEach((item) => {
        if (item.id) localMap.set(String(item.id), item);
      });

      // Reconcile
      const mergedMap = new Map();

      // Process all local items
      for (const [id, localItem] of localMap.entries()) {
        if (remoteMap.has(id)) {
          const remoteItem = remoteMap.get(id);
          const localTime = new Date(localItem.updatedAt || localItem.createdAt || 0).getTime();
          const remoteTime = new Date(remoteItem.updatedAt || remoteItem.createdAt || 0).getTime();

          if (remoteTime > localTime) {
            // Remote is newer: update IndexedDB
            await updateItem(storeName, remoteItem);
            mergedMap.set(id, remoteItem);
          } else {
            // Local is newer or equal: keep local
            mergedMap.set(id, localItem);
          }
        } else {
          // Exists locally only: keep local
          mergedMap.set(id, localItem);
        }
      }

      // Process remote items that don't exist locally
      for (const [id, remoteItem] of remoteMap.entries()) {
        if (!localMap.has(id)) {
          await addItem(storeName, remoteItem);
          mergedMap.set(id, remoteItem);
        }
      }

      // Prepare sheet rewrite data
      const mergedArray = Array.from(mergedMap.values());
      const sheetRows = [
        headers,
        ...mergedArray.map((item) => headers.map((h) => serializeValue(item[h])))
      ];

      // Add to batch update
      updatePayloads.push({
        range: `${sheetTitle}!A1:${String.fromCharCode(64 + headers.length)}${Math.max(sheetRows.length, 100)}`,
        values: sheetRows
      });
    }

    // 2. Batch update Google Sheets with merged data
    // First clear old ranges or update directly
    await driveFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          valueInputOption: "USER_ENTERED",
          data: updatePayloads
        })
      }
    );

    const now = new Date().toISOString();
    localStorage.setItem("gdrive_last_sync_time", now);
    setSyncStatus("synced", { lastSyncTime: now });
    return { success: true, timestamp: now };
  } catch (err) {
    console.error("Two-way sync error:", err);
    setSyncStatus("error", err.message || "Gagal melakukan sinkronisasi dengan Google.");
    return { success: false, error: err.message };
  }
};

// --- Debounced Auto-Sync Scheduler ---
export const scheduleDebouncedSync = (delayMs = 4000) => {
  const token = getStoredToken();
  if (!token) return;

  if (debouncedTimer) {
    clearTimeout(debouncedTimer);
  }

  setSyncStatus("syncing", "Menyimpan perubahan ke Google Sheets...");

  debouncedTimer = setTimeout(() => {
    syncTwoWayWithGoogle();
  }, delayMs);
};

// --- Full Local Migration Helper ---
export const migrateLocalDataToGoogle = async (onProgress = () => {}) => {
  const token = getStoredToken();
  if (!token) throw new Error("Akun Google belum terhubung.");

  setSyncStatus("syncing", "Memulai migrasi data ke Google Drive & Sheets...");

  const { screenshotsFolderId, spreadsheetId } = await ensureDriveStructure();

  await initDB();

  // 1. Migrate Images
  onProgress({ stage: "images", message: "Memeriksa dan mengunggah gambar screenshot ke Google Drive..." });
  const rawImages = await getAllItems("trade_images");
  const imageIdToUrlMap = new Map();

  let uploadedCount = 0;
  for (let i = 0; i < rawImages.length; i++) {
    const imgItem = rawImages[i];
    if (imgItem.file || imgItem.base64) {
      try {
        onProgress({
          stage: "images",
          message: `Mengunggah gambar ${i + 1} dari ${rawImages.length}...`,
          progress: Math.round(((i + 1) / rawImages.length) * 50)
        });

        const uploaded = await uploadImageToDrive(
          imgItem.file || imgItem.base64,
          `screenshot_${imgItem.id}.png`
        );
        imageIdToUrlMap.set(imgItem.id, uploaded.directUrl);
        uploadedCount++;
      } catch (e) {
        console.warn(`Gagal mengunggah gambar ${imgItem.id}:`, e);
      }
    }
  }

  // 2. Update local trades with new Google Drive image URLs
  onProgress({ stage: "updating_trades", message: "Menautkan URL gambar ke jurnal trade...", progress: 60 });
  const localTrades = await getAllItems("trades");
  for (const trade of localTrades) {
    let modified = false;
    if (trade.screenshotBeforeId && imageIdToUrlMap.has(trade.screenshotBeforeId)) {
      trade.screenshotBeforeId = imageIdToUrlMap.get(trade.screenshotBeforeId);
      modified = true;
    }
    if (trade.screenshotAfterId && imageIdToUrlMap.has(trade.screenshotAfterId)) {
      trade.screenshotAfterId = imageIdToUrlMap.get(trade.screenshotAfterId);
      modified = true;
    }
    if (modified) {
      trade.updatedAt = new Date();
      await updateItem("trades", trade);
    }
  }

  // 3. Perform Full Two-Way Sync to populate all sheets
  onProgress({ stage: "sheets", message: "Mengunggah seluruh data tabel ke Google Sheets...", progress: 85 });
  await syncTwoWayWithGoogle();

  onProgress({ stage: "complete", message: "Migrasi selesai! Seluruh data aman di Google Sheets & Drive.", progress: 100 });
  setSyncStatus("synced");

  return { uploadedImages: uploadedCount, totalTrades: localTrades.length };
};
