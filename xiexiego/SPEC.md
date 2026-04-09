# XieXieGo: Product Specification and Technical Design

## A phone-first web app for Chinese dictation practice, ages 4–10

**The name.** XieXieGo — 写写 ("write write") puns on 谢谢 ("thank you"), the first Chinese word every BUMI kid knows. The double meaning is warm, kid-friendly, and instantly recognizable to the target audience.

**The scope.** XieXieGo is a focused tool for practicing weekly 听写 (dictation) word lists. It is not a Mandarin curriculum, not a reading comprehension tool, not a broad language-learning app. Its job is to take the characters a teacher has assigned for this week's dictation test and help the kid be ready to pass that test by Friday. Everything in the app serves that outcome.

**The pedagogy.** Strict no-pinyin on child-facing activities. Five-stage mastery progression. Modified 3-box Leitner spaced repetition with same-day second exposure for new words. Response time as a silent difficulty signal. Interleaved practice of confusion pairs. Hints available everywhere, treated as a learning signal. Encouraging growth-mindset feedback — "Not yet!" never "Wrong." Four neutral difficulty levels that auto-adjust silently. Compound discovery for compositional two-character words.

**The tech.** Vanilla JavaScript with native ES modules, HanziWriter.js for stroke practice, localStorage for persistence, Firebase (Firestore only) for optional word bank sharing. No build step — libraries load from CDN. Hosted at xin-squared.com/xiexiego as a subfolder of an existing repo with automatic deployment. Client-side PDF generation for printable worksheets. Web Speech API for pronunciation checking with self-assessment fallback.

---

## 1. Scope boundary

**XieXieGo IS:**
- A dictation test prep tool for weekly 听写 word lists
- Parent-managed, kid-operated, phone-first
- A 5–10 minute daily utility, typically used in the car or at bedtime
- A complement to immersion school instruction

