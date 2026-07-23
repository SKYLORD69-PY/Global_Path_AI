const UNIVERSITY_CATALOG = [
  {
    id: "imperial-college-london",
    name: "Imperial College London",
    country: "United Kingdom",
    city: "London",
    qs_ranking: 6,
    tuition_usd: 45500,
    ielts_min: 7.0,
    fit_level: "reach",
    acceptance_rate: 0.15,
    cost_of_living_usd_monthly: 2200,
    accepts_gre: false,
    website: "https://www.imperial.ac.uk",
    description: "Top-tier STEM university with strong employer links and research output.",
    programs: ["Computer Science", "Data Science", "Mechanical Engineering", "Finance"],
  },
  {
    id: "university-of-manchester",
    name: "University of Manchester",
    country: "United Kingdom",
    city: "Manchester",
    qs_ranking: 34,
    tuition_usd: 32500,
    ielts_min: 6.5,
    fit_level: "match",
    acceptance_rate: 0.56,
    cost_of_living_usd_monthly: 1500,
    accepts_gre: false,
    website: "https://www.manchester.ac.uk",
    description: "Strong scholarship ecosystem and broad master's portfolio for international students.",
    programs: ["Computer Science", "Business Analytics", "Public Health", "Mechanical Engineering"],
  },
  {
    id: "university-of-glasgow",
    name: "University of Glasgow",
    country: "United Kingdom",
    city: "Glasgow",
    qs_ranking: 76,
    tuition_usd: 28500,
    ielts_min: 6.5,
    fit_level: "safety",
    acceptance_rate: 0.74,
    cost_of_living_usd_monthly: 1350,
    accepts_gre: false,
    website: "https://www.gla.ac.uk",
    description: "Well-known for engineering, public policy, and good scholarship availability.",
    programs: ["Software Engineering", "Education", "Public Policy", "Civil Engineering"],
  },
  {
    id: "university-of-toronto",
    name: "University of Toronto",
    country: "Canada",
    city: "Toronto",
    qs_ranking: 21,
    tuition_usd: 39500,
    ielts_min: 6.5,
    fit_level: "reach",
    acceptance_rate: 0.43,
    cost_of_living_usd_monthly: 2100,
    accepts_gre: true,
    website: "https://www.utoronto.ca",
    description: "Canada's flagship research university with strong AI, life sciences, and business programs.",
    programs: ["Computer Science", "AI", "Biotechnology", "MBA"],
  },
  {
    id: "university-of-british-columbia",
    name: "University of British Columbia",
    country: "Canada",
    city: "Vancouver",
    qs_ranking: 38,
    tuition_usd: 33200,
    ielts_min: 6.5,
    fit_level: "match",
    acceptance_rate: 0.52,
    cost_of_living_usd_monthly: 2050,
    accepts_gre: true,
    website: "https://www.ubc.ca",
    description: "Popular choice for sustainability, engineering, and data-driven programs.",
    programs: ["Data Science", "Civil Engineering", "Environmental Science", "Economics"],
  },
  {
    id: "university-of-waterloo",
    name: "University of Waterloo",
    country: "Canada",
    city: "Waterloo",
    qs_ranking: 112,
    tuition_usd: 29500,
    ielts_min: 6.5,
    fit_level: "match",
    acceptance_rate: 0.53,
    cost_of_living_usd_monthly: 1650,
    accepts_gre: false,
    website: "https://uwaterloo.ca",
    description: "Excellent for software, AI, and co-op driven applied programs.",
    programs: ["Software Engineering", "Computer Science", "Robotics", "Statistics"],
  },
  {
    id: "tu-munich",
    name: "Technical University of Munich",
    country: "Germany",
    city: "Munich",
    qs_ranking: 30,
    tuition_usd: 3500,
    ielts_min: 6.5,
    fit_level: "match",
    acceptance_rate: 0.31,
    cost_of_living_usd_monthly: 1450,
    accepts_gre: false,
    website: "https://www.tum.de",
    description: "Outstanding value-for-money option for engineering, robotics, and data programs.",
    programs: ["Robotics", "Data Engineering", "Mechanical Engineering", "Management & Technology"],
  },
  {
    id: "rwth-aachen",
    name: "RWTH Aachen University",
    country: "Germany",
    city: "Aachen",
    qs_ranking: 99,
    tuition_usd: 2200,
    ielts_min: 6.5,
    fit_level: "safety",
    acceptance_rate: 0.48,
    cost_of_living_usd_monthly: 1200,
    accepts_gre: false,
    website: "https://www.rwth-aachen.de",
    description: "Engineering-focused public university with low tuition and strong industry reputation.",
    programs: ["Automotive Engineering", "Electrical Engineering", "Simulation Sciences", "Materials Engineering"],
  },
  {
    id: "university-of-melbourne",
    name: "University of Melbourne",
    country: "Australia",
    city: "Melbourne",
    qs_ranking: 13,
    tuition_usd: 36500,
    ielts_min: 6.5,
    fit_level: "reach",
    acceptance_rate: 0.70,
    cost_of_living_usd_monthly: 1900,
    accepts_gre: false,
    website: "https://www.unimelb.edu.au",
    description: "High-ranked Australian university with strong commerce, health, and engineering pathways.",
    programs: ["Business Analytics", "Finance", "Public Health", "Civil Engineering"],
  },
  {
    id: "unsw-sydney",
    name: "UNSW Sydney",
    country: "Australia",
    city: "Sydney",
    qs_ranking: 19,
    tuition_usd: 35500,
    ielts_min: 6.5,
    fit_level: "match",
    acceptance_rate: 0.61,
    cost_of_living_usd_monthly: 2100,
    accepts_gre: false,
    website: "https://www.unsw.edu.au",
    description: "Strong employability outcomes for tech, engineering, and business students.",
    programs: ["Cyber Security", "Computer Science", "MBA", "Electrical Engineering"],
  },
  {
    id: "delft-university-of-technology",
    name: "Delft University of Technology",
    country: "Netherlands",
    city: "Delft",
    qs_ranking: 47,
    tuition_usd: 22800,
    ielts_min: 6.5,
    fit_level: "match",
    acceptance_rate: 0.52,
    cost_of_living_usd_monthly: 1600,
    accepts_gre: false,
    website: "https://www.tudelft.nl",
    description: "Excellent European option for engineering, design, and sustainable technology.",
    programs: ["Architecture", "Systems Engineering", "Aerospace Engineering", "Computer Science"],
  },
];

