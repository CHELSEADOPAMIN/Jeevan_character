import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, renameSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const publicDir = path.join(__dirname, "public");
const jobsDir = path.resolve(process.env.PETFORGE_JOBS_DIR || path.join(os.tmpdir(), "petforge-jobs"));

const envPath = path.join(__dirname, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

const port = Number(process.env.PORT || 4177);
const dailyGenerationLimit = Number(process.env.PETFORGE_DAILY_LIMIT || 5);
const quotaPath = path.join(jobsDir, "daily-generation-quota.json");

const poseNames = ["idle", "run", "wave", "jump", "crouch", "thinking", "point", "celebrate"];
const cellWidth = 192;
const cellHeight = 208;
const atlasColumns = 8;
const atlasRows = 9;
const atlasWidth = cellWidth * atlasColumns;
const atlasHeight = cellHeight * atlasRows;
const rowSpecs = [
  ["idle", ["idle"], false],
  ["running-right", ["run", "running", "running-right"], false],
  ["running-left", ["run-left", "running-left", "run", "running"], true],
  ["waving", ["wave", "waving", "idle"], false],
  ["jumping", ["jump", "jumping", "run"], false],
  ["failed", ["failed", "crouch", "sad", "idle"], false],
  ["waiting", ["thinking", "waiting", "idle"], false],
  ["running", ["run", "running", "running-right"], false],
  ["review", ["point", "review", "thinking", "idle"], false]
];

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getClientAddress(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  const forwardedAddress = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  const address = forwardedAddress?.split(",")[0]?.trim()
    || req.headers["x-real-ip"]
    || req.socket.remoteAddress
    || "unknown";
  return String(address).replace(/^::ffff:/, "");
}

function getClientQuotaKey(req) {
  return createHash("sha256").update(getClientAddress(req)).digest("hex").slice(0, 32);
}

function readQuotaStore() {
  const today = localDateKey();
  if (!existsSync(quotaPath)) return { date: today, clients: {} };

  try {
    const store = JSON.parse(readFileSync(quotaPath, "utf8"));
    if (store?.date === today && store?.clients && typeof store.clients === "object") {
      return store;
    }
  } catch {
    // A malformed quota file should not block the app; start a fresh daily window.
  }

  return { date: today, clients: {} };
}

function writeQuotaStore(store) {
  mkdirSync(jobsDir, { recursive: true });
  const tmpPath = `${quotaPath}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(store, null, 2)}\n`);
  renameSync(tmpPath, quotaPath);
}

function getQuotaStatus(req) {
  const limit = Number.isFinite(dailyGenerationLimit) && dailyGenerationLimit > 0 ? dailyGenerationLimit : 5;
  const store = readQuotaStore();
  const key = getClientQuotaKey(req);
  const used = Number(store.clients[key]?.count || 0);
  return {
    limit,
    used,
    remaining: Math.max(0, limit - used),
    resetsOn: store.date
  };
}

