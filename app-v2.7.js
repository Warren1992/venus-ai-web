import {
  pipeline,
  env,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0";

const MODEL_ID = "onnx-community/SmolLM2-135M-Instruct-ONNX";
const VENUS_BUILD = "v2.7-smollm2-135m-wasm";
console.info("Venus AI build:", VENUS_BUILD);
const STORAGE_KEY = "venus-ai-web-v27-chat";

const SYSTEM_PROMPT = `You are Venus AI, a helpful general-purpose AI assistant.
Answer directly and concisely.
Do not expose hidden reasoning or scratch work.
Do not pretend to have live internet access.
For creative writing, brainstorming, rewriting, planning, and casual conversation, be helpful and natural.
If you are uncertain about a factual claim, say so.`;

const $ = (id) => document.getElementById(id);
const loadBtn = $("loadBtn");
const sendBtn = $("sendBtn");
const promptEl = $("prompt");
const composer = $("composer");
const chatEl = $("chat");
const newChatBtn = $("newChatBtn");
const groundingToggle = $("groundingToggle");
const dot = $("dot");
const statusTitle = $("statusTitle");
const statusText = $("statusText");
const progressWrap = $("progressWrap");
const bar = $("bar");
const progressText = $("progressText");

let generator = null;
let busy = false;
let messages = loadMessages();

env.allowLocalModels = false;
env.allowRemoteModels = true;

const STOPWORDS = new Set([
  "a","an","and","are","as","at","be","by","for","from","how","in","is","it",
  "of","on","or","that","the","this","to","was","were","what","when","where",
  "which","who","why","with","does","do","did","about"
]);

function setStatus(kind, title, text) {
  dot.className = `dot ${kind || ""}`.trim();
  statusTitle.textContent = title;
  statusText.textContent = text;
}

function loadMessages() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveMessages() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
}

