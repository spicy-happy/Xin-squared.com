const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

admin.initializeApp();

// Define the OpenAI API key as a secret (set via: firebase functions:secrets:set OPENAI_API_KEY)
const openaiApiKey = defineSecret("OPENAI_API_KEY");

exports.openai = onCall(
  { secrets: [openaiApiKey], maxInstances: 10 },
  async (request) => {
    // Require authentication
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in to use AI features.");
    }

    const { prompt, images } = request.data;
    if (!prompt) {
      throw new HttpsError("invalid-argument", "Missing prompt.");
    }

    const apiKey = openaiApiKey.value();
    if (!apiKey) {
      throw new HttpsError("failed-precondition", "OpenAI API key not configured.");
    }

    // Build the message content (text-only or text+images)
    let content;
    if (images && images.length > 0) {
      content = [{ type: "text", text: prompt }];
      for (const img of images) {
        content.push({
          type: "image_url",
          image_url: { url: img, detail: "low" },
        });
      }
    } else {
      content = prompt;
    }

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content }],
        }),
      });

      const data = await response.json();

      if (data.error) {
        throw new HttpsError("internal", data.error.message || "OpenAI API error");
      }

      return { text: data.choices[0]?.message?.content || "" };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to call OpenAI: " + error.message);
    }
  }
);
