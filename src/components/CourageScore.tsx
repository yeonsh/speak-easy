import { useState, useEffect } from "react";
import { invoke } from "../lib/backend";
import type { CourageHistory, CourageMetrics, NativeLanguage } from "../lib/types";
import { t } from "../lib/i18n";

interface CourageScoreProps {
  sessionId: string;
  language: string;
  nativeLanguage: NativeLanguage;
}

export function CourageScore({ sessionId, language, nativeLanguage }: CourageScoreProps) {
  const [data, setData] = useState<CourageHistory | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    invoke<CourageHistory | null>("get_courage_history", { sessionId, language })
      .then((result) => setData(result ?? null))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [sessionId, language]);

  if (loading) {
    return (
      <div className="px-6 py-4 border-b border-[var(--border)]">
        <div className="h-6 w-40 bg-[var(--bg-elevated)] rounded animate-pulse" />
      </div>
    );
  }

  if (!data) return null;

  const { current, previous, history } = data;
  const isFirstSession = history.length <= 1;

  // Score deltas (percentage change)
  const prevScore = history.length >= 2 ? history[1].score : null;
  const avgScore = history.length >= 2
    ? history.reduce((sum, h) => sum + h.score, 0) / history.length
    : null;
  const prevDelta = prevScore != null && prevScore > 0
    ? ((current.score - prevScore) / prevScore) * 100 : null;
  const avgDelta = avgScore != null && avgScore > 0
    ? ((current.score - avgScore) / avgScore) * 100 : null;

  return (
    <div className="px-6 py-5 border-b border-[var(--border)]">
      {/* Title: "Speaking Courage — 오늘 세션" */}
      <h3 className="text-sm font-medium text-[var(--text-primary)] mb-4">
        {t("courageScore", nativeLanguage)}
        <span className="text-[var(--text-secondary)] font-normal">
          {" — "}{t("courageTodaySession", nativeLanguage)}
        </span>
      </h3>

      {/* Sparkline graph with axis labels */}
      {!isFirstSession && history.length >= 2 && (
        <div className="mb-4">
          <Sparkline
            scores={history.map((h) => h.score).reverse()}
            nativeLanguage={nativeLanguage}
          />
        </div>
      )}

      {/* Delta badges: "지난 세션 대비 +23% ↑  10세션 평균 대비 +8% ↑" */}
      {!isFirstSession && (prevDelta != null || avgDelta != null) && (
        <div className="flex gap-6 mb-4 text-sm">
          {prevDelta != null && (
            <span className="text-[var(--text-secondary)]">
              {t("courageVsPrev", nativeLanguage)}{" "}
              <DeltaBadge value={prevDelta} />
            </span>
          )}
          {avgDelta != null && history.length >= 3 && (
            <span className="text-[var(--text-secondary)]">
              {t("courageVsAvg", nativeLanguage)}{" "}
              <DeltaBadge value={avgDelta} />
            </span>
          )}
        </div>
      )}

      {/* First session hint */}
      {isFirstSession && (
        <p className="text-xs text-[var(--text-secondary)] mb-4">
          {t("courageFirstSession", nativeLanguage)}
        </p>
      )}

      {/* 2×3 Metric Cards */}
      <MetricGrid
        metrics={current}
        previous={previous}
        nativeLanguage={nativeLanguage}
      />
    </div>
  );
}

// ── Sparkline ──

function Sparkline({ scores, nativeLanguage }: { scores: number[]; nativeLanguage: NativeLanguage }) {
  if (scores.length < 2) return null;

  const width = 280;
  const height = 60;
  const padX = 8;
  const padY = 16;

  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min || 1;

  const points = scores.map((score, i) => {
    const x = padX + (i / (scores.length - 1)) * (width - 2 * padX);
    const y = padY + (1 - (score - min) / range) * (height - padY - 4);
    return { x, y };
  });

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  const trending = scores[scores.length - 1] >= scores[0];
  const strokeColor = trending ? "var(--accent)" : "var(--text-secondary)";
  const last = points[points.length - 1];

  return (
    <div>
      <svg width={width} height={height + 20} className="w-full max-w-[280px]">
        <path
          d={pathD}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x} cy={p.y}
            r={i === points.length - 1 ? 4.5 : 2}
            fill={i === points.length - 1 ? strokeColor : "none"}
            stroke={i === points.length - 1 ? "none" : strokeColor}
            strokeWidth="1.5"
          />
        ))}
        <text
          x={last.x} y={last.y - 8}
          textAnchor="middle"
          className="text-[10px] fill-[var(--accent)] font-medium"
        >
          {t("courageToday", nativeLanguage)}
        </text>
        <text
          x={padX} y={height + 14}
          className="text-[10px] fill-[var(--text-secondary)]"
        >
          {t("courageSessionsAgo", nativeLanguage)}
        </text>
        <text
          x={width - padX} y={height + 14}
          textAnchor="end"
          className="text-[10px] fill-[var(--text-secondary)]"
        >
          {t("courageToday", nativeLanguage)}
        </text>
      </svg>
    </div>
  );
}

