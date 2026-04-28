require('dotenv').config();

const express = require('express');
const line = require('@line/bot-sdk');

const app = express();

const channelAccessToken = process.env.CHANNEL_ACCESS_TOKEN;
const channelSecret = process.env.CHANNEL_SECRET;

const client = line.LineBotClient.fromChannelAccessToken({
  channelAccessToken: channelAccessToken,
});

// หน้าแรกไว้ตรวจสอบว่า server ทำงานอยู่
app.get('/', function (req, res) {
  res.send('LINE Bot Server is running');
});

// Webhook สำหรับรับข้อความจาก LINE
app.post(
  '/webhook',
  line.middleware({
    channelSecret: channelSecret,
  }),
  function (req, res) {
    Promise.all(req.body.events.map(handleEvent))
      .then(function (result) {
        res.json(result);
      })
      .catch(function (err) {
        console.error(err);
        res.status(500).end();
      });
  }
);

// ฟังก์ชันจัดการ event จาก LINE
function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [
      {
        type: 'text',
        text: `คุณพิมพ์ว่า: ${event.message.text}`,
      },
    ],
  });
}

const port = process.env.PORT || 3000;

app.listen(port, function () {
  console.log(`LINE Bot Server running at http://localhost:${port}`);
});