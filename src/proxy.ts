import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { CLOUD_PUBLIC_KEY, CLOUD_URL, isCloudMode, PUBLIC_PATHS } from "@/lib/cloud/config";

/**
 * Mode multi-utilisateur : rafraîchit la session Supabase (cookies) à chaque navigation et
 * redirige vers /connexion les visiteurs non connectés. Vérification « optimiste » : les
 * Server Actions revérifient toujours l'identité et le rôle. Sans Supabase configuré
 * (mode démonstration), le proxy laisse tout passer.
 */
export async function proxy(request: NextRequest) {
  if (!isCloudMode) return NextResponse.next();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(CLOUD_URL, CLOUD_PUBLIC_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.includes(path);
  const redirect = (to: string) => {
    const url = request.nextUrl.clone();
    url.pathname = to;
    url.search = to === "/connexion" && path !== "/" ? `?suite=${encodeURIComponent(path + request.nextUrl.search)}` : "";
    const res = NextResponse.redirect(url);
    for (const c of response.cookies.getAll()) res.cookies.set(c);
    return res;
  };
  if (!data.user && !isPublic) return redirect("/connexion");
  if (data.user && path === "/connexion") return redirect("/");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)"],
};
