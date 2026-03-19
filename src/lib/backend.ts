const isTauri = !!(globalThis as any).isTauri;

// --- Lazy Tauri imports (only loaded in Tauri context, awaited on first use) ---

type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
type ListenFn = <T>(event: string, handler: (event: { payload: T }) => void) => Promise<() => void>;
type GetCurrentWindowFn = () => any;

let _tauriInvoke: InvokeFn | null = null;
let _tauriListen: ListenFn | null = null;
let _tauriGetCurrentWindow: GetCurrentWindowFn | null = null;
let _tauriLoaded: Promise<void> | null = null;

function ensureTauriLoaded(): Promise<void> {
  if (!_tauriLoaded) {
    _tauriLoaded = Promise.all([
      import("@tauri-apps/api/core").then((m) => { _tauriInvoke = m.invoke; }),
      import("@tauri-apps/api/event").then((m) => { _tauriListen = m.listen; }),
      import("@tauri-apps/api/window").then((m) => { _tauriGetCurrentWindow = m.getCurrentWindow; }),
    ]).then(() => {});
  }
  return _tauriLoaded;
}

if (isTauri) ensureTauriLoaded();

// --- WebSocket singleton ---

let ws: WebSocket | null = null;
const wsListeners = new Map<string, Set<(event: { payload: any }) => void>>();
let wsConnecting: Promise<WebSocket> | null = null;

