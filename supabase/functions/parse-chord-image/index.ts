// =============================================================================
// Supabase Edge Function: parse-chord-image
// Dynamically queries public.chord_parser_memory for learned OCR/alignment rules
// and verified ChordPro few-shot examples, injects them into the Vision AI
// System Prompt, and parses Thai chord sheet images into strict ChordPro JSON.
// Supports GEMINI_API_KEY (Gemini 2.5 Flash) or OPENAI_API_KEY (GPT-4o / mini).
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const BASE_VISION_PROMPT = `You are an expert Thai music transcriber and OCR specialist.
Your task is to convert the provided chord sheet image into accurate JSON containing the original key and lyrics in ChordPro format.

STRICT RULES:
1. Alignment: Place every chord in square brackets \`[Chord]\` IMMEDIATELY BEFORE the exact Thai syllable or character it sits above in the image.
   - Example: If "G" is above the word "รัก", write \`[G]รัก\` (NOT \`[G] รัก\` unless there is an actual instrumental pause).
2. Instrumental sections: For Intro, Solo, Interlude, or Outro, keep chords in brackets separated by spaces or bar lines, e.g., \`[| C | G/B | Am7 | F |]\`
3. Sections: Preserve section headers clearly using \`{comment: Intro}\`, \`{comment: Verse}\`, \`{comment: Chorus}\`, etc.
4. Accuracy: Pay close attention to similar-looking characters in chord sheets:
   - Distinguish \`m\` vs \`M\` (minor vs major), \`#\` vs \`b\`, \`7\` vs \`1\`, \`B\` vs \`8\`, \`F#m\` vs \`F#rn\`.
   - Do NOT invent, guess, or autocorrect chords that are not visible in the image.
5. Output ONLY valid JSON in this exact schema:
{
  "title": "string",
  "artist": "string",
  "original_key": "string (e.g. C, Gm, F#)",
  "chordpro_content": "string (multiline ChordPro text)"
}

{{DYNAMIC_LEARNED_RULES_AND_EXAMPLES_FROM_DB}}`;

interface CorrectionRule {
  wrong: string;
  right: string;
  type?: string;
  reason?: string;
}

interface VerifiedExample {
  source_domain: string;
  song_title?: string;
  original_key?: string;
  verified_chordpro: string;
}

function buildDynamicMemorySection(
  sourceDomain: string,
  rules: CorrectionRule[],
  examples: VerifiedExample[]
): string {
  const parts: string[] = [];

  if (rules.length > 0) {
    parts.push(`LEARNED CORRECTION RULES (from previously verified "${sourceDomain}" sheets — DO NOT repeat these mistakes):`);
    rules.slice(0, 15).forEach((r, idx) => {
      const note = r.reason || r.type ? ` (${r.reason || r.type})` : '';
      parts.push(`- Mistake #${idx + 1}: "${r.wrong}" -> MUST be "${r.right}"${note}`);
    });
  }

  if (examples.length > 0) {
    if (parts.length > 0) parts.push('');
    parts.push(`VERIFIED FEW-SHOT CHORDPRO EXAMPLES (style reference for "${sourceDomain}"):`);
    examples.slice(0, 3).forEach((ex, idx) => {
      const header = `Example #${idx + 1} [Source: ${ex.source_domain || sourceDomain}, Key: ${ex.original_key || 'C'}]`;
      parts.push(`${header}:\n${String(ex.verified_chordpro || '').trim()}`);
    });
  }

  return parts.join('\n');
}

function extractJsonObject(raw: string): Record<string, unknown> {
  const trimmed = String(raw || '').trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    const start = unfenced.indexOf('{');
    const end = unfenced.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(unfenced.slice(start, end + 1));
    }
    throw new Error('Vision AI did not return valid JSON');
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 45000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callGeminiVision(
  apiKey: string,
  preferredModel: string,
  systemPrompt: string,
  imageBase64: string,
  mimeType: string
): Promise<{ parsed: Record<string, unknown>; modelUsed: string }> {
  const sanitizedPreferred = preferredModel && preferredModel !== 'gemini-3.8-flash' ? preferredModel : 'gemini-2.5-flash';
  const modelsToTry = [
    sanitizedPreferred,
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash'
  ].filter((m, i, arr) => m && arr.indexOf(m) === i);

  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    const thinkingModes = model.includes('2.5') ? [false, true] : [false];
    for (const withThinking of thinkingModes) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
          const genConfig: Record<string, unknown> = {
            temperature: 0.1,
            responseMimeType: 'application/json'
          };

          if (withThinking && model.includes('2.5')) {
            genConfig.thinkingConfig = { thinkingBudget: 512 };
          }

          const res = await fetchWithTimeout(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: {
                parts: [{ text: systemPrompt }]
              },
              contents: [
                {
                  role: 'user',
                  parts: [
                    {
                      inlineData: {
                        mimeType: mimeType || 'image/png',
                        data: imageBase64
                      }
                    },
                    {
                      text: 'Transcribe this Thai chord sheet image into the exact ChordPro JSON schema.'
                    }
                  ]
                }
              ],
              generationConfig: genConfig
            })
          }, 45000);

          if (res.ok) {
            const data = await res.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const parsed = extractJsonObject(text);
            return { parsed, modelUsed: model };
          }

          const errText = await res.text();
          console.warn(`[Gemini Vision model ${model} (thinking: ${withThinking}, attempt: ${attempt + 1}) returned ${res.status}]: ${errText.slice(0, 150)}`);
          lastError = new Error(`Gemini Vision error (${res.status} on ${model}): ${errText.slice(0, 200)}`);

          if (res.status === 404 || res.status === 400) {
            break;
          }
          if ((res.status === 429 || res.status === 503 || res.status >= 500) && attempt === 0) {
            await new Promise((r) => setTimeout(r, 800));
            continue;
          }
          break;
        } catch (err: any) {
          lastError = err;
          if (attempt === 0) {
            await new Promise((r) => setTimeout(r, 600));
            continue;
          }
          break;
        }
      }
    }
  }

  throw lastError || new Error('All Gemini Vision models failed');
}

