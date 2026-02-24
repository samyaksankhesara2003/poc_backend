# Audio Mapping Architecture: Static vs Dynamic

## Decision: **Hybrid Approach** ✅

**Static ranges** for LLM prompt guidance + **Fuzzy matching** for fallback classification.

---

## Why This Approach?

### Problem with Pure Static
- ❌ Exact range matching fails with speaker variability
- ❌ Different speakers have different baselines (pitch, energy)
- ❌ Environment noise affects absolute values
- ❌ Too rigid for real-world use

### Problem with Pure Dynamic
- ❌ Requires calibration/learning phase
- ❌ More complex to maintain
- ❌ Inconsistent across sessions
- ❌ Harder to debug

### Hybrid Solution ✅
- ✅ **Static ranges** in `TONE_CATEGORIES` for LLM guidance (examples)
- ✅ **Fuzzy matching** for fallback (handles variability)
- ✅ Simple, maintainable, robust

---

## Current Implementation

### 1. Static Ranges (in TONE_CATEGORIES)
```javascript
audioMapping: {
  stress_range: [0.0, 0.4],
  confidence_range: [0.6, 1.0],
  energy_range: [-50, -35],
  speech_rate_range: [110, 150]
}
```

**Used for:**
- LLM prompt guidance (lines 307-311)
- Initial fuzzy matching (not exact)

**Why static here:**
- LLM interprets ranges as examples/guidance
- Provides context for classification
- Consistent across all conversations

### 2. Fuzzy Matching (in `classifyFromAcousticOnly`)
```javascript
// Calculate similarity score for each tone
const stressScore = calculateRangeScore(stress, audio.stress_range);
const confidenceScore = calculateRangeScore(confidence, audio.confidence_range);
// ... weighted average
```

**Used for:**
- Fallback classification when LLM fails
- Handles speaker variability
- Allows 50% tolerance outside ranges

**Why fuzzy:**
- Handles different speaker baselines
- More robust to environment noise
- Still uses static ranges as reference

---

## How Fuzzy Matching Works

### Range Score Calculation
```javascript
function calculateRangeScore(value, range) {
  const [min, max] = range;
  
  if (value >= min && value <= max) {
    return 1.0; // Perfect match
  }
  
  // Outside range: linear penalty
  const tolerance = (max - min) * 0.5; // 50% tolerance
  const distance = value < min ? min - value : value - max;
  return Math.max(0, 1.0 - (distance / tolerance));
}
```

### Example
- Range: `[0.4, 0.6]` for stress
- Value: `0.7` (outside range)
- Tolerance: `0.1` (50% of range size `0.2`)
- Distance: `0.1` (`0.7 - 0.6`)
- Score: `1.0 - (0.1 / 0.1) = 0.0` (too far)

- Value: `0.65` (slightly outside)
- Distance: `0.05`
- Score: `1.0 - (0.05 / 0.1) = 0.5` (partial match)

---

## Alternative: Fully Dynamic (Future Enhancement)

If you want fully dynamic ranges, here's how:

### Option 1: Per-Speaker Baseline
```javascript
class ToneClassifier {
  constructor() {
    this._speakerBaselines = {}; // Track per-speaker baselines
  }
  
  _updateBaseline(speaker, metrics) {
    // Track first few utterances to establish baseline
    if (!this._speakerBaselines[speaker]) {
      this._speakerBaselines[speaker] = {
        stress: [],
        confidence: [],
        energy: [],
        speechRate: []
      };
    }
    
    // Store metrics (keep last 10)
    const baseline = this._speakerBaselines[speaker];
    baseline.stress.push(metrics.stress_level);
    // ... calculate mean/std
  }
  
  _normalizeMetrics(metrics, speaker) {
    const baseline = this._speakerBaselines[speaker];
    return {
      stress: (metrics.stress_level - baseline.stress_mean) / baseline.stress_std,
      // ... normalize relative to speaker baseline
    };
  }
}
```

**Pros:**
- Adapts to individual speakers
- More accurate for diverse populations

**Cons:**
- Requires calibration phase
- More complex
- May not converge quickly

### Option 2: Session-Based Adaptation
```javascript
class ToneClassifier {
  constructor() {
    this._sessionStats = {
      minStress: Infinity,
      maxStress: -Infinity,
      // ... track min/max per session
    };
  }
  
  _adaptRanges(staticRanges) {
    // Scale ranges based on observed session values
    const stressRange = staticRanges.stress_range;
    const observedRange = this._sessionStats.maxStress - this._sessionStats.minStress;
    
    return {
      stress_range: [
        stressRange[0] * observedRange,
        stressRange[1] * observedRange
      ],
      // ... adapt other ranges
    };
  }
}
```

**Pros:**
- Adapts to session environment
- Handles noise/calibration issues

**Cons:**
- Requires enough data points
- May drift over time

---

## Recommendation

**Keep current hybrid approach** because:

1. ✅ **Simple & Maintainable**: Static ranges are easy to understand
2. ✅ **Robust**: Fuzzy matching handles variability
3. ✅ **Production-Ready**: Works well in practice
4. ✅ **LLM-First**: Primary classification uses LLM (text + audio), fallback is rare

**Consider dynamic if:**
- You see consistent misclassification in fallback mode
- You have diverse speaker populations with very different baselines
- You want to optimize for specific environments

---

## Testing the Current Approach

To validate fuzzy matching:

```javascript
// Test with different speaker profiles
const testCases = [
  { stress: 0.5, confidence: 0.6, energy: -45, speechRate: 130 }, // Normal speaker
  { stress: 0.3, confidence: 0.8, energy: -50, speechRate: 120 }, // Calm speaker (lower baseline)
  { stress: 0.7, confidence: 0.4, energy: -40, speechRate: 150 }, // Anxious speaker (higher baseline)
];

testCases.forEach(metrics => {
  const result = classifyFromAcousticOnly(metrics);
  console.log(`Metrics: ${JSON.stringify(metrics)} → Tone: ${result.tone} (${result.score})`);
});
```

---

## Summary

| Aspect | Static | Dynamic | Hybrid (Current) |
|--------|--------|---------|------------------|
| **LLM Guidance** | ✅ Static ranges | ❌ Complex | ✅ Static ranges |
| **Fallback** | ❌ Exact match | ✅ Adaptive | ✅ Fuzzy matching |
| **Complexity** | Low | High | Medium |
| **Maintainability** | High | Low | High |
| **Accuracy** | Low (rigid) | High (adaptive) | Medium-High (robust) |
| **Production Ready** | ❌ | ⚠️ | ✅ |

**Current choice: Hybrid** ✅
