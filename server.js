import express from "express";
import cors from "cors";
import Anthropic from "@anthropic-ai/sdk";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an ad copywriter. The user provides a topic. Generate 3 things based on this approved template:

TEMPLATE STYLE (black background square image ad):
- Example: "THESE 3 COMMON DRINKS MAY BE IMPACTING BONE DENSITY" — white bold uppercase text, with the key topic word(s) highlighted
- Text: "Explore scientific findings on fruits rich in antioxidants & healthy fats ✨ and their powerful role in supporting memory and brain health."
- Headline: "Learn About Fruits That Boost Memory & Support Cognitive Health. Info Guide"

RULES:
- Creative Script: short punchy ALL CAPS statement (NOT a question). Format: "THESE X [items] [action statement] [KEYWORD]". Split into "white" (the first part) and "yellow" (the key topic word(s) at the end).
- Text: 1-2 sentences, same tone, relevant emoji
- Headline: always end with " Info Guide" (no pipe character)
- Respond ONLY in this exact JSON (no markdown, no extra text):
{"white":"THESE 3 COMMON DRINKS MAY BE IMPACTING","yellow":"BONE DENSITY","text":"...","headline":"..."}`;

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

    // Hard block: if white starts with THESE, retry once with stricter prompt
    if (parsed.white.toUpperCase().startsWith("THESE")) {
      const retry = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 400,
        system: SYSTEM_PROMPT + "\n\nCRITICAL: Your previous response started with THESE which is FORBIDDEN. You MUST start with a different word. Use formats like: WHAT VITAMIN DEFICIENCY, X MISTAKES PEOPLE MAKE, WHAT HAPPENS WHEN, IS IT SAFE TO, HOW THIS MIGHT AFFECT, WHAT DOCTORS MAY, etc.",
        messages: [{ role: "user", content: topic }],
      });
      raw = retry.content[0].text.trim().replace(/```json|```/g, "");
      Object.assign(parsed, JSON.parse(raw));
    }

    // Ensure headline ends with Info Guide (no pipe)
    let hl = parsed.headline.replace(/\s*\|\s*Info Guide$/i, "").replace(/\s*Info Guide$/i, "").trim();
    hl = hl.replace(/\.?\s*$/, "") + " Info Guide";

    res.json({ white: parsed.white, yellow: parsed.yellow, text: parsed.text, headline: hl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Running on port ${PORT}`));
