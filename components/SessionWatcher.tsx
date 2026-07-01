"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const SESSION_COOKIE_NAME = "water-billing-session";

function hasSessionCookie() {
  if (typeof document === "undefined") return true;

  return document.cookie
    .split(";")
    .map((item) => item.trim())
    .some((item) => item.startsWith(`${SESSION_COOKIE_NAME}=`));
}

function isPublicPage(pathname: string) {
  return pathname === "/login";
}

export default function SessionWatcher() {
  const pathname = usePathname();

  useEffect(() => {
    if (isPublicPage(pathname)) return;

    function checkSession() {
      const hasSession = hasSessionCookie();

      if (!hasSession) {
        window.location.href = `/login?next=${encodeURIComponent(pathname)}`;
      }
    }

    checkSession();

    const timer = window.setInterval(() => {
      checkSession();
    }, 5000);

    return () => {
      window.clearInterval(timer);
    };
  }, [pathname]);

  return null;
}