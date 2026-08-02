#!/usr/bin/env python3
"""
Parse WR dynasty rankings text into JSON.
Usage: python3 scripts/parse-rp-rankings.py < rp-raw.txt
Or: python3 scripts/parse-rp-rankings.py rp-raw.txt
"""
import sys
import json
import re

def parse_rp_text(text):
    players = []
    
    # Pattern to match each player entry
    # Format: "01\nJa'Marr Chase\nJa'Marr Chase\nCIN · 26.4 yrs · '21 draft\nBuy Market Aligned  #1  — EVEN"
    # Or with movement: "06\n▲\n2\nMalik Nabers..."
    
    # Split into lines
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    
    i = 0
    while i < len(lines):
        # Look for rank pattern: "01" or "156" (1-3 digits, possibly with leading zero)
        rank_match = re.match(r'^(\d{1,3})$', lines[i])
        if rank_match:
            rank = int(rank_match.group(1))
            if rank < 1 or rank > 200:
                i += 1
                continue
            
            j = i + 1
            
            # Skip movement arrows (▲ or ▼ followed by a number)
            while j < len(lines) and (re.match(r'^[▲▼]$', lines[j]) or (j > i + 1 and re.match(r'^\d{1,2}$', lines[j]) and lines[j-1] in ['▲', '▼'])):
                j += 1
            
            # Player name
            if j >= len(lines):
                i += 1
                continue
            player_name = lines[j]
            j += 1
            
            # Skip duplicate name
            if j < len(lines) and lines[j] == player_name:
                j += 1
            
            # Team · age · draft year
            team = ''
            age = None
            draft_year = None
            if j < len(lines):
                team_match = re.match(r"^([A-Z]{2,3})\s*·\s*([\d.]+)\s*yrs?\s*·\s*'(\d{2})\s*draft$", lines[j])
                if team_match:
                    team = team_match.group(1)
                    age = float(team_match.group(2))
                    draft_year = 2000 + int(team_match.group(3))
                    j += 1
            
            # Call: Super Buy, Buy, Hold, Sell
            call = ''
            if j < len(lines) and lines[j] in ['Super Buy', 'Buy', 'Hold', 'Sell']:
                call = lines[j]
                j += 1
            
            # Signal: Market Aligned, Market Discount, Market Premium, Strong RP Buy, Strong Sell Window
            signal = ''
            signals = ['Market Aligned', 'Market Discount', 'Market Premium', 'Strong RP Buy', 'Strong Sell Window']
            if j < len(lines) and lines[j] in signals:
                signal = lines[j]
                j += 1
            
            # ECR, Market Avg, Gap — scan forward
            ecr = None
            mkt_avg = None
            gap = None
            scan_limit = min(j + 15, len(lines))
            while j < scan_limit:
                ecr_match = re.match(r'^#([\d.]+)\s*$', lines[j])
                if ecr_match:
                    if ecr is None:
                        ecr = float(ecr_match.group(1))
                    elif mkt_avg is None:
                        mkt_avg = float(ecr_match.group(1))
                    j += 1
                    continue
                
                if lines[j] == 'EVEN':
                    gap = 0
                    j += 1
                    break
                
                if lines[j] == '—' or lines[j] == '\u2014':
                    j += 1
                    continue
                
                gap_match = re.match(r'^[▲▼]?\s*\+?([-\d.]+)\s*$', lines[j])
                if gap_match and ecr is not None:
                    gap = float(gap_match.group(1))
                    j += 1
                    break
                
                j += 1
            
            # Note — next long text line
            note = ''
            scan_limit = min(j + 10, len(lines))
            while j < scan_limit:
                line = lines[j]
                if (len(line) > 20 and 
                    not line.startswith('#') and
                    not re.match(r'^[▲▼]', line) and
                    line not in ['Super Buy', 'Buy', 'Hold', 'Sell'] + signals and
                    not re.match(r'^\d{1,3}$', line)):
                    note = line
                    break
                j += 1
            
            if player_name and len(player_name) > 2 and not re.match(r'^\d+$', player_name):
                players.append({
                    'rank': rank,
                    'player': player_name,
                    'team': team,
                    'age': age,
                    'draft_year': draft_year,
                    'call': call,
                    'signal': signal,
                    'ecr': ecr,
                    'market_avg': mkt_avg,
                    'gap': gap,
                    'note': note
                })
        i += 1
    
    # Deduplicate by rank
    seen = set()
    unique = []
    for p in players:
        if p['rank'] not in seen:
            seen.add(p['rank'])
            unique.append(p)
    
    return unique

if __name__ == '__main__':
    if len(sys.argv) > 1:
        with open(sys.argv[1], 'r') as f:
            text = f.read()
    else:
        text = sys.stdin.read()
    
    players = parse_rp_text(text)
    print(f"Found {len(players)} players", file=sys.stderr)
    print(json.dumps(players, indent=2))
