# Tone Classification System - Complete Specification

## Overview

Production-grade tone classification system with:
- ✅ **Clear, non-overlapping categories** (10 mutually exclusive tones)
- ✅ **Audio + text feature mapping** (acoustic metrics + semantic patterns)
- ✅ **Business action mapping** (what to do for each tone)
- ✅ **LLM-optimized prompt** (structured for accuracy)

---

## Tone Categories

### 1. `positive_friendly` 😊
**Definition:** Warm, welcoming, appreciative, genuinely happy. Customer is satisfied and pleasant.

**Text Patterns:**
- Positive: "thank you", "great", "wonderful", "amazing", "love it", "perfect", "excellent", "appreciate"
- Greetings: "hello", "hi", "good evening", "nice to meet"
- Politeness: "please", "thank", "appreciate"

**Audio Mapping:**
- Stress: 0.0 - 0.4
- Confidence: 0.6 - 1.0
- Energy: -50 to -35 dB
- Speech Rate: 110 - 150 bpm

**Business Action:**
- Priority: **Low**
- Action: Maintain service quality, acknowledge appreciation, build rapport
- Next Steps:
  - Thank customer
  - Ask if they need anything else
  - Continue standard service

---

### 2. `neutral_casual` 😐
**Definition:** Normal conversational tone, no strong emotion. Standard interaction, routine communication.

**Text Patterns:**
- Neutral: "okay", "sure", "yes", "no", "maybe", "I'll have", "can I get"
- Routine: "order", "menu", "check", "bill", "table"
- Filler: "um", "uh", "hmm", "well"

**Audio Mapping:**
- Stress: 0.2 - 0.5
- Confidence: 0.4 - 0.7
- Energy: -52 to -42 dB
- Speech Rate: 100 - 140 bpm

**Business Action:**
- Priority: **Normal**
- Action: Continue standard service flow
- Next Steps:
  - Process request normally
  - Provide information
  - Take order

---

### 3. `confused_unsure` 🤔
**Definition:** Hesitant, questioning, uncertain. Customer needs clarification or guidance.

**Text Patterns:**
- Uncertainty: "not sure", "don't know", "maybe", "which one", "what do you recommend", "I'm confused"
- Questions: "what is", "how does", "can you explain", "which should I"
- Hesitation: "um", "uh", "well", "hmm", "I guess"

**Audio Mapping:**
- Stress: 0.3 - 0.6
- Confidence: 0.2 - 0.5
- Energy: -55 to -45 dB
- Speech Rate: 80 - 120 bpm

**Business Action:**
- Priority: **Medium**
- Action: Provide guidance, clarify options, offer recommendations
- Next Steps:
  - Explain menu items
  - Offer recommendations
  - Ask clarifying questions
  - Provide detailed information

---

### 4. `mild_dissatisfaction` 😕
**Definition:** Slight unhappiness or disappointment, but controlled and polite. Not a complaint yet, but signals potential issue.

**Text Patterns:**
- Mild Negative: "okay", "fine", "alright", "nothing special", "it's okay", "could be better"
- Disappointment: "expected more", "not quite", "a bit", "slightly"
- Controlled: "but", "however", "though"

**Audio Mapping:**
- Stress: 0.4 - 0.6
- Confidence: 0.3 - 0.6
- Energy: -50 to -40 dB
- Speech Rate: 100 - 135 bpm

**Business Action:**
- Priority: **Medium-High**
- Action: Proactively address concerns, offer solutions, prevent escalation
- Next Steps:
  - Ask if everything is okay
  - Offer alternatives
  - Check satisfaction
  - Address any concerns

---

### 5. `frustration_complaint` 😤
**Definition:** Clear frustration, annoyance, or complaint. Customer is upset but not aggressive. Issue needs immediate attention.

**Text Patterns:**
- Complaint: "not what I ordered", "wrong", "this is not", "I asked for", "this isn't right"
- Frustration: "seriously", "come on", "really", "again", "still"
- Urgency: "need", "want", "expect", "should"

**Audio Mapping:**
- Stress: 0.6 - 0.85
- Confidence: 0.3 - 0.6
- Energy: -45 to -35 dB
- Speech Rate: 130 - 170 bpm

