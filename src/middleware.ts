import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // Auth middleware disabled for now — re-enable when NEXT_PUBLIC_SUPABASE_URL is configured
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon|manifest|api/sync|api/cron).*)'],
};