**XieXieGo is NOT:**
- A Mandarin curriculum (parents provide word lists; app doesn't suggest its own)
- A reading comprehension tool (no story library, no graded readers)
- A speaking tutor (pronunciation check exists but tone scoring is out of scope)
- A replacement for classroom instruction or a broad learning app

Every feature decision is evaluated against: does this make the 5-minute dictation prep session better? If yes, it's in. If it expands the app into a broader learning tool, it's out.

---

## 2. Pedagogical design

### Why no pinyin

Research is clear. Tan et al. (PNAS) found pinyin typing negatively correlates with reading development. Mainland China reversed pinyin-first instruction in 2017. For BUMI kids specifically, the case is overwhelming — they hear Mandarin 80% of their school day, they know these words orally, and what they need is to bind those sounds directly to visual characters without romanization in the way.

Pinyin never appears in any child-facing activity. The data model stores pinyin for internal enrichment and for the printable worksheets (which show it exactly once, at the reference character, as a pronunciation aid for screen-free practice), but it never appears on practice screens.

### Five-stage mastery progression

Each word moves through five stages from introduction to test-readiness:

**Stage 1 — Exposure.** Character displays large, audio plays, meaning shows, stroke order animates. The kid sees the character as a complete visual-semantic unit. For two-character compounds whose components are both already known, this stage becomes the compound discovery activity instead. Duration: 10–15 seconds. No assessment.

**Stage 2 — Recognition.** Passive recall through multiple-choice activities. "Hear audio → tap correct character" or "see character → tap correct meaning." Advances after 2 consecutive correct answers.

**Stage 3 — Guided Recall.** Scaffolded production. Stroke-by-stroke tracing with visible guides, or free-trace with stroke-order checking. Advances after 2 consecutive correct answers without hints.

**Stage 4 — Free Recall.** Flash-and-write from memory, or audio-to-character free writing. Directly mirrors the 听写 test format. Advances after 2 consecutive correct answers.

**Stage 5 — Test Ready.** Fully unscaffolded dictation practice. Mixed review. Eligible for test mode.

**Failure handling uses graceful regression.** Failing at Stage 4 drops the word to Stage 3 briefly. Failing three times at the same stage triggers a full regression plus a "tricky word" message that normalizes difficulty ("This one is tricky for lots of kids!").

### Spaced repetition: modified 3-box Leitner

Full SM-2 is far too complex for a 4-year-old. FSRS requires thousands of reviews to calibrate. XieXieGo uses a modified 3-box Leitner system with binary grading modulated by response time.

**Box 1 (Learning):** Reviewed every session. All new words start here. Words answered wrong from any box return here.

**Box 2 (Practicing):** Reviewed every 2–3 days. Words advance here after 2 consecutive correct-and-fast answers in Box 1.

**Box 3 (Mastered):** Reviewed every 5–7 days. Words advance here after 2 consecutive correct-and-fast answers in Box 2. After 3 consecutive correct reviews in Box 3, a word graduates and enters light maintenance review.

**Response time modulates advancement.** A correct answer that takes longer than 2× the kid's median response time for that activity type does NOT count toward advancement — it resets the `consecutiveCorrect` counter to zero but doesn't send the word back a box. A correct answer faster than 50% of median counts double. This ensures the kid has fluent recall, not just eventual recall.

**Two slow responses in a row are required to trigger the hold.** A single slow response is treated as noise (kid was distracted). This prevents punishing kids for looking out the car window.

**Same-day second exposure.** When a new word is introduced in a session, it's flagged for a second touch before session end. The second touch is forced to a fast activity type (recognition or meaning-match), not a slow one (writing). This compresses the traditional "Day 1 → Day 2" spacing into "minute 1 → minute 5" of the same session, which the research shows dramatically improves overnight retention for young children.

**Session structure (5–10 minutes):**
1. Introduce 1–3 new words depending on difficulty level (1–2 minutes)
2. Review all Box 1 words with interleaved activities (3–4 minutes)
3. Review due Box 2/3 words (2–3 minutes)
4. Same-day second exposure for new words introduced this session (30 seconds)
5. Celebration screen with optional continue

Maximum 15 word interactions per session to prevent fatigue. Sessions always end on a success, never on failure.

### Interleaving of confusion pairs

When the current session contains two or more characters from the same confusion group (see confusion-pair list in Appendix A), the session planner forces them to be practiced consecutively, alternating: 大 recognition → 太 recognition → 大 writing → 太 writing. The brain is forced to compare the distinguishing feature.

Interleaving does NOT apply to words in Stage 1 Exposure or freshly introduced this session — novices need consecutive touches to build initial encoding. The rule kicks in once words reach Stage 2 Recognition or higher.

The session planner also enforces skill-type alternation: no more than two activities of the same type (recognition, writing, meaning-match) in a row. This keeps sessions feeling varied and reinforces multi-modal encoding.

### Error handling: never shaming

Every error message follows these principles: never "Wrong" or "Incorrect," always paired with encouragement, always uses "yet" language, shows the correct answer alongside the attempt, rotates messages to prevent habituation.

Example messages on wrong answers:
- "Not quite yet! Let's try again! 🌟"
- "Almost! Your brain is growing stronger! 🧠"
- "Tricky one! Let's look at it together ✨"
- "Keep going! Practice makes progress! 🚀"
- "You're brave for trying! One more go! 💫"

Example messages after showing the correct answer:
- "Now you know! You'll get it next time! 📝"
- "Mistakes help your brain grow! 🌈"

Example messages on correct-after-retry:
- "YES! You got it! 🎉"
- "You didn't give up! 🏆"

Correct answers trigger green glow, brief confetti, warm chime. Incorrect answers trigger gentle orange highlight (never red), a wobble animation, soft "boop" sound. No hearts, no lives, unlimited retries. The app celebrates the act of retrying itself.

### Hints are a learning signal, never a penalty

Every activity exposes a hint button — prominent, inviting, never hidden. Hint use is logged and feeds the difficulty signal system the same way retries and slow response times do. A kid who uses hints frequently on a word is still learning it, so the adaptive system keeps that word in Box 1 and may offer more scaffolding on future encounters.

**Hints are explicitly framed as smart problem-solving.** Tapping the hint button triggers a small "Good idea to check!" micro-celebration. Nothing about the feedback suggests hint use is a failure. Over time, a kid who uses hints less on the same word is visibly advancing, but the app never calls out hint use as a problem.

Hint design per activity:
- **Audio recognition:** Wrong options dim after a pause
- **Meaning matching:** Component breakdown reveals
- **Stroke tracing:** Stroke order animation replays
- **Free write:** Outline flashes briefly
- **Example phrase fill-in:** Audio replays with emphasis on the missing word

### Test mode

Test mode mimics classroom 听写 format exactly. Audio plays each word twice with a 3-second pause between readings. The kid writes on a blank canvas with no scaffolding — no hints, no illustrations, no outlines. After tapping Done, the correct character appears for self-checking. Kid self-grades "Got It ✓" or "Not Yet ✗."

**Test mode runs on any subset of the word bank, including words the kid has never practiced.** The parent can:
- Run test mode on current practice words (everything in Box 2+)
- Build a custom test by selecting specific words, including brand-new ones
- Add new words directly into a test, which adds them to the word bank simultaneously

**After the test, results feed back into Box state:**
- Words answered correct-and-fast → promoted to Box 3
- Words answered correct-but-slow → placed at Box 2
- Words answered wrong → placed at Box 1, flagged for full Stage 1 treatment

**Parents can hover and read the words themselves** during test mode if they prefer their own voice or accent over the TTS. The app plays audio on tap and gives enough spacing for parents to speak in between. No explicit "parent reads" mode toggle — parents just do it naturally if they want.

**When to recommend test mode:** When 70%+ of a word list has reached Box 2 or higher. Never recommended when most words are still in Box 1 (that would be discouraging). Kids can always choose test mode voluntarily.

### Four neutral difficulty levels

XieXieGo uses four levels labeled simply "Level 1" through "Level 4." No fancy names, no metaphors, no judgment. Parent-facing descriptions are short and plain:

- **Level 1** — Gentlest pace. Lots of scaffolding. Shortest sessions. Default starting point for ages 4–5.
- **Level 2** — Gentle pace. Most scaffolding. Short sessions. Default starting point for ages 5–6.
- **Level 3** — Standard pace. Standard scaffolding. Medium sessions. Default starting point for ages 6–8.
- **Level 4** — Faster pace. Lighter scaffolding. Longer sessions. Default starting point for ages 8–10.

Internally, each level sets specific parameters (session length, new words per session, multiple choice distractors, HanziWriter leniency, hint threshold, target success rate) but parents don't see numbers — they see the descriptive labels.

**Auto-bump without confirmation.** The system silently moves a kid up or down a level when two weeks of behavior warrant it. Over-performing (consistently exceeding target success rate AND completing full sessions) triggers a bump up. Under-performing (consistently missing target OR abandoning sessions) triggers a bump down. No popup, no parent nudge — the change is invisible to the kid and visible to the parent only if they check settings.

**Parent override locks the level.** If a parent manually sets the level in settings, the auto-bump system stops adjusting that profile. The parent has to unlock (a single tap in settings) to re-enable auto-bump.

From the kid's perspective, the app just feels "right" for them at any given time. No level label is shown to kids.

### Reinforce-at-home suggestions (v1.5)

The parent dashboard offers 1–3 optional suggestions per day for screen-free practice aligned to the kid's current struggles. Rule-based, keyed to observed signals:

- **Visual confusion** (mixing up similar characters) → "Try drawing 口 and 日 in the air together. Ask Ada what's different — she'll spot the line inside."
- **Stroke order struggle** → "Ada is figuring out how to write 学. Draw it together on a napkin at dinner. The roof 宀 comes first, then the child 子."
- **Meaning recall** → "Next time you walk past a school, point and say '学校!' She'll connect the word to the thing."
- **Compound discovery** → "Ada knows 学 but 学校 is new. Show her the parts — 学 (study) + 校 (school). Ask: what do you think they mean together?"

Never notifications. Never guilt. Low-pressure optional suggestions on the dashboard, always includes an expandable "why this helps" for parent education.

---

## 3. Activity catalog

| Activity | Stage | Difficulty | Time | Pass Criteria |
|---|---|---|---|---|
| Exposure | 1 | Introduction | 10–15s | No assessment |
| Compound Discovery | 1 | Introduction | 15–20s | No assessment |
| Audio Recognition | 2 | Easy | 8–12s | Correct tap within 2 attempts |
| Meaning Matching | 2 | Easy | 8–12s | Correct tap within 2 attempts |
| Stroke Tracing | 3 | Guided | 15–25s | ≤3 total stroke mistakes |
| Free Trace | 3–4 | Medium | 15–20s | ≤2 mistakes, no hints |
| Flash and Write | 4 | Hard | 20–30s | ≤2 mistakes |
| Free Write (Dictation) | 4–5 | Hardest | 15–25s | ≤1 mistake, no hints |
| Audio Production | 4 | Hard | 10–15s | Speech API match (or self-assess) |
| Example Phrase Fill-in | 4 | Medium-hard | 12–18s | Correct tap |
| Component Breakdown | 1–2 (supplementary) | Introduction | 10–20s | No assessment |

### Detailed activity specifications

**Exposure (Stage 1).** Character displays large (120pt), audio plays automatically, English meaning shows below, stroke order animates. Kid taps the character to hear audio again. A "Continue" button appears after 8 seconds. Component breakdown appears below for characters with meaningful parts.

**Compound Discovery (Stage 1, replaces Exposure for compositional compounds).** Triggered when a new word is a two-character compound AND both component characters are already at Box 2+ in this profile. The two component characters appear side-by-side, each with a glow. Audio plays each: "学 — study. 校 — school building." The characters animate toward each other and snap together. The compound displays. Audio plays the compound. Brief narration: "学 plus 校 makes 学校 — school!" No interaction required for MVP — the pure aha moment is enough. Picture-option guessing defers to v1.5.

**Audio Recognition (Stage 2).** Audio play button centered at top (60pt). Character options as large cards (80pt tall) in a 2×1 or 2×2 grid below — 2 options for Level 1–2, 3–4 for Level 3–4. Hint dims wrong options. Correct selection on first attempt passes; 3 wrong taps reveals correct answer.

**Meaning Matching (Stage 2).** Character or meaning/emoji displayed at top. Option cards (60pt tall) arranged vertically. Same hint pattern as Audio Recognition. Bidirectional: sometimes character → meaning, sometimes meaning → character.

**Stroke Tracing (Stage 3).** HanziWriter quiz mode with `showHintAfterMisses: 2` (Level 1–2) or 3 (Level 3–4) and `leniency: 1.5` (Level 1) down to 1.2 (Level 4). Full character outline displayed with next stroke highlighted. Kid traces each stroke. Canvas occupies 65% of screen height with 田字格 grid overlay. After 2 wrong strokes, HanziWriter highlights the correct stroke path. Pass: ≤3 total mistakes.

**Free Trace (Stage 3–4).** HanziWriter with faded outline only (no stroke highlighting). Kid writes freely; HanziWriter validates stroke order in real time. Mistakes per stroke tracked. Pass: ≤2 mistakes, no hints used.

**Flash and Write (Stage 4).** Character displays for 3 seconds with animated stroke order, then fades. Kid writes from memory on blank canvas. HanziWriter validates strokes with `showOutline: false`. After 2 wrong strokes, the first stroke flashes briefly as a start hint. Pass: ≤2 mistakes.

**Free Write / Dictation (Stage 4–5).** Audio plays the word. Kid writes on completely blank canvas with only 田字格 grid. No visual aids. Hint button reveals character outline briefly (using it counts as not passing). This is the terminal assessment — success promotes the word in the Leitner system.

**Audio Production (Stage 4).** Character displays at 120pt centered. Microphone button (60pt) below with animated listening pulse. Kid says the word aloud. Web Speech API transcribes and compares. On iOS Safari where Speech API is unreliable, falls back to self-assessment: kid hears correct pronunciation after speaking, self-rates "Got It / Not Yet."

**Example Phrase Fill-in (Stage 4).** Sentence displayed in large characters (32pt) across the top half with one character shown as a blank dashed square. Audio reads the complete sentence. Three character options (80pt each) in a row at the bottom. Hint replays audio with emphasis on the missing word. Pass: correct selection.

**Component Breakdown (supplementary, triggered for tricky words).** Character decomposed into radical and components with brief etymology. 好 shown as 女 (woman) + 子 (child) = "good." Animated assembly. Teaching moment, not assessed. Duration 10–20 seconds.

### How activities chain together for one word

**Session 1:** Exposure → Meaning Matching (2 choices) → Audio Recognition (2 choices) → same-day second touch of new words via fast Meaning Matching or Audio Recognition.

**Session 2:** Audio Recognition (3 choices) → Meaning Matching (3 choices) → Stroke Tracing (guided).

**Session 3:** Free Trace (outline visible) → Example Phrase Fill-in.

**Session 4:** Flash and Write → Free Write attempt. If successful, word moves toward Box 2/3 promotion.

**Test prep session:** Free Write from audio only → Test Mode dictation.

The session planner dynamically selects activities based on each word's current mastery stage, Leitner box position, and behind-the-scenes difficulty signals.

---

## 4. Word data model

```javascript
{
  // Core identity
  character: "学",
  id: "5b66",                   // Unicode codepoint as hex, used as key

  // Meaning & context
  meanings: ["to study", "to learn", "learning"],
  exampleSentences: [
    { zh: "我在学校学习。", en: "I study at school." }
  ],
  illustrationKey: "study_books",  // Or emoji fallback "📚"

  // Pronunciation (stored, never shown as pinyin to child)
  pinyin: "xué",                // For parent reference, worksheets, and auto-enrichment only
  tone: 2,
  audioFile: "audio/xue2.mp3",  // Pre-generated path, null if using TTS fallback

  // Character structure
  radical: "子",
  strokeCount: 8,
  decomposition: "⿱⿻冖⿱⺍冖子",  // Make Me a Hanzi decomposition
  components: ["⺍", "冖", "子"],
  etymology: {
    type: "ideographic",
    hint: "A child (子) under a roof studying"
  },

  // Compound metadata
  isCompound: false,            // True for multi-character words
  compoundComponents: null,     // ["学", "校"] for 学校
  compoundType: "compositional", // or "opaque" — determines compound discovery eligibility

  // Curriculum metadata (all optional)
  frequencyRank: 134,
  wordListIds: ["list_uuid_1"],

  // Stroke data (loaded from HanziWriter)
  strokeDataUrl: "data/characters/学.json"
}
```

### Data sources

**CC-CEDICT** — 124,839 entries, CC BY-SA 4.0. English definitions, pinyin. Parsed once into a lookup JSON keyed by simplified character, checked into the repo.

**Make Me a Hanzi** — 9,000+ characters, Arphic Public License. Radical decomposition, etymology, component breakdown. Parsed once into a lookup JSON.

**HanziWriter Data** — Individual JSON files per character with stroke SVG paths. Loaded from jsdelivr CDN (`https://cdn.jsdelivr.net/npm/hanzi-writer-data@2/`) at runtime, cached by the browser.

**Audio** — Pre-generated MP3s via Google Cloud TTS `cmn-CN-Wavenet-A` voice (free tier covers 4M characters/month, more than enough). Generated once via a Node script, stored as static files in the repo. Fallback to Web Speech API speechSynthesis for parent-added words not in the pre-generated set.

**Illustrations** — Unicode emoji as visual cues (🏫 school, 🐱 cat, 📚 study), plus a small curated SVG sprite sheet for common vocabulary categories. For characters without illustration, display component breakdown instead.

### Auto-enrichment for parent-added words

```javascript
async function enrichCharacter(char) {
  const cedict = cedictIndex[char];
  const mmah = makeMeAHanziIndex[char];
  const hasStrokes = await fetch(`https://cdn.jsdelivr.net/npm/hanzi-writer-data@2/${char}.json`)
    .then(r => r.ok).catch(() => false);

  return {
    character: char,
    meanings: cedict?.definitions || [],
    pinyin: cedict?.pinyin || null,
    radical: mmah?.radical || null,
    decomposition: mmah?.decomposition || null,
    etymology: mmah?.etymology || null,
    strokeCount: mmah?.strokeCount || null,
    hasStrokeData: hasStrokes,
    enrichmentStatus: cedict && mmah && hasStrokes ? 'complete' : 'partial'
  };
}
```

Words not found in lookups are marked `enrichmentStatus: 'manual'` and the parent is prompted to provide a meaning. Writing activities are disabled for characters without stroke data.

**Compound type detection** is attempted via simple heuristic: if CC-CEDICT meanings overlap with component character meanings, flag as `compositional`; otherwise `opaque`. Parents can override in the word bank editor. Default to `compositional` when uncertain.

---

## 5. Kid profile and progress model

### Profile schema

```javascript
// localStorage key: 'xxg_profiles'
{
  schemaVersion: 3,
  activeProfileId: "profile_ada",
  profiles: {
    "profile_ada": {
      id: "profile_ada",
      name: "Ada",          // Editable
      avatar: "🐼",         // Editable
      age: 5,              // Editable
      createdAt: "2026-04-09T10:00:00Z",
      level: 1,            // 1-4, auto-adjusted unless locked
      levelLocked: false,  // True if parent manually set
      wordBankId: "bank_ada", // Per-kid word bank
      settings: {}          // Derived from level unless overridden
    },
    "profile_luca": {
      id: "profile_luca",
      name: "Luca",
      avatar: "🦊",
      age: 4,
      createdAt: "2026-04-09T10:00:00Z",
      level: 1,
      levelLocked: false,
      wordBankId: "bank_luca"
    }
  }
}
```

### Progress schema (per profile)

```javascript
// localStorage key: 'xxg_progress_{profileId}'
{
  schemaVersion: 3,
  profileId: "profile_ada",
  words: {
    "学": {
      character: "学",
      leitnerBox: 2,
      mastery: "guided_recall",
      consecutiveCorrect: 1,
      totalAttempts: 12,
      totalCorrect: 8,
      totalMistakes: 14,
      totalHintsUsed: 3,
      averageResponseMs: 2400,
      slowResponseStreak: 0,     // Tracks "last 2 were slow"
      timesReturnedToBox1: 1,
      lastPracticed: "2026-04-09T08:30:00Z",
      nextDue: "2026-04-11T00:00:00Z",
      starFlag: {                // Priority flag
        starredAt: "2026-04-08T10:00:00Z",
        expiresAt: "2026-04-15T10:00:00Z"  // 7 days or when Box 3 reached
      },
      stageHistory: [/* ... */]
    }
  },
  medianResponseTimes: {        // Per-activity, computed after 20+ interactions
    audioRecognition: 2100,
    meaningMatching: 2500,
    strokeTracing: 12000,
    freeWrite: 18000
  },
  sessions: [/* ... */],
  testResults: [/* ... */],
  levelHistory: [               // Auto-bump audit trail
    { level: 1, changedAt: "...", reason: "initial" }
  ]
}
```

### Word bank schema (per profile)

```javascript
// localStorage key: 'xxg_wordbank_{profileId}'
{
  schemaVersion: 3,
  id: "bank_ada",
  profileId: "profile_ada",
  title: "Ada's Word Bank",
  createdAt: "2026-04-09T10:00:00Z",
  words: {
    "学": { /* word data from Section 4 */ },
    "校": { /* word data */ },
    "学校": { /* compound word data */ }
  }
}
```

### Storage abstraction

```javascript
class StorageAdapter {
  constructor(backend = 'local') {
    this.backend = backend;
  }

