import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/** A new page opens at its top (the body scrolls, so the router doesn't reset it by itself) */
export default function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
  }, [pathname]);
  return null;
}
