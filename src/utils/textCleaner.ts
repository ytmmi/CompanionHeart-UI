/**
 * 文本清理工具 — 过滤思考内容、Markdown 符号等，使 TTS 朗读更自然
 */

/**
 * 清理文本，移除不适合 TTS 朗读的内容
 *
 * 过滤规则：
 * 1. 移除 思考/推理 标签块（如  ...  、think ... /think）
 * 2. 移除 Markdown 符号（*, #, `, _, ~, >, -, |, --- 等）
 * 3. 移除代码块（``` ... ```）
 * 4. 移除 URL
 * 5. 压缩多余空白
 */
export function cleanTextForTTS(text: string): string {
  if (!text) return text;

  let cleaned = text;

  // 1. 移除 思考/推理 标签块
  //    格式: ...  或  思考：...
  //    代码块（```...```）在规则 4 中处理
  cleaned = cleaned.replace(/\u601d\u8003[\s\S]*?\u601d\u8003/g, ""); // 思考...思考
  cleaned = cleaned.replace(/<\|im_start\|>think[\s\S]*?<\|im_end\|>/g, "");
  cleaned = cleaned.replace(/\/think[\s\S]*?\/think/g, "");

  // 2. 移除 Markdown 标题符号
  cleaned = cleaned.replace(/^#{1,6}\s+/gm, "");

  // 3. 移除 Markdown 加粗/斜体符号
  cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, "$1"); // **bold** → bold
  cleaned = cleaned.replace(/\*(.+?)\*/g, "$1"); // *italic* → italic
  cleaned = cleaned.replace(/__(.+?)__/g, "$1"); // __bold__
  cleaned = cleaned.replace(/_(.+?)_/g, "$1"); // _italic_

  // 4. 行内代码 `code` → code（保留内容，仅移除反引号）
  cleaned = cleaned.replace(/`([^`\n]+)`/g, "$1");
  //    代码块 ```...```（移除整个块）
  cleaned = cleaned.replace(/```[\s\S]*?```/g, "");

  // 5. 移除 Markdown 链接 [text](url)
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // 6. 移除图片 ![alt](url)
  cleaned = cleaned.replace(/!\[([^\]]*)\]\([^)]+\)/g, "");

  // 7. 移除引用标记 >
  cleaned = cleaned.replace(/^>\s*/gm, "");

  // 8. 移除分隔线 ---  ***  ___
  cleaned = cleaned.replace(/^[-*_]{3,}\s*$/gm, "");

  // 9. 移除列表标记 - * + 和数字序号
  cleaned = cleaned.replace(/^[\s]*[-*+]\s+/gm, "");
  cleaned = cleaned.replace(/^[\s]*\d+[.\u3001\u3002]\s+/gm, "");

  // 10. 移除表格分隔符 | --- |
  cleaned = cleaned.replace(/^\|.*\|$/gm, "");
  cleaned = cleaned.replace(/^\|[\s-:]+\|$/gm, "");

  // 11. 移除 URL
  cleaned = cleaned.replace(/https?:\/\/[^\s]+/g, "");

  // 12. 压缩多余空白
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  cleaned = cleaned.replace(/ {2,}/g, " ");
  cleaned = cleaned.trim();

  // 13. 如果清理后为空，返回原始文本的简化版
  if (!cleaned) {
    // 只保留中英文和基本标点
    const fallback = text.replace(
      /[^a-zA-Z\u4e00-\u9fff0-9\s,.!?;:\u3001\u3002\uff01\uff1f\uff0c\u201c\u201d]/g,
      "",
    );
    return fallback.trim() || " ";
  }

  return cleaned;
}

/**
 * 判断文本是否需要清理（有可清理内容）
 */
export function needsCleaning(text: string): boolean {
  if (!text) return false;
  const cleaned = cleanTextForTTS(text);
  return cleaned !== text;
}
