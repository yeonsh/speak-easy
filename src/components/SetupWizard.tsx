import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface SetupStatus {
  has_whisper: boolean;
  has_llm: boolean;
  has_tts: boolean;
  has_llama_server: boolean;
  has_espeak: boolean;
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
  const [installedFiles, setInstalledFiles] = useState<string[]>([]);

  useEffect(() => {
    checkStatus();
    invoke<ModelInfo[]>("get_available_models").then(setModels);
  }, []);

  const checkStatus = async () => {
    const s = await invoke<SetupStatus>("check_setup_complete");
    setStatus(s);
    const files = await invoke<string[]>("get_installed_models");
    setInstalledFiles(files);
  };

  const startDownload = useCallback(
    async (model: ModelInfo) => {
      console.log("[startDownload] called with model:", JSON.stringify(model));
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

      try {
        await invoke("download_file", {
          url: model.url,
          destDir: model.dest_dir,
          filename: model.filename,
          downloadId,
        });
      } catch (err) {
        console.error("[SetupWizard] download_file invoke failed:", err);
        setDownloads((d) => ({
          ...d,
          [downloadId]: {
            ...d[downloadId],
            downloading: false,
            error: String(err),
          },
        }));
      }
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
          installedFiles={installedFiles}
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
          models={models.filter((m) => m.id.startsWith("llm-"))}
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
      title: "Phonemizer",
      component: (
        <EspeakStep
          status={status}
          onRefresh={checkStatus}
          onNext={() => setStep(4)}
          onBack={() => setStep(2)}
        />
      ),
    },
    {
      title: "Text to Speech",
      component: (
        <TtsStep
          status={status}
          models={models.filter((m) => m.id.startsWith("kokoro"))}
          downloads={downloads}
          installedFiles={installedFiles}
          onDownload={startDownload}
          onNext={() => setStep(5)}
          onBack={() => setStep(3)}
        />
      ),
    },
    {
      title: "Ready",
      component: (
        <ReadyStep status={status} onComplete={onComplete} onBack={() => setStep(4)} />
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
  installedFiles,
  onDownload,
  onNext,
  onBack,
}: {
  status: SetupStatus;
  models: ModelInfo[];
  downloads: Record<string, DownloadState>;
  installedFiles: string[];
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
          const isComplete = dl?.complete || installedFiles.includes(model.filename);
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
  models,
  downloads,
  onDownload,
  onOpenFolder,
  onRefresh,
  onNext,
  onBack,
}: {
  status: SetupStatus;
  models: ModelInfo[];
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

        {/* GGUF model download */}
        <div className="p-4 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]">
          <div className="flex items-center gap-3 mb-2">
            <span className={`w-3 h-3 rounded-full flex-shrink-0 ${status.has_llm ? "bg-green-400" : "bg-yellow-400"}`} />
            <span className="font-medium text-sm">GGUF Model</span>
          </div>

          {status.has_llm ? (
            <p className="text-xs text-green-400 ml-6">Model found</p>
          ) : (
            <p className="text-xs text-[var(--text-secondary)] ml-6 mb-3">
              Pick a model — 4B is fast, 30B is smarter but needs more RAM/VRAM
            </p>
          )}

          {!status.has_llm && (
            <div className="ml-6 space-y-2">
              {models.map((model) => {
                const dl = downloads[model.id];
                return (
                  <div key={model.id} className="p-3 rounded bg-[var(--bg-main)]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm">{model.name}</span>
                      <span className="text-xs text-[var(--text-secondary)]">{formatBytes(model.size_bytes)}</span>
                    </div>
                    {dl?.downloading && (
                      <div className="mt-2">
                        <div className="w-full h-2 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[var(--primary)] transition-all duration-300"
                            style={{ width: `${dl.total ? (dl.progress / dl.total) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="text-xs text-[var(--text-secondary)] mt-1">
                          {formatBytes(dl.progress)} / {formatBytes(dl.total ?? model.size_bytes)}
                        </span>
                      </div>
                    )}
                    {dl?.error && <p className="text-xs text-red-400 mt-1">{dl.error}</p>}
                    {dl?.complete && <span className="text-xs text-green-400 mt-1 inline-block">Downloaded</span>}
                    {!dl?.downloading && !dl?.complete && (
                      <button
                        onClick={() => { onDownload(model); }}
                        className="mt-2 px-4 py-1.5 text-xs bg-[var(--primary)] text-white rounded hover:bg-[var(--primary-hover)] transition-colors"
                      >
                        Download
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
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

      <NavButtons onBack={onBack} onNext={onNext} nextLabel={status.has_llm && status.has_llama_server ? "Next" : "Skip"} />
    </div>
  );
}

function EspeakStep({
  status,
  onRefresh,
  onNext,
  onBack,
}: {
  status: SetupStatus;
  onRefresh: () => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMac = navigator.userAgent.includes("Mac");

  const handleInstall = async () => {
    setInstalling(true);
    setError(null);

    const unComplete = await listen<boolean>("espeak-install-complete", () => {
      setInstalling(false);
      unComplete();
      unError();
      onRefresh();
    });

    const unError = await listen<string>("espeak-install-error", (event) => {
      setInstalling(false);
      setError(event.payload);
      unComplete();
      unError();
    });

    try {
      await invoke("install_espeak");
    } catch (err) {
      setInstalling(false);
      setError(String(err));
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-1">Phonemizer (espeak-ng)</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Kokoro TTS needs espeak-ng to convert text into phonemes.
          {isMac
            ? " It can be installed automatically via Homebrew."
            : " It can be installed automatically from the official release."}
        </p>
      </div>

      {status.has_espeak ? (
        <div className="flex items-center gap-2 p-3 bg-green-500/10 rounded-lg text-green-400 text-sm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          espeak-ng is installed
        </div>
      ) : (
        <div className="p-4 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full flex-shrink-0 bg-yellow-400" />
            <span className="font-medium text-sm">espeak-ng — not found</span>
          </div>

          <p className="text-xs text-[var(--text-secondary)] ml-6">
            {isMac
              ? "Requires Homebrew. Run `brew install espeak-ng` in Terminal, or click the button below."
              : "Downloads and installs the official espeak-ng MSI package (~3 MB)."}
          </p>

          {installing && (
            <div className="flex items-center gap-2 ml-6">
              <div className="animate-spin w-4 h-4 border-2 border-[var(--primary)] border-t-transparent rounded-full" />
              <span className="text-xs text-[var(--text-secondary)]">
                {isMac ? "Running brew install espeak-ng..." : "Installing espeak-ng..."}
              </span>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-400 ml-6">{error}</p>
          )}

          {!installing && (
            <button
              onClick={handleInstall}
              className="ml-6 px-4 py-1.5 text-xs bg-[var(--primary)] text-white rounded hover:bg-[var(--primary-hover)] transition-colors"
            >
              Install espeak-ng
            </button>
          )}
        </div>
      )}

      <button
        onClick={() => onRefresh()}
        className="px-4 py-2 text-sm bg-[var(--bg-elevated)] text-[var(--text-secondary)] rounded-lg hover:text-[var(--text-primary)] transition-colors"
      >
        Re-check
      </button>

      <NavButtons onBack={onBack} onNext={onNext} nextLabel={status.has_espeak ? "Next" : "Skip"} />
    </div>
  );
}

function TtsStep({
  status,
  models,
  downloads,
  installedFiles,
  onDownload,
  onNext,
  onBack,
}: {
  status: SetupStatus;
  models: ModelInfo[];
  downloads: Record<string, DownloadState>;
  installedFiles: string[];
  onDownload: (m: ModelInfo) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const kokoroModel = models.find((m) => m.id === "kokoro-model");
  const kokoroVoices = models.find((m) => m.id === "kokoro-voices");

  const modelInstalled = installedFiles.includes("voices/kokoro-v1.0.onnx") || downloads["kokoro-model"]?.complete;
  const voicesInstalled = installedFiles.includes("voices/voices-v1.0.bin") || downloads["kokoro-voices"]?.complete;
  const allInstalled = status.has_tts || (modelInstalled && voicesInstalled);

  const downloadAll = () => {
    if (kokoroModel && !modelInstalled) onDownload(kokoroModel);
    if (kokoroVoices && !voicesInstalled) onDownload(kokoroVoices);
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-1">Text to Speech</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Two TTS engines are available. You can switch between them in Settings at any time.
        </p>
        <div className="mt-3 space-y-2 text-xs text-[var(--text-secondary)]">
          <div className="p-2 rounded bg-[var(--bg-elevated)]">
            <span className="font-medium text-[var(--text-primary)]">Edge TTS</span> (online) — EN, ES, FR, ZH, JA, DE, KO
          </div>
          <div className="p-2 rounded bg-[var(--bg-elevated)]">
            <span className="font-medium text-[var(--text-primary)]">Kokoro</span> (offline) — EN, ES, FR, ZH, JA — requires the files below (~353 MB)
          </div>
        </div>
      </div>

      {allInstalled && (
        <div className="flex items-center gap-2 p-3 bg-green-500/10 rounded-lg text-green-400 text-sm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          Kokoro TTS installed — 50+ voices available
        </div>
      )}

      <div className="space-y-3">
        {[kokoroModel, kokoroVoices].filter(Boolean).map((model) => {
          const dl = downloads[model!.id];
          const isComplete = model!.id === "kokoro-model" ? modelInstalled : voicesInstalled;

          return (
            <div
              key={model!.id}
              className="p-4 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-sm">{model!.name}</span>
                <span className="text-xs text-[var(--text-secondary)]">
                  {formatBytes(model!.size_bytes)}
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
                    {formatBytes(dl.progress)} / {formatBytes(dl.total ?? model!.size_bytes)}
                  </span>
                </div>
              )}
              {dl?.error && (
                <p className="text-xs text-red-400 mt-1">{dl.error}</p>
              )}
              {isComplete && (
                <span className="text-xs text-green-400 mt-2 inline-block">Installed</span>
              )}
              {!dl?.downloading && !isComplete && (
                <button
                  onClick={() => onDownload(model!)}
                  className="mt-2 px-4 py-1.5 text-xs bg-[var(--primary)] text-white rounded hover:bg-[var(--primary-hover)] transition-colors"
                >
                  Download
                </button>
              )}
            </div>
          );
        })}
      </div>

      {!allInstalled && (!downloads["kokoro-model"]?.downloading && !downloads["kokoro-voices"]?.downloading) && (
        <button
          onClick={downloadAll}
          className="w-full px-4 py-2.5 text-sm bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-hover)] transition-colors font-medium"
        >
          Download All ({formatBytes((kokoroModel?.size_bytes ?? 0) + (kokoroVoices?.size_bytes ?? 0))})
        </button>
      )}

      <NavButtons onBack={onBack} onNext={onNext} nextLabel={allInstalled ? "Next" : "Skip"} />
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
        <StatusItem label="Phonemizer (espeak-ng)" ok={status.has_espeak} hint="" />
        <StatusItem label="Text to Speech (Kokoro)" ok={status.has_tts} hint="" />
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
