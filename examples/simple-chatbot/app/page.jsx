'use client';

import { useState } from 'react';

export default function HomePage() {
  const [prompt, setPrompt] = useState(
    'What should I do in Seattle this afternoon?',
  );
  const [answer, setAnswer] = useState('');
  const [toolCalls, setToolCalls] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(event) {
    event.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? 'Request failed');
      }

      const body = await response.json();
      setAnswer(body.text ?? '');
      setToolCalls(body.toolCalls ?? []);
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : 'Unknown error';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="stack">
      <h1>Next.js Tool-Calling Chatbot (AI SDK + DevTools)</h1>
      <p>
        Submit a prompt to run an AI SDK generation with tools. Then inspect
        <code> .devtools/generations.json</code> with <code>aisdk-dt</code>.
      </p>

      <form className="card stack" onSubmit={onSubmit}>
        <label htmlFor="prompt">Prompt</label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
        />
        <button type="submit" disabled={isLoading || !prompt.trim()}>
          {isLoading ? 'Running…' : 'Run chat request'}
        </button>
      </form>

      {error ? (
        <section className="card stack">
          <h2>Error</h2>
          <pre>{error}</pre>
        </section>
      ) : null}

      {answer ? (
        <section className="card stack">
          <h2>Assistant answer</h2>
          <p>{answer}</p>
        </section>
      ) : null}

      {toolCalls.length > 0 ? (
        <section className="card stack">
          <h2>Tool calls used</h2>
          <pre>{JSON.stringify(toolCalls, null, 2)}</pre>
        </section>
      ) : null}
    </main>
  );
}
