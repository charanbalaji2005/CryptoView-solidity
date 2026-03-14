// ══════════════════════════════════════════════════════════════
// ADD THIS TO YOUR EXISTING backend server.js / index.js
// ══════════════════════════════════════════════════════════════
// 1. npm install @anthropic-ai/sdk   (if not already installed)
// 2. Add your key to .env:  ANTHROPIC_API_KEY=sk-ant-...
// 3. Paste this route into your Express app
// ══════════════════════════════════════════════════════════════

const Anthropic = require("@anthropic-ai/sdk");

// POST /api/news
// Body: { topic: "Bitcoin" }
app.post("/api/news", async (req, res) => {
  const { topic = "cryptocurrency crypto blockchain" } = req.body ?? {};

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `Search the web for the latest crypto news about: "${topic}".

Return ONLY a valid JSON array of exactly 8 news items (no markdown, no explanation, no code fences).
Each object must have these exact keys:
{
  "title": "...",
  "summary": "2-3 sentence summary of the article",
  "source": "publication name",
  "url": "full article URL",
  "category": "one of: Bitcoin | Ethereum | DeFi | NFT | Altcoins | Regulation | General",
  "publishedAt": "relative time like '2 hours ago' or '1 day ago'",
  "sentiment": "bullish | bearish | neutral"
}

Make sure the news is real, recent, and factual. Return only the JSON array, nothing else.`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: prompt }],
    });

    // Extract all text blocks
    const fullText = message.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .filter(Boolean)
      .join("\n");

    // Strip any markdown fences and find JSON array
    const clean    = fullText.replace(/```json/gi, "").replace(/```/g, "").trim();
    const startIdx = clean.indexOf("[");
    const endIdx   = clean.lastIndexOf("]");

    if (startIdx === -1 || endIdx === -1) {
      return res.status(500).json({ error: "No JSON array in response", raw: fullText });
    }

    const articles = JSON.parse(clean.slice(startIdx, endIdx + 1));
    res.json({ articles });
  } catch (err) {
    console.error("News API error:", err);
    res.status(500).json({ error: err.message ?? "Failed to fetch news" });
  }
});