const SCHOLARSHIP_CATALOG = [
  {
    id: "chevening",
    title: "Chevening Scholarship",
    provider: "UK Government",
    targetCountries: ["United Kingdom"],
    degrees: ["masters"],
    fields: ["public policy", "business", "computer science", "international relations"],
    amount: 42000,
    deadline: "2026-11-05",
    url: "https://www.chevening.org",
    snippet: "Fully funded one-year UK master's scholarship covering tuition, travel, and living support.",
  },
  {
    id: "commonwealth-shared",
    title: "Commonwealth Shared Scholarship",
    provider: "Commonwealth Scholarship Commission",
    targetCountries: ["United Kingdom"],
    degrees: ["masters"],
    fields: ["engineering", "public health", "data science", "education"],
    amount: 36000,
    deadline: "2026-12-12",
    url: "https://cscuk.fcdo.gov.uk",
    snippet: "Strong option for students from Commonwealth countries pursuing development-impact fields.",
  },
  {
    id: "vanier",
    title: "Vanier Canada Graduate Scholarships",
    provider: "Government of Canada",
    targetCountries: ["Canada"],
    degrees: ["phd"],
    fields: ["computer science", "engineering", "health", "social sciences"],
    amount: 50000,
    deadline: "2026-10-30",
    url: "https://vanier.gc.ca",
    snippet: "Prestigious doctoral award for research-focused students with strong academic profiles.",
  },
  {
    id: "ontario-trillium",
    title: "Ontario Trillium Scholarship",
    provider: "Province of Ontario",
    targetCountries: ["Canada"],
    degrees: ["phd"],
    fields: ["ai", "engineering", "economics", "health"],
    amount: 40000,
    deadline: "2026-12-01",
    url: "https://www.ontario.ca/page/ontario-trillium-scholarship",
    snippet: "Large doctoral scholarship commonly offered through major Ontario universities.",
  },
  {
    id: "daad-epos",
    title: "DAAD EPOS Scholarship",
    provider: "DAAD",
    targetCountries: ["Germany"],
    degrees: ["masters", "phd"],
    fields: ["engineering", "public policy", "economics", "sustainability"],
    amount: 18000,
    deadline: "2026-12-20",
    url: "https://www.daad.de",
    snippet: "Popular Germany scholarship for development-related master's and doctoral programs.",
  },
  {
    id: "australia-awards",
    title: "Australia Awards Scholarship",
    provider: "Australian Government",
    targetCountries: ["Australia"],
    degrees: ["masters", "phd"],
    fields: ["public health", "education", "engineering", "agriculture"],
    amount: 38000,
    deadline: "2027-04-30",
    url: "https://www.dfat.gov.au/people-to-people/australia-awards",
    snippet: "Covers tuition, travel, and living costs for eligible students from partner countries.",
  },
  {
    id: "holland-scholarship",
    title: "Holland Scholarship",
    provider: "Dutch Ministry of Education",
    targetCountries: ["Netherlands"],
    degrees: ["bachelors", "masters"],
    fields: ["business", "engineering", "design", "social sciences"],
    amount: 5500,
    deadline: "2027-02-01",
    url: "https://www.studyinnl.org/finances/holland-scholarship",
    snippet: "Entry scholarship for non-EEA students beginning study in the Netherlands.",
  },
];

