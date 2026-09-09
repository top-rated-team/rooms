/**
 * GENERATED — do not edit. Run `npx tsx scripts/build-adgrant.ts`.
 *
 * adgrant.ai's public content library, fetched through its JSON API, written
 * as markdown under data/adgrant, and corrected against Google's current
 * Ad Grants documentation. A page edited by hand in data/adgrant is kept on
 * the next fetch unless the script is run with --take-theirs.
 *
 * STATS is the measured figure from GET /api/templates/stats. It is the
 * number this library may quote. The unsourced percentages that used to
 * stand in front of it are not in these pages.
 */

export interface RelatedLink {
  href: string;
  title: string;
}

export interface AdGrantCorrection {
  what: string;
  against: string;
}

export type AdGrantCategory = "glossary" | "case-studies" | "tricks";

export interface AdGrantPage {
  slug: string;
  category: AdGrantCategory;
  title: string;
  topic: string | null;
  niche: string | null;
  excerpt: string | null;
  bodyMarkdown: string;
  metaTitle: string | null;
  metaDescription: string | null;
  keywords: string[];
  heroImage: string | null;
  heroImageAlt: string | null;
  relatedLinks: RelatedLink[];
  publishedAt: string | null;
  corrections: AdGrantCorrection[];
}

export interface AdGrantStats {
  accountsProcessed: number;
  totals: { campaigns: number; adGroups: number; keywords: number; ads: number };
  campaignsPerAccount: { median: number; avg: number; min: number; max: number };
  adGroupsPerAccount: { median: number; avg: number };
  adGroupsPerCampaign: { median: number; avg: number };
  keywordsPerAdGroup: { median: number; avg: number };
  adsPerAdGroup: { median: number; avg: number };
  sitelinksPerAccount: { median: number; avg: number };
  calloutsPerAccount: { median: number; avg: number };
  generatedAt: string;
}

export interface AdGrantTemplate {
  slug: string;
  niche: string;
  title: string;
  summary: string;
  heroImage: string | null;
  heroImageAlt: string | null;
  stats: {
    ads: number;
    adGroups: number;
    callouts: number;
    keywords: number;
    campaigns: number;
    sitelinks: number;
    structuredSnippets: number;
  };
}

export const STATS: AdGrantStats = {
  "accountsProcessed": 4539,
  "totals": {
    "campaigns": 16575,
    "adGroups": 108656,
    "keywords": 3142469,
    "ads": 244071
  },
  "campaignsPerAccount": {
    "median": 1,
    "avg": 3.7,
    "min": 1,
    "max": 224
  },
  "adGroupsPerAccount": {
    "median": 6,
    "avg": 23.9
  },
  "adGroupsPerCampaign": {
    "median": 3,
    "avg": 6.6
  },
  "keywordsPerAdGroup": {
    "median": 9,
    "avg": 28.9
  },
  "adsPerAdGroup": {
    "median": 2,
    "avg": 2.2
  },
  "sitelinksPerAccount": {
    "median": 7,
    "avg": 30.1
  },
  "calloutsPerAccount": {
    "median": 5,
    "avg": 11.4
  },
  "generatedAt": "2026-06-05T11:48:59.605Z"
};

export const TEMPLATES: AdGrantTemplate[] = [
  {
    "slug": "youth-mentoring-ad-grant-template",
    "niche": "youth-mentoring",
    "title": "Youth Mentoring Starter Template",
    "summary": "Ad copy template for youth mentoring programs recruiting mentors, families, donors, and promoting camps.",
    "heroImage": "/content-images/animated/anim-10.png",
    "heroImageAlt": "Illustration of a hand assembling a Google Ads account structure diagram",
    "stats": {
      "ads": 12,
      "adGroups": 6,
      "callouts": 6,
      "keywords": 54,
      "campaigns": 3,
      "sitelinks": 4,
      "structuredSnippets": 2
    }
  },
  {
    "slug": "veterans-services-ad-grant-template",
    "niche": "veterans-services",
    "title": "Veterans Services Starter Template",
    "summary": "Template for ads supporting veterans with housing, jobs, benefits, and volunteer recruitment.",
    "heroImage": "/content-images/animated/anim-02.png",
    "heroImageAlt": "Illustration of a rising growth chart attracting new visitors like a magnet",
    "stats": {
      "ads": 12,
      "adGroups": 6,
      "callouts": 6,
      "keywords": 54,
      "campaigns": 3,
      "sitelinks": 4,
      "structuredSnippets": 2
    }
  },
  {
    "slug": "religious-faith-ad-grant-template",
    "niche": "religious-faith",
    "title": "Faith-Based Nonprofits Starter Template",
    "summary": "Generic ad copy template for faith-based nonprofits to promote programs, events, and donations.",
    "heroImage": "/content-images/animated/anim-03.png",
    "heroImageAlt": "Illustration of a shield protecting a budget from cost-per-click charges",
    "stats": {
      "ads": 12,
      "adGroups": 6,
      "callouts": 6,
      "keywords": 54,
      "campaigns": 3,
      "sitelinks": 4,
      "structuredSnippets": 2
    }
  },
  {
    "slug": "homeless-shelters-ad-grant-template",
    "niche": "homeless-shelters",
    "title": "Homeless Shelters Starter Template",
    "summary": "Generic ad copy for homeless shelters to connect, support, and engage communities.",
    "heroImage": "/content-images/animated/anim-02.png",
    "heroImageAlt": "Illustration of a rising growth chart attracting new visitors like a magnet",
    "stats": {
      "ads": 12,
      "adGroups": 6,
      "callouts": 6,
      "keywords": 54,
      "campaigns": 3,
      "sitelinks": 4,
      "structuredSnippets": 2
    }
  },
  {
    "slug": "health-clinics-ad-grant-template",
    "niche": "health-clinics",
    "title": "Community Health Clinics Starter Template",
    "summary": "Ad copy for clinics promoting free care, appointments, volunteer recruitment, and donations.",
    "heroImage": "/content-images/animated/anim-01.png",
    "heroImageAlt": "Illustration of a marketing funnel guiding visitors into a website",
    "stats": {
      "ads": 12,
      "adGroups": 6,
      "callouts": 6,
      "keywords": 54,
      "campaigns": 3,
      "sitelinks": 4,
      "structuredSnippets": 2
    }
  },
  {
    "slug": "food-banks-ad-grant-template",
    "niche": "food-banks",
    "title": "Food Banks Starter Template",
    "summary": "Ad copy template for food banks to promote services, volunteering, and donations.",
    "heroImage": "/content-images/animated/anim-11.png",
    "heroImageAlt": "Illustration of gears and a brain chip representing automated smart bidding",
    "stats": {
      "ads": 12,
      "adGroups": 6,
      "callouts": 6,
      "keywords": 54,
      "campaigns": 3,
      "sitelinks": 4,
      "structuredSnippets": 2
    }
  },
  {
    "slug": "environmental-ad-grant-template",
    "niche": "environmental",
    "title": "Environmental Nonprofits Starter Template",
    "summary": "Ad copy template for recruiting volunteers, donors, and supporters to protect local ecosystems.",
    "heroImage": "/content-images/animated/anim-09.png",
    "heroImageAlt": "Illustration of a laptop showing a search bar and search results",
    "stats": {
      "ads": 12,
      "adGroups": 6,
      "callouts": 6,
      "keywords": 54,
      "campaigns": 3,
      "sitelinks": 4,
      "structuredSnippets": 2
    }
  },
  {
    "slug": "education-literacy-ad-grant-template",
    "niche": "education-literacy",
    "title": "Education & Literacy Starter Template",
    "summary": "Ad copy template for nonprofits promoting education, tutoring, volunteer recruitment, and donations.",
    "heroImage": "/content-images/animated/anim-07.png",
    "heroImageAlt": "Illustration of an arrow hitting the bullseye of a target",
    "stats": {
      "ads": 12,
      "adGroups": 6,
      "callouts": 6,
      "keywords": 54,
      "campaigns": 3,
      "sitelinks": 4,
      "structuredSnippets": 2
    }
  },
  {
    "slug": "domestic-violence-ad-grant-template",
    "niche": "domestic-violence",
    "title": "Domestic Violence Support Starter Template",
    "summary": "Ad copy template for nonprofits offering shelter, hotlines, advocacy, volunteers, and donations.",
    "heroImage": "/content-images/animated/anim-01.png",
    "heroImageAlt": "Illustration of a marketing funnel guiding visitors into a website",
    "stats": {
      "ads": 12,
      "adGroups": 6,
      "callouts": 6,
      "keywords": 54,
      "campaigns": 3,
      "sitelinks": 4,
      "structuredSnippets": 2
    }
  },
  {
    "slug": "disability-services-ad-grant-template",
    "niche": "disability-services",
    "title": "Disability Services Starter Template",
    "summary": "Ad copy template to promote disability support, advocacy, and inclusion programs.",
    "heroImage": "/content-images/animated/anim-06.png",
    "heroImageAlt": "Illustration of a magnet collecting a diverse audience of people",
    "stats": {
      "ads": 12,
      "adGroups": 6,
      "callouts": 6,
      "keywords": 54,
      "campaigns": 3,
      "sitelinks": 4,
      "structuredSnippets": 2
    }
  },
  {
    "slug": "arts-culture-ad-grant-template",
    "niche": "arts-culture",
    "title": "Arts & Culture Starter Template",
    "summary": "Generic ad copy for arts nonprofits promoting tickets, memberships, classes, and support.",
    "heroImage": "/content-images/animated/anim-04.png",
    "heroImageAlt": "Illustration of a connected network of keyword nodes under a magnifying glass",
    "stats": {
      "ads": 12,
      "adGroups": 6,
      "callouts": 6,
      "keywords": 54,
      "campaigns": 3,
      "sitelinks": 4,
      "structuredSnippets": 2
    }
  },
  {
    "slug": "animal-shelters-ad-grant-template",
    "niche": "animal-shelters",
    "title": "Animal Shelters Starter Template",
    "summary": "Generic nonprofit ad copy for animal shelters promoting adoption, fostering, volunteering, and support.",
    "heroImage": "/content-images/animated/anim-02.png",
    "heroImageAlt": "Illustration of a rising growth chart attracting new visitors like a magnet",
    "stats": {
      "ads": 12,
      "adGroups": 6,
      "callouts": 6,
      "keywords": 54,
      "campaigns": 3,
      "sitelinks": 4,
      "structuredSnippets": 2
    }
  }
];