// ── Delta Badge ──

function DeltaBadge({ value }: { value: number }) {
  const isPositive = value >= 0;
  const color = isPositive ? "text-emerald-400" : "text-[var(--text-secondary)]";
  const arrow = isPositive ? "\u2191" : "\u2193";
  return (
    <span className={`font-semibold ${color}`}>
      {isPositive ? "+" : ""}{value.toFixed(0)}% {arrow}
    </span>
  );
}

// ── Metric Card Grid ──

function MetricGrid({ metrics, previous, nativeLanguage }: {
  metrics: CourageMetrics;
  previous: CourageMetrics | null;
  nativeLanguage: NativeLanguage;
}) {
  const fmtDur = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const prevLabel = t("couragePrevLabel", nativeLanguage);

  interface CardDef {
    value: string;
    label: string;
    prevValue: string | null;
    inverse?: boolean;
    special?: string;
  }

  const cards: CardDef[] = [
    {
      value: String(metrics.word_count),
      label: t("courageWords", nativeLanguage),
      prevValue: previous ? String(previous.word_count) : null,
    },
    {
      value: String(metrics.turn_count),
      label: t("courageTurns", nativeLanguage),
      prevValue: previous ? String(previous.turn_count) : null,
    },
    {
      value: String(metrics.complex_attempts),
      label: t("courageComplex", nativeLanguage),
      prevValue: previous ? String(previous.complex_attempts) : null,
    },
    {
      value: String(metrics.native_switches),
      label: t("courageNativeSwitches", nativeLanguage),
      prevValue: previous ? String(previous.native_switches) : null,
      inverse: true,
      special: previous && metrics.native_switches < previous.native_switches
        ? t("courageGoodJob", nativeLanguage) : undefined,
    },
    {
      value: metrics.quick_response_ratio != null
        ? `${Math.round(metrics.quick_response_ratio * 100)}%`
        : "\u2014",
      label: t("courageQuickResponse", nativeLanguage),
      prevValue: previous?.quick_response_ratio != null
        ? `${Math.round(previous.quick_response_ratio * 100)}%`
        : null,
    },
    {
      value: fmtDur(metrics.duration_seconds),
      label: t("courageDuration", nativeLanguage),
      prevValue: previous ? fmtDur(previous.duration_seconds) : null,
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {cards.map((card) => {
        let arrow: string | null = null;
        if (card.prevValue != null) {
          const cur = parseFloat(card.value.replace(/[:%]/g, ""));
          const prev = parseFloat(card.prevValue.replace(/[:%]/g, ""));
          if (!isNaN(cur) && !isNaN(prev)) {
            if (cur > prev) arrow = "\u2191";
            else if (cur < prev) arrow = "\u2193";
            else arrow = "\u2014";
          }
        }

        const improved = arrow === "\u2191"
          ? !card.inverse
          : arrow === "\u2193"
            ? !!card.inverse
            : false;
        const arrowColor = improved
          ? "text-emerald-400"
          : "text-[var(--text-secondary)]";

        return (
          <div
            key={card.label}
            className="bg-[var(--bg-elevated)] rounded-lg px-3 py-2.5"
          >
            <div className="text-xl font-bold text-[var(--text-primary)] leading-tight">
              {card.value}
            </div>
            <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
              {card.label}
            </div>
            {card.prevValue != null && (
              <div className={`text-[10px] mt-1 ${arrowColor} flex items-center gap-1`}>
                {arrow && <span>{arrow}</span>}
                <span>{prevLabel} {card.prevValue}</span>
                {card.special && (
                  <span className="text-emerald-400 font-medium ml-1">
                    {card.special}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