  async getProfiles() {
    if (this.backend === 'local') {
      return JSON.parse(localStorage.getItem('xxg_profiles') || '{}');
    } else {
      const doc = await db.collection('families').doc(this.familyId).get();
      return doc.data()?.profiles || {};
    }
  }

  async getWordBank(profileId) {
    if (this.backend === 'local') {
      return JSON.parse(localStorage.getItem(`xxg_wordbank_${profileId}`) || '{}');
    } else {
      const doc = await db.collection('families').doc(this.familyId)
        .collection('wordbanks').doc(profileId).get();
      return doc.data() || {};
    }
  }

  async getProgress(profileId) {
    if (this.backend === 'local') {
      return JSON.parse(localStorage.getItem(`xxg_progress_${profileId}`) || '{}');
    } else {
      const snapshot = await db.collection('families').doc(this.familyId)
        .collection('progress').doc(profileId).get();
      return snapshot.data() || {};
    }
  }

  async saveProgress(profileId, data) {
    data.updatedAt = new Date().toISOString();
    if (this.backend === 'local') {
      localStorage.setItem(`xxg_progress_${profileId}`, JSON.stringify(data));
    } else {
      await db.collection('families').doc(this.familyId)
        .collection('progress').doc(profileId).set(data, { merge: true });
    }
  }
}
```

### Size estimates

Settings ~200 bytes, 50 word lists × ~500 bytes = ~25KB per bank, progress for 500 characters × ~250 bytes = ~125KB per profile, session history ~50KB per year. Total per family: well under 500KB, comfortably within localStorage's 5MB limit.

**Important: localStorage key prefix `xxg_`** prevents collision with other apps hosted at xin-squared.com. All XieXieGo keys must use this prefix.

---

## 6. Word bank management

### Per-kid word banks

Each profile has its own word bank. Word banks are NOT shared across profiles because BUMI-aged siblings are typically in different grades with different weekly lists. Ada's kindergarten list is separate from Luca's TK list. Progress is also per-profile.

### Bulk import and the star flag

When a parent imports a word bank (JSON file, URL share, or share code), all words go into Box 1 at Stage 1 for the target profile. No calibration session, no quiz, no friction — the parent hits go and the kid starts practicing.

**Parents can flag priority words with a star.** Tapping a star next to any word in the word bank editor marks it as "this week" — the session planner front-loads starred words, guaranteeing they appear in every session until they reach Box 3 or 7 days pass, whichever comes first. After mastering or expiring, the star auto-clears.

The star is the mechanism for "here's this week's teacher list, practice these hard" without forcing parents to tediously categorize every word. Parents star the week's list, everything else is background review.

### Manual word addition

Single-word addition skips the star flow — parents adding words one at a time are usually adding this week's new words anyway, so newness is implicit. Bulk additions offer optional starring during the import flow.

### Word bank editor view

Each word in the editor shows:
- The character(s) at 32pt
- Meaning below
- Current mastery badge in plain language: "Learning" (Box 1), "Practicing" (Box 2), "Mastered" (Box 3)
- Star icon (tap to toggle priority flag)
- Response-time fluency badge: "Confident" (fast-correct), "Getting there" (slow-correct), or blank
- Delete button (swipe or long press)

Parents can tap any word to see details, edit metadata, manually override compound type, or toggle the star.

### Exports tied to current bank view

Exporting is contextual. If the parent is looking at Ada's word bank, "Export" exports Ada's bank specifically. If looking at Luca's, exports Luca's. There's no concept of "export all" — exports are always per-profile.

### Sharing model: URL + share codes

**URL-based sharing (v1.0).** Primary sharing method. LZ-string compresses the word bank JSON into a URL fragment:

```javascript
const json = JSON.stringify({
  v: 1, title: "一年级第12周",
  chars: [{ c: "你", e: "you" }, { c: "好", e: "good" }]
});
const url = `${location.origin}${location.pathname}#import=${LZString.compressToEncodedURIComponent(json)}`;
```

A 15-character word bank compresses to ~600–900 characters in the URL, well within the 2,000-character safe limit. The data lives in the URL fragment — never sent to any server.

When another parent opens the URL, the app detects `#import=`, decodes, and prompts: "Import [Title] into which kid's word bank?" (If only one profile exists, the question is skipped.) On confirmation, merges into the selected kid's bank.

