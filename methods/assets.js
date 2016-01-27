// For S3 assets
var config = require('../config');
var shared = require('../methods/shared');
var request = require('request').defaults({ encoding: null });
var fs = require('fs');
var s3 = require('s3');
var s3Client = s3.createClient({
	s3Options: {
		accessKeyId: config.s3.key,
		secretAccessKey: config.s3.secret
	}
});
var assets = {
	saveLocallyAndUploadFile: function(journal, fileName, fileData, bucketFolder, cb){
		console.log('..saveLocallyAndUploadFile: ' + fileName);
		assets.saveFileLocal(journal, fileName, fileData, bucketFolder, function(saveError,localPath){
			if(saveError){
				console.error('saveError');
				cb(saveError);
			}else if(localPath){
				assets.uploadFileToS3(journal, fileName, localPath, bucketFolder, function(uploadError,filePublicUrl){
					if(uploadError){
						console.error('uploadError');
						cb(uploadError);
					}else if(filePublicUrl){
						cb(null,filePublicUrl);
					}
				});
			}
		});
	},
	saveFileLocal: function(journal, fileName, fileData, bucketFolder, cb){
		console.log('..saveLocal: ' + fileName);
		var tempdir = './temp';
		var bucket = config.s3.bucket + journal;
		if (!fs.existsSync(tempdir)){
			fs.mkdirSync(tempdir);
		}
		var filePath = tempdir + '/' + fileName; // Temporary local path
		var fileEncoding = 'UTF-8';
		shared.getFileExtension(fileName, function(resExtension){
			// console.log('resExtension',resExtension);
			if(resExtension == 'pdf'){
				fileEncoding = 'binary';
				fileData = fileData.toString('base64');
			}

		});
		// console.log('fileEncoding',fileEncoding);
		fs.writeFile(filePath, fileData, fileEncoding, function(err){
			if(err) {
				console.error('writeFile');
				cb(err);
			} else {
				cb(null,filePath);
				// Upload XML to S3
			}
		});
	},
	uploadFileToS3: function(journal, fileName, localPath, bucketFolder, cb){
		console.log('..uploadFileToS3: ' + fileName);
		var bucket = config.s3.bucket + journal;
		var uploader = s3Client.uploadFile({
			localFile: localPath,
			s3Params: {
				Bucket: bucket,
				Key: bucketFolder + '/' + fileName
			}
		});
		uploader.on('error', function(err) {
			console.error('ERROR');
			console.error(err);
			cb(err)
		});
		uploader.on('progress', function() {
			// console.log('.....'+xml_filename+' progress:', uploader.progressTotal);
			console.log('..... '+fileName+' progress:', Math.round(uploader.progressAmount / uploader.progressTotal * 100) + '% done');
		});
		uploader.on('end', function() {
			var s3url = s3.getPublicUrlHttp(bucket, fileName);
			console.log('..... S3 : ' + s3url);
			cb(null, s3url);
			fs.unlink(localPath);
		});
	}
};

module.exports = assets;