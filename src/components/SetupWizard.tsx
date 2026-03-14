import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface SetupStatus {
  has_whisper: boolean;
  has_llm: boolean;
  has_tts: boolean;
  has_llama_server: boolean;
  models_dir: string;
  voices_dir: string;
}

interface ModelInfo {
  id: string;
  name: string;
  size_bytes: number;
  url: string;
  dest_dir: string;
  filename: string;
}

interface DownloadState {
  downloading: boolean;
  progress: number;
  total: number | null;
  error: string | null;
  complete: boolean;
}

interface SetupWizardProps {
  onComplete: () => void;
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [downloads, setDownloads] = useState<Record<string, DownloadState>>({});

  useEffect(() => {
    checkStatus();
    invoke<ModelInfo[]>("get_available_models").then(setModels);
  }, []);

  const checkStatus = async () => {
    const s = await invoke<SetupStatus>("check_setup_complete");
    setStatus(s);
  };

  const startDownload = useCallback(
    async (model: ModelInfo) => {
      const downloadId = model.id;

      setDownloads((d) => ({
        ...d,
        [downloadId]: {
          downloading: true,
          progress: 0,
          total: model.size_bytes,
          error: null,
          complete: false,
        },
      }));

      // Listen for progress
      const unProgress = await listen<{
        id: string;
        downloaded: number;
        total: number | null;
      }>(`download-progress-${downloadId}`, (event) => {
        setDownloads((d) => ({
          ...d,
          [downloadId]: {
            ...d[downloadId],
            progress: event.payload.downloaded,
            total: event.payload.total ?? model.size_bytes,
          },
        }));
      });

      const unComplete = await listen<boolean>(
        `download-complete-${downloadId}`,
        () => {
          setDownloads((d) => ({
            ...d,
            [downloadId]: {
              ...d[downloadId],
              downloading: false,
              complete: true,
            },
          }));
          unProgress();
          unComplete();
          checkStatus();
        },
      );

      const unError = await listen<string>(
        `download-error-${downloadId}`,
        (event) => {
          setDownloads((d) => ({
            ...d,
            [downloadId]: {
              ...d[downloadId],
              downloading: false,
              error: event.payload,
            },
          }));
          unProgress();
          unError();
        },
      );

      await invoke("download_file", {
        url: model.url,
        destDir: model.dest_dir,
        filename: model.filename,
        downloadId,
      });
    },
    [],
  );

  const openFolder = async () => {
    await invoke("open_models_folder");
  };

