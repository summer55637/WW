#!/usr/bin/env node
/**
 * 放置天地公開靜態素材下載器
 * Node.js 18+（建議 Node.js 24）
 *
 * 用法：
 *   node 下載素材.mjs core
 *   node 下載素材.mjs combat
 *   node 下載素材.mjs audio
 *   node 下載素材.mjs all
 *
 * 可選參數：
 *   --limit=100       只下載排序後前 100 個
 *   --dir=fx          只下載指定素材子資料夾（例如 fx、sprites）
 *   --sample=100      從指定子資料夾均勻抽樣 100 個，供容量估算
 *   --jobs=4          同時下載數量（預設 4）
 *   --force           覆蓋已存在的非空檔案
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const BASE_URL = "https://thinn-kong-a-kiann-live.pages.dev";
const LIST_URL = "https://raw.githubusercontent.com/summer55637/WW/main/%E7%B4%A0%E6%9D%90%E5%AE%8C%E6%95%B4%E8%B7%AF%E5%BE%91%E6%B8%85%E5%96%AE.txt";
const OUTPUT_DIR = path.join(process.cwd(), "放置天地-離線素材");

const GROUPS = {
  core: [
    "assets/actmap/", "assets/start/", "assets/character/",
    "assets/background/", "assets/icons/", "assets/effects/"
  ],
  combat: [
    "assets/anim/", "assets/morphanim/", "assets/sprites/",
    "assets/summon/", "assets/pet/", "assets/fx/"
  ],
  audio: ["assets/sfx/", "assets/bgm/", "assets/sound/"]
};
const ALL_GROUPS = [...GROUPS.core, ...GROUPS.combat, ...GROUPS.audio];
const ALLOWED_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg", ".ogg", ".mp3"]);

const args = process.argv.slice(2);
const group = args.find(a => !a.startsWith("--")) || "core";
const limitArg = args.find(a => a.startsWith("--limit="));
const sampleArg = args.find(a => a.startsWith("--sample="));
const dirArg = args.find(a => a.startsWith("--dir="));
const jobsArg = args.find(a => a.startsWith("--jobs="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;
const sample = sampleArg ? Number(sampleArg.split("=")[1]) : 0;
const dir = dirArg ? dirArg.split("=").slice(1).join("=").trim() : "";
const jobs = Math.max(1, Math.min(8, Number(jobsArg?.split("=")[1] || 4)));
const force = args.includes("--force");

if (!["core", "combat", "audio", "all"].includes(group)) {
  console.error("批次請使用 core、combat、audio 或 all。");
  process.exit(1);
}
if (limitArg && (!Number.isInteger(limit) || limit < 1)) {
  console.error("--limit 必須是正整數，例如 --limit=100");
  process.exit(1);
}
if (sampleArg && (!Number.isInteger(sample) || sample < 1)) {
  console.error("--sample 必須是正整數，例如 --sample=50");
  process.exit(1);
}
if (limitArg && sampleArg) {
  console.error("--limit 和 --sample 請擇一使用。");
  process.exit(1);
}
const validDirs = Object.values(GROUPS).flatMap(items =>
  items.map(prefix => prefix.slice("assets/".length, -1))
);
if (dir && !validDirs.includes(dir)) {
  console.error("不認識這個資料夾。可用：" + validDirs.join("、"));
  process.exit(1);
}
if (dir && group !== "all" &&
    !GROUPS[group].some(prefix => prefix === "assets/" + dir + "/")) {
  console.error("--dir=" + dir + " 不屬於 " + group + " 批次。");
  process.exit(1);
}

function safeRelativePath(value) {
  const clean = value.split("?")[0].replaceAll("\\", "/");
  const normalized = path.posix.normalize(clean);
  if (!normalized.startsWith("assets/") || normalized.startsWith("../") ||
      normalized.includes("/../") || path.posix.isAbsolute(normalized)) {
    return null;
  }
  const ext = path.posix.extname(normalized).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) return null;
  return normalized;
}

function encodedAssetUrl(relativePath) {
  const encoded = relativePath.split("/").map(part => encodeURIComponent(part)).join("/");
  return BASE_URL + "/" + encoded;
}

async function ensureDirFor(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function downloadOne(relativePath) {
  const destination = path.join(OUTPUT_DIR, ...relativePath.split("/"));
  const temporary = destination + ".part";

  if (!force) {
    try {
      const stat = await fs.stat(destination);
      if (stat.isFile() && stat.size > 0) return { status: "skipped", path: relativePath };
    } catch {
      // 檔案不存在，繼續下載。
    }
  }

  await ensureDirFor(destination);

  let lastError = "未知錯誤";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(encodedAssetUrl(relativePath), {
        signal: AbortSignal.timeout(45000),
        headers: { "User-Agent": "WW-Offline-Asset-Downloader/1.0" }
      });

      if (!response.ok) {
        const err = new Error("HTTP " + response.status);
        err.retryable = [408, 425, 429, 500, 502, 503, 504].includes(response.status);
        throw err;
      }

      const data = Buffer.from(await response.arrayBuffer());
      if (data.length === 0) throw new Error("回應內容為空");

      await fs.writeFile(temporary, data);
      await fs.rename(temporary, destination);
      return { status: "downloaded", path: relativePath, bytes: data.length };
    } catch (error) {
      lastError = error?.message || String(error);
      try { await fs.rm(temporary, { force: true }); } catch {}

      if (attempt >= 3 || error?.retryable === false) break;
      await new Promise(resolve => setTimeout(resolve, 1200 * attempt));
    }
  }

  return { status: "failed", path: relativePath, error: lastError };
}

async function main() {
  console.log("讀取 GitHub 素材路徑清單...");
  const listResponse = await fetch(LIST_URL, { signal: AbortSignal.timeout(30000) });
  if (!listResponse.ok) throw new Error("無法讀取 GitHub 清單，HTTP " + listResponse.status);

  const text = await listResponse.text();
  const unique = new Set();

  for (const line of text.split(/\r?\n/)) {
    const rawPath = (line.split("\t")[0] || "").trim();
    const safePath = safeRelativePath(rawPath);
    if (safePath) unique.add(safePath);
  }

  const prefixes = group === "all" ? ALL_GROUPS : GROUPS[group];
  let selected = [...unique].filter(p => prefixes.some(prefix => p.startsWith(prefix)));
  if (dir) selected = selected.filter(p => p.startsWith("assets/" + dir + "/"));
  selected.sort((a, b) => a.localeCompare(b, "zh-Hant"));

  // 均勻抽樣：從排序後的完整清單等距取樣，避免只抓到資料夾開頭的檔案。
  if (sample && sample < selected.length) {
    const evenlySampled = [];
    if (sample === 1) {
      evenlySampled.push(selected[Math.floor((selected.length - 1) / 2)]);
    } else {
      for (let i = 0; i < sample; i++) {
        const index = Math.round(i * (selected.length - 1) / (sample - 1));
        evenlySampled.push(selected[index]);
      }
    }
    selected = evenlySampled;
  } else if (limit) {
    selected = selected.slice(0, limit);
  }

  if (selected.length === 0) throw new Error("此批次沒有找到可下載的素材路徑。");

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  console.log("批次：" + group);
  if (dir) console.log("指定資料夾：assets/" + dir + "/");
  if (sample) console.log("抽樣方式：完整清單均勻抽樣");
  console.log("素材數：" + selected.length);
  console.log("同時下載：" + jobs);
  console.log("存放位置：" + OUTPUT_DIR);
  console.log("注意：本程式只下載公開圖片與音效，不會讀取帳號、密碼或登入資料。");
  console.log("");

  const results = [];
  let nextIndex = 0;
  let finished = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= selected.length) return;

      const result = await downloadOne(selected[index]);
      results.push(result);
      finished++;

      if (finished % 25 === 0 || finished === selected.length) {
        const ok = results.filter(x => x.status === "downloaded").length;
        const skipped = results.filter(x => x.status === "skipped").length;
        const failed = results.filter(x => x.status === "failed").length;
        process.stdout.write(
          "\r進度 " + finished + "/" + selected.length +
          "｜新下載 " + ok + "｜已存在 " + skipped + "｜失敗 " + failed + "   "
        );
      }
    }
  }

  await Promise.all(Array.from({ length: jobs }, () => worker()));
  console.log("\n");

  const downloaded = results.filter(x => x.status === "downloaded");
  const skipped = results.filter(x => x.status === "skipped");
  const failed = results.filter(x => x.status === "failed");

  const summary = [
    "放置天地素材下載結果",
    "批次：" + group,
    "指定資料夾：" + (dir ? "assets/" + dir + "/" : "全部"),
    "抽樣方式：" + (sample ? "均勻抽樣 " + sample : (limit ? "前 " + limit + " 個" : "完整清單")),
    "日期：" + new Date().toLocaleString(),
    "本批清單數：" + selected.length,
    "新下載成功：" + downloaded.length,
    "原本已存在：" + skipped.length,
    "下載失敗：" + failed.length,
    "素材資料夾：" + OUTPUT_DIR,
    "",
    "下載失敗項目：",
    ...failed.map(x => x.path + "｜" + x.error)
  ].join("\n");

  await fs.writeFile(path.join(OUTPUT_DIR, "下載摘要.txt"), summary, "utf8");
  await fs.writeFile(
    path.join(OUTPUT_DIR, "下載失敗清單.txt"),
    failed.map(x => x.path + "\t" + x.error).join("\n"),
    "utf8"
  );

  console.log("完成：新下載 " + downloaded.length + "，已存在 " + skipped.length + "，失敗 " + failed.length);
  console.log("摘要已寫入：下載摘要.txt");
  if (failed.length) console.log("失敗項目已寫入：下載失敗清單.txt，可重新執行同一批次補下載。");
}

main().catch(error => {
  console.error("\n下載器發生錯誤：" + (error?.stack || error));
  process.exitCode = 1;
});
