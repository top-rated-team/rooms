# ChatGPT Ads conversion tracking — source brief

Everything below is taken from the official OpenAI Ads developer documentation
(`https://developers.openai.com/ads/`), read in full via the single-file export
`llms-full.txt` on 2026-09-05. Identifiers, endpoints, field names and code are
reproduced exactly as published. Where this brief adds an opinion — mostly in
section 6 — it is labelled as ours, not as documentation.

Two changelog dates matter for how new this all is: conversion setup and
reporting endpoints shipped **3 June 2026**, conversion-optimised bidding
(`bidding_type: "conversions"`) shipped **16 June 2026**, and the
`events[].user.obref` field shipped **16 July 2026**. Anything written about
ChatGPT Ads measurement before mid-2026 is out of date.

---

## 1. The install path, end to end

### 1.1 Where the Pixel ID comes from

Two routes, and they produce the same thing.

**Ads Manager (most advertisers).** Create a new Pixel ID in the conversions tab
of Ads Manager (`https://ads.openai.com`). The conversions tab also issues the
Conversions API key.

**Ads API (approved partners, or advertisers with the account enabled).**

```bash
curl -X POST "https://api.ads.openai.com/v1/conversions/pixels" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme website",
    "client_type": "web"
  }'
```

Response:

```json
{
  "id": "clidsrc_123",
  "client_type": "web",
  "name": "Acme website",
  "pixel_id": "134534..."
}
```

Two identifiers, two different jobs, and confusing them is the most common
setup error:

- `id` (`clidsrc_…`) is the **conversion source ID**. It goes in `source_ids`
  when you create an event setting.
- `pixel_id` is the **Pixel ID**. It goes in `oaiq("init", { pixelId })`, in the
  Conversions API `?pid=` query parameter, and in the image tag's `pid=`.

Web pixels created through this endpoint automatically use automatic advanced
matching. `name` must be 3–1,000 characters; `client_type` must be `web`.

If `POST /conversions/pixels` or `POST /conversions/api_keys` returns `404` with
`Not found`, pixel management is not enabled for that ad account and the
documented remedy is to contact your OpenAI partner representative. There is no
code fix for this.

### 1.2 The base pixel snippet

Add this to the `<head>` of every page where you want to capture conversions,
near the top, "to ensure early conversions aren't lost while other content
loads".

```html
<script>
  (function (w, d, s, u) {
    if (w.oaiq) return;
    var q = function () {
      q.q.push(arguments);
    };
    q.q = [];
    w.oaiq = q;
    var js = d.createElement(s);
    js.async = true;
    js.src = u;
    var f = d.getElementsByTagName(s)[0];
    f.parentNode.insertBefore(js, f);
  })(window, document, "script", "https://bzrcdn.openai.com/sdk/oaiq.min.js");

  oaiq("init", {
    pixelId: "<YOUR-PIXEL-ID>",
  });
</script>
```

The global is `oaiq`. The SDK is served from `https://bzrcdn.openai.com/sdk/oaiq.min.js`.
Events are sent to `https://bzr.openai.com`.

### 1.3 The `init` call

| Field | Required | Notes |
| --- | --- | --- |
| `pixelId` | Yes | The `pixel_id` from Ads Manager or pixel creation. |
| `debug` | No | Logs SDK activity to the browser console while you test. |
| `user` | No | Request-scoped hashed user data (see 1.6). |

`init` may be called again later — for example after login, once you have the
user's hashed email. When a page initialises only one pixel you can omit
`pixelId` on those later calls. When a page initialises more than one pixel you
must always include the intended `pixelId`.

### 1.4 The `measure` call

```js
oaiq("measure", "order_created", {
  type: "contents",
  amount: 2599,
  currency: "USD",
});
```

Up to four arguments, in this order:

| Argument | Required | What to send |
| --- | --- | --- |
| Command | Yes | The command `"measure"`. |
| Event name | Yes | A supported event name, such as `order_created`, or `"custom"`. |
| Event data | Yes | An object whose `type` matches the event's data shape. |
| Options | Depends | Optional for standard events. Required for custom events, to pass `custom_event_name`. |

Options object:

| Field | When to use it |
| --- | --- |
| `event_id` | A unique ID identifying the same event sent from browser and server. |
| `custom_event_name` | Required for custom events; not supported for standard ones. |
| `opt_out` | `true` opts the event out of future user-level personalisation. Defaults to `false`. |

Amounts are **integers in the currency's ISO 4217 minor unit** — `2599` is
$25.99, `12999` is $129.99. If you send `amount` you must send `currency`.

