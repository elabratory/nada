# Business model: how Virtual Mall could make money

> Starting assumption: **shopping centres will not pay just because something is "virtual".** Many centres have already paid for 3D tours, apps and kiosks that few shoppers used. Every revenue line below depends on one question: *does this measurably bring more people through the doors, or more sales to tenants?* If the product can't show that, nobody pays.

## 1. Who gets value, and what the product must prove

| Customer | Their problem | What Virtual Mall must prove |
| --- | --- | --- |
| **Shoppers** (free users) | "Is it in stock? Where is it? Is it worth the trip? Where do I park? Where are the toilets?" | It answers these faster than Google Maps plus a retailer website plus the centre's site. Otherwise they won't come back, and there is no audience to sell. |
| **Shopping-centre owners / marketing teams** | Falling foot traffic, competition from online, tenants asking what the centre does for them, weak digital data about visitors | **Incremental visits.** "Plan-a-visit" sessions that turn into real visits, measured through parking redemptions, offer redemptions and Wi-Fi/app matches. Also tenant-retention stories and data they can't get elsewhere. |
| **Retail tenants and brands** | Getting found, launching products, clearing stock, attracting local shoppers | **Store visits and sales per dollar spent**, measured with redeemable offers, click-and-collect, "reserve in store" and click-outs to their site. |
| **Food outlets** | Getting chosen once people arrive | Orders and pre-orders from the food-court view |

**The minimum value to reach before charging anyone:**

1. Shoppers actually use it: repeat visits and search-to-directions conversion.
2. It shows real, current data: stock, prices, hours. Stale data kills trust quickly.
3. It can attribute outcomes: redemptions, click-outs and reservations tied to a session.
4. It's cheap for centres to set up: floor plan, tenant list and hours in, virtual centre out, in days rather than months.

## 2. Revenue streams

### 2.1 Shopping-centre subscriptions (SaaS)
- **What:** A monthly or annual fee for each centre. It covers the virtual version, the directory and wayfinding, the embeddable widget for the centre's website, and content tools for promotions and events.
- **Pricing idea:** Tiered by centre size or number of tenants. Start with a free or low-cost pilot that is tied to agreed success metrics.
- **Value needed:** It must beat, or replace, what centres already pay for their website directory, kiosks, wayfinding signage updates and 3D tours. The strongest pitch is "replace three vendors with one", plus attribution data.
- **Risk:** Long sales cycles, and large landlords building in-house. **Mitigation:** Start with mid-sized independent centres and outlet centres, where one marketing manager can decide.

### 2.2 Store advertising
- **What:** Paid ads on the in-world digital screens (like the ones in the prototype), sponsored search results ("running shoes" → sponsored result first) and banner slots in the directory.
- **Value needed:** An audience with high purchase intent: people who are planning a trip to *this* centre. That is worth more per impression than generic display ads, but only at enough volume.
- **Risk:** Low traffic per centre at first. **Mitigation:** Sell at network level ("reach shoppers across 20 centres") and share revenue with the centre so the landlord is motivated to promote the product.

### 2.3 Sponsored virtual storefronts
- **What:** Brands pay to upgrade their store: custom 3D interior, branded models, video walls, a launch "event" space, a hero spot in the atrium.
- **Value needed:** Better engagement than the brand's own website for local shoppers, and measurable visits. Works well for **product launches** and **pop-ups**.
- **Pricing:** Set-up fee plus monthly fee. Upsell seasonal campaigns such as Christmas or back-to-school.

### 2.4 Affiliate commissions
- **What:** "Buy Online" and "Reserve in store" link to the retailer with an affiliate or partner tag. The platform earns a percentage of attributed sales.
- **Value needed:** Real product feeds with accurate price and stock, and retailers who are enrolled in affiliate networks or direct partner programmes.
- **Tension to manage:** The centre wants **in-person visits**, but online commissions pull shoppers away from the centre. Offer "click & collect at this centre" as the default so everyone wins. The retailer gets the sale, the centre gets the visit, and the platform gets the commission.

### 2.5 Premium analytics for shopping centres
- **What:** Dashboards showing what visitors search for and fail to find (demand gaps, which help with tenant leasing), popular routes, dwell time for each virtual store, conversion from offer to redemption, and peak planning times.
- **Value needed:** Insights that change decisions. For example, "300 searches per week for 'kids shoes' and you have no kids shoe store" is a leasing argument worth real money to a landlord.
- **Privacy:** Aggregate, anonymous, consent-first and compliant with GDPR/APP. Never sell individual-level data.

### 2.6 Virtual product showcases
- **What:** Brands pay to place a 3D product in high-traffic spots, such as an atrium plinth or an "AR try at home" feature, or to run cross-centre launches: one campaign that appears in every centre on the network.
- **Value needed:** High-quality 3D models (brands increasingly have these for e-commerce), plus engagement metrics.

### 2.7 Promotional placements
- **What:** Paid placement in the **Deals** section, push or email "this weekend at your centre" digests, and seasonal event takeovers.
- **Value needed:** Redemption tracking: a unique code or QR scanned in store.
- **Note:** Clearly label paid placements. Mixing ads into "organic" deals without labels damages trust and may breach consumer law.

## 3. Suggested sequencing

1. **Prove shopper value (months 0–6).** Launch free with 1–3 pilot centres. Measure weekly active planners, search→directions rate, repeat use and redemption of a test offer. No ads yet.
2. **Prove attribution.** Run one tenant campaign per centre with redeemable offers. Publish a simple case study, for example: "Offer viewed by X planners, redeemed Y times, estimated $Z in sales."
3. **Charge centres (SaaS) with attribution built in.** Start low and justify renewals with data.
4. **Open self-serve advertising and sponsored storefronts** to tenants once there's traffic.
5. **Add affiliate and click & collect** once product feeds are reliable.
6. **Network effects.** Cross-centre brand campaigns and a national "find it near me" search.

## 4. Unit-economics questions to answer early

- How much does it cost to onboard one centre (floor plan → live)? The goal is under a week of work, then self-serve.
- What share of a centre's website visitors will open the virtual view? That determines the ad inventory.
- Cost per incremental visit compared with the centre's current marketing channels.
- Churn drivers: stale data is likely the biggest. Invest in automated feeds (hours, promotions, tenant changes) and tenant self-service.

## 5. Biggest risks

| Risk | Mitigation |
| --- | --- |
| "Cool demo, nobody uses it twice" | Lead with utility (stock, directions, parking, hours), not novelty. Make the 2D map and search excellent. The 3D view is the hook, not the whole product. |
| Data freshness | Tenant self-service portal, retailer feed integrations, and "last updated" labels |
| Brand/IP permissions | Use real brand names, logos and interiors only with each retailer's agreement. The prototype uses fictional stand-ins. |
| Big landlord builds in-house | Be multi-centre and landlord-neutral. Sell to independents first. |
| Performance on low-end phones | Budget for draw calls and download size, offer a 2D-only mode, and keep the WebGL scene progressively enhanced |
