var async = require('async'),
	config = require('./config'),
	cp = require('child_process'),
	express = require('express'),
	request = require('request');

var app = express();
app.listen(config.port);

// Array of response objects
var listeners = [];

app.get('/', function(req, resp) {
	resp.set({
		'Access-Control-Allow-Origin': '*',
		"content-type": 'audio/mpeg',
		'Expires': 'Thu, 01 Jan 1970 00:00:00 GMT',
		'Cache-Control': 'no-cache, no-store'
	});
	listeners.push(resp);
	// Remove listener on client disconnect
	req.on('close', function() {
		var index = listeners.indexOf(resp);
		if (index > -1)
			listeners.splice(index, 1);
	});
});

// Get binary paths
var bins = {};
function which(name, cb) {
	cp.exec('which ' + name, function(err, stdout) {
		if (err)
			cb(err);
		bins[name] = stdout.trim();
		cb(null);
	});
}

// Loop stream that plays, when the source channel is down
function fallback() {
	var ffmpeg = cp.spawn(bins.ffmpeg, [
		'-re', '-i', './fallback.mp3',
		'-c:a', 'copy',
		'-f', 'mp3',
		'-'
	]);
	ffmpeg.stdout.on('data', function(data) {
		// Don't play fallback, when source is up
		if (livestreamer.up)
			return;
		listeners.forEach(function(resp) {
			resp.write(data);
		});
	});
	// Restart the loop stream
	ffmpeg.stdout.once('close', function() {
		fallback();
	});
}

function checkSource() {
	request.get({
			url: `https://api.ustream.tv/channels/${config.channel}.json`,
			json: true
		}, function(err, resp, json) {
			if (err) {
				console.error(err);
				again(false);
			}
			if (resp.statusCode != 200 || !json || !json.channel)
				return again(false);
			again(json.channel.status === 'live', json.channel.url);
		}
	);
};

function again(status, name) {
	if (!livestreamer.ls && status) {
		console.log(`Channel ${name} live. Starting pipeline.`);
		livestreamer.start(name);
	}
	else if (livestreamer.ls && !status) {
		console.log(`Channel ${name} offline. Killing pipeline.`);
		livestreamer.kill();
	}
	setTimeout(checkSource, 10000);
}

var Livestreamer = function() {
	this.up = false;
};

Livestreamer.prototype.start = function(name) {
	this.ls = cp.spawn(bins.livestreamer, [
		'www.ustream.tv/' + name, 'best',
		'-O'
	]);
	this.ffmpeg = cp.spawn(bins.ffmpeg, [
		'-re', '-i', '-',
		'-vn', '-c:a', 'libmp3lame',
		'-q:a', config.quality,
		'-f', 'mp3',
		'-'
	]);
	this.ls.stdout.pipe(this.ffmpeg.stdin);
	var self = this;
	// Only consider the stream up after the first pipe buffer
	this.ffmpeg.stdout.once('data', function() {
		console.log('Disabling fallback');
		self.up = true;
	})
	this.ffmpeg.stdout.on('data', function(data) {
		listeners.forEach(function(resp) {
			resp.write(data);
		});
	});
	this.ffmpeg.stdout.once('close', function() {
		self.kill();
	});
};

Livestreamer.prototype.kill = function() {
	this.up = false;
	if (!this.ls || !this.ffmpeg)
		return;
	this.ls.kill();
	this.ffmpeg.kill();
	this.ls = null;
	this.ffmpeg = null;
};

livestreamer = new Livestreamer();

// Start the server
async.parallel([
		which.bind(null, 'ffmpeg'),
		which.bind(null, 'livestreamer')
	], function(err) {
		if (err)
			throw err;
		fallback();
		checkSource();
		console.log('Server started on port ' + config.port);
	}
);