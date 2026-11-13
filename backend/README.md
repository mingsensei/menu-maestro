# Menu Maestro Backend

Node.js API with Supabase, Groq/Gemini and image processing.
Requires Node.js 22.12+.

## Local

Run `npm ci`, create your own `.env`, then `npm run dev`.
API: http://localhost:3001. Health: `/api/health`.

Required: `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
AI: `GROQ_API_KEY` and/or `GEMINI_API_KEY`.
Optional: `PORT` (3001), `FRONTEND_ORIGIN` (http://localhost:8080),
`SESSION_SECRET`, `GROQ_MODEL`, `GEMINI_MODEL`, `AI_DAILY_LIMIT`, `KNOWLEDGE_BASE_PATH`.
Environment files are excluded from Git.

## EC2 / Production

Run `npm ci` and `npm start` under a process manager. Set `NODE_ENV=production`,
a stable `SESSION_SECRET` of at least 32 characters, and `FRONTEND_ORIGIN`
to the frontend HTTPS origin. Serve the API through Nginx with HTTPS.
Only set `TRUST_PROXY=true` when the trusted proxy overwrites X-Forwarded-For.

Set `KNOWLEDGE_BASE_PATH` to a persistent writable file and seed it from
`knowledge/restaurant.md`. Back up this file. Chat context, rate counters
and maintenance jobs currently live in RAM; use a single backend instance.

Migrations are in `supabase/migrations`; apply them to the intended project.
The deployment directory contains a combined frontend/backend Nginx example;
adapt it for an API-only host.

## Checks

`npm test`, `npm run lint`.

## GitHub Actions

The CI workflow runs on every push, on pull requests targeting `main`, and
manually from the repository's Actions tab. It uses Node.js 24 and installs
locked dependencies with `npm ci`. No production secrets are required.

Checks: JavaScript syntax and the Node.js test suite. Tests use mocks and local
fixtures; they do not require production Supabase or AI credentials. After checks pass on `main`, the workflow deploys the API to EC2.
Database migrations are not run automatically.

## Automatic EC2 deployment

Pushes to `main` deploy after CI succeeds. Pull requests only run checks.
Manual runs on `main` also deploy. Runs on `main` are serialized so a newer
push does not interrupt an active deployment.

Checks run on GitHub-hosted Ubuntu runners. Only the deploy job runs on the
repository's EC2 runner (`rtr-ec2-backend`, label `rtr-production`), as user
`ubuntu`. The runner is installed as a systemd service under
`/home/ubuntu/actions-runner-backend`. It connects outbound to GitHub over
HTTPS; deployment does not require inbound SSH from GitHub or SSH secrets.
Production application secrets stay on EC2. Do not move pull request jobs onto
the production runner.

If deployment stays queued, check the runner under repository Settings →
Actions → Runners and inspect the `actions.runner.*` systemd service on EC2.

`deployment/deploy.sh` fetches and checks out the exact checked commit in
`/home/ubuntu/apps/backend`, installs production dependencies under Node.js 24,
restarts PM2 process `rtr-backend`, and checks `/api/health`. A failed deploy
attempts to restore the previous commit, dependencies and process. Local
changes to tracked server files stop deployment. `.env` and persistent files
under `/home/ubuntu/app-data` are preserved. Code runs from a detached commit;
use `git log -1` to inspect the deployed revision.

## Chat context

Each opaque conversation ID holds a bounded compact memory (summary up to 700
characters and up to 12 keywords), plus up to 20 guest-question excerpts of
240 characters each, alongside the menu retrieval state. Question excerpts
provide anchors when the model summary omits an older subject. The
existing intent extraction updates it without another AI request. Intent
classification and menu/restaurant replies receive this context even after
older turns fall outside the browser's recent-history window. Memory keywords
are separate from dish-search keywords. Current guest corrections take priority;
restaurant/menu facts still come from current knowledge and catalog data.

Memory is server-side and is not returned in API responses. It requires the
conversation ID and a matching preceding turn; missing/mismatched IDs start a
fresh chat. It expires after 30 minutes of inactivity, is bounded to 500 chats,
and is lost when the backend restarts. Starting a new chat in the widget drops
the ID. Reloading the page also starts a new chat; cross-visit memory is not
stored. Guest-requested context clearing also removes previous menu references.

## Chat language detection

Free-text chat detects the language of the latest guest message during the
existing intent request. Supported codes match the UI selector: `en`, `vi`,
`ko`, `ja`, `cn`, `ru`, `kz`, `es`, `fr`, `it`. The detected language is used
for the current answer and returned as `language` in the chat response. The
widget updates the shared language context, including the selector and page
copy. A manual selection made during an in-flight request takes precedence.
Unsupported or ambiguous input retains the current language. No extra AI
request is added, and changing language does not reset the conversation.

## Menu-grounded recommendations

RTR AI represents the Italian restaurant and retrieves current menu dishes for
food questions before answering. Optional taste/cooking-style clarification
never suppresses dish cards. Broad ingredient requests are actionable as-is.
Ambiguous group budgets can still receive a clarification alongside individual
menu prices; the assistant must not claim a complete meal fits that total.

If a catalog search has no exact keyword match, alternatives may be offered
with an explicit notice in the response language. Only desired search keywords
are relaxed; price, diet, avoided ingredients, mildness and category constraints
still apply. Previous-item detail questions are not replaced with unrelated
alternatives. If no eligible dishes exist, an empty result is returned honestly.
Menu cards remain available if answer generation fails after intent extraction.

## Recommendation order and descriptions

Eligible dishes in categories whose name/display name contains Special or
Specials are ranked and selected before other categories, including multiple
matching dishes from that category. Dietary, ingredient and price constraints
are applied first. The assistant receives each selected dish's actual category
and Special status, and explains ingredient/flavour combinations in short,
natural paragraphs using only supplied recipe information. Special status is
never inferred from a dish's name or assigned to an unrelated category.

## Beverage identity and alcohol filters

Intent extraction separates `drinkType` (juice, mocktail, cocktail, beer, wine,
coffee, tea, soft_drink, spirit or any) from desired fruit/ingredient keywords,
and `alcohol` (none, alcoholic or any). Retrieval checks these against actual
categories and recipe ingredients before selecting cards. Juice ingredients in
a cocktail or tea-based mocktail do not make that drink a fruit juice. Listed
liquor overrides a non-alcoholic category, and unknown alcohol status is not
accepted for alcohol-free requests.

Short alcohol-free follow-ups preserve the previous beverage type, desired
fruits, price, dietary and avoided-ingredient constraints, and re-query the
catalog even if the model misclassifies the short message. Beverage and alcohol
constraints are part of retrieval cache keys and narrowing rules. Desired
keywords are conjunctive. Drink searches do not broaden missing fruit keywords
to unrelated alternatives. Four cards is a maximum, never a target: only the
actual eligible results are shown, including just one or two drinks.

Flavour generation also receives recipe-specific ingredient characteristics and
terminology guidance; it must not invent heat, crispness, melon varieties or
cooking methods. If generation is unavailable, the response shows actual recipe
descriptions alongside the eligible cards. A precisely recognized alcohol-free
follow-up to an existing resolved drink request can still be safely retrieved
when intent extraction is unavailable, without guessing new free-text requests.

During answer-generation rate limits, deterministic tasting summaries derived
from listed ingredients supplement recipe descriptions in all supported languages.
They do not infer heat, crispness or unspecified fruit varieties.

## Explicit beverage-category requests

Explicit category requests such as “cocktail nào ngon nhất” constrain the
server-side search even if the intent model returns generic drinks or stale
previous references. Simple unqualified requests can still use category-bound
fallback retrieval during AI outages; requests with unresolved ingredient,
price or dietary qualifiers still require intent extraction. Only verified session dietary restrictions carry into a fresh category request;
request-scoped restrictions and old spoken budgets do not. Alcohol-free cocktails map to
mocktails. “Best” category requests show at most a lead option and one alternative,
with recipe-based explanations and no invented popularity or objective ranking.


## Evidence-based menu queries and price policy

Intent extraction supplies a typed `searchTerms` array with guest quotes and a
`queryMode` (`new_search`, `refine`, `detail`). The server verifies those quotes
against guest messages, separates subjects, ingredients, dietary constraints and
preferences, and compiles one canonical query before retrieval. Broad subjects
search the catalog, rather than only the last displayed cards. A partial family
name such as steak cannot silently resolve to the previously displayed Steak
Salad. Only grounded product-detail references restrict retrieval to prior cards.
Invalid required evidence produces an unavailable response, not a false claim
that the restaurant has no matching dishes. Zero matches are checked against the
full catalog before that conclusion; inherited beverage subtypes can be broadened
with an explicit alternatives notice while mandatory constraints remain intact.

Natural-language price caps require a matching numeric amount in a quoted guest
message; taste words and model guesses cannot create one. The UI budget remains
binding while selected. A verified spoken cap survives genuine refinements but
is not carried into a fresh subject; a cleared UI cap is not resurrected from
context. Dietary restrictions require evidence too: ordinary meal choices reset
on a new subject, while explicitly stated session restrictions remain in effect.

Eligible Special dishes rank first. Relevant dishes otherwise prefer higher
VAT-inclusive prices, without category quotas. An explicit cheap preference
reverses price order without inventing a numeric cap. Popularity is used only
when requested. Four cards is a maximum, never a quota.

Chat responses include `appliedFilters` for visible budget/diet/mildness/avoidance/
alcohol chips and a `requestId`. Invalid-query, verified-empty and inherited-type
fallback diagnostics contain filter metadata and rejection counts, not guest
messages or chat history.

## AI availability and rate limits

A menu conversation normally uses one intent request and one recommendation
request per turn. Provider token-per-minute quotas count across guests, so a
healthy EC2 process can still receive provider HTTP 429 errors. In `GROQ_MODEL=auto`,
the API discovers available models once and uses GPT-OSS 20B, then GPT-OSS 120B,
then Llama 3.3 70B if advertised as active; Gemini remains the final provider.
An explicitly pinned `GROQ_MODEL` stays pinned and does not rotate Groq models.

Provider/model cooldowns honor `Retry-After`, Gemini retry details, and daily
request reset headers. Successive requests skip cooling-down models. Recovery
allows at most two delayed retries, no more than 12 seconds of total waiting,
and a shared 25-second deadline per logical AI call. Malformed output may fail
over within that call but does not disable the model for unrelated questions.
GPT-OSS uses strict schema output and low reasoning effort to reduce malformed
JSON and completion-budget waste. Other models keep compatible JSON mode.
Intent responses must also pass schema and guest-quote validation before being
accepted, so a role label such as `source: guest` cannot cause an immediate
chat failure without trying the next available provider/model.

The request keeps full guest messages, server memory and selected menu IDs,
while limiting repeated assistant prose to 320 characters per message and
removing duplicate classification instructions. Dish eligibility, pricing,
Special ranking and recommendation instructions remain the same.

Structured `ai.provider_result` logs contain model, status, token usage, elapsed
time and cooldown information. `chat.ai_failure` identifies intent versus reply
failures. Neither includes API keys, provider error bodies, prompts or guest
messages. If every configured model/provider has exhausted its quota, some
requests can still be unavailable; these changes do not increase account limits.


## Ordered alternative dish groups

The canonical query separates OR subjects (`dish_type` / `dish_name`) from AND
ingredient requirements. Category names are grounded against the current catalog
and category translations such as mì Ý resolve to Pasta. A category search uses
category IDs, so a Mains recipe mentioning a pasta side cannot stand in for a
Pasta-category dish. Model terms mislabelled as ingredients or product names are
normalized when they identify an actual category. Quoted categories also override
accidental expansion into a previously displayed product.

Multiple requested groups receive coverage and are presented in the order the
guest mentions them: pasta then pizza produces pasta cards before pizza cards.
Special and price ranking apply within each requested group. The four-card maximum
remains, without padding unavailable results. A corrected current subject replaces
old subjects, so mì Ý after pasta/pizza searches Pasta alone. Ingredient, dietary,
alcohol and explicit-budget requirements remain mandatory across all groups;
cache keys and narrowing account for subjects independently of ingredient terms.

The approved restaurant contact is litalianoriverside@gmail.com, with owner
Mr. Darin. The default knowledge document and public website include these facts.
Deployment applies `deployment/update-restaurant-contact.mjs` once to the active
persistent knowledge file (respecting `KNOWLEDGE_BASE_PATH`), preserving unrelated
sections. A marker prevents subsequent deployments from undoing later admin edits.


## Shared in-memory menu snapshot

The API preloads the full active catalog when its HTTP server starts. Public menu
reads and AI retrieval share one process-local snapshot containing dish IDs,
names, localized descriptions, prices, VAT, badges, category metadata and image
URL strings. The loader explicitly selects these columns; no image files, image
bytes or arbitrary extra columns are cached or sent to the model. Recommendation
cards retain their image URLs. Only matching selected dish text is sent to AI.

Warm chat requests do not re-query menu tables or popularity statistics. The old
15-second request TTL has been removed. A background timer refreshes the snapshot
every five minutes, independently of requests; this also picks up edits made
directly in Supabase. Successful admin item/category/VAT changes immediately
invalidate and preload a fresh snapshot. Maintenance jobs invalidate on completion
or failure. Concurrent reads/refreshes share one pending load, and a write racing
with a refresh prevents the old snapshot from being published.

Background refresh failures retain the last usable snapshot. A known admin edit
clears the old snapshot, so subsequent requests wait for fresh data rather than
serve a price or item known to be out of date. Restarting the process reloads the
snapshot from Supabase; no Redis or persistent image cache is required. The timer
is unreferenced and stopped when the HTTP server closes. Existing retrieval-query
and per-conversation caches continue to operate on the catalog version.
