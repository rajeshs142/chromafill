const CONFIG = {
  gameName: "HueFlow",
  launchDate: "2025-11-01",
  step: 25,
  tiers: [
    { id: "training", name: "Training", stars: [0, 1], count: 10 },
    { id: "easy", name: "Easy", stars: [1, 2], count: 20 },
    { id: "medium", name: "Medium", stars: [2, 3], count: 20 },
    { id: "hard", name: "Hard", stars: [3, 4], count: 20 },
    { id: "expert", name: "Expert", stars: [4, 6], count: 20 },
    { id: "master", name: "Master", stars: [4, 6], count: 20 },
    { id: "legend", name: "Legend", stars: [4, 6], count: 20 },
    { id: "ultimate", name: "Ultimate", stars: [4, 6], count: 20 },
  ],
  messages: {
    5: "Masterpiece!",
    4: "Awesome!",
    3: "Good",
    2: "Nice",
    solve: "Completed",
    softFails: [
      "Try again",
      "Try again",
      "Try again",
      "Try again",
      "Try again",
    ],
  },
  dailyRange: {
    minDrops: 5,
    maxDrops: 15,
  },
  freePlay: { minDrops: 3, maxDrops: 12 },
  solveThreshold: 10,
};

const DEFAULTS = {
  unlocked: ["training"],
  levels: {},
  daily: {},
  atlas: {},
  barPreference: "result",
  tutorialSeen: false,
};
const savedData = JSON.parse(localStorage.getItem("hf_final_v1")) || {};
let state = { ...DEFAULTS, ...savedData };

let cur = {
  type: "free",
  recipe: null,
  drops: { r: 0, g: 0, b: 0, t: 0 },
  undosUsed: 0,
  history: [],
  tier: null,
  isAssisted: false,
};
let viewingMonth = new Date().getMonth(),
  viewingYear = new Date().getFullYear();

window.addEventListener("hashchange", router);

function router() {
  document.body.style.backgroundColor = "";
  document.body.classList.remove("light-theme");
  updateDailyButtonVisuals();

  const hash = window.location.hash || "#/";
  const parts = hash.split("/");
  const gb = document.getElementById("global-back");

  // --- 1. REDIRECT HOME TO RESUME JOURNEY ---
  if (hash === "#/" || hash === "") {
    resumeJourney();
    // Trigger Tutorial if first time
    if (!state.tutorialSeen) {
      document.getElementById("tutorial-modal").style.display = "flex";
    } else if (hash === "#/tutorial") {
      renderTutorialPage();
    }
    return;
  }
  if (hash === "#/tutorial") renderTutorialPage();

  // --- 2. DYNAMIC NAVIGATION LOGIC ---
  if (
    hash === "#/journey" ||
    hash === "#/daily" ||
    hash === "#/collection" ||
    hash === "#/free"
  )
    gb.onclick = () => (window.location.hash = "#/");
  else if (parts[1] === "journey")
    gb.onclick = () => (window.location.hash = "#/journey");
  else if (parts[1] === "daily")
    gb.onclick = () => (window.location.hash = "#/daily");

  gb.style.display = hash === "#/" ? "none" : "flex";

  // --- 3. ROUTE HANDLERS ---
  if (hash === "#/free")
    showScreen("screen-home"); // Use existing home screen for Free Play
  else if (hash === "#/journey") {
    renderJourney();
  } else if (hash === "#/daily") renderDaily();
  else if (hash === "#/collection") renderCollection("hue");
  // --- JOURNEY GATEKEEPER ---
  else if (parts[1] === "journey") {
    const tierId = parts[2];
    const levelIdx = parseInt(parts[3]);

    // 1. Check if tier is unlocked
    const isUnlocked = state.unlocked.includes(tierId);

    // 2. Check if the level actually exists in JOURNEY_DATA
    const tierLevels = JOURNEY_DATA.filter((l) => l.mode === tierId);
    const levelExists = tierLevels && tierLevels[levelIdx] !== undefined;

    if (!isUnlocked || !levelExists) {
      // If locked or invalid, bounce to Home (which resumes current progress)
      window.location.hash = "#/";

      return;
    }

    loadGame("journey", tierId, levelIdx);
  }
  // --- DAILY GATEKEEPER ---
  else if (parts[1] === "daily") {
    const today = new Date().toISOString().split("T")[0];
    const requestedDate = parts[2];

    if (requestedDate > today || requestedDate < CONFIG.launchDate) {
      window.location.hash = "#/"; // Bounce to Home if future/invalid date
      return;
    }
    loadGame("daily", "master", requestedDate);
  }

  initProgressToggle();
  applyBarPreference();
}