### 1.5 Consent

Consent is set **before** `init`, and the pixel defaults to `true`:

```js
oaiq("consent", false);
oaiq("init", {
  pixelId: "<YOUR-PIXEL-ID>",
});

// Call this after the user grants measurement consent.
oaiq("consent", true);
```

"The Pixel initializes consent to `true` by default unless you set it to `false`
or the Pixel finds a stored denial. When consent is `false`, the Pixel doesn't
send measurement-event pings. Setting it to `true` allows future measurement
events; **blocked events aren't replayed**." That last clause is the whole
consent design problem in one sentence: an event blocked at fire time is gone.

### 1.6 User data (browser side)

The `user` object goes in `init`, not in individual `measure` calls, because it
is request-scoped. Browser field names are **singular**: `email_sha256`,
`phone_number_sha256`, `external_id_sha256`, `first_name_sha256`,
`last_name_sha256`, plus raw `country`, `city`, `region`, `postal_code`.

Normalisation before hashing, verbatim from the docs:

- Email: trim whitespace, lowercase.
- Phone: keep the country calling code; remove whitespace, parentheses, periods
  and hyphens; remove a leading `+` and any leading zeroes; hash the resulting
  8–15 digits. `+1 (415) 555-2671` → `14155552671`.
- External ID: trim whitespace, preserve case and everything else.
- First/last name: lowercase, remove whitespace and ASCII punctuation, preserve
  non-ASCII. `O'Connor` → `oconnor`, `José` → `josé`.

Encode UTF-8, SHA-256, send as a lowercase 64-character hex string. Never send
raw values.

**Automatic advanced matching** does this for you: the pixel detects supported
customer information on the page, normalises and hashes it with SHA-256 in the
browser, and includes it with events. Raw customer information is not sent.
No implementation changes are required.

### 1.7 Content Security Policy

| Directive | Source | Purpose |
| --- | --- | --- |
| `script-src` | `https://bzrcdn.openai.com` | Load the Measurement Pixel SDK. |
| `connect-src` | `https://bzr.openai.com` | Send events with `fetch` or `sendBeacon`. |
| `connect-src` | `https://bzrcdn.openai.com` | Fetch per-pixel configuration. |
| `img-src` | `https://bzr.openai.com` | Send events with the image request fallback. |

Use a nonce or your existing hash mechanism. The docs are explicit: "Don't add
`'unsafe-inline'` solely for the Measurement Pixel." If the policy defines
`script-src-elem`, add the CDN source and the nonce there too.

### 1.8 What the SDK does for you

- Captures `oppref` from the landing page URL (a privacy-preserving identifier).
- Stores `oppref` in a first-party `__oppref` cookie so later page views reuse it.
- Adds the current page origin as `source_url`.
- Timestamps each event and batches closely grouped `measure` calls.
- Runs automatic advanced matching where enabled.

### 1.9 Defining the conversion

Installing the pixel measures nothing on its own until a conversion is defined.

