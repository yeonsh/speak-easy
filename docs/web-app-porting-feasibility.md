# SpeakEasy 웹앱 포팅 가능성 분석

## 전제 조건

- LLM: Gemini API 사용 (로컬 llama-server 제거)
- TTS: Edge TTS 사용 (Kokoro ONNX 제거)
- STT: Web Speech API 또는 브라우저 기반 대안

---

## 1. 결론

**포팅 가능. 예상 소요: 6~10주.**

Tauri 백엔드(Rust)를 완전히 제거하고, 프론트엔드를 순수 React 웹앱 + 경량 백엔드 서버(또는 서버리스)로 재구성해야 합니다.

---

## 2. 아키텍처 변환 개요

```
현재 (Tauri Desktop)                    웹앱 (제안)
─────────────────────                   ─────────────────────
React Frontend                          React Frontend (동일)
  ↓ invoke()                              ↓ fetch() / WebSocket
Tauri Rust Backend                      Node.js/Edge Backend
  ├─ llama-server (subprocess)            ├─ Gemini API proxy
  ├─ whisper-rs (native)                  ├─ (제거 → Web Speech API)
  ├─ Kokoro ONNX (native)                ├─ Edge TTS proxy
  ├─ Edge TTS (msedge-tts)               ├─ (제거 → 브라우저 직접)
  ├─ SQLite (rusqlite)                    ├─ PostgreSQL / IndexedDB
  └─ File system (~/.speakeasy/)          └─ Cloud storage / IndexedDB
```

---

## 3. 서브시스템별 분석

### 3.1 LLM (Gemini API) — 난이도: ★★☆☆☆

**현재**: `gemini.rs`에서 Rust로 Gemini SSE 스트리밍 → Tauri 이벤트로 프론트엔드 전달

**문제점**:
- **API 키 노출**: 브라우저에서 직접 Gemini API 호출 시 API 키가 노출됨
- **CORS**: `generativelanguage.googleapis.com`은 브라우저 CORS를 허용하지만, API 키 보안이 문제

**해결 방안**:
```
브라우저 → 백엔드 프록시 서버 → Gemini API
         (API 키는 서버에 보관)
```

**필요 작업**:
- 백엔드 프록시 엔드포인트 구현 (SSE 스트리밍 패스스루)
- `useLlm.ts`의 `invoke("send_chat_gemini")` → `fetch()` + `EventSource`로 교체
- 문장 경계 감지(`SentenceBuffer`) 로직을 프론트엔드 또는 프록시로 이동

**영향 받는 파일**:
- `src/hooks/useLlm.ts` — `invoke("send_chat_gemini")`, `invoke("send_chat_message")`, `listen("chat-stream-*")`
- `src/App.tsx` — `invoke("cancel_generation")`

### 3.2 STT (음성 인식) — 난이도: ★★★☆☆

**현재**: `stt.rs`에서 whisper-rs로 오프라인 음성인식

**브라우저 대안**:

| 방안 | 장점 | 단점 |
|---|---|---|
| **Web Speech API** (`webkitSpeechRecognition`) | 무료, 설치 불필요 | Chrome/Edge만 지원, 온라인 필요, 언어 감지 제한적 |
| **Whisper WebAssembly** (whisper.cpp WASM) | 오프라인, 언어 감지 지원 | 148MB+ 모델 다운로드, 느림 (10초 오디오 → 5~15초) |
| **Google Cloud Speech-to-Text API** | 고품질, 16개 언어 전부 지원 | 유료 ($0.006/15초), 서버 프록시 필요 |

**권장**: Web Speech API를 기본으로, Whisper WASM을 오프라인 폴백으로 제공

**영향 받는 파일**:
- `src/hooks/useStt.ts` — `invoke("load_whisper_model")` 완전 제거
- `src/hooks/useAudioRecorder.ts` — WebM→WAV 변환 로직은 Web Speech API 사용 시 불필요