const VISA_TEMPLATES = {
  "United Kingdom": {
    visa_type: "UK Student Visa",
    processing_time: "3 to 6 weeks after biometrics",
    fee_usd_approx: 650,
    official_url: "https://www.gov.uk/student-visa",
    financial_requirement: "Plan for first-year tuition plus living costs, commonly benchmarked using London vs non-London maintenance rules.",
    health_surcharge_note: "You will usually also pay the Immigration Health Surcharge during the visa application.",
    visa_steps: [
      { step_number: 1, title: "Receive CAS from your university", description: "Confirm your offer, pay any required deposit, and wait for the Confirmation of Acceptance for Studies.", estimated_days: 7, documents_needed: ["Offer letter", "Passport"], tips: "Double-check your personal details on the CAS." },
      { step_number: 2, title: "Prepare funds and supporting documents", description: "Collect bank statements, academic records, English test results, and TB certificate if required.", estimated_days: 10, documents_needed: ["Bank statement", "Academic transcripts", "IELTS / equivalent"], tips: "Keep financial evidence consistent with visa form details." },
      { step_number: 3, title: "Submit visa form and biometrics", description: "Complete the online application, pay the visa fee and health surcharge, then attend biometrics.", estimated_days: 3, documents_needed: ["Visa application form", "Biometrics appointment"], tips: "Book biometrics early if your intake is close." },
    ],
    required_documents: ["Passport", "CAS letter", "Proof of funds", "Academic transcripts", "English language proof"],
    common_rejection_reasons: [
      "Insufficient financial evidence",
      "Errors between CAS details and application form",
      "Missing English language proof",
      "Incomplete travel or study history",
    ],
  },
  "Canada": {
    visa_type: "Canada Study Permit",
    processing_time: "6 to 10 weeks depending on region",
    fee_usd_approx: 185,
    official_url: "https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit.html",
    financial_requirement: "Prepare tuition evidence plus living funds; many students target at least tuition plus CAD 10,000+ living cost coverage.",
    health_surcharge_note: "Medical exams and biometrics may be required depending on nationality and travel history.",
    visa_steps: [
      { step_number: 1, title: "Get your letter of acceptance", description: "Your institution should be a Designated Learning Institution before you apply.", estimated_days: 5, documents_needed: ["Letter of acceptance"], tips: "Verify the DLI number on your admission paperwork." },
      { step_number: 2, title: "Prepare proof of funds", description: "Gather tuition payment proof, bank statements, sponsor documents, and any GIC details if applicable.", estimated_days: 10, documents_needed: ["Bank statements", "Tuition receipt"], tips: "Show a clean source of funds trail." },
      { step_number: 3, title: "Apply online and complete biometrics", description: "Submit the study permit application, then complete biometrics when instructed.", estimated_days: 7, documents_needed: ["Online forms", "Passport", "Biometrics"], tips: "Upload clear scans and keep file names organized." },
    ],
    required_documents: ["Passport", "Letter of acceptance", "Proof of funds", "Statement of purpose", "Biometrics"],
    common_rejection_reasons: [
      "Weak proof of funds",
      "Unclear study plan",
      "Institution not recognized as a DLI",
      "Missing supporting documents",
    ],
  },
  "Germany": {
    visa_type: "Germany National Visa for Study",
    processing_time: "4 to 12 weeks depending on embassy load",
    fee_usd_approx: 90,
    official_url: "https://www.make-it-in-germany.com/en/study-training/studies-in-germany/visa",
    financial_requirement: "Many students need blocked-account style funding or equivalent proof to show living support.",
    health_surcharge_note: "Health insurance is normally required before enrollment can be completed.",
    visa_steps: [
      { step_number: 1, title: "Secure university admission", description: "Wait for your admission letter and confirm start date and language of instruction.", estimated_days: 5, documents_needed: ["Admission letter"], tips: "Keep translated copies of academic documents ready." },
      { step_number: 2, title: "Arrange financing and insurance", description: "Prepare blocked account or sponsor evidence, and obtain health insurance documentation.", estimated_days: 14, documents_needed: ["Blocked account proof", "Insurance confirmation"], tips: "Blocked-account paperwork often takes longer than expected." },
      { step_number: 3, title: "Attend embassy appointment", description: "Submit the national visa application and interview documents.", estimated_days: 3, documents_needed: ["Visa form", "Passport photos", "Appointment confirmation"], tips: "Carry original academic and financial documents." },
    ],
    required_documents: ["Passport", "Admission letter", "Funding proof", "Insurance proof", "Academic documents"],
    common_rejection_reasons: [
      "Insufficient financing evidence",
      "Incomplete translations",
      "Insurance not accepted",
      "Application too close to intake",
    ],
  },
};