```bash
curl -X POST "https://api.ads.openai.com/v1/conversions/event_settings" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Purchases",
    "event_type": "order_created",
    "attribution_window_days": 30,
    "source_ids": ["clidsrc_123"]
  }'
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | string | Yes | Display name for the conversion. |
| `event_type` | string | Yes | A supported event, or `custom`. |
| `custom_event_name` | string | Depends | Required when `event_type` is `custom`. |
| `attribution_window_days` | integer | Yes | Use `30`. |
| `source_ids` | string[] | Yes | Exactly one conversion source ID returned by pixel creation. |

Returns `{"id": "ces_123", …, "version": 1}`. `ces_123` is what a
conversion-optimised campaign points at. A `Client data source not found`
response means `source_ids` references a source that does not exist in this ad
account. `attribution_window_days` has one documented value: `30`.

---

## 2. Supported conversion events

Thirteen event names. Every event data object must carry a `type` matching the
event's data shape.

| Event name | Data type | Use for | Pixel | Conversions API |
| --- | --- | --- | --- | --- |
| `app_installed` | `customer_action` | A user installs an app. | No | Yes, `action_source: "mobile_app"` |
| `app_opened` | `customer_action` | A user opens an app. | No | Yes, `action_source: "mobile_app"` |
| `appointment_scheduled` | `customer_action` | A user books a meeting, demo, or consultation. | Yes | Yes |
| `checkout_started` | `contents` | A user starts checkout. | Yes | Yes |
| `contents_viewed` | `contents` | A user views a product, listing, article, or other content unit. | Yes | Yes |
| `custom` | `custom` | A user-defined event not covered by the standard taxonomy. | Yes | Yes |
| `items_added` | `contents` | A user adds one or more items to a cart, bundle, or selection. | Yes | Yes |
| `lead_created` | `customer_action` | A user submits a lead form or requests contact. | Yes | Yes |
| `order_created` | `contents` | A purchase is completed. | Yes | Yes |
| `page_viewed` | `contents` | A user lands on or views an important page. | Yes | Yes |
| `registration_completed` | `customer_action` | A user finishes an account or event registration flow. | Yes | Yes |
| `subscription_created` | `plan_enrollment` | A paid subscription starts. | Yes | Yes |
| `trial_started` | `plan_enrollment` | A free trial starts. | Yes | Yes |

`page_viewed` is for page loads. `contents_viewed` is for viewing a specific
product or content item, "including interactions that happen after the page has
loaded".

### Data shapes

**`contents`**

| Field | Required | Type | Notes |
| --- | --- | --- | --- |
| `type` | Yes | string | Must be `contents`. |
| `amount` | No | integer | Event-level value in the currency's minor unit. |
| `currency` | Depends | string | Required when `amount` is present. |
| `contents` | No | array of `Content` | Items associated with the event. |

**`customer_action`** — `type` (must be `customer_action`), optional `amount`,
`currency` when `amount` is present. **No `contents` array.**

**`plan_enrollment`** — `type` (must be `plan_enrollment`), optional `plan_id`,
`amount`, `currency` when `amount` is present, optional `contents`.

**`custom`** — `type` (must be `custom`), optional `plan_id`, `amount`,
`currency` when `amount` is present, optional `contents`. Via the Conversions
API only, a `custom` data object also accepts arbitrary `<custom_field>` keys
whose values may be strings, numbers, booleans, objects, arrays or `null`.

**`Content`** (items inside `contents[]`) — only these fields are accepted, and
unknown fields are rejected:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Your internal item identifier. |
| `group_id` | string | **Conversions API only.** Product group or parent item identifier. |
| `name` | string | Human-readable item name. |
| `content_type` | string | Non-empty category such as `product`, `plan`, or `page`. |
| `quantity` | integer | Integers, not strings. |
| `amount` | integer | Item-level value in the currency's minor unit. |
| `currency` | string | Or rely on event-level `currency`. |
| `variant_dict` | object | **Conversions API only.** String keys and values, e.g. `{"size": "medium", "color": "blue"}`. |

### Custom events

```js
oaiq(
  "measure",
  "custom",
  { type: "custom" },
  { custom_event_name: "quote_requested" }
);
```

Three separate values do three separate jobs: `"custom"` in the second position
identifies it as a custom event, `{ type: "custom" }` selects the data shape,
and `custom_event_name` names it. Names must be 1–64 characters, letters,
numbers, underscores or dashes only, start and end with a letter or number, and
must not match a standard event name. Lowercase by convention.

**Custom events cannot be used as conversion-optimisation goals.** See section 5.

### Canonical browser examples

```js
oaiq("measure", "items_added", {
  type: "contents",
  amount: 2599,
  currency: "USD",
  contents: [
    {
      id: "sku_123",
      name: "Starter bundle",
      content_type: "product",
      quantity: 1,
      amount: 2599,
      currency: "USD",
    },
  ],
});

oaiq("measure", "lead_created", {
  type: "customer_action",
});

oaiq("measure", "subscription_created", {
  type: "plan_enrollment",
  plan_id: "pro_monthly",
  amount: 2000,
  currency: "USD",
});
```

---

## 3. Pixel vs Conversions API

### What each covers

| | Measurement Pixel | Conversions API |
| --- | --- | --- |
| Runs in | The browser | Your server only |
| Endpoint | `https://bzrcdn.openai.com/sdk/oaiq.min.js` → `https://bzr.openai.com` | `POST https://bzr.openai.com/v1/events?pid=<PIXEL-ID>` |
| Auth | Pixel ID only (public) | `Authorization: Bearer <API-KEY>` (secret) |
| Captures `oppref` | Yes, automatically, and stores `__oppref` | No — you must capture and pass it |
| App events | Not supported | `app_installed`, `app_opened` with `action_source: "mobile_app"` |
| Batching | Automatic, closely grouped calls | Up to 1,000 events per request |
| Reliability | Subject to blockers, JS failures, consent | The documented preference |

The docs state it plainly: "The Conversions API is a more reliable tracking
source than the pixel alone. Use the Conversions API when possible for more
accurate insights."

### The Conversions API request