function resumeJourney() {
  // Find the first level in the entire dataset that doesn't have stars
  const nextLevel = JOURNEY_DATA.find((l) => !state.levels[l.id]);

  if (nextLevel) {
    const tierLevels = JOURNEY_DATA.filter((l) => l.mode === nextLevel.mode);
    const idx = tierLevels.indexOf(nextLevel);

    // Safety check: only redirect if the tier is unlocked
    if (state.unlocked.includes(nextLevel.mode)) {
      window.location.hash = `#/journey/${nextLevel.mode}/${idx}`;
    } else {
      // If they haven't unlocked the next tier yet, show the Swatchbook
      window.location.hash = "#/journey";
    }
  } else {
    // Everything complete!
    window.location.hash = "#/journey";
  }
}

function recipeToRGB(rec) {
  if (!rec || rec.r + rec.g + rec.b === 0) return "rgb(0,0,0)";
  const max = Math.max(rec.r, rec.g, rec.b);
  return `rgb(${Math.round((rec.r / max) * 255)}, ${Math.round(
    (rec.g / max) * 255
  )}, ${Math.round((rec.b / max) * 255)})`;
}

function mix(color) {
  if (cur.drops.t >= cur.recipe.total) return;
  cur.history.push({ ...cur.drops });
  cur.drops[color]++;
  cur.drops.t++;
  updateBars();
  updateUI();
}

function updateBars() {
  const p = cur.type === "free" ? "free" : "game";
  const pct = (cur.drops.t / cur.recipe.total) * 100;

  // Action Bar
  const actionCont = document.getElementById(`${p}-action-container`);
  if (actionCont) {
    actionCont.innerHTML = "";
    cur.history.concat(cur.drops).forEach((step, i) => {
      if (i === 0) return; // skip initial empty state
      const seg = document.createElement("div");
      seg.className = "ink-segment";
      // Find which color was added at this step
      const prev = cur.history[i - 1] || { r: 0, g: 0, b: 0 };
      const added =
        step.r > prev.r ? "red" : step.g > prev.g ? "green" : "blue";
      seg.style.backgroundColor = `var(--${added}-btn)`;
      actionCont.appendChild(seg);
    });
    actionCont.style.width = pct + "%";
  }

  // Result Bar
  const resultCont = document.getElementById(`${p}-result-container`);
  if (resultCont) {
    resultCont.innerHTML = "";
    cur.history.concat(cur.drops).forEach((step, i) => {
      if (i === 0 && cur.drops.t > 0) return;
      const seg = document.createElement("div");
      seg.className = "ink-segment";
      seg.style.backgroundColor = recipeToRGB(step);
      resultCont.appendChild(seg);
    });
    resultCont.style.width = pct + "%";
  }
}

function undo() {
  if (cur.history.length === 0) return;
  cur.undosUsed++;
  cur.drops = cur.history.pop();

  // Reset Win States
  document.body.style.backgroundColor = "";
  document.body.classList.remove("light-theme");

  updateBars();
  resetStatus(); // Clear stars and fail messages on undo
  updateUI();
}

function updateUI() {
  const p = cur.type === "free" ? "free" : "game";
  const target = recipeToRGB(cur.recipe);
  document.getElementById(`${p}-target`).style.backgroundColor = target;
  document.getElementById(`${p}-player`).style.backgroundColor =
    cur.drops.t === 0 ? "#000" : recipeToRGB(cur.drops);

  const correct =
    Math.min(cur.drops.r, cur.recipe.r) +
    Math.min(cur.drops.g, cur.recipe.g) +
    Math.min(cur.drops.b, cur.recipe.b);
  const pct = Math.floor((correct / cur.recipe.total) * 100);

  document.getElementById(`${p}-match`).innerText = pct + "%";
  document.getElementById(`${p}-c-r`).innerText = cur.drops.r;
  document.getElementById(`${p}-c-g`).innerText = cur.drops.g;
  document.getElementById(`${p}-c-b`).innerText = cur.drops.b;
  document.getElementById(
    `${p}-ink-text`
  ).innerText = `${cur.drops.t}/${cur.recipe.total} Drops`;
  document.getElementById(`${p}-try-text`).innerText = `Undo ${cur.undosUsed}`;

  if (pct === 100) handleWin(target);
  else if (cur.drops.t >= cur.recipe.total) handleFail();
}

// function handleWin(color) {
//   document.body.style.backgroundColor = color;
//   if (getContrastYIQ(color) === "light")
//     document.body.classList.add("light-theme");
//   const p = cur.type === "free" ? "free" : "game";
//  const resEl = document.getElementById(`${p}-res-text`);

//       // --- NEW LOGIC: SOLVE BYPASS ---
//     if (cur.isAssisted) {
//         resEl.innerText = CONFIG.messages.solve; // "Solved"
//         resEl.style.color = "var(--gold)";
//         disableButtons(true);
//         return; // EXIT HERE: Do not show stars, do not save to journey, daily, or atlas.
//     }
//   // Use Master tier for daily/free logic
//   const refTier = cur.tier || CONFIG.tiers.find((t) => t.id === "master");
//   let s =
//     cur.undosUsed <= refTier.stars[0]
//       ? 5
//       : cur.undosUsed <= refTier.stars[1]
//       ? 4
//       : 3;

//   const starEl = document.getElementById(`${p}-stars-span`);
//   if (starEl) {
//     starEl.innerText = "★".repeat(s);
//     starEl.classList.add("active");
//   }