**Business Action:**
- Priority: **High**
- Action: Immediately address complaint, apologize, offer solution, escalate if needed
- Next Steps:
  - Apologize sincerely
  - Fix issue immediately
  - Offer compensation
  - Notify manager
  - Follow up

---

### 6. `strong_anger` 😡
**Definition:** Very upset, aggressive, hostile. Customer is extremely angry and may escalate. Requires immediate manager intervention.

**Text Patterns:**
- Anger: "unacceptable", "terrible", "awful", "horrible", "worst", "ridiculous"
- Aggression: "manager", "complain", "review", "never coming back", "demand"
- Intensity: "absolutely", "completely", "totally", "extremely", "very"

**Audio Mapping:**
- Stress: 0.8 - 1.0
- Confidence: 0.1 - 0.4
- Energy: -40 to -25 dB
- Speech Rate: 150 - 200 bpm

**Business Action:**
- Priority: **Critical**
- Action: Immediate manager intervention, de-escalate, resolve, prevent negative review
- Next Steps:
  - Get manager immediately
  - Apologize profusely
  - Offer significant compensation
  - Resolve issue completely
  - Follow up after service

---

### 7. `upsell_opportunity` 🤩
**Definition:** Excited, enthusiastic, delighted customer. High satisfaction, perfect moment to suggest premium items or additional services.

**Text Patterns:**
- Excitement: "amazing", "delicious", "best", "love", "fantastic", "incredible"
- Satisfaction: "perfect", "exactly", "exactly what I wanted", "better than expected"
- Enthusiasm: "wow", "oh my", "this is", "absolutely"

**Audio Mapping:**
- Stress: 0.1 - 0.35
- Confidence: 0.75 - 1.0
- Energy: -42 to -32 dB
- Speech Rate: 135 - 165 bpm

**Business Action:**
- Priority: **Low**
- Action: Suggest premium items, desserts, drinks, or additional services
- Next Steps:
  - Suggest premium menu items
  - Offer dessert
  - Recommend wine pairing
  - Suggest appetizers
  - Offer loyalty program

---

### 8. `bored_disengaged` 😴
**Definition:** Low energy, uninterested, monotone. Customer seems disengaged or unenthusiastic. May need attention to re-engage.

**Text Patterns:**
- Disengagement: "whatever", "sure", "fine", "I guess", "doesn't matter"
- Low Energy: "okay", "yeah", "hmm", "sure"
- Monotone: "I'll have", "just", "whatever you recommend"

**Audio Mapping:**
- Stress: 0.1 - 0.3
- Confidence: 0.2 - 0.4
- Energy: -60 to -50 dB
- Speech Rate: 70 - 110 bpm

**Business Action:**
- Priority: **Medium**
- Action: Re-engage customer, show enthusiasm, offer interesting options
- Next Steps:
  - Show enthusiasm
  - Offer recommendations
  - Ask engaging questions
  - Highlight special items
  - Check if they need help

---

### 9. `polite_complaint` 🙂
**Definition:** Polite but clearly raising an issue or concern. Customer is respectful but needs something fixed. Distinguish from `frustration_complaint` by politeness level.

**Text Patterns:**
- Polite: "excuse me", "sorry to bother", "I hate to say", "if possible", "could you"
- Issue: "cold", "wrong", "not quite", "a bit", "slightly"
- Respect: "please", "thank you", "appreciate"

**Audio Mapping:**
- Stress: 0.45 - 0.7
- Confidence: 0.4 - 0.7
- Energy: -48 to -38 dB
- Speech Rate: 115 - 145 bpm

**Business Action:**
- Priority: **High**
- Action: Acknowledge politely, fix issue promptly, thank for patience
- Next Steps:
  - Acknowledge issue politely
  - Fix immediately
  - Thank for patience
  - Check back
  - Ensure satisfaction

---

### 10. `light_humor` 😄
**Definition:** Joking, playful, lighthearted. Customer is in good spirits, making jokes or being playful. Positive interaction.

**Text Patterns:**
- Humor: "haha", "funny", "joke", "lol", "that's hilarious"
- Playful: "just kidding", "teasing", "messing with"
- Lighthearted: "good one", "nice", "clever"

**Audio Mapping:**
- Stress: 0.15 - 0.4
- Confidence: 0.65 - 0.9
- Energy: -45 to -35 dB
- Speech Rate: 120 - 160 bpm

