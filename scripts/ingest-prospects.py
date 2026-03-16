#!/usr/bin/env python3
"""
Ingest Late Round Prospect Guide PDF data into the database.
Usage: python3 scripts/ingest-prospects.py <pdf_path> <draft_year>
Example: python3 scripts/ingest-prospects.py ~/Documents/LRProspectGuide.pdf 2026
"""

import sys
import re
import os
from pypdf import PdfReader
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import execute_values

load_dotenv('.env.local')

CATEGORIES = ['LEGENDARY PERFORMER', 'ELITE PRODUCER', 'WEEKLY STARTER', 'FLEX PLAY', 'BENCHWARMER', 'WAIVER WIRE ADD', 'DART THROW']

def normalize_name(name):
    return name.lower().strip().replace("'", "").replace("\u2019", "").replace(".", "").replace("-", " ")

def extract_rookie_profile(text, position):
    """Extract data from a rookie profile page (has Name • POS Score header)."""
    match = re.search(r'([A-Za-z\'\u2019\-\.\s]+)\s*\u2022\s*(WR|RB|TE)\s+([\d\.]+)', text)
    if not match:
        return None

    data = {
        'full_name': match.group(1).strip(),
        'position': position or match.group(2),
        'zap_score': float(match.group(3)),
        'is_year_2': False,
    }

    hw = re.search(r"Height:\s*([\d'\"]+)\s*Weight:\s*(\d+)", text)
    if hw:
        data['height'] = hw.group(1)
        data['weight'] = int(hw.group(2))

    comps = re.search(r'Statistical Comps?:\s*([^\n]+)', text)
    if comps:
        data['statistical_comparables'] = comps.group(1).strip()

    # College + category on same line (e.g., "ARIZONA STATE LEGENDARY PERFORMER")
    for cat in CATEGORIES:
        cat_match = re.search(r'\n([A-Z\s&\'\(\)\-]+)\s+' + re.escape(cat), text)
        if cat_match:
            data['college'] = cat_match.group(1).strip()
            data['zap_category'] = cat
            break

    # Draft capital delta
    if 'Low Risk' in text:
        data['draft_capital_delta'] = 'Low Risk'
    elif 'High Risk' in text:
        data['draft_capital_delta'] = 'High Risk'
    elif 'Neutral' in text:
        data['draft_capital_delta'] = 'Neutral'

    breakout = re.search(r'Breakout Score[:\s]+([\d\.]+)', text)
    if breakout:
        data['breakout_score'] = float(breakout.group(1))

    # Analysis text (everything after the header block)
    zap_idx = text.find('ZAP Score')
    if zap_idx != -1:
        data['analysis_text'] = text[zap_idx + len('ZAP Score'):].strip()[:2000]

    return data

def parse_year2_toc(text, position):
    """Parse a Year 2 TOC page to get name->page mappings and categories."""
    entries = []
    current_cat = None
    for line in text.split('\n'):
        for cat in CATEGORIES:
            if cat.lower() in line.lower().replace('\n', ''):
                current_cat = cat
        # Match "Name .......page" or "Name...page"
        m = re.match(r'([A-Za-z\'\u2019\-\.\s]+?)\.{2,}\s*(\d+)', line)
        if m:
            entries.append({
                'name': m.group(1).strip(),
                'page': int(m.group(2)),
                'position': position,
                'category': current_cat,
            })
    return entries

def extract_year2_profile(text, name, position, category):
    """Extract data from a Year 2 profile page (two scores at top, no header line)."""
    lines = text.strip().split('\n')
    # First two lines should be the Year 2 score and ZAP score (or vice versa)
    scores = []
    for line in lines[:3]:
        try:
            scores.append(float(line.strip()))
        except ValueError:
            pass

    if len(scores) < 2:
        return None

    data = {
        'full_name': name,
        'position': position,
        'zap_score': scores[0],  # First score is Year 2 score (we'll use as ZAP for now)
        'zap_category': category,
        'is_year_2': True,
        'analysis_text': '\n'.join(lines[2:])[:2000].strip(),
    }
    return data