  if (!status) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full" />
      </div>
    );
  }

  const steps = [
    { title: "Welcome", component: <WelcomeStep onNext={() => setStep(1)} /> },
    {
      title: "Speech Recognition",
      component: (
        <WhisperStep
          status={status}
          models={models.filter((m) => m.id.startsWith("whisper"))}
          downloads={downloads}
          onDownload={startDownload}
          onNext={() => setStep(2)}
          onBack={() => setStep(0)}
        />
      ),
    },
    {
      title: "Language Model",
      component: (
        <LlmStep
          status={status}
          downloads={downloads}
          onDownload={startDownload}
          onOpenFolder={openFolder}
          onRefresh={checkStatus}
          onNext={() => setStep(3)}
          onBack={() => setStep(1)}
        />
      ),
    },
    {
      title: "Text to Speech",
      component: (
        <TtsStep
          status={status}
          models={models.filter((m) => m.id.startsWith("voice"))}
          downloads={downloads}
          onDownload={startDownload}
          onNext={() => setStep(4)}
          onBack={() => setStep(2)}
        />
      ),
    },
    {
      title: "Ready",
      component: (
        <ReadyStep status={status} onComplete={onComplete} onBack={() => setStep(3)} />
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Progress bar */}
      <div className="flex items-center gap-2 px-6 pt-6">
        {steps.map((_s, i) => (
          <div key={i} className="flex items-center gap-2 flex-1">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                i <= step
                  ? "bg-[var(--primary)] text-white"
                  : "bg-[var(--bg-elevated)] text-[var(--text-secondary)]"
              }`}
            >
              {i < step ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            {i < steps.length - 1 && (
              <div
                className={`flex-1 h-0.5 transition-colors ${
                  i < step ? "bg-[var(--primary)]" : "bg-[var(--bg-elevated)]"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto px-6 py-8">{steps[step].component}</div>
    </div>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-6">
      <div className="w-20 h-20 rounded-2xl bg-[var(--primary)] flex items-center justify-center">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
        </svg>
      </div>
      <div>
        <h1 className="text-2xl font-bold mb-2">Welcome to SpeakEasy</h1>
        <p className="text-[var(--text-secondary)] max-w-sm">
          Practice speaking foreign languages with AI — completely offline and
          private. Let's set up the models you'll need.
        </p>
      </div>
      <button
        onClick={onNext}
        className="px-8 py-3 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-hover)] transition-colors font-medium"
      >
        Get Started
      </button>
    </div>
  );
}

function WhisperStep({
  status,
  models,
  downloads,
  onDownload,
  onNext,
  onBack,
}: {
  status: SetupStatus;
  models: ModelInfo[];
  downloads: Record<string, DownloadState>;
  onDownload: (m: ModelInfo) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-1">Speech Recognition</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Whisper converts your speech to text. The Base model works well for
          most languages.
        </p>
      </div>

      {status.has_whisper && (
        <div className="flex items-center gap-2 p-3 bg-green-500/10 rounded-lg text-green-400 text-sm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          Whisper model already installed
        </div>
      )}

      <div className="space-y-3">
        {models.map((model) => {
          const dl = downloads[model.id];
          const isComplete = dl?.complete || status.has_whisper;
          return (
            <div
              key={model.id}
              className="p-4 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-sm">{model.name}</span>
                <span className="text-xs text-[var(--text-secondary)]">
                  {formatBytes(model.size_bytes)}
                </span>
              </div>
              {dl?.downloading && (
                <div className="mt-2">
                  <div className="w-full h-2 bg-[var(--bg-main)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--primary)] transition-all duration-300"
                      style={{
                        width: `${dl.total ? (dl.progress / dl.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs text-[var(--text-secondary)] mt-1">
                    {formatBytes(dl.progress)} / {formatBytes(dl.total ?? model.size_bytes)}
                  </span>
                </div>
              )}
              {dl?.error && (
                <p className="text-xs text-red-400 mt-1">{dl.error}</p>
              )}
              {!dl?.downloading && !isComplete && (
                <button
                  onClick={() => onDownload(model)}
                  className="mt-2 px-4 py-1.5 text-xs bg-[var(--primary)] text-white rounded hover:bg-[var(--primary-hover)] transition-colors"
                >
                  Download
                </button>
              )}
              {isComplete && (
                <span className="text-xs text-green-400 mt-2 inline-block">Installed</span>
              )}
            </div>
          );
        })}
      </div>

      <NavButtons onBack={onBack} onNext={onNext} nextLabel={status.has_whisper ? "Next" : "Skip"} />
    </div>
  );
}

function LlmStep({
  status,
  downloads,
  onDownload,
  onOpenFolder,
  onRefresh,
  onNext,
  onBack,
}: {
  status: SetupStatus;
  downloads: Record<string, DownloadState>;
  onDownload: (m: ModelInfo) => void;
  onOpenFolder: () => void;
  onRefresh: () => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [serverInfo, setServerInfo] = useState<ModelInfo | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  const serverDl = downloads["llama-server"];

  useEffect(() => {
    if (!status.has_llama_server) {
      invoke<ModelInfo>("get_llama_server_info")
        .then(setServerInfo)
        .catch(() => {});
    }
  }, [status.has_llama_server]);

  // Auto-extract after download completes
  useEffect(() => {
    if (serverDl?.complete && !extracting) {
      setExtracting(true);
      setExtractError(null);
      invoke("extract_llama_server")
        .then(() => {
          setExtracting(false);
          onRefresh();
        })
        .catch((e) => {
          setExtracting(false);
          setExtractError(String(e));
        });
    }
  }, [serverDl?.complete, extracting, onRefresh]);

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-1">Language Model</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          The LLM engine and a model file are needed for conversations.
        </p>
      </div>

      <div className="space-y-3">
        {/* llama-server status / download */}
        <div className="p-4 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]">
          <div className="flex items-center gap-3 mb-1">
            <span className={`w-3 h-3 rounded-full flex-shrink-0 ${status.has_llama_server ? "bg-green-400" : "bg-yellow-400"}`} />
            <span className="font-medium text-sm">llama-server</span>
          </div>

          {status.has_llama_server ? (
            <p className="text-xs text-green-400 ml-6">Installed</p>
          ) : (
            <>
              <p className="text-xs text-[var(--text-secondary)] ml-6 mb-2">
                LLM inference engine — required for chat
              </p>

              {serverDl?.downloading && (
                <div className="ml-6 mt-2">
                  <div className="w-full h-2 bg-[var(--bg-main)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--primary)] transition-all duration-300"
                      style={{
                        width: `${serverDl.total ? (serverDl.progress / serverDl.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs text-[var(--text-secondary)] mt-1">
                    {formatBytes(serverDl.progress)} / {formatBytes(serverDl.total ?? 0)}
                  </span>
                </div>
              )}

              {extracting && (
                <p className="text-xs text-yellow-400 ml-6 mt-1">Extracting...</p>
              )}

              {extractError && (
                <p className="text-xs text-red-400 ml-6 mt-1">{extractError}</p>
              )}

              {serverDl?.error && (
                <p className="text-xs text-red-400 ml-6 mt-1">{serverDl.error}</p>
              )}

              {!serverDl?.downloading && !serverDl?.complete && !extracting && serverInfo && (
                <button
                  onClick={() => onDownload(serverInfo)}
                  className="ml-6 mt-2 px-4 py-1.5 text-xs bg-[var(--primary)] text-white rounded hover:bg-[var(--primary-hover)] transition-colors"
                >
                  Download ({formatBytes(serverInfo.size_bytes)})
                </button>
              )}
            </>
          )}
        </div>

        {/* GGUF model status */}
        <StatusItem
          label="GGUF model"
          ok={status.has_llm}
          hint={
            status.has_llm
              ? "Model found"
              : "Download a .gguf model and place it in the models folder"
          }
        />
      </div>

      <div className="flex gap-3">
        <button
          onClick={onOpenFolder}
          className="px-4 py-2 text-sm bg-[var(--bg-elevated)] text-[var(--text-primary)] rounded-lg hover:bg-[var(--border)] transition-colors"
        >
          Open Models Folder
        </button>
        <button
          onClick={onRefresh}
          className="px-4 py-2 text-sm bg-[var(--bg-elevated)] text-[var(--text-secondary)] rounded-lg hover:text-[var(--text-primary)] transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="p-3 bg-[var(--bg-elevated)] rounded-lg text-xs text-[var(--text-secondary)] space-y-1">
        <p className="font-medium text-[var(--text-primary)]">Recommended models:</p>
        <p>Quick start: Qwen3-4B-Q4_K_M.gguf (~2.5 GB)</p>
        <p>Full quality: Qwen3-30B-A3B-Q4_K_M.gguf (~17 GB)</p>
        <p className="mt-2">
          Models dir: <code className="text-[var(--primary)]">{status.models_dir}</code>
        </p>
      </div>

      <NavButtons onBack={onBack} onNext={onNext} nextLabel={status.has_llm && status.has_llama_server ? "Next" : "Skip"} />
    </div>
  );
}

function TtsStep({
  status,
  models,
  downloads,
  onDownload,
  onNext,
  onBack,
}: {
  status: SetupStatus;
  models: ModelInfo[];
  downloads: Record<string, DownloadState>;
  onDownload: (m: ModelInfo) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  // Group voice models by language (pair onnx + json)
  const voiceLangs = [
    { code: "en", flag: "🇺🇸", label: "English" },
    { code: "es", flag: "🇪🇸", label: "Spanish" },
    { code: "zh", flag: "🇨🇳", label: "Chinese" },
    { code: "de", flag: "🇩🇪", label: "German" },
    { code: "ja", flag: "🇯🇵", label: "Japanese" },
  ];

  const downloadVoicePair = (langCode: string) => {
    const onnx = models.find((m) => m.id === `voice-${langCode}-onnx`);
    const json = models.find((m) => m.id === `voice-${langCode}-json`);
    if (onnx) onDownload(onnx);
    if (json) onDownload(json);
  };

  const isVoiceDownloading = (langCode: string) => {
    const dl = downloads[`voice-${langCode}-onnx`];
    return dl?.downloading ?? false;
  };

  const isVoiceComplete = (langCode: string) => {
    const dlOnnx = downloads[`voice-${langCode}-onnx`];
    const dlJson = downloads[`voice-${langCode}-json`];
    return (dlOnnx?.complete && dlJson?.complete) ?? false;
  };

  const getVoiceProgress = (langCode: string) => {
    const dl = downloads[`voice-${langCode}-onnx`];
    if (!dl) return null;
    return dl;
  };

  const anyInstalled = status.has_tts || voiceLangs.some((v) => isVoiceComplete(v.code));

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-1">Text to Speech</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Download voice packs so the AI can speak to you. Each voice is ~60 MB.
          Download at least one for the language you want to practice.
        </p>
      </div>

      {status.has_tts && (
        <div className="flex items-center gap-2 p-3 bg-green-500/10 rounded-lg text-green-400 text-sm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          Voice model(s) already installed
        </div>
      )}

      <div className="space-y-3">
        {voiceLangs.map((lang) => {
          const downloading = isVoiceDownloading(lang.code);
          const complete = isVoiceComplete(lang.code);
          const progress = getVoiceProgress(lang.code);
          const onnxModel = models.find((m) => m.id === `voice-${lang.code}-onnx`);

          return (
            <div
              key={lang.code}
              className="p-4 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-sm">
                  {lang.flag} {lang.label}
                </span>
                <span className="text-xs text-[var(--text-secondary)]">
                  {onnxModel ? formatBytes(onnxModel.size_bytes) : "~60 MB"}
                </span>
              </div>
              {downloading && progress && (
                <div className="mt-2">
                  <div className="w-full h-2 bg-[var(--bg-main)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--primary)] transition-all duration-300"
                      style={{
                        width: `${progress.total ? (progress.progress / progress.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs text-[var(--text-secondary)] mt-1">
                    {formatBytes(progress.progress)} / {formatBytes(progress.total ?? onnxModel?.size_bytes ?? 0)}
                  </span>
                </div>
              )}
              {progress?.error && (
                <p className="text-xs text-red-400 mt-1">{progress.error}</p>
              )}
              {!downloading && !complete && (
                <button
                  onClick={() => downloadVoicePair(lang.code)}
                  className="mt-2 px-4 py-1.5 text-xs bg-[var(--primary)] text-white rounded hover:bg-[var(--primary-hover)] transition-colors"
                >
                  Download
                </button>
              )}
              {complete && (
                <span className="text-xs text-green-400 mt-2 inline-block">Installed</span>
              )}
            </div>
          );
        })}
      </div>

      <NavButtons onBack={onBack} onNext={onNext} nextLabel={anyInstalled ? "Next" : "Skip"} />
    </div>
  );
}

function ReadyStep({
  status,
  onComplete,
  onBack,
}: {
  status: SetupStatus;
  onComplete: () => void;
  onBack: () => void;
}) {
  const allReady = status.has_whisper && status.has_llm && status.has_llama_server;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-bold mb-1">
          {allReady ? "You're all set!" : "Setup Summary"}
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          {allReady
            ? "All core components are ready. Start practicing!"
            : "Some components are missing, but you can still use the text chat."}
        </p>
      </div>

      <div className="space-y-2">
        <StatusItem label="Speech Recognition (STT)" ok={status.has_whisper} hint="" />
        <StatusItem label="Language Model (LLM)" ok={status.has_llm && status.has_llama_server} hint="" />
        <StatusItem label="Text to Speech (TTS)" ok={status.has_tts} hint="" />
      </div>

      <NavButtons
        onBack={onBack}
        onNext={onComplete}
        nextLabel={allReady ? "Start Practicing" : "Continue Anyway"}
      />
    </div>
  );
}

function StatusItem({
  label,
  ok,
  hint,
}: {
  label: string;
  ok: boolean;
  hint: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-elevated)]">
      <span className={`w-3 h-3 rounded-full flex-shrink-0 ${ok ? "bg-green-400" : "bg-yellow-400"}`} />
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium">{label}</span>
        {hint && (
          <p className="text-xs text-[var(--text-secondary)] truncate">{hint}</p>
        )}
      </div>
    </div>
  );
}

function NavButtons({
  onBack,
  onNext,
  nextLabel,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
}) {
  return (
    <div className="flex justify-between pt-4">
      <button
        onClick={onBack}
        className="px-6 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
      >
        Back
      </button>
      <button
        onClick={onNext}
        className="px-6 py-2 text-sm bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-hover)] transition-colors font-medium"
      >
        {nextLabel}
      </button>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}
