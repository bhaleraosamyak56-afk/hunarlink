#!/usr/bin/env python3
"""Check the three a11y invariants that are cheap to regress.

  - exactly one h1 per route
  - a distinct document.title per route
  - no visible field without an accessible name

Start the preview first (npm run serve), then run this.
"""
import os
from playwright.sync_api import sync_playwright

B = os.environ.get("HUNARLINK_BASE", "http://127.0.0.1:8123").rstrip("/") + "/hunarlink"
ROUTES=["/","/product?id=hl-pash-001","/artisans","/auth","/wholesale","/seller","/admin","/profile","/orders","/login"]
with sync_playwright() as p:
    br=p.chromium.launch(); pg=br.new_page(viewport={"width":1440,"height":950})
    print(f"{'route':26s} {'h1':>3s} {'title':38s} {'unlabelled':>10s}")
    print("-"*84)
    for r in ROUTES:
        pg.goto(B+r, wait_until="networkidle"); pg.wait_for_timeout(700)
        if r=="/admin":
            # Check the unauthenticated sign-in screen first, then seed a
            # session to audit the existing authenticated console as well.
            pg.evaluate("()=>localStorage.removeItem('hunarlink_admin_token')")
            pg.reload(wait_until="networkidle"); pg.wait_for_timeout(700)
            login_visible=pg.locator('.admin-login-card').is_visible()
            login_h1=pg.locator('h1').count()
            login_labels=pg.locator('label[for=admin-login-identifier]').count()==1 and pg.locator('label[for=admin-login-password]').count()==1
            login_title=pg.title().startswith('Admin Login')
            print(f"admin login screen visible={login_visible} h1={login_h1} labelled_fields={login_labels} title={login_title}")
            pg.evaluate("()=>localStorage.setItem('hunarlink_admin_token',JSON.stringify('d'))")
            pg.reload(wait_until="networkidle"); pg.wait_for_timeout(900)
        if r=="/seller":
            pg.evaluate("()=>localStorage.setItem('hunarlink_auth_user',JSON.stringify({name:'A',role:'artisan',isLoggedIn:true}))"); pg.reload(wait_until="networkidle"); pg.wait_for_timeout(700)
        h1=pg.evaluate("document.querySelectorAll('h1').length")
        title=pg.title()
        unl=pg.evaluate("""()=>[...document.querySelectorAll('input,select,textarea')]
            .filter(i=>i.type!=='hidden')
            .filter(i=>!i.labels?.length && !i.getAttribute('aria-label') && !i.getAttribute('aria-labelledby'))
            .filter(i=>!i.closest('#hunarsathi-window, .hs-window')).length""")
        print(f"{r:26s} {h1:3d} {title[:36]:38s} {unl:10d}")

    # ---- artisan showcase directory link ----------------------------------
    pg.goto(B + "/", wait_until="networkidle")
    pg.wait_for_timeout(900)
    pg.locator("#show-more-artisans").scroll_into_view_if_needed()
    pg.click("#show-more-artisans")
    pg.wait_for_timeout(700)
    artisan_count = pg.locator(".artisan-directory-card").count()
    directory_title = pg.locator("#artisan-directory-title").inner_text()
    print(f"artisan directory route={pg.url.endswith('/artisans')} title={directory_title!r} listed={artisan_count}")

    # ---- the single login entry point -------------------------------------
    # One LOGIN button replaces the old user / artisan-login / studio trio, and
    # it must offer both roles and route each to the page that owns the job.
    # Clear the artisan session seeded above so the signed-out header shortcut
    # is tested in the state shown on the sign-in page.
    pg.goto(B + "/", wait_until="networkidle")
    pg.evaluate("()=>{localStorage.removeItem('hunarlink_auth_user');localStorage.removeItem('hunarlink_buyer_profile')}")
    pg.reload(wait_until="networkidle")
    pg.wait_for_timeout(900)
    legacy = pg.evaluate(
        "()=>['#user-login-btn','#seller-login-btn','#artisan-studio-btn']"
        ".filter(s=>document.querySelector(s))")
    has_login = pg.evaluate("()=>!!document.querySelector('#login-btn')")
    pg.click("#login-btn")
    pg.wait_for_timeout(500)
    # LOGIN now goes straight to /login, which offers the two roles as an
    # always-visible choice above the sign-in / register tabs. Check them there
    # rather than in the retired #login-choice-modal.
    pg.goto(B + "/login", wait_until="networkidle")
    pg.wait_for_timeout(900)
    roles = pg.evaluate(
        "()=>[...document.querySelectorAll('.seg-btn')]"
        ".map(e=>e.id.replace('role-',''))")
    admin_link = pg.locator('.login-admin-link')
    admin_shortcut = admin_link.is_visible() and admin_link.inner_text().strip() == 'Admin Login' and admin_link.get_attribute('href').endswith('/admin')
    print()
    print(f"login entry    single button={has_login} legacy controls left={legacy or 'none'} roles={roles} admin shortcut={admin_shortcut}")
    br.close()
