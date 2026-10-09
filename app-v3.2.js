import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0";

const MODEL_ID = "onnx-community/SmolLM2-135M-Instruct-ONNX";
const VISION_MODEL_ID = "Xenova/vit-gpt2-image-captioning";
const VENUS_BUILD = "v3.2-empty-chat-bottom-layout";
console.info("Venus AI build:", VENUS_BUILD);

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;

const THREADS_KEY = "venus-ai-web-v29-threads";
const ACTIVE_THREAD_KEY = "venus-ai-web-v29-active-thread";
const MEMORY_KEY = "venus-ai-web-v29-memory";
const SETTINGS_KEY = "venus-ai-web-v29-settings";
const LEGACY_MESSAGES_KEY = "venus-ai-web-v28-chat";

const STOPWORDS = new Set([
  "a","an","and","are","as","at","be","by","for","from","how","in","is","it",
  "of","on","or","that","the","this","to","was","were","what","when","where",
  "which","who","why","with","does","do","did","about"
]);

const $ = (id) => document.getElementById(id);
const chatScroll = $("chatScroll");
const promptEl = $("prompt");
const composer = $("composer");
const sendButton = $("sendButton");
const attachButton = $("attachButton");
const micButton = $("micButton");
const voiceButton = $("voiceButton");
const brandButton = $("brandButton");
const modelBadge = $("modelBadge");
const modelStrip = $("modelStrip");
const modelStripDot = $("modelStripDot");
const modelStripText = $("modelStripText");
const modelRetryButton = $("modelRetryButton");
const modelProgressBar = $("modelProgressBar");
const threadDrawer = $("threadDrawer");
const drawerBackdrop = $("drawerBackdrop");
const threadList = $("threadList");
const threadSearch = $("threadSearch");
const threadsButton = $("threadsButton");
const closeThreadsButton = $("closeThreadsButton");
const drawerNewChatButton = $("drawerNewChatButton");
const groundingToggle = $("groundingToggle");
const autoSpeakToggle = $("autoSpeakToggle");
const settingsModelStatus = $("settingsModelStatus");
const settingsRetryModel = $("settingsRetryModel");
const threadCountSetting = $("threadCountSetting");
const memoryCountSetting = $("memoryCountSetting");
const voiceSupportSetting = $("voiceSupportSetting");
const memoryList = $("memoryList");
const memoryForm = $("memoryForm");
const memoryInput = $("memoryInput");
const clearMemoryButton = $("clearMemoryButton");
const attachmentSheet = $("attachmentSheet");
const closeAttachmentSheet = $("closeAttachmentSheet");
const composerNotice = $("composerNotice");
const voiceOverlay = $("voiceOverlay");
const voiceStatusText = $("voiceStatusText");
const voiceStopButton = $("voiceStopButton");
const closeVoiceOverlay = $("closeVoiceOverlay");
const toast = $("toast");
const photoLibraryInput = $("photoLibraryInput");
const cameraCaptureInput = $("cameraCaptureInput");
const liveCameraOverlay = $("liveCameraOverlay");
const liveVideo = $("liveVideo");
const liveCanvas = $("liveCanvas");
const closeLiveCameraButton = $("closeLiveCameraButton");
const switchCameraButton = $("switchCameraButton");
const liveQuestion = $("liveQuestion");
const liveAnalyzeButton = $("liveAnalyzeButton");
const liveAutoButton = $("liveAutoButton");
const liveResponse = $("liveResponse");
const liveVisionStatus = $("liveVisionStatus");
const useLiveFrameButton = $("useLiveFrameButton");
const visionStatusSetting = $("visionStatusSetting");


let generator = null;
let modelLoadPromise = null;
let modelState = "starting";
let busy = false;
let activeTab = "chat";
let voiceConversationActive = false;
let voiceRecognition = null;
let toastTimer = null;
let visionCaptioner = null;
let visionLoadPromise = null;
let visionState = "idle";
let currentAttachment = null;
let liveStream = null;
let liveFacingMode = "environment";
let liveAutoTimer = null;
let liveAnalyzing = false;
let lastLiveFrame = null;


let settings = loadJSON(SETTINGS_KEY, {
  grounding: true,
  autoSpeak: false,
});

let memories = loadJSON(MEMORY_KEY, []);
let threads = loadJSON(THREADS_KEY, []);
let activeThreadId = localStorage.getItem(ACTIVE_THREAD_KEY);

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadJSON(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function createEmptyThread() {
  const now = Date.now();
  return {
    id: uid(),
    title: "New conversation",
    createdAt: now,
    updatedAt: now,
    messages: [],
    titleEdited: false,
  };
}

function migrateLegacyMessages() {
  if (threads.length) return;
  const legacy = loadJSON(LEGACY_MESSAGES_KEY, []);
  if (!Array.isArray(legacy) || !legacy.length) return;
  const thread = createEmptyThread();
  thread.title = inferThreadTitle(legacy);
  thread.messages = legacy.map((m) => ({
    id: uid(),
    role: m.role === "user" ? "user" : "assistant",
    content: String(m.content || ""),
    source: m.source || null,
    createdAt: Date.now(),
  }));
  thread.updatedAt = Date.now();
  threads = [thread];
  activeThreadId = thread.id;
  persistThreads();
}

function ensureActiveThread() {
  if (!threads.length) {
    const thread = createEmptyThread();
    threads = [thread];
    activeThreadId = thread.id;
    persistThreads();
    return thread;
  }
  let thread = threads.find((t) => t.id === activeThreadId);
  if (!thread) {
    thread = threads[0];
    activeThreadId = thread.id;
    localStorage.setItem(ACTIVE_THREAD_KEY, activeThreadId);
  }
  return thread;
}

function getActiveThread() {
  return ensureActiveThread();
}

function persistThreads() {
  saveJSON(THREADS_KEY, threads);
  if (activeThreadId) localStorage.setItem(ACTIVE_THREAD_KEY, activeThreadId);
  renderSettingsCounts();
}

function inferThreadTitle(messages) {
  const firstUser = messages.find((m) => m.role === "user" && String(m.content || "").trim());
  if (!firstUser) return "New conversation";
  const clean = firstUser.content.replace(/\s+/g, " ").trim();
  return clean.length > 48 ? `${clean.slice(0,45).trimEnd()}…` : clean;
}

function formatThreadStamp(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 3200);
}

function setModelStatus(state, text, progress = null) {
  modelState = state;
  settingsModelStatus.textContent =
    state === "ready" ? "LOCAL • READY" :
    state === "loading" ? "LOADING" :
    state === "failed" ? "LOAD FAILED" : "STARTING";

  modelBadge.className = "model-badge";
  modelStripDot.className = "status-dot";
  modelRetryButton.classList.add("hidden");

  if (state === "ready") {
    modelBadge.textContent = "LOCAL • READY";
    modelBadge.classList.add("good");
    modelStripDot.classList.add("good");
    modelStripText.textContent = text || "SmolLM2 135M is ready.";
    modelProgressBar.style.width = "100%";
    setTimeout(() => modelStrip.classList.add("ready"), 900);
  } else if (state === "loading") {
    modelBadge.textContent = "LOADING";
    modelStripDot.classList.add("busy");
    modelStripText.textContent = text || "Loading local AI…";
    modelStrip.classList.remove("ready");
  } else if (state === "failed") {
    modelBadge.textContent = "WEB • FACTS";
    modelBadge.classList.add("bad");
    modelStripDot.classList.add("bad");
    modelStripText.textContent = text || "Local AI failed to load. Factual mode still works.";
    modelRetryButton.classList.remove("hidden");
    modelStrip.classList.remove("ready");
  } else {
    modelBadge.textContent = "STARTING";
    modelStripDot.classList.add("busy");
    modelStripText.textContent = text || "Preparing Venus AI…";
  }

  if (typeof progress === "number") {
    modelProgressBar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
  }
}


async function unloadTextModel() {
  if (!generator) return;
  try {
    if (typeof generator.dispose === "function") {
      await generator.dispose();
    }
  } catch (error) {
    console.warn("Text model dispose warning:", error);
  }
  generator = null;
  modelLoadPromise = null;
}

async function unloadVisionModel() {
  if (!visionCaptioner) return;
  try {
    if (typeof visionCaptioner.dispose === "function") {
      await visionCaptioner.dispose();
    }
  } catch (error) {
    console.warn("Vision model dispose warning:", error);
  }
  visionCaptioner = null;
  visionLoadPromise = null;
  visionState = "idle";
  if (visionStatusSetting) visionStatusSetting.textContent = "On demand";
}