**주요 기능 차이**:
- whisper-rs의 **자동 언어 감지** (튜터 모드 트리거)가 Web Speech API에서는 직접 지원되지 않음
- 해결: 사용자가 선택한 언어로 인식 언어를 고정하고, 결과 텍스트를 Gemini에 보내 언어 판별

### 3.3 TTS (음성 합성) — 난이도: ★★★★☆

**현재**: `edge_tts.rs`에서 `msedge-tts` 크레이트로 WebSocket 연결 → MP3 수신 → f32 샘플 디코딩 → Tauri 이벤트로 프론트엔드 전달

**문제점**:
- `msedge-tts`는 Microsoft Edge TTS의 **비공식 WebSocket 프로토콜** 사용
- 브라우저에서 직접 해당 WebSocket 엔드포인트(`wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1`)에 연결하면 **CORS/Origin 헤더 제한**으로 차단될 가능성 높음

**해결 방안**:

| 방안 | 장점 | 단점 |
|---|---|---|
| **백엔드 프록시** | 기존 msedge-tts 로직 재사용 가능 (Node.js 포팅) | 서버 부하, 레이턴시 추가 |
| **Web Speech API** (`speechSynthesis`) | 브라우저 내장, 무료 | 음성 품질 낮음, 브라우저마다 다름, 스트리밍 불가 |
| **Google Cloud TTS API** | 고품질, 안정적 | 유료 ($4/100만 문자) |
| **Azure TTS (공식 SDK)** | Edge TTS와 동일 품질, 브라우저 SDK 존재 | 유료 ($4/100만 문자), Azure 계정 필요 |

**권장**: 백엔드 프록시로 Edge TTS 유지 (비용 무료)

**스트리밍 아키텍처 변경**:
```
현재:  Rust TTS thread → Tauri event("tts-chunk-*") → Web Audio Worklet
웹앱:  백엔드 SSE/WebSocket → fetch stream → Web Audio Worklet
```

**영향 받는 파일**:
- `src/hooks/useTts.ts` — `listen("tts-chunk-*")`, `invoke("load_tts_voice")` 완전 재작성
- Web Audio Worklet 코드는 **그대로 재사용 가능** (이미 브라우저 API)

### 3.4 데이터 저장 — 난이도: ★★★☆☆

**현재**: `session.rs` + `courage.rs`에서 rusqlite (SQLite) 사용

**브라우저 대안**:

| 방안 | 용량 제한 | SQL 지원 | 장점 | 단점 |
|---|---|---|---|---|
| **IndexedDB** | ~수백 MB | ❌ | 브라우저 내장 | NoSQL, 스키마 마이그레이션 직접 구현 |
| **sql.js** (SQLite WASM) | ~수백 MB | ✅ | 기존 SQL 스키마 재사용 | 3MB WASM 번들, 동기 API |
| **서버 DB** (PostgreSQL) | 무제한 | ✅ | 기기 간 동기화 | 서버 비용, 인증 필요 |

**권장**: `sql.js`로 기존 SQLite 스키마를 그대로 유지하면서 IndexedDB에 영속화

**기존 SQL 스키마 (재사용 가능)**:
- `sessions`, `session_messages`, `session_reviews`, `courage_scores` 테이블
- courage 점수 계산 로직 (`courage.rs`) → TypeScript로 이식 (순수 수학 연산)

**영향 받는 파일**:
- `src/App.tsx` — `invoke("save_session")`, `invoke("calculate_courage_score")`, `invoke("delete_session")`
- `src/components/CourageScore.tsx` — `invoke("get_courage_history")`
- `src/components/SessionHistoryPanel.tsx` — `invoke("list_sessions")`, `invoke("load_session_messages")`
- `src/components/ReviewPanel.tsx` — `invoke("generate_review")`

### 3.5 설정 저장 — 난이도: ★☆☆☆☆

