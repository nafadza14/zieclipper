import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages, model, temperature, max_tokens } = body;

    const apiKey = process.env.SUMOPOD_API_KEY || 'sk-LH238LuYeE77a-8IVxxQdg';

    const response = await fetch('https://ai.sumopod.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        messages: messages || [{ role: 'user', content: 'Say hello in a creative way' }],
        max_tokens: max_tokens || 150,
        temperature: temperature || 0.7
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch from Sumopod API', details: data },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error in Otak AI API:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