function visionProgressCallback(info) {
  if (typeof info?.progress === "number") {
    const pct = Math.max(0, Math.min(100, info.progress));
    modelProgressBar.style.width = `${pct}%`;
    const file = info?.file ? ` ${info.file}` : "";
    modelStripText.textContent = `Local Vision: ${info?.status || "Downloading"}${file} — ${Math.round(pct)}%`;
    if (liveVisionStatus) liveVisionStatus.textContent = `Loading Local Vision… ${Math.round(pct)}%`;
  } else if (info?.status) {
    const statusText = info?.file ? `${info.status}: ${info.file}` : info.status;
    modelStripText.textContent = `Local Vision: ${statusText}`;
    if (liveVisionStatus) liveVisionStatus.textContent = `Local Vision: ${statusText}`;
  }
}

async function loadVisionModel() {
  if (visionCaptioner) return visionCaptioner;
  if (visionLoadPromise) return visionLoadPromise;

  visionState = "loading";
  if (visionStatusSetting) visionStatusSetting.textContent = "Loading…";
  setModelStatus("loading", "Switching to Local Vision…", 0);

  visionLoadPromise = (async () => {
    // Free the text-generation session before loading vision. The model files
    // stay browser-cached, so Venus can restore text chat after photo analysis.
    await unloadTextModel();

    async function attemptLoad(attempt) {
      if (attempt === 2) {
        setModelStatus("loading", "Retrying Local Vision download…", 0);
      }
      return await pipeline(
        "image-to-text",
        VISION_MODEL_ID,
        {
          progress_callback: visionProgressCallback,
        }
      );
    }

    try {
      try {
        visionCaptioner = await attemptLoad(1);
      } catch (firstError) {
        const message = String(firstError?.message || firstError);
        if (/input stream|network|fetch|aborted|failed to fetch/i.test(message)) {
          await new Promise((resolve) => setTimeout(resolve, 1200));
          visionCaptioner = await attemptLoad(2);
        } else {
          throw firstError;
        }
      }

      visionState = "ready";
      if (visionStatusSetting) visionStatusSetting.textContent = "LOCAL • READY";
      modelBadge.textContent = "VISION • READY";
      modelBadge.className = "model-badge good";
      modelStripDot.className = "status-dot good";
      modelStripText.textContent = "Local Vision is ready.";
      modelProgressBar.style.width = "100%";
      if (liveVisionStatus) liveVisionStatus.textContent = "Local Vision ready";
      return visionCaptioner;
    } catch (error) {
      visionState = "failed";
      visionCaptioner = null;
      if (visionStatusSetting) visionStatusSetting.textContent = "Load failed";
      if (liveVisionStatus) liveVisionStatus.textContent = `Vision failed: ${String(error?.message || error)}`;
      setModelStatus("failed", `Local Vision failed: ${String(error?.message || error)}`);
      throw error;
    }
  })();

  try {
    return await visionLoadPromise;
  } finally {
    if (!visionCaptioner) visionLoadPromise = null;
  }
}

async function restoreTextModelAfterVision() {
  await unloadVisionModel();
  modelStrip.classList.remove("ready");
  setModelStatus("loading", "Restoring local chat model…", 0);
  try {
    await loadModel();
  } catch (error) {
    console.warn("Could not restore local chat model:", error);
  }
}

async function captionImage(dataUrl, keepVisionLoaded = false) {
  const pipe = await loadVisionModel();
  if (!pipe) throw new Error("Local Vision is unavailable.");

  if (liveVisionStatus) liveVisionStatus.textContent = "Analyzing frame locally…";
  const result = await pipe(dataUrl, {
    max_new_tokens: 48,
    do_sample: false,
  });

  let caption = "";
  if (Array.isArray(result)) {
    caption = result[0]?.generated_text || result[0]?.text || "";
  } else {
    caption = result?.generated_text || result?.text || "";
  }
  caption = cleanText(caption);

  if (!caption) throw new Error("Local Vision could not describe this image.");

  if (!keepVisionLoaded) {
    await restoreTextModelAfterVision();
  }

  return caption;
}

