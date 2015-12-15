var config = require('./config');
var fs = require('fs');
var s3 = require('s3');
var phantom = require('node-phantom-simple');
var async = require('async');
var request = require('request').defaults({ encoding: null });
var MongoClient = require('mongodb').MongoClient;

var dbURL = 'mongodb://localhost:27017/paperchase';

var s3Client = s3.createClient({
	s3Options: {
		accessKeyId: config.s3.key,
		secretAccessKey: config.s3.secret
	}
});

var journalNames = ["aging"];

var archivePageURLs = {
	aging: "http://www.impactaging.com/archive"
};

var journalScripts = {
	aging: {
		getVolumeURLsFromArchivePage: function() {
			return Array.prototype.slice.call(document.querySelectorAll("table.archive-table tbody tr td p a"))
										.map(function(o){return o.href;});
		},
		getPdfURLsFromVolumePage: function() {
			return Array.prototype.slice.call(document.querySelectorAll("a"))
										.filter(function(o){return o.innerText=="PDF" })
										.map(function(o){return o.href; });
		}
	}
};

function scrapePDFsForJournal(journalName, scrape_cb) {
	async.waterfall([
		function(wcb) {
			evaluateFunctionOnPage(archivePageURLs[journalName],
								   journalScripts[journalName].getVolumeURLsFromArchivePage,
								   wcb);
		},
		function(volumeURLs, wcb) {
			async.concatSeries(volumeURLs, function(volumeURL, concat_cb){
				evaluateFunctionOnPage(volumeURL,
									   journalScripts[journalName].getPdfURLsFromVolumePage,
									   concat_cb);
			}, wcb);
		},
		function(pdfURLs, wcb) {
			async.mapSeries(pdfURLs, function(pdfURL, map_cb){
				uploadFileToS3ViaUrl(pdfURL, function(s3_err, s3url){
					var pii = pdfURL.split("/").pop().split(".").shift();
					var end = {"ids": {"type": "pii", "id": pii}, "pdf_url": s3url};
					map_cb(null, end);
				});
			}, wcb);
		}
	], scrape_cb);
}

function getFileDataFromURL(imgURL, cb) {
	setTimeout(function() {
		request.get(imgURL, function (error, response, body) {
			if (!error && response.statusCode == 200) {
				cb(null, body);
			} else {
				cb(error, "");
			}
		});
	}, 2500);
}

function uploadFileToS3ViaUrl(fileURL, cb) {
	getFileDataFromURL(fileURL, function(err, fileData){
		if(err) { cb(err, null); }
		else {
			var tempdir = "./temp";
			if (!fs.existsSync(tempdir)){
				fs.mkdirSync(tempdir);
			}
			var fileFilename = Date.now()+"_"+fileURL.split("/").pop();
			var fileFilepath = tempdir + "/" + fileFilename;
			fs.writeFile(fileFilepath, fileData, function(err){
				if(err) {
					cb(err);
				} else {
					var uploader = s3Client.uploadFile({localFile: fileFilepath, s3Params: {Bucket: config.s3.bucket, Key: fileFilename}});
					uploader.on("error", function(err) {cb(err)});
					uploader.on("progress", function() {console.log(fileFilename+" progress:", uploader.progressTotal)});
					uploader.on("end", function() {
						var s3url = s3.getPublicUrlHttp(config.s3.bucket, fileFilename);
						cb(null, s3url);
						fs.unlink(fileFilepath);
					});
				}
			});
		}
	});
}

function evaluateFunctionOnPage(pageurl, pagefunc, cb) {
	phantom.create(function(create_err, ph){
		if(create_err) { cb(create_err); return; }
		return ph.createPage(function(createpage_err, page){
			if(createpage_err) { cb(createpage_err); return; }
			console.log("phantom: opening "+pageurl);
			setTimeout(function() {
				return page.open(pageurl, function(open_err, status){
					if(open_err) { cb(open_err); return; }
					return page.evaluate(pagefunc, function(ev_err, ev_res){
						ph.exit();
						cb(ev_err, ev_res);
					});
				});
			}, 2500);
		});
	});
}

MongoClient.connect(dbURL, function(db_err, db) {
	if(db_err) { console.error(db_err); return; }
	var currentJournalName = "aging";
	scrapePDFsForJournal("aging", function(err, scraped_pdfs) {
		var figureCollection = db.collection(currentJournalName+"_pdfs");
		async.each(scraped_pdfs, function(o, each_cb){
			figureCollection.update({ids: {"$in": [o.ids]}}, o, {upsert: true}, function(upsert_err, upsert_res){
				if(upsert_err) console.error(upsert_err);
				else console.log(upsert_res.result);
				each_cb();
			});
		}, function() {
			console.log("done scraping pdfs!");
			db.close();
		});
	});
});