**QR codes** generated client-side from URLs for classroom handouts.

**Share codes via Firebase Firestore (v1.5).** For word banks that exceed URL length limits or for parents who prefer short codes over long URLs:

```javascript
// Firestore structure
shared_wordbanks/{code} = {
  title: "...",
  characters: [/* ... */],
  createdAt: "..."
}

// Security rules
match /shared_wordbanks/{code} {
  allow get: if true;           // Anyone with code can read
  allow list: if false;         // No browsing
  allow create: if request.resource.data.characters is list
                && request.resource.data.characters.size() <= 100;
  allow update, delete: if false;
}
```

Share codes like `BUMI-K-W12` are more WeChat-friendly than long URLs. Free tier feasibility at BUMI scale: ~2,000 writes and 20,000 reads/year, far under Firestore free tier limits.

**Merge behavior on import.** When importing into a bank that already has some of the same words, the app merges: adds new words, preserves progress on existing ones, shows summary ("Added 7 new words. 3 already in your bank."). Never overwrites progress from a shared import.

**Community library (v2.0).** Curated static JSON files in the GitHub repo, organized by school/grade/week. Parents submit via Google Form; maintainer adds to repo.

---

## 7. UI/UX design

### Screen specifications

**Profile picker (launch screen).** Grid of avatar cards (100pt each) showing each kid's emoji and name. One tap selects. Small gear icon (44pt) in top corner opens parent settings (gated by easy math challenge). If no profiles exist, goes directly to onboarding.

**Parent onboarding (first run).** Three brief screens before the kid ever touches the app:

1. *Welcome screen.* "XieXieGo helps your child practice their weekly Chinese dictation list so they're ready for the test." Two-sentence statement of purpose. "Let's set up your first kid."
2. *Create profile.* Parent enters kid's name, picks an avatar from a 3×4 emoji grid, enters age. The age sets the initial difficulty level silently.
3. *Add first words.* Simple text input for Chinese characters. Auto-enrichment fires as characters are typed, showing meanings for confirmation. A "Try these starter words" button offers 大 小 人 口. Parent taps "Start Practicing!"

The app immediately launches a demo session with the entered words, starting at Stage 1 Exposure. No account creation, no email, no password.

**"How it works" page (accessible anytime from parent dashboard).** A plain-language explanation of the pedagogy without jargon. Sections:

- *What this app is.* "XieXieGo is a focused tool for practicing your child's weekly Chinese dictation list. It's not a complete Chinese learning program — it does one thing well, so your practice time is focused and effective."
- *How it teaches.* "New words are introduced, practiced, and reviewed across several short sessions. Words your child gets right quickly move on; words they're still learning come back until they're confident."
- *Why no pinyin.* "Research shows that pinyin gets in the way when kids are learning to recognize Chinese characters. We teach characters as whole shapes tied directly to sound and meaning — the same way kids in China learn them."
- *Difficulty levels.* "The app automatically adjusts to your kid's pace. You'll see their level in settings if you want to change it manually, but most parents don't need to."
- *Test mode.* "When your kid's list is mostly learned, test mode mimics the real classroom dictation. It helps your kid build test-taking confidence and shows you which words need more work."
- *Why errors are never 'wrong'.* "Kids learn best when mistakes feel safe. We use 'not yet' language and always give kids a second try. No red X's, no sad sounds, no hearts to lose."

**Parent dashboard.** Tabbed interface:
- *Word Banks* — list of word banks with add/edit/share buttons per-profile
- *Progress* — per-child summary with narrative sentence at top ("Ada practiced 12 characters this week with 85% accuracy. 3 characters need more practice."), calendar heat map, mastery breakdown, trouble character list, test results history
- *Reinforce at Home* (v1.5) — 1–3 suggestions per day
- *Settings* — profile management (name/avatar/age all editable), level override, audio settings, HanziWriter tolerance (advanced)

**Word bank editor (parent).** Full-screen list with per-word mastery badges, star flags, response-time fluency indicators. Prominent "+ Add Word" button. Share button generates URL or code.