async function answerFromVisionCaption(caption, question) {
  const q = String(question || "").trim() || "What do you see in this photo?";

  // The image model is a local captioner. For simple "what do you see" requests,
  // returning the caption directly is more accurate than asking the tiny text
  // model to embellish it.
  if (/^(what do you see|describe (this|the) (photo|image|picture)|what'?s in (this|the) (photo|image|picture))/i.test(q)) {
    return `I can see ${caption.replace(/^[Aa]\s+/, "a ")}.`;
  }

  if (!generator) {
    try { await loadModel(); } catch {}
  }

  if (!generator) {
    return `Local Vision describes the image as: ${caption}`;
  }

  const result = await generator(
    [
      {
        role: "system",
        content: `You answer questions about a photo using ONLY the local visual description supplied to you.
Do not invent visual details. If the description does not contain enough information to answer, say you cannot tell from this local vision scan.
Be concise.`,
      },
      {
        role: "user",
        content: `Local visual description: ${caption}
Question: ${q}`,
      },
    ],
    {
      max_new_tokens: 64,
      do_sample: false,
      repetition_penalty: 1.12,
    }
  );

  const generated = result?.[0]?.generated_text;
  let finalText = "";
  if (Array.isArray(generated)) finalText = generated.at(-1)?.content || "";
  else if (typeof generated === "string") finalText = generated;

  return cleanText(finalText) || `Local Vision describes the image as: ${caption}`;
}

function progressCallback(info) {
  if (typeof info?.progress === "number") {
    const pct = Math.max(0, Math.min(100, info.progress));
    modelProgressBar.style.width = `${pct}%`;
    const file = info?.file ? ` ${info.file}` : "";
    modelStripText.textContent = `${info?.status || "Downloading"}${file} — ${Math.round(pct)}%`;
  } else if (info?.status) {
    modelStripText.textContent = info?.file ? `${info.status}: ${info.file}` : info.status;
  }
}

async function loadModel() {
  if (generator) return generator;
  if (modelLoadPromise) return modelLoadPromise;

  modelLoadPromise = (async () => {
    setModelStatus("loading", "Downloading SmolLM2 135M Instruct…", 0);

    async function attemptLoad(attempt) {
      if (attempt === 2) setModelStatus("loading", "Retrying local model download…", 0);
      return await pipeline("text-generation", MODEL_ID, {
        dtype: "q8",
        progress_callback: progressCallback,
      });
    }

    try {
      try {
        generator = await attemptLoad(1);
      } catch (firstError) {
        const message = String(firstError?.message || firstError);
        if (/input stream|network|fetch|aborted|failed to fetch/i.test(message)) {
          await new Promise((resolve) => setTimeout(resolve, 1200));
          generator = await attemptLoad(2);
        } else {
          throw firstError;
        }
      }
      setModelStatus("ready", "SmolLM2 135M Instruct is ready.", 100);
      return generator;
    } catch (error) {
      console.error(error);
      generator = null;
      setModelStatus("failed", `Local AI failed: ${String(error?.message || error)}`);
      throw error;
    }
  })();

  try {
    return await modelLoadPromise;
  } finally {
    if (!generator) modelLoadPromise = null;
  }
}

function looksCreative(text) {
  const q = text.trim().toLowerCase();

  // Explicit creative/action requests should always use the local model,
  // even if they contain factual-looking nouns such as "city", "planet",
  // "history", or "Venus".
  return /^(write|create|make|draft|compose|brainstorm|imagine|invent|design|develop|roleplay|rewrite|continue|finish)\b/.test(q)
    || /\b(short story|story|fiction|poem|song|script|scene|dialogue|character|brainstorm|creative writing|roleplay|imagine|fictional|make up)\b/.test(q);
}

function looksFactual(text) {
  const q = text.trim().toLowerCase();

  if (looksCreative(q)) {
    return false;
  }

  // Direct questions and explicit fact-seeking language use grounded mode.
  if (/^(what|who|when|where|which|is|are|was|were|did|does|do|how many|how much|tell me about|define|explain)\b/.test(q)) {
    return true;
  }

  // Superlatives and common fact requests that may not begin with a question word.
  return /\b(largest|smallest|closest|capital of|born in|invented by|discovered by|how old|population of|distance from)\b/.test(q);
}

function tokens(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function splitSentences(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
}

function questionIntent(q) {
  const t = q.toLowerCase();

  const largest = /\blargest\b|\bbiggest\b/.test(t);
  const smallest = /\bsmallest\b/.test(t);
  const closest = /\bclosest\b|\bnearest\b/.test(t);
  const planet = /\bplanet\b|\bplanets\b/.test(t);
  const sun = /\bsun\b/.test(t);
  const solarSystem = /\bsolar system\b/.test(t);

  return {
    largest,
    smallest,
    closest,
    planet,
    sun,
    solarSystem,
    firstFromSun: closest && planet && sun,
    largestPlanet: largest && planet && (solarSystem || sun),
    smallestPlanet: smallest && planet && (solarSystem || sun),
    gasVsRocky: /\bgas giant\b/.test(t) && /\brocky\b|\bterrestrial\b/.test(t),
    venus: /\bvenus\b/.test(t),
    whatIs: /^what\s+(?:is|are)\b/.test(t),
  };
}

function titleQualityScore(title, question, isDisambiguation = false) {
  const t = String(title || "").toLowerCase();
  const q = String(question || "").toLowerCase();
  let score = 0;

  if (isDisambiguation) score -= 100;

  const badTitleSignals = [
    "hypothetical",
    "fictional",
    "list of",
    "in situ",
    "investigation",
    "mission",
    "missions",
    "concept",
    "proposed",
    "timeline",
    "history of",
  ];

  for (const signal of badTitleSignals) {
    if (t.includes(signal)) score -= 24;
  }

  const qTokens = tokens(q);
  const titleTokens = tokens(t);

  for (const tok of qTokens) {
    if (titleTokens.includes(tok)) score += 4;
  }

  if (q.includes("venus") && t === "venus") score += 40;
  if (q.includes("mercury") && t === "mercury (planet)") score += 40;
  if (q.includes("jupiter") && t === "jupiter") score += 40;

  if (q.includes("planet") && t.includes("planet")) score += 4;
  if (q.includes("solar system") && t === "solar system") score += 4;

  return score;
}


function sentenceScore(sentence, question, candidateTitle, candidateRank, queryIndex = 99, isDisambiguation = false) {
  const lower = sentence.toLowerCase();
  const qTokens = tokens(question);
  const intent = questionIntent(question);

  let score = -candidateRank * 0.25 - queryIndex * 0.8 + titleQualityScore(candidateTitle, question, isDisambiguation);

  // A request for "largest" must not be satisfied by "second largest", etc.
  if (intent.largestPlanet) {
    if (/\bsecond[- ]largest\b|\bthird[- ]largest\b|\bfourth[- ]largest\b|\bone of the largest\b/.test(lower)) {
      score -= 60;
    }
  }

  if (intent.smallestPlanet) {
    if (/\bsecond[- ]smallest\b|\bthird[- ]smallest\b|\bone of the smallest\b/.test(lower)) {
      score -= 60;
    }
  }

  for (const tok of qTokens) {
    if (lower.includes(tok)) score += 2;
  }

  if (intent.largest && /\blargest\b|\bbiggest\b/.test(lower)) score += 12;
  if (intent.smallest && /\bsmallest\b/.test(lower)) score += 12;
  if (intent.closest && /\bclosest\b|\bnearest\b/.test(lower)) score += 12;

  if (intent.largestPlanet) {
    if (/\blargest planet\b/.test(lower)) score += 30;
    if (/\bplanet\b/.test(lower) && /\blargest\b|\bbiggest\b/.test(lower)) score += 12;
    if (/\bjupiter\b/.test(lower) && /\blargest\b/.test(lower)) score += 8;
  }

  if (intent.smallestPlanet) {
    if (/\bsmallest planet\b/.test(lower)) score += 30;
    if (/\bplanet\b/.test(lower) && /\bsmallest\b/.test(lower)) score += 12;
  }

  if (intent.firstFromSun) {
    if (/\bclosest planet to the sun\b/.test(lower)) score += 30;
    if (/\bfirst planet from the sun\b/.test(lower)) score += 30;
    if (/\bmercury\b/.test(lower) && /\bclosest\b|\bfirst\b/.test(lower)) score += 10;
  }

  if (intent.firstFromSun && /first planet from the sun|closest planet to the sun/.test(lower)) {
    score += 18;
  }

  if (intent.gasVsRocky && /\bterrestrial planet\b|\brocky planet\b/.test(lower)) {
    score += 20;
  }

  if (intent.venus && candidateTitle.toLowerCase() === "venus") score += 10;

  // Prefer concise definitional sentences.
  if (/\bis (?:a|the)\b|\bare (?:a|the)\b/.test(lower)) score += 2;
  if (sentence.length > 350) score -= 2;

  return score;
}

function buildSearchQueries(question) {
  const intent = questionIntent(question);
  const q = question.trim();
  const queries = [];

  // Exact/phrase-targeted searches first for superlative questions.
  if (intent.largestPlanet) {
    queries.push('"largest planet" "Solar System"');
    queries.push('largest planet Solar System');
  }

  if (intent.smallestPlanet) {
    queries.push('"smallest planet" "Solar System"');
    queries.push('smallest planet Solar System');
  }

  if (intent.firstFromSun) {
    queries.push('"closest planet to the Sun"');
    queries.push('"first planet from the Sun"');
  }

  if (intent.gasVsRocky && intent.venus) {
    queries.push('"Venus" "terrestrial planet"');
    queries.push('"Venus" rocky planet');
  }

  if (intent.whatIs && intent.venus) {
    queries.push('Venus planet');
  }

  queries.push(q);

  return [...new Set(queries)];
}

async function wikipediaCandidates(query) {
  const queries = buildSearchQueries(query);
  const mergedHits = [];
  const seenTitles = new Set();

  for (let qIndex = 0; qIndex < queries.length; qIndex++) {
    const searchParams = new URLSearchParams({
      action: "query",
      list: "search",
      srsearch: queries[qIndex],
      srlimit: qIndex === 0 ? "10" : "6",
      srnamespace: "0",
      srprop: "snippet",
      format: "json",
      origin: "*",
    });

    const searchResponse = await fetch(
      `https://en.wikipedia.org/w/api.php?${searchParams.toString()}`,
      { mode: "cors" }
    );

    if (!searchResponse.ok) {
      continue;
    }

    const searchData = await searchResponse.json();
    const hits = searchData?.query?.search || [];

    for (let rank = 0; rank < hits.length; rank++) {
      const hit = hits[rank];
      if (seenTitles.has(hit.title)) continue;

      seenTitles.add(hit.title);
      mergedHits.push({
        ...hit,
        queryIndex: qIndex,
        rank,
      });
    }
  }

  if (!mergedHits.length) return [];

  const titles = mergedHits.slice(0, 20).map((h) => h.title);

  const extractParams = new URLSearchParams({
    action: "query",
    prop: "extracts|pageprops",
    exintro: "1",
    explaintext: "1",
    redirects: "1",
    titles: titles.join("|"),
    format: "json",
    origin: "*",
  });

  const extractResponse = await fetch(
    `https://en.wikipedia.org/w/api.php?${extractParams.toString()}`,
    { mode: "cors" }
  );

  if (!extractResponse.ok) {
    throw new Error(`Wikipedia extracts returned HTTP ${extractResponse.status}`);
  }

  const extractData = await extractResponse.json();
  const pages = Object.values(extractData?.query?.pages || {});
  const pageByTitle = new Map(
    pages.map((p) => [p.title, {
      extract: p.extract || "",
      isDisambiguation:
        Object.prototype.hasOwnProperty.call(
          p.pageprops || {},
          "disambiguation"
        ),
    }])
  );

  return mergedHits.slice(0, 20).map((hit) => {
    const page = pageByTitle.get(hit.title) || {
      extract: "",
      isDisambiguation: false,
    };

    return {
      title: hit.title,
      snippet: String(hit.snippet || "").replace(/<[^>]+>/g, " "),
      extract: page.extract,
      isDisambiguation: page.isDisambiguation,
      rank: hit.rank,
      queryIndex: hit.queryIndex,
    };
  }).filter((x) => x.extract && !x.isDisambiguation);
}


function extractAnswerEntity(question, answer, sourceTitle) {
  const q = String(question || "").toLowerCase();
  const a = String(answer || "");
  const intent = questionIntent(question);

  // Astronomy questions get deterministic entity extraction first.
  // This prevents greedy generic regexes from extracting phrases like
  // "two thirds that of Jupiter" or "Atmosphere of Mercury".
  const PLANETS = [
    "Mercury",
    "Venus",
    "Earth",
    "Mars",
    "Jupiter",
    "Saturn",
    "Uranus",
    "Neptune",
  ];

  if (intent.venus) {
    return "Venus";
  }

  if (intent.largestPlanet) {
    // Prefer a planet named directly beside the "largest planet" relation.
    for (const planet of PLANETS) {
      const escaped = planet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      const directPatterns = [
        new RegExp(`\\b${escaped}\\b[^.!?]{0,80}\\blargest planet\\b`, "i"),
        new RegExp(`\\blargest planet\\b[^.!?]{0,80}\\b${escaped}\\b`, "i"),
        new RegExp(`\\bafter\\s+${escaped}\\b`, "i"),
      ];

      if (directPatterns.some((rx) => rx.test(a))) {
        return planet;
      }
    }

    // Among the eight planets, Jupiter is the entity in a supporting answer
    // whenever the retrieved text explicitly names Jupiter for this relation.
    if (/\bJupiter\b/i.test(a)) return "Jupiter";
  }

  if (intent.smallestPlanet) {
    for (const planet of PLANETS) {
      const escaped = planet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (
        new RegExp(`\\b${escaped}\\b[^.!?]{0,80}\\bsmallest planet\\b`, "i").test(a) ||
        new RegExp(`\\bsmallest planet\\b[^.!?]{0,80}\\b${escaped}\\b`, "i").test(a)
      ) {
        return planet;
      }
    }
    if (/\bMercury\b/i.test(a)) return "Mercury";
  }

  if (intent.firstFromSun) {
    if (/\bMercury\b/i.test(a)) return "Mercury";

    for (const planet of PLANETS) {
      const escaped = planet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (
        new RegExp(`\\b${escaped}\\b[^.!?]{0,100}\\bclosest planet to the sun\\b`, "i").test(a) ||
        new RegExp(`\\bclosest planet to the sun\\b[^.!?]{0,100}\\b${escaped}\\b`, "i").test(a)
      ) {
        return planet;
      }
    }
  }

  // For other planet-related questions, prefer an actual planet name appearing
  // in the question or answer over a peripheral source title.
  if (intent.planet || /\bplanet\b/i.test(question)) {
    for (const planet of PLANETS) {
      const rx = new RegExp(`\\b${planet}\\b`, "i");
      if (rx.test(q) || rx.test(a)) return planet;
    }
  }

  // Generic comparative entity extraction for non-planet topics.
  // Use case-sensitive matching so lowercase filler words are not swallowed.
  let m = a.match(
    /\b([A-Z][A-Za-z0-9'’.-]*(?:\s+[A-Z][A-Za-z0-9'’.-]*){0,3})\s+is\s+the\s+(?:largest|smallest|closest)\b/
  );
  if (m) return m[1].trim();

  m = a.match(
    /\b([A-Z][A-Za-z0-9'’.-]*(?:\s+[A-Z][A-Za-z0-9'’.-]*){0,3}),\s+(?:the\s+)?(?:largest|smallest|closest)\b/
  );
  if (m) return m[1].trim();

  // Only use a source title as a final fallback if it looks like a simple
  // canonical article rather than a peripheral/subtopic page.
  const source = String(sourceTitle || "").trim();

  if (
    source &&
    !/disambiguation|hypothetical|atmosphere of|mission|investigation|in situ|list of|solar system|terrestrial planet/i.test(source)
  ) {
    return source.replace(/\s*\(planet\)\s*$/i, "").trim();
  }

  return null;
}