//   resEl.innerText = CONFIG.messages[s];
//   resEl.style.color = "var(--green-btn)";

//   if (cur.type === "journey") saveLevel(s);
//   else if (cur.type === "daily") saveDaily(color, s);

//   saveToAtlas();
//       disableButtons(true);

// }

function handleWin(color) {
  const p = cur.type === "free" ? "free" : "game";
  const resEl = document.getElementById(`${p}-res-text`);
  const starEl = document.getElementById(`${p}-stars-span`);

  // 1. Apply Background Bloom
  document.body.style.backgroundColor = color;
  if (getContrastYIQ(color) === "light")
    document.body.classList.add("light-theme");

  // 2. Clear previous classes
  resEl.classList.remove("win", "fail", "solved", "info");

  if (cur.isAssisted) {
    // SOLVED STATE
    resEl.innerText = CONFIG.messages.solve;
    resEl.classList.add("solved");
  } else {
    // NATURAL WIN STATE
    const refTier = cur.tier || CONFIG.tiers.find((t) => t.id === "master");
    let s =
      cur.undosUsed <= refTier.stars[0]
        ? 5
        : cur.undosUsed <= refTier.stars[1]
        ? 4
        : 3;

    resEl.innerText = CONFIG.messages[s];
    resEl.classList.add("win");

    if (starEl) {
      starEl.innerText = "★".repeat(s);
      starEl.classList.add("active");
    }

    if (cur.type === "journey") saveLevel(s);
    else if (cur.type === "daily") saveDaily(color, s);
    saveToAtlas();
  }
  // disableButtons(true);
}

// function handleFail() {
//   const p = cur.type === "free" ? "free" : "game";
//   const resText = document.getElementById(`${p}-res-text`);
//   const msg =
//     CONFIG.messages.softFails[
//       Math.floor(Math.random() * CONFIG.messages.softFails.length)
//     ];
//   resText.innerText = msg;
//   resText.style.color = "var(--text-dim)";

//   if (cur.undosUsed >= CONFIG.solveThreshold) {
//     document.getElementById(`${p}-solve-link`).style.display = "block";
//   }
// }

