export async function sendWhatsappText(client: { sendText: (to: string, text: string) => Promise<unknown> }, to: string, text: string): Promise<void> {
  await client.sendText(to, text);
}
