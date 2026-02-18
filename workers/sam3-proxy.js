/**
 * Cloudflare Worker - SAM 3 API Proxy
 * Proxies requests to Hugging Face Inference API to avoid CORS issues
 */

export default {
    async fetch(request, env) {
        // Only allow POST requests
        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }

        // CORS headers for browser requests
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*', // Change to your domain in production
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        };

        // Handle preflight requests
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        try {
            // Get request body
            const body = await request.json();
            const { modelId, inputs } = body;

            // Validate input
            if (!modelId || !inputs) {
                return new Response(
                    JSON.stringify({ error: 'Missing modelId or inputs' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            // Call Hugging Face API
            const hfResponse = await fetch(`https://api-inference.huggingface.co/models/${modelId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${env.HUGGINGFACE_API_TOKEN}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(inputs),
            });

            // Get response
            const result = await hfResponse.json();

            // Return response with CORS headers
            return new Response(JSON.stringify(result), {
                status: hfResponse.status,
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json',
                },
            });
        } catch (error) {
            return new Response(
                JSON.stringify({ error: error.message }),
                {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                }
            );
        }
    },
};
