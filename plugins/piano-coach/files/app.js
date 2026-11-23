// Piano coach: a two-octave keyboard (C4 to B5) with a small synth, lessons
// that light up the next key, and exercises the user's AI model writes.
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const KEYS = []; // { note: "C4", midi, black }
for (let octave = 4; octave <= 5; octave++)
  NAMES.forEach((name, at) => KEYS.push({ note: name + octave, midi: 12 * (octave + 1) + at, black: name.includes("#") }));

// Computer keys for the first octave and a half.
const KEYMAP = { a: "C4", w: "C#4", s: "D4", e: "D#4", d: "E4", f: "F4", t: "F#4", g: "G4", y: "G#4", h: "A4", u: "A#4", j: "B4", k: "C5", o: "C#5", l: "D5", p: "D#5", ";": "E5" };

const LESSONS = [
  { title: "C major scale", notes: "C4 D4 E4 F4 G4 A4 B4 C5" },
  { title: "Chords: C, F, G", notes: "C4 E4 G4 F4 A4 C5 G4 B4 D5" },
  { title: "Ode to Joy", notes: "E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4 D4 D4" },
  { title: "Twinkle, twinkle", notes: "C4 C4 G4 G4 A4 A4 G4 F4 F4 E4 E4 D4 D4 C4" },
  { title: "Five-finger warm-up", notes: "C4 D4 E4 F4 G4 F4 E4 D4 C4" },
].map((lesson) => ({ ...lesson, notes: lesson.notes.split(" ") }));

let audio = null;
function play(note, length = 0.6) {
  const key = KEYS.find((each) => each.note === note);
  if (!key) return;
  audio = audio || new AudioContext();
  const now = audio.currentTime;
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.35, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + length);
  gain.connect(audio.destination);
  for (const [type, detune, level] of [["triangle", 0, 1], ["sine", 1200, 0.25]]) {
    const osc = audio.createOscillator();
    const part = audio.createGain();
    part.gain.value = level;
    osc.type = type;
    osc.frequency.value = 440 * Math.pow(2, (key.midi - 69) / 12);
    osc.detune.value = detune;
    osc.connect(part).connect(gain);
    osc.start(now);
    osc.stop(now + length + 0.05);
  }
}

// ---- The keyboard
const board = document.getElementById("keyboard");
const elements = new Map();
const whites = KEYS.filter((key) => !key.black);
whites.forEach((key) => {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "white";
  el.setAttribute("aria-label", key.note);
  const label = Object.entries(KEYMAP).find(([, note]) => note === key.note);
  el.innerHTML = key.note.startsWith("C") ? key.note : label ? `<kbd>${label[0].toUpperCase()}</kbd>` : "";
  board.appendChild(el);
  elements.set(key.note, el);
});
KEYS.filter((key) => key.black).forEach((key) => {
  const before = whites.findIndex((white) => white.midi === key.midi - 1);
  const el = document.createElement("button");
  el.type = "button";
  el.className = "black";
  el.setAttribute("aria-label", key.note);
  el.style.left = `calc(${((before + 1) / whites.length) * 100}% - 2.1%)`;
  board.appendChild(el);
  elements.set(key.note, el);
});

function press(note) {
  const el = elements.get(note);
  if (!el) return;
  play(note);
  el.classList.add("down");
  setTimeout(() => el.classList.remove("down"), 160);
  check(note);
}
board.addEventListener("pointerdown", (event) => {
  const el = event.target.closest("button");
  if (el) press(el.getAttribute("aria-label"));
});
window.addEventListener("keydown", (event) => {
  if (event.repeat || event.metaKey || event.ctrlKey) return;
  const note = KEYMAP[event.key.toLowerCase()];
  if (note) press(note);
});

// ---- Lessons
const notesEl = document.getElementById("notes");
const statusEl = document.getElementById("status");
const scoreEl = document.getElementById("score");
const totalEl = document.getElementById("total");
let lesson = LESSONS[0];
let position = 0;
let score = 0;

function render() {
  notesEl.innerHTML = "";
  lesson.notes.forEach((note, at) => {
    const el = document.createElement("span");
    el.className = "note" + (at < position ? " done" : at === position ? " next" : "");
    el.textContent = note.replace(/\d/, "");
    notesEl.appendChild(el);
  });
  for (const [note, el] of elements) el.classList.toggle("lit", note === lesson.notes[position]);
  scoreEl.textContent = score;
  totalEl.textContent = lesson.notes.length;
}

function choose(next) {
  lesson = next;
  position = 0;
  score = 0;
  statusEl.textContent = "";
  document.querySelectorAll("#lessons .chip").forEach((chip) => chip.setAttribute("aria-pressed", String(chip.dataset.title === lesson.title)));
  render();
}

function check(note) {
  if (position >= lesson.notes.length) return;
  if (note === lesson.notes[position]) {
    score++;
    position++;
    if (position === lesson.notes.length) finished();
  } else {
    const next = notesEl.children[position];
    next?.classList.remove("miss");
    void next?.offsetWidth;
    next?.classList.add("miss");
    score = Math.max(0, score - 1);
  }
  render();
}

async function finished() {
  statusEl.textContent = `Well played! ${score} of ${lesson.notes.length}.`;
  try {
    const key = `best:${lesson.title}`;
    const best = (await betterVault.call("storage.get", { key })) || 0;
    if (score > best) {
      await betterVault.call("storage.set", { key, value: score });
      statusEl.textContent += " A new best.";
    }
  } catch {
    // Storage is a nicety.
  }
}

document.getElementById("restart").addEventListener("click", () => choose(lesson));
document.getElementById("listen").addEventListener("click", () => {
  lesson.notes.forEach((note, at) => setTimeout(() => { play(note, 0.45); }, at * 420));
});

const lessonsEl = document.getElementById("lessons");
function addLesson(next) {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "chip";
  chip.dataset.title = next.title;
  chip.textContent = next.title;
  chip.addEventListener("click", () => choose(next));
  lessonsEl.appendChild(chip);
}
LESSONS.forEach(addLesson);

// ---- Exercises from the user's AI model (permission use:ai)
const aiButton = document.getElementById("ai");
aiButton.addEventListener("click", async () => {
  aiButton.disabled = true;
  statusEl.textContent = "Writing a new exercise…";
  try {
    const { object } = await betterVault.call("ai.generate", {
      prompt:
        "Write one short piano exercise for a beginner: 8 to 16 notes, only from C4 to B5, written like C4 or F#5. Give it a short title.",
      schema: {
        type: "object",
        properties: {
          title: { type: "string" },
          notes: { type: "array", items: { type: "string" } },
        },
        required: ["title", "notes"],
      },
    });
    const notes = (object?.notes || []).filter((note) => KEYS.some((key) => key.note === note));
    if (notes.length < 4) throw new Error("The exercise had too few playable notes.");
    const next = { title: String(object.title || "AI exercise").slice(0, 40), notes };
    addLesson(next);
    choose(next);
  } catch (error) {
    statusEl.textContent = error.message.includes("use:ai")
      ? "Allow “Use your AI model” for this plugin in Settings → Plugins to get exercises."
      : `Couldn't write an exercise: ${error.message}`;
  } finally {
    aiButton.disabled = false;
  }
});

choose(LESSONS[0]);