function normalise(value) {
  return String(value || "").trim().toLowerCase();
}

function includesAny(text, terms) {
  const hay = normalise(text);
  return terms.some((term) => hay.includes(normalise(term)));
}

function scoreUniversity(uni, profile) {
  let score = 0;
  const degree = normalise(profile.targetDegree);
  const field = normalise(profile.fieldOfStudy);
  const targetCountry = profile.targetCountries?.[0];
  const budgetMax = Number(profile.budgetMax || 0);

  if (!targetCountry || uni.country === targetCountry) score += 3;
  if (!degree || includesAny(uni.programs.join(" "), [degree])) score += 1;
  if (!field || includesAny(uni.programs.join(" "), [field])) score += 3;
  if (!budgetMax || uni.tuition_usd <= budgetMax * 1.15) score += 2;
  if ((profile.languageTests || []).length === 0 || !uni.ielts_min || uni.ielts_min <= 7) score += 1;
  score += Math.max(0, 3 - Math.floor((uni.qs_ranking || 200) / 50));

  return score;
}

function deriveFitLevel(uni, profile) {
  const budgetMax = Number(profile.budgetMax || 0);
  if (uni.qs_ranking <= 25) return "reach";
  if (budgetMax && uni.tuition_usd > budgetMax * 1.2) return "reach";
  if (uni.qs_ranking >= 80 || uni.tuition_usd < 10000) return "safety";
  return "match";
}

export function getLocalUniversityResults(profile, filters = {}) {
  const query = normalise(filters.query || "");
  const country = filters.country || profile.targetCountries?.[0] || "";
  const degree = normalise(filters.degree || profile.targetDegree);
  const budgetMax = Number(filters.budgetMax || 0);
  const ielts = Number(filters.ielts || 0);

  return UNIVERSITY_CATALOG
    .filter((uni) => {
      if (country && uni.country !== country) return false;
      if (query && !includesAny(`${uni.name} ${uni.description} ${uni.programs.join(" ")}`, [query])) return false;
      if (degree && !includesAny(uni.programs.join(" "), [degree, profile.fieldOfStudy])) return false;
      if (budgetMax > 0 && uni.tuition_usd > budgetMax) return false;
      if (ielts > 0 && uni.ielts_min > ielts) return false;
      return true;
    })
    .map((uni) => ({
      ...uni,
      fit_level: deriveFitLevel(uni, profile),
      program_name: profile.fieldOfStudy ? `${profile.fieldOfStudy} pathway` : uni.programs[0],
    }))
    .sort((a, b) => scoreUniversity(b, profile) - scoreUniversity(a, profile));
}

