#!/usr/bin/env node
/**
 * MinerU 输出后处理:修复"标题层级误判"
 *
 * 问题:MinerU 把 PDF 中所有"大字号"元素机械映射为 Markdown 标题,
 * 可能导致数据点(纯数字)、人名、强调句被误判为标题。
 *
 * 本脚本遍历所有标题行,用 isRealHeading() 判断,把假标题降级为加粗段落。
 *
 * 用法:node postprocess-headings.mjs <input.md> [output.md]
 * 不传 output 则写入 <input>.postprocessed.md
 *
 * 适用范围:主要针对英文/拉丁字符文档(靠空格分词 + 英文动词词典)。
 * 中文文档的标题误判模式不同(如函数名该降级却未降级),需另行调整规则。
 *
 * 扩展点:isRealHeading() 的规则是 baseline,可按文档类型调整——
 * 例如加人名识别(含单个中间名缩写)、NLP 句法判断、或维护真标题白名单。
 */
import { readFileSync, writeFileSync } from 'node:fs';

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('用法: node postprocess-headings.mjs <input.md> [output.md]');
  process.exit(1);
}
const outputPath = process.argv[3] || inputPath.replace(/\.md$/, '.postprocessed.md');

const MAX_LEN = 60; // 标题长度上限,超此多为句子;可按文档调
// 句子动词:出现这些(过去式/第三人称)且词数多,基本是句子而非标题
const SENTENCE_VERBS =
  /\b(achieved|worked|reflects|have|has|continues|invested|reclaimed|grew|produced|generated|operates|remains|exceeded|reached|focused|dedicated|committed|delivered)\b/i;

function isRealHeading(text) {
  const t = text.trim();
  if (/^[\d,.\s%]+$/.test(t)) return false; // 纯数字/百分号 → 数据点
  if (t.length > MAX_LEN) return false; // 超长 → 多为完整句子
  const wordCount = t.split(/\s+/).length;
  if (SENTENCE_VERBS.test(t) && wordCount > 5) return false; // 动词驱动的句子
  return true;
}

const md = readFileSync(inputPath, 'utf8');
let kept = 0;
let demoted = 0;
const demotedTexts = [];

const out = md.replace(/^(?:#{1,6})\s+(.+)$/gm, (full, text) => {
  if (isRealHeading(text)) {
    kept++;
    return full;
  }
  demoted++;
  demotedTexts.push(text.trim());
  return `**${text.trim()}**`;
});

writeFileSync(outputPath, out);
console.log(`输入: ${inputPath}`);
console.log(`输出: ${outputPath}`);
console.log(`标题保留: ${kept}`);
console.log(`标题降级: ${demoted}`);
if (demotedTexts.length) {
  console.log('\n降级的标题(前 15 个):');
  demotedTexts.slice(0, 15).forEach((t, i) => console.log(`  ${i + 1}. ${t.slice(0, 80)}`));
}
