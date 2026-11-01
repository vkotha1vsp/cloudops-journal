import { withAuth } from "next-auth/middleware";

export default withAuth({ pages: { signIn: "/login" } });

export const config = {
  // Pages require a session. API routes are excluded here because every handler enforces
  // authentication itself and must answer 401 JSON rather than redirect to an HTML login page.
  matcher: ["/((?!login|api/|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
