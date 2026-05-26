#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const SOURCE = path.join(ROOT, "fbivan-autoscroll.js");
const LOADER_SOURCE = path.join(ROOT, "fbivan-loader.js");
const OUT_ROOT = path.join(ROOT, "dist", "fbivan");
const CHUNK_SIZE = 350000;
const APP_MARK_FILE = "assets/fbivan-mark.svg";

function readArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const item = process.argv.find((arg) => arg.startsWith(prefix));
  return item ? item.slice(prefix.length) : fallback;
}

function parseListArg(name) {
  return readArg(name, "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function splitString(input, chunkSize) {
  const chunks = [];
  for (let index = 0; index < input.length; index += chunkSize) {
    chunks.push(input.slice(index, index + chunkSize));
  }
  return chunks;
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function detectBuild(source) {
  const match = source.match(/FINE_BUILD\s*=\s*"([^"]+)"/);
  if (!match) throw new Error("Cannot detect FINE_BUILD in payload source.");
  return match[1];
}

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function pruneOldBuildDirs(outRoot, currentBuild) {
  if (!fs.existsSync(outRoot)) return;
  for (const entry of fs.readdirSync(outRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "latest" || entry.name === currentBuild) continue;
    if (/^\d{6}b\d+$/i.test(entry.name)) {
      fs.rmSync(path.join(outRoot, entry.name), { recursive: true, force: true });
    }
  }
}

function buildAppMarkSvg() {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="FB Auto Scroll mark">',
    '  <rect x="5" y="5" width="86" height="86" rx="20" fill="#111" stroke="#ffd000" stroke-width="6"/>',
    '  <path d="M27 28h42v11H41v10h23v10H41v21H27Z" fill="#ffd000"/>',
    '  <circle cx="70" cy="70" r="8" fill="#f4a261"/>',
    '  <path d="M67 68h6v15h-6Z" fill="#f4a261" transform="rotate(45 70 75)"/>',
    '</svg>',
  ].join("\n");
}

function buildOgHtml({ appName, build, chunk, index, total }) {
  const title = `${appName} ${build} chunk ${index + 1}/${total}`;
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8" />',
    '  <meta name="robots" content="noindex,nofollow" />',
    '  <meta property="og:type" content="website" />',
    `  <meta property="og:title" content="${escapeHtml(title)}" />`,
    `  <meta property="og:description" content="${escapeHtml(chunk)}" />`,
    `  <title>${escapeHtml(title)}</title>`,
    "</head>",
    "<body>",
    `  <pre>${escapeHtml(title)}</pre>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

function buildManifestHtml({ appName, build, manifestBase64 }) {
  const title = `${appName} ${build} manifest`;
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8" />',
    '  <meta name="robots" content="noindex,nofollow" />',
    '  <meta property="og:type" content="website" />',
    `  <meta property="og:title" content="${escapeHtml(title)}" />`,
    `  <meta property="og:description" content="${escapeHtml(manifestBase64)}" />`,
    `  <title>${escapeHtml(title)}</title>`,
    "</head>",
    "<body>",
    `  <pre>${escapeHtml(title)}</pre>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

function buildBookmarkletLoader(loaderManifest, sourceBase64) {
  const loaderSource = fs.readFileSync(LOADER_SOURCE, "utf8").trim();
  const configJson = JSON.stringify({
    app: loaderManifest.app,
    manifestUrl: loaderManifest.latestManifestUrl,
    embeddedBuild: loaderManifest.version,
    embeddedPayloadBase64: sourceBase64,
    cacheKey: "fbivan.loader.cache.v1",
  });
  return loaderSource.replace(/\)\(\);?\s*$/, `)(${configJson});`);
}