```bash
curl -X POST "https://bzr.openai.com/v1/events?pid=<PIXEL-ID>" \
  -H "Authorization: Bearer <API-KEY>" \
  -H "Content-Type: application/json" \
  --data '{
    "validate_only": false,
    "events": []
  }'
```

| Value | Required | Description |
| --- | --- | --- |
| `pid` | Yes | Your Pixel ID (query parameter). |
| `validate_only` | No | Validates events without saving them when `true`. |
| `integration_source` | No | Stable identifier for the integration sending the batch. |
| `events` | Yes | The events to send. |

Batches accept up to 1,000 events, and **if one event in the batch fails, the
full batch fails**.

### Event fields

| Field | Required | Notes |
| --- | --- | --- |
| `id` | Yes | Non-empty string identifying the event. Reuse the same ID when retrying or when sending the same conversion through another integration. |
| `type` | Yes | One of the supported event names. |
| `timestamp_ms` | Yes | Integer Unix ms. **Within the last 7 days and no more than 10 minutes in the future.** |
| `custom_event_name` | Depends | Required when `type` is `custom`. 1–64 letters, digits, underscores or hyphens; starts and ends with a letter or digit; cannot match a standard event name; lowercased by the API. |
| `oppref` | No | Opaque OpenAI-provided attribution identifier. Pass the original string unmodified. |
| `source_url` | Depends | Required for web events when `action_source` is `web`. Needs scheme and host. |
| `action_source` | Depends | `web`, `mobile_app`, `offline`, `physical_store`, `phone_call`, `email`, `other`. Must be `mobile_app` for `app_installed` / `app_opened`. |
| `user` | No | Event-scoped matching fields — inside each event, not at the request root. |
| `opt_out` | No | `true` opts the event out of future user-level personalisation. |
| `data` | Yes | Object whose `type` matches the event's data shape. |

Server-side `user` fields are **plural lists**, unlike the browser's singular
fields: `emails_sha256`, `phone_numbers_sha256`, `external_ids_sha256`,
`first_names_sha256`, `last_names_sha256`, `cities`, `regions`,
`postal_codes`, `countries`, plus `android_advertising_id`, `obref`,
`ip_address`, `user_agent`. For each list the API uses the first three valid,
unique values in order and ignores the rest without rejecting the event.
`android_advertising_id` is Android GAID only — IDFA is not supported.

### `oppref` and `obref` are different things

This trips people up and is worth stating precisely:

- `oppref` is an **event-level** field. The pixel captures it from the landing
  page URL and stores it in a first-party `__oppref` cookie. "Unlike the pixel,
  the API does not capture `oppref` for you."
- `obref` is a **user-level** field, at `events[].user.obref`. It is the "opaque
  browser reference from the Pixel's `__obref` cookie. Pass it without hashing."

For a hybrid setup, the documented pattern is: read the `__obref` first-party
cookie in the browser, send it to your server, and include it unchanged as
`events[].user.obref`. Follow your consent requirements before collecting or
forwarding the cookie, and stop sending it if consent is revoked.

### The rule about not calling the server API from page code

Stated twice, in two places, in two ways.

Conversions API, first line under "Send events": **"Send events to the
Conversions API from your server only."**

Measurement Pixel, troubleshooting: **"Always use the pixel on the browser. Do
not call the server conversions API directly from page code."**

The reason is the API key. Conversion Setup carries the caution: "Store the
returned key in a server-side secret manager. Never place it in browser code,
client-visible environment variables, logs, or source control." A Conversions
API key in front-end code is a leaked credential that anyone can use to write
conversions into your ad account — which corrupts both your reporting and your
bidding.

### When you need both

You need both when part of the conversion happens where the browser is not:
payment confirmed by a webhook after redirect, a refund, a CRM stage change, a
deal closed on the phone, an app install. You also want both when browser
delivery is unreliable — blockers, ITP, JS errors — and you want the server copy
as the durable record. Running both is the normal production shape, which is
exactly why deduplication is not optional.

---

## 4. Deduplication, multiple pixels, and the image tag

### 4.1 Deduplication

One conversion, two senders, one count. Reuse the same string as the pixel's
`event_id` and the Conversions API event's `id`, on the same Pixel ID.

```js
oaiq(
  "measure",
  "order_created",
  {
    type: "contents",
    amount: 2599,
    currency: "USD",
  },
  {
    event_id: "order_12345",
  }
);
```

```json
{
  "id": "order_12345",
  "type": "order_created",
  "timestamp_ms": 1773892800000,
  "source_url": "https://shop.example.com/checkout/confirmation",
  "action_source": "web",
  "data": { "type": "contents", "amount": 2599, "currency": "USD" }
}
```

