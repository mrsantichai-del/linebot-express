require("dotenv").config();

const express = require("express");
const line = require("@line/bot-sdk");

const app = express();

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.messagingApi.MessagingApiClient(lineConfig);
const blobClient = new line.messagingApi.MessagingApiBlobClient(lineConfig);

let geminiClient = null;

async function getGeminiClient() {
  if (!geminiClient) {
    const { GoogleGenAI } = await import("@google/genai");
    geminiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });
  }
  return geminiClient;
}

app.get("/", (req, res) => {
  res.send("LINE Gemini Bot is running");
});

app.post("/webhook", line.middleware(lineConfig), async (req, res) => {
  try {
    const events = req.body.events || [];
    console.log("Received Webhook Events:", JSON.stringify(events, null, 2));
    await Promise.all(events.map(handleEvent));
    res.json({ status: "ok" });
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ error: "webhook error" });
  }
});

async function handleEvent(event) {
  if (event.type !== "message") {
    return null;
  }

  if (event.message.type === "text") {
    return handleTextMessage(event);
  }

  if (event.message.type === "image") {
    return handleImageMessage(event);
  }

  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [
      {
        type: "text",
        text: "ตอนนี้รองรับเฉพาะข้อความ Text และ Image เท่านั้นครับ",
      },
    ],
  });
}

async function handleTextMessage(event) {
  const userText = event.message.text;

  try {
    const ai = await getGeminiClient();

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `กรุณาตอบเป็นภาษาไทยแบบเข้าใจง่าย: ${userText}`,
            },
          ],
        },
      ],
    });

    const geminiText = response.text || "Gemini ไม่มีข้อความตอบกลับ";

    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [
        {
          type: "text",
          text: geminiText.slice(0, 4900),
        },
      ],
    });
  } catch (error) {
    console.error("Gemini text error:", error.message || error);

    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [
        {
          type: "text",
          text: "ขออภัยครับ เชื่อมต่อ Gemini ไม่สำเร็จ กรุณาตรวจสอบ GEMINI_API_KEY",
        },
      ],
    });
  }
}

async function handleImageMessage(event) {
  try {
    await client.replyMessage({
      replyToken: event.replyToken,
      messages: [
        {
          type: "text",
          text: "ส่งรูปภาพสำเร็จ กำลังตรวจสอบว่าเป็น ชินส่วนใด...",
          // text: "ส่งรูปภาพสำเร็จ กำลังตรวจสอบว่าเป็นสัตว์ชนิดอะไร...",
        },
      ],
    });

    const imageBuffer = await downloadLineImage(event.message.id);
    const base64Image = imageBuffer.toString("base64");

    const ai = await getGeminiClient();

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Image,
              },
            },
            {
              text: "ภาพนี้เป็นชิ้นส่วนใด ของรถยนต์ หรือ เครื่องจักร ฉันจะไปหาซื้อได้ที่ไหนตอบเป็นภาษาไทยแบบสั้นและชัดเจน ถ้าไม่ใช่ชิ้นส่วนรถยนต์ หรือ ชิ้นส่วนเครื่องจักร หรือชิ้นส่วนยานยนต์ ให้บอกว่าไม่พบชิ้นส่วนรถยนต์ในภาพ",
              // text: "ภาพนี้เป็นสัตว์ชนิดอะไร ตอบเป็นภาษาไทยแบบสั้นและชัดเจน ถ้าไม่ใช่สัตว์ให้บอกว่าไม่พบสัตว์ในภาพ",
            },
          ],
        },
      ],
    });

    const animalResult = response.text || "ไม่สามารถวิเคราะห์รูปภาพได้";

    return client.pushMessage({
      to: event.source.userId,
      messages: [
        {
          type: "text",
          text: `ผลการตรวจรูปภาพ: ${animalResult.slice(0, 4900)}`,
        },
      ],
    });
  } catch (error) {
    console.error("Image analyze error:", error);

    if (event.source && event.source.userId) {
      return client.pushMessage({
        to: event.source.userId,
        messages: [
          {
            type: "text",
            text: "รับรูปภาพแล้ว แต่ยังวิเคราะห์รูปไม่ได้ กรุณาตรวจสอบ LINE token หรือ GEMINI_API_KEY",
          },
        ],
      });
    }

    return null;
  }
}

async function downloadLineImage(messageId) {
  const stream = await blobClient.getMessageContent(messageId);
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