async function callOpenAiVision(
  apiKey: string,
  model: string,
  systemPrompt: string,
  imageBase64: string,
  mimeType: string
) {
  const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Transcribe this Thai chord sheet image into the exact ChordPro JSON schema.'
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType || 'image/png'};base64,${imageBase64}`,
                detail: 'high'
              }
            }
          ]
        }
      ]
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI Vision error (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || '';
  return extractJsonObject(text);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const body = await req.json();
    const imageBase64 = String(body.imageBase64 || body.image_base64 || '').replace(/^data:[^;]+;base64,/, '');
    const mimeType = String(body.mimeType || body.mime_type || 'image/png');
    const sourceDomain = String(body.sourceDomain || body.source_domain || 'chordtabs').trim().toLowerCase() || 'chordtabs';

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: 'Missing imageBase64 or image_base64' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    // 1) Fetch learned rules & verified few-shot examples from public.chord_parser_memory
    let dbRules: CorrectionRule[] = Array.isArray(body.correctionRules || body.correction_rules)
      ? (body.correctionRules || body.correction_rules)
      : [];
    let dbExamples: VerifiedExample[] = Array.isArray(body.verifiedExamples || body.verified_examples)
      ? (body.verifiedExamples || body.verified_examples)
      : [];

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const authHeader = req.headers.get('Authorization') || '';

    if (supabaseUrl && supabaseAnonKey) {
      try {
        const sb = createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: authHeader ? { Authorization: authHeader } : {} }
        });

        const { data: rows } = await sb
          .from('chord_parser_memory')
          .select('source_domain, entry_type, song_title, original_key, verified_chordpro, correction_rules, quality_score')
          .in('source_domain', [sourceDomain, 'general'])
          .order('quality_score', { ascending: false })
          .order('updated_at', { ascending: false })
          .limit(16);

        if (Array.isArray(rows) && rows.length > 0) {
          const collectedRules: CorrectionRule[] = [];
          const collectedExamples: VerifiedExample[] = [];

          for (const row of rows) {
            if (Array.isArray(row.correction_rules)) {
              for (const r of row.correction_rules) {
                if (r && r.wrong && r.right) collectedRules.push(r);
              }
            }
            if (row.entry_type === 'few_shot_example' && row.verified_chordpro) {
              collectedExamples.push({
                source_domain: row.source_domain,
                song_title: row.song_title,
                original_key: row.original_key,
                verified_chordpro: row.verified_chordpro
              });
            }
          }

          if (collectedRules.length > 0) dbRules = collectedRules;
          if (collectedExamples.length > 0) dbExamples = collectedExamples.slice(0, 3);
        }
      } catch (_dbErr) {
        // Proceed with client-supplied memory fallback if table not yet migrated
      }
    }

    const dynamicSection = buildDynamicMemorySection(sourceDomain, dbRules, dbExamples);
    const systemPrompt = BASE_VISION_PROMPT.replace(
      '{{DYNAMIC_LEARNED_RULES_AND_EXAMPLES_FROM_DB}}',
      dynamicSection
    ).trim();

    // 2) Dispatch to configured Vision AI provider
    const geminiKey = Deno.env.get('GEMINI_API_KEY') || '';
    const openAiKey = Deno.env.get('OPENAI_API_KEY') || '';
    let parsed: Record<string, unknown>;
    let provider = '';

    if (geminiKey) {
      try {
        provider = Deno.env.get('GEMINI_VISION_MODEL') || 'gemini-2.5-flash';
        const gemResult = await callGeminiVision(geminiKey, provider, systemPrompt, imageBase64, mimeType);
        parsed = gemResult.parsed;
        provider = gemResult.modelUsed;
      } catch (gemErr) {
        if (openAiKey) {
          console.warn('[Edge Function] Gemini failed, falling back to OpenAI:', gemErr);
          provider = Deno.env.get('OPENAI_VISION_MODEL') || 'gpt-4o-mini';
          parsed = await callOpenAiVision(openAiKey, provider, systemPrompt, imageBase64, mimeType);
        } else {
          throw gemErr;
        }
      }
    } else if (openAiKey) {
      provider = Deno.env.get('OPENAI_VISION_MODEL') || 'gpt-4o-mini';
      parsed = await callOpenAiVision(openAiKey, provider, systemPrompt, imageBase64, mimeType);
    } else {
      return new Response(
        JSON.stringify({ error: 'VISION_KEY_NOT_CONFIGURED' }),
        { status: 503, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const payload = {
      title: String(parsed.title || ''),
      artist: String(parsed.artist || ''),
      original_key: String(parsed.original_key || ''),
      chordpro_content: String(parsed.chordpro_content || ''),
      source_domain: sourceDomain,
      provider,
      memory_applied: {
        rules_count: dbRules.length,
        examples_count: Math.min(3, dbExamples.length)
      }
    };

    return new Response(
      JSON.stringify({
        ...payload,
        success: true,
        data: payload
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }
});
