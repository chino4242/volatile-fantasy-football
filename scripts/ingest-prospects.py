#!/usr/bin/env python3
"""
Ingest Late Round Prospect Guide PDF data into the database.
Usage: python3 scripts/ingest-prospects.py <pdf_path> <draft_year>
Example: python3 scripts/ingest-prospects.py ~/Documents/LRProspectGuide.pdf 2025
"""

import sys
import re
import os
from pypdf import PdfReader
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import execute_values

# Load environment variables
load_dotenv('.env.local')

def normalize_name(name):
    """Normalize player name for matching"""
    return name.lower().strip().replace("'", "").replace(".", "").replace("-", " ")

def extract_player_data(text, position, is_year_2=False):
    """Extract player data from a profile page"""
    lines = text.split('\n')
    
    # Find player name (usually first line in all caps)
    player_name = None
    zap_score = None
    
    for i, line in enumerate(lines):
        # Look for pattern like "LUTHER BURDEN • WR 96.3"
        match = re.match(r'^([A-Z\'\-\s]+)\s*•\s*(WR|RB|TE)\s+([\d\.]+)', line)
        if match:
            player_name = match.group(1).strip()
            zap_score = float(match.group(3))
            break
    
    if not player_name:
        return None
    
    # Extract other data
    data = {
        'full_name': player_name,
        'position': position,
        'zap_score': zap_score,
        'is_year_2': is_year_2,
    }
    
    # Extract height/weight (pattern: "Height: 6'0 Weight: 188")
    hw_match = re.search(r"Height:\s*([\d'\"]+)\s*Weight:\s*(\d+)", text)
    if hw_match:
        data['height'] = hw_match.group(1)
        data['weight'] = int(hw_match.group(2))
    
    # Extract college (pattern: "COLORADO ELITE PRODUCER")
    college_match = re.search(r'\n([A-Z\s]+)\s+(ELITE PRODUCER|WEEKLY STARTER|FLEX PLAY|WAIVER WIRE ADD|BENCHWARMER|DART THROW)', text)
    if college_match:
        data['college'] = college_match.group(1).strip()
        data['zap_category'] = college_match.group(2)
    
    # Extract draft capital delta
    if 'Low Risk' in text:
        data['draft_capital_delta'] = 'Low Risk'
    elif 'High Risk' in text:
        data['draft_capital_delta'] = 'High Risk'
    elif 'Neutral' in text:
        data['draft_capital_delta'] = 'Neutral'
    
    # Extract statistical comparables
    comp_match = re.search(r'Statistical Comps?:?\s*([^\n]+)', text)
    if comp_match:
        data['statistical_comparables'] = comp_match.group(1).strip()
    
    # Extract breakout score (mentioned in text)
    breakout_match = re.search(r'Breakout Score[:\s]+([\d\.]+)', text)
    if breakout_match:
        data['breakout_score'] = float(breakout_match.group(1))
    
    # Store full analysis text (first 2000 chars after header)
    # Find where the actual analysis starts (after the header info)
    analysis_start = text.find(player_name)
    if analysis_start != -1:
        analysis_text = text[analysis_start:analysis_start + 2000]
        data['analysis_text'] = analysis_text.strip()
    
    return data

def parse_pdf(pdf_path, draft_year):
    """Parse the prospect guide PDF and extract all player data"""
    reader = PdfReader(pdf_path)
    prospects = []
    
    print(f"Parsing PDF with {len(reader.pages)} pages...")
    
    # WR profiles: pages 32-80 (index 31-79)
    print("Extracting Wide Receivers...")
    for i in range(31, min(80, len(reader.pages))):
        text = reader.pages[i].extract_text()
        data = extract_player_data(text, 'WR', is_year_2=False)
        if data:
            data['draft_year'] = draft_year
            prospects.append(data)
            print(f"  Found: {data['full_name']} (ZAP: {data.get('zap_score', 'N/A')})")
    
    # RB profiles: pages 81-112 (index 80-111)
    print("Extracting Running Backs...")
    for i in range(80, min(112, len(reader.pages))):
        text = reader.pages[i].extract_text()
        data = extract_player_data(text, 'RB', is_year_2=False)
        if data:
            data['draft_year'] = draft_year
            prospects.append(data)
            print(f"  Found: {data['full_name']} (ZAP: {data.get('zap_score', 'N/A')})")
    
    # Year 2 WR: pages 120-143 (index 119-142)
    print("Extracting Year 2 Wide Receivers...")
    for i in range(119, min(143, len(reader.pages))):
        text = reader.pages[i].extract_text()
        data = extract_player_data(text, 'WR', is_year_2=True)
        if data:
            data['draft_year'] = draft_year - 1  # They were drafted last year
            prospects.append(data)
            print(f"  Found: {data['full_name']} (Y2, ZAP: {data.get('zap_score', 'N/A')})")
    
    # Year 2 RB: pages 144-158 (index 143-157)
    print("Extracting Year 2 Running Backs...")
    for i in range(143, min(158, len(reader.pages))):
        text = reader.pages[i].extract_text()
        data = extract_player_data(text, 'RB', is_year_2=True)
        if data:
            data['draft_year'] = draft_year - 1
            prospects.append(data)
            print(f"  Found: {data['full_name']} (Y2, ZAP: {data.get('zap_score', 'N/A')})")
    
    print(f"\nTotal prospects extracted: {len(prospects)}")
    return prospects

def insert_prospects(prospects):
    """Insert prospect data into the database"""
    db_url = os.getenv('DATABASE_URL')
    if not db_url:
        raise ValueError("DATABASE_URL not found in environment")
    
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    
    print("\nInserting prospects into database...")
    
    # Prepare data for bulk insert
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
    
    # Insert with ON CONFLICT to update existing records
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
    
    # Need to add unique constraint first
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
    
    execute_values(cur, insert_query, values)
    conn.commit()
    
    print(f"Successfully inserted/updated {len(prospects)} prospects")
    
    cur.close()
    conn.close()

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 scripts/ingest-prospects.py <pdf_path> <draft_year>")
        print("Example: python3 scripts/ingest-prospects.py ~/Documents/LRProspectGuide.pdf 2025")
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
    
    print("\n✅ Prospect data ingestion complete!")

if __name__ == "__main__":
    main()