async function fetchCanonicalEntitySource(entity, question) {
  if (!entity) return null;

  const q = String(question || "").toLowerCase();
  const cleanEntity = String(entity).trim();

  // Do not search again after identifying an entity. Ask Wikipedia directly
  // for the most likely canonical title(s). This avoids landing on peripheral
  // pages such as exoplanets, atmospheres, or disambiguation pages.
  const titleCandidates = [];

  if (/\bplanet\b/.test(q)) {
    if (/^mercury$/i.test(cleanEntity)) {
      titleCandidates.push("Mercury (planet)");
    } else {
      titleCandidates.push(cleanEntity);
      titleCandidates.push(`${cleanEntity} (planet)`);
    }
  } else {
    titleCandidates.push(cleanEntity);
  }

  // Known astronomy canonical titles.
  if (/^jupiter$/i.test(cleanEntity)) {
    titleCandidates.unshift("Jupiter");
  }
  if (/^venus$/i.test(cleanEntity)) {
    titleCandidates.unshift("Venus");
  }

  const uniqueTitles = [...new Set(titleCandidates)];

  for (const title of uniqueTitles) {
    const params = new URLSearchParams({
      action: "query",
      prop: "extracts|pageprops",
      exintro: "1",
      explaintext: "1",
      redirects: "1",
      titles: title,
      format: "json",
      origin: "*",
    });

    const response = await fetch(
      `https://en.wikipedia.org/w/api.php?${params.toString()}`,
      { mode: "cors" }
    );

    if (!response.ok) continue;

    const data = await response.json();
    const pages = Object.values(data?.query?.pages || {});

    for (const p of pages) {
      if (!p?.extract || p.missing !== undefined) continue;

      const isDisambiguation =
        Object.prototype.hasOwnProperty.call(
          p.pageprops || {},
          "disambiguation"
        );

      if (isDisambiguation) continue;

      return {
        title: p.title,
        extract: p.extract,
      };
    }
  }

  return null;
}

function canonicalSentenceForQuestion(page, question, entity) {
  if (!page?.extract) return null;

  const sentences = splitSentences(page.extract);
  const intent = questionIntent(question);
  const cleanEntity =
    String(entity || page.title || "")
      .replace(/\s*\(planet\)\s*$/i, "")
      .trim();

  if (intent.largestPlanet) {
    // Canonical planet pages commonly say "the largest in the Solar System"
    // rather than the exact phrase "largest planet".
    const s = sentences.find((x) =>
      /\blargest planet\b/i.test(x) ||
      /\bthe largest in the solar system\b/i.test(x) ||
      /\blargest in the solar system\b/i.test(x)
    );

    if (s) {
      return `${cleanEntity} is the largest planet in the Solar System. ${s.trim()}`;
    }

    // If the canonical Jupiter page was resolved, the entity itself is enough
    // to state the relation cleanly.
    if (/^jupiter$/i.test(cleanEntity)) {
      return "Jupiter is the largest planet in the Solar System.";
    }
  }

  if (intent.smallestPlanet) {
    const s = sentences.find((x) =>
      /\bsmallest planet\b/i.test(x) ||
      /\bsmallest in the solar system\b/i.test(x)
    );

    if (s) {
      return `${cleanEntity} is the smallest planet in the Solar System. ${s.trim()}`;
    }
  }

  if (intent.firstFromSun) {
    const s = sentences.find((x) =>
      /\bclosest planet to the sun\b/i.test(x) ||
      /\bfirst planet from the sun\b/i.test(x) ||
      /\binnermost planet\b/i.test(x)
    );

    if (s) {
      return `${cleanEntity} is the closest planet to the Sun. ${s.trim()}`;
    }

    if (/^mercury$/i.test(cleanEntity)) {
      return "Mercury is the closest planet to the Sun.";
    }
  }

  if (intent.gasVsRocky && intent.venus) {
    const s = sentences.find((x) =>
      /\bterrestrial planet\b|\brocky planet\b/i.test(x)
    );

    if (s) {
      return `Venus is a terrestrial (rocky) planet, not a gas giant. ${s.trim()}`;
    }

    return "Venus is a terrestrial (rocky) planet, not a gas giant.";
  }

  if (intent.whatIs && intent.venus) {
    return sentences.slice(0, 2).join(" ").trim();
  }

  return sentences.slice(0, 2).join(" ").trim();
}

