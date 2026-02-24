# Bilingual Support (English/Spanish)

## Overview

The tone and content analysis system now supports **both English and Spanish** languages with full feature parity.

---

## Language Selection

### Frontend
Users can select language via dropdown:
- **English** (`en`) - Default
- **Español** (`es`) - Spanish

Language selection is available in the control panel before starting recording.

### Backend
Language is passed via WebSocket query parameter:
```
ws://localhost:3000/session-backend?email=waiter@example.com&lang=es
```

---

## Implementation Details

### 1. Speechmatics Transcription
**File:** `src/services/modifyspeechmatricsV2.service.js`

- Accepts `language` parameter: `"en"` or `"es"`
- Configures Speechmatics API with correct language code
- Defaults to `"en"` if not specified

```javascript
createSpeechmaticsSocketModify(clientWs, language = "en")
```

### 2. Tone Classification
**File:** `src/services/toneClassification.service.js`

**Bilingual Text Patterns:**
- All tone categories include both English and Spanish patterns
- Structure: `textPatterns: { category: { en: [...], es: [...] } }`

**LLM Prompt:**
- Updated to handle both languages
- Includes Spanish examples for each category
- GPT-4o-mini classifies based on meaning, not language

**Example Categories:**

| Category | English Example | Spanish Example |
|----------|----------------|-----------------|
| `polite_complaint` | "Excuse me, but the soup is cold" | "Disculpe, pero la sopa está fría" |
| `frustration_complaint` | "This is not what I ordered!" | "¡Esto no es lo que pedí!" |
| `polite_request` | "Could I please have the menu?" | "¿Podría traerme el menú?" |
| `upsell_opportunity` | "This is amazing!" | "¡Esto es increíble!" |

### 3. Content Analysis
**File:** `src/services/contentAnalysis.service.js`

- Updated prompt to handle English and Spanish
- Preserves original language in key phrases
- Analyzes sentiment, topics, intent regardless of language

### 4. Frontend Integration
**File:** `src/pages/Conversation.jsx`

- Language dropdown in control panel
- Language state persists during session
- WebSocket URL includes `lang` parameter

---

## Tone Categories - Spanish Patterns

### `neutral_casual`
- **Spanish:** "vale", "claro", "sí", "no", "tal vez", "quiero", "puedo tener"
- **Routine:** "pedido", "menú", "cuenta", "mesa", "orden"
- **Filler:** "eh", "este", "pues", "bueno"

### `positive_friendly`
- **Spanish:** "gracias", "genial", "maravilloso", "increíble", "me encanta", "perfecto", "excelente"
- **Greetings:** "hola", "buenas tardes", "buenas noches", "encantado", "mucho gusto"
- **Politeness:** "por favor", "gracias", "agradezco"

### `polite_request`
- **Spanish:** "podría", "puedo", "me gustaría", "quisiera", "por favor traiga", "podría traer", "me puede traer"
- **Polite:** "por favor", "disculpe", "perdón", "si es posible"
- **Ordering:** "pedir", "tener", "traer", "menú", "cuenta", "orden"

### `upsell_opportunity`
- **Spanish:** "increíble", "delicioso", "mejor", "me encanta", "fantástico", "asombroso"
- **Satisfaction:** "perfecto", "exactamente", "exactamente lo que quería", "mejor de lo esperado"
- **Enthusiasm:** "guau", "dios mío", "esto es", "absolutamente"

### `neutral_complaint`
- **Spanish:** "esto está", "el", "la", "está", "es"
- **Issue:** "frío", "fría", "incorrecto", "incorrecta", "equivocado", "falta", "no está bien"

### `polite_complaint`
- **Spanish:** "disculpe", "perdón por molestar", "lamento decir", "si es posible", "podría", "podrías"
- **Issue:** "frío", "fría", "incorrecto", "no está bien", "un poco", "ligeramente"
- **Respect:** "por favor", "gracias", "agradezco"

