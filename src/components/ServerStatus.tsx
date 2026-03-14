import type { NativeLanguage } from "../lib/types";
import { t } from "../lib/i18n";

interface ServerStatusProps {
  isLlmRunning: boolean;
  isLlmStarting: boolean;
  isWhisperLoaded: boolean;
  isTtsLoaded: boolean;
  llmError: string | null;
  sttError: string | null;
  ttsError: string | null;
  nativeLanguage: NativeLanguage;
  onStartLlm: () => void;
  onStopLlm: () => void;
  onLoadWhisper: () => void;
  onLoadTts: () => void;
}

function Dot({ color }: { color: "green" | "yellow" | "red" }) {
  const cls =
    color === "green" ? "bg-green-400" :
    color === "yellow" ? "bg-yellow-400 animate-pulse" :
    "bg-red-400";
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${cls}`} />;
}

export function ServerStatus({
  isLlmRunning,
  isLlmStarting,
  isWhisperLoaded,
  isTtsLoaded,
  llmError,
  sttError,
  ttsError,
  nativeLanguage,
  onStartLlm,
  onStopLlm,
  onLoadWhisper,
  onLoadTts,
}: ServerStatusProps) {
  const error = llmError || sttError || ttsError;
  const allOk = isLlmRunning && isWhisperLoaded && isTtsLoaded && !error;

  // When everything is running and no errors, show minimal bar
  if (allOk) {
    return (
      <div className="flex items-center gap-3 px-3 py-1 bg-[var(--bg-main)] border-t border-[var(--border)] text-[10px] text-[var(--text-secondary)]">
        <span className="flex items-center gap-1"><Dot color="green" /> LLM</span>
        <span className="flex items-center gap-1"><Dot color="green" /> STT</span>
        <span className="flex items-center gap-1"><Dot color="green" /> TTS</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-3 py-1 bg-[var(--bg-main)] border-t border-[var(--border)] text-[10px] text-[var(--text-secondary)]">
      {/* LLM */}
      <span className="flex items-center gap-1">
        <Dot color={isLlmRunning ? "green" : isLlmStarting ? "yellow" : "red"} />
        {isLlmRunning ? "LLM" : isLlmStarting ? t("llmStarting", nativeLanguage) : (
          <button onClick={onStartLlm} className="hover:text-[var(--text-primary)] transition-colors underline decoration-dotted">
            {t("llmOff", nativeLanguage)}
          </button>
        )}
        {isLlmRunning && (
          <button onClick={onStopLlm} className="hover:text-[var(--text-primary)] transition-colors opacity-50 hover:opacity-100">
            {t("stop", nativeLanguage)}
          </button>
        )}
      </span>

      {/* STT */}
      <span className="flex items-center gap-1">
        <Dot color={isWhisperLoaded ? "green" : "red"} />
        {isWhisperLoaded ? "STT" : (
          <button onClick={onLoadWhisper} className="hover:text-[var(--text-primary)] transition-colors underline decoration-dotted">
            {t("sttOff", nativeLanguage)}
          </button>
        )}
      </span>

      {/* TTS */}
      <span className="flex items-center gap-1">
        <Dot color={isTtsLoaded ? "green" : "red"} />
        {isTtsLoaded ? "TTS" : (
          <button onClick={onLoadTts} className="hover:text-[var(--text-primary)] transition-colors underline decoration-dotted">
            {t("ttsOff", nativeLanguage)}
          </button>
        )}
      </span>

      {error && (
        <span className="text-red-400 truncate ml-auto">{error}</span>
      )}
    </div>
  );
}