function buildDirectAnswer(question, candidates) {
  if (!candidates.length) return null;

  const intent = questionIntent(question);

  // For "what is Venus?" prefer the exact canonical Venus article.
  if (intent.whatIs && intent.venus) {
    const venus = candidates.find((c) => c.title.toLowerCase() === "venus");
    if (venus) {
      const s = splitSentences(venus.extract);
      return {
        answer: s.slice(0, 2).join(" ").slice(0, 850).trim(),
        source: venus.title,
      };
    }
  }

  // For Venus classification, prefer a direct sentence from the canonical Venus page
  // before looking at broader or mission-related articles.
  if (intent.gasVsRocky && intent.venus) {
    const venus = candidates.find((c) => c.title.toLowerCase() === "venus");
    if (venus) {
      const direct = splitSentences(venus.extract).find((sentence) =>
        /\bterrestrial planet\b|\brocky planet\b/i.test(sentence)
      );

      if (direct) {
        return {
          answer: `Venus is a terrestrial (rocky) planet, not a gas giant. ${direct}`.slice(0, 900),
          source: venus.title,
        };
      }
    }
  }

  // Score every sentence across the candidate set.
  const scored = [];

  for (const c of candidates) {
    const sentences = splitSentences(c.extract);
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      if (sentence.length < 18) continue;

      scored.push({
        sentence,
        source: c.title,
        score: sentenceScore(sentence, question, c.title, c.rank, c.queryIndex, c.isDisambiguation) - i * 0.05,
      });
    }

    if (c.snippet) {
      scored.push({
        sentence: c.snippet.trim(),
        source: c.title,
        score: sentenceScore(c.snippet, question, c.title, c.rank, c.queryIndex, c.isDisambiguation) + 1,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return null;

  // Prefer a sentence that explicitly states the relation asked for.
  if (intent.largestPlanet) {
    const explicit = scored.find((x) =>
      !/\bsecond[- ]largest\b|\bthird[- ]largest\b|\bfourth[- ]largest\b|\bone of the largest\b/i.test(x.sentence) &&
      (
        /\blargest planet\b/i.test(x.sentence) ||
        (/\bplanet\b/i.test(x.sentence) && /\blargest\b|\bbiggest\b/i.test(x.sentence))
      )
    );

    if (explicit) {
      return {
        answer: explicit.sentence.slice(0, 900).trim(),
        source: explicit.source,
      };
    }

    const jupiter = candidates.find((c) => c.title.toLowerCase() === "jupiter");
    if (jupiter) {
      const sentence = splitSentences(jupiter.extract).find((s) =>
        /largest planet/i.test(s)
      );
      if (sentence) {
        return {
          answer: sentence.trim(),
          source: jupiter.title,
        };
      }
    }
  }

  if (intent.smallestPlanet) {
    const explicit = scored.find((x) =>
      /\bsmallest planet\b/i.test(x.sentence) ||
      (/\bplanet\b/i.test(x.sentence) && /\bsmallest\b/i.test(x.sentence))
    );

    if (explicit) {
      return {
        answer: explicit.sentence.slice(0, 900).trim(),
        source: explicit.source,
      };
    }
  }

  if (intent.firstFromSun) {
    const explicit = scored.find((x) =>
      !/hypothetical|fictional|disambiguation/i.test(x.source) &&
      (
        /\bclosest planet to the sun\b/i.test(x.sentence) ||
        /\bfirst planet from the sun\b/i.test(x.sentence)
      )
    ) || scored.find((x) =>
      /\bclosest planet to the sun\b/i.test(x.sentence) ||
      /\bfirst planet from the sun\b/i.test(x.sentence)
    );

    if (explicit) {
      const sourceName = explicit.source.replace(/\s*\(planet\)\s*$/i, "");
      return {
        answer: `${sourceName} is the closest planet to the Sun. ${explicit.sentence}`.slice(0, 900),
        source: explicit.source,
      };
    }

    const mercury = candidates.find((c) =>
      c.title.toLowerCase() === "mercury (planet)"
    );
    if (mercury) {
      const sentence = splitSentences(mercury.extract).find((s) =>
        /first planet from the sun|closest planet to the sun/i.test(s)
      );
      if (sentence) {
        return {
          answer: `Mercury is the closest planet to the Sun. ${sentence}`.slice(0, 900),
          source: mercury.title,
        };
      }
    }
  }

  // Classification wording: if the strongest source sentence says "terrestrial planet",
  // make the equivalence explicit without inventing a new fact.
  if (intent.gasVsRocky && /\bterrestrial planet\b/i.test(best.sentence)) {
    return {
      answer: `Venus is a terrestrial (rocky) planet, not a gas giant. ${best.sentence}`,
      source: best.source,
    };
  }

  if (intent.gasVsRocky && intent.venus) {
    const venus = candidates.find((c) => c.title.toLowerCase() === "venus");
    if (venus) {
      return {
        answer: "Venus is a terrestrial (rocky) planet, not a gas giant.",
        source: venus.title,
      };
    }
  }

  // Closest-to-Sun wording: a source saying "first planet from the Sun" is a direct answer.
  if (intent.firstFromSun && /first planet from the sun/i.test(best.sentence)) {
    const title = best.source;
    return {
      answer: `${title} is the closest planet to the Sun. ${best.sentence}`,
      source: best.source,
    };
  }

  return {
    answer: best.sentence.slice(0, 900).trim(),
    source: best.source,
  };
}




function cleanText(text) {
  return String(text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<\/?think>/gi, "")
    .trim();
}


async function imageSourceToResizedDataUrl(source, maxEdge = 960, quality = 0.82) {
  const image = new Image();
  image.decoding = "async";

  const src = source instanceof File ? URL.createObjectURL(source) : String(source);
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("This browser could not decode that image."));
      image.src = src;
    });

    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) throw new Error("The selected image has no usable dimensions.");

    const scale = Math.min(1, maxEdge / Math.max(width, height));
    const outW = Math.max(1, Math.round(width * scale));
    const outH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.drawImage(image, 0, 0, outW, outH);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    if (source instanceof File) URL.revokeObjectURL(src);
  }
}

async function createAttachmentFromFile(file, sourceLabel) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showToast("Please choose an image file.");
    return;
  }

  try {
    closeAttachment();
    composerNotice.classList.remove("hidden");
    composerNotice.textContent = "Preparing photo locally…";

    const dataUrl = await imageSourceToResizedDataUrl(file, 960, 0.82);
    const previewDataUrl = await imageSourceToResizedDataUrl(dataUrl, 480, 0.68);

    currentAttachment = {
      id: uid(),
      type: "image",
      dataUrl,
      previewDataUrl,
      name: file.name || "photo.jpg",
      source: sourceLabel,
    };

    renderAttachmentPreview();
    promptEl.placeholder = "Ask Venus about this photo…";
    promptEl.focus();

    // Start downloading Local Vision in the background. It is intentionally
    // on-demand instead of part of normal page startup.
    loadVisionModel().catch(() => {});
  } catch (error) {
    currentAttachment = null;
    renderAttachmentPreview();
    showToast(`Could not prepare photo: ${String(error?.message || error)}`);
  }
}

function renderAttachmentPreview() {
  if (!currentAttachment) {
    composerNotice.classList.add("hidden");
    composerNotice.innerHTML = "";
    promptEl.placeholder = "Ask Venus AI anything…";
    return;
  }

  composerNotice.classList.remove("hidden");
  composerNotice.innerHTML = `
    <div class="attachment-preview-web">
      <img src="${currentAttachment.previewDataUrl}" alt="Attached photo">
      <div class="attachment-preview-copy">
        <strong>Photo attached</strong>
        <small>${visionState === "ready" ? "Local Vision is ready." : "Local Vision will analyze this photo when sent."}</small>
      </div>
      <button id="removeCurrentAttachment" type="button" aria-label="Remove attachment">×</button>
    </div>
  `;
  $("removeCurrentAttachment")?.addEventListener("click", () => {
    currentAttachment = null;
    renderAttachmentPreview();
  });
}

function captureVideoFrame(video, maxEdge = 960, quality = 0.82) {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) throw new Error("Camera frame is not ready yet.");

  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const outW = Math.max(1, Math.round(width * scale));
  const outH = Math.max(1, Math.round(height * scale));

  liveCanvas.width = outW;
  liveCanvas.height = outH;
  const ctx = liveCanvas.getContext("2d", { alpha: false });
  ctx.drawImage(video, 0, 0, outW, outH);
  return liveCanvas.toDataURL("image/jpeg", quality);
}

function normalizeDictation(text) {
  const clean = String(text || "").trim().replace(/\s+/g, " ");
  if (!clean) return "";
  const capitalized = clean.charAt(0).toUpperCase() + clean.slice(1);
  if (/[.!?]$/.test(capitalized)) return capitalized;
  const questionStart = /^(what|when|where|why|who|which|how|is|are|am|was|were|do|does|did|can|could|will|would|should|have|has|may|might)\b/i;
  return `${capitalized}${questionStart.test(capitalized) ? "?" : "."}`;
}

function currentSystemPrompt() {
  const memoryText = memories.length
    ? `

Information the user explicitly asked you to remember locally:
${memories.map((m) => `- ${m.text}`).join("\n")}`
    : "";

  return `You are Venus AI, a friendly private local AI assistant.

Rules:
- Answer the user's actual message directly.
- Never invent appointments, schedules, dates, missed messages, people, relationships, events, or personal history.
- Never claim the user previously said something unless it is clearly present in the supplied conversation.
- If you do not know a personal fact, do not guess it.
- For casual conversation, sound natural and friendly and keep the reply to 1-3 sentences.
- For creative writing, write coherent prose that follows the requested format and subject.
- Avoid unnecessary repetition.
- Do not turn prose requests into poetry unless asked.
- Do not speak as a planet or object unless specifically asked.
- Do not expose hidden reasoning or scratch work.
- If uncertain about a factual claim, say so.${memoryText}`;
}

