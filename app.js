(() => {
  "use strict";

  const data = window.RADIO_ARCHIVE_DATA;
  const app = document.getElementById("app");
  const breadcrumbs = document.getElementById("breadcrumbs");
  const search = document.getElementById("archive-search");
  const clearSearch = document.getElementById("clear-search");
  const currentMembers = data?.currentMembers || [];
  const specialMembers = data?.specialMembers || [];
  const pageSize = 48;
  let visibleCount = pageSize;
  let activeSeriesId = "";

  const filters = { year: "all", member: "all", episode: "all", sort: "desc" };
  const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const escapeAttr = escapeHtml;
  const hashFor = (...parts) => `#${parts.map((part) => encodeURIComponent(part)).join("/")}`;
  const viewUrl = (id) => `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;
  const downloadUrl = (id) => `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
  const thumbnailUrl = (id) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1200`;
  const isImage = (item) => String(item.mimeType).startsWith("image/");
  const mediaKind = (item) => String(item.mimeType).split("/")[0]?.toUpperCase() || "FILE";
  const formatDate = (date) => /^\d{6}$/.test(String(date)) ? `20${date.slice(0, 2)}.${date.slice(2, 4)}.${date.slice(4, 6)}` : "DATE UNKNOWN";
  const normalize = (value) => String(value || "").normalize("NFKD").toLocaleLowerCase().replace(/[._#:/-]+/g, " ").replace(/\s+/g, " ").trim();
  const seriesById = (id) => data.series.find((series) => series.id === id);
  const entryById = (series, id) => series?.entries.find((entry) => entry.id === id);
  const totalMedia = data.series.reduce((sum, series) => sum + series.entries.reduce((count, entry) => count + (entry.media?.length || 0), 0), 0);
  const totalEntries = data.series.reduce((sum, series) => sum + series.entries.length, 0);

  function routeParts() {
    const raw = location.hash.replace(/^#/, "") || "home";
    return raw.split("/").map((part) => decodeURIComponent(part));
  }

  function setStats() {
    document.getElementById("entry-count").textContent = totalEntries.toLocaleString("en-US");
    document.getElementById("media-count").textContent = totalMedia.toLocaleString("en-US");
    const date = new Date(data.generatedAt);
    document.getElementById("updated-date").textContent = Number.isNaN(date.valueOf()) ? "UNKNOWN" : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
    document.getElementById("sync-status").textContent = data.unmatched?.length ? `${data.unmatched.length} UNMATCHED MEDIA FOLDER` : "ALL MEDIA MATCHED";
  }

  function setBreadcrumbs(items) {
    breadcrumbs.innerHTML = items.map((item, index) => item.href ? `<a href="${item.href}">${escapeHtml(item.label)}</a>${index < items.length - 1 ? " / " : ""}` : `<span>${escapeHtml(item.label)}</span>`).join("");
  }

  function categoryCount(id) {
    return data.series.filter((series) => series.category === id).reduce((sum, series) => sum + series.entries.length, 0);
  }

  function renderHome() {
    setBreadcrumbs([{ label: "Radio Archive" }]);
    const tiles = data.categories.map((category, index) => `
      <a class="archive-tile${category.featured ? " featured" : ""}" href="${hashFor("category", category.id)}">
        <span class="tile-label">0${index + 1} / ${category.featured ? "MAIN COLLECTION" : "ARCHIVE SECTION"}</span>
        <div><h3>${escapeHtml(category.title)}</h3><p>${escapeHtml(category.description)}</p></div>
        <span class="tile-action">${categoryCount(category.id)} INDEXED ENTRIES →</span>
      </a>`).join("");
    const report = data.unmatched?.length ? `
      <div class="sync-report"><strong>SYNC REPORT:</strong> ${data.unmatched.length} media folder is waiting for a matching spreadsheet row — ${data.unmatched.map((item) => escapeHtml(`${item.date} (${item.mediaCount} files)`)).join(", ")}. It is intentionally excluded from the public episode list.</div>` : "";
    app.innerHTML = `
      <div class="section-heading"><h2>SELECT AN ARCHIVE</h2><p>${totalEntries} ENTRIES · ${totalMedia} MEDIA FILES</p></div>
      <div class="tile-grid">${tiles}</div>${report}`;
  }

  function renderCategory(categoryId) {
    const category = data.categories.find((item) => item.id === categoryId);
    if (!category) return renderNotFound();
    const series = data.series.filter((item) => item.category === categoryId);
    setBreadcrumbs([{ label: "Radio Archive", href: "#home" }, { label: category.title }]);
    app.innerHTML = `
      <div class="section-heading"><h2>${escapeHtml(category.title)}</h2><p>${categoryCount(categoryId)} ENTRIES · SELECT A COLLECTION</p></div>
      <div class="series-grid">${series.map((item, index) => `
        <a class="archive-tile" href="${hashFor("series", item.id)}">
          <span class="tile-label">${String(index + 1).padStart(2, "0")} / ${item.years.join("–")}</span>
          <div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p></div>
          <span class="tile-action">${item.entries.length} ENTRIES →</span>
        </a>`).join("")}</div>`;
  }

  function entryHasSpecialMember(entry) {
    if ((entry.members || []).some((member) => specialMembers.includes(member))) return true;
    return (entry.djs || []).some((dj) => !currentMembers.includes(String(dj).toUpperCase()));
  }

  function episodeRanges(entries) {
    const numbers = entries.map((entry) => entry.episode).filter(Number.isFinite);
    if (!numbers.length) return [];
    const max = Math.max(...numbers);
    const step = max > 100 ? 100 : max > 40 ? 20 : 10;
    const ranges = [];
    for (let start = 1; start <= max; start += step) ranges.push([start, Math.min(start + step - 1, max)]);
    return ranges;
  }

  function filterControls(series) {
    const years = [...new Set(series.entries.map((entry) => entry.year).filter(Boolean))].sort((a, b) => b - a);
    const availableMembers = currentMembers.filter((member) => series.entries.some((entry) => entry.allMembers || entry.members?.includes(member)));
    const hasSpecial = series.entries.some(entryHasSpecialMember);
    const ranges = episodeRanges(series.entries);
    return `
      <div class="controls">
        <label class="control">YEAR<select id="year-filter"><option value="all">ALL YEARS</option>${years.map((year) => `<option value="${year}"${String(filters.year) === String(year) ? " selected" : ""}>${year}</option>`).join("")}</select></label>
        ${availableMembers.length || hasSpecial ? `<label class="control">MEMBER / DJ<select id="member-filter"><option value="all">ALL MEMBERS</option>${availableMembers.map((member) => `<option value="${member}"${filters.member === member ? " selected" : ""}>${member}</option>`).join("")}${hasSpecial ? `<option value="special"${filters.member === "special" ? " selected" : ""}>SPECIAL / OTHER DJs</option>` : ""}</select></label>` : ""}
        ${ranges.length ? `<label class="control">EPISODE<select id="episode-filter"><option value="all">ALL EPISODES</option>${ranges.map(([start, end]) => `<option value="${start}-${end}"${filters.episode === `${start}-${end}` ? " selected" : ""}>EP. ${start}–${end}</option>`).join("")}</select></label>` : ""}
        <label class="control">SORT<select id="sort-filter"><option value="desc"${filters.sort === "desc" ? " selected" : ""}>NEWEST FIRST</option><option value="asc"${filters.sort === "asc" ? " selected" : ""}>OLDEST FIRST</option></select></label>
      </div>`;
  }

  function filteredEntries(series) {
    const query = normalize(search.value);
    const tokens = query.split(" ").filter(Boolean);
    return series.entries.filter((entry) => {
      if (filters.year !== "all" && String(entry.year) !== String(filters.year)) return false;
      if (filters.member !== "all") {
        if (filters.member === "special" && !entryHasSpecialMember(entry)) return false;
        if (filters.member !== "special" && !entry.allMembers && !entry.members?.includes(filters.member)) return false;
      }
      if (filters.episode !== "all") {
        const [start, end] = filters.episode.split("-").map(Number);
        if (!Number.isFinite(entry.episode) || entry.episode < start || entry.episode > end) return false;
      }
      if (tokens.length && !tokens.every((token) => entryHaystack(entry, series).includes(token))) return false;
      return true;
    }).sort((a, b) => filters.sort === "asc" ? (a.sortKey || 0) - (b.sortKey || 0) : (b.sortKey || 0) - (a.sortKey || 0));
  }

  function entryHaystack(entry, series) {
    return normalize([series.title, entry.title, entry.date, entry.year, entry.episode, `ep ${entry.episode || ""}`, ...(entry.members || []), ...(entry.djs || []), ...(entry.guests || [])].join(" "));
  }

  function entryCard(entry, series) {
    const galleryCount = entry.media?.length || 0;
    const people = [...new Set([...(entry.djs || []), ...(entry.members || [])])].join(", ");
    const guests = (entry.guests || []).length ? ` · GUEST: ${entry.guests.join(", ")}` : "";
    return `<article class="episode-card">
      <div class="episode-card-head"><span>${Number.isFinite(entry.episode) ? `EP. ${entry.episode}` : "ARCHIVE"}</span><span>${entry.date ? escapeHtml(formatDate(entry.date)) : escapeHtml(entry.year || "")}</span></div>
      <h3>${escapeHtml(entry.title)}</h3>
      <div class="episode-meta">${escapeHtml(people || "THE BOYZ")}${escapeHtml(guests)}${entry.hasSubtitles ? `<br><span class="sub-badge">SUBTITLES AVAILABLE</span>` : ""}</div>
      <div class="card-actions">
        ${entry.watchUrl ? `<a class="action-link" href="${escapeAttr(entry.watchUrl)}" target="_blank" rel="noopener">WATCH ↗</a>` : ""}
        <a class="action-link primary" href="${hashFor("episode", series.id, entry.id)}">${galleryCount ? `GALLERY ${galleryCount}` : "DETAILS"} →</a>
      </div>
    </article>`;
  }

  function bindSeriesControls(series) {
    [["year-filter", "year"], ["member-filter", "member"], ["episode-filter", "episode"], ["sort-filter", "sort"]].forEach(([id, key]) => {
      const element = document.getElementById(id);
      if (element) element.addEventListener("change", () => { filters[key] = element.value; visibleCount = pageSize; renderSeries(series.id); });
    });
    const load = document.getElementById("load-more");
    if (load) load.addEventListener("click", () => { visibleCount += pageSize; renderSeries(series.id, false); });
  }

  function renderSeries(seriesId, resetScroll = true) {
    const series = seriesById(seriesId);
    if (!series) return renderNotFound();
    if (activeSeriesId !== seriesId) {
      Object.assign(filters, { year: "all", member: "all", episode: "all", sort: "desc" });
      visibleCount = pageSize;
      activeSeriesId = seriesId;
    }
    const category = data.categories.find((item) => item.id === series.category);
    const entries = filteredEntries(series);
    setBreadcrumbs([{ label: "Radio Archive", href: "#home" }, { label: category.title, href: hashFor("category", category.id) }, { label: series.title }]);
    app.innerHTML = `
      <div class="section-heading"><h2>${escapeHtml(series.title)}</h2><p>${escapeHtml(series.description)}</p></div>
      ${filterControls(series)}
      <div class="result-bar"><span>${entries.length} MATCHING ENTRIES</span><span>${filters.sort === "desc" ? "NEWEST → OLDEST" : "OLDEST → NEWEST"}</span></div>
      ${entries.length ? `<div class="episode-grid">${entries.slice(0, visibleCount).map((entry) => entryCard(entry, series)).join("")}</div>${visibleCount < entries.length ? `<div class="load-wrap"><button id="load-more" class="load-more" type="button">LOAD ${Math.min(pageSize, entries.length - visibleCount)} MORE</button></div>` : ""}` : `<div class="empty-state">NO ENTRIES MATCH THESE FILTERS.</div>`}`;
    bindSeriesControls(series);
    if (resetScroll) window.scrollTo({ top: document.querySelector(".global-search").offsetTop - 12, behavior: "smooth" });
  }

  function mediaCard(item) {
    const itemView = item.viewUrl || viewUrl(item.id);
    return `<article class="media-card">
      <a class="media-preview" href="${escapeAttr(itemView)}" target="_blank" rel="noopener">${isImage(item) ? `<img src="${thumbnailUrl(item.id)}" alt="" loading="lazy">` : `<span>${mediaKind(item)}<br>OPEN ON GOOGLE DRIVE</span>`}</a>
      <div class="media-info"><div class="media-name">${escapeHtml(item.name)}</div><div class="media-actions"><a href="${escapeAttr(itemView)}" target="_blank" rel="noopener">VIEW ↗</a><a href="${downloadUrl(item.id)}" target="_blank" rel="noopener">DOWNLOAD</a></div></div>
    </article>`;
  }

  function renderEpisode(seriesId, entryId) {
    const series = seriesById(seriesId);
    const entry = entryById(series, entryId);
    if (!series || !entry) return renderNotFound();
    const category = data.categories.find((item) => item.id === series.category);
    setBreadcrumbs([{ label: "Radio Archive", href: "#home" }, { label: category.title, href: hashFor("category", category.id) }, { label: series.title, href: hashFor("series", series.id) }, { label: Number.isFinite(entry.episode) ? `EP. ${entry.episode}` : "Entry" }]);
    const mediaItems = entry.media || [];
    const people = [...new Set([...(entry.djs || []), ...(entry.members || [])])];
    app.innerHTML = `
      <article class="detail-hero">
        <div class="detail-kicker">${Number.isFinite(entry.episode) ? `EPISODE ${entry.episode}` : "ARCHIVE ENTRY"} · ${entry.date ? formatDate(entry.date) : entry.year || ""}</div>
        <h2>${escapeHtml(entry.title)}</h2>
        <div class="detail-meta">${people.length ? `<span>MEMBERS / DJs: ${escapeHtml(people.join(", "))}</span>` : ""}${entry.guests?.length ? `<span>GUEST: ${escapeHtml(entry.guests.join(", "))}</span>` : ""}<span>${mediaItems.length} MEDIA FILES</span>${entry.hasSubtitles ? `<span>SUBTITLES AVAILABLE</span>` : ""}</div>
        <div class="detail-actions">${entry.watchUrl ? `<a class="action-link primary" href="${escapeAttr(entry.watchUrl)}" target="_blank" rel="noopener">WATCH RECORDING ↗</a>` : ""}${entry.folderUrl ? `<a class="action-link" href="${escapeAttr(entry.folderUrl)}" target="_blank" rel="noopener">OPEN SOURCE FOLDER ↗</a>` : ""}</div>
      </article>
      <div class="gallery-heading"><h3>${mediaItems.length ? "MEDIA GALLERY" : "RECORDING"}</h3><span>${mediaItems.length} FILES</span></div>
      ${mediaItems.length ? `<div id="media-grid" class="media-grid">${mediaItems.slice(0, visibleCount).map(mediaCard).join("")}</div>${visibleCount < mediaItems.length ? `<div class="load-wrap"><button id="media-load-more" class="load-more" type="button">LOAD ${Math.min(pageSize, mediaItems.length - visibleCount)} MORE</button></div>` : ""}` : `<div class="empty-state">THIS ENTRY HAS NO SEPARATE GALLERY. USE “WATCH RECORDING” ABOVE.</div>`}`;
    const load = document.getElementById("media-load-more");
    if (load) load.addEventListener("click", () => { visibleCount += pageSize; renderEpisode(seriesId, entryId); });
  }

  function renderSearchResults() {
    const query = normalize(search.value);
    if (!query) return renderRoute();
    const tokens = query.split(" ").filter(Boolean);
    const matches = data.series.flatMap((series) => series.entries.filter((entry) => tokens.every((token) => entryHaystack(entry, series).includes(token))).map((entry) => ({ series, entry }))).sort((a, b) => (b.entry.sortKey || 0) - (a.entry.sortKey || 0));
    setBreadcrumbs([{ label: "Radio Archive", href: "#home" }, { label: `Search: ${search.value}` }]);
    app.innerHTML = `
      <div class="section-heading"><h2>SEARCH RESULTS</h2><p>${matches.length} MATCHES FOR “${escapeHtml(search.value)}”</p></div>
      ${matches.length ? `<div class="episode-grid">${matches.slice(0, visibleCount).map(({ series, entry }) => entryCard(entry, series)).join("")}</div>${visibleCount < matches.length ? `<div class="load-wrap"><button id="search-load-more" class="load-more" type="button">LOAD ${Math.min(pageSize, matches.length - visibleCount)} MORE</button></div>` : ""}` : `<div class="empty-state">NO RESULTS. TRY A TITLE, YYMMDD DATE, MEMBER, GUEST OR EPISODE NUMBER.</div>`}`;
    const load = document.getElementById("search-load-more");
    if (load) load.addEventListener("click", () => { visibleCount += pageSize; renderSearchResults(); });
  }

  function renderNotFound() {
    setBreadcrumbs([{ label: "Radio Archive", href: "#home" }, { label: "Not found" }]);
    app.innerHTML = `<div class="empty-state">THE REQUESTED ARCHIVE PAGE WAS NOT FOUND.<br><br><a class="action-link" href="#home">RETURN HOME</a></div>`;
  }

  function renderRoute() {
    if (!data) return;
    if (normalize(search.value)) return renderSearchResults();
    const [page, first, second] = routeParts();
    visibleCount = page === "episode" ? visibleCount : Math.max(visibleCount, pageSize);
    if (page === "home") renderHome();
    else if (page === "category") renderCategory(first);
    else if (page === "series") renderSeries(first, false);
    else if (page === "episode") renderEpisode(first, second);
    else renderNotFound();
  }

  if (!data) {
    app.innerHTML = `<div class="empty-state">ARCHIVE DATA COULD NOT BE LOADED.</div>`;
    return;
  }

  search.addEventListener("input", () => { visibleCount = pageSize; clearSearch.hidden = !search.value; renderSearchResults(); });
  clearSearch.addEventListener("click", () => { search.value = ""; clearSearch.hidden = true; visibleCount = pageSize; renderRoute(); search.focus(); });
  window.addEventListener("hashchange", () => { visibleCount = pageSize; search.value = ""; clearSearch.hidden = true; renderRoute(); });
  setStats();
  renderRoute();
})();