**Kid session — writing activity.** Portrait-locked. Top zone (20%): word prompt, audio play button (60pt), character/meaning display. Middle zone (65%): HanziWriter canvas (280–320pt square) with 田字格 grid, `touch-action: none` to prevent scroll interference. Bottom zone (15%): back/next navigation (56pt), progress star dots, hint button.

**Kid session — multiple choice activity.** Top zone: stimulus. Middle zone: 2–4 option cards (80pt tall) arranged vertically. Bottom zone: progress indicator. All tap targets ≥60pt. Correct selection: green glow + sparkle. Wrong selection: gentle wobble + orange highlight + soft boop.

**Test mode screen.** Deliberately sparse. Top: audio play button (60pt) + test progress ("3 of 10"). Middle: blank HanziWriter canvas with only 田字格 grid. Bottom: "Done / Check ✓" button (full-width, 56pt). After Done, correct character displays beside kid's writing with "Got It ✓" (green) / "Not Yet ✗" (amber) buttons.

**Session-end celebration.** Celebration popup with a fun stat if warranted ("You wrote 5 characters perfectly!" or "You beat your best streak!"). Practice garden visualization showing accumulated progress. Two buttons: "Keep practicing" and "All done for now!" — kid chooses. Never forced to stop.

**Results screen (post-test).** Fraction score with stars ("8 out of 10 ⭐⭐⭐⭐"), list of characters with check marks or review marks. "Practice tricky words" button if any were missed.

**All-words-mastered empty state.** Big celebration popup. Then automatically enters review mode — light rotation through mastered words with fast recognition activities to prevent decay. No pressure, no goal — just maintenance.

### Car-use and one-handed design

All primary interactions live in the bottom two-thirds of the screen (thumb-reachable zone). Parent never needs to touch the phone during a session. Audio announcements mark session start, progress, completion. Sessions auto-advance between activities with brief pauses. Portrait lock prevents rotation during bumpy rides. Autosave after every interaction.

**Session resumption.** Within 15 minutes of last interaction, reopening returns to the exact word in the current session. After 15 minutes, starts a fresh session with all progress preserved.

**No pause button.** Kid just stops. Session stays open waiting. Response time data from any interaction where idle time exceeds 10 seconds is discarded to prevent garbage polluting the median.

**Kid-initiated break.** If no input for 30 seconds, gentle "Still there? Tap to keep going" screen. Resumes exactly.

### Encouraging feedback patterns

Correct answer: 2-second sequence — green glow radiating from character, sparkle particles, warm ascending chime, brief voice praise from rotating bank ("太棒了!" "你真厉害!" "Great job!").

Incorrect answer: 1-second gentle redirect — soft wobble, amber highlight, low soft boop, encouraging text from rotating bank. Correct answer appears with animated stroke order as teaching moment.

Per-session reward: completing 5+ characters unlocks a collectible sticker (Chinese cultural item — lantern, dragon, dumpling, panda). Accumulates in sticker album viewable from profile screen.

Weekly continuity: practicing 3+ days fills a progress garden where mastered characters bloom as flowers. No leaderboards, no loss mechanics, no time pressure.

### Parent gate

Access to settings requires solving a simple math problem (e.g., "3 + 4 = ?"). Older kids can solve it — that's fine. There's nothing dangerous behind the gate, just settings and data. The gate exists to prevent accidental access by 4-year-olds, not to enforce strict parental control.

---

## 8. Technical architecture

### Stack (no build step)

**Vanilla JavaScript** with native ES modules (`<script type="module">`). No framework, no bundler, no transpiler. Browsers load files directly.

**HanziWriter.js** (MIT, 9KB gzipped) for stroke rendering and quizzing. Loaded from CDN:
```html
<script src="https://cdn.jsdelivr.net/npm/hanzi-writer@3.5/dist/hanzi-writer.min.js"></script>
```

**LZ-string** for URL compression in sharing. Loaded from CDN:
```html
<script src="https://cdn.jsdelivr.net/npm/lz-string@1.5/libs/lz-string.min.js"></script>
```

**jsPDF** for client-side worksheet PDF generation. Loaded from CDN when worksheets feature is used:
```html
<script src="https://cdn.jsdelivr.net/npm/jspdf@2.5/dist/jspdf.umd.min.js"></script>
```

**qrcode.js** for QR generation. Loaded from CDN when sharing feature is used:
```html
<script src="https://cdn.jsdelivr.net/npm/qrcode@1.5/build/qrcode.min.js"></script>
```

**Firebase** (Firestore + Anonymous Auth, Spark plan) for optional sharing. Loaded conditionally when sharing is used.

### File structure (within xin-squared.com repo)

```
xin-squared.com/
└── xiexiego/                    # This subfolder is XieXieGo
    ├── index.html               # Single-page app entry
    ├── README.md                # Quick overview
    ├── SPEC.md                  # This document
    ├── CLAUDE.md                # Context for Claude Code
    ├── css/
    │   └── style.css            # Mobile-first, large touch targets
    ├── js/
    │   ├── app.js               # App initialization, routing
    │   ├── storage.js           # StorageAdapter (localStorage + Firebase)
    │   ├── session.js           # Session planner, Leitner algorithm
    │   ├── enrichment.js        # Character auto-enrichment pipeline
    │   ├── levels.js            # Four difficulty levels, auto-bump logic
    │   ├── confusion-pairs.js   # Interleaving logic
    │   ├── activities/
    │   │   ├── exposure.js
    │   │   ├── compound-discovery.js
    │   │   ├── audio-recognition.js
    │   │   ├── meaning-matching.js
    │   │   ├── stroke-tracing.js
    │   │   ├── free-trace.js
    │   │   ├── flash-write.js
    │   │   ├── free-write.js
    │   │   ├── pronunciation.js
    │   │   ├── phrase-fillin.js
    │   │   └── test-mode.js
    │   ├── components/
    │   │   ├── profile-picker.js
    │   │   ├── onboarding.js
    │   │   ├── word-editor.js
    │   │   ├── parent-dashboard.js
    │   │   ├── how-it-works.js
    │   │   ├── share.js
    │   │   └── worksheet-generator.js
    │   └── data/
    │       ├── cedict-index.json       # Pre-built CC-CEDICT lookup
    │       ├── mmah-index.json         # Pre-built Make Me a Hanzi lookup
    │       ├── confusion-pairs.json    # Per Appendix A
    │       ├── starter-words.json      # 50 BUMI starter characters
    │       └── encouragement-messages.json  # Per Appendix B
    ├── audio/                   # Pre-generated TTS files
    │   ├── xue2.mp3
    │   └── (others)
    ├── img/
    │   ├── stickers/            # Collectible reward stickers (SVG)
    │   └── icons/               # UI icons (SVG)
    ├── firebase-config.js       # Loaded conditionally
    └── scripts/                 # One-off Node build scripts (NOT served)
        ├── build-cedict.js      # Parses CC-CEDICT source into index
        ├── build-mmah.js        # Parses Make Me a Hanzi source into index
        └── generate-audio.js    # Pre-generates TTS MP3s via Google Cloud
```

**Critical: all asset paths must be relative** (`./js/app.js`, not `/js/app.js`) so the app works when mounted at `xin-squared.com/xiexiego/`.

### Loading pattern in index.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
  <title>XieXieGo</title>
  <link rel="stylesheet" href="./css/style.css">

  <!-- Third-party libraries from CDN -->
  <script src="https://cdn.jsdelivr.net/npm/hanzi-writer@3.5/dist/hanzi-writer.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/lz-string@1.5/libs/lz-string.min.js"></script>
</head>
<body>
  <div id="app"></div>

  <!-- App code as ES module -->
  <script type="module" src="./js/app.js"></script>