**현재**: `settings.rs`에서 `~/.speakeasy/settings.json` 파일로 저장

**웹앱**: `localStorage`로 대체 (JSON 직렬화 그대로)

**영향 받는 파일**:
- `src/App.tsx` — `invoke("save_settings")` → `localStorage.setItem()`

### 3.6 프론트엔드 UI — 난이도: ★☆☆☆☆

**React 컴포넌트**: 대부분 그대로 사용 가능

- `ChatView.tsx` — Tauri 의존성 없음 ✅
- `CourageScore.tsx` — invoke 1개만 교체
- `LanguageBar.tsx` — 순수 UI ✅
- `MicButton.tsx` — 순수 UI ✅
- `ServerStatus.tsx` — LLM/STT/TTS 상태 표시 → 로직 단순화 (서버 연결 상태만)
- `Sidebar.tsx` — 모델 다운로드 UI 제거, 설정 단순화
- `SetupWizard.tsx` — **대폭 간소화** (모델 다운로드/설치 불필요, API 키 입력만)

### 3.7 모델 다운로드/설치 — 난이도: 제거

**현재**: `downloads.rs`, `SetupWizard.tsx`에서 GGUF/Whisper/Kokoro 모델 다운로드 + 설치

**웹앱**: Gemini API + Edge TTS 사용 시 **모델 다운로드 전체 제거**. SetupWizard는 API 키 입력 화면으로 대체.

---

## 4. Tauri invoke() 호출 전체 목록 및 웹 대체 방안

| Tauri Command | 파일 | 웹 대체 |
|---|---|---|
| `send_chat_gemini` | useLlm.ts | 백엔드 프록시 SSE |
| `send_chat_message` | useLlm.ts | 제거 (Gemini만 사용) |
| `start_llm_server` | useLlm.ts | 제거 |
| `stop_llm_server` | useLlm.ts | 제거 |
| `cancel_generation` | App.tsx | 백엔드에 AbortController 전달 |
| `load_whisper_model` | useStt.ts | 제거 (Web Speech API) |
| `load_tts_voice` | useTts.ts | 백엔드 프록시 또는 제거 |
| `save_session` | App.tsx | sql.js / 서버 API |
| `calculate_courage_score` | App.tsx | TypeScript 로직 (프론트엔드) |
| `get_courage_history` | CourageScore.tsx | sql.js / 서버 API |
| `delete_session` | App.tsx | sql.js / 서버 API |
| `list_sessions` | SessionHistoryPanel.tsx | sql.js / 서버 API |
| `load_session_messages` | SessionHistoryPanel.tsx | sql.js / 서버 API |
| `generate_review` | ReviewPanel.tsx | 백엔드 프록시 (Gemini 호출) |
| `save_settings` | App.tsx | localStorage |
| `download_file` | SetupWizard.tsx, Sidebar.tsx | 제거 |
| `extract_llama_server` | SetupWizard.tsx | 제거 |
| `install_espeak` | SetupWizard.tsx | 제거 |
| `open_models_folder` | SetupWizard.tsx | 제거 |
| `list_gemini_models` | Sidebar.tsx | 백엔드 프록시 |

**Tauri 이벤트 리스너 (listen)**:

| Event Pattern | 파일 | 웹 대체 |
|---|---|---|
| `chat-stream-{id}` | useLlm.ts | SSE (`EventSource`) |
| `tts-chunk-{id}` | useTts.ts | SSE/WebSocket |
| `tts-stop-{id}` | useTts.ts | WebSocket 메시지 |
| `download-progress-{id}` | SetupWizard.tsx, Sidebar.tsx | 제거 |
| `download-complete-{id}` | SetupWizard.tsx, Sidebar.tsx | 제거 |
| `download-error-{id}` | SetupWizard.tsx, Sidebar.tsx | 제거 |
| `espeak-install-*` | SetupWizard.tsx | 제거 |

---

## 5. 백엔드 서버 요구사항

