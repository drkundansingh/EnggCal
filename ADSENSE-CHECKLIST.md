# AdSense re-application checklist (engineeringhubcalc.com)

## What was wrong (found by auditing the site as a crawler sees it)

1. **Every page was an empty shell on GitHub Pages.** The pre-rendered snapshots were served by an
   Apache `.htaccess` rewrite, which GitHub Pages ignores. `/?page=anything` returned the same
   `index.html` with an empty content area, so a crawler that does not run JavaScript saw no content
   and no links.
2. **The AdSense loader was deliberately absent from the raw HTML.** AdSense's site connection and
   review read the page source; they could not find the snippet.
3. **No crawlable navigation.** The sidebar and related-calculator links were built by JavaScript and
   used `?page=` URLs, so there was nothing to follow.
4. **Thin supporting content.** About/Contact were short and there was no long-form original content.

## What v11 changes

- Every calculator now has a real static URL (`/boiler-blowdown/`) containing its full content, its
  own title/description/canonical, FAQ + breadcrumb JSON-LD and a plain-HTML copy of the navigation.
- The home page (`index.html`) contains the full dashboard content and all links in the raw HTML.
- `<meta name="google-adsense-account">` and the `adsbygoogle.js` loader are in the raw `<head>` of
  every page. The ad unit itself is still only created after the content exists, never on noindex
  utility screens.
- 6 original long-form guides, a Guides hub, a Terms of Use page, expanded About / Contact / Privacy.
- `sitemap.xml` (108 URLs), `robots.txt` (allows Mediapartners-Google), `CNAME`, `.nojekyll`.
- Old `?page=x` links keep working and are rewritten to the path form.

## Steps only you can do

1. Deploy: replace the repo contents with this version (all the new folders, `CNAME`, `.nojekyll`).
2. Check what a crawler gets (no JavaScript):
   `curl -s https://engineeringhubcalc.com/boiler-blowdown/ | grep -c "google-adsense-account"` should print 1,
   and the same page should contain the calculator text and `href="/feedwater-heater/"` links.
3. In AdSense > Sites, confirm engineeringhubcalc.com shows "Ready" and ads.txt shows "Authorized".
   Read the **exact** rejection reason in AdSense ("Fix issues") or the email; if it differs from the
   causes above, tell me and I will address it specifically.
4. AdSense > Privacy & messaging: turn on the **GDPR consent message** (Google-certified CMP) for
   EEA/UK/Switzerland. The privacy page already describes it; the message itself is configured in
   the AdSense console, not in code.
5. Google Search Console: add the property, submit `sitemap.xml`, and use URL Inspection on the home
   page and one calculator to confirm Google can render and index them. Wait until pages appear
   indexed before re-applying (often 1-3 weeks).
6. Do not click your own ads, do not use test ad IDs, and do not request review repeatedly.
