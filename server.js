import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app    = express();
const client = new Anthropic();

app.use(express.json());
app.use(express.static(__dirname));

// POST /api/tutor/questions — non-streaming, returns JSON array of 5 questions
app.post('/api/tutor/questions', async (req, res) => {
  const { subject, topic } = req.body;
  if (!subject || !topic) return res.status(400).json({ error: 'subject and topic required' });

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `You are a quiz generator for students aged 12-18. Generate exactly 5 quiz questions about "${topic}" in ${subject}.
Return ONLY a valid JSON array with no extra text before or after it:
[
  {"question": "...", "answer": "...", "hint": "..."},
  {"question": "...", "answer": "...", "hint": "..."},
  {"question": "...", "answer": "...", "hint": "..."},
  {"question": "...", "answer": "...", "hint": "..."},
  {"question": "...", "answer": "...", "hint": "..."}
]
Questions should be clear and age-appropriate. Answers should be concise (1-3 words or a short phrase). Hints should give a small nudge without giving away the answer.`,
      }],
    });

    const text  = response.content[0].text;
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('Could not parse questions from AI response');
    const questions = JSON.parse(match[0]);
    res.json({ questions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function sseHeaders(res) {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();
}

// POST /api/tutor/evaluate — SSE streaming feedback for one answer
app.post('/api/tutor/evaluate', async (req, res) => {
  const { subject, topic, question, correctAnswer, studentAnswer } = req.body;
  sseHeaders(res);

  try {
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `You are an enthusiastic, encouraging tutor for students aged 12-18 studying ${subject} (topic: ${topic}).

Question: ${question}
Correct answer: ${correctAnswer}
Student's answer: ${studentAnswer}

Start your response with EXACTLY one of these three symbols as the very first character (nothing before it):
✅ if the student got it right (or substantially correct)
❌ if the student got it wrong
⚡ if the student's answer was partially correct

Then immediately give 2-3 sentences of friendly feedback: explain why the answer is right/wrong, reinforce the key concept, and add an encouraging message. Use emojis. Keep it fun and motivating for a young student!`,
      }],
    });

    stream.on('text',         text => res.write(`data: ${JSON.stringify({ text })}\n\n`));
    stream.on('finalMessage', ()   => { res.write(`data: ${JSON.stringify({ done: true })}\n\n`); res.end(); });
    stream.on('error',        err  => { res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`); res.end(); });
    req.on('close', () => stream.abort());
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

// POST /api/tutor/summary — SSE streaming personalised end-of-quiz summary
app.post('/api/tutor/summary', async (req, res) => {
  const { subject, topic, score, results } = req.body;
  sseHeaders(res);

  const resultLines = results.map((r, i) =>
    `Q${i + 1}: "${r.question}" — Student answered: "${r.studentAnswer}" — Result: ${r.result}`
  ).join('\n');

  try {
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `You are an enthusiastic tutor for students aged 12-18. A student just completed a 5-question quiz on "${topic}" in ${subject} and scored ${score}/5.

Here are their results:
${resultLines}

Write a personalised, encouraging summary (3-5 sentences). Start with a fun emoji reaction to their score. Tell them specifically what they did well and what to focus on next. Give concrete study advice for any topics they struggled with. End with a motivating sign-off. Keep it warm, fun, and age-appropriate!`,
      }],
    });

    stream.on('text',         text => res.write(`data: ${JSON.stringify({ text })}\n\n`));
    stream.on('finalMessage', ()   => { res.write(`data: ${JSON.stringify({ done: true })}\n\n`); res.end(); });
    stream.on('error',        err  => { res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`); res.end(); });
    req.on('close', () => stream.abort());
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🌱 ResponsibleHub → http://localhost:${PORT}`)
);
