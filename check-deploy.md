# Diagnosing "incognito shows new, normal browser shows old"

That exact split means the **server has the new content**, but your browser
is still running the **old service worker**. Incognito has no worker, so it
fetches from the network and looks correct.

The usual cause is that `service-worker.js` itself was never replaced on the
host. If the file on the server is byte-identical to the one your browser
already has, the browser sees no update and keeps serving the old cache
indefinitely.

## Step 1 — check what the server is actually serving (5 seconds)

Open this URL directly in your browser (add `?x=1` to dodge any caching):

    https://engineeringhubcalc.com/service-worker.js?x=1

**Look at the top of the file.**

- If you see `const BUILD_ID = '...'` and a comment block mentioning
  NETWORK-FIRST → the fix IS deployed. Go to Step 3.
- If you see `const CACHE_NAME = 'enghub-shell-v2';` near the top →
  **the old worker is still on the server.** That is the problem. Re-upload
  `service-worker.js`. This is the single most likely cause.

## Step 2 — confirm .htaccess uploaded

`.htaccess` starts with a dot, so many FTP clients hide it and skip it.
In Hostinger's File Manager, enable "show hidden files" and confirm it sits
next to `index.html`. Then check the header is being applied:

    curl -I https://engineeringhubcalc.com/service-worker.js

You want to see `Cache-Control: no-cache, no-store, must-revalidate`.

## Step 3 — if the fix IS deployed but your browser is still stuck

Your browser is holding an old registration. Clear it once:

**Chrome / Edge**
1. F12 → Application tab
2. Service Workers → click **Unregister**
3. Storage → **Clear site data**
4. Reload

**Firefox**: `about:debugging#/runtime/this-firefox` → Service Workers →
Unregister.

**Android Chrome**: Settings → Site settings → engineeringhubcalc.com →
Clear & reset.

You only ever need to do this once. Every future deploy updates on a normal
reload, because the new worker is network-first.

## Step 4 — verify it worked

In DevTools → Application → Cache Storage you should see a cache named
`enghub-<timestamp>`. If you still see `enghub-shell-v2`, the old worker is
still active and Step 1 or Step 3 has not taken effect.

## Going forward

Every deploy:

    node stamp-build.mjs        # new BUILD_ID -> new cache name
    git add . && git commit -m "..." && git push origin main

Then upload to Hostinger, **including `service-worker.js` and `.htaccess`**.
Skipping `service-worker.js` re-creates exactly this problem.