The match key is **Pixel ID + event name + `id`/`event_id`**. For custom events,
`custom_event_name` replaces the standard event name in that match, so both
sides must also agree on `custom_event_name`. "OpenAI uses the first event it
receives for a matching key and ignores later duplicates."

Two consequences worth designing around:

- First writer wins. If the browser fires a thin event and the server later
  sends the rich one with `amount`, `contents` and hashed user data, the rich
  one is the one discarded. Decide deliberately which side is authoritative.
- The ID must be generated somewhere both sides can see it. An order ID works
  for e-commerce; a random ID generated in the browser does not, unless you
  persist it and hand it to the server.

`id` is also the retry key: "Reuse the same ID when retrying or sending the same
conversion through another integration."

### 4.2 Multiple pixel IDs

Applies when one website measures conversions for more than one advertiser,
brand, or integration partner. Load the SDK once, initialise each Pixel ID.

```js
oaiq("init", { pixelId: "<PIXEL-ID-A>" });
oaiq("init", { pixelId: "<PIXEL-ID-B>" });
```

`measure` sends to **every Pixel ID initialised at the time of the call**. "A
pixel you initialize later doesn't receive earlier events" — an ordering bug
that looks like missing data.

`measureSingle` targets one:

```js
oaiq("measureSingle", "<PIXEL-ID-A>", "order_created", {
  type: "contents",
  amount: 2599,
  currency: "USD",
});
```

Signature: `oaiq("measureSingle", pixelId, eventName, eventData, eventOptions)`.
Initialise the target pixel first — the SDK does not fall back to another pixel
for an unknown Pixel ID. With more than one pixel on a page, always include the
intended `pixelId` when calling `init` again to update user data.

### 4.3 The no-JavaScript image tag

For sending a website conversion when a page loads without running JavaScript.
One image request, one event.

```html
<img
  src="https://bzr.openai.com/v1/sdk/events
?pid=<PIXEL-ID>
&event=page_viewed
&data[type]=contents"
  width="1"
  height="1"
  style="display:none"
  alt=""
/>
```

As a fallback for the JavaScript pixel, wrap it in `<noscript>` in the body so
it loads only when JavaScript is unavailable. "Don't use `<noscript>` for a
standalone image-tag integration that should run when the browser runs
JavaScript."

Parameters: `pid` (required), `event` (required), `custom_event_name` (required
when `event=custom`), `event_id`, `oppref`, `data[type]` (required),
`data[<field>]`. Unknown fields are rejected. Each parameter at most once.
Amounts and quantities are integers. Dynamic values must be URL-encoded; for
`data[contents]`, serialise the array as JSON then URL-encode the whole value.

Test it:

```bash
curl --get --silent --show-error \
  --header "Referer: https://shop.example.com/pricing" \
  --data-urlencode "pid=<PIXEL-ID>" \
  --data-urlencode "event=page_viewed" \
  --data-urlencode "event_id=evt_image_tag_test_01" \
  --data-urlencode "data[type]=contents" \
  --output /dev/null \
  --write-out "%{http_code} %{content_type}\n" \
  "https://bzr.openai.com/v1/sdk/events"
```

An accepted request returns `200 image/gif`. Note the caveat: "A `200` response
confirms that OpenAI published the event to its ingestion pipeline. It doesn't
confirm completion of downstream event processing."

Documented limitations:

- Page-load only. It cannot measure clicks, form submissions, or later interactions.
- One event per request; no batching.
- GET URL-length limits; use the pixel or the API for large `contents` arrays.
- **No `user` object**, so no advanced matching.
- "Don't put personal data, secrets, session IDs, customer identifiers, or order
  identifiers in any query parameter." Which means the deduplication ID in an
  image tag must be an opaque value like
  `evt_01JX8M6K4Q7F9A2B3C5D6E7F8G`, not `order_12345` — and your server must
  then use that same opaque value as the Conversions API `id`.
- It does not capture `oppref` automatically; pass it only if your page-rendering
  system already has the value.
- Render the tag only after collecting any consent required for measurement.
  There is no `oaiq("consent", …)` equivalent — consent for an image tag is
  server-side or template-side rendering logic.

### 4.4 Which one, when

| Situation | Use |
| --- | --- |
| Anything triggered after page load (clicks, form submits) | Measurement Pixel |
| The event can be sent from your server | Conversions API |
| A page load on a page that cannot run JavaScript | Image tag |
| One site, several advertisers or partners | Multiple pixels + `measureSingle` |
| The same conversion from two sources | Both, with a shared `event_id` / `id` |

