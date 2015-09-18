var fs = require('fs');
var request = require('request');
var express = require('express');

var app = express();


var pubmedEsummaryURL = "http://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=";

app.get('/:pmid', function (req, res) {
	var pmid = req.params.pmid;

	request.get(pubmedEsummaryURL+pmid, function (error, response, body) {
		var esummaryData = JSON.parse(body);
		if (!esummaryData["error"] && !error) {
			var filteredIDs = esummaryData["result"][""+pmid]["articleids"].filter(function(o){ return o["idtype"] == "pii" });
			if(filteredIDs.length > 0) {
				var pii = filteredIDs[0]["value"];
				var filename = "./figuredata/"+pii+".json";
				// really insecure
				if (fs.existsSync(filename)){
					var data = fs.readFileSync(filename, 'utf8');
					res.setHeader('Content-Type', 'application/json');
					res.send(data);
				} else {
					res.status(404).send("Figure data for PMID not found");
				}
			} else {
				res.status(404).send("No PII for this PMID");
			}
		} else {
			res.status(500).send("There was an error converting the PMID to a PII");
		}
	});
});

app.listen(4932);
console.log("Server started");
