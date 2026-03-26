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

const CATEGORY_PROMPTS = {
  HEALTH: `Generate ONE informative health topic for a 65+ USA audience. Focus on: vitamin deficiencies, medication side effects, symptoms to watch for, treatment options, what doctors may recommend, common health mistakes, age-related conditions (joint pain, bone density, memory, heart health, diabetes, sleep, vision, hearing). 
  Format examples: "what vitamin deficiency might cause [symptom]", "[number] mistakes people make when [managing condition]", "what happens when you [health action]", "signs you might have [condition]", "what [specialist] may want you to know about [topic]", "is it safe to [health action]"`,

  TRAVEL: `Generate ONE informative travel topic for a 65+ USA audience. Focus on: scenic routes in the USA, cruises, national parks, travel tips for seniors, affordable destinations, road trips, travel considerations, packing tips, travel insurance info, accessible travel. 
  Format examples: "what to know before [travel action]", "[number] things people overlook when [travel planning]", "what most people don't know about [destination/travel type]", "how [travel type] might be more [benefit] than you think", "signs you might love [destination]"`,

  VEHICLES: `Generate ONE informative vehicle topic for a 65+ USA audience. Focus on: car safety features, hybrid vs gas, what to check before buying a used car, maintenance tips, best cars for seniors, fuel efficiency, vehicle comparisons, things to consider when buying a car. 
  Format examples: "what to know before buying a [vehicle type]", "[number] things people overlook when [car action]", "what might make [vehicle feature] worth considering", "how [car feature] might affect your [driving experience/safety]", "signs it might be time to [vehicle action]"`,

  COMMERCE: `Generate ONE informative commerce/services topic for a 65+ USA audience. Focus on: Medicare supplement plans, home security, senior living options, home improvement services, subscription services, internet plans, utility savings, insurance options, online shopping safety, home care services.
  Format examples: "what most people don't know about [service]", "[number] things to consider when choosing [service]", "what might make [service/product] worth looking into", "signs you might benefit from [service]", "what to know before signing up for [service]"`,

  FACTS: `Generate ONE surprising/interesting fact topic for a 65+ USA audience. Focus on: surprising health facts, historical facts about the USA, nature and science facts, food and nutrition facts, little-known facts about everyday things, surprising facts about aging, body and brain facts.
  Format examples: "what most people don't know about [topic]", "the surprising truth about [topic]", "what science may say about [topic]", "[number] surprising facts about [topic] most people don't know", "how [topic] might be different from what you think"`
};

const RANDOM_TOPIC_PROMPT = `You generate creative ad topics about health, aging, nutrition, medical symptoms, or lifestyle for a 65+ USA audience.

Generate ONE unique topic inspired by these proven formats:
- "what vitamin deficiency might cause [symptom]"
- "[number] mistakes people make when [health action]"
- "what happens when you [health action]"
- "signs you might have [condition]"
- "what [specialist] may want you to know about [topic]"
- "is it safe to [health action]"
- "everyday [foods/habits/drinks] that might [effect]"
- "how [cause] might be affecting your [health outcome]"

Rules:
- Always health/medical/lifestyle related
- Must be something a 65+ year old in the USA would find interesting
- Never repeat a topic from the list provided
- Return ONLY the topic as plain text, nothing else, no quotes`;

app.post("/api/random-topic", async (req, res) => {
  const { used = [], category = null } = req.body;
  const usedList = used.length > 0 ? "\n\nTopics already used (DO NOT repeat these):\n" + used.join("\n") : "";
  const basePrompt = category && CATEGORY_PROMPTS[category] ? CATEGORY_PROMPTS[category] : RANDOM_TOPIC_PROMPT;
  const fullPrompt = basePrompt + usedList + "\n\nRules:\n- Never repeat a topic from the used list\n- Return ONLY the topic as plain text, nothing else, no quotes";
  try {
    const msg = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 80,
      system: fullPrompt,
      messages: [{ role: "user", content: "Generate a new unique topic." }],
    });
    res.json({ topic: msg.content[0].text.trim() });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

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