function getWs(): Promise<WebSocket> {
  if (ws && ws.readyState === WebSocket.OPEN) return Promise.resolve(ws);
  if (wsConnecting) return wsConnecting;

  wsConnecting = new Promise((resolve) => {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${location.host}/ws`);
    socket.onopen = () => {
      ws = socket;
      wsConnecting = null;
      resolve(socket);
    };
    socket.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        const eventType: string = data.type;
        const requestId: string | undefined = data.requestId;

        if (requestId) {
          if (eventType === "chat-token" || eventType === "chat-done") {
            dispatch(`chat-stream-${requestId}`, {
              content: data.token || "",
              done: eventType === "chat-done",
            });
          }
          if (eventType === "tts-chunk") {
            dispatch(`tts-chunk-${requestId}`, data);
          }
          if (eventType === "tts-stop") {
            dispatch(`tts-stop-${requestId}`, true);
          }
        }
        dispatch(eventType, data);
      } catch { /* ignore parse errors */ }
    };
    socket.onclose = () => {
      ws = null;
      wsConnecting = null;
      setTimeout(() => getWs(), 2000);
    };
  });
  return wsConnecting;
}

function dispatch(key: string, payload: any) {
  const listeners = wsListeners.get(key);
  if (listeners) {
    for (const fn of listeners) fn({ payload });
  }
}

// --- Command-to-API mapping ---

interface ApiRoute { method: string; path: string }

const CMD_MAP: Record<string, (args?: any) => ApiRoute> = {
  get_settings:            () => ({ method: "GET",  path: "/api/settings" }),
  save_settings:           () => ({ method: "POST", path: "/api/settings" }),
  get_models_dir:          () => ({ method: "GET",  path: "/api/models/dir" }),
  load_whisper_model:      () => ({ method: "POST", path: "/api/models/whisper/load" }),
  is_whisper_loaded:       () => ({ method: "GET",  path: "/api/models/whisper/status" }),
  load_tts_voice:          () => ({ method: "POST", path: "/api/models/tts/load" }),
  is_tts_loaded:           () => ({ method: "GET",  path: "/api/models/tts/status" }),
  list_voices:             () => ({ method: "GET",  path: "/api/models/tts/voices" }),
  is_llm_running:          () => ({ method: "GET",  path: "/api/llm/status" }),
  start_llm_server:        () => ({ method: "POST", path: "/api/llm/start" }),
  stop_llm_server:         () => ({ method: "POST", path: "/api/llm/stop" }),
  list_llm_models:         () => ({ method: "GET",  path: "/api/llm/models" }),
  list_gemini_models:      () => ({ method: "POST", path: "/api/gemini/models" }),
  list_sessions:           () => ({ method: "GET",  path: "/api/sessions" }),
  load_session_messages: (a) => ({ method: "GET",  path: `/api/sessions/${a?.session_id}` }),
  save_session:            () => ({ method: "POST", path: "/api/sessions" }),
  delete_session:        (a) => ({ method: "DELETE", path: `/api/sessions/${a?.session_id}` }),
  explain_message:         () => ({ method: "POST", path: "/api/explain" }),
  suggest_responses:       () => ({ method: "POST", path: "/api/suggest" }),
  tutor_translate:         () => ({ method: "POST", path: "/api/translate" }),
  lookup_word:             () => ({ method: "POST", path: "/api/lookup" }),
  generate_review:         () => ({ method: "POST", path: "/api/review" }),
  get_courage_history:     () => ({ method: "GET",  path: "/api/courage" }),
  calculate_courage_score: () => ({ method: "POST", path: "/api/courage" }),
  cancel_generation:       () => ({ method: "POST", path: "/api/cancel" }),
  check_setup_complete:    () => ({ method: "STUB", path: "" }),
  open_models_folder:      () => ({ method: "STUB", path: "" }),
  download_file:           () => ({ method: "STUB", path: "" }),
  get_available_models:    () => ({ method: "STUB", path: "" }),
  get_installed_models:    () => ({ method: "STUB", path: "" }),
  delete_model:            () => ({ method: "STUB", path: "" }),
};

// --- Public API ---

export { isTauri };

export async function invoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (isTauri) {
    await ensureTauriLoaded();
    return _tauriInvoke!<T>(cmd, args);
  }

  const route = CMD_MAP[cmd]?.(args);
  if (!route) {
    console.warn(`Unknown command: ${cmd}`);
    return undefined as T;
  }

  if (route.method === "STUB") {
    if (cmd === "check_setup_complete") return { has_llm: true, has_whisper: true, has_llama_server: true, has_tts: true, has_espeak: true } as T;
    return undefined as T;
  }

  const fetchOpts: RequestInit = { method: route.method };
  if (route.method === "POST" && args) {
    fetchOpts.headers = { "Content-Type": "application/json" };
    fetchOpts.body = JSON.stringify(args);
  }

  const resp = await fetch(route.path, fetchOpts);
  if (!resp.ok) throw new Error(await resp.text());

  const ct = resp.headers.get("content-type");
  if (ct?.includes("application/json")) return resp.json();
  return (await resp.text()) as T;
}

export async function listen<T>(
  event: string,
  handler: (event: { payload: T }) => void,
): Promise<() => void> {
  if (isTauri) {
    await ensureTauriLoaded();
    return _tauriListen!<T>(event, handler);
  }

  if (!wsListeners.has(event)) wsListeners.set(event, new Set());
  wsListeners.get(event)!.add(handler as any);
  getWs();

  return () => { wsListeners.get(event)?.delete(handler as any); };
}

export async function getCurrentWindow() {
  if (isTauri) {
    await ensureTauriLoaded();
    return _tauriGetCurrentWindow!();
  }
  return {
    onCloseRequested: (cb: any) => {
      window.addEventListener("beforeunload", cb);
      return () => window.removeEventListener("beforeunload", cb);
    },
  };
}

export async function transcribeAudio(
  wavBytes: ArrayBuffer,
  targetLanguage: string,
  nativeLanguage: string,
): Promise<{ text: string; language: string | null }> {
  if (isTauri) {
    await ensureTauriLoaded();
    const samples = await _tauriInvoke!<number[]>("decode_wav_to_samples", {
      wavBytes: Array.from(new Uint8Array(wavBytes)),
    });
    return _tauriInvoke!("transcribe_audio", {
      audioData: samples,
      targetLanguage,
      nativeLanguage,
    });
  }

  const resp = await fetch(
    `/api/transcribe?target=${encodeURIComponent(targetLanguage)}&native=${encodeURIComponent(nativeLanguage)}`,
    { method: "POST", body: wavBytes },
  );
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json();
}

export async function sendChat(
  provider: "local" | "gemini",
  requestId: string,
  messages: any[],
  settings: any,
) {
  if (isTauri) {
    await ensureTauriLoaded();
    const cmd = provider === "gemini" ? "send_chat_gemini" : "send_chat_message";
    return _tauriInvoke!(cmd, { requestId, messages, ...settings });
  }
  const socket = await getWs();
  socket.send(JSON.stringify({ type: "chat", provider, requestId, messages, settings }));
}

export async function cancelChat(requestId: string) {
  if (isTauri) {
    await ensureTauriLoaded();
    return _tauriInvoke!("cancel_generation", { requestId });
  }
  const socket = await getWs();
  socket.send(JSON.stringify({ type: "chat-cancel", requestId }));
}

export async function cancelTts(requestId: string) {
  if (isTauri) {
    return;
  }
  const socket = await getWs();
  socket.send(JSON.stringify({ type: "tts-cancel", requestId }));
}
