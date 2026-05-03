import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const publicDir = path.join(__dirname, "public");
const jobsDir = path.join(__dirname, "jobs");

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

const poseNames = ["idle", "run", "wave", "jump", "crouch", "thinking", "point", "celebrate"];

function findPython() {
  const candidates = [
    process.env.PYTHON,
    path.join(process.env.HOME || "", ".pyenv/shims/python3"),
    "/opt/homebrew/bin/python3",
    "/usr/local/bin/python3",
    "python3"
  ].filter(Boolean);

  for (const candidate of candidates) {
    const check = spawnSync(candidate, ["-c", "import PIL"], { stdio: "ignore" });
    if (check.status === 0) return candidate;
  }
  return "python3";
}

const python = findPython();

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
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
      if (body.length > 15 * 1024 * 1024) {
        reject(new Error("Upload is too large. Please use an image under 10 MB."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"], ...options });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} ${args.join(" ")} failed\n${stderr || stdout}`));
    });
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
    "Use a transparent background if possible, no labels, no text, no UI, no frame borders, crisp pixel-art edges.",
    styleNote ? `Additional style notes: ${styleNote}` : ""
  ].filter(Boolean).join("\n");
}

async function generateSpriteSheet({ sourcePath, mime, outPath, styleNote }) {
  if (!process.env.OPENAI_API_KEY || process.env.PETFORGE_DEMO_ONLY === "1") {
    return { mode: "demo", reason: "OPENAI_API_KEY is not set; using bundled sample poses." };
  }

  const input = readFileSync(sourcePath);
  const form = new FormData();
  form.set("model", "gpt-image-1.5");
  form.set("image", new File([input], path.basename(sourcePath), { type: mime }));
  form.set("prompt", petPrompt(styleNote));
  form.set("size", "1024x1024");
  form.set("quality", "low");
  form.set("background", "transparent");
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
  return { mode: "openai", model: "gpt-image-1.5" };
}

function copyDemoPoses(outDir) {
  const sampleDir = path.join(repoRoot, "assets/codexpet");
  for (const pose of poseNames) {
    copyFileSync(path.join(sampleDir, `${pose}.png`), path.join(outDir, `${pose}.png`));
  }
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
    await run(python, [
      path.join(__dirname, "scripts/extract_poses_from_sheet.py"),
      generatedSheet,
      "--out",
      poseDir,
      "--grid",
      "4x4"
    ]);
  }

  const atlasPath = path.join(petDir, "spritesheet.webp");
  await run(python, [
    path.join(repoRoot, "skills/codexpet-generator/scripts/build_pet_atlas.py"),
    poseDir,
    "--output",
    atlasPath,
    "--contact-sheet",
    path.join(qaDir, "contact-sheet.png"),
    "--json-out",
    path.join(qaDir, "build.json")
  ]);

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
  await run("zip", ["-qr", zipPath, id], { cwd: jobDir });

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
    const result = await createPetPackage(body);
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

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
});

mkdirSync(jobsDir, { recursive: true });
server.listen(port, () => {
  console.log(`CodexPet Forge running at http://localhost:${port}`);
});
