interface ServerStatusProps {
  isLlmRunning: boolean;
  isLlmStarting: boolean;
  isWhisperLoaded: boolean;
  isTtsLoaded: boolean;
  llmError: string | null;
  sttError: string | null;
  ttsError: string | null;
  onStartLlm: () => void;
  onStopLlm: () => void;
  onLoadWhisper: () => void;
  onLoadTts: () => void;
}

export function ServerStatus({
  isLlmRunning,
  isLlmStarting,
  isWhisperLoaded,
  isTtsLoaded,
  llmError,
  sttError,
  ttsError,
  onStartLlm,
  onStopLlm,
  onLoadWhisper,
  onLoadTts,
}: ServerStatusProps) {
  const error = llmError || sttError || ttsError;

  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-[var(--bg-surface)] border-b border-[var(--border)]">
      {/* LLM status */}
      <div className="flex items-center gap-2">
        <span
          className={`w-2 h-2 rounded-full ${
            isLlmRunning
              ? "bg-green-400"
              : isLlmStarting
                ? "bg-yellow-400 animate-pulse"
                : "bg-red-400"
          }`}
        />
        <span className="text-xs text-[var(--text-secondary)]">
          {isLlmRunning ? "LLM" : isLlmStarting ? "LLM starting..." : "LLM off"}
        </span>
        {!isLlmRunning && !isLlmStarting && (
          <button
            onClick={onStartLlm}
            className="px-2 py-0.5 text-xs bg-[var(--primary)] text-white rounded hover:bg-[var(--primary-hover)] transition-colors"
          >
            Start
          </button>
        )}
        {isLlmRunning && (
          <button
            onClick={onStopLlm}
            className="px-2 py-0.5 text-xs bg-[var(--bg-elevated)] text-[var(--text-secondary)] rounded hover:text-[var(--text-primary)] transition-colors"
          >
            Stop
          </button>
        )}
      </div>

      <div className="w-px h-4 bg-[var(--border)]" />

      {/* Whisper status */}
      <div className="flex items-center gap-2">
        <span
          className={`w-2 h-2 rounded-full ${
            isWhisperLoaded ? "bg-green-400" : "bg-red-400"
          }`}
        />
        <span className="text-xs text-[var(--text-secondary)]">
          {isWhisperLoaded ? "STT" : "STT off"}
        </span>
        {!isWhisperLoaded && (
          <button
            onClick={onLoadWhisper}
            className="px-2 py-0.5 text-xs bg-[var(--primary)] text-white rounded hover:bg-[var(--primary-hover)] transition-colors"
          >
            Load
          </button>
        )}
      </div>

      <div className="w-px h-4 bg-[var(--border)]" />

      {/* TTS status */}
      <div className="flex items-center gap-2">
        <span
          className={`w-2 h-2 rounded-full ${
            isTtsLoaded ? "bg-green-400" : "bg-red-400"
          }`}
        />
        <span className="text-xs text-[var(--text-secondary)]">
          {isTtsLoaded ? "TTS" : "TTS off"}
        </span>
        {!isTtsLoaded && (
          <button
            onClick={onLoadTts}
            className="px-2 py-0.5 text-xs bg-[var(--primary)] text-white rounded hover:bg-[var(--primary-hover)] transition-colors"
          >
            Load
          </button>
        )}
      </div>

      {error && (
        <span className="text-xs text-red-400 truncate flex-1 ml-2">
          {error}
        </span>
      )}
    </div>
  );
}
