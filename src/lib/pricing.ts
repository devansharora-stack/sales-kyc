// USD per 1M tokens. Estimates for display only — actual billing (Azure AI
// Foundry for Claude, Google for Gemini) may differ. Matched by prefix so
// versioned model ids (e.g. "claude-opus-4-6") resolve without an exact entry.
interface Price {
  inputPerM: number;
  outputPerM: number;
}

const PRICES: { prefix: string; price: Price }[] = [
  { prefix: "claude-opus", price: { inputPerM: 5, outputPerM: 25 } },
  { prefix: "claude-sonnet", price: { inputPerM: 3, outputPerM: 15 } },
  { prefix: "claude-haiku", price: { inputPerM: 0.8, outputPerM: 4 } },
  { prefix: "gemini-2.5-pro", price: { inputPerM: 1.25, outputPerM: 10 } },
  { prefix: "gemini-2.5-flash", price: { inputPerM: 0.3, outputPerM: 2.5 } },
  { prefix: "gemini-2.0-flash", price: { inputPerM: 0.1, outputPerM: 0.4 } },
  { prefix: "gemini-1.5-pro", price: { inputPerM: 1.25, outputPerM: 5 } },
  { prefix: "gemini-1.5-flash", price: { inputPerM: 0.075, outputPerM: 0.3 } },
  { prefix: "gemini", price: { inputPerM: 0.3, outputPerM: 2.5 } },
];

const FALLBACK: Price = { inputPerM: 5, outputPerM: 25 };

function priceFor(model: string): Price {
  const m = (model || "").toLowerCase();
  return PRICES.find((p) => m.startsWith(p.prefix))?.price ?? FALLBACK;
}

// Estimated cost in USD for a call's token counts.
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = priceFor(model);
  return (inputTokens / 1_000_000) * p.inputPerM + (outputTokens / 1_000_000) * p.outputPerM;
}
