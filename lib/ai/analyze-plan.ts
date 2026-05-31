// This module is used by the API route only (server-side)
// The actual Claude Vision call is in app/api/analyze/route.ts
// This file exports helper functions for analysis

import type { FloorplanAnalysis } from '@/types/project';

export async function analyzePlanWithSDK(imageBase64: string, apiKey: string): Promise<FloorplanAnalysis> {
  const { FLOORPLAN_ANALYSIS_PROMPT } = await import('./prompts');
  const anthropicVisionModel = process.env.ANTHROPIC_VISION_MODEL || 'claude-sonnet-4-20250514';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: anthropicVisionModel,
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: FLOORPLAN_ANALYSIS_PROMPT,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const result = await response.json();
  const textBlock = result.content?.find((b: { type: string }) => b.type === 'text');

  if (!textBlock) {
    throw new Error('No text in Claude response');
  }

  let jsonStr = textBlock.text;
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1];
  const jsonObjMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (jsonObjMatch) jsonStr = jsonObjMatch[0];

  return JSON.parse(jsonStr.trim()) as FloorplanAnalysis;
}