function consumeGenerationQuota(req) {
  const status = getQuotaStatus(req);
  if (status.remaining <= 0) return { ok: false, ...status };

  const store = readQuotaStore();
  const key = getClientQuotaKey(req);
  const current = store.clients[key] || { count: 0 };
  current.count = Number(current.count || 0) + 1;
  current.lastSeenAt = new Date().toISOString();
  store.clients[key] = current;
  writeQuotaStore(store);

  return {
    ok: true,
    limit: status.limit,
    used: current.count,
    remaining: Math.max(0, status.limit - current.count),
    resetsOn: store.date
  };
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath);
  const type =
    ext === ".html" ? "text/html; charset=utf-8" :
    ext === ".css" ? "text/css; charset=utf-8" :
    ext === ".js" ? "text/javascript; charset=utf-8" :
    ext === ".png" ? "image/png" :
    ext === ".webp" ? "image/webp" :
    ext === ".zip" ? "application/zip" :
    "application/octet-stream";
  res.writeHead(200, { "content-type": type });
  res.end(readFileSync(filePath));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 4 * 1024 * 1024) {
        reject(new Error("Upload is too large. Please use an image under 3 MB."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function cleanId(value) {
  return String(value || "custom-pet")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "custom-pet";
}

function parseDataUrl(dataUrl) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/i.exec(dataUrl || "");
  if (!match) throw new Error("Please upload a PNG, JPEG, or WebP image.");
  const ext = match[1].includes("jpeg") ? "jpg" : match[1].split("/")[1];
  return { mime: match[1], ext, buffer: Buffer.from(match[2], "base64") };
}

function petPrompt(styleNote) {
  return [
    "Generate a clean 8-bit pixel art platformer sprite sheet for this person.",
    "Preserve the person's recognizable hairstyle, face shape, outfit colors, and overall silhouette.",
    "Create a cute small game character suitable for a desktop pet.",
    "Use consistent proportions and the same character design in every frame.",
    "Arrange the result as a 4 columns x 4 rows sprite sheet with generous spacing.",
    "The first two rows must include: idle standing, running right, waving, jumping, crouching or failed, thinking or waiting, pointing or reviewing, celebrating.",
    "Use a transparent background if the model supports it; otherwise use one flat near-white background color that can be removed cleanly. No labels, no text, no UI, no frame borders, crisp pixel-art edges.",
    styleNote ? `Additional style notes: ${styleNote}` : ""
  ].filter(Boolean).join("\n");
}

async function generateSpriteSheet({ sourcePath, mime, outPath, styleNote }) {
  if (process.env.PETFORGE_DEMO_ONLY === "1") {
    return { mode: "demo", reason: "PETFORGE_DEMO_ONLY=1 is set; using bundled sample poses." };
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set. Add it to web/petforge/.env, then restart the server. Without an API key, the app cannot generate a new character from your uploaded photo.");
  }

  const imageModel = process.env.IMAGE_MODEL || "gpt-image-2";
  const input = readFileSync(sourcePath);
  const form = new FormData();
  form.set("model", imageModel);
  form.set("image", new File([input], path.basename(sourcePath), { type: mime }));
  form.set("prompt", petPrompt(styleNote));
  form.set("size", "1024x1024");
  form.set("quality", "low");
  form.set("background", imageModel === "gpt-image-2" ? "auto" : "transparent");
  form.set("output_format", "png");

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.error?.message || "Image generation failed.");
  }
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("Image generation returned no image.");

  writeFileSync(outPath, Buffer.from(b64, "base64"));
  return { mode: "openai", model: imageModel };
}

function copyDemoPoses(outDir) {
  const sampleDir = path.join(repoRoot, "assets/codexpet");
  for (const pose of poseNames) {
    copyFileSync(path.join(sampleDir, `${pose}.png`), path.join(outDir, `${pose}.png`));
  }
}

function rawImage(buffer, width, height) {
  return sharp(buffer, { raw: { width, height, channels: 4 } });
}

function alphaBounds(buffer, width, height) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = buffer[(y * width + x) * 4 + 3];
      if (alpha === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }

  if (right < left || bottom < top) return null;
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

