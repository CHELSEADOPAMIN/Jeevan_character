const form = document.querySelector("#forge-form");
const photo = document.querySelector("#photo");
const previewWrap = document.querySelector("#preview-wrap");
const preview = document.querySelector("#preview");
const result = document.querySelector("#result");
const errorBox = document.querySelector("#error");
const zipLink = document.querySelector("#download-zip");
const sheetLink = document.querySelector("#view-sheet");
const installPath = document.querySelector("#install-path");
const installPrompt = document.querySelector("#install-prompt");
const copyPrompt = document.querySelector("#copy-prompt");
const modeNote = document.querySelector("#mode-note");
const submit = form.querySelector("button[type='submit']");
const serverMode = document.querySelector("#server-mode");

let imageDataUrl = "";
let canGenerateFromPhoto = false;
const maxUploadBytes = 3 * 1024 * 1024;

function quotaText(quota) {
  if (!quota) return "";
  return ` Daily limit: ${quota.remaining}/${quota.limit} generations left today.`;
}

function hasQuota(quota) {
  return !quota || quota.remaining > 0;
}

function setStages(activeName) {
  const order = ["upload", "sprite", "atlas", "download"];
  const activeIndex = order.indexOf(activeName);
  document.querySelectorAll(".stage").forEach((stage) => {
    const index = order.indexOf(stage.dataset.stage);
    stage.classList.toggle("active", index === activeIndex);
    stage.classList.toggle("done", index < activeIndex);
  });
}

function buildInstallPrompt({ petId }) {
  const installDir = `~/.codex/pets/${petId}/`;
  return [
    "Please install this Codex pet for me using the attached zip file.",
    "",
    `Unzip it into: ${installDir}`,
    "Then set it as my Codex pet.",
    "",
    "After installing, verify that pet.json and spritesheet.webp are inside that folder."
  ].join("\n");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function readJsonOrError(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  if (response.status === 413 || text.startsWith("Request En")) {
    throw new Error("Uploaded image is too large for this hosted version. Please use a photo under 3 MB.");
  }
  throw new Error(text || `Request failed with status ${response.status}.`);
}

photo.addEventListener("change", async () => {
  const file = photo.files?.[0];
  if (!file) return;
  errorBox.hidden = true;

  if (file.size > maxUploadBytes) {
    imageDataUrl = "";
    photo.value = "";
    previewWrap.hidden = true;
    errorBox.textContent = "Please upload a photo under 3 MB.";
    errorBox.hidden = false;
    return;
  }

  imageDataUrl = await readFileAsDataUrl(file);
  preview.src = imageDataUrl;
  previewWrap.hidden = false;
  setStages("upload");
});

async function loadStatus() {
  try {
    const response = await fetch("/api/status");
    const status = await response.json();
    canGenerateFromPhoto = status.canGenerateFromPhoto;

    serverMode.classList.remove("ok", "warn");
    if (status.mode === "openai") {
      serverMode.textContent = `Photo generation is enabled with ${status.imageModel}. Uploaded images will be used to create a new pet.${quotaText(status.quota)}`;
      serverMode.classList.add(hasQuota(status.quota) ? "ok" : "warn");
      submit.disabled = !hasQuota(status.quota);
    } else if (status.mode === "demo") {
      serverMode.textContent = `Demo mode is on. The app will use the bundled sample character, not your uploaded photo.${quotaText(status.quota)}`;
      serverMode.classList.add("warn");
      submit.disabled = !hasQuota(status.quota);
    } else {
      serverMode.textContent = "Photo generation is not enabled. Add OPENAI_API_KEY to web/petforge/.env and restart the server.";
      serverMode.classList.add("warn");
      submit.disabled = true;
    }
  } catch {
    serverMode.textContent = "Could not read server status.";
    serverMode.classList.add("warn");
    submit.disabled = true;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.hidden = true;
  result.hidden = true;

  if (!imageDataUrl) {
    errorBox.textContent = "Please upload a photo first.";
    errorBox.hidden = false;
    return;
  }

  if (!canGenerateFromPhoto && !serverMode.textContent.includes("Demo mode")) {
    errorBox.textContent = "Photo generation is not enabled. Add OPENAI_API_KEY to web/petforge/.env and restart the server.";
    errorBox.hidden = false;
    return;
  }

  submit.disabled = true;
  submit.querySelector("span").textContent = "Generating...";
  setStages("sprite");

  try {
    const payload = {
      dataUrl: imageDataUrl,
      displayName: document.querySelector("#display-name").value,
      petId: document.querySelector("#pet-id").value,
      styleNote: document.querySelector("#style-note").value
    };

    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    setStages("atlas");
    const data = await readJsonOrError(response);
    if (!response.ok) throw new Error(data.error || "Generation failed.");

    setStages("download");
    zipLink.href = data.downloads.zip;
    sheetLink.href = data.downloads.contactSheet;
    installPath.textContent = `~/.codex/pets/${data.petId}/`;
    installPrompt.value = buildInstallPrompt({
      petId: data.petId
    });
    copyPrompt.textContent = "Copy prompt";
    modeNote.textContent = data.mode === "demo"
      ? "Demo mode: the bundled sample pet was packaged. Turn off PETFORGE_DEMO_ONLY and add OPENAI_API_KEY for real photo generation."
      : "Generated from the uploaded photo with the image API.";
    result.hidden = false;
    loadStatus();
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
    setStages("upload");
  } finally {
    submit.disabled = false;
    submit.querySelector("span").textContent = "Generate pet package";
  }
});

copyPrompt.addEventListener("click", async () => {
  if (!installPrompt.value) return;

  try {
    await navigator.clipboard.writeText(installPrompt.value);
    copyPrompt.textContent = "Copied";
    window.setTimeout(() => {
      copyPrompt.textContent = "Copy prompt";
    }, 1800);
  } catch {
    installPrompt.select();
    copyPrompt.textContent = "Select text";
  }
});

loadStatus();
