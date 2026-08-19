# TemplateStaticCornerstone3DViewport (Audience)

Refer to [Discord](https://discord.com/developers/docs/activities/building-an-activity) for setup.

## Setup
Create `.env` file where `example.env` is:
```env
VITE_DISCORD_CLIENT_ID=YOUR_OAUTH2_CLIENT_ID_HERE
DISCORD_CLIENT_SECRET=YOUR_OAUTH2_CLIENT_SECRET_HERE
```

Install dependencies:
```bash
npm install
```

## Local Development
Run with Vite and proxy. Open cloudflare link:
```bash
npm run dev
cloudflared tunnel --url http://localhost:5173
```

## Deploy on Github
Be on the branch you want to deploy. 

```bash
npm run build
```

Delete remote and local page branches:
```bash
git push -d origin gh-pages 
git branch -D gh-pages    
```

Deploy the `dist` folder:
```bash
git add -f dist 
git commit -m "Initial dist subtree commit"  
git subtree push --prefix dist origin gh-pages
```

## Deploy on Cloudflare Pages (attheviewbox.dev)

Production deploys are **automatic**: push to the `prod` branch and GitHub Actions (`.github/workflows/deploy.yml`) builds with `BUILD_ENV=production` and deploys to Cloudflare Pages.

```bash
git checkout prod
# ... commit your changes ...
git push origin prod
```

Watch the run under [Actions](https://github.com/AtTheViewbox/audience/actions). The Cloudflare Pages production branch must be **`prod`**.

### Manual deploy (optional)

If you need to deploy without pushing:

```bash
npx wrangler login   # once, if not already authenticated
npm run build:production && npx wrangler pages deploy dist --project-name=attheviewbox --branch=prod --commit-dirty=true
```

- **`--commit-dirty=true`** silences the warning when you have uncommitted git changes.
- Attach **attheviewbox.dev** under **Workers & Pages → attheviewbox → Custom domains** in the Cloudflare dashboard; if DNS is on Cloudflare, add a **CNAME** for `@` → `attheviewbox.pages.dev` (proxied) if it is not created automatically.

## Run in Discord
Navigate to server and run:
```bash
cd server 
npm install
npm run dev
```

Navigate to [discord](https://discord.com/developers/applications) and URL Mapping.

Use:
```
Prefix: /, Target: the proxy link (i.e. korean-troy-bars-canon.trycloudflare.com)
Prefix: /amazon, Target: s3.amazonaws.com
Prefix: /cornerstone, Target: unpkg.com
```

---

## Technical Details (React + TypeScript + Vite)

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh
