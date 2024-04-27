import {DiscordSDK,patchUrlMappings} from '@discord/embedded-app-sdk';

const discordSdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID);
patchUrlMappings([
    { prefix: '/supabase', target: 'vnepxfkzfswqwmyvbyug.supabase.co' },
    { prefix: '/cornerstone', target: 'unpkg.com' },
    { prefix: '/amazon', target: "s3.amazonaws.com" },
]);

export default discordSdk;