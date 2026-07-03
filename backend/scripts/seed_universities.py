"""
GlobalPath AI — University Seed Script
========================================
Seeds the 'universities' table with 30 realistic universities across
5 countries: USA (10), UK (8), Canada (5), Germany (4), Australia (3).

Run from the backend root:
    python -m scripts.seed_universities
    # or with reset:
    python -m scripts.seed_universities --reset

Uses DATABASE_URL when provided; otherwise falls back to the backend's
local SQLite default for development.
"""

from __future__ import annotations

import asyncio
import argparse
import os
import uuid
from pathlib import Path

from dotenv import load_dotenv
from app.core.config import settings

load_dotenv(dotenv_path=Path(__file__).resolve().parents[1] / ".env")

DEFAULT_DATABASE_URL = settings.DATABASE_URL


def _resolve_database_url(cli_database_url: str | None) -> str:
    url = (cli_database_url or os.getenv("DATABASE_URL") or "").strip()
    if url:
        return url
    return DEFAULT_DATABASE_URL


def _to_asyncpg_url(database_url: str) -> str:
    return database_url.replace("postgresql://", "postgresql+asyncpg://").replace(
        "postgres://", "postgresql+asyncpg://"
    )


def _is_sqlite_url(database_url: str) -> bool:
    return database_url.startswith("sqlite://") or database_url.startswith("sqlite+")

# ─── University data ──────────────────────────────────────────────────────────

