# Anonymous feedback backend (Cloudflare Pages + D1)

This project currently deploys as static Cloudflare Pages. This folder adds a Pages Function at `/api/feedback`, but **submissions will not work until Cloudflare D1 is configured**.

1. Create a D1 database named `gameaichecker-feedback` in Cloudflare Dashboard > Storage & databases > D1.
2. Open the existing Pages project > Settings > Bindings > Add D1 database binding, variable **DB**, choose the database. Apply to Production and Preview as needed.
3. In the D1 console, run the SQL in `schema.sql` (or use Wrangler). 
4. Under Pages Settings > Variables and Secrets, create a **secret** named `FEEDBACK_SECRET` with a strong random value (never commit the value).
5. Redeploy the Pages project after bindings are set.
6. Test GET `/api/feedback?game=steam:4598530`, then POST JSON `{"game":"steam:4598530","vote":"some_ai_suspected"}`.

The endpoint requires no account. It stores an HMAC of visitor IP to enforce one vote per game per network, and does not store raw IP. This may block multiple people on shared networks and cannot stop determined abuse. No evidence image upload is implemented yet; use a separately reviewed evidence pipeline. Vote counts are **subjective opinions, not verified AI-use percentages**.

For public launch, add Turnstile, moderation/reporting, and stronger abuse protections. Review privacy disclosure and retention policy. Anonymous voting is not perfectly anonymous to the hosting provider.
