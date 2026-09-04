import 'dotenv/config';
import express from 'express';
import OpenAI from 'openai';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const port = process.env.PORT || 3000;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);

app.use(express.json({ limit: '20kb' }));
app.use(express.static(currentDirectory));

app.post('/api/chat', async (request, response) => {
  if (!process.env.OPENAI_API_KEY) {
    return response.status(500).json({ error: 'The assistant is not configured yet.' });
  }

  const message = typeof request.body?.message === 'string' ? request.body.message.trim() : '';
  if (!message || message.length > 1000) {
    return response.status(400).json({ error: 'Please send a message under 1000 characters.' });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: 'You are the customer support assistant for Empire Bysonic Computing in the Southern Suburbs of Cape Town. Help with laptop and desktop repairs, diagnostics, screen and charging-port replacement, RAM and SSD upgrades, quotations, bookings, and general service questions. Be concise and honest. Do not invent prices, availability, warranties, or technical diagnoses. For a booking or quote, direct the customer to the Intake Form page or phone +27 81 827 2643.'
        },
        { role: 'user', content: message }
      ]
    });

    const reply = completion.choices[0]?.message?.content?.trim();
    response.json({ reply: reply || 'Please contact us on +27 81 827 2643 for assistance.' });
  } catch (error) {
    console.error('Assistant request failed:', error.message);
    response.status(502).json({ error: 'The assistant is temporarily unavailable. Please call +27 81 827 2643.' });
  }
});

app.listen(port, () => {
  console.log(`Empire Bysonic site running at http://localhost:${port}`);
});