---

## 5. Conversion-optimised campaigns

`bidding_type: "conversions"` — conversion-optimised cost-per-click, oCPC. In
open beta for both standard and product-feed campaigns.

| Goal | Best for | How you pay | What delivery optimises for |
| --- | --- | --- | --- |
| `impressions` (CPM) | Reach and awareness | Per 1,000 impressions | Broad delivery at scale |
| `clicks` (CPC) | Engagement and traffic | Per valid click | Clicks from people likely to engage |
| `conversions` (oCPC) | A tracked action after a click | Per valid click, not per conversion | Clicks more likely to lead to your selected conversion event |

### How events feed bidding

"oCPC uses your selected conversion event together with ad quality, relevance,
click likelihood, and conversion likelihood to favor clicks that are more likely
to lead to that event. The CPA bid controls how the campaign competes for those
outcomes."

Billing does not change: OpenAI charges only for valid clicks and the auction
determines the actual CPC. "Treat the CPA bid as an optimization input, not as a
conversion charge."

```bash
curl -X POST "https://api.ads.openai.com/v1/campaigns" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme purchases",
    "status": "paused",
    "budget": {
      "lifetime_spend_limit_micros": 250000000
    },
    "bidding_type": "conversions",
    "conversion_event_setting_ids": ["ces_123"]
  }'
```

Child ad groups use `billing_event_type: "click"`, and `max_bid_micros` is the
**CPA bid** even though billing is per click — `100000000` is a $100.00 CPA bid
in a USD account.

```bash
curl -X POST "https://api.ads.openai.com/v1/ad_groups" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "campaign_id": "cmpn_101",
    "name": "US English",
    "status": "active",
    "bidding_config": {
      "billing_event_type": "click",
      "max_bid_micros": 100000000
    }
  }'
```

### Prerequisites

- The ad account supports conversion bidding. Campaign creation returning `403`
  with `Conversion bidding is not enabled` means contact your partner rep.
- Conversion tracking is set up via the pixel, the Conversions API, or both.
- **Exactly one active standard conversion event setting** as the optimisation
  goal. Custom events cannot be oCPC goals.
- The event setting belongs to the current ad account and connects to one active
  conversion source.

### What breaks when the event definition is wrong

This is the part that makes the human work non-optional, and it is documented,
not editorialised:

- **You cannot change the selected conversion event after campaign creation.**
  "No. You cannot change the campaign goal or selected conversion event after
  creation. Create a new campaign to optimize toward a different event."
- **You cannot convert an existing CPM or CPC campaign to oCPC.** New campaign only.
- Custom events are not eligible goals, so a business whose real money event does
  not map onto a standard event name must choose the closest standard event
  deliberately rather than inventing one.
- "Keep conversion tracking healthy. Incomplete or incorrectly configured
  tracking can make reporting and optimization less effective."
- "Use a conversion event with enough volume to evaluate performance." Optimising
  on a low-volume event is a documented performance improvement item, not a
  detail.

Practical translation: an event definition mistake is not a config edit, it is a
campaign rebuild plus the learning period you have already paid for.

### Reporting the outcome

`POST /conversions/insights` returns `conversions`,
`click_through_conversions` and `view_through_conversions`. "`conversions` is
always equal to `click_through_conversions`; view-through conversions are a
separate, supplemental metric and are not added to that total." View-through
uses a fixed one-day window after an eligible impression, is reporting-only, and
"CPA, post-click CVR, bidding, billing, and conversion optimization remain
click-through-based." When a conversion is eligible for both, the click takes
precedence.

Rate limits on the Advertiser API: 600 requests per minute per endpoint, 1,200
overall, enforced by both ad account and IP address.

---

## 6. What still needs a human

The landing page is built on this section. The rule for writing it: no
overclaiming in either direction. Where a step is largely automatable, say so.

**Genuinely automatable today.** Creating the pixel, the Conversions API key and
the event setting is three API calls. Generating the snippet, the normalisation
and hashing code, the batching loop and the retry logic is code generation — an
agent does that well. Reading the docs and answering "which event, which data
shape, which field name" is retrieval, which is what the agent on this site is
for. None of that is where engagements go wrong.

Below is where they go wrong. One sentence each on why an API or an agent cannot
finish it alone.

**1. Deciding what counts as a conversion.**
There is no endpoint for a business decision, and this one is close to
irreversible: the optimisation event cannot be changed after campaign creation,
custom events are not eligible goals, and picking `lead_created` when the money
is in `appointment_scheduled` teaches the auction to buy the wrong clicks with
real budget.

