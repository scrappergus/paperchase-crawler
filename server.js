var fs = require('fs');
var request = require('request');
var express = require('express');
var MongoClient = require('mongodb').MongoClient;

var dbURL = 'mongodb://localhost:27017/paperchase';

var app = express();

app.use(express.static('public'));

var pubmedEsummaryURL = "http://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=";

function mongo_query(collection_name, query, cb) {
	MongoClient.connect(dbURL, function(db_err, db) {
		if(db_err) { cb(db_err); return; }
		var coll = db.collection(collection_name);
		coll.find(query, function(find_err, cursor){
			cursor.toArray(function (arr_err, arr){
				cb(arr_err, arr);
				db.close();
			});
		});
	});
}

function get_journal_xml_data(journal_name, cb) {
	var collection_name = journal_name+"_xml";
	mongo_query(collection_name, {}, cb);
}

function get_xml_data_by_pii(pii, journal_name, cb){
	var collection_name = journal_name+"_xml";
	var query = {"ids": {"$in": {"type": "pii", "id": pii}}};
	mongo_query(collection_name, query, cb);
}

app.get('/fetchxml/:journalname', function(req, res) {
	res.setHeader('Content-Type', 'application/json');
	var journal_name = req.params.journalname;
	get_journal_xml_data(journal_name, function(xml_err, xml_res) {
		if(xml_err) {
			res.status(500).send(JSON.stringify(xml_err));
		} else {
			res.send(JSON.stringify(xml_res));
		}
	});
});

app.get('/fetchxml/:journalname/pii/:pii', function(req, res) {
	res.setHeader('Content-Type', 'application/json');
	var journal_name = req.params.journalname;
	var pii = req.params.pii;
	get_xml_data_by_pii(journal_name, pii, function(xml_err, xml_res) {
		if(xml_err) {
			res.status(500).send(JSON.stringify(xml_err));
		} else {
			res.send(JSON.stringify(xml_res));
		}
	});
});

app.get('/pmid/:pmid', function (req, res) {
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

app.get('/pii/:pii', function(req, res) {
	var filename = "./figuredata/"+req.params.pii+".json";
	// really insecure
	if (fs.existsSync(filename)){
		var data = fs.readFileSync(filename, 'utf8');
		res.setHeader('Content-Type', 'application/json');
		res.send(data);
	} else {
		res.status(404).send("Figure data for PMID not found");
	}
});

app.listen(4932);
console.log("Server started");
