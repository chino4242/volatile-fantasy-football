(function() {
  var data = [];
  var bodyText = document.body.innerText;
  var lines = bodyText.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
  var i = 0;
  while (i < lines.length) {
    var rankMatch = lines[i].match(/^(\d{1,3})$/);
    if (rankMatch) {
      var rank = parseInt(rankMatch[1]);
      var j = i + 1;
      while (j < lines.length && lines[j].match(/^[\u25B2\u25BC]\s*\d*$/)) j++;
      var playerName = lines[j] || '';
      j++;
      if (lines[j] === playerName) j++;
      var teamLine = lines[j] || '';
      var teamMatch = teamLine.match(/^([A-Z]{2,3})\s*\u00B7\s*([\d.]+)\s*yrs?\s*\u00B7\s*'(\d{2})\s*draft$/);
      j++;
      var call = '';
      if (j < lines.length && /^(Super Buy|Buy|Hold|Sell)$/.test(lines[j])) { call = lines[j]; j++; }
      var signal = '';
      if (j < lines.length && /^(Market Aligned|Market Discount|Market Premium|Strong RP Buy|Strong Sell Window)$/.test(lines[j])) { signal = lines[j]; j++; }
      var ecr = null;
      var mktAvg = null;
      var gap = null;
      for (var k = 0; k < 15 && j < lines.length; k++, j++) {
        var em = lines[j].match(/^#([\d.]+)\s*$/);
        if (em && ecr === null) { ecr = parseFloat(em[1]); continue; }
        if (em && ecr !== null && mktAvg === null) { mktAvg = parseFloat(em[1]); continue; }
        if (lines[j] === 'EVEN') { gap = 0; break; }
        var gm = lines[j].match(/^[\u25B2\u25BC]?\s*\+?([\-\d.]+)\s*$/);
        if (gm && ecr !== null) { gap = parseFloat(gm[1]); break; }
      }
      var note = '';
      for (var m = j; m < j + 10 && m < lines.length; m++) {
        if (lines[m].length > 25 && !lines[m].match(/^[#\u25B2\u25BC]/) && !/^(Super Buy|Buy|Hold|Sell)$/.test(lines[m]) && !/^(Market Aligned|Market Discount|Market Premium|Strong RP Buy|Strong Sell Window)$/.test(lines[m])) {
          note = lines[m]; break;
        }
      }
      if (playerName && rank <= 200 && playerName.length > 3) {
        data.push({ rank: rank, player: playerName, team: teamMatch ? teamMatch[1] : '', age: teamMatch ? parseFloat(teamMatch[2]) : null, draft_year: teamMatch ? 2000 + parseInt(teamMatch[3]) : null, call: call, signal: signal, ecr: ecr, market_avg: mktAvg, gap: gap, note: note });
      }
    }
    i++;
  }
  var seen = {};
  var unique = data.filter(function(d) { if (seen[d.rank]) return false; seen[d.rank] = true; return true; });
  console.log('Found ' + unique.length + ' players');
  console.log(JSON.stringify(unique, null, 2));
  copy(JSON.stringify(unique, null, 2));
  console.log('Copied to clipboard!');
})();
