import Anthropic from '@anthropic-ai/sdk'

export interface ScoreResult {
  score: number
  recognizable: boolean
  strengths: string[]
  issues: string[]
  one_line_verdict: string
}

const MODEL = process.env.SCORING_MODEL ?? 'claude-opus-4-8'

const client = new Anthropic() // reads ANTHROPIC_API_KEY from the environment

const SCORE_SCHEMA = {
  type: 'object',
  properties: {
    score: {
      type: 'integer',
      description: 'Match score from 0 to 100.',
    },
    recognizable: {
      type: 'boolean',
      description: 'Would a stranger, shown only the model, name the target object (or something very close)?',
    },
    strengths: {
      type: 'array',
      items: { type: 'string' },
      description: '1-4 short, specific things the model gets right (shape, proportions, features).',
    },
    issues: {
      type: 'array',
      items: { type: 'string' },
      description: '1-4 short, actionable problems, each pointing at a concrete part or proportion to fix.',
    },
    one_line_verdict: {
      type: 'string',
      description: 'One punchy sentence summarizing the result, in a playful game-show host tone.',
    },
  },
  required: ['score', 'recognizable', 'strengths', 'issues', 'one_line_verdict'],
  additionalProperties: false,
} as const

const SYSTEM_PROMPT = `You are the judge of a collaborative 3D modeling party game. Players had a few minutes to build a low-poly 3D model of a target object in a very simple mesh editor. You are shown several screenshots of their untextured gray model from different camera angles.

Score how well the model depicts the target object. Judge overall shape, proportions, and the presence and placement of the object's key identifying features. The editor has no colors, textures, or materials, so never penalize their absence, and never penalize low polygon counts — reward a clear silhouette and correct part placement instead.

Use the full 0-100 range:
- 0-20: unrecognizable; could be anything (an untouched starting cube belongs here)
- 21-45: vaguely suggests the object; major parts missing or badly misproportioned
- 46-70: recognizable, but with clear problems
- 71-90: clearly the object; good proportions, most key features present
- 91-100: impressively accurate for a timed low-poly build

Be fair but honest. Strengths and issues must be short, specific, and reference actual parts of the model ("the handle is missing", "legs are too thick relative to the seat") — not generic advice.`

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.round(n)))
}

function asStringArray(v: unknown, max = 4): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((s): s is string => typeof s === 'string').slice(0, max)
}

export async function scoreModel(prompt: string, imagesBase64: string[]): Promise<ScoreResult> {
  const content: Anthropic.ContentBlockParam[] = [
    ...imagesBase64.map(
      (data): Anthropic.ImageBlockParam => ({
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data },
      })
    ),
    {
      type: 'text',
      text: `Target object: "${prompt}". The ${imagesBase64.length} images show the players' model from spread-out angles (front, right, back, left, top, and a three-quarter view). Score the model against the target object.`,
    },
  ]

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    output_config: { format: { type: 'json_schema', schema: SCORE_SCHEMA } },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content }],
  })

  if (response.stop_reason === 'refusal') {
    throw new Error('model refused to score')
  }

  const text = response.content.find((b) => b.type === 'text')?.text
  if (!text) throw new Error('no text block in scoring response')

  const raw = JSON.parse(text) as Record<string, unknown>
  return {
    score: clamp(Number(raw.score ?? 0), 0, 100),
    recognizable: Boolean(raw.recognizable),
    strengths: asStringArray(raw.strengths),
    issues: asStringArray(raw.issues),
    one_line_verdict: typeof raw.one_line_verdict === 'string' ? raw.one_line_verdict : '',
  }
}