</body>
</html>
```

Files in `js/` use native ES module imports:
```javascript
// js/app.js
import { StorageAdapter } from './storage.js';
import { SessionPlanner } from './session.js';
```

### Firebase scope

**Anonymous auth only** — no email/password. Counts toward 50K MAU free limit, plenty for BUMI scale.

**Firestore:** single collection `shared_wordbanks` for sharing. No user data in Firestore — all progress stays local.

### Pronunciation detection

**Web Speech API SpeechRecognition** with `recognition.lang = 'zh-CN'`. Works on Chrome for Android. On iOS Safari, works only if Siri is enabled and the app is NOT running as a PWA.

**Known limits:** Adult Mandarin STT ~3% WER; child speech degrades to ~25% WER. Tone scoring is not available at free/cheap price points. XieXieGo uses Speech API for binary pass/fail check on character transcription only — no tone scoring attempted.

**Self-assessment fallback:** When Speech API is unavailable or unreliable, the app plays the correct pronunciation after the kid speaks, and the kid self-rates "Got It / Not Yet." Pedagogically sound and universally reliable.

### Text-to-speech

**Primary:** pre-generated MP3 files. Google Cloud TTS `cmn-CN-Wavenet-A` voice, generated via `scripts/generate-audio.js`. Static assets in `audio/`. 100% reliable, zero runtime cost.

**Fallback:** Web Speech API `speechSynthesis` for parent-added characters not in the pre-generated set. iOS provides decent Ting-Ting and Mei-Jia voices; Android depends on installed language packs.

### Printable worksheets (v1.0)

Client-side PDF generation via `jsPDF`. Characters rendered from HanziWriter's existing SVG stroke data (no font bundling needed). QR codes via `qrcode.js`.

**Worksheet layout.** 8.5×11 portrait, 4 characters per sheet. Each character gets one row with:

- **Header block (left ~25%):** Reference character large and dark (SVG from HanziWriter). Pinyin with tone marks shown exactly once above the reference character. English definition below.
- **Stroke sequence strip (center ~35%):** Small numbered boxes showing progressive stroke addition (box 1 shows first stroke, box 2 shows first two strokes, etc.).
- **Guided trace column (~20%):** 2–3 田字格 cells with light-gray ghost characters for tracing.
- **Independent practice column (~20%):** 3–4 blank 田字格 cells.

Footer: QR code linking back to audio (`xin-squared.com/xiexiego/?play=学`), small parent tip ("Say each word aloud before your child writes it. Ask what the word means after they write it.").

Parent-initiated from dashboard ("Print practice sheet") or word bank editor ("Print selected"). Defaults to current Box 1 + Box 2 words; parent can override selection.

### Performance

HanziWriter init ~instant (9KB gzipped). Character data JSONs 2–5KB each; session of 15 characters preloads ~30–75KB from jsdelivr CDN. Audio files pre-loaded at session start via `preload="auto"`. `touch-action: none` on writing canvas prevents scroll interference. Viewport meta `user-scalable=no` prevents zoom delays.

### Privacy

All kid data local-first in localStorage (keys prefixed `xxg_`). No accounts required for basic use. Firebase loaded only when sharing features used. No analytics, no tracking, no third-party scripts beyond the few CDN-loaded libraries. Firebase transmits only word bank data when sharing — no child names, no progress, no personal info.

### Autosave and data durability

Autosave triggers after every interaction. Schema version number enables future migrations. One-button "Backup" feature exports all data as JSON for the family. Monthly backup prompt. Firebase cloud sync in v1.5+ offers durable tier for families who opt in.

### Local development

No Vite, no build step for the app itself. For mobile testing, serve the parent repo directory with any static server and navigate to the subfolder:

```bash
# From the xin-squared.com repo root:
npx serve . --host
# Then on phone: http://<your-ip>:3000/xiexiego/
```

Or use Python:
```bash
python3 -m http.server 8000
# Then on phone: http://<your-ip>:8000/xiexiego/
```

Edit a file, refresh the browser, see the change. That's the whole dev loop.

For the one-off build scripts in `scripts/`, run with Node directly:
```bash
cd xiexiego
node scripts/build-cedict.js
node scripts/build-mmah.js
node scripts/generate-audio.js
```

These produce JSON files that get committed to the repo.

---

## 9. Difficulty level parameters (internal)

Parents never see these numbers. Internal mapping only.

| Parameter | Level 1 | Level 2 | Level 3 | Level 4 |
|---|---|---|---|---|
| Session length (soft cap) | 5 min | 6 min | 8 min | 10 min |
| New words per session | 1–2 | 2 | 3 | 3–4 |
| MC distractor count | 2 | 3 | 3 | 4 |
| HanziWriter leniency | 1.5 | 1.4 | 1.3 | 1.2 |
| Hint after N misses | 2 | 2 | 3 | 3 |
| Target success rate | 90% | 85% | 80% | 75% |
| Max interactions/session | 10 | 12 | 15 | 18 |
| Default age | 4–5 | 5–6 | 6–8 | 8–10 |

### Auto-bump logic

Tracked signals per profile (rolling 2-week window):
- Average success rate across all interactions
- Session completion rate (full session vs abandoned)
- Hint usage rate

**Bump up when:** success rate exceeds level target by 10%+ AND session completion rate ≥90% AND hint usage below 15%.

**Bump down when:** success rate below level target by 10%+ OR session completion rate <60% OR hint usage above 40%.

Silent. No confirmation. Logged to `levelHistory` for audit. Parent override locks the level, preventing auto-bump until unlocked.

---

## 10. Roadmap

### v0.1 — Minimum viable prototype (Week 1–2)

**In:** Profile picker with single profile, manual word bank entry with auto-enrichment, stroke tracing activity via HanziWriter, pre-generated audio for starter set of 50 common characters, Box 1 tracking only, correct/incorrect feedback, localStorage persistence, onboarding flow.

**Out:** Everything else.

### v1.0 — First usable family release (Week 3–6)

**In:** Multiple kid profiles (name, avatar, age, all editable), full 3-box Leitner with response-time modulation, same-day second exposure, all five mastery stages, activity selection via session planner, audio recognition, meaning matching, free-write, test mode with custom test builder, auto-enrichment pipeline, encouraging error messages (rotating bank of 20+), session-end celebration with continue option, all-mastered review mode, parent dashboard, "How it works" page, four difficulty levels with silent auto-bump, hints in every activity, confusion-pair interleaving, skill-type alternation, per-profile word banks, compound discovery activity, star flags with auto-expiry, printable worksheets (PDF generation), URL-based sharing with QR codes, parent math gate, session resumption (15-min window), all features above in scope.

**Out:** Pronunciation detection (Web Speech API), example phrase fill-in, reinforce-at-home suggestions, Firebase sharing codes, community library.

### v1.5 — Enrichment features (Week 7–10)

**In:** Pronunciation checking via Web Speech API with self-assessment fallback, example phrase fill-in activity, reinforce-at-home parent suggestions, Firebase Firestore integration for share codes (`BUMI-K-W12`), compound discovery with picture-option guessing, tone-pair discrimination for audio activities, practice garden visualization, collectible stickers, Firebase cloud sync for progress backup.

### v2.0 — Community (Week 11–16)

**In:** Curated community word bank library (static JSON in repo), browse and import in-app, submission via Google Form, expansion beyond BUMI, enhanced parent analytics.

---

## 11. Open questions and risks

### Pronunciation detection accuracy for child voices

25% WER on child speech means 1 in 4 correct-spoken words will be marked wrong. Mitigation: pronunciation always framed as approximate, self-assessment is the default on iOS, pronunciation never gates mastery progression — it supplements rather than blocks.

### HanziWriter mobile performance with large word banks

Single-character rendering is fast. Pre-loading data for 100 characters = 200–500KB fetched from CDN. Mitigation: lazy-load in session batches of 10–15. Browser caching after first load. Typical BUMI use is 10–20 chars/week, well within comfort.

### iOS PWA Speech API limitation

Web Speech API doesn't work when running as a PWA on iOS. Apple platform restriction, no workaround. Mitigation: detect PWA context, switch to self-assessment mode automatically. Don't prompt to "Add to Home Screen" if pronunciation features are enabled.

### localStorage durability

Can be cleared by browser storage pressure, user clearing data, or private browsing. Mitigation: one-button Backup/Export to JSON, monthly backup prompt, optional Firebase cloud sync in v1.5+.

### WeChat in-app browser

May not support all Web APIs. Mitigation: detect WeChat user agent, prompt to open in default browser ("长按链接 → 在Safari中打开"). Share codes (v1.5) avoid this entirely.

### Compound word sequencing

Two-character words need HanziWriter sequenced: quiz first character, then second. Sequential left-to-right matches paper writing. Needs user testing but default is sequential.

### Data licensing

CC-CEDICT is CC BY-SA 4.0 (requires attribution and share-alike). Make Me a Hanzi is under Arphic Public License. HanziWriter is MIT. All compatible with open-source hosting. Attribution included in About screen.

### Subfolder hosting quirks

The app lives at `/xiexiego/` not `/`. All asset paths must be relative. Service workers (if ever added) must scope to the subfolder. URL-based sharing must use `window.location.pathname` dynamically, not hardcoded paths.

---

## Appendix A: Confusion-pair starter list

The session planner loads this as a static JSON file (`js/data/confusion-pairs.json`). When 2+ words in a session belong to the same confusion group, they're forced into alternating practice.

### Single-line differences (one stroke added or removed)

```json
[
  { "group": "big_too_dog", "chars": ["大", "太", "犬"] },
  { "group": "person_enter_eight", "chars": ["人", "入", "八"] },
  { "group": "tree_family", "chars": ["木", "本", "末", "未"] },
  { "group": "sun_say", "chars": ["日", "曰"] },
  { "group": "earth_scholar", "chars": ["土", "士"] },
  { "group": "dry_thousand", "chars": ["干", "千"] },
  { "group": "sky_husband", "chars": ["天", "夫"] },
  { "group": "king_jade", "chars": ["王", "玉"] },
  { "group": "white_hundred", "chars": ["白", "百"] },
  { "group": "self_already", "chars": ["己", "已", "巳"] },
  { "group": "noon_cow", "chars": ["午", "牛"] },
  { "group": "knife_strength", "chars": ["刀", "力"] },
  { "group": "hand_hair", "chars": ["手", "毛"] }
]
```

### Shared component, different radical

```json
[
  { "group": "box_shapes", "chars": ["口", "日", "目", "田"] },
  { "group": "small_few", "chars": ["小", "少"] },
  { "group": "look_ing", "chars": ["看", "着"] },
  { "group": "at_again", "chars": ["在", "再"] },
  { "group": "qing_family", "chars": ["请", "情", "清", "晴"] },
  { "group": "pronouns", "chars": ["他", "她", "它"] },
  { "group": "ma_family", "chars": ["吗", "妈", "马"] },
  { "group": "ge_song", "chars": ["哥", "歌"] },
  { "group": "dad_grandpa", "chars": ["爸", "爷"] }
]
```

### Visually similar structure

```json
[
  { "group": "i_find", "chars": ["我", "找"] },
  { "group": "buy_sell", "chars": ["买", "卖"] },
  { "group": "east_car", "chars": ["东", "车"] },
  { "group": "go_cloud", "chars": ["去", "云"] },
  { "group": "how_nine", "chars": ["几", "九"] },
  { "group": "done_child", "chars": ["了", "子"] },
  { "group": "not_down", "chars": ["不", "下"] },
  { "group": "left_right", "chars": ["左", "右"] },
  { "group": "exit_mountain", "chars": ["出", "山"] },
  { "group": "up_down", "chars": ["上", "下"] },
  { "group": "middle_state", "chars": ["中", "申"] }
]
```

### Tone/homophone groups (for audio activities)

```json
[
  { "group": "mom_horse", "chars": ["妈", "马"], "audioOnly": true },
  { "group": "buy_sell_tone", "chars": ["买", "卖"], "audioOnly": true },
  { "group": "four_ten", "chars": ["四", "十"], "audioOnly": true },
  { "group": "is_four", "chars": ["是", "四"], "audioOnly": true },
  { "group": "pronouns_homophone", "chars": ["他", "她", "它"], "audioOnly": true, "needsContext": true },
  { "group": "at_again_homophone", "chars": ["在", "再"], "audioOnly": true, "needsContext": true }
]
```

Approximately 40 confusion pairs/groups covering the most common kindergarten and early-elementary issues. BUMI-appropriate (basic nouns, pronouns, directions, family, numbers). Easy to extend over time.

---

## Appendix B: Encouragement message bank

Rotating banks for variety. Loaded from `js/data/encouragement-messages.json`.

### On incorrect answer (first attempt)

```json
[
  "Not quite yet! Let's try again! 🌟",
  "Almost! Your brain is growing stronger! 🧠",
  "Tricky one! Let's look at it together ✨",
  "Keep going! Practice makes progress! 🚀",
  "You're brave for trying! One more go! 💫",
  "So close! Try once more! ⭐",
  "Your brain is working hard! 💪",
  "Every try makes you better! 🌈"
]
```

### On showing correct answer

```json
[
  "Now you know! You'll get it next time! 📝",
  "Mistakes help your brain grow! 🌱",
  "That's the one! Remember it for later! ✨",
  "See? You've got this! 🌟",
  "Learning something new is brave! 💫"
]
```

### On correct-after-retry

```json
[
  "YES! You got it! 🎉",
  "You didn't give up! 🏆",
  "Amazing! 🌟",
  "You figured it out! 💫",
  "That's the stuff! ✨"
]
```

### On correct first try

```json
[
  "太棒了! (Amazing!)",
  "你真厉害! (You're great!)",
  "Perfect! 🌟",
  "Got it! ✨",
  "Yes! 💫",
  "Brilliant! 🎉"
]
```

### On hint use

```json
[
  "Good idea to check! 🔍",
  "Smart move! 💡",
  "Checking is smart! ⭐",
  "Great thinking! 🧠"
]
```

---

## Appendix C: Claude Code handoff

### Prerequisites on local machine

1. **Node.js** (version 20+) — only for running one-off build scripts (`scripts/`). The app itself has no build step.
2. **Git** — you already have this.
3. **Claude Code** — install via `npm install -g @anthropic-ai/claude-code` if not already.
4. **Google Cloud account** (free tier) — only needed once to pre-generate TTS audio files.

### Setup before first Claude Code session

1. Navigate into your existing repo: `cd path/to/xin-squared.com`
2. Create the xiexiego subfolder: `mkdir -p xiexiego && cd xiexiego`
3. Place this SPEC.md file in `xiexiego/SPEC.md`.
4. Create a `CLAUDE.md` file in `xiexiego/CLAUDE.md` with the contents below.
5. Start Claude Code from inside the xiexiego directory: `claude`

### Contents of CLAUDE.md

```markdown
# XieXieGo — Project Context for Claude Code