function removeFlatBackground(buffer, width, height, tolerance = 26) {
  const corners = [
    0,
    (width - 1) * 4,
    ((height - 1) * width) * 4,
    ((height - 1) * width + width - 1) * 4
  ];
  const bgOffset = corners.reduce((best, offset) => {
    const bestTotal = buffer[best] + buffer[best + 1] + buffer[best + 2];
    const total = buffer[offset] + buffer[offset + 1] + buffer[offset + 2];
    return total > bestTotal ? offset : best;
  }, corners[0]);
  const bg = [buffer[bgOffset], buffer[bgOffset + 1], buffer[bgOffset + 2]];
  const matchesBackground = (offset) => {
    if (buffer[offset + 3] === 0) return false;
    const distance = Math.max(
      Math.abs(buffer[offset] - bg[0]),
      Math.abs(buffer[offset + 1] - bg[1]),
      Math.abs(buffer[offset + 2] - bg[2])
    );
    return distance <= tolerance && buffer[offset] + buffer[offset + 1] + buffer[offset + 2] > 600;
  };
  const visited = new Uint8Array(width * height);
  const queue = [];
  const enqueue = (x, y) => {
    const index = y * width + x;
    if (visited[index]) return;
    const offset = index * 4;
    if (!matchesBackground(offset)) return;
    visited[index] = 1;
    queue.push(index);
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  for (let i = 0; i < queue.length; i += 1) {
    const index = queue[i];
    const x = index % width;
    const y = Math.floor(index / width);
    buffer[index * 4 + 3] = 0;

    if (x > 0) enqueue(x - 1, y);
    if (x + 1 < width) enqueue(x + 1, y);
    if (y > 0) enqueue(x, y - 1);
    if (y + 1 < height) enqueue(x, y + 1);
  }
}

async function writePngFromRaw(buffer, width, height, outPath) {
  await rawImage(buffer, width, height).png().toFile(outPath);
}

async function trimTransparent(buffer, width, height) {
  const bounds = alphaBounds(buffer, width, height);
  if (!bounds) return { buffer, width, height };

  const { data, info } = await rawImage(buffer, width, height)
    .extract(bounds)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { buffer: data, width: info.width, height: info.height };
}

async function extractPosesFromSheet(sheetPath, outDir) {
  const poseMap = {
    idle: [0, 0],
    run: [1, 0],
    wave: [2, 0],
    jump: [3, 0],
    crouch: [0, 1],
    thinking: [1, 1],
    point: [2, 1],
    celebrate: [3, 1]
  };
  const { data, info } = await sharp(sheetPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const cellW = Math.floor(info.width / 4);
  const cellH = Math.floor(info.height / 4);
  mkdirSync(outDir, { recursive: true });

  for (const [pose, [col, row]] of Object.entries(poseMap)) {
    const { data: crop, info: cropInfo } = await rawImage(data, info.width, info.height)
      .extract({ left: col * cellW, top: row * cellH, width: cellW, height: cellH })
      .raw()
      .toBuffer({ resolveWithObject: true });
    removeFlatBackground(crop, cropInfo.width, cropInfo.height);
    const trimmed = await trimTransparent(crop, cropInfo.width, cropInfo.height);
    await writePngFromRaw(trimmed.buffer, trimmed.width, trimmed.height, path.join(outDir, `${pose}.png`));
  }
}

function findPose(poseDir, names) {
  for (const name of names) {
    for (const ext of [".png", ".webp"]) {
      const posePath = path.join(poseDir, `${name}${ext}`);
      if (existsSync(posePath)) return posePath;
    }
  }
  throw new Error(`Missing pose. Tried: ${names.join(", ")}`);
}

async function fitToCell(posePath, mirror) {
  let image = sharp(posePath).ensureAlpha();
  if (mirror) image = image.flop();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const trimmed = await trimTransparent(data, info.width, info.height);
  const maxW = Math.floor(cellWidth * 0.82);
  const maxH = Math.floor(cellHeight * 0.88);
  const scale = Math.min(maxW / trimmed.width, maxH / trimmed.height, 1);
  const resizedW = Math.max(1, Math.round(trimmed.width * scale));
  const resizedH = Math.max(1, Math.round(trimmed.height * scale));
  const resized = await rawImage(trimmed.buffer, trimmed.width, trimmed.height)
    .resize(resizedW, resizedH, { kernel: "lanczos3" })
    .png()
    .toBuffer();
  const x = Math.floor((cellWidth - resizedW) / 2);
  const y = cellHeight - resizedH - 10;

  return sharp({
    create: {
      width: cellWidth,
      height: cellHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  }).composite([{ input: resized, left: x, top: y }]).raw().toBuffer();
}

function frameOffset(frameIndex, rowName) {
  const offsets = {
    idle: [[0, 0], [0, -1], [0, 0], [0, 1], [0, 0], [0, -1], [0, 0], [0, 1]],
    waving: [[0, 0], [1, -1], [0, -1], [-1, 0], [0, 0], [1, -1], [0, -1], [-1, 0]],
    waiting: [[0, 0], [0, 0], [0, -1], [0, -1], [0, 0], [0, 1], [0, 1], [0, 0]],
    failed: [[0, 2], [0, 3], [0, 2], [0, 4], [0, 3], [0, 2], [0, 3], [0, 2]],
    jumping: [[0, 0], [0, -6], [1, -12], [1, -18], [0, -14], [-1, -8], [0, -3], [0, 0]],
    review: [[0, 0], [1, 0], [2, 0], [1, 0], [0, 0], [1, -1], [2, -1], [1, 0]]
  };
  const sequence = rowName.includes("running")
    ? [[-5, 0], [-3, -2], [0, 0], [3, -2], [5, 0], [3, 1], [0, 0], [-3, 1]]
    : offsets[rowName] || offsets.idle;
  return sequence[frameIndex % sequence.length];
}

function shiftedFrame(cellBuffer, frameIndex, rowName) {
  const [dx, dy] = frameOffset(frameIndex, rowName);
  const frame = Buffer.alloc(cellWidth * cellHeight * 4);

  for (let y = 0; y < cellHeight; y += 1) {
    const targetY = y + dy;
    if (targetY < 0 || targetY >= cellHeight) continue;
    for (let x = 0; x < cellWidth; x += 1) {
      const targetX = x + dx;
      if (targetX < 0 || targetX >= cellWidth) continue;
      const sourceOffset = (y * cellWidth + x) * 4;
      const targetOffset = (targetY * cellWidth + targetX) * 4;
      frame[targetOffset] = cellBuffer[sourceOffset];
      frame[targetOffset + 1] = cellBuffer[sourceOffset + 1];
      frame[targetOffset + 2] = cellBuffer[sourceOffset + 2];
      frame[targetOffset + 3] = cellBuffer[sourceOffset + 3];
    }
  }

  return frame;
}

async function buildPetAtlas(poseDir, outputPath, contactSheetPath, jsonOutPath) {
  const composites = [];
  const used = {};

  for (let row = 0; row < rowSpecs.length; row += 1) {
    const [rowName, fallbacks, mirror] = rowSpecs[row];
    const posePath = findPose(poseDir, fallbacks);
    const needsMirror = mirror && !["run-left", "running-left"].includes(path.parse(posePath).name);
    const cell = await fitToCell(posePath, needsMirror);
    used[rowName] = posePath;

    for (let col = 0; col < atlasColumns; col += 1) {
      composites.push({
        input: shiftedFrame(cell, col, rowName),
        raw: { width: cellWidth, height: cellHeight, channels: 4 },
        left: col * cellWidth,
        top: row * cellHeight
      });
    }
  }

  mkdirSync(path.dirname(outputPath), { recursive: true });
  const atlas = sharp({
    create: {
      width: atlasWidth,
      height: atlasHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  }).composite(composites);

  const pngBuffer = await atlas.png().toBuffer();
  await sharp(pngBuffer).webp({ lossless: true, quality: 100 }).toFile(outputPath);
  if (contactSheetPath) {
    mkdirSync(path.dirname(contactSheetPath), { recursive: true });
    writeFileSync(contactSheetPath, pngBuffer);
  }

  const result = {
    ok: true,
    output: outputPath,
    width: atlasWidth,
    height: atlasHeight,
    cell: [cellWidth, cellHeight],
    rows: rowSpecs.map(([rowName]) => rowName),
    used
  };
  if (jsonOutPath) {
    mkdirSync(path.dirname(jsonOutPath), { recursive: true });
    writeFileSync(jsonOutPath, `${JSON.stringify(result, null, 2)}\n`);
  }
  return result;
}

async function writeInstallZip({ zipPath, petDir, id }) {
  const zip = new JSZip();
  const folder = zip.folder(id);
  folder.file("pet.json", readFileSync(path.join(petDir, "pet.json")));
  folder.file("spritesheet.webp", readFileSync(path.join(petDir, "spritesheet.webp")));
  folder.file("README.md", readFileSync(path.join(petDir, "README.md")));
  const content = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  writeFileSync(zipPath, content);
}

async function createPetPackage({ dataUrl, petId, displayName, styleNote }) {
  const id = cleanId(petId);
  const name = String(displayName || id).trim() || id;
  const jobId = randomUUID();
  const jobDir = path.join(jobsDir, jobId);
  const poseDir = path.join(jobDir, "poses");
  const petDir = path.join(jobDir, id);
  const qaDir = path.join(jobDir, "qa");
  mkdirSync(poseDir, { recursive: true });
  mkdirSync(petDir, { recursive: true });
  mkdirSync(qaDir, { recursive: true });

  const image = parseDataUrl(dataUrl);
  const sourcePath = path.join(jobDir, `source.${image.ext}`);
  const generatedSheet = path.join(jobDir, "generated-sprite-sheet.png");
  writeFileSync(sourcePath, image.buffer);

  const generation = await generateSpriteSheet({ sourcePath, mime: image.mime, outPath: generatedSheet, styleNote });

  if (generation.mode === "demo") {
    copyDemoPoses(poseDir);
  } else {
    await extractPosesFromSheet(generatedSheet, poseDir);
  }

  const atlasPath = path.join(petDir, "spritesheet.webp");
  await buildPetAtlas(poseDir, atlasPath, path.join(qaDir, "contact-sheet.png"), path.join(qaDir, "build.json"));

  const petJson = {
    id,
    displayName: name,
    description: `A custom Codex pet generated from an uploaded photo.`,
    spritesheetPath: "spritesheet.webp"
  };
  writeFileSync(path.join(petDir, "pet.json"), `${JSON.stringify(petJson, null, 2)}\n`);

  const installReadme = [
    `# ${name} Codex Pet`,
    "",
    "Install by copying this whole folder to:",
    "",
    "```text",
    `~/.codex/pets/${id}/`,
    "```",
    "",
    "The folder must contain exactly these runtime files:",
    "",
    "```text",
    "pet.json",
    "spritesheet.webp",
    "```",
    "",
    "Restart Codex after copying."
  ].join("\n");
  writeFileSync(path.join(petDir, "README.md"), installReadme);

  const zipPath = path.join(jobDir, `${id}-codex-pet.zip`);
  await writeInstallZip({ zipPath, petDir, id });

  return {
    jobId,
    petId: id,
    displayName: name,
    mode: generation.mode,
    generation,
    downloads: {
      zip: `/jobs/${jobId}/${id}-codex-pet.zip`,
      petJson: `/jobs/${jobId}/${id}/pet.json`,
      spritesheet: `/jobs/${jobId}/${id}/spritesheet.webp`,
      contactSheet: `/jobs/${jobId}/qa/contact-sheet.png`,
      generatedSheet: existsSync(generatedSheet) ? `/jobs/${jobId}/generated-sprite-sheet.png` : null
    }
  };
}

async function handleGenerate(req, res) {
  try {
    const body = JSON.parse(await readBody(req));
    const quota = consumeGenerationQuota(req);
    if (!quota.ok) {
      sendJson(res, 429, {
        error: `Daily generation limit reached. Each person can generate up to ${quota.limit} pets per day. Please try again tomorrow.`,
        quota
      });
      return;
    }

    const result = await createPetPackage(body);
    sendJson(res, 200, { ...result, quota });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
}

function handleStatus(req, res) {
  const demoOnly = process.env.PETFORGE_DEMO_ONLY === "1";
  sendJson(res, 200, {
    hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
    demoOnly,
    canGenerateFromPhoto: Boolean(process.env.OPENAI_API_KEY) && !demoOnly,
    mode: demoOnly ? "demo" : process.env.OPENAI_API_KEY ? "openai" : "missing-key",
    imageModel: process.env.IMAGE_MODEL || "gpt-image-2",
    quota: getQuotaStatus(req)
  });
}

export async function appHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/api/status") {
    handleStatus(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/generate") {
    await handleGenerate(req, res);
    return;
  }

  if (url.pathname.startsWith("/jobs/")) {
    const filePath = path.normalize(path.join(jobsDir, url.pathname.replace("/jobs/", "")));
    if (!filePath.startsWith(jobsDir) || !existsSync(filePath)) {
      sendJson(res, 404, { error: "File not found" });
      return;
    }
    sendFile(res, filePath);
    return;
  }

  let filePath = path.join(publicDir, url.pathname === "/" ? "index.html" : url.pathname);
  if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
    filePath = path.join(publicDir, "index.html");
  }
  sendFile(res, filePath);
}

export default appHandler;

const server = createServer(appHandler);

mkdirSync(jobsDir, { recursive: true });
if (process.env.VERCEL !== "1") {
  server.listen(port, () => {
    console.log(`CodexPet Forge running at http://localhost:${port}`);
  });
}
