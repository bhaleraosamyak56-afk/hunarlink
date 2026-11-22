import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/* ==========================================================================
   ScrollToTop
   --------------------------------------------------------------------------
   What was wrong
   --------------
   React Router does not touch the scroll position when the route changes. That
   is correct for a plain document, but this storefront is a single page that
   decides its own height, so the browser kept the old offset and then clamped
   it to the new page's maximum. Concretely: clicking a product from 2,587 px
   down the marketplace grid landed on the product page at scrollTop 1,502 —
   the very bottom, which is exactly what a user reported seeing.

   The fix is not "scroll to top on every click". Three cases have to be told
   apart, and getting them wrong trades one annoyance for another:

   1. A new page (push)                  reset to the top.
   2. Back / forward (pop)               leave it alone — the browser restores
                                         the position the user left, and
                                         overriding that breaks the back button.
   3. Switching product on the same page  reset, because the content above the
                                         fold is completely different even
                                         though the pathname is identical.

   What deliberately does NOT reset
   --------------------------------
   Changing a filter, sort, tab or the ?mode=/?role= query on /login or
   /wholesale. Those are in-page edits, not navigations: resetting would yank
   the viewport out from under someone half way down a form. That is why this
   compares the product id rather than any change to the query string.

   The scroll is instant, not smooth
   ---------------------------------
   base.css sets `scroll-behavior: smooth` on <html>, which would animate this
   and make every navigation look like it jumped. The behaviour is overridden
   for exactly the duration of the scroll call and restored immediately, so
   smooth scrolling everywhere else is unaffected.
   ========================================================================== */

/* Scroll without animation, whatever the stylesheet asks for. */
function jumpTo(top, left = 0) {
  const html = document.documentElement;
  const previous = html.style.scrollBehavior;
  html.style.scrollBehavior = 'auto';
  window.scrollTo(left, top);
  /* Read the value before restoring so the browser commits the instant
     position rather than the animation it was asked for a moment earlier. */
  void html.offsetHeight;
  html.style.scrollBehavior = previous;
}

/* Move focus to a hash target without letting the browser scroll again (which
   would fight the position jumpTo() just set). */
function focusTarget(el) {
  if (!el || typeof el.focus !== 'function') return;
  const hadTabIndex = el.hasAttribute('tabindex');
  if (!hadTabIndex) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
  /* Leave the DOM as we found it — an injected tabindex is a real change to
     the document and would otherwise show up in later snapshots. */
  if (!hadTabIndex) {
    el.addEventListener(
      'blur',
      () => {
        el.removeAttribute('tabindex');
      },
      { once: true }
    );
  }
}

export default function ScrollToTop() {
  const { pathname, search, hash, key } = useLocation();
  const navigationType = useNavigationType();

  /* React Router reports the very first render as POP, because the initial
     history entry is a pop in the History API's terms. Treating that as
     "back/forward" made this component skip its work on page load, which
     silently broke deep links to a section (?/#marketplace-section) while
     in-app navigation worked — a maddening half-bug. Only a POP *after* the
     first run is a real back/forward. */
  const isFirstRun = useRef(true);

  /* The product page is the one screen whose identity lives in the query
     string rather than the path. Pulled out so product A -> product B resets
     while a filter or tab change does not. */
  const productId = new URLSearchParams(search).get('id');

  useEffect(() => {
    const firstRun = isFirstRun.current;
    isFirstRun.current = false;

    /* Back and forward: the browser has its own idea of where the user was,
       and it is a better one than "the top". Not on the first run — see the
       note on isFirstRun above. */
    if (!firstRun && navigationType === 'POP') return;

    /* A hash means the destination is a section on this page, so honour it.
       If the target has not rendered yet (lazy sections mount shortly after
       navigation) fall back to the top rather than scrolling nowhere. */
    if (hash) {
      const id = hash.replace(/^#/, '');
      const scrollToHash = () => {
        const target = document.getElementById(id);
        if (!target) return false;
        jumpTo(target.getBoundingClientRect().top + window.scrollY);
        /* A hash change alone does not move keyboard focus in every browser,
           so a skip link would scroll without actually skipping anything for a
           screen-reader user. Focusing the target completes the jump. */
        focusTarget(target);
        return true;
      };

      if (scrollToHash()) return;

      /* The section may not have mounted yet: most of the storefront below the
         hero is a lazy chunk, and a chunk has to be fetched before it renders.
         Poll for up to two seconds rather than assuming one retry is enough —
         a single 400 ms retry was measured failing on a cold load, which
         silently turned a deep link into a scroll to the top. */
      let attempts = 0;
      let timer = null;
      let cancelled = false;

      /* Stop chasing the target the moment the user takes over. Without this a
         late chunk could yank the viewport away from someone who started
         reading further up the page. */
      const onUserScroll = () => {
        cancelled = true;
      };
      window.addEventListener('wheel', onUserScroll, { passive: true, once: true });
      window.addEventListener('touchstart', onUserScroll, { passive: true, once: true });

      const poll = () => {
        if (cancelled) return;
        if (scrollToHash()) return;
        attempts += 1;
        /* Up to ~4 s: on a cold load the storefront's below-the-fold chunks
           have to be fetched before the section exists, and a 2 s window was
           measured losing that race. */
        if (attempts >= 20) {
          jumpTo(0);
          return;
        }
        timer = setTimeout(poll, 200);
      };
      const raf = requestAnimationFrame(poll);
      return () => {
        cancelAnimationFrame(raf);
        if (timer) clearTimeout(timer);
        window.removeEventListener('wheel', onUserScroll);
        window.removeEventListener('touchstart', onUserScroll);
      };
    }

    jumpTo(0);
    /* `key` changes on every navigation, so this covers pathname changes and
       product-id changes in one dependency. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, pathname, productId, hash, navigationType]);

  return null;
}
