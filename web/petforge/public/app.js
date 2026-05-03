const form = document.querySelector("#forge-form");
const photo = document.querySelector("#photo");
const previewWrap = document.querySelector("#preview-wrap");
const preview = document.querySelector("#preview");
const result = document.querySelector("#result");
const errorBox = document.querySelector("#error");
const zipLink = document.querySelector("#download-zip");
const sheetLink = document.querySelector("#view-sheet");
const installPath = document.querySelector("#install-path");
const modeNote = document.querySelector("#mode-note");
const submit = form.querySelector("button[type='submit']");

let imageDataUrl = "";

function setStages(activeName) {
  const order = ["upload", "sprite", "atlas", "download"];
  const activeIndex = order.indexOf(activeName);
  document.querySelectorAll(".stage").forEach((stage) => {
    const index = order.indexOf(stage.dataset.stage);
    stage.classList.toggle("active", index === activeIndex);
    stage.classList.toggle("done", index < activeIndex);
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

photo.addEventListener("change", async () => {
  const file = photo.files?.[0];
  if (!file) return;
  imageDataUrl = await readFileAsDataUrl(file);
  preview.src = imageDataUrl;
  previewWrap.hidden = false;
  setStages("upload");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.hidden = true;
  result.hidden = true;

  if (!imageDataUrl) {
    errorBox.textContent = "Please upload a photo first.";
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
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Generation failed.");

    setStages("download");
    zipLink.href = data.downloads.zip;
    sheetLink.href = data.downloads.contactSheet;
    installPath.textContent = `~/.codex/pets/${data.petId}/`;
    modeNote.textContent = data.mode === "demo"
      ? "Demo mode: no OpenAI API key was found, so the bundled sample pet was packaged. Add OPENAI_API_KEY on the server for real photo generation."
      : "Generated from the uploaded photo with the image API.";
    result.hidden = false;
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
    setStages("upload");
  } finally {
    submit.disabled = false;
    submit.querySelector("span").textContent = "Generate pet package";
  }
});
