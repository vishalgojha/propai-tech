export type TerminalThemeId = "pro" | "calm" | "contrast";

type TerminalThemePalette = {
  headerBorder: string;
  brandText: string;
  tickerText: string;
  statusText: string;
  conversationBorder: string;
  conversationTitle: string;
  sessionBorder: string;
  approvalBorder: string;
  activityBorder: string;
  quickBorder: string;
  pendingItem: string;
  pendingEmpty: string;
  inputIdle: string;
  inputBusy: string;
  userText: string;
  assistantText: string;
  systemText: string;
  activityText: string;
};

export type TerminalTheme = {
  id: TerminalThemeId;
  label: string;
  description: string;
  ansi: {
    bannerCode: number;
    statusCode: number;
    logoPalette: number[];
  };
  tui: TerminalThemePalette;
};

export const DEFAULT_THEME: TerminalThemeId = "pro";

const THEMES: Record<TerminalThemeId, TerminalTheme> = {
  pro: {
    id: "pro",
    label: "Pro",
    description: "Balanced neon ops look for daily use.",
    ansi: {
      bannerCode: 96,
      statusCode: 93,
      logoPalette: [96, 94, 36, 92, 96]
    },
    tui: {
      headerBorder: "cyan",
      brandText: "cyan",
      tickerText: "green",
      statusText: "yellow",
      conversationBorder: "magenta",
      conversationTitle: "yellow",
      sessionBorder: "blue",
      approvalBorder: "magenta",
      activityBorder: "green",
      quickBorder: "yellow",
      pendingItem: "white",
      pendingEmpty: "gray",
      inputIdle: "green",
      inputBusy: "yellow",
      userText: "cyan",
      assistantText: "green",
      systemText: "yellow",
      activityText: "gray"
    }
  },
  calm: {
    id: "calm",
    label: "Calm",
    description: "Lower-contrast blue/teal palette for long sessions.",
    ansi: {
      bannerCode: 36,
      statusCode: 94,
      logoPalette: [36, 34, 96, 36, 34]
    },
    tui: {
      headerBorder: "blue",
      brandText: "blue",
      tickerText: "cyan",
      statusText: "white",
      conversationBorder: "blue",
      conversationTitle: "cyan",
      sessionBorder: "cyan",
      approvalBorder: "blue",
      activityBorder: "cyan",
      quickBorder: "blue",
      pendingItem: "white",
      pendingEmpty: "gray",
      inputIdle: "cyan",
      inputBusy: "yellow",
      userText: "white",
      assistantText: "cyan",
      systemText: "yellow",
      activityText: "gray"
    }
  },
  contrast: {
    id: "contrast",
    label: "High Contrast",
    description: "Maximum readability with strong borders.",
    ansi: {
      bannerCode: 97,
      statusCode: 97,
      logoPalette: [97, 93, 97, 93, 97]
    },
    tui: {
      headerBorder: "white",
      brandText: "white",
      tickerText: "yellow",
      statusText: "white",
      conversationBorder: "white",
      conversationTitle: "white",
      sessionBorder: "white",
      approvalBorder: "yellow",
      activityBorder: "white",
      quickBorder: "yellow",
      pendingItem: "white",
      pendingEmpty: "gray",
      inputIdle: "white",
      inputBusy: "yellow",
      userText: "white",
      assistantText: "yellow",
      systemText: "red",
      activityText: "white"
    }
  }
};

export function listTerminalThemes(): TerminalTheme[] {
  return [THEMES.pro, THEMES.calm, THEMES.contrast];
}

export function getTerminalTheme(id: TerminalThemeId = DEFAULT_THEME): TerminalTheme {
  return THEMES[id] || THEMES[DEFAULT_THEME];
}

export function parseTerminalThemeId(raw: string): TerminalThemeId | undefined {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return undefined;

  if (normalized === "pro" || normalized === "default") return "pro";
  if (normalized === "calm" || normalized === "soft") return "calm";
  if (["contrast", "high-contrast", "highcontrast", "hc"].includes(normalized)) return "contrast";
  return undefined;
}
