# Railway deployment runbook

This runbook deploys the interview demo as three services in one Railway project:

- `https://restate-demo.zuchka.dev` — the Break My Agent application
- `https://restate.zuchka.dev` — the Restate admin UI
- `runtime` — a private controller that supervises the killable worker process

The `runtime` service keeps the controller and worker in one container on purpose. The controller remains alive when **Crash worker** sends `SIGKILL` to its worker child, starts a replacement child, and lets Restate deliver the same durable invocation again.

## What is already packaged

The repository contains three tested Dockerfiles:

| Railway service | Dockerfile | Public? | Persistent volume |
| --- | --- | --- | --- |
| `web` | `/deploy/Dockerfile.web` | Yes, port `3000` | None |
| `runtime` | `/deploy/Dockerfile.runtime` | No | `/data` |
| `restate` | `/deploy/Dockerfile.restate` | Yes, admin UI on port `9070` | `/restate-data` |

`Dockerfile.restate` pins Restate Server to `1.7.9`, matching the local project packages. The controller waits for both Restate and the supervised worker, then registers `runtime` with Restate through the Admin API. Railway service startup order therefore does not need to be coordinated manually.

## Before you begin

1. Commit the repository, including `deploy/`, and push it to a GitHub repository that Railway can access. This checkout currently has no Git remote, so add one if needed:

   ```bash
   git remote add origin git@github.com:<account>/<repository>.git
   git push -u origin <branch>
   ```

2. Have the value of `ANTHROPIC_API_KEY` ready. Add it only to the Railway `runtime` service. Do not paste `.env`, `.env.local`, or the key into GitHub, a build argument, or the `web` service.
3. Create one controller token locally and keep the value ready:

   ```bash
   openssl rand -hex 32
   ```

## 1. Create the Railway project

1. In Railway, choose **New Project** → **Empty Project**.
2. Name it `break-my-agent`.
3. Use one Railway environment and one region for all three services so private networking works between them.
4. Add each service from the same GitHub repository. Leave **Root Directory** empty because all three builds need the repository root as their Docker build context.

The service names in this runbook are significant. Name them exactly `restate`, `runtime`, and `web`, because the variable references use those names.

## 2. Add the `restate` service

1. On the project canvas, choose **Create** → **GitHub Repo**, select this repository, and name the service `restate`.
2. In **Variables**, add:

   ```text
   RAILWAY_DOCKERFILE_PATH=/deploy/Dockerfile.restate
   PORT=9070
   RESTATE_NODE_NAME=restate-1
   RESTATE_AUTO_PROVISION=true
   RESTATE_LISTEN_MODE=tcp
   RESTATE_BIND_IP=::
   RESTATE_ADVERTISED_ADDRESS=http://${{restate.RAILWAY_PRIVATE_DOMAIN}}:5122
   ```

3. Add a Railway volume and mount it at exactly:

   ```text
   /restate-data
   ```

4. Keep this service at one replica. A Railway volume belongs to one service instance, which is appropriate for this single-node interview demo.
5. In **Settings** → **Healthcheck**, set the path to `/health`. `PORT=9070` points Railway's health check at Restate's Admin API.
6. Deploy and wait for the service to become healthy.

The stable node name and persistent `/restate-data` volume must stay together. Restate restores a node by finding the directory whose name matches its node name.

## 3. Add the private `runtime` service

1. Add the same GitHub repository again and name this service `runtime`.
2. In **Variables**, use Railway's Raw Editor to add the following. Replace only the two placeholder secrets:

   ```text
   RAILWAY_DOCKERFILE_PATH=/deploy/Dockerfile.runtime
   PORT=3100
   CONTROLLER_PORT=3100
   CONTROLLER_HOST=::
   CONTROLLER_URL=http://127.0.0.1:3100
   CONTROLLER_INTERNAL_TOKEN=<paste-the-random-token>
   DEMO_DATABASE_PATH=/data/evidence.sqlite

   WORKER_PORT=9080
   WORKER_HOST=::
   WORKER_PUBLIC_URL=http://${{runtime.RAILWAY_PRIVATE_DOMAIN}}:9080

   RESTATE_INGRESS_URL=http://${{restate.RAILWAY_PRIVATE_DOMAIN}}:8080
   RESTATE_ADMIN_URL=http://${{restate.RAILWAY_PRIVATE_DOMAIN}}:9070
   RESTATE_UI_URL=https://restate.zuchka.dev/ui

   ANTHROPIC_API_KEY=<paste-the-real-key>
   ANTHROPIC_MODEL=claude-sonnet-5
   DEMO_TOOL_DELAY_MS=2200
   WORKER_RESTART_DELAY_MS=1800
   ```

3. Mark `ANTHROPIC_API_KEY` and `CONTROLLER_INTERNAL_TOKEN` as sealed variables in Railway.
4. Add a volume mounted at:

   ```text
   /data
   ```

5. Set the health-check path to `/health`.
6. Do not generate a public domain for `runtime`.
7. Deploy it. In the deployment logs, look for both:

   ```text
   Restate agent worker listening on :::9080
   Registered Restate worker deployment at http://runtime.railway.internal:9080
   ```

`runtime` exposes ports `3100` and `9080` only inside Railway's private network. The controller's `/health` response becomes ready only after Restate is reachable, the worker is online and registered, and the Anthropic key exists.

## 4. Add the `web` service

1. Add the same GitHub repository a third time and name the service `web`.
2. Add these variables:

   ```text
   RAILWAY_DOCKERFILE_PATH=/deploy/Dockerfile.web
   PORT=3000
   CONTROLLER_URL=http://${{runtime.RAILWAY_PRIVATE_DOMAIN}}:3100
   ```

