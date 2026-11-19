# 放置天地離線素材下載工具

這個工具會讀取公開的素材路徑清單，將遊戲網站提供的圖片與音效下載到本機，並保留原本的 `assets/...` 路徑。

## 下載工具

下載這個檔案即可，不必下載整個倉庫：

[download-assets.mjs](https://raw.githubusercontent.com/summer55637/WW/offline-assets-downloader/tools/download-assets.mjs)

將檔案存到 Windows 桌面，檔名可保持為 `download-assets.mjs`。

## 執行方式

開啟 PowerShell，輸入：

```powershell
cd ([Environment]::GetFolderPath("Desktop"))
node .\download-assets.mjs core
```

第一批 `core` 是介面、角色立繪、背景、圖示及基本效果。

下載完成後，素材會放在桌面的：

`放置天地-離線素材\assets\...`

## 其他批次

```powershell
node .\download-assets.mjs combat
node .\download-assets.mjs audio
```

- `combat`：怪物、角色、召喚物、寵物與技能特效動畫。
- `audio`：音效與背景音樂。
- `all`：下載全部公開圖片與音效，檔案可能很多，請先確認網路流量及硬碟空間。

## 小量測試及續傳

先用 50 個檔案測試：

```powershell
node .\download-assets.mjs core --limit=50
```

確認正常後，再執行完整核心批次：

```powershell
node .\download-assets.mjs core
```

重跑同一批次會跳過已下載完成的檔案，只補缺少或失敗的項目。下載結果與失敗清單會寫在素材資料夾內的 `下載摘要.txt` 和 `下載失敗清單.txt`。

## 注意

- 需要 Node.js 18 以上，建議 Node.js 24。
- 下載只會存取遊戲網站公開的靜態圖片與音效，不會讀取帳號、密碼、Cookie 或登入資料。
- 這份清單目前只收錄圖片與音效檔；遊戲程式、地圖資料 JSON、API 等仍需另外分析，不能視為完整單機版。
- 不建議直接把全部素材再上傳到公開 GitHub 倉庫；先在本機保存與測試。
