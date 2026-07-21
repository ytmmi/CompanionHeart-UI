import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";
import type { Connect } from "vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

/** 日志目录 */
const LOG_DIR = path.resolve(__dirname, "log");
/** 当前日志文件路径（按日期命名） */
function getLogFile(): string {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(LOG_DIR, `live2d-${date}.log`);
}

/** 确保日志目录存在 */
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Live2D 日志接收中间件
 * 前端通过 POST /__l2d_log__ 发送 JSON 日志条目，服务端直接写入磁盘
 * 页面崩溃也不丢失已发送的日志
 */
function l2dLogMiddleware(): Connect.NextHandleFunction {
  let writeQueue: string[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  const FLUSH_INTERVAL_MS = 2000; // 2 秒批量写入
  const MAX_QUEUE_SIZE = 200; // 队列超过此值时强制刷新

  function doFlush(): void {
    if (writeQueue.length === 0) return;
    const lines = writeQueue.splice(0);
    try {
      fs.appendFileSync(getLogFile(), lines.join("") + "\n", "utf-8");
    } catch (e) {
      console.error("[L2D-LOG-SERVER] 写入日志文件失败:", e);
    }
  }

  return (req, res, next) => {
    if (req.method === "POST" && req.url === "/__l2d_log__") {
      let body = "";
      req.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        try {
          const entry = JSON.parse(body);
          // 格式化: ISO时间 [实例#ID] [阶段] [级别] 消息 | 内存
          const mem = entry.mem ? ` | ${entry.mem}` : "";
          const line = `${entry.t} [#${entry.id}] [${entry.ph}] [${entry.lv.toUpperCase()}] ${entry.msg}${mem}`;
          writeQueue.push(line);

          // 队列过大或错误级别立即刷新
          if (writeQueue.length >= MAX_QUEUE_SIZE || entry.lv === "error") {
            if (flushTimer) {
              clearTimeout(flushTimer);
              flushTimer = null;
            }
            doFlush();
          } else if (!flushTimer) {
            flushTimer = setTimeout(() => {
              flushTimer = null;
              doFlush();
            }, FLUSH_INTERVAL_MS);
          }

          res.statusCode = 200;
          res.end(JSON.stringify({ ok: true, queued: writeQueue.length }));
        } catch (e) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, error: String(e) }));
        }
      });
      return;
    }
    next();
  };
}

/**
 * 生产构建瘦身：只保留默认 Live2D 模型
 *
 * public/ 会被 Vite 整体复制进 dist/，三个模型共 ~122MB。
 * 构建结束后从 dist/live2d-models/ 删除未使用的备选模型目录，
 * 只保留 BUNDLED_MODELS 中的模型（当前默认 akari，见 src/config/live2d/default.ts）。
 * 仅作用于构建产物，不影响 public/ 源文件与开发模式（pnpm dev 所有模型可用）。
 */
const BUNDLED_MODELS = ["akari_vts"];

function pruneLive2dModelsPlugin() {
  return {
    name: "prune-live2d-models",
    apply: "build" as const,
    closeBundle() {
      const modelsDir = path.resolve(__dirname, "dist", "live2d-models");
      if (!fs.existsSync(modelsDir)) return;
      for (const entry of fs.readdirSync(modelsDir)) {
        if (BUNDLED_MODELS.includes(entry)) continue;
        const target = path.join(modelsDir, entry);
        fs.rmSync(target, { recursive: true, force: true });
        console.log(`[prune-live2d-models] 已从构建产物移除备选模型: ${entry}`);
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  resolve: {
    alias: {
      "@framework": path.resolve(__dirname, "src/cubism-sdk/Framework/src"),
      "@cubismsdksamples": path.resolve(__dirname, "src/cubism-sdk/src"),
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: "globalThis",
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    // 禁止 Vite 自动打开浏览器（VS Code 内置浏览器 WebGL 支持差，会卡死）
    // 请手动在外部浏览器（Chrome/Edge）中打开 http://localhost:1420
    open: false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  // Live2D 日志中间件：接收前端日志写入本地文件
  plugins: [
    react(),
    pruneLive2dModelsPlugin(),
    {
      name: "l2d-log-middleware",
      configureServer(server) {
        server.middlewares.use(l2dLogMiddleware());
      },
    },
  ],
}));