3. Set the health-check path to `/`.
4. Do not add `ANTHROPIC_API_KEY` to this service. The browser talks to same-origin Next.js routes; the Next.js server calls `runtime` over Railway's private network.
5. Under **Settings** → **Networking**, generate a temporary Railway domain.
6. Open the temporary domain and confirm the header shows Restate, Worker, and Claude online before configuring custom DNS.

Railway private traffic uses plain `http` plus the service's actual listening port. TLS is applied only at the public Railway edge.

## 5. Attach the custom domains

### Application domain

1. In `web` → **Settings** → **Networking**, add the custom domain:

   ```text
   restate-demo.zuchka.dev
   ```

2. Set the target port to `3000` if Railway asks which port to route.
3. Railway will display a CNAME and may display an ownership TXT record. Create both records in Cloudflare exactly as Railway shows them.

### Restate UI domain

1. In `restate` → **Settings** → **Networking**, add:

   ```text
   restate.zuchka.dev
   ```

2. Set the target port to `9070`. This is essential: `9070` is the Restate Admin API and UI, while `8080` is service ingress.
3. Add Railway's displayed CNAME and TXT records in Cloudflare.

For the first setup, set both Cloudflare CNAME records to **DNS only** (gray cloud). Wait for Railway to verify ownership and issue both TLS certificates. Proxying can be enabled later if desired, but it adds another SSL and caching layer that the interview demo does not need.

After DNS is active, these should load:

```text
https://restate-demo.zuchka.dev
https://restate.zuchka.dev/ui
```

The app's **Open in Restate** action uses `RESTATE_UI_URL` and opens the selected invocation in the second tab. No public Restate ingress domain is needed.

## 6. Run the acceptance test

Perform this once through the custom application domain:

1. Confirm the runtime strip reports Restate, Worker, and Claude online.
2. Select a preset and start a run.
3. Click **Open in Restate** and verify the same invocation ID appears at `restate.zuchka.dev`.
4. Return to the application tab and click **Crash worker** while the run is active.
5. Confirm the non-Restate comparison turns red, the real worker PID changes, and the Restate execution continues under the original invocation ID.
6. Run separate demonstrations for injected `429`, injected `500`, latency, pause/resume, cancel, and regenerate.
7. Restart the Railway `runtime` service during an active run. The controller evidence database and Restate journal should survive, and the replacement runtime should register itself again.
8. Restart `restate` after a completed run and confirm its invocation history remains, proving the `/restate-data` volume is attached correctly.

A direct health check is also useful:

```bash
curl -fsS https://restate-demo.zuchka.dev/api/control/health
```

The JSON should contain `"ok":true` and an online worker.

## 7. Troubleshooting

### The `runtime` health check never becomes healthy

Read the runtime logs in this order:

- If the worker never says it is listening, verify `WORKER_HOST=::` and `WORKER_PORT=9080`.
- If registration repeats, verify the service names are exactly `runtime` and `restate`, and re-enter the Railway reference variables rather than hardcoding private domains.
- If Restate is offline, confirm `restate` is healthy and its volume is mounted at `/restate-data`.
- If only Anthropic is unavailable, verify `ANTHROPIC_API_KEY` exists on `runtime` and is not the placeholder value.

### The Restate UI domain returns the wrong service

Edit the custom domain and set its target port to `9070`. Do not route the browser domain to `8080` or `5122`.

### The custom domain remains unverified

Copy Railway's CNAME and TXT records exactly, remove conflicting A/AAAA/CNAME records for the same hostname, and keep Cloudflare proxying off until Railway finishes certificate issuance.

### Restate starts empty after a redeploy

Check that:

- `/restate-data` is a Railway volume rather than ephemeral container storage.
- `RESTATE_NODE_NAME` is still `restate-1`.
- The volume remained attached to the `restate` service.

### A build uses Railpack instead of the Dockerfile

Verify the service has the correct `RAILWAY_DOCKERFILE_PATH` variable. The three values must be `/deploy/Dockerfile.web`, `/deploy/Dockerfile.runtime`, and `/deploy/Dockerfile.restate` respectively.

## Cost and cleanup

This demo runs three always-on services and two small volumes. Pause or delete the Railway project after the interview to stop charges. If the project stays online, remove the public `restate.zuchka.dev` domain after the interview because it exposes the Restate Admin UI intentionally for presentation convenience.

## Why this layout is the lowest-lift option

- Railway builds everything from one repository with three tiny Dockerfiles.
- No Docker registry publishing step is required.
- No separate worker service, service-registration job, reverse proxy, or database service is required.
- Railway private DNS carries all controller, worker, ingress, and admin traffic.
- Volumes preserve the two pieces of evidence that matter: Restate's durable state and the controller's SQLite presentation data.
- The real process supervisor remains intact, so **Crash worker** is still a real child-process `SIGKILL` rather than a simulated failure.

## References

- [Railway Dockerfiles and custom Dockerfile paths](https://docs.railway.com/builds/dockerfiles)
- [Railway private domains and custom domains](https://docs.railway.com/networking/domains/working-with-domains)
- [Railway variables and cross-service references](https://docs.railway.com/variables/reference)
- [Railway volumes](https://docs.railway.com/volumes)
- [Restate Docker deployment](https://docs.restate.dev/server/deploy/docker)
- [Restate networking and default ports](https://docs.restate.dev/server/networking)
- [Restate deployment registration API](https://docs.restate.dev/admin-api/deployment/register-deployment)
