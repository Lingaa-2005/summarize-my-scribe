# AI Logs

## 🎯 Goal

Build an AI-powered meeting summarizer that converts audio into structured insights including transcript, TLDR, key points, and action items.

---

## 🧠 Prompt Iterations

### 🔹 Initial Prompt

```
Summarize this transcript.
```

**Issue:** Output was too generic and lacked structure.

---

### 🔹 Improved Prompt

```
You are an AI meeting assistant.

Given this transcript:
- Generate:
  1. TLDR (2 lines)
  2. Key points (bullet format)
  3. Action items

Transcript:
{input}
```

**Improvement:** Structured output with better readability.

---

### 🔹 Final Prompt (Used in App)

```
You are an AI meeting assistant.

Analyze the transcript and generate:

1. TLDR (2-3 lines)
2. Key points (clear bullet points)
3. Action items (with responsible person if possible)
4. Key decisions (if any)

Ensure clarity and avoid repetition.

Transcript:
{input}
```

**Result:** High-quality structured summaries with actionable insights.

---

## ⚙️ AI Usage

* Speech-to-text: Whisper API
* Text summarization: GPT model

---

## 💡 Learnings

* Prompt structure directly impacts output quality
* Adding explicit formatting improves usability
* Iterative refinement is essential for consistent results
