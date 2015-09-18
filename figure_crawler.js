var fs = require('fs');
var phantom = require('node-phantom-simple');
var async = require('async');
var request = require('request').defaults({ encoding: null });
var MongoClient = require('mongodb').MongoClient;

var dbURL = 'mongodb://localhost:27018/paperchase';

function base64ImageFromURL(imgURL, cb) {
	request.get(imgURL, function (error, response, body) {
		if (!error && response.statusCode == 200) {
			var b64 = "data:image/png;base64," + new Buffer(body).toString('base64');
			cb(null, b64);
		} else {
			cb(error, "");
		}
	});
}

function grabFiguresFromPage(pageURL, endCB) {
	phantom.create(function(err, ph){
		return ph.createPage(function(err, page){
			console.log("grabbing figure data for an article (opening article page)...");
			return page.open(pageURL, function(err, status){
				console.log("(article page opened, now evaluating ...)");
				return page.evaluate(function() {
					var figures = Array.prototype.slice.call(document.querySelectorAll("div.figure"));
					var processedFigures = [];
					figures.forEach(function(figure){
						var figureID = (figure.id || "");
						var imgURLs = Array.prototype.slice.call(figure.querySelectorAll("img")).map(function(o){ return o.src; });
						var figureText = (function() {
							var ft = figure.querySelector("p");
							if(ft != null) {
								return ft.innerText;
							} else {
								return "";
							}
						})();
						processedFigures.push({
							figureID: figureID,
							figureText: figureText,
							imgURLs: imgURLs
						});
					});
					return {figures: processedFigures};
				}, function(err, result) {
					console.log("done grabbing figures for this article.");
					ph.exit();
					result.pii = pageURL.split("/").pop().split(".").shift();
					endCB(result);
				});
			});
		});
	});
}

function saveFigureJSONAsFile(data, cb) {
	var filename = data.pii+".json";
	async.map(data.figures, function(figure, callback){
		async.map(figure.imgURLs, base64ImageFromURL, function(err, res){
			figure.imgURLs = res;
			callback(null, figure);
		});
	}, function(err, res){
		data.figures = res;
		var dataStringToSave = JSON.stringify(data);
		fs.writeFile("./figuredata/"+filename, dataStringToSave, function(err){
			if(err) {
				console.log(err);
			} else {
				console.log(filename+" saved!");
			}
			cb();
		});
	});
}

function processAndStoreFigures(links) {
	if (!fs.existsSync("./figuredata")){
	    fs.mkdirSync("./figuredata");
	}
	async.eachSeries(links, function(link, callback) {
		grabFiguresFromPage(link, function(data){
			saveFigureJSONAsFile(data, function(){
				callback();
			});
		});
	});
}

function startFromVolumePage(vpURL) {
	phantom.create(function(err, ph){
		return ph.createPage(function(err, page){
			console.log("opening base page...");
			return page.open(vpURL, function(err, status){
				console.log("base page opened. evaluating page...");
				return page.evaluate(function() {
					var articleLinks = Array.prototype.slice.call(document.querySelectorAll("a.file"))
									   .filter(function(o){ return (o.innerText == "HTML"); })
									   .map(function(o){ return (o.href || ""); });
					return articleLinks;
				}, function(err, result){
					console.log("links to articles grabbed. processing article links into figures...");
					ph.exit();
					processAndStoreFigures(result);
				});
			});
		});
	});
}

MongoClient.connect(dbURL, function(err, db) {
	if(!err) {
		console.log("Connected correctly to DB");
		var articles = db.collection("articles");
		articles.find({"volume": 7, "ids.type": "pii"}).toArray(function(err, docs) {
			if(!err) {
				async.map(docs, function(articledata, cb){
					var pii = "";
					articledata.ids.forEach(function(id){ if(id.type == "pii") pii = id.id; });
					var builtURL = "http://www.impactaging.com/papers/v"+articledata.volume+"/n"+articledata.issue+"/full/"+pii+".html";
					cb(null, builtURL);
				}, function(err, res){
					if(!err) {
						processAndStoreFigures(res);
					} else {
						console.error(err);
						db.close();
					}
				});
			} else {
				console.error(err);
				db.close();
			}
		});
	} else {
		console.log("Connection to DB failed");
		db.close();
	}
});