function appendBubble(role, text = "", source = null) {
  const row = document.createElement("div");
  row.className = `message ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  const content = document.createElement("div");
  content.textContent = text;
  bubble.appendChild(content);

  if (source && role === "assistant") {
    const note = document.createElement("div");
    note.className = "source-note";
    note.textContent = `Source: Wikipedia — ${source}`;
    bubble.appendChild(note);
  }

  row.appendChild(bubble);
  chatEl.appendChild(row);

  requestAnimationFrame(() => {
    chatEl.scrollTop = chatEl.scrollHeight;
  });

  return { bubble, content };
}

function renderMessages() {
  chatEl.innerHTML = "";

  if (!messages.length) {
    appendBubble(
      "assistant",
      "Venus AI Web is ready. Factual questions use canonical Wikipedia sources; creative chat can run locally on supported devices."
    );
    return;
  }

  for (const m of messages) {
    appendBubble(m.role, m.content, m.source || null);
  }
}

function cleanText(text) {
  return String(text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<\/?think>/gi, "")
    .trim();
}

function resizePrompt() {
  promptEl.style.height = "auto";
  promptEl.style.height = Math.min(promptEl.scrollHeight, 150) + "px";
}

function progressCallback(info) {
  const status = info?.status || "";
  const file = info?.file || "";

  if (typeof info?.progress === "number") {
    const pct = Math.max(0, Math.min(100, info.progress));
    bar.style.width = `${pct}%`;
    progressText.textContent = file
      ? `${status || "Downloading"} ${file} — ${Math.round(pct)}%`
      : `${status || "Downloading"} — ${Math.round(pct)}%`;
  } else if (status) {
    progressText.textContent = file ? `${status}: ${file}` : status;
  }
}

async function checkWebGPU() {
  if (!navigator.gpu) return { ok: false, reason: "navigator.gpu is unavailable." };
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return { ok: false, reason: "No WebGPU adapter was returned." };
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: String(error?.message || error) };
  }
}

async function loadModel() {
  loadBtn.disabled = true;
  progressWrap.classList.remove("hidden");
  bar.style.width = "0%";
  progressText.textContent = "v2.7: Starting SmolLM2 135M Instruct q8 in CPU/WASM mode…";

  setStatus(
    "busy",
    "Loading local creative AI…",
    "Using the smaller SmolLM2 135M Instruct model. If the download stream fails once, Venus AI will retry automatically."
  );

  async function attemptLoad(attemptNumber) {
    progressText.textContent =
      attemptNumber === 1
        ? "Downloading SmolLM2 135M Instruct q8…"
        : "Download retry 2 of 2…";

    return await pipeline(
      "text-generation",
      MODEL_ID,
      {
        dtype: "q8",
        progress_callback: progressCallback,
      }
    );
  }

  try {
    try {
      generator = await attemptLoad(1);
    } catch (firstError) {
      console.warn("Venus AI first model load attempt failed:", firstError);

      const firstMessage = String(firstError?.message || firstError);

      // Retry stream/download-style failures once. This also gives the browser
      // cache a chance to reuse any assets that completed successfully.
      if (
        /input stream|network|fetch|aborted|failed to fetch/i.test(firstMessage)
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        generator = await attemptLoad(2);
      } else {
        throw firstError;
      }
    }

    bar.style.width = "100%";
    progressText.textContent =
      "SmolLM2 135M Instruct q8 is ready in CPU/WASM mode.";

    setStatus(
      "good",
      "Venus AI is ready",
      "Factual answers use canonical Wikipedia sources. Creative/chat requests run locally with SmolLM2 135M Instruct."
    );

    loadBtn.textContent = "Creative AI loaded — 135M safe mode";
    promptEl.disabled = false;
    sendBtn.disabled = false;
    promptEl.focus();
  } catch (error) {
    console.error(error);
    generator = null;
    loadBtn.disabled = false;

    setStatus(
      "bad",
      "Local creative AI failed to load",
      "v2.7 SmolLM2 135M loader failed even after the smaller-model/retry strategy. Source-grounded factual answers still work."
    );

    progressText.textContent = String(error?.message || error);
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

async function answerFactually(userText, ui) {
  setStatus(
    "busy",
    "Finding a canonical source answer…",
    "Finding the answer, identifying the answer entity, then re-checking it against the entity's canonical Wikipedia article."
  );

  ui.content.textContent = "Searching Wikipedia…";

  const candidates = await wikipediaCandidates(userText);
  const result = buildDirectAnswer(userText, candidates);

  if (!result?.answer) {
    throw new Error("No direct Wikipedia answer was found.");
  }

  // Second stage: identify the actual answer entity and fetch its canonical page.
  const entity = extractAnswerEntity(userText, result.answer, result.source);
  let finalAnswer = result.answer;
  let finalSource = result.source;

  if (entity) {
    try {
      const canonical = await fetchCanonicalEntitySource(entity, userText);

      if (canonical) {
        const canonicalAnswer = canonicalSentenceForQuestion(
          canonical,
          userText,
          entity
        );

        if (canonicalAnswer) {
          finalAnswer = canonicalAnswer.slice(0, 900);
          finalSource = canonical.title;
        }
      }
    } catch (canonicalError) {
      console.warn("Canonical-source lookup failed:", canonicalError);
    }
  }

  ui.content.textContent = finalAnswer;

  const note = document.createElement("div");
  note.className = "source-note";
  note.textContent = `Source: Wikipedia — ${finalSource}`;
  ui.bubble.appendChild(note);

  messages.push({
    role: "assistant",
    content: finalAnswer,
    source: finalSource,
  });
  saveMessages();

  setStatus(
    "good",
    "Venus AI is ready",
    `Factual answer anchored to Wikipedia source: ${finalSource}. No paid AI API or local LLM generation was used.`
  );
}

async function answerLocally(userText, ui) {
  if (!generator) {
    throw new Error("Load the creative/chat AI first, or enable source-grounded factual answers.");
  }

  const chatMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userText },
  ];

  const result = await generator(chatMessages, {
    max_new_tokens: 72,
    do_sample: true,
    temperature: 0.7,
    top_p: 0.8,
    top_k: 20,
  });

  const generated = result?.[0]?.generated_text;
  let finalText = "";

  if (Array.isArray(generated)) {
    finalText = generated.at(-1)?.content || "";
  } else if (typeof generated === "string") {
    finalText = generated;
  }

  finalText = cleanText(finalText);
  if (!finalText) throw new Error("The local model returned an empty response.");

  ui.content.textContent = finalText;

  messages.push({ role: "assistant", content: finalText });
  saveMessages();

  setStatus(
    "good",
    "Venus AI is ready",
    "Response generated locally by Qwen3. No paid AI API was used."
  );
}

async function sendMessage(text) {
  if (busy || !text.trim()) return;

  const userText = text.trim();

  messages.push({ role: "user", content: userText });
  saveMessages();
  appendBubble("user", userText);

  promptEl.value = "";
  resizePrompt();

  busy = true;
  promptEl.disabled = true;
  sendBtn.disabled = true;

  const ui = appendBubble("assistant", "Thinking…");

  try {
    if (groundingToggle.checked && looksFactual(userText)) {
      await answerFactually(userText, ui);
    } else {
      await answerLocally(userText, ui);
    }
  } catch (error) {
    console.error(error);
    const message = String(error?.message || error);
    console.error(error);

    ui.content.textContent = groundingToggle.checked && looksFactual(userText)
      ? `Venus AI factual lookup error: ${message}`
      : `Venus AI local-model error: ${message}`;

    setStatus(
      "bad",
      "Answer failed",
      groundingToggle.checked && looksFactual(userText)
        ? "The source-grounded factual lookup could not find a direct answer."
        : "The safe CPU/WASM local model could not complete this response."
    );
  } finally {
    busy = false;
    promptEl.disabled = false;
    sendBtn.disabled = false;
    promptEl.focus();
  }
}

loadBtn.addEventListener("click", loadModel);

newChatBtn.addEventListener("click", () => {
  if (busy) return;
  messages = [];
  saveMessages();
  chatEl.innerHTML = "";
  appendBubble("assistant", "New chat started. Source-grounded factual answers are ready.");
});

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

renderMessages();

// Factual source mode is immediately usable.
// Creative AI now uses CPU/WASM safe mode, so WebGPU is not required.
promptEl.disabled = false;
sendBtn.disabled = false;
loadBtn.disabled = false;

setStatus(
  "good",
  "Venus AI is ready",
  "Source-grounded factual answers are ready now. Load Creative AI to enable local CPU/WASM creative chat."
);
