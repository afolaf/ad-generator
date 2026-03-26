import express from "express";
import cors from "cors";
import Anthropic from "@anthropic-ai/sdk";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an ad copywriter. The user provides a topic. Generate 3 things based on this approved template:

TEMPLATE:
- Creative Script: "What are the 4 fruits you should eat daily to boost your memory?"
- Text: "Explore scientific findings on fruits rich in antioxidants & healthy fats ✨ and their powerful role in supporting memory and brain health."
- Headline: "Learn About Fruits That Boost Memory & Support Cognitive Health. | Info Guide"

RULES:
- Creative Script: question format "What are the X [items] you should [action]?"
- Text: 1-2 sentences, same tone, relevant emoji
- Headline: always end with " | Info Guide"
- Match the energy and style exactly
- Respond ONLY in this exact JSON (no markdown, no extra text):
{"script":"...","text":"...","headline":"..."}`;

app.post("/api/generate", async (req, res) => {
  const { topic } = req.body;
  if (!topic) return res.status(400).json({ error: "No topic provided" });

  try {
    const msg = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: topic }],
    });

    let raw = msg.content[0].text.trim().replace(/```json|```/g, "");
    const parsed = JSON.parse(raw);

    if (!parsed.headline.includes("Info Guide")) {
      parsed.headline = parsed.headline.replace(/\.?\s*$/, "") + " | Info Guide";
    }

    res.json({ white: parsed.white, yellow: parsed.yellow, text: parsed.text, headline: parsed.headline });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on port ${PORT}`));