function handleFail() {
  const p = cur.type === "free" ? "free" : "game";
  const resEl = document.getElementById(`${p}-res-text`);

  resEl.classList.remove("win", "fail", "solved", "info");
  resEl.classList.add("fail");

  resEl.innerText =
    CONFIG.messages.softFails[
      Math.floor(Math.random() * CONFIG.messages.softFails.length)
    ];

  if (cur.undosUsed >= CONFIG.solveThreshold) {
    document.getElementById(`${p}-solve-link`).style.display = "block";
  }
}
function handleDailyNav() {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(now.getDate()).padStart(2, "0")}`;

  if (state.daily[today]) {
    window.location.hash = "#/daily";
  } else {
    window.location.hash = `#/daily/${today}`;
  }
}
function updateDailyButtonVisuals() {
  // 1. Use local date to avoid timezone "tomorrow" bugs
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(now.getDate()).padStart(2, "0")}`;

  // 2. Find ALL daily buttons (on Home/Free screen and Game screen)
  const dailyBtns = [
    document.getElementById("daily-nav-btn"), // Button on Free Play screen
    document.getElementById("game-daily-btn"), // Button on Journey/Game screen
  ];

  const todayRecipe = getSeededDailyRecipe(today);
  const todayColor = recipeToRGB(todayRecipe);

  dailyBtns.forEach((btn) => {
    if (!btn) return;

    if (state.daily[today]) {
      btn.style.borderColor = "var(--green-btn)";
      btn.style.color = "var(--green-btn)";
      btn.innerText = "Daily Solved ✓";
      btn.style.boxShadow = "none";
    } else {
      btn.style.borderColor = todayColor;
      btn.style.color = "#fff";
      btn.innerText = "Daily Challenge";
      btn.style.boxShadow = `0 0 15px ${todayColor}44`;
    }
  });
}

function resetStatus() {
  const p = cur.type === "free" ? "free" : "game";
  document.getElementById(`${p}-res-text`).innerText = "";
  const starEl = document.getElementById(`${p}-stars-span`);
  if (starEl) {
    starEl.innerText = "";
    starEl.classList.remove("active");
  }
  document.getElementById(`${p}-solve-link`).style.display = "none";
}

function loadGame(type, tierId, idx) {
  let recipe;
  const tierData = CONFIG.tiers.find((t) => t.id === tierId);
  const tierLevels = JOURNEY_DATA.filter((l) => l.mode === tierId);
  // 1. Get the raw recipe
  let rawRecipe =
    type === "daily"
      ? JOURNEY_DATA[
          idx.split("-").reduce((a, b) => a + b.charCodeAt(0), 0) %
            JOURNEY_DATA.length
        ]
      : tierLevels[idx];

  // 2. IMPORTANT FIX: Create the recipe object and CALCULATE TOTAL
  recipe = {
    ...rawRecipe,
    total: rawRecipe.r + rawRecipe.g + rawRecipe.b,
  };
  if (type === "daily") {
    // NEW LOGIC: Generate a unique seeded color for this specific date
    recipe = getSeededDailyRecipe(idx);
  }
  cur = {
    type,
    tierId,
    levelIdx: idx,
    id: idx,
    recipe: recipe,
    drops: { r: 0, g: 0, b: 0, t: 0 },
    undosUsed: 0,
    history: [],
    tier: tierData,
  };
  resetUI();
  renderGameFooter();
  const sub =
    type === "daily"
      ? `DAILY: ${formatDisplayDate(idx)}`
      : `${tierId.toUpperCase()} LEVEL ${idx + 1}`;
  document
    .querySelectorAll(".subtitle-ui")
    .forEach((el) => (el.innerText = sub));

  const nameEl = document.getElementById("game-color-name");
  if (nameEl) {
    // We show the name if it's journey, otherwise empty string for Daily/Free
    nameEl.innerText = type === "journey" ? recipe.name : "";
  }
  showScreen("screen-game");
}

function renderGameFooter() {
  const f = document.getElementById("game-footer-ui");
  f.innerHTML = "";
  const btn = (txt, clk, col) => {
    const b = document.createElement("button");
    b.className = "action-btn";
    b.innerText = txt;
    b.onclick = clk;
    if (col) b.style.color = col;
    return b;
  };
  f.appendChild(btn("Reset", () => resetVial(false)));
  f.appendChild(btn("Share", () => shareGame()));
  f.appendChild(btn("Undo", () => undo()));
  if (cur.type === "daily") {
    if (cur.type === "daily") {
      const todayStr = new Date().toISOString().split("T")[0];
      const isLaunchDay = cur.id === CONFIG.launchDate;
      const isToday = cur.id === todayStr;

      // PREV Button
      const prevBtn = btn("Prev", () => navDate(-1));
      if (isLaunchDay) prevBtn.disabled = true;
      f.appendChild(prevBtn);

      f.appendChild(
        btn("Calendar", () => (window.location.hash = "#/daily"))
      );

      // NEXT Button
      const nextBtn = btn("Next", () => navDate(1));
      if (isToday) nextBtn.disabled = true;
      f.appendChild(nextBtn);
    }
  }

  //f.appendChild(btn("Solve", () => solveGame(), "var(--gold)"));

  if (cur.type === "journey") {
    const currentIndex = JOURNEY_DATA.findIndex((l) => l.id === cur.recipe.id);
    const nextLevel = JOURNEY_DATA[currentIndex + 1];

    // --- PREV BUTTON ---
    const prevBtn = btn("Prev", () => navLevel(-1));
    // Disable only if it's the first level of the first tier
    if (currentIndex === 0) prevBtn.disabled = true;
    f.appendChild(prevBtn);

    // --- LEVELS (MIDDLE) ---
    f.appendChild(
      btn("Levels", () => (window.location.hash = "#/journey"))
    );

    // --- NEXT BUTTON ---
    const nextBtn = btn("Next", () => navLevel(1));
    // Disable if it's the end of the world OR the next tier is locked
    if (!nextLevel || !state.unlocked.includes(nextLevel.mode)) {
      nextBtn.disabled = true;
    }
    f.appendChild(nextBtn);
  }
}

function resetVial(isNew) {
  if (isNew && cur.type === "free") initFreePlay();
  cur.drops = { r: 0, g: 0, b: 0, t: 0 };
  cur.undosUsed = 0;
  cur.history = [];
  cur.isAssisted = false; // RESET THE FLAG HERE

  document.body.style.backgroundColor = "";
  document.body.classList.remove("light-theme");
  resetUI();
}

function resetUI() {
  const p = cur.type === "free" ? "free" : "game";
  resetStatus();
  const ids = [`${p}-action-container`, `${p}-result-container`];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.innerHTML = "";
      el.style.width = "0%";
    }
  });
  updateUI();
}

function solveGame() {
  cur.isAssisted = true;
  cur.drops = { ...cur.recipe, t: cur.recipe.total };
  const p = cur.type === "free" ? "free" : "game";
  resetStatus();
  document.getElementById(`${p}-res-text`).innerText = CONFIG.messages.solve;
  updateBars();
  updateUI();
}

// function navLevel(dir) {
//   const tierLevels = JOURNEY_DATA.filter((l) => l.mode === cur.tierId);
//   let next = cur.levelIdx + dir;
//   if (next >= 0 && next < tierLevels.length)
//     window.location.hash = `#/journey/${cur.tierId}/${next}`;
// }
// function navLevel(dir) {
//   // 1. Find the current level's position in the GLOBAL master list
//   const currentIndex = JOURNEY_DATA.findIndex(l => l.id === cur.recipe.id);
//   const nextIndex = currentIndex + dir;

//   // 2. Boundary Check: Is there a level before or after?
//   if (nextIndex < 0 || nextIndex >= JOURNEY_DATA.length) {
//     window.location.hash = "#/journey"; // Return to list if at start/end
//     return;
//   }