UNIVERSITIES: list[dict] = [

    # ── United States (10) ────────────────────────────────────────────────────

    {
        "name": "Massachusetts Institute of Technology (MIT)",
        "country": "United States", "city": "Cambridge, MA",
        "qs_rank": 1,  "the_rank": 1,
        "tuition_usd": 59750,  "tuition_local": "$59,750", "tuition_currency": "USD",
        "programs": ["Computer Science", "Electrical Engineering", "Mathematics",
                     "Physics", "Mechanical Engineering", "Architecture",
                     "Economics", "Data Science", "Robotics", "AI"],
        "ielts_min": 7.0, "toefl_min": 90, "gpa_min": 3.8,
        "application_deadline": "December 15",
        "website": "https://www.mit.edu",
        "accepts_gre": True, "work_experience_required": False,
        "acceptance_rate": 0.04,
        "description": "World-renowned for STEM research and innovation, consistently ranked #1 globally.",
        "scholarship_info": "MIT offers need-blind admissions and generous financial aid for international students.",
        "campus_size": "168 acres", "student_count": 11520, "international_pct": 0.31,
        "cost_of_living_usd_monthly": 3200,
    },
    {
        "name": "Stanford University",
        "country": "United States", "city": "Stanford, CA",
        "qs_rank": 2,  "the_rank": 2,
        "tuition_usd": 62484, "tuition_local": "$62,484", "tuition_currency": "USD",
        "programs": ["Computer Science", "Business (MBA)", "Engineering",
                     "AI", "Biomedical Engineering", "Law", "Education",
                     "Psychology", "Economics", "Data Science"],
        "ielts_min": 7.0, "toefl_min": 89, "gpa_min": 3.85,
        "application_deadline": "December 1",
        "website": "https://www.stanford.edu",
        "accepts_gre": True, "work_experience_required": False,
        "acceptance_rate": 0.04,
        "description": "Located in Silicon Valley — epicentre of tech entrepreneurship and innovation.",
        "scholarship_info": "Knight-Hennessy Scholars programme covers full tuition + stipend.",
        "campus_size": "8,180 acres", "student_count": 17249, "international_pct": 0.24,
        "cost_of_living_usd_monthly": 3600,
    },
    {
        "name": "Harvard University",
        "country": "United States", "city": "Cambridge, MA",
        "qs_rank": 4,  "the_rank": 3,
        "tuition_usd": 54768, "tuition_local": "$54,768", "tuition_currency": "USD",
        "programs": ["Business (MBA)", "Law", "Medicine", "Public Policy",
                     "Computer Science", "Economics", "History", "Psychology",
                     "Political Science", "Public Health"],
        "ielts_min": 7.0, "toefl_min": 100, "gpa_min": 3.9,
        "application_deadline": "January 2",
        "website": "https://www.harvard.edu",
        "accepts_gre": True, "work_experience_required": False,
        "acceptance_rate": 0.04,
        "description": "The oldest university in the USA, globally recognised across all disciplines.",
        "scholarship_info": "Harvard Griffin Graduate School offers substantial merit and need-based aid.",
        "campus_size": "209 acres", "student_count": 23731, "international_pct": 0.26,
        "cost_of_living_usd_monthly": 3200,
    },
    {
        "name": "California Institute of Technology (Caltech)",
        "country": "United States", "city": "Pasadena, CA",
        "qs_rank": 10, "the_rank": 6,
        "tuition_usd": 60864, "tuition_local": "$60,864", "tuition_currency": "USD",
        "programs": ["Physics", "Chemistry", "Computer Science",
                     "Aerospace Engineering", "Biology", "Mathematics",
                     "Mechanical Engineering", "Electrical Engineering"],
        "ielts_min": 7.0, "toefl_min": 100, "gpa_min": 3.9,
        "application_deadline": "December 1",
        "website": "https://www.caltech.edu",
        "accepts_gre": True, "work_experience_required": False,
        "acceptance_rate": 0.06,
        "description": "Tiny elite STEM institution with more Nobel laureates per capita than any other university.",
        "scholarship_info": "Caltech provides fellowships covering tuition and a stipend for PhD students.",
        "campus_size": "124 acres", "student_count": 2233, "international_pct": 0.29,
        "cost_of_living_usd_monthly": 2800,
    },
    {
        "name": "University of California, Berkeley",
        "country": "United States", "city": "Berkeley, CA",
        "qs_rank": 8,  "the_rank": 8,
        "tuition_usd": 44066, "tuition_local": "$44,066", "tuition_currency": "USD",
        "programs": ["Computer Science", "Data Science", "Electrical Engineering",
                     "Business (Haas)", "Law", "Environmental Science",
                     "Economics", "Public Policy", "Chemistry", "Journalism"],
        "ielts_min": 7.0, "toefl_min": 90, "gpa_min": 3.7,
        "application_deadline": "December 17",
        "website": "https://www.berkeley.edu",
        "accepts_gre": True, "work_experience_required": False,
        "acceptance_rate": 0.17,
        "description": "Top-ranked public university with unmatched research output and Silicon Valley connections.",
        "scholarship_info": "Regents' and Chancellor's Scholarship; department fellowships for grad students.",
        "campus_size": "1,232 acres", "student_count": 45057, "international_pct": 0.17,
        "cost_of_living_usd_monthly": 3400,
    },
    {
        "name": "Columbia University",
        "country": "United States", "city": "New York, NY",
        "qs_rank": 22, "the_rank": 12,
        "tuition_usd": 65524, "tuition_local": "$65,524", "tuition_currency": "USD",
        "programs": ["Journalism", "Law", "Business (CBS)", "Computer Science",
                     "Engineering", "Public Health", "Finance",
                     "International Affairs", "Social Work", "Architecture"],
        "ielts_min": 7.0, "toefl_min": 100, "gpa_min": 3.6,
        "application_deadline": "February 15",
        "website": "https://www.columbia.edu",
        "accepts_gre": True, "work_experience_required": False,
        "acceptance_rate": 0.08,
        "description": "Ivy League institution in the heart of Manhattan with exceptional business and journalism schools.",
        "scholarship_info": "Columbia Fellowship and various departmental scholarships available.",
        "campus_size": "36 acres", "student_count": 32429, "international_pct": 0.33,
        "cost_of_living_usd_monthly": 4000,
    },
    {
        "name": "Carnegie Mellon University",
        "country": "United States", "city": "Pittsburgh, PA",
        "qs_rank": 52, "the_rank": 28,
        "tuition_usd": 58924, "tuition_local": "$58,924", "tuition_currency": "USD",
        "programs": ["Computer Science", "AI", "Robotics", "Software Engineering",
                     "Business (Tepper)", "Design", "Drama", "Statistics",
                     "Information Systems", "Human-Computer Interaction"],
        "ielts_min": 7.0, "toefl_min": 100, "gpa_min": 3.6,
        "application_deadline": "December 15",
        "website": "https://www.cmu.edu",
        "accepts_gre": True, "work_experience_required": False,
        "acceptance_rate": 0.17,
        "description": "Global leader in CS, AI, and Robotics research — strong industry partnerships.",
        "scholarship_info": "University Fellowships cover full tuition for PhD students.",
        "campus_size": "157 acres", "student_count": 14799, "international_pct": 0.42,
        "cost_of_living_usd_monthly": 1800,
    },
    {
        "name": "University of Michigan, Ann Arbor",
        "country": "United States", "city": "Ann Arbor, MI",
        "qs_rank": 33, "the_rank": 21,
        "tuition_usd": 52266, "tuition_local": "$52,266", "tuition_currency": "USD",
        "programs": ["Engineering", "Business (Ross)", "Law", "Medicine",
                     "Computer Science", "Data Science", "Public Policy",
                     "Architecture", "Social Work", "Education"],
        "ielts_min": 6.5, "toefl_min": 84, "gpa_min": 3.5,
        "application_deadline": "January 15",
        "website": "https://www.umich.edu",
        "accepts_gre": True, "work_experience_required": False,
        "acceptance_rate": 0.20,
        "description": "Premier US public research university with a top-10 business school.",
        "scholarship_info": "Rackham Graduate School fellowships and department awards.",
        "campus_size": "3,177 acres", "student_count": 47907, "international_pct": 0.17,
        "cost_of_living_usd_monthly": 1700,
    },
    {
        "name": "New York University (NYU)",
        "country": "United States", "city": "New York, NY",
        "qs_rank": 58, "the_rank": 55,
        "tuition_usd": 58168, "tuition_local": "$58,168", "tuition_currency": "USD",
        "programs": ["Business (Stern)", "Law", "Film", "Fine Arts",
                     "Computer Science", "Finance", "Marketing",
                     "Psychology", "Social Work", "Global Affairs"],
        "ielts_min": 6.5, "toefl_min": 84, "gpa_min": 3.4,
        "application_deadline": "January 15",
        "website": "https://www.nyu.edu",
        "accepts_gre": True, "work_experience_required": False,
        "acceptance_rate": 0.21,
        "description": "Global network university with campuses in NYC, Abu Dhabi, and Shanghai.",
        "scholarship_info": "Dean's Scholarships and Henry MacCracken Program for PhD students.",
        "campus_size": "230 acres (urban)", "student_count": 51848, "international_pct": 0.37,
        "cost_of_living_usd_monthly": 4000,
    },
    {
        "name": "UCLA (University of California, Los Angeles)",
        "country": "United States", "city": "Los Angeles, CA",
        "qs_rank": 44, "the_rank": 19,
        "tuition_usd": 43573, "tuition_local": "$43,573", "tuition_currency": "USD",
        "programs": ["Film", "Computer Science", "Business (Anderson)",
                     "Law", "Medicine", "Psychology", "Engineering",
                     "Economics", "Political Science", "Public Health"],
        "ielts_min": 7.0, "toefl_min": 87, "gpa_min": 3.5,
        "application_deadline": "December 1",
        "website": "https://www.ucla.edu",
        "accepts_gre": True, "work_experience_required": False,
        "acceptance_rate": 0.14,
        "description": "Top public university in LA — excellence in arts, sciences, and professional schools.",
        "scholarship_info": "Graduate Division Fellowships; Luskin School merit scholarships.",
        "campus_size": "419 acres", "student_count": 44371, "international_pct": 0.15,
        "cost_of_living_usd_monthly": 3800,
    },

    # ── United Kingdom (8) ────────────────────────────────────────────────────

    {
        "name": "University of Oxford",
        "country": "United Kingdom", "city": "Oxford, England",
        "qs_rank": 3,  "the_rank": 1,
        "tuition_usd": 39000, "tuition_local": "£30,585", "tuition_currency": "GBP",
        "programs": ["Philosophy", "Law", "Medicine", "Computer Science",
                     "Mathematics", "History", "Politics (PPE)",
                     "Economics", "Engineering", "Biochemistry"],
        "ielts_min": 7.5, "toefl_min": 110, "gpa_min": 3.7,
        "application_deadline": "October 15 (some courses); January 20",
        "website": "https://www.ox.ac.uk",
        "accepts_gre": False, "work_experience_required": False,
        "acceptance_rate": 0.17,
        "description": "The world's oldest English-speaking university — tutorial-based learning at its finest.",
        "scholarship_info": "Rhodes Scholarships; Clarendon Fund covers full fees + £18k/yr stipend.",
        "campus_size": "Collegiate (distributed)", "student_count": 24515, "international_pct": 0.46,
        "cost_of_living_usd_monthly": 2200,
    },
    {
        "name": "University of Cambridge",
        "country": "United Kingdom", "city": "Cambridge, England",
        "qs_rank": 2,  "the_rank": 5,
        "tuition_usd": 40000, "tuition_local": "£32,000", "tuition_currency": "GBP",
        "programs": ["Natural Sciences", "Mathematics", "Computer Science",
                     "Engineering", "Law", "Economics", "History",
                     "Medicine", "Architecture", "Management (Judge)"],
        "ielts_min": 7.5, "toefl_min": 110, "gpa_min": 3.8,
        "application_deadline": "October 15",
        "website": "https://www.cam.ac.uk",
        "accepts_gre": False, "work_experience_required": False,
        "acceptance_rate": 0.21,
        "description": "Leading global research university — home to 121 Nobel Prize winners.",
        "scholarship_info": "Gates Cambridge Scholarships (fully funded); Cambridge Trust awards.",
        "campus_size": "Collegiate (distributed)", "student_count": 24450, "international_pct": 0.38,
        "cost_of_living_usd_monthly": 2100,
    },
    {
        "name": "Imperial College London",
        "country": "United Kingdom", "city": "London, England",
        "qs_rank": 6,  "the_rank": 8,
        "tuition_usd": 45000, "tuition_local": "£35,450", "tuition_currency": "GBP",
        "programs": ["Engineering", "Medicine", "Computer Science",
                     "Business (Imperial Business School)", "Physics",
                     "Chemistry", "Biomedical Engineering", "Data Science",
                     "Environmental Science", "Mathematics"],
        "ielts_min": 7.0, "toefl_min": 100, "gpa_min": 3.6,
        "application_deadline": "January 15",
        "website": "https://www.imperial.ac.uk",
        "accepts_gre": False, "work_experience_required": False,
        "acceptance_rate": 0.20,
        "description": "World-class STEM-focused university in South Kensington with strong industry links.",
        "scholarship_info": "President's PhD Scholarships; various departmental bursaries.",
        "campus_size": "Urban campus", "student_count": 19400, "international_pct": 0.55,
        "cost_of_living_usd_monthly": 2800,
    },
    {
        "name": "University College London (UCL)",
        "country": "United Kingdom", "city": "London, England",
        "qs_rank": 9,  "the_rank": 22,
        "tuition_usd": 38000, "tuition_local": "£29,800", "tuition_currency": "GBP",
        "programs": ["Law", "Architecture", "Computer Science", "Psychology",
                     "Economics", "Neuroscience", "Mechanical Engineering",
                     "Public Health", "Education", "Urban Planning"],
        "ielts_min": 7.0, "toefl_min": 96, "gpa_min": 3.5,
        "application_deadline": "January 26",
        "website": "https://www.ucl.ac.uk",
        "accepts_gre": False, "work_experience_required": False,
        "acceptance_rate": 0.63,
        "description": "London's leading multidisciplinary university with excellent research output.",
        "scholarship_info": "Provost's Teaching Awards; Denys Holland Scholarship.",
        "campus_size": "Urban campus", "student_count": 42000, "international_pct": 0.58,
        "cost_of_living_usd_monthly": 2800,
    },
    {
        "name": "London School of Economics (LSE)",
        "country": "United Kingdom", "city": "London, England",
        "qs_rank": 45, "the_rank": 27,
        "tuition_usd": 34000, "tuition_local": "£26,760", "tuition_currency": "GBP",
        "programs": ["Economics", "Law", "Finance", "Political Science",
                     "International Relations", "Sociology", "Statistics",
                     "Public Administration", "Accounting", "Development Studies"],
        "ielts_min": 7.0, "toefl_min": 107, "gpa_min": 3.5,
        "application_deadline": "January 22",
        "website": "https://www.lse.ac.uk",
        "accepts_gre": False, "work_experience_required": False,
        "acceptance_rate": 0.16,
        "description": "World-leading social science university in Central London.",
        "scholarship_info": "LSE Graduate Support Scheme; Chevening partners with LSE.",
        "campus_size": "Urban campus", "student_count": 13000, "international_pct": 0.71,
        "cost_of_living_usd_monthly": 2900,
    },
    {
        "name": "University of Edinburgh",
        "country": "United Kingdom", "city": "Edinburgh, Scotland",
        "qs_rank": 27, "the_rank": 30,
        "tuition_usd": 32000, "tuition_local": "£25,500", "tuition_currency": "GBP",
        "programs": ["Medicine", "Law", "Computer Science", "Business",
                     "Engineering", "Art", "Philosophy", "Informatics",
                     "Geosciences", "Veterinary Medicine"],
        "ielts_min": 6.5, "toefl_min": 92, "gpa_min": 3.3,
        "application_deadline": "March 31",
        "website": "https://www.ed.ac.uk",
        "accepts_gre": False, "work_experience_required": False,
        "acceptance_rate": 0.43,
        "description": "Scotland's leading university, ranked in the global top 30 for research.",
        "scholarship_info": "Edinburgh Global Scholarships; Principal's Career Development Scholarships.",
        "campus_size": "Urban (620 acres)", "student_count": 38300, "international_pct": 0.40,
        "cost_of_living_usd_monthly": 1600,
    },
    {
        "name": "University of Manchester",
        "country": "United Kingdom", "city": "Manchester, England",
        "qs_rank": 34, "the_rank": 56,
        "tuition_usd": 30000, "tuition_local": "£23,500", "tuition_currency": "GBP",
        "programs": ["Computer Science", "Engineering", "Business", "Medicine",
                     "Law", "Physics", "Chemistry", "Social Sciences",
                     "Life Sciences", "Economics"],
        "ielts_min": 6.5, "toefl_min": 90, "gpa_min": 3.3,
        "application_deadline": "January 31",
        "website": "https://www.manchester.ac.uk",
        "accepts_gre": False, "work_experience_required": False,
        "acceptance_rate": 0.57,
        "description": "Red Brick research university — 25 Nobel Laureates, strong graduate employment.",
        "scholarship_info": "President's Doctoral Scholar Award; Alliance Manchester Business School scholarships.",
        "campus_size": "360 acres", "student_count": 40000, "international_pct": 0.33,
        "cost_of_living_usd_monthly": 1500,
    },
    {
        "name": "King's College London (KCL)",
        "country": "United Kingdom", "city": "London, England",
        "qs_rank": 40, "the_rank": 40,
        "tuition_usd": 33000, "tuition_local": "£25,920", "tuition_currency": "GBP",
        "programs": ["Law", "Medicine", "Nursing", "Business", "Psychology",
                     "Computer Science", "History", "Political Science",
                     "International Relations", "Philosophy"],
        "ielts_min": 7.0, "toefl_min": 100, "gpa_min": 3.4,
        "application_deadline": "January 22",
        "website": "https://www.kcl.ac.uk",
        "accepts_gre": False, "work_experience_required": False,
        "acceptance_rate": 0.35,
        "description": "Central London university with world-class law, medicine, and humanities programmes.",
        "scholarship_info": "King's-China Scholarship Council PhD Scholarships; various faculty awards.",
        "campus_size": "Urban campus", "student_count": 31000, "international_pct": 0.45,
        "cost_of_living_usd_monthly": 2800,
    },

    # ── Canada (5) ────────────────────────────────────────────────────────────

    {
        "name": "University of Toronto",
        "country": "Canada", "city": "Toronto, ON",
        "qs_rank": 21, "the_rank": 18,
        "tuition_usd": 40000, "tuition_local": "CA$54,000", "tuition_currency": "CAD",
        "programs": ["Computer Science", "Engineering", "Business (Rotman)",
                     "Law", "Medicine", "Economics", "Public Policy",
                     "Data Science", "Psychology", "Education"],
        "ielts_min": 6.5, "toefl_min": 89, "gpa_min": 3.5,
        "application_deadline": "January 15",
        "website": "https://www.utoronto.ca",
        "accepts_gre": True, "work_experience_required": False,
        "acceptance_rate": 0.43,
        "description": "Canada's leading research university — in the heart of Toronto's diverse tech hub.",
        "scholarship_info": "Lester B. Pearson Scholarship (full funding); Connaught Fellowship.",
        "campus_size": "712 acres", "student_count": 97000, "international_pct": 0.25,
        "cost_of_living_usd_monthly": 2000,
    },
    {
        "name": "University of British Columbia (UBC)",
        "country": "Canada", "city": "Vancouver, BC",
        "qs_rank": 34, "the_rank": 37,
        "tuition_usd": 35000, "tuition_local": "CA$47,000", "tuition_currency": "CAD",
        "programs": ["Computer Science", "Business (Sauder)", "Engineering",
                     "Forestry", "Medicine", "Law", "Education",
                     "Environmental Science", "Psychology", "Economics"],
        "ielts_min": 6.5, "toefl_min": 90, "gpa_min": 3.4,
        "application_deadline": "January 15",
        "website": "https://www.ubc.ca",
        "accepts_gre": True, "work_experience_required": False,
        "acceptance_rate": 0.52,
        "description": "West-coast global university with stunning campus — strong sustainability research.",
        "scholarship_info": "International Leader of Tomorrow Award; 4YF PhD funding.",
        "campus_size": "1,000 acres", "student_count": 68000, "international_pct": 0.30,
        "cost_of_living_usd_monthly": 2100,
    },
    {
        "name": "McGill University",
        "country": "Canada", "city": "Montreal, QC",
        "qs_rank": 46, "the_rank": 46,
        "tuition_usd": 28000, "tuition_local": "CA$37,500", "tuition_currency": "CAD",
        "programs": ["Medicine", "Law", "Engineering", "Business (Desautels)",
                     "Music", "Computer Science", "Nursing",
                     "Bioresource Engineering", "Economics", "Political Science"],
        "ielts_min": 6.5, "toefl_min": 90, "gpa_min": 3.4,
        "application_deadline": "January 15",
        "website": "https://www.mcgill.ca",
        "accepts_gre": True, "work_experience_required": False,
        "acceptance_rate": 0.47,
        "description": "Canada's most internationally recognised university — bilingual city, affordable lifestyle.",
        "scholarship_info": "Schulich Leader Scholarship; McCall MacBain Scholarship (full funding).",
        "campus_size": "80 acres (downtown)", "student_count": 40000, "international_pct": 0.30,
        "cost_of_living_usd_monthly": 1500,
    },
    {
        "name": "University of Waterloo",
        "country": "Canada", "city": "Waterloo, ON",
        "qs_rank": 112, "the_rank": 201,
        "tuition_usd": 36000, "tuition_local": "CA$48,000", "tuition_currency": "CAD",
        "programs": ["Computer Science", "Software Engineering", "Mathematics",
                     "Data Science", "Systems Design Engineering",
                     "Mechatronics", "Accounting", "Quantum Computing",
                     "Environmental Engineering", "Science"],
        "ielts_min": 6.5, "toefl_min": 90, "gpa_min": 3.4,
        "application_deadline": "February 1",
        "website": "https://www.uwaterloo.ca",
        "accepts_gre": False, "work_experience_required": False,
        "acceptance_rate": 0.53,
        "description": "Canada's top tech university — co-op programme produces industry-ready graduates.",
        "scholarship_info": "President's Scholarship of Distinction; International Master's Award.",
        "campus_size": "1,000 acres", "student_count": 42000, "international_pct": 0.30,
        "cost_of_living_usd_monthly": 1400,
    },
    {
        "name": "University of Alberta",
        "country": "Canada", "city": "Edmonton, AB",
        "qs_rank": 111, "the_rank": 131,
        "tuition_usd": 25000, "tuition_local": "CA$33,500", "tuition_currency": "CAD",
        "programs": ["Engineering", "Computer Science", "Business", "Medicine",
                     "Law", "Education", "Pharmacy", "Nursing",
                     "Environmental Sciences", "Agriculture"],
        "ielts_min": 6.5, "toefl_min": 90, "gpa_min": 3.2,
        "application_deadline": "March 1",
        "website": "https://www.ualberta.ca",
        "accepts_gre": False, "work_experience_required": False,
        "acceptance_rate": 0.59,
        "description": "Top-5 Canadian university with strong research in AI, energy, and health.",
        "scholarship_info": "International Student Scholarship; Doctoral Recruitment Scholarship.",
        "campus_size": "153 acres (north campus)", "student_count": 40000, "international_pct": 0.22,
        "cost_of_living_usd_monthly": 1300,
    },

    # ── Germany (4) ──────────────────────────────────────────────────────────

    {
        "name": "Technical University of Munich (TUM)",
        "country": "Germany", "city": "Munich",
        "qs_rank": 37, "the_rank": 30,
        "tuition_usd": 2400, "tuition_local": "€1,800 (semester fee)", "tuition_currency": "EUR",
        "programs": ["Computer Science", "Electrical Engineering", "Mechanical Engineering",
                     "Data Engineering", "Robotics", "Informatics",
                     "Management & Technology", "Aerospace Engineering",
                     "Chemistry", "Physics"],
        "ielts_min": 6.5, "toefl_min": 88, "gpa_min": 3.3,
        "application_deadline": "May 31 (winter); November 30 (summer)",
        "website": "https://www.tum.de",
        "accepts_gre": False, "work_experience_required": False,
        "acceptance_rate": 0.08,
        "description": "Germany's elite technical university — ranked in the global top 40.",
        "scholarship_info": "DAAD Scholarships; TUM Graduate School funding; DFG project positions.",
        "campus_size": "Multiple campuses", "student_count": 50000, "international_pct": 0.35,
        "cost_of_living_usd_monthly": 1200,
    },
    {
        "name": "Ludwig Maximilian University of Munich (LMU Munich)",
        "country": "Germany", "city": "Munich",
        "qs_rank": 59, "the_rank": 32,
        "tuition_usd": 2400, "tuition_local": "€1,800 (semester fee)", "tuition_currency": "EUR",
        "programs": ["Medicine", "Law", "Business Administration", "Physics",
                     "Computer Science", "Psychology", "Economics",
                     "History", "Philosophy", "Biology"],
        "ielts_min": 6.5, "toefl_min": 88, "gpa_min": 3.2,
        "application_deadline": "May 31",
        "website": "https://www.lmu.de",
        "accepts_gre": False, "work_experience_required": False,
        "acceptance_rate": 0.15,
        "description": "One of Germany's oldest universities — excellence across humanities, sciences, and medicine.",
        "scholarship_info": "LMU Excellence Initiative scholarships; Bavarian State Scholarships.",
        "campus_size": "Main building + distributed", "student_count": 51000, "international_pct": 0.22,
        "cost_of_living_usd_monthly": 1200,
    },
    {
        "name": "Heidelberg University",
        "country": "Germany", "city": "Heidelberg",
        "qs_rank": 87,  "the_rank": 43,
        "tuition_usd": 2600, "tuition_local": "€1,950 (semester fee)", "tuition_currency": "EUR",
        "programs": ["Medicine", "Chemistry", "Biology", "Physics",
                     "Law", "Economics", "Philosophy", "History",
                     "Computer Science", "Mathematics"],
        "ielts_min": 6.5, "toefl_min": 88, "gpa_min": 3.2,
        "application_deadline": "May 15",
        "website": "https://www.uni-heidelberg.de",
        "accepts_gre": False, "work_experience_required": False,
        "acceptance_rate": 0.20,
        "description": "Germany's oldest university (founded 1386) with outstanding natural science faculties.",
        "scholarship_info": "Heidelberg Excellence Initiative scholarships; HGSFP doctoral programme.",
        "campus_size": "Main town campus", "student_count": 28000, "international_pct": 0.20,
        "cost_of_living_usd_monthly": 950,
    },
    {
        "name": "RWTH Aachen University",
        "country": "Germany", "city": "Aachen",
        "qs_rank": 106, "the_rank": 78,
        "tuition_usd": 2400, "tuition_local": "€1,800 (semester fee)", "tuition_currency": "EUR",
        "programs": ["Mechanical Engineering", "Electrical Engineering", "Computer Science",
                     "Civil Engineering", "Business Engineering", "Physics",
                     "Architecture", "Materials Science", "Aerospace Engineering", "Mining"],
        "ielts_min": 6.5, "toefl_min": 88, "gpa_min": 3.3,
        "application_deadline": "June 1",
        "website": "https://www.rwth-aachen.de",
        "accepts_gre": False, "work_experience_required": False,
        "acceptance_rate": 0.14,
        "description": "Germany's leading technical university — world-class engineering and technology.",
        "scholarship_info": "E.ON Stipendienprogramm; DAAD; Excellence Initiative graduate school.",
        "campus_size": "Integrated into city", "student_count": 45000, "international_pct": 0.25,
        "cost_of_living_usd_monthly": 900,
    },

    # ── Australia (3) ─────────────────────────────────────────────────────────

    {
        "name": "University of Melbourne",
        "country": "Australia", "city": "Melbourne, VIC",
        "qs_rank": 33, "the_rank": 34,
        "tuition_usd": 38000, "tuition_local": "A$55,000", "tuition_currency": "AUD",
        "programs": ["Medicine", "Law", "Engineering", "Business", "Science",
                     "Education", "Arts", "Architecture", "Dentistry",
                     "Music", "Social Work"],
        "ielts_min": 6.5, "toefl_min": 79, "gpa_min": 3.4,
        "application_deadline": "October 31 (Semester 1); April 30 (Semester 2)",
        "website": "https://www.unimelb.edu.au",
        "accepts_gre": False, "work_experience_required": False,
        "acceptance_rate": 0.70,
        "description": "Australia's highest-ranked university — Melbourne Model offers broad undergraduate degrees.",
        "scholarship_info": "Melbourne Research Scholarships (full tuition + A$28k/yr); Graduate Access Melbourne.",
        "campus_size": "777 acres", "student_count": 65000, "international_pct": 0.44,
        "cost_of_living_usd_monthly": 1600,
    },
    {
        "name": "Australian National University (ANU)",
        "country": "Australia", "city": "Canberra, ACT",
        "qs_rank": 30, "the_rank": 62,
        "tuition_usd": 36000, "tuition_local": "A$52,000", "tuition_currency": "AUD",
        "programs": ["Political Science", "International Relations", "Law",
                     "Physics", "Computer Science", "Economics", "Biology",
                     "Engineering", "Environmental Science", "Archaeology"],
        "ielts_min": 6.5, "toefl_min": 80, "gpa_min": 3.3,
        "application_deadline": "October 31",
        "website": "https://www.anu.edu.au",
        "accepts_gre": False, "work_experience_required": False,
        "acceptance_rate": 0.35,
        "description": "Australia's national university — world-class research in policy, sciences, and humanities.",
        "scholarship_info": "ANU Chancellor's International Scholarship (25% tuition fee offset).",
        "campus_size": "358 acres", "student_count": 25000, "international_pct": 0.37,
        "cost_of_living_usd_monthly": 1300,
    },
    {
        "name": "University of Sydney",
        "country": "Australia", "city": "Sydney, NSW",
        "qs_rank": 41, "the_rank": 61,
        "tuition_usd": 37000, "tuition_local": "A$53,500", "tuition_currency": "AUD",
        "programs": ["Law", "Medicine", "Business (USYD)", "Architecture",
                     "Engineering", "Arts", "Computer Science",
                     "Health Sciences", "Education", "Economics"],
        "ielts_min": 6.5, "toefl_min": 85, "gpa_min": 3.4,
        "application_deadline": "October 31 (Semester 1)",
        "website": "https://www.sydney.edu.au",
        "accepts_gre": False, "work_experience_required": False,
        "acceptance_rate": 0.30,
        "description": "Australia's first university — stunning sandstone campus in the heart of Sydney.",
        "scholarship_info": "Sydney Scholars Awards; International Research Stipend (A$28,092/yr for PhDs).",
        "campus_size": "72 acres (main)", "student_count": 73000, "international_pct": 0.42,
        "cost_of_living_usd_monthly": 1800,
    },
]

