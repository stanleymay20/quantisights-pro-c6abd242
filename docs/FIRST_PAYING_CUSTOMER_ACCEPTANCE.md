# First Paying Customer Acceptance Gate

A commercial release candidate is acceptable for the first paying customer only when all of the following are proven on the same exact SHA and staging environment.

## Identity and tenant

- A genuinely new Google or verified email identity that begins at `/register` receives one and only one organisation, owner membership, default workspace, workspace-admin membership, profile and quota row.
- Repeating the same provisioning call is idempotent.
- A pre-existing identity cannot use a fresh registration click or browser storage to create a replacement tenant.
- Returning or migrated identities with unknown/incomplete provenance remain on `Workspace restoration required`.

## First value

- A verified new tenant can complete onboarding.
- Completing onboarding grants the documented 30-day no-card Governance pilot once only.
- Operational workspace quotas match the entitlement sold/displayed to the customer.

## Payment

- Checkout accepts only the controlled Quantivis Stripe price catalog.
- Only an organisation owner/admin can begin checkout or open the billing portal.
- Checkout redirect origins are exact and controlled.
- A customer that already used the no-card pilot does not receive a second Stripe trial.
- `checkout.session.completed` binds the Stripe subscription to the organisation encoded by the server-created checkout and verifies purchaser membership.
- Unsupported Stripe products fail closed rather than silently becoming Essentials.
- Billing portal opens the Stripe customer linked to the organisation subscription, not whichever Stripe customer happens to match the user email.

## Evidence

- Exact-head CI is green.
- Migration is applied to staging only before production.
- New-user positive provisioning and returning-user negative provisioning are both live-tested.
- Checkout creates a Stripe-hosted session for each self-serve tier/interval without charging a test customer unexpectedly.
- A signed webhook event produces the expected staging subscription row and entitlement quotas.
- Customer portal opens for the resulting organisation.
- Client acceptance verifies signup → onboarding → first value → checkout return.

## Release exclusions

Historical founder-tenant restoration is a separate controlled workstream and must not be bypassed to make this acceptance pass. Production must not be changed until the staging acceptance evidence above is complete and the legal identity presented to paying customers is factually correct.
