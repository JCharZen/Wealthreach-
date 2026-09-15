# Wealth Exposure Monitor

An OSINT triage application for protective-intelligence teams. Enter a protected person's name, company, and title to search current public news coverage for wealth signals involving:

- real estate and residential exposure
- vehicles, aircraft, yachts, art, jewelry, and auctions
- liquidity events, equity, compensation, and investments
- donations, foundations, sponsorships, and gala activity
- lawsuits, divorce disclosures, liens, debt, and other liabilities

The application generates five targeted search-query groups, retrieves Google News RSS results server-side, removes duplicate stories, classifies each result, and grades confidence and executive-protection relevance. Every finding retains its source link for analyst verification.

## Run locally

Requires Node.js 20 or later. No API key is required.

```bash
npm start
```

Open `http://localhost:3000`.

All repository files are intentionally stored at the root so the project can
be uploaded through GitHub's browser interface without recreating folders.

## Important limitation

This tool measures publicly observable wealth exposure. It does not calculate or claim to know a person's actual net worth. Automated classifications are triage aids and require analyst verification.
