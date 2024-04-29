# TemplateStaticCornerstone3DViewport
Refer to [Discord](https://discord.com/developers/docs/activities/building-an-activity) for setup

Create .env file where example.env is
```
VITE_DISCORD_CLIENT_ID=YOUR_OAUTH2_CLIENT_ID_HERE
DISCORD_CLIENT_SECRET=YOUR_OAUTH2_CLIENT_SECRET_HERE
```

Navigate to frontend
```
cd audience
npm install
```
## Local Development
Navigate to client and run with Vite and proxy. Open cloudflare link
```
npm run dev
cloudflared tunnel --url http://localhost:5173
```


Navigate to server and run 
```
cd server 
npm install
npm run dev
```


## Run in Discord
Navigate to [discord](https://discord.com/developers/applications) and URl Mapping

Use 
```
Prefix: /, Target: the proxy link(i.e. korean-troy-bars-canon.trycloudflare.com)
Prefix: /amazon, Target: s3.amazonaws.com
Prefix: /cornerstone, Target: unpkg.com
```