//   const nextLevel = JOURNEY_DATA[nextIndex];

//   // 3. THE GATEKEEPER: Check if the next level's tier is unlocked
//   if (state.unlocked.includes(nextLevel.mode)) {
//     // Find the index of this level WITHIN its specific tier (for the URL format)
//     const tierLevels = JOURNEY_DATA.filter(l => l.mode === nextLevel.mode);
//     const idxInTier = tierLevels.indexOf(nextLevel);

//     // Navigate to the next level
//     window.location.hash = `#/journey/${nextLevel.mode}/${idxInTier}`;
//   } else {
//     // If the next tier is still locked, go to the Journey screen
//     // This shows the user they need to finish more levels to progress
//     window.location.hash = "#/journey";
//   }
// }
function navLevel(dir) {
  // 1. Find the current level's position in the GLOBAL master list (1-300)
  const currentIndex = JOURNEY_DATA.findIndex((l) => l.id === cur.recipe.id);
  const nextIndex = currentIndex + dir;

  // 2. Boundary Check
  if (nextIndex < 0 || nextIndex >= JOURNEY_DATA.length) return;

  const nextLevel = JOURNEY_DATA[nextIndex];

  // 3. Gatekeeper Check (Only matters for going FORWARD)
  if (dir > 0 && !state.unlocked.includes(nextLevel.mode)) {
    window.location.hash = "#/journey"; // Jump to list if tier is locked
    return;
  }

  // 4. Calculate the index within the new tier for the URL
  const tierLevels = JOURNEY_DATA.filter((l) => l.mode === nextLevel.mode);
  const idxInTier = tierLevels.indexOf(nextLevel);

  // 5. Navigate
  window.location.hash = `#/journey/${nextLevel.mode}/${idxInTier}`;
}
function navDate(dir) {
  // 1. Parse the current date from the state
  const currentDate = new Date(cur.id);

  // 2. Add/Subtract the day
  currentDate.setDate(currentDate.getDate() + dir);

  // 3. Format back to YYYY-MM-DD
  const targetDateStr = currentDate.toISOString().split("T")[0];

  // 4. Boundary Checks
  const todayStr = new Date().toISOString().split("T")[0];
  const launchStr = CONFIG.launchDate;

  // Gatekeeper: Don't go past today or before launch
  if (targetDateStr > todayStr || targetDateStr < launchStr) return;

  // 5. Update Hash
  window.location.hash = `#/daily/${targetDateStr}`;
}
// function showScreen(id) {
//   document
//     .querySelectorAll(".screen")
//     .forEach((s) => s.classList.remove("active"));
//   document.getElementById(id).classList.add("active");
//   if (id === "screen-home") initFreePlay();
// }
// function showScreen(id) {
//   // 1. Hide all screens
//   document.querySelectorAll(".screen").forEach((s) => {
//     s.classList.remove("active");
//   });

//   const target = document.getElementById(id);
//   if (target) {
//     target.classList.add("active");

//     // 2. Aggressive scroll reset
//     // This handles both the internal div scroll and the mobile body scroll
//     target.scrollTop = 0;
//     window.scrollTo(0, 0);

//     // 3. Fallback for browsers that "remember" scroll position too well
//     setTimeout(() => {
//       target.scrollTop = 0;
//       window.scrollTo(0, 0);
//     }, 10);
//   }

//   if (id === "screen-home") {
//     initFreePlay();
//     document.querySelectorAll(".subtitle-ui").forEach(el => el.innerText = "FREE PLAY");
//   }
// }
function showScreen(id) {
  // 1. Reset ALL screens' scroll position before hiding them
  document.querySelectorAll(".screen").forEach((s) => {
    s.scrollTop = 0;
    s.classList.remove("active");
  });

  // 2. Reset window scroll
  window.scrollTo(0, 0);
  document.body.scrollTop = 0;
  document.documentElement.scrollTop = 0;

  const target = document.getElementById(id);
  if (target) {
    // 3. Force immediate scroll reset before making visible
    target.scrollTop = 0;

    // 4. Make the screen visible
    target.classList.add("active");

    // 5. Force reflow to ensure scroll takes effect
    void target.offsetHeight;

    // 6. Double-check scroll position after render
    requestAnimationFrame(() => {
      target.scrollTop = 0;
      window.scrollTo(0, 0);
      document.body.scrollTop = 0;
      document.documentElement.scrollTop = 0;
    });
  }

  if (id === "screen-home") {
    initFreePlay();
    document
      .querySelectorAll(".subtitle-ui")
      .forEach((el) => (el.innerText = "FREE PLAY"));
  }
}
function initFreePlay() {
  const min = CONFIG.freePlay.minDrops,
    max = CONFIG.freePlay.maxDrops;
  let all = [];
  for (let r = 0; r <= 9; r++) {
    for (let g = 0; g <= 9; g++) {
      for (let b = 0; b <= 9; b++) {
        const t = r + g + b;
        if (t >= min && t <= max) all.push({ r, g, b, total: t });
      }
    }
  }
  const missing = all.filter((c) => !state.atlas[`${c.r}-${c.g}-${c.b}`]);
  const recipe = (missing.length > 0 ? missing : all)[
    Math.floor(Math.random() * (missing.length || all.length))
  ];
  recipe.name = `R${recipe.r}G${recipe.g}B${recipe.b}`;
  cur = {
    type: "free",
    recipe,
    drops: { r: 0, g: 0, b: 0, t: 0 },
    tries: 1,
    undosUsed: 0,
    history: [],
  };
  resetUI();
}