async function getFactualAnswer(userText) {
  setModelStatus(modelState === "ready" ? "ready" : modelState, "Finding a canonical Wikipedia answer…");

  const candidates = await wikipediaCandidates(userText);
  const result = buildDirectAnswer(userText, candidates);
  if (!result?.answer) throw new Error("No direct Wikipedia answer was found.");

  const entity = extractAnswerEntity(userText, result.answer, result.source);
  let finalAnswer = result.answer;
  let finalSource = result.source;

  if (entity) {
    try {
      const canonical = await fetchCanonicalEntitySource(entity, userText);
      if (canonical) {
        const canonicalAnswer = canonicalSentenceForQuestion(canonical, userText, entity);
        if (canonicalAnswer) {
          finalAnswer = canonicalAnswer.slice(0, 900);
          finalSource = canonical.title;
        }
      }
    } catch (error) {
      console.warn("Canonical source lookup failed:", error);
    }
  }

  if (generator) setModelStatus("ready", "SmolLM2 135M Instruct is ready.", 100);
  return { text: finalAnswer, source: finalSource };
}

async function getLocalAnswer(userText) {
  if (!generator) {
    try { await loadModel(); } catch {}
  }
  if (!generator) throw new Error("The local creative model is not available on this device.");

  const thread = getActiveThread();

  // Tiny local models can compound their own mistakes when too much generated
  // history is fed back into them. Keep only a very small, clean context window.
  const cleanHistory = thread.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .filter((m) => m.content && m.content !== "Thinking…")
    .filter((m) => !String(m.content).startsWith("Venus AI error:"))
    .slice(-4)
    .map((m) => ({
      role: m.role,
      content: String(m.content).slice(0, 500),
    }));

  const chatMessages = [
    { role: "system", content: currentSystemPrompt() },
    ...cleanHistory,
  ];

  const creative = looksCreative(userText);

  const generationOptions = creative
    ? {
        max_new_tokens: 88,
        do_sample: true,
        temperature: 0.68,
        top_p: 0.84,
        top_k: 28,
        repetition_penalty: 1.14,
      }
    : {
        max_new_tokens: 56,
        do_sample: false,
        repetition_penalty: 1.12,
      };

  const result = await generator(chatMessages, generationOptions);

  const generated = result?.[0]?.generated_text;
  let finalText = "";
  if (Array.isArray(generated)) finalText = generated.at(-1)?.content || "";
  else if (typeof generated === "string") finalText = generated;

  finalText = cleanText(finalText);
  if (!finalText) throw new Error("The local model returned an empty response.");
  return finalText;
}

function appendMessage(role, content, source = null, extra = {}) {
  const thread = getActiveThread();
  const message = { id: uid(), role, content, source, createdAt: Date.now(), ...extra };
  thread.messages.push(message);
  thread.updatedAt = Date.now();
  if (!thread.titleEdited) thread.title = inferThreadTitle(thread.messages);
  persistThreads();
  return message;
}

function updateMessage(id, updates) {
  const thread = getActiveThread();
  const message = thread.messages.find((m) => m.id === id);
  if (!message) return;
  Object.assign(message, updates);
  thread.updatedAt = Date.now();
  persistThreads();
}

function speakText(text, onEnd = null) {
  if (!("speechSynthesis" in window)) {
    showToast("Read-aloud is not supported by this browser.");
    if (onEnd) onEnd();
    return;
  }
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(String(text || ""));
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  if (onEnd) utterance.onend = onEnd;
  utterance.onerror = () => onEnd && onEnd();
  speechSynthesis.speak(utterance);
}