# ─── Seed runner ──────────────────────────────────────────────────────────────

async def seed(database_url: str, reset: bool = False) -> None:
    """Insert all universities, replacing any existing rows with the same names."""
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy import delete, text, select, func as sqlfunc

    engine_url = _to_asyncpg_url(database_url) if not _is_sqlite_url(database_url) else database_url
    engine = create_async_engine(engine_url, echo=False)

    async with engine.begin() as conn:
        from app.services.university_service import Base, UniversityORM
        # Create table if not exists
        await conn.run_sync(Base.metadata.create_all)

        if reset:
            if _is_sqlite_url(database_url):
                await conn.execute(text("DELETE FROM universities"))
                print("Cleared universities table.")
            else:
                await conn.run_sync(lambda c: c.execute(
                    text("TRUNCATE TABLE universities RESTART IDENTITY CASCADE")
                ))
                print("Truncated universities table.")

    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    inserted = skipped = 0
    async with Session() as session:
        for data in UNIVERSITIES:
            await session.execute(
                delete(UniversityORM).where(
                    sqlfunc.lower(UniversityORM.name) == data["name"].lower()
                )
            )

            uni = UniversityORM(
                id=str(uuid.uuid4()),
                **data,
            )
            session.add(uni)
            inserted += 1

        await session.commit()

    await engine.dispose()
    print(f"Seed complete — inserted: {inserted}, skipped: {skipped}")


if __name__ == "__main__":
    import sys
    parser = argparse.ArgumentParser(description="Seed universities table")
    parser.add_argument("--reset", action="store_true",
                        help="Truncate universities table before seeding")
    parser.add_argument(
        "--database-url",
        default="",
        help="PostgreSQL connection string to use instead of DATABASE_URL",
    )
    args = parser.parse_args()

    database_url = _resolve_database_url(args.database_url)

    asyncio.run(seed(database_url=database_url, reset=args.reset))
