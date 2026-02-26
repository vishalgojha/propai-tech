const PROPAI_ASCII_LOGO_LINES = [
  " ____  ____   ___  ____    _    ___ ",
  "|  _ \\|  _ \\ / _ \\|  _ \\  / \\  |_ _|",
  "| |_) | |_) | | | | |_) |/ _ \\  | | ",
  "|  __/|  _ <| |_| |  __// ___ \\ | | ",
  "|_|   |_| \\_\\\\___/|_|  /_/   \\_\\___|"
] as const;

export function getPropaiLogoLines(): string[] {
  return [...PROPAI_ASCII_LOGO_LINES];
}

export function getPropaiAnsiLogoLines(palette: readonly number[] = [96, 94, 36, 92, 96]): string[] {
  if (!supportsAnsiColors()) {
    return getPropaiLogoLines();
  }

  return PROPAI_ASCII_LOGO_LINES.map((line, index) => colorize(line, palette[index] || 36));
}

export function colorizeAnsi(text: string, code: number): string {
  if (!supportsAnsiColors()) return text;
  return colorize(text, code);
}

function supportsAnsiColors(): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR === "0") return false;
  if (process.env.TERM === "dumb") return false;
  return Boolean(process.stdout?.isTTY);
}

function colorize(text: string, code: number): string {
  return `\u001b[${code}m${text}\u001b[0m`;
}
