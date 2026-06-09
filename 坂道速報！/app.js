const state = {
  articles: [],
  members: [],
  links: [],
  activeGroup: "all",
  activeStatus: "all",
  query: "",
  activeMember: new URLSearchParams(window.location.search).get("member") || ""
};

const pageConfig = {
  base: document.body.dataset.base || ".",
  page: document.body.dataset.page || "home",
  group: document.body.dataset.group || "",
  title: document.body.dataset.title || "最新ニュース",
  intro: document.body.dataset.intro || "坂道グループ関連ニュースをRSSから整理して表示します。"
};

const GROUPS = [
  { id: "all", label: "すべて" },
  { id: "乃木坂46", label: "乃木坂46" },
  { id: "櫻坂46", label: "櫻坂46" },
  { id: "日向坂46", label: "日向坂46" }
];

const STATUSES = [
  { id: "all", label: "すべて" },
  { id: "active", label: "現役" },
  { id: "og", label: "OG" }
];

const articleList = document.querySelector("#articleList");
const template = document.querySelector("#articleTemplate");
const summaryText = document.querySelector("#summaryText");
const updatedText = document.querySelector("#updatedText");
const searchInput = document.querySelector("#searchInput");
const pageTitle = document.querySelector("#pageTitle");
const pageIntro = document.querySelector("#pageIntro");
const memberDirectory = document.querySelector("#memberDirectory");

function createFilterButtons(container, items, activeKey, onClick) {
  if (!container) return;
  container.innerHTML = "";
  for (const item of items) {
    const button = document.createElement("button");
    button.className = "filter-button";
    button.type = "button";
    button.textContent = item.label;
    button.dataset.filterId = item.id;
    button.setAttribute("aria-pressed", String(item.id === activeKey));
    button.addEventListener("click", () => onClick(item.id));
    container.append(button);
  }
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function groupClass(group) {
  return {
    "乃木坂46": "nogizaka46",
    "櫻坂46": "sakurazaka46",
    "日向坂46": "hinatazaka46"
  }[group] || "other";
}

function normalize(value) {
  return String(value || "").toLowerCase();
}

function filteredArticles() {
  const query = normalize(state.query);
  return state.articles.filter((article) => {
    const pageOk = matchesPage(article);
    const groupOk = state.activeGroup === "all" || article.groups?.includes(state.activeGroup);
    const statusOk = state.activeStatus === "all" || article.statuses?.includes(state.activeStatus);
    const memberOk = !state.activeMember || (article.memberMatches || []).some((member) => member.name === state.activeMember);
    const text = normalize([
      article.title,
      article.sourceName,
      article.summary,
      ...(article.groups || []),
      ...(article.memberMatches || []).map((member) => member.name)
    ].join(" "));
    return pageOk && groupOk && statusOk && memberOk && (!query || text.includes(query));
  });
}

function matchesPage(article) {
  if (pageConfig.page === "group") return article.groups?.includes(pageConfig.group);
  if (pageConfig.page === "og") return article.statuses?.includes("og");
  if (pageConfig.page === "today") return isToday(article.publishedAt);
  if (pageConfig.page === "weekly") return isWithinDays(article.publishedAt, 7);
  return true;
}

function isToday(value) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const nowParts = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const dateParts = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return partsKey(nowParts) === partsKey(dateParts);
}

function partsKey(parts) {
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isWithinDays(value, days) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return Date.now() - date.getTime() <= days * 24 * 60 * 60 * 1000;
}

function render() {
  if (pageTitle) pageTitle.textContent = pageConfig.title;
  if (pageIntro) pageIntro.textContent = pageConfig.intro;

  if (pageConfig.page === "links") {
    renderLinks();
    return;
  }

  renderMemberDirectory();

  createFilterButtons(document.querySelector("#groupFilters"), GROUPS, state.activeGroup, (id) => {
    state.activeGroup = id;
    render();
  });

  createFilterButtons(document.querySelector("#statusFilters"), STATUSES, state.activeStatus, (id) => {
    state.activeStatus = id;
    render();
  });

  const articles = filteredArticles();
  articleList.innerHTML = "";
  const memberText = state.activeMember ? ` / ${state.activeMember}` : "";
  summaryText.textContent = `${articles.length}件の記事を表示中${memberText}`;

  if (!articles.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "条件に合う記事はまだありません。RSS更新後にここへ表示されます。";
    articleList.append(empty);
    return;
  }

  for (const [index, article] of articles.entries()) {
    if (index > 0 && index % 8 === 0) {
      const ad = document.createElement("section");
      ad.className = "ad-slot";
      ad.setAttribute("aria-label", "広告");
      ad.innerHTML = "<span>広告</span>";
      articleList.append(ad);
    }

    const node = template.content.cloneNode(true);
    const card = node.querySelector(".article-card");
    const title = node.querySelector(".title");
    const summary = node.querySelector(".summary");
    const source = node.querySelector(".source");
    const time = node.querySelector("time");
    const badges = node.querySelector(".badges");
    const readLink = node.querySelector(".read-link");

    title.textContent = article.title;
    title.href = article.articleUrl;
    summary.textContent = article.summary || "概要はRSSに含まれていません。";
    source.textContent = article.sourceName || "ニュース";
    time.textContent = formatDate(article.publishedAt);
    time.dateTime = article.publishedAt || "";
    readLink.href = article.articleUrl;

    for (const group of article.groups || []) {
      const badge = document.createElement("span");
      badge.className = `badge group-${groupClass(group)}`;
      badge.textContent = group;
      badges.append(badge);
    }
    for (const status of article.statuses || []) {
      const badge = document.createElement("span");
      badge.className = `badge status-${status}`;
      badge.textContent = status === "og" ? "OG" : "現役";
      badges.append(badge);
    }
    for (const member of article.memberMatches || []) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = member.name;
      badges.append(badge);
    }

    articleList.append(card);
  }
}