export function getSuggestedUniversities(profile, limit = 4) {
  return getLocalUniversityResults(profile, {
    country: profile.targetCountries?.[0] || "",
    degree: profile.targetDegree || "",
    budgetMax: profile.budgetMax || 0,
  }).slice(0, limit);
}

export function getLocalScholarships(profile) {
  const country = profile.targetCountries?.[0];
  const degree = normalise(profile.targetDegree);
  const field = normalise(profile.fieldOfStudy);

  return SCHOLARSHIP_CATALOG
    .filter((scholarship) => {
      if (country && !scholarship.targetCountries.includes(country)) return false;
      if (degree && !scholarship.degrees.includes(degree)) return false;
      if (field && scholarship.fields.length > 0 && !includesAny(scholarship.fields.join(" "), [field])) return false;
      return true;
    })
    .map((scholarship, index) => ({
      ...scholarship,
      matchScore: Math.max(62, 88 - index * 6),
      country: country || scholarship.targetCountries[0],
    }));
}

export function getLocalVisaData(profile) {
  const toCountry = profile.targetCountries?.[0] || "United Kingdom";
  const fromCountry = profile.nationality || profile.homeCountry || "";
  const template = VISA_TEMPLATES[toCountry] || VISA_TEMPLATES["United Kingdom"];

  return {
    ...template,
    from_country: fromCountry,
    to_country: toCountry,
    nationality_specific_notes: fromCountry
      ? `Prepare documents that clearly show your academic history and finances from ${fromCountry}.`
      : "",
    total_estimated_days: template.visa_steps.reduce((sum, step) => sum + (step.estimated_days || 0), 0),
    earliest_apply_before_course: "Aim to start preparations 3 to 4 months before intake.",
  };
}

export function getOfflineChatReply(message, profile) {
  const text = normalise(message);

  if (includesAny(text, ["scholarship", "fund", "funding"])) {
    const scholarships = getLocalScholarships(profile).slice(0, 3);
    if (scholarships.length === 0) {
      return "I could not reach live scholarship search, but based on your profile I would broaden to United Kingdom, Canada, or Germany and target merit plus government-funded awards.";
    }
    return [
      "Live AI is unavailable right now, but here are strong scholarship directions from your profile:",
      ...scholarships.map((item) => `- ${item.title}: ${item.provider}, about $${item.amount.toLocaleString()} support, best fit for ${item.country}.`),
      "Open the Scholarships tab again after refresh if you want the curated list on screen.",
    ].join("\n");
  }

  if (includesAny(text, ["university", "universities", "shortlist", "college"])) {
    const universities = getSuggestedUniversities(profile, 3);
    return [
      "I could not reach live university search, but these are sensible matches from your profile:",
      ...universities.map((item) => `- ${item.name} in ${item.country}: QS #${item.qs_ranking}, tuition about $${item.tuition_usd.toLocaleString()}/year.`),
      "You can also open the Universities tab to see local recommendations and add them to your shortlist.",
    ].join("\n");
  }

  if (includesAny(text, ["visa", "permit", "immigration"])) {
    const visa = getLocalVisaData(profile);
    return [
      `For ${visa.to_country}, a good working assumption is ${visa.visa_type}.`,
      `Processing time is usually ${visa.processing_time}.`,
      `Start with: ${visa.required_documents.slice(0, 4).join(", ")}.`,
      "Use the Visa tab for the full offline guide while the live service is unavailable.",
    ].join("\n");
  }

  if (includesAny(text, ["document", "checklist", "sop", "statement"])) {
    return [
      "A safe starter application checklist is:",
      "- Passport",
      "- Academic transcripts",
      "- English test score",
      "- Statement of purpose",
      "- Recommendation letters",
      "- Financial proof",
      "The Documents tab should already show a fuller checklist for you.",
    ].join("\n");
  }

  const country = profile.targetCountries?.[0] || "your target country";
  const degree = profile.targetDegree || "your target degree";
  return `Live AI is unavailable right now, but I can still help with general guidance. Based on your profile, focus first on ${degree} options in ${country}, funding fit, and visa preparation timelines.`;
}
