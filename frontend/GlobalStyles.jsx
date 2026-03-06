import { useEffect } from "react";

export default function GlobalStyles() {

  useEffect(() => {

    const font = document.createElement("link");
    font.rel = "stylesheet";
    font.href =
      "https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:wght@300;400;500&family=Space+Mono:wght@400;700&display=swap";

    document.head.appendChild(font);

  }, []);

  return null;
}