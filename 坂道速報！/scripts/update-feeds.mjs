import fs from "node:fs/promises";
import crypto from "node:crypto";

const ROOT = new URL("../", import.meta.url);
const DATA = new URL("../data/", import.meta.url);
const MAX_ARTICLES = 160;
const FETCH_TIMEOUT_MS = 15000;

const [sources, keywords, members] = await Promise.all([
  readJson(new URL("rss-sources.json", DATA)),
  readJson(new URL("keywords.json", DATA)),
  readJson(new URL("members.json", DATA))
]);

const enabledSources = sources.filter((source) => source.enabled);
const fetched = [];
const report = [];

for (const source of enabledSources) {
  try {
    const xml = await fetchText(source.url);
    const items = parseFeed(xml).map((item) => ({
      ...item,
      sourceName: source.name,
      sourceUrl: source.url
    }));
    fetched.push(...items);
    report.push({ source: source.name, count: items.length, ok: true });
  } catch (error) {
    report.push({ source: source.name, count: 0, ok: false, error: error.message });
  }
}

const articles = dedupe(fetched)
  .map(classify)
  .filter(Boolean)
  .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
  .slice(0, MAX_ARTICLES);

await fs.writeFile(
  new URL("articles.json", DATA),
  `${JSON.stringify({ updatedAt: new Date().toISOString(), articles }, null, 2)}\n`
);

await fs.writeFile(
  new URL("last-fetch-report.json", DATA),
  `${JSON.stringify({ updatedAt: new Date().toISOString(), sources: report }, null, 2)}\n`
);

console.log(`Saved ${articles.length} articles from ${enabledSources.length} sources.`);
for (const item of report) {
  console.log(`${item.ok ? "OK" : "NG"} ${item.source}: ${item.count}${item.error ? ` (${item.error})` : ""}`);
}

async function readJson(url) {
  return JSON.parse(await fs.readFile(url, "utf8"));
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "SakamichiSokuho/0.1 (+https://github.com/)"
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseFeed(xml) {
  if (xml.includes("<entry")) return parseAtom(xml);
  return parseRss(xml);
}

function parseAtom(xml) {
  return [...xml.matchAll(/<entry[\s\S]*?<\/entry>/gi)].map((match) => {
    const block = match[0];
    const linkMatch = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);
    return cleanItem({
      title: textOf(block, "title"),
      articleUrl: linkMatch?.[1] || textOf(block, "link"),
      publishedAt: textOf(block, "published") || textOf(block, "updated"),
      summary: textOf(block, "summary") || textOf(block, "content")
    });
  });
}

function parseRss(xml) {
  return [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)].map((match) => {
    const block = match[0];
    return cleanItem({
      title: textOf(block, "title"),
      articleUrl: textOf(block, "link") || textOf(block, "guid"),
      publishedAt: textOf(block, "pubDate") || textOf(block, "dc:date"),
      summary: textOf(block, "description") || textOf(block, "content:encoded")
    });
  });
}

function textOf(block, tag) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  return decode(match?.[1] || "");
}

function decode(value) {
  return stripTags(String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number(num))))
    .trim();
}

function stripTags(value) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

function cleanItem(item) {
  const title = item.title?.trim();
  const articleUrl = item.articleUrl?.trim();
  if (!title || !articleUrl) return null;
  return {
    title,
    articleUrl,
    publishedAt: normalizeDate(item.publishedAt),
    summary: item.summary?.trim() || ""
  };
}

function normalizeDate(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item) return false;
    const key = item.articleUrl.replace(/[?#].*$/, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function classify(item) {
  const text = `${item.title} ${item.summary}`.normalize("NFKC");
  if (keywords.negativeKeywords.some((word) => text.includes(word))) return null;

  const groups = new Set();
  for (const group of keywords.groups) {
    if (group.keywords.some((word) => text.includes(word))) {
      groups.add(group.name);
    }
  }

  const memberMatches = [];
  for (const member of members.members) {
    const names = [member.name, ...(member.aliases || [])].filter(Boolean);
    if (names.some((name) => text.includes(name))) {
      groups.add(member.group);
      memberMatches.push({
        name: member.name,
        group: member.group,
        status: member.status
      });
    }
  }

  if (!groups.size && !memberMatches.length) return null;

  const statuses = new Set(memberMatches.map((member) => member.status));
  return {
    id: crypto.createHash("sha1").update(item.articleUrl).digest("hex").slice(0, 16),
    title: item.title,
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    articleUrl: item.articleUrl,
    publishedAt: item.publishedAt,
    summary: item.summary.slice(0, 180),
    groups: [...groups],
    statuses: [...statuses],
    memberMatches
  };
}