### `frustration_complaint`
- **Spanish:** "no es lo que pedí", "incorrecto", "esto no es", "pedí", "esto no está bien"
- **Frustration:** "en serio", "vamos", "de verdad", "otra vez", "todavía", "aún"
- **Urgency:** "necesito", "quiero", "espero", "debería"

### `angry_escalation`
- **Spanish:** "inaceptable", "terrible", "horrible", "pésimo", "peor", "ridículo"
- **Escalation:** "gerente", "quejarme", "reseña", "nunca volveré", "exijo", "hablar con", "reclamar"
- **Intensity:** "absolutamente", "completamente", "totalmente", "extremadamente", "muy"

### `confusion_uncertain`
- **Spanish:** "no estoy seguro", "no sé", "tal vez", "cuál", "qué recomienda", "estoy confundido", "no entiendo"
- **Questions:** "qué es", "cómo", "puede explicar", "cuál debería", "qué significa"
- **Hesitation:** "eh", "este", "pues", "bueno", "creo"

---

## Usage

### Setting Language

**Frontend:**
1. Select language from dropdown before starting recording
2. Language persists for the entire session
3. Change language requires stopping current session

**API:**
```javascript
// WebSocket URL with language
ws://localhost:3000/session-backend?email=waiter@example.com&lang=es
```

### Example Spanish Conversations

**Polite Complaint:**
- Customer: "Disculpe, pero la sopa está fría"
- Expected: `polite_complaint`
- Intent: `complaining`
- Requires Action: `true`

**Polite Request:**
- Customer: "¿Podría traerme el menú, por favor?"
- Expected: `polite_request`
- Intent: `requesting`
- Requires Action: `true`

**Upsell Opportunity:**
- Customer: "¡Esto está delicioso! Es increíble"
- Expected: `upsell_opportunity`
- Intent: `satisfaction`
- Requires Action: `true`

**Frustration Complaint:**
- Customer: "Esto no es lo que pedí. En serio, otra vez"
- Expected: `frustration_complaint`
- Intent: `complaining`
- Requires Action: `true`

---

## Testing

### Test Spanish Classification

```javascript
// Test cases for Spanish
const spanishTests = [
  {
    text: "Disculpe, pero la sopa está fría",
    expected: "polite_complaint"
  },
  {
    text: "¡Esto es increíble! Me encanta",
    expected: "upsell_opportunity"
  },
  {
    text: "Esto no es lo que pedí",
    expected: "frustration_complaint"
  },
  {
    text: "¿Podría traerme el menú?",
    expected: "polite_request"
  }
];
```

---

## Language Detection

The system does **not** auto-detect language. Language must be:
1. Selected by user in frontend
2. Passed via WebSocket query parameter
3. Configured before starting recording

**Why manual selection?**
- More accurate transcription (Speechmatics needs language upfront)
- Better tone classification (LLM knows language context)
- Prevents misclassification from mixed-language conversations

---

## Future Enhancements

- [ ] Auto-detect language from first few words
- [ ] Support for mixed-language conversations
- [ ] Additional languages (French, Portuguese, etc.)
- [ ] Language-specific business actions

---

## Files Modified

1. `src/services/toneClassification.service.js` - Added Spanish text patterns
2. `src/services/modifyspeechmatricsV2.service.js` - Added language parameter
3. `src/services/contentAnalysis.service.js` - Updated prompt for bilingual
4. `src/ws/speechmaticsV3.js` - Extract language from request
5. `src/pages/Conversation.jsx` - Language selector UI

---

## Summary

✅ **Full bilingual support** for English and Spanish
✅ **Same 10 tone categories** work for both languages
✅ **Language selection** via frontend dropdown
✅ **Speechmatics** configured per language
✅ **LLM classification** handles both languages
✅ **Content analysis** works for both languages

The system is production-ready for bilingual restaurant environments!