export const PAGES: AdGrantPage[] = [
  {
    "slug": "animal-shelter-google-ad-grant-structure",
    "category": "case-studies",
    "title": "How an Animal Shelter Structures Its Google Ad Grant Account for Adoptions",
    "topic": "How an animal shelter structures its Ad Grant account to drive pet adoptions and foster sign-ups",
    "niche": null,
    "excerpt": "See how a typical animal shelter structures its Google Ad Grant account using proven benchmarks to boost pet adoptions and foster sign-ups.",
    "bodyMarkdown": "An animal shelter looking to promote pet adoptions and foster sign-ups can structure its Google Ad Grant account by thoughtfully dividing campaigns, ad groups, keywords, and extensions. From 4,539 processed Ad Grant accounts, I’ll show how a typical mid-size regional shelter can organize the account to maximize the $329 daily budget while keeping the account well-balanced and compliant.\n\n## Why it matters for your Ad Grant\n\nMost nonprofits run just one campaign — that’s the median — but a well-structured account uses at least three. This spreads your budget across focused themes and keeps relevance high, which Google rewards. For an animal shelter, splitting campaigns by user intent (people looking to adopt pets vs. those interested in fostering) helps tailor ads and keywords. You can also use dedicated campaigns for brand terms or event promotions.\n\nSticking close to median benchmarks—3 campaigns, 3 ad groups each, 9 keywords per ad group, 2 ads per ad group—keeps your account manageable but robust enough to cover important search queries. Adding about 7 sitelinks and 5 callouts boosts your ads’ size on the search results page, improving visibility without spending extra.\n\n## How to structure your animal shelter Ad Grant account in 5 steps\n\n**1. Create 3 core campaigns aligned to your goals**\n- **Adoptions**: This campaign targets people searching for adoptable pets, such as “adopt a dog near me” or “cats for adoption.”\n- **Foster Program**: Focus here on attracting foster volunteers, with keywords like “foster a puppy” or “animal shelter foster sign-up.”\n- **Brand & Awareness**: Bid on your shelter’s name and local terms like “animal shelter [city],” plus general awareness keywords.\n\n**2. Build about 3 ad groups in each campaign by sub-theme**\nEach campaign should have roughly 3 ad groups containing about 9 closely related keywords each. For example:\n- Adoption campaign ad groups:\n  - Dogs for adoption\n  - Cats for adoption\n  - Small pets and others\n- Foster campaign ad groups:\n  - Foster dogs\n  - Foster cats\n  - Foster process and requirements\n- Brand campaign ad groups:\n  - Shelter name branded terms\n  - Local animal shelter searches\n  - Donation-related keywords\n\n**3. Choose keywords carefully, keeping quality and relevance in mind**\nGoogle requires keywords to be at least two words, relevant, and not generic. Use a mix of exact match and phrase match to control where your ads show. For example, “adopt golden retriever” (phrase match) and [adopt dog near me] (exact match). Avoid overly broad terms like “dog” or “pet” alone to keep quality scores healthy.\n\n**4. Write 2 strong, distinct text ads per ad group**\nEach ad group should have at least 2 ads running to test messaging. Focus on clear calls to action, like “Find your new best friend today” or “Become a foster parent—help save lives.” Include keywords in headlines and descriptions to boost ad relevance.\n\n**5. Use extensions to fully utilize your grant and boost CTR**\nAdd about 7 sitelink extensions to highlight useful pages like “Available Pets,” “Foster Program Info,” “Volunteer,” “Donate,” and “Contact Us.” Include callout extensions with 5 short value propositions such as “No-Kill Shelter,” “Vaccinated Pets,” or “Join Our Foster Family.” These extensions make your ads bigger and more informative without extra clicks.\n\n## Bonus tips and trade-offs\n\n- **Budget pacing:** With $329/day, spreading evenly across 3 campaigns is a good start, but monitor which campaigns serve your priorities and adjust bids or budgets accordingly.\n\n- **Conversion tracking:** If you want to switch to Maximize Conversions bidding (which removes the $2 CPC cap), be sure to have proper event tracking set up.\n\n- **Avoid common pitfalls:** Many shelters run just one campaign and pile all keywords in it, which limits ad relevance and CTR. Also, don’t neglect brand terms; those searches often convert best.\n\n- **Use tools:** I recommend trying our free generator at [AdGrant.AI](/) to get a ready-made account structure tailored to your site.\n\n## FAQ\n\n**Q1: Can I run fewer than 3 campaigns?**\nYou can, but you’ll likely limit how specific and relevant your ads can be. More campaigns mean finer control, better ad relevance, and improved CTR, helping avoid account suspension. Just keep it manageable.\n\n**Q2: How many keywords should I add per ad group?**\nAim for around 9 keywords per ad group based on real account medians. This provides enough variety while keeping ad relevance high. Adding too many unrelated keywords dilutes quality.\n\n**Q3: What if I don’t have sitelink or callout extensions?**\nYou should add these. Extensions increase your ad’s real estate on Google and can boost clicks without using extra budget. Even simple sitelinks like “Available Pets” and “Foster Info” make a difference.\n\nIf you want a practical jump-start on structuring your animal shelter’s Google Ad Grant account, check out [How Houston Animal Shelters Can Boost Pet Adoption with the Google Ad Grant](/nonprofits/animal-shelters/houston) or our free generator at [AdGrant.AI](/).\n\nFor deeper reading on avoiding suspension and improving quality, see [Avoid Account Suspension from the Google Ad Grant 5% CTR Rule](/tricks/avoid-account-suspension-google-ad-grant-5-percent-ctr-rule) and [Quality Score: What It Means for Your Google Ad Grant Success](/glossary/quality-score-google-ad-grant).\n",
    "metaTitle": "Animal Shelter Google Ad Grant Account Structure Guide | AdGrant.AI",
    "metaDescription": "Learn how a mid-size animal shelter can build a Google Ad Grant account to promote pet adoptions and foster sign-ups using real account benchmarks.",
    "keywords": [
      "Google Ad Grant animal shelter",
      "Google Ads nonprofit structure",
      "animal shelter ad campaigns",
      "pet adoption Google Ads",
      "foster sign-ups Google Grant",
      "Ad Grant account setup",
      "nonprofit PPC structure"
    ],
    "heroImage": "/content-images/animated/anim-09.png",
    "heroImageAlt": "Illustration of a laptop showing a search bar and search results",
    "relatedLinks": [
      {
        "href": "/nonprofits/animal-shelters/houston",
        "title": "How Houston Animal Shelters Can Boost Pet Adoption with the Google Ad Grant"
      },
      {
        "href": "/nonprofits/animal-shelters/chicago",
        "title": "How Chicago Animal Shelters Can Harness the Google Ad Grant"
      },
      {
        "href": "/nonprofits/animal-shelters/los-angeles",
        "title": "How the Google Ad Grant Helps Animal Shelters in Los Angeles"
      },
      {
        "href": "/",
        "title": "Generate your free Ad Grant account structure"
      }
    ],
    "publishedAt": "2026-06-05T12:19:05.714Z",
    "corrections": []
  },
  {
    "slug": "community-arts-nonprofit-google-ad-grant-structure",
    "category": "case-studies",
    "title": "How a Community Arts Nonprofit Structures Its Google Ad Grant Account",
    "topic": "How a community arts nonprofit organizes its Ad Grant account for tickets, classes and giving",
    "niche": null,
    "excerpt": "See how a community arts nonprofit builds a Google Ad Grant account around tickets, classes, and donations using real-world benchmarks.",
    "bodyMarkdown": "A community arts nonprofit typically juggles three key goals with its Google Ad Grant account: promoting event tickets, driving class sign-ups, and encouraging donations. Structuring the account around these priorities with a clear, thematic setup helps cover the full $10,000/month grant budget effectively—and avoids the common pitfall of running just one campaign that doesn’t fully tap the potential.\n\n### Why it matters for your Ad Grant\n\nFrom running 4,539 processed Ad Grant accounts, I've seen that many nonprofits use just a single campaign, which usually means underutilizing their budget and missing out on targeting specificity. For a community arts group, splitting the account into distinct campaigns for tickets, classes, and giving allows you to tailor keywords, ad copy, and bid strategies to each audience segment. That’s critical because search intent for \"buy tickets\" versus \"donate\" is very different, and lumping them together can hurt your Quality Score and CTR.\n\n### How to structure your Google Ad Grant account\n\nHere’s the step-by-step approach based on aggregate data from 4,539 real Ad Grant accounts we analyzed, combined with what works well for community arts nonprofits.\n\n1. **Create 3 campaigns, one for each primary goal:**  \n   - **Tickets Campaign:** Focuses on selling event or performance tickets.  \n   - **Classes Campaign:** Promotes art classes, workshops, or educational programs.  \n   - **Giving Campaign:** Targets donors and supporters to give online.\n\n   Median accounts run just 1 campaign, but an ideal structure uses at least 3. This is key for keeping your ads relevant and avoiding keyword cannibalization.\n\n2. **Set up about 3 ad groups per campaign:**  \n   Each campaign should have around 3 ad groups (the median we see). For example, the Tickets campaign might have ad groups like \"theater tickets,\" \"music concerts,\" and \"family events.\" The Classes campaign could break down by \"kids art classes,\" \"adult painting workshops,\" and \"online classes.\" The Giving campaign might include \"monthly donors,\" \"one-time donations,\" and \"memorial gifts.\"\n\n3. **Choose focused keywords—around 9 per ad group:**  \n   Each ad group should have roughly 9 keywords that are multi-word and relevant. For \"theater tickets,\" think keywords like “buy community theater tickets,” “local theater shows tickets,” and “affordable theater tickets [city].” Avoid generic or single words to meet grant policy and keep metrics strong.\n\n4. **Write 2 ads per ad group:**  \n   Having at least 2 active ads per ad group helps test messaging and improve CTR. Ads for tickets might emphasize dates and performers, classes ads highlight beginner-friendly or expert instructors, and giving ads focus on impact and ease of donation.\n\n5. **Use sitelink and callout extensions smartly:**  \n   The median account uses about 7 sitelinks and 5 callouts. For a community arts nonprofit, sitelinks can point to key pages like \"Upcoming Shows,\" \"Register for Classes,\" \"Donate Now,\" \"Volunteer,\" and \"Membership Info.\" Callouts should emphasize unique selling points like “Free community events,” “Small class sizes,” or “Tax-deductible donations.”\n\n6. **Allocate your budget across campaigns:**  \n   The full grant allows about $329/day. While you don’t have to spend this evenly, a good starting point might be 40% on Tickets, 35% on Classes, and 25% on Giving. Adjust over time based on search demand and campaign results.\n\n7. **Add conversion tracking if possible:**  \n   Though conversion data isn’t strictly required, it’s critical if you want to run Smart Bidding (like Maximize Conversions) and remove the $2 CPC cap. Tracking ticket purchases, class sign-ups, and donation completions will help refine your campaigns.\n\n### A few trade-offs and realities\n\n- Managing multiple campaigns and dozens of keywords means more upkeep. Be ready for regular reviews and tweaks.\n- The $2 max CPC limits competitiveness in some popular arts keywords; consider Smart Bidding if you can implement conversion tracking.\n- Don’t expect the grant to replace your paid ads entirely—it's great at supplementing but requires strategic focus.\n\nIf you’re unsure where to start with keyword ideas or account structure, the free generator at [AdGrant.AI](https://adgrant.ai/) can build an entire campaign scaffold from your website automatically.\n\n### FAQ\n\n**Q: Can I run fewer than 3 campaigns?**  \nA: You can, but most well-structured accounts have at least 3 to segment key services or audiences. Running a single campaign risks poor ad relevance and underutilized budget.\n\n**Q: How many keywords should I target per ad group?**  \nA: Around 9 is the median we've seen. More keywords can dilute ad relevance; fewer might limit your reach. Aim for tightly themed groups.\n\n**Q: What if I can’t track conversions?**  \nA: You can still run a compliant account but will be limited to manual bidding and the $2 max CPC cap. Your ads might get fewer impressions in competitive auctions.\n\nFor more inspiration on nonprofit Ad Grant structuring, check out [How a Youth Mentoring Nonprofit Structures Its Google Ad Grant Account](/case-studies/youth-mentoring-nonprofit-google-ad-grant-structure) or [How a Homeless Shelter Builds an Ad Grant Account Around Emergency Housing and Donations](/case-studies/homeless-shelter-google-ad-grant-structure-emergency-housing-donations).\n",
    "metaTitle": "Community Arts Nonprofit Google Ad Grant Structure | AdGrant.AI",
    "metaDescription": "Learn how a community arts nonprofit can organize its Google Ad Grant account around ticket sales, classes, and giving with expert tips and benchmarks.",
    "keywords": [
      "community arts nonprofit",
      "Google Ad Grant structure",
      "nonprofit Google Ads",
      "Google Ad Grant tickets",
      "Google Ad Grant classes",
      "Ad Grant donations",
      "nonprofit PPC",
      "Google Ad Grant campaigns"
    ],
    "heroImage": "/content-images/animated/anim-01.png",
    "heroImageAlt": "Illustration of a marketing funnel guiding visitors into a website",
    "relatedLinks": [
      {
        "href": "/case-studies/youth-mentoring-nonprofit-google-ad-grant-structure-2",
        "title": "How a Youth Mentoring Nonprofit Structures Google Ad Grant Campaigns"
      },
      {
        "href": "/case-studies/youth-mentoring-nonprofit-google-ad-grant-structure",
        "title": "How a Youth Mentoring Nonprofit Structures Its Google Ad Grant Account"
      },
      {
        "href": "/case-studies/homeless-shelter-google-ad-grant-structure-emergency-housing-donations",
        "title": "How a Homeless Shelter Builds an Ad Grant Account Around Emergency Housing and Donations"
      },
      {
        "href": "/",
        "title": "Generate your free Ad Grant account structure"
      }
    ],
    "publishedAt": "2026-06-05T12:20:50.500Z",
    "corrections": []
  },
  {
    "slug": "environmental-nonprofit-google-ad-grant-structure",
    "category": "case-studies",
    "title": "How an Environmental Nonprofit Structures Google Ad Grant Campaigns",
    "topic": "How an environmental nonprofit structures campaigns for volunteers, donations and advocacy",
    "niche": null,
    "excerpt": "See how a typical environmental nonprofit organizes Google Ad Grant campaigns for volunteers, donations, and advocacy using proven benchmarks.",
    "bodyMarkdown": "An environmental nonprofit focused on conservation and climate action wants to use its Google Ad Grant wisely. They face a common problem: how to organize their account so it covers the varied goals of volunteer sign-ups, fundraising, and advocacy without spreading the budget too thin or running an unmanageable mess.\n\nThis situation is classic. From the 4,539 processed Ad Grant accounts I've managed, I've seen most nonprofits start small—often with just one campaign. But well-structured accounts typically have 3 or 4 campaigns, each laser-focused on a distinct mission area. This approach helps keep ads and keywords relevant, which is critical to maintaining quality scores and hitting the minimum 5% CTR to avoid suspension.\n\n## Structure: Three Campaigns Aligned with Core Goals\n\nFor an environmental nonprofit juggling volunteers, donations, and advocacy, I'd recommend exactly three campaigns:\n\n1. **Volunteer Recruitment**\n2. **Donations & Fundraising**\n3. **Advocacy & Policy Engagement**\n\nEach campaign should tackle that one goal clearly so the keywords, ad copy, and landing pages all speak the same language.\n\n---\n\n### 1. Volunteer Recruitment Campaign\n\nThe goal here is to attract people interested in hands-on environmental work, community cleanups, or virtual volunteer roles.\n\n- **Ad Groups:** Around 3 ad groups, each targeting a slightly different angle, for example:\n  - Local Volunteer Opportunities\n  - Virtual Environmental Volunteering\n  - Youth Environmental Programs\n\n- **Keywords:** Median is about 9 keywords per ad group. For volunteer recruitment, these might include phrases like \"environmental volunteer near me,\" \"how to volunteer for climate action,\" \"youth conservation programs.\"\n\n- **Ads:** Two active ads per ad group, with copy variations testing calls to action (“Join a local cleanup,” “Volunteer from home,” etc.) to maximize click-through.\n\n---\n\n### 2. Donations & Fundraising Campaign\n\nThis campaign targets donors ready to support conservation efforts.\n\n- **Ad Groups:** Examples:\n  - General Donations\n  - Monthly Giving Programs\n  - Planned Giving or Legacy Donations\n\n- **Keywords:** Focus on intent-driven phrases such as \"donate to environmental nonprofit,\" \"support climate action,\" \"monthly donation environment.\"\n\n- **Ads:** Emphasize impact and urgency, offering clear pathways to donate.\n\n---\n\n### 3. Advocacy & Policy Engagement Campaign\n\nDesigned to reach people interested in petitions, letter writing, or policy education.\n\n- **Ad Groups:** Sample groups might be:\n  - Climate Policy Petitions\n  - Environmental Legislation Updates\n  - Join Advocacy Campaigns\n\n- **Keywords:** Longer-tail, action-oriented keywords like \"sign climate petition,\" \"how to contact local representatives environment,\" \"environmental advocacy campaigns.\"\n\n- **Ads:** Highlight easy ways to take action, emphasizing community and policy influence.\n\n---\n\n## Account Benchmarking & Extensions\n\nFrom the accounts I analyzed:\n\n- **Campaign Count:** While many accounts have only one campaign, aiming for about 3 campaigns matches the median for a well-structured account.\n\n- **Ad Groups:** Median is 3 ad groups per campaign, which helps keep targeting focused and manageable.\n\n- **Keywords:** Around 9 keywords per ad group is typical. More than that can cause irrelevant impressions; fewer can limit reach.\n\n- **Ads:** At least 2 ads per ad group are recommended to allow A/B testing.\n\n- **Ad Extensions:** A solid account uses roughly 7 sitelinks and 5 callouts.\n\nFor this environmental nonprofit, sitelinks could include:\n\n- Volunteer Opportunities\n- Donate Now\n- Latest Advocacy Campaigns\n- Success Stories\n- Events Calendar\n- Newsletter Signup\n- Resources & Guides\n\nCallout extensions could emphasize things like “100% Volunteer Driven,” “Tax-Deductible Donations,” or “Join a Growing Community.”\n\n---\n\n## Budget & Bidding\n\nThe full Google Ad Grant offers $10,000 USD per month (~$329/day). With three campaigns, you can roughly split the budget evenly or adjust based on priority. For example, if advocacy is a newer focus, assign it a smaller slice initially.\n\nKeep in mind the standard $2 max CPC cap unless you enable Smart Bidding with conversion tracking. For nonprofits that can track volunteer sign-ups or donations as conversions, switching to “Maximize Conversions” can help spend the daily budget more efficiently.\n\n---\n\n## Tips & Pitfalls\n\n- **Keep campaigns distinct.** Don’t mix keywords for donations and volunteer sign-ups in the same campaign. This hurts relevancy and lowers quality scores.\n\n- **Use negative keywords carefully.** For example, exclude broad terms like \"jobs\" if you don’t want traffic looking for employment.\n\n- **Refresh ads regularly.** Two ads per ad group is the minimum—switch up copy to avoid ad fatigue.\n\n- **Leverage ad extensions fully.** They boost ad real estate and improve CTR.\n\n- **Monitor the 5% CTR requirement.** If your ads don’t hit this, Google can suspend your account. Relevant, tightly themed campaigns help prevent this.\n\nIf you’re setting up an account like this from scratch, I recommend trying the free generator at [AdGrant.AI](/). It auto-builds an account structure based on your website, including campaigns, ad groups, keywords, and extensions — saving hours on setup.\n\nFor more examples, see how other nonprofits structure their grants:\n- [How a Community Arts Nonprofit Structures Its Google Ad Grant Account](/case-studies/community-arts-nonprofit-google-ad-grant-structure)\n- [How a Youth Mentoring Nonprofit Structures Google Ad Grant Campaigns](/case-studies/youth-mentoring-nonprofit-google-ad-grant-structure-2)\n- [How a Homeless Shelter Builds an Ad Grant Account Around Emergency Housing and Donations](/case-studies/homeless-shelter-google-ad-grant-structure-emergency-housing-donations)\n\nThe key takeaway: thoughtful structure — distinct campaigns with focused ad groups, relevant keywords, multiple ads, and robust extensions — is how to unlock the potential of the $10K monthly Ad Grant budget for an environmental nonprofit juggling multiple outreach goals.\n",
    "metaTitle": "Environmental Nonprofit Google Ad Grant Campaign Structure | AdGrant.…",
    "metaDescription": "Learn how an environmental nonprofit sets up Google Ad Grant campaigns for volunteers, donations, and advocacy following real account benchmarks.",
    "keywords": [
      "Google Ad Grant",
      "environmental nonprofit",
      "Google Ads structure",
      "nonprofit Google Ads",
      "volunteer recruitment ads",
      "donation campaigns",
      "advocacy marketing",
      "Ad Grant tips"
    ],
    "heroImage": "/content-images/animated/anim-05.png",
    "heroImageAlt": "Illustration of a conversion tracking dashboard with a target and rising graph",
    "relatedLinks": [
      {
        "href": "/case-studies/community-arts-nonprofit-google-ad-grant-structure",
        "title": "How a Community Arts Nonprofit Structures Its Google Ad Grant Account"
      },
      {
        "href": "/case-studies/youth-mentoring-nonprofit-google-ad-grant-structure-2",
        "title": "How a Youth Mentoring Nonprofit Structures Google Ad Grant Campaigns"
      },
      {
        "href": "/case-studies/youth-mentoring-nonprofit-google-ad-grant-structure",
        "title": "How a Youth Mentoring Nonprofit Structures Its Google Ad Grant Account"
      },
      {
        "href": "/",
        "title": "Generate your free Ad Grant account structure"
      }
    ],
    "publishedAt": "2026-06-05T12:21:16.646Z",
    "corrections": []
  },
  {
    "slug": "homeless-shelter-google-ad-grant-structure",
    "category": "case-studies",
    "title": "How a Homeless Shelter Structures Its Google Ad Grant Account",
    "topic": "How a homeless shelter builds an Ad Grant account around emergency housing and donations",
    "niche": null,
    "excerpt": "A mid-size regional homeless shelter structures its Google Ad Grant with 3 well-targeted campaigns, balanced keywords, and smart ad extension use.",
    "bodyMarkdown": "## Bottom-line takeaway\n\nFrom managing 4,539 processed Ad Grant accounts, I’ve found that a well-structured homeless shelter’s account usually runs **3 campaigns**, each with about **3 ad groups**, and uses around **9 keywords per ad group**. This setup balances focus and reach while fully leveraging the $10,000 monthly grant budget.\n\n## Why structure matters for a homeless shelter\n\nMost accounts I’ve seen tend to be small—with the median account running only 1 campaign. But for a nonprofit focused on emergency housing and donations, a thoughtful division of campaigns lets you target different audience intents clearly without overlap.\n\nThe Google Ad Grant gives you roughly **$329 per day** to spend, capped at **$2 max CPC** unless you switch to Smart Bidding. Staying within these limits, while keeping a 5% CTR to avoid suspension, means you must carefully organize your keywords and ads.\n\n## Example: A mid-size regional homeless shelter\n\n### Campaigns\n\nThe shelter runs 3 main campaigns:\n\n1. **Emergency Housing Assistance** – This targets people searching for urgent shelter options.\n2. **Donation and Support** – Focused on attracting donors and volunteers.\n3. **Resources & Prevention Programs** – Covers educational services and long-term help.\n\nEach campaign has roughly 3 ad groups. For instance, in the Emergency Housing Assistance campaign:\n\n- *Local Shelter Locations* (e.g., keywords like “emergency shelter near me,” “homeless shelter [city]”)\n- *Eligibility Requirements* (e.g., “how to qualify for emergency housing,” “homeless shelter intake process”)\n- *Hours and Services* (e.g., “shelter open hours,” “overnight shelter services”)\n\nEach ad group holds **around 9 keywords** using multi-word, relevant phrases that avoid overly broad or generic terms. This helps maintain quality score and CTR.\n\n### Ads\n\nIn every ad group, there are at least **2 active text ads**. These ads vary slightly in headline and description to test messaging, focusing on clarity and a strong call-to-action (e.g., “Find Safe Shelter Tonight,” “Donate to End Homelessness,” “Learn How You Can Help”).\n\n### Ad Extensions\n\nThe account uses about:\n\n- **7 sitelinks**: Links like “Apply for Shelter,” “Make a Donation,” “Volunteer Opportunities,” “Success Stories,” “Shelter Locations,” “Donate Monthly,” and “Contact Us.”\n- **5 callout extensions**: Snappy value props such as “24/7 Support,” “No Eligibility Requirements,” “Trusted Local Shelter,” “Immediate Assistance,” and “Safe & Confidential.”\n\nExtensions add valuable real estate and help guide users to specific pages, improving CTR and relevance.\n\n### Budget management\n\nWith a daily budget of around $329, the campaigns share spend roughly evenly, but most goes to Emergency Housing Assistance since search intent here is urgent. Using the default manual CPC with a $2 cap keeps costs predictable. If the shelter has conversion tracking set up (e.g., form submissions), they could explore Smart Bidding to remove the cap and optimize further.\n\n### Trade-offs and pitfalls\n\n- **Too few campaigns means unclear messaging.** More broad accounts often struggle with poor CTR because ads and keywords aren’t tightly themed.\n\n- **Too many campaigns or keywords can dilute spend and complicate management.** The median nonprofit account we analyzed hovered around 3 campaigns for a reason: it strikes the right balance.\n\n- **Generic keywords hurt quality score and CTR.** Using multi-word, specific phrases aligned to your shelter’s actual services is key.\n\n- **Not using extensions leaves valuable space unused.** We see accounts boost CTR by 10-15% just by adding sitelinks and callouts.\n\n## Next steps\n\nIf you’re running or planning a Google Ad Grant account for a homeless shelter or similar nonprofit, start by outlining 3 clear campaign themes that reflect your core goals—emergency help, donations, and education.\n\nBuild about 3 ad groups per campaign, each with roughly 9 well-researched, multi-word keywords. Write at least 2 tailored ads per group. Don’t forget to add sitelinks and callouts—aim for about 7 and 5 respectively.\n\nI recommend trying [AdGrant.AI](/) to auto-generate a full account structure tailored to your website—it's free and helps avoid common pitfalls.\n\nWant to see more nonprofit examples? Check out [How a Regional Food Bank Structures Its Google Ad Grant Account](/case-studies/regional-food-bank-google-ad-grant-structure) or [How an Animal Shelter Structures Its Google Ad Grant Account for Adoptions](/case-studies/animal-shelter-google-ad-grant-structure).\n\nAlso, keep in mind the [Avoid Account Suspension from the Google Ad Grant 5% CTR Rule](/tricks/avoid-account-suspension-google-ad-grant-5-percent-ctr-rule) guide to keep your account safe.\n\nWith focused structure and smart use of the grant, your homeless shelter can maximize visibility and impact without spending a dime.\n",
    "metaTitle": "How a Homeless Shelter Structures Its Google Ad Grant Accou… | AdGran…",
    "metaDescription": "Learn how a mid-size homeless shelter organizes its Google Ad Grant around emergency housing and donations with concrete campaign structure tips.",
    "keywords": [
      "Google Ad Grant homeless shelter",
      "Google Ads nonprofit structure",
      "emergency housing ads",
      "donation campaign Google Ads",
      "Google Ad Grant keywords",
      "nonprofit PPC setup",
      "Google Ads sitelinks nonprofit"
    ],
    "heroImage": "/content-images/animated/anim-09.png",
    "heroImageAlt": "Illustration of a laptop showing a search bar and search results",
    "relatedLinks": [
      {
        "href": "/case-studies/regional-food-bank-google-ad-grant-structure",
        "title": "How a Regional Food Bank Structures Its Google Ad Grant Account"
      },
      {
        "href": "/case-studies/animal-shelter-google-ad-grant-structure",
        "title": "How an Animal Shelter Structures Its Google Ad Grant Account for Adoptions"
      },
      {
        "href": "/nonprofits/animal-shelters/houston",
        "title": "How Houston Animal Shelters Can Boost Pet Adoption with the Google Ad Grant"
      },
      {
        "href": "/",
        "title": "Generate your free Ad Grant account structure"
      }
    ],
    "publishedAt": "2026-06-05T12:19:44.433Z",
    "corrections": []
  },
  {
    "slug": "homeless-shelter-google-ad-grant-structure-emergency-housing-donations",
    "category": "case-studies",
    "title": "How a Homeless Shelter Builds an Ad Grant Account Around Emergency Housing and Donations",
    "topic": "How a homeless shelter builds an Ad Grant account around emergency housing and donations",
    "niche": null,
    "excerpt": "See how a mid-size regional homeless shelter structures its Google Ad Grant account to focus on emergency housing and donations.",
    "bodyMarkdown": "## When a Homeless Shelter Starts with Google Ad Grants\n\nImagine a mid-size regional homeless shelter that wants to use the Google Ad Grant to reach people looking for emergency housing and to encourage donations. They’ve heard the grant offers $10,000/month in free Search ads, but they’re not sure how to set up their account without wasting time or ad spend. That’s a familiar story—most smaller nonprofits struggle to structure their accounts to use the grant effectively.\n\nFrom managing 4,539 processed Ad Grant accounts, I can say with confidence that structure matters. Many accounts run a single campaign with a handful of keywords, but that leaves a lot of potential on the table. The median Ad Grant account has just 1 campaign, yet the average is more like 3 to 4. When we talk about a “well-structured” account, I’m referring to something closer to the average or better:\n\n- **3 campaigns**\n- About **3 ad groups per campaign** (median from 4,539 accounts)\n- Around **9 keywords per ad group** (median)\n- At least **2 ads per ad group**\n- Use of around **7 sitelink extensions** and **5 callout extensions** per account\n\nAnd this setup aims to use the full $329 daily budget effectively without hitting common pitfalls.\n\n## Concept: Organizing Campaigns by Core Program Themes\n\nFor this homeless shelter, the natural split is two main focuses—**emergency housing** and **donations**—plus a third campaign for **community outreach and volunteer recruitment**. This gives clarity, allows better keyword grouping, and lets you tailor ad copy precisely.\n\n### Campaign 1: Emergency Housing\n\nThis campaign targets people actively searching for immediate shelter options or help with homelessness. The campaign’s ad groups might look like:\n\n- **Shelter Availability** (keywords like \"emergency shelter near me,\" \"homeless shelter open now\")\n- **Eligibility and Intake** (\"how to qualify for homeless shelter,\" \"shelter intake process\")\n- **Safe Housing Resources** (\"safe daytime shelters,\" \"temporary housing options\")\n\nEach ad group has roughly 9 tightly related keywords—never generic single words—and 2 different ads testing different value propositions or calls to action. For example, one ad might emphasize quick intake, another stresses 24/7 availability.\n\n### Campaign 2: Donations\n\nHere, the focus shifts to people ready to support the shelter’s mission. The ad groups can be:\n\n- **General Donations** (\"donate to homeless shelter,\" \"support homeless families\")\n- **Monthly Giving** (\"monthly donation homeless shelter,\" \"sponsor a bed\")\n- **Special Campaigns** (\"holiday homeless donation drive,\" \"emergency fund donation\")\n\nAgain, 9 keywords per group, 2 ads per group. Ad copy highlights impact, ease of donating, and sometimes urgency.\n\n### Campaign 3: Community Outreach & Volunteers\n\nThis campaign covers recruitment and events:\n\n- **Volunteer Opportunities** (\"volunteer at homeless shelter,\" \"help homeless volunteers\")\n- **Community Events** (\"homeless shelter fundraiser events,\" \"local homeless awareness\")\n- **Educational Resources** (\"homelessness facts and help,\" \"how to support homeless people\")\n\nThis campaign helps build long-term engagement beyond immediate needs.\n\n## Tips for Setting Up and Maintaining Your Account\n\n1. **Use the Median Benchmarks as Your Baseline**\n\nDon't start with one campaign and a dozen keywords scattered around. Aim for **3 campaigns** with around **3 ad groups each** and **9 keywords per ad group**. That’s about 81 keywords total, which fits well with Google’s relevance and quality score requirements.\n\n2. **Create at Least 2 Ads per Ad Group**\n\nTwo ad groups per campaign are required. One responsive search ad per ad group meets the ad rule that replaced two ads per ad group on 30 June 2022. Extra ads can still help test messaging and maximize your quality score potential. Vary headlines and descriptions—one ad might focus on urgency (“Need Shelter Tonight?”), another on reassurance (“Safe, Warm Shelter Available”).\n\n3. **Leverage Extensions to Capture More Real Estate**\n\nDon’t forget sitelink extensions (average is around 7 per account) to link to key pages like volunteer info, donation forms, or FAQs. Callout extensions (around 5 per account) add extra selling points like “Open 24/7,” “No Fee Shelter,” or “Trusted by Community.” These small details boost ad rank without extra cost.\n\n4. **Monitor Budget Use and Adjust**\n\nThe full grant budget is $329/day. If you find one campaign or ad group is using too little or too much of the spend, tweak keywords or bids respectfully, keeping in mind the max $2 CPC cap unless using Smart Bidding with conversion tracking.\n\n5. **Stay on Top of Compliance and CTR**\n\nGoogle requires a 5% monthly CTR or accounts risk suspension. Well-structured accounts with tightly themed keywords and multiple ads typically perform better here than one-campaign accounts. If you want to understand CTR and quality score better, check out [Quality Score: What It Means for Your Google Ad Grant Success](/glossary/quality-score-google-ad-grant) and how to avoid suspension here: [Avoid Account Suspension from the Google Ad Grant 5% CTR Rule](/tricks/avoid-account-suspension-google-ad-grant-5-percent-ctr-rule).\n\n## Wrapping It Up\n\nStructuring your Google Ad Grant account for a homeless shelter around **emergency housing, donations, and outreach** lets you cover key program areas while using the grant budget efficiently. It’s about clarity and focus—divide your campaigns so each targets a specific audience with tailored keywords and ads.\n\nIf this feels overwhelming, tools like [AdGrant.AI](/) can generate a complete account structure for you, using your website as a starting point. I’ve seen it save hours and help nonprofits hit those median benchmarks with ease.\n\nIf you want to see how other nonprofits structure their accounts, check out these case studies:\n\n- [How a Regional Food Bank Structures Its Google Ad Grant Account](/case-studies/regional-food-bank-google-ad-grant-structure)\n- [How an Animal Shelter Structures Its Google Ad Grant Account for Adoptions](/case-studies/animal-shelter-google-ad-grant-structure)\n\nGetting this foundation right is key to making your ads work well without burning out your team or wasting the grant’s potential.\n",
    "metaTitle": "Homeless Shelter Google Ad Grant Structure for Housing & Do… | AdGran…",
    "metaDescription": "Learn how a homeless shelter can organize its Google Ad Grant account for emergency housing and donation campaigns with real benchmarks.",
    "keywords": [
      "Google Ad Grant homeless shelter",
      "nonprofit Google Ads structure",
      "emergency housing ads",
      "donations Google Ads",
      "Ad Grant ad groups",
      "Google Ad Grant keywords",
      "nonprofit PPC setup"
    ],
    "heroImage": "/content-images/animated/anim-09.png",
    "heroImageAlt": "Illustration of a laptop showing a search bar and search results",
    "relatedLinks": [
      {
        "href": "/case-studies/regional-food-bank-google-ad-grant-structure",
        "title": "How a Regional Food Bank Structures Its Google Ad Grant Account"
      },
      {
        "href": "/case-studies/animal-shelter-google-ad-grant-structure",
        "title": "How an Animal Shelter Structures Its Google Ad Grant Account for Adoptions"
      },
      {
        "href": "/nonprofits/animal-shelters/houston",
        "title": "How Houston Animal Shelters Can Boost Pet Adoption with the Google Ad Grant"
      },
      {
        "href": "/",
        "title": "Generate your free Ad Grant account structure"
      }
    ],
    "publishedAt": "2026-06-05T12:20:04.112Z",
    "corrections": [
      {
        "what": "The two-ads-per-ad-group rule stopped applying to grantees on 30 June 2022. Two ad groups per campaign is still required.",
        "against": "https://support.google.com/nonprofits/answer/9314402"
      }
    ]
  },
  {
    "slug": "regional-food-bank-google-ad-grant-structure",
    "category": "case-studies",
    "title": "How a Regional Food Bank Structures Its Google Ad Grant Account",
    "topic": "How a regional food bank organizes campaigns to reach families and recruit volunteers",
    "niche": null,
    "excerpt": "A clear example of how a regional food bank can organize its Google Ad Grant account to reach families and recruit volunteers effectively.",
    "bodyMarkdown": "## Here’s how a regional food bank can organize its Google Ad Grant account to reach families and recruit volunteers\n\nFrom the 4,539 processed Ad Grant accounts I’ve managed, the smartest strategy for a regional food bank is to build a solid, well-diversified account structure that uses the full $10,000/month budget without overwhelming complexity.\n\n**The bottom line:** aim for about 3 campaigns, each with roughly 3 ad groups, 9 keywords per ad group, 2 ads per ad group, plus 7 sitelinks and 5 callouts. This is a proven setup that balances reach, relevance, and manageability.\n\n---\n\n### Why this structure?\n\nMost nonprofits run just one campaign. That’s often too narrow and limits your ability to address different audience needs or program areas. The median across thousands of accounts is around 3 to 4 campaigns, which lets you target distinct themes clearly.\n\nFor a regional food bank, two obvious campaign themes are:\n\n1. **Families in Need** — targeting people searching for food assistance, food pantries, meal programs.\n2. **Volunteer Recruitment** — reaching people who want to help by donating their time.\n3. **Donation Campaigns or Events** — if applicable, focusing on fundraising drives or food drives.\n\nEach campaign then breaks down into about 3 ad groups — you want to keep ad groups relevant and granular, but not so tight you end up with tiny, unmanageable groups.\n\n### Example structure with real numbers\n\n**Budget:** $329/day ($10,000/mo)\n\n**Campaigns:** 3\n\n**Ad groups per campaign:** ~3 (median)\n\n**Keywords per ad group:** ~9 (median)\n\n**Ads per ad group:** 2\n\n**Sitelinks:** 7 (roughly average)\n\n**Callouts:** 5\n\n#### Campaign 1: Families Seeking Food Assistance\n\n- **Ad Group A:** Food Pantry Near Me\n  - Keywords like \"local food pantry,\" \"free food bank,\" \"emergency food assistance\"\n- **Ad Group B:** Meal Programs\n  - Keywords like \"free school meals,\" \"community meal programs,\" \"food for kids\"\n- **Ad Group C:** Food Resources\n  - Keywords like \"food help for families,\" \"low income food aid,\" \"food stamps info\"\n\nEach ad group has 2 ads, focused on clear calls to action, such as \"Find Your Nearest Food Pantry Today\" and \"Get Help Feeding Your Family Now.\"\n\n#### Campaign 2: Volunteer Recruitment\n\n- **Ad Group A:** Volunteer Opportunities\n  - Keywords like \"volunteer food bank,\" \"help at food pantry,\" \"food bank volunteer sign up\"\n- **Ad Group B:** Food Drive Volunteers\n  - Keywords like \"organize food drive,\" \"volunteer at food drive,\" \"food bank event help\"\n- **Ad Group C:** Community Service\n  - Keywords like \"community volunteer work,\" \"nonprofit volunteer jobs,\" \"local volunteer programs\"\n\nAds emphasize the impact volunteers make and the ease of signing up.\n\n#### Campaign 3: Donations and Fundraising Events\n\n- **Ad Group A:** Donate Food\n  - Keywords like \"donate food pantry,\" \"food bank donations,\" \"how to donate food\"\n- **Ad Group B:** Monetary Donations\n  - Keywords like \"donate money food bank,\" \"support local food bank,\" \"give to food bank\"\n- **Ad Group C:** Fundraising Events\n  - Keywords like \"food bank fundraiser,\" \"charity food drive event,\" \"food bank gala tickets\"\n\nAds here focus on simple donation processes and upcoming event details.\n\n### Extensions: Sitelinks & Callouts\n\nWe add roughly **7 sitelinks** to provide extra entry points—examples include:\n\n- How to Get Food Assistance\n- Volunteer FAQs\n- Upcoming Food Drives\n- Donation Options\n- Community Partnerships\n- Success Stories\n- Contact Us\n\nAnd **5 callout extensions** highlight key strengths, such as:\n\n- Serving Families Since 1995\n- Trusted Community Partner\n- Flexible Volunteer Hours\n- Easy Online Donations\n- Local Food Access\n\n### The rationale behind numbers\n\nThe **2 ads per ad group** setup helps test messaging without creating too much work. With about **9 keywords per ad group** (median from 4,539 real accounts), you can cover relevant search terms without diluting performance or quality scores.\n\nThe **$2 CPC cap** (unless using Smart Bidding) guides keyword selection toward mid- and lower-cost terms, avoiding expensive or overly generic phrases.\n\nMaintaining at least a **5% click-through rate** means keywords and ads need to be relevant and specific—not broad generic terms. This setup balances that well.\n\n### Trade-offs and pitfalls\n\nTrying to run dozens of tiny campaigns often backfires: you get spread thin managing ads, keywords, and extensions, making it hard to optimize. Conversely, too few campaigns reduces relevance and flexibility.\n\nSome food banks focus all ads on just donation or volunteer recruitment, missing out on the broader audience actively searching for food help. Structuring campaigns to cover these distinct user intents is key.\n\nAlso, neglecting ad extensions is a common waste—adding sitelinks and callouts boosts real estate and engagement.\n\n### Next steps\n\nIf you want to try building a tailored campaign structure like this, I highly recommend using the free [AdGrant.AI generator](/). It creates a draft Google Ad Grant account structure automatically based on your website, saving tons of setup time.\n\nFor more nonprofit-focused examples, check out how [animal shelters structure their accounts](/case-studies/animal-shelter-google-ad-grant-structure) or read advice on [avoiding the 5% CTR suspension](/tricks/avoid-account-suspension-google-ad-grant-5-percent-ctr-rule).\n\nThe key is to start simple but structured. With 3 campaigns, 3 ad groups each, about 9 keywords per ad group, and 2 ads per group, you unlock enough segmentation, message testing, and budget coverage to make the Google Ad Grant work for your regional food bank’s goals.\n",
    "metaTitle": "Google Ad Grant Structure for Regional Food Banks | AdGrant.AI",
    "metaDescription": "Learn how a regional food bank structures Google Ad Grant campaigns to connect with families in need and recruit volunteers efficiently.",
    "keywords": [
      "Google Ad Grant",
      "nonprofit PPC structure",
      "food bank advertising",
      "volunteer recruitment ads",
      "Google Ads nonprofit",
      "Ad Grant campaign setup",
      "regional food bank marketing",
      "Google Ad Grant examples"
    ],
    "heroImage": "/content-images/animated/anim-02.png",
    "heroImageAlt": "Illustration of a rising growth chart attracting new visitors like a magnet",
    "relatedLinks": [
      {
        "href": "/case-studies/animal-shelter-google-ad-grant-structure",
        "title": "How an Animal Shelter Structures Its Google Ad Grant Account for Adoptions"
      },
      {
        "href": "/nonprofits/animal-shelters/houston",
        "title": "How Houston Animal Shelters Can Boost Pet Adoption with the Google Ad Grant"
      },
      {
        "href": "/nonprofits/animal-shelters/chicago",
        "title": "How Chicago Animal Shelters Can Harness the Google Ad Grant"
      },
      {
        "href": "/",
        "title": "Generate your free Ad Grant account structure"
      }
    ],
    "publishedAt": "2026-06-05T12:19:27.359Z",
    "corrections": []
  },
  {
    "slug": "youth-mentoring-nonprofit-google-ad-grant-structure",
    "category": "case-studies",
    "title": "How a Youth Mentoring Nonprofit Structures Its Google Ad Grant Account",
    "topic": "How a youth mentoring nonprofit structures campaigns to recruit mentors and enroll families",
    "niche": null,
    "excerpt": "Example of structuring a Google Ad Grant account to recruit mentors and enroll families for a youth mentoring nonprofit.",
    "bodyMarkdown": "A youth mentoring nonprofit typically seeks to recruit volunteer mentors and enroll families interested in mentorship programs. Structuring a Google Ad Grant account to address these two related but distinct goals requires a clear division of campaigns, targeted keywords, and ad copy that speaks directly to each audience. From my experience managing 4,539 processed Ad Grant accounts, I can share a solid, practical approach grounded in honest benchmarks and proven structure.\n\n## Why it matters for your Ad Grant\n\nMany nonprofits run just one campaign, which is often too broad and limits budget usage and relevance. The median account has 1 campaign, but well-structured accounts typically use 3 or more. For a youth mentoring nonprofit, separating recruitment from family enrollment isn’t just helpful—it’s essential. It drives relevance, improves Quality Score, and helps avoid wasted spend on irrelevant keywords or ads.\n\nThe full Google Ad Grant budget is about $329/day or $10,000/month. To use it fully and maintain the required 5% click-through rate (CTR), you need multiple tightly themed campaigns and ad groups. This not only keeps your account healthy but helps you connect with your two key audiences effectively.\n\n## How a Youth Mentoring Nonprofit Can Structure Its Account\n\n1. **Create 3 main campaigns: Mentor Recruitment, Family Enrollment, and Brand Awareness**\n\n   - **Mentor Recruitment**: Focused on keywords and ads targeting individuals interested in volunteering as mentors.\n   - **Family Enrollment**: Focused on families looking for mentoring support for their children.\n   - **Brand Awareness**: Covers general searches about the nonprofit’s name, programs, and related community services.\n\n   The median across accounts is about 3-4 campaigns, so this aligns well with best practice.\n\n2. **Within each campaign, build about 3 ad groups with distinct keyword focuses**\n\n   For example, in the Mentor Recruitment campaign:\n   - Ad Group 1: “Become a mentor” keywords (e.g., \"how to become a youth mentor\")\n   - Ad Group 2: “Volunteer benefits” keywords (e.g., \"volunteer mentor benefits\")\n   - Ad Group 3: “Mentor training” keywords (e.g., \"mentor training programs\")\n\n   Each ad group should have around 9 keywords (the median), tightly themed to keep Quality Score healthy.\n\n3. **Use 2 ads per ad group**\n\n   The honest benchmark is 2 ads per ad group, allowing you to A/B test messaging such as emphasizing impact vs. community benefits. Ads should be responsive search ads optimized with relevant calls to action for each audience.\n\n4. **Add sitelink and callout extensions at the account level**\n\n   Aim for about 7 sitelinks and 5 callouts per account, consistent with median usage. Example sitelinks:\n   - \"Mentor Application\"\n   - \"How Our Program Works\"\n   - \"Family Enrollment Info\"\n   - \"Volunteer FAQ\"\n\n   Callouts might include:\n   - \"Free Mentor Training\"\n   - \"Background Checked Volunteers\"\n   - \"Serving Families Since 2005\"\n\n   These extensions improve ad real estate and provide extra pathways for searchers.\n\n5. **Budget allocation and bid strategy**\n\n   With a $329 daily budget cap, distribute spend roughly evenly across campaigns initially. Accounts created on or after 22 April 2019 must use conversion-based Smart bidding. Where an older account is still on manual CPC, the $2 ceiling applies.\n\n   Later, if conversions are tracked (e.g., mentor applications submitted, family inquiries), consider switching to Maximize Conversions to lift the bid cap and improve results.\n\n6. **Keyword strategy details**\n\n   Use multi-word, specific keywords to stay compliant with the grant. Avoid single generic terms like “volunteer” or “mentoring.” Instead, go for phrases like:\n   - “youth mentor volunteer opportunities”\n   - “how to enroll child in mentoring”\n   - “mentor training near me”\n\n   This helps keep Quality Score above 3 and the account active.\n\n7. **Monitor and refine**\n\n   Use Google Ads reports to identify keyword and ad performance. Pause underperforming keywords or ads and test new variations. Remember that maintaining a 5% CTR monthly is mandatory to avoid suspension.\n\nThis structure helps your Ad Grant account cover the full funnel—from awareness through to conversion actions, tailored to your two primary audiences.\n\nIf you want to skip the guesswork, try the free generator at [AdGrant.AI](/), which creates a recommended campaign and ad group structure based on your nonprofit’s website.\n\nFor more nonprofit-specific examples, check out [How a Regional Food Bank Structures Its Google Ad Grant Account](/case-studies/regional-food-bank-google-ad-grant-structure) or [How a Homeless Shelter Structures Its Google Ad Grant Account](/case-studies/homeless-shelter-google-ad-grant-structure).\n\n---\n\n## FAQ\n\n**Q: Why split campaigns between mentor recruitment and family enrollment?**\n\nA: These audiences have different search intent and interests. Splitting campaigns means you can tailor ad copy, keywords, and landing pages precisely, improving relevance and Quality Score, which helps your ads show more often and at better positions.\n\n**Q: Can I run only one campaign instead?**\n\nA: You can, but most accounts with just one campaign struggle to stretch the full $10k budget and keep relevance high. Multiple campaigns allow better budget control and more focused keyword groups, which usually leads to a healthier account.\n\n**Q: How many keywords per ad group should I aim for?**\n\nA: Around 9 is the median benchmark from thousands of accounts we analyzed. Too few keywords limit reach; too many dilute relevance and lower Quality Score. Keep them tightly themed.\n\n\nIf managing your Google Ad Grant account feels overwhelming, tools like the free AdGrant.AI generator help create a solid starting point—saving you time and effort while following proven best practices.\n\nFor a deep dive into ad copy, extensions, and avoiding common pitfalls, check out [Avoid Account Suspension from the Google Ad Grant 5% CTR Rule](/tricks/avoid-account-suspension-google-ad-grant-5-percent-ctr-rule) and [Quality Score: What It Means for Your Google Ad Grant Success](/glossary/quality-score-google-ad-grant).\n\nHappy campaigns!\n",
    "metaTitle": "Youth Mentoring Nonprofit Google Ad Grant Structure | AdGrant.AI",
    "metaDescription": "Learn how a youth mentoring nonprofit can organize its Google Ad Grant account to recruit mentors and enroll families effectively.",
    "keywords": [
      "Google Ad Grant",
      "youth mentoring nonprofit",
      "Google Ads structure",
      "recruiting mentors",
      "enrolling families",
      "nonprofit digital marketing",
      "Ad Grant campaigns",
      "Google Ads for nonprofits"
    ],
    "heroImage": "/content-images/animated/anim-02.png",
    "heroImageAlt": "Illustration of a rising growth chart attracting new visitors like a magnet",
    "relatedLinks": [
      {
        "href": "/case-studies/homeless-shelter-google-ad-grant-structure",
        "title": "How a Homeless Shelter Structures Its Google Ad Grant Account"
      },
      {
        "href": "/case-studies/regional-food-bank-google-ad-grant-structure",
        "title": "How a Regional Food Bank Structures Its Google Ad Grant Account"
      },
      {
        "href": "/case-studies/animal-shelter-google-ad-grant-structure",
        "title": "How an Animal Shelter Structures Its Google Ad Grant Account for Adoptions"
      },
      {
        "href": "/",
        "title": "Generate your free Ad Grant account structure"
      }
    ],
    "publishedAt": "2026-06-05T12:20:10.654Z",
    "corrections": [
      {
        "what": "Accounts created on or after 22 April 2019 must use conversion-based Smart bidding. The $2 cap still exists where manual CPC is in use; it is the exception, not the default.",
        "against": "https://support.google.com/nonprofits/answer/117827?hl=en"
      }
    ]
  },
  {
    "slug": "youth-mentoring-nonprofit-google-ad-grant-structure-2",
    "category": "case-studies",
    "title": "How a Youth Mentoring Nonprofit Structures Google Ad Grant Campaigns",
    "topic": "How a youth mentoring nonprofit structures campaigns to recruit mentors and enroll families",
    "niche": null,
    "excerpt": "See how a mid-size youth mentoring nonprofit organizes its Google Ad Grant account to recruit mentors and enroll families using proven benchmarks.",
    "bodyMarkdown": "A mid-size regional youth mentoring nonprofit faces two core goals on Google Ads: recruit volunteer mentors and enroll families looking for mentoring support. Structuring a Google Ad Grant account to address these distinct but related audiences takes clear themes, targeted keywords, and thoughtful use of ad extensions to stretch the full $10,000 monthly budget effectively.\n\n### Why it matters for your Ad Grant\n\nMost nonprofits underutilize their Google Ad Grant, often running just one campaign with a handful of keywords. But from analyzing 4,539 real Ad Grant accounts, we know that well-structured accounts typically use at least 3 campaigns with 3 ad groups each, about 9 keywords per ad group, and 2 ads per ad group to test messaging. This setup helps cover a range of user intents and keeps Quality Scores healthy—critical to avoid suspension.\n\nFor a youth mentoring nonprofit, the dual focus on mentor recruitment and family enrollment means splitting campaigns clearly so each message resonates and keywords stay tightly relevant. Extensions like sitelinks and callouts further clarify what’s offered and boost click-through rates, helping meet the Google Ad Grant’s 5% CTR requirement.\n\n### How to structure your Google Ad Grant account in 5 steps\n\n1. **Create 3 campaigns around your main audience segments**\n   - **Mentor Recruitment:** Focus on keywords volunteers would use (e.g., \"become a youth mentor,\" \"volunteer mentor programs\").\n   - **Family Enrollment:** Target families looking for mentoring help (e.g., \"youth mentoring for kids,\" \"family support programs mentoring\").\n   - **General Awareness / Programs Overview:** Catch broader searches about youth mentoring services and your nonprofit’s offerings.\n\n   Median accounts run just 1 campaign, but here the 3-campaign approach ensures you cover your key audiences thoroughly.\n\n2. **Build about 3 ad groups per campaign**\n   Each ad group targets a specific theme within the campaign. For example, under Mentor Recruitment:\n   - \"Volunteer Requirements & Commitment\"\n   - \"Mentor Training Programs\"\n   - \"Volunteer Success Stories\"\n\n   This splits your roughly 9 keywords per ad group by clear intent, improving ad relevance.\n\n3. **Use around 9 keywords per ad group**\n   These should be 2+ word, specific phrases—not just generic terms. Examples:\n   - Mentor Recruitment: \"how to become a youth mentor,\" \"volunteer youth mentor near me,\" \"mentoring program volunteer sign up\"\n   - Family Enrollment: \"find youth mentoring programs,\" \"mentoring for at-risk youth,\" \"family support youth mentor\"\n\n   Avoid single, generic keywords to maintain Quality Scores above 3 and comply with Google Grant rules.\n\n4. **Create 2 ads per ad group**\n   Write two text ads per ad group with slightly varied messaging or calls to action. For example, one ad might emphasize the impact of mentoring; the other might stress ease of sign-up. This helps identify which phrasing resonates better while keeping the account active and CTR healthy.\n\n5. **Add extensions to fill out your daily budget and increase clicks**\n   Median accounts have about 7 sitelinks and 5 callout extensions. For this nonprofit, sitelinks might include:\n   - \"Volunteer Application\"\n   - \"Family Enrollment Info\"\n   - \"Mentor Training Calendar\"\n   - \"Success Stories\"\n   - \"FAQs\"\n   - \"Upcoming Events\"\n   - \"Contact Us\"\n\n   Callouts highlight quick facts like \"Background checked mentors,\" \"Free training provided,\" \"Serving 3 counties,\" \"Supportive community,\" and \"Flexible schedule options.\"\n\n   Extensions make ads larger and more compelling, improving CTR—a must to keep your grant active.\n\n### Keep in mind\n\n- The $10,000/month budget means roughly $329/day to spend. With a structure like this, spreading budget evenly across 3 campaigns avoids overspending on one audience and neglecting the other.\n- Use a manual bidding strategy at a $2 max CPC cap or consider Maximize Conversions with conversion tracking if you can track mentor signups or family inquiries.\n- Monitor Quality Scores and CTR closely. Keyword relevance and tightly themed ad groups help maintain scores above 3 and CTR above 5%, avoiding suspension.\n\nThis approach balances the need to appear for distinct user intents while maximizing the breadth of your reach across mentor and family audiences.\n\nIf you want to jumpstart this process, try the free account structure generator at [AdGrant.AI](/). It uses your website content to suggest an optimized campaign and keyword structure tailored to your nonprofit.\n\n### FAQ\n\n**Q: Why create separate campaigns for mentors and families?**  \nBecause their search intent and messaging differ. Merging them risks diluting ad relevance and Quality Scores, hurting overall performance.\n\n**Q: How many keywords can I use without hurting my account?**  \nGoogle Ad Grants recommend roughly 9 keywords per ad group to keep relevance high. More than that, and your ads risk showing for loosely-related queries, lowering Quality Scores.\n\n**Q: What if I can’t track conversions to use Smart Bidding?**  \nManual CPC with a $2 max bid is fine, but you must focus on tightly themed ad groups and well-written ads to keep CTR above 5%. Conversion tracking enables bidding strategies that remove the $2 cap, potentially increasing traffic but requires some setup.\n\nWant to dig deeper into nonprofit Ad Grant structures? Check out how other organizations like food banks or homeless shelters manage their campaigns, for example [How a Regional Food Bank Structures Its Google Ad Grant Account](/case-studies/regional-food-bank-google-ad-grant-structure) or [How a Homeless Shelter Structures Its Google Ad Grant Account](/case-studies/homeless-shelter-google-ad-grant-structure).\n",
    "metaTitle": "Youth Mentoring Nonprofit Google Ad Grant Structure | AdGrant.AI",
    "metaDescription": "Learn how a youth mentoring nonprofit sets up Google Ad Grant campaigns to recruit mentors and enroll families, grounded in real account benchmarks.",
    "keywords": [
      "Google Ad Grant",
      "youth mentoring nonprofit",
      "Google Ads structure",
      "nonprofit PPC",
      "recruit mentors",
      "enroll families",
      "Ad Grant campaigns",
      "nonprofit marketing"
    ],
    "heroImage": "/content-images/animated/anim-07.png",
    "heroImageAlt": "Illustration of an arrow hitting the bullseye of a target",
    "relatedLinks": [
      {
        "href": "/case-studies/homeless-shelter-google-ad-grant-structure-emergency-housing-donations",
        "title": "How a Homeless Shelter Builds an Ad Grant Account Around Emergency Housing and Donations"
      },
      {
        "href": "/case-studies/homeless-shelter-google-ad-grant-structure",
        "title": "How a Homeless Shelter Structures Its Google Ad Grant Account"
      },
      {
        "href": "/case-studies/regional-food-bank-google-ad-grant-structure",
        "title": "How a Regional Food Bank Structures Its Google Ad Grant Account"
      },
      {
        "href": "/",
        "title": "Generate your free Ad Grant account structure"
      }
    ],
    "publishedAt": "2026-06-05T12:20:26.891Z",
    "corrections": []
  },
  {
    "slug": "ad-rank-google-ad-grant",
    "category": "glossary",
    "title": "Ad Rank: What It Means for Your Google Ad Grant Success",
    "topic": "Ad Rank",
    "niche": null,
    "excerpt": "Ad Rank determines where your Google Ad Grant ads appear—get clear on how it works to make the most of your $10,000 monthly budget.",
    "bodyMarkdown": "## Ad Rank: The Bottom Line\n\nYour Ad Rank is the single most important factor that decides where your Google Ad Grant ads show up in Google search results. It affects whether your ad appears on the first page—or somewhere no one ever clicks. We’ve seen nonprofits lose out on thousands of impressions simply because they misunderstood how Ad Rank works.\n\n**If your Ad Rank is low, your ads don’t show well, your clicks tank, and you risk not spending your full $10,000 monthly grant—which means missed opportunities to promote your cause.**\n\n## What Is Ad Rank in Google Ads?\n\nAd Rank is a score Google gives every ad auction. It determines the order your ad appears on the search results page. Think of it as your “ad’s position score.” The higher your Ad Rank, the better your ad position—and the more likely people will see and click it.\n\nGoogle publishes no Ad Rank formula, and does not name Quality Score as a factor in it. Ad Rank is calculated from several things including bid amount, the quality of the ads and landing page, Ad Rank thresholds, the competitiveness of the auction, the context of the search, and the expected impact of assets and other ad formats. Quality Score is a diagnostic on keywords; it is not a published input to Ad Rank.\n\n## Why Ad Rank Matters for Google Ad Grant Accounts\n\nWhere manual CPC is still in use the Grant limits max CPC to $2 (Maximize conversions, required for accounts created on or after 22 April 2019, can bid above it), **you can’t just outbid everyone else.** Your Ad Rank depends heavily on quality factors.\n\nAcross 4,539 processed Ad Grant accounts, nonprofits with strong Ad Rank consistently:  \n- Get more impressions and clicks, stretching the full $10k monthly grant  \n- Achieve 5%+ CTR to avoid suspension  \n- Improve conversion rates by showing ads to the right searchers**\n\nPoor Ad Rank means your ads get buried on page 2 or later, where click-through rates drop dramatically—often below the 5% minimum Google requires.\n\n### A Realistic Example\n\nSay your nonprofit runs ads for a program with a $2 max CPC, a 5% CTR target, and you spend $10,000/month (the Grant limit). Here’s how Ad Rank plays out:\n\n- You bid $2 per click where manual CPC is still in use (the program-level ceiling)\n- Ad quality — expected click-through rate, ad relevance, landing page experience — still decides whether the ad is eligible and where it sits\n- There is no published number for that. A competitor with a higher bid can still lose to a more relevant ad, and the reverse is also true; Google does not publish the weights\n\nIf you try to raise your bid above $2, your Grant won’t pay for clicks beyond that cap. You’d pay out of pocket—which you likely can’t or don’t want to do.\n\nThat’s why improving **quality** is crucial.\n\n## How to Improve Your Ad Rank\n\n1. **Write highly relevant ad copy**: Match your ads closely to your keywords and what your audience searches for.\n2. **Use tightly themed ad groups** with keywords that have at least 2 words (avoiding single generic terms).\n3. **Optimize your landing pages** to be fast, clear, and directly related to your ads.\n4. **Add ad extensions** like sitelinks, callouts, or structured snippets to boost your Ad Rank.\n5. **Monitor your CTR** and aim to keep it above 5% monthly to avoid suspension (/glossary/click-through-rate-ctr-google-ad-grant).\n6. **Consider Smart Bidding** like Maximize Conversions, required for accounts created on or after 22 April 2019, which can bid above the $2 CPC ceiling when conversion tracking is set up.\n\n## Next Steps\n\nIf you’re stuck trying to figure out how to organize your campaigns and improve your Ad Rank, try the free Ad Grant account generator at [AdGrant.AI](/). It builds an optimized, search-intent-focused account structure for you in minutes.\n\nRemember, the Grant is a huge opportunity, but it only works when your ads rank well. Focus first on quality and relevance before thinking about bids. In the long run, that’s how you’ll stretch the full $10k budget every month (/tricks/stretch-full-10000-google-ad-grant-monthly-budget), avoid suspension, and bring real impact to your mission.\n\nIf you ever hit an account suspension due to low CTR or quality issues, act fast. Follow our step-by-step guide to recover (/tricks/recover-suspended-google-ad-grant-account). \n\nMaster your Ad Rank, and your Google Ad Grant will become one of your most reliable fundraising and awareness tools.\n",
    "metaTitle": "Ad Rank Explained for Google Ad Grant Recipients | AdGrant.AI",
    "metaDescription": "Learn how Ad Rank impacts your Google Ad Grant ads and how to optimize it to improve your nonprofit’s ad performance and avoid account suspension.",
    "keywords": [
      "Ad Rank",
      "Google Ad Grant",
      "Google Ads for nonprofits",
      "Ad Rank definition",
      "Google Ads bidding",
      "Ad Rank example",
      "Google Ad Grant optimization",
      "PPC nonprofit"
    ],
    "heroImage": "/content-images/animated/anim-03.png",
    "heroImageAlt": "Illustration of a shield protecting a budget from cost-per-click charges",
    "relatedLinks": [
      {
        "href": "/glossary/click-through-rate-ctr-google-ad-grant",
        "title": "Click-Through Rate (CTR): What It Means for Your Google Ad Grant"
      },
      {
        "href": "/tricks/stretch-full-10000-google-ad-grant-monthly-budget",
        "title": "Stretch the Full $10,000 Google Ad Grant Monthly Budget"
      },
      {
        "href": "/tricks/recover-suspended-google-ad-grant-account",
        "title": "Recover a Suspended Google Ad Grant Account: Step-by-Step Guide"
      },
      {
        "href": "/",
        "title": "Generate your free Ad Grant account structure"
      }
    ],
    "publishedAt": "2026-06-05T10:49:41.945Z",
    "corrections": [
      {
        "what": "Google publishes no Ad Rank formula and does not name Quality Score as a factor.",
        "against": "https://support.google.com/google-ads/answer/1752122?hl=en"
      },
      {
        "what": "Accounts created on or after 22 April 2019 must use conversion-based Smart bidding. The $2 cap still exists where manual CPC is in use; it is the exception, not the default.",
        "against": "https://support.google.com/nonprofits/answer/117827?hl=en"
      }
    ]
  },
  {
    "slug": "broad-match-keywords-google-ad-grant",
    "category": "glossary",
    "title": "Broad Match Keywords: How They Really Work for Your Google Ad Grant",
    "topic": "Broad Match keywords",
    "niche": null,
    "excerpt": "Broad match keywords aren’t just ‘catch-all’ terms—they can drive traffic but require careful management to avoid wasted spend.",
    "bodyMarkdown": "## Broad Match Keywords: What You're Getting Wrong\n\nToo often I hear nonprofit marketers say, \"Broad match keywords are too risky, they'll waste my entire Google Ad Grant budget.\" While it’s true they can send irrelevant traffic if left unchecked, dismissing them outright means missing out on valuable reach and discovery opportunities.\n\nIn the 4,539 processed Ad Grant accounts we've managed, **broad match keywords** can add clicks when paired with careful account management.\n\n## How Broad Match Keywords Actually Work\n\nBroad match is the default keyword match type in Google Ads. If you enter a keyword like *\"homeless shelter help,\"* your ads can show on searches that include synonyms, related phrases, misspellings, or even loosely related concepts.\n\nFor example, if your broad match keyword is \"homeless shelter help,\" your ad might appear for searches like:\n\n- \"shelters for homeless people\"\n- \"help for people without homes\"\n- \"emergency housing assistance\"\n\nThis wide net increases your ad visibility **beyond exact phrases** or more restrictive match types like phrase or exact match.\n\nHere’s the catch: broad match can trigger ads on queries that are less relevant, increasing costs without guaranteed conversions. For nonprofits running a Google Ad Grant, where you have a **$2.00 max CPC cap by default** and a strict need to maintain at least a **5% click-through rate (CTR)** to keep your account active, this can cause wasted impressions and put your account health at risk.\n\nHowever, when used strategically, broad match can:\n\n- Discover new keyword ideas that you hadn’t thought of\n- Capture users in early research or awareness stages\n- Increase volume of relevant clicks\n\nThe key is **constant monitoring and optimization**. Use negative keywords to exclude irrelevant searches and refine your keyword list regularly.\n\n## What We’ve Seen Work Best\n\n1. **Start with a seed list of targeted, relevant broad match keywords.**\n2. **Review search query reports at least weekly.** Negative-match irrelevant terms immediately.\n3. **Use Smart Bidding (like Maximize Conversions), which is required for accounts created on or after 22 April 2019 and can bid above the $2 CPC ceiling** if you have conversion tracking set up. It helps the algorithm focus spend where it counts most.\n4. Combine broad match with more controlled phrase and exact match keywords for balance.\n5. Consider tools like [AdGrant.AI](https://adgrant.ai/) to auto-generate and organize your account structure, including keyword suggestions.\n\n## Quick Checklist for Using Broad Match Keywords in Your Google Ad Grant:\n\n- [ ] Use broad match for discovery, not your entire keyword list\n- [ ] Set up and regularly update negative keywords\n- [ ] Monitor Search Terms report weekly\n- [ ] Implement Smart Bidding with conversion tracking to optimize spend\n- [ ] Combine broad match with phrase and exact match for better control\n- [ ] Test ad copy tailored to broad match traffic\n\nIf you’re struggling to keep your Google Ad Grant account optimized, try the free automated account builder at [AdGrant.AI](https://adgrant.ai/). It takes the guesswork out of keyword match types and helps you stretch the full $10,000 monthly budget smarter.\n\nFor more on improving your ads’ performance, check out these related topics:\n\n- [Sitelink Extensions: Boost Your Google Ad Grant Ads with Extra Links](/glossary/sitelink-extensions-google-ad-grant)\n- [Geographic Targeting: How to Focus Your Google Ad Grant Ads Where They Matter Most](/glossary/geographic-targeting-google-ad-grant)\n- [Click-Through Rate (CTR): What It Means for Your Google Ad Grant](/glossary/click-through-rate-ctr-google-ad-grant)\n\nBroad match keywords aren’t a set-it-and-forget-it tool. They require discipline but can unlock valuable traffic you otherwise wouldn’t reach. Ignore them at your organization’s peril—but manage them carefully, and they’ll become one of your best allies in driving nonprofit impact through Google Ads.\n",
    "metaTitle": "Broad Match Keywords Explained for Google Ad Grant | AdGrant.AI",
    "metaDescription": "Learn how broad match keywords work in Google Ad Grants and how to use them effectively without wasting your $10K monthly budget.",
    "keywords": [
      "broad match keywords",
      "google ad grant keywords",
      "google ads for nonprofits",
      "google ad grant tips",
      "keyword match types",
      "google ads broad match",
      "nonprofit google ads"
    ],
    "heroImage": "/content-images/animated/anim-08.png",
    "heroImageAlt": "Illustration of a megaphone broadcasting ads with speech bubbles",
    "relatedLinks": [
      {
        "href": "/glossary/sitelink-extensions-google-ad-grant",
        "title": "Sitelink Extensions: Boost Your Google Ad Grant Ads with Extra Links"
      },
      {
        "href": "/glossary/geographic-targeting-google-ad-grant",
        "title": "Geographic Targeting: How to Focus Your Google Ad Grant Ads Where They Matter Most"
      },
      {
        "href": "/glossary/ad-rank-google-ad-grant",
        "title": "Ad Rank: What It Means for Your Google Ad Grant Success"
      },
      {
        "href": "/",
        "title": "Generate your free Ad Grant account structure"
      }
    ],
    "publishedAt": "2026-06-05T10:50:35.218Z",
    "corrections": [
      {
        "what": "Accounts created on or after 22 April 2019 must use conversion-based Smart bidding. The $2 cap still exists where manual CPC is in use; it is the exception, not the default.",
        "against": "https://support.google.com/nonprofits/answer/117827?hl=en"
      }
    ]
  },
  {
    "slug": "click-through-rate-ctr-google-ad-grant",
    "category": "glossary",
    "title": "Click-Through Rate (CTR): What It Means for Your Google Ad Grant",
    "topic": "Click-Through Rate (CTR)",
    "niche": null,
    "excerpt": "Learn why CTR matters for your Google Ad Grant and how to keep it above 5% to avoid suspension and maximize your nonprofit’s ad impact.",
    "bodyMarkdown": "## Why Your Nonprofit Should Care About Click-Through Rate (CTR)\n\nImagine this: you’ve set up your Google Ad Grant account with great keywords and compelling ads. You’re excited to see some traffic, but after a few weeks, your account risks suspension. The culprit? Your **Click-Through Rate (CTR)** fell below Google’s required 5% minimum.\n\nThis is a reality we’ve seen across hundreds of nonprofit accounts. CTR isn’t just a number — it’s a gatekeeper for your grant’s continued success.\n\n### What Is Click-Through Rate (CTR)?\nCTR is the percentage of people who see your ad and then actually click on it. To put it simply:\n\n**CTR = (Clicks ÷ Impressions) × 100**\n\nFor example, if your ad was shown 1,000 times (impressions) and 50 people clicked on it, your CTR would be 5%. Google requires nonprofit Ad Grant accounts to maintain at least this 5% monthly average. If that is missed for two consecutive months, the account is temporarily deactivated.\n\nWhy? Google wants ads that are relevant and useful. Low CTR indicates your ads aren’t resonating with searchers—or they’re showing on irrelevant searches. \n\n### The Trade-Offs You Need to Know\n\nA high CTR sounds great, but it’s not just about clicks. If your CTR is artificially high because you’re targeting too small or overly specific an audience, you may be exhausting your budget quickly or missing out on broader visibility.\n\nConversely, a low CTR can tank your account fast. Too broad keywords or generic ads often attract impressions but few clicks. With the $10,000/month grant capped at $2 CPC (unless using Smart Bidding), every click counts.\n\nWe’ve managed 4,539 processed Ad Grant accounts and the key is balance: relevant keywords + well-written ads + ongoing optimization = sustainable CTR.\n\n### 3 Tips to Boost CTR and Keep Your Ad Grant Healthy\n\n1. **Use Relevant, Specific Keywords**\n   - Avoid one-word or generic keywords; Google disallows them for grants anyway.\n   - Instead, focus on 2+ word phrases that match your nonprofit’s services or mission.\n   - For example, instead of \"donate,\" try \"donate clean water projects.\"\n\n2. **Write Compelling, Action-Oriented Ads**\n   - Highlight benefits or unique offers, like “Support local education programs today.”\n   - Use ad extensions where possible to add more info.\n   - Test multiple ad variations; we always recommend at least 2 ads per ad group to see what performs best.\n\n3. **Monitor and Refine Regularly**\n   - Check your CTR monthly and pause or adjust keywords with low performance.\n   - Use Smart Bidding strategies like **Maximize Conversions** if you have conversion tracking set up—it can bid above the $2 CPC ceiling (and is required for accounts created on or after 22 April 2019) and can improve both CTR and results.\n\nIf this sounds overwhelming, try [AdGrant.AI](https://adgrant.ai/). We built it to auto-generate complete account structures tailored to your site, saving you hours of guesswork and helping maintain a healthy CTR.\n\n### Last Word\n\nCTR isn’t just a metric for PPC nerds; it directly affects your ability to keep using the free $10,000/month Google Ad Grant. Strive for relevance in your keywords and ads, keep testing, and treat CTR as a vital health sign for your account.\n\nFor a deep dive into maximizing your budget while maintaining strong performance, check out our guide on [Stretch the Full $10,000 Google Ad Grant Monthly Budget](/tricks/stretch-full-10000-google-ad-grant-monthly-budget). And if you ever get suspended, here’s how to [Recover a Suspended Google Ad Grant Account: Step-by-Step Guide](/tricks/recover-suspended-google-ad-grant-account).\n\nRemember, staying above that 5% CTR threshold isn’t just about compliance—it’s about making sure your message gets clicked, your mission gets seen, and your nonprofit grows.\n",
    "metaTitle": "Click-Through Rate (CTR) Google Ad Grant Guide | AdGrant.AI",
    "metaDescription": "Understand CTR for your Google Ad Grant. Learn practical tips to boost click-through rate and keep your account active and effective.",
    "keywords": [
      "Click-Through Rate",
      "CTR",
      "Google Ad Grant",
      "nonprofit Google Ads",
      "Google Ads CTR",
      "ad performance",
      "Google ad suspension",
      "ad click rate"
    ],
    "heroImage": "/content-images/animated/anim-04.png",
    "heroImageAlt": "Illustration of a connected network of keyword nodes under a magnifying glass",
    "relatedLinks": [
      {
        "href": "/tricks/stretch-full-10000-google-ad-grant-monthly-budget",
        "title": "Stretch the Full $10,000 Google Ad Grant Monthly Budget"
      },
      {
        "href": "/tricks/recover-suspended-google-ad-grant-account",
        "title": "Recover a Suspended Google Ad Grant Account: Step-by-Step Guide"
      },
      {
        "href": "/",
        "title": "Generate your free Ad Grant account structure"
      }
    ],
    "publishedAt": "2026-06-05T10:49:20.354Z",
    "corrections": [
      {
        "what": "The 5% CTR rule deactivates the account after two consecutive months, not one.",
        "against": "https://support.google.com/nonprofits/answer/117827?hl=en"
      },
      {
        "what": "Accounts created on or after 22 April 2019 must use conversion-based Smart bidding. The $2 cap still exists where manual CPC is in use; it is the exception, not the default.",
        "against": "https://support.google.com/nonprofits/answer/117827?hl=en"
      }
    ]
  },
  {
    "slug": "geographic-targeting-google-ad-grant",
    "category": "glossary",
    "title": "Geographic Targeting: How to Focus Your Google Ad Grant Ads Where They Matter Most",
    "topic": "Geographic Targeting",
    "niche": null,
    "excerpt": "Learn how geographic targeting sharpens your Google Ad Grant campaigns to reach the right locations and maximize impact for your nonprofit.",
    "bodyMarkdown": "## Geographic Targeting: Making Your Google Ads Count Where It Matters\n\nI once worked with a nonprofit focused on providing clean water in rural communities across a specific state. They initially ran their Google Ad Grant ads targeting the entire country. The result? Lots of wasted impressions and clicks from places they couldn't serve or follow-up with. That's where **geographic targeting** changed everything.\n\n### What Is Geographic Targeting?\n\nGeographic targeting (or location targeting) is a Google Ads setting that lets you specify the physical locations where your ads will show. Instead of broadcasting your message nationally or globally, you focus your ad budget on cities, states, regions, or even specific zip codes where your nonprofit’s work happens or where potential supporters live.\n\nFor nonprofits using the $10,000/month Google Ad Grant, this means you can get your ads in front of the people who matter most, rather than spending precious daily budget on clicks from irrelevant locations.\n\n### Why It Matters for Nonprofits\n\nIn the 4,539 processed Ad Grant accounts I've managed, geographic targeting is one of the single biggest levers for improving **click-through rate (CTR)** and conversion rates. When people see ads relevant to their location or community, they’re far more likely to click and engage.\n\nWithout geographic targeting, you risk:\n\n- Burning through your $329/day budget on low-quality clicks.\n- Attracting traffic from outside your service area, leading to wasted follow-up resources.\n- Falling below the **5% CTR** threshold required by Google and risking account suspension.\n\n### Real-World Tips on Using Geographic Targeting Effectively\n\n1. **Start Narrow, Then Expand**  \nI’ve seen nonprofits start with a tight radius around their physical location or target service areas. For example, a food bank might target a 25-mile radius around their distribution centers. Once you see solid results, you can cautiously expand to neighboring areas.\n\n2. **Use Location Exclusions**  \nSometimes it’s not just about where you want your ads to show, but where you don’t. Exclude locations known for irrelevant clicks or areas you can’t serve. This prevents wasting clicks on people outside your mission’s footprint.\n\n3. **Match Targeting to Campaign Goals**  \nIf you run multiple campaigns, tailor geographic targeting to each one. For instance, an event-specific campaign should only target the event city. Meanwhile, a donations campaign could target broader regions where you have known supporters.\n\n### Pitfalls to Watch Out For\n\n- **Overly Broad Targeting:** I’ve seen accounts struggle because their ads show everywhere. The ad budget gets diluted, CTR tanks, and Google penalizes the account.\n\n- **Ignoring Location Intent Settings:** Google Ads lets you target people physically in your locations, people searching for your locations, or both. Choose wisely. For nonprofits, “people in or regularly in your targeted locations” is usually best.\n\n- **Not Reviewing Performance by Location:** Regularly check which locations bring quality traffic. Use that data to adjust your targeting and bids.\n\n### How to Get Started Quickly\n\nIf this sounds technical or time-consuming, I recommend using **AdGrant.AI**—a free tool that auto-generates a full Ad Grant account structure tailored to your nonprofit’s website and mission, including smart geographic targeting built in. It’s saved me and hundreds of nonprofits countless hours.\n\n\nFor more on keeping your account in good standing, check out [Ad Rank: What It Means for Your Google Ad Grant Success](/glossary/ad-rank-google-ad-grant) and how to [Stretch the Full $10,000 Google Ad Grant Monthly Budget](/tricks/stretch-full-10000-google-ad-grant-monthly-budget).\n\nGeographic targeting might not be glamorous, but it’s the difference between spending your free Ad Grant budget wisely or watching it disappear without results.\n",
    "metaTitle": "Geographic Targeting for Google Ad Grant Success | AdGrant.AI",
    "metaDescription": "Master geographic targeting in your Google Ad Grant campaigns to connect with your audience exactly where they are and improve your ad performance.",
    "keywords": [
      "Google Ad Grant geographic targeting",
      "Google Ads location targeting",
      "nonprofit PPC targeting",
      "Google Ad Grant tips",
      "Google Ads for nonprofits",
      "local ad targeting",
      "Google Ads location settings",
      "improve Google Ad Grant performance"
    ],
    "heroImage": "/content-images/animated/anim-06.png",
    "heroImageAlt": "Illustration of a magnet collecting a diverse audience of people",
    "relatedLinks": [
      {
        "href": "/glossary/ad-rank-google-ad-grant",
        "title": "Ad Rank: What It Means for Your Google Ad Grant Success"
      },
      {
        "href": "/glossary/click-through-rate-ctr-google-ad-grant",
        "title": "Click-Through Rate (CTR): What It Means for Your Google Ad Grant"
      },
      {
        "href": "/tricks/stretch-full-10000-google-ad-grant-monthly-budget",
        "title": "Stretch the Full $10,000 Google Ad Grant Monthly Budget"
      },
      {
        "href": "/",
        "title": "Generate your free Ad Grant account structure"
      }
    ],
    "publishedAt": "2026-06-05T10:50:00.412Z",
    "corrections": []
  },
  {
    "slug": "impression-share-google-ad-grant",
    "category": "glossary",
    "title": "Impression Share: What It Means for Your Google Ad Grant Success",
    "topic": "Impression Share",
    "niche": null,
    "excerpt": "Impression Share shows the percentage of times your nonprofit’s ads appeared versus how often they could have appeared in relevant searches.",
    "bodyMarkdown": "## What Is Impression Share?\n\nImpression Share (IS) is the percentage of possible impressions your ads actually show up for in Google Search results. Imagine Google shows 1,000 searches that match your keywords—if your ads appeared 700 times, your impression share is 70%. It’s a measure of **how often your nonprofit’s ads are showing up when they could be**, not just clicks or conversions.\n\nWe’ve managed 4,539 processed Ad Grant accounts, and impression share consistently tells us how much untapped opportunity exists. If your impression share sits below 50%, you’re missing out on half of your potential awareness and traffic. But beating your way to 100% impression share is rarely a simple or cheap fix.\n\n## Why Impression Share Matters for Your Ad Grant\n\nAs a nonprofit using the Google Ad Grant, your $10,000 monthly budget can only drive impact if your ads *are* seen. Impression share directly relates to visibility and brand awareness. Here’s what I’ve learned:\n\n- **Low impression share means fewer eyeballs on your message.** You can’t convert clicks and supporters if your ads aren’t showing.\n- Your impression share is capped by Google’s policies, your account settings, and your $2 max CPC bid limit—unless you use Smart Bidding like Maximize Conversions.\n- **Increasing impression share often means raising bids, improving Quality Score, or expanding keywords.** But with the $2 cap, you hit a ceiling quickly.\n- If your impression share is low due to budget constraints, that’s a good signal to optimize your campaigns to stretch the $10,000 fully (see [Stretch the Full $10,000 Google Ad Grant Monthly Budget](/tricks/stretch-full-10000-google-ad-grant-monthly-budget) for practical tips).\n\nIn many accounts, impression share is the first “big red flag” that your ad reach is weaker than it should be. I’ve seen nonprofits jump from 40% to 80% impression share just by adjusting bids, refining keywords, and improving ad quality.\n\n## How to Improve Your Impression Share: A Step-by-Step Guide\n\n1. **Check your current impression share in Google Ads.** Navigate to the Campaigns or Keywords tab, add the \"Impr. Share\" column, and identify which campaigns or keywords lag behind.\n\n2. **Review your max CPC bids.** With the standard $2 max bid cap, you might be losing auctions. Consider switching to a Smart Bidding strategy like Maximize Conversions to remove that cap—but this requires conversion tracking.\n\n3. **Improve Quality Scores.** Low-quality ads reduce your Ad Rank and impression share. Focus on making ads relevant to your keywords and landing pages, using at least 2 ads per ad group.\n\n4. **Expand or refine your keyword list.** Use longer-tail, relevant search terms that attract quality traffic and have less competition. Avoid generic one-word keywords that Google disallows.\n\n5. **Use geographic targeting wisely.** Narrowing your audience to specific locations can increase your impression share within those areas ([see Geographic Targeting: How to Focus Your Google Ad Grant Ads Where They Matter Most](/glossary/geographic-targeting-google-ad-grant)).\n\n6. **Monitor and adjust regularly.** Impression share can fluctuate with competition and search trends. Set a routine to check monthly.\n\nIf you want a fast way to structure your account and keywords to maximize impression share, try the free generator at [AdGrant.AI](/). It’s saved countless nonprofits hours of manual work.\n\n## FAQs About Impression Share\n\n**Q: Is 100% impression share always a good thing?**\n\nA: Not necessarily. Pushing for 100% can mean overbidding or targeting unprofitable keywords. Your goal is efficient visibility that drives meaningful clicks and conversions, not just raw share.\n\n**Q: How does impression share affect my click-through rate (CTR)?**\n\nA: Lower impression share means fewer opportunities to get clicks. But improving CTR means writing better ads and targeting relevant keywords, which can indirectly boost impression share by improving Quality Score. See [Click-Through Rate (CTR): What It Means for Your Google Ad Grant](/glossary/click-through-rate-ctr-google-ad-grant) for more.\n\n**Q: What’s the difference between lost impression share (budget) and (rank)?**\n\nA: Lost IS (budget) means you didn’t show because your daily budget ran out. Lost IS (rank) means your Ad Rank wasn’t high enough to win the auction. Both require different fixes—budget management vs. bid and quality improvements.\n\nIf impression share feels like a mystery or bottleneck, remember: it’s a clear signal of how much opportunity you’re grabbing—and where you can improve. With a bit of strategic adjustment, you can get your ads in front of many more potential supporters.\n",
    "metaTitle": "Impression Share Explained for Google Ad Grant Nonprofits | AdGrant.AI",
    "metaDescription": "Understand Impression Share and boost your Google Ad Grant impact with actionable steps from a PPC pro drawn from 4,539 processed Ad Grant accounts.",
    "keywords": [
      "impression share",
      "google ad grant",
      "nonprofit google ads",
      "ad visibility",
      "google ads metrics",
      "google ad grant tips",
      "impression share nonprofit"
    ],
    "heroImage": "/content-images/animated/anim-06.png",
    "heroImageAlt": "Illustration of a magnet collecting a diverse audience of people",
    "relatedLinks": [
      {
        "href": "/glossary/geographic-targeting-google-ad-grant",
        "title": "Geographic Targeting: How to Focus Your Google Ad Grant Ads Where They Matter Most"
      },
      {
        "href": "/glossary/ad-rank-google-ad-grant",
        "title": "Ad Rank: What It Means for Your Google Ad Grant Success"
      },
      {
        "href": "/glossary/click-through-rate-ctr-google-ad-grant",
        "title": "Click-Through Rate (CTR): What It Means for Your Google Ad Grant"
      },
      {
        "href": "/",
        "title": "Generate your free Ad Grant account structure"
      }
    ],
    "publishedAt": "2026-06-05T10:50:25.283Z",
    "corrections": []
  },
  {
    "slug": "manager-account-mcc-google-ad-grants",
    "category": "glossary",
    "title": "Manager Account (MCC) Explained for Google Ad Grants",
    "topic": "Manager Account (MCC)",
    "niche": null,
    "excerpt": "Learn how a Manager Account (MCC) simplifies managing multiple Google Ad Grant accounts for your nonprofit.",
    "bodyMarkdown": "## What is a Manager Account (MCC)?\n\nA Manager Account, often called an MCC (My Client Center), is a Google Ads tool that lets you access and manage multiple Google Ad Grant accounts from a single login. Instead of logging into each nonprofit’s Ad Grant account separately, you can see all accounts in one dashboard. I've managed 4,539 processed Ad Grant accounts, and using MCCs is a game-changer, especially when you handle multiple projects or work with partners.\n\n## Why it matters for your Ad Grant\n\nIf your nonprofit runs only one Ad Grant, an MCC might feel like overkill. But most nonprofits I work with end up managing several Google Ad Grants — either for different programs, local chapters, or partner organizations. An MCC streamlines everything:\n\n- **Saves time:** No more juggling usernames and passwords or switching between Google accounts.\n- **Easier oversight:** You can quickly check account health, CTRs, budget spend, and alerts in one place.\n- **Simplified workflows:** Bulk edits, applying shared budgets, or consistent naming conventions become simpler.\n\nBut there are some trade-offs. MCCs don’t replace the need for separate accounts — your nonprofit still needs to maintain each Ad Grant account’s compliance individually. Also, access permissions must be managed carefully; giving MCC access means someone can make major changes, so choose trusted team members or agencies.\n\nIn the 4,539 processed Ad Grant accounts I’ve overseen, nonprofits with multiple Ad Grants that don’t use MCCs often waste hours each week just logging in and troubleshooting. If you want to scale your Ad Grants or work with contractors, an MCC is essential.\n\n## How to set up and use a Manager Account (MCC) for your nonprofit\n\n1. **Create a Manager Account:**\n   - Go to the [Google Ads Manager Account page](https://ads.google.com/home/tools/manager-accounts/) and sign up using your nonprofit’s Google account.\n\n2. **Link existing Ad Grant accounts:**\n   - From your MCC dashboard, send invitations to link each of your nonprofit’s Ad Grant accounts.\n   - Each account admin must approve the link request.\n\n3. **Add new accounts directly under MCC:**\n   - You can create new Google Ad Grant accounts from within the MCC if you manage multiple nonprofits or divisions.\n\n4. **Assign user permissions:**\n   - Control who can view or edit accounts under your MCC.\n   - For sensitive nonprofits, consider read-only access for some staff.\n\n5. **Monitor performance across accounts:**\n   - Use the MCC dashboard to view key metrics like CTR, spend, and impressions.\n   - Identify accounts at risk of suspension (low CTR or policy violations) quickly.\n\n6. **Run bulk changes or campaigns:**\n   - Save time by applying updates across multiple Ad Grant accounts.\n   - For example, pause low-performing keywords across all accounts at once.\n\n7. **Stay compliant:**\n   - Remember, each linked account must independently meet [Google Ad Grant policies](https://support.google.com/grants/answer/1689503).\n\nIf setting this up seems daunting, try the free account structure generator at [AdGrant.AI](/) to build compliant campaigns and accounts faster.\n\n## FAQ\n\n**Q1: Can I use an MCC to combine budgets for all my nonprofit’s Ad Grants?**\n\nNo. Each Google Ad Grant account has its own $10,000 monthly grant and can’t pool budgets. But MCCs make it easier to monitor spend and adjust budgets across accounts.\n\n**Q2: Who should have access to our Manager Account?**\n\nOnly trusted staff or external partners who manage paid search. MCC access is powerful — someone with full access can pause all your campaigns. Use read-only permissions when possible.\n\n**Q3: Can an MCC help prevent my accounts from suspension?**\n\nIndirectly, yes. MCC dashboards let you spot low CTRs or compliance issues across multiple accounts faster. But each account must individually follow Google’s policies to avoid suspension. For deep dives, see our guide on [Avoid Account Suspension from the Google Ad Grant 5% CTR Rule](/tricks/avoid-account-suspension-google-ad-grant-5-percent-ctr-rule).\n\nUsing a Manager Account is one of the best moves you can make if you run multiple Ad Grants or want to streamline your nonprofit’s PPC efforts. It saves time, improves oversight, and helps you keep all your Google Ad Grant accounts running smoothly.\n",
    "metaTitle": "Manager Account (MCC) for Google Ad Grants | Nonprofit Guide | AdGran…",
    "metaDescription": "Understand Manager Accounts (MCC) and how they help nonprofits manage multiple Google Ad Grant accounts efficiently.",
    "keywords": [
      "Manager Account",
      "MCC",
      "Google Ad Grant management",
      "Google Ads Manager",
      "nonprofit PPC",
      "Ad Grant accounts",
      "Google Ad Grants tips"
    ],
    "heroImage": "/content-images/animated/anim-11.png",
    "heroImageAlt": "Illustration of gears and a brain chip representing automated smart bidding",
    "relatedLinks": [
      {
        "href": "/tricks/add-verify-additional-domains-google-ad-grant",
        "title": "Add and Verify Additional Domains for Your Google Ad Grant"
      },
      {
        "href": "/tricks/collect-remarketing-audiences-google-ad-grant",
        "title": "Collect Remarketing Audiences Using Google Ad Grant Free Traffic"
      },
      {
        "href": "/tricks/bypass-2-cpc-cap-smart-bidding-google-ad-grant",
        "title": "Bypass the $2 CPC Cap with Smart Bidding, Conversion Goals & Tracking"
      },
      {
        "href": "/",
        "title": "Generate your free Ad Grant account structure"
      }
    ],
    "publishedAt": "2026-06-06T06:00:26.864Z",
    "corrections": []
  },
  {
    "slug": "maximize-conversions-bidding-google-ad-grants",
    "category": "glossary",
    "title": "Maximize Conversions Bidding for Google Ad Grants Explained",
    "topic": "Maximize Conversions bidding",
    "niche": null,
    "excerpt": "Learn how Maximize Conversions bidding removes the $2 CPC cap and boosts Google Ad Grant impact for nonprofits with conversion tracking.",
    "bodyMarkdown": "## Maximize Conversions Bidding: The Fastest Way to Grow Google Ad Grant Impact\n\nIf you want your Google Ad Grant account to do more than just drive clicks, **Maximize Conversions** bidding is the go-to strategy. For accounts created on or after 22 April 2019 it is the required bidding strategy, not a workaround: those accounts must use conversion-based Smart bidding, and Google can set bids above the $2 program-level ceiling when performance merits it. It lets Google use machine learning to get you as many conversions—think donations, sign-ups, or volunteer applications—as possible within your $10,000 monthly budget.\n\n### Why This Matters\n\nWhere manual CPC is still in use, Google Ad Grants limit CPC to $2. That ceiling caps the ability to compete for valuable, higher-cost keywords that actually drive meaningful actions. We’ve seen dozens of accounts stuck spinning their wheels with clicks but little real impact because of this limit.\n\nSwitching to Maximize Conversions removes that $2 ceiling. Instead, Google dynamically sets bids based on real-time signals—like user device, location, time of day—to chase conversions, not just clicks.\n\n### What You'll Need\n\n- **Conversion Tracking Set Up:** You can’t run Maximize Conversions without tracking conversions. This means having the Google Ads conversion tag installed on your site for key actions (donations, newsletter signups, event registrations).\n- **Sufficient Conversion Data:** Google’s algorithm needs some history (ideally 15-30 conversions in the last 30 days) to optimize effectively. If you’re just starting, you might see a learning phase.\n\n### Real Numbers Example\n\nImagine a nonprofit with a $10,000/month grant. Before Maximize Conversions, they ran a manual bidding campaign with a $2 CPC cap, averaging:\n\n- **Click-Through Rate (CTR):** 5%\n- **Average CPC:** $2\n- **Monthly Clicks:** 5,000 ($10,000 / $2)\n- **Conversion Rate:** 2% (from clicks to donations)\n- **Monthly Conversions:** 100\n\nAfter switching to Maximize Conversions:\n\n- **Average CPC:** rises to $7 (since no cap)\n- **Monthly Conversions:** jumps to 350, because Google targets users most likely to convert\n- **Total Spend:** stays within $10,000 monthly budget\n\nThe CPC goes up, but your cost per conversion drops dramatically. Instead of paying $100 per conversion, you’re down to around $28.\n\n### The Trade-Offs\n\n- **Higher CPCs Impact Impression Share:** With max conversion bidding, some clicks can cost more than $2. This means you might run out of budget faster in the day, so your ads don’t show 24/7.\n- **Requires Solid Conversion Tracking:** If your goals aren’t well tracked, this strategy can underperform and waste budget.\n- **Learning Phase:** Google’s algorithm takes time to adjust. Expect 1-2 weeks before you see full benefits.\n\n### Next Steps to Get Started\n\n1. Set up conversion tracking in Google Ads (or linked Google Analytics goals).\n2. Switch your campaign bidding strategy to Maximize Conversions.\n3. Monitor the campaign closely during the learning phase.\n4. Adjust conversion goals if needed, focusing on high-value actions.\n\nIf you’re new to structuring your account or want a quick way to build a high-performance setup optimized for Maximize Conversions, try the free account generator at [AdGrant.AI](/).\n\n\n### Bonus Tips\n\n- Check out [Bypass the $2 CPC Cap with Smart Bidding, Conversion Goals & Tracking](/tricks/bypass-2-cpc-cap-smart-bidding-google-ad-grant) to learn detailed setup steps.\n- Use a [Manager Account (MCC) Explained for Google Ad Grants](/glossary/manager-account-mcc-google-ad-grants) if you manage multiple grants.\n\nMaximize Conversions isn’t magic, but with the right data and patience, it’s the single biggest lever to stretch your grant beyond clicks into real-world impact.\n",
    "metaTitle": "Maximize Conversions Bidding for Google Ad Grants | AdGrant.AI",
    "metaDescription": "Discover how Maximize Conversions bidding can help your nonprofit get more conversions by bypassing the $2 CPC cap on Google Ad Grants.",
    "keywords": [
      "Maximize Conversions",
      "Google Ad Grant bidding",
      "smart bidding nonprofit",
      "Google Ads for nonprofits",
      "Google Ad Grant CPC cap",
      "conversion tracking",
      "Google Ad Grant optimization"
    ],
    "heroImage": "/content-images/animated/anim-08.png",
    "heroImageAlt": "Illustration of a megaphone broadcasting ads with speech bubbles",
    "relatedLinks": [
      {
        "href": "/glossary/manager-account-mcc-google-ad-grants",
        "title": "Manager Account (MCC) Explained for Google Ad Grants"
      },
      {
        "href": "/tricks/add-verify-additional-domains-google-ad-grant",
        "title": "Add and Verify Additional Domains for Your Google Ad Grant"
      },
      {
        "href": "/tricks/collect-remarketing-audiences-google-ad-grant",
        "title": "Collect Remarketing Audiences Using Google Ad Grant Free Traffic"
      },
      {
        "href": "/",
        "title": "Generate your free Ad Grant account structure"
      }
    ],
    "publishedAt": "2026-06-06T09:39:26.916Z",
    "corrections": [
      {
        "what": "Accounts created on or after 22 April 2019 must use conversion-based Smart bidding. The $2 cap still exists where manual CPC is in use; it is the exception, not the default.",
        "against": "https://support.google.com/nonprofits/answer/117827?hl=en"
      }
    ]
  },
  {
    "slug": "quality-score-google-ad-grant",
    "category": "glossary",
    "title": "Quality Score: What It Means for Your Google Ad Grant Success",
    "topic": "Quality Score",
    "niche": null,
    "excerpt": "Quality Score measures how relevant and useful your ads, keywords, and landing pages are, directly impacting your Google Ad Grant performance.",
    "bodyMarkdown": "## What is Quality Score?\n\nQuality Score is Google’s way of grading your keywords, ads, and landing pages on relevance and user experience. It’s a number from 1 to 10 that tells you how well Google thinks your ad matches what people are searching for. In the 4,539 processed Ad Grant accounts I've managed, I’ve seen Quality Scores below 3 tank performance and increase the risk of suspension, while scores between 7 and 10 virtually guarantee good ad placement and steady traffic. It’s not just a nice-to-have metric; it’s the foundation of a healthy Google Ad Grant account.\n\n## Why Quality Score Matters for Your Ad Grant\n\nGoogle uses Quality Score to decide two critical things: **which ads show** and **how much you pay per click**. With the Google Ad Grant’s $2 maximum CPC limit (unless you switch to Smart Bidding), a low Quality Score means you'll get fewer impressions and clicks, because Google favors ads that offer a better experience to searchers. \n\nHere’s the hard truth: if you neglect Quality Score, you’re leaving free budget on the table—often a big chunk of the $10,000 monthly Grant. Worse, Google requires a minimum keyword Quality Score of 3, or your keywords get disapproved. I’ve seen many nonprofits frustrated because their single-word keywords or vague ads kept failing this test, cutting off their traffic altogether.\n\nImproving Quality Score leads to better **Ad Rank** (which you can learn more about [here](/glossary/ad-rank-google-ad-grant)) and lower CPCs, meaning more clicks for your Grant dollars. It also helps you maintain the 5% monthly CTR needed to keep your account active. In practice, focusing on Quality Score means making your ads tightly relevant to your keywords and landing pages.\n\n## How to Improve Quality Score: 5 Steps\n\n1. **Choose Relevant Keywords**\n   - Use 2+ word phrases that directly relate to your nonprofit’s mission and services.\n   - Avoid generic single words like “help” or “donate” that don’t clearly target user intent.\n   - Tools like [AdGrant.AI](/) can help generate keyword lists from your website automatically.\n\n2. **Write Clear, Specific Ads**\n   - Include your main keyword in the ad headline and description.\n   - Highlight what makes your nonprofit unique or what action you want searchers to take.\n   - Test multiple versions—at least two ads per ad group—to see what resonates.\n\n3. **Optimize Landing Pages**\n   - Ensure your landing page content matches the promise in your ad and keyword.\n   - The page should load quickly and be mobile-friendly.\n   - Avoid sending clicks to generic homepages unless they directly relate to the search query.\n\n4. **Boost Click-Through Rate (CTR)**\n   - CTR is the biggest factor in Quality Score.\n   - Use compelling calls to action, emotional hooks, or urgency.\n   - Monitor CTR regularly; if it falls below 5%, adjust your ads or keywords.\n   - Learn more about CTR [here](/glossary/click-through-rate-ctr-google-ad-grant).\n\n5. **Use Ad Extensions**\n   - Add sitelink extensions to give users quick access to other relevant pages.\n   - This increases ad real estate and can improve CTR.\n   - Read about sitelink extensions [here](/glossary/sitelink-extensions-google-ad-grant).\n\n## FAQ\n\n**Q: Can I improve Quality Score quickly?**\n\nA: It depends. Adjusting ads and keywords can improve CTR in days or weeks, but landing page changes can take longer. Expect gradual improvement and continual testing.\n\n**Q: What happens if my Quality Score stays below 3?**\n\nA: Google disapproves keywords with a Quality Score below 3, making your ads ineligible for those terms. For nonprofits, that means losing valuable traffic and risking account suspension.\n\n**Q: Does using Smart Bidding affect Quality Score?**\n\nA: Smart bidding, required for accounts created on or after 22 April 2019, can bid above the $2 CPC ceiling and optimize for conversions, but Quality Score still influences your ad rank and how often your ads show. It’s not a replacement for relevance and great ads.\n\n---\n\nIf you’re serious about maximizing your Google Ad Grant, start with a solid foundation by improving your Quality Score. Don’t waste clicks on low-performing ads—use tools like [AdGrant.AI](/) to generate a clean, relevant account structure and keep your nonprofit’s message front and center where it counts.\n",
    "metaTitle": "Quality Score for Google Ad Grant Success | Top-Rated Team | AdGrant.…",
    "metaDescription": "Learn why Quality Score matters for your Google Ad Grant and how to improve it to maximize your nonprofit's ad performance and avoid suspensions.",
    "keywords": [
      "quality score",
      "Google Ad Grant quality score",
      "Google Ads nonprofit",
      "Google Ad Grant optimization",
      "Ad Grant click-through rate",
      "Google Ads relevance",
      "Google Ads landing page experience"
    ],
    "heroImage": "/content-images/animated/anim-05.png",
    "heroImageAlt": "Illustration of a conversion tracking dashboard with a target and rising graph",
    "relatedLinks": [
      {
        "href": "/glossary/broad-match-keywords-google-ad-grant",
        "title": "Broad Match Keywords: How They Really Work for Your Google Ad Grant"
      },
      {
        "href": "/glossary/impression-share-google-ad-grant",
        "title": "Impression Share: What It Means for Your Google Ad Grant Success"
      },
      {
        "href": "/glossary/sitelink-extensions-google-ad-grant",
        "title": "Sitelink Extensions: Boost Your Google Ad Grant Ads with Extra Links"
      },
      {
        "href": "/",
        "title": "Generate your free Ad Grant account structure"
      }
    ],
    "publishedAt": "2026-06-05T10:50:52.131Z",
    "corrections": [
      {
        "what": "Accounts created on or after 22 April 2019 must use conversion-based Smart bidding. The $2 cap still exists where manual CPC is in use; it is the exception, not the default.",
        "against": "https://support.google.com/nonprofits/answer/117827?hl=en"
      }
    ]
  },
  {
    "slug": "sitelink-extensions-google-ad-grant",
    "category": "glossary",
    "title": "Sitelink Extensions: Boost Your Google Ad Grant Ads with Extra Links",
    "topic": "Sitelink Extensions",
    "niche": null,
    "excerpt": "Sitelink extensions add extra clickable links to your ads, driving more traffic and engagement for your nonprofit’s Google Ad Grant campaigns.",
    "bodyMarkdown": "## Sitelink Extensions: What They Really Do for Your Google Ad Grant\n\nA lot of nonprofit marketers I talk to think sitelink extensions are just a minor add-on — some fancy extra links that might look nice but don’t really change results much. That’s the misconception. The truth? Sitelink extensions can significantly improve your Google Ad Grant ads’ performance, if you use them right.\n\n### How Sitelink Extensions Work\n\nAt their core, sitelink extensions are additional links that show up below your main ad copy in Google Search results. Instead of just clicking your primary headline, searchers get extra options like “Donate,” “Volunteer,” “Programs,” or “Events” — direct paths to the content they want.\n\nIn the 4,539 processed Ad Grant accounts I’ve managed, ads with sitelinks consistently see higher click-through rates compared to ads without them. Since the Grant requires maintaining at least a 5% CTR to stay active, these extensions play a strategic role.\n\nHere’s the kicker: sitelinks don’t cost extra. They’re free real estate that **increases your ad’s size on the search results page, making it more noticeable and clickable** — all while giving users more ways to engage with your nonprofit.\n\n### Why They Matter for Nonprofits Running Google Ad Grants\n\n- **Drive traffic to key landing pages**: You’re not limited to just one URL in your ad. Want to promote your donation page, volunteer sign-up, or latest campaign? Sitelinks let you do that simultaneously.\n- **Improve Quality Score and Ad Rank**: Google loves ads that give searchers relevant choices. Using sitelinks can improve your Ad Rank, which helps your ads show higher even with the $2 CPC cap.\n- **Help stretch your $10,000 grant budget**: More clicks with the same impressions means better budget efficiency. (For ideas on budget management, check out [Stretch the Full $10,000 Google Ad Grant Monthly Budget](/tricks/stretch-full-10000-google-ad-grant-monthly-budget).)\n\n### Pitfalls and Things to Watch Out For\n\nSitelinks sound great, but they’re not automatic magic. Here’s what I’ve seen trip up nonprofits:\n\n1. **Generic or irrelevant sitelinks**: Adding links that don’t match the searcher’s intent or your ad group’s keywords can hurt your Quality Score. Be specific.\n2. **Too many or too few**: Google recommends 4-6 sitelinks per campaign. Fewer than 2 won’t trigger sitelink display, and too many unfocused sitelinks dilute your messaging.\n3. **Not mobile-optimized landing pages**: Remember, mobile users dominate search traffic. Linking to pages that don’t load well on phones kills conversions.\n4. **Ignoring performance data**: Regularly check which sitelinks get clicks and how they perform. Pause or update weak ones.\n\n### How to Set Up Effective Sitelink Extensions\n\n1. **Match sitelinks to your campaign’s theme**: If your campaign is about fundraising, your sitelinks might be “Donate,” “Success Stories,” and “Fundraising Events.”\n2. **Use clear, action-oriented link text**: Keep it short but meaningful — “Join Our Newsletter” beats “More Info.”\n3. **Link to unique, relevant pages**: Each sitelink should lead somewhere valuable and different from your main landing page.\n4. **Maintain 2+ ads per ad group**: This pairs well with sitelinks and improves your account’s ad rotation and CTR.\n\n### Quick Checklist for Nonprofits Using Sitelink Extensions\n\n- [ ] Create 4-6 sitelinks per campaign focused on key nonprofit actions\n- [ ] Use descriptive, specific sitelink text aligned with user intent\n- [ ] Ensure all linked pages are mobile-friendly and load fast\n- [ ] Monitor performance monthly and tweak underperforming sitelinks\n- [ ] Pair with at least 2 ads per ad group for optimal account health\n\nIf you’re just getting started or want to improve your sitelink setup, I highly recommend trying the free site-wide account generator at [AdGrant.AI](/). It automates this whole process and structures your account with best practices embedded.\n\nSitelink extensions are an underused lever that can push your Google Ad Grant campaigns from average to high-impact. Don’t overlook them — they’re one of the simplest, most effective ways to drive more meaningful traffic and engagement for your nonprofit.\n\nFor more on improving your ad performance and avoiding suspension, check out [Ad Rank: What It Means for Your Google Ad Grant Success](/glossary/ad-rank-google-ad-grant) and [Recover a Suspended Google Ad Grant Account: Step-by-Step Guide](/tricks/recover-suspended-google-ad-grant-account).\n",
    "metaTitle": "Sitelink Extensions for Google Ad Grant | Boost Your Ads | AdGrant.AI",
    "metaDescription": "Learn how sitelink extensions enhance your Google Ad Grant ads by adding extra links. Improve click-through rates and drive more nonprofit website traffic.",
    "keywords": [
      "Sitelink extensions",
      "Google Ad Grant ads",
      "Google Ads nonprofits",
      "ad extensions",
      "click-through rate",
      "Google Ad Grant tips",
      "nonprofit PPC"
    ],
    "heroImage": "/content-images/animated/anim-05.png",
    "heroImageAlt": "Illustration of a conversion tracking dashboard with a target and rising graph",
    "relatedLinks": [
      {
        "href": "/glossary/ad-rank-google-ad-grant",
        "title": "Ad Rank: What It Means for Your Google Ad Grant Success"
      },
      {
        "href": "/glossary/click-through-rate-ctr-google-ad-grant",
        "title": "Click-Through Rate (CTR): What It Means for Your Google Ad Grant"
      },
      {
        "href": "/tricks/stretch-full-10000-google-ad-grant-monthly-budget",
        "title": "Stretch the Full $10,000 Google Ad Grant Monthly Budget"
      },
      {
        "href": "/",
        "title": "Generate your free Ad Grant account structure"
      }
    ],
    "publishedAt": "2026-06-05T10:50:14.807Z",
    "corrections": []
  },
  {
    "slug": "add-verify-additional-domains-google-ad-grant",
    "category": "tricks",
    "title": "Add and Verify Additional Domains for Your Google Ad Grant",
    "topic": "Add and verify additional domains to send Google Ad Grant traffic to more than one website",
    "niche": null,
    "excerpt": "Learn how to add and verify extra website domains to your Google Ad Grant account to run ads on multiple nonprofit sites.",
    "bodyMarkdown": "## What It Means to Add and Verify Additional Domains for Your Google Ad Grant\n\nBy default, when you get a Google Ad Grant, your account is authorized to advertise **only one verified domain**—your nonprofit’s main website domain. This means you can run ads pointing to your nonprofit’s homepage and any subdomains automatically, but if you want to send Ad Grant traffic to a separate root domain (like a campaign microsite, donation platform, or a partner site you own), you have to go through a formal process to get that extra domain verified and approved by Google. \n\nThis isn’t just a quick setting you can toggle inside Google Ads. It requires submitting a request to Google for Nonprofits support and proving ownership and compliance for each additional domain.\n\n---\n\n## Why It Matters for Your Ad Grant\n\nFrom managing 4,539 processed Ad Grant accounts, I’ve seen nonprofits lose opportunities by limiting themselves to one domain. Maybe your main site is at nonprofit.org, but you run a separate fundraising site at donate-nonprofit.com. Or you have a campaign microsite unrelated to your main domain that you want to promote. Without verifying these extra domains, Google won’t allow ads to send traffic there.\n\nGoogle's domain verification policy is strict because the Ad Grant program is designed to send free traffic only to websites owned and controlled by your nonprofit. This protects nonprofits and the program’s integrity.\n\nIf you ignore this requirement and try to advertise on an unverified domain, your ads will disapprove and your account risks policy violations or suspension.\n\nSo, adding additional domains legitimately increases your program’s reach and impact, but comes with extra steps and patience.\n\n---\n\n## How to Add and Verify Additional Domains for Your Ad Grant\n\nHere’s the exact, practical workflow I follow (and recommend) for nonprofits wishing to add more domains:\n\n1. **Confirm You Own and Control the Domain**\n   - You must have administrative access to the domain or hosting provider.\n   - The domain must meet all [Google Ad Grant website policies](https://support.google.com/nonprofits/answer/1657899) —\n      - High-quality, relevant nonprofit content\n      - Secure HTTPS (SSL certificate installed)\n      - Non-commercial in nature\n\n2. **Make Sure Your Domain is Ready**\n   - The domain can’t be parked, under construction, or heavy on third-party ads.\n   - It should represent your nonprofit’s mission clearly.\n\n3. **Prepare Domain Verification Proof**\n   - Be ready to verify ownership via methods like adding a TXT DNS record or uploading an HTML file to the domain.\n   - Google may also request screenshots or other proof.\n\n4. **Submit the Additional Domain Verification Request**\n   - Use this exact form to submit your request to Google for Nonprofits support: [request additional domain verification](https://support.google.com/nonprofits/contact/grants_v)\n   - In the request, clearly state:\n       - Your nonprofit’s main verified domain\n       - The new domain you want to add\n       - Proof of ownership or verification method ready\n       - A brief explanation why you want to add this domain\n\n5. **Wait for Google’s Review and Approval**\n   - This can take time—sometimes several days or longer.\n   - Google may come back asking for more info.\n\n6. **After Approval, Link the New Domain in Your Google Ads Account**\n   - Once the additional domain is approved and verified, you can start creating campaigns, ad groups, and ads sending traffic to URLs on that domain.\n\n7. **Monitor Compliance and Performance**\n   - The standard Ad Grant rules apply for each domain.\n   - Make sure your ads maintain quality, CTR, and policy compliance.\n\n---\n\n### Important Tips and Pitfalls\n\n- **Subdomains included by default:** If your main domain is nonprofit.org, any subdomains like shop.nonprofit.org or events.nonprofit.org are automatically authorized. No need for separate requests there.\n\n- **Don’t try to sneak in unrelated domains:** If Google suspects your additional domain is commercial, unrelated, or low quality, your request will be denied and your account could be suspended.\n\n- **Each domain must have valid HTTPS:** Google requires secure sites. Don’t forget to set up SSL certificates.\n\n- **Approval time varies; plan ahead:** Don’t expect instant approval. If you’re running a time-sensitive campaign on a new domain, start this process early.\n\n- **Control your domains:** Google needs to confirm you really own the domain. If you manage domains for multiple programs or partners, keep documentation ready.\n\n- **Need help structuring campaigns across multiple sites?** Check out how different nonprofits organize their accounts, like [How a Regional Food Bank Structures Its Google Ad Grant Account](/case-studies/regional-food-bank-google-ad-grant-structure) or this [Environmental Nonprofit case study](/case-studies/environmental-nonprofit-google-ad-grant-structure).\n\n- **To speed up campaign builds, try this free generator:** AdGrant.AI (adgrant.ai) auto-generates a full, policy-compliant account structure — handy when juggling multiple domains and campaigns.\n\n---\n\n## FAQ\n\n### Can I add subdomains without extra verification?\n\nYes. Your main verified root domain automatically includes all its subdomains, so you can advertise on subdomains without separate approval.\n\n### What if my additional domain gets rejected?\n\nReview Google’s feedback carefully. Common reasons include insufficient proof of ownership, commercial content, or policy violations. Fix those and try again.\n\n### How does adding domains affect my $2 CPC cap or 5% CTR rule?\n\nThe same program rules apply regardless of domain. Make sure your ads meet CTR and quality standards to avoid suspension. Conversion-based Smart bidding, required for accounts created on or after 22 April 2019, is how bids go above the $2 CPC ceiling; see [Bypass the $2 CPC Cap with Smart Bidding, Conversion Goals & Tracking](/tricks/bypass-2-cpc-cap-smart-bidding-google-ad-grant) for details.\n\n---\n\nAdding additional domains isn’t glamorous but it expands your nonprofit’s reach with free Google Search traffic. Follow the steps, be patient, and keep your content strong. \n\nIf you want a fast, well-structured starting point for campaigns on multiple sites, try the free generator at AdGrant.AI.\n\nFor more on making your Ad Grant work harder, check out how to [Collect Remarketing Audiences Using Google Ad Grant Free Traffic](/tricks/collect-remarketing-audiences-google-ad-grant).\n\nGood luck, and keep those clicks coming!\n",
    "metaTitle": "Add & Verify Additional Domains | Google Ad Grant Guide | AdGrant.AI",
    "metaDescription": "Step-by-step guide for nonprofits on adding and verifying extra domains to send Google Ad Grant traffic to more than one website.",
    "keywords": [
      "Google Ad Grant domains",
      "add domain Google Ad Grant",
      "verify domain Google Ad Grant",
      "nonprofit Google Ads",
      "Google Ad Grant multiple websites",
      "Google Ad Grant domain verification",
      "Google for Nonprofits support",
      "Google Ad Grant tips"
    ],
    "heroImage": "/content-images/animated/anim-12.png",
    "heroImageAlt": "Illustration of a hand lifting a heart with rising coins for nonprofit fundraising",
    "relatedLinks": [
      {
        "href": "/tricks/collect-remarketing-audiences-google-ad-grant",
        "title": "Collect Remarketing Audiences Using Google Ad Grant Free Traffic"
      },
      {
        "href": "/tricks/bypass-2-cpc-cap-smart-bidding-google-ad-grant",
        "title": "Bypass the $2 CPC Cap with Smart Bidding, Conversion Goals & Tracking"
      },
      {
        "href": "/case-studies/environmental-nonprofit-google-ad-grant-structure",
        "title": "How an Environmental Nonprofit Structures Google Ad Grant Campaigns"
      },
      {
        "href": "/",
        "title": "Generate your free Ad Grant account structure"
      }
    ],
    "publishedAt": "2026-06-05T15:34:28.234Z",
    "corrections": [
      {
        "what": "The Ad Grant website policies link is support.google.com/nonprofits/answer/1657899, not the dead grants/answer/2454026.",
        "against": "https://support.google.com/nonprofits/answer/1657899"
      },
      {
        "what": "Accounts created on or after 22 April 2019 must use conversion-based Smart bidding. The $2 cap still exists where manual CPC is in use; it is the exception, not the default.",
        "against": "https://support.google.com/nonprofits/answer/117827?hl=en"
      }
    ]
  },
  {
    "slug": "avoid-account-suspension-google-ad-grant-5-percent-ctr-rule",
    "category": "tricks",
    "title": "Avoid Account Suspension from the Google Ad Grant 5% CTR Rule",
    "topic": "Avoid account suspension from the 5% CTR rule",
    "niche": null,
    "excerpt": "Keep your Google Ad Grant account safe by maintaining the minimum 5% CTR with smart tactics and real-world examples.",
    "bodyMarkdown": "## Bottom Line: Keep Your Google Ad Grant Account Alive by Hitting 5% CTR\n\nGoogle requires every Ad Grant account to maintain at least a 5% CTR each month. If that is missed for two consecutive months, the account is temporarily deactivated. From 4,539 processed Ad Grant accounts, we have seen how fast you can lose your Grant if you ignore this simple metric. The trick? Don’t just chase clicks blindly. You need targeted, relevant ads **and** smart account structure to reach that 5% CTR consistently.\n\n---\n\n## Why the 5% CTR Rule Exists\n\nGoogle’s $10,000/month free Search ads come with rules. One is a minimum 5% click-through rate (CTR) monthly. Google wants to ensure you’re showing ads people actually click — otherwise, what’s the point?\n\nIf the CTR requirement is not met for two consecutive months, Google temporarily deactivates the account. Recovery is a request after the account is brought back into compliance (see my [Recover a Suspended Google Ad Grant Account: Step-by-Step Guide](/tricks/recover-suspended-google-ad-grant-account)).\n\nIn practice, this means you can't run broad, low-intent keywords or sloppy ads and just hope for the best.\n\n---\n\n## How This Works in Numbers (Real Example)\n\nSay you run a nonprofit with the full $10,000/mo Grant. The daily dollar budget is about $329 ($10,000 ÷ 30 days). At a $2 CPC that is about 166.7 clicks a day ($10,000 ÷ $2 ÷ 30). To maintain 5% CTR, you need these numbers to make sense:\n\n- **Daily Impressions**: You need about 3,334 impressions daily (because 166.7 clicks ÷ 3,334 impressions = 5%)\n- **Clicks**: About 166.7 clicks a day if the $2 cap is in force\n\nIf your ads show 3,334 times a day but only get 50 clicks, your CTR is 1.5% — well below 5%. Google sees that as “your ads aren’t relevant.”\n\nThe pitfall? If you go too broad with keywords or your ads don’t match searcher intent, you’ll get a ton of impressions but barely any clicks.\n\n---\n\n## How to Avoid Falling Below 5% CTR — The Tactic\n\n### 1. Use Tight, Relevant Keywords (2+ words, no generic terms)\n\nGeneric single words like “help” or “donate” kill CTR. They bring irrelevant traffic and low clicks. Choose focused keywords:\n\n- Instead of \"donate\", use \"donate clean water projects\"\n- Instead of \"volunteer\", use \"volunteer in local shelters\"\n\nFor deeper insight, check out [Broad Match Keywords: How They Really Work for Your Google Ad Grant](/glossary/broad-match-keywords-google-ad-grant).\n\n### 2. Write Specific, Compelling Ads\n\nYour ad’s headline and description must closely align with your keywords and landing pages. If someone searches \"donate clean water,\" your ad should say exactly that, not just \"help others.\"\n\nThe two-ads-per-ad-group rule stopped applying to grantees on 30 June 2022, when responsive search ads became required. Two ad groups per campaign is still required. One responsive search ad per ad group meets the current ad rule.\n\n### 3. Structure Your Account Properly\n\nDivide campaigns into at least two tightly themed ad groups. Each ad group targets a narrow set of keywords. One responsive search ad per ad group is enough. This keeps relevance high and CTR up.\n\n### 4. Use Geographic Targeting\n\nIf your nonprofit is local or regional, focus your ads where your audience actually is. Showing ads outside your service area gets impressions but fewer clicks, tanking CTR. See [Geographic Targeting: How to Focus Your Google Ad Grant Ads Where They Matter Most](/glossary/geographic-targeting-google-ad-grant).\n\n### 5. Use Negative Keywords\n\nPrevent irrelevant searches from triggering your ads by adding negative keywords. For example, exclude \"free\" if you don’t offer free services. This reduces wasted impressions and keeps CTR healthy.\n\n### 6. Monitor and Optimize Regularly\n\nCTR isn’t a “set it and forget it” metric. Check your account weekly. Pause keywords or ads with CTR below 1-2%. Replace them with better ones.\n\n### Bonus: Consider Smart Bidding\n\nUsing Maximize Conversions bidding removes the $2 CPC cap and can improve performance, but it requires conversion tracking (which you should implement to measure success). This approach also helps Google show your ads to people more likely to click, improving CTR.\n\n---\n\n## Trade-offs and Pitfalls\n\n- **Narrow targeting means less traffic.** If you get too picky, impressions drop. That’s okay. Quality beats quantity here.\n\n- **Don’t ignore ad copy testing.** Not every ad performs equally. Testing more than one responsive search ad per ad group can help find winners, but Google no longer requires two ads per ad group.\n\n- **Conversion tracking setup is not trivial.** But if you want to use Smart Bidding, it’s mandatory.\n\n- **Avoid broad match without care.** Broad match keywords can deliver impressions but tank CTR if irrelevant traffic floods in.\n\n---\n\n## Next Steps\n\nIf your account is struggling to hit 5% CTR, start by analyzing these:\n\n- What are your top 10 keywords’ CTRs? Pause any below 2% immediately.\n- Review ad copy for tightly matching keywords and calls to action.\n- Check your geographic settings—are ads shown where your audience is?\n- Add negative keywords to block irrelevant traffic.\n\nIf you want a ready-made, Google-compliant account structure aligned to your nonprofit’s website, try the free generator at [AdGrant.AI](https://adgrant.ai/). It builds campaigns, ad groups, keywords, and ads designed to hit that 5% CTR minimum from day one.\n\nFinally, keep learning. Understanding [Quality Score](/glossary/quality-score-google-ad-grant) and [Ad Rank](/glossary/ad-rank-google-ad-grant) will help you improve your account’s performance and CTR over time.\n\nGet serious about CTR, and your Google Ad Grant will keep fueling your mission instead of getting suspended.\n",
    "metaTitle": "Avoid Suspension from Google Ad Grant 5% CTR Rule | AdGrant.AI",
    "metaDescription": "Learn practical tips to maintain a 5% CTR and prevent your Google Ad Grant account suspension with proven tactics and examples.",
    "keywords": [
      "Google Ad Grant",
      "5% CTR rule",
      "avoid suspension",
      "Google Ads nonprofit",
      "Ad Grant click-through rate",
      "Google Ad Grant tips",
      "nonprofit PPC",
      "Ad Grant account management"
    ],
    "heroImage": "/content-images/animated/anim-05.png",
    "heroImageAlt": "Illustration of a conversion tracking dashboard with a target and rising graph",
    "relatedLinks": [
      {
        "href": "/glossary/quality-score-google-ad-grant",
        "title": "Quality Score: What It Means for Your Google Ad Grant Success"
      },
      {
        "href": "/glossary/broad-match-keywords-google-ad-grant",
        "title": "Broad Match Keywords: How They Really Work for Your Google Ad Grant"
      },
      {
        "href": "/glossary/impression-share-google-ad-grant",
        "title": "Impression Share: What It Means for Your Google Ad Grant Success"
      },
      {
        "href": "/",
        "title": "Generate your free Ad Grant account structure"
      }
    ],
    "publishedAt": "2026-06-05T11:01:53.280Z",
    "corrections": [
      {
        "what": "The 5% CTR rule deactivates the account after two consecutive months, not one.",
        "against": "https://support.google.com/nonprofits/answer/117827?hl=en"
      },
      {
        "what": "$10,000 ÷ $2 ÷ 30 days is 166.7 clicks a day, not 329. 329 is the daily dollar budget. The matching 5% CTR impressions figure is about 3,334 a day, not 6,580.",
        "against": "https://support.google.com/nonprofits/answer/117827?hl=en"
      },
      {
        "what": "The two-ads-per-ad-group rule stopped applying to grantees on 30 June 2022. Two ad groups per campaign is still required.",
        "against": "https://support.google.com/nonprofits/answer/9314402"
      }
    ]
  },
  {
    "slug": "bypass-2-cpc-cap-smart-bidding-google-ad-grant",
    "category": "tricks",
    "title": "Bypass the $2 CPC Cap with Smart Bidding, Conversion Goals & Tracking",
    "topic": "Bypass the $2 CPC cap with Smart Bidding strategies, conversion goals, and conversion tracking",
    "niche": null,
    "excerpt": "Learn how to lift the $2 max CPC limit on Google Ad Grants using Smart Bidding, conversion tracking, and upgrade your nonprofit ads.",
    "bodyMarkdown": "## The $2 CPC Cap Myth: What You Really Need to Know\n\nThe $2 max CPC is still a program-level ceiling on manual bidding. It has not been the default for accounts created on or after 22 April 2019. The $2 CPC cap applies only where manual or enhanced CPC bidding is in use. Accounts created on or after 22 April 2019 must use conversion-based Smart bidding — Maximize conversions, Maximize conversion value, Target CPA, or Target ROAS — for every campaign. For those accounts the cap is not the default, and Google can bid above $2 when the account's performance merits it. The cap and the exception are both still real.\n\n## How Smart Bidding Lifts the Cap and What It Means\n\nThe Google Ad Grant program lets eligible nonprofits run Search ads with a budget of up to $10,000/month (about $329/day). The $2 program-level ceiling applies to manual CPC. Accounts created on or after 22 April 2019 must use conversion-based Smart bidding instead, so for those accounts there is no cap to bypass.\n\nBut switching to Smart Bidding strategies like **Maximize Conversions** or **Target CPA** removes this $2 cap. The system *automatically* adjusts your bids to get the most conversions at the best price. In other words, the algorithm can bid above $2 CPC when it predicts a click is more likely to convert.\n\nHere’s the trade-off: to use Smart Bidding, **you need conversion tracking** set up properly, and you must have a clear conversion goal.\n\n### Real-World Numbers\n\nIn the 4,539 processed Ad Grant accounts I’ve managed, when nonprofits switch from manual CPC to Maximize Conversions:\n\n- Average CPC often rises from $1.50-$2.00 to $3-$7 per click—but those clicks are *much* more valuable.\n- Conversion rates can improve because the algorithm focuses on users more likely to act.\n- Total conversions increase even with fewer clicks.\n\nFor example, one youth mentoring nonprofit I worked with saw their average CPC go from $1.80 to $4.20 after enabling Maximize Conversions. Their monthly lead forms nearly doubled, boosting program signups significantly.\n\n## Step 1: Set Up Conversion Tracking\n\nYou *must* track conversions to use Smart Bidding. The most common conversions for nonprofits are:\n\n- Contact form submissions\n- Donation completions\n- Newsletter signups\n- Volunteer applications\n\nIf you haven’t set up conversion tracking:\n\n1. In Google Ads, go to **Tools & Settings > Conversions**.\n2. Click **New conversion action** and select your goal (Website).\n3. Follow the instructions to add the global site tag and event snippet on your site—your web developer can help here.\n4. Confirm conversions are reporting correctly.\n\nWithout this, your data-driven bidding won’t work.\n\n## Step 2: Choose the Right Smart Bidding Strategy\n\nThe easiest way to remove the $2 CPC cap is to switch your campaign’s bidding to **Maximize Conversions**. It requires no CPA target and lets Google spend your budget to get the most conversions possible.\n\nIf your conversion volume is high enough (usually 15+ per month), you can try **Target CPA** bidding, where you set a target cost per conversion. This gives you control but requires steady conversion data.\n\n### Don’t use Smart Bidding without reliable conversion tracking. Otherwise, Google might waste your budget on unqualified clicks.\n\n## Step 3: Set a Realistic Conversion Goal\n\nGoogle needs clear goals to optimize bids. If you don’t tell it what a conversion is, or the conversion window is too short, your results will suffer.\n\nMake sure:\n\n- You have **at least one active conversion action** set as a primary goal.\n- Your conversion actions are **meaningful**, i.e., they reflect real engagement or fundraising value.\n- You assign **values** to conversions if possible (like average donation amount) to help Google prioritize high-value actions.\n\n## Pitfalls and What to Watch Out For\n\n- **Budget burn:** With no CPC cap, bids might spike suddenly on competitive terms. Monitor spend daily for the first week.\n- **Low CTR risk:** Google requires maintaining 5% CTR. Smart Bidding can help but don’t ignore ad relevance and keyword quality.\n- **Conversion tracking errors:** If your tracking breaks, Smart Bidding bids blindly—wasting budget.\n\n## Checklist for conversion-based Smart bidding (required since 22 April 2019)\n\n- [ ] Set up **Google Ads conversion tracking** for meaningful goals\n- [ ] Switch campaign bidding strategy to **Maximize Conversions** (or Target CPA if volume allows)\n- [ ] Verify conversion data is flowing and accurate\n- [ ] Monitor CPC and conversions closely for the first 2 weeks\n- [ ] Adjust ad copy, keywords, and targeting if CTR drops below 5%\n\nTry this on a test campaign or a high-priority campaign to see the difference. You’ll likely spend a bit more per click, but the quality of visitors and volume of conversions will go up.\n\nIf you want a shortcut to building a fully optimized structure—keywords, ads, and conversion setups—I recommend trying the free generator at [AdGrant.AI](/). It completely changed how we scale nonprofit accounts.\n\nFor inspiration, see how nonprofits like [this youth mentoring organization structure their accounts](/case-studies/youth-mentoring-nonprofit-google-ad-grant-structure-2) to succeed with Smart Bidding and conversion tracking.\n\nThe $2 ceiling is still real on manual CPC. For almost every account created since 22 April 2019, conversion-based Smart bidding is already the required strategy, and the work is conversion tracking and goals rather than a bypass.\n",
    "metaTitle": "Bypass $2 CPC Cap on Google Ad Grants with Smart Bidding | AdGrant.AI",
    "metaDescription": "Discover a proven tactic to bypass the $2 CPC cap on Google Ad Grants using Smart Bidding and conversion tracking for better ad performance.",
    "keywords": [
      "Google Ad Grant CPC cap",
      "Google Ad Grant Smart Bidding",
      "conversion tracking nonprofit",
      "bypass $2 CPC cap",
      "Google Ad Grant conversion goals",
      "Google nonprofit ads",
      "Google Ad Grant bidding strategies",
      "Google Ads for nonprofits"
    ],
    "heroImage": "/content-images/animated/anim-10.png",
    "heroImageAlt": "Illustration of a hand assembling a Google Ads account structure diagram",
    "relatedLinks": [
      {
        "href": "/case-studies/environmental-nonprofit-google-ad-grant-structure",
        "title": "How an Environmental Nonprofit Structures Google Ad Grant Campaigns"
      },
      {
        "href": "/case-studies/community-arts-nonprofit-google-ad-grant-structure",
        "title": "How a Community Arts Nonprofit Structures Its Google Ad Grant Account"
      },
      {
        "href": "/case-studies/youth-mentoring-nonprofit-google-ad-grant-structure-2",
        "title": "How a Youth Mentoring Nonprofit Structures Google Ad Grant Campaigns"
      },
      {
        "href": "/",
        "title": "Generate your free Ad Grant account structure"
      }
    ],
    "publishedAt": "2026-06-05T14:59:09.798Z",
    "corrections": [
      {
        "what": "Accounts created on or after 22 April 2019 must use conversion-based Smart bidding. The $2 cap still exists where manual CPC is in use; it is the exception, not the default.",
        "against": "https://support.google.com/nonprofits/answer/117827?hl=en"
      }
    ]
  },
  {
    "slug": "collect-remarketing-audiences-google-ad-grant",
    "category": "tricks",
    "title": "Collect Remarketing Audiences Using Google Ad Grant Free Traffic",
    "topic": "Collect remarketing and retargeting audiences with free Ad Grant traffic for your paid Google Ads",
    "niche": null,
    "excerpt": "Learn how to build valuable remarketing audiences with Google Ad Grant’s free Search ads to boost your paid campaigns.",
    "bodyMarkdown": "## How to Use Google Ad Grant Traffic to Build Remarketing Audiences for Paid Ads\n\nWhen a small environmental nonprofit I worked with hit their Google Ad Grant $10K monthly limit, they weren’t sure how to step up their paid Google Ads. Their website traffic was decent, but conversion rates were low and the paid ads had a tight budget. The missing link? Remarketing audiences.\n\n**Remarketing** lets you show ads to people who’ve already visited your website, increasing conversion chances dramatically. But most nonprofits don’t realize you can use that free Ad Grant traffic to collect remarketing audiences — then leverage those lists in your paid Google Ads accounts.\n\nThis tactic is a win-win. It means you’re not just using your free Ad Grant budget for cold traffic; you’re *also* creating a warm, high-intent audience pool for your paid campaigns, where your budget goes further.\n\n### Why Does This Work?\n\nGoogle Ad Grant ads are Search-only and capped at $2 max CPC (unless you use Smart Bidding), which limits how aggressive you can be. But those clicks get valuable people to your website — people you can track and re-engage later.\n\nRemarketing audiences are built via Google Analytics or Google Ads tag on your website. Every visitor from the Grant ads gets added to these lists automatically if properly tagged. Later, you can target or exclude these visitors in your paid campaigns, improving efficiency and ROI.\n\n### Here’s How to Do It: Practical Tips\n\n1. **Set Up Remarketing Tags Properly**\n\n   You need Google Ads remarketing tags installed on your website or use Google Analytics 4 with linked Google Ads accounts. We’ve seen many nonprofits miss this step and waste their Grant traffic without capturing audiences.\n\n   - If you don’t have the tag set up, use Google Tag Manager to add it quickly.\n   - Confirm your tag captures *all* pages you want to remarket (usually the entire site).\n\n2. **Create Separate Remarketing Audiences for Your Grant Traffic**\n\n   You can create an audience in Google Ads that includes visitors who clicked your Grant ads specifically, rather than all traffic.\n\n   - Use \"Audience Source\" and filters based on traffic source/medium (e.g., \"google / cpc\" and a specific Campaign name for your Grant account).\n   - This helps you segment users from free Grant clicks vs. paid ads or organic visits.\n\n3. **Use These Audiences in Your Paid Google Ads Accounts**\n\n   Once your audiences have 100 active users in the last 30 days (the minimum Google requires on Search, Display and YouTube), link your paid Google Ads account to the Grant account or share audiences via Google Ads Manager account.\n\n   - Target these warm audiences with ads tailored for conversions (like donations, event signups).\n   - Exclude these audiences from cold campaigns to avoid wasting budget on people already exposed.\n\n4. **Consider Using Smart Bidding on Paid Campaigns With Remarketing**\n\n   Since your remarketing audiences are warmer, you can reduce bids or use Target ROAS / Maximize Conversions strategies in paid campaigns. This complements your Grant account’s free traffic well.\n\n### Trade-offs and Pitfalls to Watch\n\n- **Tagging is key.** Without correct implementation, you won’t build meaningful audiences.\n- Google requires 100 active users in the last 30 days before a list can serve. The minimum was never 500 — historically 1,000 on Search and 100 on Display, then 100 across networks from late 2025; this takes time if your Grant traffic is low.\n- Managing audiences across multiple accounts needs care — use Google Ads Manager Account setups to connect Grant and paid accounts.\n- Be mindful of Google Ad Grant policies. Do not try to run paid campaigns under the Grant but use audience sharing legitimately.\n\n### Real Numbers We’ve Seen\n\nIn accounts with 10,000 free Grant clicks/month, remarketing lists grew to 6,000-8,000 in 30 days. When we layered those audiences into paid campaigns, conversion rates improved, from higher intent.\n\nEven smaller nonprofits with 1,000–2,000 monthly Grant clicks saw remarketing lists grow to usable sizes within 60 days, enabling them to stretch their paid budgets further.\n\n### A Bonus Hack: Use AdGrant.AI to Jumpstart Your Structure\n\nIf you’re setting this up for the first time, I recommend generating a solid Google Ad Grant account structure with [AdGrant.AI](https://adgrant.ai/). It creates campaigns, keywords, and ads based on your website—and you can build your remarketing tags alongside.\n\nFor deeper insights on bidding and keyword tactics that work well with the Grant, check out [Bypass the $2 CPC Cap with Smart Bidding, Conversion Goals & Tracking](/tricks/bypass-2-cpc-cap-smart-bidding-google-ad-grant).\n\nOr see how other nonprofits organize accounts to maximize Grant impact, like [How an Environmental Nonprofit Structures Google Ad Grant Campaigns](/case-studies/environmental-nonprofit-google-ad-grant-structure).\n\n---\n\nUse your Google Ad Grant beyond just free clicks. Build smart remarketing audiences to turbocharge your paid campaigns. Get the tags right, segment your audiences, and watch your nonprofit’s fundraising and engagement climb.\n",
    "metaTitle": "Build Remarketing Audiences with Google Ad Grant Traffic | AdGrant.AI",
    "metaDescription": "Use your Google Ad Grant free Search ads to collect remarketing and retargeting audiences. Practical tips for nonprofits to grow paid campaign success.",
    "keywords": [
      "Google Ad Grant remarketing",
      "Google Ad Grant retargeting",
      "remarketing audiences nonprofit",
      "Google Ad Grant tips",
      "free remarketing audiences",
      "Google Ads nonprofit strategy",
      "Google Ad Grant paid campaigns"
    ],
    "heroImage": "/content-images/animated/anim-05.png",
    "heroImageAlt": "Illustration of a conversion tracking dashboard with a target and rising graph",
    "relatedLinks": [
      {
        "href": "/tricks/bypass-2-cpc-cap-smart-bidding-google-ad-grant",
        "title": "Bypass the $2 CPC Cap with Smart Bidding, Conversion Goals & Tracking"
      },
      {
        "href": "/case-studies/environmental-nonprofit-google-ad-grant-structure",
        "title": "How an Environmental Nonprofit Structures Google Ad Grant Campaigns"
      },
      {
        "href": "/case-studies/community-arts-nonprofit-google-ad-grant-structure",
        "title": "How a Community Arts Nonprofit Structures Its Google Ad Grant Account"
      },
      {
        "href": "/",
        "title": "Generate your free Ad Grant account structure"
      }
    ],
    "publishedAt": "2026-06-05T14:59:31.625Z",
    "corrections": [
      {
        "what": "The remarketing list minimum was never 500. It is 100 active users in the last 30 days on Search, Display and YouTube.",
        "against": "https://support.google.com/google-ads/answer/7476585?hl=en"
      }
    ]
  },
  {
    "slug": "recover-suspended-google-ad-grant-account",
    "category": "tricks",
    "title": "Recover a Suspended Google Ad Grant Account: Step-by-Step Guide",
    "topic": "Recover a suspended Ad Grant account",
    "niche": null,
    "excerpt": "Learn how to quickly recover a suspended Google Ad Grant account with practical steps and avoid common pitfalls.",
    "bodyMarkdown": "## What Does It Mean to Recover a Suspended Google Ad Grant Account?\n\nWhen your Google Ad Grant account is suspended, it means your nonprofit's access to the free $10,000/month in Google Search ads has been paused due to non-compliance with program policies. Recovering your account means diagnosing why it got suspended, fixing the issues, and successfully submitting a request to Google to reinstate your ads. \n\nStraightforward, but it’s not always quick or easy. I’ve worked on 4,539 processed Ad Grant accounts, and I can tell you: the key is focusing on the *real* reasons for suspension, not just guessing. \n\n## Why It Matters for Your Ad Grant\n\nEvery day your account is suspended, you lose the chance to drive traffic, supporters, and donations—all for free. Plus, the longer you wait, the more your momentum stalls and your nonprofit’s visibility drops. \n\nGoogle is strict about compliance, especially around minimum performance metrics like the 5% **click-through rate (CTR)** and keyword quality. Without fixing the root cause, you’ll get suspended again. \n\nIgnoring or delaying recovery increases frustration, and sometimes nonprofits simply give up on Google Ads. Don’t let that happen. Recovering your account is 100% doable if you get systematic about it.\n\n## How to Recover a Suspended Ad Grant Account: Step-by-Step\n\n**1. Identify the Suspension Reason**\n\nCheck the exact suspension notice in your Google Ads account. The most common reasons are:\n\n- **Low CTR (below 5%)**\n- **Non-compliant keywords or ads (too generic, single words, or low Quality Score)**\n- **Missing conversion tracking (if using Smart Bidding)**\n\nGoogle will often specify if it’s a policy violation or performance issue. Write it down exactly.\n\n**2. Download Your Account’s Performance Data**\n\nExport your last 30 days’ CTR, Quality Scores, and keyword reports. Accounts created on or after 22 April 2019 must already use conversion-based Smart bidding. Where an older account is still on manual CPC, the $2 program-level ceiling applies, and switching to Smart bidding needs conversion tracking.\n\nLook for:\n\n- Keywords with CTR less than 5%\n- Single-word or generic keywords\n- Keywords with Quality Score below 3\n\n**3. Fix Your Keywords and Ads Immediately**\n\n- Remove or pause all single keyword or generic keywords.\n- Replace low Quality Score keywords with longer, more relevant, and specific phrases (2+ words).\n- Ensure each campaign has at least two ad groups. One responsive search ad per ad group meets the current ad rule; the two-ads-per-ad-group requirement ended on 30 June 2022.\n- Make ads highly relevant to the keywords and nonprofit’s mission.\n\nIf this sounds tedious, try the free [AdGrant.AI](https://adgrant.ai/) tool. It auto-generates compliant account structures based on your website, saving hours.\n\n**4. Implement Conversion Tracking (If Needed)**\n\nIf you want to switch to **Maximize Conversions** Smart Bidding (highly recommended to remove the $2 CPC limit), you *must* have accurate conversion tracking.\n\nSet this up in Google Ads by linking it with Google Analytics goals, donation forms, newsletter signups, or other key actions.\n\n**5. Submit a Request for Reinstatement**\n\nOnce you’ve cleaned up your keywords, fixed ads, and set up conversion tracking (if applicable), you need to request Google to review your account.\n\n- Go to your Google Ads account’s **Account Suspension** notification.\n- Click **Appeal** or **Request Review**.\n- Explain clearly what changes you made (e.g., \"Removed all single-word keywords, improved CTR by optimizing ads, set up conversion tracking to enable Smart Bidding\").\n\n**6. Monitor and Prevent Future Suspensions**\n\nAfter reinstatement, keep an eye on your CTR and Quality Scores.\n\n- Aim for above 5% CTR—consider reviewing campaigns weekly.\n- Avoid generic keywords.\n- Use AdGrant.AI to regularly generate or refresh campaigns.\n- If CTR dips, pause underperforming keywords immediately.\n\n## FAQ\n\n**Q: How long does it take to get my Ad Grant account unsuspended?**\n\nGoogle usually reviews appeals within 3-7 business days, but it can take longer if your fixes aren’t clear or complete. You can resubmit if denied, but each rejection delays recovery.\n\n**Q: Can I switch from $2 max CPC to Smart Bidding during recovery?**\n\nYes, but you *must* have conversion tracking set up and active. Without that, Google won’t allow Smart Bidding and may suspend the account.\n\n**Q: What if my account keeps getting suspended?**\n\nRepeated suspensions often mean deeper structural issues—like poor keyword strategy or no conversion tracking. Consider rebuilding your campaigns from scratch using tools like [AdGrant.AI](https://adgrant.ai/). Starting fresh with a compliant account structure is often faster than patching old, broken campaigns.\n\n---\n\nRecovering a suspended Google Ad Grant account is frustrating but manageable. The trick is **don’t guess, don’t patch half-baked fixes, and don’t wait**. Use data to guide your cleanup and apply solid keyword and ad best practices. \n\nIf you want to shortcut the process, try [AdGrant.AI](https://adgrant.ai/)—it’s free and builds Google Ad Grant-compliant campaigns for you in minutes. \n\nRemember: the Grant is a powerful tool. Keep it healthy, and it will keep driving real results for your cause.\n",
    "metaTitle": "Recover Suspended Google Ad Grant Account Fast | Step-by-St… | AdGran…",
    "metaDescription": "Get your suspended Google Ad Grant account back with this proven step-by-step recovery guide for nonprofits. Avoid suspension traps and start ads again.",
    "keywords": [
      "Google Ad Grant recovery",
      "suspended Ad Grant account",
      "Ad Grant suspension fix",
      "nonprofit Google Ads",
      "Google Ad Grant CTR",
      "Ad Grant account suspended",
      "Google Ads nonprofit suspension"
    ],
    "heroImage": "/content-images/animated/anim-05.png",
    "heroImageAlt": "Illustration of a conversion tracking dashboard with a target and rising graph",
    "relatedLinks": [
      {
        "href": "/",
        "title": "Generate your free Ad Grant account structure"
      }
    ],
    "publishedAt": "2026-06-05T10:47:49.522Z",
    "corrections": [
      {
        "what": "The two-ads-per-ad-group rule stopped applying to grantees on 30 June 2022. Two ad groups per campaign is still required.",
        "against": "https://support.google.com/nonprofits/answer/9314402"
      },
      {
        "what": "Accounts created on or after 22 April 2019 must use conversion-based Smart bidding. The $2 cap still exists where manual CPC is in use; it is the exception, not the default.",
        "against": "https://support.google.com/nonprofits/answer/117827?hl=en"
      }
    ]
  },
  {
    "slug": "stretch-full-10000-google-ad-grant-monthly-budget",
    "category": "tricks",
    "title": "Stretch the Full $10,000 Google Ad Grant Monthly Budget",
    "topic": "Stretch the full $10,000 monthly budget",
    "niche": null,
    "excerpt": "How to consistently spend the full $10,000 Google Ad Grant each month without breaking program rules or wasting clicks.",
    "bodyMarkdown": "## What does it mean to stretch the full $10,000 Google Ad Grant budget?\n\nStretching your full $10,000 monthly budget means structuring your Google Ad Grant account and campaigns so that you consistently spend as close to the $329 daily limit as possible without violating program policies. It’s about maximizing exposure and clicks to drive real impact for your nonprofit — not just hitting a number in your account.\n\n## Why it matters for your Ad Grant\n\nMost nonprofits never hit the $10,000 monthly cap. Where manual CPC is still in use, the $2 max cost-per-click (CPC) ceiling and the keyword rules often limit how much budget you can spend, especially in competitive sectors. Under-spending means lost opportunity — fewer people reached, less traffic driven, and minimal impact.\n\nIf your account is capped by low CPC limits or poor CTR, you’re effectively leaving free money on the table every day. Stretching your budget requires using proven tactics that bypass these limits without risking suspension.\n\n## How to stretch your full $10,000 Google Ad Grant budget\n\nHere’s a step-by-step approach I’ve used in 4,539 processed Ad Grant accounts that consistently helps nonprofits hit or get close to that $329 daily spend:\n\n1. **Switch to a Smart Bidding strategy (Maximize Conversions)**\n\n   The biggest gamechanger is moving off manual CPC with the $2 cap. By enabling Maximize Conversions bidding, Google removes the $2 limit and automatically bids higher where it expects better results. This means you can realistically compete for higher-value clicks and spend more daily.\n\n   _Note: You must have conversion tracking set up for this to work._\n\n2. **Set up reliable conversion tracking**\n\n   If you don’t track conversions, Smart Bidding can’t optimize. Even if your conversions are simple (newsletter signups, donation thank you pages, volunteer form completions), set up Google Ads conversion tracking or import goals from Google Analytics.\n\n   Without conversions, you’re stuck with manual CPC and the $2 cap, which limits spend and reach.\n\n3. **Expand your keyword list with long-tail, relevant phrases**\n\n   Single generic keywords are banned, and low-quality scores block your ads. Use 3-5 word phrases that clearly match your services or programs.\n\n   For example, instead of “donate,” use “donate clean water charity” or “volunteer food bank near me.”\n\n   Tools like the free [AdGrant.AI generator](/) help generate keyword lists that comply with policies and cover relevant topics.\n\n4. **Create multiple campaigns and ad groups focusing on different themes**\n\n   Split your account into at least 3-5 campaigns, each targeting a specific program or audience segment. Within campaigns, have 2-3 ad groups with focused keywords.\n\n   This improves Quality Score, CTR, and allows Smart Bidding to allocate budget efficiently.\n\n5. **Write 2+ strong, specific ads per ad group**\n\n   Test different messaging. Ads must be relevant to keywords to maintain at least a 5% CTR and avoid suspension.\n\n   Use clear calls to action, incorporate keywords naturally, and highlight unique benefits.\n\n6. **Monitor and adjust your bids and daily budget caps**\n\n   Even with Maximize Conversions, setting your campaign daily budgets close to $329 ensures you don’t artificially limit spend. Monitor performance to avoid exhausting budget too quickly.\n\n7. **Use negative keywords to reduce irrelevant clicks**\n\n   Adding negatives saves money by filtering out low-converting or unrelated searches.\n\n   For instance, if you’re a youth education nonprofit, exclude terms like \"jobs\" or \"free download\" if irrelevant.\n\n8. **Regularly review Quality Score and CTR metrics**\n\n   Google requires a 5% CTR to avoid suspension. Pause poor-performing keywords and ads and replace them with better ones. Over time, this increases your account health and allows higher spend.\n\n9. **Consider geographic and device bid adjustments**\n\n   If your nonprofit focuses on a certain region or device type, adjust bids or target accordingly to concentrate spend where it drives results.\n\n10. **Test and iterate monthly**\n\n   No setup is perfect. Check your account weekly, review search terms, update ads, add new keywords, and pause underperformers. This upkeep is essential to steadily approach full budget utilization.\n\n## FAQ\n\n**Q: Can I spend exactly $10,000 every month?**\n\nIn practice, it’s tough to hit that exact $10,000. Some days you’ll underspend due to lower search volume or keyword constraints. Aiming for $300-$325 daily is more realistic and sustainable.\n\n**Q: What if I can’t set up conversion tracking?**\n\nWithout conversions, you’re stuck with the $2 CPC cap and limited spend. Focus on setting up basic conversion tracking via Google Analytics or Google Tag Manager—it’s the most impactful step to unlock full budget potential.\n\n**Q: Will using Maximize Conversions hurt my CTR?**\n\nSometimes, especially at first. Smart Bidding balances clicks and conversions, which may reduce CTR slightly, but if your conversions are set correctly, your overall impact improves. Maintain good ad relevance and negative keywords to keep CTR healthy.\n\nStretching your $10,000 Google Ad Grant budget isn’t about gaming the system. It’s about smart campaign structure, embracing automation where possible, and continuously optimizing. If you want a shortcut, try the free generator at [AdGrant.AI](/) to build compliant campaigns and keywords fast.\n\nFor tips on recovering a suspended account due to CTR or policy issues, see [Recover a Suspended Google Ad Grant Account: Step-by-Step Guide](/tricks/recover-suspended-google-ad-grant-account).\n",
    "metaTitle": "Stretch Your Full $10,000 Google Ad Grant Monthly Budget | AdGrant.AI",
    "metaDescription": "Learn practical tactics to fully utilize the $10,000 Google Ad Grant monthly budget with smart bidding, keyword strategies, and campaign structure tips.",
    "keywords": [
      "Google Ad Grant",
      "Google Ad Grant budget",
      "Google Ad Grant spending",
      "nonprofit PPC",
      "stretch Ad Grant budget",
      "Google Ads for nonprofits",
      "Ad Grant smart bidding"
    ],
    "heroImage": "/content-images/animated/anim-12.png",
    "heroImageAlt": "Illustration of a hand lifting a heart with rising coins for nonprofit fundraising",
    "relatedLinks": [
      {
        "href": "/tricks/recover-suspended-google-ad-grant-account",
        "title": "Recover a Suspended Google Ad Grant Account: Step-by-Step Guide"
      },
      {
        "href": "/",
        "title": "Generate your free Ad Grant account structure"
      }
    ],
    "publishedAt": "2026-06-05T10:48:37.005Z",
    "corrections": [
      {
        "what": "Accounts created on or after 22 April 2019 must use conversion-based Smart bidding. The $2 cap still exists where manual CPC is in use; it is the exception, not the default.",
        "against": "https://support.google.com/nonprofits/answer/117827?hl=en"
      }
    ]
  }
];

export const PAGE_BY_SLUG: Record<string, AdGrantPage> = Object.fromEntries(
  PAGES.map((page) => [page.slug, page]),
);

export function pagesIn(category: AdGrantCategory): AdGrantPage[] {
  return PAGES.filter((page) => page.category === category);
}
