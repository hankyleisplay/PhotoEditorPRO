# Photo Editor PRO 📸

一個基於 HTML5 Canvas 的專業級本機相片編輯器，以極輕量、零後台通訊、低系統資源消耗為核心設計。

## ✨ 特色功能

1. **核心相片調整**
   - ☀️ **曝光度 (Exposure)**：調整照片的明暗細節
   - 🌓 **對比度 (Contrast)**：增強或降低影像的明暗反差
   - 🌡️ **色溫 (Temperature)**：微調偏暖（橘）或偏冷（藍）色調
   - 🎨 **色調 (Tint)**：修正偏綠或偏洋紅（紫）的色彩平衡
   - 💧 **飽和度 (Saturation)**：調整色彩鮮豔度（調至 -100 可呈現純黑白效果）

2. **11 種精美相片濾鏡預設 (Presets)**
   - 內建 11 款精心調校的專業相片濾鏡，點擊時會以**平滑動畫滑動拉桿**套用：
     - **原圖 (Original)**：還原所有調整數值。
     - **溫暖復古 (Warm Vintage)**：經典懷舊暖色風格。
     - **冷調青藍 (Cool Cyan)**：日系清新青藍色調。
     - **強烈黑白 (High Contrast Mono)**：明暗對比強烈的高反差單色。
     - **電影感 (Cinematic)**：帶有冷暗部與暖亮部的底片調性。
     - **日落金黃 (Sunset)**：加強金黃陽光色彩的渲染。
     - **Lomo 復古 (Lomo Retro)**：高飽和、高對比，陰影帶有微微冷調。
     - **粉嫩日系 (Soft Pastel)**：亮麗低對比，輕柔溫暖的空氣感。
     - **午夜冷調 (Midnight Drama)**：冷峻沉鬱的藍色夜幕感。
     - **翡翠森林 (Emerald Forest)**：綠意盎然、自然通透的森系風格。
     - **賽博龐克 (Cyberpunk)**：科幻感霓虹（洋紅與藍綠）雙色碰撞。

3. **實時對比與極致效能 (Real-time & Performance)**
   - **實時原圖比較**：長按「比較原圖」按鈕即可瞬間切換至未修改前的原圖，放開後恢復編輯狀態。
   - **雙畫布效能優化**：編輯時自動產生預設解析度畫布進行濾鏡渲染，確保滑動拉桿時擁有 **60 FPS** 級別的流暢反饋；下載時則會以背景異步線程處理**完整無損的高解析度原圖**，兼顧速度與畫質。

4. **畫布視窗縮放與拖曳 (Zoom & Pan)**
   - 支援滑鼠滾輪縮放、按住畫布點擊拖曳進行平移。
   - 支援「符合視窗」一鍵置中對齊。

5. **歷史紀錄管理 (Undo/Redo)**
   - 完整的歷史快照堆疊，隨時還原 (Undo) 與重做 (Redo) 任何一步微調。

6. **免安裝即用範例**
   - 內建一幅精美的「日落山景」範例圖片，一鍵即可載入進行測試。

7. **匯出對話框 (Export)**
   - 可選擇 **JPEG / PNG / WebP** 格式、品質 (50–100) 與輸出尺寸 (100% / 75% / 50% / 25%)，並即時顯示輸出像素。
   - 一鍵 **複製到剪貼簿**（PNG），可直接貼到聊天軟體或其他編輯器。
   - 超過瀏覽器畫布上限的超大圖片會自動縮小並提示，不會再失敗或當機。

8. **自訂預設 (My Presets)**
   - 將目前的調整存成自己的預設（儲存在本機），可隨時套用、搭配「濾鏡強度」混合或刪除。

9. **更方便的載入方式**
   - 將相片拖曳到視窗 **任何位置**（編輯中也可直接換圖）、`Ctrl + V` 貼上剪貼簿圖片、`Ctrl + O` 開啟檔案。

10. **細節操作**
    - **雙擊任一滑桿**（或其標籤）即可單獨重設該項目。
    - 滾輪縮放以 **游標位置為中心**，每一步縮放比例一致；縮放比例顯示的是**真實影像比例**，放大時會自動以更高解析度重繪（最高 2400px），細節保持清晰，按「符合視窗」即還原。
    - 字型已內建（Plus Jakarta Sans），程式完全離線可用。

---

## 🚀 快速開始

### 方式 1：作為獨立桌面軟體運行 (Electron) — 推薦！

這可以將編輯器以獨立視窗開啟，體驗與原生軟體無異：

1. 開啟終端機並切換至專案目錄：
   ```bash
   cd "C:\Users\kylel\Desktop\code\Photo Editor PRO"
   ```
2. 啟動桌面程式：
   ```bash
   npm start
   ```
   *(或者雙擊運行 `dist/Photo Editor PRO 1.0.0.exe`)*

### 方式 2：使用網頁開發伺服器 (Vite)

如果您想在一般瀏覽器中打開它：

1. 開啟終端機並切換至專案目錄：
   ```bash
   cd "C:\Users\kylel\Desktop\code\Photo Editor PRO"
   ```
2. 啟動伺服器：
   ```bash
   npm run dev
   ```
3. 在瀏覽器中打開產生的網址（通常為 `http://localhost:5173`），即可開始編輯！

---

## ⌨️ 快捷鍵支援

- `Ctrl + Z`：還原 (Undo)
- `Ctrl + Y` / `Ctrl + Shift + Z`：重做 (Redo)
- `Ctrl + S`：開啟儲存（匯出）對話框
- `Ctrl + O`：開啟相片檔案
- `Ctrl + V`：貼上剪貼簿中的圖片
- `Ctrl + +` / `Ctrl + =`：放大圖片
- `Ctrl + -`：縮小圖片
- `Ctrl + 0`：調整為符合視窗
- `按住 \` 鍵：快速比較原圖
- `Enter` / `Esc`：裁切模式中套用 / 取消
- `滑鼠滾輪`：以游標為中心縮放
- `按住滑鼠拖曳`：平移檢視縮放後的圖片
- `滑鼠長按 [比較原圖] 按鈕`：快速比較前後差異

---

## 🛠️ 技術棧

- **結構**：HTML5 & Semantic HTML
- **樣式**：純 CSS (Vanilla CSS)，採用 Modern Dark 霓虹主題與毛玻璃面板 (Glassmorphism)
- **邏輯**：Vanilla JavaScript (高度優化的 ImageData 像素操作)
- **圖示庫**：Lucide Icons（隨專案附帶 `lucide.min.js`）
- **核心運算**：Rust 編譯的 WebAssembly（`src-rust/`），Wasm 無法載入時自動改用 JS 引擎

### 重新編譯 Wasm 核心

```bash
rustup target add wasm32-unknown-unknown
cd src-rust
cargo build --release --target wasm32-unknown-unknown
cp target/wasm32-unknown-unknown/release/image_processor.wasm ../image_processor.wasm
```

> 修改 `src-rust/src/lib.rs` 的像素演算法時，請同步更新 `app.js` 中的 JS 後備引擎（例如 `grainNoise()`），兩者的結果必須一致。

---

## 📄 授權

本專案以 [GNU General Public License v3.0](LICENSE)（GPL-3.0-or-later）釋出，免費且開源，不需要任何授權序號。