function renderMemberDirectory() {
  if (!memberDirectory || pageConfig.page !== "members") return;
  memberDirectory.hidden = false;
  const groups = ["乃木坂46", "櫻坂46", "日向坂46"];
  memberDirectory.innerHTML = "";

  const reset = document.createElement("a");
  reset.className = `member-pill${state.activeMember ? "" : " is-active"}`;
  reset.href = "./";
  reset.textContent = "全員";
  memberDirectory.append(reset);

  for (const group of groups) {
    const section = document.createElement("section");
    section.className = `member-group group-${groupClass(group)}`;
    const heading = document.createElement("h2");
    heading.textContent = group;
    section.append(heading);
    const list = document.createElement("div");
    list.className = "member-pill-list";
    const members = state.members.filter((member) => member.group === group);
    for (const member of members) {
      const link = document.createElement("a");
      link.className = `member-pill${member.name === state.activeMember ? " is-active" : ""}`;
      link.href = `?member=${encodeURIComponent(member.name)}`;
      link.textContent = `${member.name}${member.status === "og" ? " / OG" : ""}`;
      list.append(link);
    }
    section.append(list);
    memberDirectory.append(section);
  }
}

function renderLinks() {
  createFilterButtons(document.querySelector("#groupFilters"), GROUPS, state.activeGroup, (id) => {
    state.activeGroup = id;
    render();
  });
  const statusFilters = document.querySelector("#statusFilters");
  if (statusFilters) statusFilters.hidden = true;

  const query = normalize(state.query);
  const groups = state.links.filter((group) => state.activeGroup === "all" || group.name === state.activeGroup);
  articleList.innerHTML = "";
  let count = 0;

  for (const group of groups) {
    const links = group.links.filter((link) => !query || normalize(`${group.name} ${link.label} ${link.url}`).includes(query));
    if (!links.length) continue;
    const card = document.createElement("article");
    card.className = `article-card link-card group-${groupClass(group.name)}`;
    const title = document.createElement("h2");
    title.textContent = group.name;
    const badge = document.createElement("span");
    badge.className = `badge group-${groupClass(group.name)}`;
    badge.textContent = group.name;
    const list = document.createElement("div");
    list.className = "official-links";
    for (const link of links) {
      const anchor = document.createElement("a");
      anchor.href = link.url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.textContent = link.label;
      list.append(anchor);
      count += 1;
    }
    card.append(title, badge, list);
    articleList.append(card);
  }

  if (!count) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "条件に合う公式リンクはありません。";
    articleList.append(empty);
  }
  summaryText.textContent = `${count}件の公式リンクを表示中`;
  updatedText.textContent = "";
}

async function load() {
  try {
    const [articleResponse, memberResponse, linkResponse] = await Promise.all([
      fetch(`${pageConfig.base}/data/articles.json`, { cache: "no-store" }),
      fetch(`${pageConfig.base}/data/members.json`, { cache: "no-store" }),
      fetch(`${pageConfig.base}/data/official-links.json`, { cache: "no-store" })
    ]);
    const payload = await articleResponse.json();
    const memberPayload = await memberResponse.json();
    const linkPayload = await linkResponse.json();
    state.articles = Array.isArray(payload.articles) ? payload.articles : [];
    state.members = Array.isArray(memberPayload.members) ? memberPayload.members : [];
    state.links = Array.isArray(linkPayload.groups) ? linkPayload.groups : [];
    if (payload.updatedAt) {
      updatedText.textContent = `最終更新: ${formatDate(payload.updatedAt)}`;
    }
  } catch (error) {
    summaryText.textContent = "記事データを読み込めませんでした。";
    console.error(error);
  }
  render();
}

if (pageConfig.page === "group") state.activeGroup = pageConfig.group;
if (pageConfig.page === "og") state.activeStatus = "og";

searchInput?.addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});

load();
