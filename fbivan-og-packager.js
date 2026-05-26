#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const SOURCE = path.join(ROOT, "fbivan-autoscroll.js");
const LOADER_SOURCE = path.join(ROOT, "fbivan-loader.js");
const OUT_ROOT = path.join(ROOT, "dist", "fbautoscroll");
const CHUNK_SIZE = 350000;
const APP_MARK_FILE = "assets/fbautoscroll-mark.svg";

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
    cacheKey: "fbautoscroll.loader.cache.v1",
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
    "    :root {",
    "      --bg: #141414;",
    "      --panel: #202020;",
    "      --panel-2: #292929;",
    "      --ink: #f8f0c8;",
    "      --muted: #a5a08f;",
    "      --gold: #ffd000;",
    "      --gold-2: #ffab00;",
    "      --green: #2a9d8f;",
    "      --orange: #f4a261;",
    "      --line: rgba(255, 208, 0, 0.34);",
    "      --soft: rgba(255, 208, 0, 0.11);",
    "    }",
    "    * { box-sizing: border-box; }",
    "    html { scroll-behavior: smooth; }",
    "    body {",
    "      margin: 0;",
    "      min-height: 100vh;",
    "      color: var(--ink);",
    "      font-family: 'Trebuchet MS', Verdana, sans-serif;",
    "      background:",
    "        linear-gradient(90deg, rgba(255, 208, 0, 0.06) 1px, transparent 1px),",
    "        linear-gradient(rgba(255, 208, 0, 0.05) 1px, transparent 1px),",
    "        linear-gradient(135deg, #101010, #1b1b1b 52%, #111);",
    "      background-size: 44px 44px, 44px 44px, auto;",
    "      overflow-x: hidden;",
    "    }",
    "    a { color: inherit; }",
    "    main { width: min(1180px, calc(100vw - 36px)); margin: 0 auto; padding: 38px 0 72px; }",
    "    .nav { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 24px; color: var(--muted); font-size: 13px; }",
    "    .brand-wrap { display: grid; gap: 2px; }",
    "    .brand-line { display: inline-flex; align-items: center; gap: 12px; }",
    "    .brand-mark { width: 42px; height: 42px; display: block; flex: 0 0 auto; filter: drop-shadow(0 8px 18px rgba(255, 208, 0, 0.14)); }",
    "    .brand { color: var(--gold); font-size: 30px; font-weight: 900; letter-spacing: 0; }",
    "    .byline { color: var(--muted); font-size: 13px; }",
    "    .byline a { color: var(--gold); text-decoration: none; }",
    "    .byline a:hover, .nav-links a:hover { text-decoration: underline; }",
    "    .nav-links { display: flex; gap: 16px; flex-wrap: wrap; align-items: center; }",
    "    .nav-links a { color: var(--muted); text-decoration: none; }",
    "    .hero { width: 100%; border: 2px solid var(--gold); border-radius: 8px; background: linear-gradient(145deg, rgba(32, 32, 32, 0.98), rgba(18, 18, 18, 0.96)); box-shadow: 0 30px 90px rgba(0, 0, 0, 0.44), 0 0 0 8px rgba(255, 208, 0, 0.05); padding: clamp(24px, 4vw, 54px); position: relative; overflow: hidden; }",
    "    .hero::before { content: ''; position: absolute; inset: 0; pointer-events: none; opacity: 0.08; background-image: linear-gradient(135deg, var(--gold) 1px, transparent 1px); background-size: 18px 18px; }",
    "    .hero-grid { display: grid; grid-template-columns: minmax(0, 0.95fr) minmax(390px, 1.05fr); gap: clamp(28px, 5vw, 64px); align-items: center; position: relative; z-index: 1; }",
    "    .eyebrow { display: inline-flex; gap: 10px; align-items: center; padding: 8px 12px; border: 1px solid var(--gold); border-radius: 999px; background: rgba(255, 208, 0, 0.08); color: var(--gold); font: 800 12px/1.2 Verdana, sans-serif; letter-spacing: 0; text-transform: uppercase; }",
    "    h1 { max-width: 680px; margin: 26px 0 16px; color: #fff6c8; font-size: clamp(46px, 7vw, 94px); line-height: 0.94; letter-spacing: 0; }",
    "    .lead { max-width: 660px; margin: 0; color: #c9c1a5; font: 18px/1.55 Verdana, sans-serif; }",
    "    .install { display: grid; grid-template-columns: 1fr; gap: 18px; align-items: start; margin-top: 34px; max-width: 560px; }",
    "    .bookmarklet { display: inline-flex; align-items: center; justify-content: center; min-height: 72px; padding: 0 28px; border: 3px solid #050505; border-radius: 8px; color: #111; background: linear-gradient(135deg, var(--gold), var(--gold-2)); box-shadow: 8px 8px 0 #050505; text-decoration: none; font: 900 24px/1 Verdana, sans-serif; cursor: pointer; user-select: none; transition: transform 160ms ease, box-shadow 160ms ease; width: min(320px, 100%); }",
    "    .bookmarklet:hover { transform: translate(-2px, -2px); box-shadow: 11px 11px 0 #050505; }",
    "    .hint { margin: 0; color: var(--muted); font: 15px/1.6 Verdana, sans-serif; }",
    "    .actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 28px; }",
    "    button { border: 1px solid var(--line); border-radius: 999px; background: rgba(255, 208, 0, 0.08); color: var(--gold); padding: 12px 16px; font: 700 14px/1 Verdana, sans-serif; cursor: pointer; }",
    "    button:hover { background: rgba(255, 208, 0, 0.14); }",
    "    .preview { border: 1px solid var(--line); border-radius: 8px; background: #0f0f0f; padding: 12px; box-shadow: 18px 18px 0 rgba(255, 208, 0, 0.08); }",
    "    .browser-bar { display: flex; gap: 7px; padding: 0 0 10px; }",
    "    .dot { width: 10px; height: 10px; border-radius: 999px; background: var(--muted); opacity: 0.65; }",
    "    .shot { min-height: 420px; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; background: linear-gradient(180deg, #242424, #131313); padding: 18px; position: relative; overflow: hidden; }",
    "    .feed { display: grid; gap: 12px; width: 58%; }",
    "    .feed-row { height: 70px; border-radius: 8px; background: linear-gradient(90deg, rgba(255, 255, 255, 0.11), rgba(255, 255, 255, 0.04)); border: 1px solid rgba(255, 255, 255, 0.08); }",
    "    .panel-ui { position: absolute; right: 20px; bottom: 20px; width: min(300px, calc(100% - 40px)); border: 4px solid #264653; border-radius: 8px; background: var(--orange); color: #264653; box-shadow: 6px 6px 0 #264653; font-family: 'Comic Sans MS', 'Segoe UI', sans-serif; overflow: hidden; }",
    "    .panel-head { display: flex; justify-content: space-between; align-items: center; padding: 8px 14px; background: #e76f51; color: #fff; font-weight: 900; }",
    "    .panel-body { padding: 12px; font-size: 12px; }",
    "    .timer { float: right; color: #fff; font-size: 28px; font-weight: 900; text-shadow: 2px 2px 0 #000; }",
    "    .control-grid { clear: both; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 12px 0; }",
    "    .control { min-height: 44px; border-radius: 8px; background: rgba(255, 255, 255, 0.3); display: grid; place-items: center; font-size: 10px; font-weight: 900; text-align: center; }",
    "    .start { width: 100%; padding: 10px; border-radius: 8px; background: #264653; color: #fff; text-align: center; font-weight: 900; box-shadow: 0 4px 0 #1a323c; }",
    "    .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-top: 22px; }",
    "    .card { border: 1px solid var(--line); border-radius: 8px; background: rgba(32, 32, 32, 0.82); padding: 18px; min-height: 148px; }",
    "    .card b { display: block; color: var(--gold); margin-bottom: 8px; font-size: 16px; }",
    "    .card p { margin: 0; color: #c9c1a5; font: 14px/1.55 Verdana, sans-serif; }",
    "    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 14px; }",
    "    .meta-box { border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; background: rgba(0, 0, 0, 0.22); padding: 14px; color: var(--muted); font: 13px/1.5 Verdana, sans-serif; overflow-wrap: anywhere; }",
    "    .meta-box b { display: block; color: var(--gold); margin-bottom: 4px; }",
    "    footer { margin-top: 28px; color: var(--muted); font: 13px/1.6 Verdana, sans-serif; }",
    "    footer a, .meta-box a { color: var(--gold); text-decoration: none; }",
    "    footer a:hover, .meta-box a:hover { text-decoration: underline; }",
    "    @media (max-width: 900px) { main { width: min(100% - 24px, 680px); padding-top: 24px; } .nav, .hero-grid, .meta { display: block; } .nav-links { margin-top: 14px; } .preview { margin-top: 28px; } .cards { grid-template-columns: 1fr 1fr; } h1 { font-size: 44px; line-height: 1; } .shot { min-height: 370px; } .feed { width: 100%; } }",
    "    @media (max-width: 560px) { .cards { grid-template-columns: 1fr; } .brand { font-size: 26px; } .bookmarklet { min-height: 62px; font-size: 20px; } .panel-ui { right: 12px; left: 12px; width: auto; } .control-grid { grid-template-columns: 1fr 1fr; } }",
    "  </style>",
    "</head>",
    "<body>",
    "  <main>",
    "    <nav class=\"nav\">",
    "      <div class=\"brand-wrap\">",
    `        <div class="brand-line"><span class="brand-mark">${inlineMark}</span><span class="brand">${escapeHtml(displayName)}</span></div>`,
    `        <div class="byline">Yellow Web bookmarklet build ${escapeHtml(build)} · by <a href="https://t.me/fb_ivan" target="_blank" rel="noopener noreferrer">fb_ivan</a></div>`,
    "      </div>",
    `      <div class="nav-links"><a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener">GitHub source</a><a href="https://yellowweb.pages.dev/" target="_blank" rel="noopener">Tools hub</a><a href="https://yellowweb.top" target="_blank" rel="noopener">yellowweb.top</a><a href="https://t.me/yellow_web" target="_blank" rel="noopener">Telegram</a></div>`,
    "    </nav>",
    "    <section class=\"hero\">",
    "      <div class=\"hero-grid\">",
    "        <div>",
    "          <div class=\"eyebrow\">Yellow Web bookmarklet build " + escapeHtml(build) + "</div>",
    "          <h1>FB Auto Scroll for Reels and Feed.</h1>",
    "          <p class=\"lead\">A browser bookmarklet that opens a compact control panel inside Facebook: Reels, Feed, or both, with delays, breaks, night pause, session limit, and max scroll count.</p>",
    "          <div class=\"install\">",
    `            <a class="bookmarklet" id="bookmarkletLink" href="${escapeHtml(bookmarklet)}">FB Auto Scroll</a>`,
    "            <p class=\"hint\">Drag this yellow button to the bookmarks bar. Open Facebook, click the bookmark, then run the panel from the current tab.</p>",
    "          </div>",
    "          <div class=\"actions\"><button id=\"copyBookmarklet\" type=\"button\">Copy bookmarklet</button><button id=\"copyUrl\" type=\"button\">Copy page URL</button></div>",
    "        </div>",
    "        <div class=\"preview\" aria-label=\"FB Auto Scroll interface preview\">",
    "          <div class=\"browser-bar\"><span class=\"dot\"></span><span class=\"dot\"></span><span class=\"dot\"></span></div>",
    "          <div class=\"shot\">",
    "            <div class=\"feed\"><div class=\"feed-row\"></div><div class=\"feed-row\"></div><div class=\"feed-row\"></div><div class=\"feed-row\"></div></div>",
    "            <div class=\"panel-ui\">",
    "              <div class=\"panel-head\"><span>THIS IS FINE</span><span>v4.8</span></div>",
    "              <div class=\"panel-body\"><span>Next scroll in:</span><span class=\"timer\">08</span><div class=\"control-grid\"><div class=\"control\">MODE<br>Reels / Feed / Both</div><div class=\"control\">LIKE<br>1/N</div><div class=\"control\">BREAK<br>every min</div><div class=\"control\">MAX<br>scrolls</div></div><div class=\"start\">START FIRE</div></div>",
    "            </div>",
    "          </div>",
    "        </div>",
    "      </div>",
    "    </section>",
    "    <section class=\"cards\" aria-label=\"Feature summary\">",
    "      <div class=\"card\"><b>Modes</b><p>Reels, Feed, or automatic switching between the two surfaces.</p></div>",
    "      <div class=\"card\"><b>Timing</b><p>Delay ranges, long breaks, night pause, and a session timer.</p></div>",
    "      <div class=\"card\"><b>Limits</b><p>Max scroll count and basic status counters to stop runs cleanly.</p></div>",
    "      <div class=\"card\"><b>Source</b><p>The loader and payload are public on GitHub and deployed through Cloudflare Pages.</p></div>",
    "    </section>",
    "    <section class=\"meta\">",
    `      <div class="meta-box"><b>GitHub source</b><a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(sourceUrl)}</a></div>`,
    `      <div class="meta-box"><b>Manifest</b>${escapeHtml(manifestUrl)}</div>`,
    "    </section>",
    "    <footer>Original script by <a href=\"https://t.me/fb_ivan\" target=\"_blank\" rel=\"noopener noreferrer\">fb_ivan</a>. Questions about the original script, its logic, settings, and behavior should go to him. This wrapper only packages the bookmarklet and does not send Facebook data to a Yellow Web server.</footer>",
    "  </main>",
    "  <script>",
    `    var bookmarkletValue = ${JSON.stringify(bookmarklet)};`,
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
    "/fbautoscroll/*",
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
