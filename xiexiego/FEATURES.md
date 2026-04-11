# XieXie — Feature Summary

## What is it?

XieXie is a phone-first web app for Chinese character dictation practice, targeting kids ages 4-12. It helps children prepare for weekly classroom dictation tests (听写) through spaced repetition, multi-modal learning activities, and gamification. No app store download required — it runs in any mobile browser.

---

## Core Learning System

### Spaced Repetition (Leitner 5-Box System)
- Words progress through 5 mastery stages: New → Learning → Familiar → Strong → Mastered
- Advancement requires consecutive correct answers; wrong answers regress the word
- Review intervals increase with each box (same day → 1 day → 3 days → 7 days → 14 days)
- Response-time modulation: fast correct answers count double, slow answers may hold advancement
- The system adapts to each child's pace automatically

### 4 Difficulty Levels (Silent Auto-Adjustment)
- Level 1 (ages 4-5): shorter sessions, more hints, higher leniency
- Level 2 (ages 5-6): standard sessions
- Level 3 (ages 6-8): longer sessions, fewer hints
- Level 4 (ages 10+): hardest settings, minimal guidance
- Auto-adjusts based on 2-week rolling success rate — parents can lock the level

### Session Planner
- Each session combines new words and review words based on spaced repetition schedule
- Activities are interleaved for variety (no two of the same type in a row)
- Confusion pairs (visually similar characters like 大/太) are deliberately placed adjacent for contrast learning
- New words get a second exposure at session end for overnight retention

---

## 11 Activity Types

### Exposure (Introduction)
- Animated stroke-by-stroke writing with HanziWriter.js
- Audio pronunciation, meaning, pinyin, and example usage
- Compound word discovery when both component characters are known

### Multiple Choice Quizzes (4 types)
1. **Audio Recognition** — hear the word, pick the character
2. **Meaning Match** — see the character, pick the meaning
3. **Pinyin Match** — see the character, pick the pinyin
4. **Reverse Meaning** — see the meaning, pick the character

### Writing Activities (4 types, progressive difficulty)
1. **Stroke Tracing** — guided with outline and hints
2. **Free Trace** — outline visible, no stroke hints
3. **Flash Write** — character shown briefly, then write from memory
4. **Free Write** — write from audio/meaning only (dictation)

### Multi-Word Activities (2 types)
1. **Matching Game** — match 4 characters to their meanings or pinyin
2. **Timed Writing Challenge** — write as many characters as possible in 60 seconds

---

## Word Content System

### 7 Pre-Built Word Packs
| Pack | Words | Target Audience |
|------|-------|----------------|
| BUMI Kindergarten | 68 | Ages 4-6, sequenced curriculum |
| Si Wu Kuai Du Book 1 | 86 | Textbook with 10 lessons + sentences |
| Top 100 Characters | 100 | Most common characters by frequency |
| Top 500 Characters | 500 | Extended frequency list |
| YCT Level 1 | 80 | Official YCT exam prep (12 subsets) |
| YCT Level 2 | 70 | YCT Level 2 (12 subsets) |
| YCT Level 3 | 107 | YCT Level 3 (14 subsets) |

### Custom Word Input
- Parents can create custom word packs by typing characters
- Auto-enrichment from CC-CEDICT dictionary (pinyin, meaning, tone, radical, examples)
- Photo import with OCR (Tesseract.js) — snap a photo of homework, extract characters

### Word Data
- Each character has: pinyin with tone marks, English definition, stroke data, radical info, example sentences
- 4,104 characters in the CC-CEDICT dictionary index
- 214 Kangxi radicals identified with special handling

---

## Gamification & Motivation

### Collectible Stickers
- 20 unique stickers (Chinese cultural themed: dragon, lantern, panda, lotus, etc.)
- Earned after completing sessions with 5+ activities
- Sticker album visible on profile row

### Pack Milestone Celebrations
- 50% pack completion: celebration screen with confetti
- 100% pack completion: extra-big celebration with golden glow animation
- Tracked per-pack so each milestone shows only once

