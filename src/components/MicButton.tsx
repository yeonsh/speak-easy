interface MicButtonProps {
  isRecording: boolean;
  isProcessing: boolean;
  onRecordStart: () => void;
  onRecordStop: () => void;
}

export function MicButton({
  isRecording,
  isProcessing,
  onRecordStart,
  onRecordStop,
}: MicButtonProps) {
  const handleClick = () => {
    if (isProcessing) return;
    if (isRecording) {
      onRecordStop();
    } else {
      onRecordStart();
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={isProcessing}
      className={`
        relative w-20 h-20 rounded-full transition-all duration-200
        flex items-center justify-center
        ${
          isRecording
            ? "bg-red-500 scale-110 shadow-lg shadow-red-500/30"
            : isProcessing
              ? "bg-[var(--bg-elevated)] cursor-wait opacity-60"
              : "bg-[var(--primary)] hover:bg-[var(--primary-hover)] hover:scale-105 active:scale-95"
        }
      `}
    >
      {isRecording && (
        <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-30" />
      )}

      {isProcessing ? (
        <svg
          className="animate-spin"
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" opacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" />
        </svg>
      ) : (
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
        </svg>
      )}
    </button>
  );
}