**Business Action:**
- Priority: **Low**
- Action: Engage with humor, build rapport, maintain friendly atmosphere
- Next Steps:
  - Respond with light humor
  - Build rapport
  - Continue friendly interaction
  - Maintain positive atmosphere

---

## Classification Rules (Non-Overlapping)

### Rule 1: Complaint Categories
If text contains complaint words → Choose ONE:
- **`polite_complaint`**: Uses polite phrases ("excuse me", "sorry to bother") + complaint
- **`frustration_complaint`**: Direct complaint ("not what I ordered", "wrong") + frustration words
- **`strong_anger`**: Aggressive language ("unacceptable", "terrible", "manager") + high intensity

### Rule 2: Positive Categories
If text expresses satisfaction → Choose ONE:
- **`positive_friendly`**: General appreciation ("thank you", "great", "wonderful")
- **`upsell_opportunity`**: High excitement ("amazing", "best", "love it", "delicious")
- **`light_humor`**: Joking/playful ("haha", "funny", "just kidding")

### Rule 3: Uncertainty
If text shows uncertainty → **`confused_unsure`**
- Keywords: "not sure", "don't know", "which one", "what do you recommend"

### Rule 4: Neutral/Routine
If text is neutral/routine → **`neutral_casual`**
- Standard ordering, routine questions, filler words

### Rule 5: Mild Disappointment
If text shows mild disappointment → **`mild_dissatisfaction`**
- "okay", "fine", "nothing special", "could be better" (controlled, not complaining)

### Rule 6: Disengagement
If text shows disengagement → **`bored_disengaged`**
- Low energy: "whatever", "sure", "doesn't matter", monotone responses

---

## Audio Signal Guidance

### High Stress (0.7+) + Complaint Words
→ `frustration_complaint` or `strong_anger`

### Low Stress (0.3-) + Positive Words
→ `positive_friendly` or `upsell_opportunity`

### Low Energy (-55dB) + Slow Speech (100bpm)
→ `bored_disengaged`

### Moderate Stress (0.4-0.6) + Polite Words + Complaint
→ `polite_complaint`

---

## Text Overrides Audio

**Critical Rule:** Text meaning takes precedence over acoustic features.

- If text clearly expresses complaint → complaint category (even if audio is calm)
- If text clearly expresses satisfaction → positive category (even if audio is stressed)
- Audio helps distinguish between similar categories (e.g., `polite_complaint` vs `frustration_complaint`)

---

## Examples

| Text | Expected Tone | Reasoning |
|------|---------------|-----------|
| "Hello, I am Vitor" | `neutral_casual` | Greeting, no emotion |
| "Excuse me, but the soup is cold" | `polite_complaint` | Polite + issue |
| "This is not what I ordered!" | `frustration_complaint` | Direct complaint, frustration |
| "This is absolutely unacceptable!" | `strong_anger` | Aggressive, high intensity |
| "Wow, this is amazing!" | `upsell_opportunity` | High excitement |
| "Thank you so much!" | `positive_friendly` | Appreciation |
| "I'm not sure what to order" | `confused_unsure` | Uncertainty |
| "Whatever you recommend is fine" | `bored_disengaged` | Low energy, disengaged |
| "Haha, that's funny!" | `light_humor` | Joking |
| "It's okay, nothing special" | `mild_dissatisfaction` | Mild disappointment |

---

## Implementation Files

- **Backend:** `src/services/toneClassification.service.js`
- **Frontend:** `src/pages/Conversation.jsx`
- **Test Data:** `tests/test-data.json`

---

## API Response Format

```json
{
  "speaker": "S2",
  "tone": "polite_complaint",
  "score": 0.85,
  "text_snippet": "Excuse me, but the soup is cold",
  "source": "llm",
  "businessAction": {
    "priority": "high",
    "action": "Acknowledge politely, fix issue promptly, thank for patience",
    "nextSteps": [
      "Acknowledge issue politely",
      "Fix immediately",
      "Thank for patience",
      "Check back",
      "Ensure satisfaction"
    ]
  }
}
```

---

## Priority Levels

- **Low**: Continue standard service, build rapport
- **Normal**: Standard service flow
- **Medium**: Provide guidance, re-engage
- **Medium-High**: Proactively address concerns
- **High**: Immediate attention required
- **Critical**: Manager intervention needed