웹앱에는 경량 백엔드가 필요합니다:

### 필수 엔드포인트

```
POST /api/chat/stream     — Gemini SSE 프록시 (API 키 서버 보관)
POST /api/chat/cancel      — 생성 취소
POST /api/tts/synthesize   — Edge TTS 프록시 (WebSocket → 오디오 바이너리)
GET  /api/tts/voices       — Edge TTS 음성 목록
POST /api/review/generate  — 세션 리뷰 생성 (Gemini 호출)
GET  /api/gemini/models    — Gemini 모델 목록
```

### 선택 엔드포인트 (서버 DB 사용 시)

```
POST /api/sessions         — 세션 저장
GET  /api/sessions         — 세션 목록
GET  /api/sessions/:id     — 세션 메시지 로드
DELETE /api/sessions/:id   — 세션 삭제
POST /api/courage/calculate — 용기 점수 계산
GET  /api/courage/history   — 용기 점수 히스토리
```

### 기술 스택 제안

```
Runtime:    Node.js 또는 Deno
Framework:  Hono / Express / Fastify
TTS:        msedge-tts-browserify 또는 edge-tts (npm)
DB:         sql.js (클라이언트) 또는 PostgreSQL (서버)
Auth:       JWT + OAuth (다중 사용자 시)
Deploy:     Vercel Edge Functions / Cloudflare Workers / Railway
```

---

## 6. 비용 분석

### 서버 비용 (월간, 사용자 100명 기준)

| 항목 | 비용 |
|---|---|
| Gemini API (2.5 Flash) | ~$5~20 |
| Edge TTS 프록시 서버 | $0 (무료 비공식 API) |
| 호스팅 (Vercel/Railway) | $0~20 |
| DB (Supabase/Neon free tier) | $0 |
| **합계** | **$5~40/월** |

### 데스크톱 앱 대비

| 항목 | 데스크톱 | 웹앱 |
|---|---|---|
| LLM 비용 | 무료 (로컬) | Gemini API 유료 |
| TTS 비용 | 무료 (Kokoro/Edge) | 무료 (Edge 프록시) |
| STT 비용 | 무료 (Whisper) | 무료 (Web Speech API) |
| 서버 비용 | 없음 | 호스팅 비용 |
| 오프라인 사용 | ✅ | ❌ |

---

## 7. 재사용 가능한 코드

### 그대로 재사용 (변경 없음)

| 파일 | 이유 |
|---|---|
| `src/lib/types.ts` | 순수 TypeScript 타입 |
| `src/lib/prompts.ts` | 순수 데이터 (시스템 프롬프트, 시나리오) |
| `src/lib/i18n.ts` | 순수 데이터 (16개 언어 i18n) |
| `src/styles/app.css` | Tailwind CSS + 커스텀 속성 |
| `src/components/ChatView.tsx` | Tauri 의존성 없음 |
| `src/components/LanguageBar.tsx` | 순수 UI |
| `src/components/MicButton.tsx` | 순수 UI |

### 소규모 수정 (invoke 교체만)

| 파일 | 변경 내용 |
|---|---|
| `src/App.tsx` | invoke 6개 → fetch/localStorage 교체 |
| `src/components/CourageScore.tsx` | invoke 1개 교체 |
| `src/components/SessionHistoryPanel.tsx` | invoke 2개 교체 |
| `src/components/ReviewPanel.tsx` | invoke 1개 교체 |

### 대폭 재작성

| 파일 | 변경 내용 |
|---|---|
| `src/hooks/useLlm.ts` | Tauri invoke+listen → fetch SSE |
| `src/hooks/useStt.ts` | whisper-rs invoke → Web Speech API |
| `src/hooks/useTts.ts` | Tauri listen → fetch stream + Web Audio |
| `src/components/SetupWizard.tsx` | 모델 설치 → API 키 입력으로 간소화 |
| `src/components/Sidebar.tsx` | 모델 다운로드 UI 제거, 설정 단순화 |
| `src/components/ServerStatus.tsx` | 엔진 상태 → 연결 상태로 단순화 |