function renderJourney() {
  document
    .querySelectorAll(".subtitle-ui")
    .forEach((el) => (el.innerText = "Journey"));

  const cont = document.getElementById("journey-content");
  cont.innerHTML = "";
  CONFIG.tiers.forEach((t) => {
    const tierLevels = JOURNEY_DATA.filter((l) => l.mode === t.id);
    const solved = tierLevels.filter((l) => state.levels[l.id]).length;
    const header = document.createElement("div");
    header.className = "mode-header";
    header.innerHTML = `<div>${t.name.toUpperCase()}</div><span>${solved}/${
      tierLevels.length
    }</span>`;
    cont.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "level-grid";
    if (!state.unlocked.includes(t.id)) grid.style.opacity = "0.1";

    tierLevels.forEach((l, i) => {
      const d = state.levels[l.id];
      const item = document.createElement("div");
      item.className = "lvl-item";

      // Logic: Use l.name from your new JSON structure
      item.innerHTML = `
        <div class="lvl-sq ${d ? "solved" : ""}" 
             style="background:${recipeToRGB(l)}" 
             onclick="if(state.unlocked.includes('${
               t.id
             }')) window.location.hash='#/journey/${t.id}/${i}'">
        </div>
        <div class="journey-color-name">
            ${l.name}
        </div>
        <div class="lvl-stars">${d && d.stars ? "★".repeat(d.stars) : ""}</div>
    `;
      grid.appendChild(item);
    });
    cont.appendChild(grid);
  });
  showScreen("screen-journey");
  const screenJourney = document.getElementById("screen-journey");
  if (screenJourney) screenJourney.scrollTop = 0;
}

function renderDaily() {
  const grid = document.getElementById("calendar-ui");
  grid.innerHTML = "";
  const todayStr = new Date().toISOString().split("T")[0];
  const monthName = new Date(viewingYear, viewingMonth).toLocaleString(
    "default",
    { month: "long" }
  );
  document.getElementById(
    "calendar-month"
  ).innerText = `${monthName.toUpperCase()} ${viewingYear}`;

  const daysInMonth = new Date(viewingYear, viewingMonth + 1, 0).getDate();
  const firstDayIndex = new Date(viewingYear, viewingMonth, 1).getDay();

  // 1. Padding for start of month (Wrapped in cal-item for symmetry)
  for (let i = 0; i < firstDayIndex; i++) {
    const item = document.createElement("div");
    item.className = "cal-item";

    const emptyDay = document.createElement("div");
    emptyDay.className = "cal-day empty";

    const emptyStars = document.createElement("div");
    emptyStars.className = "cal-stars-row";

    item.appendChild(emptyDay);
    item.appendChild(emptyStars);
    grid.appendChild(item);
  }
  // 2. Real Days
  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = `${viewingYear}-${String(viewingMonth + 1).padStart(
      2,
      "0"
    )}-${String(d).padStart(2, "0")}`;

    const item = document.createElement("div");
    item.className = "cal-item";

    const day = document.createElement("div");
    day.className = "cal-day";
    day.innerText = d;
    const solvedData = state.daily[dateKey];
    const isFuture = dateKey > todayStr;
    const isBeforeLaunch = dateKey < CONFIG.launchDate;

    // --- SEED COLOR LOGIC ---
    // Generate the color for THIS day regardless of whether it's solved
    const dailyRecipe = getSeededDailyRecipe(dateKey);
    const dailyColor = recipeToRGB(dailyRecipe);

    if (isFuture || isBeforeLaunch) {
      day.classList.add("locked");
    } else {
      if (solvedData) {
        day.classList.add("solved");
        day.style.backgroundColor = solvedData.color || solvedData;
        day.style.borderColor = "transparent";
      } else {
        // UNFINISHED: Apply the target color as a border hint
        day.classList.add("unfinished");
        day.style.borderColor = dailyColor;
        // Add a very subtle inner glow of the target color
        day.style.boxShadow = `inset 0 0 8px ${dailyColor}33`;
      }

      day.onclick = () => (window.location.hash = `#/daily/${dateKey}`);
    }
    const starRow = document.createElement("div");
    starRow.className = "cal-stars-row";
    if (solvedData && solvedData.stars) {
      starRow.innerText = "★".repeat(solvedData.stars);
    }

    item.appendChild(day);
    item.appendChild(starRow);
    grid.appendChild(item);
  }
  showScreen("screen-daily");
}