function buildLandingHtml({ displayName, build, bookmarklet, manifestUrl, sourceUrl }) {
  const inlineMark = buildAppMarkSvg();
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `  <title>${escapeHtml(displayName)} Loader</title>`,
    '  <meta name="robots" content="noindex,nofollow" />',
    `  <meta name="description" content="${escapeHtml(displayName)} bookmarklet loader for Facebook Reels and Feed auto scroll." />`,
    `  <link rel="icon" href="/${APP_MARK_FILE}" type="image/svg+xml" />`,
    "  <style>",
    "    :root { --bg:#111; --panel:#202020; --ink:#f8f0c8; --muted:#b7ad89; --gold:#ffd000; --line:rgba(255,208,0,.34); --green:#2a9d8f; --orange:#f4a261; }",
    "    * { box-sizing: border-box; }",
    "    body { margin:0; min-height:100vh; background:var(--bg); color:var(--ink); font:15px/1.55 Verdana,sans-serif; }",
    "    main { width:min(1100px, calc(100vw - 32px)); margin:0 auto; padding:36px 0 64px; }",
    "    nav { display:flex; justify-content:space-between; align-items:center; gap:18px; padding-bottom:22px; border-bottom:1px solid var(--line); margin-bottom:28px; }",
    "    .brand { display:flex; align-items:center; gap:12px; color:var(--gold); font:900 34px/1 Trebuchet MS,Verdana,sans-serif; }",
    "    .brand svg { width:42px; height:42px; flex:0 0 auto; }",
    "    .links { display:flex; gap:14px; flex-wrap:wrap; }",
    "    a { color:var(--gold); text-decoration:none; }",
    "    a:hover { text-decoration:underline; }",
    "    .hero { display:grid; grid-template-columns:minmax(0,1.15fr) minmax(260px,.85fr); gap:22px; align-items:stretch; }",
    "    .panel { border:1px solid var(--line); background:var(--panel); border-radius:8px; padding:24px; }",
    "    h1 { margin:0 0 12px; color:var(--gold); font:900 40px/1.08 Trebuchet MS,Verdana,sans-serif; }",
    "    p { margin:0 0 16px; color:#d8cfaa; }",
    "    .eyebrow { color:var(--muted); font-weight:700; margin-bottom:10px; }",
    "    .credit { color:var(--muted); font-size:13px; margin-top:6px; }",
    "    .credit b { color:var(--gold); }",
    "    .bookmarklet { display:inline-flex; align-items:center; justify-content:center; min-height:44px; padding:0 18px; border-radius:999px; background:var(--gold); color:#111; font-weight:900; box-shadow:0 4px 0 #8a7100; }",
    "    button { min-height:40px; border:1px solid var(--line); border-radius:999px; background:rgba(255,208,0,.08); color:var(--gold); font-weight:800; cursor:pointer; padding:0 14px; }",
    "    .actions { display:flex; gap:10px; flex-wrap:wrap; margin:14px 0; }",
    "    code { display:block; overflow-wrap:anywhere; color:var(--muted); font-size:12px; }",
    "    .feature { display:grid; gap:12px; }",
    "    .feature div { border:1px solid var(--line); border-radius:8px; padding:14px; background:rgba(255,208,0,.06); }",
    "    .feature b { display:block; color:var(--gold); margin-bottom:4px; }",
    "    footer { margin-top:26px; color:var(--muted); }",
    "    @media (max-width:780px) { nav,.hero { display:block; } .links { margin-top:14px; } h1 { font-size:32px; } .feature { margin-top:14px; } }",
    "  </style>",
    "</head>",
    "<body>",
    "  <main>",
    "    <nav>",
    `      <div><div class="brand"><span>${inlineMark}</span><span>${escapeHtml(displayName)}</span></div><div class="eyebrow">Yellow Web bookmarklet build ${escapeHtml(build)}</div><div class="credit">original script by <b>fb_ivan</b></div></div>`,
    `      <div class="links"><a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener">GitHub source</a><a href="https://yellowweb.top" target="_blank" rel="noopener">yellowweb.top</a><a href="https://t.me/yellow_web" target="_blank" rel="noopener">Telegram</a></div>`,
    "    </nav>",
    "    <section class=\"hero\">",
    "      <div class=\"panel\">",
    "        <div class=\"eyebrow\">Reels + Feed + Both</div>",
    "        <h1>Auto scroll panel for Facebook Reels and Feed.</h1>",
    "        <p>Drag the yellow bookmarklet to the bookmarks bar. Open Facebook Reels or Feed, click the bookmark, then use the on-page panel to start, stop, switch mode, set breaks, session limit, and scroll limit.</p>",
    `        <a class="bookmarklet" id="bookmarkletLink" href="${escapeHtml(bookmarklet)}">FB Auto Scroll</a>`,
    "        <div class=\"actions\"><button id=\"copyBookmarklet\" type=\"button\" data-bookmarklet=\"\">Copy bookmarklet</button><button id=\"copyUrl\" type=\"button\">Copy page URL</button></div>",
    `        <code>manifest URL: ${escapeHtml(manifestUrl)}</code>`,
    "      </div>",
    "      <div class=\"feature\">",
    "        <div><b>Modes</b>Reels, Feed, or automatic switching between both surfaces.</div>",
    "        <div><b>Controls</b>Delay ranges, break schedule, night pause, session limit, and max scroll count.</div>",
    "        <div><b>Loader</b>Uses remote OG chunks when available and an embedded payload fallback for regular Facebook tabs.</div>",
    "        <div><b>Source</b>The payload is published as a normal GitHub repository and versioned Cloudflare Pages build.</div>",
    "      </div>",
    "    </section>",
    "    <footer>Original script by <b>fb_ivan</b>. The tool runs only inside your current Facebook tab. It does not send data to a Yellow Web server.</footer>",
    "  </main>",
    "  <script>",
    `    var bookmarkletValue = ${JSON.stringify(bookmarklet)};`,
    "    document.getElementById('copyBookmarklet').dataset.bookmarklet = bookmarkletValue;",
    "    document.getElementById('copyBookmarklet').addEventListener('click', async function() {",
    "      try { await navigator.clipboard.writeText(bookmarkletValue); this.textContent = 'Copied'; setTimeout(() => this.textContent = 'Copy bookmarklet', 1400); }",
    "      catch (error) { this.textContent = 'Copy failed'; setTimeout(() => this.textContent = 'Copy bookmarklet', 1800); }",
    "    });",
    "    document.getElementById('copyUrl').addEventListener('click', async function() { await navigator.clipboard.writeText(location.href); this.textContent = 'Copied'; setTimeout(() => this.textContent = 'Copy page URL', 1400); });",
    "  </script>",
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

function main() {
  const sourcePath = path.resolve(readArg("source", SOURCE));
  const outRoot = path.resolve(readArg("out", OUT_ROOT));
  const distRoot = path.dirname(outRoot);
  const baseUrl = readArg("base-url", "");
  const appName = readArg("app", "FBAutoScroll");
  const displayName = "FB Auto Scroll";
  const sourceUrl = readArg("source-url", "https://github.com/dvygolov/FBIvan");
  const chunkOgObjectIds = parseListArg("chunk-og-object-ids");
  const source = fs.readFileSync(sourcePath, "utf8");
  const build = readArg("build", detectBuild(source));
  const buildDir = path.join(outRoot, build);
  const latestDir = path.join(outRoot, "latest");
  const ogDir = path.join(buildDir, "og");
  const latestOgDir = path.join(latestDir, "og");
  const sourceBase64 = Buffer.from(source, "utf8").toString("base64");
  const chunks = splitString(sourceBase64, CHUNK_SIZE);
  const generatedAt = new Date().toISOString();

  fs.rmSync(buildDir, { recursive: true, force: true });
  fs.rmSync(latestDir, { recursive: true, force: true });
  writeFile(path.join(buildDir, "payload.js"), source);
  writeFile(path.join(latestDir, "payload.js"), source);
  chunks.forEach((chunk, index) => {
    const fileName = `chunk-${String(index + 1).padStart(3, "0")}.html`;
    const html = buildOgHtml({ appName, build, chunk, index, total: chunks.length });
    writeFile(path.join(ogDir, fileName), html);
    writeFile(path.join(latestOgDir, fileName), html);
  });

  const publicUrl = (relativePath) => {
    if (!baseUrl) return "";
    return `${baseUrl.replace(/\/+$/, "")}/${relativePath.replace(/\\/g, "/")}`;
  };
  const manifest = {
    app: appName,
    build,
    version: build,
    generatedAt,
    payload: {
      encoding: "base64",
      sha256: sha256Hex(source),
      byteLength: Buffer.byteLength(source, "utf8"),
    },
    chunks: chunks.map((chunk, index) => ({
      index: index + 1,
      file: `og/chunk-${String(index + 1).padStart(3, "0")}.html`,
      url: publicUrl(`${build}/og/chunk-${String(index + 1).padStart(3, "0")}.html`),
      latestUrl: publicUrl(`latest/og/chunk-${String(index + 1).padStart(3, "0")}.html`),
      ogObjectId: chunkOgObjectIds[index] || "",
      base64Length: chunk.length,
      base64Sha256: sha256Hex(chunk),
    })),
  };
  const manifestBase64 = Buffer.from(JSON.stringify(manifest), "utf8").toString("base64");
  const manifestHtml = buildManifestHtml({ appName, build, manifestBase64 });
  writeFile(path.join(buildDir, "manifest.html"), manifestHtml);
  writeFile(path.join(latestDir, "manifest.html"), manifestHtml);

  const packageInfo = {
    ...manifest,
    source: path.relative(ROOT, sourcePath).replace(/\\/g, "/"),
    chunkSize: CHUNK_SIZE,
    payloadFile: "payload.js",
    manifestFile: "manifest.html",
    manifestUrl: publicUrl(`${build}/manifest.html`),
    latestManifestUrl: publicUrl("latest/manifest.html"),
  };
  writeFile(path.join(buildDir, "package-info.json"), `${JSON.stringify(packageInfo, null, 2)}\n`);

  const loaderManifest = {
    app: appName,
    version: build,
    latestManifestUrl: packageInfo.latestManifestUrl,
  };
  const loaderSource = buildBookmarkletLoader(loaderManifest, sourceBase64);
  const bookmarklet = `javascript:${encodeURIComponent(loaderSource)}`;
  writeFile(path.join(distRoot, APP_MARK_FILE), `${buildAppMarkSvg()}\n`);
  writeFile(path.join(distRoot, "index.html"), buildLandingHtml({
    displayName,
    build,
    bookmarklet,
    manifestUrl: packageInfo.latestManifestUrl,
    sourceUrl,
  }));
  writeFile(path.join(distRoot, "_headers"), [
    "/",
    "  Cache-Control: no-store",
    "",
    "/*",
    "  Cache-Control: no-store",
    "",
    "/fbivan/*",
    "  Access-Control-Allow-Origin: *",
    "  Cache-Control: no-store",
    "",
  ].join("\n"));
  writeFile(path.join(distRoot, "_redirects"), [
    "/ /index.html 200",
    "/* /index.html 200",
    "",
  ].join("\n"));
  pruneOldBuildDirs(outRoot, build);

  console.log(`${appName} ${build} packaged.`);
  console.log(`Payload: ${path.join(buildDir, "payload.js")}`);
  console.log(`OG chunks: ${chunks.length}`);
  if (baseUrl) console.log(`Manifest latest URL: ${packageInfo.latestManifestUrl}`);
}

main();
