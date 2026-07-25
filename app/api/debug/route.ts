import { NextResponse } from 'next/server';
import os from 'os';
import path from 'path';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    version: '1.0.1',
    tmpDir: path.join(os.tmpdir(), 'zieclipper', 'jobs'),
    time: new Date().toISOString()
  });
}