function renderCollection(sortBy = "hue") {
  const grid = document.getElementById("collection-grid");
  grid.innerHTML = "";
  let items = Object.keys(state.atlas).map((key) => {
    const [r, g, b] = key.split("-").map(Number);
    return {
      key,
      r,
      g,
      b,
      total: r + g + b,
      dateLabel: formatDisplayDate(state.atlas[key].date),
      rawDate: new Date(state.atlas[key].date),
      ...state.atlas[key],
    };
  });
  if (items.length === 0) {
    grid.innerHTML =
      "<p style='grid-column: 1/-1; color:#444; text-align:center; margin-top:50px;'>Empty collection.</p>";
    return;
  }

  if (sortBy === "hue") {
    grid.classList.add("hide-labels");
    items.sort((a, b) => getHue(a.r, a.g, a.b) - getHue(b.r, b.g, b.b));
    items.forEach((item) => appendSwatch(grid, item));
  } else {
    grid.classList.remove("hide-labels");
    const sortKey = sortBy === "drops" ? "total" : "dateLabel";
    if (sortBy === "drops") items.sort((a, b) => a.total - b.total);
    else items.sort((a, b) => b.rawDate - a.rawDate);

    let lastGroup = null;
    items.forEach((item) => {
      if (item[sortKey] !== lastGroup) {
        const h = document.createElement("div");
        h.className = "collection-header";
        h.innerText =
          sortBy === "drops" ? `${item.total} Drops` : item.dateLabel;
        grid.appendChild(h);
        lastGroup = item[sortKey];
      }
      appendSwatch(grid, item);
    });
  }
  document.getElementById(
    "collection-stats"
  ).innerText = `COLLECTED: ${items.length}`;
  showScreen("screen-collection");
}

function appendSwatch(container, item) {
  const div = document.createElement("div");
  div.className = "lvl-item";
  div.innerHTML = `<div class="lvl-sq" style="background: ${recipeToRGB(
    item
  )}"></div><div style="font-size: 0.6rem; color: var(--text-dim); margin-top: 4px;">r${
    item.r
  }g${item.g}b${item.b}</div>`;
  container.appendChild(div);
}

function getHue(r, g, b) {
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  if (max === min) return 0;
  let h =
    r === max
      ? (g - b) / (max - min)
      : g === max
      ? 2 + (b - r) / (max - min)
      : 4 + (r - g) / (max - min);
  return h < 0 ? h + 6 : h;
}

function changeMonth(dir) {
  // 1. Create target date based on current view
  const targetDate = new Date(viewingYear, viewingMonth + dir, 1);

  // 2. Normalize Today and Launch dates to the 1st of the month
  const today = new Date();
  const maxLimit = new Date(today.getFullYear(), today.getMonth(), 1);

  const launch = new Date(CONFIG.launchDate);
  const minLimit = new Date(launch.getFullYear(), launch.getMonth(), 1);

  // 3. Comparison
  if (
    targetDate.getTime() < minLimit.getTime() ||
    targetDate.getTime() > maxLimit.getTime()
  ) {
    return; // Blocked
  }

  viewingMonth = targetDate.getMonth();
  viewingYear = targetDate.getFullYear();
  renderDaily();
}