### Session Celebrations
- 20 randomized celebration messages in Chinese + English
- Confetti particle animation
- Characters practiced shown as review
- "Keep Practicing" option to start another session immediately

### Character Garden
- Mastered characters appear as flowers in a visual garden
- Seedlings (box 3) → tulips (box 4) → cherry blossoms (box 5)
- Grows as the child masters more characters

---

## Parent Features

### Progress Dashboard
- Narrative summary ("Ada is making great progress! 40% mastered")
- 4-stat overview: Total Words, Mastery %, Sessions Completed, Streak
- 30-day activity heat map calendar
- Learning progress bars (5-box breakdown with color coding)
- Trouble characters list (characters with most attempts still in box 1)
- Recently mastered characters
- Test history with scores and dates
- Difficulty level display with lock option

### Test Mode (Dictation)
- Mimics classroom dictation format exactly
- Parent selects which words to test (All, Ready, Starred, or manual selection)
- Audio-only prompt → blank writing canvas
- Self-assessment: "Got it" or "Not yet" after each word
- Results feed back into spaced repetition system
- Score summary with practice recommendations

### Printable Worksheets
- Client-side PDF generation (jsPDF)
- 田字格 (character grid) practice cells
- Reference character with pinyin and meaning
- Trace cells + blank practice cells
- Defaults to struggling characters (box 1-2)

### URL-Based Sharing
- Compress word list into shareable URL using LZ-string
- Web Share API integration (native share sheet on mobile)
- Clipboard fallback for desktop
- Import flow: open link → pick profile → words are added with enrichment

### Data Management
- Export all profiles and progress as JSON backup
- Import/merge from backup files (keeps most advanced progress)
- Per-profile data isolation (siblings don't interfere)

---

## Technical Features

### Privacy-First
- All data stored locally (localStorage) — nothing sent to servers
- No accounts, no sign-up, no tracking
- Works offline after first load (all assets cached)

### Phone-First Design
- Touch-optimized with large tap targets
- All interactions in bottom two-thirds of screen (car-safe)
- Portrait orientation optimized
- Auto-save after every interaction
- Session resume on page refresh

### Multi-Language
- Full English/Chinese interface toggle
- All UI text, labels, and messages translated

### Dark Mode
- Full dark theme support
- System preference detection

### Parental Controls
- Math gate on settings (prevents accidental access by young kids)
- Level lock to prevent auto-adjustment

### No Installation Required
- Pure web app — works in any mobile browser
- No app store, no downloads, no updates
- Vanilla JavaScript, no framework — fast and lightweight
- CDN-loaded libraries: HanziWriter.js, LZ-string, Tesseract.js, jsPDF

---

## User Flow

```
Profile Picker → Add Pack → Practice Session → Celebration + Sticker
      ↓              ↓              ↓
   Settings     Word Editor    Test Mode → Results
      ↓              ↓
  Dashboard     Share Words
      ↓
  Worksheets
```

### Typical Daily Usage
1. Parent opens app (no login)
2. Kid taps their profile → Practice button
3. 5-10 minute session: exposure → quizzes → writing → matching game → timed challenge
4. Celebration screen with sticker reward
5. Optional: parent checks dashboard, prints worksheet, or runs a test

---

## Scale & Performance

- Supports multiple child profiles (tested with 3)
- Word banks up to 500+ characters per profile
- All rendering is client-side — no server load
- Static file hosting only (GitHub Pages, Netlify, any CDN)
- Total app size: ~200KB JS + CSS (excluding CDN libraries)
- localStorage usage: well under 500KB per family

---

## What Makes It Different

1. **Dictation-focused** — not a general Chinese learning app; specifically for 听写 test prep
2. **No pinyin crutch** — research-backed approach: pinyin is stored but never shown to kids during activities
3. **Adaptive difficulty** — silently adjusts to each child's pace
4. **Zero friction** — no accounts, no downloads, works in a browser
5. **Parent-managed, kid-operated** — parents set up words, kids do the practicing
6. **Multi-modal** — hearing, reading, writing, and matching in every session
7. **Privacy-first** — all data local, no cloud, no tracking
