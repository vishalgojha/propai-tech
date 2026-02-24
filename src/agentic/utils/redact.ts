export function redactSecret(value: string): string {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 8) return "*".repeat(text.length);
  return `${text.slice(0, 4)}***${text.slice(-3)}`;
}

export function redactPhone(value: string): string {
  const digits = String(value || "").replace(/[^\d]/g, "");
  if (digits.length < 8) return "***";
  return `+${digits.slice(0, 2)}******${digits.slice(-2)}`;
}

export function redactCommandPhone(command: string): string {
  if (!command) return command;
  return command.replace(
    /(--to\s+)([+]?\d[\d\s-]{7,20})/i,
    (_full, prefix: string, rawPhone: string) => `${prefix}${redactPhone(rawPhone)}`
  );
}
