import { useEffect } from 'react';

/* ==========================================================================
   ChatWidget
   --------------------------------------------------------------------------
   HunarSathi is a self-mounting vanilla widget: it injects its own launcher and
   window into <body> and talks to a Python backend. Rather than rewrite it, it
   is loaded exactly as before and re-mounted per route, because the legacy
   loader bails out when it finds an existing launcher.
   ========================================================================== */
export default function ChatWidget() {
  useEffect(() => {
    const cssId = 'hunarsathi-css';
    if (!document.getElementById(cssId)) {
      const link = document.createElement('link');
      link.id = cssId;
      link.rel = 'stylesheet';
      link.href = `${import.meta.env.BASE_URL}hunarsathi-chatbot/widget.css`;
      document.head.appendChild(link);
    }

    const scriptId = 'hunarsathi-js';
    if (document.getElementById(scriptId)) return;

    const s = document.createElement('script');
    s.id = scriptId;
    s.src = `${import.meta.env.BASE_URL}hunarsathi-chatbot/widget.js`;
    s.async = true;
    document.body.appendChild(s);
  }, []);

  return null;
}
