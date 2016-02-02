// For S3 assets
var config = require('../config');
var shared = require('../methods/shared');
var request = require('request').defaults({ encoding: null });
var fs = require('fs');
// var s3 = require('s3');
var s3 = require('node-s3-client');
var s3Client = s3.createClient({
	s3Options: {
		accessKeyId: config.s3.key,
		secretAccessKey: config.s3.secret
	}
});
var assets = {
	saveLocallyAndUploadFile: function(journal, fileName, fileData, bucketFolder, cb){
		// console.log('..saveLocallyAndUploadFile: ' + fileName);
		assets.saveFileLocal(journal, fileName, fileData, bucketFolder, function(saveError,localPath){
			if(saveError){
				console.error('saveError');
				cb(saveError);
			}else if(localPath){
				if(bucketFolder == 'pdf'){
					shared.getFilesizeInBytes(localPath,function(fileSize){
						if(fileSize < 15300){
							console.log('   small: ' + fileName);
						}
					});
				}

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
		// console.log('..saveLocal: ' + fileName);
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
		// console.log('...uploadFileToS3: ' + fileName);
		var bucket = config.s3.bucket + journal;
		var uploader = s3Client.uploadFile({
			s3RetryCount: 10,
			localFile: localPath,
			s3RetryDelay: 5000,
			multipartUploadThreshold: 90971520,
			s3Params: {
				Bucket: bucket,
				Key: bucketFolder + '/' + fileName
			}
		});
		uploader.on('error', function(err) {
			console.error('S3 Upload ERROR',err);
			cb(err)
		});
		uploader.on('progress', function() {
			// console.log('..... '+fileName+' progress: ' + uploader.progressTotal + ' ' + uploader.progressAmount);
			// console.log('..... '+fileName+' progress:', Math.round(uploader.progressAmount / uploader.progressTotal * 100) + '% done');
		});
		uploader.on('end', function() {
			var s3url = s3.getPublicUrlHttp(bucket, fileName); // TODO: this does not include folder, so link fails.
			// console.log('..... S3 : ' + s3url);
			cb(null, fileName);
			fs.unlink(localPath);
		});
		uploader.on('error', function(err) {
			console.error('unable to upload:', err.stack);
		});
	}
};

module.exports = assets;