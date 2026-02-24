# Accuracy Test Suite

Comprehensive test suite for validating tone and content analysis accuracy with labeled test data.

## Overview

This test suite evaluates the accuracy of:
- **Tone Classification**: 15 labeled test cases covering all 10 tone categories
- **Content Analysis**: 5 labeled conversation test cases

## Test Data

The test data (`test-data.json`) includes:
- **Tone Test Cases**: Real-world utterances with expected tone labels and acoustic metrics
- **Content Test Cases**: Multi-turn conversations with expected topics, intent, sentiment, and risk signals

## Running Tests

### Quick Start (Mock Mode - No API Calls)

```bash
cd poc_backend
node tests/test-runner.js
```

This runs tests using a mock OpenAI client (rule-based responses) - **no API costs**.

### With Real OpenAI API

```bash
# Set your API key
export OPENAI_API_KEY=sk-your-key-here

# Run with real API
node tests/test-runner.js --use-real-api
```

### Custom Output File

```bash
node tests/test-runner.js --output custom-report.html
```

## Test Results

The test runner generates:
1. **Console Output**: Real-time progress and summary
2. **HTML Report**: Detailed report with:
   - Overall accuracy metrics
   - Per-test-case results
   - Confusion matrix
   - Precision/Recall/F1 per tone category
   - Content analysis accuracy breakdown

## Expected Accuracy

### Tone Classification
- **Target**: 80-90%+ accuracy
- **Current**: See test report

### Content Analysis
- **Topics**: 70%+ accuracy (partial match)
- **Intent**: 80%+ accuracy
- **Sentiment**: 85%+ accuracy
- **Risk Signals**: 90%+ accuracy

## Adding Test Cases

Edit `test-data.json` to add new test cases:

```json
{
  "tone_test_cases": [
    {
      "id": "tone-016",
      "speaker": "CUSTOMER",
      "text": "Your example text here",
      "acoustic_metrics": {
        "stress_level": 0.5,
        "confidence_level": 0.6,
        "energy_db": -45.0,
        "speech_rate": 130
      },
      "expected_tone": "neutral_casual",
      "description": "Description of test case"
    }
  ]
}
```

## Metrics Explained

### Precision
Percentage of predicted positives that were actually correct.
```
Precision = True Positives / (True Positives + False Positives)
```

### Recall
Percentage of actual positives that were correctly identified.
```
Recall = True Positives / (True Positives + False Negatives)
```

### F1 Score
Harmonic mean of precision and recall.
```
F1 = 2 * (Precision * Recall) / (Precision + Recall)
```

### Confusion Matrix
Shows how often each tone was confused with another. Diagonal = correct predictions.

## Continuous Integration

Add to CI/CD pipeline:

```yaml
# Example GitHub Actions
- name: Run Accuracy Tests
  run: |
    cd poc_backend
    node tests/test-runner.js
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

## Troubleshooting

### Tests Hang
- Check OpenAI API key is set (if using real API)
- Increase timeout values in test-runner.js
- Check network connectivity

### Low Accuracy
- Review confusion matrix to identify patterns
- Check if test cases match real-world usage
- Consider prompt engineering improvements

### Mock vs Real API
- Mock mode uses simple rule-based classification (lower accuracy)
- Real API uses GPT-4o-mini (higher accuracy, costs money)
- Use mock for development, real API for validation