function normalizedSmallTalk(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^\w\s'?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function smallTalkReply(text) {
  const q = normalizedSmallTalk(text);

  if (/^(hi|hello|hey|hey venus|hi venus|hello venus)(\s+(there|venus))?[!?.,\s]*$/.test(q)) {
    return "Hey! I’m here and ready to help. What’s on your mind?";
  }

  if (/^(hey|hi|hello)(\s+venus)?\s+(how'?s it going|how are you|how are you doing)(\s+today)?[!?.,\s]*$/.test(q)
      || /^(how'?s it going|how are you|how are you doing)(\s+today)?[!?.,\s]*$/.test(q)) {
    return "I’m doing well and ready to help. How are you doing today?";
  }

  if (/^(what'?s up|whats up|sup)(\s+venus)?[!?.,\s]*$/.test(q)) {
    return "Not much — I’m ready whenever you are. What do you want to work on?";
  }

  if (/^(thanks|thank you|thank you venus|thanks venus|thx)[!?.,\s]*$/.test(q)) {
    return "You’re welcome! Happy to help.";
  }

  if (/^(good morning)(\s+venus)?[!?.,\s]*$/.test(q)) {
    return "Good morning! What can I help you with today?";
  }

  if (/^(good evening)(\s+venus)?[!?.,\s]*$/.test(q)) {
    return "Good evening! What can I help you with?";
  }

  if (/^(good night)(\s+venus)?[!?.,\s]*$/.test(q)) {
    return "Good night! I’ll be here whenever you need me.";
  }

  if (/^(who are you|what are you)(\s+venus)?[!?.,\s]*$/.test(q)) {
    return "I’m Venus AI, a privacy-focused assistant that can run locally in your browser for chat and use source-grounded lookup for factual questions.";
  }

  return null;
}

async function sendMessage(text, options = {}) {
  if (busy) return null;

  const attachment = currentAttachment;
  const rawText = String(text || "").trim();
  if (!rawText && !attachment) return null;

  const userText = rawText || "What do you see in this photo?";
  const rememberMatch = attachment ? null : userText.match(/^remember(?:\s+that)?\s+(.+)/i);

  appendMessage(
    "user",
    userText,
    null,
    attachment
      ? {
          imageDataUrl: attachment.previewDataUrl,
          imageName: attachment.name,
          imageSource: attachment.source,
        }
      : {}
  );

  currentAttachment = null;
  renderAttachmentPreview();
  promptEl.value = "";
  resizePrompt();
  renderChat();

  busy = true;
  setComposerEnabled(false);

  if (rememberMatch?.[1]?.trim()) {
    const memoryText = rememberMatch[1].trim();
    addMemory(memoryText);
    const reply = `I’ll remember that: ${memoryText}`;
    appendMessage("assistant", reply);
    renderChat();
    busy = false;
    setComposerEnabled(true);
    if (settings.autoSpeak || options.speakReply) speakText(reply);
    return reply;
  }

  if (!attachment) {
    const smallTalk = smallTalkReply(userText);
    if (smallTalk) {
      appendMessage("assistant", smallTalk);
      renderChat();
      busy = false;
      setComposerEnabled(true);
      if (settings.autoSpeak || options.speakReply) {
        if (options.onSpokenEnd) speakText(smallTalk, options.onSpokenEnd);
        else speakText(smallTalk);
      }
      return smallTalk;
    }
  }

  const placeholder = appendMessage("assistant", attachment ? "Looking at your photo…" : "Thinking…");
  renderChat();

  try {
    let finalText = "";
    let source = null;

    if (attachment) {
      setModelStatus("loading", "Analyzing photo locally…", 0);
      const caption = await captionImage(attachment.dataUrl, false);
      finalText = await answerFromVisionCaption(caption, userText);
    } else if (settings.grounding && looksFactual(userText)) {
      const factual = await getFactualAnswer(userText);
      finalText = factual.text;
      source = factual.source;
    } else {
      finalText = await getLocalAnswer(userText);
    }

    updateMessage(placeholder.id, { content: finalText, source });
    renderChat();

    if (settings.autoSpeak || options.speakReply) {
      if (options.onSpokenEnd) speakText(finalText, options.onSpokenEnd);
      else speakText(finalText);
    }

    return finalText;
  } catch (error) {
    const message = String(error?.message || error);
    updateMessage(placeholder.id, { content: `Venus AI error: ${message}` });
    renderChat();

    // If photo analysis failed after swapping models, try to restore chat mode.
    if (!generator && !liveCameraOverlay.classList.contains("hidden")) {
      // live camera owns the vision session; leave it loaded.
    } else if (!generator) {
      restoreTextModelAfterVision().catch(() => {});
    }
    return null;
  } finally {
    busy = false;
    setComposerEnabled(true);
    promptEl.focus();
  }
}

function setComposerEnabled(enabled) {
  promptEl.disabled = !enabled;
  sendButton.disabled = !enabled;
  micButton.disabled = !enabled;
  voiceButton.disabled = !enabled;
  attachButton.disabled = !enabled;
}

function resizePrompt() {
  promptEl.style.height = "auto";
  promptEl.style.height = `${Math.min(promptEl.scrollHeight, 145)}px`;
}

function renderChat() {
  const thread = getActiveThread();
  chatScroll.innerHTML = "";

  if (!thread.messages.length) {
    const hero = document.createElement("div");
    hero.className = "hero hero-icon-only";
    hero.innerHTML = `
      <img class="hero-center-icon" src="./icon-512.png" alt="Venus AI">
    `;
    chatScroll.appendChild(hero);
    return;
  }

  for (const message of thread.messages) {
    const row = document.createElement("div");
    row.className = `message-row ${message.role === "user" ? "user" : "assistant"}`;

    if (message.role !== "user") {
      const mark = document.createElement("img");
      mark.className = "assistant-mark";
      mark.src = "./icon-192.png";
      mark.alt = "";
      row.appendChild(mark);
    }

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    if (message.imageDataUrl) {
      const photo = document.createElement("img");
      photo.className = "message-photo";
      photo.src = message.imageDataUrl;
      photo.alt = message.imageName || "Attached photo";
      bubble.appendChild(photo);
    }

    const text = document.createElement("div");
    text.textContent = message.content;
    bubble.appendChild(text);

    if (message.source) {
      const source = document.createElement("div");
      source.className = "source-note";
      source.textContent = `Source: Wikipedia — ${message.source}`;
      bubble.appendChild(source);
    }

    if (message.role === "assistant" && message.content && message.content !== "Thinking…" && message.content !== "Looking at your photo…") {
      const speak = document.createElement("button");
      speak.className = "speak-link";
      speak.type = "button";
      speak.textContent = "🔊 Read aloud";
      speak.addEventListener("click", () => speakText(message.content));
      bubble.appendChild(speak);
    }

    row.appendChild(bubble);
    chatScroll.appendChild(row);
  }

  requestAnimationFrame(() => { chatScroll.scrollTop = chatScroll.scrollHeight; });
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
function escapeHtmlAttr(text) { return escapeHtml(text).replaceAll("'", "&#39;"); }

function newChat() {
  if (busy) {
    showToast("Venus is still responding. Wait for the current response to finish.");
    return;
  }
  const current = getActiveThread();
  if (!current.messages.length) {
    switchTab("chat");
    closeThreadDrawer();
    promptEl.focus();
    return;
  }
  const thread = createEmptyThread();
  threads.unshift(thread);
  activeThreadId = thread.id;
  persistThreads();
  switchTab("chat");
  closeThreadDrawer();
  renderChat();
  promptEl.focus();
}

function openThread(id) {
  if (busy) {
    showToast("Venus is still responding. Wait before switching conversations.");
    return;
  }
  if (!threads.some((t) => t.id === id)) return;
  activeThreadId = id;
  localStorage.setItem(ACTIVE_THREAD_KEY, id);
  switchTab("chat");
  closeThreadDrawer();
  renderChat();
}

function deleteThread(id) {
  if (threads.length === 1) {
    threads = [createEmptyThread()];
    activeThreadId = threads[0].id;
  } else {
    threads = threads.filter((t) => t.id !== id);
    if (activeThreadId === id) activeThreadId = threads[0].id;
  }
  persistThreads();
  renderThreadDrawer();
  renderChat();
}

function renameThread(id) {
  const thread = threads.find((t) => t.id === id);
  if (!thread) return;
  const next = window.prompt("Rename conversation", thread.title);
  if (!next?.trim()) return;
  thread.title = next.trim().slice(0, 80);
  thread.titleEdited = true;
  thread.updatedAt = Date.now();
  persistThreads();
  renderThreadDrawer();
}

function renderThreadDrawer() {
  const query = threadSearch.value.trim().toLowerCase();
  const ordered = [...threads].sort((a,b) => b.updatedAt - a.updatedAt)
    .filter((t) => !query || t.title.toLowerCase().includes(query));

  threadList.innerHTML = "";
  if (!ordered.length) {
    threadList.innerHTML = `<div class="memory-empty">No matching conversations.</div>`;
    return;
  }

  for (const thread of ordered) {
    const card = document.createElement("div");
    card.className = `thread-card${thread.id === activeThreadId ? " active" : ""}`;

    const main = document.createElement("button");
    main.className = "thread-main";
    main.type = "button";
    main.innerHTML = `<div class="thread-title">${escapeHtml(thread.title)}</div><div class="thread-meta">${formatThreadStamp(thread.updatedAt)} • ${thread.messages.length} messages</div>`;
    main.addEventListener("click", () => openThread(thread.id));

    const actions = document.createElement("div");
    actions.className = "thread-actions";
    const rename = document.createElement("button");
    rename.type = "button";
    rename.textContent = "Rename";
    rename.addEventListener("click", () => renameThread(thread.id));
    const del = document.createElement("button");
    del.type = "button";
    del.className = "delete";
    del.textContent = "Delete";
    del.addEventListener("click", () => deleteThread(thread.id));
    actions.append(rename, del);

    card.append(main, actions);
    threadList.appendChild(card);
  }
}

function openThreadDrawer() {
  renderThreadDrawer();
  drawerBackdrop.classList.remove("hidden");
  setTimeout(() => threadSearch.focus(), 100);
}
function closeThreadDrawer() {
  drawerBackdrop.classList.add("hidden");
}

function addMemory(text) {
  const clean = String(text || "").trim();
  if (!clean) return;
  if (memories.some((m) => m.text.toLowerCase() === clean.toLowerCase())) return;
  memories.push({ id: uid(), text: clean, createdAt: Date.now() });
  saveJSON(MEMORY_KEY, memories);
  renderMemory();
  renderSettingsCounts();
}

function deleteMemory(id) {
  memories = memories.filter((m) => m.id !== id);
  saveJSON(MEMORY_KEY, memories);
  renderMemory();
  renderSettingsCounts();
}

function renderMemory() {
  memoryList.innerHTML = "";
  if (!memories.length) {
    memoryList.innerHTML = `<div class="memory-empty">No saved information yet.<br>Say “Remember that…” in chat or add one below.</div>`;
    return;
  }
  for (const memory of memories) {
    const item = document.createElement("div");
    item.className = "memory-item";
    item.innerHTML = `<div class="memory-icon">✦</div><div class="memory-copy">${escapeHtml(memory.text)}</div>`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.addEventListener("click", () => deleteMemory(memory.id));
    item.appendChild(remove);
    memoryList.appendChild(item);
  }
}

function renderSettingsCounts() {
  threadCountSetting.textContent = `${threads.length} saved`;
  memoryCountSetting.textContent = `${memories.length} saved`;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  voiceSupportSetting.textContent = SpeechRecognition ? "Available" : "Not supported in this browser";
  if (visionStatusSetting) {
    visionStatusSetting.textContent =
      visionState === "ready" ? "LOCAL • READY" :
      visionState === "loading" ? "Loading…" :
      visionState === "failed" ? "Load failed" : "On demand";
  }
}

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  document.querySelectorAll(".nav-item[data-tab]").forEach((item) => item.classList.remove("active"));
  const view = $(`${tab}View`);
  if (view) view.classList.add("active");
  const nav = document.querySelector(`.nav-item[data-tab="${tab}"]`);
  if (nav) nav.classList.add("active");
  if (tab === "chat") renderChat();
  if (tab === "memory") renderMemory();
  if (tab === "settings") renderSettingsCounts();
}

function startDictation() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showToast("Voice input is not supported by this browser.");
    return;
  }
  if (voiceRecognition) {
    try { voiceRecognition.stop(); } catch {}
    return;
  }

  const recognition = new SpeechRecognition();
  voiceRecognition = recognition;
  recognition.lang = navigator.language || "en-US";
  recognition.interimResults = true;
  recognition.continuous = false;
  const prefix = promptEl.value.trim();
  micButton.textContent = "■";
  micButton.style.background = "#402021";

  recognition.onresult = (event) => {
    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    const normalized = normalizeDictation(transcript);
    promptEl.value = [prefix, normalized].filter(Boolean).join(prefix ? " " : "");
    resizePrompt();
  };
  recognition.onerror = () => showToast("Voice input stopped.");
  recognition.onend = () => {
    voiceRecognition = null;
    micButton.textContent = "🎙";
    micButton.style.background = "";
    promptEl.focus();
  };
  recognition.start();
}

function startVoiceConversation() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showToast("Hands-free voice is not supported by this browser.");
    return;
  }
  voiceConversationActive = true;
  voiceOverlay.classList.remove("hidden");
  voiceStatusText.textContent = "Listening…";
  runVoiceConversationRecognition();
}

function runVoiceConversationRecognition() {
  if (!voiceConversationActive) return;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  voiceRecognition = recognition;
  recognition.lang = navigator.language || "en-US";
  recognition.interimResults = false;
  recognition.continuous = false;

  recognition.onresult = async (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript || "";
    const text = normalizeDictation(transcript);
    if (!text) return;
    voiceStatusText.textContent = "Thinking…";
    await sendMessage(text, {
      speakReply: true,
      onSpokenEnd: () => {
        if (voiceConversationActive) {
          voiceStatusText.textContent = "Listening…";
          setTimeout(runVoiceConversationRecognition, 350);
        }
      }
    });
  };

  recognition.onerror = () => {
    if (voiceConversationActive) {
      voiceStatusText.textContent = "Listening…";
      setTimeout(runVoiceConversationRecognition, 700);
    }
  };
  recognition.onend = () => {
    voiceRecognition = null;
  };
  try { recognition.start(); } catch {}
}

