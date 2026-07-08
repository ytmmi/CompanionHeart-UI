/**
 * usePlatform — 统一平台检测 Hook
 *
 * 在 Window / Web / Android 手机 / Android 平板 四个目标平台上
 * 通过运行时环境信息推断当前所在平台与设备形态。
 *
 * 所有组件应通过此 Hook 获取平台信息，禁止直接读取
 * `window.__TAURI__` / `navigator.userAgent` / `@tauri-apps/api/os` 等。
 */

import { useState, useEffect, useMemo } from "react";

// ── 类型导出 ────────────────────────────────────────

/** 目标平台枚举 */
export type TargetPlatform = "windows" | "web" | "android";

/** 设备形态（决定 UI 布局策略） */
export type DeviceFormFactor = "desktop" | "tablet" | "phone";

/** 平台分组 */
export type PlatformGroup = "group-a" | "group-b";

/** usePlatform 返回值类型 */
export interface PlatformInfo {
  /** 目标平台标识 */
  platform: TargetPlatform;
  /** 设备形态（决定 UI 布局策略） */
  formFactor: DeviceFormFactor;
  /** 平台分组 */
  group: PlatformGroup;
  /** 是否是 Group A（Win / Web / 平板） */
  isGroupA: boolean;
  /** 是否是 Group B（手机） */
  isGroupB: boolean;
  /** 是否为 Tauri 环境（可调用 Tauri API） */
  isTauri: boolean;
  /** 是否为桌面环境（Windows / Web） */
  isDesktop: boolean;
  /** 是否为移动端（Android 手机 / 平板） */
  isMobile: boolean;
  /** 是否为触控设备 */
  isTouchDevice: boolean;
  /** 屏幕宽度（px） */
  screenWidth: number;
  /** 屏幕高度（px） */
  screenHeight: number;
}

// ── 辅助函数 ────────────────────────────────────────

/** 根据屏幕宽度判断设备形态（仅对 Android 有效） */
function detectFormFactor(width: number): DeviceFormFactor {
  // 768px 为平板与手机的常用分界断点
  return width >= 768 ? "tablet" : "phone";
}

/** 检测当前设备是否支持触控 */
function isTouchDevice(): boolean {
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

// ── Hook ────────────────────────────────────────────

export function usePlatform(): PlatformInfo {
  const [screenSize, setScreenSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    const handleResize = () => {
      setScreenSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return useMemo(() => {
    // 1. 检测是否为 Tauri 环境
    const isTauri = typeof window !== "undefined" && "__TAURI__" in window;

    // 2. 推断目标平台（双重检测：UserAgent + Tauri 环境）
    //    Tauri Android WebView 的 UA 可能不含 "android" 关键词，
    //    因此同时检测窗口对象上的 Tauri 特有属性
    let platform: TargetPlatform;
    const ua = navigator.userAgent.toLowerCase();
    const hasTouch = "ontouchstart" in window;

    if (ua.includes("android")) {
      platform = "android";
    } else if (isTauri && hasTouch) {
      platform = "android";
    } else if (isTauri || ua.includes("windows") || ua.includes("win64")) {
      platform = "windows";
    } else {
      platform = "web";
    }

    // 调试日志（可通过 chrome://inspect 查看）
    if (typeof console !== "undefined") {
      console.log("[usePlatform]", { isTauri, ua, hasTouch, platform });
    }

    // 3. 设备形态
    const formFactor =
      platform === "android" ? detectFormFactor(screenSize.width) : "desktop"; // Win / Web 始终视为桌面

    // 4. 平台分组
    //   Group A: Windows, Web, Android 平板 → 共享宽屏布局
    //   Group B: Android 手机               → 窄屏触控布局
    const isGroupA = platform !== "android" || formFactor === "tablet";
    const isGroupB = platform === "android" && formFactor === "phone";

    return {
      platform,
      formFactor,
      group: isGroupA ? "group-a" : "group-b",
      isGroupA,
      isGroupB,
      isTauri,
      isDesktop: platform === "windows" || platform === "web",
      isMobile: platform === "android",
      isTouchDevice: isTouchDevice(),
      screenWidth: screenSize.width,
      screenHeight: screenSize.height,
    };
  }, [screenSize]);
}