This is a phone-first web app for Chinese dictation practice, ages 4–10.
It lives in the xiexiego/ subfolder of the xin-squared.com repo and
is deployed to xin-squared.com/xiexiego automatically.

## Required reading before any work
Read SPEC.md in this directory in full before starting any task. It
contains the complete product specification, including pedagogical
principles, data model, activity specifications, and technical
architecture.

## Non-negotiable principles
- NO PINYIN on any child-facing screen. Ever. Research-backed.
- Errors are NEVER labeled "wrong." Use "not yet" language from the
  encouragement bank in Appendix B.
- Hints are explicitly framed as smart problem-solving, never punished.
- Phone-first. All UI must work on a 375px-wide mobile viewport.
- Large tap targets (minimum 60pt) everywhere.
- Vanilla JS only. No React, Vue, or other frameworks.
- NO BUILD STEP. Use native ES modules and CDN-loaded libraries.
- Store all data in localStorage with `xxg_` key prefix.
- Firebase only for optional sharing features, not core data.

## Hosting context
- App lives at xin-squared.com/xiexiego/
- Deployed automatically when code is pushed to the xin-squared.com repo
- ALL ASSET PATHS MUST BE RELATIVE (e.g. `./js/app.js`, not `/js/app.js`)
- localStorage keys must use `xxg_` prefix to avoid collision with
  other apps on the same domain