**2. Touching a live template or tag manager.**
The snippet must sit near the top of `<head>` on every measured page of a real
codebase or a real GTM container — which means someone with deploy access, a
staging pass, a CSP change reviewed by whoever owns security, and a rollback
plan; an agent with no credentials and no view of your release process cannot
take that risk on your behalf, and should not want to.

**3. Building and deploying a server endpoint.**
The Conversions API is server-only, so someone has to stand up a real endpoint
in your stack that holds the key in a secret manager, fires on the right
webhook, respects the 7-days-past / 10-minutes-future `timestamp_ms` window, and
handles the "one bad event fails the whole batch of 1,000" case — that is
shipping software into production, not calling an API.

**4. Event ID strategy across two systems.**
Deduplication keys on Pixel ID + event name + `event_id`/`id`, and the first
event received wins, so the browser and the server must agree in advance on one
string generated in a place both can reach — a design decision about your data
flow that has to be made before either side is written, and gets made wrong by
default when two people implement the two halves separately.

**5. Consent gating.**
`oaiq("consent", false)` must run before `init`, blocked events are never
replayed, the image tag has no consent command at all so gating moves into
render logic, and `__obref` collection has to stop when consent is revoked —
which means someone must reconcile your actual consent tool's callback order
with the pixel's lifecycle, and get a legal sign-off no agent can give.

**6. CRM and offline conversion plumbing.**
The API supports `offline`, `phone_call`, `physical_store` and `email` as
`action_source` values, but nothing ships the data: someone has to define which
CRM stage is the conversion, extract it, normalise and SHA-256 the identifiers
correctly, backfill inside the 7-day timestamp window, and keep the job running
after handover.

**7. Verifying real events rather than preview-mode events.**
`GET /conversions/events` returns at most 50 pixel-SDK events from the last 15
minutes and only for enabled accounts, `validate_only: true` deliberately does
not save anything, and a `200 image/gif` "doesn't confirm completion of
downstream event processing" — so proving the setup works means firing real
conversions on the real site and reconciling them against Ads Manager over
days, which is patience and access, not a request.

**The honest summary for the page.** The documentation is good and public. The
API surface is small. What you are paying for is the decision at the top, the
hands on a live system in the middle, and the verification at the end. There is
no magic: just expertise, dedicated hours, and a systematic approach.

---

## 7. Landing copy kit

House voice: plain, specific, no hype, no emoji. Never claims the AI replaces
the human.

### Headlines (3 options)

1. ChatGPT Ads conversion tracking, installed and verified by people who do this every week.
2. Your ChatGPT Ads campaign is bidding on data nobody has sent it yet.
3. OpenAI publishes the snippet. Someone still has to put it in your checkout.

### Subheadlines (3 options)

1. The pixel, the Conversions API, deduplication and consent — set up on your real site, checked against real conversions, and documented before we hand it back. There is no magic: just expertise, dedicated hours, and a systematic approach.
2. Eight years in paid ads, $2M+ of ad spend managed, 5,872 hours delivered. We read the ChatGPT Ads docs so you can skip to the part where the numbers are right.
3. Ask our agent anything about the ChatGPT Ads documentation and get a cited answer now. When the answer turns into work on a live site, a human on our team takes it from there.

### Objections and answers (6)

**"The documentation is public and it's only a snippet. Why would I pay anyone?"**
Because the snippet is the easy hour. The hard parts are deciding which event is
your money event — a choice you cannot change after the campaign is created —
getting the tag into a live template without breaking checkout, standing up the
server endpoint the Conversions API requires, and proving that real conversions,
not test fires, are landing in Ads Manager. If your team already has those four
covered, you genuinely do not need us.

**"Can't your AI agent just do the whole thing?"**
No, and we would rather say so than sell you a demo. The agent is very good at
the documentation: which event names exist, which data shape each one takes, how
deduplication keys work, what belongs in your Content Security Policy. It cannot
deploy to your site, hold your API key, decide what a conversion is worth to
your business, or watch Ads Manager for three days to confirm the numbers are
real. That is what the humans are for.

**"We already run Tag Manager and we have a developer."**
Then this is probably a short engagement, and we will tell you that on the call.
The usual gap is not GTM skill — it is that the Conversions API cannot be called
from the browser at all, so the server half needs backend work and a secret
store, and that browser and server events must share one event ID agreed before
either half is written. We can do only that piece and leave the rest with your
developer.