def parse_pdf(pdf_path, draft_year):
    reader = PdfReader(pdf_path)
    prospects = []
    print(f"Parsing PDF with {len(reader.pages)} pages...")

    # Pass 1: Scan all pages for rookie profiles (Name • POS Score format)
    print("\nExtracting rookie profiles...")
    for i in range(len(reader.pages)):
        text = reader.pages[i].extract_text() or ''
        match = re.search(r'([A-Za-z\'\u2019\-\.\s]+)\s*\u2022\s*(WR|RB|TE)\s+([\d\.]+)', text)
        if match:
            data = extract_rookie_profile(text, match.group(2))
            if data:
                data['draft_year'] = draft_year
                prospects.append(data)
                print(f"  Page {i+1}: {data['full_name']} ({data['position']}, ZAP: {data['zap_score']})")

    # Pass 2: Find Year 2 TOC pages and extract Year 2 profiles
    print("\nExtracting Year 2 profiles...")
    year2_entries = []
    for i in range(len(reader.pages)):
        text = reader.pages[i].extract_text() or ''
        if 'Year 2 Wide Receiver' in text and '...' in text:
            year2_entries.extend(parse_year2_toc(text, 'WR'))
        elif 'Year 2 Running Back' in text and '...' in text:
            year2_entries.extend(parse_year2_toc(text, 'RB'))
        elif 'Year 2 Tight End' in text and '...' in text:
            year2_entries.extend(parse_year2_toc(text, 'TE'))

    for entry in year2_entries:
        page_idx = entry['page'] - 1
        if page_idx < 0 or page_idx >= len(reader.pages):
            continue
        text = reader.pages[page_idx].extract_text() or ''
        # Skip if this page was already captured as a rookie profile
        if re.search(r'\u2022\s*(WR|RB|TE)\s+[\d\.]+', text):
            continue
        data = extract_year2_profile(text, entry['name'], entry['position'], entry['category'])
        if data:
            data['draft_year'] = draft_year - 1  # Drafted previous year
            prospects.append(data)
            print(f"  Page {entry['page']}: {data['full_name']} (Y2 {data['position']}, Score: {data['zap_score']})")

    print(f"\nTotal prospects extracted: {len(prospects)}")
    return prospects

def insert_prospects(prospects):
    db_url = os.getenv('DATABASE_URL')
    if not db_url:
        raise ValueError("DATABASE_URL not found in environment")

    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    print("\nInserting prospects into database...")

    values = []
    for p in prospects:
        values.append((
            p.get('full_name'),
            p.get('position'),
            p.get('college'),
            p.get('draft_year'),
            p.get('zap_score'),
            p.get('zap_category'),
            p.get('breakout_score'),
            p.get('draft_capital_delta'),
            p.get('height'),
            p.get('weight'),
            p.get('statistical_comparables'),
            p.get('analysis_text'),
            p.get('is_year_2', False),
        ))

    try:
        cur.execute("""
            ALTER TABLE prospect_data
            ADD CONSTRAINT unique_prospect_year
            UNIQUE (full_name, draft_year)
        """)
        conn.commit()
        print("Added unique constraint")
    except psycopg2.errors.DuplicateTable:
        conn.rollback()
        print("Unique constraint already exists")

    insert_query = """
        INSERT INTO prospect_data (
            full_name, position, college, draft_year, zap_score, zap_category,
            breakout_score, draft_capital_delta, height, weight,
            statistical_comparables, analysis_text, is_year_2
        ) VALUES %s
        ON CONFLICT (full_name, draft_year) DO UPDATE SET
            position = EXCLUDED.position,
            college = EXCLUDED.college,
            zap_score = EXCLUDED.zap_score,
            zap_category = EXCLUDED.zap_category,
            breakout_score = EXCLUDED.breakout_score,
            draft_capital_delta = EXCLUDED.draft_capital_delta,
            height = EXCLUDED.height,
            weight = EXCLUDED.weight,
            statistical_comparables = EXCLUDED.statistical_comparables,
            analysis_text = EXCLUDED.analysis_text,
            is_year_2 = EXCLUDED.is_year_2,
            updated_at = NOW()
    """

    execute_values(cur, insert_query, values)
    conn.commit()
    print(f"Successfully inserted/updated {len(prospects)} prospects")
    cur.close()
    conn.close()

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 scripts/ingest-prospects.py <pdf_path> <draft_year>")
        sys.exit(1)

    pdf_path = os.path.expanduser(sys.argv[1])
    draft_year = int(sys.argv[2])

    if not os.path.exists(pdf_path):
        print(f"Error: PDF file not found at {pdf_path}")
        sys.exit(1)

    print(f"Ingesting prospect data from: {pdf_path}")
    print(f"Draft year: {draft_year}\n")

    prospects = parse_pdf(pdf_path, draft_year)
    insert_prospects(prospects)

if __name__ == '__main__':
    main()
