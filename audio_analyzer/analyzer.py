"""
Acoustic feature extraction from raw PCM audio.

Extracts stress, confidence, energy, pitch, speech rate, and other
metrics from 16-bit 16 kHz PCM.  Tone CLASSIFICATION is handled by
the LLM layer (Node.js) using these metrics + transcript text.

CPU-only, <15 ms per 3-second window.
"""

import numpy as np
from scipy.signal import lfilter
import librosa


class AudioAnalyzer:
    def __init__(self, sample_rate: int = 16000, window_seconds: float = 3.0):
        self.sr = sample_rate
        self.window_samples = int(sample_rate * window_seconds)

    def pcm_to_float(self, pcm_bytes: bytes) -> np.ndarray:
        return np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32) / 32768.0

    def analyze(self, pcm_bytes: bytes) -> dict:
        audio = self.pcm_to_float(pcm_bytes)
        if len(audio) < self.sr * 0.5:
            return self._empty_result()

        audio = self._preemphasis(audio)
        f = self._extract_features(audio)
        stress = self._compute_stress(f)
        confidence = self._compute_confidence(f)

        return {
            "audio_metrics": {
                "stress_level": round(stress, 3),
                "confidence_level": round(confidence, 3),
                "energy": round(f["energy_mean"], 4),
                "energy_db": round(f["energy_db"], 1),
                "speech_rate": round(f["speech_rate"], 1),
                "pitch_mean_hz": round(f["pitch_mean"], 1),
                "pitch_std_hz": round(f["pitch_std"], 1),
                "pitch_variation": round(f["pitch_variation"], 3),
                "spectral_centroid": round(f["spectral_centroid"], 1),
                "voice_quality": f["voice_quality"],
            }
        }

    def _preemphasis(self, audio, coeff=0.97):
        return lfilter([1, -coeff], 1, audio).astype(np.float32)

    def _extract_features(self, audio):
        rms = librosa.feature.rms(y=audio, frame_length=512, hop_length=256)[0]
        energy_mean = float(np.mean(rms))
        energy_std = float(np.std(rms))
        energy_db = float(20 * np.log10(max(energy_mean, 1e-10)))
        energy_dynamics = energy_std / max(energy_mean, 1e-6)

        f0, _, _ = librosa.pyin(
            audio, fmin=65, fmax=330, sr=self.sr,
            frame_length=2048, hop_length=256
        )
        voiced_f0 = f0[~np.isnan(f0)] if f0 is not None else np.array([])
        if len(voiced_f0) > 0:
            voiced_f0 = voiced_f0[(voiced_f0 >= 65) & (voiced_f0 <= 330)]

        if len(voiced_f0) > 2:
            pitch_mean = float(np.median(voiced_f0))
            pitch_std = float(np.std(voiced_f0))
            pitch_variation = pitch_std / max(pitch_mean, 1e-6)
            voiced_ratio = len(voiced_f0) / max(len(f0), 1)
        else:
            pitch_mean = pitch_std = pitch_variation = 0.0
            voiced_ratio = 0.0

        onset_frames = librosa.onset.onset_detect(
            y=audio, sr=self.sr, hop_length=256, backtrack=False
        )
        duration = len(audio) / self.sr
        speech_rate = len(onset_frames) / max(duration, 0.1) * 60

        centroid = librosa.feature.spectral_centroid(y=audio, sr=self.sr, hop_length=256)[0]
        spectral_centroid = float(np.mean(centroid))

        if pitch_variation < 0.05 and energy_mean < 0.005:
            voice_quality = "silence"
        elif voiced_ratio > 0.6 and pitch_variation < 0.2:
            voice_quality = "clear"
        elif voiced_ratio < 0.3:
            voice_quality = "breathy"
        elif pitch_variation > 0.4:
            voice_quality = "strained"
        else:
            voice_quality = "normal"

        return {
            "energy_mean": energy_mean, "energy_std": energy_std,
            "energy_db": energy_db, "energy_dynamics": energy_dynamics,
            "pitch_mean": pitch_mean, "pitch_std": pitch_std,
            "pitch_variation": pitch_variation, "voiced_ratio": voiced_ratio,
            "speech_rate": speech_rate, "spectral_centroid": spectral_centroid,
            "voice_quality": voice_quality,
        }

    def _compute_stress(self, f):
        s = 0.0
        if f["pitch_mean"] > 0:
            s += self._sig(f["pitch_mean"], 160, 0.012) * 0.22
        else:
            s += 0.12
        s += self._sig(f["pitch_variation"], 0.12, 8) * 0.18
        s += self._sig(f["energy_dynamics"], 0.30, 4) * 0.18
        s += self._sig(f["speech_rate"], 140, 0.01) * 0.14
        s += self._sig(f["energy_db"], -42, 0.08) * 0.14
        s += self._sig(f["spectral_centroid"], 1600, 0.0006) * 0.14
        return float(np.clip(s, 0, 1))

    def _compute_confidence(self, f):
        c = 0.0
        c += (1 - min(f["pitch_variation"] / 0.35, 1.0)) * 0.25
        c += (1 - min(f["energy_dynamics"] / 0.7, 1.0)) * 0.20
        c += min(f["voiced_ratio"] / 0.6, 1.0) * 0.25
        c += self._sig(f["energy_db"], -52, 0.06) * 0.20
        c += self._gauss(f["speech_rate"], 130, 50) * 0.10
        return float(np.clip(c, 0, 1))

    @staticmethod
    def _sig(x, center, scale):
        z = np.clip((x - center) * scale, -20, 20)
        return float(1 / (1 + np.exp(-z)))

    @staticmethod
    def _gauss(x, mean, std):
        return float(np.exp(-0.5 * ((x - mean) / max(std, 1e-6)) ** 2))

    def _empty_result(self):
        return {
            "audio_metrics": {
                "stress_level": 0.0, "confidence_level": 0.0,
                "energy": 0.0, "energy_db": -60.0,
                "speech_rate": 0.0, "pitch_mean_hz": 0.0,
                "pitch_std_hz": 0.0, "pitch_variation": 0.0,
                "spectral_centroid": 0.0, "voice_quality": "silence",
            }
        }
