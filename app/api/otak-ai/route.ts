import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ message: 'API is running. Please send a POST request with the required body.' });
}

export async function POST(req: Request) {
  try {
    let body: any = {};
    
    // Safely parse body
    try {
      const text = await req.text();
      if (text) {
        body = JSON.parse(text);
      }
    } catch (parseError) {
      console.warn("Failed to parse request body as JSON", parseError);
    }

    const { messages, model, temperature, max_tokens } = body;

    const apiKey = process.env.SUMOPOD_API_KEY || '';

    const requestPayload = {
      model: model || 'gpt-4o-mini',
      messages: messages || [{ role: 'user', content: 'Say hello in a creative way' }],
      max_tokens: max_tokens !== undefined ? Number(max_tokens) : 150,
      temperature: temperature !== undefined ? Number(temperature) : 0.7
    };

    console.log("Sending payload to Sumopod:", JSON.stringify(requestPayload));

    const response = await fetch('https://ai.sumopod.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestPayload)
    });

    const textData = await response.text();
    let data;
    try {
      data = JSON.parse(textData);
    } catch (e) {
      data = { rawText: textData };
    }

    if (!response.ok) {
      console.error('Sumopod API error:', data);
      return NextResponse.json(
        { error: 'Failed to fetch from Sumopod API', details: data, payloadSent: requestPayload },
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
