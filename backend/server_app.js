const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 4001;

app.use(bodyParser.json());

// Simple health
app.get('/', (req, res) => res.send('Ladder League API'));

// POST /send-email
// body: { to: ["email@example.com"], subject: string, body: string }
app.post('/send-email', async (req, res) => {
  const { to = [], subject = '', body = '' } = req.body || {};

  // Require SMTP config
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port) {
    return res
      .status(400)
      .json({ error: 'SMTP_HOST and SMTP_PORT must be set' });
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(port, 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: user && pass ? { user, pass } : undefined,
    });

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || 'no-reply@ladder.local',
      to: to.join(','),
      subject,
      text: body,
      html: `<pre>${body}</pre>`,
    });

    return res.json({ ok: true, info });
  } catch (err) {
    console.error('send-email error', err);
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Ladder League API listening on ${PORT}`);
});