## Stack
- Vanilla JavaScript with native ES modules (<script type="module">)
- HanziWriter.js for character rendering (from CDN)
- LZ-string for URL compression (from CDN)
- jsPDF for printable worksheets (from CDN, loaded on demand)
- qrcode.js for QR generation (from CDN, loaded on demand)
- NO bundler, NO transpiler, NO framework

## File structure
See Section 8 of SPEC.md for the complete file structure.

## Local testing
From the parent repo root:
    npx serve . --host
Then open http://<your-ip>:3000/xiexiego/ on your phone.

Or from within xiexiego/:
    python3 -m http.server 8000
Then open http://<your-ip>:8000/ on your phone.

## Development approach
- Work in small, testable increments — one phase per session
- Test each feature on an actual mobile device
- Commit frequently with clear messages
- After each phase, verify the app still runs end-to-end
- Ask before making design decisions not covered in SPEC.md
```

### First Claude Code session prompt

Copy and paste this into your first Claude Code session:

```
Read SPEC.md and CLAUDE.md. Then build Phase 1 of XieXieGo.

PHASE 1 GOAL: Get a working profile picker + onboarding flow running
locally on my phone via a local HTTP server.

PHASE 1 DELIVERABLES:
1. File structure per Section 8 of SPEC.md (just the files needed for
   Phase 1 — don't create empty stubs for later phases)
2. index.html with mobile viewport meta, CDN script tags for
   HanziWriter and LZ-string, and ES module entry for js/app.js
3. css/style.css with mobile-first styles and CSS variables for theming
4. js/storage.js with StorageAdapter class (localStorage backend only
   for now — leave Firebase backend as a TODO comment)
5. js/app.js with basic routing between screens using hash-based
   navigation (e.g. #profiles, #onboarding)
6. js/components/profile-picker.js — grid of profile cards, or empty
   state that routes to onboarding
7. js/components/onboarding.js — three-screen flow per Section 7:
   welcome, create profile (name/avatar/age), add first words
8. js/data/starter-words.json — a hand-curated list of 10 BUMI-appropriate
   kindergarten characters (大, 小, 人, 口, 山, 水, 日, 月, 火, 木)
   for initial testing. Include meaning and emoji for each.

DO NOT build any activities yet. After onboarding, route to a
placeholder session screen that says "Coming soon — practice screen."

Use relative paths everywhere (./js/app.js, not /js/app.js) because
the app is hosted at xin-squared.com/xiexiego/.

Use the xxg_ prefix for all localStorage keys.

Verify by running `python3 -m http.server 8000` from inside xiexiego/,
opening the local URL on your phone, and walking through: empty state →
onboarding → create profile → land on placeholder session screen.

Commit when working. Ask me any questions before starting.
```

### Phase-by-phase build plan

Work through these in order. After each phase, test the app end-to-end on a real phone before moving to the next. Give Claude Code one phase per session.

**Phase 1: Bootstrap.** Profile picker, onboarding, basic routing. (See prompt above.)

**Phase 2: Data pipeline.** Build-time scripts in `scripts/` to generate `cedict-index.json` and `mmah-index.json` from CC-CEDICT and Make Me a Hanzi source files. Pre-generate audio files via Google Cloud TTS for the starter set. Implement `js/enrichment.js` for runtime character auto-enrichment.

**Phase 3: Word bank editor.** Parent can add, edit, delete, star words. Auto-enrichment fires on add. Per-profile banks. Mastery badges (placeholder — show "Learning" for all).

**Phase 4: First activity — exposure.** Build `js/activities/exposure.js`. Word bank loads, kid taps a word, exposure screen displays with audio and animated stroke order via HanziWriter. Continue button advances. No Leitner yet.

**Phase 5: Second activity — stroke tracing.** Integrate HanziWriter quiz mode per spec. Level 1 leniency. Pass/fail detection. Feed into a simple in-memory progress tracker.

**Phase 6: Audio recognition + meaning matching.** Two multiple-choice activities. Rotating encouragement messages on wrong/right. Green glow and amber wobble animations per spec.

**Phase 7: Leitner box system.** `js/session.js` session planner. 3 boxes. Binary grading. Persist progress to localStorage per profile. New words into Box 1. Advancement on consecutive correct.

**Phase 8: Response-time modulation.** Track per-activity median. Modulate Leitner advancement with the 2× median rule. Slow-streak tracking.

**Phase 9: Same-day second exposure.** Flag new words in the session planner. Guarantee fast second touch before session end.

**Phase 10: Difficulty levels and auto-bump.** Four levels with silent auto-adjustment per Section 9. Parent override lock. Level influences session parameters throughout.

**Phase 11: Remaining writing activities.** Free trace, flash and write, free write (dictation). HanziWriter configuration per level.

**Phase 12: Interleaving.** Load `confusion-pairs.json`. Session planner reorders to alternate confusion-pair words. Skill-type alternation rule.

**Phase 13: Test mode.** Custom test builder, dictation format, self-assessment, results feeding back into Box state.

**Phase 14: Compound discovery activity.** Triggered when new word is compositional compound with both components known.

**Phase 15: Parent dashboard.** Progress tab with narrative summary, trouble characters, test history. Math gate to settings. "How it works" page with plain-language pedagogy.

**Phase 16: Session celebration + all-mastered review mode.** Celebration popup with stat, continue option. Empty-state celebration + auto-review for all-mastered.

**Phase 17: Printable worksheets.** jsPDF integration (loaded on demand from CDN). SVG rendering from HanziWriter data. Layout per Section 8. QR code generation.

**Phase 18: URL-based sharing.** LZ-string compression. `#import=` flow. Merge behavior. QR code for URLs.

**Phase 19: Polish pass.** Stickers, practice garden, session resumption, auto-pause, idle handling, autosave verification, backup/export feature.

**Phase 20: v1.0 ship.** Final testing with Ada and Luca. Encouragement copy review. Tone calibration. Deploy (automatic via your existing pipeline).

That's v1.0. Each phase is one Claude Code session of 30–90 minutes.

### Tips for working with Claude Code on this project

**Always verify on a real phone.** Desktop browser testing misses touch issues, tap target sizes, and HanziWriter mobile performance. Get your phone's IP from the Python HTTP server output.

**Keep sessions focused.** One phase per session. Don't ask Claude Code to "build the whole app." Small, testable increments are faster and more reliable.

**Reference the spec explicitly.** When asking for a feature, say "per Section X of SPEC.md" rather than re-explaining. The spec is the source of truth.

**Let Claude Code ask questions.** If it's uncertain about a design choice, it should ask before building. Good prompts include "ask me before making any design decisions that aren't specified in SPEC.md."

**Test with Ada and Luca.** Once Phase 6 is working, have them try it. The encouragement messages, feedback animations, and overall tone need to feel right to an actual 5-year-old. No amount of spec-writing substitutes for this.

**Budget for the spec to change.** First contact with real users will reveal things the spec got wrong. That's expected. Update SPEC.md as you learn, and commit those changes.

**Don't skip Phase 2.** The data pipeline is the least exciting phase but everything else depends on it.

### Questions to ask Claude Code at the start of each session

- "What does the spec say about X?" (quick spec lookup)
- "What's the minimum change to achieve Y?" (scope discipline)
- "What should I test on my phone after this change?" (testing discipline)
- "What's the next smallest thing I could ship?" (momentum)

### What NOT to delegate to Claude Code

- **Final design decisions on kid-facing copy.** Write the encouragement messages yourself or review Claude Code's proposals with Xin/Mark's design eye. Tone is everything.
- **Testing with real kids.** You have to do this. Claude Code can't.
- **Choosing which BUMI words go in the starter set.** This is a curriculum choice based on your kids' specific grade.
- **The "How it works" parent-facing page copy.** Write this yourself — it's your voice, not a generated summary.

Good luck. The spec is dense but the build is tractable. Ship v0.1 first, test with Ada and Luca, iterate from there.
