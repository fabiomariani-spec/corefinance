import { NextResponse, type NextRequest } from "next/server";

function proxy(request: NextRequest) {
  return NextResponse.next({ request });
}

export { proxy };
export default proxy;

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