function formatDisplayDate(s) {
  return new Date(s).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getContrastYIQ(rgb) {
  const m = rgb.match(/\d+/g);
  return (m[0] * 299 + m[1] * 587 + m[2] * 114) / 1000 >= 128
    ? "light"
    : "dark";
}
function getSeededDailyRecipe(dateStr) {
  // 1. Create a numeric seed from the date (e.g., "2025-12-24" -> 20251224)
  const seed = parseInt(dateStr.replace(/-/g, ""));

  // Simple pseudo-random function based on the seed
  const sRandom = (s) => {
    const x = Math.sin(s) * 10000;
    return x - Math.floor(x);
  };

  const min = CONFIG.dailyRange.minDrops;
  const max = CONFIG.dailyRange.maxDrops;

  // 2. Generate Total Drops (Seeded)
  const total = Math.floor(sRandom(seed) * (max - min + 1)) + min;

  // 3. Distribute Drops (Seeded)
  // We offset the seed for each channel so they aren't the same
  let r = Math.floor(sRandom(seed + 1) * Math.min(10, total + 1));
  let g = Math.floor(sRandom(seed + 2) * Math.min(10, total - r + 1));
  let b = total - r - g;

  return {
    r,
    g,
    b,
    total,
    name: `Daily ${formatDisplayDate(dateStr)}`,
  };
}
function saveLevel(s) {
  const id = cur.recipe.id;
  if (!state.levels[id] || s > (state.levels[id].stars || 0))
    state.levels[id] = { stars: s };
  const tierLevels = JOURNEY_DATA.filter((l) => l.mode === cur.tierId);
  if (
    tierLevels.filter((l) => state.levels[l.id]).length / tierLevels.length >=
    0.7
  ) {
    const next = CONFIG.tiers.findIndex((t) => t.id === cur.tierId) + 1;
    if (CONFIG.tiers[next] && !state.unlocked.includes(CONFIG.tiers[next].id))
      state.unlocked.push(CONFIG.tiers[next].id);
  }
  save();
}

function saveDaily(color, stars) {
  if (cur.id) {
    state.daily[cur.id] = { color, stars, date: new Date().toISOString() };
    save();
  }
}
function save() {
  localStorage.setItem("hf_final_v1", JSON.stringify(state));
}

function saveToAtlas() {
  const key = `${cur.recipe.r}-${cur.recipe.g}-${cur.recipe.b}`;
  if (!state.atlas[key]) {
    state.atlas[key] = { date: new Date().toISOString(), undos: cur.undosUsed };
    save();
  }
}

function shareGame() {
  const isWon =
    document.getElementById(cur.type === "free" ? "free-match" : "game-match")
      .innerText === "100%";
  const url = window.location.href;
  let text = isWon
    ? `🎨 HueFlow Masterpiece! R${cur.recipe.r} G${cur.recipe.g} B${cur.recipe.b} matched in ${cur.undosUsed} undos.\n${url}`
    : `Can you match this? 🎨 I'm playing HueFlow!\n${url}`;
  navigator.clipboard.writeText(text);
  // Inside shareGame()
  const p = cur.type === "free" ? "free" : "game";
  const resEl = document.getElementById(`${p}-res-text`);
  const originalText = resEl.innerText;
  const originalClass = resEl.className;

  resEl.innerText = "Link Copied!";
  resEl.className = "res-text info"; // Switch to purple

  setTimeout(() => {
    resEl.innerText = originalText;
    resEl.className = originalClass; // Switch back
  }, 2000);
}

function initProgressToggle() {
  document.querySelectorAll(".progress-area").forEach((area) => {
    area.style.cursor = "pointer";
    area.onclick = () => {
      state.barPreference =
        state.barPreference === "action" ? "result" : "action";
      save();
      applyBarPreference();
    };
  });
}
function renderTutorialPage() {
  const grid = document.getElementById("tutorial-grid"); // Reuse grid container
  grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 20px;">
            <p style="font-size: 0.9rem; margin-bottom: 30px; color: #aaa;">Mixing light (Additive) is different from mixing paint (Subtractive).</p>
            
            <div class="tutorial-header">Primary Mixes</div>
            <div class="equation"><div class="dot red"></div> + <div class="dot green"></div> = <div class="dot yellow"></div> Yellow</div>
            <div class="equation"><div class="dot green"></div> + <div class="dot blue"></div> = <div class="dot cyan"></div> Cyan</div>
            <div class="equation"><div class="dot red"></div> + <div class="dot blue"></div> = <div class="dot magenta"></div> Magenta</div>
            
            <div class="tutorial-header">The Neutral Balance</div>
            <div class="equation"><div class="dot red"></div> + <div class="dot green"></div> + <div class="dot blue"></div> = <div class="dot white"></div> White/Gray</div>
            
            <p style="font-size: 0.8rem; margin-top: 30px; line-height: 1.6;">
                <b>Recipe Accuracy:</b> Match the target ratio.<br>
                <b>Undo:</b> Step back if you add too much of a color.<br>
                <b>Collection:</b> Every unique match is saved to your Atlas.
            </p>
            
            <button class="nav-btn" style="margin-top: 40px;" onclick="window.location.hash = '#/'">Return to Game</button>
        </div>
    `;
  showScreen("screen-tutorial");
  document
    .querySelectorAll(".subtitle-ui")
    .forEach((el) => (el.innerText = "HOW TO PLAY"));
}
function applyBarPreference() {
  const pref = state.barPreference;
  document
    .querySelectorAll(".action-bar-wrapper")
    .forEach((el) => (el.style.display = pref === "action" ? "flex" : "none"));
  document
    .querySelectorAll(".result-bar-wrapper")
    .forEach((el) => (el.style.display = pref === "result" ? "flex" : "none"));
}
function disableButtons(val) {
  // val is true to lock buttons, false to unlock them
  const p = cur.type === "free" ? "free" : "game";

  const buttons = [
    document.getElementById(`${p}-btn-r`),
    document.getElementById(`${p}-btn-g`),
    document.getElementById(`${p}-btn-b`),
  ];

  buttons.forEach((btn) => {
    if (btn) btn.disabled = val;
  });
}
let currentTutorialStep = 0;

function advanceTutorial() {
  const slides = document.querySelectorAll(".tutorial-slide");
  slides[currentTutorialStep].classList.remove("active");
  currentTutorialStep++;

  if (currentTutorialStep < slides.length) {
    slides[currentTutorialStep].classList.add("active");
    if (currentTutorialStep === slides.length - 1) {
      document.getElementById("tutorial-btn").innerText = "Start Journey";
    }
  } else {
    closeTutorial();
  }
}

function closeTutorial() {
  document.getElementById("tutorial-modal").style.display = "none";
  state.tutorialSeen = true;
  save();
}
router();
