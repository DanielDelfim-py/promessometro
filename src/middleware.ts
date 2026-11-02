import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (lista) => {
          for (const { name, value } of lista) req.cookies.set(name, value);
          res = NextResponse.next({ request: req });
          for (const { name, value, options } of lista) res.cookies.set(name, value, options);
        },
      },
    },
  );
  const { data } = await supabase.auth.getUser();
  const caminho = req.nextUrl.pathname;
  if (!data.user && !caminho.startsWith('/editorial/login')) {
    return NextResponse.redirect(new URL('/editorial/login', req.url));
  }
  return res;
}

export const config = { matcher: ['/editorial/:path*'] };
