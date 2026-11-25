import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClerkBridge } from '../data/clerkConfig.js';

/* ==========================================================================
   SsoCallbackPage — completes Clerk OAuth redirects at /sso-callback
   --------------------------------------------------------------------------
   Does not import @clerk/react directly: delegates to ClerkBoundary's
   renderSsoCallback() when Clerk is active, or returns to /login cleanly
   when Clerk is disabled (e.g. static GitHub Pages builds).
   ========================================================================== */

export default function SsoCallbackPage() {
  const clerk = useClerkBridge();
  const navigate = useNavigate();

  useEffect(() => {
    if (!clerk.enabled) {
      navigate('/login', { replace: true });
    }
  }, [clerk.enabled, navigate]);

  return (
    <main
      id="main-content"
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '32px 20px',
        background: '#F7F5EE',
        color: '#12211B',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)'
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <p style={{ fontSize: '0.92rem', color: '#4B5B53', marginBottom: 12 }}>
          Completing sign-in with HunarLink&hellip;
        </p>
        {clerk.enabled && clerk.renderSsoCallback ? clerk.renderSsoCallback() : null}
        <div id="clerk-captcha" />
      </div>
    </main>
  );
}
