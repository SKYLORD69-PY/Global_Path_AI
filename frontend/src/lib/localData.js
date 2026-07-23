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
    visa_type: "UK Student Visa (formerly Tier 4)",
    processing_time: "3 to 6 weeks after biometrics",
    fee_usd_approx: 630,
    official_url: "https://www.gov.uk/student-visa",
    financial_requirement: "Must show first-year tuition + £1,334/month (London) or £1,023/month (outside London) held continuously for 28 days.",
    health_surcharge_note: "Immigration Health Surcharge (IHS) of ~£776 per year required for NHS healthcare access.",
    visa_steps: [
      { step_number: 1, title: "Obtain CAS from your UK University", description: "Unconditional offer accepted, deposit paid. University issues 14-digit Confirmation of Acceptance for Studies.", estimated_days: 7, documents_needed: ["Offer Letter", "Passport", "Academic Transcripts"], tips: "Check your exact name, birthdate, and course start date on the CAS." },
      { step_number: 2, title: "Maintain 28-day financial proof", description: "Hold required maintenance funds in bank account for 28 consecutive days without dropping below threshold.", estimated_days: 28, documents_needed: ["Bank Statement", "Sponsor Letter", "Bank Balance Certificate"], tips: "Bank statement must be dated within 31 days of visa submission." },
      { step_number: 3, title: "Complete online visa application & IHS", description: "Fill online form on gov.uk, pay visa fee (£490) and IHS health surcharge.", estimated_days: 2, documents_needed: ["Visa Form", "CAS reference", "TB Test (if required)"], tips: "TB test required for students from India, Nigeria, Pakistan, China, etc." },
      { step_number: 4, title: "Attend Biometrics appointment", description: "Submit fingerprints and photograph at VFS Global / TLScontact centre.", estimated_days: 3, documents_needed: ["Appointment Confirmation", "Passport", "Document Checklist"], tips: "Keep your original passport ready for visa stamping." },
    ],
    required_documents: [
      "Valid Passport (with at least 1 blank page)",
      "Official CAS Letter from university",
      "28-Day Bank Statement meeting UKVI maintenance threshold",
      "Tuberculosis (TB) Test Certificate (from UKVI-approved clinic)",
      "Academic Transcripts & English Proficiency (IELTS / MOI)",
      "ATAS Certificate (if enrolled in sensitive STEM/Engineering fields)",
    ],
    common_rejection_reasons: [
      "Financial maintenance funds dropped below requirement within the 28-day window",
      "CAS details mismatched with personal passport or application data",
      "Bank statement issued older than 31 days before application date",
      "TB test omitted or obtained from an unapproved medical centre",
    ],
  },
  "United States": {
    visa_type: "US F-1 Student Visa",
    processing_time: "2 to 8 weeks (Requires in-person embassy interview)",
    fee_usd_approx: 535,
    official_url: "https://travel.state.gov/content/travel/en/us-visas/study/student-visa.html",
    financial_requirement: "Must show proof of total first-year cost of attendance (Tuition + Living) listed on Form I-20.",
    health_surcharge_note: "SEVIS I-901 fee ($350) required prior to booking visa interview.",
    visa_steps: [
      { step_number: 1, title: "Receive Form I-20 from university", description: "Issued by SEVP-approved US university showing course dates and financial breakdown.", estimated_days: 7, documents_needed: ["Admission Letter", "Financial Affidavit"], tips: "Verify your SEVIS ID number at top right of Form I-20." },
      { step_number: 2, title: "Pay SEVIS I-901 fee ($350)", description: "Pay SEVIS fee online via fmjfee.com and download payment receipt.", estimated_days: 1, documents_needed: ["Form I-20", "Credit Card"], tips: "Print and save multiple copies of SEVIS receipt." },
      { step_number: 3, title: "Submit DS-160 & book interview", description: "Fill online nonimmigrant visa form DS-160 and schedule OFC biometrics + Embassy Interview.", estimated_days: 5, documents_needed: ["DS-160 Barcode", "Passport Photo", "Visa Fee Receipt"], tips: "Ensure DS-160 location matches the consulate where interview is held." },
      { step_number: 4, title: "Attend Visa Interview at US Embassy", description: "In-person interview with consular officer focusing on academic intent and ties to home country.", estimated_days: 1, documents_needed: ["Passport", "I-20", "SEVIS Receipt", "Financial Proof", "Academic Transcripts"], tips: "Be direct, concise, and clearly explain why this degree aligns with your career goals." },
    ],
    required_documents: [
      "Valid Passport (valid 6+ months beyond intent of stay)",
      "Form I-20 signed by student and Designated School Official (DSO)",
      "SEVIS I-901 Fee Payment Receipt ($350)",
      "DS-160 Confirmation Page with Barcode",
      "Financial Proof (6 months bank statements, IT returns, fixed deposit receipts)",
      "Standardized Test Scores (GRE / GMAT / TOEFL / IELTS)",
    ],
    common_rejection_reasons: [
      "Failure to demonstrate nonimmigrant intent under INA Section 214(b)",
      "Inability to explain financial sponsorship source clearly during interview",
      "Inconsistent answers between DS-160 application and spoken responses",
      "Unconvincing academic background or reasons for chosen university",
    ],
  },
  "Canada": {
    visa_type: "Canada Study Permit",
    processing_time: "4 to 10 weeks",
    fee_usd_approx: 180,
    official_url: "https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit.html",
    financial_requirement: "First-year tuition proof plus CAD $20,635+ living expense coverage (or GIC certificate).",
    health_surcharge_note: "Upfront medical exam required from IRCC panel physician before application.",
    visa_steps: [
      { step_number: 1, title: "Obtain Acceptance Letter & PAL", description: "Receive Letter of Acceptance (LOA) from DLI institution plus Provincial Attestation Letter (PAL).", estimated_days: 10, documents_needed: ["LOA", "PAL Document"], tips: "Verify DLI number on your letter." },
      { step_number: 2, title: "Secure GIC & tuition payment", description: "Purchase Guaranteed Investment Certificate (CAD $20,635) and pay 1st year tuition.", estimated_days: 7, documents_needed: ["GIC Certificate", "Tuition Receipt"], tips: "GIC provides smooth financial verification under SDS." },
      { step_number: 3, title: "Complete Upfront Medical Exam", description: "Undergo health checkup with IRCC panel physician and get medical tracking sheet.", estimated_days: 3, documents_needed: ["Passport", "Medical Form"], tips: "Keep medical tracking e-Medical receipt safe." },
      { step_number: 4, title: "Submit Study Permit & Biometrics", description: "Apply online via IRCC Portal and complete biometrics at VFS Canada.", estimated_days: 5, documents_needed: ["IRCC Online Application", "Biometrics Letter"], tips: "Write a strong Statement of Purpose (SOP / Study Plan)." },
    ],
    required_documents: [
      "Valid Passport & 2 Passport Photos",
      "Letter of Acceptance (LOA) from Designated Learning Institution (DLI)",
      "Provincial Attestation Letter (PAL)",
      "GIC Certificate (CAD $20,635+) & First-Year Tuition Receipt",
      "IRCC Upfront Medical Examination Sheet",
      "Detailed Statement of Purpose / Study Plan for Canada",
    ],
    common_rejection_reasons: [
      "IRCC officer not satisfied applicant will leave Canada at end of authorized stay",
      "Insufficient financial resources shown beyond the initial year",
      "Vague or poorly articulated Statement of Purpose",
      "Discrepancy between past work/study history and proposed program",
    ],
  },
  "Germany": {
    visa_type: "Germany National Visa (Type D - Study)",
    processing_time: "4 to 8 weeks",
    fee_usd_approx: 85,
    official_url: "https://www.make-it-in-germany.com/en/study-training/studies-in-germany/visa",
    financial_requirement: "Blocked Account (Sperrkonto) funded with at least €11,208 per year (€934/month).",
    health_surcharge_note: "Public health insurance (Techniker Krankenkasse / Barmer) or private incoming insurance required.",
    visa_steps: [
      { step_number: 1, title: "Obtain University Admission Letter", description: "Receive Zulassungsbescheid (Admission Letter) or Uni-Assist VPD certificate.", estimated_days: 7, documents_needed: ["Admission Letter"], tips: "Verify language of instruction (English vs German)." },
      { step_number: 2, title: "Open & Fund Sperrkonto (Blocked Account)", description: "Open blocked account via Expatrio/Fintiba and transfer €11,208 minimum balance.", estimated_days: 5, documents_needed: ["Passport", "Sperrkonto Confirmation"], tips: "Transfer funds early to avoid embassy appointment delays." },
      { step_number: 3, title: "APS Certificate (Mandatory for India/China/Vietnam)", description: "Verify academic transcripts through Akademische Prüfstelle (APS) office.", estimated_days: 30, documents_needed: ["Degrees", "Transcripts", "APS Application"], tips: "Apply for APS certificate months in advance." },
      { step_number: 4, title: "German Embassy / VFS Appointment", description: "Submit national visa documents and attend interview at consulate.", estimated_days: 3, documents_needed: ["Videx Form", "Sperrkonto Proof", "APS Certificate"], tips: "Bring original degrees and certified German/English translations." },
    ],
    required_documents: [
      "Valid Passport & Biometric Passport Photos",
      "Zulassungsbescheid (German University Admission Letter)",
      "Sperrkonto (Blocked Account) confirmation of €11,208",
      "APS Certificate (for applicants from India, China, Vietnam)",
      "Proof of Health Insurance (Krankenkasse confirmation)",
      "Curriculum Vitae (CV) & Motivation Letter",
    ],
    common_rejection_reasons: [
      "Missing mandatory APS Certificate for applicants from eligible countries",
      "Blocked account balance less than official €11,208 requirement",
      "Uncertified or untranslated academic documents",
      "Inadequate health insurance documentation",
    ],
  },
  "Australia": {
    visa_type: "Australia Student Visa (Subclass 500)",
    processing_time: "2 to 6 weeks",
    fee_usd_approx: 475,
    official_url: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500",
    financial_requirement: "Show AUD $29,710/year living costs + 1st year tuition + AUD $2,000 travel funds.",
    health_surcharge_note: "Overseas Student Health Cover (OSHC) mandatory for full duration of stay.",
    visa_steps: [
      { step_number: 1, title: "Receive Electronic Confirmation of Enrolment (eCoE)", description: "Accept university offer, pay tuition deposit and OSHC health coverage.", estimated_days: 5, documents_needed: ["Offer Letter", "Deposit Receipt"], tips: "Verify course start date and CRICOS code on eCoE." },
      { step_number: 2, title: "Purchase OSHC Health Insurance", description: "Buy approved OSHC policy (Bupa, Medibank, Allianz) covering full study period.", estimated_days: 1, documents_needed: ["Passport", "eCoE"], tips: "Policy end date must cover course completion plus buffer." },
      { step_number: 3, title: "Draft Genuine Student (GS) Statement", description: "Write structured GS statement addressing choice of Australia, program value, and post-study plans.", estimated_days: 4, documents_needed: ["GS Form"], tips: "Focus on economic value of degree to your home country career." },
      { step_number: 4, title: "Apply via ImmiAccount & complete Medicals", description: "Submit visa on Home Affairs portal, complete biometrics and panel doctor medical exam.", estimated_days: 5, documents_needed: ["ImmiAccount Form", "HAP ID Medical"], tips: "Complete medical checkup promptly using your HAP ID." },
    ],
    required_documents: [
      "Valid Passport & Electronic Confirmation of Enrolment (eCoE)",
      "Overseas Student Health Cover (OSHC) Policy Certificate",
      "Genuine Student (GS) Personal Statement",
      "Financial Capacity Evidence (AUD $29,710 living costs + tuition)",
      "Academic Transcripts & English Test Result (IELTS / PTE Academic)",
      "HAP ID Panel Physician Medical Exam Report",
    ],
    common_rejection_reasons: [
      "Unconvincing Genuine Student (GS) assessment",
      "Financial documents failed verification check",
      "OSHC policy duration shorter than total visa requirement",
      "English test score below DOHA minimum requirements",
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