function stopVoiceConversation() {
  voiceConversationActive = false;
  if (voiceRecognition) {
    try { voiceRecognition.stop(); } catch {}
    voiceRecognition = null;
  }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  voiceOverlay.classList.add("hidden");
}


async function startLiveCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser does not provide camera access.");
  }

  if (liveStream) {
    for (const track of liveStream.getTracks()) track.stop();
    liveStream = null;
  }

  liveVisionStatus.textContent = "Starting camera…";

  liveStream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: liveFacingMode },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  });

  liveVideo.srcObject = liveStream;
  await liveVideo.play();
  liveVisionStatus.textContent = "Camera ready • Local Vision loads on first analysis";
}

async function openLiveCamera() {
  closeAttachment();
  liveCameraOverlay.classList.remove("hidden");
  liveResponse.textContent = "Point the camera at something, then tap ANALYZE FRAME.";
  lastLiveFrame = null;
  try {
    await startLiveCamera();
  } catch (error) {
    liveVisionStatus.textContent = `Camera unavailable: ${String(error?.message || error)}`;
  }
}

async function closeLiveCamera() {
  if (liveAutoTimer) {
    clearInterval(liveAutoTimer);
    liveAutoTimer = null;
  }
  liveAutoButton.textContent = "AUTO SCAN: OFF";
  liveAutoButton.classList.remove("active");

  if (liveStream) {
    for (const track of liveStream.getTracks()) track.stop();
    liveStream = null;
  }
  liveVideo.srcObject = null;
  liveCameraOverlay.classList.add("hidden");

  if (visionCaptioner) {
    setTimeout(() => restoreTextModelAfterVision().catch(() => {}), 100);
  }
}

async function analyzeLiveFrame(autoMode = false) {
  if (liveAnalyzing || !liveStream) return;
  liveAnalyzing = true;
  liveAnalyzeButton.disabled = true;

  try {
    const frame = captureVideoFrame(liveVideo, 900, 0.80);
    lastLiveFrame = frame;
    liveVisionStatus.textContent = autoMode ? "Auto Scan: analyzing locally…" : "Analyzing frame locally…";

    const caption = await captionImage(frame, true);
    const question = liveQuestion.value.trim();

    if (question && !/^(what do you see|describe|describe this|what'?s here)$/i.test(question)) {
      liveResponse.textContent = `${caption}\n\nFor detailed question-answering, tap “USE FRAME IN CHAT” and send your question there.`;
    } else {
      liveResponse.textContent = `Local Vision: ${caption}`;
    }

    liveVisionStatus.textContent = autoMode ? "Auto Scan active" : "Frame analyzed locally";
  } catch (error) {
    liveResponse.textContent = `Venus AI Live Vision error: ${String(error?.message || error)}`;
    liveVisionStatus.textContent = "Analysis failed";
  } finally {
    liveAnalyzing = false;
    liveAnalyzeButton.disabled = false;
  }
}

function toggleLiveAutoScan() {
  if (liveAutoTimer) {
    clearInterval(liveAutoTimer);
    liveAutoTimer = null;
    liveAutoButton.textContent = "AUTO SCAN: OFF";
    liveAutoButton.classList.remove("active");
    liveVisionStatus.textContent = "Auto Scan stopped";
    return;
  }

  liveAutoButton.textContent = "AUTO SCAN: ON";
  liveAutoButton.classList.add("active");
  liveVisionStatus.textContent = "Auto Scan starting…";
  analyzeLiveFrame(true);
  liveAutoTimer = setInterval(() => analyzeLiveFrame(true), 6500);
}

async function useLiveFrameInChat() {
  if (!lastLiveFrame) {
    try {
      lastLiveFrame = captureVideoFrame(liveVideo, 960, 0.82);
    } catch (error) {
      showToast(String(error?.message || error));
      return;
    }
  }

  const previewDataUrl = await imageSourceToResizedDataUrl(lastLiveFrame, 480, 0.68);
  currentAttachment = {
    id: uid(),
    type: "image",
    dataUrl: lastLiveFrame,
    previewDataUrl,
    name: "live-camera-frame.jpg",
    source: "Live camera",
  };

  await closeLiveCamera();
  switchTab("chat");
  renderAttachmentPreview();
  promptEl.value = liveQuestion.value.trim();
  resizePrompt();
  promptEl.focus();
}

function openAttachmentSheet() {
  attachmentSheet.classList.remove("hidden");
}
function closeAttachment() {
  attachmentSheet.classList.add("hidden");
}

function saveSettings() {
  settings.grounding = groundingToggle.checked;
  settings.autoSpeak = autoSpeakToggle.checked;
  saveJSON(SETTINGS_KEY, settings);
}

function initialize() {
  migrateLegacyMessages();
  ensureActiveThread();

  groundingToggle.checked = settings.grounding !== false;
  autoSpeakToggle.checked = !!settings.autoSpeak;

  renderChat();
  renderMemory();
  renderSettingsCounts();
  renderAttachmentPreview();
  setComposerEnabled(true);
  resizePrompt();

  setModelStatus("loading", "Venus AI is loading the local creative model…", 0);
}

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(promptEl.value);
});
promptEl.addEventListener("input", resizePrompt);
promptEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    composer.requestSubmit();
  }
});
brandButton.addEventListener("click", newChat);
attachButton.addEventListener("click", openAttachmentSheet);
micButton.addEventListener("click", startDictation);
voiceButton.addEventListener("click", startVoiceConversation);
voiceStopButton.addEventListener("click", stopVoiceConversation);
closeVoiceOverlay.addEventListener("click", stopVoiceConversation);

document.querySelectorAll(".nav-item[data-tab]").forEach((button) => {
  button.addEventListener("click", () => switchTab(button.dataset.tab));
});
threadsButton.addEventListener("click", openThreadDrawer);
closeThreadsButton.addEventListener("click", closeThreadDrawer);
drawerNewChatButton.addEventListener("click", newChat);
threadSearch.addEventListener("input", renderThreadDrawer);
drawerBackdrop.addEventListener("click", (event) => {
  if (event.target === drawerBackdrop) closeThreadDrawer();
});

closeAttachmentSheet.addEventListener("click", closeAttachment);
attachmentSheet.addEventListener("click", (event) => {
  if (event.target === attachmentSheet) closeAttachment();
});
document.querySelectorAll("[data-vision-action]").forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.visionAction;
    if (action === "photo") {
      closeAttachment();
      photoLibraryInput.click();
    } else if (action === "camera") {
      closeAttachment();
      cameraCaptureInput.click();
    } else if (action === "live") {
      openLiveCamera();
    }
  });
});

photoLibraryInput.addEventListener("change", () => {
  const file = photoLibraryInput.files?.[0];
  photoLibraryInput.value = "";
  createAttachmentFromFile(file, "Photo library");
});

cameraCaptureInput.addEventListener("change", () => {
  const file = cameraCaptureInput.files?.[0];
  cameraCaptureInput.value = "";
  createAttachmentFromFile(file, "Camera");
});

closeLiveCameraButton.addEventListener("click", () => closeLiveCamera());
switchCameraButton.addEventListener("click", async () => {
  liveFacingMode = liveFacingMode === "environment" ? "user" : "environment";
  try {
    await startLiveCamera();
  } catch (error) {
    liveVisionStatus.textContent = `Camera unavailable: ${String(error?.message || error)}`;
  }
});
liveAnalyzeButton.addEventListener("click", () => analyzeLiveFrame(false));
liveAutoButton.addEventListener("click", toggleLiveAutoScan);
useLiveFrameButton.addEventListener("click", () => useLiveFrameInChat());


memoryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addMemory(memoryInput.value);
  memoryInput.value = "";
});
clearMemoryButton.addEventListener("click", () => {
  if (!memories.length) return;
  if (confirm("Clear all saved Venus AI memory on this device?")) {
    memories = [];
    saveJSON(MEMORY_KEY, memories);
    renderMemory();
    renderSettingsCounts();
  }
});

groundingToggle.addEventListener("change", saveSettings);
autoSpeakToggle.addEventListener("change", saveSettings);
modelRetryButton.addEventListener("click", () => loadModel().catch(() => {}));
settingsRetryModel.addEventListener("click", () => {
  modelStrip.classList.remove("ready");
  loadModel().catch(() => {});
});

window.addEventListener("load", () => {
  initialize();
  setTimeout(() => loadModel().catch(() => {}), 350);
});

window.addEventListener("pagehide", () => {
  if (liveStream) {
    for (const track of liveStream.getTracks()) track.stop();
  }
});