**"We don't sell online. Deals close on the phone weeks later."**
Then the browser is the wrong place to measure and half the industry's advice
does not apply to you. ChatGPT Ads accepts server-side events with
`action_source` set to `offline` or `phone_call`, so the real work is connecting
your CRM: defining which stage counts, hashing the identifiers correctly, and
sending the event inside the platform's timestamp window. That is a build, and
it is the kind we do.

**"What access do you need, and what happens to our customers' data?"**
Site or tag manager access to install, and ad account access to define the
conversion and verify it. Personal data never leaves your systems in the clear —
emails, phone numbers, names and customer IDs are normalised and SHA-256 hashed
before they are sent, which the platform requires and we implement. We will
never ask you to paste an API key or a password into a chat window; access is
arranged through proper invite flows.

**"How long does it take, and how do I know it's finished?"**
A typical setup is days, not weeks, and most of the elapsed time is waiting for
real conversions to accumulate so we can check them rather than guess. Done
means: events firing on the real site, the server-side path live, browser and
server deduplicating to one conversion, consent behaving the way your policy
says it should, numbers reconciled in Ads Manager, and a written map of what
fires where — including a rollback note for whoever touches the site next.

### Starter questions for the agent widget (8)

1. How do I install the ChatGPT Ads pixel on Shopify without breaking checkout?
2. Which event should I optimise on if our sales cycle is 60 days and nothing is bought online?
3. What is the difference between oppref and obref, and do I need both?
4. Our purchases are being counted twice. How does deduplication actually work?
5. Can I send a conversion from HubSpot when a deal moves to closed-won?
6. What do I need to add to our Content Security Policy for the pixel?
7. We're in the EU. How do I gate the pixel behind consent without losing every conversion?
8. How do I confirm real events are arriving, not just getting a 200 back?

---

## 8. Citation map

Every page below was read for this brief. The RAG index ingests the `.md` twin;
citations shown to a visitor should use the human URL (the `.md` extension
dropped) and the page's own title, matching `Citation { title, url, snippet? }`
in `shared/schema.ts`.

| `title` | `url` | What it covers |
| --- | --- | --- |
| Ads — full documentation | `https://developers.openai.com/ads/llms-full.txt` | Single-file Markdown export of the entire Ads documentation set; the ingestion source for the knowledge base. |
| Ads | `https://developers.openai.com/ads/llms.txt` | Curated index of every Ads page and its `.md` twin; use it to enumerate the corpus. |
| Measurement Pixel | `https://developers.openai.com/ads/measurement-pixel` | Browser SDK: install snippet, `oaiq("init")`, `oaiq("measure")`, consent, CSP, user data, automatic advanced matching, deduplication, troubleshooting. |
| Supported Events | `https://developers.openai.com/ads/supported-events` | The thirteen event names, their data types, and the `contents` / `customer_action` / `plan_enrollment` / `custom` / `Content` field tables. |
| Conversions API | `https://developers.openai.com/ads/conversions-api` | Server-to-server events: `POST https://bzr.openai.com/v1/events?pid=…`, event structure, `user` object, app lifecycle events, deduplication. |
| Conversion Setup | `https://developers.openai.com/ads/api-reference/conversion-setup` | Creating pixels, Conversions API keys and event settings, plus `GET /conversions/events` for checking recent pixel events. |
| Multiple Pixel IDs | `https://developers.openai.com/ads/multiple-pixels` | Initialising more than one Pixel ID on a page, and `measureSingle` to target one. |
| Image Tag | `https://developers.openai.com/ads/image-tag` | The 1×1 no-JavaScript integration, its parameters, its test command, and its limitations. |
| Conversion-Optimized Campaigns | `https://developers.openai.com/ads/conversion-optimized-campaigns` | `bidding_type: "conversions"`, oCPC prerequisites, CPA bidding via `max_bid_micros`, and the immutability of the selected event. |
| Overview | `https://developers.openai.com/ads/api-overview` | Base URL, bearer authentication, resource list, rate limits, and the changelog that dates the conversion features. |
| API Partner Setup | `https://developers.openai.com/ads/api-partner-setup` | The partner sequence for configuring conversions on a client account, including `integration_source`. |
| Insights | `https://developers.openai.com/ads/api-reference/insights` | `POST /conversions/insights` and the `conversions` / `click_through_conversions` / `view_through_conversions` distinction. |

Two rules for the agent when citing:

- Cite only pages that were actually retrieved for the answer. A visitor
  checking a citation that does not contain the claim is worse than no citation.
- If the retrieved excerpts do not cover the question, say what is missing and
  offer a human. This platform shipped its conversion features in mid-2026, and
  half-remembered details are worse than an honest gap.
