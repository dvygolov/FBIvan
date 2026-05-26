(function fbivanLoader(config) {
  "use strict";

  const loaderConfig = Object.assign({
    app: "FBAutoScroll",
    manifestUrl: "https://fbivan.pages.dev/fbivan/latest/manifest.html",
    embeddedBuild: "",
    embeddedPayloadBase64: "",
    cacheKey: "fbivan.loader.cache.v1",
    timeoutMs: 45000,
  }, config || {});
  const guardKey = "__FBAutoScrollLoader";
  const host = String(location.hostname || "");

  if (!/(^|\.)facebook\.com$/i.test(host)) {
    location.href = "https://www.facebook.com/reel/";
    return;
  }
  if (window[guardKey]?.loading) {
    console.warn(`[${loaderConfig.app}] Loader is already running.`);
    return;
  }
  window[guardKey] = { loading: true, build: "latest", startedAt: Date.now(), source: "" };

  const log = (message) => console.log(`[${loaderConfig.app} loader] ${message}`);
  const fail = (error) => {
    console.error(`[${loaderConfig.app} loader] Failed.`, error);
    alert(`${loaderConfig.app} loader failed: ${error?.message || error}`);
  };
  const withTimeout = (promise, label) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), loaderConfig.timeoutMs)),
  ]);
  const decodeBase64Utf8 = (base64) => {
    const binary = atob(String(base64 || "").replace(/\s+/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new TextDecoder().decode(bytes);
  };
  const compareBuildVersions = (left, right) => {
    const pattern = /^(\d{2})(\d{2})(\d{2})b(\d+)$/i;
    const leftMatch = String(left || "").match(pattern);
    const rightMatch = String(right || "").match(pattern);
    if (!leftMatch || !rightMatch) {
      return String(left || "").localeCompare(String(right || ""));
    }
    const leftParts = [Number(leftMatch[3]), Number(leftMatch[2]), Number(leftMatch[1]), Number(leftMatch[4])];
    const rightParts = [Number(rightMatch[3]), Number(rightMatch[2]), Number(rightMatch[1]), Number(rightMatch[4])];
    for (let index = 0; index < leftParts.length; index += 1) {
      if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
    }
    return 0;
  };
  const fetchJson = async (url, init = {}) => {
    const response = await withTimeout(fetch(url, Object.assign({
      credentials: "include",
      cache: "no-store",
    }, init)), url);
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${response.status} ${text.slice(0, 200)}`);
    }
    return JSON.parse(text.replace(/^for\s*\(;;\);\s*/, ""));
  };
  const getFacebookAccessToken = () => {
    if (window.__accessToken) return window.__accessToken;
    const entries = performance.getEntriesByType("resource")
      .map((entry) => entry.name || "")
      .filter((url) => url.includes("access_token=") && /(^|[./-])facebook\.com|graph\.facebook\.com/.test(url));
    for (const entry of entries) {
      try {
        const token = new URL(entry).searchParams.get("access_token");
        if (token) return token;
      } catch (error) {
        // Ignore malformed performance entries.
      }
    }
    return "";
  };
  const sha256Hex = async (text) => {
    if (!crypto?.subtle) {
      throw new Error("crypto.subtle is not available for payload verification.");
    }
    const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buffer))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  };
  const readCache = () => {
    try {
      const raw = localStorage.getItem(loaderConfig.cacheKey);
      if (!raw) return null;
      const cached = JSON.parse(raw);
      if (!cached?.source || !cached?.version) return null;
      return cached;
    } catch (error) {
      console.warn(`[${loaderConfig.app} loader] Ignoring unreadable cache.`, error);
      return null;
    }
  };
  const writeCache = (version, source, sha256 = "", sourceTag = "") => {
    try {
      localStorage.setItem(loaderConfig.cacheKey, JSON.stringify({
        app: loaderConfig.app,
        version,
        sha256,
        source,
        sourceTag,
        savedAt: new Date().toISOString(),
      }));
    } catch (error) {
      console.warn(`[${loaderConfig.app} loader] Payload loaded, but cache write failed.`, error);
    }
  };
  const useCachedPayload = (cached, reason, sourceTag) => {
    if (!cached) return null;
    const warning = `Cannot load latest payload: ${reason}. Using cached ${cached.version}.`;
    console.warn(`[${loaderConfig.app} loader] ${warning}`);
    window[guardKey].warning = warning;
    window[guardKey].source = sourceTag;
    return { source: cached.source, build: cached.version };
  };
  const useEmbeddedPayload = async (reason) => {
    if (!loaderConfig.embeddedPayloadBase64) return null;
    const build = loaderConfig.embeddedBuild || "embedded";
    const source = decodeBase64Utf8(loaderConfig.embeddedPayloadBase64);
    const actualSha256 = await sha256Hex(source).catch(() => "");
    console.warn(`[${loaderConfig.app} loader] Using embedded ${build} payload: ${reason}`);
    window[guardKey].warning = `Using embedded payload: ${reason}`;
    window[guardKey].source = "embedded";
    writeCache(build, source, actualSha256, "embedded");
    return { source, build };
  };
  const getGraphUrls = (accessToken) => {
    const encoded = encodeURIComponent(accessToken);
    return {
      objectById: (id) => `https://graph.facebook.com/v23.0/${encodeURIComponent(id)}?fields=title,description,updated_time&access_token=${encoded}`,
      ogByUrl: (url) => `https://graph.facebook.com/v23.0/?id=${encodeURIComponent(url)}&fields=og_object&access_token=${encoded}`,
    };
  };
  const fetchOgObject = async (id, graphUrls) => {
    if (!id) throw new Error("No OG object ID configured.");
    return fetchJson(graphUrls.objectById(id));
  };
  const resolveOgObjectIdByUrl = async (url, graphUrls) => {
    if (!url) throw new Error("No manifest URL configured.");
    const resolved = await fetchJson(graphUrls.ogByUrl(url));
    const ogObjectId = resolved?.og_object?.id;
    if (!ogObjectId) {
      throw new Error(`Could not resolve current OG object for ${url}`);
    }
    return ogObjectId;
  };
  const fetchRemoteManifest = async (graphUrls) => {
    const manifestOgObjectId = await resolveOgObjectIdByUrl(loaderConfig.manifestUrl, graphUrls);
    const object = await fetchOgObject(manifestOgObjectId, graphUrls);
    const manifest = JSON.parse(decodeBase64Utf8(object?.description || ""));
    if (manifest?.app !== loaderConfig.app || !manifest?.version) {
      throw new Error("Manifest is malformed or belongs to another app.");
    }
    if (!Array.isArray(manifest.chunks) || !manifest.chunks.length) {
      throw new Error("Manifest does not contain payload chunks.");
    }
    return manifest;
  };
  const fetchRemotePayload = async (manifest, graphUrls) => {
    const ids = await Promise.all(manifest.chunks.map((chunk) => {
      if (chunk?.ogObjectId) return chunk.ogObjectId;
      return resolveOgObjectIdByUrl(chunk?.latestUrl || chunk?.url || "", graphUrls);
    }));
    const chunks = await Promise.all(ids.map((id) => fetchOgObject(id, graphUrls)));
    const encoded = chunks.map((chunk) => chunk?.description || "").join("");
    if (!encoded) throw new Error("OG chunks did not contain description payloads.");
    const source = decodeBase64Utf8(encoded);
    const actualSha256 = await sha256Hex(source);
    const manifestSha256 = manifest?.payload?.sha256 || "";
    if (manifestSha256 && actualSha256 !== manifestSha256) {
      throw new Error(`Remote payload checksum mismatch for ${manifest.version}.`);
    }
    return { source, actualSha256 };
  };
  const loadPayload = async () => {
    const cached = readCache();
    try {
      const accessToken = getFacebookAccessToken();
      if (!accessToken) {
        throw new Error("no Facebook Graph access token found in this tab");
      }
      const graphUrls = getGraphUrls(accessToken);
      const manifest = await fetchRemoteManifest(graphUrls);
      window[guardKey].remoteVersion = manifest.version;
      if (cached && compareBuildVersions(cached.version, manifest.version) > 0) {
        return useCachedPayload(cached, `remote ${manifest.version} is older than cached ${cached.version}`, "cache-remote-stale");
      }
      if (cached && cached.version === manifest.version) {
        log(`using cached ${cached.version}`);
        window[guardKey].source = "cache";
        return { source: cached.source, build: cached.version };
      }
      const payload = await fetchRemotePayload(manifest, graphUrls);
      writeCache(manifest.version, payload.source, payload.actualSha256, "remote");
      window[guardKey].source = "remote";
      log(`downloaded and cached ${manifest.version} from remote OG chunks`);
      return { source: payload.source, build: manifest.version };
    } catch (error) {
      const embedded = await useEmbeddedPayload(error?.message || String(error));
      if (embedded) return embedded;
      const cachedFallback = useCachedPayload(cached, error?.message || String(error), "cache-remote-failed");
      if (cachedFallback) return cachedFallback;
      throw error;
    }
  };
  const executePayload = (source, build) => new Promise((resolve, reject) => {
    const blob = new Blob([
      "(function(){\n\"use strict\";\n",
      source,
      "\n}).call(window);",
      `\n//# sourceURL=fbautoscroll://${build}/payload.js`,
    ], { type: "application/javascript;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);
    const script = document.createElement("script");
    script.src = blobUrl;
    script.onload = () => {
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      script.remove();
      resolve();
    };
    script.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      script.remove();
      reject(new Error("Blob script injection failed."));
    };
    (document.head || document.documentElement).appendChild(script);
  });

  (async () => {
    try {
      const payload = await loadPayload();
      await executePayload(payload.source, payload.build);
      window[guardKey].build = payload.build;
      log(`loaded ${payload.build} payload from ${window[guardKey].source}`);
    } catch (error) {
      fail(error);
    } finally {
      if (window[guardKey]) {
        window[guardKey].loading = false;
        window[guardKey].finishedAt = Date.now();
      }
    }
  })();
})();
