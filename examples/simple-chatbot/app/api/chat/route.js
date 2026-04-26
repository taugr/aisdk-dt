import { generateText, tool, wrapLanguageModel } from 'ai';
import { devToolsMiddleware } from '@ai-sdk/devtools';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const model = wrapLanguageModel({
  model: openai('gpt-4o-mini'),
  middleware: devToolsMiddleware,
});

const tools = {
  getWeather: tool({
    description: 'Get a mock weather forecast for a city.',
    inputSchema: z.object({
      city: z.string().min(2),
    }),
    execute: async ({ city }) => {
      const normalized = city.trim().toLowerCase();
      const map = {
        seattle: { conditions: 'light rain', temperatureF: 57 },
        austin: { conditions: 'sunny', temperatureF: 84 },
        boston: { conditions: 'cloudy', temperatureF: 61 },
        miami: { conditions: 'humid', temperatureF: 88 },
      };

      return {
        city,
        ...(map[normalized] ?? {
          conditions: 'clear',
          temperatureF: 72,
        }),
        source: 'mock-weather-service',
      };
    },
  }),
  listCityActivities: tool({
    description: 'Suggest activities based on weather conditions.',
    inputSchema: z.object({
      city: z.string(),
      conditions: z.string(),
    }),
    execute: async ({ city, conditions }) => {
      const c = conditions.toLowerCase();
      const activities = c.includes('rain')
        ? ['visit a museum', 'try a coffee shop crawl']
        : c.includes('sun')
          ? ['walk a scenic trail', 'have a picnic in a park']
          : ['explore a local market', 'visit a neighborhood bookstore'];

      return {
        city,
        activities,
      };
    },
  }),
};

export async function POST(request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return Response.json(
        {
          error: 'Missing OPENAI_API_KEY in your environment.',
        },
        { status: 500 },
      );
    }

    const { prompt } = await request.json();

    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
      return Response.json({ error: 'Prompt is required.' }, { status: 400 });
    }

    const result = await generateText({
      model,
      system:
        'You are a concise local travel assistant. Use tools whenever weather or activities are relevant.',
      prompt,
      tools,
    });

    return Response.json({
      text: result.text,
      toolCalls: result.toolCalls,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
