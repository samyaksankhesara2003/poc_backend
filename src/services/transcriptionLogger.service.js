/**
 * createTranscriptionLogger
 *
 * Factory function that returns a lightweight logger object.
 * It buffers Speechmatics AddTranscript text and logs it every ~6 seconds.
 *
 * Usage:
 *   const logger = createTranscriptionLogger({ intervalMs: 6000 });
 *   logger.start();
 *   logger.push(addTranscriptMessage);
 *   logger.stop();
 */

const DEFAULT_INTERVAL_MS = 6_000; // 6 seconds (within the 5–7 s range)

/**
 * @param {object}  opts
 * @param {number}  [opts.intervalMs=6000]  - Logging interval in ms
 * @param {string}  [opts.sessionId]        - Optional label for log lines
 * @param {(text: string, meta: object) => void} [opts.onInterval] - Optional
 *        callback invoked with the buffered text each interval.
 *        Useful for piping text into another service (e.g. searchMenuWithEmbeddingService).
 */
export function createTranscriptionLogger(opts = {}) {
    const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
    const sessionId = opts.sessionId ?? `sess_${Date.now()}`;
    const onInterval = opts.onInterval ?? null;

    let buffer = [];
    let timer = null;
    let intervalCount = 0;

    // ── internal ────────────────────────────────────────────────

    function flush() {
        if (buffer.length === 0) return;

        intervalCount += 1;
        const collected = buffer.join(" ");
        buffer = [];

        const meta = {
            sessionId,
            intervalNumber: intervalCount,
            timestamp: new Date().toISOString(),
            fragmentCount: collected.split(" ").length,
        };

        console.log(
            `📝 [TranscriptionLogger][${sessionId}] Interval #${intervalCount}: "${collected}"`,
        );

        if (typeof onInterval === "function") {
            try {
                onInterval(collected, meta);
            } catch (err) {
                console.error(
                    `📝 [TranscriptionLogger][${sessionId}] onInterval callback error:`,
                    err,
                );
            }
        }
    }

    // ── public API ──────────────────────────────────────────────

    function start() {
        if (timer) return;
        console.log(
            `📝 [TranscriptionLogger][${sessionId}] Started — logging every ${intervalMs / 1000}s`,
        );
        timer = setInterval(flush, intervalMs);
    }

    function push(addTranscriptMsg) {
        if (!addTranscriptMsg?.results) return;

        const text = addTranscriptMsg.results
            .map((r) => r.alternatives?.[0]?.content ?? "")
            .join("")
            .trim();

        if (text.length > 0) {
            buffer.push(text);
        }
    }

    function stop() {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
        flush(); // final flush so we never lose trailing text
        console.log(
            `📝 [TranscriptionLogger][${sessionId}] Stopped after ${intervalCount} intervals`,
        );
    }

    return { start, push, stop };
}
