var fs = require('fs');
var async = require('async');
var request = require('request');
var express = require('express');
var MongoClient = require('mongodb').MongoClient;

var dbURL = 'mongodb://localhost:27017/paperchase';

var app = express();

app.use(express.static('public'));

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

function set_article_figure(journal_name, pii, figureid, newimgurl, cb) {
	MongoClient.connect(dbURL, function(db_err, db) {
		if(db_err) { cb(db_err); return; }
		var coll = db.collection(journal_name + "_figures");
		coll.findOne({"ids": {"type": "pii", "id": pii}}, function(find_err, find_doc){
			var wasin = false;
			async.each(find_doc.figures, function(figure, find_cb){
				if(figure.figureID == figureid) {
					figure.imgURLs = [newimgurl];
					wasin = true;
				}
			}, function() {
				if(wasin == false) find_doc.figures.push({"figureID":figureid, "imgURLs":[newimgurl]});
				coll.update({"ids": {"type": "pii", "id": pii}}, find_doc, cb);
			});
		});
	});
}

function set_article_pdf(pii, pdfurl, cb) {
	MongoClient.connect(dbURL, function(db_err, db) {
		if(db_err) { cb(db_err); return; }
		var coll = db.collection(journal_name + "_pdfs");
		coll.findOne({"ids": {"type": "pii", "id": pii}}, function(find_err, find_doc){
			find_doc.pdf_url = pdfurl;
			delete find_doc._id;
			coll.update({"ids": {"type": "pii", "id": pii}}, find_doc, cb);
		});
	});
}

function get_journal_xml_data(journal_name, cb) {
	var collection_name = journal_name+"_xml";
	mongo_query(collection_name, {}, cb);
}

function get_xml_data_by_pii(journal_name, pii, cb) {
	var collection_name = journal_name+"_xml";
	var query = {"ids": {"type": "pii", "id": pii}};
	mongo_query(collection_name, query, cb);
}

function get_figures_by_pii(journal_name, pii, cb) {
	var collection_name = journal_name+"_figures";
	var query = {"ids": {"type": "pii", "id": pii}};
	mongo_query(collection_name, query, cb);
}

function get_pdf_by_pii(journal_name, pii, cb) {
	var collection_name = journal_name+"_pdfs";
	var query = {"ids": {"type": "pii", "id": pii}};
	mongo_query(collection_name, query, cb);
}

function get_xml_with_files_by_pii(journal_name, pii, cb) {
	async.waterfall([
		function(wcb) {
			get_xml_data_by_pii(journal_name, pii, wcb);
		},
		function(xml_data, wcb) {
			if(xml_data.length == 0) {wcb({"error": "No XML data found for this PII."}); return; };
			get_pdf_by_pii(journal_name, pii, function(err, pdf) {
				if(pdf.length != 0) xml_data[0].pdf_url = pdf[0].pdf_url;

				wcb(null, xml_data);
			});
		},
		function(xml_data, wcb) {
			get_figures_by_pii(journal_name, pii, function(err, figure_data) {
				if(err) { wcb(err); return; }
				if(figure_data.length < 1) { wcb(null, xml_data); return; }
				xml_data[0].figures = figure_data[0].figures;
				wcb(null, xml_data);
			});
		}
	], cb);
}

function s3_upload(filepath, filename, cb) {
	var uploader = s3Client.uploadFile({localFile: filepath, s3Params: {Bucket: config.s3.bucket, Key: filename}});
	uploader.on("error", function(err) {cb(err)});
	uploader.on("progress", function() {console.log(filename+" progress:", uploader.progressTotal)});
	uploader.on("end", function() {
		var s3url = s3.getPublicUrlHttp(config.s3.bucket, filename);
		cb(null, s3url);
	});
}

app.get('/fetchxml/:journalname', function(req, res) {
	res.setHeader('Content-Type', 'application/json');
	res.setHeader("Access-Control-Allow-Origin", "*");
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
	res.setHeader("Access-Control-Allow-Origin", "*");
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

app.get('/fetchfigures/:journalname/pii/:pii', function(req, res) {
	res.setHeader('Content-Type', 'application/json');
	res.setHeader("Access-Control-Allow-Origin", "*");
	var journal_name = req.params.journalname;
	var pii = req.params.pii;
	get_figures_by_pii(journal_name, pii, function(xml_err, xml_res) {
		if(xml_err) {
			res.status(500).send(JSON.stringify(xml_err));
		} else {
			res.send(JSON.stringify(xml_res));
		}
	});
});

app.get('/xmlfigures/:journalname/pii/:pii', function(req, res) {
	res.setHeader('Content-Type', 'application/json');
	res.setHeader("Access-Control-Allow-Origin", "*");
	var journal_name = req.params.journalname;
	var pii = req.params.pii;
	get_xml_with_files_by_pii(journal_name, pii, function(xml_err, xml_res) {
		if(xml_err) {
			res.status(500).send(JSON.stringify(xml_err));
		} else {
			res.send(JSON.stringify(xml_res));
		}
	});
});

app.post('/uploadfigure', function(req, res) {
	res.setHeader('Content-Type', 'application/json');
	res.setHeader("Access-Control-Allow-Origin", "*");
	var pii = req.params.pii;
	var journal_name = req.params.journalname;
	var figure_id = req.params.figureid || "";
	if(!pii) {
		res.status(403).send("Error: No PII specified in request.");
		return;
	}
	if(!journal_name) {
		res.status(403).send("Error: No journal name specified in request.");
		return;
	}
	if(req.files.length == 0) {
		res.status(403).send("Error: No file specified");
		return;
	}

	var the_file = req.files[0];

	var filepath = the_file.path;
	var filename = the_file.name;
	s3_upload(filepath, filename, function(s3_err, figure_url){
		if(s3_err) {
			cb(s3_err);
		} else {
			set_article_pdf(journal_name, pii, figure_id, figure_url, function(figure_set_err){
				if (figure_set_err) {
					res.status(403).send(figure_set_err);
				} else {
					res.status(200).send();
				}
			});
		}
	});
});

app.post('/uploadpdf', function(req, res) {
	res.setHeader('Content-Type', 'application/json');
	res.setHeader("Access-Control-Allow-Origin", "*");
	var pii = req.params.pii;
	var journal_name = req.params.journalname;
	var figure_id = req.params.figureid || "";
	if (!pii) {
		res.status(403).send("Error: No PII specified in request.");
		return;
	}
	if (!journal_name) {
		res.status(403).send("Error: No journal name specified in request.");
		return;
	}

	var the_file = req.files[0];

	var filepath = the_file.path;
	var filename = the_file.name;
	s3_upload(filepath, filename, function(err, url){
		if(err) {
			cb(err);
		} else {
			set_article_pdf(journal_name, pii, new_pdf, function(err){
				if (err) {
					res.status(403).send(err);
				} else {
					res.status(200).send();
				}
			});
		}
	});
});

app.listen(4932);
console.log("Server started");