### Rust → TypeScript 이식

| Rust 파일 | 이식 내용 | 난이도 |
|---|---|---|
| `courage.rs` | 점수 계산 알고리즘 (순수 수학) | ★☆☆☆☆ |
| `chat.rs` (SentenceBuffer) | 문장 경계 감지 (CJK 지원) | ★★☆☆☆ |
| `edge_tts.rs` (default_voice) | 언어별 기본 음성 매핑 | ★☆☆☆☆ |

---

## 8. 주요 기능 차이

| 기능 | 데스크톱 | 웹앱 |
|---|---|---|
| 오프라인 사용 | ✅ | ❌ |
| 로컬 LLM | ✅ | ❌ (Gemini API) |
| STT 언어 자동 감지 | ✅ (Whisper) | ⚠️ (제한적) |
| TTS 오프라인 | ✅ (Kokoro) | ❌ (Edge TTS 온라인) |
| 모델 다운로드 | 필요 (2~3GB) | 불필요 |
| 설치 | 필요 | 불필요 (URL 접속만) |
| 브라우저 호환 | N/A | Chrome/Edge 권장 |
| 모바일 접근 | ❌ | ✅ (반응형) |
| 다중 기기 동기화 | ❌ | ✅ (서버 DB 시) |

---

## 9. 브라우저 호환성

| 기능 | Chrome | Firefox | Safari | Edge |
|---|---|---|---|---|
| Web Speech API (STT) | ✅ | ❌ | ✅ (제한적) | ✅ |
| Web Audio Worklet | ✅ | ✅ | ✅ | ✅ |
| MediaRecorder | ✅ | ✅ | ✅ | ✅ |
| EventSource (SSE) | ✅ | ✅ | ✅ | ✅ |
| IndexedDB | ✅ | ✅ | ✅ | ✅ |

**Firefox 사용자**: Web Speech API 미지원 → Whisper WASM 폴백 또는 서버사이드 STT 필요

---

## 10. 작업 계획

| 단계 | 작업 | 기간 |
|---|---|---|
| 1 | 백엔드 프록시 서버 구축 (Gemini SSE + Edge TTS) | 1~2주 |
| 2 | `useLlm.ts` 재작성 (invoke → fetch SSE) | 3~4일 |
| 3 | `useStt.ts` 재작성 (Web Speech API) | 3~4일 |
| 4 | `useTts.ts` 재작성 (프록시 스트리밍 + Web Audio) | 1주 |
| 5 | 데이터 레이어 (sql.js 또는 서버 DB) | 1주 |
| 6 | courage.rs → TypeScript 이식 | 2~3일 |
| 7 | SetupWizard/Sidebar/ServerStatus 단순화 | 3~4일 |
| 8 | App.tsx invoke 제거 + 통합 | 3~4일 |
| 9 | 인증/사용자 관리 (다중 사용자 시) | 1주 |
| 10 | 테스트 + 배포 | 1~2주 |
| **합계** | | **6~10주** |

---

## 11. 최종 판단

| 항목 | 평가 |
|---|---|
| **기술적 가능성** | ✅ 가능 |
| **코드 재사용률** | ~60% (프론트엔드 UI + 비즈니스 로직) |
| **최대 리스크** | Edge TTS 프록시 안정성 (비공식 API) |
| **가장 큰 장점** | 설치 없이 접근 가능, 모바일 자동 지원 |
| **가장 큰 단점** | 오프라인 사용 불가, 서버 비용 발생 |

Gemini API 통합이 이미 `gemini.rs`에 완성되어 있고, 프론트엔드 UI가 Tauri 비의존적으로 잘 분리되어 있어, 웹 포팅은 **실현 가능하고 합리적인 선택**입니다.
