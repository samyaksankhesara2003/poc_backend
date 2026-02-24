# Test Suite Implementation Notes

## Current Status

✅ **Completed:**
- Test data structure with 15 tone test cases and 5 content test cases
- Test runner framework with metrics calculation
- HTML report generation with confusion matrix
- Precision/Recall/F1 calculation per tone category

⚠️ **Needs Service Modification:**

The test runner currently uses the real services (`ToneClassifier`, `ContentAnalyzer`), which import OpenAI directly. To fully support mock testing, the services need to accept an optional OpenAI instance via dependency injection.

## Required Service Modifications

### Option 1: Dependency Injection (Recommended)

Modify `toneClassification.service.js` and `contentAnalysis.service.js` to accept an optional OpenAI instance:

```javascript
export class ToneClassifier {
  constructor(onToneResult, openaiInstance = null) {
    this._openai = openaiInstance || new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    // ... rest of constructor
  }
}
```

### Option 2: Environment-Based Mocking

Use environment variable to switch between real and mock:

```javascript
const openai = process.env.USE_MOCK_OPENAI === "true" 
  ? createMockOpenAI() 
  : new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
```

### Option 3: Module Mocking (Advanced)

Use a module mocking library like `rewire` or `proxyquire` to replace OpenAI at test time.

## Test Data Structure

### Tone Test Cases
Each test case includes:
- `id`: Unique identifier
- `speaker`: "WAITER" or "CUSTOMER"
- `text`: The utterance to classify
- `acoustic_metrics`: Simulated acoustic features (stress, confidence, energy, speech_rate)
- `expected_tone`: Ground truth tone label
- `description`: Human-readable description

### Content Test Cases
Each test case includes:
- `id`: Unique identifier
- `segments`: Array of conversation segments with role and text
- `expected`: Expected analysis results (topics, intent, sentiment, toxicity, risk_signals)
- `description`: Human-readable description

## Running Tests

### Mock Mode (Current - Uses Real Services)
```bash
npm test
```

**Note:** Currently uses real OpenAI API unless services are modified for dependency injection.

### Real API Mode
```bash
npm run test:real-api
```

## Metrics Calculated

1. **Overall Accuracy**: Percentage of correct predictions
2. **Per-Category Metrics**:
   - Precision: TP / (TP + FP)
   - Recall: TP / (TP + FN)
   - F1 Score: 2 * (Precision * Recall) / (Precision + Recall)
   - Support: Number of test cases per category
3. **Confusion Matrix**: Shows misclassification patterns
4. **Content Analysis Metrics**: Accuracy per field (topics, intent, sentiment, risk)

## Adding More Test Cases

1. Edit `test-data.json`
2. Add new test cases following the existing structure
3. Ensure `expected_tone` matches one of the 10 tone categories
4. Run tests: `npm test`

## Future Improvements

- [ ] Implement dependency injection in services
- [ ] Add more diverse test cases (different languages, accents)
- [ ] Add performance benchmarks (latency, throughput)
- [ ] Add regression testing (compare against baseline)
- [ ] Integrate with CI/CD pipeline
- [ ] Add visualizations (charts, graphs)
