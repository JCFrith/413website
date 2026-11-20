# 413solution.com

Source for the 413 Solution LLC marketing site. Static HTML, CSS and JavaScript. No build step, no framework, no server-side code.

## Deployment

Hosted on Vercel. Pushing to `main` deploys automatically.

| | |
|---|---|
| Production branch | `main` |
| Vercel project | `413solution-www` |
| Build | none, files are served as-is |

Rolling back is done from the Vercel dashboard, which keeps every previous deployment.

## Layout

```
*.html          pages, served at /<name>.html
css/site.css    all styling
js/site.js      scroll reveal, nav toggle, stat counters
image/          only assets actually referenced by a page
vercel.json     legacy URL redirects and cache headers
sitemap.xml     must be updated when a page is added or removed
robots.txt
llms.txt        summary for AI crawlers
og-image.png    social preview card, referenced by every page's og:image
favicon.ico, favicon-32.png, apple-touch-icon.png   browser and home-screen icons
```

## Conventions

- URLs keep their `.html` extension. `cleanUrls` is off in `vercel.json` on purpose, because the sitemap and existing inbound links use the extension.
- Legacy URLs from the previous site are redirected in `vercel.json`, not in a `_redirects` file. The Cloudflare-format `_redirects` file the old host carried was never read by Apache and did nothing.
- Photographs and maps in `image/` are WebP. Give every `<img>` its real `width` and `height` so the page does not shift as it loads.
- `image/` holds only files a page actually links to. Unreferenced assets are deleted rather than left in place.
- The contact form posts through EmailJS from the browser. The key in `contact.html` is a publishable key and is public by design.

## Walkthrough test page

`walkthrough-test.html` is an unlisted, noindex test page for a scroll-driven 3D building walkthrough. It is not in the nav or the sitemap.

- `js/walkthrough.js` holds the scene, the camera keyframes and every animation, all driven by one scroll-progress number.
- `css/walkthrough.css` holds the sticky stage and the on-screen step readout.
- `js/vendor/three.module.min.js` is three.js r170 (MIT), vendored so the page has no third-party runtime dependency.

## Adding a page

1. Create `<name>.html`, copying the nav and footer from an existing page.
2. Add the link to the nav and the footer on every other page.
3. Add the URL to `sitemap.xml`.
4. Commit and push.

The nav fits nine items at the current container width. A tenth needs a layout change, not just another link.
