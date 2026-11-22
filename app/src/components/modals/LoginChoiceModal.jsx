import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../state/StoreContext.jsx';
import Modal from '../Modal.jsx';
import { ArrowRight, ShieldCheck } from '../Icons.jsx';

/* ==========================================================================
   LoginChoiceModal — "who are you signing in as?"
   --------------------------------------------------------------------------
   The header used to carry three separate ways in: a named user button, an
   "Artisan Login" link and an "ARTISAN STUDIO" button. That is three controls
   for one intent, and the labels made the split worse — "Artisan Login" went
   to the collector login page, "ARTISAN STUDIO" went straight into the seller
   portal with no session at all.

   Now there is one LOGIN button. It opens this, and the answer routes to the
   page that already owns that job:

     collector -> /login   (pages/portal/LoginPage.jsx)
     artisan   -> /auth    (pages/AuthPage.jsx, login and register modes)

   Nothing downstream changes. The seller portal's own gates are untouched:
   /seller still refuses an artisan who has not signed in, and an artisan with
   no account still goes through /auth?mode=register first.
   ========================================================================== */

const ROLES = [
  {
    id: 'collector',
    to: '/login',
    icon: 'collector',
    title: 'Sign in as a Collector',
    body: 'Track orders, keep a wishlist, save addresses and follow the artisans you buy from.',
    cta: 'Collector sign in'
  },
  {
    id: 'artisan',
    to: '/auth',
    icon: 'artisan',
    title: 'Sign in as an Artisan',
    body: 'Manage your listings, respond to buyers and publish new crafts to the storefront.',
    cta: 'Artisan sign in'
  }
];

function RoleIcon({ kind }) {
  if (kind === 'artisan') {
    /* a loom / craft mark — the site already uses ✦ for the artisan side */
    return (
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" aria-hidden="true">
        <path d="M12 2.5 13.9 9l6.6 1.9-6.6 1.9L12 19.4l-1.9-6.6L3.5 10.9 10.1 9z"
              fill="currentColor" opacity="0.9" />
        <circle cx="19" cy="19" r="2.1" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" aria-hidden="true">
      <circle cx="12" cy="8.2" r="3.7" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4.6 20.2c0-3.6 3.3-5.8 7.4-5.8s7.4 2.2 7.4 5.8"
            stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export default function LoginChoiceModal() {
  const navigate = useNavigate();
  const { closeModal, user, setUser } = useStore();

  const go = (to) => {
    closeModal();
    navigate(to);
  };

  /* a signed-in visitor should not be asked to sign in again without a way out,
     so the current session gets an explicit escape at the bottom */
  const signedIn = user && user.isLoggedIn;
  const signedInRole = user?.role === 'artisan' ? 'an artisan' : 'a collector';

  return (
    <Modal id="login-choice-modal" title="Sign in to HunarLink" width="520px" onClose={closeModal}>
      <div className="modal-body login-choice-body">
        <p className="login-choice-lede">
          Choose how you want to continue. Your account decides what you see once you are in.
        </p>

        <div className="login-choice-grid">
          {ROLES.map((role) => (
            <button
              key={role.id}
              type="button"
              className="login-choice-card"
              id={`login-choice-${role.id}`}
              data-role={role.id}
              onClick={() => go(role.to)}
            >
              <span className="login-choice-icon" aria-hidden="true">
                <RoleIcon kind={role.icon} />
              </span>
              <span className="login-choice-title">{role.title}</span>
              <span className="login-choice-body-text">{role.body}</span>
              <span className="login-choice-cta">
                {role.cta}
                <ArrowRight size={14} />
              </span>
            </button>
          ))}
        </div>

        <p className="login-choice-foot">
          <ShieldCheck size={14} />
          <span>
            Every artefact carries a GI tag you can verify. Artisans are reviewed against
            the Valley Verification Flow before they can list.
          </span>
        </p>

        {signedIn && (
          <p className="login-choice-session">
            You are currently signed in as {signedInRole} &mdash; <strong>{user.name || user.fullName}</strong>.{' '}
            <button
              type="button"
              className="login-choice-signout"
              id="login-choice-signout"
              onClick={() => {
                /* the store has no dedicated sign-out action; clearing the
                   session is the same shape the portal gates test for */
                setUser({ ...(user || {}), isLoggedIn: false });
                closeModal();
              }}
            >
              Sign out
            </button>
          </p>
        )}
      </div>
    </Modal>
  );
}
