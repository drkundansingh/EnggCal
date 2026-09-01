# Deploy checklist

## Every deploy

```bash
node stamp-build.js        # stamps service-worker.js, app.js, version.json, reset.html
git add -A                  # -A catches .htaccess and other dotfiles
git commit -m "..."
git push origin main
```

`git add .` can miss dotfiles depending on your git version and where you
run it from. Use `git add -A` from the repo root.

## Before you push, confirm these are staged

```bash
git status --short | grep -E "service-worker\.js|\.htaccess|reset\.html|js/app\.js"
```

If `service-worker.js` is not in that list, the deploy will NOT fix a stale
browser — the browser sees an unchanged worker and keeps serving old files.
This is the single most common cause of "I pushed but nothing changed".

## After deploying, verify in 10 seconds

1. **Check the server has the new build** — open in any browser:

       https://engineeringhubcalc.com/version.json?x=1

   It should show the build number you just stamped. If it shows an older
   one (or 404s), the upload didn't land. Nothing else will work until it
   does.

2. **Check your own browser** — open the app and look at the bottom of the
   page. The footer shows `build <number>`. If it matches version.json you
   are on the current version.

## If a browser is still stuck

Open this once:

    https://engineeringhubcalc.com/reset.html

It unregisters the service worker and deletes every cache, then links you
back into the app. It works even in the worst case where an old
`service-worker.js` is still on the server, because the old worker has
never cached that URL and cannot intercept it.

Safe to run any time, and safe to send to users — it only clears cached
files, never saved calculations (those live in IndexedDB).

## Note on hosting

`.htaccess` only works on Apache hosts such as Hostinger. **On GitHub Pages
it does nothing** — GitHub sets its own cache headers. If you serve the site
from GitHub Pages, rely on the stamped build ID and `reset.html` instead;
both work regardless of host.
