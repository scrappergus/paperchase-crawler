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
		getArticleURLsFromVolumePage: function() {
			return Array.prototype.slice.call(document.querySelectorAll("a"))
										.filter(function(o){return o.innerText=="Full text" })
										.map(function(o){return o.href; });
		},
		getFigureDataFromArticle: function() {
			var figures = Array.prototype.slice.call(document.querySelectorAll("div.figure"));
			var processedFigures = [];
			figures.forEach(function(figure){
				var figureID = (figure.id || null);
				var imgURLs = Array.prototype.slice.call(figure.querySelectorAll("img")).map(function(o){ return o.src; });
				var figureCopyEl = figure.querySelector("p");
				var figureText = "";
				var figureTitle = "";
				if(figureCopyEl != null) {
				    var figureTitleEl = figureCopyEl.querySelector("b");
				    figureTitle = figureTitleEl ? figureTitleEl.innerText : "";
				    if(figureID == null) {
				        var titlePieces = figureTitle.split(" ").slice(0,2);
				        if(titlePieces.length >= 2) figureID = titlePieces[0]+titlePieces[1];
				        else figureID = "";
				    }
				    figureCopyEl.removeChild(figureTitleEl);
				    figureText = figureCopyEl.innerText;
				}

				processedFigures.push({
					figureID: figureID,
					figureTitle: figureTitle,
					figureText: figureText,
					imgURLs: imgURLs
				});
			});
			return {figures: processedFigures};
		}
	}
};

function scrapeFiguresForJournal(journalName, scrape_cb) {
	async.waterfall([
		function(wcb) {
			evaluateFunctionOnPage(archivePageURLs[journalName],
								   journalScripts[journalName].getVolumeURLsFromArchivePage,
								   wcb);
		},
		function(volumeURLs, wcb) {
			async.concatSeries(volumeURLs, function(volumeURL, concat_cb){
				evaluateFunctionOnPage(volumeURL,
									   journalScripts[journalName].getArticleURLsFromVolumePage,
									   concat_cb);
			}, wcb);
		},
		function(articleURLs, wcb) {
			async.mapSeries(articleURLs, function(articleURL, map_cb){
				grabFiguresFromPage(articleURL, journalName, map_cb);
			}, wcb);
		},
		function(figureList, wcb) {
			async.mapSeries(figureList, function(figureData, map_cb){
				async.mapSeries(figureData.figures, function(figure, data_map_cb){
					if(figure == void(0)) { data_map_cb(null, figure); return; }
					async.mapSeries(figure.imgURLs, uploadImageToS3ViaUrl, function(fig_map_err, uploadedImgURLs){
						if(fig_map_err) { map_cb(fig_map_err); return; }
						figure.imgURLs = uploadedImgURLs;
						data_map_cb(null, figure);
					});
				}, function(data_map_err, transformedFigures){
					if(data_map_err) { map_cb(data_map_err); return; }
					figureData.figures = transformedFigures;
					map_cb(null, figureData);
				});
			}, wcb);
		}
	], scrape_cb);
}

function getImageDataFromURL(imgURL, cb) {
	request.get(imgURL, function (error, response, body) {
		if (!error && response.statusCode == 200) {
			cb(null, body);
		} else {
			cb(error, "");
		}
	});
}

function uploadImageToS3ViaUrl(imgURL, cb) {
	setTimeout(function(){
		getImageDataFromURL(imgURL, function(err, imgData){
			if(err) { cb(err, null); }
			else {
				var tempdir = "./temp";
				if (!fs.existsSync(tempdir)){
					fs.mkdirSync(tempdir);
				}
				var imgFilename = Date.now()+"_"+imgURL.split("/").pop();
				var imgFilepath = tempdir + "/" + imgFilename;
				fs.writeFile(imgFilepath, imgData, function(err){
					if(err) {
						cb(err);
					} else {
						var uploader = s3Client.uploadFile({localFile: imgFilepath, s3Params: {Bucket: config.s3.bucket, Key: imgFilename}});
						uploader.on("error", function(err) {cb(err)});
						uploader.on("progress", function() {console.log(imgFilename+" progress:", uploader.progressTotal)});
						uploader.on("end", function() {
							var s3url = s3.getPublicUrlHttp(config.s3.bucket, imgFilename);
							cb(null, s3url);
							fs.unlink(imgFilepath);
						});
					}
				});
			}
		});
	},3000);
}

function evaluateFunctionOnPage(pageurl, pagefunc, cb) {
	setTimeout(function(){
		phantom.create(function(create_err, ph){
			if(create_err) { cb(create_err); return; }
			return ph.createPage(function(createpage_err, page){
				if(createpage_err) { cb(createpage_err); return; }
				console.log("phantom: opening "+pageurl);
				return page.open(pageurl, function(open_err, status){
					if(open_err) { cb(open_err); return; }
					return page.evaluate(pagefunc, function(ev_err, ev_res){
						ph.exit();
						cb(ev_err, ev_res);
					});
				});
			});
		});
	}, 3000);
}

function grabFiguresFromPage(pageURL, journalName, cb) {
	evaluateFunctionOnPage(pageURL, journalScripts.aging.getFigureDataFromArticle, function(err, result) {
		if(err) { cb(err); return; }
		var pii = pageURL.split("/").pop().split(".").shift();
		if(result == null) result = {figures:[]};
		result.ids = [{
			type: "pii",
			id: pii
		}];
		cb(null, result);
	});
}

MongoClient.connect(dbURL, function(db_err, db) {
	if(db_err) { console.error(db_err); return; }
	var currentJournalName = "aging";
	scrapeFiguresForJournal("aging", function(err, scraped_figures) {
		var figureCollection = db.collection(currentJournalName+"_figures");
		async.each(scraped_figures, function(o, each_cb){
			figureCollection.update({ids: {"$in": o.ids}}, o, {upsert: true}, function(upsert_err, upsert_res){
				if(upsert_err) console.error(upsert_err);
				else console.log(upsert_res.result);
				each_cb();
			});
		}, function() {
			console.log("done scraping figures!");
			db.close();
		});
	});
});